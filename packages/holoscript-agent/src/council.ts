/**
 * Council convergence — multi-peer questioning → a grounded verdict (D.100 keystone).
 *
 * Reasoning is not held in one model's weights; it EMERGES from structured
 * agent-to-agent questioning (the founder's thesis: "agents asking agents questions
 * IS reasoning"). The `council` cognitive verb consults N peers (diverse lenses, and
 * — when HOLOSCRIPT_AGENT_PEER_BASE_URL is set — genuinely different sovereign nodes)
 * about a task; this module converges their answers into one grounded synthesis:
 *
 *   - CORROBORATED  — a citation cited by ≥2 peers that ALSO resolves to real
 *                     knowledge (citation-grounding.ts). The high-confidence core.
 *   - SINGLE-SOURCE — a verified citation only one peer raised. Supported, weaker.
 *   - CONFABULATED  — a citation that resolves to nothing. Named, never trusted.
 *
 * Every confidence tier is DERIVED from the grounding gate, never asserted — a weak
 * peer that invents agreement can't manufacture corroboration, because the cited ID
 * still has to resolve. Architecture beats alignment (F.126). Provider-free +
 * dependency-free so the edge package keeps its clean publish closure.
 *
 * @module holoscript-agent/council
 */
import {
  groundCitations,
  type GroundingEntry,
  type GroundingResult,
} from './citation-grounding.js';

export interface CouncilSeat {
  /** Who answered (peer node/handle, optionally with the lens it took). */
  peer: string;
  answer: string;
}

export interface CouncilSeatVerdict extends CouncilSeat {
  grounding: GroundingResult;
}

export interface CouncilConvergence {
  seats: CouncilSeatVerdict[];
  /** Verified citations raised by ≥2 distinct peers — the corroborated core. */
  corroborated: string[];
  /** Verified citations raised by exactly one peer — supported, not corroborated. */
  singleSource: string[];
  /** Citations that resolve to nothing in any seat — confabulation (deduped union). */
  confabulated: string[];
}

/** Converge N peer answers into a grounded verdict. Pure; all I/O already happened. */
export function convergeCouncil(
  seats: CouncilSeat[],
  corpus: GroundingEntry[]
): CouncilConvergence {
  const verdicts: CouncilSeatVerdict[] = seats.map((s) => ({
    ...s,
    grounding: groundCitations(s.answer, corpus),
  }));

  // Count DISTINCT seats per grounded citation (a seat citing W.810 twice counts once).
  const groundedSeatCount = new Map<string, number>();
  const confab = new Set<string>();
  for (const v of verdicts) {
    for (const g of new Set(v.grounding.grounded)) {
      groundedSeatCount.set(g, (groundedSeatCount.get(g) ?? 0) + 1);
    }
    for (const c of v.grounding.confabulated) confab.add(c);
  }

  const corroborated: string[] = [];
  const singleSource: string[] = [];
  for (const [id, n] of groundedSeatCount) {
    (n >= 2 ? corroborated : singleSource).push(id);
  }
  return {
    seats: verdicts,
    corroborated: corroborated.sort(),
    singleSource: singleSource.sort(),
    confabulated: [...confab].sort(),
  };
}

/** Render the convergence as the synthesis block injected into the reasoning loop. */
export function renderCouncil(
  question: string,
  c: CouncilConvergence,
  maxAnswerChars = 360
): string {
  const lines = [`[Council of ${c.seats.length} peer(s) re "${question}"]`];
  if (c.corroborated.length)
    lines.push(`Corroborated (≥2 peers, verified): ${c.corroborated.join(', ')}`);
  if (c.singleSource.length) lines.push(`Single-source (verified): ${c.singleSource.join(', ')}`);
  if (c.confabulated.length)
    lines.push(`Unverified — confabulated, do NOT rely on: ${c.confabulated.join(', ')}`);
  for (const s of c.seats) {
    lines.push(`— ${s.peer}: ${s.answer.replace(/\s+/g, ' ').trim().slice(0, maxAnswerChars)}`);
  }
  return lines.join('\n');
}
