import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { buildIslandLayout } from '../../../lib/island/plan'
import { buildTerrain } from './terraceMesh'

const SEEDS = [1, 2, 3, 7, 42]

function triangles(g: BufferGeometry) {
  return g.getAttribute('position').count / 3
}

describe('buildTerrain', () => {
  const layout = buildIslandLayout('jungle', 1)
  const focus = buildTerrain(layout, 'focus')

  it('has no NaN positions and colours in [0, 1]', () => {
    for (const g of [focus.lit, focus.unlit]) {
      const pos = g.getAttribute('position').array
      for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true)
      const col = g.getAttribute('color').array
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toBeGreaterThanOrEqual(0)
        expect(col[i]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stays inside the halo and below the summit', () => {
    for (const g of [focus.lit, focus.unlit]) {
      g.computeBoundingBox()
      const box = g.boundingBox!
      expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(layout.haloRadius + 1e-6)
      expect(box.max.y).toBeLessThanOrEqual(layout.summitTopY + 0.1)
    }
  })

  it('makes cap triangles exactly horizontal', () => {
    const normal = focus.lit.getAttribute('normal')
    const pos = focus.lit.getAttribute('position')
    let caps = 0
    for (let i = 0; i < normal.count; i += 3) {
      const level = pos.getY(i) === pos.getY(i + 1) && pos.getY(i) === pos.getY(i + 2)
      if (level && normal.getY(i) > 0.5) {
        expect(normal.getY(i)).toBeGreaterThan(0.999)
        caps++
      }
    }
    expect(caps).toBeGreaterThan(1000)
  })

  it('lays the carved strip at the path height', () => {
    const pos = focus.lit.getAttribute('position')
    let checked = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const p = layout.pathProject(x, z)
      if (p.d > layout.trail.halfWidth * 0.5) continue
      if (Math.abs(pos.getY(i) - p.y) < 0.06) checked++
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('keeps a small hull that covers the whole trail', () => {
    expect(triangles(focus.hull)).toBeLessThanOrEqual(800)
    const mesh = new Mesh(focus.hull, new MeshBasicMaterial())
    const ray = new Raycaster()
    for (const q of layout.trail.samples.filter((_, i) => i % 5 === 0)) {
      ray.set(new Vector3(q.x, 5, q.z), new Vector3(0, -1, 0))
      expect(ray.intersectObject(mesh).length).toBeGreaterThan(0)
    }
  })

  it('stays inside the triangle budget (spec §8)', () => {
    for (const seed of SEEDS) {
      const l = buildIslandLayout('jungle', seed)
      const f = buildTerrain(l, 'focus')
      const o = buildTerrain(l, 'overview')
      expect(triangles(f.lit), `focus lit ${seed}`).toBeLessThanOrEqual(26000)
      expect(triangles(f.unlit), `focus unlit ${seed}`).toBeLessThanOrEqual(5000)
      expect(triangles(o.lit), `overview lit ${seed}`).toBeLessThanOrEqual(10000)
      expect(triangles(o.unlit), `overview unlit ${seed}`).toBeLessThanOrEqual(2000)
    }
  })
})
