import { defaults } from '@azkaban/config';
import type { GroupInvite, GroupRole } from '@azkaban/contracts';
import { groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { copyToClipboard, createAppLink } from '@azkaban/platform';
import { Body, Button, Card, ConfirmButton, ErrorText, Muted, Subtitle } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const DAY_MS = 24 * 60 * 60 * 1000;

function InviteCard({ invite, onRevoke }: { invite: GroupInvite; onRevoke: () => void }) {
  const { t, i18n } = useTranslation('groups');
  const [copied, setCopied] = useState(false);
  const link = createAppLink(`/join/${invite.code}`);
  const date = new Date(invite.expiresAt).toLocaleDateString(i18n.language);
  return (
    <Card>
      <Subtitle>{invite.code}</Subtitle>
      <Muted>{t('invites.roleLabel', { role: t(`roles.${invite.role}`) })}</Muted>
      <Muted>{t('invites.expires', { date })}</Muted>
      <View aria-label={t('invites.qrLabel')} role="img" className="items-center py-2">
        <View className="rounded-md bg-surface p-3">
          <QRCode value={link} size={160} />
        </View>
      </View>
      <Button
        variant="secondary"
        label={t('invites.copyLink')}
        onPress={async () => {
          await copyToClipboard(link);
          setCopied(true);
        }}
      />
      {copied ? <Body>{t('invites.copied')}</Body> : null}
      <ConfirmButton
        label={t('invites.revoke')}
        confirmLabel={t('invites.revokeConfirm')}
        onConfirm={onRevoke}
      />
    </Card>
  );
}

export function InvitesSection({
  groupId,
  canInviteAdmins,
}: {
  groupId: string;
  canInviteAdmins: boolean;
}) {
  const { t } = useTranslation('groups');
  const queryClient = useQueryClient();
  const queryKey = ['group-invites', groupId];
  const invites = useQuery({ queryKey, queryFn: () => groupsRepository.listInvites(groupId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: (role: GroupRole) =>
      groupsRepository.createInvite(
        groupId,
        role,
        new Date(Date.now() + defaults.inviteTtlDays * DAY_MS),
      ),
    onSuccess: refresh,
  });
  const revoke = useMutation({ mutationFn: groupsRepository.revokeInvite, onSuccess: refresh });

  return (
    <>
      <Subtitle>{t('invites.title')}</Subtitle>
      {invites.data?.length === 0 ? <Muted>{t('invites.empty')}</Muted> : null}
      {invites.data?.map((invite) => (
        <InviteCard key={invite.id} invite={invite} onRevoke={() => revoke.mutate(invite.id)} />
      ))}
      {create.isError || revoke.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
      <Button
        label={t('invites.createMember')}
        loading={create.isPending}
        onPress={() => create.mutate('member')}
      />
      {canInviteAdmins ? (
        <Button
          variant="secondary"
          label={t('invites.createAdmin')}
          onPress={() => create.mutate('admin')}
        />
      ) : null}
    </>
  );
}
