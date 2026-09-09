import { describe, expect, it } from 'vitest'
import { islandPosition } from './archipelago'

describe('islandPosition', () => {
  it('is deterministic — same index and seed always produce the same position', () => {
    const a = islandPosition(3, 12345)
    const b = islandPosition(3, 12345)
    expect(a).toEqual(b)
  })

  it('produces a different position for a different seed', () => {
    const a = islandPosition(3, 1)
    const b = islandPosition(3, 2)
    expect(a.x).not.toBeCloseTo(b.x, 5)
  })

  it('follows the golden-angle spiral: radius grows with index, roughly as 8*sqrt(i+1)', () => {
    const seed = 42
    for (let i = 0; i < 5; i++) {
      const { x, z } = islandPosition(i, seed)
      const radius = Math.sqrt(x * x + z * z)
      const expectedRadius = 8 * Math.sqrt(i + 1)
      // jitter is small relative to the radius at every index used here
      expect(radius).toBeGreaterThan(expectedRadius - 1)
      expect(radius).toBeLessThan(expectedRadius + 1)
    }
  })

  it('never places two of the first 20 islands closer than their combined footprint (radius ~2 each, Task 4)', () => {
    // Sanity-checked numerically across several seeds: this formula's actual
    // minimum separation among the first 20 islands is ~9.7-11.5 units, far
    // above the ~4 units two radius-2 cones need to not visually intersect.
    // Assert the real safety margin, not a trivially-true lower bound.
    for (const seed of [1, 7, 42, 99]) {
      const positions = Array.from({ length: 20 }, (_, i) => islandPosition(i, seed))
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dz = positions[i].z - positions[j].z
          const distance = Math.sqrt(dx * dx + dz * dz)
          expect(distance).toBeGreaterThan(4)
        }
      }
    }
  })

  it('returns a rotation in [0, 2*PI)', () => {
    for (let i = 0; i < 10; i++) {
      const { rotation } = islandPosition(i, 99)
      expect(rotation).toBeGreaterThanOrEqual(0)
      expect(rotation).toBeLessThan(2 * Math.PI)
    }
  })
})
