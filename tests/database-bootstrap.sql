-- Local PostgreSQL stand-ins for Supabase's managed auth/storage schemas.
do $$begin create role authenticated; exception when duplicate_object then null; end$$;
do $$begin create role anon; exception when duplicate_object then null; end$$;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','g.nikulshin1201@gmail.com','{"display_name":"Валентина"}'),
 ('20000000-0000-0000-0000-000000000001','anna@example.com','{"display_name":"Анна"}'),
 ('20000000-0000-0000-0000-000000000002','ivan@example.com','{"display_name":"Иван"}');
