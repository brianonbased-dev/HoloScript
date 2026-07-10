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
import type { PerceiverDerivation, PerceivedEntity } from './PerceiverConsensusReceipt';

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

  const entities: PerceivedEntity[] = [];
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
    if (!Array.isArray(traits) || !traits.includes('agent')) continue; // comparison domain = agent entities

    const geometry = /\bgeometry: "([^"]+)"/.exec(push)?.[1];
    const positionRaw = /\bposition: (\[[^\]]*\])/.exec(push)?.[1];
    const entity: PerceivedEntity = {
      id,
      kind: 'agent',
      offerCount: traits.filter((t) => t === 'tool').length,
    };
    if (geometry) entity.geometry = geometry;
    if (positionRaw) {
      try {
        entity.position = JSON.parse(positionRaw);
      } catch {
        /* position stays unexpressed */
      }
    }
    entities.push(entity);
  }

  return {
    perceiver: WEBGPU_PERCEIVER,
    artifactHash: createHash('sha256').update(artifact).digest('hex'),
    sourceName,
    entities,
    coverageGaps: ['affordance-action-names'],
  };
}
