import { proofDefaults } from '@azkaban/config';
import { contextLocationSchema, type ContextLocation } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { readLocation } from '@azkaban/platform';
import { Body, Button, ErrorText, Input, Muted, Stepper, tokens } from '@azkaban/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { contextsConfig } from './config';

/** What the form holds while the place is half filled: the address and the point come apart. */
export type PlaceDraft = {
  address: string;
  point: { lat: number; lng: number } | null;
  radiusM: number;
};

export const placeToDraft = (location: ContextLocation | null): PlaceDraft | null =>
  location && {
    address: location.address,
    point: { lat: location.lat, lng: location.lng },
    radiusM: location.radiusM,
  };

/**
 * All or nothing, as the database wants (`contexts_location_check`): no address and no point is no
 * place; anything else needs both. `missing` says which one to ask for.
 */
export function draftToLocation(
  draft: PlaceDraft | null,
): { ok: true; location: ContextLocation | null } | { ok: false; missing: 'address' | 'point' } {
  const address = draft?.address.trim() ?? '';
  if (!draft || (address === '' && draft.point === null)) return { ok: true, location: null };
  if (address === '') return { ok: false, missing: 'address' };
  if (draft.point === null) return { ok: false, missing: 'point' };
  const parsed = contextLocationSchema.safeParse({
    address,
    ...draft.point,
    radiusM: draft.radiusM,
  });
  return parsed.success ? { ok: true, location: parsed.data } : { ok: false, missing: 'address' };
}

type Props = {
  value: PlaceDraft | null;
  onChange: (value: PlaceDraft | null) => void;
  /** Which part the last save attempt found missing. */
  missing: 'address' | 'point' | null;
};

const emptyDraft: PlaceDraft = {
  address: '',
  point: null,
  radiusM: proofDefaults.contextRadiusM,
};

const round = (value: number) => Number(value.toFixed(contextsConfig.coordinateDecimals));

/**
 * The optional place of a context (ADR-0007 section 7): an address for people to read, the point
 * from the device (there is no geocoding), and the radius a proof may be taken within.
 */
export function PlaceField({ value, onChange, missing }: Props) {
  const { t } = useTranslation('contexts');
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<'denied' | 'unavailable' | null>(null);
  const draft = value ?? emptyDraft;

  const useCurrent = async () => {
    setLocating(true);
    setFailure(null);
    const result = await readLocation();
    setLocating(false);
    if (result.status === 'ok') {
      onChange({
        ...draft,
        point: { lat: round(result.location.lat), lng: round(result.location.lng) },
      });
    } else {
      setFailure(result.status === 'denied' ? 'denied' : 'unavailable');
    }
  };

  return (
    <View style={{ gap: tokens.spacing[2] }}>
      <Body className="font-heavy">{t('form.place')}</Body>
      <Muted>{t('form.placeHint')}</Muted>
      <Muted>{t('form.placeAddress')}</Muted>
      <Input
        aria-label={t('form.placeAddress')}
        invalid={missing === 'address'}
        value={draft.address}
        maxLength={contextsConfig.addressMaxLength}
        onChangeText={(address) => onChange({ ...draft, address })}
      />
      {missing === 'address' ? <ErrorText>{t('form.placeAddressInvalid')}</ErrorText> : null}
      <Button
        variant="secondary"
        label={t(locating ? 'form.placeLocating' : 'form.placeUseCurrent')}
        loading={locating}
        onPress={useCurrent}
      />
      {draft.point ? (
        <Body role="status">
          {/* Not `lng`: i18next reads that option as the language to translate into. */}
          {t('form.placeSet', { latitude: draft.point.lat, longitude: draft.point.lng })}
        </Body>
      ) : null}
      {missing === 'point' && !draft.point ? (
        <ErrorText>{t('form.placeNeedsPoint')}</ErrorText>
      ) : null}
      {failure ? (
        <ErrorText>
          {t(failure === 'denied' ? 'form.placeDenied' : 'form.placeUnavailable')}
        </ErrorText>
      ) : null}
      {draft.point ? (
        <Stepper
          label={t('form.placeRadius')}
          value={draft.radiusM}
          min={contextsConfig.radiusMinM}
          max={contextsConfig.radiusMaxM}
          step={contextsConfig.radiusStepM}
          onChange={(radiusM) => onChange({ ...draft, radiusM })}
          format={(radiusM) => t('form.placeRadiusValue', { count: radiusM })}
        />
      ) : null}
      {value ? (
        <Button variant="secondary" label={t('form.placeRemove')} onPress={() => onChange(null)} />
      ) : null}
    </View>
  );
}
