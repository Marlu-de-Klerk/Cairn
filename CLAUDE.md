# CLAUDE.md — Cairn

Read this before touching `src/lib/trail.ts`, any RLS policy, or the asset pipeline.

## Trail maths invariants (src/lib/trail.ts — built in M1)

The trail is a Catmull-Rom curve parameterised `t ∈ [0,1]`; start is `t=0`, the goal's target is `t=1`.

- **Milestones are evenly spaced, never proportional to value.** With `n` milestones, milestone `i` (1-indexed) sits at `t = i / (n + 1)`. A 2/5/8 split of a 10 km goal is NOT placed at t=0.2/0.5/0.8 — it's placed at t=0.25/0.5/0.75. Proportional placement looks lopsided and reads as a bug.
- **Progress entries are placed proportionally within their leg.** For an entry with value `v` falling in leg `[m_i, m_{i+1}]`:
  `t = t_i + ((v - m_i) / (m_{i+1} - m_i)) * (t_{i+1} - t_i)`, clamped to the leg. Reference case: Run 10K (milestones at 2/5/8 of 10), a "Fastest 3K" entry (`value = 3`) must land at `t ≈ 0.333`.
- Entries with no `value`, or on a `checklist`-kind goal, go at the midpoint of the *currently active* leg, ordered by `occurred_at` among themselves.
- Entries are never placed exactly on the centreline — offset perpendicular to the curve tangent, alternating sides.
- `progressT(goal, milestones)` is the current head position: the last completed milestone's `t`, nudged forward proportionally by `current_value` within the next leg.
- This file has no React and no three.js imports. Everything 3D derives its positions from it — don't duplicate this maths anywhere else.

## RLS: both `is_public` flags must hold

A goal (and its milestones/progress_entries/cheers) is readable by someone other than its owner only when **both** `goals.is_public` and the owner's `profiles.is_public` are true. One flag alone is not enough — a public goal owned by a private profile stays hidden, and vice versa. This is enforced by the `goal_publicly_readable(goal_id)` SQL function (`supabase/migrations`), used by every child table's SELECT policy. `tests/rls/goals-rls.test.ts` asserts this explicitly (`is_public=true` + private profile → still hidden); don't weaken that test to make a feature easier to ship.

Shared helper functions (`owns_goal`, `goal_publicly_readable`, `entry_readable`) are the single source of truth for these checks — every table's RLS policy calls them rather than re-deriving the join logic. If you add a new table hanging off `goals` or `progress_entries`, reuse these functions.

## Asset pipeline (spec §8)

- CC0 sources only (poly.pizza, Kenney.nl, Quaternius, KayKit, Poly Haven). Record every source in `ASSETS.md` with URL and licence, even where attribution isn't required. (This file doesn't exist yet — create it when the first asset lands, in M4.)
- Every model goes through `gltf-transform` (dedupe, prune, weld, Draco/Meshopt compression, textures resized to 512 max) before it enters the repo.
- Generate typed components with `gltfjsx` — never `useGLTF` on a raw glTF inline in a feature component.
- Props must be instanced (`<Instances>`), never one mesh per prop.
- Islands are modular: one base landmass mesh per biome, props scattered on top, seeded deterministically from `goal.id` so an island looks the same on every visit.
- Total initial glTF payload budget: under 3 MB compressed. Preload only the biomes present in the current user's archipelago.
- Performance targets: 60fps desktop, 30+ mid-range Android. `frameloop="demand"` on the island detail view. Never render the archipelago and the detail view as two live scenes at once.
- The trail marker is a simple object (flag/lantern), not a character model — bias sourcing toward nature/prop packs, not character packs.

## Stack notes (deviations from the original brief, decided 2026-09-09)

- Product name is **Cairn**, not Atoll.
- TypeScript pinned to **5.9.3**, not the newer 7.x line (Microsoft's Go-native rewrite) — too new to trust ecosystem tooling with yet.
- **react-router 7.18.3** (not the newer major 8, which shipped after this brief was written).
- **three 0.185.1** (spec said 0.182.x; three.js doesn't use semver majors. 0.185.1 is the newest version satisfying every three-ecosystem package's peer range simultaneously — notably `postprocessing@6.39.4`'s own `>=0.168.0 <0.186.0`, which the initially-planned 0.186.0 violated and which forced a real `npm install` peer-dependency failure during Task 1, caught and fixed before merge).
- `db:push`/`db:types` are Node wrapper scripts (`scripts/db-push.mjs`/`scripts/db-types.mjs`), not raw `$VAR`-expanding shell one-liners — npm's Windows default script-shell (`cmd.exe`) doesn't expand `$VAR`, and `.env`'s non-`VITE_` vars were never going to reach a plain shell command anyway. Each script self-loads `.env` via `dotenv` and shells out via `spawnSync`, working the same under PowerShell, cmd, or bash.
- `db:types` uses `--project-id` (needs a one-time `npx supabase login`), not `--db-url` — this CLI version needs Docker/Podman to introspect a raw connection string, and requiring a container runtime for one npm script wasn't worth it. `SUPABASE_PROJECT_REF` in `.env` holds the ref.
- `supabase/config.toml` is inert for this project — it's never used, because this project pushes migrations via `--db-url` and generates types via `--project-id` rather than running `supabase start`. The live project's actual auth redirect allow-list lives in the Supabase dashboard, not in this file — don't expect editing `config.toml` to affect the deployed project.
- Full spec: `docs/superpowers/specs/2026-09-09-cairn-design.md`.

## General conventions

- `src/lib/` has no React, no three.js imports — pure functions only.
- Feature code lives in `src/features/<name>/`.
- Every Supabase **table** call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query. Never call `supabase.from()` directly inside a component. (`supabase.auth.*` calls are session management, not table access, and are exempt — see `src/features/auth/`.)
- Schema changes only via `supabase/migrations/*.sql`, applied with `npm run db:push`. Never run SQL by hand against the project.
- `npm test` runs the fast, offline unit/component suite. `npm run test:rls` runs the RLS integration suite against the real Supabase project (needs `SUPABASE_DB_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `.env` — see `.env.example`) — it is not part of `npm test` because it needs live network access and writes real (throwaway) rows.
