import type {
  ShoppingCatalogItem,
  ShoppingCatalogItemInput,
  ShoppingItemCheckInput,
  ShoppingList,
  ShoppingListCompleteInput,
  ShoppingListCreateInput,
  ShoppingListItem,
  ShoppingListItemInput,
  ShoppingListItemUpdateInput,
  ShoppingListStatus,
  ShoppingQuantityAdjust,
} from '@azkaban/contracts';
import { sampleShoppingRepository } from './sample';

/**
 * What the shopping screens need from the database (ADR-0011). Failures throw an `Error` whose
 * message is a `shoppingErrorCodeSchema` code when the database raised one.
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
  /** Realtime on the list and its items: `onChange` after any change, by anyone. Returns the unsubscribe. */
  watchList(listId: string, onChange: () => void): () => void;
};

// ponytail: in-memory sample until the migrations land; the Supabase version replaces this line.
export const shoppingRepository: ShoppingRepository = sampleShoppingRepository;
