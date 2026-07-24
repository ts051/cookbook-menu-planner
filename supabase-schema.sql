create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_title text,
  servings integer not null default 2,
  tags text[] not null default '{}',
  label text,
  ingredients jsonb not null default '[]'::jsonb,
  steps text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes add column if not exists label text;

create table if not exists public.user_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  constraint user_labels_name_length check (char_length(name) between 1 and 30)
);

create or replace function public.enforce_user_label_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.user_labels where user_id = new.user_id) >= 10 then
    raise exception 'Labels are limited to 10 per user';
  end if;
  return new;
end;
$$;

drop trigger if exists user_labels_enforce_limit on public.user_labels;
create trigger user_labels_enforce_limit
before insert on public.user_labels
for each row execute function public.enforce_user_label_limit();

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null default 'dinner',
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date, meal_slot)
);

create table if not exists public.shopping_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  item_key text not null,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, week_start, item_key)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 1 and 40)
);

create table if not exists public.login_ids (
  login_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint login_ids_login_id_format check (login_id ~ '^[a-z0-9._-]{1,40}$')
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function public.set_updated_at();

drop trigger if exists shopping_checks_set_updated_at on public.shopping_checks;
create trigger shopping_checks_set_updated_at
before update on public.shopping_checks
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists login_ids_set_updated_at on public.login_ids;
create trigger login_ids_set_updated_at
before update on public.login_ids
for each row execute function public.set_updated_at();

alter table public.recipes enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.shopping_checks enable row level security;
alter table public.profiles enable row level security;
alter table public.login_ids enable row level security;
alter table public.user_labels enable row level security;

grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, update, delete on table public.meal_plan_entries to authenticated;
grant select, insert, update, delete on table public.shopping_checks to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select on table public.login_ids to anon, authenticated;
grant insert, update, delete on table public.login_ids to authenticated;
grant select, insert, update, delete on table public.user_labels to authenticated;

drop policy if exists "user_labels_select_own" on public.user_labels;
create policy "user_labels_select_own"
on public.user_labels for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_labels_insert_own" on public.user_labels;
create policy "user_labels_insert_own"
on public.user_labels for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_labels_update_own" on public.user_labels;
create policy "user_labels_update_own"
on public.user_labels for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_labels_delete_own" on public.user_labels;
create policy "user_labels_delete_own"
on public.user_labels for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own"
on public.recipes for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
on public.recipes for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
on public.recipes for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
on public.recipes for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "meal_plan_select_own" on public.meal_plan_entries;
create policy "meal_plan_select_own"
on public.meal_plan_entries for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "meal_plan_insert_own" on public.meal_plan_entries;
create policy "meal_plan_insert_own"
on public.meal_plan_entries for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "meal_plan_update_own" on public.meal_plan_entries;
create policy "meal_plan_update_own"
on public.meal_plan_entries for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "meal_plan_delete_own" on public.meal_plan_entries;
create policy "meal_plan_delete_own"
on public.meal_plan_entries for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "shopping_checks_select_own" on public.shopping_checks;
create policy "shopping_checks_select_own"
on public.shopping_checks for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "shopping_checks_insert_own" on public.shopping_checks;
create policy "shopping_checks_insert_own"
on public.shopping_checks for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "shopping_checks_update_own" on public.shopping_checks;
create policy "shopping_checks_update_own"
on public.shopping_checks for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "shopping_checks_delete_own" on public.shopping_checks;
create policy "shopping_checks_delete_own"
on public.shopping_checks for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "login_ids_select_public" on public.login_ids;
create policy "login_ids_select_public"
on public.login_ids for select
to anon, authenticated
using (true);

drop policy if exists "login_ids_insert_own" on public.login_ids;
create policy "login_ids_insert_own"
on public.login_ids for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "login_ids_update_own" on public.login_ids;
create policy "login_ids_update_own"
on public.login_ids for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "login_ids_delete_own" on public.login_ids;
create policy "login_ids_delete_own"
on public.login_ids for delete
to authenticated
using (user_id = auth.uid());
