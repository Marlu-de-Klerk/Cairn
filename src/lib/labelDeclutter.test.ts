import { describe, expect, it } from 'vitest'
import { declutterLabels } from './labelDeclutter'

const box = (left: number, top: number, width = 100, height = 20, pinned = false) => ({ left, top, right: left + width, bottom: top + height, pinned })

describe('declutterLabels', () => {
  it('shows labels that do not overlap', () => {
    expect(declutterLabels([box(0, 0), box(200, 0), box(0, 100)])).toEqual([true, true, true])
  })

  it('keeps the nearer (lower) of two overlapping labels', () => {
    expect(declutterLabels([box(0, 0), box(50, 10)])).toEqual([false, true])
  })

  it('treats labels closer than the gap as overlapping', () => {
    expect(declutterLabels([box(0, 0), box(102, 0)], 4)).toEqual([true, false])
    expect(declutterLabels([box(0, 0), box(106, 0)], 4)).toEqual([true, true])
  })

  it('always shows a pinned label and drops what it covers', () => {
    expect(declutterLabels([box(0, 0, 100, 20, true), box(50, 10)])).toEqual([true, false])
  })

  it('lets a hidden label free its neighbours', () => {
    // b covers a and c; b is nearest, so it wins and both others hide, even though a and c don't overlap each other.
    expect(declutterLabels([box(0, 0), box(60, 5), box(120, 0)])).toEqual([false, true, false])
  })
})
