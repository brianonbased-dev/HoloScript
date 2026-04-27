/**
 * LoadTestTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { loadTestHandler } from '../LoadTestTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __loadState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_vus: 100, default_duration_ms: 30000 };

describe('LoadTestTrait', () => {
  it('has name "load_test"', () => {
    expect(loadTestHandler.name).toBe('load_test');
  });

  it('defaultConfig max_vus=100', () => {
    expect(loadTestHandler.defaultConfig?.max_vus).toBe(100);
  });

  it('onAttach sets running=false', () => {
    const node = makeNode();
    loadTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__loadState as { running: boolean }).running).toBe(false);
  });

  it('load:start sets running and emits load:started', () => {
    const node = makeNode();
    loadTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'load:start', vus: 50,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('load:started', expect.objectContaining({ vus: 50 }));
    expect((node.__loadState as { running: boolean }).running).toBe(true);
  });

  it('load:start caps vus at max_vus', () => {
    const node = makeNode();
    loadTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'load:start', vus: 999,
    } as never);
    expect((node.__loadState as { vus: number }).vus).toBe(100);
  });

  it('load:request increments requests counter and emits load:progress', () => {
    const node = makeNode();
    loadTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:request' } as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:request' } as never);
    expect((node.__loadState as { requests: number }).requests).toBe(2);
    expect(node.emit).toHaveBeenCalledWith('load:progress', expect.objectContaining({ requests: 2 }));
  });

  it('load:stop emits load:completed with errorRate', () => {
    const node = makeNode();
    loadTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:start', vus: 5 } as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:request', error: true } as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:request' } as never);
    loadTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'load:stop' } as never);
    expect(node.emit).toHaveBeenCalledWith('load:completed', expect.objectContaining({
      requests: 2, errors: 1, errorRate: 0.5,
    }));
  });
});
