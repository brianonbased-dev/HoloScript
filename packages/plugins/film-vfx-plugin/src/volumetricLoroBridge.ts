/**
 * Bridge Film/VFX plugin state into the shared `film3d_volumetrics` Loro map
 * used by `LoroWebRTCProvider` (@holoscript/crdt-spatial) so VP metadata
 * rides the same WebRTC sync frames as voxel payloads.
 *
 * The root key is duplicated here (instead of importing @holoscript/crdt-spatial)
 * to keep this plugin lightweight and avoid pulling optional UI / economy peers.
 */

import type { LoroDoc } from 'loro-crdt';
import type { VirtualProductionConfig } from './traits/VirtualProductionTrait';

const SOURCE = 'FilmVFXPlugin' as const;

/**
 * Must match `FILM3D_VOLUMETRICS_ROOT` in packages/crdt-spatial/src/film3dVolumetricCrdt.ts.
 */
export const FILM3D_VOLUMETRICS_ROOT = 'film3d_volumetrics' as const;

/**
 * Writes virtual-production stage metadata under the volumetrics CRDT root so
 * peers connected via LoroWebRTC receive it in doc export deltas.
 *
 * Binary voxel streams can be merged using the crdt-spatial `setVolumetricVoxelPayload` helper on the same root.
 */
export function syncVirtualProductionToVolumetricCrdt(
  doc: LoroDoc,
  config: VirtualProductionConfig
): void {
  const root = doc.getMap(FILM3D_VOLUMETRICS_ROOT);
  const nodeId = `filmvfx_vp_${config.stageId}`;
  const snapshot = {
    source: SOURCE,
    trait: 'FilmVFXPlugin.virtual_production',
    stageId: config.stageId,
    syncMode: config.syncMode,
    frameRate: config.frameRate,
    wallCount: config.walls.length,
    trackingSystem: config.tracking.system,
    colorSpace: config.colorSpace ?? null,
    updatedAt: Date.now(),
  };
  root.set(`${nodeId}::meta`, JSON.stringify(snapshot));
  doc.commit();
}
