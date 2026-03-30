import { describe, it, expect } from 'vitest';
import { UnifiedParticleBuffer } from '../UnifiedParticleBuffer';
import { ParticleType } from '../PhysicsTypes';

describe('UnifiedParticleBuffer — registration', () => {
  it('registers a particle range and returns handle', () => {
    const buf = new UnifiedParticleBuffer(1000);
    const range = buf.registerParticles(ParticleType.FLUID, 100, 'test-fluid');
    expect(range.type).toBe(ParticleType.FLUID);
    expect(range.offset).toBe(0);
    expect(range.count).toBe(100);
    expect(range.label).toBe('test-fluid');
  });

  it('second registration gets offset after first', () => {
    const buf = new UnifiedParticleBuffer(1000);
    buf.registerParticles(ParticleType.FLUID, 100, 'fluid');
    const cloth = buf.registerParticles(ParticleType.CLOTH, 200, 'cloth');
    expect(cloth.offset).toBe(100);
    expect(cloth.count).toBe(200);
  });

  it('throws on capacity exceeded', () => {
    const buf = new UnifiedParticleBuffer(50);
    buf.registerParticles(ParticleType.FLUID, 40, 'fluid');
    expect(() => buf.registerParticles(ParticleType.CLOTH, 20, 'cloth')).toThrow(
      /capacity exceeded/
    );
  });

  it('initializes attribute type tags for range', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.RIGID, 10, 'rigid');
    const attrs = buf.getAttributes(range.offset);
    expect(attrs.type).toBe(ParticleType.RIGID);
    expect(attrs.phase).toBe(ParticleType.RIGID);
    expect(attrs.density).toBe(0);
    expect(attrs.pressure).toBe(0);
  });

  it('unregisterParticles removes range and zeros data', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.FLUID, 10, 'fluid');
    buf.writePositions(range, new Float32Array([1, 2, 3]));
    buf.unregisterParticles(range);
    expect(buf.getRanges()).toHaveLength(0);
    expect(buf.positions[0]).toBe(0);
  });

  it('getActiveCount sums all ranges', () => {
    const buf = new UnifiedParticleBuffer(1000);
    buf.registerParticles(ParticleType.FLUID, 100, 'fluid');
    buf.registerParticles(ParticleType.CLOTH, 200, 'cloth');
    buf.registerParticles(ParticleType.CROWD, 50, 'crowd');
    expect(buf.getActiveCount()).toBe(350);
  });
});

describe('UnifiedParticleBuffer — data access', () => {
  it('writePositions and readPositions roundtrip', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.FLUID, 3, 'fluid');
    const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    buf.writePositions(range, data);
    const read = buf.readPositions(range);
    expect(read[0]).toBe(1);
    expect(read[4]).toBe(5);
    expect(read[8]).toBe(9);
  });

  it('writeVelocities and readVelocities roundtrip', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.CLOTH, 2, 'cloth');
    const data = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    buf.writeVelocities(range, data);
    const read = buf.readVelocities(range);
    expect(read[0]).toBeCloseTo(0.1);
    expect(read[5]).toBeCloseTo(0.6);
  });

  it('writeDensityPressure updates attributes', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.FLUID, 3, 'fluid');
    buf.writeDensityPressure(
      range,
      new Float32Array([1000, 1100, 900]),
      new Float32Array([50, 60, 40])
    );
    expect(buf.getAttributes(range.offset).density).toBe(1000);
    expect(buf.getAttributes(range.offset + 1).pressure).toBe(60);
    expect(buf.getAttributes(range.offset + 2).density).toBe(900);
  });

  it('readPositions returns a view (not copy)', () => {
    const buf = new UnifiedParticleBuffer(100);
    const range = buf.registerParticles(ParticleType.FLUID, 2, 'fluid');
    buf.writePositions(range, new Float32Array([1, 2, 3, 4, 5, 6]));
    const view = buf.readPositions(range);
    // Mutate via positions directly
    buf.positions[range.offset * 3] = 99;
    expect(view[0]).toBe(99);
  });
});

describe('UnifiedParticleBuffer — getRangesByType', () => {
  it('filters by particle type', () => {
    const buf = new UnifiedParticleBuffer(1000);
    buf.registerParticles(ParticleType.FLUID, 100, 'fluid-1');
    buf.registerParticles(ParticleType.CLOTH, 200, 'cloth-1');
    buf.registerParticles(ParticleType.FLUID, 50, 'fluid-2');
    const fluids = buf.getRangesByType(ParticleType.FLUID);
    expect(fluids).toHaveLength(2);
    expect(fluids[0].label).toBe('fluid-1');
    expect(fluids[1].label).toBe('fluid-2');
  });
});

describe('UnifiedParticleBuffer — boundary coupling', () => {
  it('solveBoundaryCoupling applies repulsive forces', () => {
    const buf = new UnifiedParticleBuffer(100);
    const fluid = buf.registerParticles(ParticleType.FLUID, 1, 'fluid');
    const cloth = buf.registerParticles(ParticleType.CLOTH, 1, 'cloth');

    // Place fluid at origin, cloth very close
    buf.writePositions(fluid, new Float32Array([0, 0, 0]));
    buf.writePositions(cloth, new Float32Array([0.01, 0, 0]));
    buf.writeVelocities(fluid, new Float32Array([0, 0, 0]));
    buf.writeVelocities(cloth, new Float32Array([0, 0, 0]));

    buf.addCoupling({
      from: ParticleType.FLUID,
      to: ParticleType.CLOTH,
      strength: 100,
      radius: 0.1,
    });

    buf.solveBoundaryCoupling(1 / 60);

    // Cloth should have been pushed away (positive X velocity)
    const clothVel = buf.readVelocities(cloth);
    expect(clothVel[0]).toBeGreaterThan(0);
  });

  it('no coupling when particles are far apart', () => {
    const buf = new UnifiedParticleBuffer(100);
    const fluid = buf.registerParticles(ParticleType.FLUID, 1, 'fluid');
    const cloth = buf.registerParticles(ParticleType.CLOTH, 1, 'cloth');

    buf.writePositions(fluid, new Float32Array([0, 0, 0]));
    buf.writePositions(cloth, new Float32Array([10, 10, 10]));
    buf.writeVelocities(cloth, new Float32Array([0, 0, 0]));

    buf.addCoupling({
      from: ParticleType.FLUID,
      to: ParticleType.CLOTH,
      strength: 100,
      radius: 0.1,
    });

    buf.solveBoundaryCoupling(1 / 60);
    const clothVel = buf.readVelocities(cloth);
    expect(clothVel[0]).toBe(0);
    expect(clothVel[1]).toBe(0);
    expect(clothVel[2]).toBe(0);
  });
});

describe('UnifiedParticleBuffer — serialization', () => {
  it('serialize/deserialize roundtrip preserves positions', () => {
    const src = new UnifiedParticleBuffer(100);
    const range = src.registerParticles(ParticleType.FLUID, 3, 'fluid');
    src.writePositions(range, new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    src.writeVelocities(range, new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));

    const binary = src.serialize();
    expect(binary.byteLength).toBeGreaterThan(0);

    const dst = new UnifiedParticleBuffer(100);
    dst.deserialize(binary);

    expect(dst.positions[0]).toBeCloseTo(1);
    expect(dst.positions[8]).toBeCloseTo(9);
    expect(dst.velocities[0]).toBeCloseTo(0.1);
    expect(dst.velocities[8]).toBeCloseTo(0.9);
  });

  it('deserialize rejects bad magic', () => {
    const bad = new ArrayBuffer(16);
    const view = new DataView(bad);
    view.setUint32(0, 0xdeadbeef, false);

    const buf = new UnifiedParticleBuffer(100);
    expect(() => buf.deserialize(bad)).toThrow(/Invalid.*magic/);
  });

  it('deserialize rejects oversized data', () => {
    const src = new UnifiedParticleBuffer(1000);
    src.registerParticles(ParticleType.FLUID, 500, 'fluid');
    const binary = src.serialize();

    const small = new UnifiedParticleBuffer(10);
    expect(() => small.deserialize(binary)).toThrow(/exceeds local capacity/);
  });
});

describe('UnifiedParticleBuffer — stats', () => {
  it('reports correct stats', () => {
    const buf = new UnifiedParticleBuffer(5000);
    buf.registerParticles(ParticleType.FLUID, 100, 'fluid');
    buf.registerParticles(ParticleType.CLOTH, 200, 'cloth');

    const stats = buf.getStats();
    expect(stats.totalCapacity).toBe(5000);
    expect(stats.totalActive).toBe(300);
    expect(stats.rangeCount).toBe(2);
    expect(stats.byType['FLUID']).toBe(100);
    expect(stats.byType['CLOTH']).toBe(200);
    expect(stats.bufferSizeMB).toBeGreaterThan(0);
  });
});

describe('UnifiedParticleBuffer — dispose', () => {
  it('clears all state', () => {
    const buf = new UnifiedParticleBuffer(100);
    buf.registerParticles(ParticleType.FLUID, 50, 'fluid');
    buf.addCoupling({ from: ParticleType.FLUID, to: ParticleType.CLOTH, strength: 1, radius: 1 });
    buf.dispose();
    expect(buf.getRanges()).toHaveLength(0);
    expect(buf.getActiveCount()).toBe(0);
  });
});
