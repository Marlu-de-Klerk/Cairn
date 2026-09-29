import { describe, expect, it } from 'vitest'
import { SegmentHash, bakeHeightGrid, rayExit, sunOcclusion, walkableRun } from './query'

describe('SegmentHash', () => {
  const path = [0, 1, 2, 3].map((i) => ({ x: i, z: 0, y: i * 0.1, s: i }))
  const hash = new SegmentHash(path)

  it('projects onto the nearest segment with interpolated y and s', () => {
    const p = hash.project(1.5, 0.2)
    expect(p.d).toBeCloseTo(0.2, 12)
    expect(p.y).toBeCloseTo(0.15, 12)
    expect(p.s).toBeCloseTo(1.5, 12)
  })

  it('reports Infinity beyond its reach', () => {
    expect(hash.project(1.5, 3).d).toBe(Infinity)
  })
})

describe('rayExit', () => {
  it('finds a circle boundary to bisection precision', () => {
    expect(rayExit((x, z) => Math.hypot(x, z) < 1.234, 0, 0, 0.7)).toBeCloseTo(1.234, 4)
  })

  it('is 0 when the origin is outside', () => {
    expect(rayExit(() => false, 0, 0, 0)).toBe(0)
  })
})

describe('walkableRun', () => {
  it('stops at the first step higher than 0.03', () => {
    const ground = (x: number) => (x < 0.5 ? 0 : 0.1)
    expect(walkableRun(ground, () => true, 0, 0, 1, 0, 0, 2)).toBeCloseTo(0.48, 6)
  })

  it('stops at water', () => {
    expect(walkableRun(() => 0, (x) => x < 0.3, 0, 0, 1, 0, 0, 2)).toBeCloseTo(0.28, 6)
  })
})

describe('height grid and sun occlusion', () => {
  it('shadows ground next to a tall wall toward the sun', () => {
    const grid = bakeHeightGrid((x) => (x < -0.5 ? 2 : 0))
    const sun = [-0.6, 0.6, 0] as const
    expect(sunOcclusion(grid, sun, -0.3, 0, 0)).toBe(1)
    expect(sunOcclusion(grid, sun, 2.5, 0, 0)).toBe(0)
  })
})
