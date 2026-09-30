import { describe, expect, it } from 'vitest'
import { buildIslandLayout } from './plan'
import { shoreline } from './shoreline'
import { BEACH } from './shapes'

describe('shoreline', () => {
  const layout = buildIslandLayout('reef', 19)
  const shore = shoreline(layout, 128)

  it('traces the edge of the beach', () => {
    expect(shore).toHaveLength(128)
    for (const p of shore) {
      // just inside is beach, just outside is water
      expect(layout.levelAt(p.x - p.nx * 0.05, p.z - p.nz * 0.05)).toBeGreaterThanOrEqual(BEACH)
      expect(layout.levelAt(p.x + p.nx * 0.08, p.z + p.nz * 0.08)).toBeLessThan(BEACH)
    }
  })

  it('has unit outward normals and increasing arc length', () => {
    for (let i = 0; i < shore.length; i++) {
      expect(Math.hypot(shore[i].nx, shore[i].nz)).toBeCloseTo(1, 6)
      if (i > 0) expect(shore[i].s).toBeGreaterThan(shore[i - 1].s)
    }
    expect(shore[shore.length - 1].s).toBeGreaterThan(8)
  })
})
