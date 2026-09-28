export type DevView =
  | 'hero' | 'side' | 'top' | 'back'   // preset cameras + OrbitControls
  | 'focus' | 'orbit-back' | 'phone'   // the real CameraRig focus pose (orbit-back = orbit π)

export interface DevParams {
  readonly seed: number
  readonly view: DevView
  readonly dist: number
  readonly milestones: number
  readonly head: number
  readonly entries: number
  readonly orbit: number
}

const VIEWS: readonly DevView[] = ['hero', 'side', 'top', 'back', 'focus', 'orbit-back', 'phone']

export function isFocusView(view: DevView): boolean {
  return view === 'focus' || view === 'orbit-back' || view === 'phone'
}

function number(search: URLSearchParams, key: string, fallback: number): number {
  const raw = search.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseDevParams(search: URLSearchParams): DevParams {
  const raw = search.get('view') as DevView | null
  const view = raw && VIEWS.includes(raw) ? raw : 'hero'
  return {
    seed: Math.max(0, Math.floor(number(search, 'seed', 1))),
    view,
    dist: Math.max(0.2, number(search, 'dist', 1)),
    milestones: Math.max(0, Math.min(8, Math.floor(number(search, 'milestones', 4)))),
    head: Math.max(0, Math.min(1, number(search, 'head', 0.55))),
    entries: Math.max(0, Math.min(8, Math.floor(number(search, 'entries', 3)))),
    orbit: number(search, 'orbit', view === 'orbit-back' ? Math.PI : 0),
  }
}
