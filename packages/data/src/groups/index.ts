import type {
  Group,
  GroupInput,
  GroupInvite,
  GroupMember,
  GroupRole,
  InvitePreview,
} from '@azkaban/contracts';
import { rateLimitedErrorCode } from '@azkaban/contracts';
import { currentUserId, db } from '../client';

const inviteColumns = 'id, code, role, expires_at, max_uses, use_count';

type InviteRow = {
  id: string;
  code: string;
  role: GroupRole;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
};

const toInvite = (row: InviteRow): GroupInvite => ({
  id: row.id,
  code: row.code,
  role: row.role,
  expiresAt: row.expires_at,
  maxUses: row.max_uses,
  useCount: row.use_count,
});

export const groupsRepository = {
  async listTypes() {
    const { data, error } = await db().from('group_types').select('key').order('sort_order');
    if (error) throw error;
    return data.map(({ key }) => key);
  },

  async listMine(): Promise<Group[]> {
    const { data, error } = await db()
      .from('groups')
      .select('id, name, type, owner_id, group_members!inner(role)')
      .eq('group_members.user_id', await currentUserId())
      .order('name');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      ownerId: row.owner_id,
      role: row.group_members[0]?.role ?? 'member',
    }));
  },

  async create({ name, type }: GroupInput) {
    const { data, error } = await db().from('groups').insert({ name, type }).select('id').single();
    if (error) throw error;
    return data.id;
  },

  async rename(id: string, name: string) {
    const { error } = await db().from('groups').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string) {
    const { error } = await db().from('groups').delete().eq('id', id);
    if (error) throw error;
  },

  async listMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await db().rpc('group_member_profiles', { target_group_id: groupId });
    if (error) throw error;
    return data.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  },

  async removeMember(groupId: string, userId: string) {
    const { error } = await db()
      .from('group_members')
      .delete()
      .match({ group_id: groupId, user_id: userId });
    if (error) throw error;
  },

  async leave(groupId: string) {
    await groupsRepository.removeMember(groupId, await currentUserId());
  },

  async setMemberRole(groupId: string, userId: string, role: GroupRole) {
    const { error } = await db().rpc('set_member_role', {
      target_group_id: groupId,
      target_user_id: userId,
      new_role: role,
    });
    if (error) throw error;
  },

  async transferOwnership(groupId: string, newOwnerId: string) {
    const { error } = await db().rpc('transfer_group_ownership', {
      target_group_id: groupId,
      new_owner_id: newOwnerId,
    });
    if (error) throw error;
  },

  async listInvites(groupId: string): Promise<GroupInvite[]> {
    const { data, error } = await db()
      .from('group_invites')
      .select(inviteColumns)
      .eq('group_id', groupId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(toInvite);
  },

  async createInvite(groupId: string, role: GroupRole, expiresAt: Date) {
    const { error } = await db()
      .from('group_invites')
      .insert({ group_id: groupId, role, expires_at: expiresAt.toISOString() });
    if (error) throw error;
  },

  async revokeInvite(id: string) {
    const { error } = await db()
      .from('group_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async previewInvite(code: string): Promise<InvitePreview | null> {
    const { data, error } = await db().rpc('get_invite_preview', { invite_code: code });
    // Spends the same limit as accept_invite (SEG8-2).
    if (error?.code === 'PT429') throw new Error(rateLimitedErrorCode, { cause: error });
    if (error) throw error;
    const row = data[0];
    return row ? { groupName: row.group_name, groupType: row.group_type, role: row.role } : null;
  },

  /**
   * The group joined. A code that does not serve comes back as null, so the rate limit counter
   * stays (SEG8-2): it throws `invite_invalid`. Over the limit (PT429) it throws `rate_limited`.
   */
  async acceptInvite(code: string): Promise<string> {
    const { data, error } = await db().rpc('accept_invite', { invite_code: code });
    if (error?.code === 'PT429') throw new Error(rateLimitedErrorCode, { cause: error });
    if (error) throw error;
    // The generated type says string: Postgres does not mark a nullable return.
    if (data === null) throw new Error('invite_invalid');
    return data;
  },
};
