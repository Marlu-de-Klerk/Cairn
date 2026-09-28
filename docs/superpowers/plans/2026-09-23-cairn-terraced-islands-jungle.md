# Cairn Terraced Islands (Jungle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the jungle island with a procedurally generated, terraced, hikeable island whose trail climbs real ledges and ramps, built from one seeded layout, and stop at the Jungle sign-off gate with real screenshots for the user.

**Architecture:** A pure, seeded layout module (`src/lib/island/`, no React or three.js) produces one `IslandLayout` per `(biome, seed)`: nested signed-distance terrace levels, a trail planned before any mesh, a single `groundHeightAt` height oracle, feature and prop placements. Three consumers read that one object: a three.js terrain/prop mesh builder (`src/features/archipelago/terrain/`), a new terrain-following trail curve (`src/features/roadmap/curve.ts`), and a pure camera module (`focusPose`, `islandAnchors`). Only jungle switches over in this plan (`isTerraced(biome)`); the other five biomes keep their current components until the next plan.

**Tech Stack:** React 19.2.8, @react-three/fiber 9.7.0, @react-three/drei 10.7.8, @react-spring/three 10.1.2, three 0.185.1, TypeScript 5.9.3, Vite, Vitest 5.0.0 (jsdom `unit` project). Headless Chrome for renders. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-cairn-terraced-islands-design.md` (approved 2026-09-23). This plan implements its rollout Phases 1–5 (§11). Phases 6–7 (other five biomes, cleanup, CLAUDE.md update) are a later plan. Also read `docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md` §1 (palette) and §5 (prototype-first gate).

## Global Constraints

- `src/lib/trail.ts` and `src/lib/trail.test.ts` are never edited. Milestone *n* of *N* stays at arc-length `t = n/(N+1)` via `curve.getPointAt`. `src/lib/archipelago.ts` and `archipelago.test.ts` are never edited.
- `src/lib/` stays free of React and three.js imports. Type-only imports of `Goal` from `src/features/archipelago/api` are allowed (existing precedent in `lib/theme.ts`).
- `Math.random` is banned in `src/lib/island/`. All randomness comes from `hash01` (`src/lib/archipelago.ts`) through `createStream(seed, salt)`, with the fixed salts of spec §3.3: outlines 1, drift/side 2, ramps 3, decor 4, waterfall 5, prop kind `100 + kindIndex`, cliff flutes `200 + level`, noise 300.
- One `IslandLayout` is the only source of island geometry. No 3D code holds its own island-size constants. `groundHeightAt` is the single height oracle for terrain, trail, props and markers.
- Budgets (spec §2.3, §5.7, §8): beach footprint radius ≤ 3.05, foam ≤ 3.15, halo ≤ 3.45, summit ground ≤ 2.20, highest prop top ≤ 3.0, label y ≤ summitTopY + 1.0. Focused island ≤ 26k lit + 5k unlit terrain tris, ≤ 14k prop tris, ≤ 22 draw calls; overview island ≤ 10k + 2k terrain tris, ≤ 8k prop tris, ≤ 8 draw calls; build time desktop ≤ 90 ms focus, ≤ 60 ms overview.
- Every palette hex comes verbatim from spec §2.6. `#F2C879` is never used in 3D.
- Rendering: `<Canvas flat>`, no shadow maps, one shared lit material (`MeshToonMaterial`, vertex colours, gradient `[120, 190, 255]`) and one shared unlit material (`MeshBasicMaterial`, vertex colours, `toneMapped: false`) for all terrain, one shared lit material for props, no per-island material clones. Props are instanced per kind through `PropPart` (drei `<Instances>`).
- No glTF is added. The five non-jungle biomes keep rendering exactly as today, behind `isTerraced(biome)`, until the next plan.
- The trail marker's react-spring-driven position is never overwritten by a competing `useFrame` write in the same frame (M3 Critical #1 regression class).
- `frameloop="demand"` in the detail view lands only in Task 18, after every animator (camera flight, focus orbit, trail springs, hover lift) calls `invalidate()`.
- The focus camera arrives from world +X+Z, and the viewer can orbit the focused island a full 360° by dragging (spec §5.6.1). Orbiting never changes the overview azimuth; every new focus resets orbit to 0.
- Existing behaviour stays intact: drag-vs-click threshold and click suppression in `CameraRig`, idle auto-rotate rule, `RoadmapPanel`, react-query hooks, New Goal flow.
- CLAUDE.md comment rules apply: no comments unless the why is non-obvious, one or two lines, no banners, no change narration.
- `npm run typecheck`, `npm test` and `npm run build` stay clean after every task.
- `git commit` is blocked for agents by a hook. Every task ends by staging its own files with `git add <files>` (never `git add -A`); the user commits.
- Visual tasks are verified with the headless render loop from Task 3 (`npm run render:island`), which assumes the Vite dev server is already running at `http://localhost:5173` and never starts or stops it. Renders go to `os.tmpdir()/cairn-renders/`, never into the repo.

## File Structure

**New, pure (`src/lib/island/`):**

| File | Responsibility | Task |
|---|---|---|
| `types.ts` | All shared types of spec §3.6, `WATER_Y`, `LAYOUT_VERSION` | 1 |
| `random.ts` | `createStream`, `valueNoise2` on top of `hash01` | 1 |
| `orientation.ts` | `ISLAND_YAW`, `SUN_DIR`, `sunDirLocal`, `CAMERA_DIR_LOCAL`, `localToWorld` | 1 |
| `biomes.ts` | Config types, `PATTERN_PRESETS`, `BIOME_TERRAIN` (jungle full, five stubs), palettes, `isTerraced` | 4 |
| `shapes.ts` | `PolarBlob` SDF, flutes, nesting chain, `LevelField` | 5 |
| `query.ts` | `SegmentHash`, `pathProject`, `groundHeightAt`, `walkableRun`, ray exits, `heightGrid`, sun occlusion | 6 |
| `trailPlan.ts` | Trail planner (ramp sites, walks, ramps, summit walk, smoothing, slope limiter, leg balance) | 7 |
| `scatter.ts` | Feature placement (shelf, pool, fall, pillars, vines, caves, water rocks, camp) and prop scattering with the sightline rule | 8 |
| `plan.ts` | `buildIslandLayout`, `validateLayout`, deterministic retry, `serializeLayout` | 9 |
| `anchors.ts` | `islandAnchors`, `focusPose` (with orbit) | 10 |

**New, three.js (`src/features/archipelago/terrain/`):**

| File | Responsibility | Task |
|---|---|---|
| `materials.ts` | Toon gradient, shared lit/unlit terrain materials, shared prop material, Lambert A/B variant | 11 |
| `terraceMesh.ts` | `buildTerrain(layout, detail)` → `{ lit, unlit, hull }` | 12 |
| `propGeometry.ts` | `getPropGeometry(kind, biome)` for every jungle prop kind | 13 |
| `islandCache.ts` | Layout/build LRUs, ref-counted dispose, idle scheduler, `useIslandBuild` | 14 |

**New React:** `src/features/archipelago/SceneEnvironment.tsx` (Task 2), `src/features/dev/DevIslandView.tsx` (Tasks 3, 19), `src/features/archipelago/TerracedIsland.tsx` and `src/features/archipelago/hullRegistry.tsx` (Task 15), `src/features/roadmap/TrailPennant.tsx` and `src/features/roadmap/MilestoneCairn.tsx` (Task 17).

**New scripts:** `scripts/render-island.mjs` (Task 3, matrix mode in Task 19), `src/lib/island/island.bench.ts` (Task 19).

**Modified:** `docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md` (Task 2), `src/App.tsx` (Tasks 2, 3), `src/features/archipelago/Water.tsx` (Task 2), `ArchipelagoScene.tsx` (Tasks 2, 15, 17, 18), `Island.tsx` (Tasks 3, 15), `BiomePicker.tsx` (Task 15: jungle entry only), `CameraRig.tsx` (Task 18), `src/features/roadmap/curve.ts` and `curve.test.ts` (Task 16), `RoadmapTrail.tsx` (Tasks 16, 17), `MilestoneBuilder.tsx` (Tasks 16, 17), `package.json` (Tasks 3, 9, 19). `models/PropPart.tsx` is **not** modified: `TerracedIsland` maps the new `PropPlacement` onto PropPart's existing `{ position, rotation, scale }` shape, so the five legacy biomes keep compiling.

**Deleted:** `src/features/archipelago/DevIslandPreview.tsx` and its route (Task 2); `models/JungleLandmass.tsx`, `models/JungleProps.tsx` and the six Quaternius `public/models/Jungle*.glb` files (Task 15); `src/features/roadmap/models/TrailMarker.tsx` usage for terraced islands (Task 17; the file itself stays for the legacy path until the next plan).

**Untouched reference (deleted in the next plan):** `src/features/archipelago/spikes/*`, `public/models/spikeA|B|C/`. Tasks port from these files by name; they are working, rendered prototypes.

## Interface Contract

These names and signatures are fixed. Every task uses them verbatim. Internal helpers inside `src/lib/island/` beyond this list are defined by Tasks 3–10 themselves.

```ts
// src/lib/island/types.ts: every type in spec §3.6 verbatim, plus
export const WATER_Y = -0.05
export const LAYOUT_VERSION = 1

// src/lib/island/random.ts
export interface Stream {
  next(): number                         // [0, 1)
  range(min: number, max: number): number
  int(min: number, maxInclusive: number): number
  pick<T>(items: readonly T[]): T
  sign(): 1 | -1
}
export function createStream(seed: number, salt: number): Stream
export function valueNoise2(seed: number, salt: number): (x: number, z: number) => number // smooth, [0, 1]

// src/lib/island/orientation.ts
export const ISLAND_YAW: number            // Math.PI / 4: layout-local +Z maps to world +X+Z
export const SUN_DIR: Vec3                 // world, normalize(-0.20, 0.80, 0.55)
export function sunDirLocal(): Vec3        // SUN_DIR rotated by -ISLAND_YAW about Y
export const CAMERA_DIR_LOCAL: Vec3        // [0, 0, 1], horizontal unit vector toward the default focus camera
export function localToWorld(v: Vec3): Vec3 // rotate by ISLAND_YAW about Y (no translation)

// src/lib/island/biomes.ts: every type in spec §3.6's biomes.ts block verbatim, plus
export interface TerrainPalette {
  readonly lawn: Hex; readonly cap: Hex; readonly capLight: Hex; readonly capDark: Hex; readonly lip: Hex
  readonly cliff: Hex; readonly cliffLit: Hex; readonly cliffShade: Hex; readonly cliffRim: Hex; readonly cliffBase: Hex; readonly crevice: Hex
  readonly path: Hex; readonly pathEdge: Hex; readonly tread: Hex; readonly pillar: Hex; readonly pillarCap: Hex
  readonly pool: Hex | null; readonly fall: Hex | null; readonly fallStreak: Hex | null
  readonly foliage: Readonly<Record<string, Hex>>
}
export const SHARED_PALETTE: {
  readonly water: '#6BC2C9'; readonly shallow: '#8FD4D9'; readonly foam: '#FFFFFF'; readonly foamEdge: '#DDF3F4'
  readonly sand: '#EFCB8E'; readonly sandWall: '#DDB677'; readonly trailDone: '#3A7D77'
  readonly cairnPending: '#CFC8BA'; readonly cairnNext: '#F6A9A0'; readonly cairnDone: '#5FBFA8'
  readonly pennantFlag: '#F6A9A0'; readonly pennantPole: '#FFF4DA'; readonly entry: '#FFF4DA'
}
export const BIOME_TERRAIN: Record<Biome, BiomeTerrainConfig>
export const PATTERN_PRESETS: Record<CompositionPattern, { readonly shallowY: -0.042; readonly foamY: -0.036; readonly beachY: 0.04 }>
export function isTerraced(biome: Biome): boolean // this plan: biome === 'jungle'
export function propRule(biome: Biome, kind: PropKind): PropRule | undefined
// Jungle foliage keys (TerrainPalette.foliage), hexes from spec §2.6 "Foliage slots":
// palmTrunk palmRing frond frondTip canopy canopyShade canopyTop canopyTrunk bush fern vine vineLeaf
// flower flowerCentre mushroom mushroomStem stump stumpInner stumpMoss heroRock heroRockMoss
// tent tentDoor campfireStone ember log lily grass

// src/lib/island/plan.ts
export function buildIslandLayout(biome: Biome, seed: number): IslandLayout
export function validateLayout(layout: IslandLayout): string[]   // [] = valid
export function serializeLayout(layout: IslandLayout): unknown     // data only (no closures)

// src/lib/island/anchors.ts
export interface IslandAnchors { readonly labelY: number; readonly cardY: number; readonly hoverLift: number; readonly focusTargetY: number }
export function islandAnchors(layout: IslandLayout): IslandAnchors
export interface FocusPoseOptions {
  readonly aspect: number                // viewport width / height
  readonly fovDeg: number                // vertical fov, 50 in the app
  readonly insetRightPx: number          // 288 when RoadmapPanel is open on viewports ≥ 640 px, else 0
  readonly viewportPx: { readonly width: number; readonly height: number }
  readonly orbit: number                 // radians added to the default azimuth; 0 = trailhead view
}
export interface FocusPose {
  readonly position: Vec3                // WORLD-oriented offset from the island's world centre (add islandX/islandZ)
  readonly lookAt: Vec3                  // same frame
  readonly distance: number              // clamped to [7, 17]
  readonly elevation: number             // radians, 38°
  readonly azimuth: number               // radians, atan2(z, x) of the camera direction; π/4 + orbit
}
export function focusPose(layout: IslandLayout, options: FocusPoseOptions): FocusPose
export const FOCUS_ELEVATION: number       // 38° in radians

// src/features/archipelago/terrain/materials.ts
export type LitMaterialKind = 'toon' | 'lambert'
export function getTerrainLitMaterial(kind?: LitMaterialKind): Material   // cached singleton per kind, default 'toon'
export const terrainUnlitMaterial: MeshBasicMaterial
export function getPropMaterial(kind?: LitMaterialKind): Material         // cached singleton per kind
export function createToonGradient(): DataTexture                          // [120, 190, 255], NearestFilter

// src/features/archipelago/terrain/terraceMesh.ts
export type IslandDetail = 'overview' | 'focus' | 'preview'
export interface TerrainMeshes { readonly lit: BufferGeometry; readonly unlit: BufferGeometry; readonly hull: BufferGeometry }
export function buildTerrain(layout: IslandLayout, detail: IslandDetail): TerrainMeshes

// src/features/archipelago/terrain/propGeometry.ts
export function getPropGeometry(kind: PropKind, biome: Biome): BufferGeometry // vertex colours, base at y=0, height = propRule(biome, kind).height, cached

// src/features/archipelago/terrain/islandCache.ts
export interface IslandBuild extends TerrainMeshes {
  readonly layout: IslandLayout
  readonly detail: IslandDetail
  readonly buildMs: number
  readonly triangles: { readonly lit: number; readonly unlit: number; readonly props: number }
}
export function getIslandLayout(biome: Biome, seed: number): IslandLayout                   // sync, LRU 48
export function getIslandBuild(biome: Biome, seed: number, detail: IslandDetail): IslandBuild // sync, LRU 24, ref-counted
export function releaseIslandBuild(build: IslandBuild): void
export function useIslandBuild(biome: Biome, seed: number, detail: IslandDetail, priority: 'high' | 'normal'): IslandBuild | null

// src/features/archipelago/hullRegistry.tsx
export function HullRegistryProvider(props: { children: ReactNode }): JSX.Element
export function useHullRegistry(): { readonly hulls: RefObject<Object3D[]>; register(mesh: Object3D): () => void }

// src/features/archipelago/TerracedIsland.tsx
export interface TerracedIslandProps {
  readonly build: IslandBuild
  readonly materialKind?: LitMaterialKind
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void
  readonly onPointerOver?: (event: ThreeEvent<PointerEvent>) => void
  readonly onPointerOut?: (event: ThreeEvent<PointerEvent>) => void
}
export function TerracedIsland(props: TerracedIslandProps): JSX.Element // renders lit, unlit, props; registers its hull

// src/features/archipelago/Island.tsx (additions)
//   props gain: seedOverride?: number (dev only), materialKind?: LitMaterialKind (dev only)

// src/features/roadmap/curve.ts: spec §4.1 signatures verbatim, plus the legacy shim
export function buildLegacyConeCurve(baseRadius: number, height: number, seed: number): CatmullRomCurve3 // today's buildTrailCurve body, renamed

// src/features/roadmap/RoadmapTrail.tsx
export function RoadmapTrail(props: { goal: Goal; seedOverride?: number }): JSX.Element
export interface TrailViewProps { readonly goal: Goal; readonly layout: IslandLayout; readonly milestones: Milestone[]; readonly entries: ProgressEntry[] }
export function TrailView(props: TrailViewProps): JSX.Element

// src/features/archipelago/CameraRig.tsx (additions)
//   props gain: seedOverride?: number, devOrbit?: number (dev harness only: fixed orbit, disables dragging)

// src/features/dev/devParams.ts: grows across tasks; each task adds only its own fields and views
export type DevView =
  | 'hero' | 'side' | 'top' | 'back'        // Task 3: preset cameras + OrbitControls
  | 'focus' | 'orbit-back' | 'phone'        // Task 18: real CameraRig focus pose (orbit-back = orbit π)
  | 'overview' | 'picker'                   // Task 19
export interface DevParams {
  readonly seed: number                     // Task 3, default 1
  readonly view: DevView                    // Task 3, default 'hero'
  readonly dist: number                     // Task 3, default 1
  readonly milestones: number               // Task 17, default 4
  readonly head: number                     // Task 17, default 0.55, clamped [0, 1]
  readonly entries: number                  // Task 17, default 3
  readonly orbit: number                    // Task 18, default 0 (radians)
  readonly islands: number                  // Task 19, default 8
  readonly material: LitMaterialKind        // Task 19, default 'toon'
}
export function parseDevParams(search: URLSearchParams): DevParams

// src/features/dev/fixtures.ts (Task 17)
export function devGoal(biome: Biome, seed: number): Goal                                   // Task 3 creates it here
export function fixtureMilestones(goal: Goal, count: number, head: number): Milestone[]
export function fixtureEntries(goal: Goal, milestones: Milestone[], count: number): ProgressEntry[]
```

Task 3 creates `devParams.ts` and `fixtures.ts` with only its own fields (`seed`, `view`, `dist`, `devGoal`); Tasks 17, 18 and 19 extend them. Until a task adds a field, `parseDevParams` does not return it, so the interface above is the end state after Task 19.

Frames: layout coordinates are island-local (y up, water at y = −0.05, local +Z = trailhead side). `Island` renders a terraced island inside a group at world `[islandX, 0, islandZ]` with `rotation=[0, ISLAND_YAW, 0]`; the trail group in `ArchipelagoScene` uses the same yaw. `focusPose` returns world-oriented offsets.

## Tasks

Phase 1: foundations and housekeeping (Tasks 1–3). Phase 2: pure layout core (Tasks 4–10). Phase 3: terrain, props and island wiring (Tasks 11–15). Phase 4: trail and camera (Tasks 16–18). Phase 5: Jungle sign-off (Tasks 19–20).

### How the code in this plan was produced

Tasks 1–10 were prototyped in a scratch copy of this repo and their code is included verbatim: every file shown for those tasks type-checks under the project's `tsconfig.json`, and every test shown passes (`island.test.ts` sweeps 40 jungle seeds + 20 fixture UUIDs + 8 seeds per stub biome in about 40 s). Tasks 11–20 are written against those real modules. If a step's expected output differs from what you see, stop and investigate rather than editing the test to match.

### Spec deviations (found by prototyping, 2026-09-26)

Running the spec's planner as written over 60 jungle seeds failed every seed (the trail overlapped itself, crossed 32°, or ended off the summit). These changes fix that; each is small and each is visible in the code below.

1. **Drift is mirrored:** `drift = front + π + side·δ` (spec §3.4 has `− side·δ`). With the spec's sign, ramp 0 (which runs `+side`, as the spec says) climbs toward the side the upper tiers drift to, so its switchback lands where the ledge in front of the summit is narrowest. Trailhead angle and ramp directions are unchanged.
2. **Switchbacks are explicit.** Ramp *k* ≥ 1 starts at a semicircular U-turn after ramp *k−1*'s landing (the spec's `−1.5` switchback score term becomes this construction). The ledge above each ramp top is widened to `HAIRPIN_LEDGE = 1.1` (plus lean) only within ~0.6 of the U, and U-turn points are pinned out of the 40 Laplacian passes (smoothing otherwise pulls the two legs together). Only ramp 0's site is scored.
3. **Ramp arcs are centred on each level's core** (its deepest point, `levelCore`), not its blob centre: ledge widening can shift a small summit so far that its blob centre falls outside it. Lanes follow the rim smoothed over ±18° so a sharp bay can't kink a ramp.
4. **Ramp, landing and switchback heights come from the plan** (lower level before the ramp midpoint, upper after), not from `terraceY` under the lane; the carve cuts or fills the terrain to match. Otherwise a lane grazing a bulge of the next tier starts the climb early and leaves a flat stretch floating a tier above the ground.
5. **The summit end point is searched**, not fixed at `summitCentre + 0.35·frontDir`: the summit ramp wraps a third of the summit, so the fixed point often sits beside the ramp's cut. The search picks the summit point (and straight walk to it) with the most clearance from the laid trail, favouring the camera side and a walk of about 1.0; a dome prefers its peak, a crater its rim ring.
6. **Landings are 0.3 long** so the slope ends well before the next corner.
7. **Leg-share windows** are lawn `[0.20, 0.40]` and summit `[0.04, 0.18]` (spec: `[0.22, 0.40]`, `[0.06, 0.18]`); ramps `≥ 0.25` unchanged. The spec's ramps are 26° climbs of ~1.0 on an island of radius ≤ 3.05, so ramps take ~55% of the trail.
8. **`validateLayout` also rejects** (a) two separate passes of the trail sharing corridor at different heights, (b) a flat stretch (local slope < 0.02) more than 0.02 off its cap, (c) a corridor that isn't flat across (±0.15 probes: 0.03 flat, 0.06 sloped). About 10% of jungle seeds fail first time; the spec's deterministic retry handles them.
9. **`TierRecipe.radiusRatio` is relative to the blob one level down**, matching spec §2.1's "about 0.74, then about 0.65 of that", not to the beach blob as the §3.6 type comment says. Jungle's summit ratio is 0.70 (spec 0.64) so the summit walk has room.
10. **Test tolerances** that the geometry cannot meet exactly: corridor lateral probes 0.03 flat / 0.06 sloped (spec 0.01 everywhere; a probe on the inside of a curving slope projects to a slightly different arc length), "flat run" means local slope < 0.02 rather than "outside a ramp span" (the limiter's tails spill past a span), and flat runs sit within 0.02 of their cap. Canopy trees are not a key kind; bush count is 12 (spec 14).
11. **The five non-jungle biomes are stubs that reuse the jungle terrain recipe** (with their own palettes and two stub prop rules each). The dome, crater and three-tier code paths exist, but in the prototype they failed most seeds untuned; tuning them is the next plan's Phase 6 work, exactly where the spec already puts biome tuning.
12. **Open risk, measured:** a layout build takes ~90–100 ms in Node (spec: layout ≤ 30 ms). Task 14's cache and idle-time scheduler keep this off the frame; Task 19's bench reports it, and speeding it up (fewer rim-table rebuilds per leg-balance pass, a coarser `levelCore` search) is the first follow-up if the Android check stalls.

---

### Task 1: Island types, seeded streams and orientation

**Files:**
- Create: `src/lib/island/types.ts`, `src/lib/island/random.ts`, `src/lib/island/orientation.ts`
- Test: `src/lib/island/random.test.ts`, `src/lib/island/orientation.test.ts`

**Interfaces:**
- Consumes: `hash01(seed, index, salt)` from `src/lib/archipelago.ts` (unchanged).
- Produces: every type in the Interface Contract's `types.ts`, `WATER_Y`, `LAYOUT_VERSION`, `Stream`, `createStream`, `valueNoise2`, `ISLAND_YAW`, `SUN_DIR`, `CAMERA_DIR_LOCAL`, `localToWorld`, `sunDirLocal`.

- [ ] **Step 1: Write the failing tests**

`src/lib/island/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createStream, valueNoise2 } from './random'

describe('createStream', () => {
  it('replays the same sequence for the same seed and salt', () => {
    const a = createStream(42, 3)
    const b = createStream(42, 3)
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()))
  })

  it('gives independent sequences per salt', () => {
    expect(createStream(42, 3).next()).not.toBe(createStream(42, 4).next())
  })

  it('keeps range, int, pick and sign inside their bounds', () => {
    const s = createStream(7, 1)
    for (let i = 0; i < 500; i++) {
      const r = s.range(2, 3)
      expect(r).toBeGreaterThanOrEqual(2)
      expect(r).toBeLessThan(3)
      const n = s.int(1, 4)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(4)
      expect(['a', 'b']).toContain(s.pick(['a', 'b'] as const))
      expect([1, -1]).toContain(s.sign())
    }
  })
})

describe('valueNoise2', () => {
  it('stays in [0, 1] and is continuous', () => {
    const n = valueNoise2(9, 300)
    for (let i = 0; i < 400; i++) {
      const x = i * 0.037 - 7
      const v = n(x, x * 0.5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(Math.abs(n(x + 1e-4, x * 0.5) - v)).toBeLessThan(0.01)
    }
  })
})
```

`src/lib/island/orientation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CAMERA_DIR_LOCAL, ISLAND_YAW, SUN_DIR, localToWorld, sunDirLocal } from './orientation'

describe('orientation', () => {
  it('maps layout-local +Z (the trailhead side) to world +X+Z', () => {
    const w = localToWorld(CAMERA_DIR_LOCAL)
    expect(w[0]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(w[2]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(ISLAND_YAW).toBeCloseTo(Math.PI / 4, 12)
  })

  it('has a unit sun from the upper left of the focus camera', () => {
    expect(Math.hypot(...SUN_DIR)).toBeCloseTo(1, 12)
    expect(SUN_DIR[1]).toBeGreaterThan(0.7)
  })

  it('round-trips the sun through the island yaw', () => {
    const back = localToWorld(sunDirLocal())
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(SUN_DIR[i], 12)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/island --project unit`
Expected: FAIL, "Failed to resolve import './random'" and "'./orientation'".

- [ ] **Step 3: Write the implementation**

`src/lib/island/types.ts`:

```ts
import type { Goal } from '../../features/archipelago/api'

export type Biome = Goal['biome']
export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Hex = `#${string}`

export const WATER_Y = -0.05
export const LAYOUT_VERSION = 1

export type CompositionPattern = 'massif' | 'knoll' | 'shelves'
export type SummitShape = 'plateau' | 'dome' | 'crater'
export type LevelRole = 'shallow' | 'foam' | 'beach' | 'lawn' | 'tier' | 'summit'

export interface Level {
  readonly index: number
  readonly role: LevelRole
  readonly y: number
  readonly wall: 'none' | 'sand' | 'lip' | 'cliff'
}

export interface PolarBlob {
  readonly cx: number
  readonly cz: number
  readonly radius: number
  readonly harmonics: readonly { n: number; amp: number; phase: number }[]
  readonly lobes: readonly { x: number; z: number; r: number }[]
  readonly flutes: { readonly binsPerRadian: number; readonly depth: number; readonly offsets: Float32Array } | null
}

export interface TrailSample {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly s: number
  readonly level: number
  readonly ramp: number
}

export interface RampSpan {
  readonly fromLevel: number
  readonly toLevel: number
  readonly s0: number
  readonly s1: number
  readonly theta: number
  readonly dir: 1 | -1
}

export interface IslandTrail {
  readonly samples: readonly TrailSample[]
  readonly waypoints: readonly Vec3[]
  readonly ramps: readonly RampSpan[]
  readonly halfWidth: number
  readonly length: number
}

export type PropKind =
  | 'palm' | 'canopyTree' | 'pine' | 'bareTree' | 'ashTree' | 'cactus'
  | 'bush' | 'fernRosette' | 'grassTuft' | 'flower' | 'mushroom' | 'heather' | 'coralPuff' | 'anemone'
  | 'stump' | 'log' | 'heroRock' | 'boulder' | 'waterRock' | 'lily' | 'iceFloe'
  | 'tent' | 'campfire' | 'signpost' | 'summitCairn'

export interface PropPlacement {
  readonly kind: PropKind
  readonly x: number
  readonly y: number
  readonly z: number
  readonly rotY: number
  readonly scale: number
  readonly tiltX: number
  readonly tiltZ: number
}

export interface PillarSpec { readonly x: number; readonly z: number; readonly r: number; readonly baseY: number; readonly topY: number; readonly sides: 6 | 7; readonly grassCap: boolean; readonly rot: number }
export interface VineSpec { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number; readonly length: number }
export interface CaveSpec { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number; readonly width: number; readonly height: number }
export interface WaterRockSpec { readonly x: number; readonly z: number; readonly r: number; readonly height: number; readonly rot: number }
export interface FallSpec { readonly samples: readonly Vec3[]; readonly dir: Vec2; readonly kind: 'water' | 'lava' }
export interface DiscSpec { readonly x: number; readonly z: number; readonly r: number; readonly y: number }

export interface IslandFeatures {
  readonly shelf: { readonly blob: PolarBlob; readonly y: number; readonly baseY: number } | null
  readonly crater: { readonly x: number; readonly z: number; readonly r: number; readonly plugY: number } | null
  readonly pool: (DiscSpec & { readonly kind: 'tide' | 'ember' | 'lagoon' }) | null
  readonly fall: FallSpec | null
  readonly pillars: readonly PillarSpec[]
  readonly vines: readonly VineSpec[]
  readonly caves: readonly CaveSpec[]
  readonly waterRocks: readonly WaterRockSpec[]
  readonly camp: { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number } | null
}

export interface HeightGrid {
  readonly origin: Vec2
  readonly cell: number
  readonly size: number
  readonly heights: Float32Array
}

export interface IslandLayout {
  readonly version: number
  readonly biome: Biome
  readonly seed: number
  readonly pattern: CompositionPattern
  readonly front: number
  readonly side: 1 | -1
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly footprintRadius: number
  readonly haloRadius: number
  readonly summit: Vec3
  readonly summitTopY: number
  readonly trail: IslandTrail
  readonly features: IslandFeatures
  readonly props: readonly PropPlacement[]
  readonly heightGrid: HeightGrid
  readonly sdAt: (x: number, z: number) => Float64Array
  readonly levelAt: (x: number, z: number) => number
  readonly terraceY: (x: number, z: number) => number
  readonly groundHeightAt: (x: number, z: number) => number
  readonly pathProject: (x: number, z: number) => { d: number; y: number; s: number }
  readonly walkableRun: (x: number, z: number, dirX: number, dirZ: number, refY: number, maxDist: number) => number
}

/** The slice of a layout that curve.ts needs; keeps roadmap code off the rest of the type. */
export type GroundQuery = Pick<IslandLayout, 'groundHeightAt' | 'walkableRun'>
```

`src/lib/island/random.ts`:

```ts
import { hash01 } from '../archipelago'

export interface Stream {
  next(): number
  range(min: number, max: number): number
  int(min: number, maxInclusive: number): number
  pick<T>(items: readonly T[]): T
  sign(): 1 | -1
}

/** Salted sub-stream over hash01 (spec §3.3): each subsystem draws from its own salt, so retuning one never reshuffles another. */
export function createStream(seed: number, salt: number): Stream {
  let counter = 0
  const next = () => hash01(seed, counter++, salt)
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.min(maxInclusive - min, Math.floor(next() * (maxInclusive - min + 1))),
    pick: (items) => items[Math.min(items.length - 1, Math.floor(next() * items.length))],
    sign: () => (next() < 0.5 ? 1 : -1),
  }
}

/** Smooth 2D value noise in [0, 1] on a unit lattice. */
export function valueNoise2(seed: number, salt: number): (x: number, z: number) => number {
  const lattice = (xi: number, zi: number) => hash01(seed + xi * 131, zi, salt)
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x, z) => {
    const xi = Math.floor(x)
    const zi = Math.floor(z)
    const fx = fade(x - xi)
    const fz = fade(z - zi)
    const a = lattice(xi, zi)
    const b = lattice(xi + 1, zi)
    const c = lattice(xi, zi + 1)
    const d = lattice(xi + 1, zi + 1)
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
}
```

`src/lib/island/orientation.ts`:

```ts
import type { Vec3 } from './types'

/** Terraced islands render at this fixed yaw so layout-local +Z (the trailhead side) faces world +X+Z, where the focus camera arrives from. */
export const ISLAND_YAW = Math.PI / 4

const SUN_RAW: Vec3 = [-0.2, 0.8, 0.55]
const SUN_LEN = Math.hypot(...SUN_RAW)
export const SUN_DIR: Vec3 = [SUN_RAW[0] / SUN_LEN, SUN_RAW[1] / SUN_LEN, SUN_RAW[2] / SUN_LEN]

export const CAMERA_DIR_LOCAL: Vec3 = [0, 0, 1]

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

export function localToWorld(v: Vec3): Vec3 {
  return rotateY(v, ISLAND_YAW)
}

export function sunDirLocal(): Vec3 {
  return rotateY(SUN_DIR, -ISLAND_YAW)
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/lib/island --project unit && npm run typecheck`
Expected: 7 tests pass; typecheck clean.

- [ ] **Step 5: Stage**

```bash
git add src/lib/island/types.ts src/lib/island/random.ts src/lib/island/orientation.ts src/lib/island/random.test.ts src/lib/island/orientation.test.ts
```

---

### Task 2: Housekeeping: water fix, shared scene environment, DEV-only routes

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md` (§3 and §4 headings)
- Modify: `src/features/archipelago/Water.tsx` (full replacement)
- Create: `src/features/archipelago/SceneEnvironment.tsx`
- Modify: `src/features/archipelago/ArchipelagoScene.tsx`
- Modify: `src/App.tsx`
- Delete: `src/features/archipelago/DevIslandPreview.tsx`

**Interfaces:**
- Consumes: `WATER_Y` (Task 1), `SUN_DIR` (Task 1).
- Produces: `SceneEnvironment()` (hemisphere light, key light at `SUN_DIR·20`, water). Used by `ArchipelagoScene` and Task 3's `DevIslandView`.

- [ ] **Step 1: Add the supersession notes**

In `docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md`, add this line directly under the `## 3. Island composition system` heading and again under `## 4. Technical approach — procedural geometry, not sourced assets`:

```markdown
> **Superseded by `2026-09-23-cairn-terraced-islands-design.md`** (the composition recipe here, and the prop/marker parts of §4). §1, §2, §5 and §4's procedural-geometry principle still apply.
```

- [ ] **Step 2: Replace `Water.tsx`**

The disc spun with `rotation.y` on a mesh already turned −π/2 about X, which tilts the sea over time (≈0.4 rad after 20 s). It becomes opaque, unlit and static:

```tsx
import { WATER_Y } from '../../lib/island/types'

/**
 * Opaque, unlit Soft Lagoon water. Foam and the shallow halo sit a few millimetres above it, so polygonOffset
 * pushes the disc back in depth rather than relying on those tiny height gaps. It no longer spins: a rotation.y on
 * a disc already turned -π/2 about X tilted the sea over time.
 */
export function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} raycast={() => null}>
      <circleGeometry args={[60, 64]} />
      <meshBasicMaterial color="#6BC2C9" toneMapped={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}
```

- [ ] **Step 3: Create `SceneEnvironment.tsx`**

```tsx
import { SUN_DIR } from '../../lib/island/orientation'
import { Water } from './Water'

const SUN_POSITION: [number, number, number] = [SUN_DIR[0] * 20, SUN_DIR[1] * 20, SUN_DIR[2] * 20]

/** Lights and water shared by the app and the dev harness so the two can't drift apart (spec §2.5, §5.4). */
export function SceneEnvironment() {
  return (
    <>
      <hemisphereLight args={['#EAF6F6', '#6BC2C9', 0.7]} />
      <directionalLight position={SUN_POSITION} intensity={1.15} />
      <Water />
    </>
  )
}
```

- [ ] **Step 4: Use it in `ArchipelagoScene.tsx` with a flat canvas**

Replace the import `import { Water } from './Water'` with `import { SceneEnvironment } from './SceneEnvironment'`, and replace

```tsx
      <Canvas camera={{ fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        <Water />
```

with

```tsx
      <Canvas camera={{ fov: 50 }} flat>
        <SceneEnvironment />
```

(`flat` turns tone mapping off so authored hexes render as specified, spec §2.5.)

- [ ] **Step 5: Gate the dev routes behind DEV and delete the old preview**

Delete `src/features/archipelago/DevIslandPreview.tsx`. `src/App.tsx` becomes (the `/dev/island/:biome` route's component is created in Task 3; until then this file does not compile, so do Task 3 Step 3 before running the typecheck):

```tsx
import { lazy, Suspense, useState } from 'react'
import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { ArchipelagoScene } from './features/archipelago/ArchipelagoScene'
import { HomeOverlay } from './features/archipelago/HomeOverlay'
import { NotFoundPage } from './features/NotFoundPage'

// DEV-only harnesses: lazy so production builds tree-shake them out entirely.
const DevIslandView = import.meta.env.DEV ? lazy(() => import('./features/dev/DevIslandView').then((m) => ({ default: m.DevIslandView }))) : null
const DevSpikePreview = import.meta.env.DEV
  ? lazy(() => import('./features/archipelago/spikes/DevSpikePreview').then((m) => ({ default: m.DevSpikePreview })))
  : null

export function App() {
  const [showCompleted, setShowCompleted] = useState(true)
  const toggleShowCompleted = () => setShowCompleted((value) => !value)

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {DevIslandView ? (
        <Route path="/dev/island/:biome" element={<Suspense fallback={null}><DevIslandView /></Suspense>} />
      ) : null}
      {DevSpikePreview ? (
        <Route path="/dev/spike/:name" element={<Suspense fallback={null}><DevSpikePreview /></Suspense>} />
      ) : null}
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

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test && npm run build` (after Task 3 Step 3 exists).
Expected: clean. Then `npm run dev`, open `http://localhost:5173/`, sign in and confirm the water is a flat, opaque `#6BC2C9` sea that no longer tilts after a minute, and the legacy islands still render.

- [ ] **Step 7: Stage**

```bash
git add docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md src/features/archipelago/Water.tsx src/features/archipelago/SceneEnvironment.tsx src/features/archipelago/ArchipelagoScene.tsx src/App.tsx
git rm src/features/archipelago/DevIslandPreview.tsx
```

---

### Task 3: Dev island route and the headless render loop

**Files:**
- Create: `src/features/dev/devParams.ts`, `src/features/dev/fixtures.ts`, `src/features/dev/DevIslandView.tsx`, `scripts/render-island.mjs`
- Modify: `src/features/archipelago/Island.tsx` (a `seedOverride` prop)
- Modify: `package.json` (`render:island` script)
- Test: `src/features/dev/devParams.test.ts`

**Interfaces:**
- Consumes: `SceneEnvironment` (Task 2).
- Produces: `DevView`, `DevParams`, `parseDevParams(search)` (Task 3 fields: `seed`, `view` ∈ hero/side/top/back, `dist`), `devGoal(biome, seed): Goal`, route `/dev/island/:biome`, `npm run render:island -- <biome> <seed> <view> [key=value ...] [--out <dir>]`. Tasks 17–19 extend `devParams.ts`/`fixtures.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { parseDevParams } from './devParams'

describe('parseDevParams', () => {
  it('defaults to seed 1, hero view, unit distance', () => {
    expect(parseDevParams(new URLSearchParams(''))).toEqual({ seed: 1, view: 'hero', dist: 1 })
  })

  it('reads seed, view and distance', () => {
    expect(parseDevParams(new URLSearchParams('seed=42&view=top&dist=1.5'))).toEqual({ seed: 42, view: 'top', dist: 1.5 })
  })

  it('falls back on junk values', () => {
    expect(parseDevParams(new URLSearchParams('seed=abc&view=sideways&dist=-3'))).toEqual({ seed: 1, view: 'hero', dist: 0.2 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/dev --project unit`
Expected: FAIL, cannot resolve `./devParams`.

- [ ] **Step 3: Implement the params, fixture goal and view**

`src/features/dev/devParams.ts`:

```ts
export type DevView = 'hero' | 'side' | 'top' | 'back'

export interface DevParams {
  readonly seed: number
  readonly view: DevView
  readonly dist: number
}

const VIEWS: readonly DevView[] = ['hero', 'side', 'top', 'back']

function number(search: URLSearchParams, key: string, fallback: number): number {
  const raw = search.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseDevParams(search: URLSearchParams): DevParams {
  const view = search.get('view') as DevView | null
  return {
    seed: Math.max(0, Math.floor(number(search, 'seed', 1))),
    view: view && VIEWS.includes(view) ? view : 'hero',
    dist: Math.max(0.2, number(search, 'dist', 1)),
  }
}
```

`src/features/dev/fixtures.ts`:

```ts
import type { Goal } from '../archipelago/api'

/** A goal at the world origin with no backend behind it, for the dev harness. `seed` only labels it; rendering uses seedOverride. */
export function devGoal(biome: Goal['biome'], seed: number): Goal {
  return {
    id: `dev-${biome}-${seed}`,
    title: `${biome[0].toUpperCase()}${biome.slice(1)} ${seed}`,
    description: null,
    biome,
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: 5.5,
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
  }
}
```

`src/features/dev/DevIslandView.tsx`:

```tsx
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Goal } from '../archipelago/api'
import { Island } from '../archipelago/Island'
import { SceneEnvironment } from '../archipelago/SceneEnvironment'
import { devGoal } from './fixtures'
import { parseDevParams } from './devParams'
import type { DevView } from './devParams'

const BIOMES: readonly Goal['biome'][] = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands']

const PRESETS: Record<DevView, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [8.5, 7.5, 8.5], target: [0, 1.0, 0] },
  side: { position: [11, 3.2, 0.5], target: [0, 1.2, 0] },
  top: { position: [0.01, 15, 0.01], target: [0, 0, 0] },
  back: { position: [-8.5, 6.5, -8.5], target: [0, 1.0, 0] },
}

/** DEV-only visual harness (spec §10): the real scene environment and island, no auth or data round trip. */
export function DevIslandView() {
  const { biome: raw = 'jungle' } = useParams()
  const biome = BIOMES.includes(raw as Goal['biome']) ? (raw as Goal['biome']) : 'jungle'
  const [search] = useSearchParams()
  const params = parseDevParams(search)
  const preset = PRESETS[params.view]
  const position = preset.position.map((p, i) => preset.target[i] + (p - preset.target[i]) * params.dist) as [number, number, number]
  const goal = devGoal(biome, params.seed)

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas flat camera={{ position, fov: 50 }}>
        <SceneEnvironment />
        <Suspense fallback={null}>
          <Island goal={goal} onClick={() => undefined} seedOverride={params.seed} />
        </Suspense>
        <OrbitControls target={preset.target} />
      </Canvas>
    </div>
  )
}
```

In `src/features/archipelago/Island.tsx`, add the prop and use it for the (legacy) props seed:

```tsx
interface IslandProps {
  goal: Goal
  onClick: () => void
  focused?: boolean
  /** DEV harness only: render this seed instead of the one derived from the goal id. */
  seedOverride?: number
}
```

```tsx
export function Island({ goal, onClick, focused = false, seedOverride }: IslandProps) {
```

```tsx
        <Props seed={seedOverride ?? hashGoalId(goal.id)} count={PROP_COUNT_BY_BIOME[goal.biome]} />
```

- [ ] **Step 4: Add the render script**

`scripts/render-island.mjs`:

```js
// Headless screenshots of the DEV island route (spec §10). Assumes `npm run dev` is already serving on :5173.
// Usage: npm run render:island -- <biome> <seed> <view> [key=value ...] [--out <dir>]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outArg = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined
const outDir = resolve(outArg ?? join(tmpdir(), 'cairn-renders', new Date().toISOString().slice(0, 10)))
const [biome = 'jungle', seed = '1', view = 'hero', ...extra] = args
const query = extra.join('&')
const baseUrl = process.env.CAIRN_DEV_URL ?? 'http://localhost:5173'

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const size = view === 'phone' ? '390,844' : '1280,800'
const url = `${baseUrl}/dev/island/${biome}?seed=${seed}&view=${view}${query ? `&${query}` : ''}`
const suffix = query ? `-${query.replace(/[^a-z0-9]+/gi, '_')}` : ''
const file = join(outDir, `${biome}-${seed}-${view}${suffix}.png`)
const chromeArgs = [
  '--headless=new',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--window-size=${size}`,
  '--virtual-time-budget=8000',
  `--screenshot=${file}`,
  url,
]
const result = spawnSync(chrome, chromeArgs, { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(file)
```

In `package.json` `scripts`, add after `"assets:process"`:

```json
    "render:island": "node scripts/render-island.mjs"
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/features/dev --project unit && npm run typecheck && npm test && npm run build`
Expected: 3 dev tests pass; everything clean. `npm run build` must not contain the dev harness: `grep -l DevIslandView dist/assets/*.js` prints nothing.

With `npm run dev` running in another terminal: `npm run render:island -- jungle 1 hero`
Expected: prints a PNG path under your temp dir `cairn-renders/<date>/` showing today's (legacy) jungle island on the flat sea.

- [ ] **Step 6: Stage**

```bash
git add src/features/dev/devParams.ts src/features/dev/devParams.test.ts src/features/dev/fixtures.ts src/features/dev/DevIslandView.tsx scripts/render-island.mjs src/features/archipelago/Island.tsx package.json
```

---

### Task 4: Biome terrain configs and palettes

**Files:**
- Create: `src/lib/island/biomes.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `TierRecipe`, `PropRule`, `TerrainPalette`, `BiomeTerrainConfig`, `SHARED_PALETTE`, `PATTERN_PRESETS`, `BIOME_TERRAIN`, `isTerraced(biome)`, `propRule(biome, kind)`. Jungle is complete; the other five are stubs (deviation 11).

- [ ] **Step 1: Write `biomes.ts`**

Every hex is verbatim from spec §2.6. `JUNGLE_TERRAIN` is shared by the stubs.

```ts
import type { Biome, CompositionPattern, Hex, PropKind, SummitShape } from './types'

export interface TierRecipe {
  readonly y: number
  /** blob radius / radius of the blob one level down (the beach blob for the first tier) */
  readonly radiusRatio: number
  /** centre offset from the tier below along `drift` */
  readonly drift: number
  readonly ledge: { readonly back: number; readonly front: number }
  readonly harmonicAmp: number
}

export interface PropRule {
  readonly kind: PropKind
  readonly count: number
  readonly key?: boolean
  readonly levels: readonly ('beach' | 'lawn' | 'tier' | 'summit' | 'water')[]
  readonly spacing: number
  readonly pathClear: number
  readonly edge?: readonly [number, number]
  readonly cliffFoot?: readonly [number, number]
  readonly facing?: 'front' | 'back' | 'any'
  readonly scale: readonly [number, number]
  readonly height: number
  readonly tilt?: number
  readonly overview: boolean
}

export interface TerrainPalette {
  readonly lawn: Hex; readonly cap: Hex; readonly capLight: Hex; readonly capDark: Hex; readonly lip: Hex
  readonly cliff: Hex; readonly cliffLit: Hex; readonly cliffShade: Hex; readonly cliffRim: Hex; readonly cliffBase: Hex; readonly crevice: Hex
  readonly path: Hex; readonly pathEdge: Hex; readonly tread: Hex; readonly pillar: Hex; readonly pillarCap: Hex
  readonly pool: Hex | null; readonly fall: Hex | null; readonly fallStreak: Hex | null
  readonly foliage: Readonly<Record<string, Hex>>
}

export interface BiomeTerrainConfig {
  readonly pattern: CompositionPattern
  readonly beach: { readonly radius: readonly [number, number]; readonly width: { readonly back: number; readonly front: number }; readonly harmonicAmp: number; readonly spit: boolean }
  readonly lawnY: number
  readonly tiers: readonly TierRecipe[]
  readonly summit: { readonly shape: SummitShape; readonly domeHeight?: number; readonly domeRadius?: number; readonly craterRadius?: number; readonly plugY?: number }
  readonly cliff: { readonly binsPerRadian: number; readonly fluteDepth: number; readonly slabChance: number; readonly lean: number; readonly baseBand: readonly [number, number] }
  readonly features: {
    readonly shelf?: { readonly y: number; readonly radius: number }
    readonly fall?: 'water' | 'lava'
    readonly pool?: 'tide' | 'ember' | 'lagoon'
    readonly cave: boolean
    readonly pillars: number
    readonly vines: number
    readonly waterRocks: number
    readonly camp: boolean
  }
  readonly props: readonly PropRule[]
  readonly palette: TerrainPalette
  readonly previewSeed: number
}

export const SHARED_PALETTE = {
  water: '#6BC2C9', shallow: '#8FD4D9', foam: '#FFFFFF', foamEdge: '#DDF3F4',
  sand: '#EFCB8E', sandWall: '#DDB677', trailDone: '#3A7D77',
  cairnPending: '#CFC8BA', cairnNext: '#F6A9A0', cairnDone: '#5FBFA8',
  pennantFlag: '#F6A9A0', pennantPole: '#FFF4DA', entry: '#FFF4DA',
} as const

const PRESET = { shallowY: -0.042, foamY: -0.036, beachY: 0.04 } as const
export const PATTERN_PRESETS: Record<CompositionPattern, typeof PRESET> = { massif: PRESET, knoll: PRESET, shelves: PRESET }

// Landmarks are placed by scatter.ts's landmark pass, not by rejection sampling; their rules only carry size.
const LANDMARKS: readonly PropRule[] = [
  { kind: 'signpost', count: 1, levels: ['beach', 'lawn'], spacing: 0.3, pathClear: 0.05, scale: [1, 1], height: 0.34, overview: true },
  { kind: 'summitCairn', count: 1, levels: ['summit'], spacing: 0.3, pathClear: 0, scale: [1, 1], height: 0.3, overview: true },
  { kind: 'tent', count: 1, levels: ['lawn', 'tier'], spacing: 0.4, pathClear: 0.1, scale: [1, 1], height: 0.2, overview: true },
  { kind: 'campfire', count: 1, levels: ['lawn', 'tier'], spacing: 0.2, pathClear: 0.1, scale: [1, 1], height: 0.06, overview: false },
]

function stubProps(tall: PropKind, cover: PropKind): readonly PropRule[] {
  return [
    ...LANDMARKS,
    { kind: tall, count: 8, key: true, levels: ['lawn', 'tier', 'summit'], spacing: 0.5, pathClear: 0.28, edge: [0.1, 9], scale: [0.85, 1.15], height: 0.5, overview: true },
    { kind: cover, count: 8, levels: ['lawn', 'tier', 'summit'], spacing: 0.3, pathClear: 0.08, edge: [0.12, 9], scale: [0.85, 1.15], height: 0.12, overview: false },
  ]
}

function palette(p: Omit<TerrainPalette, 'foliage'>, foliage: Record<string, Hex>): TerrainPalette {
  return { ...p, foliage }
}

const JUNGLE_PROPS: readonly PropRule[] = [
  ...LANDMARKS,
  { kind: 'stump', count: 1, levels: ['summit'], spacing: 0.4, pathClear: 0.2, scale: [1, 1], height: 0.16, overview: true },
  { kind: 'heroRock', count: 1, levels: ['lawn'], spacing: 0.7, pathClear: 0.25, scale: [1, 1], height: 0.36, overview: true },
  { kind: 'palm', count: 6, key: true, levels: ['lawn', 'tier', 'summit'], spacing: 0.6, pathClear: 0.3, edge: [0.1, 0.45], scale: [0.82, 1.17], height: 0.68, tilt: 0.24, overview: true },
  { kind: 'canopyTree', count: 16, levels: ['lawn', 'tier', 'summit'], spacing: 0.32, pathClear: 0.28, edge: [0.06, 9], facing: 'back', scale: [0.8, 1.2], height: 0.58, overview: true },
  { kind: 'bush', count: 12, key: true, levels: ['lawn', 'tier'], spacing: 0.26, pathClear: 0.12, cliffFoot: [0.1, 0.55], scale: [0.78, 1.22], height: 0.2, overview: true },
  { kind: 'log', count: 1, levels: ['lawn'], spacing: 0.6, pathClear: 0.25, edge: [0.3, 9], scale: [0.9, 1.1], height: 0.1, overview: true },
  { kind: 'fernRosette', count: 12, levels: ['lawn', 'tier', 'summit'], spacing: 0.5, pathClear: 0.1, edge: [0.2, 9], scale: [0.85, 1.15], height: 0.08, overview: false },
  { kind: 'flower', count: 8, levels: ['lawn', 'tier'], spacing: 0.25, pathClear: 0.06, edge: [0.15, 9], scale: [0.85, 1.15], height: 0.12, overview: false },
  { kind: 'mushroom', count: 3, levels: ['lawn', 'tier'], spacing: 0.3, pathClear: 0.1, cliffFoot: [0.12, 0.35], scale: [0.85, 1.15], height: 0.1, overview: false },
  { kind: 'grassTuft', count: 10, levels: ['lawn', 'tier', 'summit'], spacing: 0.3, pathClear: 0.04, edge: [0.1, 9], scale: [0.8, 1.2], height: 0.1, overview: false },
  { kind: 'lily', count: 3, levels: ['water'], spacing: 0.4, pathClear: 0.3, scale: [0.9, 1.2], height: 0.02, overview: false },
]

const CLIFF_DEFAULT = { baseBand: [0.26, 0.4] as const }

// The five non-jungle biomes reuse the jungle terrain recipe until the next plan tunes their own patterns (spec §11 Phase 6).
const JUNGLE_TERRAIN = {
    pattern: 'massif',
    beach: { radius: [2.45, 2.65], width: { back: 0.16, front: 0.5 }, harmonicAmp: 0.1, spit: true },
    lawnY: 0.16,
    tiers: [
      { y: 1.1, radiusRatio: 0.74, drift: 0.62, ledge: { back: 0.28, front: 0.9 }, harmonicAmp: 0.09 },
      { y: 2.1, radiusRatio: 0.7, drift: 0.5, ledge: { back: 0.3, front: 0.85 }, harmonicAmp: 0.08 },
    ],
    summit: { shape: 'plateau' },
    cliff: { binsPerRadian: 5.5, fluteDepth: 0.035, slabChance: 0.12, lean: 0.06, ...CLIFF_DEFAULT },
    features: { shelf: { y: 1.6, radius: 0.55 }, fall: 'water', pool: 'tide', cave: true, pillars: 4, vines: 8, waterRocks: 5, camp: true },
} as const

export const BIOME_TERRAIN: Record<Biome, BiomeTerrainConfig> = {
  jungle: {
    ...JUNGLE_TERRAIN,
    props: JUNGLE_PROPS,
    palette: palette(
      {
        lawn: '#78C487', cap: '#6FBF84', capLight: '#86CE93', capDark: '#579F6F', lip: '#5E9F6E',
        cliff: '#A8735A', cliffLit: '#B27C61', cliffShade: '#9A6750', cliffRim: '#C08A6C', cliffBase: '#7E5443', crevice: '#5A3B30',
        path: '#D9C08A', pathEdge: '#CDAE78', tread: '#B98452', pillar: '#9C6A52', pillarCap: '#B8836A',
        pool: '#BEE8EA', fall: '#BEE8EA', fallStreak: '#FFFFFF',
      },
      {
        palmTrunk: '#B98452', palmRing: '#A6743F', frond: '#4E8F6E', frondTip: '#7BC98C',
        canopy: '#3F7F86', canopyShade: '#336B73', canopyTop: '#5A9AA0', canopyTrunk: '#8B6B4A',
        bush: '#5FA877', fern: '#4E8F6E', vine: '#4E8F6E', vineLeaf: '#7BC98C',
        flower: '#F6A9A0', flowerCentre: '#FFF4DA', mushroom: '#F6A9A0', mushroomStem: '#FFF4DA',
        stump: '#B98452', stumpInner: '#D9B07A', stumpMoss: '#7BC98C', heroRock: '#A8735A', heroRockMoss: '#9FD27A',
        tent: '#F6A9A0', tentDoor: '#5A3B30', campfireStone: '#CFC8BA', ember: '#F2A25C',
        log: '#B98452', lily: '#5FA877', grass: '#5FA877',
      },
    ),
    previewSeed: 1,
  },
  volcano: {
    ...JUNGLE_TERRAIN,
    props: stubProps('ashTree', 'fernRosette'),
    palette: palette(
      {
        lawn: '#93A78C', cap: '#A4948A', capLight: '#B3A59B', capDark: '#8E7F76', lip: '#86A382',
        cliff: '#7A6259', cliffLit: '#86706A', cliffShade: '#6C574F', cliffRim: '#947D73', cliffBase: '#5C4A42', crevice: '#3F322D',
        path: '#C9B49A', pathEdge: '#B39E86', tread: '#5C4A42', pillar: '#5C4A42', pillarCap: '#7A6259',
        pool: '#F2A25C', fall: '#F2A25C', fallStreak: '#F7C08A',
      },
      { ashTree: '#5C4A42', ashCanopy: '#6F8F6A', fern: '#6F8F6A', boulder: '#6C574F' },
    ),
    previewSeed: 1,
  },
  desert: {
    ...JUNGLE_TERRAIN,
    props: stubProps('cactus', 'bush'),
    palette: palette(
      {
        lawn: '#E8C893', cap: '#E3C088', capLight: '#EBCD9C', capDark: '#D6AF74', lip: '#C9A56A',
        cliff: '#D39A6A', cliffLit: '#DDA878', cliffShade: '#C08858', cliffRim: '#E6B488', cliffBase: '#A8704A', crevice: '#7E4F33',
        path: '#F0DDB4', pathEdge: '#D9BE8C', tread: '#B98452', pillar: '#CC9160', pillarCap: '#E3C088',
        pool: null, fall: null, fallStreak: null,
      },
      { palmCrown: '#8FA95C', palmTrunk: '#B98452', cactus: '#7FA36A', bush: '#A7B86E', flower: '#F6A9A0' },
    ),
    previewSeed: 1,
  },
  tundra: {
    ...JUNGLE_TERRAIN,
    props: stubProps('pine', 'bush'),
    palette: palette(
      {
        lawn: '#E8F1F3', cap: '#F4FAFB', capLight: '#FFFFFF', capDark: '#D3E3E6', lip: '#C9DCDE',
        cliff: '#8F9EA3', cliffLit: '#A2AFB3', cliffShade: '#7F8D92', cliffRim: '#B7C3C6', cliffBase: '#66747A', crevice: '#4B565B',
        path: '#C8B9A6', pathEdge: '#B3A38F', tread: '#8B7362', pillar: '#8F9EA3', pillarCap: '#F4FAFB',
        pool: null, fall: null, fallStreak: null,
      },
      { pine: '#5E8C7E', pineShade: '#4F7A6E', bark: '#8B7362', canopy: '#C9DCDE', bush: '#A9C4C0', floe: '#F4FAFB' },
    ),
    previewSeed: 1,
  },
  reef: {
    ...JUNGLE_TERRAIN,
    props: stubProps('palm', 'coralPuff'),
    palette: palette(
      {
        lawn: '#F4DDAE', cap: '#F4DDAE', capLight: '#F8E7C4', capDark: '#E8CC96', lip: '#9ED6B4',
        cliff: '#E2B596', cliffLit: '#EAC2A5', cliffShade: '#D3A284', cliffRim: '#F0CFB5', cliffBase: '#B98A70', crevice: '#8E6552',
        path: '#FFF1D6', pathEdge: '#E6CFA2', tread: '#C9957A', pillar: '#E2B596', pillarCap: '#F4DDAE',
        pool: '#8FD4D9', fall: null, fallStreak: null,
      },
      { frond: '#5FA877', coral: '#F6A9A0', coralAlt: '#F4B98C', anemone: '#5FBFA8', seagrass: '#9ED6B4' },
    ),
    previewSeed: 1,
  },
  highlands: {
    ...JUNGLE_TERRAIN,
    props: stubProps('pine', 'heather'),
    palette: palette(
      {
        lawn: '#A6BC92', cap: '#9DB58A', capLight: '#AFC49C', capDark: '#879F76', lip: '#7F9A6C',
        cliff: '#A39C8E', cliffLit: '#B3AC9E', cliffShade: '#8E877A', cliffRim: '#C7BFAE', cliffBase: '#6F695F', crevice: '#524D46',
        path: '#D8CCB2', pathEdge: '#C2B599', tread: '#8B7362', pillar: '#8B8FA0', pillarCap: '#C7BFAE',
        pool: null, fall: null, fallStreak: null,
      },
      { heather: '#A98FB0', heatherAlt: '#8B8FA0', pine: '#5E7F6E', bush: '#7F9A6C' },
    ),
    previewSeed: 1,
  },
}

export function isTerraced(biome: Biome): boolean {
  return biome === 'jungle'
}

export function propRule(biome: Biome, kind: PropKind): PropRule | undefined {
  return BIOME_TERRAIN[biome].props.find((rule) => rule.kind === kind)
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean. (Behaviour is covered by Task 9's sweep.)

- [ ] **Step 3: Stage**

```bash
git add src/lib/island/biomes.ts
```

---

### Task 5: Signed-distance shapes and the nested level field

**Files:**
- Create: `src/lib/island/shapes.ts`
- Test: `src/lib/island/shapes.test.ts`

**Interfaces:**
- Consumes: `Level`, `PolarBlob`, `WATER_Y` (Task 1).
- Produces: `FIELD_SOFTNESS`, `FOOTPRINT_MAX`, `FOAM_MAX`, `HALO_MAX`, `MIN_BEACH_WIDTH`, `BEACH = 2`, `LAWN = 3` (level indices), `wrapPi`, `wrapPositive`, `smoothstep`, `angularWindow`, `fluteOffset`, `blobSd`, `scaleBlob`, `RaiseWindow`, `LedgeSpec`, `ChainParams`, `LevelField { count, sdAt, levelAt, levelTopY, terraceY, classField }`, `buildLevelField(params)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { PolarBlob } from './types'
import { angularWindow, blobSd, fluteOffset, wrapPi } from './shapes'

const circle: PolarBlob = { cx: 1, cz: -1, radius: 2, harmonics: [], lobes: [], flutes: null }

describe('blobSd', () => {
  it('is the signed distance of a plain circle, positive inside', () => {
    expect(blobSd(circle, 1, -1)).toBeCloseTo(2, 12)
    expect(blobSd(circle, 3, -1)).toBeCloseTo(0, 12)
    expect(blobSd(circle, 4, -1)).toBeCloseTo(-1, 12)
  })

  it('unions lobes', () => {
    const withLobe: PolarBlob = { ...circle, lobes: [{ x: 5, z: -1, r: 1 }] }
    expect(blobSd(withLobe, 5, -1)).toBeCloseTo(1, 12)
  })

  it('adds piecewise-linear flutes', () => {
    const offsets = new Float32Array([0.1, -0.1, 0.1, -0.1])
    const flutes = { binsPerRadian: 4 / (Math.PI * 2), depth: 0.1, offsets }
    expect(fluteOffset(flutes, 0)).toBeCloseTo(0.1, 6)
    expect(fluteOffset(flutes, Math.PI / 4)).toBeCloseTo(0, 6)
    expect(blobSd({ ...circle, flutes }, 3, -1)).toBeCloseTo(0.1, 6)
  })
})

describe('angle helpers', () => {
  it('wraps to (-pi, pi]', () => {
    expect(wrapPi(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('windows an arc with a cosine feather', () => {
    expect(angularWindow(0.5, 0, 1, 0.3)).toBe(1)
    expect(angularWindow(1.15, 0, 1, 0.3)).toBeCloseTo(0.5, 6)
    expect(angularWindow(2, 0, 1, 0.3)).toBe(0)
    expect(angularWindow(-0.05, 6.2, 0.2, 0.3)).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/island/shapes.test.ts --project unit`
Expected: FAIL, cannot resolve `./shapes`.

- [ ] **Step 3: Implement**

The chain is spec §3.4. `sd[level]` for a tier is `min(own blob, sd[below] − margin)`, and a raise window only ever increases a margin, so nesting holds by construction. The beach is also capped by `FOOTPRINT_MAX − r`, foam by `FOAM_MAX − r` and the shallow halo by `HALO_MAX − r`.

```ts
import type { Level, PolarBlob } from './types'
import { WATER_Y } from './types'

export const FIELD_SOFTNESS = 0.11
export const FOOTPRINT_MAX = 3.05
export const FOAM_MAX = 3.15
export const HALO_MAX = 3.45
export const MIN_BEACH_WIDTH = 0.16
const TAU = Math.PI * 2

export function wrapPi(a: number): number {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}

export function wrapPositive(a: number): number {
  const x = a % TAU
  return x < 0 ? x + TAU : x
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 1 inside the arc from→to (positive direction), cosine falloff over `feather` radians outside it. */
export function angularWindow(a: number, from: number, to: number, feather: number): number {
  const span = wrapPositive(to - from)
  const d = wrapPositive(a - from)
  if (d <= span) return 1
  const gap = Math.min(TAU - d, d - span)
  if (gap >= feather) return 0
  return 0.5 + 0.5 * Math.cos((gap / feather) * Math.PI)
}

export function fluteOffset(flutes: NonNullable<PolarBlob['flutes']>, theta: number): number {
  const n = flutes.offsets.length
  const f = (wrapPositive(theta) / TAU) * n
  const i = Math.floor(f) % n
  const k = f - Math.floor(f)
  return flutes.offsets[i] * (1 - k) + flutes.offsets[(i + 1) % n] * k
}

export function blobSd(b: PolarBlob, x: number, z: number): number {
  const dx = x - b.cx
  const dz = z - b.cz
  const th = Math.atan2(dz, dx)
  let r = b.radius
  for (const h of b.harmonics) r += b.radius * h.amp * Math.cos(h.n * th + h.phase)
  let sd = r - Math.hypot(dx, dz)
  for (const l of b.lobes) sd = Math.max(sd, l.r - Math.hypot(x - l.x, z - l.z))
  if (b.flutes) sd += fluteOffset(b.flutes, th)
  return sd
}

export function scaleBlob(b: PolarBlob, k: number): PolarBlob {
  return {
    ...b,
    cx: b.cx * k,
    cz: b.cz * k,
    radius: b.radius * k,
    lobes: b.lobes.map((l) => ({ x: l.x * k, z: l.z * k, r: l.r * k })),
  }
}

/** A raised minimum ledge margin over an arc of angles measured about (cx, cz). */
export interface RaiseWindow {
  readonly cx: number
  readonly cz: number
  readonly from: number
  readonly to: number
  readonly feather: number
  readonly value: number
}

export interface LedgeSpec {
  readonly back: number
  readonly front: number
  readonly lean: number
}

export interface ChainParams {
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly front: number
  readonly beachWidth: { readonly back: number; readonly front: number }
  readonly ledges: readonly (LedgeSpec | null)[]
  readonly raises: readonly (readonly RaiseWindow[])[]
  readonly wobble: (x: number, z: number) => number
  readonly crag: (x: number, z: number) => number
  readonly widthNoise: (x: number, z: number) => number
  readonly dome: { readonly level: number; readonly height: number; readonly radius: number } | null
  readonly crater: { readonly x: number; readonly z: number; readonly r: number } | null
}

export interface LevelField {
  readonly count: number
  readonly sdAt: (x: number, z: number) => Float64Array
  readonly levelAt: (x: number, z: number) => number
  readonly levelTopY: (level: number, x: number, z: number, sd?: Float64Array) => number
  readonly terraceY: (x: number, z: number) => number
  readonly classField: (x: number, z: number) => number
}

export const BEACH = 2
export const LAWN = 3

/** Nested signed-distance levels (spec §3.4): each level's region is inside the one below by construction. */
export function buildLevelField(p: ChainParams): LevelField {
  const count = p.levels.length
  const beachBlob = p.blobs[BEACH]!
  const facingAt = (x: number, z: number) => 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - p.front)

  const marginAt = (level: number, x: number, z: number, facing: number) => {
    const ledge = p.ledges[level]!
    let m = ledge.back + (ledge.front - ledge.back) * facing * facing + ledge.lean
    for (const w of p.raises[level]) {
      if (w.value <= m) continue
      const t = angularWindow(Math.atan2(z - w.cz, x - w.cx), w.from, w.to, w.feather)
      if (t > 0) m = Math.max(m, m + (w.value - m) * t)
    }
    return m
  }

  const sdAt = (x: number, z: number) => {
    const out = new Float64Array(count)
    const r = Math.hypot(x, z)
    const facing = facingAt(x, z)
    const wob = p.wobble(x, z)
    const beach = blobSd(beachBlob, x, z) + wob
    out[0] = Math.min(beach + 0.4, HALO_MAX - r)
    out[1] = Math.min(beach + 0.1, FOAM_MAX - r)
    out[BEACH] = Math.min(beach, FOOTPRINT_MAX - r)
    const width = Math.max(MIN_BEACH_WIDTH, p.beachWidth.back + (p.beachWidth.front - p.beachWidth.back) * facing * facing + 0.06 * p.widthNoise(x, z))
    out[LAWN] = out[BEACH] - width
    const crag = p.crag(x, z)
    for (let level = LAWN + 1; level < count; level++) {
      const own = blobSd(p.blobs[level]!, x, z) + 0.8 * wob + crag
      out[level] = Math.min(own, out[level - 1] - marginAt(level, x, z, facing))
    }
    if (p.crater) out[count - 1] = Math.min(out[count - 1], Math.hypot(x - p.crater.x, z - p.crater.z) - p.crater.r)
    return out
  }

  const levelOf = (sd: Float64Array) => {
    let n = 0
    while (n < sd.length && sd[n] > 0) n++
    return n - 1
  }

  const levelTopY = (level: number, x: number, z: number, sd?: Float64Array) => {
    if (level < 0) return WATER_Y
    const y = p.levels[level].y
    if (!p.dome || level !== p.dome.level) return y
    const s = sd ?? sdAt(x, z)
    return y + p.dome.height * smoothstep(0, p.dome.radius, s[level])
  }

  return {
    count,
    sdAt,
    levelAt: (x, z) => levelOf(sdAt(x, z)),
    levelTopY,
    terraceY: (x, z) => {
      const sd = sdAt(x, z)
      return levelTopY(levelOf(sd), x, z, sd)
    },
    classField: (x, z) => {
      const sd = sdAt(x, z)
      let h = 0
      for (let i = 0; i < sd.length; i++) h += Math.min(1, Math.max(0, sd[i] / FIELD_SOFTNESS + 0.5))
      return h
    },
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/island/shapes.test.ts --project unit`
Expected: 5 tests pass.

- [ ] **Step 5: Stage**

```bash
git add src/lib/island/shapes.ts src/lib/island/shapes.test.ts
```

---

### Task 6: Height-oracle queries

**Files:**
- Create: `src/lib/island/query.ts`
- Test: `src/lib/island/query.test.ts`

**Interfaces:**
- Consumes: `HeightGrid`, `Vec3` (Task 1).
- Produces: `PathPoint`, `PathProjection`, `SegmentHash` (`new SegmentHash(points).project(x, z)` → `{ d, y, s }`, `d = Infinity` beyond 0.75), `rayExit(inside, cx, cz, theta, maxR?)`, `walkableRun(groundHeightAt, onLand, x, z, dirX, dirZ, refY, maxDist)`, `GRID_CELL`, `GRID_EXTENT`, `bakeHeightGrid(height)`, `gridHeight(grid, x, z)`, `sunOcclusion(grid, sun, x, y, z)` → fraction of 3 rays blocked.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { SegmentHash, bakeHeightGrid, rayExit, sunOcclusion, walkableRun } from './query'

describe('SegmentHash', () => {
  const path = [0, 1, 2, 3].map((i) => ({ x: i, z: 0, y: i * 0.1, s: i }))
  const hash = new SegmentHash(path)

  it('projects onto the nearest segment with interpolated y and s', () => {
    const p = hash.project(1.5, 0.2)
    expect(p.d).toBeCloseTo(0.2, 12)
    expect(p.y).toBeCloseTo(0.15, 12)
    expect(p.s).toBeCloseTo(1.5, 12)
  })

  it('reports Infinity beyond its reach', () => {
    expect(hash.project(1.5, 3).d).toBe(Infinity)
  })
})

describe('rayExit', () => {
  it('finds a circle boundary to bisection precision', () => {
    expect(rayExit((x, z) => Math.hypot(x, z) < 1.234, 0, 0, 0.7)).toBeCloseTo(1.234, 4)
  })

  it('is 0 when the origin is outside', () => {
    expect(rayExit(() => false, 0, 0, 0)).toBe(0)
  })
})

describe('walkableRun', () => {
  it('stops at the first step higher than 0.03', () => {
    const ground = (x: number) => (x < 0.5 ? 0 : 0.1)
    expect(walkableRun(ground, () => true, 0, 0, 1, 0, 0, 2)).toBeCloseTo(0.48, 6)
  })

  it('stops at water', () => {
    expect(walkableRun(() => 0, (x) => x < 0.3, 0, 0, 1, 0, 0, 2)).toBeCloseTo(0.28, 6)
  })
})

describe('height grid and sun occlusion', () => {
  it('shadows ground next to a tall wall toward the sun', () => {
    const grid = bakeHeightGrid((x) => (x < -0.5 ? 2 : 0))
    const sun = [-0.6, 0.6, 0] as const
    expect(sunOcclusion(grid, sun, -0.3, 0, 0)).toBe(1)
    expect(sunOcclusion(grid, sun, 2.5, 0, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/island/query.test.ts --project unit`
Expected: FAIL, cannot resolve `./query`.

- [ ] **Step 3: Implement**

```ts
import type { HeightGrid, Vec3 } from './types'

const HASH_CELL = 0.25
const HASH_REACH = 3

export interface PathPoint {
  readonly x: number
  readonly z: number
  readonly y: number
  readonly s: number
}

export interface PathProjection {
  d: number
  y: number
  s: number
}

/** Uniform 0.25-cell grid of trail segments; answers nearest-segment queries within 0.75 in O(1). */
export class SegmentHash {
  private readonly cells = new Map<number, number[]>()

  constructor(private readonly points: readonly PathPoint[]) {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]
      const b = points[i + 1]
      const i0 = Math.floor(Math.min(a.x, b.x) / HASH_CELL)
      const i1 = Math.floor(Math.max(a.x, b.x) / HASH_CELL)
      const j0 = Math.floor(Math.min(a.z, b.z) / HASH_CELL)
      const j1 = Math.floor(Math.max(a.z, b.z) / HASH_CELL)
      for (let ci = i0; ci <= i1; ci++) {
        for (let cj = j0; cj <= j1; cj++) {
          const key = SegmentHash.key(ci, cj)
          const list = this.cells.get(key)
          if (list) list.push(i)
          else this.cells.set(key, [i])
        }
      }
    }
  }

  private static key(i: number, j: number): number {
    return (i + 512) * 1024 + (j + 512)
  }

  /** Nearest point on the polyline: distance, interpolated y and arc length. d is Infinity beyond 0.75. */
  project(x: number, z: number): PathProjection {
    const ci = Math.floor(x / HASH_CELL)
    const cj = Math.floor(z / HASH_CELL)
    let best: PathProjection = { d: Infinity, y: NaN, s: NaN }
    const seen = new Set<number>()
    for (let di = -HASH_REACH; di <= HASH_REACH; di++) {
      for (let dj = -HASH_REACH; dj <= HASH_REACH; dj++) {
        const list = this.cells.get(SegmentHash.key(ci + di, cj + dj))
        if (!list) continue
        for (const i of list) {
          if (seen.has(i)) continue
          seen.add(i)
          const a = this.points[i]
          const b = this.points[i + 1]
          const ex = b.x - a.x
          const ez = b.z - a.z
          const l2 = ex * ex + ez * ez || 1e-12
          const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2))
          const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t)
          if (d < best.d) best = { d, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t }
        }
      }
    }
    return best
  }
}

/** Distance along a ray from (cx, cz) at which `inside` first turns false: 0.08 march then 14 bisection steps. */
export function rayExit(inside: (x: number, z: number) => boolean, cx: number, cz: number, theta: number, maxR = 4.5): number {
  const dx = Math.cos(theta)
  const dz = Math.sin(theta)
  if (!inside(cx, cz)) return 0
  let hi = 0.08
  while (hi < maxR && inside(cx + dx * hi, cz + dz * hi)) hi += 0.08
  if (hi >= maxR) return maxR
  let lo = hi - 0.08
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (inside(cx + dx * mid, cz + dz * mid)) lo = mid
    else hi = mid
  }
  return lo
}

export function walkableRun(
  groundHeightAt: (x: number, z: number) => number,
  onLand: (x: number, z: number) => boolean,
  x: number, z: number, dirX: number, dirZ: number, refY: number, maxDist: number,
): number {
  const len = Math.hypot(dirX, dirZ) || 1
  const ux = dirX / len
  const uz = dirZ / len
  let dist = 0
  while (dist + 0.02 <= maxDist + 1e-9) {
    const px = x + ux * (dist + 0.02)
    const pz = z + uz * (dist + 0.02)
    if (!onLand(px, pz) || Math.abs(groundHeightAt(px, pz) - refY) > 0.03) return dist
    dist += 0.02
  }
  return maxDist
}

export const GRID_CELL = 0.1
export const GRID_EXTENT = 3.5

export function bakeHeightGrid(height: (x: number, z: number) => number): HeightGrid {
  const size = Math.round((2 * GRID_EXTENT) / GRID_CELL) + 1
  const heights = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) heights[j * size + i] = height(-GRID_EXTENT + i * GRID_CELL, -GRID_EXTENT + j * GRID_CELL)
  }
  return { origin: [-GRID_EXTENT, -GRID_EXTENT], cell: GRID_CELL, size, heights }
}

export function gridHeight(grid: HeightGrid, x: number, z: number): number {
  const i = Math.round((x - grid.origin[0]) / grid.cell)
  const j = Math.round((z - grid.origin[1]) / grid.cell)
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -Infinity
  return grid.heights[j * grid.size + i]
}

/** Fraction (0, 1/3, 2/3, 1) of three sun rays from (x, y, z), 0.075 apart sideways, that hit higher terrain. */
export function sunOcclusion(grid: HeightGrid, sun: Vec3, x: number, y: number, z: number): number {
  const hLen = Math.hypot(sun[0], sun[2]) || 1
  const sideX = -sun[2] / hLen
  const sideZ = sun[0] / hLen
  let hits = 0
  for (const offset of [-0.075, 0, 0.075]) {
    const ox = x + sideX * offset
    const oz = z + sideZ * offset
    for (let t = 0.06; t < 6; t += 0.05) {
      const py = y + 0.01 + sun[1] * t
      if (py > 3.2) break
      if (gridHeight(grid, ox + sun[0] * t, oz + sun[2] * t) > py) {
        hits++
        break
      }
    }
  }
  return hits / 3
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/island/query.test.ts --project unit`
Expected: 7 tests pass.

- [ ] **Step 5: Stage**

```bash
git add src/lib/island/query.ts src/lib/island/query.test.ts
```

---

### Task 7: Trail planner

**Files:**
- Create: `src/lib/island/trailPlan.ts`
- Test: `src/lib/island/trailPlan.test.ts`

**Interfaces:**
- Consumes: `LevelField`, `RaiseWindow`, `BEACH`, `LAWN`, `smoothstep` (Task 5); `rayExit` (Task 6); `Stream` (Task 1).
- Produces: `PATH_HALF_WIDTH = 0.17`, `LEDGE_LINE_MAX`, `RAMP_SLOPE_DEG = 26`, `PEAK_SLOPE_DEG = 32`, `RAMP_LEDGE`, `RAMP_OFFSET`, `HAIRPIN_LEDGE`, `SHARE_WINDOWS`, `PlannerInput`, `LegShares`, `PlannedTrail { field, trail, shares }`, `levelCore(field, level, near)`, `limitHeights(raw, s)`, `planTrail(input, stream)`.

- [ ] **Step 1: Write the failing test**

The planner as a whole is exercised by Task 9's sweep; this pins the height limiter (spec §3.5 step 7).

```ts
import { describe, expect, it } from 'vitest'
import { limitHeights, RAMP_SLOPE_DEG } from './trailPlan'

describe('limitHeights', () => {
  const s = Array.from({ length: 101 }, (_, i) => i * 0.04)
  const raw = s.map((v) => (v < 2 ? 0.16 : 1.1))
  const ys = limitHeights(raw, s)

  it('turns a step into a monotone ramp centred on the step', () => {
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1])
    expect(ys[0]).toBeCloseTo(0.16, 9)
    expect(ys[ys.length - 1]).toBeCloseTo(1.1, 9)
    expect(ys[50]).toBeCloseTo(0.63, 1)
  })

  it('keeps the mean slope at the ramp angle and the peak below 32°', () => {
    const tan = Math.tan((RAMP_SLOPE_DEG * Math.PI) / 180)
    let peak = 0
    for (let i = 0; i + 3 < ys.length; i++) peak = Math.max(peak, (ys[i + 3] - ys[i]) / (s[i + 3] - s[i]))
    expect(peak).toBeLessThanOrEqual(Math.tan((32 * Math.PI) / 180))
    const climbing = ys.filter((y) => y > 0.17 && y < 1.09).length * 0.04
    expect((1.1 - 0.16) / climbing).toBeCloseTo(tan, 1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/island/trailPlan.test.ts --project unit`
Expected: FAIL, cannot resolve `./trailPlan`.

- [ ] **Step 3: Implement**

Read "Spec deviations" 1–7 first; this file is where they live.

```ts
import type { IslandTrail, Level, RampSpan, SummitShape, TrailSample, Vec2, Vec3 } from './types'
import type { LevelField, RaiseWindow } from './shapes'
import { BEACH, LAWN, smoothstep } from './shapes'
import type { Stream } from './random'
import { rayExit } from './query'

export const PATH_HALF_WIDTH = 0.17
export const LEDGE_LINE_MAX = 0.42
export const RAMP_SLOPE_DEG = 26
export const PEAK_SLOPE_DEG = 32
export const RAMP_LEDGE = 2 * PATH_HALF_WIDTH + 0.3
/** A ramp runs from RAMP_OFFSET outside its upper rim to RAMP_OFFSET inside it, so it crosses the contour at its midpoint. */
export const RAMP_OFFSET = 0.28
/** Upper-ledge width at a switchback, so the ramp arriving and the ramp leaving never share corridor at different heights. */
export const HAIRPIN_LEDGE = 1.1
export const SHARE_WINDOWS = { lawn: [0.2, 0.4], ramps: [0.25, 1], summit: [0.04, 0.18] } as const
const RAMP_FLAT = 0.2
const LANDING = 0.3
const SPACING = 0.04
const SMOOTH_PASSES = 40
const TAU = Math.PI * 2
const TAN_RAMP = Math.tan((RAMP_SLOPE_DEG * Math.PI) / 180)

export interface PlannerInput {
  readonly levels: readonly Level[]
  readonly centres: readonly Vec2[]
  readonly front: number
  readonly side: 1 | -1
  readonly lean: number
  readonly summit: { readonly shape: SummitShape; readonly craterRadius?: number }
  readonly buildField: (raises: readonly (readonly RaiseWindow[])[]) => LevelField
}

export interface LegShares {
  readonly lawn: number
  readonly ramps: number
  readonly summit: number
}

export interface PlannedTrail {
  readonly field: LevelField
  readonly trail: IslandTrail
  readonly shares: LegShares
}

interface RampPlan {
  readonly upper: number
  readonly centre: Vec2
  readonly start: number
  readonly dir: 1 | -1
  readonly span: number
}

type Tag =
  | { kind: 'approach' | 'walk' | 'summit' }
  | { kind: 'landing' | 'hairpin'; index: number }
  | { kind: 'ramp'; index: number; u: number }
interface TaggedPoint {
  x: number
  z: number
  tag: Tag
}

const polar = (c: Vec2, a: number, r: number): Vec2 => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]
const angleFrom = (c: Vec2, p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0])

/** Rim radius of a level about a centre, tabulated at `n` angles with warm-started bisection. */
class RimTable {
  private readonly radii: Float64Array

  constructor(inside: (x: number, z: number) => boolean, readonly centre: Vec2, private readonly n = 160) {
    this.radii = new Float64Array(n)
    let r = rayExit(inside, centre[0], centre[1], 0)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const dx = Math.cos(a)
      const dz = Math.sin(a)
      const at = (d: number) => inside(centre[0] + dx * d, centre[1] + dz * d)
      let lo: number
      let hi: number
      if (at(r)) {
        hi = r + 0.04
        while (hi < 4.5 && at(hi)) hi += 0.04
        lo = hi - 0.04
      } else {
        lo = Math.max(0, r - 0.04)
        while (lo > 0 && !at(lo)) lo = Math.max(0, lo - 0.04)
        hi = lo + 0.04
      }
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2
        if (at(mid)) lo = mid
        else hi = mid
      }
      r = lo
      this.radii[i] = r
    }
  }

  at(a: number): number {
    const f = ((((a / TAU) % 1) + 1) % 1) * this.n
    const i = Math.floor(f) % this.n
    const k = f - Math.floor(f)
    return this.radii[i] * (1 - k) + this.radii[(i + 1) % this.n] * k
  }

  point(a: number, offset: number): Vec2 {
    return polar(this.centre, a, this.at(a) + offset)
  }

  /** Circular moving average over ±`half` samples: lanes follow this so a sharp bay in the outline can't kink a ramp. */
  smoothed(half: number): RimTable {
    const out = Object.create(RimTable.prototype) as RimTable
    const radii = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      let sum = 0
      for (let k = -half; k <= half; k++) sum += this.radii[(i + k + this.n) % this.n]
      radii[i] = sum / (2 * half + 1)
    }
    Object.assign(out, { radii, centre: this.centre, n: this.n })
    return out
  }
}

class Geometry {
  private readonly cache = new Map<string, RimTable>()
  constructor(readonly field: LevelField) {}

  /** Rim of `level` along rays from `centre`, smoothed over ±18° so walking lanes stay gently curved. */
  rim(level: number, centre: Vec2): RimTable {
    const key = `${level}:${centre[0]}:${centre[1]}`
    let t = this.cache.get(key)
    if (!t) {
      t = new RimTable((x, z) => this.field.sdAt(x, z)[level] > 0, centre).smoothed(8)
      this.cache.set(key, t)
    }
    return t
  }
}

/** Deepest point of a level near its blob centre; switchback margins can shift a tier well off its blob. */
export function levelCore(field: Pick<LevelField, 'sdAt'>, level: number, near: Vec2): Vec2 {
  let best: Vec2 = near
  let bestSd = -Infinity
  for (let j = -15; j <= 15; j++) {
    for (let i = -15; i <= 15; i++) {
      const x = near[0] + i * 0.08
      const z = near[1] + j * 0.08
      const sd = field.sdAt(x, z)[level]
      if (sd > bestSd) {
        bestSd = sd
        best = [x, z]
      }
    }
  }
  return best
}

function arcCentre(input: PlannerInput, field: LevelField, level: number): Vec2 {
  const isCrater = level === input.levels.length - 1 && input.summit.shape === 'crater'
  return isCrater ? input.centres[level] : levelCore(field, level, input.centres[level])
}

function wallHeight(input: PlannerInput, level: number): number {
  return input.levels[level].y - input.levels[level - 1].y
}

function rampLength(input: PlannerInput, upper: number): number {
  return wallHeight(input, upper) / TAN_RAMP + 2 * RAMP_FLAT
}

/** Angle swept (in `dir`) along a rim from `start` until `length` of arc is covered. */
function sweep(rim: RimTable, start: number, dir: 1 | -1, length: number): number {
  let a = start
  let [px, pz] = rim.point(a, 0)
  let acc = 0
  for (let i = 0; i < 3000 && acc < length; i++) {
    a += 0.004 * dir
    const [qx, qz] = rim.point(a, 0)
    acc += Math.hypot(qx - px, qz - pz)
    px = qx
    pz = qz
  }
  return Math.abs(a - start)
}

/** Spec §3.5 step 3: mid-ledge walking line in front of `upper`'s cliff, measured from its (leaning) foot. */
function ledgeLine(input: PlannerInput, g: Geometry, upper: number, centre: Vec2, a: number): number {
  const foot = g.rim(upper, centre).at(a) + input.lean * wallHeight(input, upper)
  const outer = g.rim(upper - 1, centre).at(a)
  return foot + Math.min(LEDGE_LINE_MAX, Math.max(0, outer - foot) / 2)
}

function trailhead(input: PlannerInput, field: LevelField): Vec2 {
  const th = input.front - input.side * 0.3
  const beachR = rayExit((x, z) => field.sdAt(x, z)[BEACH] > 0, 0, 0, th)
  const lawnR = rayExit((x, z) => field.sdAt(x, z)[LAWN] > 0, 0, 0, th)
  return polar([0, 0], th, lawnR + (beachR - lawnR) * 0.55)
}

function facingAt(input: PlannerInput, p: Vec2): number {
  return 0.5 + 0.5 * Math.cos(Math.atan2(p[1], p[0]) - input.front)
}

/** Spec §3.5 step 2 for the first ramp (visibility, ledge room, jitter). Later ramps start at the switchback above it. */
function scoreFirstRampSite(input: PlannerInput, stream: Stream): number {
  const field = input.buildField(input.levels.map(() => []))
  const g = new Geometry(field)
  const upper = LAWN + 1
  const centre = arcCentre(input, field, upper)
  const dir = input.side
  const approach = angleFrom(centre, trailhead(input, field))
  const rim = g.rim(upper, centre)
  const outer = g.rim(upper - 1, centre)
  const length = rampLength(input, upper)
  let best = approach + dir * 0.4
  let bestScore = -Infinity
  for (let i = 0; i < 48; i++) {
    const a = approach + dir * (0.2 + (i / 47) * 1.4)
    const span = sweep(rim, a, dir, length)
    const mid = rim.point(a + (dir * span) / 2, 0)
    let ledge = Infinity
    for (let k = 0; k <= 3; k++) {
      const b = a + (dir * span * k) / 6
      ledge = Math.min(ledge, outer.at(b) - rim.at(b))
    }
    const score = 2 * facingAt(input, mid) + Math.min(1, ledge / RAMP_LEDGE) + 0.1 * stream.next()
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  return best
}

function windowFor(centre: Vec2, a0: number, a1: number, value: number): RaiseWindow {
  return { cx: centre[0], cz: centre[1], from: Math.min(a0, a1), to: Math.max(a0, a1), feather: 0.35, value }
}

function landingEnd(plan: RampPlan, rim: RimTable): number {
  const end = plan.start + plan.dir * plan.span
  return end + (plan.dir * LANDING) / Math.max(0.5, rim.at(end))
}

/**
 * Ramp k climbs onto level LAWN+1+k along its rim. Before each ramp is fixed, the ledge below it is widened to
 * RAMP_LEDGE and the ledge above its top to HAIRPIN_LEDGE, so "every ramp has room" holds by construction.
 */
function planRamps(input: PlannerInput, firstStart: number) {
  const top = input.levels.length - 1
  const raises: RaiseWindow[][] = input.levels.map(() => [])
  let field = input.buildField(raises)
  const plans: RampPlan[] = []
  for (let upper = LAWN + 1; upper <= top; upper++) {
    const k = upper - LAWN - 1
    const dir = (k % 2 === 0 ? input.side : -input.side) as 1 | -1
    const g = new Geometry(field)
    const centre = arcCentre(input, field, upper)
    let start = firstStart
    if (k > 0) {
      const prev = plans[k - 1]
      const prevRim = g.rim(prev.upper, prev.centre)
      start = angleFrom(centre, prevRim.point(landingEnd(prev, prevRim), -RAMP_OFFSET))
    }
    const rim = g.rim(upper, centre)
    const span = sweep(rim, start, dir, rampLength(input, upper))
    raises[upper].push(windowFor(centre, start, start + (dir * span) / 2, RAMP_LEDGE + input.lean * wallHeight(input, upper)))
    if (upper < top) {
      const end = start + dir * span
      const r = Math.max(0.5, rim.at(end))
      raises[upper + 1].push(windowFor(centre, end - (dir * 0.6) / r, end + (dir * (LANDING + 0.35)) / r, HAIRPIN_LEDGE + input.lean * wallHeight(input, upper + 1)))
    }
    field = input.buildField(raises)
    plans.push({ upper, centre, start, dir, span })
  }
  return { field, plans }
}

function pushLine(points: TaggedPoint[], a: Vec2, b: Vec2, tag: Tag) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SPACING))
  for (let i = points.length ? 1 : 0; i <= n; i++) points.push({ x: a[0] + ((b[0] - a[0]) * i) / n, z: a[1] + ((b[1] - a[1]) * i) / n, tag })
}

function pushArc(points: TaggedPoint[], centre: Vec2, a0: number, a1: number, radius: (a: number, u: number) => number, tag: Tag | ((u: number) => Tag)) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * radius(a0, 0)) / SPACING))
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const a = a0 + (a1 - a0) * u
    points.push({ ...pt(polar(centre, a, radius(a, u))), tag: typeof tag === 'function' ? tag(u) : tag })
  }
}

const pt = (p: Vec2) => ({ x: p[0], z: p[1] })

/** Semicircular switchback from `pa` to `pb`, bulging forward along `forward`. */
function pushHairpin(points: TaggedPoint[], pa: Vec2, pb: Vec2, forward: Vec2, index: number) {
  const mx = (pa[0] + pb[0]) / 2
  const mz = (pa[1] + pb[1]) / 2
  const rho = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / 2 || 1e-6
  const e1: Vec2 = [(pa[0] - mx) / rho, (pa[1] - mz) / rho]
  const dot = forward[0] * e1[0] + forward[1] * e1[1]
  const raw: Vec2 = [forward[0] - dot * e1[0], forward[1] - dot * e1[1]]
  const len = Math.hypot(raw[0], raw[1]) || 1
  const e2: Vec2 = [raw[0] / len, raw[1] / len]
  const n = Math.max(6, Math.ceil((Math.PI * rho) / SPACING))
  for (let i = 1; i <= n; i++) {
    const phi = (i / n) * Math.PI
    points.push({ x: mx + rho * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]), z: mz + rho * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]), tag: { kind: 'hairpin', index } })
  }
}

/**
 * Spec §3.5 step 5, adapted: the summit is small next to its ramp, so the end point is searched rather than fixed.
 * The summit point (and straight walk to it) with the most clearance from the trail already laid, favouring the
 * camera side and a walk of about `walkLength`; a dome prefers its peak, a crater its rim ring.
 */
function summitTarget(input: PlannerInput, field: LevelField, core: Vec2, from: Vec2, laid: readonly TaggedPoint[], walkLength: number): Vec2 {
  const top = input.levels.length - 1
  const craterR = input.summit.shape === 'crater' ? (input.summit.craterRadius ?? 0.38) : 0
  const clearance = (p: Vec2) => {
    let d = Infinity
    for (const q of laid) d = Math.min(d, Math.hypot(q.x - p[0], q.z - p[1]))
    return d
  }
  let best = core
  let bestScore = -Infinity
  for (let j = -14; j <= 14; j++) {
    for (let i = -14; i <= 14; i++) {
      const p: Vec2 = [core[0] + i * 0.08, core[1] + j * 0.08]
      if (field.sdAt(p[0], p[1])[top] < 0.28) continue
      const fromCore = Math.hypot(p[0] - core[0], p[1] - core[1])
      if (craterR > 0 && Math.abs(fromCore - (craterR + 0.3)) > 0.08) continue
      let clear = clearance(p)
      const len = Math.hypot(p[0] - from[0], p[1] - from[1])
      const steps = Math.ceil(len / 0.08)
      for (let k = 1; k < steps; k++) clear = Math.min(clear, clearance([from[0] + ((p[0] - from[0]) * k) / steps, from[1] + ((p[1] - from[1]) * k) / steps]))
      if (clear < 2 * PATH_HALF_WIDTH + 0.08) continue
      const peak = input.summit.shape === 'dome' ? -fromCore : 0
      const score = Math.min(clear, 0.8) + 0.6 * facingAt(input, p) - 0.9 * Math.abs(len - walkLength) + peak
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
  }
  return best
}

function trace(input: PlannerInput, g: Geometry, plans: readonly RampPlan[], walkLength: number): TaggedPoint[] {
  const points: TaggedPoint[] = []
  const first = plans[0]
  const start = trailhead(input, g.field)
  const approach = angleFrom(first.centre, start)
  pushLine(points, start, polar(first.centre, approach, ledgeLine(input, g, first.upper, first.centre, approach)), { kind: 'approach' })
  const firstRim = g.rim(first.upper, first.centre)
  pushArc(
    points,
    first.centre,
    approach,
    first.start,
    (a, u) => {
      const ledge = ledgeLine(input, g, first.upper, first.centre, a)
      return ledge + (firstRim.at(a) + RAMP_OFFSET - ledge) * smoothstep(0.35, 1, u)
    },
    { kind: 'walk' },
  )

  plans.forEach((plan, k) => {
    const rim = g.rim(plan.upper, plan.centre)
    const end = plan.start + plan.dir * plan.span
    pushArc(points, plan.centre, plan.start, end, (a, u) => rim.at(a) + RAMP_OFFSET * (1 - 2 * u), (u) => ({ kind: 'ramp', index: k, u }))
    const land = landingEnd(plan, rim)
    pushArc(points, plan.centre, end, land, (a) => rim.at(a) - RAMP_OFFSET, { kind: 'landing', index: k })
    const next = plans[k + 1]
    if (next) {
      const forward: Vec2 = [-Math.sin(land) * plan.dir, Math.cos(land) * plan.dir]
      pushHairpin(points, rim.point(land, -RAMP_OFFSET), g.rim(next.upper, next.centre).point(next.start, RAMP_OFFSET), forward, k)
    }
  })

  const last = plans[plans.length - 1]
  const from = points[points.length - 1]
  const laid = points.slice(0, Math.max(0, points.length - Math.ceil(0.6 / SPACING)))
  const target = summitTarget(input, g.field, last.centre, [from.x, from.z], laid, walkLength)
  pushLine(points, [from.x, from.z], target, { kind: 'summit' })
  return points
}

function densify(points: readonly TaggedPoint[]): TaggedPoint[] {
  const out: TaggedPoint[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SPACING))
    for (let k = 1; k <= n; k++) {
      const tag = k === n ? b.tag : a.tag.kind === 'ramp' && b.tag.kind === 'ramp' ? { ...a.tag, u: a.tag.u + ((b.tag.u - a.tag.u) * k) / n } : a.tag
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, tag })
    }
  }
  return out
}

/** Spec §3.5 step 6. Switchback points are pinned: smoothing would otherwise pull the two legs of the U together. */
function smoothXZ(points: TaggedPoint[]) {
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const px = points.map((p) => p.x)
    const pz = points.map((p) => p.z)
    for (let i = 1; i < points.length - 1; i++) {
      if (points[i].tag.kind === 'hairpin') continue
      points[i].x = 0.25 * px[i - 1] + 0.5 * px[i] + 0.25 * px[i + 1]
      points[i].z = 0.25 * pz[i - 1] + 0.5 * pz[i] + 0.25 * pz[i + 1]
    }
  }
}

/** Spec §3.5 step 7: monotone raw heights, forward/backward slope limiters averaged, then 3 smoothing passes. */
export function limitHeights(raw: readonly number[], s: readonly number[]): number[] {
  const mono = raw.slice()
  for (let i = 1; i < mono.length; i++) mono[i] = Math.max(mono[i], mono[i - 1])
  const g = 2 * TAN_RAMP
  const yf = mono.slice()
  for (let i = 1; i < yf.length; i++) yf[i] = Math.min(mono[i], yf[i - 1] + g * (s[i] - s[i - 1]))
  const yb = mono.slice()
  for (let i = yb.length - 2; i >= 0; i--) yb[i] = Math.max(mono[i], yb[i + 1] - g * (s[i + 1] - s[i]))
  let ys = yf.map((v, i) => (v + yb[i]) / 2)
  for (let pass = 0; pass < 3; pass++) {
    ys = ys.map((v, i) => (i === 0 || i === ys.length - 1 ? v : 0.25 * ys[i - 1] + 0.5 * v + 0.25 * ys[i + 1]))
  }
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1])
  return ys
}

function finish(input: PlannerInput, field: LevelField, plans: readonly RampPlan[], tagged: TaggedPoint[]): { trail: IslandTrail; shares: LegShares } {
  const points = densify(tagged)
  smoothXZ(points)
  const s: number[] = [0]
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  // Ramps, landings and switchbacks take their height from the plan, not the ground under them: a lane grazing a
  // bulge of the next tier must not trigger the climb early. The carve then cuts or fills the terrain to match.
  const beachY = input.levels[BEACH].y
  const planned = (p: TaggedPoint) => {
    const terrain = Math.max(beachY, field.terraceY(p.x, p.z))
    if (p.tag.kind === 'ramp') return input.levels[p.tag.u < 0.5 ? plans[p.tag.index].upper - 1 : plans[p.tag.index].upper].y
    if (p.tag.kind === 'landing' || p.tag.kind === 'hairpin') return input.levels[plans[p.tag.index].upper].y
    if (p.tag.kind === 'summit') return Math.max(input.levels[input.levels.length - 1].y, terrain)
    return terrain
  }
  const ys = limitHeights(points.map(planned), s)

  const ramps: RampSpan[] = plans.map((plan, k) => {
    let i0 = -1
    let i1 = -1
    points.forEach((p, i) => {
      if (p.tag.kind === 'ramp' && p.tag.index === k) {
        if (i0 < 0) i0 = i
        i1 = i
      }
    })
    return { fromLevel: plan.upper - 1, toLevel: plan.upper, s0: s[i0], s1: s[i1], theta: plan.start, dir: plan.dir }
  })

  const samples: TrailSample[] = points.map((p, i) => {
    const ramp = ramps.findIndex((r) => s[i] >= r.s0 && s[i] <= r.s1)
    return { x: p.x, y: ys[i], z: p.z, s: s[i], level: ramp >= 0 ? ramps[ramp].fromLevel : field.levelAt(p.x, p.z), ramp }
  })
  const length = s[s.length - 1]
  const shares = {
    lawn: ramps[0].s0 / length,
    ramps: ramps.reduce((acc, r) => acc + (r.s1 - r.s0), 0) / length,
    summit: (length - ramps[ramps.length - 1].s1) / length,
  }
  const waypoints: Vec3[] = samples.map((q) => [q.x, q.y, q.z])
  return { trail: { samples, waypoints, ramps, halfWidth: PATH_HALF_WIDTH, length }, shares }
}

function shareViolation(shares: LegShares): number {
  const out = (v: number, [lo, hi]: readonly [number, number]) => Math.max(0, lo - v, v - hi)
  return out(shares.lawn, SHARE_WINDOWS.lawn) + out(shares.ramps, SHARE_WINDOWS.ramps) + out(shares.summit, SHARE_WINDOWS.summit)
}

/** Spec §3.5 steps 1-8: score the first ramp, zigzag the rest, trace, smooth, limit heights, rebalance legs up to 3 times. */
export function planTrail(input: PlannerInput, stream: Stream): PlannedTrail {
  let rampStart = scoreFirstRampSite(input, stream)
  let walkLength = 1.0
  let best: PlannedTrail | null = null
  let bestViolation = Infinity
  for (let iteration = 0; iteration <= 5; iteration++) {
    const { field, plans } = planRamps(input, rampStart)
    const { trail, shares } = finish(input, field, plans, trace(input, new Geometry(field), plans, walkLength))
    const violation = shareViolation(shares)
    if (violation < bestViolation) {
      bestViolation = violation
      best = { field, trail, shares }
    }
    if (violation === 0) break
    if (shares.lawn < SHARE_WINDOWS.lawn[0]) rampStart += input.side * 0.15
    else if (shares.lawn > SHARE_WINDOWS.lawn[1]) rampStart -= input.side * 0.15
    if (shares.summit < SHARE_WINDOWS.summit[0]) walkLength += 0.3
    else if (shares.summit > SHARE_WINDOWS.summit[1]) walkLength = Math.max(0.3, walkLength - 0.3)
  }
  return best!
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/island/trailPlan.test.ts --project unit`
Expected: 2 tests pass.

- [ ] **Step 5: Stage**

```bash
git add src/lib/island/trailPlan.ts src/lib/island/trailPlan.test.ts
```

---

### Task 8: Features and prop scattering

**Files:**
- Create: `src/lib/island/scatter.ts`

**Interfaces:**
- Consumes: `BiomeTerrainConfig`, `PropRule` (Task 4); `LevelField`, `blobSd`, `BEACH`, `LAWN`, `HALO_MAX` (Task 5); `rayExit` (Task 6); `levelCore` (Task 7); `createStream`, `Stream` (Task 1); `CAMERA_DIR_LOCAL` (Task 1).
- Produces: `PROP_KINDS` (fixed order; prop kind *i* draws from salt `100 + i`), `ScatterInput`, `placeFeaturesAndProps(input)` → `{ features: IslandFeatures, props: PropPlacement[] }`. Placement order: shelf, waterfall, pool, landmarks (signpost, summit cairn, camp, summit stump, hero rock), pillars, water rocks, vines, cave, then rule props tallest first. `tiltX`/`tiltZ` are world-frame lean angles (outward for palms); Task 15 composes them after `rotY`.

- [ ] **Step 1: Implement**

```ts
import type {
  Biome, CaveSpec, FallSpec, IslandFeatures, IslandTrail, Level, PillarSpec, PolarBlob, PropKind, PropPlacement, Vec2, Vec3, VineSpec, WaterRockSpec,
} from './types'
import { WATER_Y } from './types'
import type { BiomeTerrainConfig, PropRule } from './biomes'
import { createStream } from './random'
import type { Stream } from './random'
import type { LevelField } from './shapes'
import { BEACH, HALO_MAX, LAWN, blobSd } from './shapes'
import { rayExit } from './query'
import { levelCore } from './trailPlan'
import { CAMERA_DIR_LOCAL } from './orientation'

export const PROP_KINDS: readonly PropKind[] = [
  'palm', 'canopyTree', 'pine', 'bareTree', 'ashTree', 'cactus',
  'bush', 'fernRosette', 'grassTuft', 'flower', 'mushroom', 'heather', 'coralPuff', 'anemone',
  'stump', 'log', 'heroRock', 'boulder', 'waterRock', 'lily', 'iceFloe',
  'tent', 'campfire', 'signpost', 'summitCairn',
]
const LANDMARK_KINDS: ReadonlySet<PropKind> = new Set(['signpost', 'summitCairn', 'tent', 'campfire', 'stump', 'heroRock'])
const SUMMIT_PROP_MAX = 0.85
const PROP_TOP_MAX = 3.0
const COT_35 = 1.43
const TAU = Math.PI * 2

export interface ScatterInput {
  readonly biome: Biome
  readonly seed: number
  readonly cfg: BiomeTerrainConfig
  readonly frame: { readonly front: number; readonly side: 1 | -1; readonly centres: readonly Vec2[]; readonly blobs: readonly (PolarBlob | null)[] }
  readonly levels: readonly Level[]
  readonly field: LevelField
  readonly trail: IslandTrail
  readonly pathProject: (x: number, z: number) => { d: number; y: number; s: number }
}

interface Disc {
  readonly x: number
  readonly z: number
  readonly r: number
}

const polar = (c: Vec2, a: number, r: number): Vec2 => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]

/** Spec §3.4 features and §3.9 props, placed after the trail so both can keep clear of it. */
export function placeFeaturesAndProps(input: ScatterInput): { features: IslandFeatures; props: PropPlacement[] } {
  const { cfg, field, levels, trail, pathProject, seed } = input
  const { front, side } = input.frame
  const top = levels.length - 1
  const half = trail.halfWidth
  const decor = createStream(seed, 4)
  const taken: Disc[] = []
  const props: PropPlacement[] = []
  const free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r)
  const pathD = (x: number, z: number) => pathProject(x, z).d
  const frontDot = (x: number, z: number) => (x * Math.cos(front) + z * Math.sin(front)) / (Math.hypot(x, z) || 1)
  const facing = (x: number, z: number) => 0.5 + 0.5 * frontDot(x, z)
  const inside = (level: number) => (x: number, z: number) => field.sdAt(x, z)[level] > 0
  const outward = (level: number, x: number, z: number): Vec2 => {
    const e = 0.02
    const nx = field.sdAt(x - e, z)[level] - field.sdAt(x + e, z)[level]
    const nz = field.sdAt(x, z - e)[level] - field.sdAt(x, z + e)[level]
    const len = Math.hypot(nx, nz) || 1
    return [nx / len, nz / len]
  }
  const topCore = levelCore(field, top, input.frame.centres[top])

  const shelf = placeShelf()
  const inShelf = (x: number, z: number) => shelf !== null && Math.min(blobSd(shelf.blob, x, z), field.sdAt(x, z)[top - 1] - 0.08) > 0
  const crater = cfg.summit.shape === 'crater'
    ? { x: input.frame.centres[top][0], z: input.frame.centres[top][1], r: cfg.summit.craterRadius ?? 0.38, plugY: cfg.summit.plugY ?? levels[top].y - 0.25 }
    : null
  const groundAt = (x: number, z: number) => {
    const level = field.levelAt(x, z)
    if (level < BEACH) return WATER_Y
    let y = field.terraceY(x, z)
    if (inShelf(x, z)) y = Math.max(y, shelf!.y)
    if (crater && Math.hypot(x - crater.x, z - crater.z) < crater.r) y = crater.plugY
    return y
  }

  const fall = placeFall()
  if (fall) for (const q of fall.samples) taken.push({ x: q[0], z: q[2], r: 0.18 })
  const pool = placePool()
  if (pool) taken.push({ x: pool.x, z: pool.z, r: pool.r + 0.05 })
  const start = trail.samples[0]
  const end = trail.samples[trail.samples.length - 1]
  taken.push({ x: start.x, z: start.z, r: 0.3 }, { x: end.x, z: end.z, r: 0.25 })

  const ruleFor = (kind: PropKind) => cfg.props.find((r) => r.kind === kind)
  const pushProp = (kind: PropKind, x: number, z: number, rotY: number, scale = 1, tilt: Vec2 = [0, 0]) =>
    props.push({ kind, x, y: groundAt(x, z), z, rotY, scale, tiltX: tilt[0], tiltZ: tilt[1] })

  // Landmarks first (spec §3.9 order): signpost, summit cairn, camp, summit stump, hero rock.
  placeLandmarks()
  const pillars = placePillars()
  const waterRocks = placeWaterRocks()
  const vines = placeVines()
  const caves = placeCaves()
  const rules = cfg.props.filter((r) => !LANDMARK_KINDS.has(r.kind)).slice().sort((a, b) => b.height - a.height)
  for (const rule of rules) scatterRule(rule, createStream(seed, 100 + PROP_KINDS.indexOf(rule.kind)))

  const camp = props.find((p) => p.kind === 'tent')
  return {
    features: {
      shelf,
      crater,
      pool,
      fall,
      pillars,
      vines,
      caves,
      waterRocks,
      camp: camp ? { x: camp.x, y: camp.y, z: camp.z, rotY: camp.rotY } : null,
    },
    props,
  }

  function placeShelf(): IslandFeatures['shelf'] {
    const spec = cfg.features.shelf
    if (!spec) return null
    const below = top - 1
    let best: IslandFeatures['shelf'] = null
    let bestScore = -Infinity
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU
      const rim = rayExit(inside(top), topCore[0], topCore[1], a)
      const c = polar(topCore, a, rim + 0.5 * spec.radius)
      const blob: PolarBlob = { cx: c[0], cz: c[1], radius: spec.radius, harmonics: [{ n: 3, amp: 0.1, phase: decor.next() * TAU }], lobes: [], flutes: null }
      let ok = true
      for (let i = 0; i < 16 && ok; i++) {
        const p = polar(c, (i / 16) * TAU, spec.radius * 0.85)
        if (field.sdAt(p[0], p[1])[below] < 0.12 || pathD(p[0], p[1]) < half + 0.2) ok = false
      }
      if (!ok || trail.samples.some((q) => blobSd(blob, q.x, q.z) > -0.1)) continue
      const score = -Math.abs(facing(c[0], c[1]) - 0.55) + 0.1 * decor.next()
      if (score > bestScore) {
        bestScore = score
        best = { blob, y: spec.y, baseY: levels[below].y }
      }
    }
    return best
  }

  function placeFall(): FallSpec | null {
    const kind = cfg.features.fall
    if (!kind) return null
    const stream = createStream(seed, 5)
    const source: { c: Vec2; test: (x: number, z: number) => boolean } = shelf
      ? { c: [shelf.blob.cx, shelf.blob.cz], test: inShelf }
      : { c: topCore, test: inside(top) }
    let best: FallSpec | null = null
    let bestScore = -Infinity
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * TAU
      const rim = rayExit(source.test, source.c[0], source.c[1], a)
      const spring = polar(source.c, a, rim - 0.12)
      if (pathD(spring[0], spring[1]) < half + 0.4) continue
      const samples: Vec3[] = []
      for (let r = Math.max(0.05, rim - 0.12); r < 5; r += 0.03) {
        const [x, z] = polar(source.c, a, r)
        if (field.levelAt(x, z) < BEACH || pathD(x, z) < half + 0.25) break
        samples.push([x, groundAt(x, z), z])
      }
      const drops = new Set(samples.map((q) => q[1].toFixed(3))).size - 1
      if (drops < 1) continue
      const dir: Vec2 = [Math.cos(a), Math.sin(a)]
      const score = -2.5 * Math.abs(facing(spring[0] + dir[0], spring[1] + dir[1]) - 0.75) + 0.5 * drops + 0.05 * stream.next()
      if (score > bestScore) {
        bestScore = score
        best = { samples, dir, kind }
      }
    }
    return best
  }

  function placePool(): IslandFeatures['pool'] {
    const kind = cfg.features.pool
    if (!kind) return null
    const candidates: Vec2[] = []
    if ((kind === 'tide' || kind === 'ember') && fall) {
      const last = fall.samples[fall.samples.length - 1]
      candidates.push([last[0], last[2]])
    } else {
      for (let k = 0; k < 40; k++) {
        const a = front + (decor.next() - 0.5) * 1.6
        const rim = rayExit(inside(LAWN), 0, 0, a)
        candidates.push(polar([0, 0], a, rim - 0.45 - decor.next() * 0.4))
      }
    }
    for (const [x, z] of candidates) {
      if (field.levelAt(x, z) !== LAWN) continue
      const room = Math.min(field.sdAt(x, z)[LAWN], -field.sdAt(x, z)[LAWN + 1]) - 0.06
      const r = Math.min(0.28, room)
      if (r < 0.15 || pathD(x, z) < half + 0.3 + r) continue
      return { x, z, r, y: levels[LAWN].y + 0.006, kind }
    }
    return null
  }

  function placeLandmarks() {
    const s3 = trail.samples[Math.min(4, trail.samples.length - 1)]
    const s4 = trail.samples[Math.min(6, trail.samples.length - 1)]
    const tx = s4.x - s3.x
    const tz = s4.z - s3.z
    const tl = Math.hypot(tx, tz) || 1
    for (const sign of [1, -1]) {
      const x = s3.x - (tz / tl) * 0.34 * sign
      const z = s3.z + (tx / tl) * 0.34 * sign
      if (field.levelAt(x, z) >= BEACH && pathD(x, z) > half + 0.08) {
        pushProp('signpost', x, z, Math.atan2(tx, tz))
        taken.push({ x, z, r: 0.12 })
        break
      }
    }
    props.push({ kind: 'summitCairn', x: end.x, y: end.y, z: end.z, rotY: decor.next() * TAU, scale: 1, tiltX: 0, tiltZ: 0 })
    if (cfg.features.camp) placeCamp()
    if (ruleFor('stump')) {
      for (let k = 0; k < 40; k++) {
        const a = decor.next() * TAU
        const [x, z] = polar([end.x, end.z], a, 0.4 + decor.next() * 0.2)
        if (field.levelAt(x, z) !== top || field.sdAt(x, z)[top] < 0.2 || pathD(x, z) < half + 0.2 || !free(x, z, 0.15)) continue
        pushProp('stump', x, z, decor.next() * TAU)
        taken.push({ x, z, r: 0.15 })
        break
      }
    }
    if (ruleFor('heroRock')) {
      for (let k = 0; k < 40; k++) {
        const a = front + side * (0.4 + decor.next() * 0.5)
        const rim = rayExit(inside(LAWN), 0, 0, a)
        const [x, z] = polar([0, 0], a, rim - 0.55 - decor.next() * 0.4)
        if (field.levelAt(x, z) !== LAWN || -field.sdAt(x, z)[LAWN + 1] < 0.35 || pathD(x, z) < half + 0.3 || !free(x, z, 0.3)) continue
        pushProp('heroRock', x, z, decor.next() * TAU)
        taken.push({ x, z, r: 0.3 })
        break
      }
    }
  }

  function placeCamp() {
    for (let k = 0; k < 600; k++) {
      const level = k < 300 ? LAWN + 1 : LAWN
      const q = trail.samples[Math.floor(decor.next() * trail.samples.length)]
      const a = decor.next() * TAU
      const [x, z] = polar([q.x, q.z], a, half + 0.3 + decor.next() * 0.25)
      if (field.levelAt(x, z) !== level || inShelf(x, z) || !free(x, z, 0.3)) continue
      const sd = field.sdAt(x, z)
      if (sd[level] < 0.3 || (level < top && -sd[level + 1] < 0.35)) continue
      const p = pathProject(x, z)
      if (p.d < half + 0.25 || p.d > half + 0.6) continue
      const rotY = Math.atan2(q.x - x, q.z - z)
      pushProp('tent', x - Math.cos(rotY) * 0.1, z + Math.sin(rotY) * 0.1, rotY)
      pushProp('campfire', x + Math.cos(rotY) * 0.14, z - Math.sin(rotY) * 0.14, decor.next() * TAU)
      taken.push({ x, z, r: 0.3 })
      return
    }
  }

  function placePillars(): PillarSpec[] {
    const out: PillarSpec[] = []
    const want = cfg.features.pillars
    for (let tries = 0; tries < 800 && out.length < want; tries++) {
      const hugging = out.length < Math.ceil(want / 2)
      const [x, z] = polar([0, 0], decor.next() * TAU, Math.sqrt(decor.next()) * 3)
      const level = field.levelAt(x, z)
      if (level < LAWN || level >= top || inShelf(x, z)) continue
      const sd = field.sdAt(x, z)
      const gap = levels[level + 1].y - levels[level].y
      const r = hugging ? 0.17 + decor.next() * 0.08 : 0.11 + decor.next() * 0.05
      if (hugging ? !(-sd[level + 1] > 0.1 && -sd[level + 1] < 0.2) : !(sd[level] > 0.16 && sd[level] < 0.3 && -sd[level + 1] > 0.4)) continue
      if (pathD(x, z) < half + r + 0.25 || !free(x, z, r + 0.1)) continue
      const height = hugging ? gap * (0.7 + decor.next() * 0.35) : 0.45 + decor.next() * 0.35
      taken.push({ x, z, r: r + 0.1 })
      out.push({ x, z, r, baseY: levels[level].y, topY: levels[level].y + height, sides: decor.next() < 0.5 ? 6 : 7, grassCap: decor.next() < 0.5, rot: decor.next() * TAU })
    }
    return out
  }

  function placeWaterRocks(): WaterRockSpec[] {
    const out: WaterRockSpec[] = []
    for (let tries = 0; tries < 400 && out.length < cfg.features.waterRocks; tries++) {
      const a = decor.next() * TAU
      const r = 0.1 + decor.next() * 0.08
      const d = rayExit(inside(1), 0, 0, a) + 0.1 + r + decor.next() * 0.2
      if (d + r > HALO_MAX - 0.05) continue
      const [x, z] = polar([0, 0], a, d)
      if (Math.hypot(x - start.x, z - start.z) < 0.8 || !free(x, z, r + 0.15)) continue
      taken.push({ x, z, r: r + 0.15 })
      out.push({ x, z, r, height: 0.06 + decor.next() * 0.12, rot: decor.next() * TAU })
    }
    return out
  }

  function placeVines(): VineSpec[] {
    const out: VineSpec[] = []
    for (let tries = 0; tries < 400 && out.length < cfg.features.vines; tries++) {
      const level = LAWN + 1 + Math.floor(decor.next() * (top - LAWN))
      const c = levelCore(field, level, input.frame.centres[level])
      const a = decor.next() * TAU
      const rim = rayExit(inside(level), c[0], c[1], a)
      const [x, z] = polar(c, a, rim - 0.005)
      const [nx, nz] = outward(level, x, z)
      if (pathD(x + nx * 0.15, z + nz * 0.15) < half + 0.3) continue
      if (fall && fall.samples.some((q) => Math.hypot(q[0] - x, q[2] - z) < 0.35)) continue
      if (out.some((v) => Math.hypot(v.x - x, v.z - z) < 0.45)) continue
      const wall = levels[level].y - levels[level - 1].y
      out.push({ x, y: levels[level].y, z, rotY: Math.atan2(nx, nz), length: Math.min(wall * 0.5, 0.2 + decor.next() * 0.25) })
    }
    return out
  }

  function placeCaves(): CaveSpec[] {
    if (!cfg.features.cave) return []
    for (let tries = 0; tries < 120; tries++) {
      const level = LAWN + 1 + Math.floor(decor.next() * (top - LAWN))
      const wall = levels[level].y - levels[level - 1].y
      if (wall < 0.6) continue
      const c = levelCore(field, level, input.frame.centres[level])
      const a = decor.next() * TAU
      const rim = rayExit(inside(level), c[0], c[1], a)
      const [rx, rz] = polar(c, a, rim)
      if (facing(rx, rz) < 0.55) continue
      const [nx, nz] = outward(level, rx, rz)
      const foot: Vec2 = [rx + nx * cfg.cliff.lean * wall, rz + nz * cfg.cliff.lean * wall]
      if (pathD(foot[0], foot[1]) < half + 0.35 || !free(foot[0], foot[1], 0.25) || inShelf(foot[0], foot[1])) continue
      taken.push({ x: foot[0], z: foot[1], r: 0.25 })
      return [{ x: foot[0], y: levels[level - 1].y, z: foot[1], rotY: Math.atan2(nx, nz), width: 0.3, height: 0.24 }]
    }
    return []
  }

  function blocksSightline(x: number, y: number, z: number, h: number, r: number): boolean {
    if (h <= 0.3) return false
    for (let i = 0; i < trail.samples.length; i += 2) {
      const q = trail.samples[i]
      const along = (x - q.x) * CAMERA_DIR_LOCAL[0] + (z - q.z) * CAMERA_DIR_LOCAL[2]
      const lateral = (x - q.x) * CAMERA_DIR_LOCAL[2] - (z - q.z) * CAMERA_DIR_LOCAL[0]
      if (along > 0 && along < COT_35 * h + 0.3 && Math.abs(lateral) < r + 0.15 && q.y < y + h) return true
    }
    return false
  }

  function scatterRule(rule: PropRule, stream: Stream) {
    let placed = 0
    for (let tries = 0; tries < rule.count * 120 && placed < rule.count; tries++) {
      const [x, z] = polar([0, 0], stream.next() * TAU, Math.sqrt(stream.next()) * 3.3)
      const scale = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * stream.next()
      const rotY = stream.next() * TAU
      const level = field.levelAt(x, z)
      if (rule.levels.includes('water')) {
        if (level >= BEACH || Math.hypot(x, z) > HALO_MAX - 0.1) continue
      } else {
        if (level < BEACH) continue
        const role = levels[level].role
        const allowed = rule.levels.includes(role === 'tier' ? 'tier' : (role as 'beach' | 'lawn' | 'summit'))
        if (!allowed) continue
        const sd = field.sdAt(x, z)
        const edge = sd[level]
        const toCliff = level < top ? -sd[level + 1] : 9
        if (edge < 0.08) continue
        if (rule.edge && (edge < rule.edge[0] || edge > rule.edge[1])) continue
        if (rule.cliffFoot ? toCliff < rule.cliffFoot[0] || toCliff > rule.cliffFoot[1] : toCliff < 0.12) continue
        if (rule.facing === 'back' && frontDot(x, z) >= 0.25) continue
        if (rule.facing === 'front' && frontDot(x, z) <= 0.3) continue
        if ((pool && Math.hypot(x - pool.x, z - pool.z) < pool.r + 0.1) || (crater && Math.hypot(x - crater.x, z - crater.z) < crater.r + 0.1)) continue
      }
      if (pathD(x, z) < half + rule.pathClear) continue
      const radius = (rule.spacing * 0.5) * scale
      if (!free(x, z, radius)) continue
      const y = rule.levels.includes('water') ? WATER_Y + 0.004 : groundAt(x, z)
      const h = rule.height * scale
      if (y + h > PROP_TOP_MAX || (level === top && h > SUMMIT_PROP_MAX)) continue
      if (blocksSightline(x, y, z, h, radius)) continue
      let tilt: Vec2 = [0, 0]
      if (rule.tilt && level >= LAWN) {
        const [nx, nz] = outward(level, x, z)
        tilt = [rule.tilt * nz, -rule.tilt * nx]
      }
      taken.push({ x, z, r: radius })
      props.push({ kind: rule.kind, x, y, z, rotY, scale, tiltX: tilt[0], tiltZ: tilt[1] })
      placed++
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean. Behaviour (clearances, spacing, sightline, key-kind counts, caps) is asserted by Task 9's sweep.

- [ ] **Step 3: Stage**

```bash
git add src/lib/island/scatter.ts
```

---

### Task 9: `buildIslandLayout`, validation, deterministic retry and the invariant sweep

**Files:**
- Create: `src/lib/island/plan.ts`
- Test: `src/lib/island/island.test.ts`
- Modify: `package.json` (`test:island-sweep`)

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: `buildIslandLayout(biome, seed)`, `validateLayout(layout)` → `string[]`, `serializeLayout(layout)`, `legShares(layout)`, `__testHooks.forceInvalid`, `SUMMIT_MAX_Y`, `PROP_TOP_MAX_Y`, re-exports `FOAM_MAX`, `FOOTPRINT_MAX`, `HALO_MAX`.

- [ ] **Step 1: Write the failing test**

This is spec §9.1 (with deviation 10's tolerances). `ISLAND_SWEEP=full` runs 300 seeds for every biome; the default run keeps `npm test` to about 40 s.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashGoalId } from '../theme'
import type { Biome, IslandLayout } from './types'
import { BIOME_TERRAIN, propRule } from './biomes'
import { __testHooks, buildIslandLayout, legShares, serializeLayout, validateLayout } from './plan'
import { BEACH, LAWN, blobSd } from './shapes'
import { PATH_HALF_WIDTH, SHARE_WINDOWS } from './trailPlan'
import { focusPose, islandAnchors } from './anchors'

const FULL = process.env.ISLAND_SWEEP === 'full'
const BIOMES = Object.keys(BIOME_TERRAIN) as Biome[]
const UUIDS = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

function seedsFor(biome: Biome): number[] {
  const count = FULL ? 300 : biome === 'jungle' ? 40 : 8
  return [...Array.from({ length: count }, (_, i) => i + 1), ...(FULL || biome === 'jungle' ? UUIDS.map(hashGoalId) : [])]
}

/** Rise over run around sample i; "flat" below 0.02 regardless of ramp tags, since the limiter's tails spill past a ramp span. */
function localSlope(l: IslandLayout, i: number): number {
  const s = l.trail.samples
  const a = s[Math.max(0, i - 2)]
  const b = s[Math.min(s.length - 1, i + 2)]
  return (b.y - a.y) / Math.max(1e-6, b.s - a.s)
}

const cache = new Map<string, IslandLayout>()
function layoutFor(biome: Biome, seed: number): IslandLayout {
  const key = `${biome}:${seed}`
  let layout = cache.get(key)
  if (!layout) {
    layout = buildIslandLayout(biome, seed)
    cache.set(key, layout)
  }
  return layout
}

function sweep(check: (layout: IslandLayout) => void) {
  for (const biome of BIOMES) for (const seed of seedsFor(biome)) check(layoutFor(biome, seed))
}

afterEach(() => {
  __testHooks.forceInvalid = null
})

describe('buildIslandLayout', () => {
  it('is deterministic', () => {
    expect(serializeLayout(buildIslandLayout('jungle', 7))).toEqual(serializeLayout(buildIslandLayout('jungle', 7)))
  })

  it('gives different seeds visibly different islands', () => {
    const a = layoutFor('jungle', 1)
    const b = layoutFor('jungle', 2)
    const mid = (l: IslandLayout) => l.trail.samples.find((q) => q.s >= l.trail.length / 2)!
    expect(Math.hypot(mid(a).x - mid(b).x, mid(a).z - mid(b).z)).toBeGreaterThan(0.3)
  })

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    buildIslandLayout('jungle', 11)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('retries a failed seed deterministically with a different effective seed', () => {
    __testHooks.forceInvalid = (seed) => seed === 5
    const first = buildIslandLayout('jungle', 5)
    const second = buildIslandLayout('jungle', 5)
    expect(first.seed).not.toBe(5)
    expect(validateLayout(first)).toEqual([])
    expect(serializeLayout(first)).toEqual(serializeLayout(second))
  })

  it("every biome's preview seed builds a valid layout on its own", () => {
    for (const biome of BIOMES) expect(buildIslandLayout(biome, BIOME_TERRAIN[biome].previewSeed).seed).toBe(BIOME_TERRAIN[biome].previewSeed)
  })

  it('returns a valid layout for every swept seed', () => {
    sweep((layout) => expect(validateLayout(layout), `${layout.biome}:${layout.seed}`).toEqual([]))
  })
})

describe('layout invariants (spec §9.1)', () => {
  it('stays inside the world-size budget', () => {
    sweep((l) => {
      expect(l.footprintRadius).toBeLessThanOrEqual(3.05)
      expect(l.haloRadius).toBeLessThanOrEqual(3.45)
      expect(l.summitTopY).toBeLessThanOrEqual(2.2)
      for (const p of l.props) {
        const top = p.y + (propRule(l.biome, p.kind)?.height ?? 0) * p.scale
        expect(top).toBeLessThanOrEqual(3.0)
        expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(l.haloRadius)
      }
    })
  })

  it('keeps jungle palms and canopy trees within their height caps', () => {
    for (const seed of seedsFor('jungle')) {
      const l = layoutFor('jungle', seed)
      for (const p of l.props) {
        const h = (propRule(l.biome, p.kind)?.height ?? 0) * p.scale
        if (p.kind === 'palm') expect(h).toBeGreaterThanOrEqual(0.55 - 1e-9)
        if (p.kind === 'palm') expect(h).toBeLessThanOrEqual(0.8 + 1e-9)
        if (p.kind === 'canopyTree') expect(h).toBeLessThanOrEqual(0.7 + 1e-9)
      }
    }
  })

  it('nests every level inside the one below and keeps sand between grass and water', () => {
    for (const seed of [1, 2, 3]) {
      const l = layoutFor('jungle', seed)
      for (let x = -3.4; x <= 3.4; x += 0.05) {
        for (let z = -3.4; z <= 3.4; z += 0.05) {
          const sd = l.sdAt(x, z)
          for (let k = 1; k < sd.length; k++) if (sd[k] > 0) expect(sd[k - 1]).toBeGreaterThan(0)
        }
      }
      for (let k = 1; k < l.levels.length; k++) expect(l.levels[k].y).toBeGreaterThan(l.levels[k - 1].y)
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 2
        for (let r = 0; r < 3.4; r += 0.01) {
          const x = r * Math.cos(a)
          const z = r * Math.sin(a)
          if (l.sdAt(x, z)[LAWN] <= 0) {
            for (let d = 0; d < 0.12; d += 0.01) expect(l.levelAt(x + d * Math.cos(a), z + d * Math.sin(a))).toBeGreaterThanOrEqual(BEACH)
            break
          }
        }
      }
    }
  })

  it('starts on the beach facing the camera and ends well inside the summit', () => {
    sweep((l) => {
      const first = l.trail.samples[0]
      const last = l.trail.samples[l.trail.samples.length - 1]
      expect(l.levelAt(first.x, first.z)).toBe(BEACH)
      const angle = Math.atan2(first.z, first.x)
      expect(Math.abs(Math.atan2(Math.sin(angle - l.front), Math.cos(angle - l.front)))).toBeLessThan(0.6)
      const top = l.levels.length - 1
      expect(l.levelAt(last.x, last.z)).toBe(top)
      expect(l.sdAt(last.x, last.z)[top]).toBeGreaterThanOrEqual(0.25)
    })
  })

  it('walks on the ground: every sample on groundHeightAt and the corridor flat across', () => {
    sweep((l) => {
      const s = l.trail.samples
      for (let i = 0; i < s.length; i++) {
        expect(Math.abs(l.groundHeightAt(s[i].x, s[i].z) - s[i].y)).toBeLessThanOrEqual(1e-3)
        const j = Math.min(s.length - 1, i + 1)
        const k = Math.max(0, i - 1)
        const tx = s[j].x - s[k].x
        const tz = s[j].z - s[k].z
        const tl = Math.hypot(tx, tz) || 1
        for (const sign of [1, -1]) {
          const off = (PATH_HALF_WIDTH - 0.02) * sign
          // On a curving slope a lateral probe projects to a slightly different arc length, hence the looser bound there.
          const tolerance = localSlope(l, i) < 0.02 ? 0.03 : 0.06
          expect(Math.abs(l.groundHeightAt(s[i].x - (tz / tl) * off, s[i].z + (tx / tl) * off) - s[i].y)).toBeLessThanOrEqual(tolerance)
        }
      }
    })
  })

  it('keeps flat runs on their cap and never cuts more than one cliff deep', () => {
    sweep((l) => {
      l.trail.samples.forEach((q, i) => {
        const terrace = l.terraceY(q.x, q.z)
        if (localSlope(l, i) < 0.02) expect(Math.abs(terrace - q.y), `${l.biome}:${l.seed} s=${q.s.toFixed(2)}`).toBeLessThanOrEqual(0.02)
        expect(terrace - q.y).toBeLessThanOrEqual(1.0 + 1e-6)
        const shelf = l.features.shelf
        if (shelf) expect(Math.min(blobSd(shelf.blob, q.x, q.z), l.sdAt(q.x, q.z)[l.levels.length - 2] - 0.08)).toBeLessThanOrEqual(0)
      })
    })
  })

  it('climbs monotonically with bounded slope', () => {
    sweep((l) => {
      const s = l.trail.samples
      for (let i = 1; i < s.length; i++) expect(s[i].y).toBeGreaterThanOrEqual(s[i - 1].y - 1e-9)
      for (const r of l.trail.ramps) {
        const inRamp = s.filter((q) => q.s >= r.s0 && q.s <= r.s1)
        const rise = inRamp[inRamp.length - 1].y - inRamp[0].y
        expect(rise / (r.s1 - r.s0)).toBeLessThanOrEqual(Math.tan((27 * Math.PI) / 180))
      }
    })
  })

  it('has one ramp per tier above the lawn and balanced legs', () => {
    sweep((l) => {
      expect(l.trail.ramps.length).toBe(l.levels.length - 1 - LAWN)
      const shares = legShares(l)
      expect(shares.lawn).toBeGreaterThanOrEqual(SHARE_WINDOWS.lawn[0] - 1e-9)
      expect(shares.lawn).toBeLessThanOrEqual(SHARE_WINDOWS.lawn[1] + 1e-9)
      expect(shares.ramps).toBeGreaterThanOrEqual(SHARE_WINDOWS.ramps[0])
      expect(shares.summit).toBeGreaterThanOrEqual(SHARE_WINDOWS.summit[0] - 1e-9)
      expect(shares.summit).toBeLessThanOrEqual(SHARE_WINDOWS.summit[1] + 1e-9)
    })
  })

  it('keeps props, pillars and the waterfall clear of the trail and of each other', () => {
    sweep((l) => {
      for (const p of l.props) {
        if (p.kind === 'summitCairn') continue
        const rule = propRule(l.biome, p.kind)!
        expect(l.pathProject(p.x, p.z).d).toBeGreaterThanOrEqual(l.trail.halfWidth + rule.pathClear - 1e-9)
      }
      for (const pillar of l.features.pillars) expect(l.pathProject(pillar.x, pillar.z).d).toBeGreaterThanOrEqual(l.trail.halfWidth + pillar.r + 0.25 - 1e-9)
      for (const q of l.features.fall?.samples ?? []) expect(l.pathProject(q[0], q[2]).d).toBeGreaterThanOrEqual(l.trail.halfWidth + 0.25 - 1e-9)
      const scatterable = l.props.filter((p) => !['summitCairn', 'tent', 'campfire'].includes(p.kind))
      for (let i = 0; i < scatterable.length; i++) {
        for (let j = i + 1; j < scatterable.length; j++) {
          const a = scatterable[i]
          const b = scatterable[j]
          const ra = (propRule(l.biome, a.kind)!.spacing / 2) * a.scale
          const rb = (propRule(l.biome, b.kind)!.spacing / 2) * b.scale
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(Math.min(ra, rb))
        }
      }
    })
  })

  it('places at least 70% of every key prop kind on the jungle', () => {
    for (const seed of seedsFor('jungle')) {
      const l = layoutFor('jungle', seed)
      for (const rule of BIOME_TERRAIN.jungle.props.filter((r) => r.key)) {
        expect(l.props.filter((p) => p.kind === rule.kind).length, `${seed} ${rule.kind}`).toBeGreaterThanOrEqual(Math.ceil(rule.count * 0.7))
      }
    }
  })

  it('leaves room beside the path for entry markers on most flat runs', () => {
    sweep((l) => {
      const s = l.trail.samples
      let flat = 0
      let roomy = 0
      for (let i = 1; i < s.length - 1; i++) {
        if (localSlope(l, i) >= 0.02 || s[i].y < l.levels[LAWN].y - 1e-6) continue
        flat++
        const tx = s[i + 1].x - s[i - 1].x
        const tz = s[i + 1].z - s[i - 1].z
        const tl = Math.hypot(tx, tz) || 1
        const room = Math.max(l.walkableRun(s[i].x, s[i].z, -tz / tl, tx / tl, s[i].y, 0.4), l.walkableRun(s[i].x, s[i].z, tz / tl, -tx / tl, s[i].y, 0.4))
        if (room >= 0.25) roomy++
      }
      expect(roomy / flat).toBeGreaterThanOrEqual(0.6)
    })
  })
})

describe('islandAnchors / focusPose', () => {
  it('keeps the label within a metre of the summit', () => {
    sweep((l) => expect(islandAnchors(l).labelY).toBeLessThanOrEqual(l.summitTopY + 1.0 + 1e-9))
  })

  it('frames the whole island at every aspect and orbit angle', () => {
    const l = layoutFor('jungle', 1)
    for (const [w, h] of [[1600, 900], [1200, 900], [390, 845]]) {
      for (const orbit of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const pose = focusPose(l, { aspect: w / h, fovDeg: 50, insetRightPx: 0, viewportPx: { width: w, height: h }, orbit })
        expect(pose.distance).toBeGreaterThanOrEqual(7)
        expect(pose.distance).toBeLessThanOrEqual(17)
        expect(pose.elevation).toBeCloseTo((38 * Math.PI) / 180, 6)
        expect(pose.azimuth).toBeCloseTo(Math.PI / 4 + orbit, 6)
        if (pose.distance < 17) {
          const dx = pose.position[0] - pose.lookAt[0]
          const dz = pose.position[2] - pose.lookAt[2]
          expect(Math.atan2(dz, dx)).toBeCloseTo(Math.atan2(Math.sin(Math.PI / 4 + orbit), Math.cos(Math.PI / 4 + orbit)), 6)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/island/island.test.ts --project unit`
Expected: FAIL, cannot resolve `./plan` (and `./anchors`, which Task 10 adds; the `islandAnchors / focusPose` describe block stays red until then).

- [ ] **Step 3: Implement `plan.ts`**

```ts
import { hash01 } from '../archipelago'
import type { Biome, IslandLayout, Level, PolarBlob, Vec2 } from './types'
import { LAYOUT_VERSION, WATER_Y } from './types'
import { BIOME_TERRAIN, PATTERN_PRESETS } from './biomes'
import type { BiomeTerrainConfig } from './biomes'
import { createStream, valueNoise2 } from './random'
import type { Stream } from './random'
import { BEACH, FOAM_MAX, FOOTPRINT_MAX, HALO_MAX, LAWN, blobSd, buildLevelField, scaleBlob } from './shapes'
import type { LedgeSpec, LevelField, RaiseWindow } from './shapes'
import { SegmentHash, bakeHeightGrid, rayExit, walkableRun } from './query'
import { PATH_HALF_WIDTH, PEAK_SLOPE_DEG, SHARE_WINDOWS, planTrail } from './trailPlan'
import type { LegShares } from './trailPlan'
import { placeFeaturesAndProps } from './scatter'

export const SUMMIT_MAX_Y = 2.2
export const PROP_TOP_MAX_Y = 3.0
const FOOTPRINT_TARGET = 3.0
const TAU = Math.PI * 2

function harmonics(stream: Stream, amp: number): PolarBlob['harmonics'] {
  return [2, 3, 4, 5].map((n) => ({ n, amp: (amp * (0.35 + stream.next())) / n ** 0.6, phase: stream.next() * TAU }))
}

function flutes(stream: Stream, cfg: BiomeTerrainConfig['cliff']): PolarBlob['flutes'] {
  const bins = Math.round(cfg.binsPerRadian * TAU)
  const offsets = new Float32Array(bins)
  for (let i = 0; i < bins; i++) offsets[i] = (stream.next() * 2 - 1) * cfg.fluteDepth
  return { binsPerRadian: cfg.binsPerRadian, depth: cfg.fluteDepth, offsets }
}

const polar = (c: Vec2, a: number, r: number) => ({ x: c[0] + Math.cos(a) * r, z: c[1] + Math.sin(a) * r })

function maxRadius(inside: (x: number, z: number) => boolean): number {
  let max = 0
  for (let i = 0; i < 180; i++) max = Math.max(max, rayExit(inside, 0, 0, (i / 180) * TAU, 4.5))
  return max
}

interface Frame {
  readonly cfg: BiomeTerrainConfig
  readonly front: number
  readonly side: 1 | -1
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly centres: readonly Vec2[]
  readonly buildField: (raises: readonly (readonly RaiseWindow[])[]) => LevelField
}

function buildFrame(biome: Biome, seed: number): Frame {
  const cfg = BIOME_TERRAIN[biome]
  const preset = PATTERN_PRESETS[cfg.pattern]
  const outline = createStream(seed, 1)
  const driftStream = createStream(seed, 2)
  const side = driftStream.sign()
  const front = Math.PI / 2 + driftStream.range(-0.25, 0.25)
  const drift = front + Math.PI + side * driftStream.range(0.55, 0.9)
  const dv: Vec2 = [Math.cos(drift), Math.sin(drift)]

  const n1 = valueNoise2(seed, 300)
  const n2 = valueNoise2(seed, 301)
  const n3 = valueNoise2(seed, 302)
  const n4 = valueNoise2(seed, 303)
  const wobble = (x: number, z: number) => 0.09 * (2 * n1(x * 1.1, z * 1.1) - 1) + 0.035 * (2 * n2(x * 3.1 + 11, z * 3.1) - 1)
  const crag = (x: number, z: number) => 0.07 * (2 * n3(x * 4.3 + 23, z * 4.3 - 9) - 1)
  const widthNoise = (x: number, z: number) => 2 * n4(x * 1.3 + 40, z * 1.3) - 1

  let beachR = outline.range(cfg.beach.radius[0], cfg.beach.radius[1])
  const origin: Vec2 = [0, 0]
  const lobes = [
    { ...polar(origin, front + side * outline.range(-0.25, 0.25), 0.45 * beachR), r: outline.range(0.8, 0.88) * beachR },
    { ...polar(origin, front - side * outline.range(1.35, 1.75), 0.69 * beachR), r: outline.range(0.53, 0.62) * beachR },
  ]
  const spit = { ...polar(origin, front + side * outline.range(1.9, 2.4), beachR), r: outline.range(0.24, 0.3) * beachR }
  if (cfg.beach.spit) lobes.push(spit)
  let beach: PolarBlob = { cx: 0, cz: 0, radius: beachR, harmonics: harmonics(outline, cfg.beach.harmonicAmp), lobes, flutes: null }

  // Footprint normalisation (spec §3.4): scale the whole plan, not just the beach, so proportions survive.
  let scale = 1
  for (let pass = 0; pass < 3; pass++) {
    const max = maxRadius((x, z) => blobSd(beach, x, z) + wobble(x, z) > 0)
    if (max <= FOOTPRINT_TARGET) break
    const k = FOOTPRINT_TARGET / max
    beach = scaleBlob(beach, k)
    scale *= k
  }
  beachR = beach.radius

  const levels: Level[] = [
    { index: 0, role: 'shallow', y: preset.shallowY, wall: 'none' },
    { index: 1, role: 'foam', y: preset.foamY, wall: 'none' },
    { index: 2, role: 'beach', y: preset.beachY, wall: 'sand' },
    { index: 3, role: 'lawn', y: cfg.lawnY, wall: 'lip' },
  ]
  const blobs: (PolarBlob | null)[] = [null, null, beach, null]
  const centres: Vec2[] = [origin, origin, origin, origin]
  const ledges: (LedgeSpec | null)[] = [null, null, null, null]
  let prevR = beachR
  let prevC: Vec2 = origin
  cfg.tiers.forEach((tier, t) => {
    const index = LAWN + 1 + t
    const radius = prevR * tier.radiusRatio
    const c: Vec2 = [prevC[0] + dv[0] * tier.drift * scale, prevC[1] + dv[1] * tier.drift * scale]
    const tierLobes = t === 0 ? [{ ...polar(c, drift + side * outline.range(1.3, 1.7), 0.62 * radius), r: outline.range(0.38, 0.46) * radius }] : []
    levels.push({ index, role: t === cfg.tiers.length - 1 ? 'summit' : 'tier', y: tier.y, wall: 'cliff' })
    blobs.push({ cx: c[0], cz: c[1], radius, harmonics: harmonics(outline, tier.harmonicAmp), lobes: tierLobes, flutes: flutes(createStream(seed, 200 + index), cfg.cliff) })
    centres.push(c)
    ledges.push({ back: tier.ledge.back, front: tier.ledge.front, lean: cfg.cliff.lean * (tier.y - levels[index - 1].y) })
    prevR = radius
    prevC = c
  })

  const top = levels.length - 1
  const dome = cfg.summit.shape === 'dome' ? { level: top, height: cfg.summit.domeHeight ?? 0.3, radius: cfg.summit.domeRadius ?? 0.7 } : null
  const crater = cfg.summit.shape === 'crater' ? { x: centres[top][0], z: centres[top][1], r: cfg.summit.craterRadius ?? 0.38 } : null
  const buildField = (raises: readonly (readonly RaiseWindow[])[]) =>
    buildLevelField({ levels, blobs, front, beachWidth: cfg.beach.width, ledges, raises, wobble, crag, widthNoise, dome, crater })

  return { cfg, front, side, levels, blobs, centres, buildField }
}

export const __testHooks: { forceInvalid: ((seed: number) => boolean) | null } = { forceInvalid: null }

function buildOnce(biome: Biome, seed: number): IslandLayout {
  const frame = buildFrame(biome, seed)
  const { cfg, levels } = frame
  const planned = planTrail(
    { levels, centres: frame.centres, front: frame.front, side: frame.side, lean: cfg.cliff.lean, summit: cfg.summit, buildField: frame.buildField },
    createStream(seed, 3),
  )
  const field = planned.field
  const trail = planned.trail
  const hash = new SegmentHash(trail.samples)
  const pathProject = (x: number, z: number) => hash.project(x, z)

  const placed = placeFeaturesAndProps({ biome, seed, cfg, frame: { front: frame.front, side: frame.side, centres: frame.centres, blobs: frame.blobs }, levels, field, trail, pathProject })
  const { features } = placed

  const inShelf = (x: number, z: number) => features.shelf !== null && Math.min(blobSd(features.shelf.blob, x, z), field.sdAt(x, z)[LAWN + 1] - 0.08) > 0
  const featureHeight = (x: number, z: number, base: number) => {
    let y = base
    if (features.shelf && inShelf(x, z)) y = Math.max(y, features.shelf.y)
    if (features.crater && Math.hypot(x - features.crater.x, z - features.crater.z) < features.crater.r) y = Math.max(y, features.crater.plugY)
    if (features.pool && Math.hypot(x - features.pool.x, z - features.pool.z) < features.pool.r) y = Math.max(y, features.pool.y)
    return y
  }
  const groundHeightAt = (x: number, z: number) => {
    const sd = field.sdAt(x, z)
    let level = 0
    while (level < sd.length && sd[level] > 0) level++
    level -= 1
    if (level < BEACH) return WATER_Y
    const p = hash.project(x, z)
    if (p.d <= trail.halfWidth) return p.y
    return featureHeight(x, z, field.levelTopY(level, x, z, sd))
  }
  const onLand = (x: number, z: number) => field.levelAt(x, z) >= BEACH
  const heightGrid = bakeHeightGrid((x, z) => {
    const level = field.levelAt(x, z)
    return level < BEACH ? WATER_Y : featureHeight(x, z, field.terraceY(x, z))
  })

  const end = trail.samples[trail.samples.length - 1]
  const cfgTop = cfg.tiers[cfg.tiers.length - 1]
  const summitTopY = cfg.summit.shape === 'dome' ? cfgTop.y + (cfg.summit.domeHeight ?? 0) : cfgTop.y
  return {
    version: LAYOUT_VERSION,
    biome,
    seed,
    pattern: cfg.pattern,
    front: frame.front,
    side: frame.side,
    levels,
    blobs: frame.blobs,
    footprintRadius: maxRadius((x, z) => field.sdAt(x, z)[BEACH] > 0),
    haloRadius: maxRadius((x, z) => field.sdAt(x, z)[0] > 0),
    summit: [end.x, end.y, end.z],
    summitTopY,
    trail,
    features,
    props: placed.props,
    heightGrid,
    sdAt: field.sdAt,
    levelAt: field.levelAt,
    terraceY: field.terraceY,
    groundHeightAt,
    pathProject,
    walkableRun: (x, z, dirX, dirZ, refY, maxDist) => walkableRun(groundHeightAt, onLand, x, z, dirX, dirZ, refY, maxDist),
  }
}

/** Spec §3.5 step 9. Returns human-readable failures; [] means valid. */
export function validateLayout(layout: IslandLayout): string[] {
  const errors: string[] = []
  const samples = layout.trail.samples
  const top = layout.levels.length - 1
  if (layout.levelAt(samples[0].x, samples[0].z) !== BEACH) errors.push('trail does not start on the beach')
  const last = samples[samples.length - 1]
  const endLevel = layout.levelAt(last.x, last.z)
  if (!(endLevel === top || (layout.features.crater && endLevel === top))) errors.push(`trail ends on level ${endLevel}, not the summit`)
  const tanPeak = Math.tan((PEAK_SLOPE_DEG * Math.PI) / 180)
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].y < samples[i - 1].y - 1e-9) {
      errors.push(`trail descends at sample ${i}`)
      break
    }
  }
  for (let i = 0, j = 0; i < samples.length; i++) {
    while (j < samples.length - 1 && samples[j].s - samples[i].s < 0.1) j++
    const run = samples[j].s - samples[i].s
    if (run >= 0.1 - 1e-9 && (samples[j].y - samples[i].y) / run > tanPeak) {
      errors.push(`trail slope exceeds ${PEAK_SLOPE_DEG} degrees at s=${samples[i].s.toFixed(2)}`)
      break
    }
  }
  for (const q of samples) {
    if (Math.abs(layout.groundHeightAt(q.x, q.z) - q.y) > 1e-3) {
      errors.push(`waypoint off the ground at s=${q.s.toFixed(2)}`)
      break
    }
  }
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 2)]
    const b = samples[Math.min(samples.length - 1, i + 2)]
    const slope = (b.y - a.y) / Math.max(1e-6, b.s - a.s)
    const q = samples[i]
    if (slope < 0.02 && Math.abs(layout.terraceY(q.x, q.z) - q.y) > 0.02) {
      errors.push(`flat trail off its cap at s=${q.s.toFixed(2)}`)
      break
    }
    const tx = b.x - a.x
    const tz = b.z - a.z
    const tl = Math.hypot(tx, tz) || 1
    const tolerance = slope < 0.02 ? 0.03 : 0.06
    const off = PATH_HALF_WIDTH - 0.02
    if ([1, -1].some((sign) => Math.abs(layout.groundHeightAt(q.x - (tz / tl) * off * sign, q.z + (tx / tl) * off * sign) - q.y) > tolerance)) {
      errors.push(`corridor not flat across at s=${q.s.toFixed(2)}`)
      break
    }
  }
  const clash = selfOverlap(layout)
  if (clash) errors.push(clash)
  if (layout.footprintRadius > FOOTPRINT_MAX + 1e-6) errors.push(`footprint ${layout.footprintRadius.toFixed(3)} > ${FOOTPRINT_MAX}`)
  if (layout.haloRadius > HALO_MAX + 1e-6) errors.push(`halo ${layout.haloRadius.toFixed(3)} > ${HALO_MAX}`)
  if (layout.summitTopY > SUMMIT_MAX_Y + 1e-9) errors.push('summit too high')
  const shares = legShares(layout)
  for (const key of ['lawn', 'ramps', 'summit'] as const) {
    const [lo, hi] = SHARE_WINDOWS[key]
    if (shares[key] < lo - 1e-9 || shares[key] > hi + 1e-9) errors.push(`${key} share ${shares[key].toFixed(3)} outside [${lo}, ${hi}]`)
  }
  if (__testHooks.forceInvalid?.(layout.seed)) errors.push('forced invalid by test hook')
  return errors
}

export function legShares(layout: IslandLayout): LegShares {
  const { ramps, length } = layout.trail
  return {
    lawn: ramps[0].s0 / length,
    ramps: ramps.reduce((acc, r) => acc + (r.s1 - r.s0), 0) / length,
    summit: (length - ramps[ramps.length - 1].s1) / length,
  }
}

/** Two separate passes of the trail must not share corridor where their heights differ. */
function selfOverlap(layout: IslandLayout): string | null {
  const samples = layout.trail.samples
  const minGap = 2 * PATH_HALF_WIDTH + 0.06
  const cell = 0.4
  const grid = new Map<string, number[]>()
  samples.forEach((q, i) => {
    const key = `${Math.floor(q.x / cell)},${Math.floor(q.z / cell)}`
    const list = grid.get(key)
    if (list) list.push(i)
    else grid.set(key, [i])
  })
  for (let i = 0; i < samples.length; i++) {
    const q = samples[i]
    const ci = Math.floor(q.x / cell)
    const cj = Math.floor(q.z / cell)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const j of grid.get(`${ci + di},${cj + dj}`) ?? []) {
          if (j <= i) continue
          const p = samples[j]
          const d = Math.hypot(p.x - q.x, p.z - q.z)
          // Within one bend the path length between two points is at most ~pi/2 times their gap; more means a second pass.
          if (p.s - q.s < Math.max(0.5, 2 * d)) continue
          if (d < minGap && Math.abs(p.y - q.y) > 0.03) {
            return `trail overlaps itself at s=${q.s.toFixed(2)} and s=${p.s.toFixed(2)}`
          }
        }
      }
    }
  }
  return null
}

const MAX_VARIANTS = 3

/** Deterministic: the same (biome, seed) always yields the same layout. Retries variant seeds, then the biome's preview seed. */
export function buildIslandLayout(biome: Biome, seed: number): IslandLayout {
  const candidates = [seed]
  for (let variant = 1; variant <= MAX_VARIANTS; variant++) candidates.push(Math.floor(hash01(seed, variant, 97) * 1e6))
  for (const candidate of candidates) {
    const layout = buildOnce(biome, candidate)
    if (validateLayout(layout).length === 0) return layout
  }
  const fallback = buildOnce(biome, BIOME_TERRAIN[biome].previewSeed)
  if (import.meta.env?.DEV) console.warn(`[island] ${biome}:${seed} failed every variant; using preview seed`)
  return fallback
}

/** Data only (no closures), for determinism tests. */
export function serializeLayout(layout: IslandLayout): unknown {
  const { sdAt: _sdAt, levelAt: _levelAt, terraceY: _terraceY, groundHeightAt: _g, pathProject: _p, walkableRun: _w, heightGrid, blobs, ...data } = layout
  return {
    ...data,
    blobs: blobs.map((b) => (b ? { ...b, flutes: b.flutes ? { ...b.flutes, offsets: Array.from(b.flutes.offsets) } : null } : null)),
    heightGrid: { ...heightGrid, heights: Array.from(heightGrid.heights) },
    features: JSON.parse(JSON.stringify(layout.features, (_, v) => (v instanceof Float32Array ? Array.from(v) : v))),
  }
}

export { FOAM_MAX, FOOTPRINT_MAX, HALO_MAX }
```

- [ ] **Step 4: Add the full-sweep script**

npm's Windows script shell can't set an env var inline, so this is a Node wrapper in the same style as `scripts/db-push.mjs`. In `package.json` `scripts`, add after `"test:rls"`:

```json
    "test:island-sweep": "node scripts/island-sweep.mjs"
```

`scripts/island-sweep.mjs`:

```js
// Runs the island invariant sweep over 300 seeds per biome (spec §9.1). Slow: minutes, not seconds.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['vitest', 'run', 'src/lib/island/island.test.ts', '--project', 'unit', '--test-timeout', '1800000'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ISLAND_SWEEP: 'full' },
})
process.exit(result.status ?? 1)
```

- [ ] **Step 5: Run the sweep (default size)**

Run: `npx vitest run src/lib/island/island.test.ts --project unit --test-timeout 900000`
Expected: every test passes except the two in `islandAnchors / focusPose` (Task 10). About 40 s.

- [ ] **Step 6: Stage**

```bash
git add src/lib/island/plan.ts src/lib/island/island.test.ts scripts/island-sweep.mjs package.json
```

---

### Task 10: Island anchors and the focus pose

**Files:**
- Create: `src/lib/island/anchors.ts`

**Interfaces:**
- Consumes: `propRule` (Task 4), `localToWorld` (Task 1), `WATER_Y` (Task 1).
- Produces: `IslandAnchors`, `islandAnchors(layout)`, `FocusPoseOptions`, `FocusPose`, `FOCUS_ELEVATION`, `focusPose(layout, options)`.

Note on the panel inset: spec §5.6 says the lookAt "shifts left"; to move the *island* left of screen centre (away from the right-hand `RoadmapPanel`) the lookAt must move toward screen-right, which is what this does. The distance fit uses the aspect of the area the panel leaves free.

- [ ] **Step 1: Implement**

```ts
import type { IslandLayout, Vec3 } from './types'
import { WATER_Y } from './types'
import { propRule } from './biomes'
import { localToWorld } from './orientation'

export interface IslandAnchors {
  readonly labelY: number
  readonly cardY: number
  readonly hoverLift: number
  readonly focusTargetY: number
}

export function islandAnchors(layout: IslandLayout): IslandAnchors {
  const top = layout.levels.length - 1
  let tallest = 0
  for (const p of layout.props) {
    if (layout.levelAt(p.x, p.z) !== top) continue
    const height = propRule(layout.biome, p.kind)?.height ?? 0
    tallest = Math.max(tallest, p.y + height * p.scale - layout.summitTopY)
  }
  const labelY = Math.min(layout.summitTopY + tallest + 0.25, layout.summitTopY + 1.0)
  return { labelY, cardY: labelY + 0.45, hoverLift: 0.15 * layout.summitTopY, focusTargetY: 0.4 * layout.summitTopY }
}

export interface FocusPoseOptions {
  readonly aspect: number
  readonly fovDeg: number
  readonly insetRightPx: number
  readonly viewportPx: { readonly width: number; readonly height: number }
  readonly orbit: number
}

export interface FocusPose {
  readonly position: Vec3
  readonly lookAt: Vec3
  readonly distance: number
  readonly elevation: number
  readonly azimuth: number
}

export const FOCUS_ELEVATION = (38 * Math.PI) / 180
const DISTANCE_MIN = 7
const DISTANCE_MAX = 17
const NDC_LIMIT = 0.88
const BOUND_RADIUS = 3.15

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Spec §5.6: true 38° elevation, arrival azimuth world +X+Z plus the viewer's orbit, distance fitted so the island's
 * bounding cylinder stays inside ±0.88 NDC of the area the RoadmapPanel leaves free, clamped to [7, 17].
 * Offsets are world-oriented, relative to the island's world centre.
 */
export function focusPose(layout: IslandLayout, options: FocusPoseOptions): FocusPose {
  const azimuth = Math.PI / 4 + options.orbit
  const elevation = FOCUS_ELEVATION
  const frontWorld = localToWorld([Math.cos(layout.front), 0, Math.sin(layout.front)])
  const baseLookAt: V = [-0.12 * layout.footprintRadius * frontWorld[0], 0.4 * layout.summitTopY, -0.12 * layout.footprintRadius * frontWorld[2]]
  const dir: V = [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)]
  const forward: V = [-dir[0], -dir[1], -dir[2]]
  const right = norm([-forward[2], 0, forward[0]])
  const up: V = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]]
  const tanHalf = Math.tan((options.fovDeg * Math.PI) / 360)
  const freeFraction = Math.max(0.2, 1 - options.insetRightPx / Math.max(1, options.viewportPx.width))
  const aspect = options.aspect * freeFraction

  const bounds: V[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    for (const y of [WATER_Y, layout.summitTopY + 0.8]) bounds.push([BOUND_RADIUS * Math.cos(a), y, BOUND_RADIUS * Math.sin(a)])
  }
  const fits = (distance: number) => {
    const eye: V = [baseLookAt[0] + dir[0] * distance, baseLookAt[1] + dir[1] * distance, baseLookAt[2] + dir[2] * distance]
    return bounds.every((p) => {
      const v = sub(p, eye)
      const depth = dot(v, forward)
      return depth > 0 && Math.abs(dot(v, right) / (depth * tanHalf * aspect)) <= NDC_LIMIT && Math.abs(dot(v, up) / (depth * tanHalf)) <= NDC_LIMIT
    })
  }
  let distance = DISTANCE_MAX
  if (fits(DISTANCE_MIN)) distance = DISTANCE_MIN
  else if (fits(DISTANCE_MAX)) {
    let lo = DISTANCE_MIN
    let hi = DISTANCE_MAX
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid
      else lo = mid
    }
    distance = hi
  }

  // Pan along the camera's own screen-right so the island centres in the area left of the panel, at any orbit angle.
  const worldPerPx = (2 * distance * tanHalf) / Math.max(1, options.viewportPx.height)
  const shift = (options.insetRightPx / 2) * worldPerPx
  const lookAt: Vec3 = [baseLookAt[0] + right[0] * shift, baseLookAt[1], baseLookAt[2] + right[2] * shift]
  const position: Vec3 = [lookAt[0] + dir[0] * distance, lookAt[1] + dir[1] * distance, lookAt[2] + dir[2] * distance]
  return { position, lookAt, distance, elevation, azimuth }
}
```

- [ ] **Step 2: Run the full island suite**

Run: `npx vitest run src/lib/island --project unit --test-timeout 900000 && npm run typecheck && npm test`
Expected: all island tests pass (19 in `island.test.ts`, 21 across the unit files), typecheck clean, `npm test` green.

- [ ] **Step 3: Stage**

```bash
git add src/lib/island/anchors.ts
```

---

### Task 11: Shared terrain materials

**Files:**
- Create: `src/features/archipelago/terrain/materials.ts`
- Test: `src/features/archipelago/terrain/materials.test.ts`

**Interfaces:**
- Produces: `LitMaterialKind`, `createToonGradient()`, `getTerrainLitMaterial(kind?)`, `getPropMaterial(kind?)`, `terrainUnlitMaterial`. The toon gradient moves here from `JungleLandmass.tsx` (spec §12); the legacy file keeps its own copy until Task 15 deletes it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { MeshLambertMaterial, MeshToonMaterial, NearestFilter } from 'three'
import { createToonGradient, getPropMaterial, getTerrainLitMaterial, terrainUnlitMaterial } from './materials'

describe('terrain materials', () => {
  it('uses a three-step nearest-filtered toon gradient', () => {
    const g = createToonGradient()
    expect(Array.from(g.image.data as Uint8Array)).toEqual([120, 190, 255])
    expect(g.magFilter).toBe(NearestFilter)
  })

  it('shares one lit material per kind across islands', () => {
    expect(getTerrainLitMaterial()).toBe(getTerrainLitMaterial('toon'))
    expect(getTerrainLitMaterial()).toBeInstanceOf(MeshToonMaterial)
    expect(getTerrainLitMaterial('lambert')).toBeInstanceOf(MeshLambertMaterial)
    expect(getPropMaterial()).toBe(getPropMaterial())
    expect(getPropMaterial()).not.toBe(getTerrainLitMaterial())
  })

  it('keeps the unlit material off tone mapping', () => {
    expect(terrainUnlitMaterial.toneMapped).toBe(false)
    expect(terrainUnlitMaterial.vertexColors).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/archipelago/terrain --project unit`
Expected: FAIL, cannot resolve `./materials`.

- [ ] **Step 3: Implement**

```ts
import { DataTexture, MeshBasicMaterial, MeshLambertMaterial, MeshToonMaterial, NearestFilter, RedFormat } from 'three'
import type { Material } from 'three'

export type LitMaterialKind = 'toon' | 'lambert'

/** Three-step toon ramp (spec §2.5): shade, mid, lit. */
export function createToonGradient(): DataTexture {
  const texture = new DataTexture(new Uint8Array([120, 190, 255]), 3, 1, RedFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

let gradient: DataTexture | null = null
const lit = new Map<LitMaterialKind, Material>()
const prop = new Map<LitMaterialKind, Material>()

function makeLit(kind: LitMaterialKind): Material {
  if (kind === 'lambert') return new MeshLambertMaterial({ vertexColors: true })
  gradient ??= createToonGradient()
  return new MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
}

/** One shared lit material per kind for every island's terrain: no per-island clones (spec §8). */
export function getTerrainLitMaterial(kind: LitMaterialKind = 'toon'): Material {
  let m = lit.get(kind)
  if (!m) {
    m = makeLit(kind)
    lit.set(kind, m)
  }
  return m
}

export function getPropMaterial(kind: LitMaterialKind = 'toon'): Material {
  let m = prop.get(kind)
  if (!m) {
    m = makeLit(kind)
    prop.set(kind, m)
  }
  return m
}

/** Foam, shallows, pools and falls: authored colours, unaffected by light or tone mapping. */
export const terrainUnlitMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/features/archipelago/terrain --project unit`
Expected: 3 tests pass.

- [ ] **Step 5: Stage**

```bash
git add src/features/archipelago/terrain/materials.ts src/features/archipelago/terrain/materials.test.ts
```

---

### Task 12: Terrain mesher

**Files:**
- Create: `src/features/archipelago/terrain/terraceMesh.ts`
- Test: `src/features/archipelago/terrain/terraceMesh.test.ts`

**Interfaces:**
- Consumes: `IslandLayout` (Task 9), `BIOME_TERRAIN`, `SHARED_PALETTE` (Task 4), `BEACH`, `LAWN`, `FIELD_SOFTNESS`, `blobSd` (Task 5), `rayExit`, `sunOcclusion` (Task 6), `sunDirLocal` (Task 1), `levelCore` (Task 7), `valueNoise2` (Task 1).
- Produces: `IslandDetail`, `TerrainMeshes { lit, unlit, hull }`, `buildTerrain(layout, detail)`.

What it does (spec §3.8, §2.4):
- **Slicing** (spike C's algorithm): sample the level field on a grid (focus 0.07, overview 0.12, preview 0.15), clip each triangle at every class threshold into flat caps at the level's y, and emit a wall wherever a triangle edge crosses a threshold. Cliff walls get four colour bands, per-flute-bin tone and brightness, outward lean (`cliff.lean × height`) and slabs.
- **Caps**: noise blotches toward `capLight`/`capDark`, AO at the foot of the next cliff (and of the shelf), a light rim, and the baked sun shadow (`sunOcclusion` against `layout.heightGrid`, ×0.8 when fully blocked).
- **Water**: foam and shallows are polar rings (96 segments) in the unlit mesh, each starting just inside the level above so no water shows at the seam. This deviates from slicing them on the grid, which cost ~5.7k unlit triangles against the 5k budget.
- **Corridor**: triangles within the path half-width are clipped away and rebuilt as a strip flat across at the path's y, with `pathEdge` borders, `tread` bands every 0.15 of arc where rise/run > 0.15, round end caps, and cut/fill walls to the terrace on both sides. Overview and preview use every other section, one band and plain walls. The spec's fill-side curb is left out; add it at the sign-off if the ramps read as unguarded.
- **Features**: shelf prism, pool with foam ring, striped waterfall ribbons with splash discs, fluted pillars, water rocks with foam rings, the cave arch decal and hanging vines. Vines and the cave are focus-only.
- **Hull**: each level's outline (48 segments) as a prism, at most 800 triangles.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { buildIslandLayout } from '../../../lib/island/plan'
import { buildTerrain } from './terraceMesh'

const SEEDS = [1, 2, 3, 7, 42]

function triangles(g: BufferGeometry) {
  return g.getAttribute('position').count / 3
}

describe('buildTerrain', () => {
  const layout = buildIslandLayout('jungle', 1)
  const focus = buildTerrain(layout, 'focus')

  it('has no NaN positions and colours in [0, 1]', () => {
    for (const g of [focus.lit, focus.unlit]) {
      const pos = g.getAttribute('position').array
      for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true)
      const col = g.getAttribute('color').array
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toBeGreaterThanOrEqual(0)
        expect(col[i]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stays inside the halo and below the summit', () => {
    for (const g of [focus.lit, focus.unlit]) {
      g.computeBoundingBox()
      const box = g.boundingBox!
      expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(layout.haloRadius + 1e-6)
      expect(box.max.y).toBeLessThanOrEqual(layout.summitTopY + 0.1)
    }
  })

  it('makes cap triangles exactly horizontal', () => {
    const normal = focus.lit.getAttribute('normal')
    const pos = focus.lit.getAttribute('position')
    let caps = 0
    for (let i = 0; i < normal.count; i += 3) {
      const level = pos.getY(i) === pos.getY(i + 1) && pos.getY(i) === pos.getY(i + 2)
      if (level && normal.getY(i) > 0.5) {
        expect(normal.getY(i)).toBeGreaterThan(0.999)
        caps++
      }
    }
    expect(caps).toBeGreaterThan(1000)
  })

  it('lays the carved strip at the path height', () => {
    const pos = focus.lit.getAttribute('position')
    let checked = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const p = layout.pathProject(x, z)
      if (p.d > layout.trail.halfWidth * 0.5) continue
      if (Math.abs(pos.getY(i) - p.y) < 0.06) checked++
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('keeps a small hull that covers the whole trail', () => {
    expect(triangles(focus.hull)).toBeLessThanOrEqual(800)
    const mesh = new Mesh(focus.hull, new MeshBasicMaterial())
    const ray = new Raycaster()
    for (const q of layout.trail.samples.filter((_, i) => i % 5 === 0)) {
      ray.set(new Vector3(q.x, 5, q.z), new Vector3(0, -1, 0))
      expect(ray.intersectObject(mesh).length).toBeGreaterThan(0)
    }
  })

  it('stays inside the triangle budget (spec §8)', () => {
    for (const seed of SEEDS) {
      const l = buildIslandLayout('jungle', seed)
      const f = buildTerrain(l, 'focus')
      const o = buildTerrain(l, 'overview')
      expect(triangles(f.lit), `focus lit ${seed}`).toBeLessThanOrEqual(26000)
      expect(triangles(f.unlit), `focus unlit ${seed}`).toBeLessThanOrEqual(5000)
      expect(triangles(o.lit), `overview lit ${seed}`).toBeLessThanOrEqual(10000)
      expect(triangles(o.unlit), `overview unlit ${seed}`).toBeLessThanOrEqual(2000)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/archipelago/terrain/terraceMesh.test.ts --project unit`
Expected: FAIL, cannot resolve `./terraceMesh`.

- [ ] **Step 3: Implement**

```ts
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { hash01 } from '../../../lib/archipelago'
import type { IslandLayout, Vec2 } from '../../../lib/island/types'
import { WATER_Y } from '../../../lib/island/types'
import { BIOME_TERRAIN, SHARED_PALETTE } from '../../../lib/island/biomes'
import type { TerrainPalette } from '../../../lib/island/biomes'
import { BEACH, FIELD_SOFTNESS, LAWN, blobSd } from '../../../lib/island/shapes'
import { rayExit, sunOcclusion } from '../../../lib/island/query'
import { sunDirLocal } from '../../../lib/island/orientation'
import { levelCore } from '../../../lib/island/trailPlan'
import { valueNoise2 } from '../../../lib/island/random'

export type IslandDetail = 'overview' | 'focus' | 'preview'

export interface TerrainMeshes {
  readonly lit: BufferGeometry
  readonly unlit: BufferGeometry
  readonly hull: BufferGeometry
}

const CELL: Record<IslandDetail, number> = { focus: 0.07, overview: 0.12, preview: 0.15 }
const EXTENT = 3.5
const TAU = Math.PI * 2

type P3 = [number, number, number]
type Band = readonly [number, Color]

interface V {
  x: number
  z: number
  h: number
  m: number
  sd: Float64Array
  sun: number
}

const lerpV = (a: V, b: V, t: number): V => {
  const sd = new Float64Array(a.sd.length)
  for (let i = 0; i < sd.length; i++) sd[i] = a.sd[i] + (b.sd[i] - a.sd[i]) * t
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t, m: a.m + (b.m - a.m) * t, sd, sun: a.sun + (b.sun - a.sun) * t }
}

function clip(poly: V[], f: (v: V) => number): V[] {
  const out: V[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if (fa >= 0 !== fb >= 0) out.push(lerpV(a, b, fa / (fa - fb)))
  }
  return out
}

const color = (hex: string) => new Color(hex)

class Builder {
  readonly pos: number[] = []
  readonly col: number[] = []

  tri(a: P3, b: P3, c: P3, ca: Color, cb: Color = ca, cc: Color = ca) {
    this.pos.push(...a, ...b, ...c)
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
  }

  /** A triangle forced to face +Y. */
  up(a: P3, b: P3, c: P3, ca: Color, cb: Color = ca, cc: Color = ca) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    if (ny > 0) this.tri(a, b, c, ca, cb, cc)
    else this.tri(a, c, b, ca, cc, cb)
  }

  /** A triangle forced to face along `want`. */
  facing(a: P3, b: P3, c: P3, want: P3, k: Color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const n: P3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) this.tri(a, b, c, k)
    else this.tri(a, c, b, k)
  }

  /**
   * A near-vertical wall from p0 to p1 facing `n` (horizontal), banded bottom→top. `lean(f)` pushes a point at height
   * fraction f outward along n, which gives cliffs their outward lean and slabs.
   */
  wall(p0: Vec2, p1: Vec2, lo0: number, hi0: number, lo1: number, hi1: number, n: Vec2, bands: readonly Band[], lean: (f: number) => number = () => 0) {
    const nl = Math.hypot(n[0], n[1]) || 1
    const nx = n[0] / nl
    const nz = n[1] / nl
    const at = (p: Vec2, lo: number, hi: number, f: number): P3 => [p[0] + nx * lean(f), lo + (hi - lo) * f, p[1] + nz * lean(f)]
    let prev = 0
    for (const [frac, c] of bands) {
      if (frac <= prev) continue
      const a0 = at(p0, lo0, hi0, prev)
      const a1 = at(p0, lo0, hi0, frac)
      const b0 = at(p1, lo1, hi1, prev)
      const b1 = at(p1, lo1, hi1, frac)
      this.facing(a0, b0, b1, [nx, 0, nz], c)
      this.facing(a0, b1, a1, [nx, 0, nz], c)
      prev = frac
    }
  }

  get triangles() {
    return this.pos.length / 9
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    return g
  }
}

interface Ctx {
  readonly layout: IslandLayout
  readonly palette: TerrainPalette
  readonly cliff: (typeof BIOME_TERRAIN)['jungle']['cliff']
  readonly top: number
  readonly noise: (x: number, z: number) => number
}

/** Spec §2.4 cliff bands: dark base, main (lit/mid/shade per flute bin, ±12%), light rim, grass lip. */
function cliffBands(ctx: Ctx, level: number, x: number, z: number, height: number): { bands: Band[]; slab: boolean } {
  const blob = ctx.layout.blobs[level]
  const cx = blob?.cx ?? 0
  const cz = blob?.cz ?? 0
  const bin = Math.floor((Math.atan2(z - cz, x - cx) + Math.PI) * ctx.cliff.binsPerRadian)
  const seed = ctx.layout.seed
  const v = hash01(seed, bin, 200 + level)
  const tone = [ctx.palette.cliffLit, ctx.palette.cliff, ctx.palette.cliffShade][Math.floor(hash01(seed, bin, 230 + level) * 3)]
  const main = color(tone).multiplyScalar(0.88 + 0.24 * v)
  const base = color(ctx.palette.cliffBase).multiplyScalar(0.92 + 0.14 * v)
  const baseFrac = ctx.cliff.baseBand[0] + (ctx.cliff.baseBand[1] - ctx.cliff.baseBand[0]) * hash01(seed, bin, 260 + level)
  const lip = Math.min(0.045 / height, 0.2)
  const rim = Math.min(0.06 / height, 0.2)
  return {
    bands: [[baseFrac, base], [1 - lip - rim, main], [1 - lip, color(ctx.palette.cliffRim).multiplyScalar(0.95 + 0.1 * v)], [1, color(ctx.palette.lip)]],
    slab: hash01(seed, bin, 250 + level) < ctx.cliff.slabChance,
  }
}

function wallFor(ctx: Ctx, level: number, x: number, z: number, height: number): { bands: Band[]; lean: (f: number) => number } | null {
  if (height < 0.012) return null
  const role = ctx.layout.levels[level].wall
  if (role === 'sand') return { bands: [[1, color(SHARED_PALETTE.sandWall)]], lean: () => 0 }
  if (role === 'lip') return { bands: [[0.45, color(SHARED_PALETTE.sandWall)], [1, color(ctx.palette.lip)]], lean: () => 0 }
  if (role !== 'cliff') return null
  const { bands, slab } = cliffBands(ctx, level, x, z, height)
  const lean = ctx.cliff.lean * height
  return { bands, lean: (f) => lean * (1 - f) + (slab && f < 0.6 ? 0.06 * (1 - f / 0.6) : 0) }
}

function topColor(ctx: Ctx, level: number, v: V): Color {
  const { palette, layout } = ctx
  const n = ctx.noise(v.x * 0.9, v.z * 0.9) * 0.7 + ctx.noise(v.x * 2.3 + 5, v.z * 2.3) * 0.3
  if (level === BEACH) return color(SHARED_PALETTE.sand).multiplyScalar(1 + 0.03 * n)
  const c = color(level === LAWN ? palette.lawn : palette.cap)
  c.lerp(color(n > 0 ? palette.capLight : palette.capDark), Math.min(1, Math.abs(n) * 0.9))
  if (v.sd[level] < 0.05) c.lerp(color(palette.capLight), 0.5)
  if (level < ctx.top) {
    const d = -v.sd[level + 1]
    if (d < 0.45) c.multiplyScalar(0.74 + 0.26 * Math.max(0, d / 0.45))
  }
  if (layout.features.shelf && level === ctx.top - 1) {
    const d = -blobSd(layout.features.shelf.blob, v.x, v.z)
    if (d >= 0 && d < 0.45) c.multiplyScalar(0.74 + 0.26 * d / 0.45)
  }
  return c.multiplyScalar(1 - 0.2 * v.sun)
}

function slice(ctx: Ctx, lit: Builder, cell: number) {
  const { layout } = ctx
  const n = Math.ceil((2 * EXTENT) / cell)
  const sun = sunDirLocal()
  const verts: V[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -EXTENT + i * cell
      const z = -EXTENT + j * cell
      const sd = layout.sdAt(x, z)
      let h = 0
      let level = -1
      for (let k = 0; k < sd.length; k++) {
        h += Math.min(1, Math.max(0, sd[k] / FIELD_SOFTNESS + 0.5))
        if (sd[k] > 0 && level === k - 1) level = k
      }
      const m = level >= BEACH ? layout.pathProject(x, z).d - layout.trail.halfWidth : 1
      const occ = level >= LAWN ? sunOcclusion(layout.heightGrid, sun, x, layout.levels[level].y, z) : 0
      verts.push({ x, z, h, m, sd, sun: occ })
    }
  }

  const colourCache = new Map<V, Color>()
  const tint = (level: number, v: V) => {
    let c = colourCache.get(v)
    if (!c) {
      c = topColor(ctx, level, v)
      colourCache.set(v, c)
    }
    return c
  }

  const emit = (a: V, b: V, c: V) => {
    const hmin = Math.min(a.h, b.h, c.h)
    const hmax = Math.max(a.h, b.h, c.h)
    if (hmax < 0.5) return
    const carve = a.m < 0 || b.m < 0 || c.m < 0
    if (a.m < 0 && b.m < 0 && c.m < 0) return
    const lmin = Math.max(0, Math.floor(hmin - 0.5))
    const lmax = Math.min(ctx.top, Math.floor(hmax - 0.5))
    const tri = [a, b, c]
    for (let level = Math.max(BEACH, lmin); level <= lmax; level++) {
      let poly = tri
      if (level > lmin || hmin < level + 0.5) poly = clip(poly, (v) => v.h - (level + 0.5))
      if (level < lmax) poly = clip(poly, (v) => level + 1.5 - v.h)
      if (carve) poly = clip(poly, (v) => v.m)
      const y = layout.levels[level].y
      for (let k = 1; k + 1 < poly.length; k++) {
        const p0 = poly[0]
        const p1 = poly[k]
        const p2 = poly[k + 1]
        lit.up([p0.x, y, p0.z], [p1.x, y, p1.z], [p2.x, y, p2.z], tint(level, p0), tint(level, p1), tint(level, p2))
      }
    }
    for (let level = Math.max(BEACH, lmin + 1); level <= lmax; level++) {
      const t = level + 0.5 + 1e-7
      const cross: V[] = []
      for (let e = 0; e < 3; e++) {
        const p = tri[e]
        const q = tri[(e + 1) % 3]
        if ((p.h - t) * (q.h - t) < 0) cross.push(lerpV(p, q, (t - p.h) / (q.h - p.h)))
      }
      if (cross.length !== 2) continue
      let [p, q] = cross
      if (p.m < 0 && q.m < 0) continue
      if (p.m < 0) p = lerpV(p, q, p.m / (p.m - q.m))
      else if (q.m < 0) q = lerpV(q, p, q.m / (q.m - p.m))
      const low = tri.reduce((acc, v) => (v.h < acc.h ? v : acc))
      const mx = (p.x + q.x) / 2
      const mz = (p.z + q.z) / 2
      const lo = layout.levels[level - 1].y
      const hi = layout.levels[level].y
      const spec = wallFor(ctx, level, mx, mz, hi - lo)
      if (!spec) continue
      lit.wall([p.x, p.z], [q.x, q.z], lo, hi, lo, hi, [low.x - mx, low.z - mz], spec.bands, spec.lean)
    }
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v00 = verts[j * (n + 1) + i]
      const v10 = verts[j * (n + 1) + i + 1]
      const v01 = verts[(j + 1) * (n + 1) + i]
      const v11 = verts[(j + 1) * (n + 1) + i + 1]
      if ((i + j) % 2 === 0) {
        emit(v00, v10, v11)
        emit(v00, v11, v01)
      } else {
        emit(v00, v10, v01)
        emit(v10, v11, v01)
      }
    }
  }
}

/**
 * Foam and shallow halo as polar rings rather than grid slices: a fraction of the triangles for the same look. Each
 * ring starts a little inside the level above it, underneath that level's cap, so no water shows through the seam.
 */
function waterRings(ctx: Ctx, unlit: Builder) {
  const { layout } = ctx
  const segments = 96
  const radius = (level: number, a: number) => rayExit((x, z) => layout.sdAt(x, z)[level] > 0, 0, 0, a)
  const rings = Array.from({ length: segments }, (_, k) => {
    const a = (k / segments) * TAU
    return { a, beach: radius(BEACH, a), foam: radius(1, a), halo: radius(0, a) }
  })
  const foam = color(SHARED_PALETTE.foam)
  const foamEdge = color(SHARED_PALETTE.foamEdge)
  const shallow = color(SHARED_PALETTE.shallow)
  const water = color(SHARED_PALETTE.water)
  const at = (a: number, r: number, y: number): P3 => [Math.cos(a) * r, y, Math.sin(a) * r]
  for (let k = 0; k < segments; k++) {
    const p = rings[k]
    const q = rings[(k + 1) % segments]
    const a1 = k + 1 === segments ? TAU : q.a
    const quad = (r0p: number, r0q: number, r1p: number, r1q: number, y: number, inner: Color, outer: Color) => {
      unlit.up(at(p.a, r0p, y), at(p.a, r1p, y), at(a1, r1q, y), inner, outer, outer)
      unlit.up(at(p.a, r0p, y), at(a1, r1q, y), at(a1, r0q, y), inner, outer, inner)
    }
    const foamY = layout.levels[1].y
    quad(p.beach - 0.04, q.beach - 0.04, Math.max(p.beach, p.foam - 0.03), Math.max(q.beach, q.foam - 0.03), foamY, foam, foam)
    quad(Math.max(p.beach, p.foam - 0.03), Math.max(q.beach, q.foam - 0.03), p.foam, q.foam, foamY, foam, foamEdge)
    quad(p.foam - 0.03, q.foam - 0.03, p.halo, q.halo, layout.levels[0].y, shallow, water)
  }
}

/** Spec §3.8 corridor: a strip flat across at the path's own y, with cut walls up into terrain and fill walls down to it. */
function corridor(ctx: Ctx, lit: Builder, coarse: boolean) {
  const { layout, palette } = ctx
  const samples = coarse ? layout.trail.samples.filter((_, i, all) => i % 2 === 0 || i === all.length - 1) : layout.trail.samples
  const hw = layout.trail.halfWidth + 0.01
  const edges = samples.map((p, i) => {
    const a = samples[Math.max(0, i - 2)]
    const b = samples[Math.min(samples.length - 1, i + 2)]
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const nx = -(b.z - a.z) / tl
    const nz = (b.x - a.x) / tl
    const slope = (b.y - a.y) / Math.max(1e-6, b.s - a.s)
    return { p, nx, nz, slope }
  })
  const pathC = color(palette.path)
  const edgeC = color(palette.pathEdge)
  const treadC = color(palette.tread)
  const offsets = coarse ? [-hw, hw] : [-hw, -hw + 0.025, 0, hw - 0.025, hw]
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    const tread = a.slope > 0.15 && a.p.s % 0.15 < 0.035
    for (let k = 0; k + 1 < offsets.length; k++) {
      const c = tread ? treadC : !coarse && (k === 0 || k === offsets.length - 2) ? edgeC : pathC
      const p = (e: typeof a, o: number): P3 => [e.p.x + e.nx * o, e.p.y, e.p.z + e.nz * o]
      lit.up(p(a, offsets[k]), p(a, offsets[k + 1]), p(b, offsets[k + 1]), c)
      lit.up(p(a, offsets[k]), p(b, offsets[k + 1]), p(b, offsets[k]), c)
    }
  }
  for (const e of [edges[0], edges[edges.length - 1]]) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU
      const a1 = ((k + 1) / 16) * TAU
      lit.up([e.p.x, e.p.y, e.p.z], [e.p.x + Math.cos(a0) * hw, e.p.y, e.p.z + Math.sin(a0) * hw], [e.p.x + Math.cos(a1) * hw, e.p.y, e.p.z + Math.sin(a1) * hw], pathC)
    }
  }
  for (const side of [1, -1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i]
      const b = edges[i + 1]
      const pa: Vec2 = [a.p.x + a.nx * hw * side, a.p.z + a.nz * hw * side]
      const pb: Vec2 = [b.p.x + b.nx * hw * side, b.p.z + b.nz * hw * side]
      const out: Vec2 = [a.nx * side, a.nz * side]
      const ta = layout.terraceY(pa[0] + out[0] * 0.05, pa[1] + out[1] * 0.05)
      const tb = layout.terraceY(pb[0] + out[0] * 0.05, pb[1] + out[1] * 0.05)
      const lo0 = Math.min(a.p.y, ta)
      const hi0 = Math.max(a.p.y, ta)
      const lo1 = Math.min(b.p.y, tb)
      const hi1 = Math.max(b.p.y, tb)
      const h = Math.max(hi0 - lo0, hi1 - lo1)
      if (h < 0.01) continue
      const cut = ta + tb > a.p.y + b.p.y
      const level = Math.max(BEACH, layout.levelAt(pa[0] + out[0] * 0.1, pa[1] + out[1] * 0.1))
      const bands: Band[] = h < 0.05 || coarse ? [[1, color(h < 0.05 ? palette.lip : palette.cliff)]] : cliffBands(ctx, Math.max(LAWN + 1, level), pa[0], pa[1], h).bands
      lit.wall(pa, pb, lo0, hi0, lo1, hi1, cut ? [-out[0], -out[1]] : out, bands)
    }
  }
}

function prism(b: Builder, ring: Vec2[], lo: number, hi: number, cap: Color, bands: (i: number) => Band[]) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]
    const c = ring[(k + 1) % ring.length]
    b.up([cx, hi, cz], [a[0], hi, a[1]], [c[0], hi, c[1]], cap)
    b.wall(a, c, lo, hi, lo, hi, [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cz], bands(k))
  }
}

function features(ctx: Ctx, lit: Builder, unlit: Builder, coarse: boolean) {
  const { layout, palette } = ctx
  const f = layout.features
  const seed = layout.seed
  if (f.shelf) {
    const shelf = f.shelf
    const below = ctx.top - 1
    const inside = (x: number, z: number) => Math.min(blobSd(shelf.blob, x, z), layout.sdAt(x, z)[below] - 0.08) > 0
    const ring: Vec2[] = []
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU
      const r = rayExit(inside, shelf.blob.cx, shelf.blob.cz, a)
      ring.push([shelf.blob.cx + Math.cos(a) * r, shelf.blob.cz + Math.sin(a) * r])
    }
    prism(lit, ring, shelf.baseY, shelf.y, color(palette.cap), (k) => cliffBands(ctx, below, ring[k][0], ring[k][1], shelf.y - shelf.baseY).bands)
  }
  if (f.pool) {
    const poolC = color(palette.pool ?? SHARED_PALETTE.shallow)
    const foamC = color(SHARED_PALETTE.foam)
    for (let k = 0; k < 20; k++) {
      const a0 = (k / 20) * TAU
      const a1 = ((k + 1) / 20) * TAU
      const at = (a: number, r: number, dy = 0): P3 => [f.pool!.x + Math.cos(a) * r, f.pool!.y + dy, f.pool!.z + Math.sin(a) * r]
      unlit.up(at(0, 0), at(a0, f.pool.r), at(a1, f.pool.r), poolC)
      unlit.up(at(a0, f.pool.r), at(a0, f.pool.r + 0.03, 0.001), at(a1, f.pool.r + 0.03, 0.001), foamC)
      unlit.up(at(a0, f.pool.r), at(a1, f.pool.r + 0.03, 0.001), at(a1, f.pool.r), foamC)
    }
  }
  if (f.fall && f.fall.samples.length > 1) waterfall(ctx, unlit)
  for (const p of f.pillars) {
    const ring: Vec2[] = []
    for (let k = 0; k < p.sides; k++) {
      const a = p.rot + (k / p.sides) * TAU + hash01(seed, k, 400) * 0.4
      const r = p.r * (0.82 + 0.3 * hash01(seed, k, 401))
      ring.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r])
    }
    const capC = color(p.grassCap ? palette.cap : palette.pillarCap)
    prism(lit, ring, p.baseY - 0.02, p.topY, capC, (k) => {
      const v = hash01(seed, k, 402)
      return [[0.3, color(palette.cliffBase).multiplyScalar(0.9 + 0.15 * v)], [0.93, color(palette.pillar).multiplyScalar(0.88 + 0.24 * v)], [1, color(p.grassCap ? palette.lip : palette.pillarCap)]]
    })
  }
  for (const r of f.waterRocks) {
    const ring: Vec2[] = []
    for (let k = 0; k < 6; k++) ring.push([r.x + Math.cos(r.rot + (k / 6) * TAU) * r.r, r.z + Math.sin(r.rot + (k / 6) * TAU) * r.r])
    prism(lit, ring, WATER_Y - 0.05, WATER_Y + r.height, color(palette.pillarCap), () => [[0.6, color(palette.cliffBase)], [1, color(palette.pillar)]])
    const foam = color(SHARED_PALETTE.foam)
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU
      const a1 = ((k + 1) / 16) * TAU
      const at = (a: number, rr: number): P3 => [r.x + Math.cos(a) * rr, -0.036, r.z + Math.sin(a) * rr]
      unlit.up(at(a0, r.r * 0.9), at(a0, r.r * 1.35 + 0.05), at(a1, r.r * 1.35 + 0.05), foam)
      unlit.up(at(a0, r.r * 0.9), at(a1, r.r * 1.35 + 0.05), at(a1, r.r * 0.9), foam)
    }
  }
  const crevice = color(palette.crevice)
  for (const c of coarse ? [] : f.caves) {
    const ox = Math.sin(c.rotY)
    const oz = Math.cos(c.rotY)
    const px = oz
    const pz = -ox
    const base: P3 = [c.x + ox * 0.015, c.y, c.z + oz * 0.015]
    for (let k = 0; k < 12; k++) {
      const t0 = (k / 12) * Math.PI
      const t1 = ((k + 1) / 12) * Math.PI
      const at = (t: number): P3 => [base[0] - px * Math.cos(t) * (c.width / 2), c.y + Math.sin(t) * c.height, base[2] - pz * Math.cos(t) * (c.width / 2)]
      lit.facing(base, at(t0), at(t1), [ox, 0, oz], crevice)
    }
  }
  const vineC = color(palette.foliage.vine ?? palette.lip)
  const leafC = color(palette.foliage.vineLeaf ?? palette.capLight)
  for (const v of coarse ? [] : f.vines) {
    const ox = Math.sin(v.rotY) * 0.012
    const oz = Math.cos(v.rotY) * 0.012
    const px = Math.cos(v.rotY) * 0.015
    const pz = -Math.sin(v.rotY) * 0.015
    const want: P3 = [Math.sin(v.rotY), 0, Math.cos(v.rotY)]
    const segs = 6
    for (let i = 0; i < segs; i++) {
      const y0 = v.y - (v.length * i) / segs
      const y1 = v.y - (v.length * (i + 1)) / segs
      const sw0 = Math.sin(i * 1.3) * 0.01
      const sw1 = Math.sin((i + 1) * 1.3) * 0.01
      const at = (y: number, s: number, sw: number): P3 => [v.x + ox + px * s + px * sw * 60, y, v.z + oz + pz * s + pz * sw * 60]
      lit.facing(at(y0, -1, sw0), at(y0, 1, sw0), at(y1, 1, sw1), want, vineC)
      lit.facing(at(y0, -1, sw0), at(y1, 1, sw1), at(y1, -1, sw1), want, vineC)
      if (i % 2 === 1) {
        const side = i % 4 === 1 ? 1 : -1
        const ly = (y0 + y1) / 2
        const c0 = at(ly, 0, sw0)
        lit.facing(c0, at(ly + 0.03, 2.5 * side, sw0), at(ly - 0.015, 4 * side, sw0), want, leafC)
        lit.facing(c0, at(ly - 0.015, 4 * side, sw0), at(ly - 0.05, 2.5 * side, sw0), want, leafC)
      }
    }
  }
}

function waterfall(ctx: Ctx, unlit: Builder) {
  const fall = ctx.layout.features.fall!
  const base = color(ctx.palette.fall ?? SHARED_PALETTE.shallow)
  const streak = color(ctx.palette.fallStreak ?? SHARED_PALETTE.foam)
  const foam = color(SHARED_PALETTE.foam)
  const [dx, dz] = fall.dir
  const px = -dz
  const pz = dx
  const hw = 0.1
  const disc = (x: number, z: number, y: number, r: number, c: Color) => {
    for (let k = 0; k < 14; k++) {
      const a0 = (k / 14) * TAU
      const a1 = ((k + 1) / 14) * TAU
      unlit.up([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], c)
    }
  }
  const s = fall.samples
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i]
    const c = s[i + 1]
    if (Math.abs(a[1] - c[1]) < 1e-4) {
      const y = a[1] + 0.006
      unlit.up([a[0] + px * hw, y, a[2] + pz * hw], [a[0] - px * hw, y, a[2] - pz * hw], [c[0] - px * hw, y, c[2] - pz * hw], base)
      unlit.up([a[0] + px * hw, y, a[2] + pz * hw], [c[0] - px * hw, y, c[2] - pz * hw], [c[0] + px * hw, y, c[2] + pz * hw], base)
      continue
    }
    const fx = (a[0] + c[0]) / 2 + dx * 0.03
    const fz = (a[2] + c[2]) / 2 + dz * 0.03
    const lanes = 5
    for (let k = 0; k < lanes; k++) {
      const u0 = -hw + (2 * hw * k) / lanes
      const u1 = -hw + (2 * hw * (k + 1)) / lanes
      unlit.wall([fx + px * u0, fz + pz * u0], [fx + px * u1, fz + pz * u1], c[1], a[1] + 0.006, c[1], a[1] + 0.006, [dx, dz], [[1, k % 2 === 0 ? streak : base]])
    }
    disc(fx + dx * 0.1, fz + dz * 0.1, c[1] + 0.007, 0.18, foam)
  }
}

/** Spec §3.8 hull: each level's outline (48 segments) as a prism, ~600 triangles, for pointer events and label occlusion. */
function hull(ctx: Ctx): BufferGeometry {
  const { layout } = ctx
  const b = new Builder()
  const plain = new Color(1, 1, 1)
  for (let level = BEACH; level <= ctx.top; level++) {
    const centre: Vec2 = level <= LAWN ? [0, 0] : levelCore(layout, level, [layout.blobs[level]!.cx, layout.blobs[level]!.cz])
    const inside = (x: number, z: number) => layout.sdAt(x, z)[level] > 0
    const ring: Vec2[] = []
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU
      const r = rayExit(inside, centre[0], centre[1], a)
      ring.push([centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r])
    }
    prism(b, ring, WATER_Y, layout.levels[level].y, plain, () => [[1, plain]])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.computeVertexNormals()
  return g
}

/** Pure: layout → { lit, unlit, hull } (spec §3.8). Non-indexed, so computeVertexNormals gives flat shading. */
export function buildTerrain(layout: IslandLayout, detail: IslandDetail): TerrainMeshes {
  const cfg = BIOME_TERRAIN[layout.biome]
  const n = valueNoise2(layout.seed, 310)
  const ctx: Ctx = { layout, palette: cfg.palette, cliff: cfg.cliff, top: layout.levels.length - 1, noise: (x, z) => 2 * n(x, z) - 1 }
  const lit = new Builder()
  const unlit = new Builder()
  slice(ctx, lit, CELL[detail])
  waterRings(ctx, unlit)
  const coarse = detail !== 'focus'
  corridor(ctx, lit, coarse)
  features(ctx, lit, unlit, coarse)
  return { lit: lit.geometry(), unlit: unlit.geometry(), hull: hull(ctx) }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/features/archipelago/terrain --project unit --test-timeout 600000`
Expected: 9 tests pass (6 mesher + 3 materials).

- [ ] **Step 5: Stage**

```bash
git add src/features/archipelago/terrain/terraceMesh.ts src/features/archipelago/terrain/terraceMesh.test.ts
```

---

### Task 13: Procedural prop geometry

**Files:**
- Create: `src/features/archipelago/terrain/propGeometry.ts`
- Test: `src/features/archipelago/terrain/propGeometry.test.ts`

**Interfaces:**
- Consumes: `BIOME_TERRAIN`, `SHARED_PALETTE`, `propRule` (Task 4), `hash01`.
- Produces: `getPropGeometry(kind, biome)`: one merged, vertex-coloured geometry per kind and biome, base at y = 0, height exactly `propRule(biome, kind).height`, cached. Every jungle kind is built (spec §3.9 table); other kinds get a placeholder rock until the next plan.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { BIOME_TERRAIN } from '../../../lib/island/biomes'
import { getPropGeometry } from './propGeometry'

describe('getPropGeometry', () => {
  const rules = BIOME_TERRAIN.jungle.props

  it('builds every jungle kind with colours, base on the ground and exact rule height', () => {
    for (const rule of rules) {
      const g = getPropGeometry(rule.kind, 'jungle')
      expect(g.getAttribute('color'), rule.kind).toBeDefined()
      g.computeBoundingBox()
      const box = g.boundingBox!
      expect(box.min.y, rule.kind).toBeCloseTo(0, 6)
      expect(Math.abs(box.max.y - rule.height) / rule.height, rule.kind).toBeLessThanOrEqual(0.05)
    }
  })

  it('caches one geometry per kind and biome', () => {
    expect(getPropGeometry('palm', 'jungle')).toBe(getPropGeometry('palm', 'jungle'))
  })

  it('keeps the focused jungle prop budget under 14k triangles', () => {
    let tris = 0
    for (const rule of rules) tris += (getPropGeometry(rule.kind, 'jungle').getAttribute('position').count / 3) * rule.count
    expect(tris).toBeLessThanOrEqual(14000)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/archipelago/terrain/propGeometry.test.ts --project unit`
Expected: FAIL, cannot resolve `./propGeometry`.

- [ ] **Step 3: Implement**

```ts
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, BoxGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash01 } from '../../../lib/archipelago'
import type { Biome, PropKind } from '../../../lib/island/types'
import { BIOME_TERRAIN, SHARED_PALETTE, propRule } from '../../../lib/island/biomes'

const TAU = Math.PI * 2

/** Non-indexed copy with one flat colour, uv dropped so every part merges cleanly. */
function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  flat.deleteAttribute('uv')
  flat.deleteAttribute('normal')
  const c = new Color(hex)
  const n = flat.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  flat.setAttribute('color', new Float32BufferAttribute(col, 3))
  return flat
}

/** A free-form triangle list with per-triangle colours. */
function tris(list: readonly [Vector3, Vector3, Vector3, string][]): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  for (const [a, b, c, hex] of list) {
    const k = new Color(hex)
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

function jitter(g: BufferGeometry, amount: number, salt: number): BufferGeometry {
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(pos.getX(i) * 1000) * 7 + Math.round(pos.getY(i) * 1000) * 13 + Math.round(pos.getZ(i) * 1000) * 17
    const k = 1 + (hash01(key, 0, salt) - 0.5) * 2 * amount
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k)
  }
  return g
}

function palm(f: Record<string, string>): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const bez = (t: number) => new Vector3(0.12 * t * t, t, 0)
  for (let i = 0; i < 7; i++) {
    const a = bez(i / 7)
    const b = bez((i + 1) / 7)
    const seg = new CylinderGeometry(0.045 - 0.003 * (i + 1), 0.05 - 0.003 * i, b.distanceTo(a), 6)
    seg.rotateZ(-Math.atan2(b.x - a.x, b.y - a.y))
    seg.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
    parts.push(paint(seg, i % 2 === 0 ? f.palmTrunk : f.palmRing))
  }
  const crown = bez(1)
  const fronds: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-dir.z, 0, dir.x)
    let prev = crown.clone()
    for (let s = 1; s <= 4; s++) {
      const u = s / 4
      const next = crown.clone().addScaledVector(dir, 0.42 * u).add(new Vector3(0, 0.1 * u - 0.32 * u * u, 0))
      const w = 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.2))
      const hex = s === 4 ? f.frondTip : f.frond
      const mid = prev.clone().lerp(next, 0.5).add(new Vector3(0, 0.02, 0))
      fronds.push([prev, mid.clone().addScaledVector(side, w), next, hex], [prev, next, mid.clone().addScaledVector(side, -w), hex])
      prev = next
    }
  }
  parts.push(tris(fronds))
  return parts
}

const CANOPY_BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.62, 0, 0.3],
  [0.2, 0.52, 0.06, 0.21],
  [-0.19, 0.54, -0.07, 0.22],
  [0.03, 0.86, -0.03, 0.2],
  [0.02, 0.5, 0.2, 0.18],
]

function canopy(f: Record<string, string>): BufferGeometry[] {
  const parts = [paint(new CylinderGeometry(0.04, 0.065, 0.5, 6).translate(0, 0.25, 0), f.canopyTrunk)]
  CANOPY_BLOBS.forEach(([x, y, z, r], i) => {
    const hex = i === 3 ? f.canopyTop : i % 2 === 0 ? f.canopy : f.canopyShade
    parts.push(paint(jitter(new IcosahedronGeometry(r, 1).translate(x, y, z), 0.06, 20 + i), hex))
  })
  return parts
}

function bush(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(jitter(new IcosahedronGeometry(0.12, 1).translate(0, 0.1, 0), 0.08, 30), f.bush),
    paint(jitter(new IcosahedronGeometry(0.09, 0).translate(0.09, 0.08, 0.03), 0.08, 31), f.bush),
    paint(jitter(new IcosahedronGeometry(0.08, 0).translate(-0.07, 0.07, -0.05), 0.08, 32), f.bush),
  ]
}

function fern(f: Record<string, string>): BufferGeometry[] {
  const leaves: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-dir.z, 0, dir.x)
    const base = new Vector3(0, 0.01, 0)
    const mid = dir.clone().multiplyScalar(0.05).add(new Vector3(0, 0.05, 0))
    const tip = dir.clone().multiplyScalar(0.09).add(new Vector3(0, 0.03, 0))
    leaves.push([base, mid.clone().addScaledVector(side, 0.025), tip, f.fern], [base, tip, mid.clone().addScaledVector(side, -0.025), f.fern])
  }
  return [tris(leaves)]
}

function flower(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.006, 0.008, 0.1, 4).translate(0, 0.05, 0), f.grass ?? f.fern),
    paint(new CylinderGeometry(0.035, 0.035, 0.012, 6).translate(0, 0.106, 0), f.flower),
    paint(new CylinderGeometry(0.012, 0.012, 0.014, 5).translate(0, 0.114, 0), f.flowerCentre),
  ]
}

function mushroom(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.015, 0.02, 0.06, 6).translate(0, 0.03, 0), f.mushroomStem),
    paint(new ConeGeometry(0.045, 0.04, 7).translate(0, 0.08, 0), f.mushroom),
  ]
}

function grass(f: Record<string, string>): BufferGeometry[] {
  const blades: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3
    const d = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-d.z, 0, d.x).multiplyScalar(0.012)
    const tip = d.clone().multiplyScalar(0.03).add(new Vector3(0, 0.1, 0))
    blades.push([side.clone(), side.clone().negate(), tip, f.grass ?? f.fern])
  }
  return [tris(blades)]
}

function stump(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.09, 0.11, 0.14, 8).translate(0, 0.07, 0), f.stump),
    paint(new CylinderGeometry(0.075, 0.075, 0.01, 8).translate(0, 0.145, 0), f.stumpInner),
    paint(new CylinderGeometry(0.05, 0.05, 0.02, 6).translate(0.03, 0.15, 0.02), f.stumpMoss),
  ]
}

function heroRock(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(jitter(new IcosahedronGeometry(1, 1).scale(0.3, 0.22, 0.26).translate(0, 0.2, 0), 0.1, 40), f.heroRock),
    paint(jitter(new IcosahedronGeometry(1, 1).scale(0.2, 0.08, 0.18).translate(0.01, 0.34, 0.005), 0.08, 41), f.heroRockMoss),
  ]
}

function log(f: Record<string, string>): BufferGeometry[] {
  return [paint(new CylinderGeometry(0.05, 0.05, 0.36, 7).rotateZ(Math.PI / 2).translate(0, 0.05, 0), f.log ?? f.stump)]
}

function lily(f: Record<string, string>): BufferGeometry[] {
  const pads: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 7; k++) {
    const a0 = 0.5 + (k / 7) * (TAU - 0.5)
    const a1 = 0.5 + ((k + 1) / 7) * (TAU - 0.5)
    pads.push([new Vector3(0, 0.02, 0), new Vector3(Math.cos(a0) * 0.1, 0.02, Math.sin(a0) * 0.1), new Vector3(Math.cos(a1) * 0.1, 0.02, Math.sin(a1) * 0.1), f.lily ?? f.bush])
  }
  pads.push([new Vector3(0, 0, 0), new Vector3(0.01, 0.02, 0), new Vector3(0, 0.02, 0.01), f.lily ?? f.bush])
  return [tris(pads)]
}

function tent(f: Record<string, string>): BufferGeometry[] {
  const w = 0.13
  const h = 0.2
  const d = 0.3
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
  const [a, b, c, e, g, k] = [v(-w, 0, -d / 2), v(w, 0, -d / 2), v(0, h, -d / 2), v(-w, 0, d / 2), v(w, 0, d / 2), v(0, h, d / 2)]
  const door = [v(-0.05, 0, d / 2 + 0.002), v(0.05, 0, d / 2 + 0.002), v(0, 0.11, d / 2 + 0.002)] as const
  return [tris([[a, c, k, f.tent], [a, k, e, f.tent], [b, g, k, f.tent], [b, k, c, f.tent], [a, b, c, f.tent], [e, k, g, f.tent], [door[0], door[1], door[2], f.tentDoor]])]
}

function campfire(f: Record<string, string>): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    parts.push(paint(new IcosahedronGeometry(0.018, 0).translate(Math.cos(a) * 0.045, 0.012, Math.sin(a) * 0.045), f.campfireStone))
  }
  parts.push(paint(new ConeGeometry(0.025, 0.06, 5).translate(0, 0.03, 0), f.ember))
  return parts
}

function signpost(): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.014, 0.016, 0.34, 5).translate(0, 0.17, 0), SHARED_PALETTE.pennantPole),
    paint(new BoxGeometry(0.16, 0.06, 0.012).translate(0.05, 0.28, 0), '#B98452'),
  ]
}

function summitCairn(): BufferGeometry[] {
  const radii = [0.1, 0.085, 0.07, 0.055, 0.04]
  let y = 0
  return radii.map((r, i) => {
    const g = jitter(new IcosahedronGeometry(r, 0).scale(1, 0.55, 1).translate(0, y + r * 0.5, 0), 0.08, 50 + i)
    y += r * 1.05
    return paint(g, i === radii.length - 1 ? SHARED_PALETTE.cairnDone : SHARED_PALETTE.cairnPending)
  })
}

function fallback(hex: string): BufferGeometry[] {
  return [paint(jitter(new IcosahedronGeometry(0.2, 0).translate(0, 0.2, 0), 0.1, 60), hex)]
}

function build(kind: PropKind, f: Record<string, string>): BufferGeometry[] {
  switch (kind) {
    case 'palm': return palm(f)
    case 'canopyTree': return canopy(f)
    case 'bush': return bush(f)
    case 'fernRosette': return fern(f)
    case 'flower': return flower(f)
    case 'mushroom': return mushroom(f)
    case 'grassTuft': return grass(f)
    case 'stump': return stump(f)
    case 'heroRock': return heroRock(f)
    case 'log': return log(f)
    case 'lily': return lily(f)
    case 'tent': return tent(f)
    case 'campfire': return campfire(f)
    case 'signpost': return signpost()
    case 'summitCairn': return summitCairn()
    default: return fallback(Object.values(f)[0] ?? '#7FA36A')
  }
}

const cache = new Map<string, BufferGeometry>()

/**
 * One vertex-coloured, non-indexed geometry per kind and biome (spec §3.9), base at y = 0 and height exactly
 * propRule(biome, kind).height, so instance scale maps straight onto the scale caps. Cached for the app's lifetime.
 */
export function getPropGeometry(kind: PropKind, biome: Biome): BufferGeometry {
  const key = `${biome}:${kind}`
  let g = cache.get(key)
  if (g) return g
  const f = BIOME_TERRAIN[biome].palette.foliage as Record<string, string>
  g = mergeGeometries(build(kind, f))!
  g.computeBoundingBox()
  const box = g.boundingBox!
  const target = propRule(biome, kind)?.height ?? box.max.y - box.min.y
  const k = target / Math.max(1e-6, box.max.y - box.min.y)
  g.translate(0, -box.min.y, 0)
  g.scale(k, k, k)
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  cache.set(key, g)
  return g
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/archipelago/terrain --project unit --test-timeout 600000 && npm run typecheck`
Expected: 12 terrain tests pass; typecheck clean.

- [ ] **Step 5: Stage**

```bash
git add src/features/archipelago/terrain/propGeometry.ts src/features/archipelago/terrain/propGeometry.test.ts
```

---

### Task 14: Layout and build cache with an idle-time scheduler

**Files:**
- Create: `src/features/archipelago/terrain/islandCache.ts`
- Test: `src/features/archipelago/terrain/islandCache.test.ts`

**Interfaces:**
- Consumes: `buildIslandLayout` (Task 9), `buildTerrain` (Task 12), `getPropGeometry` (Task 13), `propRule` (Task 4).
- Produces: `IslandBuild`, `getIslandLayout(biome, seed)` (LRU 48), `getIslandBuild(biome, seed, detail)` (LRU 24, ref-counted), `releaseIslandBuild(build)`, `useIslandBuild(biome, seed, detail, priority)`. Every consumer of a layout (Island, RoadmapTrail, MilestoneBuilder, BiomePicker, CameraRig) goes through `getIslandLayout`, so a layout is built once.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getIslandBuild, getIslandLayout, releaseIslandBuild } from './islandCache'

describe('islandCache', () => {
  it('builds each layout once', () => {
    expect(getIslandLayout('jungle', 3)).toBe(getIslandLayout('jungle', 3))
  })

  it('reuses a build and reports its cost', () => {
    const a = getIslandBuild('jungle', 3, 'overview')
    const b = getIslandBuild('jungle', 3, 'overview')
    expect(b).toBe(a)
    expect(a.layout).toBe(getIslandLayout('jungle', 3))
    expect(a.triangles.lit).toBeGreaterThan(0)
    expect(a.buildMs).toBeGreaterThan(0)
    releaseIslandBuild(a)
    releaseIslandBuild(b)
  })

  it('never disposes a build that is still held', () => {
    const held = getIslandBuild('jungle', 4, 'preview')
    for (let seed = 100; seed < 130; seed++) releaseIslandBuild(getIslandBuild('jungle', seed, 'preview'))
    expect(held.lit.getAttribute('position')).toBeDefined()
    expect(getIslandBuild('jungle', 4, 'preview')).toBe(held)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/archipelago/terrain/islandCache.test.ts --project unit`
Expected: FAIL, cannot resolve `./islandCache`.

- [ ] **Step 3: Implement**

```ts
import { useEffect, useRef, useState } from 'react'
import type { Biome, IslandLayout } from '../../../lib/island/types'
import { LAYOUT_VERSION } from '../../../lib/island/types'
import { buildIslandLayout } from '../../../lib/island/plan'
import { propRule } from '../../../lib/island/biomes'
import { buildTerrain } from './terraceMesh'
import type { IslandDetail, TerrainMeshes } from './terraceMesh'
import { getPropGeometry } from './propGeometry'

export interface IslandBuild extends TerrainMeshes {
  readonly layout: IslandLayout
  readonly detail: IslandDetail
  readonly buildMs: number
  readonly triangles: { readonly lit: number; readonly unlit: number; readonly props: number }
}

const LAYOUT_LIMIT = 48
const BUILD_LIMIT = 24
const layouts = new Map<string, IslandLayout>()
const builds = new Map<string, { build: IslandBuild; refs: number }>()

const layoutKey = (biome: Biome, seed: number) => `v${LAYOUT_VERSION}:${biome}:${seed}`

/** Synchronous and memoised (LRU 48): the one layout every consumer of an island reads. */
export function getIslandLayout(biome: Biome, seed: number): IslandLayout {
  const key = layoutKey(biome, seed)
  let layout = layouts.get(key)
  if (layout) layouts.delete(key)
  else layout = buildIslandLayout(biome, seed)
  layouts.set(key, layout)
  while (layouts.size > LAYOUT_LIMIT) layouts.delete(layouts.keys().next().value!)
  return layout
}

function evict() {
  for (const [key, entry] of builds) {
    if (builds.size <= BUILD_LIMIT) return
    if (entry.refs > 0) continue
    entry.build.lit.dispose()
    entry.build.unlit.dispose()
    entry.build.hull.dispose()
    builds.delete(key)
  }
}

/** Synchronous, memoised (LRU 24) and ref-counted; geometry is disposed only when evicted with no holders. */
export function getIslandBuild(biome: Biome, seed: number, detail: IslandDetail): IslandBuild {
  const key = `${layoutKey(biome, seed)}:${detail}`
  const cached = builds.get(key)
  if (cached) {
    builds.delete(key)
    builds.set(key, cached)
    cached.refs++
    return cached.build
  }
  const t0 = performance.now()
  const layout = getIslandLayout(biome, seed)
  const terrain = buildTerrain(layout, detail)
  let props = 0
  for (const p of layout.props) {
    if (detail !== 'focus' && !propRule(biome, p.kind)?.overview) continue
    props += getPropGeometry(p.kind, biome).getAttribute('position').count / 3
  }
  const build: IslandBuild = {
    ...terrain,
    layout,
    detail,
    buildMs: performance.now() - t0,
    triangles: { lit: terrain.lit.getAttribute('position').count / 3, unlit: terrain.unlit.getAttribute('position').count / 3, props },
  }
  builds.set(key, { build, refs: 1 })
  evict()
  return build
}

export function releaseIslandBuild(build: IslandBuild): void {
  for (const entry of builds.values()) {
    if (entry.build === build) {
      entry.refs = Math.max(0, entry.refs - 1)
      return
    }
  }
}

type Job = () => void
const queue: Job[] = []
let draining = false

// The timeout bounds the wait: a page that never goes idle (or headless Chrome's virtual time) must still build.
function nextSlot(run: () => void) {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 100 })
  else setTimeout(run, 16)
}

function drain() {
  const job = queue.shift()
  if (!job) {
    draining = false
    return
  }
  job()
  nextSlot(drain)
}

/** One build per idle slot, so ten islands never stall a frame together; the focused island jumps the queue. */
function schedule(priority: 'high' | 'normal', job: Job): () => void {
  if (priority === 'high') queue.unshift(job)
  else queue.push(job)
  if (!draining) {
    draining = true
    nextSlot(drain)
  }
  return () => {
    const i = queue.indexOf(job)
    if (i >= 0) queue.splice(i, 1)
  }
}

/**
 * The only React-aware export. Returns null until the first build lands; when the detail changes the previous build
 * stays on screen until its replacement is ready (spec §3.10), then is released.
 */
export function useIslandBuild(biome: Biome, seed: number, detail: IslandDetail, priority: 'high' | 'normal'): IslandBuild | null {
  const [build, setBuild] = useState<IslandBuild | null>(null)
  const held = useRef<IslandBuild | null>(null)

  useEffect(() => {
    return schedule(priority, () => {
      const next = getIslandBuild(biome, seed, detail)
      if (held.current) releaseIslandBuild(held.current)
      held.current = next
      setBuild(next)
    })
  }, [biome, seed, detail, priority])

  useEffect(
    () => () => {
      if (held.current) releaseIslandBuild(held.current)
      held.current = null
    },
    [],
  )

  return build
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/features/archipelago/terrain/islandCache.test.ts --project unit --test-timeout 300000`
Expected: 3 tests pass.

- [ ] **Step 5: Stage**

```bash
git add src/features/archipelago/terrain/islandCache.ts src/features/archipelago/terrain/islandCache.test.ts
```

---

### Task 15: `TerracedIsland`, the hull registry, and jungle switched over

**Files:**
- Create: `src/features/archipelago/hullRegistry.tsx`, `src/features/archipelago/TerracedIsland.tsx`
- Modify: `src/features/archipelago/Island.tsx` (full replacement), `ArchipelagoScene.tsx`, `BiomePicker.tsx`, `src/features/dev/DevIslandView.tsx`
- Delete: `src/features/archipelago/models/JungleLandmass.tsx`, `models/JungleProps.tsx`, `public/models/JungleBush.glb`, `JungleFern.glb`, `JungleMushroom.glb`, `JungleRockA.glb`, `JungleRockB.glb`, `JungleTree.glb`

**Interfaces:**
- Consumes: `useIslandBuild` (Task 14), `getTerrainLitMaterial`, `getPropMaterial`, `terrainUnlitMaterial` (Task 11), `getPropGeometry` (Task 13), `islandAnchors` (Task 10), `ISLAND_YAW` (Task 1), `isTerraced` (Task 4), the existing `PropPart` (unchanged: placements are mapped onto its `{ position, rotation, scale }`).
- Produces: `HullRegistryProvider`, `useHullRegistry()`, `TerracedIsland({ build, materialKind?, onClick?, onPointerOver?, onPointerOut? })`, `Island` props gain `seedOverride?` and `materialKind?`.

Design notes:
- The hull uses a material with `colorWrite: false, depthWrite: false` rather than `visible={false}`. Spec §5.2 lists this as the fallback if R3F skips invisible meshes when raycasting; using it from the start removes that dependency.
- Island labels occlude against the registered hulls (`occlude={occluders}`), not the whole scene.
- The five legacy biomes keep their old components, scale and anchors inside `LegacyIslandNode`, untouched until the next plan. Their per-biome tables and the long derivation comment reduce to four named constants.
- Hover lift calls `invalidate()` while it hasn't converged, which Task 18's demand frameloop depends on.
- Between this task and Task 16, a focused jungle island still shows the old spiral trail. Task 16 replaces it.

- [ ] **Step 1: Write the hull registry**

`src/features/archipelago/hullRegistry.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Object3D } from 'three'

interface HullRegistry {
  readonly hulls: RefObject<Object3D[]>
  register(mesh: Object3D): () => void
}

const Context = createContext<HullRegistry | null>(null)

/** Labels occlude against these ~600-triangle hulls, not the full terrain (spec §5.2). */
export function HullRegistryProvider({ children }: { children: ReactNode }) {
  const hulls = useRef<Object3D[]>([])
  const register = useCallback((mesh: Object3D) => {
    hulls.current.push(mesh)
    return () => {
      hulls.current = hulls.current.filter((m) => m !== mesh)
    }
  }, [])
  const value = useMemo(() => ({ hulls, register }), [register])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useHullRegistry(): HullRegistry {
  const registry = useContext(Context)
  if (!registry) throw new Error('useHullRegistry must be used inside HullRegistryProvider')
  return registry
}
```

- [ ] **Step 2: Write `TerracedIsland`**

`src/features/archipelago/TerracedIsland.tsx`:

```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Euler, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { Mesh } from 'three'
import type { PropKind } from '../../lib/island/types'
import { propRule } from '../../lib/island/biomes'
import type { IslandBuild } from './terrain/islandCache'
import type { LitMaterialKind } from './terrain/materials'
import { getPropMaterial, getTerrainLitMaterial, terrainUnlitMaterial } from './terrain/materials'
import { getPropGeometry } from './terrain/propGeometry'
import { PropPart } from './models/PropPart'
import type { PropPlacement as PartPlacement } from './models/scatter'
import { useHullRegistry } from './hullRegistry'

export interface TerracedIslandProps {
  readonly build: IslandBuild
  readonly materialKind?: LitMaterialKind
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void
  readonly onPointerOver?: (event: ThreeEvent<PointerEvent>) => void
  readonly onPointerOut?: (event: ThreeEvent<PointerEvent>) => void
}

// Raycastable and a valid occluder, but never drawn to colour or depth: safer than relying on visible={false}.
const hullMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false })
const UP = new Vector3(0, 1, 0)

/** Lit terrain, unlit water features, one instanced PropPart per prop kind, and the pointer/occlusion hull. */
export function TerracedIsland({ build, materialKind = 'toon', onClick, onPointerOver, onPointerOut }: TerracedIslandProps) {
  const hullRef = useRef<Mesh>(null)
  const { register } = useHullRegistry()
  useEffect(() => (hullRef.current ? register(hullRef.current) : undefined), [register, build])

  const groups = useMemo(() => {
    const byKind = new Map<PropKind, PartPlacement[]>()
    const { biome, props } = build.layout
    for (const p of props) {
      if (build.detail !== 'focus' && !propRule(biome, p.kind)?.overview) continue
      // Lean is a world-frame tilt applied after the yaw, so a palm leans outward whatever its random rotation.
      const q = new Quaternion().setFromEuler(new Euler(p.tiltX, 0, p.tiltZ)).multiply(new Quaternion().setFromAxisAngle(UP, p.rotY))
      const e = new Euler().setFromQuaternion(q, 'XYZ')
      const list = byKind.get(p.kind) ?? []
      list.push({ position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z], scale: p.scale })
      byKind.set(p.kind, list)
    }
    return [...byKind]
  }, [build])

  return (
    <group>
      <mesh geometry={build.lit} material={getTerrainLitMaterial(materialKind)} raycast={() => null} />
      <mesh geometry={build.unlit} material={terrainUnlitMaterial} raycast={() => null} />
      <mesh ref={hullRef} geometry={build.hull} material={hullMaterial} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} />
      {groups.map(([kind, placements]) => (
        <PropPart key={kind} geometry={getPropGeometry(kind, build.layout.biome)} material={getPropMaterial(materialKind)} placements={placements} />
      ))}
    </group>
  )
}
```

- [ ] **Step 3: Replace `Island.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Object3D } from 'three'
import type { Goal } from './api'
import { getBiomePalette, hashGoalId } from '../../lib/theme'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { islandAnchors } from '../../lib/island/anchors'
import { useIslandBuild } from './terrain/islandCache'
import type { LitMaterialKind } from './terrain/materials'
import { TerracedIsland } from './TerracedIsland'
import { useHullRegistry } from './hullRegistry'
import { DesertLandmass } from './models/DesertLandmass'
import { DesertProps } from './models/DesertProps'
import { HighlandsLandmass } from './models/HighlandsLandmass'
import { HighlandsProps } from './models/HighlandsProps'
import { ReefLandmass } from './models/ReefLandmass'
import { ReefProps } from './models/ReefProps'
import { TundraLandmass } from './models/TundraLandmass'
import { TundraProps } from './models/TundraProps'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { VolcanoProps } from './models/VolcanoProps'

type LegacyBiome = Exclude<Goal['biome'], 'jungle'>

const LANDMASS_COMPONENTS: Record<LegacyBiome, typeof DesertLandmass> = {
  desert: DesertLandmass,
  tundra: TundraLandmass,
  volcano: VolcanoLandmass,
  reef: ReefLandmass,
  highlands: HighlandsLandmass,
}

const PROPS_COMPONENTS: Record<LegacyBiome, typeof DesertProps> = {
  desert: DesertProps,
  tundra: TundraProps,
  volcano: VolcanoProps,
  reef: ReefProps,
  highlands: HighlandsProps,
}

const PROP_COUNT_BY_BIOME: Record<LegacyBiome, number> = { desert: 6, tundra: 5, volcano: 4, reef: 8, highlands: 7 }

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
  const seed = seedOverride ?? hashGoalId(goal.id)
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
```

- [ ] **Step 4: Provide the registry in both canvases**

`src/features/archipelago/ArchipelagoScene.tsx` becomes:

```tsx
import { Canvas } from '@react-three/fiber'
import { useMatch, useNavigate } from 'react-router'
import { useGoals } from './api'
import { Island } from './Island'
import { SceneEnvironment } from './SceneEnvironment'
import { HullRegistryProvider } from './hullRegistry'
import { CameraRig } from './CameraRig'
import { RoadmapTrail } from '../roadmap/RoadmapTrail'

interface ArchipelagoSceneProps {
  showCompleted: boolean
}

export function ArchipelagoScene({ showCompleted }: ArchipelagoSceneProps) {
  const navigate = useNavigate()
  // `useMatch` matches the browser location directly. `useParams` would read
  // the enclosing route context, and this component is mounted as a sibling of
  // the nested <Routes> that declares /g/:id — so it would always be undefined.
  const focusedGoalId = useMatch('/g/:id')?.params.id
  const { data: goals } = useGoals()

  const filteredGoals = goals?.filter((goal) => showCompleted || goal.status !== 'completed') ?? []
  // Resolved from the unfiltered list (matching HomeOverlay): a goal the user
  // explicitly navigated to stays focused even when the display filter would
  // otherwise hide it, so the 3D scene and the 2D panel never disagree.
  const focusedGoal = goals?.find((goal) => goal.id === focusedGoalId) ?? null
  // ...and its island renders alongside the filtered set, so its trail is never
  // left floating over empty water.
  const visibleGoals =
    focusedGoal && !filteredGoals.includes(focusedGoal) ? [...filteredGoals, focusedGoal] : filteredGoals

  // Face the idle orbit toward the user's own islands from the start —
  // otherwise a fixed default azimuth has no relationship to where the
  // golden-angle spiral actually placed them (see CameraRig's own comment).
  const initialAzimuth = visibleGoals.length > 0 ? Math.atan2(visibleGoals[0].islandZ, visibleGoals[0].islandX) : undefined

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ fov: 50 }} flat>
        <SceneEnvironment />
        <HullRegistryProvider>
        {visibleGoals.map((goal) => (
          <Island
            key={goal.id}
            goal={goal}
            onClick={() => navigate(`/g/${goal.id}`)}
            focused={goal.id === focusedGoal?.id}
          />
        ))}
        {focusedGoal ? (
          <group position={[focusedGoal.islandX, 0, focusedGoal.islandZ]} rotation={[0, focusedGoal.islandRotation, 0]}>
            <RoadmapTrail key={focusedGoal.id} goal={focusedGoal} />
          </group>
        ) : null}
        </HullRegistryProvider>
        <CameraRig focusedGoal={focusedGoal} initialAzimuth={initialAzimuth} />
      </Canvas>
    </div>
  )
}
```

`src/features/dev/DevIslandView.tsx` becomes:

```tsx
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Goal } from '../archipelago/api'
import { Island } from '../archipelago/Island'
import { SceneEnvironment } from '../archipelago/SceneEnvironment'
import { HullRegistryProvider } from '../archipelago/hullRegistry'
import { devGoal } from './fixtures'
import { parseDevParams } from './devParams'
import type { DevView } from './devParams'

const BIOMES: readonly Goal['biome'][] = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands']

const PRESETS: Record<DevView, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [8.5, 7.5, 8.5], target: [0, 1.0, 0] },
  side: { position: [11, 3.2, 0.5], target: [0, 1.2, 0] },
  top: { position: [0.01, 15, 0.01], target: [0, 0, 0] },
  back: { position: [-8.5, 6.5, -8.5], target: [0, 1.0, 0] },
}

/** DEV-only visual harness (spec §10): the real scene environment and island, no auth or data round trip. */
export function DevIslandView() {
  const { biome: raw = 'jungle' } = useParams()
  const biome = BIOMES.includes(raw as Goal['biome']) ? (raw as Goal['biome']) : 'jungle'
  const [search] = useSearchParams()
  const params = parseDevParams(search)
  const preset = PRESETS[params.view]
  const position = preset.position.map((p, i) => preset.target[i] + (p - preset.target[i]) * params.dist) as [number, number, number]
  const goal = devGoal(biome, params.seed)

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas flat camera={{ position, fov: 50 }}>
        <SceneEnvironment />
        <HullRegistryProvider>
          <Suspense fallback={null}>
            <Island goal={goal} onClick={() => undefined} seedOverride={params.seed} />
          </Suspense>
        </HullRegistryProvider>
        <OrbitControls target={preset.target} />
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 5: Switch the jungle card in `BiomePicker.tsx`**

The per-biome accent rim light goes (it fights the baked shading, spec §5.8); the lights match `SceneEnvironment`. `BiomePicker.tsx` becomes:

```tsx
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { View } from '@react-three/drei'
import type { Group } from 'three'
import type { Goal } from './api'
import { BIOME_TERRAIN, isTerraced } from '../../lib/island/biomes'
import { useIslandBuild } from './terrain/islandCache'
import { TerracedIsland } from './TerracedIsland'
import { HullRegistryProvider } from './hullRegistry'
import { DesertLandmass } from './models/DesertLandmass'
import { TundraLandmass } from './models/TundraLandmass'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { ReefLandmass } from './models/ReefLandmass'
import { HighlandsLandmass } from './models/HighlandsLandmass'

type LandmassComponent = typeof DesertLandmass

const BIOMES: { key: Goal['biome']; label: string; Landmass: LandmassComponent | null }[] = [
  { key: 'jungle', label: 'Jungle', Landmass: null },
  { key: 'desert', label: 'Desert', Landmass: DesertLandmass },
  { key: 'tundra', label: 'Tundra', Landmass: TundraLandmass },
  { key: 'volcano', label: 'Volcano', Landmass: VolcanoLandmass },
  { key: 'reef', label: 'Reef', Landmass: ReefLandmass },
  { key: 'highlands', label: 'Highlands', Landmass: HighlandsLandmass },
]

interface BiomePickerProps {
  value: Goal['biome'] | null
  onChange: (biome: Goal['biome']) => void
}

export function BiomePicker({ value, onChange }: BiomePickerProps) {
  return (
    <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BIOMES.map(({ key, label, Landmass }) => {
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={`group relative aspect-square overflow-hidden rounded-lg border transition-colors ${
              value === key ? 'border-lantern' : 'border-stone-light hover:border-mist/40'
            }`}
          >
            {/* Rendered outside the shared <Canvas>'s own tree, so <View> takes
                its "portal" branch: it renders its own internal tracked <div>
                here and clips the shared canvas to that div's rect on every
                frame — no `track` prop needed, each card gets independent
                clipping for free. */}
            <View className="h-full w-full">
              <hemisphereLight args={['#EAF6F6', '#6BC2C9', 0.7]} />
              <directionalLight position={[-4, 16, 11]} intensity={1.15} />
              <RotatingLandmass biome={key} Landmass={Landmass} />
            </View>
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-ink/70 px-2 py-0.5 font-body text-xs text-mist">
              {label}
            </span>
          </button>
        )
      })}
      {/* One shared Canvas backs every <View> above — spec §6.2's "one shared
          <Canvas>, not six canvases." Each <View> reads its own tracked
          button's DOM rect and viewport-clips this shared canvas per frame,
          so it can be a simple full-parent-fill absolutely-positioned
          element behind the grid. It renders no interactive 3D content (each
          card's own <button> handles clicks), so it needs no eventSource. */}
      <Canvas className="pointer-events-none absolute inset-0 -z-10" gl={{ antialias: true }}>
        <View.Port />
      </Canvas>
    </div>
  )
}

// New M4 motion (unlike CameraRig's pre-existing auto-orbit, which the plan
// explicitly carves out) — spec's Global Constraints require
// prefers-reduced-motion respected throughout, so this gates the rotation
// rather than running it unconditionally.
function PreviewIsland({ biome }: { biome: Goal['biome'] }) {
  const build = useIslandBuild(biome, BIOME_TERRAIN[biome].previewSeed, 'preview', 'normal')
  return build ? <TerracedIsland build={build} /> : null
}

function RotatingLandmass({ biome, Landmass }: { biome: Goal['biome']; Landmass: LandmassComponent | null }) {
  const ref = useRef<Group>(null)
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.3
  })
  // A fixed, pleasing angle when motion is reduced — still a live 3D preview,
  // just not spinning.
  return (
    <group ref={ref} rotation={[0, reducedMotion ? Math.PI / 4 : 0, 0]} scale={isTerraced(biome) ? 0.36 : 0.6}>
      {isTerraced(biome) || !Landmass ? (
        <HullRegistryProvider>
          <PreviewIsland biome={biome} />
        </HullRegistryProvider>
      ) : (
        <Landmass />
      )}
    </group>
  )
}
```

- [ ] **Step 6: Delete the jungle glTF path**

```bash
git rm src/features/archipelago/models/JungleLandmass.tsx src/features/archipelago/models/JungleProps.tsx public/models/JungleBush.glb public/models/JungleFern.glb public/models/JungleMushroom.glb public/models/JungleRockA.glb public/models/JungleRockB.glb public/models/JungleTree.glb
```

Two comments still mention the deleted files (`models/scatter.ts` line 22, `models/TundraLandmass.tsx` line 5). Leave them; both files are retired in the next plan.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean.

With `npm run dev` running:
- `npm run render:island -- jungle 1 hero`, `jungle 1 side`, `jungle 1 top`: a terraced island (beach, lawn, two plateaus, cliffs, foam rim, waterfall, props) with the carved path visible. Record anything that reads wrong for Task 20.
- In the running app, hover a jungle island (it lifts and shows its card) and click it (it focuses).
- Open the New Goal sheet: the jungle card shows the terraced preview and the other five cards are unchanged.

- [ ] **Step 8: Stage**

```bash
git add src/features/archipelago/hullRegistry.tsx src/features/archipelago/TerracedIsland.tsx src/features/archipelago/Island.tsx src/features/archipelago/ArchipelagoScene.tsx src/features/archipelago/BiomePicker.tsx src/features/dev/DevIslandView.tsx
```

---

### Task 16: Terrain-following trail curve

**Files:**
- Modify: `src/features/roadmap/curve.ts` (full replacement), `src/features/roadmap/curve.test.ts` (rewritten deliberately, spec §9.2)
- Modify: `src/features/roadmap/RoadmapTrail.tsx` (curve source only; Task 17 rebuilds the rest)
- Modify: `src/features/archipelago/ArchipelagoScene.tsx` (trail group yaw)
- Modify: `src/features/archipelago/MilestoneBuilder.tsx` (the preview)

**Interfaces:**
- Consumes: `IslandLayout.trail.waypoints`, `GroundQuery` (Task 1), `getIslandLayout` (Task 14), `ISLAND_YAW` (Task 1).
- Produces: `TRAIL_CLEARANCE = 0.02`, `buildTrailCurve(waypoints, clearance?)`, `buildLegacyConeCurve(baseRadius, height, seed)` (the old body, legacy biomes only), `positionAt`, `tangentAt`, `perpendicularOffset` (now typed on `Curve<Vector3>`), `groundedOffset(curve, ground, t, side, distance, radius)` → `{ position, side }`, `buildTrailRibbon(curve, ground, t0, t1, halfWidth)`. `CONTROL_POINT_COUNT` and `SPIRAL_TURNS` are gone. `src/lib/trail.ts` is not touched.

- [ ] **Step 1: Rewrite the test**

The old "starts at the base radius and ends at the apex" and "seed rotates the spiral" tests described the cone and are replaced by the §9.2 list:

```ts
// src/features/roadmap/curve.test.ts
import { describe, expect, it } from 'vitest'
import { buildIslandLayout } from '../../lib/island/plan'
import { TRAIL_CLEARANCE, buildTrailCurve, buildTrailRibbon, groundedOffset, perpendicularOffset, positionAt, tangentAt } from './curve'

const layout = buildIslandLayout('jungle', 1)
const curve = buildTrailCurve(layout.trail.waypoints)

describe('buildTrailCurve', () => {
  it('starts on the beach trailhead and ends at the summit', () => {
    const [sx, sy, sz] = layout.trail.waypoints[0]
    const start = positionAt(curve, 0)
    expect(start.distanceTo({ x: sx, y: sy + TRAIL_CLEARANCE, z: sz } as never)).toBeLessThan(0.02)
    expect(Math.hypot(start.x, start.z)).toBeGreaterThanOrEqual(0.6 * layout.footprintRadius)
    const end = positionAt(curve, 1)
    expect(end.distanceTo({ x: layout.summit[0], y: layout.summit[1] + TRAIL_CLEARANCE, z: layout.summit[2] } as never)).toBeLessThan(0.02)
  })

  it('never descends', () => {
    let last = -Infinity
    for (let t = 0; t <= 1; t += 0.01) {
      const y = positionAt(curve, t).y
      expect(y).toBeGreaterThanOrEqual(last - 0.005)
      last = y
    }
  })

  it('follows the ground on every biome and seed: never floats, never clips', () => {
    for (const biome of ['jungle', 'volcano', 'desert'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const l = buildIslandLayout(biome, seed)
        const c = buildTrailCurve(l.trail.waypoints)
        for (let i = 0; i <= 400; i++) {
          const p = positionAt(c, i / 400)
          expect(Math.abs(p.y - (l.groundHeightAt(p.x, p.z) + TRAIL_CLEARANCE)), `${biome}:${seed} t=${i / 400}`).toBeLessThanOrEqual(0.03)
        }
      }
    }
  })

  it('spaces n/(N+1) evenly by walking distance', () => {
    const points = Array.from({ length: 10 }, (_, i) => positionAt(curve, i / 9))
    const lengths = points.slice(1).map((_, i) => {
      let len = 0
      let prev = points[i]
      for (let k = 1; k <= 50; k++) {
        const q = positionAt(curve, i / 9 + (k / 50) / 9)
        len += q.distanceTo(prev)
        prev = q
      }
      return len
    })
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
    for (const len of lengths) expect(Math.abs(len - mean) / mean).toBeLessThanOrEqual(0.02)
  })

  it('gives different seeds different trails', () => {
    const other = buildTrailCurve(buildIslandLayout('jungle', 2).trail.waypoints)
    expect(positionAt(curve, 0.5).distanceTo(positionAt(other, 0.5))).toBeGreaterThan(0.1)
  })
})

describe('positionAt / tangentAt / perpendicularOffset', () => {
  it('clamps t to [0,1]', () => {
    expect(positionAt(curve, -0.5).equals(positionAt(curve, 0))).toBe(true)
    expect(positionAt(curve, 1.5).equals(positionAt(curve, 1))).toBe(true)
  })

  it('returns unit tangents that never point near-vertical', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const tangent = tangentAt(curve, t)
      expect(tangent.length()).toBeCloseTo(1, 5)
      expect(Math.abs(tangent.y)).toBeLessThan(0.6)
    }
  })

  it('offsets in opposite directions for opposite sides, scaling with distance', () => {
    const left = perpendicularOffset(curve, 0.5, 1, 0.3)
    const right = perpendicularOffset(curve, 0.5, -1, 0.3)
    expect(left.x).toBeCloseTo(-right.x, 5)
    expect(left.z).toBeCloseTo(-right.z, 5)
    expect(perpendicularOffset(curve, 0.5, 1, 0.5).length()).toBeCloseTo(perpendicularOffset(curve, 0.5, 1, 0.1).length() * 5, 4)
  })
})

describe('groundedOffset', () => {
  it('stands on the ground, within the requested distance', () => {
    for (let t = 0.02; t < 1; t += 0.07) {
      const { position } = groundedOffset(curve, layout, t, 1, 0.25, 0.05)
      expect(Math.abs(position.y - layout.groundHeightAt(position.x, position.z))).toBeLessThan(1e-3)
      const base = positionAt(curve, t)
      expect(Math.hypot(position.x - base.x, position.z - base.z)).toBeLessThanOrEqual(0.25 + 1e-6)
    }
  })

  it('flips side when the requested side has no room', () => {
    const blockedLeft = { groundHeightAt: layout.groundHeightAt, walkableRun: (x: number, z: number, dx: number, dz: number, y: number, max: number) => {
      const left = perpendicularOffset(curve, 0.5, 1, 1)
      return dx * left.x + dz * left.z > 0 ? 0 : layout.walkableRun(x, z, dx, dz, y, max)
    } }
    expect(groundedOffset(curve, blockedLeft, 0.5, 1, 0.25, 0.05).side).toBe(-1)
  })
})

describe('buildTrailRibbon', () => {
  it('lays one cross-section per ~0.03 of arc, on the ground', () => {
    const ribbon = buildTrailRibbon(curve, layout, 0, 1, 0.055)
    const pos = ribbon.getAttribute('position')
    expect(pos.count).toBeGreaterThanOrEqual(2 * Math.floor(curve.getLength() / 0.03))
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getY(i) - (layout.groundHeightAt(pos.getX(i), pos.getZ(i)) + TRAIL_CLEARANCE))).toBeLessThan(1e-3)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/roadmap/curve.test.ts --project unit`
Expected: FAIL: `buildTrailCurve` is called with waypoints but still expects `(baseRadius, height, seed)`, and `buildTrailRibbon`/`groundedOffset`/`TRAIL_CLEARANCE` don't exist.

- [ ] **Step 3: Replace `curve.ts`**

```ts
// src/features/roadmap/curve.ts
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'
import type { Curve } from 'three'
import type { GroundQuery, Vec3 } from '../../lib/island/types'

export const TRAIL_CLEARANCE = 0.02
const RESAMPLE_SPACING = 0.12
const RIBBON_STEP = 0.03
const MIN_SIDE_ROOM = 0.08

/**
 * The 3D trail from the layout's ground waypoints (trailhead t=0 → summit t=1): resampled every RESAMPLE_SPACING,
 * lifted by `clearance`, centripetal so flat→ramp corners don't overshoot, with enough arc-length divisions that
 * getPointAt(n/(N+1)) is genuinely even by walking distance.
 */
export function buildTrailCurve(waypoints: readonly Vec3[], clearance = TRAIL_CLEARANCE): CatmullRomCurve3 {
  const points: Vector3[] = [new Vector3(waypoints[0][0], waypoints[0][1] + clearance, waypoints[0][2])]
  let since = 0
  for (let i = 1; i < waypoints.length; i++) {
    const [x, y, z] = waypoints[i]
    const [px, , pz] = waypoints[i - 1]
    since += Math.hypot(x - px, z - pz)
    if (since >= RESAMPLE_SPACING || i === waypoints.length - 1) {
      points.push(new Vector3(x, y + clearance, z))
      since = 0
    }
  }
  const curve = new CatmullRomCurve3(points, false, 'centripetal')
  curve.arcLengthDivisions = Math.max(2000, points.length * 8)
  curve.updateArcLengths()
  return curve
}

/** The pre-terraced cone spiral, kept only for the five biomes not yet migrated; deleted in the next plan. */
export function buildLegacyConeCurve(baseRadius: number, height: number, seed: number): CatmullRomCurve3 {
  const points: Vector3[] = []
  const count = 24
  for (let i = 0; i <= count; i++) {
    const s = i / count
    const angle = seed + s * 1.5 * Math.PI * 2
    points.push(new Vector3(baseRadius * (1 - s) * Math.cos(angle), -height / 2 + height * s + 0.05, baseRadius * (1 - s) * Math.sin(angle)))
  }
  return new CatmullRomCurve3(points, false, 'catmullrom', 0.5)
}

/** Arc-length-parameterized point at `t`, clamped to [0,1]: even spacing along the walk matches trail.ts's milestones. */
export function positionAt(curve: Curve<Vector3>, t: number): Vector3 {
  return curve.getPointAt(Math.max(0, Math.min(1, t)))
}

/** Normalized tangent at `t`, clamped away from the exact endpoints where three.js's estimate is least reliable. */
export function tangentAt(curve: Curve<Vector3>, t: number): Vector3 {
  return curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize()
}

const WORLD_UP = new Vector3(0, 1, 0)

/** Horizontal-ish perpendicular (tangent × world-up), scaled by `distance` and flipped by `side`. */
export function perpendicularOffset(curve: Curve<Vector3>, t: number, side: 1 | -1, distance: number): Vector3 {
  const perpendicular = new Vector3().crossVectors(tangentAt(curve, t), WORLD_UP).normalize()
  return perpendicular.multiplyScalar(distance * side)
}

/**
 * Where a side-of-trail marker stands: the perpendicular offset clamped to the walkable run on that side (minus the
 * marker's radius), flipped to the other side when there's under 0.08 of room, y snapped to the ground.
 */
export function groundedOffset(
  curve: Curve<Vector3>, ground: GroundQuery, t: number, side: 1 | -1, distance: number, radius: number,
): { position: Vector3; side: 1 | -1 } {
  const base = positionAt(curve, t)
  const baseY = ground.groundHeightAt(base.x, base.z)
  const room = (s: 1 | -1) => {
    const dir = perpendicularOffset(curve, t, s, 1)
    return { dir, run: ground.walkableRun(base.x, base.z, dir.x, dir.z, baseY, distance + radius) - radius }
  }
  let chosen = side
  let { dir, run } = room(side)
  if (run < MIN_SIDE_ROOM) {
    const other = room(side === 1 ? -1 : 1)
    if (other.run > run) {
      chosen = side === 1 ? -1 : 1
      dir = other.dir
      run = other.run
    }
  }
  const d = Math.max(0, Math.min(distance, run))
  const x = base.x + dir.x * d
  const z = base.z + dir.z * d
  return { position: new Vector3(x, ground.groundHeightAt(x, z), z), side: chosen }
}

/** Flat ribbon over [t0, t1]: a cross-section every ~0.03 of arc, horizontal sides, every vertex on the ground + clearance. */
export function buildTrailRibbon(curve: Curve<Vector3>, ground: GroundQuery, t0: number, t1: number, halfWidth: number): BufferGeometry {
  const from = Math.max(0, Math.min(1, t0))
  const to = Math.max(from, Math.min(1, t1))
  const steps = Math.max(1, Math.ceil((curve.getLength() * (to - from)) / RIBBON_STEP))
  const positions: number[] = []
  const index: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps
    const p = positionAt(curve, t)
    const tangent = tangentAt(curve, t)
    const len = Math.hypot(tangent.x, tangent.z) || 1
    const sx = -tangent.z / len
    const sz = tangent.x / len
    for (const s of [1, -1]) {
      const x = p.x + sx * halfWidth * s
      const z = p.z + sz * halfWidth * s
      positions.push(x, ground.groundHeightAt(x, z) + TRAIL_CLEARANCE, z)
    }
    if (i < steps) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
```

- [ ] **Step 4: Point the callers at the new curve**

`src/features/roadmap/RoadmapTrail.tsx`, replace the import lines

```ts
import { BASE_TOKENS, getBiomePalette } from '../../lib/theme'
import { buildTrailCurve, perpendicularOffset, positionAt } from './curve'
```

with

```ts
import { BASE_TOKENS, getBiomePalette, hashGoalId } from '../../lib/theme'
import { isTerraced } from '../../lib/island/biomes'
import { getIslandLayout } from '../archipelago/terrain/islandCache'
import { buildLegacyConeCurve, buildTrailCurve, perpendicularOffset, positionAt } from './curve'
```

and the `curve` memo with

```ts
  const curve = useMemo(
    () =>
      isTerraced(goal.biome)
        ? buildTrailCurve(getIslandLayout(goal.biome, hashGoalId(goal.id)).trail.waypoints)
        : buildLegacyConeCurve(ISLAND_BASE_RADIUS, ISLAND_HEIGHT, seedFromId(goal.id)),
    [goal.id, goal.biome],
  )
```

`src/features/archipelago/ArchipelagoScene.tsx`: add

```ts
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
```

and give the trail group the island's yaw:

```tsx
          <group position={[focusedGoal.islandX, 0, focusedGoal.islandZ]} rotation={[0, isTerraced(focusedGoal.biome) ? ISLAND_YAW : focusedGoal.islandRotation, 0]}>
```

`src/features/archipelago/MilestoneBuilder.tsx` becomes (the preview dots now sit on the real jungle preview trail, drawn over a 0.3-opacity ribbon; `PREVIEW_BASE_RADIUS`/`PREVIEW_HEIGHT`/`PREVIEW_SEED` are gone):

```tsx
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { buildTrailCurve, buildTrailRibbon, positionAt } from '../roadmap/curve'
import { BIOME_TERRAIN, SHARED_PALETTE } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { getIslandLayout } from './terrain/islandCache'
import type { Goal } from './api'

const MAX_MILESTONES = 8


export interface MilestoneRow {
  title: string
  targetValue: string // raw input text; parsed by the caller for validation
}

interface MilestoneBuilderProps {
  kind: Goal['kind']
  milestones: MilestoneRow[]
  errors: Record<number, string>
  onChange: (milestones: MilestoneRow[]) => void
}

export function MilestoneBuilder({ kind, milestones, errors, onChange }: MilestoneBuilderProps) {
  function updateRow(index: number, patch: Partial<MilestoneRow>) {
    onChange(milestones.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  function addRow() {
    if (milestones.length >= MAX_MILESTONES) return
    onChange([...milestones, { title: '', targetValue: '' }])
  }
  function removeRow(index: number) {
    onChange(milestones.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <TrailPreview count={milestones.length} />
      <ul className="space-y-2">
        {milestones.map((row, index) => (
          <li key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <input
                value={row.title}
                onChange={(e) => updateRow(index, { title: e.target.value })}
                placeholder={`Milestone ${index + 1}`}
                className="w-full rounded-md border border-stone-light bg-ink px-3 py-1.5 font-body text-sm text-mist"
              />
              {kind === 'numeric' ? (
                <input
                  value={row.targetValue}
                  onChange={(e) => updateRow(index, { targetValue: e.target.value })}
                  inputMode="decimal"
                  placeholder="Value"
                  className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-1.5 font-body text-sm text-mist"
                />
              ) : null}
              {errors[index] ? <p className="mt-1 font-body text-xs text-accent-error">{errors[index]}</p> : null}
            </div>
            <button type="button" onClick={() => removeRow(index)} className="font-body text-xs text-mist/50 hover:text-mist">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addRow}
        disabled={milestones.length >= MAX_MILESTONES}
        className="font-body text-sm text-tide disabled:opacity-40"
      >
        Add milestone
      </button>
    </div>
  )
}

/**
 * Spec §6.2 step 3: "Show a live preview of the trail as they're added —
 * this is the moment the product sells itself." Milestones are evenly
 * spaced at t = i / (n + 1), matching src/lib/trail.ts's placement
 * invariant (CLAUDE.md) — never proportional to each milestone's value.
 */
function TrailPreview({ count }: { count: number }) {
  const layout = useMemo(() => getIslandLayout('jungle', BIOME_TERRAIN.jungle.previewSeed), [])
  const curve = useMemo(() => buildTrailCurve(layout.trail.waypoints), [layout])
  const ribbon = useMemo(() => buildTrailRibbon(curve, layout, 0, 1, 0.05), [curve, layout])
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => positionAt(curve, (i + 1) / (count + 1))),
    [curve, count],
  )

  return (
    <div className="h-28 overflow-hidden rounded-md border border-stone-light bg-ink">
      <Canvas camera={{ position: [5.2, 4.4, 5.2], fov: 40 }} frameloop="demand" flat onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <group rotation={[0, ISLAND_YAW, 0]}>
          <mesh geometry={ribbon}>
            <meshBasicMaterial color={SHARED_PALETTE.trailDone} transparent opacity={0.3} depthWrite={false} />
          </mesh>
          {dots.map((p, i) => (
            <mesh key={i} position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshBasicMaterial color={SHARED_PALETTE.cairnNext} />
            </mesh>
          ))}
        </group>
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/roadmap/curve.test.ts src/lib/trail.test.ts --project unit --test-timeout 600000 && npm run typecheck && npm test`
Expected: 11 curve tests and every `trail.test.ts` test pass unchanged; typecheck clean; `npm test` green.

- [ ] **Step 6: Look at it**

In the running app, focus a jungle goal: the (still tube-rendered) trail now climbs the carved path from the beach to the summit instead of spiralling through the rock. Open the New Goal sheet and add milestones: the dots spread along a switchback path.

- [ ] **Step 7: Stage**

```bash
git add src/features/roadmap/curve.ts src/features/roadmap/curve.test.ts src/features/roadmap/RoadmapTrail.tsx src/features/archipelago/ArchipelagoScene.tsx src/features/archipelago/MilestoneBuilder.tsx
```

---

### Task 17: `TrailView`: ribbons, cairns, grounded entries and the pennant

**Files:**
- Move: `src/features/roadmap/RoadmapTrail.tsx` → `src/features/roadmap/LegacyRoadmapTrail.tsx` (legacy biomes only)
- Create: `src/features/roadmap/RoadmapTrail.tsx` (new container + `TrailView`), `src/features/roadmap/MilestoneCairn.tsx`, `src/features/roadmap/TrailPennant.tsx`
- Modify: `src/features/dev/fixtures.ts`, `src/features/dev/devParams.ts`, `src/features/dev/devParams.test.ts`, `src/features/dev/DevIslandView.tsx`

**Interfaces:**
- Consumes: `buildTrailCurve`, `buildTrailRibbon`, `groundedOffset`, `positionAt`, `TRAIL_CLEARANCE` (Task 16), `getIslandLayout` (Task 14), `SHARED_PALETTE`, `isTerraced` (Task 4), `trail.ts` (unchanged).
- Produces: `RoadmapTrail({ goal, seedOverride? })`, `TrailView({ goal, layout, milestones, entries })`, `TrailViewProps`, `MilestoneCairn`, `CairnState`, `TrailPennant`, `LegacyRoadmapTrail`, `fixtureMilestones(goal, count, head)`, `fixtureEntries(goal, milestones, count)`, `devGoal(biome, seed, head?)`, `DevParams` gains `milestones` (default 4, max 8), `head` (default 0.55, clamped [0, 1]), `entries` (default 3).

Behaviour (spec §4.2):
- Completed ribbon `[0, head]`, half-width 0.055, `trailDone` opaque; remaining `[head, 1]`, 0.040, 0.30 opacity, `depthWrite: false`; both `polygonOffset −1/−1`.
- Milestone cairns at `positionAt(curve, milestoneTs(N)[i])` with y snapped to the ground; invisible 0.16 click sphere; the "next" cairn pulses for 4 s and then rests highlighted (spec Q8, proposed option), and stops at once under reduced motion.
- Entries use `groundedOffset(curve, layout, t, entrySide(i), 0.25, 0.05)`; only entries saved during this visit fly in from the head.
- The pennant's position is written from `positionAt(curve, t.get())` in one `useFrame`, with no competing spring binding (the M3 Critical #1 regression class), and it calls `invalidate()` while animating.
- The tube meshes, `subCurve`, `TrailMarker` import and `BASE_TOKENS` colours are gone from the terraced path. `LegacyRoadmapTrail.tsx` keeps them for the five legacy biomes until the next plan.

- [ ] **Step 1: Extend the dev params test (failing)**

In `src/features/dev/devParams.test.ts` replace the three expectations with:

```ts
    expect(parseDevParams(new URLSearchParams(''))).toEqual({ seed: 1, view: 'hero', dist: 1, milestones: 4, head: 0.55, entries: 3 })
```

```ts
    expect(parseDevParams(new URLSearchParams('seed=42&view=top&dist=1.5&milestones=8&head=1&entries=0'))).toEqual({ seed: 42, view: 'top', dist: 1.5, milestones: 8, head: 1, entries: 0 })
```

```ts
    expect(parseDevParams(new URLSearchParams('seed=abc&view=sideways&dist=-3&head=7'))).toEqual({ seed: 1, view: 'hero', dist: 0.2, milestones: 4, head: 1, entries: 3 })
```

Run: `npx vitest run src/features/dev --project unit`
Expected: FAIL (the new fields are missing).

- [ ] **Step 2: Extend `devParams.ts` and `fixtures.ts`**

`src/features/dev/devParams.ts` becomes:

```ts
export type DevView = 'hero' | 'side' | 'top' | 'back'

export interface DevParams {
  readonly seed: number
  readonly view: DevView
  readonly dist: number
  readonly milestones: number
  readonly head: number
  readonly entries: number
}

const VIEWS: readonly DevView[] = ['hero', 'side', 'top', 'back']

function number(search: URLSearchParams, key: string, fallback: number): number {
  const raw = search.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseDevParams(search: URLSearchParams): DevParams {
  const view = search.get('view') as DevView | null
  return {
    seed: Math.max(0, Math.floor(number(search, 'seed', 1))),
    view: view && VIEWS.includes(view) ? view : 'hero',
    dist: Math.max(0.2, number(search, 'dist', 1)),
    milestones: Math.max(0, Math.min(8, Math.floor(number(search, 'milestones', 4)))),
    head: Math.max(0, Math.min(1, number(search, 'head', 0.55))),
    entries: Math.max(0, Math.min(8, Math.floor(number(search, 'entries', 3)))),
  }
}
```

`src/features/dev/fixtures.ts` becomes:

```ts
import type { Goal } from '../archipelago/api'
import type { Milestone, ProgressEntry } from '../roadmap/api'

/** A goal at the world origin with no backend behind it, for the dev harness. `seed` only labels it; rendering uses seedOverride. */
export function devGoal(biome: Goal['biome'], seed: number, head = 0.55): Goal {
  return {
    id: `dev-${biome}-${seed}`,
    title: `${biome[0].toUpperCase()}${biome.slice(1)} ${seed}`,
    description: null,
    biome,
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: Number((10 * Math.max(0, Math.min(1, head))).toFixed(4)),
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
  }
}

/**
 * `count` evenly spaced milestones on a 0–10 goal, completed up to `head` (0–1). Values track t exactly, so with
 * currentValue = 10 × head, trail.ts's progressT lands the head marker at `head`.
 */
export function fixtureMilestones(goal: Goal, count: number, head: number): Milestone[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1)
    return { id: `${goal.id}-m${i}`, goalId: goal.id, title: `Milestone ${i + 1}`, targetValue: 10 * t, sortOrder: i, completedAt: t <= head ? '2026-09-01T00:00:00Z' : null }
  })
}

export function fixtureEntries(goal: Goal, _milestones: Milestone[], count: number): ProgressEntry[] {
  const reached = Math.max(0.5, goal.currentValue)
  return Array.from({ length: count }, (_, i) => ({
    id: `${goal.id}-e${i}`,
    goalId: goal.id,
    milestoneId: null,
    kind: 'update' as const,
    title: `Update ${i + 1}`,
    note: null,
    value: Number(((reached * (i + 1)) / (count + 1)).toFixed(2)),
    occurredAt: `2026-08-${String(10 + i).padStart(2, '0')}`,
  }))
}
```

Run: `npx vitest run src/features/dev --project unit`
Expected: 3 tests pass.

- [ ] **Step 3: Move the legacy trail**

```bash
git mv src/features/roadmap/RoadmapTrail.tsx src/features/roadmap/LegacyRoadmapTrail.tsx
```

In `LegacyRoadmapTrail.tsx`: restore the imports to `import { BASE_TOKENS, getBiomePalette } from '../../lib/theme'` and `import { buildLegacyConeCurve, perpendicularOffset, positionAt } from './curve'` (drop the `isTerraced`/`getIslandLayout`/`hashGoalId` imports added in Task 16), make the curve memo `useMemo(() => buildLegacyConeCurve(ISLAND_BASE_RADIUS, ISLAND_HEIGHT, seedFromId(goal.id)), [goal.id])`, and rename the component and its props:

```tsx
interface LegacyRoadmapTrailProps {
  goal: Goal
}

/** The pre-terraced spiral trail for the five biomes not yet migrated; deleted in the next plan. */
export function LegacyRoadmapTrail({ goal }: LegacyRoadmapTrailProps) {
```

- [ ] **Step 4: Create the pennant, cairn and the new `RoadmapTrail.tsx`**

`src/features/roadmap/TrailPennant.tsx`:

```tsx
import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { SHARED_PALETTE } from '../../lib/island/biomes'

/** Procedural head marker (spec §2.3): a 0.34 pole with a 0.12 × 0.08 coral flag. Replaces the Kenney flag glTF. */
export function TrailPennant() {
  const flag = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([0.01, 0.34, 0, 0.01, 0.26, 0, 0.13, 0.3, 0.01], 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group>
      <mesh position={[0, 0.17, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.009, 0.011, 0.34, 6]} />
        <meshBasicMaterial color={SHARED_PALETTE.pennantPole} />
      </mesh>
      <mesh geometry={flag} raycast={() => null}>
        <meshBasicMaterial color={SHARED_PALETTE.pennantFlag} side={2} />
      </mesh>
    </group>
  )
}
```

`src/features/roadmap/MilestoneCairn.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { SHARED_PALETTE } from '../../lib/island/biomes'

const PULSE_SECONDS = 4

export type CairnState = 'pending' | 'next' | 'done'

/**
 * Three stacked stones (0.20 tall, base radius 0.085); the top stone carries the state colour. The "next" cairn pulses
 * for 4 s after it appears, then rests highlighted, so the demand frameloop can go idle (spec Q8, proposed option).
 */
export function MilestoneCairn({ position, state, reducedMotion, onClick }: {
  position: readonly [number, number, number]
  state: CairnState
  reducedMotion: boolean
  onClick: () => void
}) {
  const top = useRef<Mesh>(null)
  const started = useRef<number | null>(null)
  useEffect(() => {
    started.current = null
  }, [state])

  useFrame(({ clock, invalidate }) => {
    if (!top.current) return
    if (state !== 'next' || reducedMotion) {
      top.current.scale.setScalar(1)
      return
    }
    started.current ??= clock.elapsedTime
    const age = clock.elapsedTime - started.current
    if (age > PULSE_SECONDS) {
      top.current.scale.setScalar(1)
      return
    }
    top.current.scale.setScalar(1 + Math.sin(age * 3) * 0.15)
    invalidate()
  })

  const topColor = state === 'done' ? SHARED_PALETTE.cairnDone : state === 'next' ? SHARED_PALETTE.cairnNext : SHARED_PALETTE.cairnPending
  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.04, 0]} scale={[1, 0.55, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.085, 0]} />
        <meshLambertMaterial color={SHARED_PALETTE.cairnPending} flatShading />
      </mesh>
      <mesh position={[0, 0.1, 0]} scale={[1, 0.6, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.065, 0]} />
        <meshLambertMaterial color={SHARED_PALETTE.cairnPending} flatShading />
      </mesh>
      <mesh ref={top} position={[0, 0.16, 0]} scale={[1, 0.7, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.05, 0]} />
        <meshLambertMaterial color={topColor} flatShading />
      </mesh>
      <mesh
        position={[0, 0.1, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
```

`src/features/roadmap/RoadmapTrail.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useSpring } from '@react-spring/three'
import type { Group } from 'three'
import { entrySide, entryTs, milestoneTs, progressT } from '../../lib/trail'
import type { TrailGoal, TrailMilestone } from '../../lib/trail'
import { hashGoalId } from '../../lib/theme'
import { SHARED_PALETTE, isTerraced } from '../../lib/island/biomes'
import type { IslandLayout } from '../../lib/island/types'
import type { Goal } from '../archipelago/api'
import { getIslandLayout } from '../archipelago/terrain/islandCache'
import { useMilestones, useProgressEntries } from './api'
import type { Milestone, ProgressEntry } from './api'
import { TRAIL_CLEARANCE, buildTrailCurve, buildTrailRibbon, groundedOffset, positionAt } from './curve'
import { LegacyRoadmapTrail } from './LegacyRoadmapTrail'
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

/** Data container: hooks and the layout lookup. The five legacy biomes keep the old spiral until the next plan. */
export function RoadmapTrail({ goal, seedOverride }: { goal: Goal; seedOverride?: number }) {
  if (!isTerraced(goal.biome)) return <LegacyRoadmapTrail goal={goal} />
  return <TerracedRoadmapTrail goal={goal} seedOverride={seedOverride} />
}

function TerracedRoadmapTrail({ goal, seedOverride }: { goal: Goal; seedOverride?: number }) {
  const { data: milestones, isError: milestonesError } = useMilestones(goal.id)
  const { data: entries, isError: entriesError } = useProgressEntries(goal.id)
  const layout = useMemo(() => getIslandLayout(goal.biome, seedOverride ?? hashGoalId(goal.id)), [goal.biome, goal.id, seedOverride])
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
                <div className="w-40 rounded-md border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
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
          <div className="w-40 rounded-md border border-stone-light bg-stone/90 p-2 text-xs font-body text-mist shadow-lg backdrop-blur-sm">
            <p className="font-display font-medium">{entry.title}</p>
            {entry.value !== null ? <p className="mt-1 text-mist/60">{entry.value}{unit ? ` ${unit}` : ''}</p> : null}
            {entry.note ? <p className="mt-1 text-mist/40">{entry.note}</p> : null}
          </div>
        </Html>
      ) : null}
    </group>
  )
}
```

- [ ] **Step 5: Render the trail in the dev route**

`src/features/dev/DevIslandView.tsx` becomes (the island renders `focused`, so it uses the focus build):

```tsx
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Goal } from '../archipelago/api'
import { Island } from '../archipelago/Island'
import { SceneEnvironment } from '../archipelago/SceneEnvironment'
import { HullRegistryProvider } from '../archipelago/hullRegistry'
import { devGoal, fixtureEntries, fixtureMilestones } from './fixtures'
import { TrailView } from '../roadmap/RoadmapTrail'
import { getIslandLayout } from '../archipelago/terrain/islandCache'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { parseDevParams } from './devParams'
import type { DevView } from './devParams'

const BIOMES: readonly Goal['biome'][] = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands']

const PRESETS: Record<DevView, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [8.5, 7.5, 8.5], target: [0, 1.0, 0] },
  side: { position: [11, 3.2, 0.5], target: [0, 1.2, 0] },
  top: { position: [0.01, 15, 0.01], target: [0, 0, 0] },
  back: { position: [-8.5, 6.5, -8.5], target: [0, 1.0, 0] },
}

/** DEV-only visual harness (spec §10): the real scene environment and island, no auth or data round trip. */
export function DevIslandView() {
  const { biome: raw = 'jungle' } = useParams()
  const biome = BIOMES.includes(raw as Goal['biome']) ? (raw as Goal['biome']) : 'jungle'
  const [search] = useSearchParams()
  const params = parseDevParams(search)
  const preset = PRESETS[params.view]
  const position = preset.position.map((p, i) => preset.target[i] + (p - preset.target[i]) * params.dist) as [number, number, number]
  const goal = devGoal(biome, params.seed, params.head)
  const milestones = fixtureMilestones(goal, params.milestones, params.head)
  const entries = fixtureEntries(goal, milestones, params.entries)

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas flat camera={{ position, fov: 50 }}>
        <SceneEnvironment />
        <HullRegistryProvider>
          <Suspense fallback={null}>
            <Island goal={goal} onClick={() => undefined} seedOverride={params.seed} focused />
            {isTerraced(biome) ? (
              <group rotation={[0, ISLAND_YAW, 0]}>
                <TrailView goal={goal} layout={getIslandLayout(biome, params.seed)} milestones={milestones} entries={entries} />
              </group>
            ) : null}
          </Suspense>
        </HullRegistryProvider>
        <OrbitControls target={preset.target} />
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean.

With `npm run dev` running:
- `npm run render:island -- jungle 1 hero` and `npm run render:island -- jungle 1 hero milestones=8 head=1`: the deep-teal ribbon lies on the carved path, cairns stand on at least three levels for N = 4, entry dots sit beside the path, and the pennant stands on the path at the head.
- In the app, focus a jungle goal, mark a milestone done and add an update: the pennant walks up the ramps to its new head (not a straight line through the cliff), and the new entry flies in.

This build was checked in a browser while writing this plan (seed 1, hero view): terrain, path, ribbon, cairns, entries, pennant, camp and label all render.

- [ ] **Step 7: Stage**

```bash
git add src/features/roadmap/RoadmapTrail.tsx src/features/roadmap/LegacyRoadmapTrail.tsx src/features/roadmap/MilestoneCairn.tsx src/features/roadmap/TrailPennant.tsx src/features/dev/fixtures.ts src/features/dev/devParams.ts src/features/dev/devParams.test.ts src/features/dev/DevIslandView.tsx
```

---

### Task 18: Focus pose, focus orbit and the demand frameloop

*Written and implemented 2026-09-28 (the original plan stopped after Task 17).*

**Files:** Modify `src/features/archipelago/CameraRig.tsx`, `ArchipelagoScene.tsx`, `src/features/dev/devParams.ts`, `devParams.test.ts`, `DevIslandView.tsx`.

- `CameraRig`: a focused terraced goal flies to `focusPose(getIslandLayout(biome, seedOverride ?? hashGoalId(id)), { aspect, fovDeg: camera.fov, insetRightPx: width ≥ 640 ? 288 : 0, viewportPx: size, orbit })` (spec §5.6). Legacy biomes keep the old approach pose. The fly-to easing is unchanged.
- Focus orbit (spec §5.6.1): its own `orbit` ref, reset to 0 on every focus change; a horizontal drag changes it (same `DRAG_SENSITIVITY`, drag-vs-click threshold and click suppression) only while a terraced goal is focused and no flight is running; each move calls `invalidate()`. The overview `azimuth` is never touched while focused.
- `ArchipelagoScene`: `frameloop="demand"` while a terraced goal is focused, `always` otherwise (the overview auto-rotate and the legacy trail/models animate without `invalidate()`); `touch-action: none` on the canvas. The camera flight calls `invalidate()` each frame while it runs.
- Dev harness: views `focus`, `orbit-back` (orbit π) and `phone` render the real `CameraRig` with `devOrbit` (fixed orbit, drag disabled); `orbit=<radians>` overrides.

Verify: `npm run render:island -- jungle 1 focus`, `jungle 1 orbit-back`, `jungle 1 phone`: the whole island in frame, shifted left of the panel on desktop, the back (waterfall side) at orbit π.
