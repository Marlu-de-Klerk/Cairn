import type { Goal } from '../features/archipelago/api'

export interface BiomePalette {
  landmass: number
  landmassShadow: number
  trail: number
  accent: number
}

// Six distinct palettes that still read as one world — spec §7. Kept as hex
// numbers (not CSS strings) because every consumer feeds a three.js
// material color, never a Tailwind class.
export const BIOME_PALETTES: Record<Goal['biome'], BiomePalette> = {
  jungle: { landmass: 0x1f4d2e, landmassShadow: 0x16331f, trail: 0x2d5016, accent: 0xe2483f },
  desert: { landmass: 0xd9b779, landmassShadow: 0xc9a15f, trail: 0xc9a66b, accent: 0x7a5a8c },
  tundra: { landmass: 0xdde8ee, landmassShadow: 0xb9cdd6, trail: 0xdbe9f4, accent: 0xe8a24c },
  volcano: { landmass: 0x2b2b2e, landmassShadow: 0x1a1a1c, trail: 0x3b3b3b, accent: 0xd9633b },
  reef: { landmass: 0x2ec4b6, landmassShadow: 0x1f8a80, trail: 0x2ec4b6, accent: 0xff8b6b },
  highlands: { landmass: 0x6b7280, landmassShadow: 0x4d525c, trail: 0x6b7280, accent: 0x8b7d9b },
}

export function getBiomePalette(biome: Goal['biome']): BiomePalette {
  return BIOME_PALETTES[biome]
}

/**
 * Deterministic numeric hash of a goal's UUID, for seeding prop-scatter
 * placement (Task 4) — a goal's island must look the same on every visit,
 * so the seed can't be `Math.random()` or the id string itself (hash01
 * needs a number). Same djb2-style hash shape as RoadmapTrail's local
 * `seedFromId`, generalized here since prop scatter needs a plain number
 * seed too, not a radians value.
 */
export function hashGoalId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000000
  }
  return hash
}

// The base app tokens (spec §7's "waypoint chrome") as hex numbers, for the
// rare case 3D code needs one (e.g. the lantern-colored marker glow) —
// 2D CSS reads the same values via the @theme block in index.css instead.
export const BASE_TOKENS = {
  ink: 0x12181f,
  stone: 0x232b34,
  stoneLight: 0x313c47,
  mist: 0xe9e6de,
  lantern: 0xe8a24c,
  tide: 0x4fa8a0,
} as const
