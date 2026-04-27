/**
 * WorldStateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { worldStateHandler } from '../WorldStateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  sync_interval: 0.1, autosave_interval: 30, max_objects: 10000,
  persist_terrain: true, persist_npc_memory: true, persist_inventory: true, world_id: 'default',
};

describe('WorldStateTrait', () => {
  it('has name "world_state"', () => {
    expect(worldStateHandler.name).toBe('world_state');
  });

  it('onAttach emits world_state_create', () => {
    const node = makeNode();
    worldStateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('world_state_create', expect.objectContaining({ worldId: 'default' }));
  });
});
