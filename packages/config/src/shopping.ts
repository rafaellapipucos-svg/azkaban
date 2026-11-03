// Type-only imports: `pnpm db:check-permissions` loads this file directly in Node.
import type { ShoppingCategory, ShoppingUnit } from '@azkaban/contracts';

/**
 * Rules the database enforces (ADR-0011). Mirrored in public.app_settings under the key
 * `shopping_rules`, so changing a value here needs a migration too.
 */
export const shoppingRules = {
  /** Bounds the shared text, the Realtime traffic of one list and the copy of "new list from this". */
  maxItemsPerList: 200,
  /** Per group catalog and per personal catalog, counting rows not archived. */
  maxCatalogItemsPerScope: 500,
  /**
   * XP of a completed list (F7-5, after F6). The event goes to whoever completed it, once per list,
   * and only when at least `minCheckedItems` items were checked and the person has had fewer than
   * `maxRewardedPerDay` rewarded lists on that local day. Completing still works without XP.
   * Values to confirm with the human. The event type is reserved in ADR-0010.
   */
  xp: { amount: 10, minCheckedItems: 3, maxRewardedPerDay: 2 },
} as const;

/** Client defaults, with nothing for the database to mirror. */
export const shoppingDefaults = {
  /** What one tap of the stepper adds or removes, and the first tap on a catalog item. */
  unitStep: { unit: 1, kg: 0.5, g: 100, l: 1, pack: 1, box: 1, dozen: 1 },
  /** Of an item typed outside the catalog. */
  customItem: { category: 'other', unit: 'unit' },
} as const satisfies {
  unitStep: Record<ShoppingUnit, number>;
  customItem: { category: ShoppingCategory; unit: ShoppingUnit };
};
