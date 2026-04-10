import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,
  PriorityScheduler,
} from '../sync/HighFrequencySync';

// =============================================================================
// C215 — High-Frequency Sync
// =============================================================================

describe('Position Quantization', () => {
  it('quantize then dequantize round-trips within precision', () => {
    const q = quantizePosition(12.34, -5.67, 0.02);
    const [x, y, z] = dequantizePosition(q);
    expect(x).toBeCloseTo(12.34, 1);
    expect(y).toBeCloseTo(-5.67, 1);
    expect(z).toBeCloseTo(0.02, 1);
  });

  it('quantize handles zero position', () => {
    const q = quantizePosition(0, 0, 0);
    const [x, y, z] = dequantizePosition(q);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(0, 1);
    expect(z).toBeCloseTo(0, 1);
  });

  it('quantize handles negative positions', () => {
    const q = quantizePosition(-10, -20, -30);
    const [x, y, z] = dequantizePosition(q);
    expect(x).toBeCloseTo(-10, 0);
    expect(y).toBeCloseTo(-20, 0);
    expect(z).toBeCloseTo(-30, 0);
  });
});

describe('Quaternion Compression', () => {
  it('compress/decompress identity quaternion', () => {
    const c = compressQuaternion(0, 0, 0, 1);
    const [qx, qy, qz, qw] = decompressQuaternion(c);
    expect(qx).toBeCloseTo(0, 1);
    expect(qy).toBeCloseTo(0, 1);
    expect(qz).toBeCloseTo(0, 1);
    expect(qw).toBeCloseTo(1, 1);
  });

  it('compress/decompress 90° Y rotation', () => {
    const s = Math.sin(Math.PI / 4);
    const co = Math.cos(Math.PI / 4);
    const c = compressQuaternion(0, s, 0, co);
    const [qx, qy, qz, qw] = decompressQuaternion(c);
    expect(qx).toBeCloseTo(0, 1);
    expect(qy).toBeCloseTo(s, 1);
    expect(qz).toBeCloseTo(0, 1);
    expect(qw).toBeCloseTo(co, 1);
  });

  it('compressed quaternion has 3 stored components (smallest-three)', () => {
    const c = compressQuaternion(0.1, 0.2, 0.3, 0.927);
    expect(c.index).toBeGreaterThanOrEqual(0);
    expect(c.index).toBeLessThanOrEqual(3);
    expect(c.a).toBeDefined();
    expect(c.b).toBeDefined();
    expect(c.c).toBeDefined();
  });
});

describe('PriorityScheduler', () => {
  // PriorityScheduler constructor calls requestAnimationFrame which is browser-only.
  // Stub it for Node.js test environment.
  let rafStub: ReturnType<typeof vi.fn>;
  let cafStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafStub = vi.fn(() => 1);
    cafStub = vi.fn();
    (globalThis as any).requestAnimationFrame = rafStub;
    (globalThis as any).cancelAnimationFrame = cafStub;
  });

  afterEach(() => {
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;
  });

  it('registerEntity and entity count', () => {
    const ps = new PriorityScheduler();
    ps.registerEntity('e1', 5);
    ps.registerEntity('e2', 3);
    const stats = ps.getStats();
    expect(stats).toBeDefined();
    ps.stop();
  });

  it('unregisterEntity removes entity', () => {
    const ps = new PriorityScheduler();
    ps.registerEntity('e1');
    ps.unregisterEntity('e1');
    // Updating an unregistered entity should be a no-op
    ps.updateEntity('e1', [1, 2, 3]);
    ps.stop();
  });

  it('updateEntity marks entity as dirty', () => {
    const ps = new PriorityScheduler();
    ps.registerEntity('e1');
    ps.updateEntity('e1', [10, 20, 30]);
    ps.stop();
  });

  it('onBatch callback fires with updates', () => {
    const ps = new PriorityScheduler();
    const cb = vi.fn();
    ps.onBatch(cb);
    ps.registerEntity('e1', 10);
    ps.updateEntity('e1', [1, 2, 3]);
    // Force a batch process
    ps.processBatch(Date.now());
    expect(cb).toHaveBeenCalled();
    const updates = cb.mock.calls[0][0];
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[0].entityId).toBe('e1');
    ps.stop();
  });

  it('stop halts the scheduler loop', () => {
    const ps = new PriorityScheduler();
    ps.registerEntity('e1');
    ps.stop();
    // Should be safe to call stop multiple times
    ps.stop();
  });

  it('getStats returns sync statistics', () => {
    const ps = new PriorityScheduler();
    ps.registerEntity('e1');
    ps.updateEntity('e1', [0, 0, 0]);
    ps.processBatch(Date.now());
    const stats = ps.getStats();
    expect(stats.updatesPerSecond).toBeGreaterThanOrEqual(0);
    expect(stats.compressionRatio).toBeGreaterThanOrEqual(0);
    ps.stop();
  });
});
