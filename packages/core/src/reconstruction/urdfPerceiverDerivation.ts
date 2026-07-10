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

  // Kinematics: each link's parent joint gives its mobility AND its reach
  // envelope. Parsed per joint: type, child link, joint origin, travel limits.
  interface ParsedJoint {
    type: string;
    parent?: string;
    origin?: number[];
    rotated?: boolean;
    lower?: number;
    upper?: number;
  }
  const jointByChild = new Map<string, ParsedJoint>();
  for (const joint of artifact.match(/<joint\s+[^>]*>[\s\S]*?<\/joint>/g) ?? []) {
    const type = /<joint\s+[^>]*type="([^"]+)"/.exec(joint)?.[1];
    const child = /<child\s+link="([^"]+)"/.exec(joint)?.[1];
    if (!type || !child) continue;
    const parsed: ParsedJoint = { type };
    parsed.parent = /<parent\s+link="([^"]+)"/.exec(joint)?.[1];
    const xyz = /<origin\s+xyz="([^"]+)"/.exec(joint)?.[1];
    if (xyz) {
      const parts = xyz.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) parsed.origin = parts;
    }
    const rpy = /<origin\s+[^>]*rpy="([^"]+)"/.exec(joint)?.[1];
    if (rpy) {
      const parts = rpy.trim().split(/\s+/).map(Number);
      parsed.rotated = parts.some((v) => Number.isFinite(v) && Math.abs(v) > 1e-9);
    }
    const lower = /<limit\s+[^>]*lower="([\d.eE+-]+)"/.exec(joint)?.[1];
    const upper = /<limit\s+[^>]*upper="([\d.eE+-]+)"/.exec(joint)?.[1];
    if (lower != null && Number.isFinite(Number(lower))) parsed.lower = Number(lower);
    if (upper != null && Number.isFinite(Number(upper))) parsed.upper = Number(upper);
    jointByChild.set(child, parsed);
  }

  /**
   * WORLD position of a link = the sum of joint origins walking child → parent
   * → … → base_link (3e: spatial groups chain placements — reading a nested
   * link's local origin as world was a shared-blind-spot false consensus).
   * Convention note: THIS compiler echoes each link's local joint origin into
   * its visual origin, so the visual origin is NOT additive placement — the
   * chain sum alone is the world position (the echo-vs-ROS-semantics question
   * is filed as its own canary task, not decided here). Returns null when any
   * chain joint carries a non-zero rpy (rotation composition out of scope —
   * abstain rather than emit a wrong world fact) or on a malformed chain.
   */
  function worldChainOrigin(link: string): number[] | null {
    const sum = [0, 0, 0];
    let cur: string | undefined = link;
    for (let hops = 0; cur && hops < 64; hops++) {
      const j: ParsedJoint | undefined = jointByChild.get(cur);
      if (!j) return sum; // reached a root (base_link)
      if (j.rotated) return null;
      if (j.origin) {
        sum[0] += j.origin[0];
        sum[1] += j.origin[1];
        sum[2] += j.origin[2];
      }
      cur = j.parent;
    }
    return cur ? null : sum; // cycle/overflow = malformed, abstain
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

    // WORLD position via the kinematic chain (3e). Abstain (leave position
    // unset) on rotated or malformed chains rather than emit a wrong fact.
    const world = worldChainOrigin(label);
    if (world) entity.position = world;

    // Reach envelope (3d): an OUTER bound on where this link can be — the safe
    // direction for a falsification oracle (over-approximating reach can only
    // produce false CONSENSUS on grounding, never a false FALSIFIED).
    //   fixed                → the link stays put: radius = extent.
    //   revolute/continuous  → rotation about an axis through the joint origin
    //                          preserves distance from it: radius = extent
    //                          (the visual center coincides with the joint
    //                          origin under this compiler's echo convention).
    //   prismatic            → translation within [lower,upper] along an axis:
    //                          radius = extent + max(|lower|,|upper|)
    //                          (sphere over the swept segment; limits required —
    //                          unlimited travel = unknown envelope, abstain).
    //   floating/planar/other → envelope unknown, abstain (no reachRadius).
    const joint = jointByChild.get(label);
    const jointType = joint?.type ?? 'fixed';
    entity.mobility = jointType === 'fixed' ? 'fixed' : 'actuated';
    if (world && entity.extent != null) {
      entity.reachCenter = world;
      if (jointType === 'fixed') {
        entity.reachRadius = entity.extent;
      } else if (jointType === 'revolute' || jointType === 'continuous') {
        entity.reachRadius = entity.extent;
      } else if (jointType === 'prismatic' && joint?.lower != null && joint?.upper != null) {
        entity.reachRadius =
          entity.extent + Math.max(Math.abs(joint.lower), Math.abs(joint.upper));
      }
      // other types: reachRadius stays undefined — grounding abstains
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
