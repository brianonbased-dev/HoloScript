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

export interface HoloMapAnchorRequest {
  /** SHA-256 digest of the canonical manifest payload being anchored. */
  manifestDigest: string;
  /** Runtime replay hash recorded in the manifest. */
  replayHash: string;
  /** SimulationContract replay fingerprint recorded in the manifest. */
  replayFingerprint: string;
  /** Capture timestamp from the canonical manifest payload. */
  capturedAtIso: string;
  /** Manifest payload with external anchor fields stripped before hashing. */
  manifest: ReconstructionManifest;
}

export interface HoloMapProvenanceAnchorProvider {
  anchorManifest(
    request: HoloMapAnchorRequest
  ): Promise<HoloMapAnchorUrls | null | undefined> | HoloMapAnchorUrls | null | undefined;
}

/** Merge anchor URLs into a finalized manifest (Studio / paper figures). */
export function mergeAnchoredProvenance(
  manifest: ReconstructionManifest,
  urls: HoloMapAnchorUrls
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

/** Remove mutable external anchor fields before computing the manifest digest. */
export function stripAnchoredProvenance(manifest: ReconstructionManifest): ReconstructionManifest {
  return {
    ...manifest,
    provenance: {
      capturedAtIso: manifest.provenance.capturedAtIso,
    },
  };
}

/** Add the runtime's explicit local-attestation marker. */
export function selfAttestReconstructionManifest(
  manifest: ReconstructionManifest
): ReconstructionManifest {
  const stripped = stripAnchoredProvenance(manifest);
  return {
    ...stripped,
    provenance: {
      ...stripped.provenance,
      anchorHash: `self-attested:${stripped.replayHash}`,
    },
  };
}

export async function computeReconstructionManifestDigest(
  manifest: ReconstructionManifest
): Promise<string> {
  const canonical = stableStringify(stripAnchoredProvenance(manifest));
  return `sha256:${await sha256Hex(canonical)}`;
}

export async function anchorReconstructionManifest(
  manifest: ReconstructionManifest,
  provider?: HoloMapProvenanceAnchorProvider
): Promise<ReconstructionManifest> {
  const stripped = stripAnchoredProvenance(manifest);
  if (!provider) return selfAttestReconstructionManifest(stripped);

  const manifestDigest = await computeReconstructionManifestDigest(stripped);
  const urls = await provider.anchorManifest({
    manifestDigest,
    replayHash: stripped.replayHash,
    replayFingerprint: stripped.simulationContract.replayFingerprint,
    capturedAtIso: stripped.provenance.capturedAtIso,
    manifest: stripped,
  });

  if (!urls) return selfAttestReconstructionManifest(stripped);
  return mergeAnchoredProvenance(stripped, urls);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}
