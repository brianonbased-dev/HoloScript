/**
 * SessionTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { sessionHandler } from '../SessionTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __sessionState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { ttl_ms: 86400000, max_sessions: 1000 };

describe('SessionTrait', () => {
  it('has name "session"', () => {
    expect(sessionHandler.name).toBe('session');
  });

  it('session:create emits session:created', () => {
    const node = makeNode();
    sessionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    sessionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'session:create', userId: 'u1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('session:created', expect.objectContaining({ userId: 'u1' }));
  });

  it('session:destroy emits session:destroyed', () => {
    const node = makeNode();
    sessionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    sessionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'session:destroy', sessionId: 'sess_123',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('session:destroyed', { sessionId: 'sess_123' });
  });
});
