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
