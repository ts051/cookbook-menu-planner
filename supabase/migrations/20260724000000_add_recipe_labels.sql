alter table public.recipes
  add column if not exists label text;

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

alter table public.user_labels enable row level security;

grant select, insert, update, delete
on table public.user_labels
to authenticated;

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
