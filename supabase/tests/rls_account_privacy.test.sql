-- Account privacy (ADR-0012, sections 2, 3 and 6): the export, the deletion with the whole cascade from
-- auth.users, the revocation of the photo notice and the data_export counter. Users: D is deleted; A owns
-- the shared group S, where D is admin and C and E are members; D owns Solo alone; B owns Blocked, with A
-- in it; E only leaves a superseded proof on A's occurrence and is deleted by the bare cascade.
begin;
create extension if not exists pgtap with schema extensions;
select plan(97);

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid;
$$;
create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;
create function pg_temp.pg() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;
create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;
create function pg_temp.g(p_name text) returns uuid language sql as $$
  select current_setting('t.' || p_name)::uuid;
$$;
create function pg_temp.task(p_title text, p_ctx uuid, p_creator uuid, p_assignee uuid,
  p_vis public.task_visibility, p_photo boolean default false) returns uuid language plpgsql as $$
declare tid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility
  ) values (
    p_ctx, p_creator, p_assignee, p_title, 'timed', now() - interval '2 hours', 60, 'America/Sao_Paulo',
    '[]', p_photo, false, false, 'easy', 'normal', p_vis
  ) returning id into tid;
  return tid;
end;
$$;
create function pg_temp.tid(p_title text) returns uuid language sql as $$
  select id from public.tasks where title = p_title;
$$;
-- The detail of the error the statement raises, or null.
create function pg_temp.detail(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end;
$$;
create function pg_temp.occ(p_title text) returns uuid language sql as $$
  select o.id from public.task_occurrences o join public.tasks t on t.id = o.task_id where t.title = p_title;
$$;
-- A challenge and a proof straight in the tables, as proof-validate would leave them.
create function pg_temp.proof(p_user uuid, p_occ uuid, p_sha text, p_superseded boolean default false)
returns uuid language plpgsql as $$
declare ch uuid; pid uuid;
begin
  insert into public.proof_challenges (occurrence_id, user_id, expires_at, used_at)
  values (p_occ, p_user, now() + interval '5 minutes', now()) returning id into ch;
  insert into public.task_proofs (occurrence_id, challenge_id, user_id, storage_path, sha256, size_bytes,
    width_px, height_px, captured_at_device, received_at, clock_delta_seconds, flags, platform, app_version,
    user_agent, review_status, superseded_at)
  values (p_occ, ch, p_user, p_occ || '/' || ch || '.jpg', lpad(p_sha, 64, '0'), 1000, 640, 480, now(), now(), 0,
    '{}', 'web', '1.0.0', 'test', 'unreviewed', case when p_superseded then now() end)
  returning id into pid;
  return pid;
end;
$$;
-- Every public table with a row that mentions the uuid anywhere, as text.
create function pg_temp.mentions(p_id uuid) returns text language plpgsql as $$
declare r record; n bigint; acc text[] := '{}';
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    order by c.relname loop
    execute format('select count(*) from public.%I x where to_jsonb(x)::text like %L', r.relname, '%' || p_id || '%')
      into n;
    if n > 0 then acc := acc || (r.relname || ':' || n); end if;
  end loop;
  return array_to_string(acc, ',');
end;
$$;

-- D is deleted. O owns the shared group S, where D is admin; M is a member there. D owns Solo alone.
-- B owns Blocked with O in it. E has only a superseded proof on O's occurrence.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@del.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['d', 'a', 'c', 'b', 'e']) k;

insert into public.groups (id, name, type, owner_id) values
  ('40000000-0000-0000-0000-000000000001', 'Shared', 'family', pg_temp.u('a')),
  ('40000000-0000-0000-0000-000000000002', 'Solo', 'family', pg_temp.u('d')),
  ('40000000-0000-0000-0000-000000000003', 'Blocked', 'company', pg_temp.u('b'));
insert into public.group_members (group_id, user_id, role, invited_by) values
  ('40000000-0000-0000-0000-000000000001', pg_temp.u('d'), 'admin', pg_temp.u('a')),
  ('40000000-0000-0000-0000-000000000001', pg_temp.u('c'), 'member', pg_temp.u('d')),
  ('40000000-0000-0000-0000-000000000001', pg_temp.u('e'), 'member', pg_temp.u('a')),
  ('40000000-0000-0000-0000-000000000003', pg_temp.u('a'), 'member', pg_temp.u('b'));
insert into public.group_invites (group_id, code, expires_at, created_by) values
  ('40000000-0000-0000-0000-000000000001', 'DELINV0001', now() + interval '1 day', pg_temp.u('d')),
  ('40000000-0000-0000-0000-000000000001', 'DELINV0002', now() + interval '1 day', pg_temp.u('a')),
  ('40000000-0000-0000-0000-000000000002', 'DELINV0003', now() + interval '1 day', pg_temp.u('d'));

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('50000000-0000-0000-0000-000000000001', (select id from public.areas where key = 'home'), null, pg_temp.u('d'), 'Mine', 'teal', 'x', pg_temp.u('d')),
  ('50000000-0000-0000-0000-000000000002', (select id from public.areas where key = 'home'), '40000000-0000-0000-0000-000000000001', null, 'Shared ctx', 'teal', 'x', pg_temp.u('d')),
  ('50000000-0000-0000-0000-000000000003', (select id from public.areas where key = 'home'), '40000000-0000-0000-0000-000000000002', null, 'Solo ctx', 'teal', 'x', pg_temp.u('d'));

-- D accepted the notice; WhatsApp and the phone are on.
update public.profiles set proof_consent_version = 3, proof_consent_at = now(), phone_e164 = '+5511999990001',
  phone_verified_at = now(), whatsapp_opt_in_at = now(), whatsapp_opt_in_version = 1
where id = pg_temp.u('d');
insert into public.proof_consents (user_id, version) values (pg_temp.u('d'), 2);
update public.profiles set proof_consent_version = 3, proof_consent_at = now() where id = pg_temp.u('a');
insert into public.proof_consents (user_id, version) values (pg_temp.u('a'), 2);

-- Tasks: D's own, D's in the shared group, one D made for O, one O made for D, one in Solo, photo ones.
select pg_temp.task('Own', '50000000-0000-0000-0000-000000000001', pg_temp.u('d'), pg_temp.u('d'), 'private');
select pg_temp.task('ForD', '50000000-0000-0000-0000-000000000002', pg_temp.u('a'), pg_temp.u('d'), 'group');
select pg_temp.task('ForO', '50000000-0000-0000-0000-000000000002', pg_temp.u('d'), pg_temp.u('a'), 'group');
select pg_temp.task('ForO2', '50000000-0000-0000-0000-000000000002', pg_temp.u('a'), pg_temp.u('a'), 'group');
select pg_temp.task('SoloT', '50000000-0000-0000-0000-000000000003', pg_temp.u('d'), pg_temp.u('d'), 'group', true);
select pg_temp.task('PhotoO', '50000000-0000-0000-0000-000000000002', pg_temp.u('a'), pg_temp.u('a'), 'group', true);
select pg_temp.task('PhotoD', '50000000-0000-0000-0000-000000000002', pg_temp.u('a'), pg_temp.u('d'), 'group', true);

-- Statuses, through the RPC: history, XP, the day, notifications to the creator.
select pg_temp.login(pg_temp.u('d'));
select public.set_occurrence_status(pg_temp.occ('Own'), 'done', 'pending', null);
select public.set_occurrence_status(pg_temp.occ('ForD'), 'done', 'pending', null);
-- D, as admin, marks O's task: the history of O's task keeps the row, without the name.
select public.set_occurrence_status(pg_temp.occ('ForO2'), 'done', 'pending', null);
select pg_temp.pg();
select pg_temp.login(pg_temp.u('a'));
select public.set_occurrence_status(pg_temp.occ('ForO'), 'done', 'pending', null);
select pg_temp.pg();

-- Proofs: D's on Solo and on PhotoD; D's superseded one on O's occurrence, and E's; O's proof D reviewed.
select pg_temp.sv('p_solo', pg_temp.proof(pg_temp.u('d'), pg_temp.occ('SoloT'), 'a1')::text);
select pg_temp.sv('p_d', pg_temp.proof(pg_temp.u('d'), pg_temp.occ('PhotoD'), 'a2')::text);
select pg_temp.sv('p_sup', pg_temp.proof(pg_temp.u('d'), pg_temp.occ('PhotoO'), 'a3', true)::text);
select pg_temp.sv('p_sup_e', pg_temp.proof(pg_temp.u('e'), pg_temp.occ('PhotoO'), 'a4', true)::text);
select pg_temp.sv('p_o', pg_temp.proof(pg_temp.u('a'), pg_temp.occ('PhotoO'), 'a5')::text);
update public.task_proofs set review_status = 'approved', reviewed_by = pg_temp.u('d'), reviewed_at = now(),
  review_note = 'ok' where id = pg_temp.g('p_o');
-- PhotoD goes green with its proof, so an occurrence with a current proof goes in the cascade too.
update public.task_occurrences set current_proof_id = pg_temp.g('p_d') where id = pg_temp.occ('PhotoD');
select pg_temp.login(pg_temp.u('d'));
select public.set_occurrence_status(pg_temp.occ('PhotoD'), 'missed', 'pending', null);
select pg_temp.pg();

-- The bell, the outbox, preferences, push, the phone and WhatsApp.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
values (pg_temp.u('d'), 'https://fcm.googleapis.com/fcm/send/abc', repeat('p', 87), repeat('k', 22), 'ua');
select pg_temp.service();
select public.enqueue_notification(pg_temp.u('d'), 'task_reminder', pg_temp.occ('PhotoD'),
  '40000000-0000-0000-0000-000000000001', jsonb_build_object('title', 'PhotoD'), 'del-test-1');
select pg_temp.pg();
insert into public.notifications (user_id, type, data, dedupe_key)
values (pg_temp.u('a'), 'occurrence_resolved', jsonb_build_object('actorId', pg_temp.u('d')), 'del-test-o');
insert into public.notification_preferences (user_id, type, channel, enabled)
values (pg_temp.u('d'), 'task_reminder', 'web_push', false);
insert into public.task_rule_changes (task_id, field, from_value, to_value, changed_by)
values (pg_temp.tid('ForO'), 'requires_photo_proof', 'false', 'true', pg_temp.u('d'));
insert into public.phone_verifications (user_id, phone_e164, code_hash, expires_at)
values (pg_temp.u('d'), '+5511999990001', repeat('b', 64), now() + interval '10 minutes');
insert into public.whatsapp_messages (user_id, outbox_id, purpose, template, provider, provider_message_id)
select pg_temp.u('d'), o.id, 'notification', 'azk_status', 'console', 'del-msg-1'
from public.notification_outbox o where o.user_id = pg_temp.u('d') limit 1;
insert into public.user_achievements (user_id, achievement_key)
select pg_temp.u('d'), key from public.achievements order by sort_order limit 1
on conflict do nothing;

-- Shopping: a personal list, a shared list D made, completed by D, with D's items checked by D, and an
-- item of O that D checked.
select pg_temp.login(pg_temp.u('d'));
select public.create_shopping_list('60000000-0000-0000-0000-000000000001', null, 'Mine');
select public.create_shopping_list('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Shared');
insert into public.shopping_list_items (id, list_id, name, category, quantity, unit) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Rice', 'pantry', 1, 'unit'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Milk', 'dairy', 1, 'unit');
select public.add_catalog_item_to_list('60000000-0000-0000-0000-000000000001',
  (select id from public.shopping_catalog_items where owner_user_id = pg_temp.u('d') order by sort_order limit 1),
  1, '62000000-0000-0000-0000-000000000001');
select pg_temp.pg();
select pg_temp.login(pg_temp.u('a'));
insert into public.shopping_list_items (id, list_id, name, category, quantity, unit) values
  ('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', 'Bread', 'bakery', 1, 'unit');
select pg_temp.pg();
select pg_temp.login(pg_temp.u('d'));
select public.set_shopping_item_checked('61000000-0000-0000-0000-000000000002', true);
select public.set_shopping_item_checked('61000000-0000-0000-0000-000000000003', true);
select public.complete_shopping_list('60000000-0000-0000-0000-000000000002');
select pg_temp.pg();

-- ===== The barriers =====
select ok(not has_function_privilege('authenticated', 'public.export_user_data(uuid)', 'execute'),
  'authenticated cannot execute export_user_data');
select ok(not has_function_privilege('anon', 'public.export_user_data(uuid)', 'execute'), 'nor anon');
select ok(has_function_privilege('service_role', 'public.export_user_data(uuid)', 'execute'), 'service_role can');
select is(
  (select count(*)::int from unnest(array['public.account_deletion_preview(uuid)', 'public.begin_account_deletion(uuid)',
     'public.finish_account_deletion(uuid, int)', 'public.complete_account_deletion(uuid, int)']) f
   where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
     or not has_function_privilege('service_role', f, 'execute')),
  0, 'the four deletion functions are for the service role only');
select ok(has_function_privilege('authenticated', 'public.revoke_proof_consent()', 'execute')
  and not has_function_privilege('anon', 'public.revoke_proof_consent()', 'execute'),
  'revoke_proof_consent is for a signed-in user');
select is((select relrowsecurity from pg_class where oid = 'public.account_deletions'::regclass), true,
  'RLS is on for account_deletions');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.export_user_data(auth.uid())$$, '42501', null, 'a client cannot export, not even itself');
select throws_ok($$select public.begin_account_deletion(auth.uid())$$, '42501', null, 'nor start its own deletion');
select throws_ok($$select public.account_deletion_preview('00000000-0000-0000-0000-00000000000b')$$, '42501', null,
  'nor read the preview of someone else');
select throws_ok($$select count(*) from public.account_deletions$$, '42501', null, 'nor read account_deletions');
select pg_temp.pg();

-- ===== Revoking the photo notice =====
select pg_temp.login(pg_temp.u('c'));
select public.record_proof_consent(3);
select public.revoke_proof_consent();
select pg_temp.pg();
select is((select proof_consent_version from public.profiles where id = pg_temp.u('c')), null,
  'revoking clears the version in the profile');
select is((select proof_consent_at from public.profiles where id = pg_temp.u('c')), null, 'and the time');
select is((select count(*)::int from public.proof_consents where user_id = pg_temp.u('c') and revoked_at is not null), 1,
  'the acceptance stays, marked revoked');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.revoke_proof_consent()$$, 'revoking again is a no-op');
select public.record_proof_consent(3);
select is((select count(*)::int from public.proof_consents where user_id = auth.uid()), 2,
  'accepting again writes a new row: the history stays whole');
select is((select count(*)::int from public.proof_consents where user_id = auth.uid() and revoked_at is null), 1,
  'with one live acceptance');
select lives_ok($$select public.record_proof_consent(3)$$, 'accepting the live version again is a no-op');
select is((select count(*)::int from public.proof_consents where user_id = auth.uid()), 2, 'no row is added');
select throws_ok($$update public.proof_consents set revoked_at = now()$$, '42501', null,
  'the client does not revoke by writing the table');
select pg_temp.pg();
select throws_ok($$insert into public.proof_consents (user_id, version) values ('00000000-0000-0000-0000-00000000000c', 3)$$,
  '23505', null, 'two live rows of the same version are refused');
select throws_ok($$select public.revoke_proof_consent()$$, '42501', 'forbidden', 'without a user, forbidden');

-- The claim checks the acceptance again: a nonce issued before the revocation carries nothing after it.
select pg_temp.login(pg_temp.u('a'));
select pg_temp.sv('nonce', public.issue_proof_challenge(pg_temp.occ('PhotoO')) ->> 'nonce');
select public.revoke_proof_consent();
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PhotoO'))$$, 'P0001', 'proof_consent_required',
  'after revoking, no new challenge');
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('nonce'), '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'proof_consent_required', 'and the nonce issued before it is refused at the claim');
select pg_temp.pg();
select is((select used_at from public.proof_challenges where id = pg_temp.g('nonce')), null, 'which leaves it unused');
select pg_temp.login(pg_temp.u('a'));
select public.record_proof_consent(3);
select pg_temp.service();
select lives_ok($$select public.claim_proof_challenge(pg_temp.g('nonce'), '00000000-0000-0000-0000-00000000000a')$$,
  'accepted again, the same nonce is claimed');
select pg_temp.pg();

-- ===== data_export through consume_rate_limit =====
select pg_temp.service();
select lives_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-00000000000c', 'data_export'),
  public.consume_rate_limit('00000000-0000-0000-0000-00000000000c', 'data_export'),
  public.consume_rate_limit('00000000-0000-0000-0000-00000000000c', 'data_export')$$, 'three exports a day pass');
select throws_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-00000000000c', 'data_export')$$,
  'PT429', 'rate_limited', 'the fourth is rate_limited');
select pg_temp.pg();

-- ===== The export =====
select pg_temp.service();
select pg_temp.sv('export', public.export_user_data(pg_temp.u('d'))::text);
select throws_ok($$select public.export_user_data('00000000-0000-0000-0000-0000000000ff')$$, 'P0002', 'account_not_found',
  'an unknown account is account_not_found');
select pg_temp.pg();
create temp table ex as select current_setting('t.export')::jsonb as j;
select is((select array_agg(k order by k) from ex, jsonb_object_keys(j -> 'sections') k), array[
  'account', 'achievements', 'contexts', 'created_invites', 'group_memberships', 'notification_preferences',
  'notifications', 'occurrences', 'owned_groups', 'phone_verifications', 'profile', 'proof_consents', 'proof_reviews',
  'proofs', 'push_subscriptions', 'rule_changes', 'shopping_catalog_items', 'shopping_list_items', 'shopping_lists',
  'status_history', 'tasks', 'user_day_stats', 'user_stats', 'whatsapp_messages', 'xp_events'],
  'the sections are exactly those of accountExportSections');
select is((select string_agg(k, ',' order by k) from ex, jsonb_each(j -> 'sections') s(k, v) where jsonb_array_length(v) = 0),
  null, 'the fixture fills every section, so none is empty');
select is((select j #>> '{sections,account,0,email}' from ex), 'd@del.local', 'account has the e-mail');
select is((select array_agg(k order by k) from ex, jsonb_object_keys(j #> '{sections,account,0}') k),
  array['created_at', 'email', 'email_confirmed_at', 'id', 'last_sign_in_at'], 'and nothing else of auth.users');
select is((select j #>> '{sections,profile,0,phone_e164}' from ex), '+5511999990001', 'profile is whole, with the phone');
select is((select jsonb_array_length(j #> '{sections,group_memberships}') from ex), 2, 'D''s two memberships, nobody else''s');
select ok((select bool_and(m ? 'group_name' and m ? 'group_type') from ex, jsonb_array_elements(j #> '{sections,group_memberships}') m),
  'each with the name and type of the group');
select is((select jsonb_array_length(j #> '{sections,created_invites}') from ex), 2, 'the invites D created');
select ok((select bool_and(not (i ? 'code')) from ex, jsonb_array_elements(j #> '{sections,created_invites}') i)
  and (select position('DELINV' in j::text) = 0 from ex), 'without the code, anywhere');
select is((select jsonb_array_length(j #> '{sections,tasks}') from ex), 5, 'tasks assigned to D or created by D');
select is((select jsonb_array_length(j #> '{sections,proofs}') from ex), 3, 'D''s proofs, superseded included');
select ok((select bool_and(not (p ? 'storage_path') and p ? 'photo_url' and p -> 'photo_url' = 'null')
  from ex, jsonb_array_elements(j #> '{sections,proofs}') p), 'without storage_path, with photo_url null for the function');
select is((select count(*)::int from ex, jsonb_each_text(j -> 'photoPaths') p(k, v)
  where v = (select storage_path from public.task_proofs where id = k::uuid and user_id = pg_temp.u('d'))), 3,
  'photoPaths maps each proof to its path, for the function to sign');
select is((select array_agg(k order by k) from ex, jsonb_object_keys(j #> '{sections,proof_reviews,0}') k),
  array['id', 'occurrence_id', 'review_note', 'review_status', 'reviewed_at'],
  'a review of someone else''s proof has only the decision');
select is((select j #>> '{sections,proof_reviews,0,id}' from ex), pg_temp.g('p_o')::text, 'the one D reviewed');
select is((select j #>> '{sections,push_subscriptions,0,endpoint_host}' from ex), 'fcm.googleapis.com',
  'push has the host of the service');
select ok((select bool_and(not (s ? 'endpoint' or s ? 'p256dh' or s ? 'auth')) from ex, jsonb_array_elements(j #> '{sections,push_subscriptions}') s)
  and (select position(repeat('k', 22) in j::text) = 0 from ex), 'and no endpoint or keys');
select ok((select bool_and(not (v ? 'code_hash')) from ex, jsonb_array_elements(j #> '{sections,phone_verifications}') v)
  and (select position(repeat('b', 64) in j::text) = 0 from ex), 'phone_verifications without code_hash');
select is((select jsonb_array_length(j #> '{sections,shopping_lists}') from ex), 2, 'the personal list and the shared one D made');
select is((select jsonb_array_length(j #> '{sections,shopping_list_items}') from ex), 4,
  'personal items, and shared ones D added or checked');
select is((select count(*)::int from ex, jsonb_array_elements(j #> '{sections,status_history}') h
  where h ->> 'occurrence_id' = pg_temp.occ('ForO')::text), 0, 'history of someone else''s task D did not touch stays out');
select ok((select position(pg_temp.u('b')::text in j::text) = 0 from ex), 'nothing of B, who shares no group with D');

-- ===== The preview and the block =====
select pg_temp.service();
select is(public.account_deletion_preview(pg_temp.u('b')),
  jsonb_build_object('blockingGroups', jsonb_build_array(jsonb_build_object('id', '40000000-0000-0000-0000-000000000003',
    'name', 'Blocked', 'memberCount', 2)), 'soloGroups', '[]'::jsonb),
  'a group with someone else blocks');
select is(public.account_deletion_preview(pg_temp.u('d')),
  jsonb_build_object('blockingGroups', '[]'::jsonb, 'soloGroups', jsonb_build_array(jsonb_build_object(
    'id', '40000000-0000-0000-0000-000000000002', 'name', 'Solo'))),
  'a group of one goes with the account');
select throws_ok($$select public.begin_account_deletion('00000000-0000-0000-0000-00000000000b')$$, 'P0001', 'owns_groups',
  'begin refuses an owner of a group with others');
select is(pg_temp.detail($$select public.begin_account_deletion('00000000-0000-0000-0000-00000000000b')$$)::jsonb,
  public.account_deletion_preview(pg_temp.u('b')), 'with the preview in the detail');
select pg_temp.pg();
select is((select count(*)::int from public.account_deletions where user_id = pg_temp.u('b')), 0, 'and opens nothing');
-- A member joins Solo between begin and finish: finish blocks too.
select pg_temp.service();
select public.begin_account_deletion(pg_temp.u('d'));
-- SEG8-3: with the deletion open, no invite lets anyone into a group of D.
select pg_temp.login(pg_temp.u('c'));
select is(public.accept_invite('DELINV0003'), null, 'with D''s deletion open, an invite to Solo is invite_invalid');
select is(public.accept_invite('DELINV0002'), '40000000-0000-0000-0000-000000000001'::uuid,
  'an invite to a group of someone else still answers');
select pg_temp.pg();
select is((select count(*)::int from public.group_members where group_id = '40000000-0000-0000-0000-000000000002'), 1,
  'Solo keeps only D');
insert into public.group_members (group_id, user_id, role) values ('40000000-0000-0000-0000-000000000002', pg_temp.u('c'), 'member');
select pg_temp.service();
select throws_ok($$select public.finish_account_deletion('00000000-0000-0000-0000-00000000000d', 0)$$, 'P0001', 'owns_groups',
  'finish checks the block again');
select pg_temp.pg();
select ok(exists (select 1 from public.groups where id = '40000000-0000-0000-0000-000000000002'), 'and deletes nothing');
delete from public.group_members where group_id = '40000000-0000-0000-0000-000000000002' and user_id = pg_temp.u('c');
delete from public.account_deletions where user_id = pg_temp.u('d');

-- ===== The bare cascade =====
-- The owner of a group cannot go by the cascade alone (ADR-0004): that is why finish deletes solo groups.
select throws_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000d'$$, '23503', null,
  'a bare delete of an owner fails on groups.owner_id');
-- E leaves a group by deleting the account: the invites of the group stay valid.
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000e'$$, 'the cascade of E runs');
select is((select count(*)::int from public.group_invites where code in ('DELINV0001', 'DELINV0002') and revoked_at is null), 2,
  'and does not revoke the invites of the groups E was in');
select is((select user_id from public.task_proofs where id = pg_temp.g('p_sup_e')), null,
  'E''s superseded proof on someone else''s occurrence survives the cascade, without the author');

-- ===== The deletion of D, step by step =====
select pg_temp.service();
select throws_ok($$select public.finish_account_deletion('00000000-0000-0000-0000-00000000000d', 0)$$, 'P0001',
  'deletion_not_started', 'finish needs begin');
select pg_temp.sv('begin', public.begin_account_deletion(pg_temp.u('d'))::text);
select is((public.begin_account_deletion(pg_temp.u('d')) ->> 'deletionId'), (current_setting('t.begin')::jsonb ->> 'deletionId'),
  'a repeat of begin reuses the open row');
select pg_temp.pg();
select is((select count(*)::int from public.account_deletions where user_id = pg_temp.u('d') and completed_at is null), 1,
  'one open row');
select is(
  (select array_agg(p order by p) from jsonb_array_elements_text(current_setting('t.begin')::jsonb -> 'storagePaths') p),
  (select array_agg(storage_path order by storage_path) from public.task_proofs
   where id in (pg_temp.g('p_solo'), pg_temp.g('p_d'), pg_temp.g('p_sup'))),
  'begin returns the paths of D''s proofs, Solo''s and the superseded one, and not A''s');
select pg_temp.service();
select throws_ok($$select public.complete_account_deletion('00000000-0000-0000-0000-00000000000d', 365)$$, 'P0001',
  'account_still_exists', 'complete before deleteUser is refused');
select throws_ok($$select public.finish_account_deletion('00000000-0000-0000-0000-00000000000d', -1)$$, '22023',
  'invalid_argument', 'a negative object count is refused');
select is(public.finish_account_deletion(pg_temp.u('d'), 3), '{"groupsDeleted": 1, "proofsDeleted": 3}'::jsonb,
  'finish deletes Solo and D''s three proofs');
select is(public.finish_account_deletion(pg_temp.u('d'), 0), '{"groupsDeleted": 0, "proofsDeleted": 0}'::jsonb,
  'a repeat finds nothing');
select pg_temp.pg();
select is((select row(groups_deleted, proofs_deleted, objects_deleted)::text from public.account_deletions
  where user_id = pg_temp.u('d')), '(1,3,3)', 'and keeps the counts');
select is((select count(*)::int from public.task_proofs where id = pg_temp.g('p_sup')), 0,
  'the superseded proof on A''s occurrence is gone');

-- auth.admin.deleteUser: the cascade from auth.users, through every trigger of every phase.
insert into auth.audit_log_entries (id, payload, created_at, ip_address) values
  (gen_random_uuid(), jsonb_build_object('actor_id', pg_temp.u('d'), 'actor_username', 'd@del.local', 'action', 'login'), now(), '10.0.0.1'),
  (gen_random_uuid(), jsonb_build_object('actor_id', '00000000-0000-0000-0000-000000000000', 'action', 'user_deleted',
    'traits', jsonb_build_object('user_id', pg_temp.u('d'), 'user_email', 'd@del.local')), now(), ''),
  (gen_random_uuid(), jsonb_build_object('actor_id', pg_temp.u('a'), 'action', 'login'), now(), '10.0.0.2');
insert into public.account_deletions (user_id, requested_at, completed_at) values
  (gen_random_uuid(), now() - interval '400 days', now() - interval '400 days'),
  (gen_random_uuid(), now() - interval '300 days', now() - interval '300 days');
select is(
  (select array_agg(distinct c.conrelid::regclass::text) from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
     and position(c.conrelid::regclass::text || ':' in pg_temp.mentions(pg_temp.u('d'))) = 0),
  array['groups'], 'before the delete, D has rows in every table that points to profiles (groups went with finish)');
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000d'$$,
  'deleting D from auth.users runs the whole cascade without an error');
select is(pg_temp.mentions(pg_temp.u('d')), 'account_deletions:1,notifications:4',
  'what still mentions D is the audit row and the bells of other people');
select is((select count(*)::int from public.notifications where data::text like '%' || pg_temp.u('d') || '%' and user_id = pg_temp.u('a')), 4,
  'all of them A''s');

-- What stays, without the name.
select is((select created_by from public.tasks where id = pg_temp.tid('ForO')), null, 'the task D made for A stays, without D');
select is((select count(*)::int from public.tasks where title in ('Own', 'ForD', 'PhotoD', 'SoloT')), 0,
  'D''s tasks are gone, the group ones too');
select is((select count(*)::int from public.task_status_history where occurrence_id = pg_temp.occ('ForO2') and changed_by is null), 1,
  'the history D wrote on A''s task stays, without D');
select is((select row(review_status, reviewed_by, review_note)::text from public.task_proofs where id = pg_temp.g('p_o')),
  '(approved,,ok)', 'the decision on A''s proof stays, without the reviewer');
select is((select row(status, created_by, completed_by)::text from public.shopping_lists where id = '60000000-0000-0000-0000-000000000002'),
  '(completed,,)', 'the shared list stays, completed, without D');
select is((select string_agg(row(name, added_by, checked_by)::text, ';' order by name) from public.shopping_list_items
  where list_id = '60000000-0000-0000-0000-000000000002'),
  '(Bread,00000000-0000-0000-0000-00000000000a,);(Milk,,)', 'and its items, under the guard, without D');
select is((select count(*)::int from public.shopping_lists where id = '60000000-0000-0000-0000-000000000001'), 0,
  'the personal list is gone');
select is((select string_agg(row(code, created_by, revoked_at is null)::text, ';' order by code) from public.group_invites
  where code like 'DELINV%'), '(DELINV0001,,t);(DELINV0002,00000000-0000-0000-0000-00000000000a,t)',
  'the invites of S stay valid, D''s without the author; Solo''s went with it');
select is((select invited_by from public.group_members where user_id = pg_temp.u('c')), null, 'whom D invited stays, without D');
select is((select created_by from public.contexts where id = '50000000-0000-0000-0000-000000000002'), null,
  'the shared context stays, without D');
select is((select count(*)::int from public.phone_verifications where phone_e164 = '+5511999990001' and user_id is null), 1,
  'the phone attempt stays for the per-number limit, without D');

-- complete_account_deletion
select pg_temp.service();
select throws_ok($$select public.complete_account_deletion('00000000-0000-0000-0000-00000000000d', 0)$$, '22023',
  'invalid_argument', 'the retention is at least a day');
select is(public.complete_account_deletion(pg_temp.u('d'), 365), '{"auditEntriesDeleted": 2}'::jsonb,
  'complete deletes D''s lines of the GoTrue audit log');
select pg_temp.pg();
select ok((select completed_at is not null from public.account_deletions where user_id = pg_temp.u('d')), 'marks the row done');
select is((select count(*)::int from public.account_deletions where requested_at < now() - interval '365 days'), 0,
  'and prunes the rows older than the retention');
select is((select count(*)::int from public.account_deletions where requested_at < now() - interval '299 days'), 1,
  'keeping the younger ones');
select is((select count(*)::int from auth.audit_log_entries where payload ->> 'actor_id' = pg_temp.u('a')::text), 1,
  'A''s audit line stays');
select pg_temp.service();
select is(public.complete_account_deletion(pg_temp.u('d'), 365), '{"auditEntriesDeleted": 0}'::jsonb, 'a repeat is a no-op');
select throws_ok($$select public.begin_account_deletion('00000000-0000-0000-0000-00000000000d')$$, 'P0002',
  'account_not_found', 'and the account is gone');
select pg_temp.pg();

select * from finish();
rollback;
