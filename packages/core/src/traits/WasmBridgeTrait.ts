/**
 * WasmBridgeTrait — v5.1
 * WebAssembly bridge.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface WasmBridgeConfig {
  max_memory_pages: number;
}
export const wasmBridgeHandler: TraitHandler<WasmBridgeConfig> = {
  name: 'wasm_bridge',
  defaultConfig: { max_memory_pages: 256 },
  onAttach(node: HSPlusNode): void {
    node.__wasmState = { modules: new Map<string, boolean>(), calls: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__wasmState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: WasmBridgeConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__wasmState as { modules: Map<string, boolean>; calls: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'wasm:load':
        state.modules.set(event.moduleId as string, true);
        context.emit?.('wasm:loaded', {
          moduleId: event.moduleId,
          totalModules: state.modules.size,
        });
        break;
      case 'wasm:call':
        state.calls++;
        context.emit?.('wasm:result', {
          moduleId: event.moduleId,
          fn: event.fn,
          callCount: state.calls,
        });
        break;
    }
  },
};
export default wasmBridgeHandler;
