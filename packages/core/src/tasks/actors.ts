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
};

/**
 * ADR-0005 section 4, mirrored for the UI only: it hides buttons, and the database decides.
 * `system` is never derived here, because it is a job without a user.
 */
export function deriveActors(
  user: ActorUser,
  { groupId, createdBy, occurrenceAssigneeId, taskAssigneeId, visibility }: ActorSubject,
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
  if (own || manages || mayDeleteAssigned) actors.push('deleter');
  return actors;
}

/** Whether the user skips the late window: `task.manage_group` in the task's group. */
export function canManageGroupTask(user: ActorUser, groupId: string | null): boolean {
  return groupId !== null && can(user, 'task.manage_group', { id: groupId });
}
