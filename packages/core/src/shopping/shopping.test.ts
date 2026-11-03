import type { ShoppingCategory } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import {
  catalogSections,
  exactMatch,
  formatQuantity,
  marketSections,
  projectQuantity,
  roundQuantity,
  searchKey,
  shoppingShareText,
} from './shopping';

const at = '2026-11-03T10:00:00.000Z';

function item(name: string, category: ShoppingCategory, checked = false, extra = {}) {
  return {
    name,
    category,
    quantity: 1,
    unit: 'unit' as const,
    emoji: null,
    note: null,
    checkedAt: checked ? at : null,
    ...extra,
  };
}

const names = (sections: { category: string; items: { name: string }[] }[]) =>
  sections.map(({ category, items }) => `${category}: ${items.map(({ name }) => name).join(',')}`);

describe('marketSections', () => {
  it('follows the store order of the contract, not the order items were added', () => {
    const items = [item('Sabonete', 'hygiene'), item('Leite', 'dairy'), item('Banana', 'produce')];
    expect(names(marketSections(items))).toEqual([
      'produce: Banana',
      'dairy: Leite',
      'hygiene: Sabonete',
    ]);
  });

  it('sinks a checked item to the bottom of its category, and back up when unchecked', () => {
    const items = [
      item('Alho', 'produce', true),
      item('Tomate', 'produce'),
      item('Cebola', 'produce'),
    ];
    expect(names(marketSections(items))).toEqual(['produce: Cebola,Tomate,Alho']);
    items[0] = item('Alho', 'produce');
    expect(names(marketSections(items))).toEqual(['produce: Alho,Cebola,Tomate']);
  });

  it('sinks a category with nothing left below the ones still to buy', () => {
    const items = [item('Banana', 'produce', true), item('Café', 'pantry'), item('Pão', 'bakery')];
    expect(names(marketSections(items))).toEqual([
      'bakery: Pão',
      'pantry: Café',
      'produce: Banana',
    ]);
  });

  it('sorts by name the way a person reads it, ignoring case and accents', () => {
    const items = [item('óleo', 'pantry'), item('Arroz', 'pantry'), item('Macarrão', 'pantry')];
    expect(names(marketSections(items))).toEqual(['pantry: Arroz,Macarrão,óleo']);
  });
});

describe('search', () => {
  const catalog = [
    { ...item('Feijão', 'pantry'), sortOrder: 20, archivedAt: null },
    { ...item('Arroz', 'pantry'), sortOrder: 10, archivedAt: null },
    { ...item('Café', 'pantry'), sortOrder: 30, archivedAt: at },
    { ...item('Leite', 'dairy'), sortOrder: 40, archivedAt: null },
  ];

  it('finds without accents or case', () => {
    expect(searchKey('  FEIJÃO ')).toBe('feijao');
    expect(names(catalogSections(catalog, 'feijao'))).toEqual(['pantry: Feijão']);
  });

  it('keeps the admin order inside a category and leaves archived rows out', () => {
    expect(names(catalogSections(catalog, ''))).toEqual(['dairy: Leite', 'pantry: Arroz,Feijão']);
    expect(catalogSections(catalog, 'cafe')).toEqual([]);
  });

  it('knows an exact name, so a typed item does not repeat the catalog', () => {
    expect(exactMatch(catalog, 'arroz')?.name).toBe('Arroz');
    expect(exactMatch(catalog, 'arro')).toBeUndefined();
    expect(exactMatch(catalog, '   ')).toBeUndefined();
  });
});

describe('quantities', () => {
  it('rounds to the three decimals Postgres keeps', () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.0004)).toBe(1);
  });

  it('adds the deltas still on their way to the row from the server', () => {
    expect(projectQuantity(1, 0)).toBe(1);
    expect(projectQuantity(1, 2)).toBe(3);
    expect(projectQuantity(0, 0.5)).toBe(0.5);
    expect(projectQuantity(0.5, 0.5 + 0.5)).toBe(1.5);
  });

  it('takes the item off the list at zero or below, as the database does', () => {
    expect(projectQuantity(1, -1)).toBeNull();
    expect(projectQuantity(0.5, -1)).toBeNull();
    expect(projectQuantity(0, 0)).toBeNull();
  });

  it('formats like pt-BR, without trailing zeros', () => {
    expect(formatQuantity(1.5, 'pt-BR')).toBe('1,5');
    expect(formatQuantity(2, 'pt-BR')).toBe('2');
    expect(formatQuantity(0.125, 'pt-BR')).toBe('0,125');
  });
});

describe('shoppingShareText', () => {
  const label = {
    category: (category: ShoppingCategory) => category.toUpperCase(),
    quantity: ({ quantity }: { quantity: number }) => `${quantity} un`,
  };

  it('sends only what is left, by category, with emoji and note', () => {
    const items = [
      item('Sabonete', 'hygiene', false, { quantity: 3 }),
      item('Leite', 'dairy', true),
      item('Banana', 'produce', false, { emoji: '🍌', note: 'maduras' }),
      item('Tomate', 'produce'),
    ];
    expect(shoppingShareText('Mercado', items, label)).toBe(
      [
        'Mercado',
        'PRODUCE\n- 🍌 Banana: 1 un (maduras)\n- Tomate: 1 un',
        'HYGIENE\n- Sabonete: 3 un',
      ].join('\n\n'),
    );
  });

  it('is only the name when everything is in the cart', () => {
    expect(shoppingShareText('Mercado', [item('Leite', 'dairy', true)], label)).toBe('Mercado');
  });
});
