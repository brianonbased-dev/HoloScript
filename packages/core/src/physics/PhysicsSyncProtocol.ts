/**
 * PhysicsSyncProtocol — WebRTC binary protocol for two-tier physics sync.
 *
 * Tier 1 (Logic): CRDT state sync at ~10 Hz via WorldState (Loro)
 * Tier 2 (Physics): Raw binary particle sync at ~60 Hz via DataChannel
 *
 * This module handles Tier 2. The binary protocol is designed for minimal
 * overhead over unreliable DataChannels:
 *   - No JSON, no protobuf — pure typed arrays
 *   - Delta compression: only send changed particles
 *   - Quantized positions: 16-bit half-float for bandwidth (optional)
 *   - Sequence numbers for jitter buffer / interpolation
 *
 * Wire format:
 *   Header (16 bytes):
 *     [0-3]   magic: 0x48505350 ('HPSP')
 *     [4-5]   version: u16
 *     [6-7]   sequence: u16 (wraps at 65535)
 *     [8-11]  timestamp: u32 (ms since session start)
 *     [12-13] particleCount: u16
 *     [14]    flags: u8 (bit 0: delta, bit 1: quantized)
 *     [15]    reserved: u8
 *
 *   Body (per particle, full mode = 25 bytes):
 *     [0-3]   x: f32
 *     [4-7]   y: f32
 *     [8-11]  z: f32
 *     [12-15] vx: f32
 *     [16-19] vy: f32
 *     [20-23] vz: f32
 *     [24]    type: u8 (ParticleType enum)
 *
 *   Body (per particle, delta mode = 13 bytes):
 *     [0-1]   index: u16 (particle index in unified buffer)
 *     [2-5]   dx: f32 (position delta)
 *     [6-9]   dy: f32
 *     [10-13] dz: f32
 *
 * @module physics
 * @see P.GAPS.09: Two-tier sync
 * @see G.GAPS.07: NEVER use CRDT for particle sync
 */

import { ParticleType } from './PhysicsTypes';
import type { UnifiedParticleBuffer, ParticleRange } from './UnifiedParticleBuffer';

// =============================================================================
// Constants
// =============================================================================

const MAGIC = 0x48505350; // 'HPSP'
const VERSION = 1;
const HEADER_SIZE = 16;
const FULL_PARTICLE_SIZE = 25; // 6 floats + 1 byte
const DELTA_PARTICLE_SIZE = 14; // u16 index + 3 floats

/** Flags byte bit masks */
const FLAG_DELTA = 0x01;
const FLAG_QUANTIZED = 0x02; // Reserved for future half-float support

// =============================================================================
// Types
// =============================================================================

export interface PhysicsSyncConfig {
  /** Target send rate in Hz (default: 60) */
  sendRate: number;
  /** Delta threshold — only send particles that moved more than this (default: 0.001) */
  deltaThreshold: number;
  /** Max particles per packet (default: 1000, ~25KB full / ~14KB delta) */
  maxParticlesPerPacket: number;
  /** Whether to use delta compression (default: true) */
  useDelta: boolean;
  /** Jitter buffer size in frames (default: 3) */
  jitterBufferSize: number;
  /** Interpolation method: 'none' | 'linear' | 'hermite' (default: 'linear') */
  interpolation: 'none' | 'linear' | 'hermite';
}

export interface SyncPacketHeader {
  magic: number;
  version: number;
  sequence: number;
  timestamp: number;
  particleCount: number;
  flags: number;
}

export interface SyncStats {
  packetsSent: number;
  packetsReceived: number;
  bytesPerSecond: number;
  averageLatencyMs: number;
  deltaRatio: number; // fraction of particles sent as deltas
  droppedPackets: number;
}

/** Jitter buffer entry for interpolation. */
interface BufferedFrame {
  sequence: number;
  timestamp: number;
  positions: Float32Array;
  velocities: Float32Array;
}

// =============================================================================
// PhysicsSyncSender
// =============================================================================

/**
 * Encodes physics state from a UnifiedParticleBuffer into binary packets
 * and sends them over a WebRTC DataChannel.
 */
export class PhysicsSyncSender {
  private config: PhysicsSyncConfig;
  private sequence = 0;
  private sessionStartMs = Date.now();
  private lastPositions: Float32Array | null = null;
  private packetsSent = 0;
  private bytesSent = 0;
  private lastStatResetMs = Date.now();
  private sendInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<PhysicsSyncConfig>) {
    this.config = {
      sendRate: 60,
      deltaThreshold: 0.001,
      maxParticlesPerPacket: 1000,
      useDelta: true,
      jitterBufferSize: 3,
      interpolation: 'linear',
      ...config,
    };
  }

  /**
   * Start periodic sending. Calls encode() and sends over the channel.
   */
  startSending(
    buffer: UnifiedParticleBuffer,
    channel: { send(data: ArrayBuffer): void; readyState: string },
  ): void {
    const intervalMs = 1000 / this.config.sendRate;

    this.sendInterval = setInterval(() => {
      if (channel.readyState !== 'open') return;

      const packet = this.encode(buffer);
      if (packet) {
        channel.send(packet);
        this.packetsSent++;
        this.bytesSent += packet.byteLength;
      }
    }, intervalMs);
  }

  /** Stop periodic sending. */
  stopSending(): void {
    if (this.sendInterval !== null) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
  }

  /**
   * Encode current buffer state into a binary packet.
   * Returns null if no particles need sending.
   */
  encode(buffer: UnifiedParticleBuffer): ArrayBuffer | null {
    const activeCount = buffer.getActiveCount();
    if (activeCount === 0) return null;

    const positions = buffer.positions;
    const velocities = buffer.velocities;
    const ranges = buffer.getRanges();
    const useDelta = this.config.useDelta && this.lastPositions !== null;

    if (useDelta) {
      return this.encodeDelta(buffer, positions, ranges);
    }

    return this.encodeFull(positions, velocities, ranges, activeCount);
  }

  private encodeFull(
    positions: Float32Array,
    velocities: Float32Array,
    ranges: readonly { type: ParticleType; offset: number; count: number }[],
    activeCount: number,
  ): ArrayBuffer {
    const count = Math.min(activeCount, this.config.maxParticlesPerPacket);
    const size = HEADER_SIZE + count * FULL_PARTICLE_SIZE;
    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);

    // Write header
    this.writeHeader(view, count, 0);

    // Write particle data
    let writeOffset = HEADER_SIZE;
    let written = 0;

    for (const range of ranges) {
      for (let i = 0; i < range.count && written < count; i++) {
        const pi = range.offset + i;
        const i3 = pi * 3;

        view.setFloat32(writeOffset, positions[i3], false); writeOffset += 4;
        view.setFloat32(writeOffset, positions[i3 + 1], false); writeOffset += 4;
        view.setFloat32(writeOffset, positions[i3 + 2], false); writeOffset += 4;
        view.setFloat32(writeOffset, velocities[i3], false); writeOffset += 4;
        view.setFloat32(writeOffset, velocities[i3 + 1], false); writeOffset += 4;
        view.setFloat32(writeOffset, velocities[i3 + 2], false); writeOffset += 4;
        view.setUint8(writeOffset, range.type); writeOffset += 1;

        written++;
      }
    }

    // Snapshot for next delta
    this.lastPositions = new Float32Array(positions);
    this.sequence = (this.sequence + 1) & 0xFFFF;

    return buf;
  }

  private encodeDelta(
    buffer: UnifiedParticleBuffer,
    positions: Float32Array,
    ranges: readonly { type: ParticleType; offset: number; count: number }[],
  ): ArrayBuffer | null {
    const last = this.lastPositions!;
    const threshold2 = this.config.deltaThreshold * this.config.deltaThreshold;

    // First pass: find changed particles
    const changed: number[] = [];
    for (const range of ranges) {
      for (let i = 0; i < range.count; i++) {
        const pi = range.offset + i;
        const i3 = pi * 3;
        const dx = positions[i3] - last[i3];
        const dy = positions[i3 + 1] - last[i3 + 1];
        const dz = positions[i3 + 2] - last[i3 + 2];
        if (dx * dx + dy * dy + dz * dz > threshold2) {
          changed.push(pi);
        }
      }
    }

    if (changed.length === 0) return null;

    const count = Math.min(changed.length, this.config.maxParticlesPerPacket);
    const size = HEADER_SIZE + count * DELTA_PARTICLE_SIZE;
    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);

    this.writeHeader(view, count, FLAG_DELTA);

    let writeOffset = HEADER_SIZE;
    for (let c = 0; c < count; c++) {
      const pi = changed[c];
      const i3 = pi * 3;

      view.setUint16(writeOffset, pi, false); writeOffset += 2;
      view.setFloat32(writeOffset, positions[i3] - last[i3], false); writeOffset += 4;
      view.setFloat32(writeOffset, positions[i3 + 1] - last[i3 + 1], false); writeOffset += 4;
      view.setFloat32(writeOffset, positions[i3 + 2] - last[i3 + 2], false); writeOffset += 4;
    }

    // Update snapshot
    for (const pi of changed) {
      const i3 = pi * 3;
      last[i3] = positions[i3];
      last[i3 + 1] = positions[i3 + 1];
      last[i3 + 2] = positions[i3 + 2];
    }

    this.sequence = (this.sequence + 1) & 0xFFFF;
    return buf;
  }

  private writeHeader(view: DataView, particleCount: number, flags: number): void {
    view.setUint32(0, MAGIC, false);
    view.setUint16(4, VERSION, false);
    view.setUint16(6, this.sequence, false);
    view.setUint32(8, Date.now() - this.sessionStartMs, false);
    view.setUint16(12, particleCount, false);
    view.setUint8(14, flags);
    view.setUint8(15, 0); // reserved
  }

  getStats(): Pick<SyncStats, 'packetsSent' | 'bytesPerSecond'> {
    const now = Date.now();
    const elapsed = (now - this.lastStatResetMs) / 1000;
    const bps = elapsed > 0 ? this.bytesSent / elapsed : 0;
    return { packetsSent: this.packetsSent, bytesPerSecond: bps };
  }

  resetStats(): void {
    this.packetsSent = 0;
    this.bytesSent = 0;
    this.lastStatResetMs = Date.now();
  }

  dispose(): void {
    this.stopSending();
    this.lastPositions = null;
  }
}

// =============================================================================
// PhysicsSyncReceiver
// =============================================================================

/**
 * Decodes binary physics packets and applies them to a local UnifiedParticleBuffer.
 * Provides a jitter buffer for smooth interpolation.
 */
export class PhysicsSyncReceiver {
  private config: PhysicsSyncConfig;
  private jitterBuffer: BufferedFrame[] = [];
  private lastSequence = -1;
  private packetsReceived = 0;
  private droppedPackets = 0;
  private latencySum = 0;
  private sessionStartMs = Date.now();

  constructor(config?: Partial<PhysicsSyncConfig>) {
    this.config = {
      sendRate: 60,
      deltaThreshold: 0.001,
      maxParticlesPerPacket: 1000,
      useDelta: true,
      jitterBufferSize: 3,
      interpolation: 'linear',
      ...config,
    };
  }

  /**
   * Feed a raw packet from a DataChannel message event.
   * Decodes the header and body, pushes to jitter buffer.
   */
  receivePacket(data: ArrayBuffer, buffer: UnifiedParticleBuffer): void {
    const view = new DataView(data);

    // Validate header
    const magic = view.getUint32(0, false);
    if (magic !== MAGIC) return; // silently drop malformed packets

    const version = view.getUint16(4, false);
    if (version !== VERSION) return;

    const header: SyncPacketHeader = {
      magic,
      version,
      sequence: view.getUint16(6, false),
      timestamp: view.getUint32(8, false),
      particleCount: view.getUint16(12, false),
      flags: view.getUint8(14),
    };

    // Check for dropped packets
    if (this.lastSequence >= 0) {
      const expected = (this.lastSequence + 1) & 0xFFFF;
      if (header.sequence !== expected) {
        const gap = (header.sequence - this.lastSequence + 0x10000) & 0xFFFF;
        this.droppedPackets += gap - 1;
      }
    }
    this.lastSequence = header.sequence;
    this.packetsReceived++;

    // Measure latency (approximate — assumes clocks are roughly synced)
    const localTimestamp = Date.now() - this.sessionStartMs;
    this.latencySum += Math.abs(localTimestamp - header.timestamp);

    const isDelta = (header.flags & FLAG_DELTA) !== 0;

    if (isDelta) {
      this.applyDelta(view, header, buffer);
    } else {
      this.applyFull(view, header, buffer);
    }
  }

  private applyFull(
    view: DataView,
    header: SyncPacketHeader,
    buffer: UnifiedParticleBuffer,
  ): void {
    let offset = HEADER_SIZE;
    const positions = buffer.positions;
    const velocities = buffer.velocities;

    // For full packets, we need to know which ranges to write into.
    // Use global indices sequentially.
    for (let i = 0; i < header.particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = view.getFloat32(offset, false); offset += 4;
      positions[i3 + 1] = view.getFloat32(offset, false); offset += 4;
      positions[i3 + 2] = view.getFloat32(offset, false); offset += 4;
      velocities[i3] = view.getFloat32(offset, false); offset += 4;
      velocities[i3 + 1] = view.getFloat32(offset, false); offset += 4;
      velocities[i3 + 2] = view.getFloat32(offset, false); offset += 4;
      offset += 1; // skip type byte (already set via range registration)
    }

    // Push to jitter buffer for interpolation
    if (this.config.interpolation !== 'none') {
      this.pushToJitterBuffer({
        sequence: header.sequence,
        timestamp: header.timestamp,
        positions: new Float32Array(positions),
        velocities: new Float32Array(velocities),
      });
    }
  }

  private applyDelta(
    view: DataView,
    header: SyncPacketHeader,
    buffer: UnifiedParticleBuffer,
  ): void {
    let offset = HEADER_SIZE;
    const positions = buffer.positions;

    for (let i = 0; i < header.particleCount; i++) {
      const particleIndex = view.getUint16(offset, false); offset += 2;
      const i3 = particleIndex * 3;
      positions[i3] += view.getFloat32(offset, false); offset += 4;
      positions[i3 + 1] += view.getFloat32(offset, false); offset += 4;
      positions[i3 + 2] += view.getFloat32(offset, false); offset += 4;
    }
  }

  private pushToJitterBuffer(frame: BufferedFrame): void {
    this.jitterBuffer.push(frame);

    // Keep buffer bounded
    while (this.jitterBuffer.length > this.config.jitterBufferSize + 2) {
      this.jitterBuffer.shift();
    }
  }

  /**
   * Interpolate between buffered frames for smooth rendering.
   * Call this at render time with the current render timestamp.
   *
   * @param renderTimestamp - ms since session start at render time
   * @param buffer - target buffer to write interpolated state into
   */
  interpolate(renderTimestamp: number, buffer: UnifiedParticleBuffer): void {
    if (this.config.interpolation === 'none' || this.jitterBuffer.length < 2) return;

    // Find the two frames that bracket our render time, offset by jitter buffer delay
    const delay = (this.config.jitterBufferSize / this.config.sendRate) * 1000;
    const targetTime = renderTimestamp - delay;

    let frameA: BufferedFrame | null = null;
    let frameB: BufferedFrame | null = null;

    for (let i = 0; i < this.jitterBuffer.length - 1; i++) {
      if (this.jitterBuffer[i].timestamp <= targetTime &&
          this.jitterBuffer[i + 1].timestamp > targetTime) {
        frameA = this.jitterBuffer[i];
        frameB = this.jitterBuffer[i + 1];
        break;
      }
    }

    if (!frameA || !frameB) return;

    const t = (targetTime - frameA.timestamp) / (frameB.timestamp - frameA.timestamp);
    const clampedT = Math.max(0, Math.min(1, t));

    // Linear interpolation
    const posA = frameA.positions;
    const posB = frameB.positions;
    const dest = buffer.positions;
    const len = Math.min(posA.length, posB.length, dest.length);

    for (let i = 0; i < len; i++) {
      dest[i] = posA[i] + (posB[i] - posA[i]) * clampedT;
    }
  }

  getStats(): SyncStats {
    const avgLatency = this.packetsReceived > 0 ? this.latencySum / this.packetsReceived : 0;
    return {
      packetsSent: 0,
      packetsReceived: this.packetsReceived,
      bytesPerSecond: 0,
      averageLatencyMs: avgLatency,
      deltaRatio: 0,
      droppedPackets: this.droppedPackets,
    };
  }

  dispose(): void {
    this.jitterBuffer.length = 0;
  }
}

// =============================================================================
// Convenience: parse header without full decode
// =============================================================================

/**
 * Parse just the header of a physics sync packet.
 * Useful for routing or filtering before full decode.
 */
export function parsePacketHeader(data: ArrayBuffer): SyncPacketHeader | null {
  if (data.byteLength < HEADER_SIZE) return null;

  const view = new DataView(data);
  const magic = view.getUint32(0, false);
  if (magic !== MAGIC) return null;

  return {
    magic,
    version: view.getUint16(4, false),
    sequence: view.getUint16(6, false),
    timestamp: view.getUint32(8, false),
    particleCount: view.getUint16(12, false),
    flags: view.getUint8(14),
  };
}
