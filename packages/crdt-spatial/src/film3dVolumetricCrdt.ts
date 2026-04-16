/**
 * Central CRDT root for film3d volumetric (VDB / voxel) payloads.
 * Lives on the same {@link LoroDoc} as {@link LoroWebRTCProvider} so `export({ mode: 'update' })` includes volume bytes.
 */

import type { LoroDoc } from 'loro-crdt';

/** Root map key — keep in sync with plugin consumers. */
export const FILM3D_VOLUMETRICS_ROOT = 'film3d_volumetrics' as const;

export function ensureFilm3dVolumetricsRoot(doc: LoroDoc) {
  return doc.getMap(FILM3D_VOLUMETRICS_ROOT);
}

export function registerVolumetricNode(doc: LoroDoc, nodeId: string, meta: { format: string }): void {
  const root = ensureFilm3dVolumetricsRoot(doc);
  root.set(`${nodeId}::meta`, JSON.stringify({ trait: 'volumetric', ...meta, updatedAt: Date.now() }));
  doc.commit();
}

/** Lossless binary voxel / VDB chunk (full replace per sync tick). */
export function setVolumetricVoxelPayload(doc: LoroDoc, nodeId: string, data: Uint8Array): void {
  const root = ensureFilm3dVolumetricsRoot(doc);
  root.set(`${nodeId}::voxels`, data);
  doc.commit();
}

/** Ordered chunking for payloads larger than a single CRDT op (caller merges in order). */
export function setVolumetricChunk(doc: LoroDoc, nodeId: string, chunkIndex: number, data: Uint8Array): void {
  const root = ensureFilm3dVolumetricsRoot(doc);
  root.set(`${nodeId}::chunk::${chunkIndex}`, data);
  doc.commit();
}

export function unregisterVolumetricNode(doc: LoroDoc, nodeId: string): void {
  const root = ensureFilm3dVolumetricsRoot(doc);
  const snapshot = root.toJSON() as Record<string, unknown>;
  for (const key of Object.keys(snapshot)) {
    if (key.startsWith(`${nodeId}::`)) {
      root.delete(key);
    }
  }
  doc.commit();
}
