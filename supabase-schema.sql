create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_title text,
  servings integer not null default 2,
  tags text[] not null default '{}',
  ingredients jsonb not null default '[]'::jsonb,
  steps text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.recipes enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.shopping_checks enable row level security;

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
