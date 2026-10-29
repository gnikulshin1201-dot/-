-- Выполните ПОСЛЕ portal.sql. Пользователь уже должен быть зарегистрирован.
begin;
do $$
declare teacher_uuid uuid;
begin
  select id into teacher_uuid from auth.users where lower(email)='g.nikulshin1201@gmail.com';
  if teacher_uuid is null then raise exception 'Сначала зарегистрируйте g.nikulshin1201@gmail.com на сайте'; end if;
  update public.portal_profiles set role='teacher', display_name='Валентина' where id=teacher_uuid;
  if not found then raise exception 'Сначала выполните portal.sql'; end if;
end $$;
commit;
-- Позже смените email ЭТОГО пользователя в Authentication → Users.
-- Не удаляйте пользователя и не создавайте нового: связи хранятся по его UUID.
