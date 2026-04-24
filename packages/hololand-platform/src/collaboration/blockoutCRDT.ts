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

// NOTE: `@holoscript/crdt-spatial`'s `Vec3` is a `{x, y, z}` object — NOT a
// tuple. Historical code here treated it as `[x, y, z]`, which silently
// stored `undefined` into the LoroMap (pos.x on an array is undefined) and
// produced undefined reads on `getVolume`. The surface-level type equality
// to our own `BlockoutVec3` lets us pass it straight through with no
// conversion now.

export type BlockoutVec3 = Vec3;

export interface BlockoutVolume {
  id: string;
  center: BlockoutVec3;
  halfExtents: BlockoutVec3;
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
    const scale: Vec3 = {
      x: halfExtents.x * 2,
      y: halfExtents.y * 2,
      z: halfExtents.z * 2,
    };
    if (!this.bridge.hasNode(nid)) {
      this.bridge.registerNode(nid, {
        position: center,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale,
      });
      return;
    }
    this.bridge.setPosition(nid, center);
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
      center: { x: p.x, y: p.y, z: p.z },
      halfExtents: { x: s.x / 2, y: s.y / 2, z: s.z / 2 },
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
