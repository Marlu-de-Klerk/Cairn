import { describe, expect, it } from 'vitest'
import { limitHeights, RAMP_SLOPE_DEG } from './trailPlan'

describe('limitHeights', () => {
  const s = Array.from({ length: 101 }, (_, i) => i * 0.04)
  const raw = s.map((v) => (v < 2 ? 0.16 : 1.1))
  const ys = limitHeights(raw, s)

  it('turns a step into a monotone ramp centred on the step', () => {
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1])
    expect(ys[0]).toBeCloseTo(0.16, 9)
    expect(ys[ys.length - 1]).toBeCloseTo(1.1, 9)
    expect(ys[50]).toBeCloseTo(0.63, 1)
  })

  it('keeps the mean slope at the ramp angle and the peak below 32°', () => {
    const tan = Math.tan((RAMP_SLOPE_DEG * Math.PI) / 180)
    let peak = 0
    for (let i = 0; i + 3 < ys.length; i++) peak = Math.max(peak, (ys[i + 3] - ys[i]) / (s[i + 3] - s[i]))
    expect(peak).toBeLessThanOrEqual(Math.tan((32 * Math.PI) / 180))
    const climbing = ys.filter((y) => y > 0.17 && y < 1.09).length * 0.04
    expect((1.1 - 0.16) / climbing).toBeCloseTo(tan, 1)
  })
})
