/**
 * Deterministic replay fingerprint for HoloMap under SimulationContract-style identity.
 * Same inputs + same HoloMap build → same fingerprint (see contract tests).
 */

export function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  const primary = hash.toString(16).padStart(8, '0');

  let hash2 = 0x811c9dc5;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    hash2 ^= input.charCodeAt(i);
    hash2 = (hash2 * 0x01000193) >>> 0;
  }
  const secondary = hash2.toString(16).padStart(8, '0');
  return `${primary}${secondary}`;
}

export function computeHoloMapReplayFingerprint(parts: {
  modelHash: string;
  seed: number;
  weightStrategy: string;
  videoHash?: string;
  /** Optional content-addressed weights id (IPFS CID, OCI digest, …). Omitted → same fingerprint as pre-CID builds. */
  weightCid?: string;
}): string {
  const video = parts.videoHash ?? 'no-video';
  const base = `${parts.modelHash}|${parts.seed}|${parts.weightStrategy}|${video}`;
  const payload = parts.weightCid ? `${base}|cid:${parts.weightCid}` : base;
  return fnv1a32Hex(payload);
}
