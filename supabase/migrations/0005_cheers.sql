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
