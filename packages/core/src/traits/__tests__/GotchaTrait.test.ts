/**
 * GotchaTrait — comprehensive tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gotchaHandler, clearGotchaRegistry, listGotchas, getGotchasForEvent } from '../GotchaTrait';

const makeNode = () => ({
  id: 'node-g1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __gotchaState: undefined as unknown,
});

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

beforeEach(() => {
  clearGotchaRegistry();
});

describe('GotchaTrait — metadata', () => {
  it('has name "gotcha"', () => {
    expect(gotchaHandler.name).toBe('gotcha');
  });
});

describe('GotchaTrait — onAttach', () => {
  it('emits gotcha_registered on attach with valid config', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Missing @physics before @soft_body',
      severity: 'warning',
      mitigation: 'Add @physics',
      triggers_on: ['physics_missing'],
    }, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('gotcha_registered', expect.objectContaining({
      warning: 'Missing @physics before @soft_body',
      severity: 'warning',
    }));
  });

  it('emits gotcha_error when warning is empty', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: '',
      severity: 'warning',
      mitigation: '',
      triggers_on: [],
    }, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('gotcha_error', expect.objectContaining({
      error: expect.stringContaining('non-empty warning'),
    }));
  });

  it('immediately emits gotcha_triggered for critical severity', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Critical: memory overflow',
      severity: 'critical',
      mitigation: 'Reduce buffer size',
      triggers_on: [],
    }, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('gotcha_triggered', expect.objectContaining({
      severity: 'critical',
      triggerEvent: 'attach',
    }));
  });

  it('registers entry in module-level registry', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Test gotcha',
      severity: 'info',
      mitigation: 'nothing',
      triggers_on: ['test_event'],
    }, makeCtx(node) as never);
    expect(getGotchasForEvent('test_event')).toHaveLength(1);
  });
});

describe('GotchaTrait — onDetach', () => {
  it('removes entry from registry on detach', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Temp gotcha',
      severity: 'info',
      mitigation: 'n/a',
      triggers_on: ['temp_event'],
    }, makeCtx(node) as never);
    expect(getGotchasForEvent('temp_event')).toHaveLength(1);
    gotchaHandler.onDetach!(node as never, {} as never, makeCtx(node) as never);
    expect(getGotchasForEvent('temp_event')).toHaveLength(0);
  });
});

describe('GotchaTrait — onEvent', () => {
  it('emits gotcha_triggered when trigger event fires', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Physics missing',
      severity: 'warning',
      mitigation: 'Add @physics',
      triggers_on: ['physics_check'],
    }, makeCtx(node) as never);
    node.emit.mockClear();
    gotchaHandler.onEvent!(node as never, {} as never, makeCtx(node) as never, {
      type: 'physics_check',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gotcha_triggered', expect.objectContaining({
      warning: 'Physics missing',
      triggerEvent: 'physics_check',
      triggerCount: 1,
    }));
  });

  it('gotcha_query returns all registered gotchas', () => {
    const node = makeNode();
    gotchaHandler.onAttach!(node as never, {
      warning: 'Query test',
      severity: 'info',
      mitigation: 'ok',
      triggers_on: [],
    }, makeCtx(node) as never);
    node.emit.mockClear();
    gotchaHandler.onEvent!(node as never, {} as never, makeCtx(node) as never, {
      type: 'gotcha_query',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gotcha_query_result', expect.objectContaining({
      count: expect.any(Number),
    }));
  });
});
