/**
 * LocaleTrait — v5.1
 * Locale detection and switching.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface LocaleConfig {
  default_locale: string;
  supported: string[];
}

export const localeHandler: TraitHandler<LocaleConfig> = {
  name: 'locale',
  defaultConfig: { default_locale: 'en-US', supported: ['en-US', 'es', 'fr', 'de', 'ja', 'zh'] },
  onAttach(node: HSPlusNode, config: unknown): void {
    // @ts-expect-error
    node.__localeState = { current: config.default_locale || 'en-US' };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__localeState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: LocaleConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__localeState as { current: string } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'locale:set': {
        const locale = event.locale as string;
        if (config.supported.includes(locale)) {
          const prev = state.current;
          state.current = locale;
          context.emit?.('locale:changed', { from: prev, to: locale });
        } else {
          context.emit?.('locale:unsupported', { locale, supported: config.supported });
        }
        break;
      }
      case 'locale:get':
        context.emit?.('locale:current', { locale: state.current });
        break;
    }
  },
};
export default localeHandler;
