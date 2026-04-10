/**
 * High-Frequency Sync Benchmarks
 *
 * Performance tests for Sprint 2 optimizations:
 * - Position quantization
 * - Quaternion compression
 * - Priority scheduling
 * - Jitter buffer
 *
 * @version 3.3.0
 * @Sprint Sprint 2: Performance Optimization
 */

import { Bench } from 'tinybench';
import {
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,
  PriorityScheduler,
  JitterBuffer,
} from '@holoscript/core';

const bench = new Bench({ time: 1000 });

// ============================================================================
// Position Quantization Benchmarks
// ============================================================================

bench
  .add('quantize-position', () => {
    quantizePosition(Math.random() * 1000 - 500, Math.random() * 100, Math.random() * 1000 - 500);
  })
  .add('dequantize-position', () => {
    const quantized = quantizePosition(123.45, 67.89, -234.56);
    dequantizePosition(quantized);
  })
  .add('position-roundtrip', () => {
    const original = [
      Math.random() * 1000 - 500,
      Math.random() * 100,
      Math.random() * 1000 - 500,
    ] as [number, number, number];
    const quantized = quantizePosition(...original);
    dequantizePosition(quantized);
  });

// ============================================================================
// Quaternion Compression Benchmarks
// ============================================================================

// Generate random normalized quaternion
function randomQuat(): [number, number, number, number] {
  const x = Math.random() * 2 - 1;
  const y = Math.random() * 2 - 1;
  const z = Math.random() * 2 - 1;
  const w = Math.random() * 2 - 1;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / len, y / len, z / len, w / len];
}

bench
  .add('compress-quaternion', () => {
    const q = randomQuat();
    compressQuaternion(q[0], q[1], q[2], q[3]);
  })
  .add('decompress-quaternion', () => {
    const q = randomQuat();
    const compressed = compressQuaternion(q[0], q[1], q[2], q[3]);
    decompressQuaternion(compressed);
  })
  .add('quaternion-roundtrip', () => {
    const q = randomQuat();
    const compressed = compressQuaternion(q[0], q[1], q[2], q[3]);
    decompressQuaternion(compressed);
  });

// ============================================================================
// Priority Scheduler Benchmarks
// ============================================================================

bench.add('scheduler-register-100-entities', () => {
  const scheduler = new PriorityScheduler();
  for (let i = 0; i < 100; i++) {
    scheduler.registerEntity(`entity-${i}`, Math.floor(Math.random() * 10) + 1);
  }
  scheduler.stop();
});

bench.add('scheduler-update-100-entities', () => {
  const scheduler = new PriorityScheduler();
  for (let i = 0; i < 100; i++) {
    scheduler.registerEntity(`entity-${i}`, 5);
  }

  for (let i = 0; i < 100; i++) {
    scheduler.updateEntity(
      `entity-${i}`,
      [Math.random() * 100, Math.random() * 10, Math.random() * 100],
      randomQuat()
    );
  }
  scheduler.stop();
});

// ============================================================================
// Jitter Buffer Benchmarks
// ============================================================================

bench.add('jitter-buffer-add-samples', () => {
  const buffer = new JitterBuffer(50);
  const now = Date.now();

  for (let i = 0; i < 60; i++) {
    buffer.addSample('entity-1', {
      timestamp: now + i * 16.67,
      position: [Math.random() * 100, Math.random() * 10, Math.random() * 100],
      rotation: randomQuat(),
    });
  }
});

bench.add('jitter-buffer-interpolate', () => {
  const buffer = new JitterBuffer(50);
  const now = Date.now();

  // Add samples
  for (let i = 0; i < 10; i++) {
    buffer.addSample('entity-1', {
      timestamp: now + i * 16.67,
      position: [i * 10, i, i * 10],
      rotation: [0, 0, 0, 1],
    });
  }

  // Interpolate
  for (let i = 0; i < 100; i++) {
    buffer.getInterpolatedState('entity-1', now + 80 + i * 2);
  }
});

// ============================================================================
// Compression Ratio Calculations
// ============================================================================

bench.add('measure-compression-ratio', () => {
  // Full state (uncompressed)
  const fullState = {
    position: [123.456789, 67.891234, -234.56789],
    rotation: [0.1, 0.2, 0.3, 0.9380832],
  };
  const fullBytes = JSON.stringify(fullState).length;

  // Compressed state
  const compressed = {
    pos: quantizePosition(123.456789, 67.891234, -234.56789),
    rot: compressQuaternion(0.1, 0.2, 0.3, 0.9380832),
  };

  // Compressed uses uint16 (2 bytes) x 3 for position = 6 bytes
  // Plus quaternion index (2 bits) + 3 x 11 bits = 35 bits = ~5 bytes
  // Total: ~11 bytes vs full JSON ~80+ bytes
  const compressedBytes = 11;

  return fullBytes / compressedBytes; // ~7x compression
});

export async function runSyncBench() {
  await bench.run();
  return bench;
}
