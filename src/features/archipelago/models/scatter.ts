import { hash01 } from '../../../lib/archipelago'

export interface PropPlacement {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}

// Default radius bounds — for GLTF-sourced biomes (Task 4), props render as
// a sibling of <Landmass> inside Island.tsx's own `<group scale={ISLAND_SCALE}>`
// wrapper, so this radius is in the SAME small local units as the mesh's own
// already-baked-in footprint (five of the six biomes' platform half-width/
// half-depth is 0.447/0.362, unaffected by ISLAND_SCALE since that multiplier
// is applied one level further out). Using 0.362 (the tighter of the two,
// shared by five of the six biomes) as the reference keeps every biome's
// props within the platform: 20%-95% of it, matching the old ratio
// (MIN=0.4/MAX=1.9 was 20%/95% of the pre-M4 cone's local radius 2).
//
// Biomes migrated to procedural geometry (2026-09-15 visual redesign) build
// directly in real world-ready units and are NOT wrapped in ISLAND_SCALE, so
// they pass their own radiusMin/radiusMax explicitly rather than using these
// defaults — see JungleProps.tsx.
const RADIUS_MIN = 0.072
const RADIUS_MAX = 0.344

/**
 * Deterministic scatter placements for one prop type's instances within a
 * biome's Props component (Task 4, spec §8 — "seeded deterministically from
 * goal.id so an island looks the same on every visit"). `typeIndex` keeps
 * each prop type's hash stream independent of its siblings sharing the same
 * `seed` — a jungle's trees and bushes must not land on identical spots.
 * Reuses `hash01` from src/lib/archipelago.ts rather than redefining it, per
 * CLAUDE.md's "don't duplicate this maths anywhere else."
 */
export function scatterPlacements(
  seed: number,
  typeIndex: number,
  count: number,
  radiusMin: number = RADIUS_MIN,
  radiusMax: number = RADIUS_MAX,
): PropPlacement[] {
  return Array.from({ length: count }, (_, i) => {
    const index = typeIndex * 4096 + i
    const angle = hash01(seed, index, 1) * Math.PI * 2
    const radius = radiusMin + hash01(seed, index, 2) * (radiusMax - radiusMin)
    const rotationY = hash01(seed, index, 3) * Math.PI * 2
    const scale = 0.85 + hash01(seed, index, 4) * 0.3
    return {
      position: [radius * Math.cos(angle), 0, radius * Math.sin(angle)] as [number, number, number],
      rotation: [0, rotationY, 0] as [number, number, number],
      scale,
    }
  })
}

/**
 * Splits a total instance count roughly evenly across a biome's distinct
 * prop meshes — remainder goes to the earliest types so counts never drop a
 * whole prop type to zero unless `count` itself is smaller than `parts`.
 */
export function splitCount(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const remainder = total % parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Folds a prop model's own local wrapping-group offset/scale — as read off
 * the gltfjsx scaffold (e.g. JungleTree's meshes sit inside a
 * `<group position=... scale=...>`, not at the origin) — into a scatter
 * placement, so every sub-mesh of a multi-part prop can share one placement
 * array and stay visually aligned across its own `<Instances>` block. Since
 * `<Instance>` only exposes a single position/rotation/scale (no nested
 * transform gets instanced — see @react-three/drei's Instances.js, which
 * reads only the Instance's own matrixWorld), the offset must be composed
 * in here rather than rendered as a literal nested `<group>`.
 */
export function withLocalOffset(
  base: PropPlacement,
  localOffset: [number, number, number],
  localScale: number,
): PropPlacement {
  const [ox, oy, oz] = localOffset
  const angle = base.rotation[1]
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rotatedX = ox * cos + oz * sin
  const rotatedZ = -ox * sin + oz * cos
  return {
    position: [
      base.position[0] + rotatedX * base.scale,
      base.position[1] + oy * base.scale,
      base.position[2] + rotatedZ * base.scale,
    ],
    rotation: base.rotation,
    scale: base.scale * localScale,
  }
}
