import { describe, it, expect } from 'vitest';
import { BlockoutCRDTSession } from './blockoutCRDT';

describe('BlockoutCRDTSession', () => {
  it('round-trips center and half-extents locally', () => {
    const s = new BlockoutCRDTSession('peer-a');
    s.upsertVolume('lobby', { x: 0, y: 2, z: -1 }, { x: 4, y: 3, z: 5 });
    const v = s.getVolume('lobby');
    expect(v).not.toBeNull();
    expect(v!.center.y).toBeCloseTo(2);
    expect(v!.halfExtents.x).toBeCloseTo(4);
    expect(v!.halfExtents.z).toBeCloseTo(5);
    expect(s.listVolumeIds()).toEqual(['lobby']);
    s.dispose();
  });

  it('merges volumes to another peer via snapshot import', () => {
    const a = new BlockoutCRDTSession('peer-a');
    const b = new BlockoutCRDTSession('peer-b');
    a.upsertVolume('wing', { x: 1, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    b.importUpdate(a.exportSnapshot());
    const v = b.getVolume('wing');
    expect(v).not.toBeNull();
    expect(v!.center.x).toBeCloseTo(1);
    expect(v!.halfExtents.y).toBeCloseTo(2);
    expect(b.listVolumeIds()).toEqual(['wing']);
    a.dispose();
    b.dispose();
  });
});
