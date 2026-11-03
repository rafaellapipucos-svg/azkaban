import { describe, expect, it } from 'vitest';
import {
  shoppingCatalogItemInputSchema,
  shoppingListCreateInputSchema,
  shoppingListItemInputSchema,
  shoppingListItemUpdateInputSchema,
  shoppingListUpdateInputSchema,
  shoppingQuantityAdjustSchema,
  shoppingQuantityMax,
} from './shopping';

const id = '11111111-1111-4111-8111-111111111111';

const item = {
  listId: id,
  catalogItemId: null,
  name: 'Pilhas AA',
  category: 'other',
  quantity: 1,
  unit: 'pack',
  emoji: null,
  note: null,
};

describe('shoppingListItemInputSchema', () => {
  it('takes an item outside the catalog', () => {
    expect(shoppingListItemInputSchema.safeParse(item).success).toBe(true);
  });

  it.each([0, -1, 0.0001, shoppingQuantityMax + 1, Number.NaN])(
    'refuses %s as a quantity',
    (quantity) => {
      expect(shoppingListItemInputSchema.safeParse({ ...item, quantity }).success).toBe(false);
    },
  );

  it('keeps fractions a scale can weigh', () => {
    expect(shoppingListItemInputSchema.safeParse({ ...item, quantity: 0.5 }).success).toBe(true);
  });

  it('refuses a blank name and a category or unit outside the vocabulary', () => {
    expect(shoppingListItemInputSchema.safeParse({ ...item, name: '   ' }).success).toBe(false);
    expect(shoppingListItemInputSchema.safeParse({ ...item, category: 'toys' }).success).toBe(
      false,
    );
    expect(shoppingListItemInputSchema.safeParse({ ...item, unit: 'L' }).success).toBe(false);
  });

  it('caps the note', () => {
    const note = 'x'.repeat(201);
    expect(shoppingListItemInputSchema.safeParse({ ...item, note }).success).toBe(false);
  });
});

describe('update inputs', () => {
  it('refuse an empty change', () => {
    expect(shoppingListItemUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(shoppingListUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('never let a client set who added or checked an item', () => {
    const parsed = shoppingListItemUpdateInputSchema.parse({ quantity: 2, addedBy: id });
    expect(parsed).toEqual({ quantity: 2 });
  });

  it('unlink a task with null', () => {
    expect(shoppingListUpdateInputSchema.safeParse({ linkedTaskId: null }).success).toBe(true);
  });
});

describe('shoppingQuantityAdjustSchema', () => {
  it('takes either an item or a catalog entry on a list', () => {
    expect(shoppingQuantityAdjustSchema.safeParse({ itemId: id, delta: -1 }).success).toBe(true);
    expect(
      shoppingQuantityAdjustSchema.safeParse({ listId: id, catalogItemId: id, delta: 0.5 }).success,
    ).toBe(true);
  });

  it('refuses both targets at once, and a zero delta', () => {
    expect(
      shoppingQuantityAdjustSchema.safeParse({
        itemId: id,
        listId: id,
        catalogItemId: id,
        delta: 1,
      }).success,
    ).toBe(false);
    expect(shoppingQuantityAdjustSchema.safeParse({ itemId: id, delta: 0 }).success).toBe(false);
  });
});

describe('scopes', () => {
  it('takes a personal list and a copy of another list', () => {
    expect(
      shoppingListCreateInputSchema.safeParse({ groupId: null, name: 'Mercado' }).success,
    ).toBe(true);
    expect(
      shoppingListCreateInputSchema.safeParse({ groupId: id, name: 'Feira', fromListId: id })
        .success,
    ).toBe(true);
  });

  it('takes a personal catalog item', () => {
    const input = {
      groupId: null,
      name: 'Café',
      category: 'pantry',
      defaultUnit: 'pack',
      emoji: '☕',
    };
    expect(shoppingCatalogItemInputSchema.safeParse(input).success).toBe(true);
  });
});
