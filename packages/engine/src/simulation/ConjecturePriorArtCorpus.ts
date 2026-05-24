/**
 * ConjecturePriorArtCorpus — a real, bounded prior-art corpus for the Conjecture
 * Engine's novelty check (the `rediscovered` status).
 *
 * The shipped novelty check (`assessConjectureNovelty`, ConjectureEngine.ts) takes a
 * corpus parameter but defaults to a single hardcoded entry. That is enough to prove
 * the mechanism, NOT enough to be credible: a novice who "discovers" Euler's formula
 * must be told honestly that it's already known, or the hub ships the Weil overclaim
 * (W.520 — a false "you're first!"). The honest NO is the moat (D.060).
 *
 * This module supplies a curated set of genuinely-known results across the engine's
 * live domains (geometry / topology / number theory / tropical-string-math), each a
 * `ConjecturePriorArtEntry` the novelty check compares against.
 *
 * HONEST SCOPE — do not overclaim (F.016/F.029): the shipped matcher is LEXICAL, not
 * semantic. `assessConjectureNovelty` compares HoloEmbed char-trigram histograms (see
 * `@holoscript/holoembed` camelSplit + trigramHistogram) at cosine >= 0.995, so it only
 * flags NEAR-VERBATIM restatements. A re-worded known result (different wording, same
 * meaning) will return `novel` — a false negative. This is therefore an EXACT-RESTATEMENT
 * GUARD, not a semantic novelty detector, and a 12-entry corpus is a seed, not a literature
 * index. Real credibility needs (a) a far larger corpus (10^3+ abstracts) and (b) a
 * stronger-than-trigram (truly semantic) encoder — both are documented follow-ups. Until
 * then, a non-match means "not a near-verbatim match in this seed," never "novel" with any
 * certainty (W.511 / W.520).
 *
 * Zero edits to ConjectureEngine.ts — consumes the existing corpus parameter.
 */

import {
  assessConjectureNovelty,
  CONJECTURE_NOVELTY_THRESHOLD,
  type ConjectureNoveltyAssessment,
  type ConjecturePriorArtEntry,
} from './ConjectureEngine';

/**
 * Curated known results a novice might plausibly "rediscover." Statements are phrased
 * as a discoverer would state the claim, so the lexical char-trigram near-duplicate
 * check can match a NEAR-VERBATIM re-statement (not a paraphrase). Sources are real
 * references; this is a seed, not a complete literature index.
 */
export const KNOWN_RESULTS_CORPUS: ReadonlyArray<ConjecturePriorArtEntry> = [
  {
    id: 'prior.topology.euler-polyhedron-formula',
    title: 'Euler characteristic of convex polyhedra',
    source: 'Euler 1758; V - E + F = 2',
    statement: 'For every convex polyhedron, vertices minus edges plus faces equals two.',
  },
  {
    id: 'prior.geometry.regular-polygon-sheet-euler',
    title: 'Triangulated disk Euler characteristic',
    source: 'classical; a triangulated disk has Euler characteristic 1',
    statement:
      'Every fan-triangulated regular polygon sheet is non-degenerate and has Euler characteristic 1.',
  },
  {
    id: 'prior.geometry.edge-manifold-surface',
    title: 'Edge-manifoldness of triangle surfaces',
    source: 'standard simplicial-complex theory',
    statement:
      'A triangle surface is edge-manifold when no edge is shared by three or more triangles.',
  },
  {
    id: 'prior.geometry.sdf-1-lipschitz',
    title: 'Signed distance fields are 1-Lipschitz',
    source: 'metric geometry; a true distance function satisfies |f(a)-f(b)| <= |a-b|',
    statement:
      'Every true signed distance field is 1-Lipschitz: the value changes by at most the distance moved.',
  },
  {
    id: 'prior.numbertheory.erdos-straus',
    title: 'Erdős–Straus conjecture',
    source: 'Erdős & Straus 1948',
    statement:
      'For every integer n >= 2, four over n equals a sum of three unit fractions 1/x + 1/y + 1/z.',
  },
  {
    id: 'prior.numbertheory.erdos-moser',
    title: 'Erdős–Moser equation',
    source: 'Erdős; only known solution 1 + 2 = 3',
    statement:
      'The only solution to 1^k + 2^k + ... + (m-1)^k = m^k in positive integers is 1 + 2 = 3.',
  },
  {
    id: 'prior.algebra.bezout-theorem',
    title: "Bézout's theorem",
    source: 'Bézout; two plane curves of degrees d1, d2 meet in d1·d2 points',
    statement:
      'Two generic plane algebraic curves of degrees d1 and d2 intersect in exactly d1 times d2 points.',
  },
  {
    id: 'prior.tropical.mikhalkin-correspondence',
    title: 'Mikhalkin correspondence theorem',
    source: 'Mikhalkin 2005',
    statement:
      'The number of tropical plane curves through generic points equals the classical algebraic curve count.',
  },
  {
    id: 'prior.enumerative.quintic-lines',
    title: 'Lines on the quintic threefold',
    source: 'Schubert (19th c.); 2875 lines',
    statement: 'A generic quintic threefold contains exactly 2875 lines.',
  },
  {
    id: 'prior.geometry.gauss-bonnet',
    title: 'Gauss–Bonnet theorem',
    source: 'Gauss; Bonnet',
    statement:
      'The integral of Gaussian curvature over a closed surface equals two pi times its Euler characteristic.',
  },
  {
    id: 'prior.geometry.pythagoras',
    title: 'Pythagorean theorem',
    source: 'classical',
    statement:
      'In a right triangle the square of the hypotenuse equals the sum of the squares of the other two sides.',
  },
  {
    id: 'prior.graph.four-color',
    title: 'Four color theorem',
    source: 'Appel & Haken 1976',
    statement: 'Every planar map can be colored with four colors so no adjacent regions share a color.',
  },
];

/**
 * Assess a natural-language claim against the curated known-results corpus.
 * Returns the shipped `ConjectureNoveltyAssessment` — `near-duplicate` (i.e.
 * rediscovered) when the claim matches a known result above the threshold, else
 * `novel` (within this seed corpus — not a certainty; see module note + W.511).
 */
export function assessNoveltyAgainstKnownResults(
  claim: string,
  threshold: number = CONJECTURE_NOVELTY_THRESHOLD,
): ConjectureNoveltyAssessment {
  return assessConjectureNovelty(claim, KNOWN_RESULTS_CORPUS, threshold);
}
