import type { Vector3 } from '@holoscript/core';
/**
 * RopeSystem.ts
 *
 * Verlet rope/chain: segment links, tension, pin/attach points,
 * gravity, damping, and length constraints.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RopeNode {
  position: Vector3;
  previous: Vector3;
  mass: number;
  pinned: boolean;
}

export interface RopeConfig {
  segmentCount: number;
  segmentLength: number;
  gravity: Vector3;
  damping: number;
  iterations: number;
  elasticity: number; // 0-1 stiffness
}

export interface RopeAttachment {
  nodeIndex: number;
  entityId: string;
  offset: Vector3;
}

// =============================================================================
// ROPE SYSTEM
// =============================================================================

export class RopeSystem {
    private toArr3(v: Vector3 | { x: number; y: number; z: number }): Vector3 {
      if (Array.isArray(v)) return [v[0], v[1], v[2]] as Vector3;
      return [v.x, v.y, v.z] as Vector3;
    }

  private ropes: Map<
    string,
    { nodes: RopeNode[]; config: RopeConfig; attachments: RopeAttachment[] }
  > = new Map();

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  createRope(
    id: string,
    start: Vector3 | { x: number; y: number; z: number },
    end: Vector3 | { x: number; y: number; z: number },
    config?: Partial<RopeConfig>
  ): void {
    const startV = this.toArr3(start);
    const endV = this.toArr3(end);
    const segCount = config?.segmentCount ?? 10;
    const dx = endV[0] - startV[0],
      dy = endV[1] - startV[1],
      dz = endV[2] - startV[2];
    const totalLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const autoSegmentLength = totalLength / segCount;

    const cfg: RopeConfig = {
      segmentCount: segCount,
      segmentLength: autoSegmentLength,
      gravity: [0, -9.81, 0],
      damping: 0.98,
      iterations: 8,
      elasticity: 1,
      ...config,
    };
    cfg.gravity = this.toArr3(cfg.gravity as Vector3 | { x: number; y: number; z: number });

    const nodes: RopeNode[] = [];
    for (let i = 0; i <= cfg.segmentCount; i++) {
      const t = i / cfg.segmentCount;
      const px = startV[0] + (endV[0] - startV[0]) * t;
      const py = startV[1] + (endV[1] - startV[1]) * t;
      const pz = startV[2] + (endV[2] - startV[2]) * t;
      nodes.push({
        position: [px, py, pz],
        previous: [px, py, pz],
        mass: 1,
        pinned: false,
      });
    }

    this.ropes.set(id, { nodes, config: cfg, attachments: [] });
  }

  // ---------------------------------------------------------------------------
  // Pin / Attach
  // ---------------------------------------------------------------------------

  pinNode(ropeId: string, nodeIndex: number): void {
    const rope = this.ropes.get(ropeId);
    if (rope?.nodes[nodeIndex]) rope.nodes[nodeIndex].pinned = true;
  }

  unpinNode(ropeId: string, nodeIndex: number): void {
    const rope = this.ropes.get(ropeId);
    if (rope?.nodes[nodeIndex]) rope.nodes[nodeIndex].pinned = false;
  }

  attach(ropeId: string, attachment: RopeAttachment): void {
    const rope = this.ropes.get(ropeId);
    if (rope) rope.attachments.push(attachment);
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const dt2 = dt * dt;

    for (const rope of this.ropes.values()) {
      const { nodes, config } = rope;

      // Verlet integration
      for (const n of nodes) {
        if (n.pinned) continue;

        const vx = (n.position[0] - n.previous[0]) * config.damping;
        const vy = (n.position[1] - n.previous[1]) * config.damping;
        const vz = (n.position[2] - n.previous[2]) * config.damping;

        n.previous = [n.position[0], n.position[1], n.position[2]];
        n.position[0] += vx + config.gravity[0] * dt2;
        n.position[1] += vy + config.gravity[1] * dt2;
        n.position[2] += vz + config.gravity[2] * dt2;
      }

      // Constraint solving
      for (let iter = 0; iter < config.iterations; iter++) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i],
            b = nodes[i + 1];
          const dx = b.position[0] - a.position[0];
          const dy = b.position[1] - a.position[1];
          const dz = b.position[2] - a.position[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
          const diff = ((config.segmentLength - dist) / dist) * config.elasticity * 0.5;

          const ox = dx * diff,
            oy = dy * diff,
            oz = dz * diff;
          if (!a.pinned) {
            a.position[0] -= ox;
            a.position[1] -= oy;
            a.position[2] -= oz;
          }
          if (!b.pinned) {
            b.position[0] += ox;
            b.position[1] += oy;
            b.position[2] += oz;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getRopeNodes(ropeId: string): RopeNode[] {
    return this.ropes.get(ropeId)?.nodes ?? [];
  }
  getRopeLength(ropeId: string): number {
    const nodes = this.ropes.get(ropeId)?.nodes;
    if (!nodes || nodes.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1].position,
        b = nodes[i].position;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        dz = b[2] - a[2];
      len += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return len;
  }
  getTension(ropeId: string, nodeIndex: number): number {
    const rope = this.ropes.get(ropeId);
    if (!rope || nodeIndex < 0 || nodeIndex >= rope.nodes.length - 1) return 0;
    const a = rope.nodes[nodeIndex].position,
      b = rope.nodes[nodeIndex + 1].position;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.abs(dist - rope.config.segmentLength) / rope.config.segmentLength;
  }
  getRopeCount(): number {
    return this.ropes.size;
  }
  removeRope(id: string): void {
    this.ropes.delete(id);
  }
}
