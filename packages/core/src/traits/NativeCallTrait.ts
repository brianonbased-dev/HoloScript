/**
 * NativeCallTrait — v5.1
 * Native platform call.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface NativeCallConfig {
  sandbox: boolean;
}
export const nativeCallHandler: TraitHandler<NativeCallConfig> = {
  name: 'native_call',
  defaultConfig: { sandbox: true },
  onAttach(node: HSPlusNode): void {
    node.__nativeState = { calls: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__nativeState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: NativeCallConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__nativeState as { calls: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t === 'native:invoke') {
      state.calls++;
      context.emit?.('native:result', {
        api: event.api,
        method: event.method,
        sandboxed: config.sandbox,
        callCount: state.calls,
      });
    }
  },
};
export default nativeCallHandler;
