import {
  shoppingErrorCodeSchema,
  type ShoppingCatalogItem,
  type ShoppingCatalogItemInput,
  type ShoppingErrorCode,
  type ShoppingItemCheckInput,
  type ShoppingList,
  type ShoppingListCompleteInput,
  type ShoppingListCreateInput,
  type ShoppingListItem,
  type ShoppingListItemInput,
  type ShoppingListItemUpdateInput,
  type ShoppingListStatus,
  type ShoppingQuantityAdjust,
} from '@azkaban/contracts';
import { currentUserId, db } from '../client';
import type { Database } from '../database.types';

type Tables = Database['public']['Tables'];
type ListRow = Tables['shopping_lists']['Row'];
type ItemRow = Tables['shopping_list_items']['Row'];
type CatalogRow = Tables['shopping_catalog_items']['Row'];

/** A catalog row's editable part. `archivedAt` set archives it, null brings it back. */
export type ShoppingCatalogItemUpdate = Partial<
  Pick<ShoppingCatalogItem, 'name' | 'category' | 'defaultUnit' | 'emoji' | 'archivedAt'>
>;

/**
 * Realtime on one list: `deletedId` is the id of a deleted row, null for an insert or update.
 * A `DELETE` reaches every subscriber of the table with only the id (ADR-0008, SEG4-4): the
 * screen drops the ones it does not show.
 */
export type ShoppingChange = { deletedId: string | null };

/**
 * What the shopping screens need from the database (ADR-0011). Failures throw an `Error` whose
 * message is a `shoppingErrorCodeSchema` code when the database raised one, `shopping_error` else.
 */
export type ShoppingRepository = {
  /** `groupId` null: the caller's personal lists. Open ones newest first; completed by `completedAt`, newest first. */
  lists(groupId: string | null, status: ShoppingListStatus): Promise<ShoppingList[]>;
  list(id: string): Promise<ShoppingList | null>;
  items(listId: string): Promise<ShoppingListItem[]>;
  /** The catalog of the scope, archived rows included. */
  catalog(groupId: string | null): Promise<ShoppingCatalogItem[]>;
  /** `create_shopping_list`. Returns the new list's id. */
  createList(input: ShoppingListCreateInput): Promise<string>;
  /** `complete_shopping_list`. */
  completeList(input: ShoppingListCompleteInput): Promise<void>;
  /** The stepper. `null` when the item left the list (zero or below, or removed meanwhile). */
  adjustQuantity(input: ShoppingQuantityAdjust): Promise<ShoppingListItem | null>;
  addItem(input: ShoppingListItemInput): Promise<ShoppingListItem>;
  updateItem(id: string, input: ShoppingListItemUpdateInput): Promise<void>;
  /** `set_shopping_item_checked`. */
  setChecked(input: ShoppingItemCheckInput): Promise<void>;
  addCatalogItem(input: ShoppingCatalogItemInput): Promise<ShoppingCatalogItem>;
  updateCatalogItem(id: string, input: ShoppingCatalogItemUpdate): Promise<void>;
  /** Realtime on the list and its items, by anyone. Returns the unsubscribe. */
  watchList(listId: string, onChange: (change: ShoppingChange) => void): () => void;
};

/** The database raises its code as the message. Anything else is null: the UI says the generic text. */
export function shoppingErrorCode(error: unknown): ShoppingErrorCode | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : null;
  const parsed = shoppingErrorCodeSchema.safeParse(message);
  return parsed.success ? parsed.data : null;
}

const fail = (error: unknown, code = shoppingErrorCode(error)) =>
  new Error(code ?? 'shopping_error', { cause: error });

/** On a catalog write, the unique index answers a rare race with the plain Postgres text. */
const catalogFail = (error: { code?: string }) =>
  fail(error, error.code === '23505' ? 'catalog_item_exists' : undefined);

const listColumns =
  'id, group_id, owner_user_id, name, status, linked_task_id, created_by, created_at, completed_at, completed_by';
const itemColumns =
  'id, list_id, catalog_item_id, name, category, quantity, unit, emoji, note, added_by, added_at, checked_at, checked_by';
const catalogColumns =
  'id, group_id, owner_user_id, name, category, default_unit, emoji, sort_order, archived_at';

const toList = (row: ListRow): ShoppingList => ({
  id: row.id,
  groupId: row.group_id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  status: row.status,
  // May name a task the reader cannot see (ADR-0011, section 16, SEG7-1). A screen that offers the
  // task reads it first and, when RLS returns no row, acts as if there were no link: no "open the
  // task", no offer on completing, never a "not found".
  linkedTaskId: row.linked_task_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  completedBy: row.completed_by,
});

const toItem = (row: ItemRow): ShoppingListItem => ({
  id: row.id,
  listId: row.list_id,
  catalogItemId: row.catalog_item_id,
  name: row.name,
  category: row.category,
  quantity: Number(row.quantity),
  unit: row.unit,
  emoji: row.emoji,
  note: row.note,
  addedBy: row.added_by,
  addedAt: row.added_at,
  checkedAt: row.checked_at,
  checkedBy: row.checked_by,
});

/** A gone item comes back from the RPC as `null` or as a row of nulls, depending on PostgREST. */
export const toItemOrNull = (row: ItemRow | null): ShoppingListItem | null =>
  row?.id ? toItem(row) : null;

const toCatalog = (row: Omit<CatalogRow, 'created_at'>): ShoppingCatalogItem => ({
  id: row.id,
  groupId: row.group_id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  category: row.category,
  defaultUnit: row.default_unit,
  emoji: row.emoji,
  sortOrder: row.sort_order,
  archivedAt: row.archived_at,
});

// The generated types make the nullable RPC arguments `string`; SQL takes null (personal list, new id).
const sqlNull = (value: string | null | undefined) => (value ?? null) as string;

export const shoppingRepository: ShoppingRepository = {
  async lists(groupId, status) {
    const at = status === 'open' ? 'created_at' : 'completed_at';
    const query = db().from('shopping_lists').select(listColumns).eq('status', status);
    // RLS leaves only the caller's own personal lists among those without a group.
    const { data, error } = await (
      groupId ? query.eq('group_id', groupId) : query.is('group_id', null)
    ).order(at, { ascending: false });
    if (error) throw fail(error);
    return data.map(toList);
  },

  async list(id) {
    const { data, error } = await db()
      .from('shopping_lists')
      .select(listColumns)
      .eq('id', id)
      .maybeSingle();
    if (error) throw fail(error);
    return data ? toList(data) : null;
  },

  async items(listId) {
    const { data, error } = await db()
      .from('shopping_list_items')
      .select(itemColumns)
      .eq('list_id', listId)
      .order('added_at');
    if (error) throw fail(error);
    return data.map(toItem);
  },

  async catalog(groupId) {
    const query = db().from('shopping_catalog_items').select(catalogColumns);
    const { data, error } = await (
      groupId ? query.eq('group_id', groupId) : query.is('group_id', null)
    ).order('sort_order');
    if (error) throw fail(error);
    return data.map(toCatalog);
  },

  async createList({ id, groupId, name, fromListId }) {
    const { data, error } = await db().rpc('create_shopping_list', {
      p_id: sqlNull(id),
      p_group_id: sqlNull(groupId),
      p_name: name,
      ...(fromListId ? { p_from_list_id: fromListId } : {}),
    });
    if (error) throw fail(error);
    return data.id;
  },

  async completeList({ listId }) {
    const { error } = await db().rpc('complete_shopping_list', { p_list_id: listId });
    if (error) throw fail(error);
  },

  async adjustQuantity(input) {
    const { data, error } = await ('itemId' in input
      ? db().rpc('adjust_shopping_item_quantity', { p_item_id: input.itemId, p_delta: input.delta })
      : db().rpc('add_catalog_item_to_list', {
          p_list_id: input.listId,
          p_catalog_item_id: input.catalogItemId,
          p_delta: input.delta,
        }));
    if (error) throw fail(error);
    return toItemOrNull(data);
  },

  async addItem(input) {
    // `added_*` and `checked_*` are stamped by the database, which refuses them from the client.
    const { data, error } = await db()
      .from('shopping_list_items')
      .insert({
        ...(input.id ? { id: input.id } : {}),
        list_id: input.listId,
        catalog_item_id: input.catalogItemId,
        name: input.name,
        category: input.category,
        quantity: input.quantity,
        unit: input.unit,
        emoji: input.emoji,
        note: input.note,
      })
      .select(itemColumns)
      .single();
    if (error) throw fail(error);
    return toItem(data);
  },

  async updateItem(id, input) {
    const { error } = await db().from('shopping_list_items').update(input).eq('id', id);
    if (error) throw fail(error);
  },

  async setChecked({ itemId, checked }) {
    const { error } = await db().rpc('set_shopping_item_checked', {
      p_item_id: itemId,
      p_checked: checked,
    });
    if (error) throw fail(error);
  },

  async addCatalogItem({ groupId, name, category, defaultUnit, emoji, sortOrder }) {
    const { data, error } = await db()
      .from('shopping_catalog_items')
      .insert({
        group_id: groupId,
        // The database does not fill the personal owner by itself.
        owner_user_id: groupId ? null : await currentUserId(),
        name,
        category,
        default_unit: defaultUnit,
        emoji,
        ...(sortOrder === undefined ? {} : { sort_order: sortOrder }),
      })
      .select(catalogColumns)
      .single();
    if (error) throw catalogFail(error);
    return toCatalog(data);
  },

  async updateCatalogItem(id, { name, category, defaultUnit, emoji, archivedAt }) {
    const { error } = await db()
      .from('shopping_catalog_items')
      .update({
        name,
        category,
        default_unit: defaultUnit,
        emoji,
        archived_at: archivedAt,
      })
      .eq('id', id);
    if (error) throw catalogFail(error);
  },

  watchList(listId, onChange) {
    const forward = (payload: { eventType: string; old: { id?: string } }) =>
      onChange({ deletedId: payload.eventType === 'DELETE' ? (payload.old.id ?? null) : null });
    const channel = db()
      .channel(`shopping:${listId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `list_id=eq.${listId}`,
        },
        forward,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_lists', filter: `id=eq.${listId}` },
        forward,
      )
      .subscribe();
    return () => void db().removeChannel(channel);
  },
};
