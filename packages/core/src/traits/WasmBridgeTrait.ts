/**
 * WasmBridgeTrait — v5.1
 * WebAssembly bridge.
 */
import type { TraitHandler } from './TraitTypes';
export interface WasmBridgeConfig { max_memory_pages: number; }
export const wasmBridgeHandler: TraitHandler<WasmBridgeConfig> = {
  name: 'wasm_bridge' as any, defaultConfig: { max_memory_pages: 256 },
  onAttach(node: any): void { node.__wasmState = { modules: new Map<string, boolean>(), calls: 0 }; },
  onDetach(node: any): void { delete node.__wasmState; },
  onUpdate(): void {},
  onEvent(node: any, _config: WasmBridgeConfig, context: any, event: any): void {
    const state = node.__wasmState as { modules: Map<string, boolean>; calls: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'wasm:load': state.modules.set(event.moduleId as string, true); context.emit?.('wasm:loaded', { moduleId: event.moduleId, totalModules: state.modules.size }); break;
      case 'wasm:call': state.calls++; context.emit?.('wasm:result', { moduleId: event.moduleId, fn: event.fn, callCount: state.calls }); break;
    }
  },
};
export default wasmBridgeHandler;
