import { describe, expect, it } from 'vitest'
import { parseDevParams } from './devParams'

describe('parseDevParams', () => {
  it('defaults to seed 1, hero view, unit distance', () => {
    expect(parseDevParams(new URLSearchParams(''))).toEqual({ seed: 1, view: 'hero', dist: 1 })
  })

  it('reads seed, view and distance', () => {
    expect(parseDevParams(new URLSearchParams('seed=42&view=top&dist=1.5'))).toEqual({ seed: 42, view: 'top', dist: 1.5 })
  })

  it('falls back on junk values', () => {
    expect(parseDevParams(new URLSearchParams('seed=abc&view=sideways&dist=-3'))).toEqual({ seed: 1, view: 'hero', dist: 0.2 })
  })
})
