import { defaults } from '@azkaban/config';
import { contextInputSchema, type ContextInput } from '@azkaban/contracts';
import { can } from '@azkaban/core';
import { contextsRepository, groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Button,
  Chip,
  ChipRow,
  ConfirmButton,
  ErrorText,
  FormTextField,
  Muted,
  Screen,
  Title,
  tokens,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { draftToLocation, PlaceField, placeToDraft, type PlaceDraft } from './PlaceField';

export function ContextFormScreen({ contextId, areaId }: { contextId?: string; areaId?: string }) {
  const { t } = useTranslation('contexts');
  const router = useRouter();
  const queryClient = useQueryClient();
  const areas = useQuery({ queryKey: ['areas'], queryFn: contextsRepository.listAreas });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine });

  const existing = contexts.data?.find(({ id }) => id === contextId);
  const user = {
    memberships: groups.data?.map(({ id, role }) => ({ groupId: id, role })) ?? [],
  };
  const manageable = groups.data?.filter(({ id }) => can(user, 'context.manage', { id })) ?? [];
  const readOnly = existing?.groupId
    ? !can(user, 'context.manage', { id: existing.groupId })
    : false;

  const { control, handleSubmit } = useForm<ContextInput>({
    resolver: zodResolver(contextInputSchema),
    values: existing ?? {
      areaId: areaId ?? areas.data?.[0]?.id ?? '',
      groupId: null,
      name: '',
      colorToken: defaults.contextColorToken,
      icon: defaults.contextIcon,
      location: null,
    },
    resetOptions: { keepDirtyValues: true },
  });
  // `undefined`: not touched, so the saved place shows; `null`: removed.
  const [place, setPlace] = useState<PlaceDraft | null | undefined>(undefined);
  const [missing, setMissing] = useState<'address' | 'point' | null>(null);
  const shownPlace = place === undefined ? placeToDraft(existing?.location ?? null) : place;
  const { field: area } = useController({ control, name: 'areaId' });
  const { field: group } = useController({ control, name: 'groupId' });
  const { field: color } = useController({ control, name: 'colorToken' });

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contexts'] });
    // A deep link has no history to go back to.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const save = useMutation({
    mutationFn: (values: ContextInput) =>
      contextId ? contextsRepository.update(contextId, values) : contextsRepository.create(values),
    onSuccess: finish,
  });
  const archive = useMutation({
    mutationFn: () => contextsRepository.archive(contextId ?? ''),
    onSuccess: finish,
  });

  return (
    <Screen>
      <Title>{t(contextId ? 'form.editTitle' : 'form.newTitle')}</Title>
      <FormTextField
        control={control}
        name="name"
        label={t('form.name')}
        errorText={t('form.nameInvalid')}
        editable={!readOnly}
      />
      <FormTextField
        control={control}
        name="icon"
        label={t('form.icon')}
        errorText={t('form.iconInvalid')}
        editable={!readOnly}
      />
      <Muted>{t('form.area')}</Muted>
      <ChipRow label={t('form.area')}>
        {areas.data?.map((item) => (
          <Chip
            key={item.id}
            label={`${item.icon} ${t(item.i18nKey)}`}
            selected={area.value === item.id}
            onPress={() => !readOnly && area.onChange(item.id)}
          />
        ))}
      </ChipRow>
      {contextId ? null : (
        <>
          <Muted>{t('form.owner')}</Muted>
          <ChipRow label={t('form.owner')}>
            <Chip
              label={t('form.justMe')}
              selected={group.value === null}
              onPress={() => group.onChange(null)}
            />
            {manageable.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                selected={group.value === item.id}
                onPress={() => group.onChange(item.id)}
              />
            ))}
          </ChipRow>
        </>
      )}
      <Muted>{t('form.color')}</Muted>
      <ChipRow label={t('form.color')}>
        {Object.keys(tokens.contextColors).map((token) => (
          <Chip
            key={token}
            label={t(`colors.${token}`)}
            colorToken={token}
            selected={color.value === token}
            onPress={() => !readOnly && color.onChange(token)}
          />
        ))}
      </ChipRow>
      {readOnly ? (
        existing?.location ? (
          <Muted>{existing.location.address}</Muted>
        ) : null
      ) : (
        <PlaceField
          value={shownPlace}
          missing={missing}
          onChange={(next) => {
            setPlace(next);
            setMissing(null);
          }}
        />
      )}
      {save.isError || archive.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
      {readOnly ? null : (
        <Button
          label={t('actions.save')}
          loading={save.isPending}
          // Before the areas arrive the form has no area, and saving would do nothing, silently.
          disabled={!areas.isSuccess}
          onPress={handleSubmit((values) => {
            const result = draftToLocation(shownPlace);
            if (!result.ok) setMissing(result.missing);
            else save.mutate({ ...values, location: result.location });
          })}
        />
      )}
      {contextId && !readOnly ? (
        <ConfirmButton
          label={t('form.archive')}
          confirmLabel={t('form.archiveConfirm')}
          loading={archive.isPending}
          onConfirm={() => archive.mutate()}
        />
      ) : null}
    </Screen>
  );
}
