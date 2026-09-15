-- One shared cookbook for all authenticated accounts. Profiles stay private.
begin;
lock table public.recipes, public.meal_plan_entries, public.shopping_checks in access exclusive mode;

-- Keep the pre-migration data outside the API-accessible schema.
create schema if not exists cookbook_backup;
revoke all on schema cookbook_backup from public, anon, authenticated;
create table cookbook_backup.recipes_20260915 as table public.recipes;
create table cookbook_backup.meal_plan_entries_20260915 as table public.meal_plan_entries;
create table cookbook_backup.shopping_checks_20260915 as table public.shopping_checks;

-- Prefer a copy with an explicitly registered meal type; retain its recipe ID.
create temporary table recipe_merge on commit drop as
select id, first_value(id) over (
  partition by title
  order by (exists (select 1 from unnest(tags) tag
    where tag in ('__meal_type:main', '__meal_type:side', '__meal_type:staple', '__meal_type:soup'))) desc,
    updated_at desc, created_at desc, id
) as keeper_id
from public.recipes;

update public.meal_plan_entries p set recipe_id = m.keeper_id
from recipe_merge m where p.recipe_id = m.id and m.id <> m.keeper_id;
delete from public.recipes r using recipe_merge m
where r.id = m.id and m.id <> m.keeper_id;

-- Abort the whole transaction if different accounts have conflicting slots.
-- The current data has no such conflicts, so all plans and checks are retained.
alter table public.recipes add constraint recipes_shared_title_key unique (title);
alter table public.meal_plan_entries add constraint meal_plan_shared_slot_key unique (plan_date, meal_slot);
alter table public.shopping_checks add constraint shopping_checks_shared_item_key unique (week_start, item_key);

-- Removing an account must not remove the household's shared data.
alter table public.recipes alter column user_id drop not null;
alter table public.recipes drop constraint recipes_user_id_fkey;
alter table public.recipes add constraint recipes_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.meal_plan_entries alter column user_id drop not null;
alter table public.meal_plan_entries drop constraint meal_plan_entries_user_id_fkey;
alter table public.meal_plan_entries add constraint meal_plan_entries_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.shopping_checks alter column user_id drop not null;
alter table public.shopping_checks drop constraint shopping_checks_user_id_fkey;
alter table public.shopping_checks add constraint shopping_checks_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

do $$
declare target text; prefix text; operation text;
begin
  foreach target in array array['recipes', 'meal_plan_entries', 'shopping_checks'] loop
    prefix := case when target = 'meal_plan_entries' then 'meal_plan' else target end;
    foreach operation in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', prefix || '_' || operation || '_own', target);
    end loop;
    execute format('create policy %I on public.%I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', target || '_shared', target);
  end loop;
end $$;
commit;
