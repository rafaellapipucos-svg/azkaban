import {
  rateLimitedErrorCode,
  shoppingErrorCodeSchema,
  shoppingItemCheckInputSchema,
  shoppingListItemInputSchema,
  shoppingQuantityAdjustSchema,
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
  type ShoppingListUpdateInput,
  type ShoppingQuantityAdjust,
} from '@azkaban/contracts';
import { currentUserId, db } from '../client';
import type { Database } from '../database.types';
import { defineOfflineAction } from '../offline';
import { subscribeCaughtUp } from '../realtime';

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

/** What a list shows of its task: the title and where to open it. */
export type LinkedTask = { title: string; occurrenceId: string };

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
  /** Rename or link, by whoever manages the list (ADR-0011, section 4). The database refuses a completed one. */
  updateList(id: string, input: ShoppingListUpdateInput): Promise<void>;
  /** A real `delete`, in any state, by whoever manages the list. The items go with it (section 6). */
  deleteList(id: string): Promise<void>;
  /** The stepper. `null` when the item left the list (zero or below, or removed meanwhile). */
  adjustQuantity(input: ShoppingQuantityAdjust): Promise<ShoppingListItem | null>;
  addItem(input: ShoppingListItemInput): Promise<ShoppingListItem>;
  updateItem(id: string, input: ShoppingListItemUpdateInput): Promise<void>;
  /** `set_shopping_item_checked`. */
  setChecked(input: ShoppingItemCheckInput): Promise<void>;
  addCatalogItem(input: ShoppingCatalogItemInput): Promise<ShoppingCatalogItem>;
  updateCatalogItem(id: string, input: ShoppingCatalogItemUpdate): Promise<void>;
  /** Lists linked to the task, open first, newest first. */
  listsForTask(taskId: string): Promise<ShoppingList[]>;
  /**
   * The linked task as far as the reader may see it: its title and the occurrence to open (the
   * oldest pending one, else the latest). `null` when RLS hides the task or it is gone, which the
   * screens treat as no link at all (ADR-0011, section 16, SEG7-1), never as "not found".
   */
  linkedTask(taskId: string): Promise<LinkedTask | null>;
  /** Realtime on the list and its items, by anyone. Returns the unsubscribe. */
  watchList(listId: string, onChange: (change: ShoppingChange) => void): () => void;
};

/**
 * A code the UI has a text for. `rate_limited` comes from `consume_rate_limit` (ADR-0012, section 4)
 * and stays out of the contract enum, as the ADR decided.
 */
export type ShoppingFailureCode = ShoppingErrorCode | typeof rateLimitedErrorCode;

/** The database raises its code as the message. Anything else is null: the UI says the generic text. */
export function shoppingErrorCode(error: unknown): ShoppingFailureCode | null {
  const field = (name: string) =>
    typeof error === 'object' && error !== null && name in error
      ? (error as Record<string, unknown>)[name]
      : null;
  const message = field('message');
  // PostgREST answers PT429 with HTTP 429 and the message `rate_limited`.
  if (field('code') === 'PT429' || message === rateLimitedErrorCode) return rateLimitedErrorCode;
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

  async updateList(id, { name, linkedTaskId }) {
    const { data, error } = await db()
      .from('shopping_lists')
      .update({ name, linked_task_id: linkedTaskId })
      .eq('id', id)
      .select('id');
    if (error) throw fail(error);
    // RLS answers someone who may not manage the list with no row, not an error.
    if (data.length === 0) throw new Error('forbidden');
  },

  async deleteList(id) {
    const { data, error } = await db().from('shopping_lists').delete().eq('id', id).select('id');
    if (error) throw fail(error);
    if (data.length === 0) throw new Error('forbidden');
  },

  async adjustQuantity(input) {
    // With a request id the database applies the delta once and answers a repeat with the row.
    const request = input.requestId ? { p_request_id: input.requestId } : {};
    const { data, error } = await ('itemId' in input
      ? db().rpc('adjust_shopping_item_quantity', {
          p_item_id: input.itemId,
          p_delta: input.delta,
          ...request,
        })
      : db().rpc('add_catalog_item_to_list', {
          p_list_id: input.listId,
          p_catalog_item_id: input.catalogItemId,
          p_delta: input.delta,
          ...request,
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

  async listsForTask(taskId) {
    const { data, error } = await db()
      .from('shopping_lists')
      .select(listColumns)
      .eq('linked_task_id', taskId)
      .order('status') // the enum's order: open, then completed
      .order('created_at', { ascending: false });
    if (error) throw fail(error);
    return data.map(toList);
  },

  async linkedTask(taskId) {
    // `!inner`: an occurrence whose task RLS hides comes without a row, like the task itself.
    const read = (pending: boolean) => {
      const query = db()
        .from('task_occurrences')
        .select('id, tasks!inner(title)')
        .eq('task_id', taskId);
      return (pending ? query.eq('status', 'pending') : query)
        .order('scheduled_start', { ascending: pending })
        .limit(1)
        .maybeSingle();
    };
    const pending = await read(true);
    if (pending.error) throw fail(pending.error);
    const found = pending.data ?? (await read(false)).data;
    return found ? { title: found.tasks.title, occurrenceId: found.id } : null;
  },

  watchList(listId, onChange) {
    const toItem = (payload: { eventType: string; old: { id?: string } }): ShoppingChange => ({
      deletedId: payload.eventType === 'DELETE' ? (payload.old.id ?? null) : null,
    });
    return subscribeCaughtUp(
      {
        name: `shopping:${listId}`,
        changes: [
          {
            filter: {
              event: '*',
              schema: 'public',
              table: 'shopping_list_items',
              filter: `list_id=eq.${listId}`,
            },
            toItem,
          },
          {
            filter: {
              event: '*',
              schema: 'public',
              table: 'shopping_lists',
              filter: `id=eq.${listId}`,
            },
            toItem,
          },
        ],
        // Whatever changed before the server heard the tables: one reload takes it in.
        catchUp: () => Promise.resolve([{ deletedId: null }]),
      },
      onChange,
    );
  },
};

// The offline queue (ADR-0012, section 5): the three item actions that may wait for the connection.
// Completing a list stays out (it gives XP and has no undo), and so does everything else.

const reasonOf = (error: unknown) => shoppingErrorCode(error) ?? 'generic';
// The screens' cache keys (`shoppingKeys` in the feature). Every list's items: the stepper by item
// does not carry the list, and only the screens on display refetch.
const itemsKey = ['shopping', 'items'];

/** The stepper, both targets. The screen puts a fresh `requestId` in every send. */
export const shoppingAdjustAction = defineOfflineAction({
  key: 'shopping-adjust',
  schema: shoppingQuantityAdjustSchema,
  run: (input: ShoppingQuantityAdjust) => shoppingRepository.adjustQuantity(input),
  reasonOf,
  invalidates: () => [itemsKey],
});

/**
 * An item typed outside the catalog, with an `id` made on the device. A replay whose first try got
 * through hits the primary key (`23505`): when the row with that id is there, it was done.
 */
export const shoppingAddItemAction = defineOfflineAction({
  key: 'shopping-add-item',
  schema: shoppingListItemInputSchema,
  run: async (input: ShoppingListItemInput) => {
    try {
      return await shoppingRepository.addItem(input);
    } catch (error) {
      const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : null;
      if (!input.id || cause?.code !== '23505') throw error;
      const { data, error: readError } = await db()
        .from('shopping_list_items')
        .select(itemColumns)
        .eq('id', input.id)
        .maybeSingle();
      if (readError || !data) throw error;
      return toItem(data);
    }
  },
  reasonOf,
  invalidates: ({ listId }) => [[...itemsKey, listId]],
});

/** Checking an item: a value, so a replay is harmless. */
export const shoppingCheckAction = defineOfflineAction({
  key: 'shopping-check',
  schema: shoppingItemCheckInputSchema,
  run: (input: ShoppingItemCheckInput) => shoppingRepository.setChecked(input),
  reasonOf,
  invalidates: () => [itemsKey],
});
