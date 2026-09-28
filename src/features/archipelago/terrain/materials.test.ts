import { describe, expect, it } from 'vitest'
import { MeshLambertMaterial, MeshToonMaterial, NearestFilter } from 'three'
import { createToonGradient, getPropMaterial, getTerrainLitMaterial, terrainUnlitMaterial } from './materials'

describe('terrain materials', () => {
  it('uses a three-step nearest-filtered toon gradient', () => {
    const g = createToonGradient()
    expect(Array.from(g.image.data as Uint8Array)).toEqual([120, 190, 255])
    expect(g.magFilter).toBe(NearestFilter)
  })

  it('shares one lit material per kind across islands', () => {
    expect(getTerrainLitMaterial()).toBe(getTerrainLitMaterial('toon'))
    expect(getTerrainLitMaterial()).toBeInstanceOf(MeshToonMaterial)
    expect(getTerrainLitMaterial('lambert')).toBeInstanceOf(MeshLambertMaterial)
    expect(getPropMaterial()).toBe(getPropMaterial())
    expect(getPropMaterial()).not.toBe(getTerrainLitMaterial())
  })

  it('keeps the unlit material off tone mapping', () => {
    expect(terrainUnlitMaterial.toneMapped).toBe(false)
    expect(terrainUnlitMaterial.vertexColors).toBe(true)
  })
})
