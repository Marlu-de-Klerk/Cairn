import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Goal } from './api'

const ORBIT_RADIUS = 30
const ORBIT_ELEVATION = (35 * Math.PI) / 180 // spec §6.1: "looking down at maybe 35°"
const ORBIT_SPEED = 0.05 // radians/second while idle
const DRAG_SENSITIVITY = 0.005 // radians per pixel of horizontal drag
const ISLAND_APPROACH_DISTANCE = 8
const ISLAND_APPROACH_ELEVATION = (40 * Math.PI) / 180
const FLY_DURATION = 1.2 // seconds, spec §6.3
const DRAG_CLICK_THRESHOLD = 5 // px of travel past which a gesture is a drag, not a click

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function orbitPosition(azimuth: number): Vector3 {
  return new Vector3(
    ORBIT_RADIUS * Math.cos(ORBIT_ELEVATION) * Math.cos(azimuth),
    ORBIT_RADIUS * Math.sin(ORBIT_ELEVATION),
    ORBIT_RADIUS * Math.cos(ORBIT_ELEVATION) * Math.sin(azimuth),
  )
}

function islandApproachPosition(goal: { islandX: number; islandZ: number }): Vector3 {
  return new Vector3(
    goal.islandX + ISLAND_APPROACH_DISTANCE * Math.cos(ISLAND_APPROACH_ELEVATION),
    ISLAND_APPROACH_DISTANCE * Math.sin(ISLAND_APPROACH_ELEVATION),
    goal.islandZ + ISLAND_APPROACH_DISTANCE * Math.cos(ISLAND_APPROACH_ELEVATION),
  )
}

interface CameraRigProps {
  focusedGoal: Goal | null
}

export function CameraRig({ focusedGoal }: CameraRigProps) {
  const { camera, gl } = useThree()
  const azimuth = useRef(0)
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
    const handlePointerDown = (event: PointerEvent) => {
      hasInteracted.current = true
      isDragging.current = true
      lastPointerX.current = event.clientX
      pressOriginX.current = event.clientX
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging.current) return
      const deltaX = event.clientX - lastPointerX.current
      azimuth.current -= deltaX * DRAG_SENSITIVITY
      lastPointerX.current = event.clientX
      // Net displacement from the press origin, not accumulated per-move travel —
      // jitter that wobbles back and forth during a still tap must not sum past
      // the threshold and swallow a legitimate click.
      if (Math.abs(event.clientX - pressOriginX.current) > DRAG_CLICK_THRESHOLD) {
        suppressNextClick.current = true
      }
    }
    const handlePointerUp = () => {
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
    window.addEventListener('click', handleClickCapture, true)
    return () => {
      window.removeEventListener('pointerdown', handleAnyPointerDown, true)
      element.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('click', handleClickCapture, true)
    }
  }, [gl])

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
    }

    const isTransitioning = transitionStart.current !== null

    // Auto-rotate only ever runs before the first interaction, ever — once
    // `hasInteracted` flips true (on the very first pointerdown, at the same
    // moment `isDragging` starts) it never resumes, matching spec exactly.
    if (!isTransitioning && !focusedGoal && !hasInteracted.current) {
      azimuth.current += delta * ORBIT_SPEED
    }

    const desiredPosition = focusedGoal ? islandApproachPosition(focusedGoal) : orbitPosition(azimuth.current)
    const desiredLookAt = focusedGoal ? new Vector3(focusedGoal.islandX, 0, focusedGoal.islandZ) : new Vector3(0, 0, 0)

    if (isTransitioning) {
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
