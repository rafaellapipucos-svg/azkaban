import { shoppingRules } from '@azkaban/config';
import {
  rateLimitedErrorCode,
  shoppingErrorCodeSchema,
  shoppingNameSchema,
  shoppingNoteSchema,
  type ShoppingList,
  type Task,
} from '@azkaban/contracts';
import { can, type Permission, type PermissionUser } from '@azkaban/core';

/** Where the screens live. The routes in `apps/app` mount them on these paths. */
export const shoppingPaths = {
  lists: '/shopping',
  history: (groupId: string | null) =>
    groupId ? `/shopping/history?group=${groupId}` : '/shopping/history',
  catalog: (groupId: string | null) =>
    groupId ? `/shopping/catalog?group=${groupId}` : '/shopping/catalog',
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

type ShoppingPermission = Extract<Permission, `shopping.${string}`>;

/**
 * A personal list and catalog are only ever seen by their owner, who may do everything there. In
 * a group, the matrix decides. Only hides controls: the database checks again.
 */
export function canShop(
  user: PermissionUser,
  permission: ShoppingPermission,
  groupId: string | null,
) {
  return groupId === null || can(user, permission, { id: groupId });
}

/**
 * Rename and delete a list (ADR-0011, section 3): its creator while a member, or
 * `shopping.manage_lists`; a personal list is its owner's, the only one who sees it. Mirrors
 * `can_manage_shopping_list`, which checks again.
 */
export function canManageList(
  user: PermissionUser & { id: string },
  list: Pick<ShoppingList, 'groupId' | 'createdBy'>,
) {
  if (list.groupId === null) return true;
  const member = user.memberships.some(({ groupId }) => groupId === list.groupId);
  return (
    (member && list.createdBy === user.id) ||
    can(user, 'shopping.manage_lists', { id: list.groupId })
  );
}

/** A typed note: blank clears it (null), anything else must pass the contract. */
export const parseNote = (text: string) =>
  shoppingNoteSchema.safeParse(text.trim() === '' ? null : text);

/**
 * Codes with a text besides the contract's: the rate limit, no connection for something that cannot
 * wait in the queue, and the queue's own reasons for dropping an action.
 */
const extraCodes: readonly unknown[] = [rateLimitedErrorCode, 'offline', 'expired', 'invalid'];

/** i18n key for a failure: the database's code when it raised one we know, else the generic text. */
export function shoppingErrorKey(failure: unknown): string {
  const raw =
    typeof failure === 'string'
      ? failure
      : typeof failure === 'object' && failure !== null && 'message' in failure
        ? failure.message
        : null;
  if (extraCodes.includes(raw)) return `errors.${String(raw)}`;
  const code = shoppingErrorCodeSchema.safeParse(raw);
  return `errors.${code.success ? code.data : 'generic'}`;
}

/**
 * What completing says about XP (ADR-0011, section 9), from the checked items alone: enough of them
 * may earn `amount`, still subject to the daily cap the client cannot see; fewer never do.
 */
export function completionXp(checkedCount: number) {
  const { amount, minCheckedItems, maxRewardedPerDay } = shoppingRules.xp;
  return checkedCount >= minCheckedItems
    ? ({ key: 'list.xp', amount, max: maxRewardedPerDay } as const)
    : ({ key: 'list.xpNeedsItems', min: minCheckedItems } as const);
}

/**
 * A list made from a task (ADR-0011, section 8): in the task's group when the whole group may see it,
 * the only scope the database links there; else personal, which links any task its owner sees. Named
 * after the task when the title fits a list name, else `fallback`.
 */
export function listForTask(
  task: Pick<Task, 'groupId' | 'visibility' | 'title'>,
  fallback: string,
) {
  const name = shoppingNameSchema.safeParse(task.title);
  return {
    groupId: task.groupId !== null && task.visibility === 'group' ? task.groupId : null,
    name: name.success ? name.data : fallback,
  };
}

/**
 * i18n key when shopping text was refused for a line break or control character (ADR-0011, section
 * 16, SEG7-3): the contract's refine is the only `custom` issue. Empty or too long has no message,
 * the button is just off. The app never reaches the database's `check` with such text.
 */
export const shoppingTextErrorKey = (parsed: { error?: { issues: { code: string }[] } }) =>
  parsed.error?.issues.some(({ code }) => code === 'custom') ? 'form.invalidText' : null;
