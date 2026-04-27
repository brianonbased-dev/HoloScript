/**
 * NativeCallTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { nativeCallHandler } from '../NativeCallTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __nativeState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { sandbox: true };

describe('NativeCallTrait', () => {
  it('has name "native_call"', () => {
    expect(nativeCallHandler.name).toBe('native_call');
  });

  it('defaultConfig sandbox=true', () => {
    expect(nativeCallHandler.defaultConfig?.sandbox).toBe(true);
  });

  it('onAttach sets calls=0', () => {
    const node = makeNode();
    nativeCallHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__nativeState as { calls: number }).calls).toBe(0);
  });

  it('native:invoke increments calls and emits native:result', () => {
    const node = makeNode();
    nativeCallHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    nativeCallHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'native:invoke', api: 'camera', method: 'capture',
    } as never);
    expect((node.__nativeState as { calls: number }).calls).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('native:result', expect.objectContaining({
      api: 'camera', method: 'capture', sandboxed: true,
    }));
  });
});
