import type { GroupRole } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import {
  canManageGroupTask,
  canReviewProof,
  deriveActors,
  forgivesOverdue,
  proofFlagsLocked,
  type ActorSubject,
} from './actors';

const me = 'me';
const other = 'other';
const G = 'g1';

const user = (role: GroupRole | null) => ({
  id: me,
  memberships: role ? [{ groupId: G, role }] : [],
});

// `assigneeId` sets both assignees, the usual case; the two fields set them apart.
const subject = ({
  assigneeId = me,
  ...overrides
}: Partial<ActorSubject> & { assigneeId?: string }): ActorSubject => ({
  groupId: G,
  createdBy: me,
  occurrenceAssigneeId: assigneeId,
  taskAssigneeId: assigneeId,
  visibility: 'group',
  proofFlagsLocked: false,
  ...overrides,
});

// ADR-0005 section 4. Columns: role, createdBy, assigneeId, visibility -> actors.
const cases = [
  // Own task: creator and assignee. A plain member edits and deletes it.
  ['member', me, me, 'group', ['assignee', 'editor', 'deleter']],
  ['member', me, me, 'private', ['assignee', 'editor', 'deleter']],
  ['admin', me, me, 'group', ['assignee', 'editor', 'deleter']],
  // Assigned to me by someone else: assignee only, until the permissions say more.
  ['member', other, me, 'group', ['assignee']],
  ['admin', other, me, 'group', ['assignee', 'editor', 'deleter']],
  ['owner', other, me, 'group', ['assignee', 'editor', 'deleter']],
  // I created it for someone else: no relationship to the occurrence, as a plain member.
  ['member', me, other, 'group', []],
  // Someone else's group task: only task.manage_group reaches it.
  ['member', other, other, 'group', []],
  ['admin', other, other, 'group', ['editor', 'deleter']],
  ['owner', other, other, 'group', ['editor', 'deleter']],
  // manage_group does not reach a private task of another person.
  ['admin', other, other, 'private', []],
  // The job that deleted the creator's account leaves created_by null.
  ['member', null, me, 'group', ['assignee']],
  ['member', null, other, 'group', []],
] as const;

describe('deriveActors in a group context', () => {
  it.each(cases)(
    '%s, createdBy=%s assignee=%s %s -> %j',
    (role, createdBy, assigneeId, v, want) => {
      const actors = deriveActors(user(role), subject({ createdBy, assigneeId, visibility: v }));
      expect(actors).toEqual(want);
    },
  );

  it('never derives the system actor', () => {
    for (const [role, createdBy, assigneeId, v] of cases) {
      expect(
        deriveActors(user(role), subject({ createdBy, assigneeId, visibility: v })),
      ).not.toContain('system');
    }
  });

  it('gives nothing to someone who left the group, even on a task they created for themselves', () => {
    expect(deriveActors(user(null), subject({}))).toEqual([]);
    expect(deriveActors(user(null), subject({ assigneeId: me, createdBy: other }))).toEqual([]);
  });

  it('looks at the membership of that group only', () => {
    const elsewhere = { id: me, memberships: [{ groupId: 'other-group', role: 'owner' as const }] };
    expect(deriveActors(elsewhere, subject({ createdBy: other, assigneeId: other }))).toEqual([]);
  });
});

// An occurrence resolved before a reassignment keeps whoever resolved it, while the task already
// points to the new assignee (ADR-0005 section 4).
describe('deriveActors when the occurrence and the task have different assignees', () => {
  const old = { occurrenceAssigneeId: me, taskAssigneeId: other };
  const reassignedToMe = { occurrenceAssigneeId: other, taskAssigneeId: me };

  it.each([
    // I resolved it, then it was reassigned to someone else. I stay `assignee` of that
    // occurrence, and I lose editor and deleter because the task is no longer mine.
    ['member', { ...old, createdBy: other }, ['assignee']],
    // Even when I created the task, it is no longer "own" once it is assigned to someone else.
    ['member', { ...old, createdBy: me }, ['assignee']],
    // An admin keeps editor and deleter through task.manage_group, whoever the assignees are.
    ['admin', { ...old, createdBy: other }, ['assignee', 'editor', 'deleter']],
    // The mirror case: the task is mine now, the old occurrence is someone else's.
    ['member', { ...reassignedToMe, createdBy: me }, ['editor', 'deleter']],
    ['member', { ...reassignedToMe, createdBy: other }, []],
    ['admin', { ...reassignedToMe, createdBy: other }, ['editor', 'deleter']],
    // A private task is out of reach of task.manage_group: only the assignment rules are left.
    ['admin', { ...old, createdBy: other, visibility: 'private' }, ['assignee']],
    [
      'admin',
      { ...reassignedToMe, createdBy: other, visibility: 'private' },
      ['editor', 'deleter'],
    ],
  ] as const)('%s %j -> %j', (role, overrides, want) => {
    expect(deriveActors(user(role), subject({ ...overrides }))).toEqual(want);
  });
});

// ADR-0007 section 20: a manager's rule on someone's own task. The owner still edits the title and
// the time, and only the way out of the rule closes.
describe('deriveActors on a task a manager locked', () => {
  const locked = { proofFlagsLocked: true };

  it('takes deleter from the owner and leaves editor', () => {
    expect(deriveActors(user('member'), subject(locked))).toEqual(['assignee', 'editor']);
  });

  it('leaves whoever manages the group as they were, the owner included', () => {
    const someoneElses = subject({ ...locked, createdBy: other, assigneeId: other });
    expect(deriveActors(user('admin'), someoneElses)).toEqual(['editor', 'deleter']);
    expect(deriveActors(user('admin'), subject(locked))).toEqual(['assignee', 'editor', 'deleter']);
  });
});

describe('deriveActors in a personal context', () => {
  const personal = subject({ groupId: null, visibility: 'private' });

  it('gives the creator everything on their own task', () => {
    expect(deriveActors(user(null), personal)).toEqual(['assignee', 'editor', 'deleter']);
  });

  it('gives nothing to anyone else', () => {
    expect(
      deriveActors(user(null), {
        ...personal,
        createdBy: other,
        occurrenceAssigneeId: other,
        taskAssigneeId: other,
      }),
    ).toEqual([]);
  });
});

// ADR-0007 section 10: `can_review_proof`, as far as the UI can tell. Never the person who sent it.
describe('canReviewProof', () => {
  const task = { groupId: G, visibility: 'group' as const, authorId: other };

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    [null, false],
  ] as const)('%s reviewing someone else -> %s', (role, want) => {
    expect(canReviewProof(user(role), task)).toBe(want);
  });

  it('is never for the author, whatever the role', () => {
    expect(canReviewProof(user('owner'), { ...task, authorId: me })).toBe(false);
  });

  it('is not for a private task, nor outside a group', () => {
    expect(canReviewProof(user('owner'), { ...task, visibility: 'private' })).toBe(false);
    expect(canReviewProof(user('owner'), { ...task, groupId: null })).toBe(false);
  });
});

// ADR-0005 section 11: who gets a new deadline by moving an overdue occurrence.
describe('forgivesOverdue', () => {
  const moved = {
    groupId: G,
    visibility: 'group' as const,
    occurrenceAssigneeId: other,
    newAssigneeId: other,
  };

  it('is for who manages the group and answers for neither assignee', () => {
    expect(forgivesOverdue(user('admin'), moved)).toBe(true);
    expect(forgivesOverdue(user('owner'), moved)).toBe(true);
    expect(forgivesOverdue(user('member'), moved)).toBe(false);
  });

  it('is not for the old or the new assignee, even an admin', () => {
    expect(forgivesOverdue(user('admin'), { ...moved, occurrenceAssigneeId: me })).toBe(false);
    expect(forgivesOverdue(user('admin'), { ...moved, newAssigneeId: me })).toBe(false);
  });

  it('is not for a private task, nor outside a group', () => {
    expect(forgivesOverdue(user('admin'), { ...moved, visibility: 'private' })).toBe(false);
    expect(forgivesOverdue(user('admin'), { ...moved, groupId: null })).toBe(false);
  });
});

// ADR-0007 section 8: `proof_flags_locked`. Who owns the task, or manages a group task, moves them.
describe('proofFlagsLocked', () => {
  const task = {
    groupId: G,
    createdBy: other,
    assigneeId: me,
    visibility: 'group' as const,
    proofFlagsLocked: false,
  };
  const ownLocked = { ...task, createdBy: me, proofFlagsLocked: true };

  it.each([
    // Assigned to me by someone else: only task.edit_assigned reaches it.
    ['member', task, true],
    ['admin', task, false],
    ['owner', task, false],
    // My own task, in a group or alone.
    ['member', { ...task, createdBy: me }, false],
    [null, { ...task, groupId: null, createdBy: me, visibility: 'private' as const }, false],
    // I created it for someone else: not mine to switch.
    ['member', { ...task, createdBy: me, assigneeId: other }, true],
    // manage_group does not reach a private task of another person.
    ['admin', { ...task, assigneeId: other, visibility: 'private' as const }, true],
    // A manager's rule on my own task: it stops being mine to switch, and stays theirs.
    ['member', ownLocked, true],
    ['admin', ownLocked, false],
    ['admin', { ...ownLocked, createdBy: other, assigneeId: other }, false],
  ] as const)('%s on %j -> locked=%s', (role, subjectOfTask, want) => {
    expect(proofFlagsLocked(user(role), subjectOfTask)).toBe(want);
  });
});

describe('canManageGroupTask', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    [null, false],
  ] as const)('%s -> %s', (role, want) => {
    expect(canManageGroupTask(user(role), G)).toBe(want);
  });

  it('is false without a group', () => {
    expect(canManageGroupTask(user('owner'), null)).toBe(false);
  });
});
