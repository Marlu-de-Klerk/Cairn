// Camera zoom maths for the archipelago (wheel and pinch). Pure functions: CameraRig owns the refs and the events.

export interface ZoomRange {
  readonly min: number
  readonly max: number
}

/** Overview: a multiplier on the orbit radius. */
export const OVERVIEW_ZOOM: ZoomRange = { min: 0.45, max: 1.9 }

/** Focused island: a multiplier on the focus pose's camera offset. Zooming out past max leaves the island. */
export const FOCUS_ZOOM: ZoomRange = { min: 0.5, max: 1.5 }

/**
 * How far (in log-zoom units) the viewer has to keep zooming out once they are already at FOCUS_ZOOM.max before the
 * camera leaves the island. The pause at max stops one hard trackpad fling from throwing the viewer out.
 */
export const EXIT_OVERSHOOT = 0.75

/** Overshoot bleeds away while the viewer isn't zooming, so stopping at the limit resets the push-out. */
export const OVERSHOOT_DECAY_MS = 350

/** Wheel deltaY (pixels, positive = away from the viewer = zoom out) to a zoom multiplier. */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  return Math.exp(Math.max(-120, Math.min(120, pixels)) * 0.0015)
}

export function clampZoom(zoom: number, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, zoom))
}

export interface FocusZoomState {
  readonly zoom: number
  /** accumulated log-zoom pushed past FOCUS_ZOOM.max */
  readonly overshoot: number
}

/**
 * Applies a zoom multiplier while focused on an island. Zooming out stops at FOCUS_ZOOM.max; keeping on zooming out
 * builds up overshoot, and once it passes EXIT_OVERSHOOT the result says to exit. Zooming in clears the overshoot,
 * and it decays over `elapsedMs` since the previous step, so only a sustained zoom-out leaves the island.
 */
export function stepFocusZoom(state: FocusZoomState, factor: number, elapsedMs = 0): FocusZoomState & { readonly exit: boolean } {
  const wanted = state.zoom * factor
  if (factor <= 1) return { zoom: clampZoom(wanted, FOCUS_ZOOM), overshoot: 0, exit: false }
  if (wanted <= FOCUS_ZOOM.max) return { zoom: wanted, overshoot: 0, exit: false }
  const carried = state.overshoot * Math.exp(-Math.max(0, elapsedMs) / OVERSHOOT_DECAY_MS)
  const overshoot = carried + Math.log(wanted / Math.max(state.zoom, FOCUS_ZOOM.max))
  return { zoom: FOCUS_ZOOM.max, overshoot, exit: overshoot >= EXIT_OVERSHOOT }
}

/** Eases a current zoom toward its target; frame-rate independent. */
export function easeZoom(current: number, target: number, deltaSeconds: number): number {
  const k = 1 - Math.exp(-deltaSeconds * 12)
  return current + (target - current) * k
}
