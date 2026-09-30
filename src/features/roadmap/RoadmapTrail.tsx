import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useSpring } from '@react-spring/three'
import type { Group } from 'three'
import { entrySide, entryTs, milestoneTs, progressT } from '../../lib/trail'
import type { TrailGoal, TrailMilestone } from '../../lib/trail'
import { hashGoalId } from '../../lib/theme'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'
import { SHARED_PALETTE } from '../../lib/island/biomes'
import type { IslandLayout } from '../../lib/island/types'
import type { Goal } from '../archipelago/api'
import { getIslandLayout } from '../archipelago/terrain/islandCache'
import { useMilestones, useProgressEntries } from './api'
import type { Milestone, ProgressEntry } from './api'
import { TRAIL_CLEARANCE, buildTrailCurve, buildTrailRibbon, groundedOffset, positionAt } from './curve'
import { MilestoneCairn } from './MilestoneCairn'
import type { CairnState } from './MilestoneCairn'
import { TrailPennant } from './TrailPennant'

const ENTRY_OFFSET_DISTANCE = 0.25
const ENTRY_RADIUS = 0.05
const DONE_HALF_WIDTH = 0.055
const TODO_HALF_WIDTH = 0.04
const MARKER_FLY_DURATION_MS = 900
const ENTRY_FLY_DURATION_MS = 700

function toTrailGoal(goal: Goal): TrailGoal {
  return { kind: goal.kind, status: goal.status, startValue: goal.startValue, targetValue: goal.targetValue, currentValue: goal.currentValue }
}

function toTrailMilestones(milestones: readonly Milestone[]): TrailMilestone[] {
  return milestones
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({ targetValue: m.targetValue, sortOrder: m.sortOrder, completedAt: m.completedAt }))
}

export interface TrailViewProps {
  readonly goal: Goal
  readonly layout: IslandLayout
  readonly milestones: Milestone[]
  readonly entries: ProgressEntry[]
}

/** Data container: hooks and the layout lookup. */
export function RoadmapTrail({ goal, seedOverride }: { goal: Goal; seedOverride?: number }) {
  const { data: milestones, isError: milestonesError } = useMilestones(goal.id)
  const { data: entries, isError: entriesError } = useProgressEntries(goal.id)
  const layout = useMemo(() => getIslandLayout(goal.biome, islandLayoutSeed(goal.biome, seedOverride ?? hashGoalId(goal.id))), [goal.biome, goal.id, seedOverride])
  // A read failure has nothing to draw; the user-visible message lives in RoadmapPanel.
  if (milestonesError || entriesError || !milestones || !entries) return null
  return <TrailView goal={goal} layout={layout} milestones={milestones} entries={entries} />
}

/** Presentational (spec §4.2), so the dev harness can render it with fixture data. */
export function TrailView({ goal, layout, milestones, entries }: TrailViewProps) {
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null)
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)
  const curve = useMemo(() => buildTrailCurve(layout.trail.waypoints), [layout])
  const trailGoal = useMemo(() => toTrailGoal(goal), [goal])
  const sorted = useMemo(() => toTrailMilestones(milestones), [milestones])
  const head = useMemo(() => progressT(trailGoal, sorted), [trailGoal, sorted])
  const done = useMemo(() => buildTrailRibbon(curve, layout, 0, head, DONE_HALF_WIDTH), [curve, layout, head])
  const todo = useMemo(() => buildTrailRibbon(curve, layout, head, 1, TODO_HALF_WIDTH), [curve, layout, head])
  const nodeTs = useMemo(() => milestoneTs(sorted.length), [sorted.length])
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const entryMarkers = useMemo(() => {
    const updates = entries.filter((e) => e.kind === 'update')
    const ts = entryTs(updates.map((e) => ({ value: e.value, occurredAt: e.occurredAt })), trailGoal, sorted)
    return updates.map((entry, i) => ({ entry, t: ts[i], position: groundedOffset(curve, layout, ts[i], entrySide(i), ENTRY_OFFSET_DISTANCE, ENTRY_RADIUS).position }))
  }, [entries, trailGoal, sorted, curve, layout])

  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(entries.map((e) => e.id))

  const pennant = useRef<Group>(null)
  const [{ t }] = useSpring(() => ({ t: head, config: { duration: MARKER_FLY_DURATION_MS } }), [head])
  // The pennant walks the curve, so it climbs the ramps rather than cutting through cliffs; nothing else writes it.
  useFrame(({ invalidate }) => {
    if (!pennant.current) return
    const p = positionAt(curve, t.get())
    pennant.current.position.set(p.x, p.y - TRAIL_CLEARANCE, p.z)
    if (t.isAnimating) invalidate()
  })

  return (
    <>
      <mesh geometry={done} raycast={() => null}>
        <meshBasicMaterial color={SHARED_PALETTE.trailDone} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh geometry={todo} raycast={() => null}>
        <meshBasicMaterial color={SHARED_PALETTE.trailDone} transparent opacity={0.3} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>

      {milestones.map((milestone, index) => {
        const p = positionAt(curve, nodeTs[index])
        const y = layout.groundHeightAt(p.x, p.z)
        const isDone = milestone.completedAt !== null
        const isNext = !isDone && milestones.slice(0, index).every((m) => m.completedAt !== null)
        const state: CairnState = isDone ? 'done' : isNext ? 'next' : 'pending'
        return (
          <group key={milestone.id}>
            <MilestoneCairn
              position={[p.x, y, p.z]}
              state={state}
              reducedMotion={reducedMotion}
              onClick={() => setOpenMilestoneId((current) => (current === milestone.id ? null : milestone.id))}
            />
            {openMilestoneId === milestone.id ? (
              <Html position={[p.x, y + 0.35, p.z]} center distanceFactor={8}>
                <div className="w-40 rounded-2xl border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
                  <p className="font-display font-medium">{milestone.title}</p>
                  <p className="mt-1 text-mist/60">{isDone ? 'Done' : isNext ? 'Next up' : 'Not yet'}</p>
                </div>
              </Html>
            ) : null}
          </group>
        )
      })}

      {entryMarkers.map(({ entry, position }) => (
        <EntryMarker
          key={entry.id}
          entry={entry}
          unit={goal.unit}
          target={[position.x, position.y + ENTRY_RADIUS, position.z]}
          flyFrom={seen.current?.has(entry.id) ? null : positionAt(curve, head).toArray()}
          open={openEntryId === entry.id}
          onClick={() => setOpenEntryId((current) => (current === entry.id ? null : entry.id))}
        />
      ))}

      <group ref={pennant}>
        <TrailPennant />
      </group>
    </>
  )
}

/** Only entries saved during this visit fly in from the head marker; historical ones render in place (spec §6.3). */
function EntryMarker({ entry, unit, target, flyFrom, open, onClick }: {
  entry: ProgressEntry
  unit: string | null
  target: [number, number, number]
  flyFrom: number[] | null
  open: boolean
  onClick: () => void
}) {
  const ref = useRef<Group>(null)
  const [{ u }] = useSpring(() => ({ from: { u: flyFrom ? 0 : 1 }, to: { u: 1 }, config: { duration: ENTRY_FLY_DURATION_MS } }), [])
  useFrame(({ invalidate }) => {
    if (!ref.current) return
    const k = u.get()
    const from = flyFrom ?? target
    ref.current.position.set(from[0] + (target[0] - from[0]) * k, from[1] + (target[1] - from[1]) * k, from[2] + (target[2] - from[2]) * k)
    if (u.isAnimating) invalidate()
  })
  return (
    <group ref={ref}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[ENTRY_RADIUS, 8, 8]} />
        <meshBasicMaterial color={SHARED_PALETTE.entry} />
      </mesh>
      {open ? (
        <Html position={[0, 0.2, 0]} center distanceFactor={8}>
          <div className="w-40 rounded-2xl border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
            <p className="font-display font-medium">{entry.title}</p>
            {entry.value !== null ? <p className="mt-1 text-mist/60">{entry.value}{unit ? ` ${unit}` : ''}</p> : null}
            {entry.note ? <p className="mt-1 text-mist/40">{entry.note}</p> : null}
          </div>
        </Html>
      ) : null}
    </group>
  )
}
