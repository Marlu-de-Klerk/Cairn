export type DevView = 'hero' | 'side' | 'top' | 'back'

export interface DevParams {
  readonly seed: number
  readonly view: DevView
  readonly dist: number
}

const VIEWS: readonly DevView[] = ['hero', 'side', 'top', 'back']

function number(search: URLSearchParams, key: string, fallback: number): number {
  const raw = search.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseDevParams(search: URLSearchParams): DevParams {
  const view = search.get('view') as DevView | null
  return {
    seed: Math.max(0, Math.floor(number(search, 'seed', 1))),
    view: view && VIEWS.includes(view) ? view : 'hero',
    dist: Math.max(0.2, number(search, 'dist', 1)),
  }
}
