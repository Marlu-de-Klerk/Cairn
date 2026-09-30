import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { dismissToast, showToast, useToasts } from './toast'

describe('toast store', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows one toast at a time, the newest replacing the last', () => {
    const { result } = renderHook(() => useToasts())
    act(() => {
      showToast('First')
      showToast('Second', { label: 'Undo', run: () => {} })
    })
    expect(result.current.map((t) => t.message)).toEqual(['Second'])
    expect(result.current[0].action?.label).toBe('Undo')
    act(() => dismissToast(result.current[0].id))
    expect(result.current).toEqual([])
  })

  it('dismisses itself after its duration', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToasts())
    act(() => {
      showToast('Saved', undefined, 1000)
    })
    expect(result.current).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1001)
    })
    expect(result.current).toEqual([])
  })
})
