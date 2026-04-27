/**
 * FeatureFlagTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { featureFlagHandler } from '../FeatureFlagTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __featureFlagState: undefined as unknown,
});

const defaultConfig = { max_flags: 200 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FeatureFlagTrait — metadata', () => {
  it('has name "feature_flag"', () => {
    expect(featureFlagHandler.name).toBe('feature_flag');
  });

  it('defaultConfig max_flags is 200', () => {
    expect(featureFlagHandler.defaultConfig?.max_flags).toBe(200);
  });
});

describe('FeatureFlagTrait — lifecycle', () => {
  it('onAttach initializes empty flags map', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__featureFlagState as { flags: Map<string, unknown> };
    expect(state.flags).toBeInstanceOf(Map);
    expect(state.flags.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__featureFlagState).toBeUndefined();
  });
});

describe('FeatureFlagTrait — onEvent', () => {
  it('flag:define registers a flag', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:define', flagId: 'new-ui', defaultValue: true,
    } as never);
    const state = node.__featureFlagState as { flags: Map<string, { enabled: boolean; defaultValue: unknown }> };
    expect(state.flags.get('new-ui')?.defaultValue).toBe(true);
    expect(state.flags.get('new-ui')?.enabled).toBe(true);
  });

  it('flag:evaluate returns value when flag enabled', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:define', flagId: 'beta-feature', defaultValue: 'variant_B',
    } as never);
    node.emit.mockClear();
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:evaluate', flagId: 'beta-feature',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('flag:result', expect.objectContaining({
      flagId: 'beta-feature', value: 'variant_B', enabled: true,
    }));
  });

  it('flag:evaluate returns false for undefined flag', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:evaluate', flagId: 'nonexistent',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('flag:result', expect.objectContaining({
      value: false, enabled: false,
    }));
  });

  it('flag:toggle disables an enabled flag', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:define', flagId: 'dark-mode', defaultValue: true,
    } as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:toggle', flagId: 'dark-mode', enabled: false,
    } as never);
    const state = node.__featureFlagState as { flags: Map<string, { enabled: boolean }> };
    expect(state.flags.get('dark-mode')?.enabled).toBe(false);
  });

  it('flag:evaluate returns false when flag is disabled', () => {
    const node = makeNode();
    featureFlagHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:define', flagId: 'exp', defaultValue: 'x',
    } as never);
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:toggle', flagId: 'exp', enabled: false,
    } as never);
    node.emit.mockClear();
    featureFlagHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'flag:evaluate', flagId: 'exp',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('flag:result', expect.objectContaining({
      value: false, enabled: false,
    }));
  });
});
