import { shoppingCatalogSeed, shoppingDefaults, shoppingRules } from '@azkaban/config';
import type {
  ShoppingCatalogItem,
  ShoppingList,
  ShoppingListItem,
  ShoppingListItemInput,
} from '@azkaban/contracts';
import { currentUserId } from '../client';
import type { ShoppingRepository } from './index';

// Sample data in memory, standing in for the database until the migrations of ADR-0011 land. It
// copies the seed into each catalog the way the database trigger does, and raises the same codes.
// Nothing here survives a reload.

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date().toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const round = (quantity: number) => Math.round(quantity * 1000) / 1000;
/** Someone who left the group: shown as a former member. */
const formerMember = newId();

const lists = new Map<string, ShoppingList>();
const items = new Map<string, ShoppingListItem>();
const catalogs = new Map<string, ShoppingCatalogItem[]>();
const watchers = new Map<string, Set<() => void>>();

const scopeKey = (groupId: string | null) => groupId ?? 'personal';
const notify = (listId: string) => watchers.get(listId)?.forEach((onChange) => onChange());

function catalogOf(groupId: string | null, userId: string) {
  const key = scopeKey(groupId);
  let catalog = catalogs.get(key);
  if (!catalog) {
    catalog = shoppingCatalogSeed.map(({ name, category, unit, emoji }, index) => ({
      id: newId(),
      groupId,
      ownerUserId: groupId ? null : userId,
      name,
      category,
      defaultUnit: unit,
      emoji,
      sortOrder: (index + 1) * 10,
      archivedAt: null,
    }));
    catalogs.set(key, catalog);
    seedLists(groupId, userId, catalog);
  }
  return catalog;
}

function seedLists(groupId: string | null, userId: string, catalog: ShoppingCatalogItem[]) {
  const make = (name: string, completed: boolean, picks: [string, number, boolean?][]) => {
    const list: ShoppingList = {
      id: newId(),
      groupId,
      ownerUserId: groupId ? null : userId,
      name,
      status: completed ? 'completed' : 'open',
      linkedTaskId: null,
      createdBy: userId,
      createdAt: daysAgo(completed ? 8 : 1),
      completedAt: completed ? daysAgo(7) : null,
      completedBy: completed ? userId : null,
    };
    lists.set(list.id, list);
    picks.forEach(([pick, quantity, checked], index) => {
      const source = catalog.find(({ name: catalogName }) => catalogName === pick);
      const id = newId();
      items.set(id, {
        id,
        listId: list.id,
        catalogItemId: source?.id ?? null,
        name: pick,
        category: source?.category ?? shoppingDefaults.customItem.category,
        quantity,
        unit: source?.defaultUnit ?? shoppingDefaults.customItem.unit,
        emoji: source?.emoji ?? null,
        note: null,
        addedBy: groupId && index === 0 ? formerMember : userId,
        addedAt: daysAgo(1),
        checkedAt: checked ? now() : null,
        checkedBy: checked ? userId : null,
      });
    });
  };
  make(groupId ? 'Mercado da casa' : 'Mercado', false, [
    ['Arroz', 2],
    ['Leite', 3],
    ['Banana', 1, true],
    ['Pilhas AA', 1],
  ]);
  make('Feira', true, [
    ['Tomate', 1, true],
    ['Alface', 2, true],
    ['Cebola', 1],
  ]);
}

function openList(listId: string) {
  const list = lists.get(listId);
  if (!list) throw new Error('forbidden');
  if (list.status === 'completed') throw new Error('list_completed');
  return list;
}

const itemsOf = (listId: string) => [...items.values()].filter((item) => item.listId === listId);

async function insertItem(input: ShoppingListItemInput) {
  openList(input.listId);
  if (itemsOf(input.listId).length >= shoppingRules.maxItemsPerList) throw new Error('list_full');
  const item: ShoppingListItem = {
    ...input,
    id: input.id ?? newId(),
    addedBy: await currentUserId(),
    addedAt: now(),
    checkedAt: null,
    checkedBy: null,
  };
  items.set(item.id, item);
  return item;
}

export const sampleShoppingRepository: ShoppingRepository = {
  async lists(groupId, status) {
    catalogOf(groupId, await currentUserId());
    const at = (list: ShoppingList) => (status === 'open' ? list.createdAt : list.completedAt);
    return [...lists.values()]
      .filter((list) => list.groupId === groupId && list.status === status)
      .sort((a, b) => (at(b) ?? '').localeCompare(at(a) ?? ''));
  },

  async list(id) {
    return lists.get(id) ?? null;
  },

  async items(listId) {
    return itemsOf(listId);
  },

  async catalog(groupId) {
    return catalogOf(groupId, await currentUserId());
  },

  async createList({ id, groupId, name, fromListId }) {
    const userId = await currentUserId();
    const list: ShoppingList = {
      id: id ?? newId(),
      groupId,
      ownerUserId: groupId ? null : userId,
      name,
      status: 'open',
      linkedTaskId: null,
      createdBy: userId,
      createdAt: now(),
      completedAt: null,
      completedBy: null,
    };
    lists.set(list.id, list);
    if (fromListId) {
      for (const source of itemsOf(fromListId)) {
        const copy = { ...source, id: newId(), listId: list.id, addedBy: userId, addedAt: now() };
        items.set(copy.id, { ...copy, checkedAt: null, checkedBy: null });
      }
    }
    return list.id;
  },

  async completeList({ listId }) {
    const list = openList(listId);
    lists.set(listId, {
      ...list,
      status: 'completed',
      completedAt: now(),
      completedBy: await currentUserId(),
    });
    notify(listId);
  },

  async adjustQuantity(input) {
    let item: ShoppingListItem | undefined;
    if ('itemId' in input) {
      item = items.get(input.itemId);
      if (!item) return null;
    } else {
      item = itemsOf(input.listId).find(
        ({ catalogItemId }) => catalogItemId === input.catalogItemId,
      );
      if (!item) {
        const source = [...catalogs.values()].flat().find(({ id }) => id === input.catalogItemId);
        if (!source || input.delta <= 0) return null;
        item = await insertItem({
          listId: input.listId,
          catalogItemId: source.id,
          name: source.name,
          category: source.category,
          quantity: input.delta,
          unit: source.defaultUnit,
          emoji: source.emoji,
          note: null,
        });
        notify(item.listId);
        return item;
      }
    }
    openList(item.listId);
    const quantity = round(item.quantity + input.delta);
    if (quantity <= 0) {
      items.delete(item.id);
      notify(item.listId);
      return null;
    }
    const next = { ...item, quantity };
    items.set(item.id, next);
    notify(item.listId);
    return next;
  },

  async addItem(input) {
    const item = await insertItem(input);
    notify(item.listId);
    return item;
  },

  async updateItem(id, input) {
    const item = items.get(id);
    if (!item) return;
    openList(item.listId);
    items.set(id, { ...item, ...input });
    notify(item.listId);
  },

  async setChecked({ itemId, checked }) {
    const item = items.get(itemId);
    if (!item) return;
    openList(item.listId);
    items.set(itemId, {
      ...item,
      checkedAt: checked ? now() : null,
      checkedBy: checked ? await currentUserId() : null,
    });
    notify(item.listId);
  },

  async addCatalogItem({ groupId, name, category, defaultUnit, emoji, sortOrder }) {
    const catalog = catalogOf(groupId, await currentUserId());
    const live = catalog.filter(({ archivedAt }) => archivedAt === null);
    if (live.some((row) => row.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')))
      throw new Error('catalog_item_exists');
    if (live.length >= shoppingRules.maxCatalogItemsPerScope) throw new Error('catalog_full');
    const row: ShoppingCatalogItem = {
      id: newId(),
      groupId,
      ownerUserId: groupId ? null : await currentUserId(),
      name,
      category,
      defaultUnit,
      emoji,
      sortOrder: sortOrder ?? Math.max(0, ...catalog.map((entry) => entry.sortOrder)) + 10,
      archivedAt: null,
    };
    catalog.push(row);
    return row;
  },

  watchList(listId, onChange) {
    const set = watchers.get(listId) ?? new Set();
    set.add(onChange);
    watchers.set(listId, set);
    return () => set.delete(onChange);
  },
};
