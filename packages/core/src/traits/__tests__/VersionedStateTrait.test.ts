/**
 * VersionedStateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { versionedStateHandler } from '../VersionedStateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { strategy: 'crdt' as const, branches: 4, auto_merge_lww: true };

describe('VersionedStateTrait', () => {
  it('has name "versioned_state"', () => {
    expect(versionedStateHandler.name).toBe('versioned_state');
  });

  it('onAttach emits versioned_state_initialized', () => {
    const node = makeNode();
    versionedStateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('versioned_state_initialized', expect.objectContaining({ strategy: 'crdt' }));
  });
});
