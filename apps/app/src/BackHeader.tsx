import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The header of every stack screen: one back control of at least 44px and nothing else, so there is
 * no empty title band or empty `<h1>`. The stack always has the tabs underneath (`unstable_settings`),
 * so even a screen opened by address has somewhere to go back to.
 */
export function BackHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top }} className="bg-background dark:bg-background-dark">
      <View
        style={{
          width: '100%',
          maxWidth: tokens.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: tokens.spacing[4],
        }}
      >
        <Pressable
          role="button"
          aria-label={t('actions.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{
            minWidth: tokens.sizes.touch,
            minHeight: tokens.sizes.touch,
            gap: tokens.spacing[1],
            alignSelf: 'flex-start',
          }}
          className="flex-row items-center active:opacity-70"
        >
          <Text aria-hidden className="font-heavy text-lg text-primary dark:text-primary-light">
            ←
          </Text>
          <Text aria-hidden className="font-heavy text-md text-primary dark:text-primary-light">
            {t('actions.back')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
