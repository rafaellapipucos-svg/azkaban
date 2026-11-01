import type { OccurrenceActor, TaskVisibility } from '@azkaban/contracts';
import { can, type PermissionUser } from '../permissions/can';

export type ActorUser = PermissionUser & { id: string };

/**
 * What the database looks at to derive the actor. `assigneeId` is the occurrence's: it is also the
 * task's, because editing the schedule hands pending occurrences to the new assignee (ADR-0005).
 */
export type ActorSubject = {
  /** Null for a task in a personal context. */
  groupId: string | null;
  createdBy: string | null;
  assigneeId: string;
  visibility: TaskVisibility;
};

/**
 * ADR-0005 section 4, mirrored for the UI only: it hides buttons, and the database decides.
 * `system` is never derived here, because it is a job without a user.
 */
export function deriveActors(
  user: ActorUser,
  { groupId, createdBy, assigneeId, visibility }: ActorSubject,
): OccurrenceActor[] {
  const group = groupId === null ? null : { id: groupId };
  // Leaving a group costs the access to its tasks, including the ones the user created.
  if (group && !user.memberships.some((m) => m.groupId === group.id)) return [];

  const assignee = assigneeId === user.id;
  const own = createdBy === user.id && assignee;
  const manages = group !== null && visibility === 'group' && can(user, 'task.manage_group', group);
  const mayEditAssigned = assignee && group !== null && can(user, 'task.edit_assigned', group);
  const mayDeleteAssigned = assignee && group !== null && can(user, 'task.delete_assigned', group);

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
