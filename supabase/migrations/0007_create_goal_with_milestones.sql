-- Atomic insert for the New Goal flow (spec §6.2): "writes the goal,
-- milestones, and island position in one transaction." A Postgres function
-- is the only way supabase-js gets multi-table atomicity from the browser —
-- security invoker (the default) is enough here because both goals' and
-- milestones' own INSERT RLS policies already scope to auth.uid(), so this
-- function needs no elevated privilege, unlike owns_goal/goal_publicly_readable.
create or replace function public.create_goal_with_milestones(
  p_title text,
  p_description text,
  p_biome text,
  p_kind text,
  p_unit text,
  p_start_value numeric,
  p_target_value numeric,
  p_island_x double precision,
  p_island_z double precision,
  p_island_rotation double precision,
  p_is_public boolean,
  p_milestones jsonb
)
returns public.goals
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_goal public.goals;
  v_milestone jsonb;
  v_sort_order int := 0;
begin
  insert into public.goals (
    user_id, title, description, biome, kind, unit,
    start_value, target_value, current_value,
    island_x, island_z, island_rotation, is_public
  ) values (
    auth.uid(), p_title, p_description, p_biome, p_kind, p_unit,
    p_start_value, p_target_value, p_start_value,
    p_island_x, p_island_z, p_island_rotation, p_is_public
  )
  returning * into v_goal;

  for v_milestone in select * from jsonb_array_elements(p_milestones)
  loop
    insert into public.milestones (goal_id, title, target_value, sort_order)
    values (
      v_goal.id,
      v_milestone->>'title',
      (v_milestone->>'targetValue')::numeric,
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  return v_goal;
end;
$$;
