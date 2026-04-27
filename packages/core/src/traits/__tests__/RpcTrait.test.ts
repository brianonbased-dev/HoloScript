/**
 * RpcTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { rpcHandler } from '../RpcTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __rpcState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { timeout_ms: 5000 };

describe('RpcTrait', () => {
  it('has name "rpc"', () => {
    expect(rpcHandler.name).toBe('rpc');
  });

  it('rpc:register emits rpc:registered', () => {
    const node = makeNode();
    rpcHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rpcHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rpc:register', method: 'getUser',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rpc:registered', { method: 'getUser' });
  });

  it('rpc:call emits rpc:response with callCount', () => {
    const node = makeNode();
    rpcHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rpcHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rpc:call', method: 'getUser',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rpc:response', { method: 'getUser', callCount: 1 });
  });
});
