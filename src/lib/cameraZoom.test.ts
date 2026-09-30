import { describe, expect, it } from 'vitest'
import { EXIT_OVERSHOOT, FOCUS_ZOOM, OVERVIEW_ZOOM, clampZoom, easeZoom, stepFocusZoom, wheelFactor } from './cameraZoom'

describe('wheelFactor', () => {
  it('zooms out for positive deltaY and in for negative', () => {
    expect(wheelFactor(100)).toBeGreaterThan(1)
    expect(wheelFactor(-100)).toBeLessThan(1)
    expect(wheelFactor(0)).toBe(1)
  })

  it('treats line and page delta modes as larger steps, and caps one event', () => {
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48), 10)
    expect(wheelFactor(10000)).toBeCloseTo(wheelFactor(120), 10)
  })
})

describe('clampZoom', () => {
  it('keeps zoom inside the range', () => {
    expect(clampZoom(10, OVERVIEW_ZOOM)).toBe(OVERVIEW_ZOOM.max)
    expect(clampZoom(0.01, OVERVIEW_ZOOM)).toBe(OVERVIEW_ZOOM.min)
    expect(clampZoom(1, OVERVIEW_ZOOM)).toBe(1)
  })
})

describe('stepFocusZoom', () => {
  it('zooms freely inside the focus range', () => {
    const s = stepFocusZoom({ zoom: 1, overshoot: 0 }, 1.2)
    expect(s.zoom).toBeCloseTo(1.2)
    expect(s.exit).toBe(false)
  })

  it('stops at the minimum when zooming in', () => {
    expect(stepFocusZoom({ zoom: 0.6, overshoot: 0 }, 0.5).zoom).toBe(FOCUS_ZOOM.min)
  })

  it('pauses at the maximum before leaving the island', () => {
    const atMax = stepFocusZoom({ zoom: 1.4, overshoot: 0 }, 1.2)
    expect(atMax.zoom).toBe(FOCUS_ZOOM.max)
    expect(atMax.exit).toBe(false)
    let state = { zoom: atMax.zoom, overshoot: atMax.overshoot }
    let exit = false
    for (let i = 0; i < 20 && !exit; i++) {
      const next = stepFocusZoom(state, 1.1)
      state = { zoom: next.zoom, overshoot: next.overshoot }
      exit = next.exit
    }
    expect(exit).toBe(true)
    expect(state.overshoot).toBeGreaterThanOrEqual(EXIT_OVERSHOOT)
  })

  it('does not leave on a couple of notches past the limit', () => {
    let state = { zoom: 0.5, overshoot: 0 }
    let exit = false
    const notch = wheelFactor(120)
    // zoom out from the closest view to the limit, then two more notches
    for (let i = 0; i < 9; i++) {
      const next = stepFocusZoom(state, notch, 80)
      state = { zoom: next.zoom, overshoot: next.overshoot }
      exit = exit || next.exit
    }
    expect(state.zoom).toBe(FOCUS_ZOOM.max)
    expect(exit).toBe(false)
  })

  it('forgets the overshoot after a pause at the limit', () => {
    const pushed = stepFocusZoom({ zoom: FOCUS_ZOOM.max, overshoot: 0.7 }, 1.05, 2000)
    expect(pushed.overshoot).toBeLessThan(0.1)
    expect(pushed.exit).toBe(false)
  })

  it('clears the overshoot when zooming back in', () => {
    const s = stepFocusZoom({ zoom: FOCUS_ZOOM.max, overshoot: 0.3 }, 0.9)
    expect(s.overshoot).toBe(0)
    expect(s.exit).toBe(false)
  })
})

describe('easeZoom', () => {
  it('moves toward the target and settles', () => {
    let z = 1
    for (let i = 0; i < 60; i++) z = easeZoom(z, 2, 1 / 60)
    expect(z).toBeGreaterThan(1.99)
    expect(easeZoom(1, 2, 1 / 60)).toBeGreaterThan(1)
    expect(easeZoom(1, 2, 1 / 60)).toBeLessThan(2)
  })
})
