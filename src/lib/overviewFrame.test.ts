import { describe, expect, it } from 'vitest'
import { OVERVIEW_DISTANCE, overviewElevation, overviewFrame } from './overviewFrame'
import { islandPosition } from './archipelago'

const desktop = { fovDeg: 50, viewportPx: { width: 1280, height: 800 }, insetTopPx: 100 }
const phone = { fovDeg: 50, viewportPx: { width: 390, height: 844 }, insetTopPx: 100 }
const spiral = (n: number) => Array.from({ length: n }, (_, i) => {
  const p = islandPosition(i, 42)
  return [p.x, p.z] as const
})

describe('overviewFrame', () => {
  it('centres on the islands, not the world origin', () => {
    const frame = overviewFrame([[10, 4], [20, 4]], desktop)
    expect(frame.center).toEqual([15, 4])
  })

  it('pulls back as the archipelago grows', () => {
    const one = overviewFrame(spiral(1), desktop).distance
    const seven = overviewFrame(spiral(7), desktop).distance
    const twenty = overviewFrame(spiral(20), desktop).distance
    expect(seven).toBeGreaterThan(one)
    expect(twenty).toBeGreaterThan(seven)
  })

  it('sits farther back on a portrait phone than on a landscape screen', () => {
    expect(overviewFrame(spiral(7), phone).distance).toBeGreaterThan(overviewFrame(spiral(7), desktop).distance)
  })

  it('frames a single island close up, but never closer than the minimum', () => {
    const one = overviewFrame(spiral(1), desktop).distance
    expect(one).toBeGreaterThanOrEqual(OVERVIEW_DISTANCE.min)
    expect(one).toBeLessThan(22)
    expect(overviewFrame([[0, 0]], { ...desktop, viewportPx: { width: 3000, height: 3000 } }).distance).toBe(OVERVIEW_DISTANCE.min)
  })

  it('looks down at 35° on landscape screens and more steeply on portrait ones', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    expect(deg(overviewElevation(1280 / 800))).toBeCloseTo(35)
    expect(deg(overviewElevation(1))).toBeCloseTo(35)
    expect(deg(overviewElevation(390 / 844))).toBeGreaterThan(50)
    expect(deg(overviewElevation(0.3))).toBeCloseTo(55)
    expect(overviewFrame(spiral(7), phone).elevation).toBeGreaterThan(overviewFrame(spiral(7), desktop).elevation)
  })

  it('fits the fixture archipelago at a desktop distance close to the old fixed orbit', () => {
    const d = overviewFrame(spiral(7), desktop).distance
    expect(d).toBeGreaterThan(25)
    expect(d).toBeLessThan(55)
  })
})
