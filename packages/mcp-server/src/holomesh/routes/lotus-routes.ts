/**
 * Lotus Route — Server-gated disclosure for the Lotus Flower visualization.
 *
 * GET /api/lotus
 *   Authorization: Bearer <HOLOMESH_API_KEY> (team-tier) → Mode-A JSON
 *   No auth / invalid key                               → Mode-B JSON
 *
 * Mode-A (full disclosure): petal data includes paper_id, venue, measured
 *   vs claimed fields, bloom reason, and anchor status — everything a team
 *   member needs to track paper progress.
 *
 * Mode-B (anonymous bloom): same petal count and bloom state colors, but
 *   no paper identifiers, no venue, no measured-vs-claimed, no reason text.
 *   An attacker who tampers with the client cannot reveal private fields
 *   because the bytes were never sent (W.GOLD.001: architecture beats alignment).
 *
 * The VitePress Lotus.vue component renders identically in both modes —
 * the server determines disclosure, not the client.
 *
 * @see docs/strategy/lotus-architecture.md — the lotus framing
 * @see packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts — pure derivation
 * @see packages/studio/src/lib/brittney/lotus/evidence-provider.ts — fixture-backed evidence
 */

import * as http from 'http';
import { json } from '../utils';
import { resolveRequestingAgent } from '../auth-utils';

// ── Bloom state type (mirrors derive-bloom-state.ts) ────────────────────────

type BloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';

// ── Petal evidence (mirrors PetalEvidence from derive-bloom-state.ts) ────────

interface PetalEvidence {
  paperId: string;
  venue?: string;
  hasDraft: boolean;
  stubCount: number;
  benchmarkTodoCount: number;
  otsAnchored: boolean;
  baseAnchored: boolean;
  anchorMismatch: boolean;
  retracted?: boolean;
}

// ── Derivation (pure function, same logic as studio) ─────────────────────────

interface BloomDerivation {
  state: BloomState;
  reason: string;
  blockedBy?: Array<keyof PetalEvidence>;
}

function derivePetalBloomState(evidence: PetalEvidence): BloomDerivation {
  if (evidence.retracted) {
    return { state: 'wilted', reason: 'Paper retracted or moved off-program.', blockedBy: ['retracted'] };
  }
  if (evidence.anchorMismatch && !evidence.otsAnchored && !evidence.baseAnchored) {
    return { state: 'wilted', reason: 'Anchor mismatch with no surviving anchors.', blockedBy: ['anchorMismatch', 'otsAnchored', 'baseAnchored'] };
  }
  if (!evidence.hasDraft) {
    return { state: 'sealed', reason: 'No draft content yet.', blockedBy: ['hasDraft'] };
  }
  if (evidence.stubCount > 0) {
    return { state: 'budding', reason: `Draft present with ${evidence.stubCount} stub(s).`, blockedBy: ['stubCount'] };
  }
  if (evidence.benchmarkTodoCount > 0) {
    return { state: 'blooming', reason: `${evidence.benchmarkTodoCount} benchmark(s) pending.`, blockedBy: ['benchmarkTodoCount'] };
  }
  if (!evidence.otsAnchored || !evidence.baseAnchored) {
    const missing: Array<keyof PetalEvidence> = [];
    if (!evidence.otsAnchored) missing.push('otsAnchored');
    if (!evidence.baseAnchored) missing.push('baseAnchored');
    return { state: 'blooming', reason: `Awaiting ${missing.map(m => m === 'otsAnchored' ? 'OTS' : 'Base').join(' + ')} anchor.`, blockedBy: missing };
  }
  return { state: 'full', reason: 'Content complete and dual-anchored.' };
}

// ── Petal data fixture ───────────────────────────────────────────────────────
// Replaces the separate evidence-provider import; the MCP server runs
// standalone (no studio dependency). The fixture data is synced from
// packages/studio/src/lib/brittney/lotus/__fixtures__/petal-evidence-snapshot.json.

const PETAL_EVIDENCE: Record<string, PetalEvidence & { _note?: string }> = {
  'trust-by-construction': {
    paperId: 'trust-by-construction',
    venue: 'IEEE TVCG 2026',
    hasDraft: true,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'cael': {
    paperId: 'cael',
    venue: 'AAMAS 2026',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 1,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'trust-by-replay': {
    paperId: 'trust-by-replay',
    venue: 'USENIX Security 2026',
    hasDraft: true,
    stubCount: 3,
    benchmarkTodoCount: 2,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'snn': {
    paperId: 'snn',
    venue: 'NeurIPS 2026',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 0,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'crdt': {
    paperId: 'crdt',
    venue: 'ECOOP 2027',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 1,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'sandboxed-sim': {
    paperId: 'sandboxed-sim',
    venue: 'USENIX Security 2026',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 1,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'graphrag': {
    paperId: 'graphrag',
    venue: 'ICSE 2027',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 2,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'capstone-notation-cognition': {
    paperId: 'capstone-notation-cognition',
    venue: 'UIST 2027',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 0,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  'p2-0-contracted-animation': {
    paperId: 'p2-0-contracted-animation',
    venue: 'SCA 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p2-1-ik': {
    paperId: 'p2-1-ik',
    venue: 'SIGGRAPH 2027 short / I3D 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p2-2-unified-sim-anim': {
    paperId: 'p2-2-unified-sim-anim',
    venue: 'SIGGRAPH 2027',
    hasDraft: true,
    stubCount: 4,
    benchmarkTodoCount: 3,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p2-3-verifiable-motion': {
    paperId: 'p2-3-verifiable-motion',
    venue: 'SIGGRAPH Asia 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p3-s1-hs-core-ir': {
    paperId: 'p3-s1-hs-core-ir',
    venue: 'PLDI 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p3-s2-hsplus-traits': {
    paperId: 'p3-s2-hsplus-traits',
    venue: 'ECOOP 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p3-s3-holo-composition': {
    paperId: 'p3-s3-holo-composition',
    venue: 'I3D 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  'p3-center': {
    paperId: 'p3-center',
    venue: 'SIGGRAPH 2028',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
};

// ── Snapshot metadata ────────────────────────────────────────────────────────

const SNAPSHOT_METADATA = {
  snapshot_at: '2026-04-27',
  source: 'Synthesized from research/2026-04-27_brittney-paper-scoping.md + paper-audit-matrix.md (Round 7 anchors)',
  petal_count: Object.keys(PETAL_EVIDENCE).length,
};

// ── Response shaping ─────────────────────────────────────────────────────────

/** Mode-A petal: full disclosure (team-tier auth). */
interface ModeAPetal {
  paper_id: string;
  venue: string;
  state: BloomState;
  reason: string;
  measured: {
    hasDraft: boolean;
    stubCount: number;
    benchmarkTodoCount: number;
    otsAnchored: boolean;
    baseAnchored: boolean;
  };
  claimed: {
    state: BloomState;
    blockedBy: string[];
  };
}

/** Mode-B petal: anonymous bloom only (no auth / non-team). */
interface ModeBPetal {
  /** Anonymous index so the visualizer can lay petals out. */
  index: number;
  state: BloomState;
  /** Color hint derived from bloom state. */
  color: string;
}

const BLOOM_COLORS: Record<BloomState, string> = {
  sealed: '#6b7280',    // gray
  budding: '#f59e0b',   // amber
  blooming: '#3b82f6',  // blue
  full: '#10b981',      // emerald
  wilted: '#ef4444',    // red
};

function buildModeAResponse(): {
  petals: Record<string, ModeAPetal>;
  readiness: { ready: boolean; fullPetals: number; totalPetals: number };
  metadata: typeof SNAPSHOT_METADATA;
} {
  const petals: Record<string, ModeAPetal> = {};
  let fullPetals = 0;

  for (const [paperId, evidence] of Object.entries(PETAL_EVIDENCE)) {
    const derived = derivePetalBloomState(evidence);
    if (derived.state === 'full') fullPetals++;
    petals[paperId] = {
      paper_id: evidence.paperId,
      venue: evidence.venue ?? '',
      state: derived.state,
      reason: derived.reason,
      measured: {
        hasDraft: evidence.hasDraft,
        stubCount: evidence.stubCount,
        benchmarkTodoCount: evidence.benchmarkTodoCount,
        otsAnchored: evidence.otsAnchored,
        baseAnchored: evidence.baseAnchored,
      },
      claimed: {
        state: derived.state,
        blockedBy: (derived.blockedBy ?? []) as string[],
      },
    };
  }

  return {
    petals,
    readiness: {
      ready: fullPetals === Object.keys(PETAL_EVIDENCE).length && fullPetals > 0,
      fullPetals,
      totalPetals: Object.keys(PETAL_EVIDENCE).length,
    },
    metadata: SNAPSHOT_METADATA,
  };
}

function buildModeBResponse(): {
  petals: ModeBPetal[];
  readiness: { fullPetals: number; totalPetals: number };
  metadata: { snapshot_at: string; petal_count: number };
} {
  const petals: ModeBPetal[] = [];
  let fullPetals = 0;
  let idx = 0;

  for (const evidence of Object.values(PETAL_EVIDENCE)) {
    const derived = derivePetalBloomState(evidence);
    if (derived.state === 'full') fullPetals++;
    petals.push({
      index: idx++,
      state: derived.state,
      color: BLOOM_COLORS[derived.state],
    });
  }

  return {
    petals,
    readiness: {
      fullPetals,
      totalPetals: Object.keys(PETAL_EVIDENCE).length,
    },
    metadata: {
      snapshot_at: SNAPSHOT_METADATA.snapshot_at,
      petal_count: SNAPSHOT_METADATA.petal_count,
    },
  };
}

// ── Auth check ───────────────────────────────────────────────────────────────

function isTeamTier(req: http.IncomingMessage): boolean {
  const caller = resolveRequestingAgent(req);
  return caller.authenticated;
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * Handle /api/lotus routes.
 * @returns true if the route was handled.
 */
export async function handleLotusRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string,
): Promise<boolean> {
  // GET /api/lotus
  if (pathname === '/api/lotus' && method === 'GET') {
    const authenticated = isTeamTier(req);

    // Cache headers: Vary on Authorization so CDNs don't serve Mode-A
    // content to unauthenticated visitors (W.GOLD.001).
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Vary', 'Authorization');

    if (authenticated) {
      const response = buildModeAResponse();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Lotus-Mode', 'A');
      res.end(JSON.stringify(response));
    } else {
      const response = buildModeBResponse();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Lotus-Mode', 'B');
      res.end(JSON.stringify(response));
    }

    return true;
  }

  return false;
}