/**
 * NativeCallTrait — v5.1
 * Native platform call.
 */
import type { TraitHandler } from './TraitTypes';
export interface NativeCallConfig { sandbox: boolean; }
export const nativeCallHandler: TraitHandler<NativeCallConfig> = {
  name: 'native_call' as any, defaultConfig: { sandbox: true },
  onAttach(node: any): void { node.__nativeState = { calls: 0 }; },
  onDetach(node: any): void { delete node.__nativeState; },
  onUpdate(): void {},
  onEvent(node: any, config: NativeCallConfig, context: any, event: any): void {
    const state = node.__nativeState as { calls: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t === 'native:invoke') { state.calls++; context.emit?.('native:result', { api: event.api, method: event.method, sandboxed: config.sandbox, callCount: state.calls }); }
  },
};
export default nativeCallHandler;
