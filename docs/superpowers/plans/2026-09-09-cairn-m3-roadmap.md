# M3 — Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the island-detail "roadmap" screen — the 3D trail (from M1's maths), milestone markers, a moving trail marker, mark-done with animation, add-update with correct trail placement, and a Journey panel — so the full Run 10K walkthrough (spec §1) works end to end while the archipelago stays rendered behind it.

**Architecture:** A new `src/features/roadmap/` feature folder. A pure-ish `curve.ts` (three.js `CatmullRomCurve3`, no React) bridges M1's `t ∈ [0,1]` values to real 3D points on one island's placeholder cone, spiraling from the base (t=0) to the apex/"summit" (t=1) — a literal read of spec §1's "summit at 10". `api.ts` adds typed react-query hooks for `milestones`/`progress_entries` reads and three mutations (mark a real milestone done, mark the final target done/complete the goal, add a progress update). Two new R3F components — `RoadmapTrail` (the tube, nodes, and marker, rendered inside `ArchipelagoScene` only for the currently-focused goal) and `RoadmapPanel` (the 2D Mark Done / Add Update / Journey chrome, rendered inside `HomeOverlay` only for the currently-focused goal) — are the only two integration points into M2's existing code.

**Tech Stack:** Same as M2 — React 19 + TypeScript 5.9.3, @react-three/fiber 9.7.0 + drei 10.7.8 + three 0.185.1, @react-spring/three 10.1.2 (its first real use in this project — the marker's walk-forward animation is a genuine two-fixed-point spring, exactly what M2's CameraRig redesign reserved it for), @tanstack/react-query 5.102.8, react-router 7.18.3 (`useMatch`, following M2 final-review's fix for `ArchipelagoScene`).

**Spec:** `docs/superpowers/specs/2026-09-09-cairn-design.md` — §1 (the walkthrough this milestone must satisfy), §5 (trail maths, already built in M1), §6.3 (island detail screen), §9 (M3's own done-when).

## Global Constraints

- `src/lib/` has no React, no three.js imports — `src/lib/trail.ts` (M1) is consumed, never modified, never duplicated.
- Every Supabase table call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query. Never call `supabase.from()` directly inside a component.
- Milestones passed into any `trail.ts` function must be pre-sorted by `sortOrder` ascending — `trail.ts` asserts this at runtime and throws otherwise (M1's own precondition).
- Never render the archipelago and the detail view as two live scenes at once (spec §8) — the roadmap is additive content inside the same persistent `<Canvas>`, not a second scene.
- The trail marker is a simple object (flag/lantern), never a character model (spec §0.3).
- Respect `prefers-reduced-motion` for the one-time completion celebration (spec §6.3) — check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip the animated part (not the completion itself) when true.
- Copy rules (spec §7): sentence case, active voice, a button names what happens ("Mark 2 km done", not "Submit").
- No placeholder/character-pack assets — this milestone still uses placeholder geometry (spheres, cones, a thin tube), matching M2's "no downloaded assets yet" scope. Real biome-aware trail materials are M4's job.

---

### Task 1: Trail curve helper — `src/features/roadmap/curve.ts`

**Files:**
- Create: `src/features/roadmap/curve.ts`
- Test: `src/features/roadmap/curve.test.ts`

**Interfaces:**
- Consumes: nothing project-specific — pure three.js (`CatmullRomCurve3`, `Vector3`).
- Produces: `buildTrailCurve(baseRadius: number, height: number, seed: number): CatmullRomCurve3`, `positionAt(curve, t: number): Vector3`, `tangentAt(curve, t: number): Vector3`, `perpendicularOffset(curve, t: number, side: 1 | -1, distance: number): Vector3` — consumed by Task 4 (`RoadmapTrail`) and indirectly anywhere that needs a 3D point for a given `t`.

Island.tsx's placeholder geometry is a cone: `coneGeometry args={[2, 1.5, 8]}` — base radius 2, height 1.5, apex pointing up. The trail spirals from the base (t=0) up the cone's sloped surface to the apex (t=1) — literally the "summit" spec §1 describes, using the placeholder geometry that already exists rather than inventing new placeholder art.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/roadmap/curve.test.ts
import { describe, expect, it } from 'vitest'
import { buildTrailCurve, perpendicularOffset, positionAt, tangentAt } from './curve'

describe('buildTrailCurve', () => {
  it('starts at the base radius and ends at the apex', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const start = positionAt(curve, 0)
    const end = positionAt(curve, 1)

    // Start: near the base (large horizontal distance from the axis, low y).
    const startRadius = Math.hypot(start.x, start.z)
    expect(startRadius).toBeGreaterThan(1.5)
    expect(start.y).toBeLessThan(0.3)

    // End: the summit (near-zero horizontal distance, near full height).
    const endRadius = Math.hypot(end.x, end.z)
    expect(endRadius).toBeLessThan(0.3)
    expect(end.y).toBeGreaterThan(1.3)
  })

  it('is monotonically non-decreasing in height as t increases', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    let lastY = -Infinity
    for (let t = 0; t <= 1; t += 0.1) {
      const p = positionAt(curve, t)
      expect(p.y).toBeGreaterThanOrEqual(lastY - 0.01) // small epsilon for spline overshoot
      lastY = p.y
    }
  })

  it('produces a different rotation for a different seed (so islands look distinct)', () => {
    const curveA = positionAt(buildTrailCurve(2, 1.5, 0), 0.5)
    const curveB = positionAt(buildTrailCurve(2, 1.5, 2.4), 0.5)
    expect(curveA.x).not.toBeCloseTo(curveB.x, 1)
  })
})

describe('positionAt', () => {
  it('clamps t to [0,1]', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    expect(positionAt(curve, -0.5).equals(positionAt(curve, 0))).toBe(true)
    expect(positionAt(curve, 1.5).equals(positionAt(curve, 1))).toBe(true)
  })
})

describe('tangentAt', () => {
  it('returns a normalized vector', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const tangent = tangentAt(curve, 0.5)
    expect(tangent.length()).toBeCloseTo(1, 5)
  })
})

describe('perpendicularOffset', () => {
  it('offsets in opposite directions for opposite sides', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const left = perpendicularOffset(curve, 0.5, 1, 0.3)
    const right = perpendicularOffset(curve, 0.5, -1, 0.3)
    expect(left.x).toBeCloseTo(-right.x, 5)
    expect(left.z).toBeCloseTo(-right.z, 5)
  })

  it('scales with distance', () => {
    const curve = buildTrailCurve(2, 1.5, 0)
    const near = perpendicularOffset(curve, 0.5, 1, 0.1)
    const far = perpendicularOffset(curve, 0.5, 1, 0.5)
    expect(far.length()).toBeCloseTo(near.length() * 5, 4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- curve.test.ts`
Expected: FAIL — `curve.ts` doesn't exist yet.

- [ ] **Step 3: Implement `curve.ts`**

```ts
// src/features/roadmap/curve.ts
import { CatmullRomCurve3, Vector3 } from 'three'

const CONTROL_POINT_COUNT = 8
const SPIRAL_TURNS = 1.5
const SURFACE_CLEARANCE = 0.05 // sit just above the cone's surface, not on it

/**
 * The trail spirals from the island's base (t=0) up its sloped placeholder-cone
 * surface to the apex (t=1) — spec §1's "summit at 10", built from the same
 * cone geometry Island.tsx already renders (baseRadius/height must match its
 * coneGeometry args). `seed` rotates the spiral's starting angle so different
 * islands don't all wind the same way — pass something derived from the
 * goal's own id/seed, not a shared constant.
 */
export function buildTrailCurve(baseRadius: number, height: number, seed: number): CatmullRomCurve3 {
  const points: Vector3[] = []
  for (let i = 0; i <= CONTROL_POINT_COUNT; i++) {
    const s = i / CONTROL_POINT_COUNT
    const radiusAtS = baseRadius * (1 - s)
    const angle = seed + s * SPIRAL_TURNS * Math.PI * 2
    const y = height * s + SURFACE_CLEARANCE
    points.push(new Vector3(radiusAtS * Math.cos(angle), y, radiusAtS * Math.sin(angle)))
  }
  return new CatmullRomCurve3(points, false, 'catmullrom', 0.5)
}

/** Arc-length-parameterized point at `t` — matches trail.ts's even milestone
 * spacing with even visual spacing along the curve, clamped to [0,1]. */
export function positionAt(curve: CatmullRomCurve3, t: number): Vector3 {
  return curve.getPointAt(Math.max(0, Math.min(1, t)))
}

/** Normalized tangent at `t`, clamped away from the exact endpoints where
 * three.js's tangent estimation is least reliable. */
export function tangentAt(curve: CatmullRomCurve3, t: number): Vector3 {
  return curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize()
}

const WORLD_UP = new Vector3(0, 1, 0)

/**
 * A vector perpendicular to the curve at `t`, in the horizontal-ish plane
 * (crossed against world-up), scaled by `distance` and flipped by `side` —
 * feeds trail.ts's entrySide(index) so entries alternate sides of the trail.
 */
export function perpendicularOffset(
  curve: CatmullRomCurve3,
  t: number,
  side: 1 | -1,
  distance: number,
): Vector3 {
  const tangent = tangentAt(curve, t)
  const perpendicular = new Vector3().crossVectors(tangent, WORLD_UP).normalize()
  return perpendicular.multiplyScalar(distance * side)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- curve.test.ts`
Expected: PASS, all 7 cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/roadmap/curve.ts src/features/roadmap/curve.test.ts
```
(commit message for later: "M3: trail curve helper — bridges trail.ts's t to 3D points on the island")

---

### Task 2: Roadmap data hooks — `src/features/roadmap/api.ts`

**Files:**
- Create: `src/features/roadmap/api.ts`

**Interfaces:**
- Consumes: `supabase` client (`src/lib/supabase.ts`), the `milestones`/`progress_entries` schema (`supabase/migrations/0004_milestones_and_progress_entries.sql`).
- Produces: `Milestone`, `ProgressEntry` types; `useMilestones(goalId)`, `useProgressEntries(goalId)` queries; `useMarkMilestoneDone(goalId)`, `useCompleteGoal(goalId)`, `useAddProgressEntry(goalId)` mutations; `nextStepToMark(goal, milestones)` pure helper — all consumed by Task 4 (`RoadmapTrail`, for read data) and Task 6 (`RoadmapPanel`, for both reads and the three mutations).

The two "mark done" cases (a real milestone vs. the goal's own final target) are different enough in what they write that they're two separate mutations, unified for the caller by one pure helper that decides which applies — mirroring how `trail.ts` itself already treats "reaching t=1" as solely `goal.status === 'completed'`, never inferred from milestone completion alone.

- [ ] **Step 1: Implement `api.ts`**

```ts
// src/features/roadmap/api.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Goal } from '../archipelago/api'

export interface Milestone {
  id: string
  goalId: string
  title: string
  targetValue: number | null
  sortOrder: number
  completedAt: string | null
}

export interface ProgressEntry {
  id: string
  goalId: string
  milestoneId: string | null
  kind: 'milestone' | 'update'
  title: string
  note: string | null
  value: number | null
  occurredAt: string
}

function toMilestone(row: {
  id: string
  goal_id: string
  title: string
  target_value: number | null
  sort_order: number
  completed_at: string | null
}): Milestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    targetValue: row.target_value,
    sortOrder: row.sort_order,
    completedAt: row.completed_at,
  }
}

function toProgressEntry(row: {
  id: string
  goal_id: string
  milestone_id: string | null
  kind: string
  title: string
  note: string | null
  value: number | null
  occurred_at: string
}): ProgressEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    milestoneId: row.milestone_id,
    kind: row.kind as ProgressEntry['kind'],
    title: row.title,
    note: row.note,
    value: row.value,
    occurredAt: row.occurred_at,
  }
}

/** Always sorted by sort_order ascending — trail.ts's own precondition. */
export function useMilestones(goalId: string | undefined) {
  return useQuery({
    queryKey: ['milestones', goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestones')
        .select('id, goal_id, title, target_value, sort_order, completed_at')
        .eq('goal_id', goalId as string)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data.map(toMilestone)
    },
  })
}

export function useProgressEntries(goalId: string | undefined) {
  return useQuery({
    queryKey: ['progress-entries', goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('progress_entries')
        .select('id, goal_id, milestone_id, kind, title, note, value, occurred_at')
        .eq('goal_id', goalId as string)
        .order('occurred_at', { ascending: true })

      if (error) throw error
      return data.map(toProgressEntry)
    },
  })
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function invalidateGoalData(queryClient: ReturnType<typeof useQueryClient>, goalId: string) {
  queryClient.invalidateQueries({ queryKey: ['milestones', goalId] })
  queryClient.invalidateQueries({ queryKey: ['progress-entries', goalId] })
  queryClient.invalidateQueries({ queryKey: ['goals'] })
}

/**
 * Marks a real milestone row done: sets completed_at, inserts its
 * progress_entries row, and (for a numeric goal) bumps the goal's
 * current_value to the milestone's own target_value — matching spec §6.3
 * exactly ("Marking done ... bumps current_value"). Never flips the goal's
 * own status — reaching the final target is useCompleteGoal's job, even
 * when this happens to be the last real milestone (there is always at
 * least one more step: the final target itself).
 */
export function useMarkMilestoneDone(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (milestone: Milestone) => {
      const { error: milestoneError } = await supabase
        .from('milestones')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', milestone.id)
      if (milestoneError) throw milestoneError

      const { error: entryError } = await supabase.from('progress_entries').insert({
        goal_id: goalId,
        milestone_id: milestone.id,
        kind: 'milestone',
        title: milestone.title,
        value: milestone.targetValue,
        occurred_at: todayIsoDate(),
      })
      if (entryError) throw entryError

      if (milestone.targetValue !== null) {
        const { error: goalError } = await supabase
          .from('goals')
          .update({ current_value: milestone.targetValue })
          .eq('id', goalId)
        if (goalError) throw goalError
      }
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

/**
 * Marks the goal's own final target done: bumps current_value to
 * target_value (numeric only — a checklist goal has no numeric target to
 * bump), flips status to 'completed', stamps completed_at, and inserts a
 * progress_entries row with milestone_id null (it isn't tied to a real
 * milestone row). This is the one and only path that makes trail.ts's
 * progressT return 1 (its top-line check is `status === 'completed'`) —
 * spec §6.3's "when the final target is marked, the island celebrates".
 */
export function useCompleteGoal(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (goal: Goal) => {
      const nowIso = new Date().toISOString()
      const { error: goalError } = await supabase
        .from('goals')
        .update({
          status: 'completed',
          completed_at: nowIso,
          ...(goal.targetValue !== null ? { current_value: goal.targetValue } : {}),
        })
        .eq('id', goalId)
      if (goalError) throw goalError

      const { error: entryError } = await supabase.from('progress_entries').insert({
        goal_id: goalId,
        milestone_id: null,
        kind: 'milestone',
        title: `${goal.title} complete`,
        value: goal.targetValue,
        occurred_at: todayIsoDate(),
      })
      if (entryError) throw entryError
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

export interface AddUpdateInput {
  title: string
  value: number | null
  note: string | null
  occurredAt: string
}

/** A progress update never bumps current_value or completes anything —
 * spec §6.3 describes it purely as a compact logged note that lands on
 * the trail at its own computed position. */
export function useAddProgressEntry(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddUpdateInput) => {
      const { error } = await supabase.from('progress_entries').insert({
        goal_id: goalId,
        milestone_id: null,
        kind: 'update',
        title: input.title,
        value: input.value,
        note: input.note,
        occurred_at: input.occurredAt,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress-entries', goalId] }),
  })
}

export type NextStep =
  | { kind: 'milestone'; milestone: Milestone }
  | { kind: 'final-target' }
  | { kind: 'done' }

/**
 * Milestones must already be sorted by sortOrder ascending (same
 * precondition as trail.ts). The first uncompleted real milestone is next;
 * once every real milestone is completed, the final target itself is next
 * (see useCompleteGoal's doc comment for why that's a distinct action);
 * once the goal's own status is 'completed', there is nothing left to mark.
 */
export function nextStepToMark(goal: Goal, milestones: Milestone[]): NextStep {
  if (goal.status === 'completed') return { kind: 'done' }
  const nextMilestone = milestones.find((m) => m.completedAt === null)
  if (nextMilestone) return { kind: 'milestone', milestone: nextMilestone }
  return { kind: 'final-target' }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/roadmap/api.ts
```
(commit message for later: "M3: roadmap data hooks — milestones, progress entries, mark-done/complete/add-update mutations")

---

### Task 3: `nextStepToMark` unit tests

**Files:**
- Create: `src/features/roadmap/api.test.ts`

**Interfaces:**
- Consumes: `nextStepToMark`, `Milestone` from Task 2's `api.ts`, `Goal` from `src/features/archipelago/api.ts`.
- Produces: nothing new — pure verification of Task 2's one pure function (everything else in `api.ts` is a thin Supabase wrapper, not independently unit-testable without a live database, and is instead covered by this milestone's live smoke test in Task 9).

This is its own task, not folded into Task 2, because `nextStepToMark` is the one piece of real branching logic in `api.ts` worth a reviewer's own gate — the rest of the file is transcription of the mutation shapes spec §6.3 already dictates.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/roadmap/api.test.ts
import { describe, expect, it } from 'vitest'
import { nextStepToMark } from './api'
import type { Milestone } from './api'
import type { Goal } from '../archipelago/api'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'Run 10K',
    description: null,
    biome: 'jungle',
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: 0,
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    goalId: 'goal-1',
    title: '2 km',
    targetValue: 2,
    sortOrder: 0,
    completedAt: null,
    ...overrides,
  }
}

describe('nextStepToMark', () => {
  it('returns the first uncompleted milestone when one exists', () => {
    const milestones = [
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: '2026-08-01T00:00:00Z' }),
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: null }),
      makeMilestone({ id: 'm-3', sortOrder: 2, completedAt: null }),
    ]
    const step = nextStepToMark(makeGoal(), milestones)
    expect(step).toEqual({ kind: 'milestone', milestone: milestones[1] })
  })

  it('returns final-target once every real milestone is completed', () => {
    const milestones = [
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: '2026-08-01T00:00:00Z' }),
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: '2026-08-10T00:00:00Z' }),
    ]
    const step = nextStepToMark(makeGoal({ status: 'active' }), milestones)
    expect(step).toEqual({ kind: 'final-target' })
  })

  it('returns final-target when there are no milestones at all', () => {
    const step = nextStepToMark(makeGoal(), [])
    expect(step).toEqual({ kind: 'final-target' })
  })

  it('returns done once the goal itself is completed', () => {
    const milestones = [makeMilestone({ completedAt: '2026-08-01T00:00:00Z' })]
    const step = nextStepToMark(makeGoal({ status: 'completed' }), milestones)
    expect(step).toEqual({ kind: 'done' })
  })

  it('prefers milestone order over insertion order', () => {
    const milestones = [
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: null }),
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: null }),
    ]
    // sortOrder 0 (m-1) is earlier in the sequence even though it's second in the array —
    // the caller is responsible for passing pre-sorted milestones (same precondition as
    // trail.ts), so this test documents that nextStepToMark trusts the array order given,
    // it does not re-sort. Pass already-sorted input.
    const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder)
    const step = nextStepToMark(makeGoal(), sorted)
    expect(step).toEqual({ kind: 'milestone', milestone: sorted[0] })
    expect((step as { kind: 'milestone'; milestone: Milestone }).milestone.id).toBe('m-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail, then pass**

Run: `npm test -- api.test.ts`
Expected: FAIL first (Task 2 not yet committed in this task's isolated view — if Task 2 already landed, this may PASS immediately; if so, that's fine, move straight to verifying it's green), then PASS after Task 2's `nextStepToMark` is in place.

- [ ] **Step 3: Commit**

```bash
git add src/features/roadmap/api.test.ts
```
(commit message for later: "M3: nextStepToMark unit tests")

---

### Task 4: `RoadmapTrail` — the 3D tube, milestone nodes, and marker

**Files:**
- Create: `src/features/roadmap/RoadmapTrail.tsx`

**Interfaces:**
- Consumes: `buildTrailCurve`/`positionAt`/`perpendicularOffset` (Task 1), `useMilestones`/`useProgressEntries` (Task 2), `milestoneTs`/`progressT`/`entryTs`/`entrySide` (`src/lib/trail.ts`, M1), `Goal` (`src/features/archipelago/api.ts`, M2).
- Produces: `<RoadmapTrail goal={goal} />` — an R3F component (must be rendered inside a `<Canvas>`), consumed by Task 8 (`ArchipelagoScene`).

Placeholder-tier art, matching Island.tsx's own cone: the tube is two plain-colored `tubeGeometry` segments (completed vs. remaining), milestone nodes are small spheres, the marker is a simple two-part shape (thin cylinder + small cone on top — reads as a tiny flag/lantern, never a character). Real biome materials are M4's job.

- [ ] **Step 1: Create `src/features/roadmap/RoadmapTrail.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { animated, useSpring } from '@react-spring/three'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { Group, Mesh } from 'three'
import { entrySide, entryTs, milestoneTs, progressT } from '../../lib/trail'
import type { TrailGoal, TrailMilestone } from '../../lib/trail'
import { buildTrailCurve, perpendicularOffset, positionAt } from './curve'
import { useMilestones, useProgressEntries } from './api'
import type { Goal } from '../archipelago/api'

const ISLAND_BASE_RADIUS = 2 // must match Island.tsx's coneGeometry args[0]
const ISLAND_HEIGHT = 1.5 // must match Island.tsx's coneGeometry args[1]
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
  onClick,
}: {
  position: Vector3
  color: string
  pulsing: boolean
  onClick: () => void
}) {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!pulsing || !meshRef.current) return
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
}: {
  finalPosition: Vector3
  flyFrom: Vector3 | null
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
    <animated.group position={spring.position}>
      <mesh>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
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

interface RoadmapTrailProps {
  goal: Goal
}

export function RoadmapTrail({ goal }: RoadmapTrailProps) {
  const { data: milestones } = useMilestones(goal.id)
  const { data: entries } = useProgressEntries(goal.id)
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null)
  const markerGroupRef = useRef<Group>(null)

  const curve = useMemo(
    () => buildTrailCurve(ISLAND_BASE_RADIUS, ISLAND_HEIGHT, seedFromId(goal.id)),
    [goal.id],
  )

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

  // A gentle idle bob, respecting prefers-reduced-motion (spec §7's quality
  // floor, applied here since the marker is the one continuously-animating
  // roadmap element).
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame(({ clock }) => {
    if (reducedMotion || !markerGroupRef.current) return
    markerGroupRef.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.03
  })

  if (!milestones || !entries) return null

  return (
    <>
      <mesh>
        <tubeGeometry args={[completedCurve, 32, 0.06, 8, false]} />
        <meshStandardMaterial color="#f5d76e" />
      </mesh>
      <mesh>
        <tubeGeometry args={[remainingCurve, 32, 0.04, 8, false]} />
        <meshStandardMaterial color="#8b93a1" transparent opacity={0.5} />
      </mesh>

      {sortedMilestones.map((milestone, index) => {
        const t = nodeTs[index]
        const position = positionAt(curve, t)
        const isDone = milestone.completedAt !== null
        const isNext = !isDone && sortedMilestones.slice(0, index).every((m) => m.completedAt !== null)
        const realMilestone = milestones[index]
        const color = isDone ? '#f5d76e' : isNext ? '#7dd3fc' : '#4b5563'

        return (
          <group key={realMilestone.id}>
            <MilestoneNode
              position={position}
              color={color}
              pulsing={isNext}
              onClick={() => setOpenMilestoneId((current) => (current === realMilestone.id ? null : realMilestone.id))}
            />
            {openMilestoneId === realMilestone.id ? (
              <Html position={[position.x, position.y + 0.3, position.z]} center occlude distanceFactor={8}>
                <div className="w-40 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg">
                  <p className="font-medium">{realMilestone.title}</p>
                  <p className="mt-1 text-slate-400">{isDone ? 'Done' : isNext ? 'Next up' : 'Not yet'}</p>
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
        />
      ))}

      <animated.group ref={markerGroupRef} position={markerSpring.position}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 6]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <coneGeometry args={[0.08, 0.12, 6]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      </animated.group>
    </>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/roadmap/RoadmapTrail.tsx
```
(commit message for later: "M3: RoadmapTrail — 3D tube, milestone nodes, animated marker")

---

### Task 5: `nextStepToMark`-driven Mark Done button + celebration helper

**Files:**
- Create: `src/features/roadmap/celebrate.ts`

**Interfaces:**
- Consumes: nothing project-specific (a tiny standalone helper).
- Produces: `celebrationEnabled(): boolean` — consumed by Task 6 (`RoadmapPanel`).

Split into its own file (rather than inlined in `RoadmapPanel`) because "does the environment want reduced motion" is exactly the kind of one-line check that's easy to get subtly wrong (checking it once at module load vs. live, `matches` vs. `.matches`) and worth a single, obviously-correct, independently-named home.

- [ ] **Step 1: Implement `celebrate.ts`**

```ts
// src/features/roadmap/celebrate.ts
/**
 * Whether the one-time completion celebration (spec §6.3) should animate.
 * Checked live (not cached at module load) since a user can change their OS
 * setting without reloading the tab in some browsers, and this is cheap to
 * call right before the celebration fires.
 */
export function celebrationEnabled(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/roadmap/celebrate.ts
```
(commit message for later: "M3: prefers-reduced-motion helper for the completion celebration")

---

### Task 6: `RoadmapPanel` — Mark Done, Add Update, Journey panel (2D chrome)

**Files:**
- Create: `src/features/roadmap/RoadmapPanel.tsx`

**Interfaces:**
- Consumes: `useMilestones`/`useProgressEntries`/`useMarkMilestoneDone`/`useCompleteGoal`/`useAddProgressEntry`/`nextStepToMark` (Task 2), `celebrationEnabled` (Task 5), `Goal` (M2's `api.ts`).
- Produces: `<RoadmapPanel goal={goal} />` — a plain DOM component (NOT inside the Canvas), consumed by Task 7 (`HomeOverlay`).

Crisp 2D Tailwind panels per spec §6.3 — no 3D, no `<Html>` here (that's `RoadmapTrail`'s job for in-scene cards; this is the persistent overlay chrome, same layer `HomeOverlay`'s header already lives in).

- [ ] **Step 1: Create `src/features/roadmap/RoadmapPanel.tsx`**

```tsx
import { useState } from 'react'
import {
  nextStepToMark,
  useAddProgressEntry,
  useCompleteGoal,
  useMarkMilestoneDone,
  useMilestones,
  useProgressEntries,
} from './api'
import { celebrationEnabled } from './celebrate'
import type { Goal } from '../archipelago/api'

interface RoadmapPanelProps {
  goal: Goal
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function RoadmapPanel({ goal }: RoadmapPanelProps) {
  const { data: milestones } = useMilestones(goal.id)
  const { data: entries } = useProgressEntries(goal.id)
  const markMilestoneDone = useMarkMilestoneDone(goal.id)
  const completeGoal = useCompleteGoal(goal.id)
  const addProgressEntry = useAddProgressEntry(goal.id)

  const [journeyOpen, setJourneyOpen] = useState(false)
  const [updateFormOpen, setUpdateFormOpen] = useState(false)
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateValue, setUpdateValue] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [celebrating, setCelebrating] = useState(false)

  if (!milestones || !entries) return null

  const step = nextStepToMark(goal, milestones)

  const handleMarkDone = async () => {
    if (step.kind === 'milestone') {
      await markMilestoneDone.mutateAsync(step.milestone)
    } else if (step.kind === 'final-target') {
      await completeGoal.mutateAsync(goal)
      if (celebrationEnabled()) {
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 1600)
      }
    }
  }

  const handleAddUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!updateTitle.trim()) return
    await addProgressEntry.mutateAsync({
      title: updateTitle.trim(),
      value: updateValue.trim() === '' ? null : Number(updateValue),
      note: updateNote.trim() === '' ? null : updateNote.trim(),
      occurredAt: todayIsoDate(),
    })
    setUpdateTitle('')
    setUpdateValue('')
    setUpdateNote('')
    setUpdateFormOpen(false)
  }

  const markDoneLabel =
    step.kind === 'milestone'
      ? `Mark ${step.milestone.title} done`
      : step.kind === 'final-target'
        ? `Mark ${goal.title} complete`
        : 'Complete'

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 flex w-72 flex-col gap-2">
      {celebrating ? (
        <div className="rounded-md border border-amber-400 bg-amber-950/90 p-3 text-center text-sm text-amber-100">
          🎉 {goal.title} complete!
        </div>
      ) : null}

      <div className="rounded-md border border-slate-700 bg-slate-950/90 p-3 text-sm text-slate-100">
        <p className="font-medium">{goal.title}</p>

        {step.kind !== 'done' ? (
          <button
            type="button"
            onClick={handleMarkDone}
            disabled={markMilestoneDone.isPending || completeGoal.isPending}
            className="mt-2 w-full rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-50"
          >
            {markDoneLabel}
          </button>
        ) : (
          <p className="mt-2 text-xs text-amber-300">Complete</p>
        )}

        {updateFormOpen ? (
          <form onSubmit={handleAddUpdate} className="mt-2 flex flex-col gap-1.5">
            <input
              value={updateTitle}
              onChange={(event) => setUpdateTitle(event.target.value)}
              placeholder="What happened?"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
            {goal.kind === 'numeric' ? (
              <input
                value={updateValue}
                onChange={(event) => setUpdateValue(event.target.value)}
                placeholder={`Value (${goal.unit ?? 'optional'})`}
                type="number"
                step="any"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            ) : null}
            <textarea
              value={updateNote}
              onChange={(event) => setUpdateNote(event.target.value)}
              placeholder="Note (optional)"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              rows={2}
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={addProgressEntry.isPending || !updateTitle.trim()}
                className="flex-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-50"
              >
                Save update
              </button>
              <button
                type="button"
                onClick={() => setUpdateFormOpen(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setUpdateFormOpen(true)}
            className="mt-1.5 w-full rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
          >
            Add update
          </button>
        )}
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-950/90 text-sm text-slate-100">
        <button
          type="button"
          onClick={() => setJourneyOpen((value) => !value)}
          className="w-full px-3 py-2 text-left text-xs font-medium"
        >
          {journeyOpen ? 'Hide journey' : 'Show journey'} ({entries.length})
        </button>
        {journeyOpen ? (
          <ul className="max-h-48 overflow-y-auto border-t border-slate-800 px-3 py-2 text-xs">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-slate-800/60 py-1.5 last:border-0">
                <p className="text-slate-100">{entry.title}</p>
                <p className="text-slate-400">
                  {entry.occurredAt}
                  {entry.value !== null ? ` — ${entry.value}${goal.unit ? ` ${goal.unit}` : ''}` : ''}
                </p>
                {entry.note ? <p className="mt-0.5 text-slate-500">{entry.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/roadmap/RoadmapPanel.tsx
```
(commit message for later: "M3: RoadmapPanel — Mark Done, Add Update, Journey list")

---

### Task 7: Wire `RoadmapPanel` into `HomeOverlay`

**Files:**
- Modify: `src/features/archipelago/HomeOverlay.tsx`

**Interfaces:**
- Consumes: `RoadmapPanel` (Task 6), `useMatch` (react-router, following M2 final-review's `ArchipelagoScene` fix).
- Produces: `HomeOverlay` now renders island-specific content on `/g/:id`, fulfilling Task 7 (M2)'s own forward note ("Task 8/M3 will vary it once island-specific content exists").

`HomeOverlay` currently reads `useGoals()` for its header counts but has no notion of "which goal is focused" — add exactly that, the same way `ArchipelagoScene` already resolves it (M2 final-review's fix: `useMatch`, not `useParams`, since `HomeOverlay` is mounted the same way `ArchipelagoScene` is — read the current file first to confirm the exact current shape before editing, since this file also gained the `isError`/`showError` fix in M2's final-review fix round).

- [ ] **Step 1: Modify `HomeOverlay.tsx`**

Read the current file in full first (it already has `showCompleted`/`onToggleShowCompleted` props from M2 Task 8, and an `isError`/`showError` branch from M2's final-review fix round — this task must not regress either). Add:

```tsx
import { useMatch } from 'react-router'
import { RoadmapPanel } from '../roadmap/RoadmapPanel'
```

Inside the component body, after `const { data: goals, isLoading, isError } = useGoals()`:

```tsx
const focusedGoalId = useMatch('/g/:id')?.params.id
const focusedGoal = goals?.find((g) => g.id === focusedGoalId) ?? null
```

And in the render, change the final `<div className="flex-1">...</div>` block from:

```tsx
<div className="flex-1">
  {showError ? (
    ...
  ) : isEmpty ? (
    <EmptyArchipelago />
  ) : null}
</div>
```

to:

```tsx
<div className="pointer-events-none relative flex-1">
  {showError ? (
    ...
  ) : isEmpty ? (
    <EmptyArchipelago />
  ) : null}
  {focusedGoal ? <RoadmapPanel goal={focusedGoal} /> : null}
</div>
```

(`RoadmapPanel` positions itself `absolute bottom-4 right-4` with its own `pointer-events-auto`, so the wrapping `div` needs `relative` for that anchor to work and `pointer-events-none` so it doesn't block the archipelago when no panel is showing — matching the same pattern already used by the `header`/empty-state wrapper elsewhere in this file.)

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/HomeOverlay.tsx
```
(commit message for later: "M3: wire RoadmapPanel into HomeOverlay for the focused-goal route")

---

### Task 8: Wire `RoadmapTrail` into `ArchipelagoScene`

**Files:**
- Modify: `src/features/archipelago/ArchipelagoScene.tsx`

**Interfaces:**
- Consumes: `RoadmapTrail` (Task 4).
- Produces: the focused island now shows its trail/nodes/marker inside the same persistent Canvas.

`ArchipelagoScene` already resolves `focusedGoal` (via `useMatch`, from M2's final-review fix) and renders one `<Island>` per visible goal — add `RoadmapTrail` as a sibling of the focused goal's `<Island>`, positioned at the same island group transform (`RoadmapTrail`'s own points are already in the island's local space per Task 1/4, so it needs the identical `position`/`rotation` group wrapper `Island.tsx` uses).

- [ ] **Step 1: Modify `ArchipelagoScene.tsx`**

Read the current file first (it has `showCompleted`, `visibleGoals`, `focusedGoal` from M2's final-review fix and Task 8). Add:

```tsx
import { RoadmapTrail } from '../roadmap/RoadmapTrail'
```

In the render, alongside the existing `{visibleGoals.map(...)}` block, add (after it, still inside `<Canvas>`):

```tsx
{focusedGoal ? (
  <group position={[focusedGoal.islandX, 0, focusedGoal.islandZ]} rotation={[0, focusedGoal.islandRotation, 0]}>
    <RoadmapTrail goal={focusedGoal} />
  </group>
) : null}
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/ArchipelagoScene.tsx
```
(commit message for later: "M3: wire RoadmapTrail into ArchipelagoScene for the focused goal")

---

### Task 9: Final verification — the full Run 10K walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Automated checks**

Run: `npm run build && npm test && npm run typecheck`
Expected: all clean.

- [ ] **Step 2: Live smoke test — the exact spec §1 walkthrough**

1. Seed fresh data if needed: `npm run seed -- <your-real-email>` (Run 10K: milestones at 2/5/8 of 10, one `"Fastest 3K"` update entry already seeded at value 3 — check `scripts/seed.mjs`'s existing Run 10K fixture; it already matches this walkthrough almost exactly, so this may just be confirming existing data rather than re-seeding).
2. Run `npm run dev`, sign in, click the Run 10K island — camera flies down, URL becomes `/g/<id>`.
3. Confirm: a trail spirals from the island's base to its summit; milestone nodes appear at 2/5/8 km, evenly spaced along the trail (not proportionally) — the 2 km node should visually sit at roughly a quarter of the way up, not a fifth.
4. Confirm: the seeded "Fastest 3K" update (value 3, in the 2→5 leg) renders as a small side-marker roughly a third of the way along that leg, offset to one side of the trail centerline — matching `t ≈ 0.333` from M1's own reference case.
5. Confirm: the trail marker (flag) sits at the current head position (`progressT`), between the 2 km node and the "Fastest 3K" marker, given the seed's `current_value = 3.5`.
6. Click "Mark 5 km done" (or whatever the next real milestone's button reads). Confirm: the milestone node flips to its "done" color, the marker animates (walks) forward to the 5 km node's position, the completed portion of the tube extends to match, and a new "5 km" entry appears in the Journey panel.
7. Click "Add update", fill in a title and a value inside the current leg, save. Confirm: a new small marker appears on the trail at the correct computed position, and the entry appears in the Journey panel.
8. Press the browser back button. Confirm: the camera flies back out to the archipelago, URL returns to `/`.
9. Take a screenshot of the roadmap view for the record.

- [ ] **Step 3: Final commit for the milestone**

```bash
git add -A
```
(commit message for later: "M3: roadmap complete — trail, nodes, marker, mark-done, add-update, journey")

Per the spec's workflow rule, this is normally where work would pause for review — the project's active continuation directive (if one is in effect for this session) determines whether to proceed directly into M4 or stop here; check for that before continuing.
