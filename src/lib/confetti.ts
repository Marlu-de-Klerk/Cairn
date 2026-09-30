// Confetti for the completion celebration: where each piece is at time t. Pure and seeded, so a burst is the same
// every time and the maths is testable; CompletionBurst draws it.

export const CONFETTI_DURATION = 3.2 // seconds
const DRAG = 1.4 // per second: the throw dies away quickly after the pop

export interface ConfettiPiece {
  readonly velocity: readonly [number, number, number]
  readonly spin: readonly [number, number, number]
  /** index into the burst's colour list */
  readonly colour: number
  /** 0..1: when in the fade-out this piece shrinks away */
  readonly fadeAt: number
  /** how fast it drifts down once the throw has died away, world units per second */
  readonly fall: number
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Piece `i` of a burst: thrown up and outward in a cone, spinning, with one of `colours` colours. */
export function confettiPiece(i: number, colours: number): ConfettiPiece {
  const azimuth = hash(i, 1) * Math.PI * 2
  const tilt = 0.25 + hash(i, 2) * 0.55 // radians off vertical
  const speed = 2.4 + hash(i, 3) * 1.8
  return {
    velocity: [Math.sin(tilt) * Math.cos(azimuth) * speed, Math.cos(tilt) * speed, Math.sin(tilt) * Math.sin(azimuth) * speed],
    spin: [(hash(i, 4) - 0.5) * 14, (hash(i, 5) - 0.5) * 14, (hash(i, 6) - 0.5) * 14],
    colour: Math.floor(hash(i, 7) * colours) % colours,
    fadeAt: 0.6 + hash(i, 8) * 0.3,
    fall: 0.35 + hash(i, 9) * 0.25,
  }
}

/**
 * Offset from the burst origin at time t (seconds): the throw decays with drag while the piece drifts down at its
 * own slow, steady speed (paper falls at terminal velocity almost at once), with a small sideways flutter, so the
 * burst hangs above the summit instead of dropping like gravel.
 */
export function confettiPosition(piece: ConfettiPiece, t: number): [number, number, number] {
  const decay = (1 - Math.exp(-DRAG * t)) / DRAG
  const flutter = Math.sin(t * 6 + piece.spin[0]) * 0.04 * t
  return [
    piece.velocity[0] * decay + flutter,
    piece.velocity[1] * decay - piece.fall * t,
    piece.velocity[2] * decay + flutter,
  ]
}

/** Scale at time t: full size, then shrinking to nothing over the last part of the burst. */
export function confettiScale(piece: ConfettiPiece, t: number): number {
  const progress = t / CONFETTI_DURATION
  if (progress >= 1) return 0
  if (progress <= piece.fadeAt) return 1
  return 1 - (progress - piece.fadeAt) / (1 - piece.fadeAt)
}
