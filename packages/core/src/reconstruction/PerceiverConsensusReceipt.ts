/**
 * Perceiver-consensus receipt — cross-perceiver agreement as the falsification
 * oracle (@cross_perceiver_contract, slices 3 + 3b of the Receipt-Bound Surface).
 *
 * ONE .holo composition fans to N structurally-different perceiver compilers
 * (WebGPU = human eye, AgentInference = agent context, URDF = robot stack).
 * Each perceiver's EMITTED ARTIFACT is independently re-derived into a
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
 * agentInferencePerceiverDerivation / urdfPerceiverDerivation); this differ
 * refuses single-perceiver and duplicate-perceiver inputs for the same reason.
 *
 * FACT-CLASS SCOPING (v2): a perceiver votes ONLY on the fact classes its
 * vocabulary declares via {@link PerceiverDerivation.expresses} — the robot
 * stack abstains from agent facts, the agent context abstains from spatial
 * facts. A fact class with fewer than two expressing perceivers is coverage,
 * not consensus. This is the honest-scope rule made structural: one-sided
 * facts can never falsify, and "absent" is only a claim from a perceiver that
 * could have expressed presence.
 *
 * PHYSICAL-ID CONTRACT: robot stacks sanitize link names (URDFCompiler folds
 * `HandleBot` → `handlebot`), so physical entities are matched on
 * {@link canonicalPhysicalId} — mirror of URDF sanitizeName (non-alphanumerics
 * → `_`, lowercased, `a`-prefixed on a leading underscore). Extractors keep
 * the perceiver's literal spelling in `label` and MUST fail loud when two of
 * their own entities fold to one canonical id. Agent-entity ids stay VERBATIM
 * (every agent-fact perceiver preserves case).
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

export const PERCEIVER_CONSENSUS_VERSION = 'perceiver-consensus-v2' as const;

/** Positions closer than this per component are the same world fact (compiler rounding). */
export const POSITION_EPSILON = 1e-6;

/** The fact classes a perceiver's vocabulary can express (its voting rights). */
export type PerceiverFactClass =
  | 'source-name'
  | 'agent-entities'
  | 'affordance-count'
  | 'affordance-names'
  | 'physical-entities'
  | 'geometry'
  | 'position';

/**
 * Canonical physical-entity id — the documented matching contract for
 * physical facts. Mirrors URDFCompiler.sanitizeName so a link name and its
 * source object name fold to the same key. Exported from this module because
 * the receipt OWNS the contract (a spec constant, not shared artifact parsing).
 */
export function canonicalPhysicalId(name: string): string {
  let folded = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (folded.startsWith('_')) folded = 'a' + folded;
  return folded;
}

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
 * uAAL-shaped agent entity as ONE perceiver re-derived it from its own
 * artifact — structurally assignable to `UAALSemanticEntity`.
 */
export interface PerceivedEntity {
  /** Verbatim id (agent-entity ids are not folded — see the physical-id contract). */
  id: string;
  kind: 'agent';
  /**
   * Affordance count — the offer fact every affordance-count perceiver can
   * express (the WebGPU artifact carries trait names only, so it can count
   * offers but not name them).
   */
  offerCount: number;
  /** Named offers, present ONLY when this perceiver's artifact expresses action names. */
  offers?: PerceivedAffordanceOffer[];
  [key: string]: unknown;
}

/** A physical (scene/robot) entity as ONE perceiver re-derived it. */
export interface PerceivedPhysicalEntity {
  /** {@link canonicalPhysicalId} of the entity — the matching key. */
  id: string;
  /** The perceiver's literal spelling before folding. */
  label?: string;
  /** Canonical primitive kind ('sphere' | 'box' | 'cylinder' | …) when expressible. */
  geometry?: string;
  /** World position [x,y,z] when expressible. */
  position?: number[];
  [key: string]: unknown;
}

/** The normalized world-fact set one perceiver re-derived from its artifact. */
export interface PerceiverDerivation {
  /** Perceiver id, e.g. 'webgpu' | 'agent-inference' | 'urdf'. Unique per receipt. */
  perceiver: string;
  /**
   * sha256 (hex) over the delivered artifact bytes — the receipt binds to what
   * was actually emitted (mirrors the ProvenanceReceipt delivered-bytes rule),
   * so a post-hoc artifact swap invalidates the receipt.
   */
  artifactHash: string;
  /** Fact classes this perceiver's vocabulary can express — its voting rights. */
  expresses: PerceiverFactClass[];
  /** Composition name as the ARTIFACT claims it; null if inexpressible. */
  sourceName: string | null;
  /** Agent-kind entities this perceiver's artifact encodes (only meaningful with 'agent-entities'). */
  entities: PerceivedEntity[];
  /** Physical entities this perceiver's artifact encodes (only meaningful with 'physical-entities'). */
  physicalEntities?: PerceivedPhysicalEntity[];
  /** Fact classes this perceiver's vocabulary CANNOT express (out-of-domain ≠ disagreement). */
  coverageGaps: string[];
}

export interface PerceiverDisagreement {
  /**
   * Machine key: 'sourceName' | 'entity:<id>' | 'entity:<id>:offerCount' |
   * 'entity:<id>:offerActions' | 'physical:<id>' | 'physical:<id>:geometry' |
   * 'physical:<id>:position'.
   */
  fact: string;
  /**
   * perceiver id → its claim. ONLY perceivers whose vocabulary expresses the
   * fact class appear — an abstaining perceiver is never recorded as claiming
   * 'absent'.
   */
  claims: Record<string, string | number | null>;
  /** Human sentence naming who dissents and how. */
  detail: string;
}

export interface PerceiverConsensusReceipt {
  version: typeof PERCEIVER_CONSENSUS_VERSION;
  /** CONSENSUS = every mutually-expressible fact agrees; FALSIFIED otherwise. */
  verdict: 'CONSENSUS' | 'FALSIFIED';
  /** Agreed source name (null when unexpressed or disputed). */
  sourceName: string | null;
  perceivers: Array<{
    perceiver: string;
    artifactHash: string;
    expresses: PerceiverFactClass[];
    entityCount: number;
    physicalEntityCount: number;
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

function positionsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= POSITION_EPSILON);
}

/**
 * Diff N independently-derived perceiver fact sets into a consensus receipt.
 *
 * Compared facts — each ONLY among the perceivers whose `expresses` declares
 * the fact class, and only when at least two express it:
 *  1. source-name — expressing perceivers that name a source must agree.
 *  2. agent-entities — the agent-entity id sets must match exactly.
 *  3. affordance-count — per shared agent entity, offerCount must match.
 *  4. affordance-names — per shared agent entity, offer ACTION SETS must match
 *     when every voting perceiver names its offers.
 *  5. physical-entities — canonical physical-id sets must match exactly.
 *  6. geometry / 7. position — per shared physical entity, among expressers
 *     that define a value (position compared with {@link POSITION_EPSILON}).
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

  const expressers = (cls: PerceiverFactClass) =>
    derivations.filter((d) => d.expresses.includes(cls));

  // 1. Source name (among expressing perceivers that name one).
  const named = expressers('source-name').filter((d) => d.sourceName != null);
  let sourceName: string | null = named[0]?.sourceName ?? null;
  if (named.length >= 2) {
    comparedFacts++;
    const names = new Set(named.map((d) => d.sourceName));
    if (names.size > 1) {
      sourceName = null;
      disagreements.push({
        fact: 'sourceName',
        claims: Object.fromEntries(named.map((d) => [d.perceiver, d.sourceName])),
        detail: `perceivers claim different source compositions: ${[...names].join(' vs ')}`,
      });
    }
  }

  // 2–4. Agent facts, among agent-entity expressers.
  const agentVoters = expressers('agent-entities');
  if (agentVoters.length >= 2) {
    const byPerceiver = new Map(
      agentVoters.map((d) => [d.perceiver, new Map(d.entities.map((e) => [e.id, e]))])
    );
    const idUnion = [...new Set(agentVoters.flatMap((d) => d.entities.map((e) => e.id)))].sort();
    const sharedIds: string[] = [];
    for (const id of idUnion) {
      comparedFacts++;
      if (agentVoters.every((d) => byPerceiver.get(d.perceiver)!.has(id))) {
        sharedIds.push(id);
      } else {
        const dissent = agentVoters.filter((d) => !byPerceiver.get(d.perceiver)!.has(id));
        disagreements.push({
          fact: `entity:${id}`,
          claims: Object.fromEntries(
            agentVoters.map((d) => [
              d.perceiver,
              byPerceiver.get(d.perceiver)!.has(id) ? 'present' : 'absent',
            ])
          ),
          detail: `agent entity "${id}" is invisible to ${dissent.map((d) => d.perceiver).join(', ')} — the surface is lying to someone`,
        });
      }
    }

    for (const id of sharedIds) {
      const countVoters = agentVoters.filter((d) => d.expresses.includes('affordance-count'));
      if (countVoters.length >= 2) {
        comparedFacts++;
        const perEntity = countVoters.map((d) => ({
          perceiver: d.perceiver,
          entity: byPerceiver.get(d.perceiver)!.get(id)!,
        }));
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
      }

      const nameVoters = agentVoters.filter(
        (d) =>
          d.expresses.includes('affordance-names') &&
          Array.isArray(byPerceiver.get(d.perceiver)!.get(id)!.offers)
      );
      if (nameVoters.length >= 2) {
        comparedFacts++;
        const actionSets = nameVoters.map((d) =>
          [...new Set(byPerceiver.get(d.perceiver)!.get(id)!.offers!.map((o) => o.action))]
            .sort()
            .join(',')
        );
        if (new Set(actionSets).size > 1) {
          disagreements.push({
            fact: `entity:${id}:offerActions`,
            claims: Object.fromEntries(nameVoters.map((d, i) => [d.perceiver, actionSets[i]])),
            detail: `named affordances on "${id}" diverge: ${nameVoters
              .map((d, i) => `${d.perceiver} derives [${actionSets[i]}]`)
              .join('; ')}`,
          });
        }
      }
    }
  }

  // 5–7. Physical facts, among physical-entity expressers.
  const physVoters = expressers('physical-entities');
  if (physVoters.length >= 2) {
    const byPerceiver = new Map(
      physVoters.map((d) => [
        d.perceiver,
        new Map((d.physicalEntities ?? []).map((e) => [e.id, e])),
      ])
    );
    const idUnion = [
      ...new Set(physVoters.flatMap((d) => (d.physicalEntities ?? []).map((e) => e.id))),
    ].sort();
    const sharedIds: string[] = [];
    for (const id of idUnion) {
      comparedFacts++;
      if (physVoters.every((d) => byPerceiver.get(d.perceiver)!.has(id))) {
        sharedIds.push(id);
      } else {
        const dissent = physVoters.filter((d) => !byPerceiver.get(d.perceiver)!.has(id));
        disagreements.push({
          fact: `physical:${id}`,
          claims: Object.fromEntries(
            physVoters.map((d) => [
              d.perceiver,
              byPerceiver.get(d.perceiver)!.has(id) ? 'present' : 'absent',
            ])
          ),
          detail: `physical entity "${id}" is invisible to ${dissent.map((d) => d.perceiver).join(', ')} — the surface is lying to someone`,
        });
      }
    }

    for (const id of sharedIds) {
      const geomVoters = physVoters.filter(
        (d) =>
          d.expresses.includes('geometry') &&
          typeof byPerceiver.get(d.perceiver)!.get(id)!.geometry === 'string'
      );
      if (geomVoters.length >= 2) {
        comparedFacts++;
        const geoms = geomVoters.map((d) => byPerceiver.get(d.perceiver)!.get(id)!.geometry!);
        if (new Set(geoms).size > 1) {
          disagreements.push({
            fact: `physical:${id}:geometry`,
            claims: Object.fromEntries(geomVoters.map((d, i) => [d.perceiver, geoms[i]])),
            detail: `geometry of "${id}" diverges: ${geomVoters
              .map((d, i) => `${d.perceiver} derives ${geoms[i]}`)
              .join('; ')}`,
          });
        }
      }

      const posVoters = physVoters.filter(
        (d) =>
          d.expresses.includes('position') &&
          Array.isArray(byPerceiver.get(d.perceiver)!.get(id)!.position)
      );
      if (posVoters.length >= 2) {
        comparedFacts++;
        const positions = posVoters.map((d) => byPerceiver.get(d.perceiver)!.get(id)!.position!);
        const agrees = positions.every((p) => positionsEqual(p, positions[0]));
        if (!agrees) {
          disagreements.push({
            fact: `physical:${id}:position`,
            claims: Object.fromEntries(
              posVoters.map((d, i) => [d.perceiver, JSON.stringify(positions[i])])
            ),
            detail: `position of "${id}" diverges beyond ε=${POSITION_EPSILON}: ${posVoters
              .map((d, i) => `${d.perceiver} derives ${JSON.stringify(positions[i])}`)
              .join('; ')}`,
          });
        }
      }
    }
  }

  const verdict: PerceiverConsensusReceipt['verdict'] =
    disagreements.length > 0 ? 'FALSIFIED' : 'CONSENSUS';

  const perceivers = derivations
    .map((d) => ({
      perceiver: d.perceiver,
      artifactHash: d.artifactHash,
      expresses: [...d.expresses].sort() as PerceiverFactClass[],
      entityCount: d.entities.length,
      physicalEntityCount: d.physicalEntities?.length ?? 0,
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
      ...perceivers.map(
        (p) => `${p.perceiver}:${p.artifactHash}:${p.entityCount}:${p.physicalEntityCount}`
      ),
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
