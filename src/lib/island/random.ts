import { hash01 } from '../archipelago'

export interface Stream {
  next(): number
  range(min: number, max: number): number
  int(min: number, maxInclusive: number): number
  pick<T>(items: readonly T[]): T
  sign(): 1 | -1
}

/** Salted sub-stream over hash01 (spec §3.3): each subsystem draws from its own salt, so retuning one never reshuffles another. */
export function createStream(seed: number, salt: number): Stream {
  let counter = 0
  const next = () => hash01(seed, counter++, salt)
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.min(maxInclusive - min, Math.floor(next() * (maxInclusive - min + 1))),
    pick: (items) => items[Math.min(items.length - 1, Math.floor(next() * items.length))],
    sign: () => (next() < 0.5 ? 1 : -1),
  }
}

/** Smooth 2D value noise in [0, 1] on a unit lattice. */
export function valueNoise2(seed: number, salt: number): (x: number, z: number) => number {
  const lattice = (xi: number, zi: number) => hash01(seed + xi * 131, zi, salt)
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x, z) => {
    const xi = Math.floor(x)
    const zi = Math.floor(z)
    const fx = fade(x - xi)
    const fz = fade(z - zi)
    const a = lattice(xi, zi)
    const b = lattice(xi + 1, zi)
    const c = lattice(xi, zi + 1)
    const d = lattice(xi + 1, zi + 1)
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
}
