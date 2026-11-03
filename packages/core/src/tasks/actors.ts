import type { OccurrenceActor, TaskVisibility } from '@azkaban/contracts';
import { can, type PermissionUser } from '../permissions/can';

export type ActorUser = PermissionUser & { id: string };

/**
 * What the database looks at to derive the actor (ADR-0005 section 4). There are two assignees
 * and they differ for an occurrence resolved before a reassignment: it keeps whoever resolved it,
 * while the task already points to the new one.
 */
export type ActorSubject = {
  /** Null for a task in a personal context. */
  groupId: string | null;
  createdBy: string | null;
  /** `task_occurrences.assignee_id`: decides `assignee`. */
  occurrenceAssigneeId: string;
  /** `tasks.assignee_id`: decides `própria` and the `task.edit_assigned` and `task.delete_assigned` cases. */
  taskAssigneeId: string;
  visibility: TaskVisibility;
  /** On while a manager's photo rule stands on someone's own task. ADR-0007 section 20. */
  proofFlagsLocked: boolean;
};

/**
 * ADR-0005 section 4, mirrored for the UI only: it hides buttons, and the database decides.
 * `system` is never derived here, because it is a job without a user.
 */
export function deriveActors(
  user: ActorUser,
  {
    groupId,
    createdBy,
    occurrenceAssigneeId,
    taskAssigneeId,
    visibility,
    proofFlagsLocked,
  }: ActorSubject,
): OccurrenceActor[] {
  const group = groupId === null ? null : { id: groupId };
  // Leaving a group costs the access to its tasks, including the ones the user created.
  if (group && !user.memberships.some((m) => m.groupId === group.id)) return [];

  const assignee = occurrenceAssigneeId === user.id;
  const taskAssignee = taskAssigneeId === user.id;
  const own = createdBy === user.id && taskAssignee;
  const manages = group !== null && visibility === 'group' && can(user, 'task.manage_group', group);
  const mayEditAssigned = taskAssignee && group !== null && can(user, 'task.edit_assigned', group);
  const mayDeleteAssigned =
    taskAssignee && group !== null && can(user, 'task.delete_assigned', group);

  const actors: OccurrenceActor[] = [];
  if (assignee) actors.push('assignee');
  if (own || manages || mayEditAssigned) actors.push('editor');
  if ((own && !proofFlagsLocked) || manages || mayDeleteAssigned) actors.push('deleter');
  return actors;
}

/**
 * `can_review_proof` in the database, for the UI only: `proof.review` in a task shared with the
 * group, and never the person who sent the photo. `authorId` is the occurrence's assignee, the only
 * one who sends a proof; the database compares with the proof's own author.
 */
export function canReviewProof(
  user: ActorUser,
  {
    groupId,
    visibility,
    authorId,
  }: { groupId: string | null; visibility: TaskVisibility; authorId: string },
): boolean {
  return (
    groupId !== null &&
    visibility === 'group' &&
    user.id !== authorId &&
    can(user, 'proof.review', { id: groupId })
  );
}

/**
 * `occurrence_forgives_overdue` in the database (ADR-0005 section 11): someone who manages the
 * group's tasks and is neither the old nor the new assignee gives an overdue occurrence a fresh
 * deadline by moving it. Everyone else keeps the delay. Decides the "continua atrasada" warning.
 */
export function forgivesOverdue(
  user: ActorUser,
  {
    groupId,
    visibility,
    occurrenceAssigneeId,
    newAssigneeId,
  }: {
    groupId: string | null;
    visibility: TaskVisibility;
    occurrenceAssigneeId: string;
    newAssigneeId: string;
  },
): boolean {
  return (
    groupId !== null &&
    visibility === 'group' &&
    user.id !== occurrenceAssigneeId &&
    user.id !== newAssigneeId &&
    can(user, 'task.manage_group', { id: groupId })
  );
}

/**
 * `proof_flags_locked` in `edit_task` (ADR-0007 section 8): the photo and the approval switches
 * are for who owns the task (creator and assignee) or has `task.manage_group` on a group task.
 * Someone with only `task.edit_assigned` sees them and cannot change them, and neither does the
 * owner while a manager's rule stands (ADR-0007 section 20).
 */
export function proofFlagsLocked(
  user: ActorUser,
  {
    groupId,
    createdBy,
    assigneeId,
    visibility,
    proofFlagsLocked: locked,
  }: {
    groupId: string | null;
    createdBy: string | null;
    assigneeId: string;
    visibility: TaskVisibility;
    proofFlagsLocked: boolean;
  },
): boolean {
  const own = createdBy === user.id && assigneeId === user.id;
  const manages =
    groupId !== null && visibility === 'group' && can(user, 'task.manage_group', { id: groupId });
  return !(manages || (own && !locked));
}

/** Whether the user skips the late window: `task.manage_group` in the task's group. */
export function canManageGroupTask(user: ActorUser, groupId: string | null): boolean {
  return groupId !== null && can(user, 'task.manage_group', { id: groupId });
}
