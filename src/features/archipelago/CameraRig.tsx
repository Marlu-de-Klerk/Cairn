import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { Goal } from './api'
import { focusPose } from '../../lib/island/anchors'
import { hashGoalId } from '../../lib/theme'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'
import { getIslandLayout } from './terrain/islandCache'
import { OVERVIEW_ZOOM, clampZoom, easeZoom, stepFocusZoom, wheelFactor } from '../../lib/cameraZoom'
import { overviewFrame } from '../../lib/overviewFrame'
import { getSheetInset, subscribeSheetInset } from '../roadmap/sheetInset'

const ORBIT_SPEED = 0.05 // radians/second while idle
const DRAG_SENSITIVITY = 0.005 // radians per pixel of horizontal drag
const FLY_DURATION = 1.2 // seconds, spec §6.3
const DRAG_CLICK_THRESHOLD = 5 // px of travel past which a gesture is a drag, not a click
const PANEL_WIDTH_PX = 288 // RoadmapPanel's w-72
const PANEL_MIN_VIEWPORT_PX = 640
const FOCUS_INSET_TOP_PX = 72 // the header
const OVERVIEW_INSET_TOP_PX = 100 // the header, plus room for the labels above the farthest islands
const FRAME_EASE = 3 // per second: how fast the overview reframes when an island is added or the window resizes

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function orbitPosition(center: Vector3, azimuth: number, elevation: number, radius: number): Vector3 {
  return new Vector3(
    center.x + radius * Math.cos(elevation) * Math.cos(azimuth),
    radius * Math.sin(elevation),
    center.z + radius * Math.cos(elevation) * Math.sin(azimuth),
  )
}

interface CameraRigProps {
  focusedGoal: Goal | null
  /** Island centres (world x, z): the overview orbits their middle, pulled back until every one is on screen. */
  islands?: readonly (readonly [number, number])[]
  // The angle (radians, atan2(islandZ, islandX)) toward the user's own
  // archipelago, so the idle orbit starts facing their islands instead of a
  // fixed world-space 0 that has no relationship to where a golden-angle
  // spiral placed them — without this, ORBIT_SPEED's deliberately slow
  // "auto-rotating slowly" (spec §6.1) can leave a viewer staring at empty
  // water for 20+ seconds before anything rotates into frame.
  initialAzimuth?: number
  /** DEV harness only: the island seed, when it isn't derived from the goal id. */
  seedOverride?: number
  /** DEV harness only: a fixed focus orbit angle; disables drag-to-orbit. */
  devOrbit?: number
  /** Called when the viewer keeps zooming out past the focused island's limit: go back to the archipelago. */
  onExitFocus?: () => void
}

const NO_ISLANDS: readonly (readonly [number, number])[] = []

export function CameraRig({ focusedGoal, islands = NO_ISLANDS, initialAzimuth, seedOverride, devOrbit, onExitFocus }: CameraRigProps) {
  const { camera, gl, size, invalidate } = useThree()
  const fov = (camera as PerspectiveCamera).fov
  const frame = useMemo(
    () => overviewFrame(islands, { fovDeg: fov, viewportPx: { width: size.width, height: size.height }, insetTopPx: OVERVIEW_INSET_TOP_PX }),
    [islands, fov, size.width, size.height],
  )
  // The frame the overview is showing, easing toward `frame` so a new island or a resize reframes smoothly.
  const frameCenter = useRef<Vector3 | null>(null)
  const frameDistance = useRef(0)
  const frameElevation = useRef(0)
  // The phone roadmap sheet's height, eased so the island glides up when the sheet appears.
  const sheetInset = useRef(getSheetInset())
  useEffect(() => subscribeSheetInset(invalidate), [invalidate])
  const azimuth = useRef(0)
  // Spec §5.6.1: the focus orbit is separate from the overview azimuth, so orbiting an island never moves where the
  // overview returns to.
  const orbit = useRef(0)
  const orbitEnabled = useRef(false)
  const azimuthInitialized = useRef(false)
  const hasInteracted = useRef(false)
  const isDragging = useRef(false)
  const lastPointerX = useRef(0)
  const pressOriginX = useRef(0)
  const suppressNextClick = useRef(false)
  const lastFocusedGoalId = useRef<string | null>(null)
  const transitionStart = useRef<Vector3 | null>(null)
  const transitionStartLookAt = useRef<Vector3 | null>(null)
  const currentLookAt = useRef(new Vector3(0, 0, 0))
  const transitionElapsed = useRef(0)
  // Zoom: a multiplier on the overview orbit radius, and separately on the focus pose's camera offset. Wheel and
  // pinch move the targets; the current values ease toward them each frame.
  const overviewZoom = useRef(1)
  const overviewZoomTarget = useRef(1)
  const focusZoom = useRef(1)
  const focusZoomTarget = useRef(1)
  const focusOvershoot = useRef(0)
  const focusedRef = useRef(focusedGoal !== null)
  focusedRef.current = focusedGoal !== null
  const exitRef = useRef(onExitFocus)
  exitRef.current = onExitFocus
  const exiting = useRef(false)

  // Manual drag-to-orbit, plus the permanent auto-rotate stop (spec §6.1:
  // "stops rotating the moment I touch it and doesn't resume"). Attached to
  // `window` for move/up so a drag that leaves the canvas bounds mid-gesture
  // still tracks correctly.
  useEffect(() => {
    const element = gl.domElement

    // Every gesture, anywhere, starts un-suppressed — on `window` rather than the
    // canvas so a drag that released without producing a click (pointer left the
    // window, say) can't leave a stale flag that swallows an unrelated later click.
    const handleAnyPointerDown = () => {
      suppressNextClick.current = false
    }
    // Zoom by a multiplier (> 1 = out). While focused, a sustained zoom-out past the limit leaves the island.
    let lastZoomAt = 0
    const zoomBy = (factor: number) => {
      hasInteracted.current = true
      if (focusedRef.current) {
        if (exiting.current) return
        const now = performance.now()
        const next = stepFocusZoom({ zoom: focusZoomTarget.current, overshoot: focusOvershoot.current }, factor, now - lastZoomAt)
        lastZoomAt = now
        focusZoomTarget.current = next.zoom
        focusOvershoot.current = next.overshoot
        if (next.exit && exitRef.current) {
          exiting.current = true
          focusOvershoot.current = 0
          exitRef.current()
        }
      } else {
        overviewZoomTarget.current = clampZoom(overviewZoomTarget.current * factor, OVERVIEW_ZOOM)
      }
      invalidate()
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomBy(wheelFactor(event.deltaY, event.deltaMode))
    }

    // Two fingers pinch-zoom; one finger drags to orbit.
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0
    const spread = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const handlePointerDown = (event: PointerEvent) => {
      hasInteracted.current = true
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        isDragging.current = false
        pinchDistance = spread()
        suppressNextClick.current = true
        return
      }
      isDragging.current = true
      lastPointerX.current = event.clientX
      pressOriginX.current = event.clientX
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        const now = spread()
        if (pinchDistance > 0 && now > 0) zoomBy(pinchDistance / now)
        pinchDistance = now
        return
      }
      if (!isDragging.current) return
      const deltaX = event.clientX - lastPointerX.current
      if (orbitEnabled.current) {
        orbit.current -= deltaX * DRAG_SENSITIVITY
        invalidate()
      } else {
        azimuth.current -= deltaX * DRAG_SENSITIVITY
      }
      lastPointerX.current = event.clientX
      // Net displacement from the press origin, not accumulated per-move travel —
      // jitter that wobbles back and forth during a still tap must not sum past
      // the threshold and swallow a legitimate click.
      if (Math.abs(event.clientX - pressOriginX.current) > DRAG_CLICK_THRESHOLD) {
        suppressNextClick.current = true
      }
    }
    const handlePointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      pinchDistance = 0
      isDragging.current = false
    }

    // A gesture that actually orbited the camera must not also count as a click
    // on whichever island happened to be under the pointer at release. R3F v9
    // dispatches its raycasted onClick from a DOM click listener on the canvas's
    // parent element, so a capture-phase listener on `window` runs strictly
    // first and can stop the event before it ever descends that far.
    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick.current) return
      suppressNextClick.current = false
      event.stopPropagation()
    }

    window.addEventListener('pointerdown', handleAnyPointerDown, true)
    element.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('click', handleClickCapture, true)
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleWheel)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('pointerdown', handleAnyPointerDown, true)
      element.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('click', handleClickCapture, true)
    }
  }, [gl, invalidate])

  // `initialAzimuth` arrives once goals have loaded (it's undefined on the
  // very first render, before the archipelago query resolves) — apply it
  // exactly once, and never once the viewer has already started rotating
  // the camera themselves (that's their orbit position now, not a default
  // to override).
  useEffect(() => {
    if (initialAzimuth === undefined || azimuthInitialized.current || hasInteracted.current) return
    azimuth.current = initialAzimuth
    azimuthInitialized.current = true
  }, [initialAzimuth])

  useFrame((_, delta) => {
    const focusedGoalId = focusedGoal?.id ?? null

    // A transition begins the instant the focused goal's identity changes —
    // capture wherever the camera ACTUALLY is right now as the flight's
    // start point, whichever direction this transition runs.
    if (focusedGoalId !== lastFocusedGoalId.current) {
      lastFocusedGoalId.current = focusedGoalId
      transitionStart.current = camera.position.clone()
      transitionStartLookAt.current = currentLookAt.current.clone()
      transitionElapsed.current = 0
      orbit.current = 0
      // every island opens at its own framing; leaving one by zooming out doesn't carry that zoom back
      focusZoom.current = focusZoomTarget.current = 1
      focusOvershoot.current = 0
      exiting.current = false
    }

    // Ease the zoom toward where the wheel or pinch put it; under the demand frameloop, keep asking for frames
    // until it settles.
    overviewZoom.current = easeZoom(overviewZoom.current, overviewZoomTarget.current, delta)
    focusZoom.current = easeZoom(focusZoom.current, focusZoomTarget.current, delta)
    if (Math.abs(focusZoom.current - focusZoomTarget.current) > 1e-4 || Math.abs(overviewZoom.current - overviewZoomTarget.current) > 1e-4) invalidate()

    const target = new Vector3(frame.center[0], 0, frame.center[1])
    if (!frameCenter.current) {
      frameCenter.current = target
      frameDistance.current = frame.distance
      frameElevation.current = frame.elevation
    } else {
      const k = 1 - Math.exp(-delta * FRAME_EASE)
      frameCenter.current.lerp(target, k)
      frameDistance.current += (frame.distance - frameDistance.current) * k
      frameElevation.current += (frame.elevation - frameElevation.current) * k
      if (frameCenter.current.distanceTo(target) > 1e-3 || Math.abs(frame.distance - frameDistance.current) > 1e-3) invalidate()
    }

    const sheetTarget = getSheetInset()
    sheetInset.current += (sheetTarget - sheetInset.current) * (1 - Math.exp(-delta * 8))
    if (Math.abs(sheetTarget - sheetInset.current) > 0.5) invalidate()
    else sheetInset.current = sheetTarget

    const isTransitioning = transitionStart.current !== null
    orbitEnabled.current = focusedGoal !== null && !isTransitioning && devOrbit === undefined

    // Auto-rotate only ever runs before the first interaction, ever — once
    // `hasInteracted` flips true (on the very first pointerdown, at the same
    // moment `isDragging` starts) it never resumes, matching spec exactly.
    if (!isTransitioning && !focusedGoal && !hasInteracted.current) {
      azimuth.current += delta * ORBIT_SPEED
    }

    let desiredPosition: Vector3
    let desiredLookAt: Vector3
    if (focusedGoal) {
      const pose = focusPose(getIslandLayout(focusedGoal.biome, islandLayoutSeed(focusedGoal.biome, seedOverride ?? hashGoalId(focusedGoal.id))), {
        aspect: size.width / Math.max(1, size.height),
        fovDeg: (camera as PerspectiveCamera).fov,
        insetRightPx: size.width >= PANEL_MIN_VIEWPORT_PX ? PANEL_WIDTH_PX : 0,
        insetTopPx: FOCUS_INSET_TOP_PX,
        insetBottomPx: sheetInset.current,
        viewportPx: size,
        orbit: devOrbit ?? orbit.current,
      })
      const island = new Vector3(focusedGoal.islandX, 0, focusedGoal.islandZ)
      desiredLookAt = island.clone().add(new Vector3(...pose.lookAt))
      // zoom slides the camera along its line of sight to the island
      const offset = new Vector3(...pose.position).sub(new Vector3(...pose.lookAt)).multiplyScalar(focusZoom.current)
      desiredPosition = desiredLookAt.clone().add(offset)
    } else {
      desiredPosition = orbitPosition(frameCenter.current, azimuth.current, frameElevation.current, frameDistance.current * overviewZoom.current)
      desiredLookAt = frameCenter.current.clone()
    }

    if (isTransitioning) {
      // Under the focused view's demand frameloop, the flight has to request its own next frame.
      invalidate()
      transitionElapsed.current += delta
      const rawT = Math.min(1, transitionElapsed.current / FLY_DURATION)
      const t = easeOutCubic(rawT)
      camera.position.lerpVectors(transitionStart.current!, desiredPosition, t)
      // The view direction has to ease alongside the position, or the camera
      // snaps to face the destination on frame one and the flight reads as
      // "rotate, then dolly" rather than one continuous move.
      currentLookAt.current.lerpVectors(transitionStartLookAt.current!, desiredLookAt, t)
      camera.lookAt(currentLookAt.current)
      if (rawT >= 1) {
        transitionStart.current = null
        transitionStartLookAt.current = null
      }
      return
    }

    camera.position.copy(desiredPosition)
    currentLookAt.current.copy(desiredLookAt)
    camera.lookAt(currentLookAt.current)
  })

  return null
}
