import { shoppingErrorCodeSchema } from '@azkaban/contracts';
import { can, type Permission, type PermissionUser } from '@azkaban/core';

/** Where the screens live. The routes in `apps/app` mount them on these paths. */
export const shoppingPaths = {
  lists: '/shopping',
  history: (groupId: string | null) =>
    groupId ? `/shopping/history?group=${groupId}` : '/shopping/history',
  list: (id: string, mode?: ShoppingMode) =>
    mode ? `/shopping/${id}?mode=${mode}` : `/shopping/${id}`,
} as const;

/** Of the person and the device, not of the list: it lives in the address (ADR-0011, section 10). */
export type ShoppingMode = 'build' | 'market';
export const readMode = (value: string | undefined): ShoppingMode =>
  value === 'market' ? 'market' : 'build';

/** Tunables of this module (PROMPT_MESTRE 5.1). */
export const shoppingConfig = {
  /** Fast taps on the stepper go out as one delta after this pause, in ms (ADR-0011, section 5). */
  stepperBatchMs: 300,
} as const;

type ShoppingPermission =
  | 'shopping.create_list'
  | 'shopping.complete_list'
  | 'shopping.manage_catalog'
  | 'shopping.manage_lists';

/**
 * A personal list and catalog are only ever seen by their owner, who may do everything there. In
 * a group, the matrix decides. Only hides controls: the database checks again.
 */
export function canShop(
  user: PermissionUser,
  permission: ShoppingPermission,
  groupId: string | null,
) {
  if (groupId === null) return true;
  // ponytail: cast until auth-grupos adds the four keys to matrix.ts (ADR-0011, section 3); until
  // then a group answers false. Drop the cast with them.
  return can(user, permission as string as Permission, { id: groupId });
}

/** i18n key for a failure: the database's code when it raised one we know, else the generic text. */
export function shoppingErrorKey(failure: unknown): string {
  const raw =
    typeof failure === 'string'
      ? failure
      : typeof failure === 'object' && failure !== null && 'message' in failure
        ? failure.message
        : null;
  const code = shoppingErrorCodeSchema.safeParse(raw);
  return `errors.${code.success ? code.data : 'generic'}`;
}
