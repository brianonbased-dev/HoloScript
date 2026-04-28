/**
 * Lotus Flower — Petal evidence provider (v1 fixture-backed)
 *
 * Loads `PetalEvidence` for a given paper ID. v1 uses a static JSON
 * fixture snapshotted at scoping-memo time; v2 (separate task) will
 * live-read from ai-ecosystem `paper-audit-matrix.md` at runtime via
 * a configured filesystem path.
 *
 * Two-step abstraction (provider → derivation) keeps the algebraic-trust
 * hook pure: `derivePetalBloomState` consumes evidence shape, never
 * cares about source. This means the v2 live-read upgrade only changes
 * THIS file; tests and gate logic stay unchanged.
 *
 * @see ./derive-bloom-state.ts — pure derivation function
 * @see ./__fixtures__/petal-evidence-snapshot.json — v1 fixture
 */

import type { PetalEvidence } from './derive-bloom-state';
import snapshot from './__fixtures__/petal-evidence-snapshot.json';

interface SnapshotShape {
  _metadata: {
    snapshot_at: string;
    source: string;
    purpose: string;
    petal_ids_match: string;
  };
  petals: Record<string, PetalEvidence & { _note?: string }>;
}

const SNAPSHOT = snapshot as SnapshotShape;

/**
 * Load evidence for a single petal. Returns null when the paper ID is
 * not in the snapshot — caller should treat null as "unknown petal" and
 * surface that distinctly from "petal exists but no evidence yet"
 * (which is hasDraft: false in the snapshot itself).
 */
export function loadPetalEvidence(paperId: string): PetalEvidence | null {
  const entry = SNAPSHOT.petals[paperId];
  if (!entry) return null;
  // Strip the _note field to keep the shape clean for derivation.
  const { _note: _ignored, ...evidence } = entry;
  return evidence;
}

/**
 * Load evidence for ALL petals known to the snapshot, returned as a Map
 * keyed by paper ID. This is what `tend_garden` uses to compute the
 * full Lotus Genesis readiness verdict.
 */
export function loadAllPetalEvidence(): Map<string, PetalEvidence> {
  const result = new Map<string, PetalEvidence>();
  for (const [paperId, entry] of Object.entries(SNAPSHOT.petals)) {
    const { _note: _ignored, ...evidence } = entry;
    result.set(paperId, evidence);
  }
  return result;
}

/**
 * The full set of paper IDs the snapshot knows about. Used by validators
 * to confirm requested paper_id arguments correspond to a real petal.
 */
export function getKnownPaperIds(): Set<string> {
  return new Set(Object.keys(SNAPSHOT.petals));
}

/**
 * Snapshot freshness metadata. Surfaced by `read_garden_state` so the
 * caller knows when the evidence source was last verified — staleness
 * is itself signal (per F.030 paper-audit-matrix-always-stale).
 */
export function getSnapshotMetadata(): { snapshot_at: string; source: string } {
  return {
    snapshot_at: SNAPSHOT._metadata.snapshot_at,
    source: SNAPSHOT._metadata.source,
  };
}
