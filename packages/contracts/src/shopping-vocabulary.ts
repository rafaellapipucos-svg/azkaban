// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Shopping categories (ADR-0011), in the order of a typical Brazilian supermarket, which is the order
 * the lists show. Mirrored, in this order, by the Postgres enum `public.shopping_category`. Labels
 * come from i18n (`shopping.categories.<key>`), never from here.
 */
export const shoppingCategories = [
  'produce',
  'bakery',
  'meat',
  'dairy',
  'pantry',
  'beverages',
  'frozen',
  'cleaning',
  'hygiene',
  'other',
] as const;

/** Units of quantity. Mirrored by the Postgres enum `public.shopping_unit`. Labels from i18n. */
export const shoppingUnits = ['unit', 'kg', 'g', 'l', 'pack', 'box', 'dozen'] as const;
