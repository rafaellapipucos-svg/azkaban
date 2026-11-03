import { z } from 'zod';
import { idSchema, instantSchema, nameSchema } from './common';
import { shoppingCategories, shoppingUnits } from './shopping-vocabulary';

// Shopping lists (ADR-0011). A list belongs to a group or, with no group, to one person. The catalog
// has the same two scopes. Rows are camelCase here; `packages/data` maps the snake_case columns.

export { shoppingCategories, shoppingUnits };

export const shoppingCategorySchema = z.enum(shoppingCategories);
export type ShoppingCategory = z.infer<typeof shoppingCategorySchema>;

export const shoppingUnitSchema = z.enum(shoppingUnits);
export type ShoppingUnit = z.infer<typeof shoppingUnitSchema>;

/** `open` takes edits. `completed` is history: read-only, and the source of "new list from this". */
export const shoppingListStatusSchema = z.enum(['open', 'completed']);
export type ShoppingListStatus = z.infer<typeof shoppingListStatusSchema>;

/** Also a check constraint on `shopping_list_items.quantity`, which is `numeric(10,3)`. */
export const shoppingQuantityMax = 9999;

/** Postgres rounds to 3 decimals, so 0.0001 would become 0: the floor is the smallest step it keeps. */
export const shoppingQuantitySchema = z.number().min(0.001).max(shoppingQuantityMax);

/**
 * `\p{Cc}` (line breaks, tab and every other control character), U+2028 and U+2029, and the
 * bidirectional controls (U+202A to U+202E, U+2066 to U+2069). Names, notes and emojis go into the
 * shared text another member sends outside the app, so they refuse these: no injected lines, no
 * reversed text (ADR-0011, section 16, SEG7-3). Same set as `whatsappTextParamSchema`. The database
 * mirrors it with a `check` on every shopping text column. U+200D (ZWJ) and U+FE0F stay, for emojis.
 */
export const shoppingControlCharacterPattern = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const isPlainText = (value: string) => !shoppingControlCharacterPattern.test(value);

/** `nameSchema` without control characters. Other names in the app keep `nameSchema` (section 16). */
export const shoppingNameSchema = nameSchema.refine(isPlainText);

/** One emoji may be several code points (skin tone, ZWJ, flags), so the cap is generous. */
export const shoppingEmojiSchema = z.string().trim().min(1).max(16).refine(isPlainText).nullable();

export const shoppingNoteSchema = z.string().trim().min(1).max(200).refine(isPlainText).nullable();

// Catalog

/** Group scope: `groupId` set, `ownerUserId` null. Personal scope: the other way round. */
export const shoppingCatalogItemSchema = z.object({
  id: idSchema,
  groupId: idSchema.nullable(),
  ownerUserId: idSchema.nullable(),
  name: shoppingNameSchema,
  category: shoppingCategorySchema,
  defaultUnit: shoppingUnitSchema,
  emoji: shoppingEmojiSchema,
  /** Inside the category. Ties break by name. */
  sortOrder: z.int(),
  archivedAt: instantSchema.nullable(),
});
export type ShoppingCatalogItem = z.infer<typeof shoppingCatalogItemSchema>;

/** Insert or update of a catalog row. `groupId` null means the personal catalog. */
export const shoppingCatalogItemInputSchema = z.object({
  groupId: idSchema.nullable(),
  name: shoppingNameSchema,
  category: shoppingCategorySchema,
  defaultUnit: shoppingUnitSchema,
  emoji: shoppingEmojiSchema,
  sortOrder: z.int().optional(),
});
export type ShoppingCatalogItemInput = z.infer<typeof shoppingCatalogItemInputSchema>;

/** One entry of the starter catalog in `packages/config`, copied into every new catalog. */
export type ShoppingCatalogSeedItem = {
  name: string;
  category: ShoppingCategory;
  unit: ShoppingUnit;
  emoji: string;
};

// Lists

export const shoppingListSchema = z.object({
  id: idSchema,
  groupId: idSchema.nullable(),
  /** Set only on a personal list. */
  ownerUserId: idSchema.nullable(),
  name: shoppingNameSchema,
  status: shoppingListStatusSchema,
  /** Navigation only: completing the list never changes the task (ADR-0011, section 8). */
  linkedTaskId: idSchema.nullable(),
  /** Null when the account is gone. */
  createdBy: idSchema.nullable(),
  createdAt: instantSchema,
  completedAt: instantSchema.nullable(),
  completedBy: idSchema.nullable(),
});
export type ShoppingList = z.infer<typeof shoppingListSchema>;

/**
 * Body of `create_shopping_list`. `id` may come from the client, so an offline queue can replay the
 * call (F8-5). With `fromListId`, every item of that list is copied unchecked, and `groupId` must be
 * the source's: a copy never changes scope.
 */
export const shoppingListCreateInputSchema = z.object({
  id: idSchema.optional(),
  groupId: idSchema.nullable(),
  name: shoppingNameSchema,
  fromListId: idSchema.optional(),
});
export type ShoppingListCreateInput = z.infer<typeof shoppingListCreateInputSchema>;

/** Plain `update` under RLS: by the creator, the owner of a personal list, or `shopping.manage_lists`. */
export const shoppingListUpdateInputSchema = z
  .object({ name: shoppingNameSchema, linkedTaskId: idSchema.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export type ShoppingListUpdateInput = z.infer<typeof shoppingListUpdateInputSchema>;

// Items

/**
 * Name, category, unit and emoji are a snapshot taken when the item is added, so history and the
 * shared text survive a catalog rename. `catalogItemId` is only the link, unique per list.
 */
export const shoppingListItemSchema = z.object({
  id: idSchema,
  listId: idSchema,
  catalogItemId: idSchema.nullable(),
  name: shoppingNameSchema,
  category: shoppingCategorySchema,
  quantity: shoppingQuantitySchema,
  unit: shoppingUnitSchema,
  emoji: shoppingEmojiSchema,
  note: shoppingNoteSchema,
  /** "Who added", shown on the item. Null when the account is gone. */
  addedBy: idSchema.nullable(),
  addedAt: instantSchema,
  checkedAt: instantSchema.nullable(),
  checkedBy: idSchema.nullable(),
});
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;

/**
 * Plain `insert` under RLS, for an item outside the catalog (or a catalog item added with a typed
 * quantity). `addedBy` and `addedAt` are stamped by the database. `id` may come from the client.
 */
export const shoppingListItemInputSchema = z.object({
  id: idSchema.optional(),
  listId: idSchema,
  catalogItemId: idSchema.nullable(),
  name: shoppingNameSchema,
  category: shoppingCategorySchema,
  quantity: shoppingQuantitySchema,
  unit: shoppingUnitSchema,
  emoji: shoppingEmojiSchema,
  note: shoppingNoteSchema,
});
export type ShoppingListItemInput = z.infer<typeof shoppingListItemInputSchema>;

/** Plain `update` under RLS. Setting `quantity` is last write wins; the stepper uses a delta. */
export const shoppingListItemUpdateInputSchema = shoppingListItemInputSchema
  .pick({ name: true, category: true, quantity: true, unit: true, emoji: true, note: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export type ShoppingListItemUpdateInput = z.infer<typeof shoppingListItemUpdateInputSchema>;

const deltaSchema = z
  .number()
  .min(-shoppingQuantityMax)
  .max(shoppingQuantityMax)
  .refine((delta) => delta !== 0);

/**
 * Stepper. Two people tapping at once both count, because the database adds the delta in one
 * statement. A result at or below zero deletes the item. Exactly one of the two targets:
 * `itemId` for an item already on the list (`adjust_shopping_item_quantity`), or `listId` and
 * `catalogItemId` for the catalog in "build" mode (`add_catalog_item_to_list`, which inserts the
 * item with the catalog snapshot when it is not on the list yet). Not idempotent on replay: an
 * offline queue needs a request id here first (F8-5).
 */
export const shoppingQuantityAdjustSchema = z.union([
  z.strictObject({ itemId: idSchema, delta: deltaSchema }),
  z.strictObject({ listId: idSchema, catalogItemId: idSchema, delta: deltaSchema }),
]);
export type ShoppingQuantityAdjust = z.infer<typeof shoppingQuantityAdjustSchema>;

/** `set_shopping_item_checked`. A value, not a toggle, so a repeat or a replay is harmless. */
export const shoppingItemCheckInputSchema = z.object({ itemId: idSchema, checked: z.boolean() });
export type ShoppingItemCheckInput = z.infer<typeof shoppingItemCheckInputSchema>;

/** `complete_shopping_list`. Completes once; there is no reopen (ADR-0011, section 6). */
export const shoppingListCompleteInputSchema = z.object({ listId: idSchema });
export type ShoppingListCompleteInput = z.infer<typeof shoppingListCompleteInputSchema>;

/**
 * Messages raised by the shopping RPCs and triggers, which the UI maps to i18n keys. Only what the
 * correct app can reach and the user can act on, as in `taskErrorCodeSchema`.
 */
export const shoppingErrorCodeSchema = z.enum([
  'forbidden',
  /** A write to an item, or to the list, after it was completed. Another member may have done it. */
  'list_completed',
  /** `shoppingRules.maxItemsPerList`. */
  'list_full',
  /** `shoppingRules.maxOpenListsPerScope`: open lists of the group, or personal lists of the person. */
  'lists_full',
  /** `shoppingRules.maxCatalogItemsPerScope`, counting rows not archived. */
  'catalog_full',
  /** Same name, ignoring case, in the same catalog and not archived. */
  'catalog_item_exists',
  /** The task is not visible to the caller, or is out of the list's scope (ADR-0011, section 8). */
  'task_link_invalid',
]);
export type ShoppingErrorCode = z.infer<typeof shoppingErrorCodeSchema>;
