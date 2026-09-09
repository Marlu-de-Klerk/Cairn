# Atoll — build brief

Working name: **Atoll**. Rename freely; keep it as one word everywhere.

You are building this from scratch in this repo. Read this whole file before writing code. Work through the milestones in order, commit at the end of each, and stop at the end of each milestone to let me look before continuing.

---

## 1. What it is

A goal tracker that turns each goal into a gamified trail. Your goals live as islands in an archipelago; each island holds one goal's roadmap. You mark milestones as you hit them, and you can log smaller wins between milestones. You can visit other people's archipelagos.

The core loop, using a real example end to end:

1. I land on the home screen and see my archipelago from above — a slowly rotating 3D water plane with a low-poly island per goal, each island's biome chosen by me.
2. I hit **New goal**, pick the Jungle biome, name it "Run 10K", set the target to 10 km, and add milestones at 2, 5 and 8 km.
3. A new jungle island appears in the archipelago with a trail winding across it: start → 2 → 5 → 8 → summit at 10.
4. I run 2 km. I open the island, the camera flies down to it, and I mark the 2 km node done. My marker walks forward to it and the trail behind it lights up.
5. Before I get to 5 km I run my fastest-ever 3 km. I add a progress update — "Fastest 3K, 14:02" — which appears as a small side-marker on the trail about a third of the way along the 2→5 leg.
6. Someone else's archipelago is browsable from **Explore**, read-only, and I can cheer their entries.

## 2. Non-goals for v1

No teams or shared goals. No comments (cheers only). No follow graph. No notifications, email, or push. No streaks or points economy. No goal templates or recurring goals. No native app. No offline mode. Don't build an admin panel.

## 3. Stack

- **React 19** + **TypeScript** + **Vite**, SPA, no SSR.
- **@react-three/fiber 9.7.x**, **@react-three/drei 10.x**, **three 0.182.x** for all 3D.
- **@react-spring/three 10.x** for camera flights and marker movement. (Do not add Rapier — no physics needed.)
- **@react-three/postprocessing 3.x** — one subtle bloom pass only, and only if it earns its keep.
- **Tailwind CSS v4** for 2D UI. **Radix primitives** for dialog/popover/select. **motion** (the package formerly published as framer-motion) for 2D transitions. **lucide-react** for icons.
- **Zustand** for client state. **@tanstack/react-query** for all Supabase reads/writes — no ad-hoc fetching in components.
- **Supabase** for Postgres, auth and storage. The browser talks to it directly via `@supabase/supabase-js`; **row-level security is the entire authorisation layer**, so no policy may be left permissive. There is no custom backend and you should not add one.
- **Vitest** + React Testing Library for logic. Do not try to snapshot-test the 3D scene; test the pure functions instead (§5).
- Deploy: Render **Static Site**, `npm run build`, publish `dist`, one rewrite rule `/*` → `/index.html`. Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are build-time.

Pin exact versions in `package.json`. If any of the above has moved on and the new major breaks something here, tell me rather than silently downgrading.

## 4. Data model

Write this as numbered SQL migrations under `supabase/migrations/`. Every table gets RLS enabled in the same migration that creates it.

**profiles** — `id` (FK `auth.users`, PK), `username` (unique, citext), `display_name`, `avatar_url`, `is_public` (bool, default false), `archipelago_seed` (int — deterministic water/prop scatter), `created_at`.

**goals** — `id`, `user_id`, `title`, `description`, `biome` (enum: `jungle`, `desert`, `tundra`, `volcano`, `reef`, `highlands`), `kind` (enum: `numeric`, `checklist`), `unit` (text, nullable — "km", "pages", "kg"), `start_value` (numeric, default 0), `target_value` (numeric, nullable for checklist), `current_value` (numeric, default 0), `status` (enum: `active`, `completed`, `archived`), `island_x`, `island_z`, `island_rotation` (numeric — assigned server-side-ish on insert, see §6.1), `is_public` (bool, default false), `created_at`, `completed_at`.

**milestones** — `id`, `goal_id`, `title`, `target_value` (numeric, nullable for checklist), `sort_order` (int), `completed_at` (nullable), `created_at`. Unique on (`goal_id`, `sort_order`).

**progress_entries** — `id`, `goal_id`, `milestone_id` (nullable — set when the entry *is* a milestone completion), `kind` (enum: `milestone`, `update`), `title`, `note` (text, nullable), `value` (numeric, nullable), `occurred_at` (date), `created_at`.

**cheers** — `id`, `entry_id`, `user_id`, `created_at`. Unique on (`entry_id`, `user_id`).

RLS, stated plainly so you can turn each line into a policy:

- A user can do anything to their own `goals`, `milestones`, `progress_entries`.
- Anyone authenticated can *read* a goal and its milestones and entries when `goals.is_public` is true **and** the owner's `profiles.is_public` is true. Both flags must hold; check this with a test.
- `profiles` are readable by anyone when `is_public`; a user always reads and updates their own.
- Anyone authenticated can insert their own `cheers` on any entry they can read, and delete their own. Nobody can update a cheer.
- Nothing is hard-deletable by anyone other than the owner. Archiving is a status change, not a delete.

Add indexes on `goals(user_id, status)`, `milestones(goal_id, sort_order)`, `progress_entries(goal_id, occurred_at)`, `cheers(entry_id)`.

## 5. Trail placement — the maths, in pure functions

Put this in `src/lib/trail.ts` with no React and no three.js imports, and unit-test it. Everything else derives from it.

The trail is a Catmull-Rom curve over control points, parameterised `t ∈ [0,1]`. Start is `t=0`, the final target is `t=1`.

**Milestone nodes are evenly spaced.** With `n` milestones between start and target, node `i` (1-indexed) sits at `t = i / (n + 1)`. Do *not* place nodes at their proportional value — a 2/5/8 split of 10 looks lopsided and reads as a bug. Even spacing gives the trail rhythm.

**Progress entries are placed proportionally within their leg.** For an entry with `value = v`, find the leg `[m_i, m_{i+1}]` whose value range contains `v` (treating start and target as the outer bounds), then:

```
t = t_i + ((v - m_i) / (m_{i+1} - m_i)) * (t_{i+1} - t_i)
```

So on Run 10K, "Fastest 3K" with `value = 3` lands at `t = 0.25 + (1/3 * 0.25) ≈ 0.333`. Clamp to the leg. Entries with no `value`, or on a checklist goal, go at the midpoint of the currently active leg, ordered among themselves by `occurred_at`.

Entries never sit exactly on the trail centreline — offset them perpendicular to the curve tangent, alternating side, so they read as things noticed along the way rather than gates you must pass.

Also export: `progressT(goal, milestones)` — the current head position, which is the last completed milestone's `t`, nudged forward proportionally by `current_value` within the next leg; and `legOf(t)`.

## 6. Screens

### 6.1 Home — the archipelago

A full-viewport R3F canvas. Camera is a fixed-elevation orbit looking down at maybe 35°, auto-rotating slowly, draggable, and it stops rotating the moment I touch it and doesn't resume. One island per active goal, laid out on a golden-angle spiral from the centre so the layout is stable and never overlaps as goals are added: `angle = i * 2.39996`, `radius = 8 * sqrt(i + 1)`, jittered by `archipelago_seed`. Compute this on insert and store it in `island_x`/`island_z` so islands never move once placed.

Each island shows its biome silhouette, its trail with completed portion visibly distinct, and a floating label with the goal title and progress. Hovering lifts the island slightly and shows a summary card. Clicking flies the camera to it (§6.3).

Completed goals don't vanish — they get a visible marker (a flag, a beacon, something biome-appropriate) and can be toggled on and off with a filter. Archived goals are hidden.

Overlays: the app mark, a **New goal** button, an avatar menu, and an **Explore** link. That's all. The islands are the interface; don't bury them under chrome.

Empty state: one island already sitting there, unclaimed, with a marker inviting me to plant my first goal. Not a modal, not an illustration of a clipboard.

### 6.2 New goal

A three-step flow in a sheet, not a full page.

1. **Biome.** Six cards, each a live rotating mini-canvas of that biome — one shared `<Canvas>` with six viewports, not six canvases. Don't use flat images.
2. **The goal.** Title, kind (numeric or checklist), and for numeric: target, unit, optional starting value. Unit is a free-text field with common suggestions, not a locked-down select.
3. **Milestones.** Add up to 8, each a title and (numeric goals) a value. Values must be strictly increasing and inside `(start, target)`; validate live and explain the problem in the field, don't just disable the button. Show a live preview of the trail as they're added — this is the moment the product sells itself.

Then it writes the goal, milestones, and island position in one transaction, closes, and the camera flies to the new island as it rises out of the water.

### 6.3 Island detail — the roadmap

Not a separate route with a page transition. The camera *flies down* into the island (react-spring, ~1.2s, ease-out) and the archipelago stays rendered behind it. URL becomes `/g/:id` and back button flies out again.

The trail is a tube or ribbon along the curve, biome-textured, with the completed portion filled and the rest shown as a fainter path. Milestone nodes are 3D markers along it — done ones are claimed and lit, the next one pulses gently, later ones are dormant. A small marker (a flag or a lantern; not a character model in v1) sits at `progressT`.

`<Html>` from drei anchors the cards: milestone nodes get a card on click, progress entries get a small tag that expands. Keep the 2D cards genuinely 2D — crisp Tailwind panels, `occlude` on, not fake-3D panels.

Actions on this screen: **Mark done** on the next milestone, and **Add update**. Marking done writes a `progress_entries` row of kind `milestone`, sets `completed_at`, bumps `current_value`, animates the marker forward along the curve, and fills the trail behind it. When the final target is marked, the island celebrates — once, briefly, and it must respect `prefers-reduced-motion`.

**Add update** is a compact form: title, optional value, optional note, date defaulting to today. On save the tag flies to its computed position on the trail.

A **Journey** panel, collapsible, lists every entry in chronological order with its value — this is the screen someone actually reads back over months, so it deserves real typographic care and shouldn't be an afterthought list of rows.

### 6.4 Explore

A grid of public archipelagos — each cell a small static-render preview plus username and a couple of stats. Opening one shows their archipelago and islands read-only, with the same camera behaviour and no action buttons. Entries show a cheer button and count. That's the whole social surface.

### 6.5 Auth & settings

Supabase magic link plus Google OAuth. Settings holds display name, username, avatar, and two switches: make my profile public, and a per-goal public toggle that also lives on the goal itself. Be explicit in the copy about what becomes visible.

## 7. Visual direction

Before writing any UI code, do a design pass: propose a token system — 4–6 named base hex values, the two typefaces and their roles, a layout concept, and the three principles that make this specific. Then check that plan against this brief and revise anything that reads like a default you'd produce for any app. Show me the plan before you build it.

Hard constraints on that plan:

- The 3D is the hero. The 2D chrome is quiet and gets out of the way. If a panel is competing with the island for attention, the panel is wrong.
- Six biomes need six distinct palettes that still sit in one world. Jungle deep greens with a hot accent; desert bleached ochres; tundra blue-whites; volcano charcoal and ember; reef turquoise and coral; highlands slate and heather. Each biome supplies its own trail material and prop set.
- One display face with real personality plus one workhorse for body and numbers. Avoid the warm-cream-plus-serif-plus-terracotta combination and avoid near-black-plus-acid-accent; both are generic tells.
- Non-user-triggered motion is limited to the archipelago's slow rotation and the water. Everything else moves only in answer to something I did — and then it must show me what changed. No fade-and-slide-up on every card.
- No all-caps labels. No `→` glued onto button text. No 01/02/03 markers except in the New goal flow, which genuinely is a sequence.
- Quality floor, unannounced: works down to a 380px viewport, visible keyboard focus, `prefers-reduced-motion` respected throughout, and every 3D-only interaction has a keyboard-reachable equivalent.

Copy rules: sentence case, active voice, buttons that name what happens. "Mark 2 km done", not "Submit". An action keeps its name from button to toast. Empty states are invitations; errors say what went wrong and what to do.

## 8. Asset pipeline

Use CC0 only, and record every source in `ASSETS.md` with URL and licence even where attribution isn't required.

- **poly.pizza** — primary source. CC0, glTF, no login. Its Nature category covers trees, rocks, plants, grass.
- **Kenney.nl** — CC0, 40k+ assets, very consistent style.
- **Quaternius** — CC0 packs; the nature and platformer sets match this art direction closely.
- **KayKit** on itch.io — CC0; the Medieval Hexagon Pack is a fast route to modular biome tiles, the Forest Nature Pack for props.
- **Poly Haven** — CC0 HDRIs for sky lighting. One low-res HDRI, not several.

Processing, non-negotiable because this ships to phones:

- Run every model through `gltf-transform` — dedupe, prune, weld, Draco or Meshopt compression, resize textures to 512 max.
- Generate typed components with `gltfjsx`; don't load raw glTF with `useGLTF` inline in feature components.
- Props must be instanced. A jungle island's 60 trees are one `<Instances>`, not 60 meshes.
- Islands are modular: one base landmass mesh per biome, scattered props on top, seeded deterministically from `goal.id` so an island looks the same every visit.
- Budget: total initial glTF payload under 3 MB compressed. Preload only the biomes actually present in my archipelago; lazy-load the rest when the biome picker opens.

Performance targets: 60fps on desktop, 30+ on a mid-range Android. Use `frameloop="demand"` on the island detail view when nothing is animating. Never render the archipelago and the detail view as two live scenes at once — one scene, one camera, two camera states.

## 9. Milestones

Stop after each. Commit with a message naming the milestone.

**M0 — Skeleton.** Vite + TS + Tailwind v4 + router. Supabase project wired, migrations for all five tables with RLS, generated types. Auth working end to end (magic link + Google). A `CLAUDE.md` covering the trail-maths invariants, the RLS rule that both `is_public` flags must hold, and the asset-pipeline rules. *Done when:* I can sign in, and a Vitest suite proves user A cannot read user B's private goal.

**M1 — Trail maths.** `src/lib/trail.ts` complete and tested, including the Run 10K case producing `t ≈ 0.333` for a 3 km entry. No UI. *Done when:* tests cover even spacing, in-leg interpolation, clamping, checklist goals, zero milestones, and a single milestone.

**M2 — Archipelago.** R3F canvas, water, spiral layout, one placeholder island geometry (no downloaded assets yet), labels, hover, click-to-fly. Reads real goals from Supabase. *Done when:* my goals appear as islands at stable positions and the camera flies smoothly to one and back with the URL and back button in sync.

**M3 — Roadmap.** Trail rendering from the M1 maths, milestone nodes, marker, mark-done with animation, add-update with the tag landing in the right place, Journey panel. *Done when:* the full Run 10K walkthrough in §1 works, including step 5.

**M4 — Biomes and art.** Real assets in, six biomes, instancing, compression, the design token system applied across all 2D UI, New goal flow with live biome previews and trail preview. *Done when:* the payload budget and frame targets in §8 are met, measured, with the numbers reported to me.

**M5 — Explore and ship.** Public toggles, Explore grid, read-only visiting, cheers. Render static site deployed with the SPA rewrite. *Done when:* a second account can find and visit my archipelago, cheer an entry, and cannot see my private goals.

## 10. How to work

- Ask before changing the schema or adding a dependency not listed in §3.
- Keep `src/lib/` free of React and three.js. Feature code lives in `src/features/<name>/`.
- Every Supabase call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query. No `supabase.from()` inside a component.
- Seed script (`npm run seed`) that creates a demo account with three goals across three biomes at different progress, including at least two between-milestone updates. You will need this constantly and so will I.
- Screenshot the UI as you build and critique your own output against §7 before telling me a milestone is done.
- Don't ask me to run SQL by hand — everything goes in a migration.

## 11. Questions to answer before M0

1. Confirm the working name, or give me the real one.
2. Six biomes at M4 is a lot of art. Should M4 ship jungle + tundra only, with the rest following?
3. Should the marker on the trail be a character model eventually, or stay an object? It changes what I look for in the asset packs.
