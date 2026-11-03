-- ADR-0011, sections 1 and 13. In the order of packages/contracts/src/shopping-vocabulary.ts, which is the
-- display order. `pnpm db:check-permissions` compares both, order included.
create type public.shopping_category as enum (
  'produce', 'bakery', 'meat', 'dairy', 'pantry', 'beverages', 'frozen', 'cleaning', 'hygiene', 'other'
);

create type public.shopping_unit as enum ('unit', 'kg', 'g', 'l', 'pack', 'box', 'dozen');
