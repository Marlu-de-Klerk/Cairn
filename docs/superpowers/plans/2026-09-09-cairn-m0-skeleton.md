# Cairn M0 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Cairn skeleton — Vite/React/TS/Tailwind app shell, all five Supabase tables with RLS, working auth (magic link + Google), and a Vitest suite that proves cross-user RLS isolation — matching M0's "done when" bar in the spec.

**Architecture:** A Vite SPA (`src/`) talks directly to Supabase via `@supabase/supabase-js`; there is no custom backend. Postgres schema + RLS policies live as numbered SQL migrations (`supabase/migrations/`), applied via the Supabase CLI against the live project (`--db-url`, no CLI login/link needed). Auth state is a single React context (`AuthProvider`) backed by `supabase.auth`; `react-router` gates routes on it. RLS correctness is proven by an integration test suite that authenticates two real (throwaway) Supabase users and asserts what each can and can't read.

**Tech Stack:** React 19.2.8, TypeScript 5.9.3, Vite 8.2.2, Tailwind CSS v4 (4.3.3) via `@tailwindcss/vite`, react-router 7.18.3, @tanstack/react-query 5.102.8, @supabase/supabase-js 2.116.0, Vitest 5.0.0 + React Testing Library 16.3.3, Supabase CLI 2.117.0 (dev-only, via `npx`/devDependency, no login required).

**Spec:** `docs/superpowers/specs/2026-09-09-cairn-design.md`

## Global Constraints

- React 19 + TypeScript + Vite, SPA, no SSR (spec §3).
- No dependency outside the pinned list below without asking first (spec §10). Every version below was checked against npm today (2026-09-09) and against peer-dependency ranges; deviations from the original brief (TypeScript 5.9.3 not 7.x, react-router 7.18.3 not the newer 8.x, three 0.185.1 not 0.182.x) were explicitly approved — see `CLAUDE.md`'s "Stack notes" section (written in Task 12).
- `src/lib/` contains no React and no three.js imports — pure functions only (spec §10). (No 3D exists yet in M0; this constrains M1 onward.)
- Every Supabase **table** call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query — never `supabase.from()` inside a component (spec §10). This does not apply to `supabase.auth.*` calls (session management, not table access), which the auth feature calls directly.
- Schema changes only via `supabase/migrations/*.sql`, applied with `npm run db:push`. Never run SQL by hand against the project (spec §10).
- Copy: sentence case, active voice, buttons name what happens — e.g. "Send me a sign-in link", not "Submit" (spec §7).
- **This session's git hook blocks `git commit` from Claude via Bash/PowerShell.** Every task below ends with a commit step as the plan format requires — when you reach it, stage the files (`git add`) and hand the exact commit command to the user to run themselves, rather than attempting it. Don't let this block moving to the next task.
- Tasks 3 and 8 need real Supabase credentials (Project URL, anon key, DB connection string, service-role key) that the user is in the process of creating. If they aren't available yet when you reach those tasks, stop and ask for them rather than guessing or stubbing them out.

---

### Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `.gitignore`
- Create: `scripts/db-push.mjs`
- Create: `scripts/db-types.mjs`

**Interfaces:**
- Produces: an npm project with `dev`/`build`/`preview`/`typecheck` scripts; a mounted React root at `#root`; `import.meta.env.VITE_*` typing later tasks rely on.

**Note (added after Task 8 surfaced it):** `db:push`/`db:types` cannot be plain `$VAR`-style shell one-liners — npm on Windows defaults its script shell to `cmd.exe` (doesn't expand `$VAR`), and even fixing the shell, `.env`'s non-`VITE_`-prefixed vars are never auto-loaded into `process.env` for a shell command the way Vite auto-loads `VITE_*` ones for client code. Both problems disappear at once by making each script a tiny Node wrapper: it self-loads `.env` via the already-present `dotenv` package, reads the var directly from `process.env`, and shells out via `child_process.spawnSync` — no shell-expansion or shell-specific config involved at all, works identically under PowerShell, cmd, or bash. (Task 11's `test:rls` needs no such wrapper — its test file already loads `.env` via `dotenv/config` directly in Node.)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cairn",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc",
    "test": "vitest run --exclude \"tests/rls/**\"",
    "test:watch": "vitest",
    "test:rls": "vitest run tests/rls",
    "db:push": "node scripts/db-push.mjs",
    "db:types": "node scripts/db-types.mjs"
  },
  "dependencies": {
    "@react-spring/three": "10.1.2",
    "@react-three/drei": "10.7.8",
    "@react-three/fiber": "9.7.0",
    "@react-three/postprocessing": "3.1.1",
    "@radix-ui/react-dialog": "1.1.23",
    "@radix-ui/react-popover": "1.1.23",
    "@radix-ui/react-select": "2.3.7",
    "@supabase/supabase-js": "2.116.0",
    "@tanstack/react-query": "5.102.8",
    "lucide-react": "1.43.0",
    "motion": "13.2.0",
    "postprocessing": "6.39.4",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-router": "7.18.3",
    "three": "0.185.1",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "@vitejs/plugin-react": "6.1.1",
    "dotenv": "17.4.2",
    "jsdom": "30.0.1",
    "supabase": "2.117.0",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vite": "8.2.2",
    "vitest": "5.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
```

`resolve.dedupe` is required — without it, `@tanstack/react-query`'s `QueryClientProvider` (wired in Task 9) crashes with "Invalid hook call" under this React 19.2.8/Vite 8.2.2 combination, because Vite's dependency pre-bundler produces two logically-separate React module instances. This was found and fixed while implementing Task 9; folded back into Task 1's config here so it's correct from the start rather than a later patch.

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cairn</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 6: Create `src/main.tsx` (temporary smoke-test render, replaced in Task 9)**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <p className="text-sm">Cairn is loading…</p>
    </div>
  </StrictMode>,
)
```

This imports `./index.css`, which doesn't exist yet — that's Task 2. Do Task 2 immediately after this step, before trying to run the dev server.

- [ ] **Step 7: Create `.gitignore`**

```
node_modules
dist
.env
.env.*.local
*.local
coverage
.DS_Store
```

- [ ] **Step 8: Create `scripts/db-push.mjs` and `scripts/db-types.mjs`**

```js
// scripts/db-push.mjs
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env')
  process.exit(1)
}

const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', dbUrl], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
```

```js
// scripts/db-types.mjs
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const projectRef = process.env.SUPABASE_PROJECT_REF
if (!projectRef) {
  console.error('Missing SUPABASE_PROJECT_REF in .env')
  process.exit(1)
}

const result = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', projectRef, '--schema', 'public'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
)

if (result.status !== 0) {
  console.error(result.stderr)
  process.exit(result.status ?? 1)
}

writeFileSync('src/lib/database.types.ts', result.stdout)
console.log('Wrote src/lib/database.types.ts')
```

Each script self-loads `.env` (via `dotenv/config`, already a devDependency), reads the one var it needs straight from `process.env`, and shells out via `spawnSync` — `shell: true` only on Windows, so `npx` resolves its `.cmd` shim correctly there, and neither script depends on the invoking shell (PowerShell, cmd, bash) supporting `$VAR` expansion.

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: installs cleanly with no peer-dependency errors (versions above were checked against each other's peer ranges).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.tsx src/vite-env.d.ts .gitignore scripts/db-push.mjs scripts/db-types.mjs
git commit -m "M0: scaffold Vite + React 19 + TypeScript project"
```

(Per Global Constraints, run `git add` yourself and hand this commit command to the user — Claude's `git commit` is blocked this session.)

---

### Task 2: Wire Tailwind CSS v4

**Files:**
- Create: `src/index.css`

**Interfaces:**
- Consumes: `@tailwindcss/vite` plugin registered in `vite.config.ts` (Task 1).
- Produces: Tailwind utility classes usable anywhere under `src/`.

- [ ] **Step 1: Create `src/index.css`**

```css
@import "tailwindcss";
```

This is intentionally minimal — no custom `@theme` tokens yet. The design-token pass (spec §7) is explicitly M4's job; M0's UI uses plain Tailwind defaults.

- [ ] **Step 2: Verify Tailwind renders**

Run: `npm run dev`, open the printed local URL in a browser.
Expected: a centered "Cairn is loading…" message on a dark slate background — confirms `bg-slate-950`, `text-slate-100`, `flex`, `min-h-screen` etc. are all being generated and applied, not just present as literal class strings.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "M0: wire Tailwind CSS v4"
```

---

### Task 3: Supabase client and environment wiring

**Files:**
- Create: `.env.example`
- Create: `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from `import.meta.env` (typed in Task 1's `vite-env.d.ts`).
- Produces: `supabase` — a singleton `SupabaseClient`, imported by every later feature. (Gets a `Database` generic added in Task 8 once types exist — don't add it yet.)

**⚠ Needs user input:** this task needs the real Project URL and anon key from the Supabase project the user is creating. If not yet available, stop here and ask for them before continuing.

- [ ] **Step 1: Create `.env.example`**

```
# Copy this file to .env and fill in real values. .env is git-ignored.

# Public — safe to expose to the browser (RLS is the real authorisation layer).
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Server/test-only — NOT prefixed with VITE_, so Vite never bundles these into
# client code. Used only by npm scripts (db:push, db:types) and the RLS test
# suite (Node context, not the browser).
SUPABASE_DB_URL=postgresql://postgres:your-db-password@db.your-project-ref.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# The bare project ref (the subdomain in VITE_SUPABASE_URL) — used by
# `db:types` instead of --db-url, since this CLI version needs Docker to
# introspect a raw connection string but not to use --project-id.
SUPABASE_PROJECT_REF=your-project-ref
```

- [ ] **Step 2: Create the real `.env`**

Copy `.env.example` to `.env` and fill in the values the user provides (Project URL + anon key at minimum for this task; `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PROJECT_REF` are needed by Task 8/11 but fine to fill in now if the user has them). `.env` is git-ignored — never commit it. `npm run db:types` (Task 8) additionally needs the Supabase CLI logged in once (`npx supabase login`, interactive) since `--project-id` uses the authenticated Management API rather than a direct DB connection.

- [ ] **Step 3: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Verify it loads without throwing**

Run: `npm run dev`, check the browser console.
Expected: no thrown error from `supabase.ts`. (There's nothing calling it yet, so this really just verifies the env vars resolve — add `console.log(import.meta.env.VITE_SUPABASE_URL)` temporarily in `main.tsx` if you want to see it, then remove it.)

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "M0: add Supabase client and env wiring"
```

(`.env` itself is git-ignored and never staged.)

---

### Task 4: Migration — extensions, profiles, and the new-user trigger

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/0001_extensions.sql`
- Create: `supabase/migrations/0002_profiles.sql`

**Interfaces:**
- Produces: `public.profiles` table; `public.handle_new_user()` trigger function that auto-creates a profile row on signup.

- [ ] **Step 1: Initialize the Supabase project structure**

Run: `npx supabase@latest init --workdir .`
Expected: creates `supabase/config.toml` and a `supabase/.gitignore` (or similar) marking the CLI's own temp files. This is required for the CLI to recognize `supabase/migrations/` as a project.

- [ ] **Step 2: Create `supabase/migrations/0001_extensions.sql`**

```sql
create extension if not exists pgcrypto;
create extension if not exists citext;
```

- [ ] **Step 3: Create `supabase/migrations/0002_profiles.sql`**

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  display_name text,
  avatar_url text,
  is_public boolean not null default false,
  archipelago_seed integer not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner or when public"
  on public.profiles for select
  using (is_public or id = auth.uid());

create policy "a user updates only their own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert policy: profiles.id is exclusively populated by the trigger
-- below, which runs as the function owner (postgres) and bypasses RLS.
-- Users never insert their own profile row directly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, archipelago_seed)
  values (
    new.id,
    'user_' || replace(new.id::text, '-', ''),
    (random() * 2147483647)::int
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

The default username (`user_<32 hex chars>`) is a placeholder derived from the user's own UUID, guaranteed unique. A later milestone's Settings screen lets the user change it.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/migrations/0001_extensions.sql supabase/migrations/0002_profiles.sql
git commit -m "M0: migration — extensions, profiles, new-user trigger"
```

(Not yet applied to the real database — that's Task 8, once all migrations exist.)

---

### Task 5: Migration — goals and the shared RLS helper functions

**Files:**
- Create: `supabase/migrations/0003_goals.sql`

**Interfaces:**
- Produces: `public.goals` table; `public.owns_goal(uuid) returns boolean` and `public.goal_publicly_readable(uuid) returns boolean` — reused by every later table's RLS policies (Tasks 6–7).

- [ ] **Step 1: Create `supabase/migrations/0003_goals.sql`**

```sql
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  biome text not null check (biome in ('jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands')),
  kind text not null check (kind in ('numeric', 'checklist')),
  unit text,
  start_value numeric not null default 0,
  target_value numeric,
  current_value numeric not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  island_x double precision not null,
  island_z double precision not null,
  island_rotation double precision not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index goals_user_id_status_idx on public.goals (user_id, status);

alter table public.goals enable row level security;

-- Shared by every child table's RLS: true when auth.uid() owns the goal.
create or replace function public.owns_goal(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.goals where id = p_goal_id and user_id = auth.uid()
  );
$$;

-- Shared by every child table's RLS: true only when BOTH the goal and its
-- owner's profile are public. Both flags must hold — see CLAUDE.md.
create or replace function public.goal_publicly_readable(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    join public.profiles p on p.id = g.user_id
    where g.id = p_goal_id and g.is_public and p.is_public
  );
$$;

create policy "a user can read their own goals or public goals of public profiles"
  on public.goals for select
  using (user_id = auth.uid() or goal_publicly_readable(id));

create policy "a user inserts only their own goals"
  on public.goals for insert
  with check (user_id = auth.uid());

create policy "a user updates only their own goals"
  on public.goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "a user deletes only their own goals"
  on public.goals for delete
  using (user_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_goals.sql
git commit -m "M0: migration — goals table and shared RLS helpers"
```

---

### Task 6: Migration — milestones and progress_entries

**Files:**
- Create: `supabase/migrations/0004_milestones_and_progress_entries.sql`

**Interfaces:**
- Consumes: `owns_goal(uuid)`, `goal_publicly_readable(uuid)` (Task 5).
- Produces: `public.milestones`, `public.progress_entries` tables; `public.entry_readable(uuid) returns boolean` (used by Task 7's cheers policies).

- [ ] **Step 1: Create `supabase/migrations/0004_milestones_and_progress_entries.sql`**

```sql
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null,
  target_value numeric,
  sort_order integer not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (goal_id, sort_order)
);

-- unique(goal_id, sort_order) already indexes goal_id as its leading
-- column, satisfying the spec's "index on milestones(goal_id, sort_order)".

alter table public.milestones enable row level security;

create policy "milestones are readable when their goal is"
  on public.milestones for select
  using (owns_goal(goal_id) or goal_publicly_readable(goal_id));

create policy "a user inserts milestones only on their own goals"
  on public.milestones for insert
  with check (owns_goal(goal_id));

create policy "a user updates milestones only on their own goals"
  on public.milestones for update
  using (owns_goal(goal_id))
  with check (owns_goal(goal_id));

create policy "a user deletes milestones only on their own goals"
  on public.milestones for delete
  using (owns_goal(goal_id));

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete set null,
  kind text not null check (kind in ('milestone', 'update')),
  title text not null,
  note text,
  value numeric,
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index progress_entries_goal_id_occurred_at_idx on public.progress_entries (goal_id, occurred_at);

alter table public.progress_entries enable row level security;

create policy "progress entries are readable when their goal is"
  on public.progress_entries for select
  using (owns_goal(goal_id) or goal_publicly_readable(goal_id));

create policy "a user inserts progress entries only on their own goals"
  on public.progress_entries for insert
  with check (owns_goal(goal_id));

create policy "a user updates progress entries only on their own goals"
  on public.progress_entries for update
  using (owns_goal(goal_id))
  with check (owns_goal(goal_id));

create policy "a user deletes progress entries only on their own goals"
  on public.progress_entries for delete
  using (owns_goal(goal_id));

-- Shared by cheers' RLS (Task 7): true when auth.uid() can read the entry's goal.
create or replace function public.entry_readable(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.progress_entries pe
    where pe.id = p_entry_id
      and (owns_goal(pe.goal_id) or goal_publicly_readable(pe.goal_id))
  );
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_milestones_and_progress_entries.sql
git commit -m "M0: migration — milestones and progress_entries"
```

---

### Task 7: Migration — cheers

**Files:**
- Create: `supabase/migrations/0005_cheers.sql`

**Interfaces:**
- Consumes: `entry_readable(uuid)` (Task 6).
- Produces: `public.cheers` table, fully policied.

- [ ] **Step 1: Create `supabase/migrations/0005_cheers.sql`**

```sql
create table public.cheers (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.progress_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_id, user_id)
);

-- unique(entry_id, user_id) already indexes entry_id as its leading column,
-- satisfying the spec's "index on cheers(entry_id)" — no separate index needed.

alter table public.cheers enable row level security;

create policy "cheers are readable when their entry is"
  on public.cheers for select
  using (entry_readable(entry_id));

create policy "a user cheers only as themselves, on entries they can read"
  on public.cheers for insert
  with check (user_id = auth.uid() and entry_readable(entry_id));

create policy "a user deletes only their own cheers"
  on public.cheers for delete
  using (user_id = auth.uid());

-- No update policy: nobody can update a cheer (spec §4). RLS default-denies
-- any operation with no matching policy, so omitting one is the enforcement.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0005_cheers.sql
git commit -m "M0: migration — cheers"
```

---

### Task 8: Apply migrations and generate typed database types

**Files:**
- Modify: `src/lib/supabase.ts` (add the `Database` generic)
- Create: `src/lib/database.types.ts` (generated, not hand-written)

**Interfaces:**
- Consumes: `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF` (`.env`, Task 3); `scripts/db-push.mjs`/`scripts/db-types.mjs` (Task 1), which self-load `.env` and shell out — no shell-specific `$VAR` expansion needed on any OS.
- Produces: `Database` type, imported by `src/lib/supabase.ts` and every later typed hook.

**⚠ Needs user input:** this task needs `SUPABASE_DB_URL` and `SUPABASE_PROJECT_REF` (and the project must already exist with Tasks 4–7's migrations committed). If they're not in `.env` yet, stop and ask for them. `db:types` additionally needs the Supabase CLI logged in once (`npx supabase login`) — check with `npx supabase projects list`; if it errors, run the login flow (interactive, opens a browser) before continuing.

- [ ] **Step 1: Push all five migrations to the real database**

Run: `npm run db:push`
Expected: the CLI lists `0001_extensions.sql` through `0005_cheers.sql` and applies them in order with no errors. If a policy or function fails to create, read the error — it'll name the exact SQL statement — fix that migration file, and re-run (the CLI tracks which migrations already applied, so re-running after a fix on a partially-applied migration may need `supabase migration repair` — ask the user before running any repair/destructive migration command against the real project).

- [ ] **Step 2: Generate types**

Run: `npm run db:types`
Expected: `src/lib/database.types.ts` is created/overwritten with a `Database` type containing `Tables: { profiles, goals, milestones, progress_entries, cheers }` and their Row/Insert/Update shapes. This uses `--project-id` (the Management API) rather than `--db-url`, because this CLI version needs a local Docker/Podman runtime to introspect a raw connection string — `--project-id` avoids that dependency but does need the one-time CLI login noted above.

- [ ] **Step 3: Wire the generated type into the Supabase client**

Modify `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: passes — `database.types.ts` is valid, generated TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/database.types.ts
git commit -m "M0: apply migrations, generate typed Database"
```

---

### Task 9: App shell — router and query client

**Files:**
- Create: `src/App.tsx`
- Modify: `src/main.tsx` (replace Task 1's placeholder render)
- Create: `src/features/home/HomePage.tsx` (temporary stub — real archipelago is M2)

**Interfaces:**
- Consumes: `AuthProvider` (Task 10 creates it — this task references it, so do Task 10's `AuthProvider.tsx` file first if working strictly in order, or treat Tasks 9–10 as one sitting since they're mutually dependent on each other's files).
- Produces: `App` component with routes `/`, `/sign-in`, `/auth/callback`.

Note: this task and Task 10 are tightly coupled (`App.tsx` renders auth components; `main.tsx` wraps `App` in `AuthProvider`). Implement them together in one sitting; the split exists only so each has a clear, independently-reviewable deliverable.

- [ ] **Step 1: Create `src/features/home/HomePage.tsx`**

```tsx
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/useSession'

export function HomePage() {
  const { session } = useSession()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-400">Signed in as {session?.user.email}</p>
      <p className="text-xs text-slate-500">The archipelago arrives in M2.</p>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100"
      >
        Sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { HomePage } from './features/home/HomePage'

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 3: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from './features/auth/AuthProvider'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Verify (after Task 10's files exist)**

Run: `npm run dev`, open the app.
Expected: redirected to `/sign-in` (no session yet) showing the sign-in form from Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx src/features/home/HomePage.tsx
git commit -m "M0: app shell — router and query client"
```

---

### Task 10: Auth feature — provider, sign-in, callback, route guard

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/useSession.ts`
- Create: `src/features/auth/RequireAuth.tsx`
- Create: `src/features/auth/SignInPage.tsx`
- Create: `src/features/auth/AuthCallbackPage.tsx`
- Test: `src/features/auth/SignInPage.test.tsx`
- Create: `tests/setup.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: `supabase` (Task 8).
- Produces: `AuthProvider` (context provider, consumed by Task 9's `main.tsx`), `useSession()` returning `{ session: Session | null, isLoading: boolean }`, `RequireAuth` (route guard), `SignInPage`, `AuthCallbackPage` (consumed by Task 9's `App.tsx`).

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          exclude: ['tests/rls/**', 'node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'rls',
          environment: 'node',
          include: ['tests/rls/**'],
        },
      },
    ],
  },
})
```

Vitest 5.0.0 (pinned in Task 1) removed `environmentMatchGlobs` in favor of `test.projects` (formerly "workspace") — this is the Vitest 5 equivalent, same intent: jsdom everywhere except `tests/rls/**`, which gets `node` (Task 11 lives there). `tests/rls/` doesn't exist yet — the `rls` project is a no-op until Task 11 populates it.

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

The `afterEach(cleanup)` is required — `@testing-library/react` only auto-registers cleanup when `test.globals: true` is set (it isn't here), so without this, each test's rendered DOM stays mounted into the next test, breaking any test file that renders more than once (e.g. Task 10's own `SignInPage.test.tsx`).

- [ ] **Step 3: Create `src/features/auth/AuthProvider.tsx`**

```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

interface AuthContextValue {
  session: Session | null
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, isLoading }}>{children}</AuthContext.Provider>
}
```

- [ ] **Step 4: Create `src/features/auth/useSession.ts`**

```ts
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'

export function useSession() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useSession must be used within an AuthProvider')
  }
  return context
}
```

- [ ] **Step 5: Create `src/features/auth/RequireAuth.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 6: Write the failing test for `SignInPage` — create `src/features/auth/SignInPage.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sign-in form', () => {
    render(<SignInPage />)

    expect(screen.getByRole('heading', { name: 'Cairn' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send me a sign-in link' })).toBeInTheDocument()
  })

  it('sends a magic link and shows confirmation', async () => {
    render(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'runner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))

    await waitFor(() => {
      expect(screen.getByText(/Check runner@example.com for a sign-in link/)).toBeInTheDocument()
    })

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'runner@example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('starts the Google OAuth flow', async () => {
    render(<SignInPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() => {
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    })
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run src/features/auth/SignInPage.test.tsx`
Expected: FAIL — `Cannot find module './SignInPage'` (it doesn't exist yet).

- [ ] **Step 8: Create `src/features/auth/SignInPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export function SignInPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  async function handleGoogleSignIn() {
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Cairn</h1>
          <p className="text-sm text-slate-400">Sign in to see your archipelago.</p>
        </div>

        {status === 'sent' ? (
          <p className="rounded-md bg-slate-900 p-4 text-center text-sm text-slate-300">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
            <label htmlFor="email" className="block text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending link…' : 'Send me a sign-in link'}
            </button>
          </form>
        )}

        {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/features/auth/SignInPage.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 10: Create `src/features/auth/AuthCallbackPage.tsx`**

```tsx
import { Navigate } from 'react-router'
import { useSession } from './useSession'

export function AuthCallbackPage() {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm">Signing you in…</p>
      </div>
    )
  }

  return <Navigate to={session ? '/' : '/sign-in'} replace />
}
```

`supabase-js` parses the magic-link/OAuth redirect hash automatically on load and fires `onAuthStateChange` (handled by `AuthProvider`); this page just waits for that and redirects.

- [ ] **Step 11: Run the full unit/component suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add vitest.config.ts tests/setup.ts src/features/auth/
git commit -m "M0: auth feature — provider, sign-in, callback, route guard"
```

---

### Task 11: RLS integration test suite

**Files:**
- Create: `tests/rls/goals-rls.test.ts`

**Interfaces:**
- Consumes: live Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `.env`), all five tables and their RLS policies (Tasks 4–7, applied in Task 8).

**⚠ Needs user input:** needs `SUPABASE_SERVICE_ROLE_KEY` in `.env` (Project Settings → API → `service_role` secret in the Supabase dashboard). This key bypasses RLS — it's used here only to create/delete throwaway test users, never to read or write goal data directly. It must never be prefixed `VITE_` and never reach client code.

- [ ] **Step 1: Create `tests/rls/goals-rls.test.ts`**

```ts
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'RLS tests need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env. See CLAUDE.md.',
  )
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

async function createSignedInTestUser(label: string): Promise<TestUser> {
  const email = `cairn-rls-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = `Test-${Math.random().toString(36).slice(2)}!`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`failed to create test user ${label}: ${error?.message}`)
  }

  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`failed to sign in test user ${label}: ${signInError.message}`)
  }

  return { id: data.user.id, email, client }
}

describe('row-level security', () => {
  let userA: TestUser
  let userB: TestUser

  beforeAll(async () => {
    userA = await createSignedInTestUser('a')
    userB = await createSignedInTestUser('b')
  })

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
  })

  async function insertGoal(owner: TestUser, overrides: Partial<Record<string, unknown>> = {}) {
    const { data, error } = await owner.client
      .from('goals')
      .insert({
        user_id: owner.id,
        title: 'Run 10K',
        biome: 'jungle',
        kind: 'numeric',
        unit: 'km',
        target_value: 10,
        island_x: 0,
        island_z: 0,
        island_rotation: 0,
        ...overrides,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`failed to insert goal: ${error?.message}`)
    }
    return data as { id: string }
  }

  it('lets the owner read their own private goal', async () => {
    const goal = await insertGoal(userA)

    const { data, error } = await userA.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('hides a private goal from another user', async () => {
    const goal = await insertGoal(userA)

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('still hides a goal marked public when the owner profile is not public', async () => {
    const goal = await insertGoal(userA, { is_public: true })

    const { data: profile } = await userA.client
      .from('profiles')
      .select('is_public')
      .eq('id', userA.id)
      .single()
    expect(profile?.is_public).toBe(false)

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('reveals a goal only when both goal.is_public and profile.is_public are true', async () => {
    const { error: profileError } = await userA.client
      .from('profiles')
      .update({ is_public: true })
      .eq('id', userA.id)
    expect(profileError).toBeNull()

    const goal = await insertGoal(userA, { is_public: true })

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await userA.client.from('profiles').update({ is_public: false }).eq('id', userA.id)
  })

  it('hides milestones and progress entries on a private goal from another user', async () => {
    const goal = await insertGoal(userA)

    const { data: milestone, error: milestoneError } = await userA.client
      .from('milestones')
      .insert({ goal_id: goal.id, title: '2 km', target_value: 2, sort_order: 1 })
      .select()
      .single()
    expect(milestoneError).toBeNull()

    const { data: entry, error: entryError } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: goal.id, kind: 'update', title: 'Fastest 3K', value: 3 })
      .select()
      .single()
    expect(entryError).toBeNull()

    const { data: milestonesSeenByB } = await userB.client
      .from('milestones')
      .select()
      .eq('id', milestone!.id)
    expect(milestonesSeenByB).toHaveLength(0)

    const { data: entriesSeenByB } = await userB.client
      .from('progress_entries')
      .select()
      .eq('id', entry!.id)
    expect(entriesSeenByB).toHaveLength(0)
  })

  it('lets another user cheer an entry on a fully public goal, but not one they cannot read', async () => {
    await userA.client.from('profiles').update({ is_public: true }).eq('id', userA.id)
    const publicGoal = await insertGoal(userA, { is_public: true })
    const privateGoal = await insertGoal(userA)

    const { data: publicEntry } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: publicGoal.id, kind: 'update', title: 'Fastest 3K', value: 3 })
      .select()
      .single()
    const { data: privateEntry } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: privateGoal.id, kind: 'update', title: 'Secret split', value: 3 })
      .select()
      .single()

    const { error: cheerOnPublicError } = await userB.client
      .from('cheers')
      .insert({ entry_id: publicEntry!.id, user_id: userB.id })
    expect(cheerOnPublicError).toBeNull()

    const { error: cheerOnPrivateError } = await userB.client
      .from('cheers')
      .insert({ entry_id: privateEntry!.id, user_id: userB.id })
    expect(cheerOnPrivateError).not.toBeNull()

    await userA.client.from('profiles').update({ is_public: false }).eq('id', userA.id)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm run test:rls`
Expected: PASS, all 6 tests. If any assertion about hidden data instead sees the row, that's a real RLS bug — stop and fix the relevant migration (don't weaken the test).

- [ ] **Step 3: Commit**

```bash
git add tests/rls/goals-rls.test.ts
git commit -m "M0: RLS integration test suite — proves cross-user isolation"
```

---

### Task 12: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: project-level documentation read by any future Claude session working in this repo.

- [ ] **Step 1: Create `CLAUDE.md`**

```markdown
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
- Full spec: `docs/superpowers/specs/2026-09-09-cairn-design.md`.

## General conventions

- `src/lib/` has no React, no three.js imports — pure functions only.
- Feature code lives in `src/features/<name>/`.
- Every Supabase **table** call goes through a typed hook in `src/features/*/api.ts` wrapped in react-query. Never call `supabase.from()` directly inside a component. (`supabase.auth.*` calls are session management, not table access, and are exempt — see `src/features/auth/`.)
- Schema changes only via `supabase/migrations/*.sql`, applied with `npm run db:push`. Never run SQL by hand against the project.
- `npm test` runs the fast, offline unit/component suite. `npm run test:rls` runs the RLS integration suite against the real Supabase project (needs `SUPABASE_DB_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `.env` — see `.env.example`) — it is not part of `npm test` because it needs live network access and writes real (throwaway) rows.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "M0: add CLAUDE.md"
```

---

### Task 13: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors, produces `dist/`.

- [ ] **Step 2: Full fast test suite**

Run: `npm test`
Expected: all pass (auth component tests from Task 10).

- [ ] **Step 3: RLS suite**

Run: `npm run test:rls`
Expected: all pass (Task 11).

- [ ] **Step 4: Visual smoke check**

Run: `npm run dev`, open it in a browser (or use the Browser tool), screenshot the `/sign-in` page.
Expected: dark-slate page, "Cairn" heading, email field, "Send me a sign-in link" button, "Continue with Google" divider and button — all Tailwind-styled, nothing unstyled/broken.

- [ ] **Step 5: Hand off manual sign-in verification to the user**

This can't be automated — magic links go to a real inbox, and Google OAuth needs a real Google account. Ask the user to:
1. Run `npm run dev`, open `/sign-in`.
2. Enter their real email, click "Send me a sign-in link", open the email, click the link — confirm they land on `/` signed in.
3. If Google OAuth was configured (spec §0.4's optional side quest), try "Continue with Google" too.

- [ ] **Step 6: Final commit for the milestone**

```bash
git add -A
git commit -m "M0: skeleton complete — auth, schema, RLS proven by tests"
```

Per the spec's own workflow rule ("stop at the end of each milestone to let me look before continuing"): stop here. Don't start M1 without the user looking at this first.
