import { describe, expect, it } from 'vitest'
import { BIOME_TERRAIN } from '../../../lib/island/biomes'
import { getPropGeometry } from './propGeometry'

describe('getPropGeometry', () => {
  const rules = BIOME_TERRAIN.jungle.props

  it('builds every jungle kind with colours, base on the ground and exact rule height', () => {
    for (const rule of rules) {
      const g = getPropGeometry(rule.kind, 'jungle')
      expect(g.getAttribute('color'), rule.kind).toBeDefined()
      g.computeBoundingBox()
      const box = g.boundingBox!
      expect(box.min.y, rule.kind).toBeCloseTo(0, 6)
      expect(Math.abs(box.max.y - rule.height) / rule.height, rule.kind).toBeLessThanOrEqual(0.05)
    }
  })

  it('caches one geometry per kind and biome', () => {
    expect(getPropGeometry('palm', 'jungle')).toBe(getPropGeometry('palm', 'jungle'))
  })

  it('keeps the focused jungle prop budget under 14k triangles', () => {
    let tris = 0
    for (const rule of rules) tris += (getPropGeometry(rule.kind, 'jungle').getAttribute('position').count / 3) * rule.count
    expect(tris).toBeLessThanOrEqual(14000)
  })
})
