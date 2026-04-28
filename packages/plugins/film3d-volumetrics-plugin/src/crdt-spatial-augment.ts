/**
 * Merges volumetric CRDT helpers into `@holoscript/crdt-spatial` typings.
 * The package bundled `index.d.ts` can omit string re-exports; runtime `dist/index.js` includes them.
 */
import type { LoroDoc, LoroMap } from 'loro-crdt';

declare module '@holoscript/crdt-spatial' {
  // @ts-ignore -- augmenting an already-exported const from the runtime module
  export const FILM3D_VOLUMETRICS_ROOT: 'film3d_volumetrics';
  export function ensureFilm3dVolumetricsRoot(doc: LoroDoc): LoroMap<Record<string, unknown>>;
  export function registerVolumetricNode(doc: LoroDoc, nodeId: string, meta: { format: string }): void;
  export function setVolumetricChunk(doc: LoroDoc, nodeId: string, chunkIndex: number, data: Uint8Array): void;
  export function setVolumetricVoxelPayload(doc: LoroDoc, nodeId: string, data: Uint8Array): void;
  export function unregisterVolumetricNode(doc: LoroDoc, nodeId: string): void;
}

export {};
