import { describe, expect, it } from 'vitest'
import { getIslandBuild, getIslandLayout, releaseIslandBuild } from './islandCache'

// Desert, not jungle: jungle has a hand-built model, so its cached build carries only a hull.
describe('islandCache', () => {
  it('builds each layout once', () => {
    expect(getIslandLayout('desert', 3)).toBe(getIslandLayout('desert', 3))
  })

  it('reuses a build and reports its cost', () => {
    const a = getIslandBuild('desert', 3, 'overview')
    const b = getIslandBuild('desert', 3, 'overview')
    expect(b).toBe(a)
    expect(a.layout).toBe(getIslandLayout('desert', 3))
    expect(a.triangles.lit).toBeGreaterThan(0)
    expect(a.buildMs).toBeGreaterThan(0)
    releaseIslandBuild(a)
    releaseIslandBuild(b)
  })

  it('never disposes a build that is still held', () => {
    const held = getIslandBuild('desert', 4, 'preview')
    for (let seed = 100; seed < 130; seed++) releaseIslandBuild(getIslandBuild('desert', seed, 'preview'))
    expect(held.lit.getAttribute('position')).toBeDefined()
    expect(getIslandBuild('desert', 4, 'preview')).toBe(held)
  }, 120_000) // 30 full layout builds
})

describe('islandCache (hand-built island)', () => {
  it('builds only the hull for jungle', () => {
    const build = getIslandBuild('jungle', 1, 'overview')
    expect(build.hull.getAttribute('position').count).toBeGreaterThan(0)
    expect(build.triangles).toEqual({ lit: 0, unlit: 0, props: 0 })
    releaseIslandBuild(build)
  })
})
