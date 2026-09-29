# Cairn Desert Island (hand-built in Blender) — Plan

**Goal:** Give desert goals one hand-built island, made in Blender the same way as the jungle (`scripts/blender/jungle_island.py`, `public/models/JungleIsland.glb`), and switch desert from its legacy glTF components to the terraced system.

**Look (user's choice, 2026-09-29: "mix of both"):** sand dunes on the lower levels, layered red-rock mesa cliffs above, a palm-fringed oasis, and stone ruins at the summit.

**Read first:** `CLAUDE.md`, the jungle plan's Tasks 15–20 (`2026-09-23-cairn-terraced-islands-jungle.md`), and `scripts/blender/jungle_island.py` (the whole pipeline lives there).

## How the jungle works (reuse this)

- One fixed layout seed per hand-built biome (`src/lib/island/fixedIslands.ts`: `JUNGLE_ISLAND_SEED`, `hasHandBuiltIsland`, `islandLayoutSeed`). Trail, cairns, camera (`focusPose`) and the pointer/occlusion hull all come from that layout, so the Blender mesh must keep terrace tops at the level heights and the path surface at the trail heights.
- `npm run island:export` writes the layout (outlines per level, trail samples + lateral terrace probes, features, props, palette) to `assets-raw/jungle-layout.json` via `scripts/blender/island.export.test.ts` (env-gated vitest).
- The Blender script builds: boolean-unioned terrace prisms (cliff levels get noise-displaced rings), path cut (difference) and supports (union) from swept boxes per trail run, cave cut, top tessellation, vertex colouring, props into a `Sink` (lit), smooth foliage into `Sink.soft`, unlit water/falls/flames, then bakes AO + sun shadow into vertex colours (Cycles) and exports three meshes: `Lit` (toon), `Soft` (Lambert), `Unlit`.
- `npm run island:pack` compresses with gltf-transform (meshopt; join/simplify/flatten/instance/palette off) into `public/models/`.
- App: `TerracedIsland` renders `models/JungleIsland.tsx` for hand-built biomes; the cache builds only the hull for them.
- Blender here: `pip download bpy==4.5.0` works through the proxy (download.blender.org is blocked). Install into a scratch venv (Python 3.11), import `bpy` before `bmesh`.
- Previews: `npm run dev`, then `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run render:island -- desert 1 focus` (also `orbit-back`, `phone`, `hero dist=0.42`, `overview`).

## Tasks

1. **Generalise the hand-built path.**
   - `fixedIslands.ts`: a table `HAND_BUILT: Partial<Record<Biome, { seed: number; url: string }>>`; `hasHandBuiltIsland` / `islandLayoutSeed` read it.
   - Rename `models/JungleIsland.tsx` → a generic `HandBuiltIsland({ url, ... })` (keep node names `Lit`/`Soft`/`Unlit`), preload only for biomes present.
   - `isTerraced(biome)` true for desert; desert card in `BiomePicker`; `Island.tsx` routes desert through `TerracedIslandNode`.
   - `island:export` / `island:pack` take `<biome> <seed>` (default jungle 1); outputs `assets-raw/<biome>-layout.json`, `public/models/<Biome>Island.glb`.
   - Keep jungle output unchanged; re-render jungle focus to confirm.
2. **Pick the desert seed.** Desert currently reuses the jungle terrain recipe (plan deviation 11). Scan seeds (throwaway vitest like the jungle scan) for a layout with a wide lawn area (room for dunes and an oasis) and a camp in view; render the stub to check.
3. **Split the Blender script.** Move shared code (layout loading, helpers, terrain/path/cave, tessellation, placement `Ground`, water rings, cascade, bake, export) into `scripts/blender/island_core.py`; `jungle_island.py` keeps only jungle dressing; new `desert_island.py`.
4. **Desert terrain.**
   - Lower levels (beach, lawn) read as sand: lawn tops in dune tones with ripple bands (vertex colour by `sin` of a warped coordinate), low dune mounds as soft blobs away from the path, sand-coloured walls.
   - Mesa cliffs (tier, summit): strong horizontal strata (alternating cliff/cliffLit/cliffShade/rim bands by height, slight per-band in/out offset in `cliff_offset`), wind-eroded notches, a cracked dark base; no moss.
   - Path: pale packed sand with stone treads; path-edge stones.
5. **Desert dressing.**
   - Oasis on the lawn: unlit pool with gradient edge, date palms (reuse `palm` with desert colours, clustered), reeds, a ring of green grass, a few flowers.
   - Cacti (saguaro with arms, prickly-pear pads, barrel cactus), dry shrubs, desert grass tufts, boulders, a bleached skull/bones, driftwood on the beach.
   - Camp: a canvas awning/bedouin tent in desert colours + campfire (reuse `campfire`).
   - Summit ruins: broken columns, one standing arch, fallen blocks (keep clear of the trail end and the summit cairn).
   - No waterfalls (optionally a thin spring from the mesa into the oasis via `cascade`).
6. **Bake, pack, wire, verify.** Bake, `island:pack`, add to `ASSETS.md`, renders (focus/orbit-back/phone/overview), `npm run typecheck && npm test && npm run build`, commit, push to the PR branch.

## Budgets

Same as the jungle: model ≤ ~1.2 MB (3 MB total glTF budget across biomes), ≤ ~65k triangles, 3 draw calls; tall props must not hide the trail or camp from the default camera (`Ground.blocks_trail`).
