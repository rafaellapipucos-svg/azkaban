begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- Alice owns Casa A, Bea owns Casa B, Duda is a member of both, Caio is admin of Casa A, Eva is outside.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bea@test.local', '{"display_name": "Bea"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@test.local', '{"display_name": "Caio"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local', '{"display_name": "Eva"}');

create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'Casa B', 'family', '00000000-0000-0000-0000-00000000000b');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'member');

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', '🏠', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000b', null, 'Casa B', 'teal', '🏠', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000d', (select id from public.areas where key = 'work'),
    null, '00000000-0000-0000-0000-00000000000d', 'Freela', 'violet', '💼', '00000000-0000-0000-0000-00000000000d');

insert into public.group_invites (id, group_id, code, expires_at, max_uses, created_by) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'VALID222', now() + interval '1 day', 1, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'EXPIRED2', now() - interval '1 day', null, '00000000-0000-0000-0000-00000000000a');

-- Signup and owner triggers
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Alice', 'signup creates a profile');
select is((select role::text from public.group_members where group_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000a'), 'owner', 'creating a group makes the creator owner');

-- Member of two groups: the Casa A admin sees nothing of Casa B
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.groups), 1::bigint, 'admin of A sees only group A');
select is((select count(*) from public.contexts where group_id = '10000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin of A sees no context of B');
select is((select count(*) from public.contexts where owner_user_id = '00000000-0000-0000-0000-00000000000d'), 0::bigint, 'admin of A sees no personal context of a member');
select is((select count(*) from public.group_members where group_id = '10000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin of A sees no members of B');
select is((select count(*) from public.group_member_profiles('10000000-0000-0000-0000-00000000000b')), 0::bigint, 'admin of A cannot list profiles of B');
select is((select count(*) from public.profiles), 1::bigint, 'a user reads only their own profile row');
select is((select count(*) from public.group_member_profiles('10000000-0000-0000-0000-00000000000a')), 3::bigint, 'co-members are listed through the safe function');

-- The shared member sees both, and still only their own personal context
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.groups), 2::bigint, 'shared member sees both groups');
select is((select count(*) from public.contexts), 3::bigint, 'shared member sees both group contexts and their own');

-- Outsider
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.groups), 0::bigint, 'outsider sees no groups');
select is((select count(*) from public.group_invites), 0::bigint, 'outsider cannot list invites');

-- Privilege escalation attempts
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'admin')$$, '42501', null, 'members cannot be inserted directly');
select throws_ok($$update public.group_members set role = 'owner' where user_id = auth.uid()$$, '42501', null, 'role cannot be updated directly');
select throws_ok($$select public.set_member_role('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'admin')$$, '42501', null, 'member cannot promote themselves');
select throws_ok($$select public.transfer_group_ownership('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d')$$, '42501', null, 'member cannot take ownership');
select throws_ok($$update public.groups set owner_id = auth.uid()$$, '42501', null, 'owner_id cannot be updated directly');
select lives_ok($$update public.groups set name = 'Hack' where id = '10000000-0000-0000-0000-00000000000a'$$, 'update by a member runs');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select name from public.groups where id = '10000000-0000-0000-0000-00000000000a'), 'Casa A', 'member update changed nothing');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon) values ((select id from public.areas where key = 'home'), '10000000-0000-0000-0000-00000000000a', 'X', 'teal', 'x')$$, '42501', 'new row violates row-level security policy for table "contexts"', 'member cannot create a group context');
select lives_ok($$insert into public.contexts (area_id, owner_user_id, name, color_token, icon) values ((select id from public.areas where key = 'home'), auth.uid(), 'Pessoal', 'teal', 'x')$$, 'member can create a personal context');
select throws_ok($$insert into public.contexts (area_id, owner_user_id, name, color_token, icon) values ((select id from public.areas where key = 'home'), '00000000-0000-0000-0000-00000000000a', 'X', 'teal', 'x')$$, '42501', 'new row violates row-level security policy for table "contexts"', 'nobody can create a personal context for someone else');

-- Admin limits
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.set_member_role('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'admin')$$, '42501', null, 'admin cannot change roles');
select throws_ok($$insert into public.group_invites (group_id, role, expires_at) values ('10000000-0000-0000-0000-00000000000a', 'admin', now() + interval '1 day')$$, '42501', 'new row violates row-level security policy for table "group_invites"', 'admin cannot invite another admin');
select lives_ok($$insert into public.group_invites (group_id, expires_at) values ('10000000-0000-0000-0000-00000000000a', now() + interval '1 day')$$, 'admin can invite a member');
select matches((select code from public.group_invites where created_by = auth.uid()), '^[A-Z2-9]{10}$', 'generated code has the expected shape');
select lives_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon) values ((select id from public.areas where key = 'home'), '10000000-0000-0000-0000-00000000000a', 'Cozinha', 'teal', 'x')$$, 'admin can create a group context');
select lives_ok($$delete from public.group_members where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'attempt to remove the owner runs');
select is((select count(*) from public.group_members where user_id = '00000000-0000-0000-0000-00000000000a'), 1::bigint, 'owner cannot be removed');

-- Invites
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select group_name from public.get_invite_preview('VALID222')), 'Casa A', 'valid code previews the group');
select is((select count(*) from public.get_invite_preview('EXPIRED2')), 0::bigint, 'expired code shows nothing');
select throws_ok($$select public.accept_invite('EXPIRED2')$$, 'P0002', 'invite_invalid', 'expired code is rejected');
select is(public.accept_invite('valid222'), '10000000-0000-0000-0000-00000000000a'::uuid, 'valid code joins, case-insensitively');
select is((select count(*) from public.groups), 1::bigint, 'joining reveals only that group');
select is((select role::text from public.group_members where user_id = auth.uid()), 'member', 'invite grants its role');

-- max_uses
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'fred@test.local');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok($$select public.accept_invite('VALID222')$$, 'P0002', 'invite_invalid', 'used-up code is rejected');

select lives_ok($$insert into public.groups (name, type) values ('Nova', 'other')$$, 'any user can create a group');

-- Admin invites stay with whoever can grant the admin role
reset role;
update public.group_members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000e';
insert into public.group_invites (group_id, code, role, expires_at, created_by, revoked_at) values
  ('10000000-0000-0000-0000-00000000000a', 'ADMINCODE2', 'admin', now() + interval '1 day', '00000000-0000-0000-0000-00000000000a', null),
  ('10000000-0000-0000-0000-00000000000a', 'MEMBERCOD2', 'member', now() + interval '1 day', '00000000-0000-0000-0000-00000000000a', null),
  ('10000000-0000-0000-0000-00000000000a', 'REVOKEDCD2', 'member', now() + interval '1 day', '00000000-0000-0000-0000-00000000000a', now());

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.group_invites where role = 'admin'), 0::bigint, 'admin cannot read admin invite codes');
select lives_ok($$update public.group_invites set revoked_at = now() where code = 'ADMINCODE2'$$, 'admin revoke of an admin invite runs');
select throws_ok($$update public.group_invites set revoked_at = null where code = 'REVOKEDCD2'$$, '42501', 'new row violates row-level security policy for table "group_invites"', 'a revoked invite cannot be reactivated');
select throws_ok($$insert into public.group_invites (group_id, expires_at) values ('10000000-0000-0000-0000-00000000000a', 'infinity')$$, '42501', 'new row violates row-level security policy for table "group_invites"', 'invite lifetime is capped');
select lives_ok($$delete from public.group_members where user_id = '00000000-0000-0000-0000-00000000000e'$$, 'admin removal of an admin runs');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select revoked_at from public.group_invites where code = 'ADMINCODE2'), null, 'admin invite stayed active');
select is((select count(*) from public.group_members where user_id = '00000000-0000-0000-0000-00000000000e'), 1::bigint, 'admin cannot remove another admin');

-- A failed transfer leaves the owner in place
select throws_ok($$select public.transfer_group_ownership('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f')$$, 'P0002', 'member_not_found', 'ownership cannot go to a non-member');
select is((select role::text from public.group_members where user_id = auth.uid() and group_id = '10000000-0000-0000-0000-00000000000a'), 'owner', 'owner stays after a failed transfer');

-- Removal closes the door behind the member
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$delete from public.group_members where user_id = '00000000-0000-0000-0000-00000000000d' and group_id = '10000000-0000-0000-0000-00000000000a'$$, 'admin can remove a member');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.group_members where user_id = '00000000-0000-0000-0000-00000000000d' and group_id = '10000000-0000-0000-0000-00000000000a'), 0::bigint, 'member is gone');
select is((select count(*) from public.group_invites where group_id = '10000000-0000-0000-0000-00000000000a' and revoked_at is null), 0::bigint, 'removal revokes the group invites');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.accept_invite('MEMBERCOD2')$$, 'P0002', 'invite_invalid', 'removed member cannot rejoin with an old link');

-- Leaving on your own does not touch invites
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.group_invites (group_id, expires_at) values ('10000000-0000-0000-0000-00000000000a', now() + interval '1 day');
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select lives_ok($$delete from public.group_members where user_id = auth.uid()$$, 'member can leave');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.group_invites where group_id = '10000000-0000-0000-0000-00000000000a' and revoked_at is null), 1::bigint, 'leaving keeps invites active');

-- Guards for tables added later
reset role;
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'every public table has RLS');
select is((select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 0::bigint, 'anon has no table privileges');

-- History columns do not block account deletion (LGPD)
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000c'$$, 'a user with invites created can be deleted');

select * from finish();
rollback;
