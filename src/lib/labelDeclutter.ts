// Screen-space label decluttering for the archipelago. Pure: the scene reads the label rects and applies the result.

export interface LabelBox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  /** Always placed first, whatever it overlaps (the hovered island's card). */
  readonly pinned?: boolean
}

/**
 * Which labels to show so that none overlap: pinned labels first, then the rest nearest-first, which on this camera
 * means lowest on screen (largest bottom); a label is shown if it clears every label already shown by `gap` px.
 * Returns one flag per input, in input order.
 */
export function declutterLabels(boxes: readonly LabelBox[], gap = 4): boolean[] {
  const order = boxes.map((_, i) => i).sort((a, b) => Number(!!boxes[b].pinned) - Number(!!boxes[a].pinned) || boxes[b].bottom - boxes[a].bottom)
  const shown: LabelBox[] = []
  const visible = boxes.map(() => false)
  for (const i of order) {
    const box = boxes[i]
    const clear = box.pinned || shown.every((s) => box.right + gap <= s.left || s.right + gap <= box.left || box.bottom + gap <= s.top || s.bottom + gap <= box.top)
    if (!clear) continue
    visible[i] = true
    shown.push(box)
  }
  return visible
}
