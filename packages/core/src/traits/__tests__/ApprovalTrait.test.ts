/**
 * ApprovalTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { approvalHandler } from '../ApprovalTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __approvalState: undefined as unknown,
});

const defaultConfig = { timeout_ms: 86400000 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ApprovalTrait — metadata', () => {
  it('has name "approval"', () => {
    expect(approvalHandler.name).toBe('approval');
  });

  it('defaultConfig timeout is 24h in ms', () => {
    expect(approvalHandler.defaultConfig?.timeout_ms).toBe(86400000);
  });
});

describe('ApprovalTrait — lifecycle', () => {
  it('onAttach initializes requests map', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__approvalState as { requests: Map<string, unknown> };
    expect(state.requests).toBeInstanceOf(Map);
    expect(state.requests.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    approvalHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__approvalState).toBeUndefined();
  });
});

describe('ApprovalTrait — onEvent', () => {
  it('approval:request stores pending request and emits approval:requested', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:request', requestId: 'req-1',
    } as never);
    const state = node.__approvalState as { requests: Map<string, { status: string }> };
    expect(state.requests.get('req-1')?.status).toBe('pending');
    expect(node.emit).toHaveBeenCalledWith('approval:requested', { requestId: 'req-1' });
  });

  it('approval:approve sets status to approved', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:request', requestId: 'req-2',
    } as never);
    node.emit.mockClear();
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:approve', requestId: 'req-2',
    } as never);
    const state = node.__approvalState as { requests: Map<string, { status: string }> };
    expect(state.requests.get('req-2')?.status).toBe('approved');
    expect(node.emit).toHaveBeenCalledWith('approval:approved', { requestId: 'req-2' });
  });

  it('approval:reject sets status to rejected with reason', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:request', requestId: 'req-3',
    } as never);
    node.emit.mockClear();
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:reject', requestId: 'req-3', reason: 'policy violation',
    } as never);
    const state = node.__approvalState as { requests: Map<string, { status: string }> };
    expect(state.requests.get('req-3')?.status).toBe('rejected');
    expect(node.emit).toHaveBeenCalledWith('approval:rejected', {
      requestId: 'req-3', reason: 'policy violation',
    });
  });

  it('approval:approve on missing request is a no-op', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:approve', requestId: 'does-not-exist',
    } as never);
    // Still emits approval:approved but state has no entry
    const state = node.__approvalState as { requests: Map<string, unknown> };
    expect(state.requests.has('does-not-exist')).toBe(false);
  });

  it('multiple requests tracked independently', () => {
    const node = makeNode();
    approvalHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:request', requestId: 'r-a',
    } as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:request', requestId: 'r-b',
    } as never);
    approvalHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'approval:approve', requestId: 'r-a',
    } as never);
    const state = node.__approvalState as { requests: Map<string, { status: string }> };
    expect(state.requests.get('r-a')?.status).toBe('approved');
    expect(state.requests.get('r-b')?.status).toBe('pending');
  });
});
