import type { EventManager } from '@react-three/fiber'

/**
 * For a <Canvas> nothing in it is clicked or hovered: no pointer listeners at all. It also avoids a crash in r3f's
 * default event layer, which attaches to the canvas wrapper once the root is created and throws if the canvas was
 * unmounted in the meantime (opening the new-goal sheet and closing it within a second).
 */
export const noPointerEvents = (): EventManager<HTMLElement> => ({ enabled: false, priority: 0 })
