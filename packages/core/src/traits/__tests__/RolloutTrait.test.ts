/**
 * RolloutTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { rolloutHandler } from '../RolloutTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __rolloutState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_percentage: 0 };

describe('RolloutTrait', () => {
  it('has name "rollout"', () => {
    expect(rolloutHandler.name).toBe('rollout');
  });

  it('rollout:set emits rollout:configured', () => {
    const node = makeNode();
    rolloutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rolloutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rollout:set', feature: 'dark_mode', percentage: 50,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rollout:configured', { feature: 'dark_mode', percentage: 50 });
  });

  it('rollout:check emits rollout:result', () => {
    const node = makeNode();
    rolloutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rolloutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rollout:set', feature: 'dark_mode', percentage: 100,
    } as never);
    rolloutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rollout:check', feature: 'dark_mode', userId: 'u1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rollout:result', expect.objectContaining({ feature: 'dark_mode' }));
  });
});
