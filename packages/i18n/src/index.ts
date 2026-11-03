import { defaults } from '@azkaban/config';
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import auth from './pt-BR/auth.json';
import common from './pt-BR/common.json';

export function initI18n() {
  return i18next.use(initReactI18next).init({
    lng: defaults.locale,
    fallbackLng: defaults.locale,
    defaultNS: 'common',
    resources: { [defaults.locale]: { common, auth } },
    interpolation: { escapeValue: false },
  });
}

export { useTranslation };
