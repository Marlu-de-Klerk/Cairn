import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Keeps the sea and ocean life moving under the focused view's demand frameloop by requesting frames at a steady,
 * capped rate (default 30 fps) instead of the display's full refresh. Pauses while the tab is hidden and for viewers
 * who ask for reduced motion. Under frameloop="always" (the overview) it does nothing extra.
 */
export function AmbientMotion({ fps = 30 }: { fps?: number }) {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = 0
    const interval = 1000 / fps
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || reduced?.matches) return
      if (now - last < interval - 1) return
      last = now
      invalidate()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fps, invalidate])
  return null
}
