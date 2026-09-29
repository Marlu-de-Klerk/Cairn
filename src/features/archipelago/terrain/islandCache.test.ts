import { describe, expect, it } from 'vitest'
import { getIslandBuild, getIslandLayout, releaseIslandBuild } from './islandCache'

// Volcano, not jungle or desert: those have hand-built models, so their cached builds carry only a hull.
describe('islandCache', () => {
  it('builds each layout once', () => {
    expect(getIslandLayout('volcano', 3)).toBe(getIslandLayout('volcano', 3))
  })

  it('reuses a build and reports its cost', () => {
    const a = getIslandBuild('volcano', 3, 'overview')
    const b = getIslandBuild('volcano', 3, 'overview')
    expect(b).toBe(a)
    expect(a.layout).toBe(getIslandLayout('volcano', 3))
    expect(a.triangles.lit).toBeGreaterThan(0)
    expect(a.buildMs).toBeGreaterThan(0)
    releaseIslandBuild(a)
    releaseIslandBuild(b)
  })

  it('never disposes a build that is still held', () => {
    const held = getIslandBuild('volcano', 4, 'preview')
    for (let seed = 100; seed < 130; seed++) releaseIslandBuild(getIslandBuild('volcano', seed, 'preview'))
    expect(held.lit.getAttribute('position')).toBeDefined()
    expect(getIslandBuild('volcano', 4, 'preview')).toBe(held)
  }, 120_000) // 30 full layout builds
})

describe('islandCache (hand-built island)', () => {
  it.each(['jungle', 'desert'] as const)('builds only the hull for %s', (biome) => {
    const build = getIslandBuild(biome, 1, 'overview')
    expect(build.hull.getAttribute('position').count).toBeGreaterThan(0)
    expect(build.triangles).toEqual({ lit: 0, unlit: 0, props: 0 })
    releaseIslandBuild(build)
  })
})
