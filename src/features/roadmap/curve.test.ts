// src/features/roadmap/curve.test.ts
import { describe, expect, it } from 'vitest'
import { buildIslandLayout } from '../../lib/island/plan'
import { TRAIL_CLEARANCE, buildTrailCurve, buildTrailRibbon, groundedOffset, perpendicularOffset, positionAt, tangentAt } from './curve'

const layout = buildIslandLayout('jungle', 1)
const curve = buildTrailCurve(layout.trail.waypoints)

describe('buildTrailCurve', () => {
  it('starts on the beach trailhead and ends at the summit', () => {
    const [sx, sy, sz] = layout.trail.waypoints[0]
    const start = positionAt(curve, 0)
    expect(start.distanceTo({ x: sx, y: sy + TRAIL_CLEARANCE, z: sz } as never)).toBeLessThan(0.02)
    expect(Math.hypot(start.x, start.z)).toBeGreaterThanOrEqual(0.6 * layout.footprintRadius)
    const end = positionAt(curve, 1)
    expect(end.distanceTo({ x: layout.summit[0], y: layout.summit[1] + TRAIL_CLEARANCE, z: layout.summit[2] } as never)).toBeLessThan(0.02)
  })

  it('never descends', () => {
    let last = -Infinity
    for (let t = 0; t <= 1; t += 0.01) {
      const y = positionAt(curve, t).y
      expect(y).toBeGreaterThanOrEqual(last - 0.005)
      last = y
    }
  })

  it('follows the ground on every biome and seed: never floats, never clips', () => {
    for (const biome of ['jungle', 'volcano', 'desert'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const l = buildIslandLayout(biome, seed)
        const c = buildTrailCurve(l.trail.waypoints)
        for (let i = 0; i <= 400; i++) {
          const p = positionAt(c, i / 400)
          expect(Math.abs(p.y - (l.groundHeightAt(p.x, p.z) + TRAIL_CLEARANCE)), `${biome}:${seed} t=${i / 400}`).toBeLessThanOrEqual(0.03)
        }
      }
    }
  }, 300_000) // builds a layout per biome and seed

  it('spaces n/(N+1) evenly by walking distance', () => {
    const points = Array.from({ length: 10 }, (_, i) => positionAt(curve, i / 9))
    const lengths = points.slice(1).map((_, i) => {
      let len = 0
      let prev = points[i]
      for (let k = 1; k <= 50; k++) {
        const q = positionAt(curve, i / 9 + (k / 50) / 9)
        len += q.distanceTo(prev)
        prev = q
      }
      return len
    })
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
    for (const len of lengths) expect(Math.abs(len - mean) / mean).toBeLessThanOrEqual(0.02)
  })

  it('gives different seeds different trails', () => {
    const other = buildTrailCurve(buildIslandLayout('jungle', 2).trail.waypoints)
    expect(positionAt(curve, 0.5).distanceTo(positionAt(other, 0.5))).toBeGreaterThan(0.1)
  })
})

describe('positionAt / tangentAt / perpendicularOffset', () => {
  it('clamps t to [0,1]', () => {
    expect(positionAt(curve, -0.5).equals(positionAt(curve, 0))).toBe(true)
    expect(positionAt(curve, 1.5).equals(positionAt(curve, 1))).toBe(true)
  })

  it('returns unit tangents that never point near-vertical', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const tangent = tangentAt(curve, t)
      expect(tangent.length()).toBeCloseTo(1, 5)
      expect(Math.abs(tangent.y)).toBeLessThan(0.6)
    }
  })

  it('offsets in opposite directions for opposite sides, scaling with distance', () => {
    const left = perpendicularOffset(curve, 0.5, 1, 0.3)
    const right = perpendicularOffset(curve, 0.5, -1, 0.3)
    expect(left.x).toBeCloseTo(-right.x, 5)
    expect(left.z).toBeCloseTo(-right.z, 5)
    expect(perpendicularOffset(curve, 0.5, 1, 0.5).length()).toBeCloseTo(perpendicularOffset(curve, 0.5, 1, 0.1).length() * 5, 4)
  })
})

describe('groundedOffset', () => {
  it('stands on the ground, within the requested distance', () => {
    for (let t = 0.02; t < 1; t += 0.07) {
      const { position } = groundedOffset(curve, layout, t, 1, 0.25, 0.05)
      expect(Math.abs(position.y - layout.groundHeightAt(position.x, position.z))).toBeLessThan(1e-3)
      const base = positionAt(curve, t)
      expect(Math.hypot(position.x - base.x, position.z - base.z)).toBeLessThanOrEqual(0.25 + 1e-6)
    }
  })

  it('flips side when the requested side has no room', () => {
    const blockedLeft = { groundHeightAt: layout.groundHeightAt, walkableRun: (x: number, z: number, dx: number, dz: number, y: number, max: number) => {
      const left = perpendicularOffset(curve, 0.5, 1, 1)
      return dx * left.x + dz * left.z > 0 ? 0 : layout.walkableRun(x, z, dx, dz, y, max)
    } }
    expect(groundedOffset(curve, blockedLeft, 0.5, 1, 0.25, 0.05).side).toBe(-1)
  })
})

describe('buildTrailRibbon', () => {
  it('lays one cross-section per ~0.03 of arc, on the ground', () => {
    const ribbon = buildTrailRibbon(curve, layout, 0, 1, 0.055)
    const pos = ribbon.getAttribute('position')
    expect(pos.count).toBeGreaterThanOrEqual(2 * Math.floor(curve.getLength() / 0.03))
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getY(i) - (layout.groundHeightAt(pos.getX(i), pos.getZ(i)) + TRAIL_CLEARANCE))).toBeLessThan(1e-3)
    }
  })
})
