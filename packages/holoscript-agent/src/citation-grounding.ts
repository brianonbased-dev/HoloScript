/**
 * CITE-by-ID grounding gate — structural confabulation catch for peer answers.
 *
 * The D.100 sovereign-council audit found that at 4B params the consulted seats
 * CONFABULATED every citation (they invented P.076 / W.085 / W.049 / W.159 — none
 * of which exist). The fix is NOT a bigger model; it is a GATE: a cited knowledge
 * ID must RESOLVE to a real entry in the agent's knowledge corpus, or it is
 * confabulation. Correctness is gate-enforced, never asserted (native-authoring
 * doctrine — architecture beats alignment). This module is provider-free and
 * dependency-free so the edge agent package keeps its clean publish closure.
 *
 * Used by the `ask_peer` cognitive verb (cognitive-verbs.ts): before a peer's
 * answer is injected into the reasoning loop, its citations are ground-checked so
 * a downstream model sees which claims are supported and which are invented.
 *
 * @module holoscript-agent/citation-grounding
 */

/** A resolvable knowledge entry (the same minimal shape as KnowledgeEntry). */
export interface GroundingEntry {
  id?: string;
  content?: string;
}

export interface GroundingResult {
  /** Every unique knowledge-ID the text cited, in first-seen order. */
  citations: string[];
  /** Cited IDs that resolve to the corpus (by entry id OR appearing in content). */
  grounded: string[];
  /** Cited IDs that resolve to NOTHING — invented / confabulated. */
  confabulated: string[];
}

/**
 * Ecosystem knowledge-ID forms a peer answer might cite, e.g. W.810, F.126,
 * D.101, I.020, P.076, W.GOLD.550, G.GOLD.004, task_1782002213704_e1vn.
 * Uppercase single-letter prefix is required for the `X.NNN` form so ordinary
 * prose ("v.2", "p.m", "e.g.") cannot masquerade as a citation — the real
 * ecosystem convention is always uppercase (W./F./D./I./R./S./U./P./G.).
 */
const CITATION_RE = /\b([A-Z]\.GOLD\.\d+|[A-Z]\.\d+[a-z]?|task_[a-z0-9_]+)\b/g;

/** Extract the unique knowledge-IDs cited in `text` (first-seen order). */
export function extractCitations(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(CITATION_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/**
 * Resolve each citation in `text` against `corpus`. A citation is GROUNDED when it
 * matches a corpus entry's `id` (case-insensitive) OR appears literally anywhere in
 * the corpus content (MEMORY-style entries reference IDs inside their bodies). Any
 * citation that resolves to nothing is CONFABULATED. An empty corpus grounds
 * nothing — every citation is treated as unverified (fail-closed, the safe default
 * for a confabulation gate).
 */
export function groundCitations(text: string, corpus: GroundingEntry[]): GroundingResult {
  const citations = extractCitations(text);
  if (citations.length === 0) return { citations, grounded: [], confabulated: [] };

  const idSet = new Set<string>();
  let haystack = '';
  for (const e of corpus) {
    if (e.id) idSet.add(e.id.toLowerCase());
    if (e.content) haystack += ' ' + e.content.toLowerCase();
  }

  const grounded: string[] = [];
  const confabulated: string[] = [];
  for (const c of citations) {
    const lc = c.toLowerCase();
    if (idSet.has(lc) || haystack.includes(lc)) grounded.push(c);
    else confabulated.push(c);
  }
  return { citations, grounded, confabulated };
}

/**
 * Append a grounding footer to `text` so a downstream model SEES which citations
 * are supported and which are invented (the confabulation is made visible rather
 * than silently trusted). Text with no citations is returned unchanged.
 */
export function annotateGrounding(text: string, result: GroundingResult): string {
  if (result.citations.length === 0) return text;
  const parts = [`${result.grounded.length}/${result.citations.length} citations verified`];
  if (result.confabulated.length > 0) {
    parts.push(
      `UNVERIFIED (not in knowledge corpus — treat as unsupported): ${result.confabulated.join(', ')}`
    );
  }
  return `${text}\n[citation grounding: ${parts.join('; ')}]`;
}
