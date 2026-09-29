import { describe, expect, it } from 'vitest'
import { createStream, valueNoise2 } from './random'

describe('createStream', () => {
  it('replays the same sequence for the same seed and salt', () => {
    const a = createStream(42, 3)
    const b = createStream(42, 3)
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()))
  })

  it('gives independent sequences per salt', () => {
    expect(createStream(42, 3).next()).not.toBe(createStream(42, 4).next())
  })

  it('keeps range, int, pick and sign inside their bounds', () => {
    const s = createStream(7, 1)
    for (let i = 0; i < 500; i++) {
      const r = s.range(2, 3)
      expect(r).toBeGreaterThanOrEqual(2)
      expect(r).toBeLessThan(3)
      const n = s.int(1, 4)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(4)
      expect(['a', 'b']).toContain(s.pick(['a', 'b'] as const))
      expect([1, -1]).toContain(s.sign())
    }
  })
})

describe('valueNoise2', () => {
  it('stays in [0, 1] and is continuous', () => {
    const n = valueNoise2(9, 300)
    for (let i = 0; i < 400; i++) {
      const x = i * 0.037 - 7
      const v = n(x, x * 0.5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(Math.abs(n(x + 1e-4, x * 0.5) - v)).toBeLessThan(0.01)
    }
  })
})
