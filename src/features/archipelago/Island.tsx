import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Object3D } from 'three'
import type { Goal } from './api'
import { getBiomePalette, hashGoalId } from '../../lib/theme'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { islandAnchors } from '../../lib/island/anchors'
import { useIslandBuild } from './terrain/islandCache'
import type { LitMaterialKind } from './terrain/materials'
import { TerracedIsland } from './TerracedIsland'
import { useHullRegistry } from './hullRegistry'

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
  // A tap has no pointer-out to end the hover, so a focus change always clears it.
  useEffect(() => setHovered(false), [focused])
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
            // Hover is a mouse affordance: on touch it would only stick after the tap.
            if (event.pointerType !== 'touch') setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        />
      </group>
      {/* The focused island's details are in the roadmap panel, so it never shows the hover card over its label. */}
      <Labels goal={goal} labelY={anchors.labelY} cardY={anchors.cardY} hovered={hovered && !focused} occlude={occluders} />
    </group>
  )
}

export function Island({ focused = false, ...props }: IslandProps) {
  return <TerracedIslandNode {...props} focused={focused} />
}
