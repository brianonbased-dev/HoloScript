/**
 * Collaborative blockout volumes backed by the spatial CRDT bridge.
 *
 * Each axis-aligned blockout primitive is stored as a scene node
 * (`blockout:<id>`) with position = center and scale = 2 × half-extents,
 * suitable for greybox / layout sync across HoloLand peers.
 *
 * @module @holoscript/hololand-platform/collaboration
 */

import { SpatialCRDTBridge } from '@holoscript/crdt-spatial/bridge';
import type { Vec3 } from '@holoscript/crdt-spatial/bridge';

const NODE_PREFIX = 'blockout:';

export interface BlockoutVec3 {
  x: number;
  y: number;
  z: number;
}

export interface BlockoutVolume {
  id: string;
  center: BlockoutVec3;
  halfExtents: BlockoutVec3;
}

function toTuple(v: BlockoutVec3): Vec3 {
  return [v.x, v.y, v.z];
}

export class BlockoutCRDTSession {
  private readonly bridge: SpatialCRDTBridge;

  constructor(peerId: string) {
    this.bridge = new SpatialCRDTBridge({ peerId });
  }

  private nodeId(volumeId: string): string {
    return `${NODE_PREFIX}${volumeId}`;
  }

  /**
   * Create or update a blockout volume. Uses LWW position/scale on the shared Loro doc.
   */
  upsertVolume(id: string, center: BlockoutVec3, halfExtents: BlockoutVec3): void {
    const nid = this.nodeId(id);
    const scale: Vec3 = [halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2];
    if (!this.bridge.hasNode(nid)) {
      this.bridge.registerNode(nid, {
        position: toTuple(center),
        rotation: [0, 0, 0, 1],
        scale,
      });
      return;
    }
    this.bridge.setPosition(nid, toTuple(center));
    this.bridge.setScale(nid, scale);
  }

  /**
   * Read a volume after local edits or remote `importUpdate`.
   */
  getVolume(id: string): BlockoutVolume | null {
    const nid = this.nodeId(id);
    const p = this.bridge.getPosition(nid);
    const s = this.bridge.getScale(nid);
    if (!p || !s) return null;
    return {
      id,
      center: { x: p[0], y: p[1], z: p[2] },
      halfExtents: { x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 },
    };
  }

  /**
   * All blockout volume ids present in the CRDT document (including after sync).
   */
  listVolumeIds(): string[] {
    try {
      const raw = this.bridge.getDoc().getMap('nodes').toJSON() as Record<string, unknown>;
      return Object.keys(raw)
        .filter((k) => k.startsWith(NODE_PREFIX))
        .map((k) => k.slice(NODE_PREFIX.length))
        .sort();
    } catch {
      return this.bridge
        .getRegisteredNodes()
        .filter((n) => n.startsWith(NODE_PREFIX))
        .map((n) => n.slice(NODE_PREFIX.length))
        .sort();
    }
  }

  exportSnapshot(): Uint8Array {
    return this.bridge.exportSnapshot();
  }

  importUpdate(bytes: Uint8Array): void {
    this.bridge.importUpdate(bytes);
  }

  dispose(): void {
    this.bridge.dispose();
  }
}
