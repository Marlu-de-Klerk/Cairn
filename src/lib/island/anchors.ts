import type { IslandLayout, Vec3 } from './types'
import { WATER_Y } from './types'
import { propRule } from './biomes'
import { localToWorld } from './orientation'

export interface IslandAnchors {
  readonly labelY: number
  readonly cardY: number
  readonly hoverLift: number
  readonly focusTargetY: number
}

export function islandAnchors(layout: IslandLayout): IslandAnchors {
  const top = layout.levels.length - 1
  let tallest = 0
  for (const p of layout.props) {
    if (layout.levelAt(p.x, p.z) !== top) continue
    const height = propRule(layout.biome, p.kind)?.height ?? 0
    tallest = Math.max(tallest, p.y + height * p.scale - layout.summitTopY)
  }
  const labelY = Math.min(layout.summitTopY + tallest + 0.25, layout.summitTopY + 1.0)
  return { labelY, cardY: labelY + 0.45, hoverLift: 0.15 * layout.summitTopY, focusTargetY: 0.4 * layout.summitTopY }
}

export interface FocusPoseOptions {
  readonly aspect: number
  readonly fovDeg: number
  readonly insetRightPx: number
  readonly viewportPx: { readonly width: number; readonly height: number }
  readonly orbit: number
}

export interface FocusPose {
  readonly position: Vec3
  readonly lookAt: Vec3
  readonly distance: number
  readonly elevation: number
  readonly azimuth: number
}

export const FOCUS_ELEVATION = (38 * Math.PI) / 180
const DISTANCE_MIN = 7
const DISTANCE_MAX = 17
const NDC_LIMIT = 0.88
const BOUND_RADIUS = 3.15

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Spec §5.6: true 38° elevation, arrival azimuth world +X+Z plus the viewer's orbit, distance fitted so the island's
 * bounding cylinder stays inside ±0.88 NDC of the area the RoadmapPanel leaves free, clamped to [7, 17].
 * Offsets are world-oriented, relative to the island's world centre.
 */
export function focusPose(layout: IslandLayout, options: FocusPoseOptions): FocusPose {
  const azimuth = Math.PI / 4 + options.orbit
  const elevation = FOCUS_ELEVATION
  const frontWorld = localToWorld([Math.cos(layout.front), 0, Math.sin(layout.front)])
  const baseLookAt: V = [-0.12 * layout.footprintRadius * frontWorld[0], 0.4 * layout.summitTopY, -0.12 * layout.footprintRadius * frontWorld[2]]
  const dir: V = [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)]
  const forward: V = [-dir[0], -dir[1], -dir[2]]
  const right = norm([-forward[2], 0, forward[0]])
  const up: V = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]]
  const tanHalf = Math.tan((options.fovDeg * Math.PI) / 360)
  const freeFraction = Math.max(0.2, 1 - options.insetRightPx / Math.max(1, options.viewportPx.width))
  const aspect = options.aspect * freeFraction

  const bounds: V[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    for (const y of [WATER_Y, layout.summitTopY + 0.8]) bounds.push([BOUND_RADIUS * Math.cos(a), y, BOUND_RADIUS * Math.sin(a)])
  }
  const fits = (distance: number) => {
    const eye: V = [baseLookAt[0] + dir[0] * distance, baseLookAt[1] + dir[1] * distance, baseLookAt[2] + dir[2] * distance]
    return bounds.every((p) => {
      const v = sub(p, eye)
      const depth = dot(v, forward)
      return depth > 0 && Math.abs(dot(v, right) / (depth * tanHalf * aspect)) <= NDC_LIMIT && Math.abs(dot(v, up) / (depth * tanHalf)) <= NDC_LIMIT
    })
  }
  let distance = DISTANCE_MAX
  if (fits(DISTANCE_MIN)) distance = DISTANCE_MIN
  else if (fits(DISTANCE_MAX)) {
    let lo = DISTANCE_MIN
    let hi = DISTANCE_MAX
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid
      else lo = mid
    }
    distance = hi
  }

  // Pan along the camera's own screen-right so the island centres in the area left of the panel, at any orbit angle.
  const worldPerPx = (2 * distance * tanHalf) / Math.max(1, options.viewportPx.height)
  const shift = (options.insetRightPx / 2) * worldPerPx
  const lookAt: Vec3 = [baseLookAt[0] + right[0] * shift, baseLookAt[1], baseLookAt[2] + right[2] * shift]
  const position: Vec3 = [lookAt[0] + dir[0] * distance, lookAt[1] + dir[1] * distance, lookAt[2] + dir[2] * distance]
  return { position, lookAt, distance, elevation, azimuth }
}
