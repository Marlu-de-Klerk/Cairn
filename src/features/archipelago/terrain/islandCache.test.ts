import { describe, expect, it } from 'vitest'
import { getIslandBuild, getIslandLayout, releaseIslandBuild } from './islandCache'

describe('islandCache', () => {
  it('builds each layout once', () => {
    expect(getIslandLayout('jungle', 3)).toBe(getIslandLayout('jungle', 3))
  })

  it('reuses a build and reports its cost', () => {
    const a = getIslandBuild('jungle', 3, 'overview')
    const b = getIslandBuild('jungle', 3, 'overview')
    expect(b).toBe(a)
    expect(a.layout).toBe(getIslandLayout('jungle', 3))
    expect(a.triangles.lit).toBeGreaterThan(0)
    expect(a.buildMs).toBeGreaterThan(0)
    releaseIslandBuild(a)
    releaseIslandBuild(b)
  })

  it('never disposes a build that is still held', () => {
    const held = getIslandBuild('jungle', 4, 'preview')
    for (let seed = 100; seed < 130; seed++) releaseIslandBuild(getIslandBuild('jungle', seed, 'preview'))
    expect(held.lit.getAttribute('position')).toBeDefined()
    expect(getIslandBuild('jungle', 4, 'preview')).toBe(held)
  }, 120_000) // 30 full layout builds
})
