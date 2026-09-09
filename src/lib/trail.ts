export interface TrailGoal {
  kind: 'numeric' | 'checklist'
  status: 'active' | 'completed' | 'archived'
  startValue: number
  targetValue: number | null
  currentValue: number
}

export interface TrailMilestone {
  targetValue: number | null
  sortOrder: number
  completedAt: string | null
}

export interface TrailEntry {
  value: number | null
  occurredAt: string
}

export interface Leg {
  legIndex: number
  legStart: number
  legEnd: number
}

/**
 * Even spacing, not proportional to value — a 2/5/8 split of a 10 km goal
 * sits at t=0.25/0.5/0.75, not t=0.2/0.5/0.8. See spec §5.
 */
export function milestoneTs(count: number): number[] {
  const ts: number[] = []
  for (let i = 1; i <= count; i++) {
    ts.push(i / (count + 1))
  }
  return ts
}

/**
 * boundaries = [0, ...milestoneTs, 1] — the leg endpoints, including the
 * implicit start (t=0) and target (t=1) legs.
 */
function legBoundaries(milestoneTs: number[]): number[] {
  return [0, ...milestoneTs, 1]
}

export function legOf(t: number, milestoneTs: number[]): Leg {
  const boundaries = legBoundaries(milestoneTs)
  const clamped = Math.max(0, Math.min(1, t))

  for (let i = 0; i < boundaries.length - 1; i++) {
    const legStart = boundaries[i]
    const legEnd = boundaries[i + 1]
    const isLastLeg = i === boundaries.length - 2
    if (clamped >= legStart && (clamped < legEnd || isLastLeg)) {
      return { legIndex: i, legStart, legEnd }
    }
  }

  // Unreachable given the clamp above, but keeps the return type total.
  const lastIndex = boundaries.length - 2
  return { legIndex: lastIndex, legStart: boundaries[lastIndex], legEnd: boundaries[lastIndex + 1] }
}

/**
 * Throws if `milestones` is not sorted by sortOrder ascending. Every
 * exported function in this module that takes `milestones` relies on this
 * precondition — callers (the data-loading layer) must sort before
 * calling in; this module never silently re-sorts on their behalf.
 */
function assertMilestonesSorted(milestones: TrailMilestone[]): void {
  for (let i = 1; i < milestones.length; i++) {
    if (milestones[i].sortOrder <= milestones[i - 1].sortOrder) {
      throw new Error('trail.ts: milestones must be sorted by sortOrder ascending before being passed in')
    }
  }
}

/**
 * The value boundaries of every leg, outer-bounded by the goal's own
 * start/target: [startValue, ...milestone targetValues, targetValue].
 */
function legValueBoundaries(goal: TrailGoal, milestones: TrailMilestone[]): number[] {
  return [
    goal.startValue,
    ...milestones.map((m) => m.targetValue ?? goal.startValue),
    goal.targetValue ?? goal.startValue,
  ]
}

/**
 * Proportional-within-leg placement for a progress entry with a real
 * numeric value (spec §5). Entries with no value, or on a checklist goal,
 * go to the midpoint of the currently active leg instead — see entryT.
 */
function valueT(value: number, goal: TrailGoal, milestones: TrailMilestone[]): number {
  const ts = milestoneTs(milestones.length)
  const boundaries = legBoundaries(ts)
  const values = legValueBoundaries(goal, milestones)

  for (let i = 0; i < values.length - 1; i++) {
    const legStartValue = values[i]
    const legEndValue = values[i + 1]
    const isLastLeg = i === values.length - 2
    if (value >= legStartValue && (value <= legEndValue || isLastLeg)) {
      const span = legEndValue - legStartValue
      const fraction = span === 0 ? 0 : (value - legStartValue) / span
      const clampedFraction = Math.max(0, Math.min(1, fraction))
      return boundaries[i] + clampedFraction * (boundaries[i + 1] - boundaries[i])
    }
  }

  // value is below every leg's start (e.g. negative) — clamp to t=0.
  return 0
}

/**
 * `milestones` must already be sorted by `sortOrder` ascending — this is
 * asserted at runtime, not silently re-sorted.
 */
export function entryT(entry: TrailEntry, goal: TrailGoal, milestones: TrailMilestone[]): number {
  assertMilestonesSorted(milestones)

  if (goal.kind === 'checklist' || entry.value === null) {
    const activeLeg = legOf(progressT(goal, milestones), milestoneTs(milestones.length))
    return (activeLeg.legStart + activeLeg.legEnd) / 2
  }

  return valueT(entry.value, goal, milestones)
}

/**
 * Batch version of entryT: returns one t per input entry, in the same
 * order as `entries`. Value-bearing numeric entries are placed
 * independently (identical to entryT). No-value/checklist entries would
 * otherwise all collide at the same "currently active leg" midpoint, so
 * instead they are ordered among themselves by `occurredAt` (spec §5) and
 * spread evenly within that shared leg — the k-th of k such entries lands
 * at legStart + (legEnd - legStart) * (j+1)/(k+1), which for k=1 reduces
 * to exactly the same midpoint entryT produces for a single entry.
 *
 * `milestones` must already be sorted by `sortOrder` ascending — this is
 * asserted at runtime, not silently re-sorted.
 */
export function entryTs(entries: TrailEntry[], goal: TrailGoal, milestones: TrailMilestone[]): number[] {
  assertMilestonesSorted(milestones)

  const activeLeg = legOf(progressT(goal, milestones), milestoneTs(milestones.length))

  const noValueEntries = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => goal.kind === 'checklist' || entry.value === null)
    .sort((a, b) => a.entry.occurredAt.localeCompare(b.entry.occurredAt))

  const k = noValueEntries.length
  const tByIndex = new Map<number, number>()
  noValueEntries.forEach(({ index }, j) => {
    tByIndex.set(index, activeLeg.legStart + ((activeLeg.legEnd - activeLeg.legStart) * (j + 1)) / (k + 1))
  })

  return entries.map((entry, index) => {
    const spreadT = tByIndex.get(index)
    return spreadT !== undefined ? spreadT : entryT(entry, goal, milestones)
  })
}

/**
 * `milestones` must already be sorted by `sortOrder` ascending — this is
 * asserted at runtime, not silently re-sorted.
 */
export function progressT(goal: TrailGoal, milestones: TrailMilestone[]): number {
  if (goal.status === 'completed') return 1

  assertMilestonesSorted(milestones)

  const ts = milestoneTs(milestones.length)

  let lastCompletedIndex = -1
  for (let i = 0; i < milestones.length; i++) {
    if (milestones[i].completedAt !== null) {
      lastCompletedIndex = i
    }
  }

  const baseT = lastCompletedIndex >= 0 ? ts[lastCompletedIndex] : 0

  if (goal.kind === 'checklist') {
    // No numeric measure to nudge by — progress sits exactly at the last
    // completed milestone (or the start, if none are completed yet).
    return baseT
  }

  const nextT = lastCompletedIndex + 1 < ts.length ? ts[lastCompletedIndex + 1] : 1
  const legStartValue =
    lastCompletedIndex >= 0 ? milestones[lastCompletedIndex].targetValue ?? goal.startValue : goal.startValue
  const legEndValue =
    lastCompletedIndex + 1 < milestones.length
      ? milestones[lastCompletedIndex + 1].targetValue ?? goal.startValue
      : goal.targetValue ?? goal.startValue

  const span = legEndValue - legStartValue
  const fraction = span === 0 ? 0 : (goal.currentValue - legStartValue) / span
  const clampedFraction = Math.max(0, Math.min(1, fraction))

  // A numeric goal whose currentValue has already reached targetValue but
  // whose milestones aren't all marked completedAt will still stall at
  // the last *completed* milestone's t (baseT), never race ahead of it —
  // by design: progress cannot outrun milestone completion. Not a bug.
  return baseT + clampedFraction * (nextT - baseT)
}

/**
 * Alternating side for offsetting a progress-entry marker off the trail's
 * centreline (spec §5). The actual perpendicular vector against the real
 * 3D curve is computed later, in the R3F rendering code (M2/M3) — this
 * function only decides which side, given the entry's position among its
 * siblings (e.g. its index within a leg, chronologically ordered).
 */
export function entrySide(index: number): 1 | -1 {
  return index % 2 === 0 ? 1 : -1
}
