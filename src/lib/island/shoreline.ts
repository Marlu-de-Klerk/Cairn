// The beach outline of an island layout, for the surf that rolls in around it. Pure maths, no three.js.
import type { IslandLayout } from './types'
import { rayExit } from './query'
import { levelCore } from './trailPlan'
import { BEACH } from './shapes'

export interface ShorePoint {
  readonly x: number
  readonly z: number
  /** unit outward normal in the ground plane */
  readonly nx: number
  readonly nz: number
  /** arc length from the first point, in layout units */
  readonly s: number
}

/**
 * `segments` points around the beach's waterline (the edge of the beach level), counter-clockwise seen from above,
 * with outward normals and running arc length. Rays are cast from the beach's core, where the beach is star-shaped.
 */
export function shoreline(layout: Pick<IslandLayout, 'levelAt' | 'sdAt' | 'blobs'>, segments = 192): ShorePoint[] {
  const inside = (x: number, z: number) => layout.levelAt(x, z) >= BEACH
  const blob = layout.blobs[BEACH]
  const [cx, cz] = levelCore(layout, BEACH, [blob?.cx ?? 0, blob?.cz ?? 0])
  const pts = Array.from({ length: segments }, (_, i) => {
    const theta = (i / segments) * Math.PI * 2
    const r = rayExit(inside, cx, cz, theta, 6)
    return [cx + r * Math.cos(theta), cz + r * Math.sin(theta)] as const
  })
  let s = 0
  return pts.map(([x, z], i) => {
    const [ax, az] = pts[(i - 1 + segments) % segments]
    const [bx, bz] = pts[(i + 1) % segments]
    if (i > 0) s += Math.hypot(x - ax, z - az)
    // tangent (b - a) runs counter-clockwise in x-z; outward is its clockwise turn
    const tx = bx - ax
    const tz = bz - az
    const len = Math.hypot(tx, tz) || 1
    let nx = tz / len
    let nz = -tx / len
    if (nx * (x - cx) + nz * (z - cz) < 0) {
      nx = -nx
      nz = -nz
    }
    return { x, z, nx, nz, s }
  })
}
