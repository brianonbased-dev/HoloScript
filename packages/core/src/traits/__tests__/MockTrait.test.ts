/**
 * MockTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { mockHandler } from '../MockTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __mockState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { strict: true };

describe('MockTrait', () => {
  it('has name "mock"', () => {
    expect(mockHandler.name).toBe('mock');
  });

  it('mock:create registers mock and emits mock:created', () => {
    const node = makeNode();
    mockHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mock:create', name: 'fetchUser', returns: { id: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mock:created', { name: 'fetchUser' });
  });

  it('mock:call increments calls and emits mock:called', () => {
    const node = makeNode();
    mockHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mock:create', name: 'fn', returns: 42,
    } as never);
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mock:call', name: 'fn',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mock:called', expect.objectContaining({
      name: 'fn', calls: 1, returnValue: 42,
    }));
  });

  it('mock:verify emits mock:verified with pass=true when calls match expected', () => {
    const node = makeNode();
    mockHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mock:create', name: 'fn2',
    } as never);
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'mock:call', name: 'fn2' } as never);
    node.emit.mockClear();
    mockHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mock:verify', name: 'fn2', expected: 1,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mock:verified', expect.objectContaining({ pass: true }));
  });
});
