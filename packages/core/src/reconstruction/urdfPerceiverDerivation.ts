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

  // Kinematics: joint elements name each link's mobility — a link whose parent
  // joint is non-fixed has an unknown reach envelope (grounding abstains on it).
  const jointTypeByChild = new Map<string, string>();
  for (const joint of artifact.match(/<joint\s+[^>]*>[\s\S]*?<\/joint>/g) ?? []) {
    const type = /<joint\s+[^>]*type="([^"]+)"/.exec(joint)?.[1];
    const child = /<child\s+link="([^"]+)"/.exec(joint)?.[1];
    if (type && child) jointTypeByChild.set(child, type);
  }

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

    // Bounding radius from the visual primitive's own dimensions — the robot
    // vocabulary carries true extents, so it owns the reach-envelope data.
    const sphereR = /<sphere\s+radius="([\d.eE+-]+)"/.exec(visual)?.[1];
    const boxSize = /<box\s+size="([^"]+)"/.exec(visual)?.[1];
    const cyl = /<cylinder\s+radius="([\d.eE+-]+)"\s+length="([\d.eE+-]+)"/.exec(visual);
    if (sphereR != null && Number.isFinite(Number(sphereR))) {
      entity.extent = Number(sphereR);
    } else if (boxSize) {
      const dims = boxSize.trim().split(/\s+/).map(Number);
      if (dims.length === 3 && dims.every(Number.isFinite)) {
        entity.extent = Math.hypot(...dims) / 2; // half-diagonal bounding radius
      }
    } else if (cyl && Number.isFinite(Number(cyl[1])) && Number.isFinite(Number(cyl[2]))) {
      entity.extent = Math.hypot(Number(cyl[1]), Number(cyl[2]) / 2);
    }

    const jointType = jointTypeByChild.get(label);
    entity.mobility = jointType == null || jointType === 'fixed' ? 'fixed' : 'actuated';

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
