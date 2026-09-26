const GOLDEN_ANGLE = 2.39996
const BASE_RADIUS = 8
const ANGLE_JITTER_AMPLITUDE = 0.12 // radians, small relative to GOLDEN_ANGLE
const RADIUS_JITTER_AMPLITUDE = 0.4 // units, small relative to BASE_RADIUS growth

export interface IslandPosition {
  x: number
  z: number
  rotation: number
}

/**
 * Deterministic pseudo-random value in [0, 1) from two integers — the
 * classic GLSL sine-hash trick, adapted so the same (seed, index) pair
 * always produces the same jitter (spec: "jittered by archipelago_seed").
 * Exported for reuse by prop-scatter code (Task 4) — the single source of
 * this hash, per CLAUDE.md's "don't duplicate this maths" rule.
 */
export function hash01(seed: number, index: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Golden-angle spiral layout (spec §6.1): stable, non-overlapping as
 * goals are added, jittered per-account so archipelagos don't all look
 * identical. Called once, at insert time, and the result stored on the
 * goal row — never recomputed for an existing goal.
 */
export function islandPosition(index: number, archipelagoSeed: number): IslandPosition {
  const angleJitter = (hash01(archipelagoSeed, index, 1) * 2 - 1) * ANGLE_JITTER_AMPLITUDE
  const radiusJitter = (hash01(archipelagoSeed, index, 2) * 2 - 1) * RADIUS_JITTER_AMPLITUDE

  const angle = index * GOLDEN_ANGLE + angleJitter
  const radius = BASE_RADIUS * Math.sqrt(index + 1) + radiusJitter
  const rotation = hash01(archipelagoSeed, index, 3) * 2 * Math.PI

  return {
    x: radius * Math.cos(angle),
    z: radius * Math.sin(angle),
    rotation,
  }
}
