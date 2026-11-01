import { useTranslation } from '@azkaban/i18n';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ConfirmButton } from './Button';
import { Card, Chip, ChipRow, EmptyState, Screen } from './Layout';
import { Mascot, type MascotMood } from './Mascot';
import { StatusBadge } from './StatusBadge';
import { Body, ErrorText, Muted, Subtitle, Title } from './Text';
import { colors, contextColors } from './tokens';

const moods: MascotMood[] = ['happy', 'celebrating', 'worried', 'sleeping'];

export function DesignSystemScreen() {
  const { t } = useTranslation('ui');
  const [selected, setSelected] = useState<string>('violet');
  return (
    <Screen>
      <Title>{t('designSystem.title')}</Title>

      <Subtitle>{t('designSystem.text')}</Subtitle>
      <Body>Body</Body>
      <Muted>Muted</Muted>
      <ErrorText>ErrorText</ErrorText>

      <Subtitle>{t('designSystem.buttons')}</Subtitle>
      <Button label="Primary" />
      <Button label="Secondary" variant="secondary" />
      <Button label="Danger" variant="danger" />
      <Button label="Disabled" disabled />
      <Button label="Loading" loading />
      <ConfirmButton label="Confirm" confirmLabel="Sure?" onConfirm={() => undefined} />

      <Subtitle>{t('designSystem.status')}</Subtitle>
      <View className="flex-row flex-wrap gap-2">
        <StatusBadge status="pending" />
        <StatusBadge status="done" />
        <StatusBadge status="partial" />
        <StatusBadge status="missed" />
        <StatusBadge status="cancelled" />
      </View>

      <Subtitle>{t('designSystem.contextColors')}</Subtitle>
      <ChipRow label={t('designSystem.contextColors')}>
        {Object.keys(contextColors).map((token) => (
          <Chip
            key={token}
            label={token}
            colorToken={token}
            selected={selected === token}
            onPress={() => setSelected(token)}
          />
        ))}
      </ChipRow>

      <Subtitle>{t('designSystem.mascot')}</Subtitle>
      <View className="flex-row flex-wrap justify-center gap-2">
        {moods.map((mood) => (
          <Mascot key={mood} mood={mood} size={80} />
        ))}
      </View>
      <EmptyState text="EmptyState" />

      <Subtitle>{t('designSystem.colors')}</Subtitle>
      {Object.entries(colors).map(([name, value]) => (
        <Card key={name}>
          <View className="flex-row items-center gap-3">
            <View className="h-8 w-8 rounded-full" style={{ backgroundColor: value }} />
            <Text className="font-body text-sm text-text dark:text-text-dark">
              {name} {value}
            </Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
