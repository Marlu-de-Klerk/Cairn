# Cairn M1 — Trail Maths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `src/lib/trail.ts` — the pure functions that place milestones and progress entries along a goal's trail — fully tested, matching spec §5's Run 10K reference case (`t ≈ 0.333`) exactly.

**Architecture:** One pure-TypeScript module, no React, no three.js. Inputs are small decoupled interfaces (`TrailGoal`, `TrailMilestone`, `TrailEntry`), not the raw Supabase row types — this keeps the module framework/schema-agnostic and directly unit-testable. The "offset perpendicular to the curve tangent" requirement from spec §5 is a 3D operation that belongs in the R3F rendering layer (M2/M3, which does import three.js); this module only outputs an alternating `side: 1 | -1` sign per entry for that later code to consume.

**Tech Stack:** TypeScript (no new dependencies), Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-09-09-cairn-design.md` (§5, "Trail placement — the maths, in pure functions")

## Global Constraints

- `src/lib/` has no React, no three.js imports — pure functions only (spec §10, spec §5).
- Milestone nodes are evenly spaced, never proportional to value: `t_i = i / (n + 1)` for 1-indexed milestone `i` among `n` milestones.
- Progress entries are placed proportionally within their leg (spec §5's exact formula), clamped to the leg.
- Entries with no value, or on a `checklist`-kind goal, go at the midpoint of the currently active leg.
- Entries never sit exactly on the centreline — this module contributes only the alternating `side` sign; the actual perpendicular offset is 3D work for a later milestone.
- Reference case (must hold exactly): Run 10K — milestones at 2/5/8 of a 10 target, a "Fastest 3K" entry (`value = 3`) must produce `t ≈ 0.333`.

---

### Task 1: `src/lib/trail.ts` — types, `milestoneTs`, `legOf`

**Files:**
- Create: `src/lib/trail.ts`
- Test: `src/lib/trail.test.ts`

**Interfaces:**
- Produces: `TrailGoal`, `TrailMilestone`, `TrailEntry` (consumed by every function in this file and by Task 2); `milestoneTs(count: number): number[]`; `legOf(t: number, milestoneTs: number[]): { legIndex: number; legStart: number; legEnd: number }` (consumed by Task 2's `entryT`/`progressT`).

- [ ] **Step 1: Write the failing tests for `milestoneTs` and `legOf`**

Create `src/lib/trail.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { legOf, milestoneTs } from './trail'

describe('milestoneTs', () => {
  it('returns an empty array for zero milestones', () => {
    expect(milestoneTs(0)).toEqual([])
  })

  it('places a single milestone at the midpoint', () => {
    expect(milestoneTs(1)).toEqual([0.5])
  })

  it('spaces milestones evenly, not proportionally to value', () => {
    // Run 10K: 3 milestones -> t = 1/4, 2/4, 3/4, regardless of their values (2, 5, 8)
    expect(milestoneTs(3)).toEqual([0.25, 0.5, 0.75])
  })

  it('spaces 8 milestones (the max allowed) evenly', () => {
    const ts = milestoneTs(8)
    expect(ts).toHaveLength(8)
    expect(ts[0]).toBeCloseTo(1 / 9)
    expect(ts[7]).toBeCloseTo(8 / 9)
  })
})

describe('legOf', () => {
  it('finds the single leg when there are no milestones', () => {
    expect(legOf(0.5, [])).toEqual({ legIndex: 0, legStart: 0, legEnd: 1 })
  })

  it('finds the correct leg among several milestones', () => {
    const ts = milestoneTs(3) // [0.25, 0.5, 0.75]
    expect(legOf(0.1, ts)).toEqual({ legIndex: 0, legStart: 0, legEnd: 0.25 })
    expect(legOf(0.3, ts)).toEqual({ legIndex: 1, legStart: 0.25, legEnd: 0.5 })
    expect(legOf(0.6, ts)).toEqual({ legIndex: 2, legStart: 0.5, legEnd: 0.75 })
    expect(legOf(0.9, ts)).toEqual({ legIndex: 3, legStart: 0.75, legEnd: 1 })
  })

  it('resolves an exact boundary to the leg it starts', () => {
    const ts = milestoneTs(3)
    expect(legOf(0.25, ts)).toEqual({ legIndex: 1, legStart: 0.25, legEnd: 0.5 })
  })

  it('clamps t outside [0,1] to the first/last leg', () => {
    const ts = milestoneTs(3)
    expect(legOf(-0.5, ts)).toEqual({ legIndex: 0, legStart: 0, legEnd: 0.25 })
    expect(legOf(1.5, ts)).toEqual({ legIndex: 3, legStart: 0.75, legEnd: 1 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/trail.test.ts`
Expected: FAIL — `Failed to resolve import "./trail"` (the file doesn't exist yet).

- [ ] **Step 3: Create `src/lib/trail.ts` with types, `milestoneTs`, and `legOf`**

```ts
export interface TrailGoal {
  kind: 'numeric' | 'checklist'
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/trail.test.ts`
Expected: PASS — all `milestoneTs` and `legOf` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trail.ts src/lib/trail.test.ts
git commit -m "M1: trail maths — types, milestoneTs, legOf"
```

(Per this session's constraint, stage with `git add` and hand this commit command to the user — Claude's `git commit` is blocked.)

---

### Task 2: `entryT` and `progressT`

**Files:**
- Modify: `src/lib/trail.ts`
- Modify: `src/lib/trail.test.ts`

**Interfaces:**
- Consumes: `TrailGoal`, `TrailMilestone`, `TrailEntry`, `milestoneTs`, `legOf` (Task 1).
- Produces: `entryT(entry: TrailEntry, goal: TrailGoal, milestones: TrailMilestone[]): number`; `progressT(goal: TrailGoal, milestones: TrailMilestone[]): number`; `entrySide(index: number): 1 | -1` (the alternating-side sign, consumed by the future R3F rendering code in M2/M3 — not exercised by any three.js code here).

`milestones` passed to both functions must already be sorted by `sortOrder` ascending — sorting is the caller's job (a future data-loading hook), not this module's; document this in the code comment rather than re-sorting defensively, since re-sorting here would silently hide a caller bug.

- [ ] **Step 1: Write the failing tests for `entryT`**

Append to `src/lib/trail.test.ts`:

```ts
import { entryT, entrySide, progressT, type TrailGoal, type TrailMilestone } from './trail'

const run10k: TrailGoal = { kind: 'numeric', startValue: 0, targetValue: 10, currentValue: 0 }
const run10kMilestones: TrailMilestone[] = [
  { targetValue: 2, sortOrder: 1, completedAt: null },
  { targetValue: 5, sortOrder: 2, completedAt: null },
  { targetValue: 8, sortOrder: 3, completedAt: null },
]

describe('entryT', () => {
  it('matches the spec\'s Run 10K reference case: "Fastest 3K" lands at t ≈ 0.333', () => {
    const t = entryT({ value: 3, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBeCloseTo(0.3333, 3)
  })

  it('places a value exactly at a milestone boundary at that milestone\'s own t', () => {
    const t = entryT({ value: 5, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBeCloseTo(0.5, 5)
  })

  it('places a value in the final leg (between the last milestone and the target)', () => {
    const t = entryT({ value: 9, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    // leg [8,10] -> ts [0.75, 1]; (9-8)/(8-8... wait target 10, so (9-8)/(10-8)=0.5 -> 0.75+0.5*0.25=0.875
    expect(t).toBeCloseTo(0.875, 5)
  })

  it('clamps a value below start to the first leg\'s start', () => {
    const t = entryT({ value: -5, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBe(0)
  })

  it('clamps a value above target to the last leg\'s end', () => {
    const t = entryT({ value: 100, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBe(1)
  })

  it('places a value with zero milestones directly between start and target', () => {
    const t = entryT({ value: 5, occurredAt: '2026-01-01' }, run10k, [])
    expect(t).toBeCloseTo(0.5, 5)
  })

  it('places a no-value entry at the midpoint of the currently active leg', () => {
    const goalAtStart: TrailGoal = { kind: 'numeric', startValue: 0, targetValue: 10, currentValue: 0 }
    // progressT with no completed milestones and currentValue=0 sits at the very start of leg [0, 0.25]
    const t = entryT({ value: null, occurredAt: '2026-01-01' }, goalAtStart, run10kMilestones)
    expect(t).toBeCloseTo(0.125, 5) // midpoint of [0, 0.25]
  })

  it('places a checklist-goal entry at the midpoint of the active leg even if it carries a value', () => {
    const checklistGoal: TrailGoal = { kind: 'checklist', startValue: 0, targetValue: null, currentValue: 0 }
    const checklistMilestones: TrailMilestone[] = [
      { targetValue: null, sortOrder: 1, completedAt: null },
    ]
    const t = entryT({ value: 42, occurredAt: '2026-01-01' }, checklistGoal, checklistMilestones)
    expect(t).toBeCloseTo(0.25, 5) // midpoint of [0, 0.5]
  })
})

describe('progressT', () => {
  it('sits at the start when nothing is completed and currentValue is 0', () => {
    expect(progressT(run10k, run10kMilestones)).toBe(0)
  })

  it('nudges forward within the first leg as currentValue increases, with zero milestones', () => {
    const goal: TrailGoal = { kind: 'numeric', startValue: 0, targetValue: 10, currentValue: 5 }
    expect(progressT(goal, [])).toBeCloseTo(0.5, 5)
  })

  it('sits at a single milestone\'s t once it is completed', () => {
    const goal: TrailGoal = { kind: 'numeric', startValue: 0, targetValue: 10, currentValue: 5 }
    const milestones: TrailMilestone[] = [{ targetValue: 5, sortOrder: 1, completedAt: '2026-01-01' }]
    expect(progressT(goal, milestones)).toBe(0.5)
  })

  it('nudges forward past a completed milestone toward the next one', () => {
    // 2 km done (t=1/3), now at 3.5 km toward the 5 km milestone (t=2/3)
    const goal: TrailGoal = { kind: 'numeric', startValue: 0, targetValue: 10, currentValue: 3.5 }
    const milestones: TrailMilestone[] = [
      { targetValue: 2, sortOrder: 1, completedAt: '2026-01-01' },
      { targetValue: 5, sortOrder: 2, completedAt: null },
    ]
    const ts = milestoneTs(2) // [1/3, 2/3]
    const fraction = (3.5 - 2) / (5 - 2) // 0.5
    const expected = ts[0] + fraction * (ts[1] - ts[0])
    expect(progressT(goal, milestones)).toBeCloseTo(expected, 5)
  })

  it('does not nudge for a checklist goal — sits exactly at the last completed milestone', () => {
    const goal: TrailGoal = { kind: 'checklist', startValue: 0, targetValue: null, currentValue: 0 }
    const milestones: TrailMilestone[] = [
      { targetValue: null, sortOrder: 1, completedAt: '2026-01-01' },
      { targetValue: null, sortOrder: 2, completedAt: null },
    ]
    expect(progressT(goal, milestones)).toBe(milestoneTs(2)[0])
  })
})

describe('entrySide', () => {
  it('alternates starting with the positive side', () => {
    expect(entrySide(0)).toBe(1)
    expect(entrySide(1)).toBe(-1)
    expect(entrySide(2)).toBe(1)
    expect(entrySide(3)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/trail.test.ts`
Expected: FAIL — `entryT`, `progressT`, `entrySide` are not exported yet.

- [ ] **Step 3: Implement `entryT`, `progressT`, and `entrySide` in `src/lib/trail.ts`**

Append to `src/lib/trail.ts`:

```ts
function sortedMilestones(milestones: TrailMilestone[]): TrailMilestone[] {
  // Callers (a future data-loading hook) are expected to hand these in
  // already ordered by sort_order — re-sorting here would silently mask
  // a caller bug instead of surfacing it.
  return milestones
}

/**
 * The value boundaries of every leg, outer-bounded by the goal's own
 * start/target: [startValue, ...milestone targetValues, targetValue].
 */
function legValueBoundaries(goal: TrailGoal, milestones: TrailMilestone[]): number[] {
  return [
    goal.startValue,
    ...sortedMilestones(milestones).map((m) => m.targetValue ?? goal.startValue),
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
  const boundaries = legBoundariesForTs(ts)
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

function legBoundariesForTs(ts: number[]): number[] {
  return [0, ...ts, 1]
}

export function entryT(entry: TrailEntry, goal: TrailGoal, milestones: TrailMilestone[]): number {
  if (goal.kind === 'checklist' || entry.value === null) {
    const activeLeg = legOf(progressT(goal, milestones), milestoneTs(milestones.length))
    return (activeLeg.legStart + activeLeg.legEnd) / 2
  }

  return valueT(entry.value, goal, milestones)
}

export function progressT(goal: TrailGoal, milestones: TrailMilestone[]): number {
  const ordered = sortedMilestones(milestones)
  const ts = milestoneTs(ordered.length)

  let lastCompletedIndex = -1
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].completedAt !== null) {
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
    lastCompletedIndex >= 0 ? ordered[lastCompletedIndex].targetValue ?? goal.startValue : goal.startValue
  const legEndValue =
    lastCompletedIndex + 1 < ordered.length
      ? ordered[lastCompletedIndex + 1].targetValue ?? goal.startValue
      : goal.targetValue ?? goal.startValue

  const span = legEndValue - legStartValue
  const fraction = span === 0 ? 0 : (goal.currentValue - legStartValue) / span
  const clampedFraction = Math.max(0, Math.min(1, fraction))

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/trail.test.ts`
Expected: PASS — every `entryT`, `progressT`, and `entrySide` test green, including the Run 10K reference case at `t ≈ 0.333`.

- [ ] **Step 5: Run the full fast suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: both clean — `trail.test.ts`'s new tests plus the existing `SignInPage` tests all pass, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/trail.ts src/lib/trail.test.ts
git commit -m "M1: trail maths — entryT, progressT, entrySide"
```
