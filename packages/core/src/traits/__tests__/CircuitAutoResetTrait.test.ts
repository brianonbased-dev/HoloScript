/**
 * CircuitAutoResetTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { circuitAutoResetHandler } from '../CircuitAutoResetTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __circuitAutoResetState: undefined as unknown,
});

const defaultConfig = {
  backoff_base: 2,
  max_attempts: 3,
  cooldown_ms: 1000,
  max_backoff_ms: 300000,
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('CircuitAutoResetTrait — metadata', () => {
  it('has name "circuit_auto_reset"', () => {
    expect(circuitAutoResetHandler.name).toBe('circuit_auto_reset');
  });

  it('defaultConfig has expected shape', () => {
    const c = circuitAutoResetHandler.defaultConfig!;
    expect(c.backoff_base).toBe(2);
    expect(c.max_attempts).toBe(5);
    expect(c.cooldown_ms).toBe(30000);
  });
});

describe('CircuitAutoResetTrait — onAttach', () => {
  it('initializes state as closed and emits circuit_auto_initialized', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__circuitAutoResetState as { state: string; failureCount: number };
    expect(state.state).toBe('closed');
    expect(state.failureCount).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('circuit_auto_initialized', expect.objectContaining({
      backoff_base: 2, max_attempts: 3,
    }));
  });

  it('emits circuit_auto_error when backoff_base < 1', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, {
      ...defaultConfig, backoff_base: 0,
    }, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('circuit_auto_error', expect.objectContaining({
      error: expect.stringContaining('backoff_base'),
    }));
  });

  it('emits circuit_auto_error when max_attempts < 1', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, {
      ...defaultConfig, max_attempts: 0,
    }, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('circuit_auto_error', expect.objectContaining({
      error: expect.stringContaining('max_attempts'),
    }));
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    circuitAutoResetHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__circuitAutoResetState).toBeUndefined();
  });
});

describe('CircuitAutoResetTrait — onEvent: circuit_failure', () => {
  it('increments failureCount below threshold — circuit stays closed', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    circuitAutoResetHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'circuit_failure', error: 'timeout',
    } as never);
    const state = node.__circuitAutoResetState as { state: string; failureCount: number };
    expect(state.failureCount).toBe(1);
    expect(state.state).toBe('closed');
    expect(node.emit).not.toHaveBeenCalledWith('circuit_open', expect.anything());
  });

  it('opens circuit after max_attempts failures', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    for (let i = 0; i < 3; i++) {
      circuitAutoResetHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'circuit_failure', error: 'fail',
      } as never);
    }
    const state = node.__circuitAutoResetState as { state: string };
    expect(state.state).toBe('open');
    expect(node.emit).toHaveBeenCalledWith('circuit_open', expect.objectContaining({
      failureCount: 3,
    }));
  });

  it('circuit_success in closed state resets failureCount', () => {
    const node = makeNode();
    circuitAutoResetHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    circuitAutoResetHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'circuit_failure', error: 'oops',
    } as never);
    circuitAutoResetHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'circuit_success',
    } as never);
    const state = node.__circuitAutoResetState as { failureCount: number };
    expect(state.failureCount).toBe(0);
  });
});
