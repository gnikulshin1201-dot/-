-- Run once in the Supabase SQL Editor. No passwords or privileged keys in this file.
begin;

create table if not exists public.schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  constraint lessons_array check (jsonb_typeof(data) = 'array'),
  constraint lessons_limit check (jsonb_array_length(data) <= 5000)
);
alter table public.schedules enable row level security;
revoke all on public.schedules from anon;
revoke all on public.schedules from authenticated;
grant select, insert, update on public.schedules to authenticated;
drop policy if exists "Read own schedule" on public.schedules;
drop policy if exists "Create own schedule" on public.schedules;
drop policy if exists "Update own schedule" on public.schedules;

create policy "Read own schedule" on public.schedules for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own schedule" on public.schedules for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own schedule" on public.schedules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
