import { describe, expect, it } from 'vitest'
import { CAMERA_DIR_LOCAL, ISLAND_YAW, SUN_DIR, localToWorld, sunDirLocal } from './orientation'

describe('orientation', () => {
  it('maps layout-local +Z (the trailhead side) to world +X+Z', () => {
    const w = localToWorld(CAMERA_DIR_LOCAL)
    expect(w[0]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(w[2]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(ISLAND_YAW).toBeCloseTo(Math.PI / 4, 12)
  })

  it('has a unit sun from the upper left of the focus camera', () => {
    expect(Math.hypot(...SUN_DIR)).toBeCloseTo(1, 12)
    expect(SUN_DIR[1]).toBeGreaterThan(0.7)
  })

  it('round-trips the sun through the island yaw', () => {
    const back = localToWorld(sunDirLocal())
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(SUN_DIR[i], 12)
  })
})
