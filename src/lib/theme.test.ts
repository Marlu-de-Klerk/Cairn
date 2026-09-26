import { describe, expect, it } from 'vitest'
import { BIOME_PALETTES, getBiomePalette } from './theme'

const BIOMES = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands'] as const

describe('BIOME_PALETTES', () => {
  it('defines all six biomes', () => {
    expect(Object.keys(BIOME_PALETTES).sort()).toEqual([...BIOMES].sort())
  })

  it('every biome has all four fields as valid hex numbers', () => {
    for (const biome of BIOMES) {
      const palette = BIOME_PALETTES[biome]
      for (const field of ['landmass', 'landmassShadow', 'trail', 'accent'] as const) {
        expect(typeof palette[field]).toBe('number')
        expect(palette[field]).toBeGreaterThanOrEqual(0)
        expect(palette[field]).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('getBiomePalette returns the same object as a direct lookup', () => {
    expect(getBiomePalette('reef')).toBe(BIOME_PALETTES.reef)
  })
})
