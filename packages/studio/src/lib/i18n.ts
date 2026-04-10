/**
 * i18n — Lightweight internationalisation layer for HoloScript Studio
 *
 * Drop-in foundation: the `t()` function and `useTranslation()` hook mirror
 * the react-i18next API so this module can be replaced with a full i18n
 * library (next-intl, react-i18next, Lingui) without changing call sites.
 *
 * Usage:
 *   import { t } from '@/lib/i18n';
 *   const label = t('common.save');        // → "Save"
 *
 *   import { useTranslation } from '@/lib/i18n';
 *   const { t } = useTranslation();
 *   <button>{t('common.cancel')}</button>
 */

import en from '@/locales/en';

export type Locale = 'en';
export type TranslationKey = keyof typeof en;

type Translations = Record<string, string>;
type Interpolations = Record<string, string | number>;

const locales: Record<Locale, Translations> = { en };

let currentLocale: Locale = 'en';

/**
 * Set the active locale.  Call once on app init when you know the user's
 * preferred language.  In the future this will trigger a React context update.
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Synchronous translation function.
 *
 * @param key  - Dot-separated key from the active locale dictionary
 * @param vars - Optional interpolation values — {{key}} placeholders are replaced
 *
 * Falls back to the key itself so missing translations are always visible in dev.
 */
export function t(key: string, vars?: Interpolations): string {
  const translations = locales[currentLocale] ?? locales.en;
  let result = translations[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return result;
}

/**
 * React hook — returns a scoped `t()` with an optional namespace prefix.
 *
 * @param ns - Optional namespace prefix (e.g. `"ai"` turns `t("title")` into a lookup of `"ai.title"`)
 */
export function useTranslation(ns?: string): { t: (key: string, vars?: Interpolations) => string; locale: Locale } {
  return {
    t: (key: string, vars?: Interpolations) => t(ns ? `${ns}.${key}` : key, vars),
    locale: currentLocale,
  };
}
