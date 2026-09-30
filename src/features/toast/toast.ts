import { useSyncExternalStore } from 'react'

// App-wide toasts: short confirmations with an optional action (Undo). A module store rather than context, so a
// toast raised just before a route change (deleting a goal navigates home) outlives the component that raised it.

export interface ToastAction {
  readonly label: string
  readonly run: () => void | Promise<void>
}

export interface Toast {
  readonly id: number
  readonly message: string
  readonly action?: ToastAction
}

let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener()
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

/** Shows a toast for `durationMs` (8 s by default: long enough to reach Undo). Returns its id. */
export function showToast(message: string, action?: ToastAction, durationMs = 8000): number {
  const id = nextId++
  // one at a time: a newer confirmation replaces an older one rather than stacking up
  for (const t of toasts) dismissToast(t.id)
  toasts = [{ id, message, action }]
  timers.set(id, setTimeout(() => dismissToast(id), durationMs))
  emit()
  return id
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => toasts)
}
