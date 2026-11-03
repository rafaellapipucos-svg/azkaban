import { groupInputSchema, type GroupMember, type GroupRole } from '@azkaban/contracts';
import { can, canRemoveMember, memberActions } from '@azkaban/core';
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
  Title,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { InvitesSection } from './InvitesSection';

const nameSchema = groupInputSchema.pick({ name: true });
const setRoleLabel = { admin: 'detail.makeAdmin', member: 'detail.makeMember' } as const;

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

  if (!group) return <Screen title={t('detail.title')}>{null}</Screen>;

  const renderActions = (member: GroupMember) => {
    const actions = memberActions(user, scope, {
      role: member.role,
      self: member.userId === userId,
    });
    const { setRoleTo } = actions;
    return (
      <>
        {setRoleTo ? (
          <Button
            variant="secondary"
            label={t(setRoleLabel[setRoleTo])}
            onPress={() => setRole.mutate({ memberId: member.userId, role: setRoleTo })}
          />
        ) : null}
        {actions.transfer ? (
          <ConfirmButton
            label={t('detail.transfer')}
            confirmLabel={t('detail.transferConfirm')}
            onConfirm={() => transfer.mutate(member.userId)}
          />
        ) : null}
        {actions.remove ? (
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
    <Screen title={group.name}>
      <Title>{group.name}</Title>
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
      ) : null}

      <Subtitle>{t('detail.members')}</Subtitle>
      {members.data?.map((member) => (
        <Card key={member.userId}>
          <Body>
            {member.displayName}
            {member.userId === userId ? ` (${t('detail.you')})` : ''}
          </Body>
          <Muted>{t(`roles.${member.role}`)}</Muted>
          {renderActions(member)}
        </Card>
      ))}

      {children}

      <Button
        variant="secondary"
        label={t('transparency.open')}
        onPress={() => router.push({ pathname: '/transparency', params: { groupId } })}
      />

      {can(user, 'member.invite', scope) ? (
        <InvitesSection
          groupId={groupId}
          canInviteAdmins={can(user, 'member.change_role', scope)}
        />
      ) : null}

      {failed ? <ErrorText>{t('errors.generic')}</ErrorText> : null}

      {canRemoveMember(user, scope, { role: group.role, self: true }) ? (
        <ConfirmButton
          label={t('detail.leave')}
          confirmLabel={t('detail.leaveConfirm')}
          loading={leave.isPending}
          onConfirm={() => leave.mutate()}
        />
      ) : null}
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
