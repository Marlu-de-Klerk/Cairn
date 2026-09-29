import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Object3D } from 'three'
import type { Goal } from './api'
import { getBiomePalette, hashGoalId } from '../../lib/theme'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { islandAnchors } from '../../lib/island/anchors'
import { useIslandBuild } from './terrain/islandCache'
import type { LitMaterialKind } from './terrain/materials'
import { TerracedIsland } from './TerracedIsland'
import { useHullRegistry } from './hullRegistry'
import { HighlandsLandmass } from './models/HighlandsLandmass'
import { HighlandsProps } from './models/HighlandsProps'
import { TundraLandmass } from './models/TundraLandmass'
import { TundraProps } from './models/TundraProps'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { VolcanoProps } from './models/VolcanoProps'

type LegacyBiome = Exclude<Goal['biome'], 'jungle' | 'desert' | 'reef'>

const LANDMASS_COMPONENTS: Record<LegacyBiome, typeof TundraLandmass> = {
  tundra: TundraLandmass,
  volcano: VolcanoLandmass,
  highlands: HighlandsLandmass,
}

const PROPS_COMPONENTS: Record<LegacyBiome, typeof TundraProps> = {
  tundra: TundraProps,
  volcano: VolcanoProps,
  highlands: HighlandsProps,
}

const PROP_COUNT_BY_BIOME: Record<LegacyBiome, number> = { tundra: 5, volcano: 4, highlands: 7 }

// Legacy GLTF biomes only (retired in the next plan): their Kenney platforms are authored at 0.447 half-width, so
// 4.4x restores a ~1.97 footprint, with the label, hover card and hover lift tuned to that 0.365-tall platform.
const LEGACY_SCALE = 4.4
const LEGACY_HOVER_LIFT = 0.073
const LEGACY_LABEL_Y = 0.5
const LEGACY_CARD_Y = 0.7

interface IslandProps {
  goal: Goal
  onClick: () => void
  focused?: boolean
  /** DEV harness only: render this seed instead of the one derived from the goal id. */
  seedOverride?: number
  /** DEV harness only: toon/Lambert A/B (spec Q3). */
  materialKind?: LitMaterialKind
}

// Palette colors are three.js hex numbers (see lib/theme.ts); the <Html> label/card
// borders are plain DOM, so the accent needs converting to a CSS hex string here.
function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

function progressLabelFor(goal: Goal): string {
  if (goal.kind === 'numeric') {
    const unit = goal.unit ? ` ${goal.unit}` : ''
    return `${goal.currentValue}${unit} / ${goal.targetValue ?? '?'}${unit}`
  }
  return goal.status === 'completed' ? 'Complete' : 'In progress'
}

function Labels({ goal, labelY, cardY, hovered, occlude }: { goal: Goal; labelY: number; cardY: number; hovered: boolean; occlude: boolean | RefObject<Object3D>[] }) {
  const accentColor = hexToCssColor(getBiomePalette(goal.biome).accent)
  const progressLabel = progressLabelFor(goal)
  return (
    <>
      <Html position={[0, labelY, 0]} center occlude={occlude} distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div
          className="whitespace-nowrap rounded-md border-t-2 bg-stone/90 px-2 py-1 text-xs font-body text-mist backdrop-blur-sm"
          style={{ borderTopColor: accentColor }}
        >
          {goal.title} — {progressLabel}
        </div>
      </Html>
      {hovered ? (
        <Html position={[0, cardY, 0]} center occlude={occlude} distanceFactor={12}>
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
    </>
  )
}

function useHoverLift(targetLift: number) {
  const ref = useRef<Group>(null)
  useFrame(({ invalidate }) => {
    if (!ref.current) return
    const y = ref.current.position.y
    const next = y + (targetLift - y) * 0.15
    ref.current.position.y = Math.abs(targetLift - next) < 1e-4 ? targetLift : next
    if (ref.current.position.y !== targetLift) invalidate()
  })
  return ref
}

function TerracedIslandNode({ goal, onClick, focused, seedOverride, materialKind }: IslandProps & { focused: boolean }) {
  const [hovered, setHovered] = useState(false)
  const seed = islandLayoutSeed(goal.biome, seedOverride ?? hashGoalId(goal.id))
  const build = useIslandBuild(goal.biome, seed, focused ? 'focus' : 'overview', focused ? 'high' : 'normal')
  const anchors = useMemo(() => (build ? islandAnchors(build.layout) : null), [build])
  // The lift has no purpose on the focused island: the trail renders as a sibling and doesn't lift with it.
  const liftRef = useHoverLift(hovered && !focused && anchors ? anchors.hoverLift : 0)
  const { hulls } = useHullRegistry()
  const occluders = useMemo(() => (hulls.current ?? []).map((object) => ({ current: object })), [hulls, build])

  if (!build || !anchors) return null
  return (
    <group position={[goal.islandX, 0, goal.islandZ]} rotation={[0, ISLAND_YAW, 0]}>
      <group ref={liftRef}>
        <TerracedIsland
          build={build}
          materialKind={materialKind}
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
      </group>
      <Labels goal={goal} labelY={anchors.labelY} cardY={anchors.cardY} hovered={hovered} occlude={occluders} />
    </group>
  )
}

function LegacyIslandNode({ goal, onClick, focused, seedOverride }: IslandProps & { focused: boolean }) {
  const [hovered, setHovered] = useState(false)
  const biome = goal.biome as LegacyBiome
  const liftRef = useHoverLift(hovered && !focused ? LEGACY_HOVER_LIFT : 0)
  const Landmass = LANDMASS_COMPONENTS[biome]
  const Props = PROPS_COMPONENTS[biome]
  return (
    <group position={[goal.islandX, 0, goal.islandZ]} rotation={[0, goal.islandRotation, 0]}>
      <group ref={liftRef}>
        <group scale={LEGACY_SCALE}>
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
          <Props seed={seedOverride ?? hashGoalId(goal.id)} count={PROP_COUNT_BY_BIOME[biome]} />
        </group>
      </group>
      <Labels goal={goal} labelY={LEGACY_LABEL_Y} cardY={LEGACY_CARD_Y} hovered={hovered} occlude />
    </group>
  )
}

export function Island({ focused = false, ...props }: IslandProps) {
  return isTerraced(props.goal.biome) ? <TerracedIslandNode {...props} focused={focused} /> : <LegacyIslandNode {...props} focused={focused} />
}
