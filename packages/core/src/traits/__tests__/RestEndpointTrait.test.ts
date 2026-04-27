/**
 * RestEndpointTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { restEndpointHandler } from '../RestEndpointTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __restState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { base_path: '/api' };

describe('RestEndpointTrait', () => {
  it('has name "rest_endpoint"', () => {
    expect(restEndpointHandler.name).toBe('rest_endpoint');
  });

  it('rest:register emits rest:registered', () => {
    const node = makeNode();
    restEndpointHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    restEndpointHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rest:register', method: 'GET', path: '/users',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rest:registered', expect.objectContaining({ method: 'GET' }));
  });

  it('rest:request emits rest:response', () => {
    const node = makeNode();
    restEndpointHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    restEndpointHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rest:request', method: 'GET', path: '/users',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rest:response', expect.objectContaining({ status: 200 }));
  });
});
