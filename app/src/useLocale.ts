import { useSyncExternalStore } from 'react';
import { locale, subscribeLocale, type Locale } from './i18n';

/**
 * The current interface language, re-rendering the caller when the user
 * changes it in Settings.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, locale, locale);
}
