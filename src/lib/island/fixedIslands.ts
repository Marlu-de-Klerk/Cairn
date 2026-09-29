import type { Biome } from './types'

/** Jungle renders one hand-built island (public/models/JungleIsland.glb) for every goal, built on this layout seed. */
export const JUNGLE_ISLAND_SEED = 1

/** The layout seed an island uses: fixed for biomes with a hand-built island, otherwise derived from the goal. */
export function islandLayoutSeed(biome: Biome, goalSeed: number): number {
  return biome === 'jungle' ? JUNGLE_ISLAND_SEED : goalSeed
}
