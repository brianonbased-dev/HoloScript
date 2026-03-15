/**
 * DataQualityTrait — v5.1
 * Data quality validation rules.
 */
import type { TraitHandler } from './TraitTypes';
export interface DataQualityConfig { fail_on_error: boolean; }
export const dataQualityHandler: TraitHandler<DataQualityConfig> = {
  name: 'data_quality' as any, defaultConfig: { fail_on_error: false },
  onAttach(node: any): void { node.__dqState = { checks: 0, passed: 0, failed: 0 }; },
  onDetach(node: any): void { delete node.__dqState; },
  onUpdate(): void {},
  onEvent(node: any, _config: DataQualityConfig, context: any, event: any): void {
    const state = node.__dqState as { checks: number; passed: number; failed: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'quality:check') {
      state.checks++;
      const pass = (event.valid as boolean) ?? true;
      if (pass) state.passed++; else state.failed++;
      context.emit?.('quality:result', { rule: event.rule, valid: pass, checks: state.checks, passRate: state.checks > 0 ? state.passed / state.checks : 0 });
    }
  },
};
export default dataQualityHandler;
