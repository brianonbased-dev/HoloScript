/**
 * DataQualityTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { dataQualityHandler } from '../DataQualityTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __dqState: undefined as unknown,
});

const defaultConfig = { fail_on_error: false };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DataQualityTrait — metadata', () => {
  it('has name "data_quality"', () => {
    expect(dataQualityHandler.name).toBe('data_quality');
  });

  it('defaultConfig fail_on_error is false', () => {
    expect(dataQualityHandler.defaultConfig?.fail_on_error).toBe(false);
  });
});

describe('DataQualityTrait — lifecycle', () => {
  it('onAttach initializes counters', () => {
    const node = makeNode();
    dataQualityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__dqState as { checks: number; passed: number; failed: number };
    expect(state.checks).toBe(0);
    expect(state.passed).toBe(0);
    expect(state.failed).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    dataQualityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataQualityHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__dqState).toBeUndefined();
  });
});

describe('DataQualityTrait — onEvent', () => {
  it('quality:check passes and emits quality:result with valid=true', () => {
    const node = makeNode();
    dataQualityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataQualityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'quality:check', rule: 'not_null', valid: true,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('quality:result', expect.objectContaining({
      rule: 'not_null', valid: true, checks: 1, passRate: 1,
    }));
  });

  it('quality:check fails and increments failed count', () => {
    const node = makeNode();
    dataQualityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataQualityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'quality:check', rule: 'range_check', valid: false,
    } as never);
    const state = node.__dqState as { checks: number; passed: number; failed: number };
    expect(state.failed).toBe(1);
    expect(state.passed).toBe(0);
  });

  it('passRate is accurate across mixed results', () => {
    const node = makeNode();
    dataQualityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataQualityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'quality:check', rule: 'r', valid: true } as never);
    dataQualityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'quality:check', rule: 'r', valid: true } as never);
    dataQualityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'quality:check', rule: 'r', valid: false } as never);
    const calls = node.emit.mock.calls;
    const lastResult = calls[calls.length - 1][1] as { passRate: number };
    expect(lastResult.passRate).toBeCloseTo(2 / 3);
  });
});
