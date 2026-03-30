/**
 * RtlTrait — v5.1
 * Right-to-left layout management.
 */
import type { TraitHandler } from './TraitTypes';

export interface RtlConfig {
  rtl_locales: string[];
}

export const rtlHandler: TraitHandler<RtlConfig> = {
  name: 'rtl',
  defaultConfig: { rtl_locales: ['ar', 'he', 'fa', 'ur'] },
  onAttach(node: any): void {
    node.__rtlState = { enabled: false };
  },
  onDetach(node: any): void {
    delete node.__rtlState;
  },
  onUpdate(): void {},
  onEvent(node: any, config: RtlConfig, context: any, event: any): void {
    const state = node.__rtlState as { enabled: boolean } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'rtl:check') {
      const locale = event.locale as string;
      state.enabled = config.rtl_locales.some((r) => locale.startsWith(r));
      context.emit?.('rtl:result', { locale, rtl: state.enabled });
    }
  },
};
export default rtlHandler;
