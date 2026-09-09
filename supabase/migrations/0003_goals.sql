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
