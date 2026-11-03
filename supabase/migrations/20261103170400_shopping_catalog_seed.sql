-- ADR-0011, section 2. Mirror of packages/config/src/shopping-catalog-seed.ts, with sort_order = position
-- x 10; `pnpm db:check-permissions` compares both. In a migration and not in supabase/seed, so the hosted
-- project has it too. No client reads it: RLS on, no policy, no grant.
create table public.shopping_catalog_seed (
  sort_order int primary key,
  name text not null unique,
  category public.shopping_category not null,
  default_unit public.shopping_unit not null,
  emoji text not null
);

alter table public.shopping_catalog_seed enable row level security;
revoke all on public.shopping_catalog_seed from anon, authenticated;

insert into public.shopping_catalog_seed (sort_order, name, category, default_unit, emoji) values
  (10, 'Banana', 'produce', 'dozen', '🍌'),
  (20, 'Tomate', 'produce', 'kg', '🍅'),
  (30, 'Cebola', 'produce', 'kg', '🧅'),
  (40, 'Alho', 'produce', 'unit', '🧄'),
  (50, 'Batata', 'produce', 'kg', '🥔'),
  (60, 'Cenoura', 'produce', 'kg', '🥕'),
  (70, 'Alface', 'produce', 'unit', '🥬'),
  (80, 'Limão', 'produce', 'kg', '🍋'),
  (90, 'Maçã', 'produce', 'kg', '🍎'),
  (100, 'Laranja', 'produce', 'kg', '🍊'),
  (110, 'Pão francês', 'bakery', 'unit', '🥖'),
  (120, 'Pão de forma', 'bakery', 'pack', '🍞'),
  (130, 'Frango', 'meat', 'kg', '🍗'),
  (140, 'Carne moída', 'meat', 'kg', '🥩'),
  (150, 'Linguiça', 'meat', 'kg', '🌭'),
  (160, 'Peixe', 'meat', 'kg', '🐟'),
  (170, 'Leite', 'dairy', 'l', '🥛'),
  (180, 'Ovos', 'dairy', 'dozen', '🥚'),
  (190, 'Manteiga', 'dairy', 'unit', '🧈'),
  (200, 'Queijo muçarela', 'dairy', 'kg', '🧀'),
  (210, 'Presunto', 'dairy', 'kg', '🥓'),
  (220, 'Iogurte', 'dairy', 'unit', '🥄'),
  (230, 'Arroz', 'pantry', 'pack', '🍚'),
  (240, 'Feijão', 'pantry', 'pack', '🫘'),
  (250, 'Café', 'pantry', 'pack', '☕'),
  (260, 'Açúcar', 'pantry', 'pack', '🍬'),
  (270, 'Óleo', 'pantry', 'unit', '🌻'),
  (280, 'Sal', 'pantry', 'unit', '🧂'),
  (290, 'Macarrão', 'pantry', 'pack', '🍝'),
  (300, 'Farinha de trigo', 'pantry', 'pack', '🌾'),
  (310, 'Molho de tomate', 'pantry', 'unit', '🥫'),
  (320, 'Biscoito', 'pantry', 'pack', '🍪'),
  (330, 'Água mineral', 'beverages', 'l', '💧'),
  (340, 'Suco', 'beverages', 'l', '🧃'),
  (350, 'Refrigerante', 'beverages', 'l', '🥤'),
  (360, 'Detergente', 'cleaning', 'unit', '🧴'),
  (370, 'Sabão em pó', 'cleaning', 'box', '🧺'),
  (380, 'Água sanitária', 'cleaning', 'l', '🫧'),
  (390, 'Esponja', 'cleaning', 'pack', '🧽'),
  (400, 'Saco de lixo', 'cleaning', 'pack', '🗑️'),
  (410, 'Papel higiênico', 'hygiene', 'pack', '🧻'),
  (420, 'Sabonete', 'hygiene', 'unit', '🧼'),
  (430, 'Pasta de dente', 'hygiene', 'unit', '🪥'),
  (440, 'Xampu', 'hygiene', 'unit', '🧴');

-- Copies the seed into one catalog. Exactly one argument is set; the scope check of the table says so.
create function public.seed_shopping_catalog(p_group_id uuid, p_owner_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.shopping_catalog_items (group_id, owner_user_id, name, category, default_unit, emoji, sort_order)
  select p_group_id, p_owner_user_id, s.name, s.category, s.default_unit, s.emoji, s.sort_order
  from public.shopping_catalog_seed s
  order by s.sort_order;
$$;

create function public.seed_shopping_catalog_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'groups' then
    perform public.seed_shopping_catalog(new.id, null);
  else
    perform public.seed_shopping_catalog(null, new.id);
  end if;
  return null;
end;
$$;

revoke execute on function public.seed_shopping_catalog(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.seed_shopping_catalog_on_insert() from public, anon, authenticated;

create trigger groups_seed_shopping_catalog
  after insert on public.groups
  for each row execute function public.seed_shopping_catalog_on_insert();

create trigger profiles_seed_shopping_catalog
  after insert on public.profiles
  for each row execute function public.seed_shopping_catalog_on_insert();

-- Groups and profiles created before this migration.
select public.seed_shopping_catalog(id, null) from public.groups;
select public.seed_shopping_catalog(null, id) from public.profiles;
