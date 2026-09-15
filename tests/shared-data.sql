-- Run inside a transaction and roll back afterwards. No credentials required.
do $$
declare a uuid; b uuid; r uuid; recipe_count bigint; plan_count bigint; check_count bigint;
begin
  select id into a from auth.users order by id limit 1;
  select id into b from auth.users where id <> a order by id limit 1;
  if b is null then raise exception 'Two accounts required for sharing test'; end if;
  select count(*) into recipe_count from public.recipes;
  select count(*) into plan_count from public.meal_plan_entries;
  select count(*) into check_count from public.shopping_checks;
  if exists (select 1 from information_schema.tables where table_schema='cookbook_backup' and table_name='meal_plan_entries_20260915') then
    if plan_count <> (select count(*) from cookbook_backup.meal_plan_entries_20260915)
      or check_count <> (select count(*) from cookbook_backup.shopping_checks_20260915) then
      raise exception 'Migration lost plans or checks';
    end if;
    if exists (select 1 from cookbook_backup.recipes_20260915 old
      where exists (select 1 from unnest(old.tags) tag where tag like '__meal_type:%')
      and not exists (select 1 from public.recipes shared where shared.title=old.title and shared.tags @> old.tags)) then
      raise exception 'Migration lost registered meal types';
    end if;
  end if;
  select id into r from public.recipes limit 1;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.recipes) <> recipe_count
    or (select count(*) from public.meal_plan_entries) <> plan_count
    or (select count(*) from public.shopping_checks) <> check_count then
    raise exception 'Account A cannot read shared data';
  end if;
  insert into public.meal_plan_entries(user_id,plan_date,meal_slot,recipe_id)
    values(a,'2999-01-01','main',r)
    on conflict(plan_date,meal_slot) do update set recipe_id=excluded.recipe_id;
  insert into public.shopping_checks(user_id,week_start,item_key,checked)
    values(a,'2999-01-01','sharing-test',true)
    on conflict(week_start,item_key) do update set checked=excluded.checked;

  perform set_config('request.jwt.claim.sub', b::text, true);
  if (select count(*) from public.recipes) <> recipe_count
    or not exists(select 1 from public.shopping_checks where item_key='sharing-test' and checked) then
    raise exception 'Account B cannot read account A changes';
  end if;
  update public.recipes set tags=array['__meal_type:soup'] where id=r;
  if not found then raise exception 'Account B cannot register meal type'; end if;
  insert into public.meal_plan_entries(user_id,plan_date,meal_slot,recipe_id)
    values(b,'2999-01-01','main',r)
    on conflict(plan_date,meal_slot) do update set recipe_id=excluded.recipe_id;
  insert into public.shopping_checks(user_id,week_start,item_key,checked)
    values(b,'2999-01-01','sharing-test',false)
    on conflict(week_start,item_key) do update set checked=excluded.checked;
  if (select count(*) from public.meal_plan_entries where plan_date='2999-01-01' and meal_slot='main') <> 1
    or (select count(*) from public.shopping_checks where item_key='sharing-test') <> 1 then
    raise exception 'Cross-account upsert created duplicates';
  end if;
  if exists(select 1 from public.profiles where id=a) then raise exception 'Other profile exposed'; end if;
  perform set_config('request.jwt.claim.sub', a::text, true);
  if not exists(select 1 from public.recipes where id=r and tags=array['__meal_type:soup'])
    or not exists(select 1 from public.shopping_checks where item_key='sharing-test' and not checked) then
    raise exception 'Account A cannot see account B changes';
  end if;
  delete from public.meal_plan_entries where plan_date='2999-01-01' and meal_slot='main';
  if not found then raise exception 'Shared delete failed'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  begin
    if exists(select 1 from public.recipes) or exists(select 1 from public.meal_plan_entries)
      or exists(select 1 from public.shopping_checks) then raise exception 'Anonymous data exposed'; end if;
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
end $$;
select 'PASS: migration preservation, two-account reads/writes, unique upserts, private profiles, anonymous isolation' as result;
