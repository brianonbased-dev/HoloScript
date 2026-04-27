/**
 * HealthcheckTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { healthcheckHandler } from '../HealthcheckTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __healthcheckState: undefined as unknown,
});

const defaultConfig = { auto_interval_ms: 30000, timeout_ms: 5000 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('HealthcheckTrait — metadata', () => {
  it('has name "healthcheck"', () => {
    expect(healthcheckHandler.name).toBe('healthcheck');
  });

  it('defaultConfig auto_interval_ms is 30000', () => {
    expect(healthcheckHandler.defaultConfig?.auto_interval_ms).toBe(30000);
  });

  it('defaultConfig timeout_ms is 5000', () => {
    expect(healthcheckHandler.defaultConfig?.timeout_ms).toBe(5000);
  });
});

describe('HealthcheckTrait — lifecycle', () => {
  it('onAttach initializes empty checks map', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__healthcheckState as { checks: Map<string, unknown>; lastRun: number };
    expect(state.checks).toBeInstanceOf(Map);
    expect(state.lastRun).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    healthcheckHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__healthcheckState).toBeUndefined();
  });
});

describe('HealthcheckTrait — onEvent', () => {
  it('healthcheck:register stores a check', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:register', checkId: 'db', checkType: 'liveness',
    } as never);
    const state = node.__healthcheckState as { checks: Map<string, { lastStatus: string }> };
    expect(state.checks.has('db')).toBe(true);
    expect(state.checks.get('db')?.lastStatus).toBe('unknown');
  });

  it('healthcheck:run emits healthcheck:result with degraded status', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:register', checkId: 'cache',
    } as never);
    node.emit.mockClear();
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:run',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('healthcheck:result', expect.objectContaining({
      status: 'degraded',
    }));
  });

  it('healthcheck:check_ok updates check to pass, run emits healthy', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:register', checkId: 'api',
    } as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:check_ok', checkId: 'api',
    } as never);
    node.emit.mockClear();
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:run',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('healthcheck:result', expect.objectContaining({
      status: 'healthy',
    }));
  });

  it('healthcheck:check_fail updates check to fail, run emits unhealthy', () => {
    const node = makeNode();
    healthcheckHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:register', checkId: 'db',
    } as never);
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:check_fail', checkId: 'db', error: 'connection timeout',
    } as never);
    node.emit.mockClear();
    healthcheckHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'healthcheck:run',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('healthcheck:result', expect.objectContaining({
      status: 'unhealthy',
    }));
  });
});
