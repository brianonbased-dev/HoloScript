/**
 * URDF perceiver derivation — re-derives world facts from the EMITTED URDF
 * artifact (the "robot stack" perceiver of @cross_perceiver_contract, 3b).
 *
 * Input is the URDF XML string produced by URDFCompiler.compile() and NOTHING
 * else — never the source composition/AST (G.UI-SHIFT.selfpass). World facts
 * are parsed from `<link>` elements: a WORLD-FACT link is one carrying a
 * `<visual>` block — synthetic kinematic plumbing (base_link) has no visual,
 * so the exclusion is structural, not a name convention.
 *
 * Vocabulary limits (honest coverage, not silent defaults): URDF has no agent
 * or affordance vocabulary — agent facts are inexpressible here and this
 * perceiver ABSTAINS from them (declared via `expresses`). Physical ids are
 * link names, which URDFCompiler sanitizes (HandleBot → handlebot) — already
 * canonical under the physical-id contract, folded again defensively.
 *
 * @package @holoscript/core/reconstruction
 */
import { createHash } from 'node:crypto';
import {
  canonicalPhysicalId,
  type PerceiverDerivation,
  type PerceivedPhysicalEntity,
} from './PerceiverConsensusReceipt';

export const URDF_PERCEIVER = 'urdf' as const;

/**
 * Parse the URDF artifact into a normalized perceiver derivation. Throws when
 * handed something that is not a URDF robot description — a lenient reader
 * that defaults to "no links" would let a broken artifact agree about an
 * empty world (the lenient-recogniser failure class).
 */
export function deriveUrdfPerception(artifact: string): PerceiverDerivation {
  if (typeof artifact !== 'string' || !/<robot[\s>]/.test(artifact)) {
    throw new Error(
      'deriveUrdfPerception: input is not a URDF robot description (missing <robot> element)'
    );
  }

  const sourceName = /<!-- Source: composition "([^"]+)" -->/.exec(artifact)?.[1] ?? null;

  const physicalEntities: PerceivedPhysicalEntity[] = [];
  const links = artifact.match(/<link\s+name="[^"]+">[\s\S]*?<\/link>/g) ?? [];
  for (const link of links) {
    const label = /<link\s+name="([^"]+)">/.exec(link)?.[1];
    if (!label) continue;
    const visual = /<visual>([\s\S]*?)<\/visual>/.exec(link)?.[1];
    if (!visual) continue; // no visual = kinematic plumbing (base_link), not a world fact

    const entity: PerceivedPhysicalEntity = { id: canonicalPhysicalId(label), label };

    const geom = /<geometry>\s*<(\w+)[\s/>]/.exec(visual)?.[1];
    if (geom) entity.geometry = geom;

    const xyz = /<origin\s+xyz="([^"]+)"/.exec(visual)?.[1];
    if (xyz) {
      const parts = xyz.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) entity.position = parts;
    }

    if (physicalEntities.some((e) => e.id === entity.id)) {
      throw new Error(
        `deriveUrdfPerception: two links fold to canonical id "${entity.id}" — refusing an ambiguous world`
      );
    }
    physicalEntities.push(entity);
  }

  return {
    perceiver: URDF_PERCEIVER,
    artifactHash: createHash('sha256').update(artifact).digest('hex'),
    expresses: ['source-name', 'physical-entities', 'geometry', 'position'],
    sourceName,
    entities: [], // URDF has no agent vocabulary — abstains from agent facts
    physicalEntities,
    coverageGaps: ['agent-entities', 'affordance-count', 'affordance-action-names'],
  };
}
