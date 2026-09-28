import { describe, expect, it } from 'vitest'
import type { PolarBlob } from './types'
import { angularWindow, blobSd, fluteOffset, wrapPi } from './shapes'

const circle: PolarBlob = { cx: 1, cz: -1, radius: 2, harmonics: [], lobes: [], flutes: null }

describe('blobSd', () => {
  it('is the signed distance of a plain circle, positive inside', () => {
    expect(blobSd(circle, 1, -1)).toBeCloseTo(2, 12)
    expect(blobSd(circle, 3, -1)).toBeCloseTo(0, 12)
    expect(blobSd(circle, 4, -1)).toBeCloseTo(-1, 12)
  })

  it('unions lobes', () => {
    const withLobe: PolarBlob = { ...circle, lobes: [{ x: 5, z: -1, r: 1 }] }
    expect(blobSd(withLobe, 5, -1)).toBeCloseTo(1, 12)
  })

  it('adds piecewise-linear flutes', () => {
    const offsets = new Float32Array([0.1, -0.1, 0.1, -0.1])
    const flutes = { binsPerRadian: 4 / (Math.PI * 2), depth: 0.1, offsets }
    expect(fluteOffset(flutes, 0)).toBeCloseTo(0.1, 6)
    expect(fluteOffset(flutes, Math.PI / 4)).toBeCloseTo(0, 6)
    expect(blobSd({ ...circle, flutes }, 3, -1)).toBeCloseTo(0.1, 6)
  })
})

describe('angle helpers', () => {
  it('wraps to (-pi, pi]', () => {
    expect(wrapPi(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('windows an arc with a cosine feather', () => {
    expect(angularWindow(0.5, 0, 1, 0.3)).toBe(1)
    expect(angularWindow(1.15, 0, 1, 0.3)).toBeCloseTo(0.5, 6)
    expect(angularWindow(2, 0, 1, 0.3)).toBe(0)
    expect(angularWindow(-0.05, 6.2, 0.2, 0.3)).toBe(1)
  })
})
