// Type-only imports: `pnpm db:check-permissions` loads this file directly in Node.
import type { ShoppingCatalogSeedItem } from '@azkaban/contracts';

/**
 * Starter catalog (ADR-0011, section 2). Copied into the catalog of every new group and every new
 * profile, where admins edit their own copy. This file is the source; `public.shopping_catalog_seed`
 * is its mirror, with `sort_order` = position × 10. Editing it needs a migration that rewrites the
 * mirror, and only catalogs created afterwards see the change.
 */
export const shoppingCatalogSeed = [
  { name: 'Banana', category: 'produce', unit: 'dozen', emoji: '🍌' },
  { name: 'Tomate', category: 'produce', unit: 'kg', emoji: '🍅' },
  { name: 'Cebola', category: 'produce', unit: 'kg', emoji: '🧅' },
  { name: 'Alho', category: 'produce', unit: 'unit', emoji: '🧄' },
  { name: 'Batata', category: 'produce', unit: 'kg', emoji: '🥔' },
  { name: 'Cenoura', category: 'produce', unit: 'kg', emoji: '🥕' },
  { name: 'Alface', category: 'produce', unit: 'unit', emoji: '🥬' },
  { name: 'Limão', category: 'produce', unit: 'kg', emoji: '🍋' },
  { name: 'Maçã', category: 'produce', unit: 'kg', emoji: '🍎' },
  { name: 'Laranja', category: 'produce', unit: 'kg', emoji: '🍊' },
  { name: 'Pão francês', category: 'bakery', unit: 'unit', emoji: '🥖' },
  { name: 'Pão de forma', category: 'bakery', unit: 'pack', emoji: '🍞' },
  { name: 'Frango', category: 'meat', unit: 'kg', emoji: '🍗' },
  { name: 'Carne moída', category: 'meat', unit: 'kg', emoji: '🥩' },
  { name: 'Linguiça', category: 'meat', unit: 'kg', emoji: '🌭' },
  { name: 'Peixe', category: 'meat', unit: 'kg', emoji: '🐟' },
  { name: 'Leite', category: 'dairy', unit: 'l', emoji: '🥛' },
  { name: 'Ovos', category: 'dairy', unit: 'dozen', emoji: '🥚' },
  { name: 'Manteiga', category: 'dairy', unit: 'unit', emoji: '🧈' },
  { name: 'Queijo muçarela', category: 'dairy', unit: 'kg', emoji: '🧀' },
  { name: 'Presunto', category: 'dairy', unit: 'kg', emoji: '🥓' },
  { name: 'Iogurte', category: 'dairy', unit: 'unit', emoji: '🥄' },
  { name: 'Arroz', category: 'pantry', unit: 'pack', emoji: '🍚' },
  { name: 'Feijão', category: 'pantry', unit: 'pack', emoji: '🫘' },
  { name: 'Café', category: 'pantry', unit: 'pack', emoji: '☕' },
  { name: 'Açúcar', category: 'pantry', unit: 'pack', emoji: '🍬' },
  { name: 'Óleo', category: 'pantry', unit: 'unit', emoji: '🌻' },
  { name: 'Sal', category: 'pantry', unit: 'unit', emoji: '🧂' },
  { name: 'Macarrão', category: 'pantry', unit: 'pack', emoji: '🍝' },
  { name: 'Farinha de trigo', category: 'pantry', unit: 'pack', emoji: '🌾' },
  { name: 'Molho de tomate', category: 'pantry', unit: 'unit', emoji: '🥫' },
  { name: 'Biscoito', category: 'pantry', unit: 'pack', emoji: '🍪' },
  { name: 'Água mineral', category: 'beverages', unit: 'l', emoji: '💧' },
  { name: 'Suco', category: 'beverages', unit: 'l', emoji: '🧃' },
  { name: 'Refrigerante', category: 'beverages', unit: 'l', emoji: '🥤' },
  { name: 'Detergente', category: 'cleaning', unit: 'unit', emoji: '🧴' },
  { name: 'Sabão em pó', category: 'cleaning', unit: 'box', emoji: '🧺' },
  { name: 'Água sanitária', category: 'cleaning', unit: 'l', emoji: '🫧' },
  { name: 'Esponja', category: 'cleaning', unit: 'pack', emoji: '🧽' },
  { name: 'Saco de lixo', category: 'cleaning', unit: 'pack', emoji: '🗑️' },
  { name: 'Papel higiênico', category: 'hygiene', unit: 'pack', emoji: '🧻' },
  { name: 'Sabonete', category: 'hygiene', unit: 'unit', emoji: '🧼' },
  { name: 'Pasta de dente', category: 'hygiene', unit: 'unit', emoji: '🪥' },
  { name: 'Xampu', category: 'hygiene', unit: 'unit', emoji: '🧴' },
] as const satisfies readonly ShoppingCatalogSeedItem[];
