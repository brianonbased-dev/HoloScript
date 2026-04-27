/**
 * SseTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { sseHandler } from '../SseTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __sseState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_clients: 1000, keepalive_ms: 30000 };

describe('SseTrait', () => {
  it('has name "sse"', () => {
    expect(sseHandler.name).toBe('sse');
  });

  it('sse:broadcast emits sse:sent', () => {
    const node = makeNode();
    sseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    sseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sse:connect', clientId: 'c1',
    } as never);
    sseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sse:broadcast', event: 'update', data: { x: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sse:sent', { event: 'update', clientCount: 1 });
  });
});
