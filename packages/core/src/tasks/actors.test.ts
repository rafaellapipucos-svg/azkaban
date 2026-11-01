import type { GroupRole } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { canManageGroupTask, deriveActors, type ActorSubject } from './actors';

const me = 'me';
const other = 'other';
const G = 'g1';

const user = (role: GroupRole | null) => ({
  id: me,
  memberships: role ? [{ groupId: G, role }] : [],
});

const subject = (overrides: Partial<ActorSubject>): ActorSubject => ({
  groupId: G,
  createdBy: me,
  assigneeId: me,
  visibility: 'group',
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

describe('deriveActors in a personal context', () => {
  const personal = subject({ groupId: null, visibility: 'private' });

  it('gives the creator everything on their own task', () => {
    expect(deriveActors(user(null), personal)).toEqual(['assignee', 'editor', 'deleter']);
  });

  it('gives nothing to anyone else', () => {
    expect(deriveActors(user(null), { ...personal, createdBy: other, assigneeId: other })).toEqual(
      [],
    );
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
