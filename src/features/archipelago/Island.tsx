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
import { CompletionBurst } from './CompletionBurst'
import { endCelebration, useCelebration } from '../roadmap/celebration'
import { formatValue } from '../../lib/goalProgress'

interface IslandProps {
  goal: Goal
  onClick: () => void
  focused?: boolean
  /** DEV harness only: render this seed instead of the one derived from the goal id. */
  seedOverride?: number
  /** DEV harness only: toon/Lambert A/B (spec Q3). */
  materialKind?: LitMaterialKind
  /** Another island is focused: hide this one's label. */
  labelHidden?: boolean
}

// Palette colors are three.js hex numbers (see lib/theme.ts); the <Html> label/card
// borders are plain DOM, so the accent needs converting to a CSS hex string here.
function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

const LANTERN = '#E8A24C' // --color-lantern

function progressLabelFor(goal: Goal): string {
  if (goal.kind === 'numeric') {
    return `${formatValue(goal.currentValue, goal.unit)} / ${goal.targetValue === null ? '?' : formatValue(goal.targetValue, goal.unit)}`
  }
  return goal.status === 'completed' ? 'Complete' : 'In progress'
}

/**
 * One label per island, a fixed pixel size at any zoom (a distance-scaled label is unreadable across the archipelago
 * and fills the screen up close). Its bottom edge sits on the anchor above the summit, so it grows upward: on hover
 * it opens into a card with the full title, description and progress instead of stacking a second box over it.
 */
function Label({ goal, labelY, hovered, occlude }: { goal: Goal; labelY: number; hovered: boolean; occlude: boolean | RefObject<Object3D>[] }) {
  const accentColor = hexToCssColor(getBiomePalette(goal.biome).accent)
  const progressLabel = progressLabelFor(goal)
  return (
    <Html position={[0, labelY, 0]} occlude={occlude} style={{ pointerEvents: 'none' }}>
      <div
        data-island-label
        data-pinned={hovered}
        className={`-translate-x-1/2 -translate-y-full rounded-xl border-t-2 transition-opacity duration-150 bg-stone/90 font-body text-mist shadow-md backdrop-blur-sm ${
          hovered ? 'w-56 p-3 text-sm' : 'flex max-w-[18rem] items-baseline gap-1.5 whitespace-nowrap px-2 py-1 text-xs'
        }`}
        style={{ borderTopColor: goal.status === 'completed' ? LANTERN : accentColor }}
      >
        {hovered ? (
          <>
            <p className="font-display font-medium">{goal.title}</p>
            {goal.description ? <p className="mt-1 text-xs text-mist/60">{goal.description}</p> : null}
            <p className="mt-2 text-xs text-mist/80">{progressLabel}</p>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate font-medium">{goal.title}</span>
            {goal.status === 'completed' ? (
              <span className="shrink-0 font-medium text-lantern">✓ Complete</span>
            ) : (
              <span className="shrink-0 text-mist/70">{progressLabel}</span>
            )}
          </>
        )}
      </div>
    </Html>
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

function TerracedIslandNode({ goal, onClick, focused, seedOverride, materialKind, labelHidden = false }: IslandProps & { focused: boolean }) {
  const [hovered, setHovered] = useState(false)
  const celebration = useCelebration(goal.id)
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
      {/* The focused island's details are in the roadmap panel, so it never opens the hover card; while another
          island is focused, this one's label steps aside so only the focused island is labelled. */}
      {celebration !== null ? (
        <CompletionBurst
          key={celebration}
          y={build.layout.summitTopY + 0.3}
          colours={[LANTERN, hexToCssColor(getBiomePalette(goal.biome).accent), '#E9E6DE', '#4FA8A0', '#F4D06F']}
          onDone={() => endCelebration(celebration)}
        />
      ) : null}
      {labelHidden ? null : <Label goal={goal} labelY={anchors.labelY} hovered={hovered && !focused} occlude={occluders} />}
    </group>
  )
}

export function Island({ focused = false, ...props }: IslandProps) {
  return <TerracedIslandNode {...props} focused={focused} />
}
