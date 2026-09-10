// src/features/roadmap/curve.test.ts
import { describe, expect, it } from 'vitest'
import { buildTrailCurve, perpendicularOffset, positionAt, tangentAt } from './curve'

describe('buildTrailCurve', () => {
  it('starts at the base radius and ends at the apex', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const start = positionAt(curve, 0)
    const end = positionAt(curve, 1)

    // The cone is centred on the origin (three.js ConeGeometry), so with
    // height=1.5 it spans y ∈ [-0.75, 0.75] and the trail sits SURFACE_CLEARANCE
    // (0.05) above that: y = -0.7 at t=0 rising to y = 0.8 at t=1.

    // Start: near the base (large horizontal distance from the axis, low y).
    const startRadius = Math.hypot(start.x, start.z)
    expect(startRadius).toBeGreaterThan(1.5)
    expect(start.y).toBeLessThan(-0.65)

    // End: the summit (near-zero horizontal distance, near full height).
    const endRadius = Math.hypot(end.x, end.z)
    expect(endRadius).toBeLessThan(0.3)
    expect(end.y).toBeCloseTo(0.8, 5)
  })

  it('is monotonically non-decreasing in height as t increases', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    let lastY = -Infinity
    for (let t = 0; t <= 1; t += 0.1) {
      const p = positionAt(curve, t)
      expect(p.y).toBeGreaterThanOrEqual(lastY - 0.01) // small epsilon for spline overshoot
      lastY = p.y
    }
  })

  it('produces a different rotation for a different seed (so islands look distinct)', () => {
    const curveA = positionAt(buildTrailCurve(2, 1.5, 0), 0.5)
    const curveB = positionAt(buildTrailCurve(2, 1.5, 2.4), 0.5)
    expect(curveA.x).not.toBeCloseTo(curveB.x, 1)
  })
})

describe('positionAt', () => {
  it('clamps t to [0,1]', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    expect(positionAt(curve, -0.5).equals(positionAt(curve, 0))).toBe(true)
    expect(positionAt(curve, 1.5).equals(positionAt(curve, 1))).toBe(true)
  })
})

describe('tangentAt', () => {
  it('returns a normalized vector', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const tangent = tangentAt(curve, 0.5)
    expect(tangent.length()).toBeCloseTo(1, 5)
  })
})

describe('perpendicularOffset', () => {
  it('offsets in opposite directions for opposite sides', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const left = perpendicularOffset(curve, 0.5, 1, 0.3)
    const right = perpendicularOffset(curve, 0.5, -1, 0.3)
    expect(left.x).toBeCloseTo(-right.x, 5)
    expect(left.z).toBeCloseTo(-right.z, 5)
  })

  it('scales with distance', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const near = perpendicularOffset(curve, 0.5, 1, 0.1)
    const far = perpendicularOffset(curve, 0.5, 1, 0.5)
    expect(far.length()).toBeCloseTo(near.length() * 5, 4)
  })
})
