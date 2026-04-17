import { describe, expect, it } from 'vitest';
import { LoroMap } from 'loro-crdt';
import { SpatialCRDTBridge } from './SpatialCRDTBridge';

describe('SpatialCRDTBridge (CRDT-02 type coercion)', () => {
  it('reads position when Loro scalars are stored as numeric strings', () => {
    const bridge = new SpatialCRDTBridge({ peerId: 'p1' });
    bridge.registerNode('cube');
    const doc = bridge.getDoc();
    const nodes = doc.getMap('nodes');
    const nodeMap = nodes.get('cube') as LoroMap;
    nodeMap.set('pos_x', '1.25' as unknown as number);
    nodeMap.set('pos_y', '-2' as unknown as number);
    nodeMap.set('pos_z', '0.5' as unknown as number);

    const p = bridge.getPosition('cube');
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(1.25);
    expect(p!.y).toBe(-2);
    expect(p!.z).toBeCloseTo(0.5);
  });

  it('reads hybrid rotation state when checkpoint_ms is a string timestamp', () => {
    const bridge = new SpatialCRDTBridge({ peerId: 'p2' });
    bridge.registerNode('n');
    const doc = bridge.getDoc();
    const nodeMap = doc.getMap('nodes').get('n') as LoroMap;
    const ts = 1700000000123;
    nodeMap.set('checkpoint_ms', String(ts) as unknown as number);

    const h = bridge.getHybridRotationState('n');
    expect(h).not.toBeNull();
    expect(h!.lastCheckpointMs).toBe(ts);
  });
});
