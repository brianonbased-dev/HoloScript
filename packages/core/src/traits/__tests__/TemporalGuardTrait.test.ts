/**
 * TemporalGuardTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { temporalGuardHandler } from '../TemporalGuardTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __tempState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_timeout_ms: 5000 };

describe('TemporalGuardTrait', () => {
  it('has name "temporal_guard"', () => {
    expect(temporalGuardHandler.name).toBe('temporal_guard');
  });

  it('tg:assert emits tg:asserted', () => {
    const node = makeNode();
    temporalGuardHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    temporalGuardHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'tg:assert', guardId: 'g1', property: 'health > 0',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('tg:asserted', { guardId: 'g1' });
  });

  it('tg:satisfy emits tg:satisfied', () => {
    const node = makeNode();
    temporalGuardHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    temporalGuardHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'tg:assert', guardId: 'g1',
    } as never);
    node.emit.mockClear();
    temporalGuardHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'tg:satisfy', guardId: 'g1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('tg:satisfied', { guardId: 'g1' });
  });
});
