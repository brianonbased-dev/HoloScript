/**
 * High-Frequency Sync Protocol
 *
 * Optimizations for 60Hz spatial synchronization in multi-user XR experiences.
 *
 * Features:
 * - 16.67ms batch windows (60 FPS)
 * - Position quantization (16-bit fixed-point)
 * - Quaternion compression (smallest-three encoding)
 * - Priority-based update scheduling
 * - Jitter buffer for smooth interpolation
 * - Delta-only updates for static objects
 *
 * @version 3.3.0
 * @sprint Sprint 2: Performance Optimization
 */

// ============================================================================
// Types & Constants
// ============================================================================

const BATCH_WINDOW_MS = 16.67; // ~60 FPS
const MAX_JITTER_BUFFER_SIZE = 10;
const POSITION_SCALE = 100; // 0.01m precision
const MAX_PRIORITY = 10;

/** Quantized position (16-bit per axis) */
export interface QuantizedPosition {
  x: number;
  y: number;
  z: number;
}

/** Compressed quaternion (smallest-three encoding) */
export interface CompressedQuaternion {
  index: number; // Which component is largest (0-3)
  a: number; // First remaining component (11 bits)
  b: number; // Second remaining component (11 bits)
  c: number; // Third remaining component (11 bits)
}

/** High-frequency sync message */
export interface HighFrequencyUpdate {
  entityId: string;
  sequence: number;
  timestamp: number;
  position?: QuantizedPosition;
  rotation?: CompressedQuaternion;
  priority: number;
  isDelta: boolean;
}

/** Interpolation sample */
export interface InterpolationSample {
  timestamp: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

/** Sync statistics */
export interface HighFrequencySyncStats {
  updatesPerSecond: number;
  averageBatchSize: number;
  compressionRatio: number;
  jitterMs: number;
  droppedUpdates: number;
}

// ============================================================================
// Quantization Utilities
// ============================================================================

/**
 * Quantize a float position to 16-bit fixed-point
 */
export function quantizePosition(x: number, y: number, z: number): QuantizedPosition {
  return {
    x: Math.round(x * POSITION_SCALE) & 0xffff,
    y: Math.round(y * POSITION_SCALE) & 0xffff,
    z: Math.round(z * POSITION_SCALE) & 0xffff,
  };
}

/**
 * Dequantize a 16-bit position back to float
 */
export function dequantizePosition(q: QuantizedPosition): [number, number, number] {
  // Handle signed 16-bit values
  const toSigned = (v: number) => (v > 32767 ? v - 65536 : v);
  return [
    toSigned(q.x) / POSITION_SCALE,
    toSigned(q.y) / POSITION_SCALE,
    toSigned(q.z) / POSITION_SCALE,
  ];
}

/**
 * Compress a quaternion using smallest-three encoding
 * Stores the 3 smallest components, reconstructs the 4th
 */
export function compressQuaternion(
  qx: number,
  qy: number,
  qz: number,
  qw: number
): CompressedQuaternion {
  const components = [qx, qy, qz, qw];
  let maxIndex = 0;
  let maxValue = Math.abs(components[0]);

  // Find largest component
  for (let i = 1; i < 4; i++) {
    if (Math.abs(components[i]) > maxValue) {
      maxValue = Math.abs(components[i]);
      maxIndex = i;
    }
  }

  // Ensure positive for reconstruction
  const sign = components[maxIndex] < 0 ? -1 : 1;

  // Get remaining components
  const remaining: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (i !== maxIndex) {
      remaining.push(components[i] * sign);
    }
  }

  // Quantize to 11 bits each (-1 to 1 -> 0 to 2047)
  const to11Bit = (v: number) => Math.round((v + 1) * 1023.5) & 0x7ff;

  return {
    index: maxIndex,
    a: to11Bit(remaining[0]),
    b: to11Bit(remaining[1]),
    c: to11Bit(remaining[2]),
  };
}

/**
 * Decompress a quaternion from smallest-three encoding
 */
export function decompressQuaternion(c: CompressedQuaternion): [number, number, number, number] {
  // Dequantize from 11 bits
  const from11Bit = (v: number) => v / 1023.5 - 1;

  const a = from11Bit(c.a);
  const b = from11Bit(c.b);
  const d = from11Bit(c.c);

  // Reconstruct largest component
  const sumSquares = a * a + b * b + d * d;
  const largest = Math.sqrt(Math.max(0, 1 - sumSquares));

  // Reassemble quaternion
  const result: [number, number, number, number] = [0, 0, 0, 0];
  const remaining = [a, b, d];
  let ri = 0;

  for (let i = 0; i < 4; i++) {
    if (i === c.index) {
      result[i] = largest;
    } else {
      result[i] = remaining[ri++];
    }
  }

  return result;
}

// ============================================================================
// Priority Update Scheduler
// ============================================================================

interface ScheduledUpdate {
  entityId: string;
  priority: number;
  lastUpdate: number;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  dirty: boolean;
}

/**
 * PriorityScheduler - Manages update priorities and batching
 */
export class PriorityScheduler {
  private entities: Map<string, ScheduledUpdate> = new Map();
  private batchCallback: ((updates: HighFrequencyUpdate[]) => void) | null = null;
  private rafId: number | null = null;
  private lastBatchTime = 0;
  private sequence = 0;
  private stats = {
    updatesPerSecond: 0,
    totalUpdates: 0,
    startTime: Date.now(),
    batchSizes: [] as number[],
    droppedUpdates: 0,
  };

  constructor() {
    this.startLoop();
  }

  /**
   * Register an entity for sync
   */
  registerEntity(entityId: string, priority: number = 5): void {
    this.entities.set(entityId, {
      entityId,
      priority: Math.min(MAX_PRIORITY, Math.max(1, priority)),
      lastUpdate: 0,
      dirty: false,
    });
  }

  /**
   * Unregister an entity
   */
  unregisterEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  /**
   * Update entity state
   */
  updateEntity(
    entityId: string,
    position?: [number, number, number],
    rotation?: [number, number, number, number]
  ): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.position = position;
    entity.rotation = rotation;
    entity.dirty = true;
  }

  /**
   * Set batch callback
   */
  onBatch(callback: (updates: HighFrequencyUpdate[]) => void): void {
    this.batchCallback = callback;
  }

  /**
   * Get sync statistics
   */
  getStats(): HighFrequencySyncStats {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const avgBatch =
      this.stats.batchSizes.length > 0
        ? this.stats.batchSizes.reduce((a, b) => a + b, 0) / this.stats.batchSizes.length
        : 0;

    return {
      updatesPerSecond: this.stats.totalUpdates / elapsed,
      averageBatchSize: avgBatch,
      compressionRatio: 0.25, // ~4x compression from quantization
      jitterMs: 0, // Would be calculated from actual network jitter
      droppedUpdates: this.stats.droppedUpdates,
    };
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // === Private Methods ===

  private startLoop(): void {
    const tick = () => {
      const now = performance.now();

      if (now - this.lastBatchTime >= BATCH_WINDOW_MS) {
        this.processBatch(now);
        this.lastBatchTime = now;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private processBatch(now: number): void {
    const updates: HighFrequencyUpdate[] = [];
    const timestamp = Date.now();

    // Collect dirty entities sorted by priority
    const dirtyEntities = Array.from(this.entities.entries())
      .filter(([, e]) => e.dirty)
      .sort((a, b) => b[1].priority - a[1].priority);

    for (const [entityId, entity] of dirtyEntities) {
      // Calculate if this entity should update based on priority
      const updateInterval = BATCH_WINDOW_MS * (MAX_PRIORITY - entity.priority + 1);
      if (now - entity.lastUpdate < updateInterval) {
        continue;
      }

      const update: HighFrequencyUpdate = {
        entityId,
        sequence: this.sequence++,
        timestamp,
        priority: entity.priority,
        isDelta: entity.lastUpdate > 0,
      };

      if (entity.position) {
        update.position = quantizePosition(...entity.position);
      }

      if (entity.rotation) {
        update.rotation = compressQuaternion(...entity.rotation);
      }

      updates.push(update);
      entity.dirty = false;
      entity.lastUpdate = now;
    }

    if (updates.length > 0) {
      this.stats.totalUpdates += updates.length;
      this.stats.batchSizes.push(updates.length);

      // Keep only last 100 batch sizes
      if (this.stats.batchSizes.length > 100) {
        this.stats.batchSizes.shift();
      }

      this.batchCallback?.(updates);
    }
  }
}

// ============================================================================
// Jitter Buffer
// ============================================================================

/**
 * JitterBuffer - Smooths out network jitter for interpolation
 */
export class JitterBuffer {
  private samples: Map<string, InterpolationSample[]> = new Map();
  private bufferDelayMs: number;
  private maxSize: number;

  constructor(bufferDelayMs: number = 50, maxSize: number = MAX_JITTER_BUFFER_SIZE) {
    this.bufferDelayMs = bufferDelayMs;
    this.maxSize = maxSize;
  }

  /**
   * Add a sample to the buffer
   */
  addSample(entityId: string, sample: InterpolationSample): void {
    if (!this.samples.has(entityId)) {
      this.samples.set(entityId, []);
    }

    const buffer = this.samples.get(entityId)!;
    buffer.push(sample);

    // Keep buffer size limited
    while (buffer.length > this.maxSize) {
      buffer.shift();
    }
  }

  /**
   * Get interpolated state at a given time
   */
  getInterpolatedState(entityId: string, time: number): InterpolationSample | null {
    const buffer = this.samples.get(entityId);
    if (!buffer || buffer.length < 2) return buffer?.[0] ?? null;

    // Apply buffer delay
    const targetTime = time - this.bufferDelayMs;

    // Find surrounding samples
    let before: InterpolationSample | null = null;
    let after: InterpolationSample | null = null;

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].timestamp <= targetTime) {
        before = buffer[i];
      } else {
        after = buffer[i];
        break;
      }
    }

    if (!before) return buffer[0];
    if (!after) return before;

    // Interpolate between samples
    const t = (targetTime - before.timestamp) / (after.timestamp - before.timestamp);
    return this.lerpSample(before, after, Math.max(0, Math.min(1, t)));
  }

  /**
   * Clear buffer for an entity
   */
  clear(entityId: string): void {
    this.samples.delete(entityId);
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    this.samples.clear();
  }

  /**
   * Get buffer statistics
   */
  getStats(): { entityCount: number; averageBufferSize: number } {
    const sizes = Array.from(this.samples.values()).map((b) => b.length);
    return {
      entityCount: this.samples.size,
      averageBufferSize: sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
    };
  }

  // === Private Methods ===

  private lerpSample(
    a: InterpolationSample,
    b: InterpolationSample,
    t: number
  ): InterpolationSample {
    return {
      timestamp: a.timestamp + (b.timestamp - a.timestamp) * t,
      position: [
        a.position[0] + (b.position[0] - a.position[0]) * t,
        a.position[1] + (b.position[1] - a.position[1]) * t,
        a.position[2] + (b.position[2] - a.position[2]) * t,
      ],
      rotation: this.slerpQuat(a.rotation, b.rotation, t),
    };
  }

  private slerpQuat(
    a: [number, number, number, number],
    b: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    // Compute dot product
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

    // If negative, negate one quaternion to take shorter path
    const negated = dot < 0;
    if (negated) {
      dot = -dot;
      b = [-b[0], -b[1], -b[2], -b[3]];
    }

    // Linear interpolation for close quaternions
    if (dot > 0.9995) {
      return this.normalizeQuat([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
      ]);
    }

    // Spherical interpolation
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return [
      a[0] * wa + b[0] * wb,
      a[1] * wa + b[1] * wb,
      a[2] * wa + b[2] * wb,
      a[3] * wa + b[3] * wb,
    ];
  }

  private normalizeQuat(q: [number, number, number, number]): [number, number, number, number] {
    const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if (len === 0) return [0, 0, 0, 1];
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a priority scheduler for high-frequency sync
 */
export function createPriorityScheduler(): PriorityScheduler {
  return new PriorityScheduler();
}

/**
 * Create a jitter buffer for smooth interpolation
 */
export function createJitterBuffer(bufferDelayMs?: number): JitterBuffer {
  return new JitterBuffer(bufferDelayMs);
}
