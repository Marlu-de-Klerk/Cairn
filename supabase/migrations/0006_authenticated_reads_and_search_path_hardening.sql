-- Fix 1: restrict the public-read branch of goals/milestones/progress_entries/
-- cheers SELECT policies to the authenticated role. auth.uid() is NULL for
-- the anon role, so without "to authenticated" a fully anonymous caller
-- holding just the anon key could still read a public goal via the
-- goal_publicly_readable(...) branch — spec §4 says "anyone authenticated",
-- not "anyone". profiles' SELECT policy is intentionally public and is left
-- untouched.

drop policy "a user can read their own goals or public goals of public profiles" on public.goals;
create policy "a user can read their own goals or public goals of public profiles"
  on public.goals for select
  to authenticated
  using (user_id = auth.uid() or goal_publicly_readable(id));

drop policy "milestones are readable when their goal is" on public.milestones;
create policy "milestones are readable when their goal is"
  on public.milestones for select
  to authenticated
  using (owns_goal(goal_id) or goal_publicly_readable(goal_id));

drop policy "progress entries are readable when their goal is" on public.progress_entries;
create policy "progress entries are readable when their goal is"
  on public.progress_entries for select
  to authenticated
  using (owns_goal(goal_id) or goal_publicly_readable(goal_id));

drop policy "cheers are readable when their entry is" on public.cheers;
create policy "cheers are readable when their entry is"
  on public.cheers for select
  to authenticated
  using (entry_readable(entry_id));

-- Fix 2: add pg_temp to every security-definer function's search_path
-- (Postgres's "Writing SECURITY DEFINER Functions Safely" hazard — without
-- it, the session's temp schema is searched first). Also schema-qualify
-- entry_readable's nested calls to owns_goal/goal_publicly_readable, since
-- unqualified names inside a definer-rights function body resolve against
-- the live search_path at execution time, not by OID at creation time.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

create or replace function public.owns_goal(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.goals where id = p_goal_id and user_id = auth.uid()
  );
$$;

create or replace function public.goal_publicly_readable(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.goals g
    join public.profiles p on p.id = g.user_id
    where g.id = p_goal_id and g.is_public and p.is_public
  );
$$;

create or replace function public.entry_readable(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.progress_entries pe
    where pe.id = p_entry_id
      and (public.owns_goal(pe.goal_id) or public.goal_publicly_readable(pe.goal_id))
  );
$$;
