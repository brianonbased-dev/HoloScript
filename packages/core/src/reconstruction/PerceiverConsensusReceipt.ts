/**
 * Perceiver-consensus receipt — cross-perceiver agreement as the falsification
 * oracle (@cross_perceiver_contract, slice 3 of the Receipt-Bound Surface).
 *
 * ONE .holo composition fans to N structurally-different perceiver compilers
 * (WebGPU = human eye, AgentInference = agent context, later URDF = robot
 * stack). Each perceiver's EMITTED ARTIFACT is independently re-derived into a
 * normalized world-fact set ({@link PerceiverDerivation}); this module diffs
 * those derivations into a {@link PerceiverConsensusReceipt}. Any perceiver
 * that re-derives a different fact flips the verdict to FALSIFIED with the
 * concrete disagreement ("the eye sees 2 affordances on HandleBot; the agent
 * derives 1 → the surface is lying to someone").
 *
 * DISCIPLINE (G.UI-SHIFT.selfpass — the fatal gotcha): derivations MUST be
 * parsed from the emitted artifacts, never from the shared input AST, or
 * agreement is circular and proves nothing. The extractors live in separate
 * modules with no shared parsing code (webgpuPerceiverDerivation /
 * agentInferencePerceiverDerivation); this differ refuses single-perceiver
 * and duplicate-perceiver inputs for the same reason.
 *
 * HONEST SCOPE: a fact counts as a disagreement only when every perceiver's
 * vocabulary can express it (entity presence, per-entity affordance count,
 * source name, and action names when all sides name them). One-sided facts
 * (tool names the eye cannot see, geometry the agent cannot see) are recorded
 * as coverage gaps, NOT falsifications — otherwise the receipt cries wolf on
 * every modality gap.
 *
 * WHY not CrossValidationRegistry: that machinery is N-of-M consensus over
 * runtime observations by independent AGENTS (median/plurality + CRDT merge).
 * Here the observers are deterministic COMPILERS of one source — the right
 * semantic is an exact fact diff, not statistical consensus; a median over two
 * deterministic perceivers would hide exactly the disagreement we exist to
 * surface.
 *
 * @package @holoscript/core/reconstruction
 */
import { createHash } from 'node:crypto';

export const PERCEIVER_CONSENSUS_VERSION = 'perceiver-consensus-v1' as const;

/**
 * uAAL-shaped affordance offer — structurally assignable to
 * `UAALAffordanceOffer` in @holoscript/uaal (declared locally so core does not
 * grow a package dependency for a two-field structural type).
 */
export interface PerceivedAffordanceOffer {
  action: string;
  [key: string]: unknown;
}

/**
 * uAAL-shaped semantic entity as ONE perceiver re-derived it from its own
 * artifact — structurally assignable to `UAALSemanticEntity`.
 */
export interface PerceivedEntity {
  id: string;
  kind: 'agent';
  /**
   * Affordance count — the offer fact EVERY perceiver vocabulary can express
   * (the WebGPU artifact carries trait names only, so it can count offers but
   * not name them).
   */
  offerCount: number;
  /** Named offers, present ONLY when this perceiver's artifact expresses action names. */
  offers?: PerceivedAffordanceOffer[];
  [key: string]: unknown;
}

/** The normalized world-fact set one perceiver re-derived from its artifact. */
export interface PerceiverDerivation {
  /** Perceiver id, e.g. 'webgpu' | 'agent-inference'. Must be unique per receipt. */
  perceiver: string;
  /**
   * sha256 (hex) over the delivered artifact bytes — the receipt binds to what
   * was actually emitted (mirrors the ProvenanceReceipt delivered-bytes rule),
   * so a post-hoc artifact swap invalidates the receipt.
   */
  artifactHash: string;
  /** Composition name as the ARTIFACT claims it; null if inexpressible. */
  sourceName: string | null;
  /** Agent-kind entities this perceiver's artifact encodes. */
  entities: PerceivedEntity[];
  /** Fact classes this perceiver's vocabulary CANNOT express (out-of-domain ≠ disagreement). */
  coverageGaps: string[];
}

export interface PerceiverDisagreement {
  /** Machine key, e.g. 'sourceName' | 'entity:HandleBot' | 'entity:HandleBot:offerCount'. */
  fact: string;
  /** perceiver id → its claim ('present'/'absent', a count, a name; null = artifact silent). */
  claims: Record<string, string | number | null>;
  /** Human sentence naming who dissents and how. */
  detail: string;
}

export interface PerceiverConsensusReceipt {
  version: typeof PERCEIVER_CONSENSUS_VERSION;
  /** CONSENSUS = every mutually-expressible fact agrees; FALSIFIED otherwise. */
  verdict: 'CONSENSUS' | 'FALSIFIED';
  /** Agreed source name (null when no perceiver expressed one or they disagree). */
  sourceName: string | null;
  perceivers: Array<{
    perceiver: string;
    artifactHash: string;
    entityCount: number;
    coverageGaps: string[];
  }>;
  /** How many mutually-expressible facts were actually compared (0 compared = no consensus claim). */
  comparedFacts: number;
  disagreements: PerceiverDisagreement[];
  /**
   * sha256 (hex) over the canonical {version, verdict, sourceName, sorted
   * perceiver ids+artifact hashes+entity counts, sorted disagreement facts}.
   * Changes if any artifact OR the agreement composition changes.
   */
  receiptHash: string;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Diff N independently-derived perceiver fact sets into a consensus receipt.
 *
 * Compared facts (only where mutually expressible):
 *  1. sourceName — every derivation that names a source must name the same one.
 *  2. entity presence — the agent-entity id sets must match exactly (both
 *     vocabularies can express agent entities, so absence is a real claim).
 *  3. per shared entity: offerCount must match.
 *  4. per shared entity: offer ACTION SETS must match, but only when every
 *     derivation names its offers (a perceiver that cannot name actions makes
 *     this fact out-of-domain, recorded via its coverageGaps).
 *
 * Throws on fewer than two derivations or duplicate perceiver ids — a
 * single-perceiver or self-paired "consensus" is exactly the circular theater
 * this receipt exists to prevent.
 */
export function derivePerceiverConsensus(
  derivations: PerceiverDerivation[]
): PerceiverConsensusReceipt {
  if (derivations.length < 2) {
    throw new Error(
      'PerceiverConsensusReceipt: consensus requires >= 2 independent perceivers — a single-perceiver receipt is circular'
    );
  }
  const ids = derivations.map((d) => d.perceiver);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `PerceiverConsensusReceipt: duplicate perceiver ids ${JSON.stringify(ids)} — self-agreement is not consensus`
    );
  }

  const disagreements: PerceiverDisagreement[] = [];
  let comparedFacts = 0;

  // 1. Source name (among perceivers that express one).
  const named = derivations.filter((d) => d.sourceName != null);
  let sourceName: string | null = named[0]?.sourceName ?? null;
  if (named.length >= 2) {
    comparedFacts++;
    const names = new Set(named.map((d) => d.sourceName));
    if (names.size > 1) {
      sourceName = null;
      disagreements.push({
        fact: 'sourceName',
        claims: Object.fromEntries(derivations.map((d) => [d.perceiver, d.sourceName])),
        detail: `perceivers claim different source compositions: ${[...names].join(' vs ')}`,
      });
    }
  }

  // 2. Entity presence over the id union.
  const byPerceiver = new Map(
    derivations.map((d) => [d.perceiver, new Map(d.entities.map((e) => [e.id, e]))])
  );
  const idUnion = [...new Set(derivations.flatMap((d) => d.entities.map((e) => e.id)))].sort();
  const sharedIds: string[] = [];
  for (const id of idUnion) {
    comparedFacts++;
    const presence = derivations.map((d) => byPerceiver.get(d.perceiver)!.has(id));
    if (presence.every(Boolean)) {
      sharedIds.push(id);
    } else {
      const dissent = derivations.filter((d) => !byPerceiver.get(d.perceiver)!.has(id));
      disagreements.push({
        fact: `entity:${id}`,
        claims: Object.fromEntries(
          derivations.map((d) => [
            d.perceiver,
            byPerceiver.get(d.perceiver)!.has(id) ? 'present' : 'absent',
          ])
        ),
        detail: `entity "${id}" is invisible to ${dissent.map((d) => d.perceiver).join(', ')} — the surface is lying to someone`,
      });
    }
  }

  // 3 + 4. Per shared entity: offer count, and action sets when all sides name them.
  for (const id of sharedIds) {
    const perEntity = derivations.map((d) => ({
      perceiver: d.perceiver,
      entity: byPerceiver.get(d.perceiver)!.get(id)!,
    }));

    comparedFacts++;
    const counts = new Set(perEntity.map((p) => p.entity.offerCount));
    if (counts.size > 1) {
      disagreements.push({
        fact: `entity:${id}:offerCount`,
        claims: Object.fromEntries(perEntity.map((p) => [p.perceiver, p.entity.offerCount])),
        detail: `affordance count on "${id}" diverges: ${perEntity
          .map((p) => `${p.perceiver} derives ${p.entity.offerCount}`)
          .join('; ')}`,
      });
      continue; // action-set diff on top of a count mismatch is noise
    }

    if (perEntity.every((p) => Array.isArray(p.entity.offers))) {
      comparedFacts++;
      const actionSets = perEntity.map((p) =>
        [...new Set(p.entity.offers!.map((o) => o.action))].sort().join(',')
      );
      if (new Set(actionSets).size > 1) {
        disagreements.push({
          fact: `entity:${id}:offerActions`,
          claims: Object.fromEntries(perEntity.map((p, i) => [p.perceiver, actionSets[i]])),
          detail: `named affordances on "${id}" diverge: ${perEntity
            .map((p, i) => `${p.perceiver} derives [${actionSets[i]}]`)
            .join('; ')}`,
        });
      }
    }
  }

  const verdict: PerceiverConsensusReceipt['verdict'] =
    disagreements.length > 0 ? 'FALSIFIED' : 'CONSENSUS';

  const perceivers = derivations
    .map((d) => ({
      perceiver: d.perceiver,
      artifactHash: d.artifactHash,
      entityCount: d.entities.length,
      coverageGaps: [...d.coverageGaps].sort(),
    }))
    .sort((a, b) => a.perceiver.localeCompare(b.perceiver));

  // Canonical hash input: primitives in stable order (never floats, never
  // unordered maps) so the hash is deterministic and forgery-resistant.
  const receiptHash = sha256Hex(
    [
      PERCEIVER_CONSENSUS_VERSION,
      verdict,
      sourceName ?? '',
      ...perceivers.map((p) => `${p.perceiver}:${p.artifactHash}:${p.entityCount}`),
      ...disagreements
        .map((d) => `${d.fact}=${JSON.stringify(Object.entries(d.claims).sort())}`)
        .sort(),
    ].join('|')
  );

  return {
    version: PERCEIVER_CONSENSUS_VERSION,
    verdict,
    sourceName,
    perceivers,
    comparedFacts,
    disagreements,
    receiptHash,
  };
}
