/**
 * GdprTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { gdprHandler } from '../GdprTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __gdprState: undefined as unknown,
});

const defaultConfig = { retention_days: 365 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('GdprTrait — metadata', () => {
  it('has name "gdpr"', () => {
    expect(gdprHandler.name).toBe('gdpr');
  });

  it('defaultConfig retention_days is 365', () => {
    expect(gdprHandler.defaultConfig?.retention_days).toBe(365);
  });
});

describe('GdprTrait — lifecycle', () => {
  it('onAttach initializes empty requests map', () => {
    const node = makeNode();
    gdprHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__gdprState as { requests: Map<string, unknown> };
    expect(state.requests).toBeInstanceOf(Map);
    expect(state.requests.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    gdprHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    gdprHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__gdprState).toBeUndefined();
  });
});

describe('GdprTrait — onEvent', () => {
  it('gdpr:access stores pending request and emits gdpr:access_requested', () => {
    const node = makeNode();
    gdprHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    gdprHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gdpr:access', requestId: 'req-001', subjectId: 'user-42',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gdpr:access_requested', {
      requestId: 'req-001', subjectId: 'user-42',
    });
    const state = node.__gdprState as { requests: Map<string, { type: string; status: string }> };
    expect(state.requests.get('req-001')?.status).toBe('pending');
    expect(state.requests.get('req-001')?.type).toBe('access');
  });

  it('gdpr:delete stores erasure request and emits gdpr:erasure_requested', () => {
    const node = makeNode();
    gdprHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    gdprHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gdpr:delete', requestId: 'req-002', subjectId: 'user-99',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gdpr:erasure_requested', {
      requestId: 'req-002', subjectId: 'user-99',
    });
    const state = node.__gdprState as { requests: Map<string, { type: string }> };
    expect(state.requests.get('req-002')?.type).toBe('erasure');
  });

  it('gdpr:export stores portability request and emits gdpr:export_requested', () => {
    const node = makeNode();
    gdprHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    gdprHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gdpr:export', requestId: 'req-003', subjectId: 'user-10',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gdpr:export_requested', { requestId: 'req-003' });
    const state = node.__gdprState as { requests: Map<string, { type: string }> };
    expect(state.requests.get('req-003')?.type).toBe('portability');
  });
});
