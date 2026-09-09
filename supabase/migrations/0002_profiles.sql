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
