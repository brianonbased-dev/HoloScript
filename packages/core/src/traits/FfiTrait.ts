/**
 * FfiTrait — v5.1
 * Foreign function interface.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface FfiConfig { allowed_libs: string[]; }
export const ffiHandler: TraitHandler<FfiConfig> = {
  name: 'ffi', defaultConfig: { allowed_libs: [] },
  onAttach(node: HSPlusNode): void { node.__ffiState = { bindings: new Map<string, string>(), calls: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__ffiState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: FfiConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__ffiState as { bindings: Map<string, string>; calls: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'ffi:bind': state.bindings.set(event.symbol as string, (event.lib as string) ?? ''); context.emit?.('ffi:bound', { symbol: event.symbol, lib: event.lib }); break;
      case 'ffi:call': state.calls++; context.emit?.('ffi:result', { symbol: event.symbol, callCount: state.calls }); break;
    }
  },
};
export default ffiHandler;
