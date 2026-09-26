# Cairn: Terraced Islands (design spec)

**Date:** 2026-09-23
**Status:** Approved by the user 2026-09-23 (direction, Q1 camera, Q2 fixed yaw with the focus-orbit condition in §5.6.1, Q7 CLAUDE.md update). Nothing in this spec is built yet.
**Supersedes:** `2026-09-15-cairn-visual-redesign.md` §3 (the hero-plus-torus composition recipe) and the prop/marker parts of §4. §1 (Soft Lagoon palette values), §2 (type and shape language), §5 (prototype-first process) and the procedural-geometry principle of §4 stay in force. The first implementation task adds a "Superseded by 2026-09-23-cairn-terraced-islands-design.md" note to those sections so the two docs don't disagree.
**Unchanged:** `src/lib/trail.ts` and `src/lib/trail.test.ts`, the golden-angle placement in `src/lib/archipelago.ts`, the goal and milestone data model, and every react-query hook.

---

## 0. Decision

Three throwaway prototypes were built and judged under three lenses (visual fidelity, hikeability/trail integration, engineering):

| Spike | Visual | Hikeability | Engineering | Verdict |
|---|---|---|---|---|
| A: procedural extruded polar terraces | **7.5** | 8 | 7 | Best look: offset tiers, waterfall shelf, cave, lumpy canopy backdrop, strongest cliff treatment. Its trail only avoids cliffs because of tuned clamp heuristics, and one seed has already regressed. |
| B: Kenney modular cliff tiles | 4.5 | 6 | 4 | Rejected. Grid-aligned toy look, cubic trees, relies on sourced glTF terrain, and the ramp search can silently cut the trail short. |
| C: SDF terrace field with a carved path | 6.5 | **8** | **8** | Best engine. The path is planned first and carved into the terrain, so it cannot float or clip on any seed. Handles any number of levels. Too slow as built, and reads a bit like a wedding cake. |

**Direction: a hybrid, "C's engine wearing A's art."**

- **Engine (from C):** a pure, seeded plan made of nested signed-distance levels. The trail is planned before any mesh exists. Height along the trail is slope-limited automatically, and the terrain mesh is carved around the final trail with cut and fill retaining walls. Walkability therefore holds by construction for every `goal.id`, which is the property the product depends on.
- **Art (from A):** strongly offset tiers that drift back and to one side, fluted leaning cliffs with protruding slabs and rim/main/base colour bands, a side shelf with a waterfall, a cave mouth, vines, fluted pillars, water rocks with foam rings, lumpy icosphere-cluster canopy trees as a backdrop, a camp as the "tiny person" scale cue, and `groundHeightAt` as the single height oracle.
- **Planning rules (from B):** ramp sites are chosen by a scoring search (visibility from the camera, available ledge width, distance from the previous ramp top so the trail switchbacks). Arc length is made exact with a high `arcLengthDivisions`.
- **Also from C:** clean lawn rims instead of A's sawtooth skirt, a mid-ledge walking line, fluted pillars, a moss-mound hero rock, the detached sand spit, and foam and shallows in an unlit mesh.

Everything is procedural, including props and the trail marker. That completes §4's "no external asset dependency" goal instead of reversing it (see §7).

Target renders (session scratchpad, not committed; regenerate with §10 once the real component exists):

| Render | Shows |
|---|---|
| `A-final-hero-1` | The look |
| `C-final-side-1` | Carved ramp with retaining walls |
| `C-final-top-1` | Organic plan and sand spit |
| `A-final-hero-2` | Level of detail |

---

## 1. Goal

### 1.1 The user's words

> "it does not look detailed like this. it should look like a full island a small person can hike up to so the trail looks good."

They rejected two earlier attempts: a faceted icosahedron rock on a sand torus, and Quaternius rocks and trees inside a sand torus. The reference is a stylised Forest-Island-style terraced island with three grass plateaus, sheer warm-brown cliffs, a sand skirt with a white foam rim, a waterfall, palms at the edges and a dark canopy mass behind the summit.

### 1.2 Success criteria

These gate the Jungle sign-off. The user approves from real screenshots of the running app, per 2026-09-15 §5.

1. **Reads as a whole island.** From the focus camera you see one continuous landmass: beach, open lawn, at least two higher plateaus and sheer cliffs. It is never a rock in a puddle.
2. **Reads as hikeable.** A visible path leaves the beach facing the camera, crosses the lawn, climbs ramps you can see, walks each ledge and ends on the summit. Human-scale cues (tent, cairns, signpost, stump) make the cliffs read as several storeys tall.
3. **The trail looks good.** Milestone cairns spread across different levels, the progress line sits on the path, and nothing floats, clips into a cliff or is hidden behind a tall prop.
4. **Detailed.** Cliff fluting and banding, a waterfall or an equivalent feature, vines, pillars, water rocks, lumpy canopies, ground cover and a foam rim.
5. **Correct by construction.** Automated tests over at least 300 seeds per biome prove the trail invariants (§9). `trail.ts` semantics are unchanged: milestone *n* of *N* sits at arc-length `t = n/(N+1)`.
6. **Within budget.** Frame rate, triangle count, draw calls and build time stay inside §8. No glTF payload is added.

---

## 2. Art direction

### 2.1 Reference breakdown

W is the island's full width including the beach.

| Aspect | Reference | Cairn rule |
|---|---|---|
| Tiers | Beach, lowland lawn, mid plateau, summit, plus a side shelf over the water | Massif pattern: beach, lawn, mid, summit, plus an optional shelf. Other patterns in §6. |
| Heights | Summit about 0.34W. Each cliff about 0.15–0.17W. Tier tops flat (slope under 3°) | Jungle summit 2.10 on W ≈ 6.2, which is 0.34W. Cliffs about 0.95 each. Caps exactly flat except the knoll dome. |
| Offset | Each tier covers about 55–60% of the one below and drifts toward the back-left, leaving wide front ledges and near-merged back cliffs | Upper-blob radius ratio of about 0.74, then about 0.65 of that. Drift away from the camera and to one side, with the side mirrored per seed. Ledge margin depends on facing: about 0.9 at the front, about 0.28 at the back. |
| Outlines | Blobs of 3–5 merged round lobes. Short straight runs at close range. Notches and a detached sand spit | Polar harmonics plus lobes plus low-frequency noise. Piecewise-linear cliff flutes give short straight facets. The spit lobe stays within the footprint budget. |
| Cliffs | Warm red-brown, vertical facets with ±8% brightness, darker lower 30–40%, light rim lip, a few protruding slabs, pillars, vines, a cave | All of these, per §2.4. |
| Grass | Mid green leaning teal, soft light and dark blotches, darkening at cliff feet and under shadow | Vertex-colour blotches, AO at cliff feet, baked sun shadow from higher tiers. |
| Beach/foam | Cream sand skirt 0.02–0.07W, widest at the front. Solid white foam band about 0.012W that also rings every water rock | Beach width 0.16 at the back to 0.50 at the front. Foam band 0.10, unlit white. Shallow halo in `#8FD4D9`. |
| Props | Palms at edges leaning out (0.10–0.13W). Dark round canopies behind the summit (0.06–0.10W). Bushes at cliff feet. Flat star ferns on open lawn. Summit stump. Mossy hero rock. Water rocks. Waterfall and pool. Tiny camp marker | All of these, procedural (§3.8). Scale caps in §2.3. A sightline rule keeps tall props from covering the trail. |
| Shading | Flat colour, no textures, no specular. Key light upper-left. The summit casts a soft shadow on the mid tier | Toon (or Lambert, see §14 Q3) with vertex colours, `Canvas flat` (no tone mapping), key light upper-left of the focus camera, sun shadow baked into vertex colours. |
| Camera | About 40° elevation, island about 95% of frame width | See §5.6, which needs approval. The current camera gives about 31° and about 40% of frame width. |

**Deliberately different from the reference:**
- Water uses Soft Lagoon `#6BC2C9`, not the reference's saturated cyan `#1EA8C3`. The palette is locked, so contrast has to come from warm cliffs, white foam and the sand skirt.
- Terrain greens are slightly lighter and more pastel.
- Cairn-branded markers: stacked-stone milestone cairns and a coral trail pennant.

### 2.2 The two rejected prototypes: what not to repeat

- Grey textured PBR rocks, photo-leaf-card trees, or any textured asset. They mix two styles.
- A single rock with no flat walkable ground, or a torus that leaves water between beach and land.
- Props at or above 0.35W, which made the whole island read as a pebble.
- A trail that doesn't follow the terrain. The current cone spiral runs from y ≈ −0.13 to 0.23, underwater and inside the rock.

### 2.3 Scale and proportion (world units; water plane at y = −0.05)

| Thing | Size |
|---|---|
| Beach footprint radius (outer sand edge) | ≤ 3.05. Foam ≤ 3.15. Shallow halo ≤ 3.45. The halo cap keeps neighbours apart at the worst-case 7.13 centre spacing (§5.7). |
| Summit ground height | Per biome, ≤ 2.20 (jungle 2.10) |
| Tallest prop top (any level) | ≤ 3.0 world y. Summit props ≤ 0.85 tall. |
| Palms | 0.55–0.80 tall, always within 0.12–0.40 of a cap's outer edge, leaning outward ≤ 14° |
| Canopy trees | 0.45–0.70 tall, back-facing only (facing ≤ 0.1) |
| Bushes | 0.15–0.25 |
| Fern rosettes / flowers | 0.12–0.20 across / 0.10–0.14 tall |
| Tent (scale cue) | 0.20 tall. Campfire 0.10 across. |
| Carved path | 0.34 wide (half-width 0.17) |
| Milestone cairn | 0.20 tall, base radius 0.085 |
| Head pennant | Pole 0.34, flag 0.12 × 0.08 |

### 2.4 Surface treatments

**Caps (flat tier tops).**
- Base colour per level, blended with two octaves of low-frequency value noise toward `capLight`/`capDark`.
- AO darkening at the foot of the next cliff up: multiply by `0.74 + 0.26·min(1, d/0.45)`.
- Baked sun shadow: march each cap vertex toward the sun over the height grid (§3.5). Multiply by 0.80 if occluded, with a 0.15-wide soft edge from 3 jittered rays.
- A lighter `capLight` rim within 0.05 of the outer edge.

**Cliffs.**
- Walls are exactly vertical in plan, with a lean: bottom vertices are pushed outward along the SDF gradient by `lean·wallHeight` (0.06 per unit height).
- Flutes come from a piecewise-linear radial perturbation of each tier's SDF (5.5 bins per radian, depth 0.035). Flat shading turns them into planar facets. Per-bin brightness is ±12%.
- Slabs: 12% of bins get an extra outward push of 0.06 on the lower 60% of the wall. The wall emitter steps the wall at that height.
- Four colour bands, bottom to top:
  1. `cliffBase`, the lower 26–40% (varies per bin)
  2. `cliff` main (lit/shade variants per bin)
  3. `cliffRim`, 0.06 tall (absolute)
  4. `lip`, 0.045 tall, the grass lip
- The lawn-to-beach step (about 0.12) uses a `sandWall` lower half with a `lip` upper half. The beach-to-foam step is `sandWall`.

**Beach, foam, halo** (level caps in the same field; foam and halo go to the unlit mesh).
- Beach top at y = 0.04, with a `sandWall` step down to foam.
- Foam: y = −0.036, `#FFFFFF`, outer 0.03 fading to `#DDF3F4`.
- Shallow halo: y = −0.042, `#8FD4D9` fading to `#6BC2C9` at its outer edge. The water becomes opaque (§5.5), so the fade matches exactly.
- Minimum beach width is 0.12 everywhere, so grass never touches water. Grass `#6FBF84` and water `#6BC2C9` are too close in value to meet directly.

**Carved path.**
- The corridor (half-width 0.17) is clipped out of the terrace mesh and rebuilt as a flat-across strip at the path's own y.
- Cut walls rise into the upper tier and fill walls drop to the lower one. Both use cliff bands.
- Tread colour is `path`, with a 0.025 `pathEdge` border.
- On sections steeper than rise/run 0.15, vertex-colour **timber tread bands** (`tread`, 0.035 wide, every 0.15 of arc) span the full strip width, and a 0.03-high curb runs along the fill edge.
- There are no rail-like cleats (A's cleats read as a roller-coaster) and no geometric stairs (they would fight the smooth trail curve).

**Water features** (unlit, `toneMapped: false`).
- The waterfall is a ribbon following the fall samples down each wall: `fall` base with 3–5 `fallStreak` vertical streaks, broken at each ledge, with a splash and foam ring where it lands.
- The spring is a notch in the source rim. There is no disc; C's disc read as a "white plate".
- The pool is `pool` with a 0.03 foam ring.
- Volcano uses lava colours through the same builder.

**Decor** (merged into the lit terrain geometry).
- **Pillars:** fluted 6–7-sided prisms with flat tops, 50% grass-capped.
- **Slumped boulders** at cliff feet.
- **Cave mouth:** an arch decal 0.30 × 0.24, inset against a camera-facing wall at least 0.6 tall, coloured `crevice`.
- **Vines:** 0.03-wide strips 0.20–0.45 long with 3–5 diamond leaves each, hanging from lips. These replace C's flat "sticker" rectangles.
- **Moss-mound hero rock** on the front lawn.

### 2.5 Lighting and shading

- `<Canvas flat>` means no tone mapping, so authored hexes render as specified. The spikes' ACES tone mapping washed the palette out.
- **Lights:**
  - `hemisphereLight(sky #EAF6F6, ground #6BC2C9, 0.70)`
  - `directionalLight` from `SUN_DIR = normalize(−0.20, 0.80, 0.55)`, placed at `SUN_DIR·20`, intensity 1.15
  - The ambient light is removed.
- This is a key light from the upper left of the fixed +X+Z focus camera. Camera-facing cliffs are moderately lit, left-facing cliffs are bright, right-facing cliffs are in shade, as in the reference.
- Tuning happens in the render loop (§10).
- **Materials:**
  - Lit terrain and props share a single `MeshToonMaterial({ vertexColors: true, gradientMap })`. The 3-step gradient `[120, 190, 255]` moves out of `JungleLandmass.tsx` into `terrain/materials.ts`.
  - Unlit meshes share a single `MeshBasicMaterial({ vertexColors: true, toneMapped: false })`.
  - Every island uses those two materials. There are no per-island materials.
- **No real-time shadow maps.** Baked AO plus the baked sun shadow carry the look on Android. Whether to add a shadow map to the focused island only is open question Q9.

### 2.6 Palette

**Shared tokens (all biomes, locked or derived from Soft Lagoon §1):**

| Token | Hex | Use |
|---|---|---|
| water | `#6BC2C9` | Water disc (now opaque, unlit) |
| shallow | `#8FD4D9` | Halo inner, lagoon pool |
| foam / foamEdge | `#FFFFFF` / `#DDF3F4` | Foam rim, rock foam, splash |
| sand / sandWall | `#EFCB8E` / `#DDB677` | Every beach (locked shoreline tone) |
| trailDone | `#3A7D77` | Completed progress ribbon: the deep-teal "route line" on the path |
| trailTodo | `#3A7D77` at 0.30 opacity | Remaining ribbon |
| cairnPending / cairnNext / cairnDone | `#CFC8BA` / `#F6A9A0` / `#5FBFA8` | Milestone cairn top stone |
| pennant flag / pole | `#F6A9A0` / `#FFF4DA` | Head marker |
| sun gold `#F2C879` | none | Never used in 3D. Reserved for CTAs (§1). |

**Per-biome terrain palettes** (`TerrainPalette` in `src/lib/island/biomes.ts`):

| Slot | Jungle | Volcano | Desert | Tundra | Reef | Highlands |
|---|---|---|---|---|---|---|
| lawn | `#78C487` | `#93A78C` | `#E8C893` | `#E8F1F3` | `#F4DDAE` | `#A6BC92` |
| cap | `#6FBF84` | `#A4948A` | `#E3C088` | `#F4FAFB` | `#F4DDAE` | `#9DB58A` |
| capLight | `#86CE93` | `#B3A59B` | `#EBCD9C` | `#FFFFFF` | `#F8E7C4` | `#AFC49C` |
| capDark | `#579F6F` | `#8E7F76` | `#D6AF74` | `#D3E3E6` | `#E8CC96` | `#879F76` |
| lip | `#5E9F6E` | `#86A382` | `#C9A56A` | `#C9DCDE` | `#9ED6B4` | `#7F9A6C` |
| cliff | `#A8735A` | `#7A6259` | `#D39A6A` | `#8F9EA3` | `#E2B596` | `#A39C8E` |
| cliffLit | `#B27C61` | `#86706A` | `#DDA878` | `#A2AFB3` | `#EAC2A5` | `#B3AC9E` |
| cliffShade | `#9A6750` | `#6C574F` | `#C08858` | `#7F8D92` | `#D3A284` | `#8E877A` |
| cliffRim | `#C08A6C` | `#947D73` | `#E6B488` | `#B7C3C6` | `#F0CFB5` | `#C7BFAE` |
| cliffBase | `#7E5443` | `#5C4A42` | `#A8704A` | `#66747A` | `#B98A70` | `#6F695F` |
| crevice | `#5A3B30` | `#3F322D` | `#7E4F33` | `#4B565B` | `#8E6552` | `#524D46` |
| path / pathEdge | `#D9C08A` / `#CDAE78` | `#C9B49A` / `#B39E86` | `#F0DDB4` / `#D9BE8C` | `#C8B9A6` / `#B3A38F` | `#FFF1D6` / `#E6CFA2` | `#D8CCB2` / `#C2B599` |
| tread | `#B98452` | `#5C4A42` | `#B98452` | `#8B7362` | `#C9957A` | `#8B7362` |
| pillar / cap | `#9C6A52` / `#B8836A` | `#5C4A42` / `#7A6259` | `#CC9160` / `#E3C088` | `#8F9EA3` / `#F4FAFB` | `#E2B596` / `#F4DDAE` | `#8B8FA0` / `#C7BFAE` |
| pool | `#BEE8EA` | `#F2A25C` (ember) | none | none | `#8FD4D9` (lagoon) | none |
| fall / streak | `#BEE8EA` / `#FFFFFF` | `#F2A25C` / `#F7C08A` | none | none | none | none |

**Foliage slots:**

| Biome | Colours |
|---|---|
| Jungle | palm trunk `#B98452` (ring `#A6743F`), frond `#4E8F6E` (tip `#7BC98C`); canopy `#3F7F86`, shade `#336B73`, top `#5A9AA0`, trunk `#8B6B4A`; bush `#5FA877`; fern `#4E8F6E`; vine `#4E8F6E`, leaf `#7BC98C`; flower and mushroom `#F6A9A0`, centre and stem `#FFF4DA`; stump `#B98452`, inner `#D9B07A`, moss `#7BC98C`; hero rock `#A8735A`, moss `#9FD27A`; tent `#F6A9A0`, door `#5A3B30`; campfire stones `#CFC8BA`, ember `#F2A25C` |
| Volcano | ash tree `#5C4A42` with canopy `#6F8F6A`; fern `#6F8F6A`; boulder `#6C574F` |
| Desert | palm crown `#8FA95C`, bark `#B98452` (§1 tokens); cactus `#7FA36A`; scrub `#A7B86E`; bloom `#F6A9A0` |
| Tundra | pine `#5E8C7E`, shade `#4F7A6E`; bare tree bark `#8B7362`, canopy `#C9DCDE` (§1 tokens); snowy bush `#A9C4C0`; ice floes `#F4FAFB` |
| Reef | frond `#5FA877`; coral `#F6A9A0` plus `#F4B98C`; anemone and seagrass `#5FBFA8` / `#9ED6B4` |
| Highlands | heather `#A98FB0` / `#8B8FA0` (§1 tokens); pine `#5E7F6E`; bush `#7F9A6C` |

§1 lists `#F2C879` as a reef coral tone, which conflicts with §1's own CTA-gold rule. This spec substitutes `#F4B98C`; see Q4.

---

## 3. Architecture

### 3.1 Module map and data flow

```
goal.id ──hashGoalId──► seed ─┐
goal.biome ──────────────────►├─► buildIslandLayout(biome, seed)            src/lib/island/  (pure; no React/three)
                              │      ├─ shapes: nested SDF levels + features
                              │      ├─ trail planner → trail.waypoints (ground)
                              │      ├─ height oracle: groundHeightAt, walkableRun, heightGrid
                              │      └─ props / decor placements
                              │                │ IslandLayout (one object)
          ┌───────────────────┴──────┬─────────┴──────────────┬───────────────────────┐
          ▼                          ▼                        ▼                       ▼
 terrain/terraceMesh.ts    roadmap/curve.ts            terrain/propGeometry.ts   lib/island/anchors.ts
 (three BufferGeometry:    buildTrailCurve(waypoints)  (procedural prop meshes,  (label/card/hover y,
  lit + unlit + hull)      + ribbons / grounded offset  one per kind+biome)       focus pose; pure)
          │                          │                        │                       │
          └──── TerracedIsland.tsx ◄─┘ RoadmapTrail/TrailView  └── PropPart <Instances>  Island.tsx, CameraRig
```

Everything 3D reads one `IslandLayout`. None of the 3D code holds its own island-size constants. That rules out the class of bug that produced today's trail-inside-the-rock.

### 3.2 Files

**`src/lib/island/`: pure, no React, no three, unit-tested.**

| File | Contents |
|---|---|
| `types.ts` | All exported types (§3.6) |
| `random.ts` | `createStream(seed, salt)` and `valueNoise2(seed, salt)`, both built on `hash01` from `lib/archipelago.ts`. No second hash algorithm; the spikes' `mulberry32`/`hash2` are not ported. |
| `shapes.ts` | `PolarBlob` SDF, flutes, nesting chain, `LevelField` (sd per level, continuous class field, `levelAt`, `terraceY`) |
| `biomes.ts` | `BIOME_TERRAIN: Record<Biome, BiomeTerrainConfig>`, the three `PATTERN_PRESETS`, palettes |
| `trailPlan.ts` | Ramp-site scoring, walks, corner smoothing, slope limiter, leg balance, `SegmentHash` spatial index |
| `query.ts` | `groundHeightAt`, `pathProject`, `walkableRun`, `heightGrid` bake, sun-occlusion helper |
| `scatter.ts` | Prop rules to placements (rejection sampling on the stream), sightline rule, decor placement |
| `plan.ts` | `buildIslandLayout(biome, seed)`: orchestrates, validates invariants, deterministic retry |
| `orientation.ts` | `ISLAND_YAW`, `SUN_DIR`, `sunDirLocal()`, `CAMERA_DIR_LOCAL` |
| `anchors.ts` | `islandAnchors(layout)` → `{ labelY, cardY, hoverLift, focusTargetY }`, and `focusPose()` (§5.6) |
| `*.test.ts` | §9 |

**`src/features/archipelago/terrain/`: three.js, no React.**

| File | Contents |
|---|---|
| `terraceMesh.ts` | Slicing mesher, corridor carve, walls and bands, caps with AO and sun shadow, features (shelf, crater plug, pool, waterfall, pillars, boulders, cave, vines, water rocks), hull proxy. Returns `{ lit, unlit, hull }`. |
| `propGeometry.ts` | `getPropGeometry(kind, biome)`: procedural, vertex-coloured, cached per kind and biome |
| `materials.ts` | The shared toon gradient, `terrainLitMaterial`, `terrainUnlitMaterial` |
| `islandCache.ts` | `getIslandLayout`, `getIslandBuild`, LRU with ref-counted dispose, the idle-time build scheduler, and the `useIslandBuild` hook (the only React-aware export; it lives here so the cache and hook share one module) |
| `*.test.ts` | Geometry tests (§9.3) |

**React:** `src/features/archipelago/TerracedIsland.tsx` (new), plus changes to `Island.tsx`, `ArchipelagoScene.tsx`, `Water.tsx`, `BiomePicker.tsx`, `MilestoneBuilder.tsx`, `roadmap/RoadmapTrail.tsx` (split into a data container and a `TrailView`), `roadmap/curve.ts`, `roadmap/TrailPennant.tsx` (new, replacing `models/TrailMarker.tsx`), `SceneEnvironment.tsx` (new, lights and water shared by the app and the dev harness), and `dev/DevIslandView.tsx` (new, DEV-only).

### 3.3 Randomness and determinism

- `seed = hashGoalId(goal.id)` from `lib/theme.ts`, an integer in `[0, 1e6)`. The landmass, props and trail all use this. `RoadmapTrail`'s private `seedFromId` is deleted.
- Every random decision draws from a **salted sub-stream**: `createStream(seed, salt)` returns `next()`, implemented as `hash01(seed, counter++, salt)`. Fixed salts:

  | Salt | Subsystem |
  |---|---|
  | 1 | outlines |
  | 2 | drift/side |
  | 3 | ramps |
  | 4 | decor |
  | 5 | waterfall |
  | 100 + kindIndex | each prop kind |
  | 200 + level | cliff flutes |
  | 300 | noise |

  With separate streams, retuning one prop kind's count never reshuffles the terrain, and adding a kind never moves the trail.
- `Math.random` is banned in `src/lib/island`, and a test enforces it (§9.1).
- `LAYOUT_VERSION = 1` is exported and included in cache keys. Changing generator output bumps it. "Same island on every visit" holds within a version. That is acceptable before launch; after launch, a version bump is a deliberate, announced visual change.
- `hash01` is a sine hash. JS engines can differ in the last ulp of `Math.sin`. That can only flip a rejection-sampling decision in vanishingly rare cases, and it is accepted and documented rather than worked around.

### 3.4 Level model

**Local frame.**
- Island origin is at the water-plane centre, with y up and water at y = −0.05.
- Angles are `atan2(z, x)`.
- `layout.front` is the trail-start direction, `π/2 + jitter` where jitter is ±0.25 rad, so local +Z is the camera side (§5.3).
- `drift` is `front + π − side·(0.55..0.90)`, where `side = ±1` per seed. It points back and to one side.

**Levels** are an ordered chain, from `pattern.levels`:
```
shallow(−0.042) ⊃ foam(−0.036) ⊃ beach(0.04) ⊃ lawn(lawnY) ⊃ tier_1 … ⊃ summit
```
- Each level L ≥ beach has a `PolarBlob`: centre, radius, harmonics n = 2..5, lobes, and flutes on cliff levels.
- Raw signed distances are nested by construction:
  - `sd[lawn] = sd[beach] − beachWidth(θ)`
  - `sd[L+1] = min(blobSd[L+1] + wobble, sd[L] − ledgeMargin[L](θ))`
  - `ledgeMargin = back + (front − back)·facing(θ)² + lean·wallHeight`
  - `facing(θ) = ½ + ½cos(θ − front)`
- Around each chosen **ramp window** (§3.5 step 2), the margin is raised to at least the ramp's needs: `rampLedge = 2·pathHalfWidth + 0.30`. Ramp sites are therefore chosen before the upper outline is final, which is A's trick. That makes "every ramp has room" a guarantee, where C only had it by luck.
- `shallow` = `beach + 0.40` and `foam` = `beach + 0.10`, both clamped so the halo radius stays ≤ 3.45.
- **Footprint normalisation:** after building the beach blob, sample 180 angles. If the maximum radius exceeds 3.05, scale every blob's radius, centre and lobe uniformly by `3.05 / max` before building the upper tiers.
- **Class field** for the mesher: `field = Σ_L clamp(sd[L]/0.11 + 0.5, 0, 1)`. Level L's region is `field ∈ [L+0.5, L+1.5)`. `levelAt(x,z)` is the count of positive `sd` minus 1. `terraceY` is `levelTopY(level, x, z)`: constant `level.y`, except the knoll summit dome adds `domeHeight·smoothstep(0, domeRadius, sd[summit])`.
- **Features** sit outside the chain, are unioned by height, are meshed separately, and are all known to `groundHeightAt`:

  | Feature | Definition |
  |---|---|
  | **Shelf** (jungle) | A polar blob fully inside `mid` (`min(shelfSd, sd[mid] − 0.08)`), touching the summit's side opposite the final ramp, with top `shelf.y`. It is extruded as its own prism from `shelf.y` down to `mid.y`. The trail never enters it. |
  | **Crater** (volcano) | The summit SDF minus a disc of radius `craterRadius`. Inside the hole, a plug disc cap at `plugY` carries the ember pool (unlit). `groundHeightAt` inside the hole is `plugY`. |
  | **Pool** | A disc on the lawn at the waterfall's landing (tide/ember) or on the lawn front-side (lagoon), at least 0.30 from the corridor. |
  | **Waterfall** | Spring angles are searched on the source rim (summit or shelf): 90 candidates scored by facing ≈ 0.75, drops ≥ 1, and distance ≥ 0.40 from the corridor. The walk down the terraces stops before it reaches the corridor. |

### 3.5 Trail planner

The planner is generic over N transitions, where N = number of levels above the lawn: jungle 2, highlands 3.

1. **Trailhead.**
   - Angle `front − side·0.30`.
   - Point = 55% of the way across the beach, measured along the ray from the island centre.
   - Then a straight run to the first ledge line.
2. **Ramp sites.** For each transition k (level L → L+1), candidates are 48 angles around blob L+1. Score:
   - `+2.0·facing(θ)`: visible from the focus camera
   - `+1.0·min(1, ledgeAvail/rampLedge)`
   - `−1.5·max(0, 1 − |Δθ to previous ramp top| / 1.1)`: forces a switchback
   - `−3·[waterfall or shelf within 0.5]`
   - a tie-break jitter of 0.1 from salt 3

   Ramp direction alternates: ramp k runs `(−1)^k · side`. The trail therefore zigzags across the camera-facing half, as in the reference.
3. **Walks.** Flat runs follow the ledge line of blob L+1:
   - `ledgeLine(θ) = footRadius(θ) + min(0.42, ledgeWidth(θ)/2)`, the mid-ledge rule from C.
   - `footRadius` includes cliff lean.
   - The arc angle is chosen so the next ramp starts at its scored site.
4. **Ramps** are tangential arcs whose radius runs from `ledgeLine` to `rimRadius − 0.40` inside the upper tier. They cross the contour at their midpoint. Arc length is `rise/tan(26°) + 0.2`.
5. **Summit walk.**
   - Plateau: ends at `summitCentre + 0.35·frontDir`.
   - Dome: ends at the dome peak, beside the signature tree.
   - Crater: ends on the rim at the point facing the camera.

   The walk is interpolated in the summit's polar frame (angle plus fraction of rim radius), so it cannot cut across a concave bay. That was A's seed-3 bug.
6. **Smoothing.**
   - Densify to 0.04 spacing, then run 40 Laplacian passes on xz only.
   - Recompute the arc length `s`.
   - The corridor carve is derived from this *final* smoothed path, so smoothing can never open a gap between trail and terrain.
7. **Heights.**
   - `raw_i = max(beach.y, terraceY(p_i))`, made monotonic (`raw_i = max(raw_i, raw_{i−1})`).
   - Forward and backward slope limiters with gradient `2·tan(26°)`, averaged, then 3 smoothing passes. This is C's scheme, which gives about 25° mean and about 31° peak.
   - The lawn lip (about 0.12) gets its own mini ramp from the same limiter.
8. **Leg balance.** Target arc-length shares:

   | Section | Share |
   |---|---|
   | Trailhead through the lawn walk | 0.22–0.40 |
   | All ramps | ≥ 0.25 |
   | Summit walk | 0.06–0.18 |

   If a share is outside its window, the planner adjusts the walk arcs (start angle, end fraction) and re-runs steps 3–7, at most 3 iterations. With N = 3–5 milestones at `n/(N+1)`, cairns then land on different levels.
9. **Validation and deterministic retry.** `validateLayout(layout)` checks:
   - start is on the beach
   - end is on the summit (the top level, or the crater rim)
   - monotonic y
   - peak slope ≤ tan 32°
   - every waypoint satisfies `|groundHeightAt − y| ≤ 1e-3`
   - footprint and halo bounds
   - leg shares

   On failure, `buildIslandLayout` retries with `variant = 1..3`, using `seed' = floor(hash01(seed, variant, 97)·1e6)`. It then falls back to `BIOME_TERRAIN[biome].previewSeed`, which is known good. In development it `console.warn`s. It never throws into render and never truncates the trail (B's failure mode).

### 3.6 Types

```ts
// src/lib/island/types.ts
import type { Goal } from '../../features/archipelago/api' // type-only, same precedent as lib/theme.ts
export type Biome = Goal['biome']
export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Hex = `#${string}`

export type CompositionPattern = 'massif' | 'knoll' | 'shelves'
export type SummitShape = 'plateau' | 'dome' | 'crater'
export type LevelRole = 'shallow' | 'foam' | 'beach' | 'lawn' | 'tier' | 'summit'

export interface Level {
  readonly index: number
  readonly role: LevelRole
  readonly y: number                       // flat cap height (dome adds on top, see levelTopY)
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
  readonly y: number                       // GROUND height (no clearance)
  readonly z: number
  readonly s: number                       // polyline arc length from the trailhead
  readonly level: number                   // level whose cap this stands on (ramps: the lower level)
  readonly ramp: number                    // index into trail.ramps, or -1
}

export interface RampSpan {
  readonly fromLevel: number
  readonly toLevel: number
  readonly s0: number
  readonly s1: number
  readonly theta: number                   // site angle on the upper blob
  readonly dir: 1 | -1
}

export interface IslandTrail {
  readonly samples: readonly TrailSample[] // dense, ≤0.04 spacing, trailhead (t=0) → summit (t=1)
  readonly waypoints: readonly Vec3[]      // = samples as [x, y, z]; the input to buildTrailCurve
  readonly ramps: readonly RampSpan[]
  readonly halfWidth: number               // carved corridor half-width (0.17)
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
  readonly y: number                       // from groundHeightAt
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

export interface HeightGrid {                // baked once per layout, 0.1 cell, for sun-shadow marching
  readonly origin: Vec2
  readonly cell: number
  readonly size: number
  readonly heights: Float32Array
}

export interface IslandLayout {
  readonly version: number                 // LAYOUT_VERSION
  readonly biome: Biome
  readonly seed: number                    // effective seed (after any retry)
  readonly pattern: CompositionPattern
  readonly front: number
  readonly side: 1 | -1
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[] // index-aligned with levels (shallow/foam derive from beach)
  readonly footprintRadius: number         // max beach radius, ≤ 3.05
  readonly haloRadius: number              // ≤ 3.45
  readonly summit: Vec3                    // trail end, ground
  readonly summitTopY: number              // highest walkable ground (dome peak / crater rim / plateau)
  readonly trail: IslandTrail
  readonly features: IslandFeatures
  readonly props: readonly PropPlacement[]
  readonly heightGrid: HeightGrid
  // pure queries (closures over the data above)
  readonly sdAt: (x: number, z: number) => Float64Array   // per-level signed distance (+ inside)
  readonly levelAt: (x: number, z: number) => number
  readonly terraceY: (x: number, z: number) => number      // chain + dome, ignoring corridor and features
  readonly groundHeightAt: (x: number, z: number) => number // THE oracle: corridor ∪ features ∪ terrace
  readonly pathProject: (x: number, z: number) => { d: number; y: number; s: number }
  readonly walkableRun: (x: number, z: number, dirX: number, dirZ: number, refY: number, maxDist: number) => number
}

/** The slice of a layout that curve.ts needs; keeps roadmap code off the rest of the type. */
export type GroundQuery = Pick<IslandLayout, 'groundHeightAt' | 'walkableRun'>

export const LAYOUT_VERSION = 1
export declare function buildIslandLayout(biome: Biome, seed: number): IslandLayout
export declare function validateLayout(layout: IslandLayout): string[] // [] = valid
export declare function serializeLayout(layout: IslandLayout): unknown  // data only, for determinism tests
```

```ts
// src/lib/island/biomes.ts
export interface TierRecipe {
  readonly y: number
  readonly radiusRatio: number             // blob radius / beach blob radius
  readonly drift: number                   // centre offset from the tier below along `drift`
  readonly ledge: { readonly back: number; readonly front: number }
  readonly harmonicAmp: number
}
export interface PropRule {
  readonly kind: PropKind
  readonly count: number                   // target; tests assert ≥70% placed for kinds marked `key`
  readonly key?: boolean
  readonly levels: readonly ('beach' | 'lawn' | 'tier' | 'summit' | 'water')[]
  readonly spacing: number
  readonly pathClear: number               // extra clearance beyond trail.halfWidth
  readonly edge?: readonly [number, number]      // distance to own cap's outer edge
  readonly cliffFoot?: readonly [number, number] // distance to the next cliff up
  readonly facing?: 'front' | 'back' | 'any'
  readonly scale: readonly [number, number]
  readonly height: number                  // unit-scale height, for the sightline rule + caps
  readonly tilt?: number
  readonly overview: boolean               // rendered in the archipelago view (false = focus only)
}
export interface BiomeTerrainConfig {
  readonly pattern: CompositionPattern
  readonly beach: { readonly radius: readonly [number, number]; readonly width: { readonly back: number; readonly front: number }; readonly harmonicAmp: number; readonly spit: boolean }
  readonly lawnY: number
  readonly tiers: readonly TierRecipe[]    // above the lawn, bottom → top; last is the summit
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
  readonly palette: TerrainPalette         // slots in §2.6
  readonly previewSeed: number             // BiomePicker + retry fallback; chosen in the render loop
}
export declare const BIOME_TERRAIN: Record<Biome, BiomeTerrainConfig>
```

### 3.7 Height oracle and queries (`query.ts`)

- **`SegmentHash`:** a uniform 0.25-cell grid of trail segments. `pathProject(x, z)` is O(1): it returns the distance to the centreline, the interpolated path y and `s`. This replaces C's linear scan, which dominated its roughly 230 ms build time.
- **`groundHeightAt(x, z)`:**
  1. If `pathProject.d ≤ halfWidth`, return the path y (the carved strip is flat across).
  2. Otherwise return `max(terraceY, shelf top if inside shelf, plugY if inside crater, pool y if inside pool)`.
  3. Anywhere with `levelAt < beach` returns −0.05 (water).
- **`walkableRun(x, z, dir, refY, max)`** marches in 0.02 steps. It stops when `|groundHeightAt − refY| > 0.03` or when it reaches water, and returns the distance.
- **Ray exits for the planner** use a coarse 0.08 step followed by 14 bisection steps, replacing C's fixed 0.01 march.
- **`heightGrid`** is `terraceY ∪ features`, sampled once at 0.1 cells (about 70 × 70). Sun-shadow marching runs against it (about 5 ms per island, where the analytic SDF would take about 700 ms).
- The sun direction in island-local space is `sunDirLocal()` from `orientation.ts`. It is a constant, because island yaw is fixed (§5.3).

### 3.8 Terrain mesh builder (`terraceMesh.ts`)

`buildTerrain(layout, detail: 'overview' | 'focus' | 'preview')` returns `{ lit, unlit, hull }`.

- **Grid cell:** focus 0.07, overview 0.12, preview 0.15, over `[−3.5, 3.5]²`.
- **Slicing (C's algorithm):**
  - Sample `sdAt` once per grid vertex and triangulate the grid.
  - Clip each triangle at every class threshold `L + 0.5`. Each piece becomes a flat top at `levelTopY` (the dome uses its per-vertex height). Each crossing edge emits a wall from the lower level's height to the upper level's.
  - Apply lean and slab offsets to wall-bottom vertices along `∇sd`.
  - Assign band colours per §2.4.
  - The `shallow` and `foam` tops go to `unlit`; everything else goes to `lit`.
- **Corridor carve:**
  - Clip triangles where `pathProject.d < halfWidth`.
  - Rebuild the strip from `trail.samples`. Cross-sections are 5 vertices at a fixed y; the ends get round caps.
  - Fill the gaps with cut walls up to the terrace or fill walls down to it, using cliff bands for tier-height differences and `lip` for anything under 0.05.
  - Add tread bands and a fill-side curb on sections steeper than 0.15.
- **Features:**
  - The shelf prism and crater plug come from the same slicing routine run on the feature's own SDF.
  - Pool, foam rings and waterfall ribbons go to `unlit`.
  - Pillars, boulders, cave decal and vines are merged into `lit`.
- **Geometry format:** non-indexed, `position` + `color` + `normal`. Face normals come from `computeVertexNormals()` on non-indexed geometry, which gives flat shading. Toon has no `flatShading` flag.
- **`hull`:** a low-poly occluder and pointer proxy of about 600 triangles. It is each level's outline (48 segments) extruded as a prism, plus the shelf. Used as the island's click and hover target and for `<Html occlude>` (§5.2).
- Pure function, no React. Geometry tests are in §9.3.

### 3.9 Props

**Procedural library** (`propGeometry.ts`). Each kind is one vertex-coloured `BufferGeometry`, so there is one draw call per kind. That replaces the old PropPart-per-sub-mesh pattern. Unit height is defined by `PropRule.height`.

| Kind | Construction | Tris |
|---|---|---|
| `palm` | Curved trunk of 7 hexagonal frustums along a quadratic Bézier, with alternating `trunk`/`ring` colours. 6 drooping fronds, each a V-folded strip of 4 segments bending downward, `frond` to `tip` gradient. | ~220 |
| `canopyTree` | A's cluster: 4–5 `IcosahedronGeometry(r, 1)` blobs (one variant of 3 per instance via `rotY` bucket), top blob `canopyTop`, trunk `trunk` | ~420 |
| `pine` | 3 stacked 7-sided cones, trunk | ~70 |
| `bareTree` / `ashTree` | Trunk + 3 branches + 2–3 small icospheres | ~120 |
| `cactus` | Rounded column + 2 arms (6-sided capsules) | ~150 |
| `bush` | 2–3 merged `Icosahedron(·, 0/1)` | ~120 |
| `fernRosette` | 5 flat leaf quads in a star, slightly curled. Replaces the spiky Kenney ferns. | 20 |
| `grassTuft` / `heather` / `coralPuff` / `anemone` | Small primitive clusters | 20–80 |
| `flower` / `mushroom` | Stem + petal disc / stem + domed cap with dots | 40–60 |
| `stump` / `log` | Cylinder with inner-ring top and moss cap / capped cylinder | 60 |
| `heroRock` | Squashed jittered icosphere + moss cap (C's mound) | 160 |
| `boulder` / `waterRock` / `iceFloe` | Jittered icosphere / hex prism / flat disc (foam ring is terrain-unlit) | 40–80 |
| `lily` | Notched disc | 12 |
| `tent` / `campfire` / `signpost` / `summitCairn` | Triangular prism with door / stone ring with ember / post + board / 5 stacked flattened icospheres | 20–150 |

**Placement (`scatter.ts`):**
- C's rule-based rejection sampling, drawing from the prop kind's salted stream, with at most `120·count` tries per kind.
- **Order:** landmarks first (signpost, summit cairn, camp, summit stump or signature tree, hero rock), then pillars, then tall props, then ground cover.
- **Rules:**
  - Level filter.
  - `edge` / `cliffFoot` distance windows, measured with `sdAt`.
  - `facing` relative to `front`.
  - Path clearance: `pathProject.d ≥ halfWidth + pathClear`.
  - Spacing, checked against a spatial hash of taken discs.
  - y is always `groundHeightAt`.
- **Sightline rule** (new): a prop with scaled height `h > 0.30` is rejected if some trail sample `q` satisfies all of:
  - `0 < dot(p − q, CAMERA_DIR_LOCAL) < 1.43·h + 0.3`
  - `|lateral| < r + 0.15`
  - `q.y < p.y + h`

  The factor 1.43 is `cot 35°`. The rule keeps palms and canopies from hiding the trail from the focus camera.
- **Scale caps (§2.3)** are enforced in `scatter.ts` and asserted in tests.

**Rendering:**
- `TerracedIsland` renders one `PropPart` (drei `<Instances>`, as today) per non-empty kind, with the geometry from `getPropGeometry(kind, biome)` and the shared lit material.
- `PropPart` switches to the new `PropPlacement` type (position, rotation from `rotY` and tilts, and scale).
- In the overview, kinds with `overview: false` (ground cover) are skipped.

### 3.10 Build cache and scheduler (`islandCache.ts`)

- `getIslandLayout(biome, seed)` is synchronous and memoised in an LRU of 48 entries, keyed `v${LAYOUT_VERSION}:${biome}:${seed}`. `RoadmapTrail`, `Island`, `BiomePicker` and `MilestoneBuilder` all read through it, so the layout is built once.
- `getIslandBuild(biome, seed, detail)` is memoised with an LRU of 24. It is ref-counted, and `dispose()` runs on eviction only when the ref count is zero.
- `useIslandBuild(biome, seed, detail, priority)` returns `IslandBuild | null`. Builds are queued, and the queue is drained one build per `requestIdleCallback` slot (falling back to `setTimeout(16)`). The focused island goes to the front of the queue.
- When focus changes, the `'focus'` build is scheduled while the 1.2 s camera flight runs. The overview mesh stays visible until the focus mesh is ready, then swaps.
- A Web Worker is out of scope for now. Layouts are closures and would have to be rebuilt on the main thread anyway. It becomes the next step only if Android profiling shows frame stalls longer than 50 ms (Q10).

---

## 4. Trail integration

### 4.1 `src/features/roadmap/curve.ts`

```ts
import { CatmullRomCurve3, Vector3, BufferGeometry } from 'three'
import type { Curve } from 'three'
import type { GroundQuery, Vec3 } from '../../lib/island/types'

export const TRAIL_CLEARANCE = 0.02      // curve rides this far above the carved path
const RESAMPLE_SPACING = 0.12

/** Build the 3D trail from the layout's ground waypoints (trailhead t=0 → summit t=1).
 *  Resamples the polyline every RESAMPLE_SPACING, lifts by `clearance`, and builds a
 *  centripetal Catmull-Rom (no overshoot at flat→ramp corners). Sets
 *  arcLengthDivisions = max(2000, points × 8) and calls updateArcLengths(), so
 *  getPointAt(n/(N+1)) is genuinely even by walking distance. */
export function buildTrailCurve(waypoints: readonly Vec3[], clearance = TRAIL_CLEARANCE): CatmullRomCurve3

export function positionAt(curve: Curve<Vector3>, t: number): Vector3              // unchanged semantics
export function tangentAt(curve: Curve<Vector3>, t: number): Vector3               // unchanged semantics
export function perpendicularOffset(curve: Curve<Vector3>, t: number, side: 1 | -1, distance: number): Vector3 // unchanged

/** Where a side-of-trail marker stands: perpendicularOffset clamped to the walkable run on
 *  that side (minus the marker radius); flips to the other side if <0.08 room; y snapped to
 *  ground. Always returns a point on walkable ground. */
export function groundedOffset(
  curve: Curve<Vector3>, ground: GroundQuery, t: number, side: 1 | -1, distance: number, radius: number,
): { position: Vector3; side: 1 | -1 }

/** Flat ribbon over [t0, t1] of the curve: one cross-section per ~0.03 of arc, horizontal side
 *  vectors, every vertex y = groundHeightAt + clearance. Used for completed/remaining progress. */
export function buildTrailRibbon(curve: Curve<Vector3>, ground: GroundQuery, t0: number, t1: number, halfWidth: number): BufferGeometry
```

- `CONTROL_POINT_COUNT` and `SPIRAL_TURNS` are deleted. The cone spiral is gone.
- The parameter type of `positionAt`, `tangentAt` and `perpendicularOffset` widens from `CatmullRomCurve3` to `Curve<Vector3>`, and their behaviour is unchanged.
- Ramps are at most about 31°, well away from vertical, so `perpendicularOffset`'s cross product with world-up can't degenerate. A test pins this.
- All 3D trail positions still come from `positionAt`. The ribbon, `groundedOffset` and the marker animation are all built on `getPointAt`, and no other file does trail maths.

### 4.2 `RoadmapTrail.tsx`

- **Split:**
  - `RoadmapTrail({ goal })` keeps the hooks (`useMilestones`, `useProgressEntries`), reads `layout = getIslandLayout(goal.biome, hashGoalId(goal.id))`, and renders `<TrailView layout goal milestones entries />`.
  - `TrailView` is presentational, so the dev harness can render it with fixture data.
- **Deleted:** `ISLAND_BASE_RADIUS`, `ISLAND_HEIGHT`, `seedFromId`, `subCurve`, both `tubeGeometry` meshes, the `TrailMarker` import.
- **Curve:** `useMemo(() => buildTrailCurve(layout.trail.waypoints), [layout])`.
- **Progress line:** two ribbon meshes from `buildTrailRibbon`.

  | Segment | Range | Half-width | Material |
  |---|---|---|---|
  | Completed | `[0, head]` | 0.055 | `trailDone`, opaque |
  | Remaining | `[head, 1]` | 0.040 | `trailTodo` at 0.30 opacity, `depthWrite: false` |

  Both ribbons use `polygonOffset` −1/−1 against the strip. The carved path is part of the terrain, so it is always visible, including in the overview.
- **Milestone nodes:** `<MilestoneCairn>` at `positionAt(curve, milestoneTs(N)[i])`, with y snapped to `groundHeightAt`.
  - 3 stacked stones in `cairnPending`, with the top stone recoloured to `cairnNext` or `cairnDone`.
  - An invisible sphere of radius 0.16 is the click target.
  - The "next" node pulses its top stone at scale `1 ± 0.15`, and respects reduced motion. Q8 covers how this interacts with the demand frameloop.
  - The Html card sits at y + 0.35 and `distanceFactor` stays 8.
- **Summit:** `summitCairn` is placed by the layout at `trail.samples[last]`, independent of the milestone count. It is the visual t = 1 destination.
- **Entries:** `groundedOffset(curve, layout, t, entrySide(index), ENTRY_OFFSET_DISTANCE = 0.25, ENTRY_RADIUS = 0.05)`.
  - On flat runs the ledge rule leaves at least 0.25 of room on both sides.
  - On ramps the offset clamps to the strip, or flips side if there's no room there.
  - The sphere colour is `#FFF4DA`.
- **Head marker:** `<TrailPennant>`, a procedural pole and flag.
  - `const [{ t }] = useSpring({ t: head, config: { duration: 900 } })`.
  - In `useFrame`, set the group position from `positionAt(curve, t.get())` minus the clearance, and call `invalidate()` while `t.isAnimating`.
  - The marker walks up the ramps instead of cutting through cliffs in a straight line.
- **Entry fly-in:** a spring on `u ∈ [0, 1]`.
  - Position = `positionAt(curve, lerp(tHead, tEntry, u))`, plus the grounded lateral offset scaled by `smoothstep(0.7, 1, u)`.
  - Only new entries fly in, as today.
- **Colours:** move to the tokens in §2.6. `BASE_TOKENS.lantern`, `stoneLight` and `mist` are no longer used in 3D.

### 4.3 `MilestoneBuilder.tsx` (create-goal preview)

- `const layout = getIslandLayout('jungle', BIOME_TERRAIN.jungle.previewSeed)`.
- `curve = buildTrailCurve(layout.trail.waypoints)`.
- Dots at `positionAt(curve, (i+1)/(count+1))`, with the ribbon drawn at 0.3 opacity so the dots read as being on a path.
- Camera `[5.2, 4.4, 5.2]` looking at `[0, 0.9, 0]`, fov 40. `frameloop="demand"` stays.
- `PREVIEW_BASE_RADIUS`, `PREVIEW_HEIGHT` and `PREVIEW_SEED` are deleted.
- Rendering the island itself in this 7 rem strip is out of scope. The dot spacing is the point of the preview.

---

## 5. Scene integration and world-size budget

### 5.1 `Island.tsx`

- **Deleted:** `LANDMASS_COMPONENTS`, `PROPS_COMPONENTS`, `PROP_COUNT_BY_BIOME`, `ISLAND_SCALE_BY_BIOME`, `HOVER_LIFT_BY_BIOME`, `LABEL_Y_BY_BIOME`, `CARD_Y_BY_BIOME`, and the long derivation comment.
- **Rendering:**
  - `const seed = hashGoalId(goal.id)`
  - `const build = useIslandBuild(goal.biome, seed, focused ? 'focus' : 'overview', focused ? 'high' : 'normal')`
  - Renders `null` until the first build lands. The label mounts with the island.
- **Tree:** the outer group is `position=[islandX, 0, islandZ]`, `rotation=[0, ISLAND_YAW, 0]`. Inside it, the hover-lift group contains `<TerracedIsland build={build} biome={goal.biome} detail={…} />`.
- **Anchors** from `islandAnchors(build.layout)`:

  | Anchor | Value | Jungle |
  |---|---|---|
  | `hoverLift` | `0.15·summitTopY` | 0.32 |
  | `labelY` | `summitTopY + tallestSummitPropTop + 0.25`, clamped ≤ `summitTopY + 1.0` | ≈ 3.05 |
  | `cardY` | `labelY + 0.45` | |

- **Pointer events** attach to the `hull` mesh (`visible={false}`; §5.2). The lit and unlit meshes get `raycast={() => null}`.

### 5.2 `<Html occlude>` cost

- drei's `occlude` raycasts the whole scene every frame for every label. Against about 20k-triangle terrain meshes on 10 islands, that is millions of triangle tests per frame.
- Labels switch to `occlude={hullRefs}`, the array of island hull meshes, about 600 triangles each, provided by a small context in `ArchipelagoScene`.
- A dev check must confirm that R3F and drei raycast a `visible={false}` mesh. If they don't, use `material.colorWrite = false` with `depthWrite = false` instead.

### 5.3 Orientation (approved; Q2)

- The focus camera always *arrives* from world +X+Z. Instead of rotating the camera to the island, **terraced islands render at a fixed yaw**: `ISLAND_YAW = π/4`, which maps layout-local +Z (the trail-start side) to world +X+Z.
- **Approval condition (user, 2026-09-23):** the fixed yaw is only acceptable if the viewer can orbit to see the island's other side at will. That is a hard requirement, specified in §5.6.1.
- Variety comes from `front` jitter (±0.25 rad), the mirrored `side`, and the outlines.
- `goal.islandRotation` is no longer read by rendering. The column and `islandPosition()` stay untouched, and no migration is needed.
- `ArchipelagoScene`'s trail sibling group uses the same `ISLAND_YAW`.
- `SUN_DIR` and `CAMERA_DIR_LOCAL` in `orientation.ts` are derived from this one constant, so the baked shadows always match the real light.

### 5.4 `ArchipelagoScene.tsx`

- `<Canvas camera={{ fov: 50 }} flat frameloop={focusedGoal ? 'demand' : 'always'}>`. The demand frameloop on the detail view is the CLAUDE.md rule.
  - `CameraRig` calls `invalidate()` during flights.
  - The springs call it while animating.
  - `Island`'s hover lerp calls it while it hasn't converged.
- `<SceneEnvironment />` holds the lights from §2.5 and `<Water />`. It is shared with the dev harness, so the two can't drift apart.
- It provides a hull-ref context for label occlusion.

### 5.5 `Water.tsx` (bug fix and palette)

- **Bug:** `rotation.y += …` on a disc already rotated −π/2 about X, in XYZ Euler order, tilts the sea over time. It reaches about 0.4 rad after 20 s and roughly 90° after about 80 s in the live app. All three spikes hit this.
- **Fix:** spin via `rotation.z`, which is the disc's own normal and maps to world Y. Or drop the spin; a uniform disc shows no rotation anyway.
- **Material:** `meshBasicMaterial color="#6BC2C9"`. It is opaque, with no opacity pulse, and uses `polygonOffset` (factor 1, units 1) so the foam and halo at −0.036/−0.042 never z-fight with it.
- Opaque water also removes the transparent-sorting problem and makes the halo's fade to `#6BC2C9` exact.
- The radius stays 60.

### 5.6 `CameraRig.tsx` (approved; Q1)

- This spec's baseline works with **today's** camera unchanged. The focus pose is at a true distance of 9.93, true elevation 30.7°, looking at y = 0.
  - Summit ≈ 2.1 plus props at about 2.9: NDC-y ≈ +0.62. Label about +0.70.
  - Nearest beach about −0.50.
  - The island fills about 40% of a 16:9 frame's width, and about 95% of a portrait phone's width.
  - It's hikeable and in frame, but small compared with the reference.
- **Approved** (user, 2026-09-23):
  - `focusPose(layout, { aspect, fovDeg: 50, insetRightPx, viewportPx, orbit })` in `lib/island/anchors.ts`, pure and tested. `orbit` is the viewer's focus-orbit angle from §5.6.1 (0 = default).
  - The default (arrival) azimuth stays world +X+Z.
  - True elevation 38°, fixing today's `cos(elevation)`-applied-to-both-axes bug.
  - `lookAt = (0, 0.40·summitTopY, 0) − 0.12·footprintRadius·frontWorld`, slightly behind centre like the reference.
  - Distance is found by binary search so that 24 points of the bounding cylinder (r = 3.15, h = summitTopY + 0.8) land within ±0.88 NDC on both axes. It is clamped to [7, 17]. On desktop this comes to about 9 and fills about 75% of width; on a portrait phone about 15.
  - On viewports ≥ 640 px the lookAt shifts left by half the `RoadmapPanel` width (w-72) in world units at that distance, so the panel doesn't cover the front-right beach. The shift is along the camera's own screen-left vector, so it stays correct at any orbit angle.
- CameraRig replaces `ISLAND_APPROACH_DISTANCE`/`ELEVATION` with `focusPose(getIslandLayout(…), …)`. The fly-to easing is unchanged.

#### 5.6.1 Focus orbit (required by the Q2 approval)

Today, dragging only orbits the overview camera; the focused camera is locked at its approach pose. That must change:

- **Drag to orbit.** While a goal is focused and no fly transition is running, a horizontal drag rotates the camera around the island's vertical axis through its focus lookAt, using the existing `DRAG_SENSITIVITY` and the existing drag-vs-click threshold and click suppression. Full 360° is allowed, so the back of every island can be seen. Elevation and distance stay as `focusPose` computes them.
- **Separate state.** The focus orbit angle is its own ref, not the overview `azimuth`. Orbiting a focused island never changes where the overview camera returns to, and the overview auto-rotate rule is unchanged.
- **Reset.** Every new focus (entering focus, or switching focused goal) starts at orbit 0, the trailhead-facing default. Leaving focus flies back to the overview as today.
- **Demand frameloop.** Each drag move calls `invalidate()`. There is no inertia, so nothing animates after the pointer is released.
- **Touch.** It works with a one-finger drag on phones (pointer events already cover touch). `touch-action: none` on the canvas prevents the page from scrolling during the drag.
- **Discoverability.** Out of scope for this spec beyond the drag itself. No new UI chrome.
- **What stays tied to orbit 0.** The prop sightline rule (§3.9) and the baked shading assume the default view. From the back, props may cover parts of the trail, which is acceptable because the default view always returns on the next focus.
- **Tests.** `focusPose` with `orbit ≠ 0` keeps the island inside the frame (the §9.1 item 15 check at orbit 0, π/2, π and 3π/2). The dev route gets a `orbit=<radians>` query parameter, and the sign-off matrix adds a `back` render at orbit π.

### 5.7 World-size budget

| Quantity | Budget | Why |
|---|---|---|
| Beach footprint radius | ≤ 3.05 | Worst-case minimum centre spacing is 9.78 at 10 goals, 8.24 at 20 and 7.13 at 50 (archipelago research) |
| Foam / halo radius | ≤ 3.15 / ≤ 3.45 | 2 × 3.45 = 6.90 < 7.13, so neighbours' opaque halos never overlap or z-fight |
| Summit ground | ≤ 2.20 | Current focus camera: summit and label stay within NDC 0.75 |
| Highest prop top | ≤ 3.0 | Same |
| Label y | ≤ summitTopY + 1.0 | Label stays in frame at focus |
| Water disc | Radius 60, unchanged | Covers about 55 islands, as today |
| `lib/archipelago.ts` `BASE_RADIUS = 8` | Unchanged | Positions are stored per goal. Out of scope (§6 of 2026-09-15). |

`archipelago.test.ts`'s `distance > 4` assertion is unaffected. It is looser than the real margin.

### 5.8 `BiomePicker.tsx`

- `RotatingLandmass` renders `<TerracedIsland biome={key} build={useIslandBuild(key, BIOME_TERRAIN[key].previewSeed, 'preview', 'normal')} />` at `scale={0.36}`. A 3.15 radius becomes 1.13, which fits the View's default camera (z = 5, fov 75).
- The lights move to `SceneEnvironment`-style tones: hemisphere plus the key light. The per-biome rim `pointLight` is removed, since it fights the baked shading.
- The preview seeds are the prettiest seed per biome, chosen in the render loop and recorded in `biomes.ts`.

---

## 6. Per-biome parameterisation and the three composition patterns

2026-09-15 §3's approved **biome → pattern mapping is kept**. Each pattern is reinterpreted as a terrace profile:

| Pattern (was) | Terraced profile | Biomes |
|---|---|---|
| **Massif** (Rock & Tide Pool) | Beach, lawn, mid, summit. Two tall cliffs (about 0.9–1.2). Strong back drift. A fall from the summit (or shelf) into a pool at the cliff foot on the lawn. Cave, pillars, vines. | Jungle, Volcano |
| **Knoll** (Palm Knoll) | Beach (wide), lawn, mesa, domed summit. Cliffs about 0.7 and 0.65, plus a dome of 0.30. **One signature tree on the dome** where the trail ends. Sparser props. | Desert, Tundra |
| **Shelves** (Reef Garden) | Beach (wide), lawn, then 2–3 broad low shelves with short cliffs (about 0.4). Radius ratio about 0.78, gentle drift. The trail zigzags across the front. Dense "garden" ground cover. | Reef, Highlands |

**Levels and shape parameters** (y is the cap height; ledge is back/front; r is the radius ratio to the beach blob):

| | Jungle | Volcano | Desert | Tundra | Reef | Highlands |
|---|---|---|---|---|---|---|
| Pattern | massif | massif | knoll | knoll | shelves | shelves |
| Beach radius | 2.45–2.65 | 2.40–2.60 | 2.50–2.70 | 2.45–2.65 | 2.60–2.80 | 2.45–2.65 |
| Beach width back/front | 0.16 / 0.50 | 0.16 / 0.40 | 0.25 / 0.70 | 0.18 / 0.50 | 0.30 / 0.80 | 0.16 / 0.45 |
| Lawn y | 0.16 | 0.14 | 0.14 | 0.18 | 0.12 | 0.16 |
| Tier 1 (y, r, drift, ledge) | 1.10, 0.74, 0.62, 0.28/0.90 | 1.00, 0.70, 0.55, 0.28/0.85 | 0.85, 0.70, 0.45, 0.30/1.00 | 0.90, 0.70, 0.45, 0.30/1.00 | 0.52, 0.78, 0.35, 0.30/0.80 | 0.56, 0.80, 0.30, 0.28/0.75 |
| Tier 2 | 2.10, 0.64, 0.50, 0.30/0.85 (summit) | 2.20, 0.58, 0.40, 0.30/0.80 (summit) | 1.50, 0.58, 0.35, 0.30/0.90 (summit) | 1.55, 0.58, 0.35, 0.30/0.90 (summit) | 0.95, 0.70, 0.30, 0.30/0.75 (summit) | 0.96, 0.72, 0.30, 0.28/0.70 |
| Tier 3 | none | none | none | none | none | 1.36, 0.66, 0.25, 0.28/0.65 (summit) |
| Summit shape | plateau | crater r 0.38, plug 1.95 | dome 0.30 / r 0.7 | dome 0.30 / r 0.7 | plateau | plateau |
| Ramps (count) | 2 | 2 | 2 | 2 | 2 | 3 |
| Shelf | y 1.60, r 0.55 | none | none | none | none | none |
| Fall / pool | water / tide | lava / ember | none / none | none / none | none / lagoon | none / none |
| Cave / pillars / vines / water rocks | yes / 4 / 8 / 5 | yes / 6 basalt / 0 / 5 | no / 4 hoodoos / 0 / 3 | no / 2 / 0 / 4 floes | no / 0 / 0 / 6 coral heads | no / 5 standing stones (summit ring) / 0 / 4 |
| Cliff bins/rad, flute depth, slab %, lean | 5.5, 0.035, 12, 0.06 | 7.0 (basalt), 0.045, 18, 0.03 | 4.0, 0.030, 20, 0.08 | 5.5, 0.030, 10, 0.05 | 4.0, 0.025, 8, 0.04 | 6.0, 0.030, 14, 0.05 |
| Camp | yes | yes | yes | yes | yes | yes |

**Prop recipes (target counts):**

| Biome | Props |
|---|---|
| Jungle | palm 6 (edges), canopyTree 16 (back), bush 14 (cliff feet and edges), fernRosette 12, flower 8, mushroom 3, grassTuft 10, stump 1 (summit), heroRock 1 (front lawn), log 1, lily 3, tent + campfire, signpost, summitCairn |
| Volcano | ashTree 6 (back), boulder 10, fernRosette 6 (moss), grassTuft 6, heroRock 0, tent + campfire, signpost, summitCairn on the rim |
| Desert | palm 3 (edges) + 1 signature palm on the dome, cactus 8, bush 8 (scrub), flower 4, boulder 6, tent + campfire, signpost, summitCairn |
| Tundra | pine 12 (back and edges), bareTree 1 (signature, dome), boulder 8 (snow-capped), bush 6, iceFloe 4, tent + campfire, signpost, summitCairn |
| Reef | palm 5, coralPuff 14 (caps and shallows), anemone 8, fernRosette 10 (seagrass), waterRock 6 (coral heads), tent + campfire, signpost, summitCairn |
| Highlands | pine 4 (back), heather 18, bush 6, boulder 10, standing-stone ring (pillars) on the summit, tent + campfire, signpost, summitCairn |

Only Jungle's parameters have been validated by prototype. The other five tables are starting values, tuned in the render loop at Phase 5 (§11) and signed off by the user.

---

## 7. Assets

**Decision: no sourced models.** Terrain, props, water features, the trail pennant and the cairns are all procedural. This completes 2026-09-15 §4 rather than reversing it:
- Terrain has to derive from the layout anyway.
- The procedural canopy clusters were judged the best canopy match in any spike.
- The Kenney ferns and grass were judged spiky and busy.
- Runtime recolouring by material name (and fixing Kenney's `metallicFactor: 1`) would be permanent busywork.

Initial glTF payload drops from 497,836 B to **0**.

**ASSETS.md:**
- Every existing row gets a Notes suffix: `Retired 2026-09-2x: replaced by procedural terraced islands (docs/superpowers/specs/2026-09-23-cairn-terraced-islands-design.md)`.
- A header line is added: "No third-party 3D assets currently ship. Rows below are history."
- The file stays, as the CLAUDE.md-mandated record.

**Fallback, used only if a procedural prop fails the Jungle visual review** (palm is the likeliest):
- Process Kenney Nature Kit `tree_palmTall.glb` / `tree_palmBend.glb` from `assets-raw/_kenney-nature-kit/extracted/Models/GLTF format/` with `npm run assets:process -- <in> public/models <Name>`.
- Generate typed components with gltfjsx.
- Recolour by material name onto the shared toon material with `metalness` irrelevant, since toon has none.
- Add ASSETS.md rows in the existing format: `| public/models/JunglePalmTall.glb (Kenney tree_palmTall.glb) | Kenney.nl — Nature Kit | https://kenney.nl/assets/nature-kit | CC0 | Terraced-island palm fallback |`.
- For this reason `scripts/process-asset.mjs` and the gltf devDependencies are deleted only after the Jungle sign-off (§12).

---

## 8. Performance budget

Targets (CLAUDE.md): 60 fps on desktop and at least 30 fps on a mid-range Android (reference device class: Pixel 6a / Galaxy A54), at 10 visible islands.

| Item | Focused island | Each overview island | Scene total (10 islands, 1 focused) |
|---|---|---|---|
| Terrain triangles (lit + unlit) | ≤ 26k + 5k | ≤ 10k + 2k | ≤ 140k |
| Prop triangles (instanced) | ≤ 14k | ≤ 8k (ground cover off) | ≤ 90k |
| Trail (ribbons, cairns, entries, pennant) | ≤ 5k | none | ≤ 5k |
| **Draw calls** | ≤ 22 (2 terrain + ≤ 14 prop kinds + ≤ 6 trail) | ≤ 8 (2 terrain + ≤ 6 prop kinds) | ≤ 100, including water |
| Build time, desktop (layout + mesh) | ≤ 90 ms | ≤ 60 ms (layout ≤ 30 ms, mesh ≤ 30 ms) | Time-sliced; all 10 ready ≤ 1 s desktop, ≤ 4 s Android |
| Geometry memory | ≤ 4 MB | ≤ 1.5 MB | ≤ 20 MB |
| glTF payload | 0 | 0 | 0 (was 497 KB) |
| JS added (gzip) | | | ≤ 25 KB |

Other rules:
- No shadow maps. The frameloop is demand in the detail view.
- Label occlusion goes against hulls (§5.2).
- One lit material and one unlit material for all terrain. One shared lit material for props. There are no per-island material clones.
- **Measurement:**
  - `npm run bench:island` is a vitest bench over 20 seeds per biome. It prints layout and mesh median and p95 times, and triangle counts.
  - The dev harness has a stats overlay in the top-left (`gl.info.render.calls`, triangles, build ms), so headless screenshots carry the numbers.
  - An Android check runs `/dev/island/jungle?view=overview&islands=10` on a real device through Chrome remote debugging before the Phase 5 sign-off.

---

## 9. Testing

### 9.1 Layout (`src/lib/island/*.test.ts`, vitest, offline)

**Sweep:** 300 integer seeds plus 20 `hashGoalId` values of fixed UUID fixtures, for each of the 6 biomes. The sweep runs in `npm test`; if it proves too slow, a 60-seed subset runs in CI and the full sweep runs in `test:island-sweep`.

1. **Determinism.** `serializeLayout(buildIslandLayout(b, s))` is deep-equal across two builds. Changing one prop rule's count leaves `trail.samples` and `blobs` unchanged, which checks salt isolation.
2. **Seed variety.** Seeds 1 and 2 differ: `trail.samples` at s = L/2 are more than 0.3 apart, or beach radii differ by more than 0.1 at 3 of 8 angles.
3. **No `Math.random`.** Spy on `Math.random` during a build and assert it was never called.
4. **Bounds:**
   - `footprintRadius ≤ 3.05` and `haloRadius ≤ 3.45`
   - `summitTopY ≤ 2.20`
   - every prop top ≤ 3.0 and inside the footprint
   - the scale caps from §2.3
5. **Nesting.** On a 0.05 grid: `sd[L+1] > 0 ⇒ sd[L] > 0`. Level y strictly increases. Beach width is at least 0.12 at every angle.
6. **Trail endpoints.**
   - `levelAt(samples[0]) === beach`, and the angle of `samples[0]` is within 0.6 rad of `front`.
   - The last sample is on the top level (or the crater rim) and at least 0.30 inside its rim.
7. **Walkable surface.** For every sample, `|groundHeightAt(x, z) − y| ≤ 1e-3`. For lateral probes at ±(halfWidth − 0.02), `|groundHeightAt − y| ≤ 0.01` (the corridor is flat across).
8. **No waypoint inside a cliff.**
   - Outside ramp spans, `|terraceY(sample) − y| ≤ 0.02`, so flat runs genuinely sit on a cap and the carve is not hiding a bulldozed cliff.
   - Inside ramp spans, `terraceY − y ≤ tierGap` and the cut depth is ≤ 1.0 everywhere.
   - No sample lies inside `features.shelf`, a pillar, or the pool.
9. **Monotonic and bounded slope.**
   - `y[i+1] ≥ y[i] − 1e-9`.
   - Rise/run over any 0.1 window ≤ tan 32°. Mean slope per ramp span ≤ tan 27°.
10. **Ramp count** equals the pattern's transitions (2 or 3). Each ramp has at least 0.20 of fill-side room.
11. **Leg balance** within the §3.5 windows.
12. **Clearances:**
    - Every prop: `pathProject.d ≥ halfWidth + rule.pathClear`.
    - No two prop discs overlap.
    - Pillars and the waterfall are at least 0.25 from the corridor.
    - The sightline rule holds for every prop taller than 0.30.
13. **Entry room.** On at least 60% of flat-run samples, `walkableRun` on at least one side is ≥ 0.25.
14. **Retry.** A forced failure (via a test-only hook `__forceInvalid`) returns a valid layout whose `seed` differs, and still deterministically.
15. **`islandAnchors` / `focusPose`:**
    - `labelY ≤ summitTopY + 1.0`.
    - `focusPose` keeps all 24 bounding points within ±0.88 NDC for aspects 16:9, 4:3 and 9:19.5.
    - Distance is within [7, 17].

### 9.2 Curve (`src/features/roadmap/curve.test.ts`, rewritten deliberately)

The fixture is `buildIslandLayout('jungle', 1)`, plus a 50-seed × 6-biome loop for items 3 and 4.

1. **Replaces "starts at the base radius and ends at the apex":**
   - `positionAt(curve, 0)` is within 0.02 of `waypoints[0] + clearance`.
   - Its horizontal radius is at least `0.6·footprintRadius`.
   - `positionAt(curve, 1)` is within 0.02 of `summit + clearance`.
2. **Monotonic:** y is non-decreasing over t = 0..1 in steps of 0.01, with epsilon 0.005 (tighter than today's 0.01).
3. **Follows the ground:** at 400 t values, `|y − (groundHeightAt(x, z) + TRAIL_CLEARANCE)| ≤ 0.03`. This is the "never floats, never clips" check at curve level.
4. **Arc-length even:** for N = 8, consecutive `positionAt(i/9)` chord distances along the curve are within 2% of each other.
5. **Seed variety:** replaces the seed-rotation test. Layouts for seeds 1 and 2 give `positionAt(0.5)` points more than 0.1 apart.
6. **Unchanged and still passing** against the fixture curve:
   - clamp (`positionAt(−0.5) == positionAt(0)`, `positionAt(1.5) == positionAt(1)`)
   - unit tangent
   - `perpendicularOffset` side flip and linear scale
   - plus a new check that `|tangent.y| < 0.6` everywhere, so the cross product with world-up never degenerates
7. **`groundedOffset`:** the result is on ground (`|y − groundHeightAt| < 1e-3`), the horizontal offset is ≤ the requested distance, and the side flips when the requested side is blocked (use a ramp sample).
8. **`buildTrailRibbon`:** vertex count ≈ length/0.03 × 2, and every vertex y is within 1e-3 of `groundHeightAt + clearance`.

### 9.3 Terrain and props geometry (`src/features/archipelago/terrain/*.test.ts`)

Three.js runs in Node; no WebGL is needed.

- No NaN positions. Colours are in [0, 1].
- The bounding box is within `haloRadius` and `summitTopY + 0.1`.
- Cap triangles (vertical normal) have `normal.y > 0.999`.
- Strip vertices within the corridor match `pathProject.y` to 1e-4.
- Triangle counts per detail are within the §8 budget, for 20 seeds × 6 biomes.
- The hull is at most 800 triangles and contains every trail sample in xz.
- `getPropGeometry(kind, biome)`: cached identity, a colour attribute present, and a bounding-box height equal to `rule.height` ± 5%.

### 9.4 Invariants that stay as they are

- `src/lib/trail.ts` is not edited.
- `src/lib/trail.test.ts` is not edited, and must pass: `milestoneTs`, `legOf`, `entryT`/`entryTs` (Run 10K value = 3 gives t ≈ 0.3333), `progressT`, `entrySide`.
- `archipelago.test.ts` is not edited.
- `theme.test.ts` is only updated deliberately at cleanup, if unused `BiomePalette` fields are dropped (§12).

---

## 10. Visual verification loop

This follows the `render-spike.sh` approach, but runs against the real components.

- **Dev route `/dev/island/:biome`.**
  - Registered only when `import.meta.env.DEV`, through a lazy import so it is tree-shaken from production. Today's `/dev/*` routes ship in production builds; that gets fixed here too.
  - It renders the real `SceneEnvironment`, the real `<Island>` (with a `seedOverride` prop, dev only) and the real `TrailView` with fixture milestones and entries.
  - It uses the real focus pose: today's CameraRig constants, or `focusPose` once Q1 is approved.
  - **Query parameters:**
    - `seed`
    - `view` = `focus | hero | side | top | back | phone | overview | picker`
    - `milestones` = N
    - `head` = 0..1
    - `entries` = K
    - `islands` = M (overview: M islands at the real `islandPosition(i, 12345)` with mixed biomes)
    - `material` = `toon | lambert` (Q3 A/B)
  - The stats overlay is shown (§8).
- **`scripts/render-island.mjs`** (Node, following the project's rule of Node wrappers rather than shell one-liners):
  - `npm run render:island -- <biome> <seed> <view> [--matrix] [--out <dir>]`.
  - Spawns headless Chrome from `CHROME_PATH` or the default Windows install, with `--use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,800` (phone: 390,844) and `--virtual-time-budget=8000`, and takes a screenshot.
  - Defaults to `os.tmpdir()/cairn-renders/<date>/`, never inside the repo.
  - Assumes the Vite dev server is already running. It never starts or stops it.
- **The Jungle sign-off matrix:**
  - seeds 1, 2, 3, 7, 42 × views focus, hero, side, top, phone
  - progress fixtures: N = 4 with head 0.55 and 3 entries; N = 8 with head 1.0
  - `overview` with 8 islands
  - one toon/Lambert pair
- **Checklist** (each item pass or fail, recorded in the PR):
  1. The whole island reads: beach, lawn, at least 2 plateaus, sheer cliffs.
  2. The trail is visible from the trailhead (beach, facing the camera) to the summit. Every ramp reads as a climb.
  3. No floating, clipping, or trail hidden behind a prop. The automated tests cover this too; here it is judged by eye.
  4. For N = 4, cairns are on at least 3 distinct levels.
  5. Cliffs show flutes, a dark base, a light rim and at least one slab. Lawn rims are clean, with no sawtooth.
  6. The foam rim is continuous. The water is flat, with no tilt and no z-fighting.
  7. Summit, label and pennant are in frame in the focus and phone views. The RoadmapPanel doesn't cover the trailhead on desktop.
  8. Palette spot-check: unlit water, foam and sand pixels match their hexes within ±3 per channel.
  9. Overview: neighbour halos never overlap, and labels are readable.
  10. The stats overlay is within §8.
- **Gate:** the user reviews real screenshots from the running app for Jungle before any other biome is built (2026-09-15 §5). Then, after Phase 5, they review one matrix per biome.

---

## 11. Rollout phases

1. **Housekeeping.**
   - Supersession notes on 2026-09-15 §3/§4.
   - The `Water.tsx` fix (§5.5).
   - `SceneEnvironment` and the `flat` canvas.
   - `/dev/*` routes gated behind DEV.
   - The dev route skeleton and `render-island.mjs`.
2. **Layout core (pure).** `src/lib/island/*` generic over the three patterns, with the Jungle config and the full §9.1 test suite green. Other biome configs are stubs that still pass the invariants.
3. **Terrain and props.** `terrain/*`, `TerracedIsland`, `islandCache`, and Jungle wired into `Island.tsx`. The other five biomes temporarily keep their old components behind `isTerraced(biome)`.
4. **Trail.**
   - The new `curve.ts` API, the `RoadmapTrail`/`TrailView` split, `MilestoneBuilder`, and `TrailPennant`.
   - For un-migrated biomes, a temporary `buildLegacyConeCurve` shim keeps the old trail. It is deleted in Phase 6.
   - The rewritten `curve.test.ts`.
   - `focusPose` (§5.6) and the focus orbit (§5.6.1) in `CameraRig`, both approved, so the sign-off screenshots use the real camera.
5. **Jungle sign-off gate.** The §10 matrix (including the orbit-π `back` render), then the user's approval. Q3 (material) and Q5 (palm) are decided here.
6. **Five more biomes.** Configs, palettes and prop kinds, the `BiomePicker` swap, per-biome render matrices, then the user's approval. Then the Android performance check.
7. **Cleanup (§12).** Deletions, the ASSETS.md update, and the CLAUDE.md asset-section update if the user approves (Q7).

---

## 12. Retirement list

| Item | When |
|---|---|
| `src/features/archipelago/models/{Jungle,Desert,Tundra,Volcano,Reef,Highlands}{Landmass,Props}.tsx` (12 files) and the sand torus they contain | Jungle in Phase 3; the rest in Phase 6 |
| `models/scatter.ts` (`scatterPlacements`, `splitCount`, `withLocalOffset`, `RADIUS_MIN/MAX`). `PropPart.tsx` stays, retyped to the new `PropPlacement`. | Phase 6 |
| `public/models/*.glb` (26 files, including `TrailMarker.glb`) and `src/features/roadmap/models/TrailMarker.tsx` | Phase 4 (marker); Phase 6 (the rest) |
| `useGLTF.preload` calls for the retired models | With their components |
| `src/features/archipelago/spikes/` (SpikeA/B/C, spike layouts and geometry, DevSpikePreview), the `/dev/spike/:name` route, `public/models/spikeA/`, `spikeB/`, `spikeC/` | Phase 6 (they stay as reference until the Jungle sign-off) |
| `DevIslandPreview.tsx` and `/dev/island-preview` | Phase 1 (replaced by `/dev/island/:biome`) |
| `RoadmapTrail.tsx` constants and helpers `ISLAND_BASE_RADIUS`, `ISLAND_HEIGHT`, `seedFromId`, `subCurve`; `curve.ts` `CONTROL_POINT_COUNT`, `SPIRAL_TURNS`, `buildLegacyConeCurve` | Phases 4 and 6 |
| `Island.tsx` per-biome tables; `CameraRig.tsx` `ISLAND_APPROACH_*` (if Q1 is approved) | Phases 3 and 6 |
| `useToonGradient` in `JungleLandmass.tsx`, which moves to `terrain/materials.ts` | Phase 3 |
| `BiomePalette.landmass` / `landmassShadow` / `trail` in `lib/theme.ts`, with `theme.test.ts` updated deliberately. `accent` stays for 2D labels. | Phase 6 |
| `scripts/process-asset.mjs`, the `assets:process` script, and the `@gltf-transform/cli` and `gltfjsx` devDependencies | Phase 6, only if the §7 fallback wasn't used |
| `assets-raw/` downloaded kits (local, untracked) | The user's call. They can stay locally as a fallback source. |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| The C-style engine is too slow on Android | Spatial hash, bisection ray exits, height grid, coarse overview mesh, time-sliced scheduler, LRU. Bench gate in §8, and a Worker as the next step (Q10). |
| Still reads as a "wedding cake" | Strong drift (0.55–0.90 rad off the back axis, mirrored per seed), back-merged cliffs (ledge 0.28 at the back), the shelf, slabs, and a checklist item. Tuned in the render loop, not at desk. |
| Toon posterises the flat caps or looks harsh | A/B against Lambert at the sign-off (Q3). Caps are single-normal, so they get one band; the risk is only on cliffs. |
| Flute noise in the SDF makes a ramp's ledge too tight at a site | The ramp window raises the ledge margin before the upper outline is built. The planner's ledge measurement uses the fluted SDF. Tests 8 and 10. |
| Knoll dome or crater break flat-run assumptions | Walkability is defined against `groundHeightAt`/`terraceY`, which include the dome, and the crater end point is on the rim. Tests run for every biome. |
| Milestones bunch on one level | Leg-balance windows (§3.5 step 8) and checklist item 4. |
| The fixed-yaw decision is rejected | The alternative is a CameraRig azimuth toward `front` (needs the camera change in Q1). The layout already exports `front`, so either works without layout changes. |
| drei/R3F raycasting ignores `visible={false}` hulls | Verified in Phase 3. Fallback is a colour/depth-write-disabled material. |
| Opaque water changes the look | It's a colour-exact match to the palette. Called out in the sign-off renders. |
| A generator change reshuffles every user's island | `LAYOUT_VERSION` plus salted streams limit the blast radius. Version bumps are deliberate. |
| Halo z-fighting against water at long range | Halo and foam heights (−0.042/−0.036), water `polygonOffset`, and the halo radius cap preventing neighbour overlap. |

---

## 14. Open questions and approvals needed

1. **Camera framing. APPROVED 2026-09-23.** Adopt `focusPose`: true 38° elevation, fit-to-bounds distance, lookAt at 0.4·summit, RoadmapPanel-aware shift, and the `cos` bug fix. The arrival azimuth and fly easing are unchanged.
2. **Fixed island yaw. APPROVED 2026-09-23, on condition** that the viewer can orbit to see the island's other side at will (§5.6.1). The column stays.
3. **Toon vs Lambert.** Decided from the side-by-side at the Jungle sign-off. Toon is the default, per §4.
4. **Reef coral `#F2C879`.** §1 lists it as a reef tone but also reserves it for CTAs. This spec uses `#F4B98C`. Confirm.
5. **Procedural palm vs the Kenney fallback.** Decided at the Jungle sign-off.
6. **Trail rendering.** A deep-teal `#3A7D77` progress ribbon on a carved earth path, replacing the tube, which read as a pipe in every spike. Confirm the look.
7. **CLAUDE.md update. APPROVED 2026-09-23.** Replace the "Asset pipeline" section with a "Procedural islands" section carrying the layout invariants (single `IslandLayout` source, `groundHeightAt` oracle, `hash01` streams, footprint and summit budget, "props instanced per kind"), in Phase 7. Until then CLAUDE.md is untouched, since the old pipeline stays in use for the un-migrated biomes.
8. **Next-node pulse under `frameloop="demand"`.** Either keep a continuous pulse, which forces continuous frames while a goal is focused, or pulse for 4 s after focus or change and then rest in a static highlighted state. The second is proposed.
9. **Real-time shadows.** Baked-only is proposed. An optional 1024 shadow map on the focused island only is a later polish item.
10. **Web Worker builds.** Only if Android profiling shows stalls longer than 50 ms after the §3.10 optimisations.
11. **Neighbour occlusion.** The focus camera's +X+Z approach can pass over a neighbour 7–8 units away in that direction. The current geometry puts neighbours just outside the frustum. Re-check after Q1. If needed, fade neighbours within 9 units of the camera in the detail view.
12. **`assets-raw/` kits.** Keep locally as a fallback source, or delete after Phase 6?

---

## Appendix A: constants

| Constant | Value | Home |
|---|---|---|
| `WATER_Y` | −0.05 | `lib/island/types.ts` (re-exported to `Water.tsx`) |
| Shallow / foam / beach cap y | −0.042 / −0.036 / 0.04 | `biomes.ts` pattern presets |
| `FOOTPRINT_MAX` / `FOAM_MAX` / `HALO_MAX` | 3.05 / 3.15 / 3.45 | `plan.ts` |
| `SUMMIT_MAX_Y` / `PROP_TOP_MAX_Y` | 2.20 / 3.0 | `plan.ts` |
| `FIELD_SOFTNESS` | 0.11 | `shapes.ts` |
| `PATH_HALF_WIDTH` | 0.17 | `trailPlan.ts` → `trail.halfWidth` |
| `LEDGE_LINE_MAX` | 0.42 (mid-ledge rule) | `trailPlan.ts` |
| `RAMP_SLOPE_DEG` (limiter / peak test) | 26 / 32 | `trailPlan.ts` |
| `RAMP_LEDGE` | 2·0.17 + 0.30 = 0.64 | `trailPlan.ts` |
| `TRAIL_CLEARANCE` / `RESAMPLE_SPACING` | 0.02 / 0.12 | `curve.ts` |
| `ENTRY_OFFSET_DISTANCE` / `ENTRY_RADIUS` | 0.25 / 0.05 | `RoadmapTrail.tsx` |
| Ribbon half-widths (done / todo) | 0.055 / 0.040 | `RoadmapTrail.tsx` |
| `ISLAND_YAW` | π/4 | `orientation.ts` |
| `SUN_DIR` (world) | normalize(−0.20, 0.80, 0.55) | `orientation.ts` |
| Toon gradient | [120, 190, 255] | `terrain/materials.ts` |
| Mesher cells (focus / overview / preview) | 0.07 / 0.12 / 0.15 | `terraceMesh.ts` |
| `LAYOUT_VERSION` | 1 | `types.ts` |
