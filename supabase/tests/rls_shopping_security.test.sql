-- Shopping hardening from the Phase 7 security review (ADR-0011, section 16): the open lists cap
-- (SEG7-2), plain text (SEG7-3), the foreign key bypass of the guards (SEG7-4), the source of a copy
-- (SEG7-5) and non finite deltas (SEG7-6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Alice owns Casa A, Duda is a member of A. Eva owns Casa B.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local', '{"display_name": "Eva"}');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'Casa B', 'family', '00000000-0000-0000-0000-00000000000e');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member');

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

-- n lists in a scope, as the logged in user; the id of the last one.
create function pg_temp.lists(n int, p_group uuid) returns uuid language plpgsql as $$
declare id uuid;
begin
  for k in 1..n loop
    id := (public.create_shopping_list(null, p_group, 'Lista ' || k, null)).id;
  end loop;
  return id;
end;
$$;

-- How many of the forbidden characters a plain_check constraint refuses when written into the middle of
-- p_col, as postgres, past RLS. Each attempt in its own subtransaction.
create function pg_temp.refused(p_table text, p_col text, p_id uuid) returns int language plpgsql as $$
declare
  n int := 0;
  ch text;
  cname text;
begin
  foreach ch in array array[chr(10), chr(133), chr(8232), chr(8238), chr(8294)] loop
    begin
      execute format('update public.%I set %I = %L where id = %L', p_table, p_col, 'a' || ch || 'b', p_id);
    exception when check_violation then
      get stacked diagnostics cname = constraint_name;
      if cname = p_table || '_' || p_col || '_plain_check' then
        n := n + 1;
      end if;
    end;
  end loop;
  return n;
end;
$$;

-- A statement run one trigger level down: inserting a row here runs it from an after trigger, so the
-- shopping guards see pg_trigger_depth() = 2, like a future trigger of F7-5 would.
create temp table poke (sql text);
create function pg_temp.poke() returns trigger language plpgsql as $$
begin
  execute new.sql;
  return null;
end;
$$;
create trigger poke after insert on pg_temp.poke for each row execute function pg_temp.poke();

-- ===== SEG7-2: open lists cap =====
select is((select (value ->> 'maxOpenListsPerScope')::int from public.app_settings where key = 'shopping_rules'), 50,
  'the cap mirrors shoppingRules.maxOpenListsPerScope');

-- The cap needs more creations than the hourly rate limit (ADR-0012, section 4) lets one person make;
-- raised in this transaction only. rls_rate_limits.test.sql tests the limit itself.
update public.app_settings
set value = jsonb_set(value, '{actions,shopping_list_create,limit}', '1000')
where key = 'rate_limit_rules';

select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('g49', pg_temp.lists(49, pg_temp.grp('a'))::text);
select lives_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Lista 50', null)$$,
  'the 50th open list of a group fits');
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Lista 51', null)$$,
  '54000', 'lists_full', 'the 51st is lists_full');
select pg_temp.sv('p49', pg_temp.lists(49, null)::text);
select lives_ok($$select public.create_shopping_list(null, null, 'Pessoal 50', null)$$,
  'a full group takes no place from the personal lists of a member: her 50th personal list fits');
select throws_ok($$select public.create_shopping_list(null, null, 'Pessoal 51', null)$$,
  '54000', 'lists_full', 'her 51st personal list is lists_full');
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Lista 51', null)$$,
  '54000', 'lists_full', 'and her full personal lists do not free the group');

select pg_temp.login(pg_temp.u('a'));
select lives_ok($$select public.create_shopping_list(null, null, 'Minha', null)$$,
  'the personal cap is per person: another member of the group still creates a personal list');
select pg_temp.login(pg_temp.u('e'));
select lives_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('b') || $$', 'Casa B', null)$$,
  'and another group still creates a list');

select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Cópia', '$$ || pg_temp.g('g49') || $$')$$,
  '54000', 'lists_full', 'a new list from another one is also lists_full at the cap');
select is((public.complete_shopping_list(pg_temp.g('g49'))).status::text, 'completed', 'completing a list');
select lives_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Cópia', '$$ || pg_temp.g('g49') || $$')$$,
  'frees a place, which a copy of it takes');
select throws_ok($$select public.create_shopping_list(null, '$$ || pg_temp.grp('a') || $$', 'Lista 51', null)$$,
  '54000', 'lists_full', 'and the group is full again: completed lists do not count, open copies do');
select is((select count(*)::int from public.shopping_lists where group_id = pg_temp.grp('a') and status = 'open'), 50,
  'the group has exactly 50 open lists');

-- ===== SEG7-5: the source of a copy =====
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select public.create_shopping_list(null, null, 'Cópia', '$$ || pg_temp.g('p49') || $$')$$,
  '42501', 'forbidden', 'a copy of the personal list of someone else is forbidden');
select throws_ok($$select public.create_shopping_list(null, null, 'Cópia', '30000000-0000-0000-0000-0000000000ff')$$,
  '42501', 'forbidden', 'a copy of a list that does not exist is forbidden too');

-- ===== SEG7-6: non finite deltas =====
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('la', (select id::text from public.shopping_lists where group_id = pg_temp.grp('a') and status = 'open' limit 1));
select pg_temp.sv('cat', (select id::text from public.shopping_catalog_items where group_id = pg_temp.grp('a') and name = 'Arroz'));
select pg_temp.sv('ia', (public.add_catalog_item_to_list(pg_temp.g('la'), pg_temp.g('cat'), 1)).id::text);
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('ia') || $$', 'NaN')$$,
  '22023', 'invalid_argument', 'a NaN step is invalid_argument');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('ia') || $$', 'Infinity')$$,
  '22023', 'invalid_argument', 'so is an infinite one');
select throws_ok($$select public.adjust_shopping_item_quantity('$$ || pg_temp.g('ia') || $$', '-Infinity')$$,
  '22023', 'invalid_argument', 'and a minus infinite one');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.g('cat') || $$', 'NaN')$$,
  '22023', 'invalid_argument', 'a NaN tap on the catalog is invalid_argument');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.g('cat') || $$', 'Infinity')$$,
  '22023', 'invalid_argument', 'so is an infinite one');
select throws_ok($$select public.add_catalog_item_to_list('$$ || pg_temp.g('la') || $$', '$$ || pg_temp.g('cat') || $$', '-Infinity')$$,
  '22023', 'invalid_argument', 'and a minus infinite one');
select is((select quantity from public.shopping_list_items where id = pg_temp.g('ia')), 1.000::numeric(10,3),
  'the quantity did not move');

-- ===== SEG7-3: plain text =====
select pg_temp.pg();
select is(
  (select string_agg(conname, ',' order by conname) from pg_constraint
   where conname like 'shopping%plain_check' and convalidated and contype = 'c'),
  'shopping_catalog_items_emoji_plain_check,shopping_catalog_items_name_plain_check,'
  || 'shopping_list_items_emoji_plain_check,shopping_list_items_name_plain_check,shopping_list_items_note_plain_check,'
  || 'shopping_lists_name_plain_check',
  'the six text columns of shopping have a validated plain text check');
update public.shopping_list_items set note = 'nota', emoji = '🍚' where id = pg_temp.g('ia');
select is(pg_temp.refused('shopping_catalog_items', 'name', pg_temp.g('cat')), 5,
  'a catalog name refuses LF, U+0085, U+2028, U+202E and U+2066');
select is(pg_temp.refused('shopping_catalog_items', 'emoji', pg_temp.g('cat')), 5, 'so does a catalog emoji');
select is(pg_temp.refused('shopping_lists', 'name', pg_temp.g('la')), 5, 'and a list name');
select is(pg_temp.refused('shopping_list_items', 'name', pg_temp.g('ia')), 5, 'and an item name');
select is(pg_temp.refused('shopping_list_items', 'note', pg_temp.g('ia')), 5, 'and an item note');
select is(pg_temp.refused('shopping_list_items', 'emoji', pg_temp.g('ia')), 5, 'and an item emoji');
-- A family with ZWJ, and a heart with U+FE0F.
select lives_ok($$update public.shopping_catalog_items set name = 'Família 👨‍👩‍👧', emoji = '👨‍👩‍👧' where id = '$$ || pg_temp.g('cat') || $$'$$,
  'a catalog name and emoji take an emoji with ZWJ');
select lives_ok($$update public.shopping_lists set name = 'Festa 👨‍👩‍👧 ❤️' where id = '$$ || pg_temp.g('la') || $$'$$,
  'a list name too');
select lives_ok($$update public.shopping_list_items set name = 'Bolo 👨‍👩‍👧', note = 'para 👨‍👩‍👧 ❤️', emoji = '❤️' where id = '$$ || pg_temp.g('ia') || $$'$$,
  'and an item name, note and emoji');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$insert into public.shopping_list_items (list_id, name, category, quantity, unit) values ('$$ || pg_temp.g('la') || $$', 'Pão' || chr(8238) || 'x', 'other', 1, 'unit')$$,
  '23514', null, 'a member writing through the REST API hits the same check');

-- ===== SEG7-4: one trigger level down, only foreign key actions pass =====
select pg_temp.pg();
select pg_temp.sv('lx', (select id::text from public.shopping_lists where group_id = pg_temp.grp('a') and status = 'completed'));
select pg_temp.sv('ix', (select id::text from public.shopping_list_items where list_id = pg_temp.g('la') limit 1));
update public.shopping_lists set status = 'completed', completed_at = now() where id = pg_temp.g('la');
select is((select status::text from public.shopping_lists where id = pg_temp.g('la')), 'completed', 'a list with items, completed');

select throws_ok($$insert into pg_temp.poke values ('update public.shopping_lists set status = ''open'', completed_at = null where id = ''$$ || pg_temp.g('la') || $$''')$$,
  'P0001', 'list_completed', 'a trigger one level down cannot reopen a completed list');
select throws_ok($$insert into pg_temp.poke values ('update public.shopping_lists set linked_task_id = null, name = ''x'' where id = ''$$ || pg_temp.g('la') || $$''')$$,
  'P0001', 'list_completed', 'nor rename it alongside a column a foreign key action would null');
select throws_ok($$insert into pg_temp.poke values ('update public.shopping_lists set group_id = ''$$ || pg_temp.grp('b') || $$'' where id = ''$$ || pg_temp.g('la') || $$''')$$,
  '42501', 'forbidden', 'nor move a list to another scope');
select lives_ok($$insert into pg_temp.poke values ('update public.shopping_lists set created_by = null, completed_by = null where id = ''$$ || pg_temp.g('la') || $$''')$$,
  'what a foreign key action does still passes on a completed list');
select throws_ok($$insert into pg_temp.poke values ('update public.shopping_list_items set note = ''x'' where id = ''$$ || pg_temp.g('ix') || $$''')$$,
  'P0001', 'list_completed', 'nor edit an item of a completed list');
select throws_ok($$insert into pg_temp.poke values ('delete from public.shopping_list_items where id = ''$$ || pg_temp.g('ix') || $$''')$$,
  'P0001', 'list_completed', 'nor delete it while the list is there');
select throws_ok($$insert into pg_temp.poke values ('insert into public.shopping_list_items (list_id, name, category, quantity, unit) values (''$$ || pg_temp.g('la') || $$'', ''Pilhas'', ''other'', 1, ''pack'')')$$,
  'P0001', 'list_completed', 'nor add an item to it');
select lives_ok($$insert into pg_temp.poke values ('update public.shopping_list_items set added_by = null, checked_by = null, catalog_item_id = null where id = ''$$ || pg_temp.g('ix') || $$''')$$,
  'nulling the foreign keys of an item still passes on a completed list');
select lives_ok($$delete from public.groups where id = '$$ || pg_temp.grp('a') || $$'$$,
  'and the cascade of a group delete still takes completed lists and their items');

select * from finish();
rollback;
