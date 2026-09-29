# Cairn — Visual Redesign (Soft Lagoon)

This spec replaces M4's visual direction wholesale. It does not touch M4's
non-visual work (the New Goal flow, the `create_goal_with_milestones` RPC,
react-query hooks, the golden-angle spiral layout, the trail-maths module,
CameraRig's orbit/fly-to logic) — only what things look like.

## 0. Why

M4 shipped generic CC0 "terrain kit" primitives (flat platforms, angular
cones) with a dark "ink" 2D theme. Live-testing after the fact showed it
doesn't match the intended feel at all, and separately surfaced a real bug:
the water plane doesn't meet the island edge correctly. This spec fixes
both by replacing the whole visual system, not patching the old one.

**Reference:** the user named *Forest Island* (Nanali Studios, Google Play)
as the target vibe — a cozy, warm, low-poly "healing idle game" aesthetic.
Its concrete traits, confirmed against real screenshots:

- Rounded, puffy, organic shapes (cloud-like tree canopies, smooth rocks) —
  never angular geometric primitives.
- Each island is one small, cohesive diorama built around a single hero
  feature (a rock outcrop, a mound, a garden), not a flat platform with
  props scattered on it.
- Warm, soft, painterly light — no harsh contrast, no realistic PBR.
- A light, warm 2D UI: rounded cards, pastel backgrounds, friendly type.

This spec does not reproduce Forest Island's actual art — it defines an
original visual system in the same family, validated against the user
directly (see §5, three approved mockup rounds).

## 1. Palette — "Soft Lagoon"

Approved by the user over three visual-companion mockup rounds. Six base
tokens, replacing M4's `ink`/`stone`/`mist`/`lantern`/`tide` set entirely
(implementers should feel free to rename the CSS custom properties to
match the new semantics — e.g. a token that was a near-black background
has no reason to keep a name like `ink` — but the *values* below are
locked, not proposals):

| Role | Hex | Used for |
|---|---|---|
| Page/world background | `#EAF6F6` | App background behind the canvas, sky |
| Water — deep | `#6BC2C9` | Outer ring of the water plane, deep water |
| Water — shallow | `#8FD4D9` | Inner ring, water near shorelines |
| Shoreline sand | `#EFCB8E` | The ring where every island meets the water (see §3) |
| Accent — coral | `#F6A9A0` | Reef biome, secondary UI accent |
| Accent — teal-green | `#5FBFA8` | Reef/lagoon secondary accent |
| Primary CTA — sun gold | `#F2C879` | The one warm "do this" color — New Goal, Mark done, Create goal buttons. Replaces the old `lantern` role and keeps its principle: reserved for the one primary action per screen, never decorative. |
| Panel surface | `#FFFFFF` at ~80% opacity + backdrop blur | 2D chrome panels (header, Journey panel, New Goal sheet) |
| Text — primary | `#3A7D77` (deep teal) | Headings, primary copy, readable against the light background |
| Text — secondary | `#6B8A87` (muted teal-grey) | Dates, captions, secondary copy |

Per-biome accents (all still read as one family against the base palette
above — see §3's mapping):

| Biome | Rock/base tone | Secondary tone | Pool/water-analog tone |
|---|---|---|---|
| Jungle | `#4E8F6E` (deep green) | `#7BC98C` (fern) | `#BEE8EA` (pool highlight) |
| Volcano | `#7A6259` (dark stone) | `#5C4A42` (charcoal) | `#F2A25C` (glowing ember, replaces water) |
| Desert | `#E3C088` (sand knoll) | `#8FA95C` (palm crown) | `#B98452` (bark) |
| Tundra | `#D3E3E6` (pale mound) | `#C9DCDE` (bare canopy) | `#8B7362` (bark) |
| Reef | `#EFCB8E` (sand cap) | `#F6A9A0` / `#F2C879` (coral) | — (flat, no pool) |
| Highlands | `#C7BFAE` (slate) | `#A98FB0` / `#8B8FA0` (heather) | — (flat, no pool) |

## 2. Typography and shape language

- **Display face: Fraunces** (already installed from M4) — kept, but only
  ever set in the deep-teal primary text color above, never on a dark
  background. Used exactly where M4 already used it (goal titles, the
  "Cairn" mark, Journey entry headlines).
- **Body face: Inter** (already installed) — unchanged role.
- **Shape language, new:** pill-shaped buttons (`border-radius: 999px`),
  generously rounded panels (12–16px radius), soft drop shadows
  (`0 2px 8px rgba(0,0,0,0.06)`-ish, never a hard border as the primary
  separation device). This replaces M4's sharper, thinner-bordered
  "waypoint chrome" panels with the softer, cozier language the palette
  implies.
- Every copy rule from the original spec (§7) still applies unchanged:
  sentence case, no all-caps, no `→`, buttons name what happens,
  `prefers-reduced-motion` respected throughout. This redesign changes
  color/shape/geometry, not interaction or copy.

## 3. Island composition system

> **Superseded by `2026-09-23-cairn-terraced-islands-design.md`** (the composition recipe here, and the prop/marker parts of §4). §1, §2, §5 and §4's procedural-geometry principle still apply.

Every island is built from the same three-part recipe, parametrized per
biome — this is also what fixes the water-alignment bug structurally
(see below), because the shoreline ring's size is derived from the same
numbers that build the island, not two independently-tuned constants.

1. **A hero feature** at the center — one of three patterns:
   - **Rock & Tide Pool** — a rounded boulder/outcrop with a small pool
     (or, for volcano, a glowing ember pit) at its base.
   - **Palm Knoll** — a soft grassy/sandy mound topped with one signature
     tree, leaning slightly.
   - **Reef Garden** — a flatter, wider cap studded with coral/heather
     puffs, no vertical centerpiece.
2. **A shoreline ring** — a flattened torus (or ring-shaped extrusion) in
   the sand tone (`#EFCB8E`), sized so its *outer* radius exactly matches
   the water plane's inner edge and its *inner* radius exactly matches the
   hero feature's own base radius. Because both the hero feature and the
   ring are built from the same one or two source numbers (a single
   `ISLAND_RADIUS` per biome, not a mesh-derived footprint from a
   downloaded model), there is no way for them to drift apart the way
   M4's scaled-mesh-vs-independently-tuned-trail-constants did.
3. **2–4 small props** scattered in the ring between the hero feature and
   the water's edge (the existing `scatterPlacements`/`hash01` seeding
   from M4 is reused unchanged — only what gets placed changes, not the
   placement math).

**Biome → pattern mapping** (approved):

| Biome | Pattern | Notes |
|---|---|---|
| Jungle | Rock & Tide Pool | Deep green rock, real water pool, fern props |
| Volcano | Rock & Tide Pool | Dark stone, glowing ember pit instead of a water pool |
| Desert | Palm Knoll | Warm sand mound, single leaning palm |
| Tundra | Palm Knoll | Pale snow-dusted mound, bare tree |
| Reef | Reef Garden | Coral + anemone puffs, no centerpiece |
| Highlands | Reef Garden | Slate rock + heather tufts instead of coral |

## 4. Technical approach — procedural geometry, not sourced assets

> **Superseded by `2026-09-23-cairn-terraced-islands-design.md`** (the composition recipe here, and the prop/marker parts of §4). §1, §2, §5 and §4's procedural-geometry principle still apply.

M4's asset-hunting approach (downloading CC0 packs, processing through
`gltf-transform`/`gltfjsx`) is **retired for biome art**. Rationale,
already discussed and agreed: a genuinely rounded/puffy style matching
this reference is not a safe bet to find pre-made, and this project
already spent one full milestone on that gamble. Building from primitives
gives exact control over the silhouette, eliminates the licensing/sourcing
step entirely, keeps the payload tiny, and — critically — makes the
water/shoreline class of bug structurally impossible (§3).

- **Trees:** a rounded cylinder trunk + 2–3 overlapping spheres (or a
  single low-poly icosphere) for the canopy, in the biome's secondary
  tone.
- **Rocks/boulders:** a low-detail icosphere, non-uniformly scaled and
  slightly randomized per instance (seeded, same `hash01` pattern M4
  already established), in the biome's rock tone.
- **The mound/knoll:** a squashed sphere or a low-poly dome.
- **The pool/ember pit:** a flattened cylinder or disc in the pool tone,
  inset slightly into the hero feature.
- **The shoreline ring:** a `TorusGeometry` (or a ring built from a thin
  extruded shape if a torus's circular cross-section looks wrong up
  close), sand-toned.
- **All materials switch to `MeshToonMaterial`** with a small 2–3-step
  gradient map, replacing M4's `MeshStandardMaterial` — this is the single
  biggest lever for the "designed, not prototype" look the reference has.
- **The trail marker** (currently a downloaded Kenney flag) becomes
  procedural too — a thin pole (cylinder) + a simple flag shape (a
  slightly curved plane or a flattened cone) — so the visual system has
  no external asset dependency left at all.
- M4's `public/models/*.glb`, `assets-raw/`, `scripts/process-asset.mjs`,
  and the `@gltf-transform/cli`/`gltfjsx` devDependencies become dead
  weight once this ships — removing them is in scope for the eventual
  full implementation plan, not this prototype step.

## 5. Process — prototype first, then the rest

This redesign is large enough (six biomes, the water/shoreline system,
the full 2D chrome) that repeating M4's mistake — build everything, then
discover live it doesn't match — is not acceptable. The explicit process,
agreed with the user:

1. **Build one real prototype island — Jungle — and stop.** Wire it into
   the actual running app (replacing whatever Jungle currently renders),
   using the Rock & Tide Pool pattern, Soft Lagoon jungle tones, and toon
   shading, matched against a real, correctly-aligned shoreline/water
   join.
2. **Show the user a real screenshot from the running app** (not a flat
   mockup) and get explicit confirmation before touching anything else.
3. **Only after that approval**: build the remaining five biomes, the
   shoreline/water system for all of them, and the full 2D chrome pass
   (§2), following the normal subagent-driven-development process this
   project has used for every milestone so far.

Step 1 is being done directly, outside the full writing-plans/SDD process
— it is a design-validation checkpoint, not the implementation itself.
Steps 3 onward get a proper implementation plan once the prototype is
approved.

## 6. Out of scope

- No change to the New Goal flow's logic, the RPC, the trail-maths module,
  camera orbit/fly-to behavior, or any react-query hook.
- No change to the archipelago's layout math (`islandPosition`, the
  golden-angle spiral) — only what an island looks like once placed.
- The auth screens (`SignInPage`, etc.) stay out of scope, as they were
  for M4 — flagged for a future pass, not this one.
