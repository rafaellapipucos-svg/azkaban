-- Shopping lists (ADR-0011). Assume a hostile client calling the REST API directly. Each refusal sits next
-- to the same call allowed to whoever it should allow. Realtime checks the same select policies tested
-- here, as each subscriber, so "another group" and "left the group" below are also the Realtime review.
begin;
create extension if not exists pgtap with schema extensions;
select plan(135);

-- Alice owns Casa A, Caio is admin of A, Duda and Fred are members of A. Eva owns Casa B.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@test.local', '{"display_name": "Caio"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local', '{"display_name": "Eva"}'),
  ('00000000-0000-0000-0000-00000000000f', 'fred@test.local', '{"display_name": "Fred"}');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'Casa B', 'family', '00000000-0000-0000-0000-00000000000e');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'member');

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', 'x', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000b', null, 'Casa B', 'teal', 'x', '00000000-0000-0000-0000-00000000000e'),
  ('20000000-0000-0000-0000-00000000000d', (select id from public.areas where key = 'home'),
    null, '00000000-0000-0000-0000-00000000000d', 'Duda', 'teal', 'x', '00000000-0000-0000-0000-00000000000d');

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

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000000' || p)::uuid;
$$;

create function pg_temp.grp(p text) returns uuid language sql as $$
  select ('10000000-0000-0000-0000-00000000000' || p)::uuid;
$$;

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.g(p_name text) returns uuid language sql as $$
  select current_setting('t.' || p_name)::uuid;
$$;

create function pg_temp.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A catalog row by scope and name, read past RLS.
create function pg_temp.cat(p_group uuid, p_owner uuid, p_name text) returns uuid
language sql security definer as $$
  select id from public.shopping_catalog_items
  where group_id is not distinct from p_group and owner_user_id is not distinct from p_owner
    and name = p_name and archived_at is null;
$$;

create function pg_temp.item(p_id uuid) returns public.shopping_list_items
language sql security definer as $$
  select * from public.shopping_list_items where id = p_id;
$$;

create function pg_temp.items(p_list uuid) returns bigint language sql security definer as $$
  select count(*) from public.shopping_list_items where list_id = p_list;
$$;

-- A one-off task, its id.
create function pg_temp.task(
  p_title text, p_creator uuid, p_assignee uuid, p_ctx uuid, p_vis public.task_visibility default 'group'
) returns uuid language plpgsql as $$
declare tid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility
  ) values (
    p_ctx, p_creator, p_assignee, p_title, 'timed', now() + interval '1 day', 60, 'America/Sao_Paulo',
    '[]', false, false, false, 'medium', 'normal', p_vis
  ) returning id into tid;
  return tid;
end;
$$;

-- ===== Seed and its copies =====
select is((select count(*)::int from public.shopping_catalog_seed), 44, 'the seed has the 44 items of packages/config');
select is(
  (select count(*)::int from public.shopping_catalog_items where group_id = pg_temp.grp('a')), 44,
  'a new group starts with the 44 items');
select is(
  (select count(*)::int from public.shopping_catalog_items where owner_user_id = pg_temp.u('d')), 44,
  'a new profile starts with the 44 items in a personal catalog');
-- Global, so it runs over data left by other runs (E2E saves items to catalogs and archives some). Old
-- catalogs belong to their admins (ADR-0011): extra rows are fine, and archiving keeps the row. What must
-- hold is that the copy, or the backfill, gave every scope each seed row.
-- ponytail: matches by name, so a seed item renamed in a dev database fails here; reset the database then.
select is(
  (select count(*)::int from public.groups g cross join public.shopping_catalog_seed s
   where not exists (select 1 from public.shopping_catalog_items c where c.group_id = g.id and c.name = s.name))
  + (select count(*)::int from public.profiles p cross join public.shopping_catalog_seed s
   where not exists (select 1 from public.shopping_catalog_items c where c.owner_user_id = p.id and c.name = s.name)),
  0, 'every group and every profile in the database has each seed item, archived or not');
select is(
  (select string_agg(c.name || '|' || c.category || '|' || c.default_unit || '|' || c.sort_order, ',' order by c.sort_order)
   from public.shopping_catalog_items c where c.group_id = pg_temp.grp('b')),
  (select string_agg(s.name || '|' || s.category || '|' || s.default_unit || '|' || s.sort_order, ',' order by s.sort_order)
   from public.shopping_catalog_seed s),
  'the copy keeps names, categories, units and order of the seed');
select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename like 'shopping%'),
  array['shopping_list_items', 'shopping_lists'],
  'lists and items are in the Realtime publication; the catalog and the seed are not');
select is(
  (select string_agg(relreplident::text, ',') from pg_class
   where oid in ('public.shopping_lists'::regclass, 'public.shopping_list_items'::regclass)),
  'd,d', 'replica identity stays the default, so a DELETE carries only the id');
select is(
  (select string_agg(role || ':' || permission_key, ',' order by role, permission_key)
   from public.role_permissions where permission_key like 'shopping.%'),
  'owner:shopping.complete_list,owner:shopping.create_list,owner:shopping.manage_catalog,owner:shopping.manage_lists,'
  || 'admin:shopping.complete_list,admin:shopping.create_list,admin:shopping.manage_catalog,admin:shopping.manage_lists,'
  || 'member:shopping.complete_list,member:shopping.create_list',
  'members create and complete; owner and admin also manage the catalog and other lists');

-- ===== Lists and items to look at =====
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('la', (public.create_shopping_list(null, pg_temp.grp('a'), 'Feira', null)).id::text);
select pg_temp.sv('ld', (public.create_shopping_list('30000000-0000-0000-0000-00000000000d', null, 'Minha', null)).id::text);
select is(pg_temp.g('ld'), '30000000-0000-0000-0000-00000000000d'::uuid, 'the id of a list may come from the client');
select pg_temp.sv('ia', (public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Arroz'), 1)).id::text);
select pg_temp.sv('id', (public.add_catalog_item_to_list(pg_temp.g('ld'), pg_temp.cat(null, pg_temp.u('d'), 'Café'), 1)).id::text);
select pg_temp.login(pg_temp.u('e'));
select pg_temp.sv('lb', (public.create_shopping_list(null, pg_temp.grp('b'), 'Casa B', null)).id::text);
select pg_temp.sv('ib', (public.add_catalog_item_to_list(pg_temp.g('lb'), pg_temp.cat(pg_temp.grp('b'), null, 'Leite'), 1)).id::text);

select pg_temp.login(pg_temp.u('d'));
select is((select row(l.group_id, l.owner_user_id, l.created_by, l.status::text)::text from public.shopping_lists l where id = pg_temp.g('la')),
  row(pg_temp.grp('a'), null::uuid, pg_temp.u('d'), 'open')::text, 'a member creates a group list, open, with herself as creator');
select is((select row(l.group_id, l.owner_user_id)::text from public.shopping_lists l where id = pg_temp.g('ld')),
  row(null::uuid, pg_temp.u('d'))::text, 'a personal list belongs to whoever created it');
select is((select row(i.name, i.category::text, i.unit::text, i.quantity, i.emoji, i.added_by)::text from public.shopping_list_items i where id = pg_temp.g('ia')),
  row('Arroz', 'pantry', 'pack', 1.000::numeric(10,3), '🍚', pg_temp.u('d'))::text,
  'an item from the catalog is a snapshot, stamped with who added it');

-- ===== Select: another group, another person, the left =====
select is((select count(*)::int from public.shopping_lists), 2, 'Duda sees her group list and her personal list');
select is((select count(*)::int from public.shopping_catalog_items), 88, 'Duda sees the catalog of Casa A and her own');
select is((select count(*)::int from public.shopping_catalog_items where group_id = pg_temp.grp('b') or owner_user_id <> pg_temp.u('d')), 0,
  'Duda sees neither the catalog of Casa B nor the personal catalog of anyone else');

select pg_temp.login(pg_temp.u('e'));
select is((select count(*)::int from public.shopping_lists where id in (pg_temp.g('la'), pg_temp.g('ld'))), 0,
  'the owner of another group sees neither the group list nor the personal list');
select is((select count(*)::int from public.shopping_list_items where id in (pg_temp.g('ia'), pg_temp.g('id'))), 0,
  'nor their items');
select is((select count(*)::int from public.shopping_catalog_items where group_id = pg_temp.grp('a')), 0,
  'nor the catalog of Casa A');
select is(pg_temp.rows($$update public.shopping_list_items set note = 'x' where id = '$$ || pg_temp.g('ia') || $$'$$), 0::bigint,
  'nor updates an item of Casa A');
select is(pg_temp.rows($$delete from public.shopping_list_items where id = '$$ || pg_temp.g('ia') || $$'$$), 0::bigint,
  'nor deletes it');
select is(pg_temp.rows($$delete from public.shopping_lists where id = '$$ || pg_temp.g('la') || $$'$$), 0::bigint,
  'nor deletes the list');
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack')$$,
  '42501', 'forbidden', 'nor inserts into it, and learns nothing about its state');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('ia') || $$', 1)$$, '42501', 'forbidden', 'nor steps an item');
select throws_ok($$select public.set_shopping_item_checked('$$ || pg_temp.g('ia') || $$', true)$$, '42501', 'forbidden', 'nor checks it');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(pg_temp.grp('b'), null, 'Arroz') || $$', 1)$$,
  '42501', 'forbidden', 'nor adds to the list from a catalog');
select throws_ok($$select public.complete_shopping_list('$$ || pg_temp.g('la') || $$')$$, '42501', 'forbidden', 'nor completes it');
select throws_ok($$select public.create_shopping_list(null, null, 'Cópia', '$$ || pg_temp.g('ld') || $$')$$, '42501', 'forbidden',
  'nor copies a personal list of someone else');
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Minha', null)$$, '42501', 'forbidden',
  'nor creates a list in a group she is not in');

select pg_temp.login(pg_temp.u('a'));
select is((select count(*)::int from public.shopping_lists where id = pg_temp.g('ld')), 0, 'the owner of the group does not see the personal list of a member');
select is((select count(*)::int from public.shopping_list_items where id = pg_temp.g('id')), 0, 'nor its items');
select is((select count(*)::int from public.shopping_catalog_items where owner_user_id = pg_temp.u('d')), 0, 'nor her personal catalog');
select is(pg_temp.rows($$update public.shopping_lists set name = 'x' where id = '$$ || pg_temp.g('ld') || $$'$$), 0::bigint, 'nor renames her list');
select throws_ok($$select public.complete_shopping_list('$$ || pg_temp.g('ld') || $$')$$, '42501', 'forbidden', 'nor completes it');
select is((select count(*)::int from public.shopping_lists where id = pg_temp.g('la')), 1, 'but sees the group list');

select pg_temp.login(null);
select is((select count(*)::int from public.shopping_lists), 0, 'with no user in the token nothing is visible');
select pg_temp.pg();
set local role anon;
select throws_ok('select 1 from public.shopping_lists', '42501', null, 'anon cannot read lists');
select throws_ok('select 1 from public.shopping_list_items', '42501', null, 'anon cannot read items');
select throws_ok('select 1 from public.shopping_catalog_items', '42501', null, 'anon cannot read the catalog');
select throws_ok($$select public.create_shopping_list(null, null, 'x', null)$$, '42501', null, 'anon cannot call the RPCs');
reset role;

-- Fred adds an item, then leaves Casa A.
select pg_temp.login(pg_temp.u('f'));
select pg_temp.sv('if', (public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Feijão'), 2)).id::text);
select is((select count(*)::int from public.shopping_lists where id = pg_temp.g('la')), 1, 'Fred sees the list while a member');
select pg_temp.pg();
delete from public.group_members where group_id = pg_temp.grp('a') and user_id = pg_temp.u('f');
select pg_temp.login(pg_temp.u('f'));
select is((select count(*)::int from public.shopping_lists where id = pg_temp.g('la')), 0, 'after leaving, Fred loses the list');
select is((select count(*)::int from public.shopping_list_items where list_id = pg_temp.g('la')), 0, 'its items, the one he added included');
select is((select count(*)::int from public.shopping_catalog_items where group_id = pg_temp.grp('a')), 0, 'and the catalog of the group');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('if') || $$', 1)$$, '42501', 'forbidden', 'and steps nothing on it');
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack')$$,
  '42501', 'forbidden', 'and adds nothing to it');
select is((select count(*)::int from public.shopping_catalog_items where owner_user_id = pg_temp.u('f')), 44, 'his personal catalog stays');

-- ===== Columns the client never writes =====
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit, added_by) values ('$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack', '$$ || pg_temp.u('a') || $$')$$,
  '42501', null, 'the client cannot forge added_by');
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit, checked_by, checked_at) values ('$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack', '$$ || pg_temp.u('d') || $$', now())$$,
  '42501', null, 'nor insert an item already checked');
select throws_ok($$update public.shopping_list_items set checked_at = now(), checked_by = '$$ || pg_temp.u('a') || $$' where id = '$$ || pg_temp.g('ia') || $$'$$,
  '42501', null, 'nor write checked_at and checked_by');
select throws_ok($$update public.shopping_list_items set list_id = '$$ || pg_temp.g('ld') || $$' where id = '$$ || pg_temp.g('ia') || $$'$$,
  '42501', null, 'nor move an item to another list');
select throws_ok($$update public.shopping_lists set status = 'completed', completed_at = now() where id = '$$ || pg_temp.g('la') || $$'$$,
  '42501', null, 'nor complete a list by update');
select throws_ok($$update public.shopping_lists set completed_by = '$$ || pg_temp.u('a') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '42501', null, 'nor write completed_by');
select throws_ok($$update public.shopping_lists set group_id = null, owner_user_id = '$$ || pg_temp.u('d') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '42501', null, 'nor move a list to another scope');
select throws_ok($$insert into public.shopping_lists (group_id, name) values ('$$ || pg_temp.grp('a') || $$', 'x')$$,
  '42501', null, 'nor insert a list past create_shopping_list');
select throws_ok($$update public.shopping_catalog_items set group_id = '$$ || pg_temp.grp('b') || $$' where id = '$$ || pg_temp.cat(null, pg_temp.u('d'), 'Sal') || $$'$$,
  '42501', null, 'nor move a catalog row to another scope');
select lives_ok($$insert into public.shopping_list_items (id, list_id, name, category, quantity, unit) values ('40000000-0000-0000-0000-000000000001', '$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack')$$,
  'a member types an item by hand, with an id from the client');
select pg_temp.sv('ix', '40000000-0000-0000-0000-000000000001');
select is((select row(added_by, checked_at, checked_by)::text from public.shopping_list_items where id = pg_temp.g('ix')),
  row(pg_temp.u('d'), null::timestamptz, null::uuid)::text, 'an item typed by hand, with a client id, is stamped by the database and starts unchecked');

-- ===== Catalog: shopping.manage_catalog, scope, names =====
select throws_ok($$insert into public.shopping_catalog_items (group_id, name, category, default_unit) values ('$$ || pg_temp.grp('a') || $$', 'Pilhas', 'other', 'pack')$$,
  '42501', 'forbidden', 'a member without shopping.manage_catalog does not add to the group catalog');
select is(pg_temp.rows($$update public.shopping_catalog_items set name = 'Arroz integral' where id = '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Arroz') || $$'$$), 0::bigint,
  'nor edits it');
select is(pg_temp.rows($$update public.shopping_catalog_items set archived_at = now() where id = '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Arroz') || $$'$$), 0::bigint,
  'nor archives it');
select throws_ok($$insert into public.shopping_catalog_items (group_id, name, category, default_unit) values ('$$ || pg_temp.grp('b') || $$', 'Arroz', 'pantry', 'pack')$$,
  '42501', 'forbidden', 'probing the catalog of another group by name answers forbidden, not catalog_item_exists');
select lives_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit, emoji) values ('$$ || pg_temp.u('d') || $$', 'Pilhas', 'other', 'pack', '🔋')$$,
  'she adds to her personal catalog');
select throws_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit) values ('$$ || pg_temp.u('a') || $$', 'Pilhas', 'other', 'pack')$$,
  '42501', 'forbidden', 'but not to the personal catalog of someone else');
select throws_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit) values ('$$ || pg_temp.u('d') || $$', 'PILHAS', 'other', 'pack')$$,
  '23505', 'catalog_item_exists', 'a name repeated in the same catalog, ignoring case, is catalog_item_exists');
select throws_ok($$delete from public.shopping_catalog_items where id = '$$ || pg_temp.cat(null, pg_temp.u('d'), 'Pilhas') || $$'$$,
  '42501', null, 'nobody deletes a catalog row');
select throws_ok('select * from public.shopping_catalog_seed', '42501', null, 'nobody reads the seed');
select throws_ok($$select public.seed_shopping_catalog(null, '$$ || pg_temp.u('d') || $$')$$, '42501', null, 'nobody copies the seed by hand');
select throws_ok($$select public.shopping_rules()$$, '42501', null, 'nor calls shopping_rules');

select pg_temp.login(pg_temp.u('c'));
select lives_ok($$insert into public.shopping_catalog_items (group_id, name, category, default_unit) values ('$$ || pg_temp.grp('a') || $$', 'Pilhas', 'other', 'pack')$$,
  'an admin with shopping.manage_catalog adds to the group catalog');
select is(pg_temp.rows($$update public.shopping_catalog_items set emoji = '🔋', sort_order = 5 where id = '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Pilhas') || $$'$$), 1::bigint,
  'edits it');
select throws_ok($$update public.shopping_catalog_items set name = 'arroz' where id = '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Pilhas') || $$'$$,
  '23505', 'catalog_item_exists', 'renaming onto another name of the catalog is catalog_item_exists');
select is(pg_temp.rows($$update public.shopping_catalog_items set archived_at = now() where id = '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Pilhas') || $$'$$), 1::bigint,
  'and archives it');
select lives_ok($$insert into public.shopping_catalog_items (group_id, name, category, default_unit) values ('$$ || pg_temp.grp('a') || $$', 'Pilhas', 'other', 'unit')$$,
  'an archived name may be used again');

-- catalog_full, with a lower limit for the test.
select pg_temp.pg();
update public.app_settings set value = jsonb_set(value, '{maxCatalogItemsPerScope}', '46') where key = 'shopping_rules';
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit) values ('$$ || pg_temp.u('d') || $$', 'Velas', 'other', 'pack')$$,
  'the 46th row of a catalog fits');
select throws_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit) values ('$$ || pg_temp.u('d') || $$', 'Fósforo', 'other', 'box')$$,
  '54000', 'catalog_full', 'the 47th is catalog_full');
select is(pg_temp.rows($$update public.shopping_catalog_items set archived_at = now() where id = '$$ || pg_temp.cat(null, pg_temp.u('d'), 'Velas') || $$'$$), 1::bigint,
  'archiving frees a place');
select lives_ok($$insert into public.shopping_catalog_items (owner_user_id, name, category, default_unit) values ('$$ || pg_temp.u('d') || $$', 'Fósforo', 'other', 'box')$$,
  'which takes the next row');
select pg_temp.pg();
update public.app_settings set value = jsonb_set(value, '{maxCatalogItemsPerScope}', '500') where key = 'shopping_rules';

-- ===== Catalog scope of an item, and of a copy =====
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$insert into public.shopping_list_items (list_id, catalog_item_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(pg_temp.grp('b'), null, 'Sal') || $$', 'Sal', 'pantry', 1, 'unit')$$,
  '42501', 'forbidden', 'a group list takes no catalog row of another group');
select throws_ok($$insert into public.shopping_list_items (list_id, catalog_item_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(null, pg_temp.u('d'), 'Sal') || $$', 'Sal', 'pantry', 1, 'unit')$$,
  '42501', 'forbidden', 'nor a row of a personal catalog');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('ld') || $$', '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Sal') || $$', 1)$$,
  '42501', 'forbidden', 'a personal list takes no row of a group catalog, even one she sees');
select throws_ok($$update public.shopping_list_items set catalog_item_id = '$$ || pg_temp.cat(null, pg_temp.u('d'), 'Sal') || $$' where id = '$$ || pg_temp.g('ix') || $$'$$,
  '42501', 'forbidden', 'nor does an update link one');
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Cópia', '$$ || pg_temp.g('ld') || $$')$$,
  '42501', 'forbidden', 'a copy never changes scope: personal to group');
select throws_ok($$select public.create_shopping_list(null, null, 'Cópia', '$$ || pg_temp.g('la') || $$')$$,
  '42501', 'forbidden', 'nor group to personal');

-- ===== Stepper =====
select is((public.adjust_shopping_item_quantity(pg_temp.g('ia'), 1)).quantity, 2.000::numeric(10,3), 'a step adds to the quantity');
select pg_temp.login(pg_temp.u('c'));
select is((public.adjust_shopping_item_quantity(pg_temp.g('ia'), 1)).quantity, 3.000::numeric(10,3),
  'a step of another member right after adds to it too: the delta is added in the database, not overwritten');
select is((public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Arroz'), 0.5)).quantity, 3.500::numeric(10,3),
  'a tap on the catalog entry of an item already on the list adds to that row');
select is((public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Banana'), 1)).quantity, 1.000::numeric(10,3), 'a first tap on the catalog inserts');
select is((public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Banana'), 1)).quantity, 2.000::numeric(10,3), 'a second first tap adds');
select is((select count(*)::int from public.shopping_list_items where list_id = pg_temp.g('la') and name = 'Banana'), 1, 'two first taps make one row');
select is((public.adjust_shopping_item_quantity(pg_temp.g('ia'), 9999)).quantity, 9999.000::numeric(10,3), 'the stepper stops at shoppingQuantityMax');
select ok((public.adjust_shopping_item_quantity(pg_temp.g('ia'), -9999)) is null, 'a step to zero returns null');
select is((pg_temp.item(pg_temp.g('ia'))).id, null::uuid, 'and deletes the item');
select ok((public.adjust_shopping_item_quantity(pg_temp.g('ia'), 1)) is null, 'a step on a removed item returns null and creates nothing');
select ok((public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Sal'), -1)) is null,
  'a step down on a catalog entry not on the list does nothing');
select is(pg_temp.items(pg_temp.g('la')), 3::bigint, 'the list has Feijão, Pilhas and Banana');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('if') || $$', 0)$$, '22023', 'invalid_argument', 'a zero delta is refused');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('if') || $$', null)$$, '22023', 'invalid_argument', 'a null delta is refused, not read as a removal');

-- ===== Check =====
select pg_temp.sv('ibanana', (select id::text from public.shopping_list_items where list_id = pg_temp.g('la') and name = 'Banana'));
select pg_temp.login(pg_temp.u('d'));
select is((select row(checked_by, checked_at is not null)::text from public.set_shopping_item_checked(pg_temp.g('ibanana'), true)),
  row(pg_temp.u('d'), true)::text, 'checking stamps who and when');
select pg_temp.login(pg_temp.u('c'));
select is((public.set_shopping_item_checked(pg_temp.g('ibanana'), true)).checked_by, pg_temp.u('d'),
  'checking a checked item is a value: who checked first stays');
select is((select row(checked_by, checked_at)::text from public.set_shopping_item_checked(pg_temp.g('ibanana'), false)),
  row(null::uuid, null::timestamptz)::text, 'unchecking clears both');
select is((public.set_shopping_item_checked(pg_temp.g('ibanana'), true)).checked_by, pg_temp.u('c'), 'checking again stamps the new person');

-- ===== Manage lists =====
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('la2', (public.create_shopping_list(null, pg_temp.grp('a'), 'Padaria', null)).id::text);
select pg_temp.pg();
insert into public.group_members (group_id, user_id, role) values (pg_temp.grp('a'), pg_temp.u('f'), 'member');
select pg_temp.login(pg_temp.u('f'));
select is(pg_temp.rows($$update public.shopping_lists set name = 'Outra' where id = '$$ || pg_temp.g('la2') || $$'$$), 0::bigint,
  'a member who did not create the list does not rename it');
select is(pg_temp.rows($$delete from public.shopping_lists where id = '$$ || pg_temp.g('la2') || $$'$$), 0::bigint, 'nor deletes it');
select pg_temp.login(pg_temp.u('d'));
select is(pg_temp.rows($$update public.shopping_lists set name = 'Padaria da esquina' where id = '$$ || pg_temp.g('la2') || $$'$$), 1::bigint,
  'its creator renames it');
select pg_temp.login(pg_temp.u('c'));
select is(pg_temp.rows($$update public.shopping_lists set name = 'Padaria' where id = '$$ || pg_temp.g('la2') || $$'$$), 1::bigint,
  'an admin with shopping.manage_lists renames it');
select is(pg_temp.rows($$delete from public.shopping_lists where id = '$$ || pg_temp.g('la2') || $$'$$), 1::bigint, 'and deletes it');

-- ===== Task link =====
select pg_temp.pg();
select pg_temp.sv('t_group', pg_temp.task('Mercado', pg_temp.u('a'), pg_temp.u('d'), '20000000-0000-0000-0000-00000000000a')::text);
select pg_temp.sv('t_hidden', pg_temp.task('Banco', pg_temp.u('a'), pg_temp.u('c'), '20000000-0000-0000-0000-00000000000a')::text);
select pg_temp.sv('t_private', pg_temp.task('Meu', pg_temp.u('d'), pg_temp.u('d'), '20000000-0000-0000-0000-00000000000a', 'private')::text);
select pg_temp.sv('t_b', pg_temp.task('B', pg_temp.u('e'), pg_temp.u('e'), '20000000-0000-0000-0000-00000000000b')::text);
select pg_temp.sv('t_personal', pg_temp.task('Pessoal', pg_temp.u('d'), pg_temp.u('d'), '20000000-0000-0000-0000-00000000000d', 'private')::text);
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_hidden') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '22023', 'task_link_invalid', 'a group task she cannot see is task_link_invalid');
select throws_ok($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_b') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '22023', 'task_link_invalid', 'so is a task of another group');
select throws_ok($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_private') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '22023', 'task_link_invalid', 'so is her private task on a group list, which other members would not see');
select throws_ok($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_personal') || $$' where id = '$$ || pg_temp.g('la') || $$'$$,
  '22023', 'task_link_invalid', 'so is her personal task on a group list');
select is(pg_temp.rows($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_personal') || $$' where id = '$$ || pg_temp.g('ld') || $$'$$), 1::bigint,
  'a personal list links a task its owner sees');
select is(pg_temp.rows($$update public.shopping_lists set linked_task_id = '$$ || pg_temp.g('t_group') || $$' where id = '$$ || pg_temp.g('la') || $$'$$), 1::bigint,
  'a group list links a group task of the same group');

-- ===== list_full, with a lower limit for the test =====
select pg_temp.pg();
update public.app_settings set value = jsonb_set(value, '{maxItemsPerList}', '4') where key = 'shopping_rules';
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Leite') || $$', 1)$$,
  'the 4th item fits');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Ovos') || $$', 1)$$,
  '54000', 'list_full', 'the 5th is list_full');
select is((public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.cat(pg_temp.grp('a'), null, 'Leite'), 1)).quantity, 2.000::numeric(10,3),
  'a full list still takes a step on an item it has');
select pg_temp.pg();
update public.app_settings set value = jsonb_set(value, '{maxItemsPerList}', '200') where key = 'shopping_rules';

-- ===== Complete, and a completed list takes no write =====
select pg_temp.login(pg_temp.u('d'));
select is((select row(status::text, completed_by, completed_at is not null)::text from public.complete_shopping_list(pg_temp.g('la'))),
  row('completed', pg_temp.u('d'), true)::text, 'a member with shopping.complete_list completes the group list');
select throws_ok($$select public.complete_shopping_list('$$ || pg_temp.g('la') || $$')$$, 'P0001', 'list_completed', 'completing twice is list_completed');
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', 'Pilhas', 'other', 1, 'pack')$$,
  'P0001', 'list_completed', 'a completed list takes no new item');
select throws_ok($$update public.shopping_list_items set note = 'x' where id = '$$ || pg_temp.g('if') || $$'$$,
  'P0001', 'list_completed', 'no edit');
select throws_ok($$delete from public.shopping_list_items where id = '$$ || pg_temp.g('if') || $$'$$,
  'P0001', 'list_completed', 'no removal');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('if') || $$', 1)$$, 'P0001', 'list_completed', 'no step');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('if') || $$', -5)$$, 'P0001', 'list_completed', 'no step down to removal');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.cat(pg_temp.grp('a'), null, 'Ovos') || $$', 1)$$,
  'P0001', 'list_completed', 'no first tap on the catalog');
select throws_ok($$select public.set_shopping_item_checked('$$ || pg_temp.g('if') || $$', true)$$, 'P0001', 'list_completed', 'no check');
select throws_ok($$update public.shopping_lists set name = 'x' where id = '$$ || pg_temp.g('la') || $$'$$, 'P0001', 'list_completed', 'no rename');

-- New list from this one.
select pg_temp.sv('lc', (public.create_shopping_list(null, pg_temp.grp('a'), 'Feira de novo', pg_temp.g('la'))).id::text);
select is(pg_temp.items(pg_temp.g('lc')), 4::bigint, 'a new list from a completed one copies every item');
select is((select count(*)::int from public.shopping_list_items where list_id = pg_temp.g('lc') and (checked_at is not null or added_by <> pg_temp.u('d'))), 0,
  'unchecked, and added by whoever copied');
select is((select string_agg(name || ':' || quantity || ':' || unit, ',' order by name) from public.shopping_list_items where list_id = pg_temp.g('lc')),
  (select string_agg(name || ':' || quantity || ':' || unit, ',' order by name) from public.shopping_list_items where list_id = pg_temp.g('la')),
  'with quantities and units');

-- Personal lists: only the owner, with no permission key.
select is((public.complete_shopping_list(pg_temp.g('ld'))).status::text, 'completed', 'the owner completes her personal list');

-- ===== Foreign key actions still pass on a completed list =====
select pg_temp.pg();
select lives_ok($$delete from public.tasks where id = '$$ || pg_temp.g('t_group') || $$'$$, 'deleting a task linked to a completed list works');
select is((select linked_task_id from public.shopping_lists where id = pg_temp.g('la')), null::uuid, 'and unlinks it');
select lives_ok($$delete from auth.users where id = '$$ || pg_temp.u('f') || $$'$$, 'deleting an account that added items to a completed list works');
select is((select added_by from public.shopping_list_items where id = pg_temp.g('if')), null::uuid, 'and the item stays, with no author');
select lives_ok($$delete from public.groups where id = '$$ || pg_temp.grp('a') || $$'$$, 'deleting a group with completed lists works');
select is((select count(*)::int from public.shopping_lists where id in (pg_temp.g('la'), pg_temp.g('lc'))) + (select count(*)::int from public.shopping_catalog_items where group_id = pg_temp.grp('a')),
  0, 'and takes its lists and catalog with it');

select * from finish();
rollback;
