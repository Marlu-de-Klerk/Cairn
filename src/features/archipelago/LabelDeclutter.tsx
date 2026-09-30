import { useFrame } from '@react-three/fiber'
import { declutterLabels } from '../../lib/labelDeclutter'
import type { LabelBox } from '../../lib/labelDeclutter'

/**
 * Fades out island labels that would overlap a nearer one, so a zoomed-out or portrait view reads as a few clean
 * labels rather than a pile. It reads where the labels (marked data-island-label) sit on screen, at most a frame
 * behind; a hovered card is pinned. Default useFrame priority: anything above 0 would take over rendering.
 */
export function LabelDeclutter() {
  useFrame(() => {
    const labels = [...document.querySelectorAll<HTMLElement>('[data-island-label]')]
    const boxes: LabelBox[] = []
    const measured: HTMLElement[] = []
    for (const label of labels) {
      const rect = label.getBoundingClientRect()
      // an occluded label's wrapper is display: none, so it measures empty and takes no room
      if (rect.width === 0 || rect.height === 0) continue
      boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, pinned: label.dataset.pinned === 'true' })
      measured.push(label)
    }
    const visible = declutterLabels(boxes)
    measured.forEach((label, i) => {
      const opacity = visible[i] ? '1' : '0'
      if (label.style.opacity !== opacity) label.style.opacity = opacity
    })
  })
  return null
}
