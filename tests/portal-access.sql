\set ON_ERROR_STOP on
-- Teacher enrolls two independently registered students and assigns lessons/files.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.portal_enroll_student('anna@example.com');
select public.portal_enroll_student('ivan@example.com');
insert into public.portal_lessons(id,teacher_id,student_id,lesson_date,start_time,duration,subject,topic,homework) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-10-29','10:00',60,'Русский язык','Сочинение','Прочитать текст'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','2026-10-29','11:00',60,'Литература','Пушкин','Выучить стихотворение');
insert into storage.objects(bucket_id,name) values
 ('homework','30000000-0000-0000-0000-000000000001/anna.pdf'),
 ('homework','30000000-0000-0000-0000-000000000002/ivan.pdf');
do $$begin
  if (select count(*) from public.portal_lessons)<>2 then raise exception 'teacher cannot read own lessons'; end if;
  if (select count(*) from public.portal_profiles)<>3 then raise exception 'teacher cannot see enrolled students'; end if;
  begin
    insert into public.portal_lessons(teacher_id,student_id,lesson_date,start_time,duration,subject,topic)
    values(auth.uid(),'20000000-0000-0000-0000-000000000001','2026-10-29','10:30',60,'Русский язык','Overlap');
    raise exception 'server accepted overlap';
  exception when exclusion_violation then null; end;
  update public.portal_lessons set homework='Новое задание' where id='30000000-0000-0000-0000-000000000001' and version=1;
  if (select version from public.portal_lessons where id='30000000-0000-0000-0000-000000000001')<>2 then raise exception 'version not incremented'; end if;
  update public.portal_lessons set homework='stale overwrite' where id='30000000-0000-0000-0000-000000000001' and version=1;
  if found then raise exception 'stale version overwrote homework'; end if;
end$$;
commit;

-- Student Anna can see exactly her own lesson/file and cannot escalate privileges.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
do $$declare n int;begin
  if (select count(*) from public.portal_lessons)<>1 then raise exception 'student leaked another lesson'; end if;
  if (select count(*) from storage.objects)<>1 then raise exception 'student leaked another file'; end if;
  if exists(select 1 from public.portal_lessons where student_id<>auth.uid()) then raise exception 'foreign student visible'; end if;
  if exists(select 1 from storage.objects where name like '%ivan%') then raise exception 'foreign file visible'; end if;
  if (select count(*) from public.portal_profiles)<>1 then raise exception 'foreign profiles visible'; end if;
  update public.portal_lessons set homework='Tampered'; get diagnostics n=row_count;
  if n<>0 then raise exception 'student can change homework'; end if;
  delete from public.portal_lessons; get diagnostics n=row_count;
  if n<>0 then raise exception 'student can delete lessons'; end if;
  begin
    update public.portal_profiles set role='teacher' where id=auth.uid();
    raise exception 'student can become teacher';
  exception when insufficient_privilege then null;end;
  begin
    perform public.portal_enroll_student('ivan@example.com');
    raise exception 'student can enroll another student';
  exception when insufficient_privilege then null;end;
  begin
    insert into storage.objects(bucket_id,name)values('homework','30000000-0000-0000-0000-000000000001/unauthorized.txt');
    raise exception 'student can upload homework';
  exception when insufficient_privilege then null;end;
  begin
    insert into public.portal_lessons(teacher_id,student_id,lesson_date,start_time,duration,subject,topic)
    values('10000000-0000-0000-0000-000000000001',auth.uid(),'2026-10-30','13:00',60,'Русский язык','Unauthorized');
    raise exception 'student can create lesson';
  exception when insufficient_privilege then null;end;
  update public.portal_profiles set display_name='Анна Петрова' where id=auth.uid();
  if (select display_name from public.portal_profiles where id=auth.uid())<>'Анна Петрова' then raise exception 'cannot update own name';end if;
end$$;
commit;

-- Anonymous users have no table access.
begin;
set local role anon;
do $$begin
  begin perform * from public.portal_lessons;raise exception 'anonymous can read lessons';exception when insufficient_privilege then null;end;
  begin perform public.portal_enroll_student('anna@example.com');raise exception 'anonymous can enroll';exception when insufficient_privilege then null;end;
end$$;
commit;
select 'PASS: teacher/student/anonymous access, private files, no role escalation, overlap, optimistic updates, display name' as result;
-- Signup metadata cannot assign a privileged role.
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-0000-0000-000000000003','test-new@example.com','{"display_name":"Новый ученик","role":"teacher"}');
do $$begin
  if (select role from public.portal_profiles where id='20000000-0000-0000-0000-000000000003')<>'student' then
    raise exception 'signup metadata can assign teacher role';
  end if;
end$$;
