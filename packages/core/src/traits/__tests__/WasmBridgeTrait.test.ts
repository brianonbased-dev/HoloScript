/**
 * WasmBridgeTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { wasmBridgeHandler } from '../WasmBridgeTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __wasmState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_memory_pages: 256 };

describe('WasmBridgeTrait', () => {
  it('has name "wasm_bridge"', () => {
    expect(wasmBridgeHandler.name).toBe('wasm_bridge');
  });

  it('wasm:load emits wasm:loaded', () => {
    const node = makeNode();
    wasmBridgeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    wasmBridgeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'wasm:load', moduleId: 'math.wasm',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('wasm:loaded', { moduleId: 'math.wasm', totalModules: 1 });
  });
});
