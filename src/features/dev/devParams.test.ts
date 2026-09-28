import { describe, expect, it } from 'vitest'
import { parseDevParams } from './devParams'

describe('parseDevParams', () => {
  it('defaults to seed 1, hero view, unit distance', () => {
    expect(parseDevParams(new URLSearchParams(''))).toEqual({ seed: 1, view: 'hero', dist: 1, milestones: 4, head: 0.55, entries: 3, orbit: 0, islands: 8, material: 'toon' })
  })

  it('reads seed, view and distance', () => {
    expect(parseDevParams(new URLSearchParams('seed=42&view=top&dist=1.5&milestones=8&head=1&entries=0'))).toEqual({ seed: 42, view: 'top', dist: 1.5, milestones: 8, head: 1, entries: 0, orbit: 0, islands: 8, material: 'toon' })
  })

  it('falls back on junk values', () => {
    expect(parseDevParams(new URLSearchParams('seed=abc&view=sideways&dist=-3&head=7'))).toEqual({ seed: 1, view: 'hero', dist: 0.2, milestones: 4, head: 1, entries: 3, orbit: 0, islands: 8, material: 'toon' })
  })

  it('reads the focus views and orbit, and orbit-back defaults to half a turn', () => {
    expect(parseDevParams(new URLSearchParams('view=focus&orbit=1.5'))).toMatchObject({ view: 'focus', orbit: 1.5 })
    expect(parseDevParams(new URLSearchParams('view=phone'))).toMatchObject({ view: 'phone', orbit: 0, islands: 8, material: 'toon' })
    expect(parseDevParams(new URLSearchParams('view=orbit-back'))).toMatchObject({ view: 'orbit-back', orbit: Math.PI })
  })

  it('reads the overview island count and the material A/B switch', () => {
    expect(parseDevParams(new URLSearchParams('view=overview&islands=12&material=lambert'))).toMatchObject({ view: 'overview', islands: 12, material: 'lambert' })
    expect(parseDevParams(new URLSearchParams('islands=500&material=chrome'))).toMatchObject({ islands: 20, material: 'toon' })
  })
})
