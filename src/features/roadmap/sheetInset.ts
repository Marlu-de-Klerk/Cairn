// How many pixels the roadmap sheet covers at the bottom of a phone screen, so CameraRig can frame the focused island
// in the space above it. The panel (DOM) writes it; the camera (inside the Canvas) reads it and eases toward it.

let bottomPx = 0
const listeners = new Set<() => void>()

export function getSheetInset(): number {
  return bottomPx
}

export function setSheetInset(px: number): void {
  const next = Math.max(0, Math.round(px))
  if (next === bottomPx) return
  bottomPx = next
  for (const listener of listeners) listener()
}

export function subscribeSheetInset(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
