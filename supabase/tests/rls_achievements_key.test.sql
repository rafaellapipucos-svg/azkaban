-- BL-33 (ADR-0010 section 14, SEG6-6 corrected). The DELETE that Realtime sends to every subscriber of
-- user_achievements, without RLS, carries the replica identity of the row: it must not hold user_id.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'ak-ana@test.local', '{"display_name": "Ana"}'),
  ('00000000-0000-0000-0000-0000000007b1', 'ak-bia@test.local', '{"display_name": "Bia"}');

create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.pg() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

-- The columns of the old row a DELETE puts in the WAL, and so in the Realtime payload: the primary key
-- for the default identity, the index for "using index", every column for "full", none for "nothing".
create function pg_temp.delete_columns(p_table regclass) returns text[] language sql as $$
  select coalesce(array_agg(a.attname::text order by a.attname), '{}')
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.oid = p_table
    and (c.relreplident = 'f'
      or exists (
        select 1 from pg_index i
        where i.indrelid = c.oid and a.attnum = any (i.indkey)
          and ((c.relreplident = 'd' and i.indisprimary) or (c.relreplident = 'i' and i.indisreplident))
      ));
$$;

-- ===== The DELETE payload =====
select is(pg_temp.delete_columns('public.user_achievements'), array['id'],
  'a DELETE of user_achievements carries only the opaque id');
select ok(not 'user_id' = any (pg_temp.delete_columns('public.user_achievements')), 'and never user_id');
select ok(not 'achievement_key' = any (pg_temp.delete_columns('public.user_achievements')), 'nor the achievement');
select is(pg_temp.delete_columns('public.xp_events'), array['id'], 'the same as xp_events');
select ok(exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_achievements'),
  'the table is still published, for the celebration of the insert');

-- ===== A grant is still once =====
select public.grant_achievements('00000000-0000-0000-0000-0000000007a1');
insert into public.user_achievements (user_id, achievement_key) values ('00000000-0000-0000-0000-0000000007a1', 'first_task');
select throws_ok($$insert into public.user_achievements (user_id, achievement_key)
  values ('00000000-0000-0000-0000-0000000007a1', 'first_task')$$, '23505', null, 'the pair stays unique');
select public.grant_achievements('00000000-0000-0000-0000-0000000007a1');
select is((select count(*) from public.user_achievements where user_id = '00000000-0000-0000-0000-0000000007a1'), 1::bigint,
  'granting again writes nothing');
insert into public.user_achievements (user_id, achievement_key) values ('00000000-0000-0000-0000-0000000007b1', 'first_task');
select isnt((select id from public.user_achievements where user_id = '00000000-0000-0000-0000-0000000007a1'),
  (select id from public.user_achievements where user_id = '00000000-0000-0000-0000-0000000007b1'), 'each row has its own id');

-- ===== RLS and grants did not change =====
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select is((select count(*) from public.user_achievements), 1::bigint, 'Ana reads her achievement');
select is((select count(*) from public.user_achievements where user_id <> auth.uid()), 0::bigint, 'and nobody else''s');
select throws_ok($$insert into public.user_achievements (user_id, achievement_key) values (auth.uid(), 'streak_30')$$,
  '42501', 'permission denied for table user_achievements', 'she grants none to herself');
select throws_ok($$update public.user_achievements set id = gen_random_uuid()$$,
  '42501', 'permission denied for table user_achievements', 'nor rewrites the id');
select throws_ok($$delete from public.user_achievements$$,
  '42501', 'permission denied for table user_achievements', 'nor deletes one');
select pg_temp.pg();

-- ===== The account goes, the rows go =====
delete from auth.users where id = '00000000-0000-0000-0000-0000000007a1';
select is((select count(*) from public.user_achievements where user_id = '00000000-0000-0000-0000-0000000007a1'), 0::bigint,
  'the cascade still deletes them');

select * from finish();
rollback;
