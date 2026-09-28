import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import type { Goal } from './api'
import { getBiomePalette, hashGoalId } from '../../lib/theme'
import { DesertLandmass } from './models/DesertLandmass'
import { DesertProps } from './models/DesertProps'
import { HighlandsLandmass } from './models/HighlandsLandmass'
import { HighlandsProps } from './models/HighlandsProps'
import { JungleLandmass } from './models/JungleLandmass'
import { JungleProps } from './models/JungleProps'
import { ReefLandmass } from './models/ReefLandmass'
import { ReefProps } from './models/ReefProps'
import { TundraLandmass } from './models/TundraLandmass'
import { TundraProps } from './models/TundraProps'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { VolcanoProps } from './models/VolcanoProps'

const LANDMASS_COMPONENTS: Record<Goal['biome'], typeof JungleLandmass> = {
  jungle: JungleLandmass,
  desert: DesertLandmass,
  tundra: TundraLandmass,
  volcano: VolcanoLandmass,
  reef: ReefLandmass,
  highlands: HighlandsLandmass,
}

const PROPS_COMPONENTS: Record<Goal['biome'], typeof JungleProps> = {
  jungle: JungleProps,
  desert: DesertProps,
  tundra: TundraProps,
  volcano: VolcanoProps,
  reef: ReefProps,
  highlands: HighlandsProps,
}

const PROP_COUNT_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 14,
  desert: 6,
  tundra: 5,
  volcano: 4,
  reef: 8,
  highlands: 7,
}

interface IslandProps {
  goal: Goal
  onClick: () => void
  focused?: boolean
  /** DEV harness only: render this seed instead of the one derived from the goal id. */
  seedOverride?: number
}

// Palette colors are three.js hex numbers (see lib/theme.ts); the <Html> label/card
// borders are plain DOM, so the accent needs converting to a CSS hex string here.
function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

// Kenney's real platform meshes (Task 5) come in at a tiny native scale. Five of
// the six biomes' landmass are a ~0.9x0.72x0.083-unit sliver at their raw inner
// group scale of 0.447 (see *Landmass.tsx). This uniform group-level scale restores
// the footprint the rest of the scene was originally tuned against, back when
// Island.tsx rendered a placeholder `coneGeometry args={[2, 1.5, 8]}`: 4.4 * 0.447
// half-width is about 1.97 (about the old cone's radius 2), and 4.4 * 0.083 height
// is about 0.365 for the five flat-platform biomes. If this number ever changes,
// RoadmapTrail.tsx's ISLAND_BASE_RADIUS/ISLAND_HEIGHT, scatter.ts's
// RADIUS_MIN/RADIUS_MAX, the hover-lift target below, the <Html> y-offsets below,
// and CameraRig.tsx's ISLAND_APPROACH_DISTANCE all need to be recomputed from it
// too. None of them import this constant; each one hardcodes its own
// already-derived value, matching this file's pre-existing convention of
// hardcoded numbers tied to the geometry.
//
// Jungle is the first biome migrated to procedural geometry (2026-09-15 visual
// redesign, see the spec) — it's authored directly in real, world-ready units
// inside JungleLandmass.tsx/JungleProps.tsx, so it renders unscaled. The other
// five stay on the GLTF-era 4.4x multiplier until they're migrated too.
const ISLAND_SCALE_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 1,
  desert: 4.4,
  tundra: 4.4,
  volcano: 4.4,
  reef: 4.4,
  highlands: 4.4,
}

// 20% of the scaled island's own height, matching the pre-M4 cone's hover-lift
// ratio (0.3 was 20% of the old cone's 1.5 height). Jungle's own rock rises to
// roughly 1.97 above the water (see JungleLandmass.tsx's constants) — 20% of
// that is ~0.39. The other five still use the 0.365-height-derived value.
const HOVER_LIFT_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 0.39,
  desert: 0.073,
  tundra: 0.073,
  volcano: 0.073,
  reef: 0.073,
  highlands: 0.073,
}

// The old label/card y-offsets (2.2, 3) were measured from the old cone's own
// apex (0.75 above the Island group's origin): label sat 1.45 above the apex,
// the hover card 2.25 above it. Scaling those two gaps by the new-to-old height
// ratio (0.365 / 1.5) and adding the new five-biome top surface (0.145, from
// the comment above) gives label ~0.50 and card ~0.69 for the five untouched
// biomes. Jungle's rock top sits at roughly 1.92 above the water — the same
// 1.45/2.25 gaps placed above that give jungle's own label/card values below.
const LABEL_Y_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 2.2,
  desert: 0.5,
  tundra: 0.5,
  volcano: 0.5,
  reef: 0.5,
  highlands: 0.5,
}
const CARD_Y_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 2.4,
  desert: 0.7,
  tundra: 0.7,
  volcano: 0.7,
  reef: 0.7,
  highlands: 0.7,
}

export function Island({ goal, onClick, focused = false, seedOverride }: IslandProps) {
  const meshRef = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (!meshRef.current) return
    // The hover lift has no purpose once this is the focused island — RoadmapTrail
    // renders as a sibling at the same coordinates and doesn't lift with it, so
    // raising the landmass here would swallow the whole trail inside it.
    const targetY = hovered && !focused ? HOVER_LIFT_BY_BIOME[goal.biome] : 0
    meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.15
  })

  const progressLabel =
    goal.kind === 'numeric'
      ? `${goal.currentValue}${goal.unit ? ` ${goal.unit}` : ''} / ${goal.targetValue ?? '?'}${goal.unit ? ` ${goal.unit}` : ''}`
      : goal.status === 'completed'
        ? 'Complete'
        : 'In progress'

  const Landmass = LANDMASS_COMPONENTS[goal.biome]
  const Props = PROPS_COMPONENTS[goal.biome]
  const accentColor = hexToCssColor(getBiomePalette(goal.biome).accent)

  return (
    <group position={[goal.islandX, 0, goal.islandZ]} rotation={[0, goal.islandRotation, 0]}>
      <group ref={meshRef} scale={ISLAND_SCALE_BY_BIOME[goal.biome]}>
        <Landmass
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        />
        <Props seed={seedOverride ?? hashGoalId(goal.id)} count={PROP_COUNT_BY_BIOME[goal.biome]} />
      </group>

      <Html position={[0, LABEL_Y_BY_BIOME[goal.biome], 0]} center occlude distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div
          className="whitespace-nowrap rounded-md border-t-2 bg-stone/90 px-2 py-1 text-xs font-body text-mist backdrop-blur-sm"
          style={{ borderTopColor: accentColor }}
        >
          {goal.title} — {progressLabel}
        </div>
      </Html>

      {hovered ? (
        <Html position={[0, CARD_Y_BY_BIOME[goal.biome], 0]} center occlude distanceFactor={12}>
          <div
            className="w-48 rounded-md border border-t-2 border-stone-light bg-stone/90 p-3 text-sm font-body text-mist shadow-lg backdrop-blur-sm"
            style={{ borderTopColor: accentColor }}
          >
            <p className="font-display font-medium">{goal.title}</p>
            {goal.description ? <p className="mt-1 text-xs text-mist/60">{goal.description}</p> : null}
            <p className="mt-2 text-xs text-mist/80">{progressLabel}</p>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
