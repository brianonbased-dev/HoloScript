/**
 * SnapshotTestTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { snapshotTestHandler } from '../SnapshotTestTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __snapState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { update_on_mismatch: false };

describe('SnapshotTestTrait', () => {
  it('has name "snapshot_test"', () => {
    expect(snapshotTestHandler.name).toBe('snapshot_test');
  });

  it('snapshot:capture emits snapshot:captured', () => {
    const node = makeNode();
    snapshotTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    snapshotTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'snapshot:capture', name: 'btn', value: { color: 'red' },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('snapshot:captured', { name: 'btn' });
  });

  it('snapshot:compare emits snapshot:result with match=true on identical value', () => {
    const node = makeNode();
    snapshotTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    snapshotTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'snapshot:capture', name: 'comp', value: { x: 1 },
    } as never);
    node.emit.mockClear();
    snapshotTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'snapshot:compare', name: 'comp', value: { x: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('snapshot:result', expect.objectContaining({ match: true }));
  });
});
