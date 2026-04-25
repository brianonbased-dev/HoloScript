/**
 * HoloMap replay verification + trust-tier classification.
 *
 * Sprint-3 Foundations Phase 2 (board task task_1776664517766_qg8y slice):
 * given a finalized {@link ReconstructionManifest} and a fresh re-run's
 * replay fingerprint, verify byte-identical replay AND classify the
 * manifest into one of four trust tiers based on what provenance proofs
 * are attached.
 *
 * The trust tiers mirror the program-wide anchor pattern (S.ANC):
 * - `untrusted`: no anchor at all (manifest stripped of provenance fields)
 * - `self-attested`: only the runtime's own `self-attested:<replayHash>`
 *   marker present; cryptographically meaningful only inside the same
 *   trust boundary as the runtime that produced it
 * - `ots-anchored`: an OpenTimestamps `.ots` proof exists; provides
 *   independently-verifiable timestamp evidence (Bitcoin-rooted once
 *   the calendar attestation upgrades from pending to confirmed)
 * - `fully-anchored`: BOTH OTS proof AND Base L2 calldata transaction
 *   exist; matches the dual-anchor pattern documented in
 *   `research/paper-audit-matrix.md` for the 16-paper program
 *
 * The verification function is intentionally narrow: it does NOT fetch
 * external resources (no OTS calendar polling, no Base RPC lookup). It
 * compares the manifest's stored `replayHash` against a freshly-computed
 * hash and reports MATCH / MISMATCH plus the trust tier the manifest
 * itself claims. External-resource verification is a separate concern
 * tracked under the Studio replay-verified-badge work (board task
 * `task_1776664517766_qo1i`).
 *
 * @see {@link ReconstructionManifest} for the manifest shape
 * @see {@link mergeAnchoredProvenance} for populating anchor fields
 */

import type { ReconstructionManifest } from './HoloMapRuntime';

/**
 * Trust tiers for a finalized {@link ReconstructionManifest}.
 *
 * Tier ordering (low to high trust):
 * `untrusted` < `self-attested` < `ots-anchored` < `fully-anchored`
 *
 * Higher tiers strictly subsume the proofs of lower tiers (a
 * `fully-anchored` manifest also has an OTS proof, etc).
 */
export type HoloMapTrustTier =
  | 'untrusted'
  | 'self-attested'
  | 'ots-anchored'
  | 'fully-anchored';

/**
 * Result of a replay-verification call.
 *
 * `match` is the byte-identical replay check (manifest's stored
 * `replayHash` vs the freshly-computed `actualReplayHash`). `trustTier`
 * is the highest tier the manifest's stored provenance proofs support.
 *
 * `notes` collects observations that are useful for telemetry/UI but not
 * dispositive for the match/tier outcomes (e.g. "anchor present but uses
 * the self-attested marker, not an external hash"). Always non-null;
 * empty array means clean check.
 */
export interface ReplayVerificationResult {
  /** True iff the manifest's `replayHash` matches `actualReplayHash`. */
  match: boolean;
  /** The replay hash recorded in the manifest. */
  expectedReplayHash: string;
  /** The replay hash freshly computed from the re-run. */
  actualReplayHash: string;
  /** Trust-tier classification of the manifest's provenance proofs. */
  trustTier: HoloMapTrustTier;
  /** Observation notes for telemetry/UI; non-dispositive. */
  notes: readonly string[];
}

/**
 * Classify a manifest into a trust tier based purely on which provenance
 * fields are populated. Does NOT fetch external resources or validate
 * the proofs themselves; "OTS proof set" only means "the proof URL/path
 * field has a non-empty string", not "the proof verified successfully
 * against a Bitcoin calendar".
 *
 * Self-attested marker detection: the runtime defaults to
 * `anchorHash: \`self-attested:${replayKey}\`` when no external anchor
 * has been added. If `anchorHash` matches that pattern AND no OTS or
 * Base calldata is present, the tier is `self-attested`. If `anchorHash`
 * is empty/null, the tier is `untrusted`.
 */
export function classifyTrustTier(manifest: ReconstructionManifest): HoloMapTrustTier {
  const { provenance } = manifest;
  const hasOts = isNonEmptyString(provenance.opentimestampsProof);
  const hasBase = isNonEmptyString(provenance.baseCalldataTx);
  const hasAnchorHash = isNonEmptyString(provenance.anchorHash);

  if (hasOts && hasBase) return 'fully-anchored';
  if (hasOts) return 'ots-anchored';
  // Bug-fix 2026-04-25: Base-calldata-only (no OTS, no anchorHash) was
  // previously classified `untrusted`, which loses the Base anchor's
  // evidentiary value. Per S.ANC dual-anchor pattern, a Base tx alone is
  // weaker than OTS (no Bitcoin-rooted timestamp) but stronger than a
  // bare runtime self-attestation marker — so it qualifies as
  // `self-attested` tier alongside any non-empty anchorHash. OTS
  // remains the gate for `ots-anchored`+ tiers.
  if (hasAnchorHash || hasBase) return 'self-attested';
  return 'untrusted';
}

/**
 * Verify byte-identical replay by comparing the manifest's recorded
 * `replayHash` against a freshly-computed hash from a re-run.
 *
 * The caller is responsible for producing `actualReplayHash` by re-running
 * the reconstruction (init + step + finalize, OR init + .replayHash())
 * with the same {@link HoloMapConfig} that produced the manifest. This
 * function is purely the comparison + classification step.
 *
 * Match policy: case-sensitive exact-string equality on the two hash
 * values. Both are expected to be lowercase hex strings per the
 * `computeHoloMapReplayFingerprint` contract; the function tolerates
 * whitespace by trimming both sides before comparison but does NOT
 * normalise case (a hex case mismatch indicates a different hash
 * function or canonicalization step, which IS a real divergence).
 *
 * Notes added:
 * - `"untrusted-manifest-no-anchor-fields"` if tier is `untrusted`
 * - `"self-attested-marker-only-no-external-proof"` if tier is `self-attested`
 *   AND `anchorHash` starts with `self-attested:`
 * - `"hash-mismatch"` if `match` is false (also indicates `match=false`
 *   in the result; this note exists so a single string can be surfaced
 *   in UI without re-checking the boolean)
 */
export function verifyReplay(
  manifest: ReconstructionManifest,
  actualReplayHash: string
): ReplayVerificationResult {
  const expectedReplayHash = manifest.replayHash;
  const expectedTrim = expectedReplayHash.trim();
  const actualTrim = actualReplayHash.trim();
  const match = expectedTrim === actualTrim;
  const trustTier = classifyTrustTier(manifest);

  const notes: string[] = [];
  if (!match) notes.push('hash-mismatch');
  if (trustTier === 'untrusted') notes.push('untrusted-manifest-no-anchor-fields');
  if (trustTier === 'self-attested') {
    const anchorHash = manifest.provenance.anchorHash ?? '';
    if (anchorHash.startsWith('self-attested:')) {
      notes.push('self-attested-marker-only-no-external-proof');
    }
  }

  return {
    match,
    expectedReplayHash,
    actualReplayHash,
    trustTier,
    notes,
  };
}

/**
 * Comparator for sorting/filtering by trust tier. Higher tiers compare
 * greater. Useful when surfacing a list of manifests in Studio sorted by
 * trust level (highest first).
 */
export function trustTierRank(tier: HoloMapTrustTier): number {
  switch (tier) {
    case 'untrusted':
      return 0;
    case 'self-attested':
      return 1;
    case 'ots-anchored':
      return 2;
    case 'fully-anchored':
      return 3;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
