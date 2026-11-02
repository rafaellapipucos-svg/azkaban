import { useTranslation } from '@azkaban/i18n';
import Constants from 'expo-constants';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

// The name in app.config.ts, which also fills the <title> of index.html.
const appName = Constants.expoConfig?.name ?? document.title;

export function useDocumentTitle(title?: string): void {
  const { t } = useTranslation();
  // Tabs and the screens under a stack stay mounted, so only the focused one may write.
  const focused = useIsFocused();
  useEffect(() => {
    if (focused)
      document.title = title ? t('documentTitle', { screen: title, app: appName }) : appName;
  }, [focused, title, t]);
}
