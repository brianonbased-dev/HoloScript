/**
 * TranslationTrait — v5.1
 * Translation key lookup with ICU message formatting.
 */
import type { TraitHandler } from './TraitTypes';

export interface TranslationConfig { fallback_locale: string; }

export const translationHandler: TraitHandler<TranslationConfig> = {
  name: 'translation',
  defaultConfig: { fallback_locale: 'en' },
  onAttach(node: any): void { node.__i18nState = { bundles: new Map<string, Map<string, string>>() }; },
  onDetach(node: any): void { delete node.__i18nState; },
  onUpdate(): void {},
  onEvent(node: any, config: TranslationConfig, context: any, event: any): void {
    const state = node.__i18nState as { bundles: Map<string, Map<string, string>> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'i18n:load': {
        const locale = event.locale as string;
        const m = new Map<string, string>();
        for (const [k, v] of Object.entries((event.messages as Record<string, string>) ?? {})) m.set(k, v);
        state.bundles.set(locale, m);
        context.emit?.('i18n:loaded', { locale, keys: m.size });
        break;
      }
      case 'i18n:translate': {
        const locale = (event.locale as string) ?? config.fallback_locale;
        const bundle = state.bundles.get(locale) ?? state.bundles.get(config.fallback_locale);
        const text = bundle?.get(event.key as string) ?? event.key;
        context.emit?.('i18n:translated', { key: event.key, locale, text });
        break;
      }
    }
  },
};
export default translationHandler;
