/**
 * WorldHeartbeatTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { worldHeartbeatHandler } from '../WorldHeartbeatTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { interval_ms: 1000, redundancy: 2, failover_threshold: 3 };

describe('WorldHeartbeatTrait', () => {
  it('has name "world_heartbeat"', () => {
    expect(worldHeartbeatHandler.name).toBe('world_heartbeat');
  });

  it('onAttach emits heartbeat_initialized', () => {
    const node = makeNode();
    worldHeartbeatHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('heartbeat_initialized', expect.objectContaining({ interval_ms: 1000, redundancy: 2 }));
  });
});
