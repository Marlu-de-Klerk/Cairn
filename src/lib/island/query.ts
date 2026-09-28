import type { HeightGrid, Vec3 } from './types'

const HASH_CELL = 0.25
const HASH_REACH = 3

export interface PathPoint {
  readonly x: number
  readonly z: number
  readonly y: number
  readonly s: number
}

export interface PathProjection {
  d: number
  y: number
  s: number
}

/** Uniform 0.25-cell grid of trail segments; answers nearest-segment queries within 0.75 in O(1). */
export class SegmentHash {
  private readonly cells = new Map<number, number[]>()

  constructor(private readonly points: readonly PathPoint[]) {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]
      const b = points[i + 1]
      const i0 = Math.floor(Math.min(a.x, b.x) / HASH_CELL)
      const i1 = Math.floor(Math.max(a.x, b.x) / HASH_CELL)
      const j0 = Math.floor(Math.min(a.z, b.z) / HASH_CELL)
      const j1 = Math.floor(Math.max(a.z, b.z) / HASH_CELL)
      for (let ci = i0; ci <= i1; ci++) {
        for (let cj = j0; cj <= j1; cj++) {
          const key = SegmentHash.key(ci, cj)
          const list = this.cells.get(key)
          if (list) list.push(i)
          else this.cells.set(key, [i])
        }
      }
    }
  }

  private static key(i: number, j: number): number {
    return (i + 512) * 1024 + (j + 512)
  }

  /** Nearest point on the polyline: distance, interpolated y and arc length. d is Infinity beyond 0.75. */
  project(x: number, z: number): PathProjection {
    const ci = Math.floor(x / HASH_CELL)
    const cj = Math.floor(z / HASH_CELL)
    let best: PathProjection = { d: Infinity, y: NaN, s: NaN }
    const seen = new Set<number>()
    for (let di = -HASH_REACH; di <= HASH_REACH; di++) {
      for (let dj = -HASH_REACH; dj <= HASH_REACH; dj++) {
        const list = this.cells.get(SegmentHash.key(ci + di, cj + dj))
        if (!list) continue
        for (const i of list) {
          if (seen.has(i)) continue
          seen.add(i)
          const a = this.points[i]
          const b = this.points[i + 1]
          const ex = b.x - a.x
          const ez = b.z - a.z
          const l2 = ex * ex + ez * ez || 1e-12
          const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2))
          const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t)
          if (d < best.d) best = { d, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t }
        }
      }
    }
    return best
  }
}

/** Distance along a ray from (cx, cz) at which `inside` first turns false: 0.08 march then 14 bisection steps. */
export function rayExit(inside: (x: number, z: number) => boolean, cx: number, cz: number, theta: number, maxR = 4.5): number {
  const dx = Math.cos(theta)
  const dz = Math.sin(theta)
  if (!inside(cx, cz)) return 0
  let hi = 0.08
  while (hi < maxR && inside(cx + dx * hi, cz + dz * hi)) hi += 0.08
  if (hi >= maxR) return maxR
  let lo = hi - 0.08
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (inside(cx + dx * mid, cz + dz * mid)) lo = mid
    else hi = mid
  }
  return lo
}

export function walkableRun(
  groundHeightAt: (x: number, z: number) => number,
  onLand: (x: number, z: number) => boolean,
  x: number, z: number, dirX: number, dirZ: number, refY: number, maxDist: number,
): number {
  const len = Math.hypot(dirX, dirZ) || 1
  const ux = dirX / len
  const uz = dirZ / len
  let dist = 0
  while (dist + 0.02 <= maxDist + 1e-9) {
    const px = x + ux * (dist + 0.02)
    const pz = z + uz * (dist + 0.02)
    if (!onLand(px, pz) || Math.abs(groundHeightAt(px, pz) - refY) > 0.03) return dist
    dist += 0.02
  }
  return maxDist
}

export const GRID_CELL = 0.1
export const GRID_EXTENT = 3.5

export function bakeHeightGrid(height: (x: number, z: number) => number): HeightGrid {
  const size = Math.round((2 * GRID_EXTENT) / GRID_CELL) + 1
  const heights = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) heights[j * size + i] = height(-GRID_EXTENT + i * GRID_CELL, -GRID_EXTENT + j * GRID_CELL)
  }
  return { origin: [-GRID_EXTENT, -GRID_EXTENT], cell: GRID_CELL, size, heights }
}

export function gridHeight(grid: HeightGrid, x: number, z: number): number {
  const i = Math.round((x - grid.origin[0]) / grid.cell)
  const j = Math.round((z - grid.origin[1]) / grid.cell)
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -Infinity
  return grid.heights[j * grid.size + i]
}

/** Fraction (0, 1/3, 2/3, 1) of three sun rays from (x, y, z), 0.075 apart sideways, that hit higher terrain. */
export function sunOcclusion(grid: HeightGrid, sun: Vec3, x: number, y: number, z: number): number {
  const hLen = Math.hypot(sun[0], sun[2]) || 1
  const sideX = -sun[2] / hLen
  const sideZ = sun[0] / hLen
  let hits = 0
  for (const offset of [-0.075, 0, 0.075]) {
    const ox = x + sideX * offset
    const oz = z + sideZ * offset
    for (let t = 0.06; t < 6; t += 0.05) {
      const py = y + 0.01 + sun[1] * t
      if (py > 3.2) break
      if (gridHeight(grid, ox + sun[0] * t, oz + sun[2] * t) > py) {
        hits++
        break
      }
    }
  }
  return hits / 3
}
