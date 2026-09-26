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
| `terraceMesh.ts` | `buildTerrain(layout, detail)` → `{ lit, unlit, hull }` | 11 (core), 12 (corridor + features) |
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

