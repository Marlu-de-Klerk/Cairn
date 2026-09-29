import type { Biome } from './types'

export interface HandBuiltIsland {
  /** layout seed the Blender model was built on (scripts/blender/<biome>_island.py) */
  readonly seed: number
  /** packed model under public/ (npm run island:pack) */
  readonly url: string
}

/** Biomes that render one hand-built island for every goal, built on a fixed layout seed. */
export const HAND_BUILT: Partial<Record<Biome, HandBuiltIsland>> = {
  jungle: { seed: 1, url: '/models/JungleIsland.glb' },
  // seed 10: a clean butte on the mesa, room for the oasis, camp in view
  desert: { seed: 10, url: '/models/DesertIsland.glb' },
}

/** Biomes that render a hand-built model instead of the procedural terrain and props. */
export function hasHandBuiltIsland(biome: Biome): boolean {
  return HAND_BUILT[biome] !== undefined
}

/** The layout seed an island uses: fixed for biomes with a hand-built island, otherwise derived from the goal. */
export function islandLayoutSeed(biome: Biome, goalSeed: number): number {
  return HAND_BUILT[biome]?.seed ?? goalSeed
}
