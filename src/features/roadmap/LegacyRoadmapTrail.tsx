import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { animated, useSpring } from '@react-spring/three'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { Mesh } from 'three'
import { entrySide, entryTs, milestoneTs, progressT } from '../../lib/trail'
import type { TrailGoal, TrailMilestone } from '../../lib/trail'
import { BASE_TOKENS, getBiomePalette } from '../../lib/theme'
import { buildLegacyConeCurve, perpendicularOffset, positionAt } from './curve'
import { useMilestones, useProgressEntries } from './api'
import type { ProgressEntry } from './api'
import type { Goal } from '../archipelago/api'
import { TrailMarker } from './models/TrailMarker'

// This trail renders as a sibling of Island.tsx's own `<group ref={meshRef}
// scale={ISLAND_SCALE}>` (same position/rotation, one level out — see
// ArchipelagoScene.tsx), so these are WORLD-scale numbers: the real,
// post-ISLAND_SCALE footprint of the five flat-platform biomes (4.4 * 0.447
// half-width is about 1.97, 4.4 * 0.083 height is about 0.365 - see Island.tsx's
// ISLAND_SCALE comment for the derivation). Volcano's own taller silhouette
// (about 3x its siblings' height, per VolcanoLandmass.tsx) isn't given its own
// height here - its trail apex sits a bit below its actual peak, an accepted,
// minor trade-off rather than plumbing a per-biome height through this shared
// curve builder for one biome's cosmetic difference.
const ISLAND_BASE_RADIUS = 1.97
const ISLAND_HEIGHT = 0.365
const CURVE_SAMPLE_COUNT = 100
const ENTRY_OFFSET_DISTANCE = 0.25
const NODE_RADIUS = 0.12
const MARKER_FLY_DURATION_MS = 900
const ENTRY_FLY_DURATION_MS = 700

/**
 * A milestone node that isn't done yet but is next in line pulses gently
 * (spec §6.3) — a small continuous scale oscillation, its own component so
 * the animation's useFrame subscription is scoped to just this one mesh
 * rather than fighting other nodes over a shared ref.
 */
function MilestoneNode({
  position,
  color,
  pulsing,
  reducedMotion,
  onClick,
}: {
  position: Vector3
  color: string
  pulsing: boolean
  reducedMotion: boolean
  onClick: () => void
}) {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    if (!pulsing || reducedMotion) {
      meshRef.current.scale.setScalar(1)
      return
    }
    const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.15
    meshRef.current.scale.setScalar(scale)
  })

  return (
    <mesh
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <sphereGeometry args={[NODE_RADIUS, 12, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/**
 * Spec §6.3: "On save the tag flies to its computed position on the trail."
 * Only entries not already present when this component first saw the entry
 * list animate their entrance (from the marker's position at that moment) —
 * historical entries reloaded on a fresh page load render directly at their
 * final position with no replay, since spec describes a save-time effect,
 * not a load-time one.
 */
function EntryMarker({
  finalPosition,
  flyFrom,
  entry,
  unit,
  open,
  onClick,
}: {
  finalPosition: Vector3
  flyFrom: Vector3 | null
  entry: ProgressEntry
  unit: string | null
  open: boolean
  onClick: () => void
}) {
  const [spring] = useSpring(
    () => ({
      from: { position: (flyFrom ?? finalPosition).toArray() as [number, number, number] },
      to: { position: finalPosition.toArray() as [number, number, number] },
      config: { duration: ENTRY_FLY_DURATION_MS },
    }),
    [], // animate once, on mount, never re-trigger on prop changes
  )

  return (
    // @react-spring/three types a group's position as per-axis FluidValues, not one
    // tuple-valued SpringValue — the runtime interpolates this fine either way.
    <animated.group position={spring.position as unknown as [number, number, number]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={BASE_TOKENS.mist} />
      </mesh>
      {open ? (
        <Html position={[0, 0.2, 0]} center occlude distanceFactor={8}>
          <div className="w-40 rounded-md border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
            <p className="font-display font-medium">{entry.title}</p>
            {entry.value !== null ? (
              <p className="mt-1 text-mist/60">
                {entry.value}
                {unit ? ` ${unit}` : ''}
              </p>
            ) : null}
            {entry.note ? <p className="mt-1 text-mist/40">{entry.note}</p> : null}
          </div>
        </Html>
      ) : null}
    </animated.group>
  )
}

function toTrailGoal(goal: Goal): TrailGoal {
  return {
    kind: goal.kind,
    status: goal.status,
    startValue: goal.startValue,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
  }
}

function toTrailMilestones(milestones: { targetValue: number | null; sortOrder: number; completedAt: string | null }[]): TrailMilestone[] {
  return milestones
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({ targetValue: m.targetValue, sortOrder: m.sortOrder, completedAt: m.completedAt }))
}

/**
 * A seed derived from the goal's own id so the same goal's trail always
 * spirals the same way across sessions (deterministic, matching M2's
 * archipelago_seed pattern) — not visually critical, just stable.
 */
function seedFromId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000
  }
  return (hash / 1000) * Math.PI * 2
}

// Palette colors are three.js hex numbers (see lib/theme.ts); the milestone/tube
// materials below are plain string-typed color props (matching the other literal
// color strings already on this file), so the biome's hex numbers get converted
// once here rather than mixing number/string color props across the component.
function hexToCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

/** Builds a sub-curve from a slice of the parent curve's sampled points —
 * used to render the completed and remaining tube segments separately. At
 * least 2 points are required for a valid CatmullRomCurve3; a shorter slice
 * degenerates to a single point duplicated, which three.js accepts (a
 * zero-length tube) rather than throwing. */
function subCurve(points: Vector3[], fromIndex: number, toIndex: number): CatmullRomCurve3 {
  const slice = points.slice(fromIndex, toIndex + 1)
  if (slice.length < 2) {
    const only = slice[0] ?? points[0]
    return new CatmullRomCurve3([only, only.clone()])
  }
  return new CatmullRomCurve3(slice)
}

interface LegacyRoadmapTrailProps {
  goal: Goal
}

/** The pre-terraced spiral trail for the five biomes not yet migrated; deleted in the next plan. */
export function LegacyRoadmapTrail({ goal }: LegacyRoadmapTrailProps) {
  const { data: milestones, isError: milestonesError } = useMilestones(goal.id)
  const { data: entries, isError: entriesError } = useProgressEntries(goal.id)
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null)
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  const curve = useMemo(() => buildLegacyConeCurve(ISLAND_BASE_RADIUS, ISLAND_HEIGHT, seedFromId(goal.id)), [goal.id])

  // Spec §7: each biome supplies its own trail material — the completed/remaining
  // tube and the "next milestone" pulse all read from the goal's own biome palette
  // rather than a fixed color used regardless of biome.
  const biomePalette = getBiomePalette(goal.biome)
  const trailColor = hexToCssColor(biomePalette.trail)
  const trailAccentColor = hexToCssColor(biomePalette.accent)

  const sortedMilestones = useMemo(() => (milestones ? toTrailMilestones(milestones) : []), [milestones])
  const trailGoal = useMemo(() => toTrailGoal(goal), [goal])

  const head = useMemo(
    () => (milestones ? progressT(trailGoal, sortedMilestones) : 0),
    [trailGoal, sortedMilestones, milestones],
  )

  const samplePoints = useMemo(() => curve.getSpacedPoints(CURVE_SAMPLE_COUNT), [curve])
  const headIndex = Math.round(head * CURVE_SAMPLE_COUNT)

  const completedCurve = useMemo(() => subCurve(samplePoints, 0, headIndex), [samplePoints, headIndex])
  const remainingCurve = useMemo(
    () => subCurve(samplePoints, headIndex, CURVE_SAMPLE_COUNT),
    [samplePoints, headIndex],
  )

  const nodeTs = useMemo(() => milestoneTs(sortedMilestones.length), [sortedMilestones.length])

  const entryPositions = useMemo(() => {
    if (!entries || !milestones) return []
    const trailEntries = entries.filter((e) => e.kind === 'update') // milestone-kind entries already have their own node
    const ts = entryTs(
      trailEntries.map((e) => ({ value: e.value, occurredAt: e.occurredAt })),
      trailGoal,
      sortedMilestones,
    )
    return trailEntries.map((entry, index) => {
      const t = ts[index]
      const base = positionAt(curve, t)
      const offset = perpendicularOffset(curve, t, entrySide(index), ENTRY_OFFSET_DISTANCE)
      return { position: base.clone().add(offset), entry }
    })
  }, [entries, milestones, curve, trailGoal, sortedMilestones])

  // Only an entry not already known when this component instance first saw
  // the list gets a fly-in animation (spec §6.3's "on save, the tag flies")
  // — a fresh page load must not replay every historical entry's entrance.
  const seenEntryIdsRef = useRef<Set<string> | null>(null)
  if (seenEntryIdsRef.current === null && entries) {
    seenEntryIdsRef.current = new Set(entries.map((e) => e.id))
  }

  const markerTarget = useMemo(() => positionAt(curve, head), [curve, head])
  const [markerSpring, markerApi] = useSpring(() => ({
    position: [markerTarget.x, markerTarget.y, markerTarget.z] as [number, number, number],
    config: { duration: MARKER_FLY_DURATION_MS },
  }))

  const lastHeadRef = useRef(head)
  if (lastHeadRef.current !== head) {
    lastHeadRef.current = head
    markerApi.start({ position: [markerTarget.x, markerTarget.y, markerTarget.z] })
  }

  // Spec §7: prefers-reduced-motion respected throughout — gates the "next"
  // milestone node's pulse, the trail's only continuous animation.
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // A read failure has nothing to draw; the user-visible message for it lives
  // in RoadmapPanel, which can render real DOM (this is inside the Canvas).
  if (milestonesError || entriesError) return null
  if (!milestones || !entries) return null

  return (
    <>
      <mesh>
        <tubeGeometry args={[completedCurve, 32, 0.06, 8, false]} />
        <meshStandardMaterial color={trailColor} />
      </mesh>
      <mesh>
        <tubeGeometry args={[remainingCurve, 32, 0.04, 8, false]} />
        <meshStandardMaterial color={trailColor} transparent opacity={0.5} />
      </mesh>

      {sortedMilestones.map((milestone, index) => {
        const t = nodeTs[index]
        const position = positionAt(curve, t)
        const isDone = milestone.completedAt !== null
        const isNext = !isDone && sortedMilestones.slice(0, index).every((m) => m.completedAt !== null)
        const realMilestone = milestones[index]
        // Both tokenized: lantern is the app's one reserved warm color and a
        // completed milestone is exactly the meaning-bearing moment it's for
        // (matching RoadmapPanel's "Mark done" button and celebration banner);
        // stoneLight replaces the last raw Tailwind gray literal in the scene.
        const color = isDone ? hexToCssColor(BASE_TOKENS.lantern) : isNext ? trailAccentColor : hexToCssColor(BASE_TOKENS.stoneLight)

        return (
          <group key={realMilestone.id}>
            <MilestoneNode
              position={position}
              color={color}
              pulsing={isNext}
              reducedMotion={reducedMotion}
              onClick={() => setOpenMilestoneId((current) => (current === realMilestone.id ? null : realMilestone.id))}
            />
            {openMilestoneId === realMilestone.id ? (
              <Html position={[position.x, position.y + 0.3, position.z]} center occlude distanceFactor={8}>
                <div className="w-40 rounded-md border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
                  <p className="font-display font-medium">{realMilestone.title}</p>
                  <p className="mt-1 text-mist/60">{isDone ? 'Done' : isNext ? 'Next up' : 'Not yet'}</p>
                </div>
              </Html>
            ) : null}
          </group>
        )
      })}

      {entryPositions.map(({ position, entry }) => (
        <EntryMarker
          key={entry.id}
          finalPosition={position}
          flyFrom={seenEntryIdsRef.current?.has(entry.id) ? null : markerTarget}
          entry={entry}
          unit={goal.unit}
          open={openEntryId === entry.id}
          onClick={() => setOpenEntryId((current) => (current === entry.id ? null : entry.id))}
        />
      ))}

      {/* @react-spring/three types position as per-axis FluidValues, not one tuple-valued
          SpringValue — the runtime interpolates this fine either way. */}
      <animated.group position={markerSpring.position as unknown as [number, number, number]}>
        <TrailMarker scale={0.3} />
      </animated.group>
    </>
  )
}
