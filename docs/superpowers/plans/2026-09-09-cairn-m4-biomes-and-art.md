# Cairn M4 — Biomes and Art — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every placeholder visual in Cairn with real, licensed, performance-budgeted 3D art across all six biomes; apply a bespoke design-token system to every piece of 2D chrome; and ship the New Goal flow (§6.2) end to end — the last unbuilt user-facing feature in the app.

**Architecture:** Three mostly-independent tracks converging on the same components. (1) **2D design system** — Tailwind v4 `@theme` tokens + two self-hosted typefaces, applied to every existing 2D surface. (2) **3D art pipeline** — CC0 source assets → `gltf-transform` (dedupe/prune/weld/compress) → `gltfjsx` typed components → wired into `Island.tsx` (six biome landmasses + instanced props) and `RoadmapTrail.tsx` (trail marker), replacing the placeholder cone/primitive geometry from M2/M3. (3) **New Goal flow** — a Postgres RPC for one atomic goal+milestones insert, a `useCreateGoal` hook, and the three-step sheet UI with live biome/trail previews, the only remaining gap in the core loop from spec §1.

**Tech Stack:** Existing stack unchanged (React 19, R3F 9.7, drei 10.7, three 0.185.1, Tailwind v4, Radix, react-query, Zustand). New devDependencies: `@gltf-transform/cli`, `gltfjsx`. New dependencies: `@fontsource-variable/fraunces`, `@fontsource/inter`.

**Spec:** `docs/superpowers/specs/2026-09-09-cairn-design.md` — this plan implements §6.2 (New goal), §7 (visual direction), §8 (asset pipeline), and the M4 line of §9.

## Global Constraints

- Six biomes ship together in this milestone — jungle, desert, tundra, volcano, reef, highlands (spec §0.2). Do not defer any of them.
- Every asset comes from poly.pizza, Kenney.nl, Quaternius, KayKit (itch.io), or Poly Haven — CC0 only — and is recorded in `ASSETS.md` (URL + licence) even where attribution isn't legally required (spec §8).
- Every model is processed through `gltf-transform` (dedupe, prune, weld, Draco/Meshopt compression, textures resized to 512px max) before entering the repo. Typed components are generated with `gltfjsx` — never `useGLTF` on a raw glTF inline in a feature component (project CLAUDE.md, spec §8).
- Props are instanced (`<Instances>` from drei) — never one mesh per prop instance.
- Islands stay modular: one base landmass mesh per biome, props scattered on top, seeded deterministically from `goal.id` so an island looks identical on every visit (project CLAUDE.md).
- Total initial glTF payload budget: **under 3 MB compressed**. Preload only biomes present in the current user's archipelago.
- Trail marker stays a simple object (flag/lantern), never a character model (spec §0.3).
- The trail marker's react-spring-driven position must never be overwritten by a `useFrame` in the same frame — this is M3's Critical #1 regression class; any new marker mesh/geometry change must not reintroduce a competing `useFrame` write on the marker's transform.
- `frameloop="demand"` on the island detail view when nothing is animating. Never render the archipelago canvas and a detail-view canvas as two live scenes at once — one scene, one camera, two camera states (already true post-M2/M3; do not regress it while restyling).
- Design-system hard constraints (spec §7, copied verbatim):
  - The 3D is the hero. 2D chrome is quiet and gets out of the way.
  - Six biomes need distinct palettes that still sit in one world.
  - One display face with real personality plus one workhorse for body/numbers. Avoid warm-cream+serif+terracotta and near-black+acid-accent — both are generic tells.
  - Non-user-triggered motion is limited to the archipelago's slow rotation and the water. Everything else moves only in response to something the user did, and must show what changed.
  - No all-caps labels. No `→` glued onto button text. No 01/02/03 markers except in the New Goal flow (which genuinely is a sequence).
  - Works down to a 380px viewport, visible keyboard focus, `prefers-reduced-motion` respected throughout, every 3D-only interaction has a keyboard-reachable equivalent.
  - Copy: sentence case, active voice, buttons name what happens ("Mark 2 km done", not "Submit").
- `src/lib/` stays free of React and three.js imports (project CLAUDE.md). `src/lib/archipelago.ts`'s `islandPosition()` is the single source of truth for island placement — the New Goal flow calls it, never re-derives the golden-angle math inline or in SQL.
- Every Supabase table call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query. Schema changes only via `supabase/migrations/*.sql`, applied with `npm run db:push`.
- `npm run typecheck`, `npm run build`, and `npm test` must all stay clean after every task.

## Design System (approved direction — apply exactly, do not reinterpret)

This section is itself the "show the plan before building" gate spec §7 requires. It was checked against every hard constraint above before being written down.

**Base tokens** (six named hex values, defined as Tailwind v4 `@theme` CSS custom properties):

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#12181f` | App background — the night-water the archipelago floats in |
| `--color-stone` | `#232b34` | Panel/surface fill — "waypoint" chrome |
| `--color-stone-light` | `#313c47` | Borders, dividers, hover state on stone |
| `--color-mist` | `#e9e6de` | Primary text on dark — warm-washed off-white, never pure white |
| `--color-lantern` | `#e8a24c` | The one warm accent — focus rings, primary CTA, the trail marker's glow, celebration. Reserved for meaning, never decoration |
| `--color-tide` | `#4fa8a0` | Cool secondary accent — links, secondary progress states, water sheen |

**Typefaces:** Display = **Fraunces** (variable serif, `@fontsource-variable/fraunces`) — goal titles, the app mark, milestone numbers, New Goal step headers. Large sizes only, used sparingly. Body/workhorse = **Inter** (`@fontsource/inter`, weights 400/500/600/700) — everything else: labels, buttons, form fields, in-context numbers, the Journey panel's entries. This pairing was checked against the two banned combinations: it is a cool ink/mist palette with a lantern accent (not cream+terracotta), and mist/lantern/tide are all well clear of near-black-plus-acid.

**Layout concept — "waypoint chrome":** no docked sidebars, no full-width bars beyond a slender top strip (app mark + New Goal + Explore + avatar). Every other panel is small, anchored near the 3D element it describes — a card near the hovered island, a card near the clicked milestone — appears with a brief settle-in only in direct response to the triggering action, and leaves the same way. Panels are semi-transparent stone with a soft backdrop blur, never opaque slabs competing with the 3D underneath.

**Three principles specific to Cairn:**
1. **Waypoints, not walls.** UI marks a spot; it never occupies the screen. A cairn marks a trail without blocking the view of it.
2. **Warm light in a cool world.** Every biome palette and the base ink/stone/mist/tide tokens are cool-to-neutral. Lantern amber is the *only* warm color in the whole app, and it always means something — focus, progress, completion — never decoration.
3. **Weight earned, not applied.** Visual prominence (size, contrast, motion) tracks progress. A dormant milestone is barely there; a just-completed one is the loudest thing on screen for a moment, then settles back down.

**Biome palettes** (each supplies a landmass tint, a trail material tint, and one accent — all still read as one world against the shared ink/mist/lantern/tide base):

| Biome | Landmass | Trail material | Accent |
|---|---|---|---|
| Jungle | `#1f4d2e` canopy / `#16331f` shadow | `#2d5016` (existing) | `#e2483f` hot flower-red |
| Desert | `#d9b779` / `#c9a15f` | `#c9a66b` (existing) | `#7a5a8c` dusk violet |
| Tundra | `#dde8ee` / `#b9cdd6` | `#dbe9f4` (existing) | `#e8a24c` (lantern — warmth pocket) |
| Volcano | `#2b2b2e` / `#1a1a1c` | `#3b3b3b` (existing) | `#d9633b` ember |
| Reef | `#2ec4b6` (existing) / `#1f8a80` | `#2ec4b6` | `#ff8b6b` coral |
| Highlands | `#6b7280` (existing) / `#4d525c` | `#6b7280` | `#8b7d9b` heather |

## File Structure

- `src/index.css` — Tailwind v4 `@theme` token block, font `@import`s. **Modify.**
- `src/lib/theme.ts` — biome palette lookup (hex numbers for R3F materials; the single source of truth Island.tsx/RoadmapTrail.tsx/the biome picker all read from). **Create.**
- `src/lib/theme.test.ts` — every biome key resolves, no biome missing a field. **Create.**
- `ASSETS.md` — CC0 source ledger. **Create.**
- `scripts/process-asset.mjs` — wraps `gltf-transform` (dedupe/prune/weld/compress/resize) + `gltfjsx` for one input model. **Create.**
- `assets-raw/<biome>/*.glb`, `assets-raw/marker/*.glb` — sourced, unprocessed originals (git-ignored — see Task 2). **Create (populated in Task 3).**
- `src/features/archipelago/models/<Biome>Landmass.tsx` × 6 — gltfjsx-generated typed landmass components. **Create.**
- `src/features/archipelago/models/<Biome>Props.tsx` × 6 — gltfjsx-generated typed, instanced prop components. **Create.**
- `src/features/roadmap/models/TrailMarker.tsx` — gltfjsx-generated typed marker component. **Create.**
- `src/features/archipelago/Island.tsx` — swap placeholder cone for real per-biome landmass + instanced props. **Modify.**
- `src/features/roadmap/RoadmapTrail.tsx` — swap the marker's placeholder primitive for `<TrailMarker>`. **Modify.**
- `src/features/archipelago/HomeOverlay.tsx`, `src/features/roadmap/RoadmapPanel.tsx`, `src/features/archipelago/EmptyArchipelago.tsx`, `src/features/NotFoundPage.tsx` — restyled with design tokens. **Modify.**
- `supabase/migrations/0007_create_goal_with_milestones.sql` — atomic goal+milestones insert RPC. **Create.**
- `src/lib/database.types.ts` — regenerated via `npm run db:types` after the migration. **Modify (generated).**
- `src/features/archipelago/api.ts` — `useCreateGoal` mutation, `useProfile` query (needed for `archipelago_seed`). **Modify.**
- `src/features/archipelago/api.test.ts` — tests for the milestone-validation pure helper. **Create.**
- `src/lib/newGoalValidation.ts` — pure milestone/target validation used by both the form's live validation and (defensively) the mutation. **Create.**
- `src/lib/newGoalValidation.test.ts` — tests. **Create.**
- `src/features/archipelago/NewGoalSheet.tsx` — the 3-step Radix Dialog flow. **Create.**
- `src/features/archipelago/BiomePicker.tsx` — the six-viewport shared-canvas biome picker. **Create.**
- `src/features/archipelago/MilestoneBuilder.tsx` — milestone step with live trail preview. **Create.**

## Task 1: Design tokens and typography foundation

**Files:**
- Modify: `src/index.css`
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Modify: `package.json` (add `@fontsource-variable/fraunces`, `@fontsource/inter`)

**Interfaces:**
- Produces: `BIOME_PALETTES: Record<Goal['biome'], { landmass: number; landmassShadow: number; trail: number; accent: number }>` and `getBiomePalette(biome: Goal['biome'])` from `src/lib/theme.ts`, exporting hex values as **numbers** (`0x1f4d2e`), not CSS strings — R3F `meshStandardMaterial color` props take a number/three.Color, not a Tailwind class. Every later task that touches biome color (Island.tsx, models, BiomePicker) imports from here — never hardcodes a biome hex a second time.
- Consumes: nothing (foundational task).

- [ ] **Step 1: Install font packages**

```bash
npm install @fontsource-variable/fraunces @fontsource/inter
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/theme.test.ts
import { describe, expect, it } from 'vitest'
import { BIOME_PALETTES, getBiomePalette } from './theme'

const BIOMES = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands'] as const

describe('BIOME_PALETTES', () => {
  it('defines all six biomes', () => {
    expect(Object.keys(BIOME_PALETTES).sort()).toEqual([...BIOMES].sort())
  })

  it('every biome has all four fields as valid hex numbers', () => {
    for (const biome of BIOMES) {
      const palette = BIOME_PALETTES[biome]
      for (const field of ['landmass', 'landmassShadow', 'trail', 'accent'] as const) {
        expect(typeof palette[field]).toBe('number')
        expect(palette[field]).toBeGreaterThanOrEqual(0)
        expect(palette[field]).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('getBiomePalette returns the same object as a direct lookup', () => {
    expect(getBiomePalette('reef')).toBe(BIOME_PALETTES.reef)
  })
})
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npm test -- theme.test.ts`
Expected: FAIL with "Cannot find module './theme'"

- [ ] **Step 3: Write `src/lib/theme.ts`**

```ts
// src/lib/theme.ts
import type { Goal } from '../features/archipelago/api'

export interface BiomePalette {
  landmass: number
  landmassShadow: number
  trail: number
  accent: number
}

// Six distinct palettes that still read as one world — spec §7. Kept as hex
// numbers (not CSS strings) because every consumer feeds a three.js
// material color, never a Tailwind class.
export const BIOME_PALETTES: Record<Goal['biome'], BiomePalette> = {
  jungle: { landmass: 0x1f4d2e, landmassShadow: 0x16331f, trail: 0x2d5016, accent: 0xe2483f },
  desert: { landmass: 0xd9b779, landmassShadow: 0xc9a15f, trail: 0xc9a66b, accent: 0x7a5a8c },
  tundra: { landmass: 0xdde8ee, landmassShadow: 0xb9cdd6, trail: 0xdbe9f4, accent: 0xe8a24c },
  volcano: { landmass: 0x2b2b2e, landmassShadow: 0x1a1a1c, trail: 0x3b3b3b, accent: 0xd9633b },
  reef: { landmass: 0x2ec4b6, landmassShadow: 0x1f8a80, trail: 0x2ec4b6, accent: 0xff8b6b },
  highlands: { landmass: 0x6b7280, landmassShadow: 0x4d525c, trail: 0x6b7280, accent: 0x8b7d9b },
}

export function getBiomePalette(biome: Goal['biome']): BiomePalette {
  return BIOME_PALETTES[biome]
}

// The base app tokens (spec §7's "waypoint chrome") as hex numbers, for the
// rare case 3D code needs one (e.g. the lantern-colored marker glow) —
// 2D CSS reads the same values via the @theme block in index.css instead.
export const BASE_TOKENS = {
  ink: 0x12181f,
  stone: 0x232b34,
  stoneLight: 0x313c47,
  mist: 0xe9e6de,
  lantern: 0xe8a24c,
  tide: 0x4fa8a0,
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- theme.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Wire tokens and fonts into `src/index.css`**

```css
@import "tailwindcss";
@import "@fontsource-variable/fraunces";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/inter/700.css";

@theme {
  --color-ink: #12181f;
  --color-stone: #232b34;
  --color-stone-light: #313c47;
  --color-mist: #e9e6de;
  --color-lantern: #e8a24c;
  --color-tide: #4fa8a0;

  --font-display: "Fraunces Variable", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;
}

body {
  background: var(--color-ink);
  color: var(--color-mist);
  font-family: var(--font-body);
}

/* Visible keyboard focus everywhere — spec §7 quality floor. Tailwind's
   default focus ring is blue and clashes with the palette; this replaces
   it globally rather than per-component. */
:focus-visible {
  outline: 2px solid var(--color-lantern);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Verify build picks up the fonts**

Run: `npm run build`
Expected: clean build; inspect `dist/assets/*.css` for `@font-face` rules referencing Fraunces/Inter woff2 files.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/lib/theme.ts src/lib/theme.test.ts package.json package-lock.json
git commit -m "M4: design tokens and typography foundation"
```

## Task 2: Asset pipeline plumbing (no real assets yet)

**Files:**
- Create: `ASSETS.md`
- Create: `scripts/process-asset.mjs`
- Modify: `package.json` (add `@gltf-transform/cli`, `gltfjsx` devDependencies; add `assets:process` script)
- Modify: `.gitignore` (add `assets-raw/`)
- Create: `assets-raw/.gitkeep`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run assets:process -- <input.glb> <outputDir> <ComponentName>` — a working CLI wrapper Task 4 depends on. Also produces the `ASSETS.md` file format Task 3 (asset sourcing) appends rows to.

- [ ] **Step 1: Install pipeline tools**

```bash
npm install -D @gltf-transform/cli gltfjsx
```

- [ ] **Step 2: Create `ASSETS.md`**

```markdown
# Cairn — asset sources

Every 3D asset in this repo, CC0-licensed, recorded here even where attribution
isn't legally required (spec §8). One row per source file.

| File | Source | URL | Licence | Notes |
|---|---|---|---|---|
```

- [ ] **Step 3: Add `assets-raw/` to `.gitignore` and create a placeholder**

Raw, unprocessed downloads never enter the repo — only their `gltf-transform`
output does. Append to `.gitignore`:

```
assets-raw/*
!assets-raw/.gitkeep
```

Create empty `assets-raw/.gitkeep`.

- [ ] **Step 4: Write `scripts/process-asset.mjs`**

```js
#!/usr/bin/env node
// scripts/process-asset.mjs
// Wraps the gltf-transform + gltfjsx pipeline spec §8 mandates for every
// model: dedupe, prune, weld, compress, resize textures, then generate a
// typed React component. Never call gltf-transform or gltfjsx directly —
// this script is the one place the pipeline order is defined.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const [, , input, outputDir, componentName] = process.argv

if (!input || !outputDir || !componentName) {
  console.error('Usage: npm run assets:process -- <input.glb> <outputDir> <ComponentName>')
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })
const compressed = path.join(outputDir, `${componentName}.glb`)

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit' })
}

// One gltf-transform invocation, in the order spec §8 lists: dedupe, prune,
// weld, then compress. resize is a separate transform since gltf-transform's
// CLI doesn't chain `resize` inside `optimize` for texture-only sizing.
run('npx', [
  'gltf-transform',
  'optimize',
  input,
  compressed,
  '--compress',
  'meshopt',
  '--texture-size',
  '512',
])

run('npx', ['gltfjsx', compressed, '--output', path.join(outputDir, `${componentName}.tsx`), '--types', '--component', componentName])

console.log(`\nDone. Review ${outputDir}/${componentName}.tsx before wiring it in — gltfjsx output needs the component name and export checked, and any node names referenced by the scatter/instancing code.`)
```

Add to `package.json` scripts: `"assets:process": "node scripts/process-asset.mjs"`.

- [ ] **Step 5: Smoke-test the script on a trivial input**

There's no real model yet (Task 3 sources those). Verify the script at least
parses its args and fails clearly without one:

Run: `npm run assets:process`
Expected: prints the Usage line and exits 1 (not a crash/stack trace).

- [ ] **Step 6: Commit**

```bash
git add ASSETS.md scripts/process-asset.mjs package.json package-lock.json .gitignore assets-raw/.gitkeep
git commit -m "M4: asset processing pipeline (gltf-transform + gltfjsx wrapper)"
```

## Task 3: Source CC0 assets (executed directly by the controller, not dispatched)

This task has no subagent brief — the controller (you) performs it directly
via a real browser, because asset selection is an aesthetic judgment call
against the design system in this plan, and downloading files requires the
user's explicit per-batch permission (already requested separately).

**Deliverables**, placed in `assets-raw/`:
- `assets-raw/jungle/landmass.glb` + 2-4 prop files (trees, rocks, plants)
- `assets-raw/desert/landmass.glb` + 2-4 prop files
- `assets-raw/tundra/landmass.glb` + 2-4 prop files
- `assets-raw/volcano/landmass.glb` + 2-4 prop files
- `assets-raw/reef/landmass.glb` + 2-4 prop files
- `assets-raw/highlands/landmass.glb` + 2-4 prop files
- `assets-raw/marker/flag-or-lantern.glb` — one, not a character model

Sourced only from poly.pizza, Kenney.nl, Quaternius, KayKit (itch.io), or
Poly Haven, matching each biome's palette direction from the Design System
section. Every file gets a row in `ASSETS.md` (filename, source, URL,
licence) before Task 4 starts. The exact filenames sourced here are handed
to Task 4's dispatch brief verbatim — the plan cannot name them in advance.

## Task 4: Process sourced assets into typed components

**Files:**
- Create: `src/features/archipelago/models/JungleLandmass.tsx`, `DesertLandmass.tsx`, `TundraLandmass.tsx`, `VolcanoLandmass.tsx`, `ReefLandmass.tsx`, `HighlandsLandmass.tsx`
- Create: `src/features/archipelago/models/JungleProps.tsx`, `DesertProps.tsx`, `TundraProps.tsx`, `VolcanoProps.tsx`, `ReefProps.tsx`, `HighlandsProps.tsx`
- Create: `src/features/roadmap/models/TrailMarker.tsx`
- Modify: `ASSETS.md` (fill in rows for the files Task 3 sourced)
- Create: `public/models/*.glb` (the compressed, processed output — served as static assets, not bundled through Vite's JS pipeline)

**Interfaces:**
- Consumes: `assets-raw/**/*.glb` from Task 3, `npm run assets:process` from Task 2.
- Produces: for each biome, `<JungleLandmass position={[number,number,number]} />`-shaped components (gltfjsx output, typed) that self-load their `.glb` from `/models/...`; for each biome, a `<JungleProps seed={number} count={number} />`-shaped instanced-prop component using drei's `<Instances>`; `<TrailMarker />` for the roadmap.

This task's exact commands depend on the filenames Task 3 sourced — supplied
in the dispatch brief, not here. The shape every output component must
follow:

- [ ] **Step 1: Run the pipeline once per sourced model**

For each file in `assets-raw/`, run (brief supplies the real filenames):

```bash
npm run assets:process -- assets-raw/jungle/landmass.glb public/models JungleLandmass
```

Move the generated `.glb` from the output dir's side effect into `public/models/` (gltfjsx's own output path) and the generated `.tsx` into `src/features/archipelago/models/` (or `src/features/roadmap/models/` for the marker) — adjust the script's `outputDir` argument per-call rather than moving files by hand, i.e. call it as `npm run assets:process -- <input> public/models <Name>` for the `.glb` and separately point gltfjsx's own `--output` at the final `src/features/.../models/<Name>.tsx` path (the wrapper script in Task 2 already does both in one call when `outputDir` is the models directory — for a cleaner split, invoke `gltf-transform` and `gltfjsx` as two separate npm script calls if the combined wrapper's single `outputDir` doesn't suit a given file; document whichever approach you use inline as a one-line comment at the top of each generated `.tsx`, since gltfjsx's own header comment already exists there).

- [ ] **Step 2: Review each gltfjsx output for prop-instancing correctness**

gltfjsx emits one `<mesh>` per node by default. For any props file (not the
single landmass mesh), rewrite the generated JSX to use drei's `<Instances>`
+ `<Instance>` pattern instead of repeated `<mesh>` calls — spec §8: "Props
must be instanced... A jungle island's 60 trees are one `<Instances>`, not 60
meshes." Example shape for a props component:

```tsx
// src/features/archipelago/models/JungleProps.tsx
import { useGLTF, Instances, Instance } from '@react-three/drei'
import { useMemo } from 'react'
import type { GLTF } from 'three-stdlib'

interface JungleTreeGLTF extends GLTF {
  nodes: { Tree: THREE.Mesh }
  materials: { TreeMat: THREE.MeshStandardMaterial }
}

interface JunglePropsProps {
  seed: number
  count: number
}

function hash01(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function JungleProps({ seed, count }: JunglePropsProps) {
  const { nodes, materials } = useGLTF('/models/JungleProps.glb') as unknown as JungleTreeGLTF
  const placements = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = hash01(seed, i * 2) * Math.PI * 2
        const radius = 0.5 + hash01(seed, i * 2 + 1) * 1.6
        return {
          position: [radius * Math.cos(angle), 0, radius * Math.sin(angle)] as [number, number, number],
          rotation: [0, hash01(seed, i * 3) * Math.PI * 2, 0] as [number, number, number],
          scale: 0.8 + hash01(seed, i * 5) * 0.4,
        }
      }),
    [seed, count],
  )

  return (
    <Instances geometry={nodes.Tree.geometry} material={materials.TreeMat} limit={count}>
      {placements.map((p, i) => (
        <Instance key={i} position={p.position} rotation={p.rotation} scale={p.scale} />
      ))}
    </Instances>
  )
}

useGLTF.preload('/models/JungleProps.glb')
```

Every biome's props component follows this exact shape (same `hash01`
determinism approach `src/lib/archipelago.ts` already established for the
project — reuse that file's `hash01` via import rather than redefining it a
seventh time; adjust the import path accordingly). `seed` is always
`goal.id`-derived (a numeric hash of the UUID — write a tiny
`hashGoalId(id: string): number` helper in `src/lib/theme.ts` if one doesn't
already exist, exported alongside `BIOME_PALETTES`) so an island's prop
scatter is stable across visits, per CLAUDE.md's asset-pipeline rule.

- [ ] **Step 3: Verify the payload budget as assets are added**

Run: `du -sh public/models/*.glb` (or `Get-ChildItem public/models | Measure-Object Length -Sum` in PowerShell) after each file — running total must stay under 3 MB for the models actually preloaded (see Task 10 for the full measurement/report).

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean. gltfjsx's `--types` output must compile against the installed `three`/`@react-three/fiber` versions — fix any type mismatch by hand (gltfjsx's generated types are a starting point, not guaranteed to match this project's three.js version exactly).

- [ ] **Step 5: Commit**

```bash
git add public/models src/features/archipelago/models src/features/roadmap/models ASSETS.md
git commit -m "M4: process sourced CC0 assets into typed biome/marker components"
```

## Task 5: Wire real biome models into Island.tsx

**Files:**
- Modify: `src/features/archipelago/Island.tsx`

**Interfaces:**
- Consumes: the six `<XLandmass>`/`<XProps>` components from Task 4, `getBiomePalette`/`hashGoalId` from `src/lib/theme.ts`.
- Produces: `Island.tsx` keeps its existing external props (`goal`, `onClick`, `focused`) unchanged — this task only changes what renders inside the `<group>`, so `ArchipelagoScene.tsx` needs no changes.

- [ ] **Step 1: Replace the placeholder cone with a per-biome landmass lookup**

```tsx
// inside Island.tsx, replacing the single <coneGeometry> mesh:
const LANDMASS_COMPONENTS: Record<Goal['biome'], typeof JungleLandmass> = {
  jungle: JungleLandmass,
  desert: DesertLandmass,
  tundra: TundraLandmass,
  volcano: VolcanoLandmass,
  reef: ReefLandmass,
  highlands: HighlandsLandmass,
}
const PROPS_COMPONENTS: Record<Goal['biome'], typeof JungleProps> = {
  jungle: JungleProps,
  desert: DesertProps,
  tundra: TundraProps,
  volcano: VolcanoProps,
  reef: ReefProps,
  highlands: HighlandsProps,
}
const PROP_COUNT_BY_BIOME: Record<Goal['biome'], number> = {
  jungle: 14,
  desert: 6,
  tundra: 5,
  volcano: 4,
  reef: 8,
  highlands: 7,
}
```

Render `<Landmass ref={meshRef} onClick={...} onPointerOver={...} onPointerOut={...} />` in place of the old `<mesh><coneGeometry/>...</mesh>` block — the existing hover-lift `useFrame` keeps writing to the same `meshRef`, so the landmass component's root must forward a ref (gltfjsx `--types` output already supports `ref` on its root group/mesh; confirm this in Task 4's review, not here). Render `<Props seed={hashGoalId(goal.id)} count={PROP_COUNT_BY_BIOME[goal.biome]} />` as a sibling inside the same group, so props inherit the landmass's hover-lift.

- [ ] **Step 2: Keep the biome-color label/border tinted per palette**

The existing `<Html>` title label (`bg-slate-950/80`) and hover card gain a
thin top border in `getBiomePalette(goal.biome).accent` (converted to a CSS
hex string for the `style` prop, since Tailwind classes can't take a runtime
value) — small, not decorative-for-its-own-sake: it's the one place a user
distinguishes biome identity from a 2D surface, consistent with "weight
earned, not applied" (this is informational weight, not ornament).

- [ ] **Step 3: Verify existing tests and behavior are unregressed**

`Island.tsx` has no dedicated unit tests today (it's a 3D component); the
regression surface is `ArchipelagoScene.tsx`'s consumption of `Island`'s
props, which Task 4/5 don't change. Run the full suite anyway:

Run: `npm test`
Expected: all existing tests pass unchanged.

- [ ] **Step 4: Live-verify in the browser** (see Task 10 for the full pass — a quick check here is enough to catch an obviously wrong scale/orientation before moving on)

Load the app, confirm each biome's island renders its real landmass+props
instead of a cone, at a scale/position that doesn't clip through the water
plane or float above it.

- [ ] **Step 5: Commit**

```bash
git add src/features/archipelago/Island.tsx
git commit -m "M4: wire real biome landmass and instanced props into Island"
```

## Task 6: Wire the real trail marker and per-biome trail material into RoadmapTrail.tsx

**Files:**
- Modify: `src/features/roadmap/RoadmapTrail.tsx`

**Interfaces:**
- Consumes: `<TrailMarker>` from Task 4, `getBiomePalette` from `src/lib/theme.ts` (Task 1).
- Produces: no external prop/behavior change to `RoadmapTrail` — this is an internal swap of what renders at the marker's animated position and what colors the tube/nodes, not a change to `RoadmapTrail`'s own `goal` prop or its callers.

- [ ] **Step 0: Apply the biome's trail material — spec §7: "Each biome supplies its own trail material and prop set"**

Today `RoadmapTrail.tsx` hardcodes the tube colors (`#f5d76e` completed,
`#8b93a1` remaining, both at `RoadmapTrail.tsx:259` and `:263`) and the
milestone-node colors, regardless of `goal.biome`. Read `getBiomePalette(goal.biome)` once
near the top of the component and:
- completed tube: `color={getBiomePalette(goal.biome).trail}` (was `"#f5d76e"`)
- remaining tube: keep the existing desaturated/faint treatment, but derive
  it from the same trail color rather than the unrelated hardcoded
  `"#8b93a1"` — e.g. pass the trail color through with reduced
  `opacity`/a mixed-toward-stone tint, so completed vs. remaining still
  reads clearly per biome, not as one fixed neutral grey for every biome.
- the "next milestone" pulsing node's lit color: `getBiomePalette(goal.biome).accent` (was whatever hardcoded color it used) — this is exactly the kind of "weight earned" moment (design system principle 3) that should use the biome's own accent, not a generic yellow/orange.

This must not touch the pulse *animation* logic (M3's Critical #1 fix —
no `useFrame` writing the marker's position) — only the static `color`
prop values change.

- [ ] **Step 1: Replace the marker's placeholder primitive geometry with `<TrailMarker>`**

Read the current marker JSX first (`RoadmapTrail.tsx`'s `<animated.group
position={...}>` block from M3) before editing — the `as unknown as
[number, number, number]` cast on that group's `position` prop, and the
absence of any `useFrame` writing to the marker's transform (M3's Critical
#1 fix), must both survive this change untouched. Swap only the mesh/
geometry/material children inside that `<animated.group>` for
`<TrailMarker scale={0.3} />` (tune scale once visible against the trail's
actual size — the trail tube's radius is the reference, not a guess written
here).

- [ ] **Step 2: Confirm no new `useFrame` was introduced on the marker**

This is the exact regression class M3's final review caught once already
(react-spring's per-frame write beaten by a sibling `useFrame`). Grep the
diff for `useFrame` — if `<TrailMarker>`'s own generated component (from
gltfjsx) contains an internal animation loop of its own (unlikely for a
static prop model, but verify), it must not touch `position`/`rotation` at
the group level Task 6 renders it inside.

- [ ] **Step 3: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: clean — `curve.test.ts` and `api.test.ts` are unaffected by this
change; nothing here touches curve math.

- [ ] **Step 4: Live-verify**

Open a goal's roadmap, confirm the marker renders as the real flag/lantern
model, sitting on the trail surface (not embedded in it or floating above
it), and still animates forward correctly on Mark Done.

- [ ] **Step 5: Commit**

```bash
git add src/features/roadmap/RoadmapTrail.tsx
git commit -m "M4: wire real trail marker asset into RoadmapTrail"
```

## Task 7: Restyle 2D chrome with the design token system

**Files:**
- Modify: `src/features/archipelago/HomeOverlay.tsx`
- Modify: `src/features/roadmap/RoadmapPanel.tsx`
- Modify: `src/features/archipelago/EmptyArchipelago.tsx`
- Modify: `src/features/NotFoundPage.tsx`

**Interfaces:**
- Consumes: the `@theme` tokens from Task 1 (`bg-ink`, `bg-stone`, `text-mist`, `border-stone-light`, `text-lantern`, `text-tide`, `font-display`, `font-body` — Tailwind v4 auto-generates utility classes from `@theme` custom properties, so no `tailwind.config` changes are needed beyond what Task 1 already did).
- Produces: no prop/behavior changes to any of these four components — this task is purely visual (classNames and JSX structure for layout), so no test changes are required beyond re-running the existing suite unchanged.

- [ ] **Step 1: `HomeOverlay.tsx` — apply "waypoint chrome" layout**

Replace the current `bg-slate-*` classes throughout with the token classes
(`bg-stone/80 backdrop-blur-sm` for the header strip and dropdown, `text-
mist`, `border-stone-light`). The app mark ("Cairn") becomes `font-display
text-lg` — the one place the display face appears in the header, used
sparingly per the design system. The disabled "New goal"/"Explore" buttons
lose their `disabled`/`opacity-50`/"Coming soon" treatment for **New goal**
only (Task 9 wires it to a real handler; Explore stays disabled — that's
M5). The primary "New goal" button becomes the one `bg-lantern text-ink`
filled button in the header — the single warm accent, reserved for the
primary action, per "warm light in a cool world."

- [ ] **Step 2: `RoadmapPanel.tsx` — typographic pass on the Journey panel**

Per spec §6.3, "this is the screen someone actually reads back over months
— it deserves real typographic care." Apply `font-display` to the goal
title and each milestone/entry's headline, `font-body` to dates/notes/
values, tighten the panel to the "small, anchored, settle-in" waypoint
pattern rather than a large docked sidebar if it currently reads as one —
read the current file's layout before deciding how much structural change
is warranted; the tokens and type pairing are mandatory, the exact
container sizing is a judgment call bounded by the 380px-viewport
constraint.

- [ ] **Step 3: `EmptyArchipelago.tsx` and `NotFoundPage.tsx`**

Both get the same token treatment — `bg-ink`, `text-mist`, `font-display`
for the headline, `font-body` for supporting copy. Per spec §6.1, the empty
state is "an unclaimed island... not a modal, not an illustration of a
clipboard" — verify the existing implementation still matches that framing
once restyled (it was built correctly in M2; don't regress the concept
while changing only its colors/type).

- [ ] **Step 4: Full-suite regression check**

Run: `npm test && npm run typecheck && npm run build`
Expected: clean — no component in this task changes props/behavior, so
every existing test (`api.test.ts` files, `curve.test.ts`, etc.) must pass
unchanged. If any test asserts a specific `className` string, update the
assertion to match — that's the only kind of test change this task should
produce.

- [ ] **Step 5: Live-verify against the quality floor**

Resize the browser to 380px width and confirm no horizontal overflow;
tab through the header controls and confirm the lantern focus ring is
visible; toggle `prefers-reduced-motion` in devtools and confirm no motion
regression (this task shouldn't introduce any new motion at all — it's a
color/type pass).

- [ ] **Step 6: Commit**

```bash
git add src/features/archipelago/HomeOverlay.tsx src/features/roadmap/RoadmapPanel.tsx src/features/archipelago/EmptyArchipelago.tsx src/features/NotFoundPage.tsx
git commit -m "M4: apply design token system to 2D chrome"
```

## Task 8: `create_goal_with_milestones` migration and `useCreateGoal`/`useProfile` hooks

**Files:**
- Create: `supabase/migrations/0007_create_goal_with_milestones.sql`
- Modify: `src/lib/database.types.ts` (regenerated)
- Modify: `src/features/archipelago/api.ts`
- Create: `src/lib/newGoalValidation.ts`
- Create: `src/lib/newGoalValidation.test.ts`

**Interfaces:**
- Consumes: `islandPosition()` from `src/lib/archipelago.ts` (unchanged, imported not re-derived).
- Produces: `useProfile(): UseQueryResult<{ id: string; archipelagoSeed: number }>`; `useCreateGoal(): UseMutationResult<Goal, Error, CreateGoalInput>` where
  ```ts
  interface CreateGoalMilestoneInput { title: string; targetValue: number | null }
  interface CreateGoalInput {
    title: string
    description: string | null
    biome: Goal['biome']
    kind: Goal['kind']
    unit: string | null
    startValue: number
    targetValue: number | null
    isPublic: boolean
    milestones: CreateGoalMilestoneInput[]
  }
  ```
  and `validateMilestones(kind, startValue, targetValue, milestones): { valid: true } | { valid: false; errors: Record<number, string> }` from `src/lib/newGoalValidation.ts` — Task 9's form calls this on every keystroke for live validation (spec §6.2 step 3: "validate live and explain the problem in the field").

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0007_create_goal_with_milestones.sql
-- Atomic insert for the New Goal flow (spec §6.2): "writes the goal,
-- milestones, and island position in one transaction." A Postgres function
-- is the only way supabase-js gets multi-table atomicity from the browser —
-- security invoker (the default) is enough here because both goals' and
-- milestones' own INSERT RLS policies already scope to auth.uid(), so this
-- function needs no elevated privilege, unlike owns_goal/goal_publicly_readable.
create or replace function public.create_goal_with_milestones(
  p_title text,
  p_description text,
  p_biome text,
  p_kind text,
  p_unit text,
  p_start_value numeric,
  p_target_value numeric,
  p_island_x double precision,
  p_island_z double precision,
  p_island_rotation double precision,
  p_is_public boolean,
  p_milestones jsonb
)
returns public.goals
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_goal public.goals;
  v_milestone jsonb;
  v_sort_order int := 0;
begin
  insert into public.goals (
    user_id, title, description, biome, kind, unit,
    start_value, target_value, current_value,
    island_x, island_z, island_rotation, is_public
  ) values (
    auth.uid(), p_title, p_description, p_biome, p_kind, p_unit,
    p_start_value, p_target_value, p_start_value,
    p_island_x, p_island_z, p_island_rotation, p_is_public
  )
  returning * into v_goal;

  for v_milestone in select * from jsonb_array_elements(p_milestones)
  loop
    insert into public.milestones (goal_id, title, target_value, sort_order)
    values (
      v_goal.id,
      v_milestone->>'title',
      (v_milestone->>'targetValue')::numeric,
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  return v_goal;
end;
$$;
```

- [ ] **Step 2: Push the migration and regenerate types**

Run: `npm run db:push`
Run: `npm run db:types`
Expected: `src/lib/database.types.ts` gains a `create_goal_with_milestones` entry under `Database['public']['Functions']`.

- [ ] **Step 3: Write the failing validation test**

```ts
// src/lib/newGoalValidation.test.ts
import { describe, expect, it } from 'vitest'
import { validateMilestones } from './newGoalValidation'

describe('validateMilestones', () => {
  it('accepts strictly increasing milestones inside (start, target)', () => {
    const result = validateMilestones('numeric', 0, 10, [
      { title: '2K', targetValue: 2 },
      { title: '5K', targetValue: 5 },
      { title: '8K', targetValue: 8 },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects a milestone at or below the previous one', () => {
    const result = validateMilestones('numeric', 0, 10, [
      { title: '5K', targetValue: 5 },
      { title: 'Also 5K', targetValue: 5 },
    ])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[1]).toMatch(/greater than/i)
  })

  it('rejects a milestone at or below start_value', () => {
    const result = validateMilestones('numeric', 2, 10, [{ title: 'Too low', targetValue: 2 }])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toBeDefined()
  })

  it('rejects a milestone at or above target_value', () => {
    const result = validateMilestones('numeric', 0, 10, [{ title: 'Too high', targetValue: 10 }])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toBeDefined()
  })

  it('rejects more than 8 milestones', () => {
    const milestones = Array.from({ length: 9 }, (_, i) => ({ title: `M${i}`, targetValue: i + 1 }))
    const result = validateMilestones('numeric', 0, 20, milestones)
    expect(result.valid).toBe(false)
  })

  it('checklist milestones need no targetValue and skip numeric ordering checks', () => {
    const result = validateMilestones('checklist', 0, null, [
      { title: 'Step one', targetValue: null },
      { title: 'Step two', targetValue: null },
    ])
    expect(result.valid).toBe(true)
  })

  it('accepts zero milestones', () => {
    expect(validateMilestones('numeric', 0, 10, []).valid).toBe(true)
  })
})
```

- [ ] **Step 4: Run to verify failure, then implement**

Run: `npm test -- newGoalValidation.test.ts` → FAIL (module not found)

```ts
// src/lib/newGoalValidation.ts
export interface MilestoneInput {
  title: string
  targetValue: number | null
}

export type MilestoneValidationResult = { valid: true } | { valid: false; errors: Record<number, string> }

const MAX_MILESTONES = 8

/**
 * Live validation for the New Goal milestones step (spec §6.2 step 3):
 * "Values must be strictly increasing and inside (start, target)." Only
 * numeric-kind goals have ordering to validate — checklist milestones carry
 * no target_value at all.
 */
export function validateMilestones(
  kind: 'numeric' | 'checklist',
  startValue: number,
  targetValue: number | null,
  milestones: MilestoneInput[],
): MilestoneValidationResult {
  const errors: Record<number, string> = {}

  if (milestones.length > MAX_MILESTONES) {
    errors[milestones.length - 1] = `Add up to ${MAX_MILESTONES} milestones.`
  }

  if (kind === 'checklist') {
    return Object.keys(errors).length > 0 ? { valid: false, errors } : { valid: true }
  }

  let previous = startValue
  milestones.forEach((milestone, index) => {
    const value = milestone.targetValue
    if (value === null) {
      errors[index] = 'Enter a value for this milestone.'
      return
    }
    if (value <= previous) {
      errors[index] = previous === startValue ? 'Must be greater than the starting value.' : 'Must be greater than the previous milestone.'
      return
    }
    if (targetValue !== null && value >= targetValue) {
      errors[index] = 'Must be less than the target.'
      return
    }
    previous = value
  })

  return Object.keys(errors).length > 0 ? { valid: false, errors } : { valid: true }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- newGoalValidation.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Add `useProfile` and `useCreateGoal` to `api.ts`**

```ts
// added to src/features/archipelago/api.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { islandPosition } from '../../lib/archipelago'
import type { MilestoneInput } from '../../lib/newGoalValidation'

export interface Profile {
  id: string
  archipelagoSeed: number
}

export function useProfile() {
  const { session } = useSession()
  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, archipelago_seed')
        .eq('id', session!.user.id)
        .single()
      if (error) throw error
      return { id: data.id, archipelagoSeed: data.archipelago_seed }
    },
  })
}

export interface CreateGoalInput {
  title: string
  description: string | null
  biome: Goal['biome']
  kind: Goal['kind']
  unit: string | null
  startValue: number
  targetValue: number | null
  isPublic: boolean
  milestones: MilestoneInput[]
}

export function useCreateGoal() {
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGoalInput): Promise<Goal> => {
      if (!session) throw new Error('Not signed in.')

      // Existing goal count determines this goal's spiral index — see
      // src/lib/archipelago.ts. Read via the already-cached goals query
      // rather than a fresh count query, so this never races a concurrent
      // read differently than what the user is currently looking at.
      const existingGoals = queryClient.getQueryData<Goal[]>(['goals', session.user.id]) ?? []
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('archipelago_seed')
        .eq('id', session.user.id)
        .single()
      if (profileError) throw profileError

      const position = islandPosition(existingGoals.length, profile.archipelago_seed)

      const { data, error } = await supabase.rpc('create_goal_with_milestones', {
        p_title: input.title,
        p_description: input.description,
        p_biome: input.biome,
        p_kind: input.kind,
        p_unit: input.unit,
        p_start_value: input.startValue,
        p_target_value: input.targetValue,
        p_island_x: position.x,
        p_island_z: position.z,
        p_island_rotation: position.rotation,
        p_is_public: input.isPublic,
        p_milestones: input.milestones.map((m) => ({ title: m.title, targetValue: m.targetValue })),
      })
      if (error) throw error
      return toGoal(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
  })
}
```

Read the existing `useGoals` hook in this file first to confirm the exact
query key it uses (`['goals', session.user.id]` is this plan's best guess
from context — match whatever `useGoals` actually uses verbatim, since a
mismatched key means `getQueryData` above silently returns `undefined` and
every new goal's spiral index resets to 0).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0007_create_goal_with_milestones.sql src/lib/database.types.ts src/features/archipelago/api.ts src/lib/newGoalValidation.ts src/lib/newGoalValidation.test.ts
git commit -m "M4: create_goal_with_milestones RPC, useCreateGoal/useProfile hooks, milestone validation"
```

## Task 9: New Goal flow — biome picker and goal-details steps

**Files:**
- Create: `src/features/archipelago/BiomePicker.tsx`
- Create: `src/features/archipelago/NewGoalSheet.tsx` (steps 1-2 only; Task 10 adds step 3 and wires submission)

**Interfaces:**
- Consumes: `@radix-ui/react-dialog` (already a dependency), `BIOME_PALETTES` from `theme.ts`, the six `<XLandmass>` components from Task 4.
- Produces: `<NewGoalSheet open={boolean} onOpenChange={(open: boolean) => void} onCreated={(goal: Goal) => void} />` — Task 10 completes its step-3 body and its submit handler; Task 11 (HomeOverlay wiring, folded into Task 10) mounts it from the "New goal" button.

- [ ] **Step 1: `BiomePicker.tsx` — one shared Canvas, six viewports**

Spec §6.2 step 1: "Six cards, each a live rotating mini-canvas of that
biome — one shared `<Canvas>` with six viewports, not six canvases. No flat
images." R3F doesn't support multiple `<Canvas>`-like viewports natively
without either six real `<Canvas>` elements or one `<Canvas>` with
`gl.setScissor`/`setViewport` per region. Use drei's `<View>` (from
`@react-three/drei`, already a dependency) — it's built exactly for this:
multiple 2D-positioned 3D viewports sharing one WebGL context/canvas.

```tsx
// src/features/archipelago/BiomePicker.tsx
import { Canvas } from '@react-three/fiber'
import { View, Preload } from '@react-three/drei'
import { useRef } from 'react'
import type { Goal } from './api'
import { BIOME_PALETTES } from '../../lib/theme'
import { JungleLandmass } from './models/JungleLandmass'
import { DesertLandmass } from './models/DesertLandmass'
import { TundraLandmass } from './models/TundraLandmass'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { ReefLandmass } from './models/ReefLandmass'
import { HighlandsLandmass } from './models/HighlandsLandmass'

const BIOMES: { key: Goal['biome']; label: string; Landmass: typeof JungleLandmass }[] = [
  { key: 'jungle', label: 'Jungle', Landmass: JungleLandmass },
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
  const trackingDiv = useRef<HTMLDivElement>(null)

  return (
    <div ref={trackingDiv} className="relative grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BIOMES.map(({ key, label, Landmass }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`group relative aspect-square overflow-hidden rounded-lg border transition-colors ${
            value === key ? 'border-lantern' : 'border-stone-light hover:border-mist/40'
          }`}
        >
          <View className="h-full w-full" track={trackingDiv}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 5, 2]} intensity={1} />
            <group rotation-y={key.length}>
              <RotatingLandmass Landmass={Landmass} />
            </group>
          </View>
          <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-ink/70 px-2 py-0.5 font-body text-xs text-mist">
            {label}
          </span>
        </button>
      ))}
      {/* One shared Canvas backs every <View> above — spec §6.2's "one
          shared <Canvas>, not six canvases." It must be positioned to
          cover the same screen region the tracking div occupies; drei's
          View system reads each View's DOM rect and viewport-clips the
          shared canvas per frame, so this <Canvas> can be a simple
          full-parent-fill absolutely-positioned element behind the grid. */}
      <Canvas
        className="pointer-events-none absolute inset-0 -z-10"
        eventSource={trackingDiv}
        gl={{ antialias: true }}
      >
        <View.Port />
      </Canvas>
    </div>
  )
}

function RotatingLandmass({ Landmass }: { Landmass: typeof JungleLandmass }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.3
  })
  return (
    <group ref={ref} scale={0.6}>
      <Landmass />
    </group>
  )
}
```

This is a non-trivial drei API (`<View>`/`<View.Port>`); the implementer
must read drei's actual installed-version docs/type defs for `View` before
writing this (verify `track`/`eventSource` prop names against
`node_modules/@react-three/drei/core/View.d.ts` rather than trusting this
snippet verbatim — it is a correct sketch of the pattern, not a
guaranteed-compiling final version). Add the missing `useFrame`/`THREE`
imports the snippet omitted for brevity.

`BIOME_PALETTES` import above is currently unused in this sketch — either
apply each landmass's `accent` color as a subtle rim-light per card (nice
detail, not required) or remove the unused import; don't leave it dangling.

- [ ] **Step 2: `NewGoalSheet.tsx` — Radix Dialog shell with steps 1-2**

```tsx
// src/features/archipelago/NewGoalSheet.tsx (steps 1-2; Task 10 adds step 3)
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { BiomePicker } from './BiomePicker'
import type { Goal } from './api'

type Step = 1 | 2 | 3

interface NewGoalSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (goal: Goal) => void
}

export function NewGoalSheet({ open, onOpenChange, onCreated }: NewGoalSheetProps) {
  const [step, setStep] = useState<Step>(1)
  const [biome, setBiome] = useState<Goal['biome'] | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Goal['kind']>('numeric')
  const [unit, setUnit] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [startValue, setStartValue] = useState('0')

  function reset() {
    setStep(1)
    setBiome(null)
    setTitle('')
    setKind('numeric')
    setUnit('')
    setTargetValue('')
    setStartValue('0')
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-stone-light bg-stone p-6 text-mist sm:inset-x-auto sm:right-6 sm:top-6 sm:bottom-6 sm:w-[420px] sm:rounded-2xl sm:border">
          <Dialog.Title className="font-display text-xl">New goal</Dialog.Title>
          <StepIndicator current={step} />

          {step === 1 ? (
            <section className="mt-4">
              <p className="font-body text-sm text-mist/70">Pick a biome for this goal's island.</p>
              <div className="mt-3">
                <BiomePicker value={biome} onChange={setBiome} />
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  disabled={!biome}
                  onClick={() => setStep(2)}
                  className="rounded-md bg-lantern px-4 py-2 font-body text-sm font-medium text-ink disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="mt-4 space-y-4">
              <label className="block">
                <span className="font-body text-sm text-mist/70">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                  placeholder="Run 10K"
                />
              </label>
              <fieldset className="flex gap-4">
                <legend className="font-body text-sm text-mist/70">Kind</legend>
                <label className="flex items-center gap-1.5 font-body text-sm">
                  <input type="radio" name="kind" checked={kind === 'numeric'} onChange={() => setKind('numeric')} />
                  Numeric
                </label>
                <label className="flex items-center gap-1.5 font-body text-sm">
                  <input type="radio" name="kind" checked={kind === 'checklist'} onChange={() => setKind('checklist')} />
                  Checklist
                </label>
              </fieldset>
              {kind === 'numeric' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-body text-sm text-mist/70">Target</span>
                    <input
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                      placeholder="10"
                    />
                  </label>
                  <label className="block">
                    <span className="font-body text-sm text-mist/70">Unit</span>
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      list="unit-suggestions"
                      className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                      placeholder="km"
                    />
                    <datalist id="unit-suggestions">
                      <option value="km" />
                      <option value="pages" />
                      <option value="kg" />
                      <option value="reps" />
                      <option value="days" />
                    </datalist>
                  </label>
                  <label className="col-span-2 block">
                    <span className="font-body text-sm text-mist/70">Starting value (optional)</span>
                    <input
                      value={startValue}
                      onChange={(e) => setStartValue(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                    />
                  </label>
                </div>
              ) : null}
              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="font-body text-sm text-mist/70">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!title.trim() || (kind === 'numeric' && !targetValue)}
                  onClick={() => setStep(3)}
                  className="rounded-md bg-lantern px-4 py-2 font-body text-sm font-medium text-ink disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {/* step === 3: added in Task 10 */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StepIndicator({ current }: { current: Step }) {
  // The one place spec §7 permits a 01/02/03-style sequence marker — "the
  // New goal flow, which genuinely is a sequence."
  return (
    <div className="mt-2 flex gap-1.5 font-body text-xs text-mist/50">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n === current ? 'text-lantern' : undefined}>
          {n}
        </span>
      ))}
    </div>
  )
}
```

Numeric parsing (`Number(targetValue)` etc.) and its own validation is
deliberately left to Task 10, which owns the milestones step and the final
submit — this task's Continue-from-step-2 gate is a light presence check
only (non-empty title, a target given for numeric goals), not full
numeric/business validation.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (the `onCreated`/step-3 body Task 10 adds will currently be
unused/unreferenced from step 2's Continue button until Task 10 wires it —
acceptable intermediate state for this task, since `NewGoalSheet` isn't
mounted anywhere yet either).

- [ ] **Step 4: Commit**

```bash
git add src/features/archipelago/BiomePicker.tsx src/features/archipelago/NewGoalSheet.tsx
git commit -m "M4: New Goal flow steps 1-2 (biome picker, goal details)"
```

## Task 10: New Goal flow — milestones step, trail preview, submission, and wiring

**Files:**
- Modify: `src/features/archipelago/NewGoalSheet.tsx` (add step 3)
- Create: `src/features/archipelago/MilestoneBuilder.tsx`
- Modify: `src/features/archipelago/HomeOverlay.tsx` (mount the sheet from "New goal")

**Interfaces:**
- Consumes: `validateMilestones` from Task 8, `useCreateGoal` from Task 8, `buildTrailCurve`/`positionAt` from `src/features/roadmap/curve.ts` (M3), `progressT`/milestone-`t` placement math conceptually from `src/lib/trail.ts` (M1) for the live preview.
- Produces: a fully working New Goal flow, closing the last gap in spec §1's core loop.

- [ ] **Step 1: `MilestoneBuilder.tsx` — milestone list with live trail preview**

Spec §6.2 step 3: "Show a live preview of the trail as they're added — this
is the moment the product sells itself." Reuse `buildTrailCurve` (M3) and
the milestone-`t` placement formula already codified in `src/lib/trail.ts`
(M1: milestone `i` of `n` sits at `t = i / (n + 1)`, evenly spaced — **not**
proportional to value, per CLAUDE.md's trail-maths invariants) to render a
small, non-interactive preview `<Canvas>` showing the curve with a lit dot
per milestone added so far.

```tsx
// src/features/archipelago/MilestoneBuilder.tsx
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { buildTrailCurve, positionAt } from '../roadmap/curve'
import type { Goal } from './api'

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
    if (milestones.length >= 8) return
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
        disabled={milestones.length >= 8}
        className="font-body text-sm text-tide disabled:opacity-40"
      >
        Add milestone
      </button>
    </div>
  )
}

function TrailPreview({ count }: { count: number }) {
  const curve = useMemo(() => buildTrailCurve(2, 1.5, 0), [])
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => positionAt(curve, (i + 1) / (count + 1))),
    [curve, count],
  )

  return (
    <div className="h-28 overflow-hidden rounded-md border border-stone-light bg-ink">
      <Canvas camera={{ position: [3, 2, 3], fov: 40 }} frameloop="demand">
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 2]} />
        {dots.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#e8a24c" />
          </mesh>
        ))}
      </Canvas>
    </div>
  )
}
```

`text-accent-error` above needs a real error-red token — add
`--color-error: #e2483f` (reusing the jungle accent's hot red, which
already reads as "alert" against the cool base palette — don't invent a
seventh unrelated hex) to Task 1's `@theme` block via a follow-up one-line
addition in this task, or inline the hex directly with a comment
explaining the reuse if editing Task 1's file again feels disproportionate
— either is acceptable, but the color must not be a new, undocumented hex.

- [ ] **Step 2: Add step 3 to `NewGoalSheet.tsx` and wire submission**

```tsx
// added inside NewGoalSheet.tsx, replacing the "step === 3: added in Task 10" comment
const [milestones, setMilestones] = useState<MilestoneRow[]>([])
const [submitError, setSubmitError] = useState<string | null>(null)
const createGoal = useCreateGoal()

const parsedMilestones = milestones.map((m) => ({ title: m.title, targetValue: m.targetValue === '' ? null : Number(m.targetValue) }))
const validation = validateMilestones(kind, Number(startValue) || 0, targetValue === '' ? null : Number(targetValue), parsedMilestones)

async function handleSubmit() {
  if (!biome || !validation.valid) return
  setSubmitError(null)
  try {
    const goal = await createGoal.mutateAsync({
      title: title.trim(),
      description: null,
      biome,
      kind,
      unit: kind === 'numeric' ? unit.trim() || null : null,
      startValue: Number(startValue) || 0,
      targetValue: kind === 'numeric' ? Number(targetValue) : null,
      isPublic: false,
      milestones: parsedMilestones,
    })
    onCreated(goal)
    onOpenChange(false)
  } catch (err) {
    setSubmitError(err instanceof Error ? err.message : 'Could not create this goal. Try again.')
  }
}
```

```tsx
{step === 3 ? (
  <section className="mt-4 space-y-4">
    <p className="font-body text-sm text-mist/70">Add up to 8 milestones. Watch the trail take shape.</p>
    <MilestoneBuilder
      kind={kind}
      milestones={milestones}
      errors={validation.valid ? {} : validation.errors}
      onChange={setMilestones}
    />
    {submitError ? <p className="font-body text-sm text-accent-error">{submitError}</p> : null}
    <div className="flex justify-between">
      <button type="button" onClick={() => setStep(2)} className="font-body text-sm text-mist/70">
        Back
      </button>
      <button
        type="button"
        disabled={!validation.valid || createGoal.isPending}
        onClick={handleSubmit}
        className="rounded-md bg-lantern px-4 py-2 font-body text-sm font-medium text-ink disabled:opacity-40"
      >
        {createGoal.isPending ? 'Planting island…' : 'Create goal'}
      </button>
    </div>
  </section>
) : null}
```

Button copy follows spec §7's copy rule — "buttons that name what happens"
— "Create goal" not "Submit", "Planting island…" as the in-flight state
rather than a generic spinner-only treatment, in keeping with the product's
own metaphor.

- [ ] **Step 3: Mount `NewGoalSheet` from `HomeOverlay.tsx`**

Replace the disabled "New goal" button (already re-enabled visually in
Task 7) with a real `onClick` that opens the sheet, track `newGoalOpen`
state, and on `onCreated` navigate to `/g/${goal.id}` — matching spec
§6.2's "closes, and the camera flies to the new island as it rises out of
the water" (the fly-to behavior itself is `CameraRig`'s existing
`focusedGoal`-driven animation from M2, unchanged — navigating to the new
goal's URL is what triggers it, no new camera code needed here).

```tsx
// inside HomeOverlay.tsx
const navigate = useNavigate()
const [newGoalOpen, setNewGoalOpen] = useState(false)

// ...
<button type="button" onClick={() => setNewGoalOpen(true)} className="rounded-md bg-lantern px-3 py-1.5 font-body text-xs font-medium text-ink">
  New goal
</button>
// ...
<NewGoalSheet
  open={newGoalOpen}
  onOpenChange={setNewGoalOpen}
  onCreated={(goal) => navigate(`/g/${goal.id}`)}
/>
```

- [ ] **Step 4: Component test for `validateMilestones` integration (not a full RTL mount — the 3D preview can't run in jsdom)**

The existing `newGoalValidation.test.ts` from Task 8 already covers the
pure logic. No additional test file is required for the 3D-heavy
`NewGoalSheet`/`MilestoneBuilder`/`BiomePicker` components themselves —
per project CLAUDE.md ("Do not try to snapshot-test the 3D scene; test the
pure functions instead," spec §3) — but verify by hand that opening the
sheet, completing all three steps, and submitting actually creates a goal
end to end (Task 11 covers this as part of the full live-testing pass; a
quick manual check here is enough to unblock the task's own commit).

- [ ] **Step 5: Typecheck, build, full test suite**

Run: `npm run typecheck && npm run build && npm test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/archipelago/NewGoalSheet.tsx src/features/archipelago/MilestoneBuilder.tsx src/features/archipelago/HomeOverlay.tsx src/index.css
git commit -m "M4: New Goal flow milestones step, live trail preview, submission"
```

## Task 11: Performance verification and payload/frame report

**Files:** none modified — this task measures and reports; any fix it
motivates gets applied to whichever file the measurement implicates, per
the ruling process below (not pre-specified here, since the fix depends on
what's actually over budget, if anything).

**Interfaces:**
- Consumes: the fully built app from Tasks 1-10.
- Produces: a written report (in the SDD ledger, per this plan's own
  process) with the actual numbers spec §9 requires: "the payload budget
  and frame targets in §8 are met, measured, with the numbers reported
  back."

- [ ] **Step 1: Measure total initial glTF payload**

Run (PowerShell): `Get-ChildItem public/models -Recurse -Filter *.glb | Measure-Object Length -Sum` — report the sum in MB. Budget: under 3 MB compressed for the biomes actually present in a fresh account's default seeded archipelago (not every biome ever built — spec §8: "Preload only the biomes actually present in the user's archipelago").

- [ ] **Step 2: Confirm lazy-loading for biomes not yet present**

Verify (read the code, don't guess) that `useGLTF.preload(...)` calls for
each biome's models are only reached when that biome is actually rendered
(an island of that biome exists) or the biome picker is open — not
eagerly preloaded for all six biomes on initial app load regardless of the
user's archipelago contents. If Task 4/5/9's implementation preloads all
six unconditionally, that's a real finding for this task to fix (likely:
move `useGLTF.preload` calls out of module scope and into a `useEffect`
gated on which biomes are actually visible/picker-open, or accept the
unconditional-preload trade-off explicitly if the total six-biome payload
is already comfortably under budget — measure first, don't assume).

- [ ] **Step 3: Frame rate check**

Using the browser's performance panel (or R3F's own stats if wired — not
required to add one just for this check), observe the archipelago view
with several islands and the island-detail (roadmap) view, each for ~10
seconds of normal interaction (rotate, hover, click). Report the
approximate sustained fps. Desktop target: 60fps. There is no practical
way to measure "30+ on a mid-range Android" from this environment — report
the desktop number honestly, note the Android target is unverified in this
environment, and don't fabricate a number for it.

- [ ] **Step 4: Confirm `frameloop="demand"` and single-live-scene constraints hold**

Grep for every `<Canvas>` in the codebase (`ArchipelagoScene.tsx`,
`BiomePicker.tsx`, `MilestoneBuilder.tsx`'s `TrailPreview`) and confirm:
(a) the island detail view (which is the same `ArchipelagoScene` canvas as
the archipelago, per M2/M3's single-scene architecture — verify this is
still true after Task 5/6/7's changes, not assumed) uses
`frameloop="demand"` when nothing is animating; (b) `BiomePicker`'s and
`MilestoneBuilder`'s canvases are separate, small, `frameloop="demand"` (or
naturally cheap enough not to need it — a 6-viewport rotating preview is
genuinely continuous motion while the sheet is open, so `"always"` is
correct there, not a violation — the constraint is "never render the
archipelago AND the detail view as two live scenes," and the New Goal
sheet's preview canvases are neither of those two).

- [ ] **Step 5: Write the report into the SDD ledger**

Append a "## Performance report" section to this plan's ledger
(`.superpowers/sdd/2026-09-09-cairn-m4-biomes-and-art/progress.md`) with
the actual measured numbers from Steps 1-4, and whether each target was
met. If any target was missed, this task's own commit fixes it (texture
resize, drop a prop count, defer a preload) and re-measures — don't report
a missed target without also fixing it, since fixing it is squarely what
"done when" requires.

- [ ] **Step 6: Commit** (only if Step 5 required a fix; otherwise this task's outcome is the ledger entry alone, no commit)

```bash
git add -A
git commit -m "M4: performance verification and payload/frame fixes"
```
