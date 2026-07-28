/**
 * WebGPU perceiver derivation — re-derives world facts from the EMITTED
 * WebGPU artifact (the "human eye" perceiver of @cross_perceiver_contract).
 *
 * Input is the compiled JavaScript string produced by WebGPUCompiler.compile()
 * and NOTHING else — never the source composition/AST (G.UI-SHIFT.selfpass:
 * re-derivation from the shared input would make cross-perceiver agreement
 * circular). World facts are parsed from the `holoGraphObjects.push({...})`
 * scene-registry literals the compiler emits per object.
 *
 * Vocabulary limits (honest coverage, not silent defaults): the artifact
 * carries TRAIT NAMES only — an agent entity's affordances are countable
 * (occurrences of the "tool" trait) but not nameable, so this perceiver emits
 * `offerCount` without `offers`. Spatial facts (geometry/position) ARE
 * expressible here and attached as extra keys for future fact classes.
 *
 * @package @holoscript/core/reconstruction
 */
import { createHash } from 'node:crypto';
import {
  canonicalPhysicalId,
  type PerceiverDerivation,
  type PerceivedEntity,
  type PerceivedPhysicalEntity,
} from './PerceiverConsensusReceipt';

export const WEBGPU_PERCEIVER = 'webgpu' as const;

/**
 * Parse the WebGPU artifact into a normalized perceiver derivation.
 * Throws when handed something that is not a WebGPU compile artifact —
 * failing loud beats silently deriving an empty world (a lenient reader that
 * defaults to "no entities" would score a broken artifact as agreeing about
 * nothing; same failure class as the lenient-recogniser lesson).
 */
export function deriveWebGPUPerception(artifact: string): PerceiverDerivation {
  if (typeof artifact !== 'string' || !artifact.includes('holoGraphObjects')) {
    throw new Error(
      'deriveWebGPUPerception: input is not a WebGPU compile artifact (missing holoGraphObjects scene registry)'
    );
  }

  const sourceName = /^\/\/ Source: composition "([^"]+)"/m.exec(artifact)?.[1] ?? null;

  // Preferred source (g9tk): the HoloScene Manifest — strict JSON world facts
  // emitted INSIDE the artifact at emission time. A present-but-malformed
  // manifest fails LOUD (silently falling back to regex could re-derive
  // different facts from the same artifact — a split-brain derivation).
  const manifestRaw = /const holoSceneManifest = (\{[\s\S]*?\});/.exec(artifact)?.[1];
  if (manifestRaw) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch (e) {
      throw new Error(
        `deriveWebGPUPerception: holoSceneManifest is not valid JSON — refusing a malformed manifest (${(e as Error).message})`
      );
    }
    const objects = (manifest as { objects?: unknown }).objects;
    if (!Array.isArray(objects)) {
      throw new Error(
        'deriveWebGPUPerception: holoSceneManifest has no objects[] — malformed manifest'
      );
    }
    const entities: PerceivedEntity[] = [];
    const physicalEntities: PerceivedPhysicalEntity[] = [];
    for (const o of objects as Array<Record<string, unknown>>) {
      const id = typeof o.id === 'string' ? o.id : '';
      const traits = Array.isArray(o.traits) ? o.traits : [];
      if (!id) continue;
      const affordances = Array.isArray(o.affordances)
        ? (o.affordances as unknown[]).filter((a): a is string => typeof a === 'string')
        : [];
      const position =
        Array.isArray(o.position) && (o.position as unknown[]).every((n) => Number.isFinite(n))
          ? (o.position as number[])
          : undefined;
      const geometry = typeof o.geometry === 'string' ? o.geometry : undefined;

      if (traits.includes('agent')) {
        const entity: PerceivedEntity = {
          id,
          kind: 'agent',
          offerCount: affordances.length,
          offers: affordances.map((action) => ({ action })),
        };
        if (geometry) entity.geometry = geometry;
        if (position) entity.position = position;
        entities.push(entity);
      }
      if (o.visible === true) {
        const physical: PerceivedPhysicalEntity = { id: canonicalPhysicalId(id), label: id };
        if (geometry) physical.geometry = geometry;
        if (position) physical.position = position;
        if (physicalEntities.some((e) => e.id === physical.id)) {
          throw new Error(
            `deriveWebGPUPerception: two scene objects fold to canonical id "${physical.id}" — refusing an ambiguous world`
          );
        }
        physicalEntities.push(physical);
      }
    }
    return {
      perceiver: WEBGPU_PERCEIVER,
      artifactHash: createHash('sha256').update(artifact).digest('hex'),
      expresses: [
        'source-name',
        'agent-entities',
        'affordance-count',
        'affordance-names', // the manifest names actions — full parity (rycr)
        'physical-entities',
        'geometry',
        'position',
      ],
      sourceName,
      entities,
      physicalEntities,
      coverageGaps: [],
    };
  }

  // Fallback (pre-manifest artifacts): regex over the imperative scene-registry
  // push literals — trait names only, so affordances are countable, not nameable.
  const entities: PerceivedEntity[] = [];
  const physicalEntities: PerceivedPhysicalEntity[] = [];
  const pushes = artifact.match(/holoGraphObjects\.push\(\{[\s\S]*?\}\);/g) ?? [];
  for (const push of pushes) {
    const id = /\bid: "([^"]+)"/.exec(push)?.[1];
    const traitsRaw = /\btraits: (\[[^\]]*\])/.exec(push)?.[1];
    if (!id || !traitsRaw) continue; // registry entry without identity — not a world fact
    let traits: unknown;
    try {
      traits = JSON.parse(traitsRaw);
    } catch {
      continue;
    }
    if (!Array.isArray(traits)) continue;

    const geometry = /\bgeometry: "([^"]+)"/.exec(push)?.[1];
    const positionRaw = /\bposition: (\[[^\]]*\])/.exec(push)?.[1];
    let position: number[] | undefined;
    if (positionRaw) {
      try {
        const parsed = JSON.parse(positionRaw);
        if (Array.isArray(parsed) && parsed.every((n) => Number.isFinite(n))) position = parsed;
      } catch {
        /* position stays unexpressed */
      }
    }

    // Agent facts: entities carrying the 'agent' trait (verbatim ids — every
    // agent-fact perceiver preserves case).
    if (traits.includes('agent')) {
      const entity: PerceivedEntity = {
        id,
        kind: 'agent',
        offerCount: traits.filter((t) => t === 'tool').length,
      };
      if (geometry) entity.geometry = geometry;
      if (position) entity.position = position;
      entities.push(entity);
    }

    // Physical facts: VISIBLE scene objects only (invisible functional
    // geometry — triggers, colliders — is not part of the perceivable world
    // this perceiver claims; the robot stack does not compile it either).
    // Matched on the canonical physical-id contract (robot stacks fold names).
    if (/\bvisible: true\b/.test(push)) {
      const physical: PerceivedPhysicalEntity = { id: canonicalPhysicalId(id), label: id };
      if (geometry) physical.geometry = geometry;
      if (position) physical.position = position;
      if (physicalEntities.some((e) => e.id === physical.id)) {
        throw new Error(
          `deriveWebGPUPerception: two scene objects fold to canonical id "${physical.id}" — refusing an ambiguous world`
        );
      }
      physicalEntities.push(physical);
    }
  }

  return {
    perceiver: WEBGPU_PERCEIVER,
    artifactHash: createHash('sha256').update(artifact).digest('hex'),
    expresses: [
      'source-name',
      'agent-entities',
      'affordance-count',
      'physical-entities',
      'geometry',
      'position',
    ],
    sourceName,
    entities,
    physicalEntities,
    coverageGaps: ['affordance-action-names'],
  };
}
