/**
 * I18nManager.ts
 *
 * Internationalization: locale detection, string tables,
 * pluralization, interpolation, and fallback chains.
 *
 * @module accessibility
 */

/** Navigator with language property (standard but not always in TS lib). */
interface NavigatorWithLanguage {
  language?: string;
  [key: string]: unknown;
}

// =============================================================================
// TYPES
// =============================================================================

export interface PluralRule {
  zero?: string;
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export type StringEntry = string | PluralRule;

export interface StringTable {
  locale: string;
  strings: Map<string, StringEntry>;
}

// =============================================================================
// I18N MANAGER
// =============================================================================

export class I18nManager {
  private tables: Map<string, StringTable> = new Map();
  private currentLocale = 'en';
  private fallbackLocale = 'en';
  private listeners: Array<(locale: string) => void> = [];

  // ---------------------------------------------------------------------------
  // Locale
  // ---------------------------------------------------------------------------

  setLocale(locale: string): void {
    this.currentLocale = locale;
    this.listeners.forEach((cb) => cb(locale));
  }

  getLocale(): string {
    return this.currentLocale;
  }
  setFallback(locale: string): void {
    this.fallbackLocale = locale;
  }

  detectLocale(): string {
    if (typeof navigator === 'undefined') return 'en';
    const n = navigator as unknown as NavigatorWithLanguage;
    return typeof n.language === 'string' && n.language.length > 0 ? n.language : 'en';
  }

  onLocaleChange(callback: (locale: string) => void): void {
    this.listeners.push(callback);
  }

  // ---------------------------------------------------------------------------
  // String Tables
  // ---------------------------------------------------------------------------

  addTable(locale: string, entries: Record<string, StringEntry>): void {
    let table = this.tables.get(locale);
    if (!table) {
      table = { locale, strings: new Map() };
      this.tables.set(locale, table);
    }
    for (const [key, value] of Object.entries(entries)) table.strings.set(key, value);
  }

  hasKey(key: string, locale?: string): boolean {
    const l = locale ?? this.currentLocale;
    return this.tables.get(l)?.strings.has(key) ?? false;
  }

  getAvailableLocales(): string[] {
    return [...this.tables.keys()];
  }

  // ---------------------------------------------------------------------------
  // Translation
  // ---------------------------------------------------------------------------

  t(key: string, params?: Record<string, string | number>): string {
    const entry = this.resolve(key, this.currentLocale) ?? this.resolve(key, this.fallbackLocale);

    if (entry === undefined) return `[${key}]`;

    if (typeof entry === 'string') return this.interpolate(entry, params);

    // Plural
    const count = (params?.count ?? 0) as number;
    const form = this.selectPlural(count, entry);
    return this.interpolate(form, params);
  }

  private resolve(key: string, locale: string): StringEntry | undefined {
    return this.tables.get(locale)?.strings.get(key);
  }

  private interpolate(str: string, params?: Record<string, string | number>): string {
    if (!params) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
  }

  private selectPlural(count: number, rule: PluralRule): string {
    if (count === 0 && rule.zero) return rule.zero;
    if (count === 1) return rule.one;
    if (count >= 2 && count <= 4 && rule.few) return rule.few;
    if (count >= 5 && rule.many) return rule.many;
    return rule.other;
  }

  // ---------------------------------------------------------------------------
  // Completion
  // ---------------------------------------------------------------------------

  getCompletionRate(locale: string): number {
    const ref = this.tables.get(this.fallbackLocale);
    const target = this.tables.get(locale);
    if (!ref || !target) return 0;
    let total = 0,
      found = 0;
    for (const key of ref.strings.keys()) {
      total++;
      if (target.strings.has(key)) found++;
    }
    return total > 0 ? found / total : 1;
  }
}
