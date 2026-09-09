# Cairn M2 — Archipelago Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home screen becomes a real, persistent R3F archipelago — goals render as islands at stable, seeded positions read live from Supabase, the camera auto-orbits until touched, and clicking an island flies the camera to it with the URL (`/g/:id`) and back button in sync.

**Architecture:** One `<Canvas>` mounts once in `App.tsx`, alongside the router, and stays mounted across `/` and `/g/:id` — per spec §8 ("one scene, one camera, two camera states") and §6.3 (the archipelago "stays rendered behind" the island view, no page transition). The router only changes the URL; `ArchipelagoScene` reads the current route via `useParams` and drives a hand-rolled camera rig between an auto-orbiting idle state and a react-spring-animated fly-to-island state. Islands read their position directly from the goal row's stored `island_x`/`island_z`/`island_rotation` — never recomputed client-side; the golden-angle spiral formula is a pure function used only at insert time (this plan's seed script now, the New Goal flow in M4 later). No Zustand store yet — nothing needs state shared across components beyond what the URL and local component state already carry.

**Tech Stack:** @react-three/fiber 9.7.0, @react-three/drei 10.7.8, @react-spring/three 10.1.2, three 0.185.1 (all already installed, M0). @supabase/supabase-js, @tanstack/react-query (already installed). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-cairn-design.md` §6.1 (Home), §6.1's spiral formula, §8 (one-scene rule), §10 (seed script)

## Global Constraints

- `src/lib/` has no React, no three.js imports — pure functions only. `src/lib/archipelago.ts` (this plan's new pure function) must be importable and testable with zero framework imports.
- Every Supabase **table** call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query — never `supabase.from()` inside a component.
- Copy: sentence case, active voice, buttons name what happens.
- `island_x`/`island_z`/`island_rotation` are computed once at insert time and stored — never recomputed for an existing goal. This plan's `islandPosition()` function is called only by the seed script (Task 2); the rendering code (Task 6) reads the stored columns directly.
- The New Goal flow does not exist yet (spec assigns it to M4) — the "New goal" button and "Explore" link in the overlay chrome are visible but inert/disabled in this milestone, not full flows.
- `goals.biome`/`goals.kind`/`goals.status` are typed as plain `string` in the generated `Database` type (CHECK-constrained at the DB level, not a Postgres enum) — narrow with a cast at the one point each is consumed, don't thread `string` through component props.
- This session's git-commit hook blocks `git commit` for Claude — every task ends with a commit step; stage with `git add` and hand the command to the user.

---

### Task 1: `src/lib/archipelago.ts` — the spiral layout, as a tested pure function

**Files:**
- Create: `src/lib/archipelago.ts`
- Test: `src/lib/archipelago.test.ts`

**Interfaces:**
- Produces: `islandPosition(index: number, archipelagoSeed: number): { x: number; z: number; rotation: number }`, consumed by Task 2's seed script (and, later, M4's New Goal flow — not by this plan's rendering code).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/archipelago.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { islandPosition } from './archipelago'

describe('islandPosition', () => {
  it('is deterministic — same index and seed always produce the same position', () => {
    const a = islandPosition(3, 12345)
    const b = islandPosition(3, 12345)
    expect(a).toEqual(b)
  })

  it('produces a different position for a different seed', () => {
    const a = islandPosition(3, 1)
    const b = islandPosition(3, 2)
    expect(a.x).not.toBeCloseTo(b.x, 5)
  })

  it('follows the golden-angle spiral: radius grows with index, roughly as 8*sqrt(i+1)', () => {
    const seed = 42
    for (let i = 0; i < 5; i++) {
      const { x, z } = islandPosition(i, seed)
      const radius = Math.sqrt(x * x + z * z)
      const expectedRadius = 8 * Math.sqrt(i + 1)
      // jitter is small relative to the radius at every index used here
      expect(radius).toBeGreaterThan(expectedRadius - 1)
      expect(radius).toBeLessThan(expectedRadius + 1)
    }
  })

  it('never places two of the first 20 islands closer than their combined footprint (radius ~2 each, Task 4)', () => {
    // Sanity-checked numerically across several seeds: this formula's actual
    // minimum separation among the first 20 islands is ~9.7-11.5 units, far
    // above the ~4 units two radius-2 cones need to not visually intersect.
    // Assert the real safety margin, not a trivially-true lower bound.
    for (const seed of [1, 7, 42, 99]) {
      const positions = Array.from({ length: 20 }, (_, i) => islandPosition(i, seed))
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dz = positions[i].z - positions[j].z
          const distance = Math.sqrt(dx * dx + dz * dz)
          expect(distance).toBeGreaterThan(4)
        }
      }
    }
  })

  it('returns a rotation in [0, 2*PI)', () => {
    for (let i = 0; i < 10; i++) {
      const { rotation } = islandPosition(i, 99)
      expect(rotation).toBeGreaterThanOrEqual(0)
      expect(rotation).toBeLessThan(2 * Math.PI)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/archipelago.test.ts`
Expected: FAIL — `Failed to resolve import "./archipelago"`.

- [ ] **Step 3: Create `src/lib/archipelago.ts`**

```ts
const GOLDEN_ANGLE = 2.39996
const BASE_RADIUS = 8
const ANGLE_JITTER_AMPLITUDE = 0.12 // radians, small relative to GOLDEN_ANGLE
const RADIUS_JITTER_AMPLITUDE = 0.4 // units, small relative to BASE_RADIUS growth

export interface IslandPosition {
  x: number
  z: number
  rotation: number
}

/**
 * Deterministic pseudo-random value in [0, 1) from two integers — the
 * classic GLSL sine-hash trick, adapted so the same (seed, index) pair
 * always produces the same jitter (spec: "jittered by archipelago_seed").
 */
function hash01(seed: number, index: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Golden-angle spiral layout (spec §6.1): stable, non-overlapping as
 * goals are added, jittered per-account so archipelagos don't all look
 * identical. Called once, at insert time, and the result stored on the
 * goal row — never recomputed for an existing goal.
 */
export function islandPosition(index: number, archipelagoSeed: number): IslandPosition {
  const angleJitter = (hash01(archipelagoSeed, index, 1) * 2 - 1) * ANGLE_JITTER_AMPLITUDE
  const radiusJitter = (hash01(archipelagoSeed, index, 2) * 2 - 1) * RADIUS_JITTER_AMPLITUDE

  const angle = index * GOLDEN_ANGLE + angleJitter
  const radius = BASE_RADIUS * Math.sqrt(index + 1) + radiusJitter
  const rotation = hash01(archipelagoSeed, index, 3) * 2 * Math.PI

  return {
    x: radius * Math.cos(angle),
    z: radius * Math.sin(angle),
    rotation,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/archipelago.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/archipelago.ts src/lib/archipelago.test.ts
git commit -m "M2: golden-angle spiral layout — islandPosition"
```

---

### Task 2: Seed script

**Files:**
- Create: `scripts/seed.mjs`
- Modify: `package.json` (add `seed` script)

**Interfaces:**
- Consumes: `islandPosition` (Task 1); `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (`.env`, already present from M0).
- Produces: a real, idempotent demo account with 3 goals across 3 biomes, at different progress, for manual testing of every later task in this plan.

**⚠ Needs no new user input** — `.env` already has everything needed (`SUPABASE_SERVICE_ROLE_KEY` from M0).

- [ ] **Step 1: Create `scripts/seed.mjs`**

```js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const DEMO_EMAIL = 'demo@cairn.local'
const DEMO_PASSWORD = 'CairnDemo123!'
const DEMO_SEED = 20260101 // fixed, so the demo archipelago's layout never changes between runs

// Golden-angle spiral, duplicated here in spirit only (see src/lib/archipelago.ts) —
// this script is plain Node/ESM with no build step, so it re-implements the same
// formula rather than importing TS. Keep the two in sync if the formula ever changes.
const GOLDEN_ANGLE = 2.39996
const BASE_RADIUS = 8
const ANGLE_JITTER_AMPLITUDE = 0.12
const RADIUS_JITTER_AMPLITUDE = 0.4

function hash01(seed, index, salt) {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453
  return x - Math.floor(x)
}

function islandPosition(index, seed) {
  const angleJitter = (hash01(seed, index, 1) * 2 - 1) * ANGLE_JITTER_AMPLITUDE
  const radiusJitter = (hash01(seed, index, 2) * 2 - 1) * RADIUS_JITTER_AMPLITUDE
  const angle = index * GOLDEN_ANGLE + angleJitter
  const radius = BASE_RADIUS * Math.sqrt(index + 1) + radiusJitter
  const rotation = hash01(seed, index, 3) * 2 * Math.PI
  return { x: radius * Math.cos(angle), z: radius * Math.sin(angle), rotation }
}

async function findOrCreateUser(email) {
  // Admin listUsers has no filter-by-email; page through (this project has
  // a handful of users at most for the foreseeable future) rather than add
  // a second SDK call shape just for this lookup.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError
  const found = existing.users.find((u) => u.email === email)
  if (found) return found.id

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (createError) throw createError
  return created.user.id
}

async function main() {
  // Defaults to the fixed demo account (spec §10). The app has no password
  // sign-in UI (magic link + Google only), so a script-created demo account
  // can't actually be signed into through the app — pass a real email
  // you can already sign into (`npm run seed -- you@example.com`) to seed
  // that account instead, for live manual verification.
  const targetEmail = process.argv[2] ?? DEMO_EMAIL
  const userId = await findOrCreateUser(targetEmail)
  console.log(
    targetEmail === DEMO_EMAIL
      ? `Demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (id ${userId}) — no password sign-in UI exists, so this account is for data/API inspection only, not browser sign-in.`
      : `Seeded into existing account: ${targetEmail} (id ${userId})`,
  )

  // The new-user trigger (migration 0002) already created a profiles row.
  // Overwrite its archipelago_seed with our fixed value so the layout is stable.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ archipelago_seed: DEMO_SEED })
    .eq('id', userId)
  if (profileError) throw profileError

  // Idempotent: wipe this demo user's existing goals (cascades to
  // milestones/progress_entries/cheers) before re-seeding, so re-running
  // this script always produces the same clean state.
  const { error: deleteError } = await admin.from('goals').delete().eq('user_id', userId)
  if (deleteError) throw deleteError

  const goalsToSeed = [
    {
      title: 'Run 10K',
      description: 'Couch to 10K, one run at a time.',
      biome: 'jungle',
      kind: 'numeric',
      unit: 'km',
      target_value: 10,
      current_value: 3.5,
      milestones: [
        { title: '2 km', target_value: 2, completed: true },
        { title: '5 km', target_value: 5, completed: false },
        { title: '8 km', target_value: 8, completed: false },
      ],
      entries: [
        { kind: 'milestone', title: '2 km', value: 2, occurred_at: '2026-08-01' },
        { kind: 'update', title: 'Fastest 3K, 14:02', value: 3, occurred_at: '2026-08-10' },
      ],
    },
    {
      title: 'Read 12 books',
      description: 'One book a month, no excuses.',
      biome: 'tundra',
      kind: 'numeric',
      unit: 'books',
      target_value: 12,
      current_value: 12,
      milestones: [
        { title: '4 books', target_value: 4, completed: true },
        { title: '8 books', target_value: 8, completed: true },
      ],
      entries: [
        { kind: 'milestone', title: '4 books', value: 4, occurred_at: '2026-04-01' },
        { kind: 'milestone', title: '8 books', value: 8, occurred_at: '2026-08-01' },
      ],
      status: 'completed',
      completed_at: '2026-09-01',
    },
    {
      title: 'Learn to surf',
      description: "Stand up, don't fall off.",
      biome: 'reef',
      kind: 'checklist',
      milestones: [
        { title: 'Take a lesson', target_value: null, completed: true },
        { title: 'Stand up once', target_value: null, completed: false },
      ],
      entries: [{ kind: 'milestone', title: 'Take a lesson', value: null, occurred_at: '2026-07-15' }],
    },
  ]

  for (let i = 0; i < goalsToSeed.length; i++) {
    const seed = goalsToSeed[i]
    const position = islandPosition(i, DEMO_SEED)

    const { data: goal, error: goalError } = await admin
      .from('goals')
      .insert({
        user_id: userId,
        title: seed.title,
        description: seed.description,
        biome: seed.biome,
        kind: seed.kind,
        unit: seed.unit ?? null,
        start_value: 0,
        target_value: seed.target_value ?? null,
        current_value: seed.current_value ?? 0,
        status: seed.status ?? 'active',
        completed_at: seed.completed_at ?? null,
        island_x: position.x,
        island_z: position.z,
        island_rotation: position.rotation,
      })
      .select()
      .single()
    if (goalError) throw goalError

    const milestoneIdByTitle = {}
    for (let sortOrder = 0; sortOrder < seed.milestones.length; sortOrder++) {
      const m = seed.milestones[sortOrder]
      const { data: milestone, error: milestoneError } = await admin
        .from('milestones')
        .insert({
          goal_id: goal.id,
          title: m.title,
          target_value: m.target_value,
          sort_order: sortOrder + 1,
          completed_at: m.completed ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (milestoneError) throw milestoneError
      milestoneIdByTitle[m.title] = milestone.id
    }

    for (const e of seed.entries) {
      const { error: entryError } = await admin.from('progress_entries').insert({
        goal_id: goal.id,
        milestone_id: e.kind === 'milestone' ? milestoneIdByTitle[e.title] ?? null : null,
        kind: e.kind,
        title: e.title,
        value: e.value,
        occurred_at: e.occurred_at,
      })
      if (entryError) throw entryError
    }

    console.log(`Seeded "${seed.title}" (${seed.biome}) at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`)
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Add the `seed` script to `package.json`**

Modify the `scripts` block, adding one entry:

```json
    "seed": "node scripts/seed.mjs",
```

- [ ] **Step 3: Run it and verify against the live project**

Run: `npm run seed`
Expected: logs "Demo user: demo@cairn.local / CairnDemo123! (id ...)", then three "Seeded ..." lines, then "Done." with no thrown error.

Run it a second time to confirm idempotency: `npm run seed`
Expected: same output, no duplicate-key errors (the delete-then-reinsert makes every run a clean slate).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.mjs package.json
git commit -m "M2: seed script — demo account with 3 goals across 3 biomes"
```

---

### Task 3: `useGoals` data hook

**Files:**
- Create: `src/features/archipelago/api.ts`

**Interfaces:**
- Consumes: `supabase` (M0's `src/lib/supabase.ts`).
- Produces: `useGoals()` — a react-query hook returning the signed-in user's own `active` and `completed` goals (never `archived`, never another user's goals even if public), consumed by Task 7's `HomeOverlay`/`ArchipelagoScene`.

- [ ] **Step 1: Create `src/features/archipelago/api.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/useSession'

export interface Goal {
  id: string
  title: string
  description: string | null
  biome: 'jungle' | 'desert' | 'tundra' | 'volcano' | 'reef' | 'highlands'
  kind: 'numeric' | 'checklist'
  unit: string | null
  startValue: number
  targetValue: number | null
  currentValue: number
  status: 'active' | 'completed' | 'archived'
  islandX: number
  islandZ: number
  islandRotation: number
  isPublic: boolean
}

function toGoal(row: {
  id: string
  title: string
  description: string | null
  biome: string
  kind: string
  unit: string | null
  start_value: number
  target_value: number | null
  current_value: number
  status: string
  island_x: number
  island_z: number
  island_rotation: number
  is_public: boolean
}): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    biome: row.biome as Goal['biome'],
    kind: row.kind as Goal['kind'],
    unit: row.unit,
    startValue: row.start_value,
    targetValue: row.target_value,
    currentValue: row.current_value,
    status: row.status as Goal['status'],
    islandX: row.island_x,
    islandZ: row.island_z,
    islandRotation: row.island_rotation,
    isPublic: row.is_public,
  }
}

/**
 * The signed-in user's own goals for their home archipelago — active and
 * completed only (never archived, and never another user's goals even
 * when public: this is "my archipelago", not a public feed).
 */
export function useGoals() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['goals', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select(
          'id, title, description, biome, kind, unit, start_value, target_value, current_value, status, island_x, island_z, island_rotation, is_public',
        )
        .eq('user_id', userId as string)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return data.map(toGoal)
    },
  })
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean — no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/api.ts
git commit -m "M2: useGoals data hook"
```

---

### Task 4: Placeholder island and water

**Files:**
- Create: `src/features/archipelago/Island.tsx`
- Create: `src/features/archipelago/Water.tsx`

**Interfaces:**
- Consumes: `Goal` (Task 3).
- Produces: `<Island goal={goal} onClick={...} />` (a self-contained 3D object with hover-lift, label, hover card, and click handling — consumed by Task 6's `ArchipelagoScene`), `<Water />` (consumed by Task 6).

No downloaded assets yet (spec §8's asset-pipeline rules apply starting M4) — both are plain procedural three.js geometry.

- [ ] **Step 1: Create `src/features/archipelago/Island.tsx`**

```tsx
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Mesh } from 'three'
import type { Goal } from './api'

const BIOME_COLORS: Record<Goal['biome'], string> = {
  jungle: '#2d5016',
  desert: '#c9a66b',
  tundra: '#dbe9f4',
  volcano: '#3b3b3b',
  reef: '#2ec4b6',
  highlands: '#6b7280',
}

interface IslandProps {
  goal: Goal
  onClick: () => void
}

export function Island({ goal, onClick }: IslandProps) {
  const meshRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (!meshRef.current) return
    const targetY = hovered ? 0.3 : 0
    meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.15
  })

  const progressLabel =
    goal.kind === 'numeric'
      ? `${goal.currentValue}${goal.unit ? ` ${goal.unit}` : ''} / ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}`
      : goal.status === 'completed'
        ? 'Complete'
        : 'In progress'

  return (
    <group position={[goal.islandX, 0, goal.islandZ]} rotation={[0, goal.islandRotation, 0]}>
      <mesh
        ref={meshRef}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <coneGeometry args={[2, 1.5, 8]} />
        <meshStandardMaterial color={BIOME_COLORS[goal.biome]} />
      </mesh>

      <Html position={[0, 2.2, 0]} center occlude distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-md bg-slate-950/80 px-2 py-1 text-xs text-slate-100">
          {goal.title} — {progressLabel}
        </div>
      </Html>

      {hovered ? (
        <Html position={[0, 3, 0]} center occlude distanceFactor={12}>
          <div className="w-48 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 shadow-lg">
            <p className="font-medium">{goal.title}</p>
            {goal.description ? <p className="mt-1 text-xs text-slate-400">{goal.description}</p> : null}
            <p className="mt-2 text-xs text-slate-300">{progressLabel}</p>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
```

- [ ] **Step 2: Create `src/features/archipelago/Water.tsx`**

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'

/**
 * Placeholder water — real biome-aware materials/reflections are spec §8's
 * M4 job. This is a large flat disc, slowly self-rotating with a gentle
 * opacity pulse, just enough to read as water rather than a static floor.
 */
export function Water() {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.02
    const material = meshRef.current.material as MeshStandardMaterial
    material.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.4) * 0.03
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <circleGeometry args={[60, 64]} />
      <meshStandardMaterial color="#0f2a4a" transparent opacity={0.82} roughness={0.3} />
    </mesh>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/Island.tsx src/features/archipelago/Water.tsx
git commit -m "M2: placeholder island and water"
```

---

### Task 5: `CameraRig` — orbit, fly-to-island, fly-home

**Files:**
- Create: `src/features/archipelago/CameraRig.tsx`

**Interfaces:**
- Consumes: `focusedGoal: Goal | null` (the goal matching the current `/g/:id`, if any — passed in by Task 6).
- Produces: `<CameraRig focusedGoal={...} />`, a component with no visible output that drives the R3F camera every frame; also attaches the drag-to-stop-auto-rotate listener.

- [ ] **Step 1: Create `src/features/archipelago/CameraRig.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from '@react-spring/three'
import { Vector3 } from 'three'
import type { Goal } from './api'

const ORBIT_RADIUS = 30
const ORBIT_ELEVATION = (35 * Math.PI) / 180 // spec §6.1: "looking down at maybe 35°"
const ORBIT_SPEED = 0.05 // radians/second while idle
const ISLAND_APPROACH_DISTANCE = 8
const ISLAND_APPROACH_ELEVATION = (40 * Math.PI) / 180
const FLY_DURATION_MS = 1200 // spec §6.3

function orbitPosition(azimuth: number): Vector3 {
  return new Vector3(
    ORBIT_RADIUS * Math.cos(ORBIT_ELEVATION) * Math.cos(azimuth),
    ORBIT_RADIUS * Math.sin(ORBIT_ELEVATION),
    ORBIT_RADIUS * Math.cos(ORBIT_ELEVATION) * Math.sin(azimuth),
  )
}

function islandApproachPosition(goal: Goal): Vector3 {
  return new Vector3(
    goal.islandX + ISLAND_APPROACH_DISTANCE * Math.cos(ISLAND_APPROACH_ELEVATION),
    ISLAND_APPROACH_DISTANCE * Math.sin(ISLAND_APPROACH_ELEVATION),
    goal.islandZ + ISLAND_APPROACH_DISTANCE * Math.cos(ISLAND_APPROACH_ELEVATION),
  )
}

interface CameraRigProps {
  focusedGoal: Goal | null
}

export function CameraRig({ focusedGoal }: CameraRigProps) {
  const { camera, gl } = useThree()
  const azimuth = useRef(0)
  const hasInteracted = useRef(false)

  const [{ progress }, api] = useSpring(() => ({ progress: 0, config: { duration: FLY_DURATION_MS } }))

  // A drag anywhere on the canvas permanently stops auto-rotation (spec
  // §6.1: "stops rotating the moment I touch it and doesn't resume").
  useEffect(() => {
    const element = gl.domElement
    const handlePointerDown = () => {
      hasInteracted.current = true
    }
    element.addEventListener('pointerdown', handlePointerDown)
    return () => element.removeEventListener('pointerdown', handlePointerDown)
  }, [gl])

  // Side effect (starting the spring) belongs in an effect, not directly in
  // the render body — this component renders under StrictMode, which
  // double-invokes render, and a bare render-time call here would risk
  // double-starting the animation.
  useEffect(() => {
    api.start({ progress: focusedGoal ? 1 : 0 })
  }, [focusedGoal?.id, api])

  useFrame((_, delta) => {
    if (!hasInteracted.current && !focusedGoal) {
      azimuth.current += delta * ORBIT_SPEED
    }

    const orbit = orbitPosition(azimuth.current)
    const t = progress.get()

    if (t <= 0) {
      camera.position.copy(orbit)
      camera.lookAt(0, 0, 0)
      return
    }

    const target = focusedGoal ?? { islandX: 0, islandZ: 0 }
    const approach = islandApproachPosition(target as Goal)
    camera.position.lerpVectors(orbit, approach, t)
    const lookAtX = 0 + (target.islandX - 0) * t
    const lookAtZ = 0 + (target.islandZ - 0) * t
    camera.lookAt(lookAtX, 0, lookAtZ)
  })

  return null
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/CameraRig.tsx
git commit -m "M2: camera rig — orbit, fly-to-island, fly-home"
```

---

### Task 6: `ArchipelagoScene` — ties it together

**Files:**
- Create: `src/features/archipelago/ArchipelagoScene.tsx`

**Interfaces:**
- Consumes: `useGoals` (Task 3), `Island`/`Water` (Task 4), `CameraRig` (Task 5).
- Produces: `<ArchipelagoScene />` — the persistent `<Canvas>`, consumed by Task 7's `App.tsx`.

- [ ] **Step 1: Create `src/features/archipelago/ArchipelagoScene.tsx`**

```tsx
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams } from 'react-router'
import { useGoals } from './api'
import { Island } from './Island'
import { Water } from './Water'
import { CameraRig } from './CameraRig'

export function ArchipelagoScene() {
  const navigate = useNavigate()
  const { id: focusedGoalId } = useParams<{ id?: string }>()
  const { data: goals } = useGoals()

  const focusedGoal = goals?.find((goal) => goal.id === focusedGoalId) ?? null

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        <Water />
        {goals?.map((goal) => (
          <Island key={goal.id} goal={goal} onClick={() => navigate(`/g/${goal.id}`)} />
        ))}
        <CameraRig focusedGoal={focusedGoal} />
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/archipelago/ArchipelagoScene.tsx
git commit -m "M2: ArchipelagoScene"
```

---

### Task 7: Wire into `App.tsx` — persistent canvas, home overlay, empty state, 404

**Files:**
- Create: `src/features/archipelago/HomeOverlay.tsx`
- Create: `src/features/archipelago/EmptyArchipelago.tsx`
- Create: `src/features/NotFoundPage.tsx`
- Modify: `src/App.tsx`
- Delete: `src/features/home/HomePage.tsx` (superseded by the real archipelago)

**Interfaces:**
- Consumes: `ArchipelagoScene` (Task 6), `useGoals` (Task 3), `useSession` (M0).
- Produces: the real `/` route.

- [ ] **Step 1: Create `src/features/archipelago/EmptyArchipelago.tsx`**

```tsx
export function EmptyArchipelago() {
  return (
    <div className="pointer-events-none flex h-full items-center justify-center">
      <div className="pointer-events-auto max-w-xs rounded-md border border-slate-700 bg-slate-950/80 p-4 text-center text-sm text-slate-100">
        <p className="font-medium">One island is waiting.</p>
        <p className="mt-1 text-slate-400">Plant your first goal to bring it to life.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/features/archipelago/HomeOverlay.tsx`**

```tsx
import { useState } from 'react'
import { useGoals } from './api'
import { useSession } from '../auth/useSession'
import { supabase } from '../../lib/supabase'
import { EmptyArchipelago } from './EmptyArchipelago'

export function HomeOverlay() {
  const { session } = useSession()
  const { data: goals, isLoading } = useGoals()
  const [showCompleted, setShowCompleted] = useState(true)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)

  const activeCount = goals?.filter((g) => g.status === 'active').length ?? 0
  const completedCount = goals?.filter((g) => g.status === 'completed').length ?? 0
  const isEmpty = !isLoading && activeCount === 0 && completedCount === 0

  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <header className="pointer-events-auto flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-slate-100">Cairn</span>

        <div className="flex items-center gap-2">
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowCompleted((value) => !value)}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          ) : null}

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 opacity-50"
          >
            New goal
          </button>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 opacity-50"
          >
            Explore
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAvatarMenuOpen((value) => !value)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {session?.user.email?.[0]?.toUpperCase() ?? '?'}
            </button>
            {avatarMenuOpen ? (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg">
                <p className="truncate px-2 py-1 text-slate-400">{session?.user.email}</p>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1">{isEmpty ? <EmptyArchipelago /> : null}</div>
    </div>
  )
}
```

Note: `showCompleted` is read by Task 8 (the filter's actual effect on which islands render) — this task wires the toggle's UI and state; Task 8 connects it to `ArchipelagoScene`.

- [ ] **Step 3: Create `src/features/NotFoundPage.tsx`**

```tsx
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="pointer-events-auto flex h-full items-center justify-center">
      <div className="text-center text-sm text-slate-100">
        <p>Nothing here.</p>
        <Link to="/" className="mt-2 inline-block underline">
          Back to your archipelago
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { ArchipelagoScene } from './features/archipelago/ArchipelagoScene'
import { HomeOverlay } from './features/archipelago/HomeOverlay'
import { NotFoundPage } from './features/NotFoundPage'

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ArchipelagoScene />
            <div className="pointer-events-none fixed inset-0">
              <Routes>
                <Route path="/" element={<HomeOverlay />} />
                <Route path="/g/:id" element={<HomeOverlay />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
```

`ArchipelagoScene` is mounted once for every authenticated route (`/*` under `RequireAuth`) and reads `useParams` itself to find the focused goal — it does not need its own `<Route>` per URL, which is exactly what keeps it persistent across `/` and `/g/:id` per spec §8. `HomeOverlay` currently renders the same 2D chrome on both routes; Task 8/M3 will vary it once island-specific content exists.

- [ ] **Step 5: Delete `src/features/home/HomePage.tsx`**

It's superseded — the real archipelago is now the home screen. Delete the file and remove any now-unused import.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "M2: wire archipelago into App — home overlay, empty state, 404"
```

---

### Task 8: Completed-goals filter

**Files:**
- Modify: `src/features/archipelago/HomeOverlay.tsx`
- Modify: `src/features/archipelago/ArchipelagoScene.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: the `showCompleted` toggle (Task 7) actually hides/shows completed islands in the 3D scene, not just its own button label.

Task 7 built `showCompleted` as local state inside `HomeOverlay`, but `ArchipelagoScene` (a sibling, not a child, in `App.tsx`'s tree) is what needs to filter on it. Lift the state up to `App.tsx` and pass it down to both.

- [ ] **Step 1: Lift `showCompleted` state into `App.tsx`**

Modify `src/App.tsx`: add `const [showCompleted, setShowCompleted] = useState(true)` inside `App`, pass `showCompleted` to `ArchipelagoScene`, and pass `{ showCompleted, onToggleShowCompleted: () => setShowCompleted((v) => !v) }` to `HomeOverlay` (both routes).

```tsx
import { useState } from 'react'
import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { ArchipelagoScene } from './features/archipelago/ArchipelagoScene'
import { HomeOverlay } from './features/archipelago/HomeOverlay'
import { NotFoundPage } from './features/NotFoundPage'

export function App() {
  const [showCompleted, setShowCompleted] = useState(true)
  const toggleShowCompleted = () => setShowCompleted((value) => !value)

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ArchipelagoScene showCompleted={showCompleted} />
            <div className="pointer-events-none fixed inset-0">
              <Routes>
                <Route
                  path="/"
                  element={<HomeOverlay showCompleted={showCompleted} onToggleShowCompleted={toggleShowCompleted} />}
                />
                <Route
                  path="/g/:id"
                  element={<HomeOverlay showCompleted={showCompleted} onToggleShowCompleted={toggleShowCompleted} />}
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 2: Update `HomeOverlay` to accept the lifted state as props**

Modify `src/features/archipelago/HomeOverlay.tsx`: remove the local `showCompleted`/`setShowCompleted` state, accept `showCompleted: boolean` and `onToggleShowCompleted: () => void` as props instead, and call `onToggleShowCompleted` from the existing button's `onClick`.

```tsx
import { useState } from 'react'
import { useGoals } from './api'
import { useSession } from '../auth/useSession'
import { supabase } from '../../lib/supabase'
import { EmptyArchipelago } from './EmptyArchipelago'

interface HomeOverlayProps {
  showCompleted: boolean
  onToggleShowCompleted: () => void
}

export function HomeOverlay({ showCompleted, onToggleShowCompleted }: HomeOverlayProps) {
  const { session } = useSession()
  const { data: goals, isLoading } = useGoals()
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)

  const activeCount = goals?.filter((g) => g.status === 'active').length ?? 0
  const completedCount = goals?.filter((g) => g.status === 'completed').length ?? 0
  const isEmpty = !isLoading && activeCount === 0 && completedCount === 0

  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <header className="pointer-events-auto flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-slate-100">Cairn</span>

        <div className="flex items-center gap-2">
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={onToggleShowCompleted}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          ) : null}

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 opacity-50"
          >
            New goal
          </button>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 opacity-50"
          >
            Explore
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAvatarMenuOpen((value) => !value)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {session?.user.email?.[0]?.toUpperCase() ?? '?'}
            </button>
            {avatarMenuOpen ? (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg">
                <p className="truncate px-2 py-1 text-slate-400">{session?.user.email}</p>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1">{isEmpty ? <EmptyArchipelago /> : null}</div>
    </div>
  )
}
```

- [ ] **Step 3: Update `ArchipelagoScene` to accept and apply the filter**

Modify `src/features/archipelago/ArchipelagoScene.tsx`:

```tsx
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams } from 'react-router'
import { useGoals } from './api'
import { Island } from './Island'
import { Water } from './Water'
import { CameraRig } from './CameraRig'

interface ArchipelagoSceneProps {
  showCompleted: boolean
}

export function ArchipelagoScene({ showCompleted }: ArchipelagoSceneProps) {
  const navigate = useNavigate()
  const { id: focusedGoalId } = useParams<{ id?: string }>()
  const { data: goals } = useGoals()

  const visibleGoals = goals?.filter((goal) => showCompleted || goal.status !== 'completed') ?? []
  const focusedGoal = visibleGoals.find((goal) => goal.id === focusedGoalId) ?? null

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        <Water />
        {visibleGoals.map((goal) => (
          <Island key={goal.id} goal={goal} onClick={() => navigate(`/g/${goal.id}`)} />
        ))}
        <CameraRig focusedGoal={focusedGoal} />
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/features/archipelago/HomeOverlay.tsx src/features/archipelago/ArchipelagoScene.tsx
git commit -m "M2: completed-goals filter"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Automated checks**

Run: `npm run build && npm test && npm run typecheck`
Expected: all clean.

- [ ] **Step 2: Live smoke test**

1. Run `npm run seed -- <your-real-email>` (the app has no password sign-in UI, so seed into an account you can actually sign into via magic link — not the fixed demo account, which is for data inspection only).
2. Run `npm run dev`, sign in normally via magic link.
3. Confirm: 3 islands render at visually distinct, stable positions (jungle/tundra/reef colors). Refresh the page — positions must not move.
4. Hover an island: it lifts slightly and a summary card appears. Move away: it settles back down.
5. Click an island: the camera flies toward it (~1.2s), the URL becomes `/g/<that-goal's-id>`.
6. Press the browser back button: the camera flies back out, URL returns to `/`.
7. Drag on the canvas during the idle orbit: rotation stops immediately and does not resume on its own.
8. Toggle "Hide completed": the completed goal's island disappears from the scene; toggle again, it returns.
9. Take a screenshot of the archipelago view for the record.

- [ ] **Step 3: Final commit for the milestone**

```bash
git add -A
git commit -m "M2: archipelago complete — islands, camera, done-when verified"
```

Per the spec's workflow rule, stop here — don't start M3 without the user looking at this first.
