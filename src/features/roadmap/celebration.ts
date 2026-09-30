import { useSyncExternalStore } from 'react'

// Which goal is celebrating right now. The roadmap panel (DOM) starts it on completion; the goal's island (inside
// the Canvas) plays the burst and ends it. Each celebration gets a fresh key, so completing, undoing and completing
// again replays it.

let current: { readonly goalId: string; readonly key: number } | null = null
let nextKey = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function celebrateGoal(goalId: string): void {
  current = { goalId, key: nextKey++ }
  emit()
}

export function endCelebration(key: number): void {
  if (current?.key !== key) return
  current = null
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The key of this goal's running celebration, or null. */
export function useCelebration(goalId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (current?.goalId === goalId ? current.key : null),
    () => null,
  )
}
