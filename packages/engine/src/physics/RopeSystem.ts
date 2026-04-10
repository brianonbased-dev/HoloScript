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
  position: { x: number; y: number; z: number };
  previous: { x: number; y: number; z: number };
  mass: number;
  pinned: boolean;
}

export interface RopeConfig {
  segmentCount: number;
  segmentLength: number;
  gravity: { x: number; y: number; z: number };
  damping: number;
  iterations: number;
  elasticity: number; // 0-1 stiffness
}

export interface RopeAttachment {
  nodeIndex: number;
  entityId: string;
  offset: { x: number; y: number; z: number };
}

// =============================================================================
// ROPE SYSTEM
// =============================================================================

export class RopeSystem {
  private ropes: Map<
    string,
    { nodes: RopeNode[]; config: RopeConfig; attachments: RopeAttachment[] }
  > = new Map();

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  createRope(
    id: string,
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    config?: Partial<RopeConfig>
  ): void {
    const segCount = config?.segmentCount ?? 10;
    const dx = end.x - start.x,
      dy = end.y - start.y,
      dz = end.z - start.z;
    const totalLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const autoSegmentLength = totalLength / segCount;

    const cfg: RopeConfig = {
      segmentCount: segCount,
      segmentLength: autoSegmentLength,
      gravity: { x: 0, y: -9.81, z: 0 },
      damping: 0.98,
      iterations: 8,
      elasticity: 1,
      ...config,
    };

    const nodes: RopeNode[] = [];
    for (let i = 0; i <= cfg.segmentCount; i++) {
      const t = i / cfg.segmentCount;
      nodes.push({
        position: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
        },
        previous: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
        },
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

        const vx = (n.position.x - n.previous.x) * config.damping;
        const vy = (n.position.y - n.previous.y) * config.damping;
        const vz = (n.position.z - n.previous.z) * config.damping;

        n.previous = { ...n.position };
        n.position.x += vx + config.gravity.x * dt2;
        n.position.y += vy + config.gravity.y * dt2;
        n.position.z += vz + config.gravity.z * dt2;
      }

      // Constraint solving
      for (let iter = 0; iter < config.iterations; iter++) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i],
            b = nodes[i + 1];
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const dz = b.position.z - a.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
          const diff = ((config.segmentLength - dist) / dist) * config.elasticity * 0.5;

          const ox = dx * diff,
            oy = dy * diff,
            oz = dz * diff;
          if (!a.pinned) {
            a.position.x -= ox;
            a.position.y -= oy;
            a.position.z -= oz;
          }
          if (!b.pinned) {
            b.position.x += ox;
            b.position.y += oy;
            b.position.z += oz;
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
      const dx = b.x - a.x,
        dy = b.y - a.y,
        dz = b.z - a.z;
      len += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return len;
  }
  getTension(ropeId: string, nodeIndex: number): number {
    const rope = this.ropes.get(ropeId);
    if (!rope || nodeIndex < 0 || nodeIndex >= rope.nodes.length - 1) return 0;
    const a = rope.nodes[nodeIndex].position,
      b = rope.nodes[nodeIndex + 1].position;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
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
