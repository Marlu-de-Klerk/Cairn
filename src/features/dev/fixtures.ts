import type { Goal } from '../archipelago/api'

/** A goal at the world origin with no backend behind it, for the dev harness. `seed` only labels it; rendering uses seedOverride. */
export function devGoal(biome: Goal['biome'], seed: number): Goal {
  return {
    id: `dev-${biome}-${seed}`,
    title: `${biome[0].toUpperCase()}${biome.slice(1)} ${seed}`,
    description: null,
    biome,
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: 5.5,
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
  }
}
