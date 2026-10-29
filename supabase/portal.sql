-- Ученики, занятия и закрытые вложения. Старую таблицу schedules не изменяет.
begin;
create table if not exists public.portal_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  role text not null default 'student' check (role in ('teacher', 'student'))
);
create table if not exists public.portal_enrollments (
  teacher_id uuid not null references public.portal_profiles(id),
  student_id uuid not null references public.portal_profiles(id),
  primary key (teacher_id, student_id),
  check (teacher_id <> student_id)
);
create table if not exists public.portal_lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  student_id uuid not null,
  lesson_date date not null,
  start_time time not null,
  duration integer not null check (duration between 15 and 480),
  subject text not null check (subject in ('Русский язык', 'Литература')),
  topic text not null check (char_length(trim(topic)) between 1 and 120),
  homework text not null default '' check (char_length(homework) <= 10000),
  attention text not null default '' check (char_length(attention) <= 5000),
  version integer not null default 1,
  foreign key (teacher_id, student_id) references public.portal_enrollments(teacher_id, student_id),
  check (extract(epoch from start_time)/60 + duration <= 1440)
);
create index if not exists portal_lessons_teacher_date on public.portal_lessons(teacher_id, lesson_date);
create index if not exists portal_lessons_student_date on public.portal_lessons(student_id, lesson_date);

create or replace function public.portal_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.portal_profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''),120))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists portal_new_user on auth.users;
create trigger portal_new_user after insert on auth.users for each row execute function public.portal_create_profile();
insert into public.portal_profiles(id, display_name)
select id, left(coalesce(raw_user_meta_data->>'display_name',''),120) from auth.users
on conflict (id) do nothing;

create or replace function public.portal_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.portal_profiles where id = auth.uid() and role = 'teacher');
$$;
create or replace function public.portal_enroll_student(student_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  if not public.portal_is_teacher() then raise exception 'Teacher access required' using errcode='42501'; end if;
  select u.id into target_id from auth.users u join public.portal_profiles p on p.id=u.id
  where lower(u.email)=lower(trim(student_email)) and p.role='student';
  if target_id is null then raise exception 'Student must register first' using errcode='P0001'; end if;
  insert into public.portal_enrollments(teacher_id,student_id) values(auth.uid(),target_id) on conflict do nothing;
  return target_id;
end; $$;

-- Проверка пересечений на сервере, в том числе при одновременном сохранении.
create or replace function public.portal_check_lesson() returns trigger
language plpgsql security definer set search_path = '' as $$
declare minute_start int; first_lock bigint; second_lock bigint;
begin
  if auth.uid() is not null and (new.teacher_id<>auth.uid() or not public.portal_is_teacher()) then
    raise exception 'Teacher access required' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.teacher_id<>old.teacher_id or new.student_id<>old.student_id) then
    raise exception 'Lesson participants cannot be changed' using errcode='42501';
  end if;
  first_lock := hashtextextended(least(new.teacher_id::text,new.student_id::text)||new.lesson_date::text,0);
  second_lock := hashtextextended(greatest(new.teacher_id::text,new.student_id::text)||new.lesson_date::text,0);
  perform pg_advisory_xact_lock(first_lock);
  perform pg_advisory_xact_lock(second_lock);
  minute_start := extract(epoch from new.start_time)::int / 60;
  if exists(select 1 from public.portal_lessons l where l.id<>new.id and l.lesson_date=new.lesson_date
    and (l.teacher_id=new.teacher_id or l.student_id=new.student_id)
    and int4range(extract(epoch from l.start_time)::int/60,extract(epoch from l.start_time)::int/60+l.duration,'[)')
        && int4range(minute_start,minute_start+new.duration,'[)')) then
    raise exception 'Overlapping lesson' using errcode='23P01';
  end if;
  new.version := case when tg_op='UPDATE' then old.version+1 else 1 end;
  return new;
end; $$;
drop trigger if exists portal_lesson_guard on public.portal_lessons;
create trigger portal_lesson_guard before insert or update on public.portal_lessons for each row execute function public.portal_check_lesson();

alter table public.portal_profiles enable row level security;
alter table public.portal_enrollments enable row level security;
alter table public.portal_lessons enable row level security;
revoke all on public.portal_profiles, public.portal_enrollments, public.portal_lessons from anon, authenticated;
grant select on public.portal_profiles, public.portal_enrollments, public.portal_lessons to authenticated;
grant update(display_name) on public.portal_profiles to authenticated;
grant insert, update, delete on public.portal_lessons to authenticated;
revoke all on function public.portal_create_profile(), public.portal_check_lesson(), public.portal_is_teacher(), public.portal_enroll_student(text) from public, anon;
grant execute on function public.portal_is_teacher(), public.portal_enroll_student(text) to authenticated;

drop policy if exists portal_profile_read on public.portal_profiles;
create policy portal_profile_read on public.portal_profiles for select to authenticated using (
  id=auth.uid() or exists(select 1 from public.portal_enrollments e where e.teacher_id=auth.uid() and e.student_id=id)
);
drop policy if exists portal_profile_name on public.portal_profiles;
create policy portal_profile_name on public.portal_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists portal_enrollment_read on public.portal_enrollments;
create policy portal_enrollment_read on public.portal_enrollments for select to authenticated using(teacher_id=auth.uid() or student_id=auth.uid());
drop policy if exists portal_lesson_read on public.portal_lessons;
create policy portal_lesson_read on public.portal_lessons for select to authenticated using(teacher_id=auth.uid() or student_id=auth.uid());
drop policy if exists portal_lesson_create on public.portal_lessons;
create policy portal_lesson_create on public.portal_lessons for insert to authenticated with check(teacher_id=auth.uid() and public.portal_is_teacher());
drop policy if exists portal_lesson_update on public.portal_lessons;
create policy portal_lesson_update on public.portal_lessons for update to authenticated using(teacher_id=auth.uid() and public.portal_is_teacher()) with check(teacher_id=auth.uid() and public.portal_is_teacher());
drop policy if exists portal_lesson_delete on public.portal_lessons;
create policy portal_lesson_delete on public.portal_lessons for delete to authenticated using(teacher_id=auth.uid() and public.portal_is_teacher());

-- Закрытый bucket: только изображения, PDF, TXT, DOC/DOCX, до 10 МБ на файл.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('homework','homework',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists portal_file_read on storage.objects;
create policy portal_file_read on storage.objects for select to authenticated using(bucket_id='homework' and exists(
  select 1 from public.portal_lessons l where l.id::text=(storage.foldername(name))[1] and (l.teacher_id=auth.uid() or l.student_id=auth.uid())
));
drop policy if exists portal_file_create on storage.objects;
create policy portal_file_create on storage.objects for insert to authenticated with check(bucket_id='homework' and public.portal_is_teacher() and exists(
  select 1 from public.portal_lessons l where l.id::text=(storage.foldername(name))[1] and l.teacher_id=auth.uid()
));
drop policy if exists portal_file_delete on storage.objects;
create policy portal_file_delete on storage.objects for delete to authenticated using(bucket_id='homework' and public.portal_is_teacher() and exists(
  select 1 from public.portal_lessons l where l.id::text=(storage.foldername(name))[1] and l.teacher_id=auth.uid()
));
commit;
