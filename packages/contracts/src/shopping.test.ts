import { describe, expect, it } from 'vitest';
import {
  shoppingCatalogItemInputSchema,
  shoppingControlCharacterPattern,
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

// SEG7-3. Built from code points, so no invisible character sits in this file.
describe('control characters', () => {
  const ch = (codePoint: number) => String.fromCodePoint(codePoint);
  const refused = [
    0x0a, 0x0d, 0x09, 0x00, 0x1f, 0x7f, 0x85, 0x9f, 0x2028, 0x2029, 0x202a, 0x202c, 0x202e, 0x2066,
    0x2068, 0x2069,
  ];

  it.each(refused)('refuses code point %i inside a name, a note and an emoji', (codePoint) => {
    const text = `a${ch(codePoint)}b`;
    expect(shoppingListItemInputSchema.safeParse({ ...item, name: text }).success).toBe(false);
    expect(shoppingListItemInputSchema.safeParse({ ...item, note: text }).success).toBe(false);
    expect(shoppingListItemInputSchema.safeParse({ ...item, emoji: text }).success).toBe(false);
    expect(shoppingListCreateInputSchema.safeParse({ groupId: null, name: text }).success).toBe(
      false,
    );
  });

  it('covers every \\p{Cc} code point', () => {
    for (let codePoint = 0; codePoint <= 0x9f; codePoint += 1) {
      const control = /\p{Cc}/u.test(ch(codePoint));
      expect(shoppingControlCharacterPattern.test(ch(codePoint)), String(codePoint)).toBe(control);
    }
  });

  it('keeps composed emojis, accents and the neighbours of the refused ranges', () => {
    const emojis = [
      `${ch(0x1f469)}${ch(0x200d)}${ch(0x1f373)}`,
      `${ch(0x2764)}${ch(0xfe0f)}`,
      `${ch(0x1f1e7)}${ch(0x1f1f7)}`,
      `${ch(0x1f44d)}${ch(0x1f3fd)}`,
    ];
    for (const emoji of emojis) {
      expect(shoppingListItemInputSchema.safeParse({ ...item, emoji }).success, emoji).toBe(true);
    }
    const name = `P${ch(0xe3)}o ${ch(0x2027)}${ch(0x202f)}${ch(0x2065)}${ch(0x206a)} a${ch(0xa0)}b`;
    expect(shoppingListItemInputSchema.safeParse({ ...item, name }).success).toBe(true);
  });

  it('trims a trailing line break instead of refusing it', () => {
    const parsed = shoppingListItemInputSchema.parse({ ...item, name: 'Arroz\n' });
    expect(parsed.name).toBe('Arroz');
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
