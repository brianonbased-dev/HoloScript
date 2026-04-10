/**
 * i18n Framework — Lightweight translation system for HoloScript Studio
 *
 * Uses a simple key-value approach with namespace prefixes.
 * Designed to be replaced with next-intl or react-intl when full i18n is needed.
 *
 * Usage:
 *   import { t } from '@/i18n';
 *   <h1>{t('studio.title')}</h1>
 */

import en from './locales/en';

type NestedKeys<T, Prefix extends string = ''> = T extends Record<string, unknown>
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends Record<string, unknown>
          ? NestedKeys<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

export type TranslationKey = NestedKeys<typeof en>;

const messages: Record<string, Record<string, unknown>> = { en };
let currentLocale = 'en';

export function setLocale(locale: string) {
  if (messages[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

export function addLocale(locale: string, translations: Record<string, unknown>) {
  messages[locale] = translations;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path; // Fallback to key
    }
  }
  return typeof current === 'string' ? current : path;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = messages[currentLocale] || messages.en;
  let value = getNestedValue(locale as Record<string, unknown>, key);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }

  return value;
}
