import {
  shoppingCategories,
  shoppingQuantityMax,
  type ShoppingCatalogItem,
  type ShoppingCategory,
  type ShoppingListItem,
} from '@azkaban/contracts';

// Pure rules of the shopping list (ADR-0011). Labels come from the caller, so this stays i18n-free.

export type CategorySection<T> = { category: ShoppingCategory; items: T[] };

type Named = { name: string; category: ShoppingCategory };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

/** Categories in the contract's order, which is the store's; empty ones left out. */
function sections<T extends Named>(items: T[], compare: (a: T, b: T) => number) {
  return shoppingCategories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category).sort(compare),
    }))
    .filter(({ items: inside }) => inside.length > 0);
}

/**
 * "At the store": by category, what is left first and checked items sunk to the bottom of their
 * category. A category with nothing left sinks below every category that still has something.
 */
export function marketSections<T extends Named & Pick<ShoppingListItem, 'checkedAt'>>(
  items: T[],
): CategorySection<T>[] {
  const all = sections(
    items,
    (a, b) => Number(a.checkedAt !== null) - Number(b.checkedAt !== null) || byName(a, b),
  );
  const done = (section: CategorySection<T>) =>
    section.items.every(({ checkedAt }) => checkedAt !== null);
  return [...all.filter((s) => !done(s)), ...all.filter(done)];
}

/** Lower case, no accents, trimmed: "Feijão" is found by "feijao". */
export function searchKey(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

/** "Build": the catalog by category, archived rows out, filtered by a search on the name. */
export function catalogSections<
  T extends Named & Pick<ShoppingCatalogItem, 'sortOrder' | 'archivedAt'>,
>(catalog: T[], query: string): CategorySection<T>[] {
  const key = searchKey(query);
  const visible = catalog.filter(
    (item) => item.archivedAt === null && searchKey(item.name).includes(key),
  );
  return sections(visible, (a, b) => a.sortOrder - b.sortOrder || byName(a, b));
}

/** The catalog row whose name is the query, ignoring case and accents: no "add as new" for it. */
export function exactMatch<T extends { name: string }>(catalog: T[], query: string) {
  const key = searchKey(query);
  return key ? catalog.find((item) => searchKey(item.name) === key) : undefined;
}

/** `numeric(10,3)`: Postgres keeps three decimals, so the client does too (0.1 + 0.2 is 0.3). */
export function roundQuantity(quantity: number) {
  return Math.round(quantity * 1000) / 1000;
}

/**
 * What the screen shows: the last row from the server plus the deltas still on their way
 * (ADR-0011, section 5). `null` means the item is off the list, as the database deletes it at zero.
 * `server` is 0 for a catalog item not on the list yet.
 */
export function projectQuantity(server: number, pending: number): number | null {
  const quantity = roundQuantity(server + pending);
  return quantity <= 0 ? null : Math.min(quantity, shoppingQuantityMax);
}

/** "1,5" in pt-BR: up to three decimals, no trailing zeros. */
export function formatQuantity(quantity: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(quantity);
}

type ShareItem = Named &
  Pick<ShoppingListItem, 'quantity' | 'unit' | 'emoji' | 'note' | 'checkedAt'>;

/**
 * The list as plain text, for WhatsApp and the like: only what is left to buy, by category.
 * `quantity` gives "2 pacotes" from i18n, `category` the category's name.
 */
export function shoppingShareText<T extends ShareItem>(
  name: string,
  items: T[],
  label: { category: (category: ShoppingCategory) => string; quantity: (item: T) => string },
) {
  const left = sections(
    items.filter(({ checkedAt }) => checkedAt === null),
    byName,
  );
  const blocks = left.map(({ category, items: inside }) =>
    [
      label.category(category),
      ...inside.map((item) => {
        const emoji = item.emoji ? `${item.emoji} ` : '';
        const note = item.note ? ` (${item.note})` : '';
        return `- ${emoji}${item.name}: ${label.quantity(item)}${note}`;
      }),
    ].join('\n'),
  );
  return [name, ...blocks].join('\n\n');
}
