import { groupInputSchema, type GroupMember, type GroupRole } from '@azkaban/contracts';
import { can } from '@azkaban/core';
import { groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  ConfirmButton,
  ErrorText,
  FormTextField,
  Muted,
  Screen,
  Subtitle,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { InvitesSection } from './InvitesSection';

const nameSchema = groupInputSchema.pick({ name: true });

export function GroupDetailScreen({
  groupId,
  userId,
  children,
}: {
  groupId: string;
  userId: string;
  /** Entry points other modules add to this group's page, such as the team view. */
  children?: ReactNode;
}) {
  const { t } = useTranslation('groups');
  const router = useRouter();
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine });
  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId),
  });
  const group = groups.data?.find(({ id }) => id === groupId);
  const user = {
    memberships: groups.data?.map(({ id, role }) => ({ groupId: id, role })) ?? [],
  };
  const scope = { id: groupId };

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['group-invites', groupId] }),
    ]);
  const leaveGroups = async () => {
    await queryClient.invalidateQueries({ queryKey: ['groups'] });
    router.replace('/groups');
  };

  const { control, handleSubmit } = useForm({
    resolver: zodResolver(nameSchema),
    values: group && { name: group.name },
  });
  const rename = useMutation({
    mutationFn: ({ name }: { name: string }) => groupsRepository.rename(groupId, name),
    onSuccess: refresh,
  });
  const setRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: GroupRole }) =>
      groupsRepository.setMemberRole(groupId, memberId, role),
    onSuccess: refresh,
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) => groupsRepository.removeMember(groupId, memberId),
    onSuccess: refresh,
  });
  const transfer = useMutation({
    mutationFn: (memberId: string) => groupsRepository.transferOwnership(groupId, memberId),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => groupsRepository.leave(groupId),
    onSuccess: leaveGroups,
  });
  const removeGroup = useMutation({
    mutationFn: () => groupsRepository.remove(groupId),
    onSuccess: leaveGroups,
  });

  const failed = [rename, setRole, removeMember, transfer, leave, removeGroup].some(
    ({ isError }) => isError,
  );

  if (!group) return <Screen>{null}</Screen>;

  const memberActions = (member: GroupMember) => {
    if (member.userId === userId || member.role === 'owner') return null;
    return (
      <>
        {can(user, 'member.change_role', scope) ? (
          <Button
            variant="secondary"
            label={t(member.role === 'admin' ? 'detail.makeMember' : 'detail.makeAdmin')}
            onPress={() =>
              setRole.mutate({
                memberId: member.userId,
                role: member.role === 'admin' ? 'member' : 'admin',
              })
            }
          />
        ) : null}
        {can(user, 'group.transfer', scope) ? (
          <ConfirmButton
            label={t('detail.transfer')}
            confirmLabel={t('detail.transferConfirm')}
            onConfirm={() => transfer.mutate(member.userId)}
          />
        ) : null}
        {can(user, 'member.remove', scope) &&
        (member.role === 'member' || can(user, 'member.change_role', scope)) ? (
          <ConfirmButton
            label={t('detail.remove')}
            confirmLabel={t('detail.removeConfirm')}
            onConfirm={() => removeMember.mutate(member.userId)}
          />
        ) : null}
      </>
    );
  };

  return (
    <Screen>
      {can(user, 'group.update', scope) ? (
        <>
          <FormTextField
            control={control}
            name="name"
            label={t('form.name')}
            errorText={t('form.nameInvalid')}
          />
          <Button
            variant="secondary"
            label={t('detail.rename')}
            loading={rename.isPending}
            onPress={handleSubmit((values) => rename.mutate(values))}
          />
        </>
      ) : (
        <Subtitle>{group.name}</Subtitle>
      )}

      <Subtitle>{t('detail.members')}</Subtitle>
      {members.data?.map((member) => (
        <Card key={member.userId}>
          <Body>
            {member.displayName}
            {member.userId === userId ? ` (${t('detail.you')})` : ''}
          </Body>
          <Muted>{t(`roles.${member.role}`)}</Muted>
          {memberActions(member)}
        </Card>
      ))}

      {children}

      {can(user, 'member.invite', scope) ? (
        <InvitesSection
          groupId={groupId}
          canInviteAdmins={can(user, 'member.change_role', scope)}
        />
      ) : null}

      {failed ? <ErrorText>{t('errors.generic')}</ErrorText> : null}

      {group.role === 'owner' ? null : (
        <ConfirmButton
          label={t('detail.leave')}
          confirmLabel={t('detail.leaveConfirm')}
          loading={leave.isPending}
          onConfirm={() => leave.mutate()}
        />
      )}
      {can(user, 'group.delete', scope) ? (
        <ConfirmButton
          label={t('detail.delete')}
          confirmLabel={t('detail.deleteConfirm')}
          loading={removeGroup.isPending}
          onConfirm={() => removeGroup.mutate()}
        />
      ) : null}
    </Screen>
  );
}
