/**
 * FfiTrait — v5.1
 * Foreign function interface.
 */
import type { TraitHandler } from './TraitTypes';
export interface FfiConfig { allowed_libs: string[]; }
export const ffiHandler: TraitHandler<FfiConfig> = {
  name: 'ffi' as any, defaultConfig: { allowed_libs: [] },
  onAttach(node: any): void { node.__ffiState = { bindings: new Map<string, string>(), calls: 0 }; },
  onDetach(node: any): void { delete node.__ffiState; },
  onUpdate(): void {},
  onEvent(node: any, _config: FfiConfig, context: any, event: any): void {
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
