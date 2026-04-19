/**
 * Helpers for provenance-anchored reconstruction manifests (OTS + Base L2).
 * Populates `ReconstructionManifest.provenance` without implying anchors are valid until URLs resolve.
 */

import type { ReconstructionManifest } from './HoloMapRuntime';

export interface HoloMapAnchorUrls {
  /** Replay or manifest digest anchor (hex or multihash string). */
  anchorHash: string;
  /** OpenTimestamps proof URL or `.ots` file URL. */
  opentimestampsProof: string;
  /** Base L2 (or other L2) transaction URL with calldata reference. */
  baseCalldataTx: string;
}

/** Merge anchor URLs into a finalized manifest (Studio / paper figures). */
export function mergeAnchoredProvenance(
  manifest: ReconstructionManifest,
  urls: HoloMapAnchorUrls,
): ReconstructionManifest {
  return {
    ...manifest,
    provenance: {
      ...manifest.provenance,
      anchorHash: urls.anchorHash,
      opentimestampsProof: urls.opentimestampsProof,
      baseCalldataTx: urls.baseCalldataTx,
      capturedAtIso: manifest.provenance.capturedAtIso,
    },
  };
}
