/**
 * Localization.ts
 *
 * Multi-language string tables: interpolation, pluralization,
 * fallback chains, and locale switching.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export interface LocaleData {
  locale: string;
  strings: Map<string, string>;
  pluralRules: Map<
    string,
    { zero?: string; one: string; few?: string; many?: string; other: string }
  >;
}

// =============================================================================
// LOCALIZATION
// =============================================================================

export class Localization {
  private locales: Map<string, LocaleData> = new Map();
  private currentLocale = 'en';
  private fallbackLocale = 'en';
  private missingKeys: Set<string> = new Set();

  // ---------------------------------------------------------------------------
  // Locale Management
  // ---------------------------------------------------------------------------

  addLocale(locale: string, strings: Record<string, string>): void {
    const existing = this.locales.get(locale);
    if (existing) {
      // Merge strings into existing locale
      for (const [key, val] of Object.entries(strings)) {
        existing.strings.set(key, val);
      }
    } else {
      const data: LocaleData = {
        locale,
        strings: new Map(Object.entries(strings)),
        pluralRules: new Map(),
      };
      this.locales.set(locale, data);
    }
  }

  addPluralRule(
    locale: string,
    key: string,
    rules: { zero?: string; one: string; few?: string; many?: string; other: string }
  ): void {
    const data = this.locales.get(locale);
    if (data) data.pluralRules.set(key, rules);
  }

  setLocale(locale: string): boolean {
    if (!this.locales.has(locale)) return false;
    this.currentLocale = locale;
    return true;
  }

  setFallback(locale: string): void {
    this.fallbackLocale = locale;
  }

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  getAvailableLocales(): string[] {
    return [...this.locales.keys()];
  }

  // ---------------------------------------------------------------------------
  // Translation
  // ---------------------------------------------------------------------------

  t(key: string, params?: Record<string, string | number>): string {
    let text = this.locales.get(this.currentLocale)?.strings.get(key);

    if (text === undefined && this.currentLocale !== this.fallbackLocale) {
      text = this.locales.get(this.fallbackLocale)?.strings.get(key);
    }

    if (text === undefined) {
      this.missingKeys.add(key);
      return `[${key}]`;
    }

    if (params) text = this.interpolate(text, params);
    return text;
  }

  plural(key: string, count: number, params?: Record<string, string | number>): string {
    const data = this.locales.get(this.currentLocale) ?? this.locales.get(this.fallbackLocale);
    if (!data) return `[${key}]`;

    const rules = data.pluralRules.get(key);
    if (!rules) return this.t(key, { ...params, count: count as unknown as string });

    let text: string;
    if (count === 0 && rules.zero) text = rules.zero;
    else if (count === 1) text = rules.one;
    else if (count >= 2 && count <= 4 && rules.few) text = rules.few;
    else if (count >= 5 && rules.many) text = rules.many;
    else text = rules.other;

    return this.interpolate(text, { ...params, count: String(count) });
  }

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  private interpolate(text: string, params: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (_match, key) => {
      return params[key] !== undefined ? String(params[key]) : `{${key}}`;
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getStringCount(locale?: string): number {
    const loc = locale ?? this.currentLocale;
    return this.locales.get(loc)?.strings.size ?? 0;
  }

  getMissingKeys(): string[] {
    return [...this.missingKeys];
  }

  clearMissingKeys(): void {
    this.missingKeys.clear();
  }

  hasKey(key: string, locale?: string): boolean {
    const loc = locale ?? this.currentLocale;
    return this.locales.get(loc)?.strings.has(key) ?? false;
  }

  getCompletionPercentage(locale: string): number {
    const fallbackData = this.locales.get(this.fallbackLocale);
    const localeData = this.locales.get(locale);
    if (!fallbackData || !localeData) return 0;
    const total = fallbackData.strings.size;
    if (total === 0) return 100;
    let matched = 0;
    for (const key of fallbackData.strings.keys()) {
      if (localeData.strings.has(key)) matched++;
    }
    return (matched / total) * 100;
  }
}
