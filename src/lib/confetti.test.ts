import { describe, expect, it } from 'vitest'
import { CONFETTI_DURATION, confettiPiece, confettiPosition, confettiScale } from './confetti'

describe('confetti', () => {
  const pieces = Array.from({ length: 120 }, (_, i) => confettiPiece(i, 5))

  it('is the same burst every time', () => {
    expect(confettiPiece(7, 5)).toEqual(confettiPiece(7, 5))
  })

  it('throws every piece upward and uses every colour', () => {
    expect(pieces.every((p) => p.velocity[1] > 0)).toBe(true)
    expect(new Set(pieces.map((p) => p.colour)).size).toBe(5)
  })

  it('starts at the origin, rises, then falls', () => {
    const p = pieces[0]
    expect(confettiPosition(p, 0)).toEqual([0, 0, 0])
    expect(confettiPosition(p, 0.4)[1]).toBeGreaterThan(0)
    expect(confettiPosition(p, CONFETTI_DURATION)[1]).toBeLessThan(confettiPosition(p, 0.6)[1])
  })

  it('stays within a few units of the island', () => {
    for (const p of pieces) {
      for (const t of [0.5, 1, 2, CONFETTI_DURATION]) {
        const [x, , z] = confettiPosition(p, t)
        expect(Math.hypot(x, z)).toBeLessThan(3.5)
      }
    }
  })

  it('shrinks away by the end', () => {
    for (const p of pieces) {
      expect(confettiScale(p, 0)).toBe(1)
      expect(confettiScale(p, CONFETTI_DURATION)).toBe(0)
    }
  })
})
