/**
 * UnifiedParticleBuffer — Shared particle buffer coupling for MLS-MPM + PBD.
 *
 * Bridges fluid (MLS-MPM), cloth (PBD), rigid, debris, and crowd particles
 * into a single coordinate space so they can interact via boundary coupling.
 *
 * Architecture (per P.GAPS.09):
 *   - Each subsystem owns its particles and advances them independently
 *   - This buffer provides a unified view for:
 *     (a) Boundary force exchange (fluid ↔ cloth pressure)
 *     (b) Collision detection across particle types
 *     (c) Rendering (single draw call for all particles)
 *     (d) Network sync (one serialization path)
 *
 * GPU path: subsystems share GPUBuffers via sub-allocation offsets.
 * CPU path: Float32Array views into a single ArrayBuffer.
 *
 * @module physics
 * @see docs/specs/pbd-solver-upgrade.md
 */

import { ParticleType, type IParticleAttributes } from './PhysicsTypes';

// =============================================================================
// Types
// =============================================================================

/** Registration handle returned when a subsystem adds particles. */
export interface ParticleRange {
  /** Particle type tag */
  type: ParticleType;
  /** Starting index in the unified buffer */
  offset: number;
  /** Number of particles in this range */
  count: number;
  /** Label for debugging */
  label: string;
}

/** Boundary coupling force between two particle types. */
export interface BoundaryCoupling {
  /** Source particle type exerting force */
  from: ParticleType;
  /** Target particle type receiving force */
  to: ParticleType;
  /** Coupling strength multiplier (default: 1.0) */
  strength: number;
  /** Interaction radius in world units */
  radius: number;
}

/** Stats for monitoring buffer usage. */
export interface UnifiedBufferStats {
  totalCapacity: number;
  totalActive: number;
  rangeCount: number;
  byType: Record<string, number>;
  bufferSizeMB: number;
}

// =============================================================================
// UnifiedParticleBuffer
// =============================================================================

/**
 * CPU-side unified particle buffer.
 *
 * Pre-allocates a fixed-capacity buffer. Subsystems register particle ranges
 * and write positions/velocities into their slice. The buffer provides
 * read access for coupling, rendering, and serialization.
 */
export class UnifiedParticleBuffer {
  /** Max particles across all subsystems */
  readonly capacity: number;

  /** Positions: [x, y, z] per particle, flat array */
  readonly positions: Float32Array;

  /** Velocities: [vx, vy, vz] per particle, flat array */
  readonly velocities: Float32Array;

  /** Particle attributes (type, phase, density, pressure), 4 floats each */
  readonly attributes: Float32Array;

  /** Registered particle ranges */
  private ranges: ParticleRange[] = [];

  /** Boundary coupling rules */
  private couplings: BoundaryCoupling[] = [];

  /** Next free index for allocation */
  private nextFree = 0;

  constructor(capacity: number = 200000) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.attributes = new Float32Array(capacity * 4);
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a particle range for a subsystem.
   * Returns a ParticleRange handle with the allocated offset.
   *
   * @throws if capacity exceeded
   */
  registerParticles(type: ParticleType, count: number, label: string): ParticleRange {
    if (this.nextFree + count > this.capacity) {
      throw new Error(
        `UnifiedParticleBuffer: capacity exceeded. Requested ${count}, ` +
          `available ${this.capacity - this.nextFree} of ${this.capacity}`
      );
    }

    const range: ParticleRange = {
      type,
      offset: this.nextFree,
      count,
      label,
    };

    // Initialize attribute type tags for this range
    for (let i = 0; i < count; i++) {
      const idx = (this.nextFree + i) * 4;
      this.attributes[idx] = type; // type
      this.attributes[idx + 1] = type; // phase (default: same as type)
      this.attributes[idx + 2] = 0; // density
      this.attributes[idx + 3] = 0; // pressure
    }

    this.nextFree += count;
    this.ranges.push(range);
    return range;
  }

  /**
   * Unregister a particle range. Does NOT compact — leaves a hole.
   * Call compact() to reclaim fragmented space.
   */
  unregisterParticles(range: ParticleRange): void {
    const idx = this.ranges.indexOf(range);
    if (idx === -1) return;

    // Zero out the range
    const start3 = range.offset * 3;
    const start4 = range.offset * 4;
    this.positions.fill(0, start3, start3 + range.count * 3);
    this.velocities.fill(0, start3, start3 + range.count * 3);
    this.attributes.fill(0, start4, start4 + range.count * 4);

    this.ranges.splice(idx, 1);
  }

  // ---------------------------------------------------------------------------
  // Boundary Coupling
  // ---------------------------------------------------------------------------

  /**
   * Register a boundary coupling rule between two particle types.
   * During solveBoundaryCoupling(), particles of type `from` exert
   * pressure forces on nearby particles of type `to`.
   */
  addCoupling(coupling: BoundaryCoupling): void {
    this.couplings.push(coupling);
  }

  /**
   * Solve boundary coupling forces between registered particle types.
   *
   * Uses a simple pairwise interaction: for each coupling rule, iterate
   * source particles and apply repulsive forces to nearby target particles.
   *
   * For GPU path, this would be a compute shader with spatial hashing.
   * This CPU implementation is O(N*M) and suitable for < 10K cross-type pairs.
   */
  solveBoundaryCoupling(dt: number): void {
    for (const coupling of this.couplings) {
      const sourceRanges = this.ranges.filter((r) => r.type === coupling.from);
      const targetRanges = this.ranges.filter((r) => r.type === coupling.to);

      for (const src of sourceRanges) {
        for (const tgt of targetRanges) {
          this.applyPairwiseCoupling(src, tgt, coupling, dt);
        }
      }
    }
  }

  private applyPairwiseCoupling(
    src: ParticleRange,
    tgt: ParticleRange,
    coupling: BoundaryCoupling,
    dt: number
  ): void {
    const r2Max = coupling.radius * coupling.radius;
    const pos = this.positions;
    const vel = this.velocities;
    const strength = coupling.strength;

    for (let si = 0; si < src.count; si++) {
      const sIdx3 = (src.offset + si) * 3;
      const sx = pos[sIdx3],
        sy = pos[sIdx3 + 1],
        sz = pos[sIdx3 + 2];

      for (let ti = 0; ti < tgt.count; ti++) {
        const tIdx3 = (tgt.offset + ti) * 3;
        const dx = pos[tIdx3] - sx;
        const dy = pos[tIdx3 + 1] - sy;
        const dz = pos[tIdx3 + 2] - sz;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 >= r2Max || d2 < 1e-10) continue;

        const dist = Math.sqrt(d2);
        const overlap = coupling.radius - dist;
        // Repulsive force proportional to overlap (like a soft penalty)
        const force = ((strength * overlap) / dist) * dt;

        // Push target away from source
        vel[tIdx3] += dx * force;
        vel[tIdx3 + 1] += dy * force;
        vel[tIdx3 + 2] += dz * force;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Data Access
  // ---------------------------------------------------------------------------

  /**
   * Write positions from an external source into a registered range.
   * Used by subsystems to push their updated state after simulation.
   */
  writePositions(range: ParticleRange, data: Float32Array): void {
    const start = range.offset * 3;
    const len = Math.min(data.length, range.count * 3);
    this.positions.set(data.subarray(0, len), start);
  }

  /**
   * Write velocities from an external source into a registered range.
   */
  writeVelocities(range: ParticleRange, data: Float32Array): void {
    const start = range.offset * 3;
    const len = Math.min(data.length, range.count * 3);
    this.velocities.set(data.subarray(0, len), start);
  }

  /**
   * Read positions for a specific range (returns a view, not a copy).
   */
  readPositions(range: ParticleRange): Float32Array {
    const start = range.offset * 3;
    return this.positions.subarray(start, start + range.count * 3);
  }

  /**
   * Read velocities for a specific range.
   */
  readVelocities(range: ParticleRange): Float32Array {
    const start = range.offset * 3;
    return this.velocities.subarray(start, start + range.count * 3);
  }

  /**
   * Get attribute for a single particle.
   */
  getAttributes(particleIndex: number): IParticleAttributes {
    const idx = particleIndex * 4;
    return {
      type: this.attributes[idx] as ParticleType,
      phase: this.attributes[idx + 1],
      density: this.attributes[idx + 2],
      pressure: this.attributes[idx + 3],
    };
  }

  /**
   * Update density/pressure for a range (written by fluid solver).
   */
  writeDensityPressure(range: ParticleRange, density: Float32Array, pressure: Float32Array): void {
    for (let i = 0; i < range.count; i++) {
      const idx = (range.offset + i) * 4;
      this.attributes[idx + 2] = density[i] ?? 0;
      this.attributes[idx + 3] = pressure[i] ?? 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Get all registered ranges. */
  getRanges(): readonly ParticleRange[] {
    return this.ranges;
  }

  /** Get ranges of a specific particle type. */
  getRangesByType(type: ParticleType): ParticleRange[] {
    return this.ranges.filter((r) => r.type === type);
  }

  /** Total active particles across all ranges. */
  getActiveCount(): number {
    return this.ranges.reduce((sum, r) => sum + r.count, 0);
  }

  /** Get buffer usage stats. */
  getStats(): UnifiedBufferStats {
    const byType: Record<string, number> = {};
    for (const r of this.ranges) {
      const key = ParticleType[r.type] ?? String(r.type);
      byType[key] = (byType[key] ?? 0) + r.count;
    }

    const active = this.getActiveCount();
    // positions + velocities + attributes = 3*4 + 3*4 + 4*4 = 40 bytes/particle
    const bufferSizeMB = (this.capacity * 40) / (1024 * 1024);

    return {
      totalCapacity: this.capacity,
      totalActive: active,
      rangeCount: this.ranges.length,
      byType,
      bufferSizeMB,
    };
  }

  // ---------------------------------------------------------------------------
  // Serialization (for network sync)
  // ---------------------------------------------------------------------------

  /**
   * Serialize all active particles into a compact binary buffer.
   * Layout per particle: [x, y, z, vx, vy, vz, type] = 28 bytes
   *
   * Header: [magic(4), version(2), particleCount(4), rangeCount(2)]
   * Then per range: [type(1), offset(4), count(4)]
   * Then particle data: [f32 x, f32 y, f32 z, f32 vx, f32 vy, f32 vz, u8 type] packed
   *
   * Returns an ArrayBuffer suitable for DataChannel.send().
   */
  serialize(): ArrayBuffer {
    const activeCount = this.getActiveCount();
    const headerSize = 12; // magic + version + count + rangeCount
    const rangeHeaderSize = this.ranges.length * 9; // per range: type(1) + offset(4) + count(4)
    const particleDataSize = activeCount * 25; // 6 floats (24) + 1 byte type
    const totalSize = headerSize + rangeHeaderSize + particleDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint32(offset, 0x48505346, false);
    offset += 4; // 'HPSF' magic
    view.setUint16(offset, 1, false);
    offset += 2; // version 1
    view.setUint32(offset, activeCount, false);
    offset += 4;
    view.setUint16(offset, this.ranges.length, false);
    offset += 2;

    // Range headers
    for (const range of this.ranges) {
      view.setUint8(offset, range.type);
      offset += 1;
      view.setUint32(offset, range.offset, false);
      offset += 4;
      view.setUint32(offset, range.count, false);
      offset += 4;
    }

    // Particle data (only active ranges)
    for (const range of this.ranges) {
      for (let i = 0; i < range.count; i++) {
        const pi = range.offset + i;
        const i3 = pi * 3;
        view.setFloat32(offset, this.positions[i3], false);
        offset += 4;
        view.setFloat32(offset, this.positions[i3 + 1], false);
        offset += 4;
        view.setFloat32(offset, this.positions[i3 + 2], false);
        offset += 4;
        view.setFloat32(offset, this.velocities[i3], false);
        offset += 4;
        view.setFloat32(offset, this.velocities[i3 + 1], false);
        offset += 4;
        view.setFloat32(offset, this.velocities[i3 + 2], false);
        offset += 4;
        view.setUint8(offset, range.type);
        offset += 1;
      }
    }

    return buffer;
  }

  /**
   * Deserialize a binary buffer (from a remote peer) into the local buffer.
   * Clears existing ranges and replaces with the remote state.
   */
  deserialize(data: ArrayBuffer): void {
    const view = new DataView(data);
    let offset = 0;

    // Validate header
    const magic = view.getUint32(offset, false);
    offset += 4;
    if (magic !== 0x48505346) {
      throw new Error('Invalid UnifiedParticleBuffer magic: expected HPSF');
    }

    const version = view.getUint16(offset, false);
    offset += 2;
    if (version !== 1) {
      throw new Error(`Unsupported UnifiedParticleBuffer version: ${version}`);
    }

    const particleCount = view.getUint32(offset, false);
    offset += 4;
    const rangeCount = view.getUint16(offset, false);
    offset += 2;

    if (particleCount > this.capacity) {
      throw new Error(
        `Remote particle count ${particleCount} exceeds local capacity ${this.capacity}`
      );
    }

    // Clear current state
    this.ranges.length = 0;
    this.nextFree = 0;

    // Read range headers
    const incomingRanges: ParticleRange[] = [];
    for (let r = 0; r < rangeCount; r++) {
      const type = view.getUint8(offset) as ParticleType;
      offset += 1;
      const rangeOffset = view.getUint32(offset, false);
      offset += 4;
      const count = view.getUint32(offset, false);
      offset += 4;
      incomingRanges.push({
        type,
        offset: rangeOffset,
        count,
        label: `remote-${ParticleType[type]}`,
      });
    }

    // Read particle data
    for (const range of incomingRanges) {
      for (let i = 0; i < range.count; i++) {
        const pi = range.offset + i;
        const i3 = pi * 3;
        const i4 = pi * 4;
        this.positions[i3] = view.getFloat32(offset, false);
        offset += 4;
        this.positions[i3 + 1] = view.getFloat32(offset, false);
        offset += 4;
        this.positions[i3 + 2] = view.getFloat32(offset, false);
        offset += 4;
        this.velocities[i3] = view.getFloat32(offset, false);
        offset += 4;
        this.velocities[i3 + 1] = view.getFloat32(offset, false);
        offset += 4;
        this.velocities[i3 + 2] = view.getFloat32(offset, false);
        offset += 4;
        this.attributes[i4] = view.getUint8(offset);
        offset += 1;
      }
    }

    // Reconstruct ranges
    this.ranges = incomingRanges;
    this.nextFree = incomingRanges.reduce((max, r) => Math.max(max, r.offset + r.count), 0);
  }

  /** Dispose all buffers. */
  dispose(): void {
    this.ranges.length = 0;
    this.couplings.length = 0;
    this.nextFree = 0;
    // Float32Arrays are GC'd — no explicit dispose needed for CPU path
  }
}

