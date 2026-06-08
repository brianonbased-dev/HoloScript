/**
 * rig_match_skeleton MCP tool
 *
 * Given a list of bone names from an unknown rig, ranks all registered
 * SkeletonStandard profiles by overlap score and returns:
 *   - Top-N ranked candidates (standard id, overlap, confidence, matched/unmatched bones)
 *   - A RefusableDiff: per-bone mapping suggestion from the top candidate to the
 *     HoloScript 65-bone canonical, with a "refusal" flag per bone where the
 *     mapping confidence is below a configurable threshold.
 *
 * Gap addressed: G4 from research/2026-04-28_holo-skeleton-gap.md
 * Design ref: D.027 (RefusableDiff pattern — ranked candidates + RefusableDiff)
 *
 * @module mcp-server/tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  matchSkeletonStandard,
  buildReverseMap,
  SKELETON_PROFILES,
  type SkeletonMatchCandidate,
  type SkeletonStandardId,
} from '@holoscript/engine/character';
import { HUMANOID_BONE_NAMES } from '@holoscript/engine/character';

// =============================================================================
// Tool definition
// =============================================================================

export const rigMatchSkeletonToolDefinition: Tool = {
  name: 'rig_match_skeleton',
  description:
    'Given a list of bone names from an unknown 3D rig, ranks all registered HoloScript ' +
    'skeleton standards (VRM 1.0, VRM 0.x, Ready Player Me, Mixamo, UE Mannequin, MetaHuman, ' +
    'DAZ Genesis 8/9, AutoRig Pro, CC3, HoloScript 65-bone canonical) by bone-name overlap. ' +
    'Returns the top-N ranked candidates plus a RefusableDiff — a per-bone mapping proposal ' +
    'from the best match to the HoloScript canonical that flags low-confidence mappings for ' +
    'human review. Use this before retargeting animations to an unknown avatar skeleton.',
  inputSchema: {
    type: 'object' as const,
    required: ['boneNames'],
    properties: {
      boneNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of bone names extracted from the rig (case-sensitive, as they appear in ' +
          'the glTF/FBX/VRM file). Typically 20–70 names for a humanoid.',
        minItems: 1,
        maxItems: 500,
      },
      topN: {
        type: 'number',
        description:
          'Maximum number of ranked candidates to return (default 5, max 11 — one per standard).',
        default: 5,
        minimum: 1,
        maximum: 11,
      },
      refusalThreshold: {
        type: 'number',
        description:
          'Weighted-score threshold below which a bone mapping is flagged as "refused" ' +
          'in the RefusableDiff and requires human confirmation (default 0.6, range 0.0–1.0). ' +
          'Higher = more conservative; lower = more permissive.',
        default: 0.6,
        minimum: 0.0,
        maximum: 1.0,
      },
    },
  },
};

// =============================================================================
// RefusableDiff types
// =============================================================================

export interface BoneMappingEntry {
  /** Bone name as it appears in the input rig. */
  inputBone: string;
  /** HoloScript 65-bone canonical name this input bone maps to. */
  canonicalBone: string | null;
  /** Platform name for this canonical bone in the top-ranked standard. */
  platformName: string | null;
  /** Whether this mapping is below the refusal threshold and needs human review. */
  refused: boolean;
  /** Reason for refusal (human-readable). */
  refusalReason?: string;
}

export interface RefusableDiff {
  /** The skeleton standard used to generate this diff. */
  standard: SkeletonStandardId;
  /** Weighted score of the chosen standard (0.0–1.0). */
  weightedScore: number;
  /**
   * Per-bone mapping entries.
   * Order matches the input `boneNames` array.
   */
  entries: BoneMappingEntry[];
  /**
   * Canonical bones that appear in the 65-bone template but have no
   * corresponding input bone — these would be missing from the retargeted rig.
   */
  missingCanonicalBones: string[];
  /** Total number of refused mappings. */
  refusedCount: number;
  /** True when zero mappings are refused (diff is fully auto-approvable). */
  autoApprovable: boolean;
}

// =============================================================================
// Tool handler
// =============================================================================

export interface RigMatchSkeletonInput {
  boneNames: string[];
  topN?: number;
  refusalThreshold?: number;
}

export interface RigMatchSkeletonOutput {
  /** Input bone count. */
  inputBoneCount: number;
  /** Ranked skeleton standard candidates. */
  candidates: SkeletonMatchCandidate[];
  /** RefusableDiff built from the top-ranked candidate. */
  refusableDiff: RefusableDiff | null;
  /** Summary message. */
  summary: string;
}

export function handleRigMatchSkeleton(input: RigMatchSkeletonInput): RigMatchSkeletonOutput {
  const { boneNames, topN = 5, refusalThreshold = 0.6 } = input;

  if (!boneNames || boneNames.length === 0) {
    return {
      inputBoneCount: 0,
      candidates: [],
      refusableDiff: null,
      summary: 'No bone names provided.',
    };
  }

  // Rank candidates
  const candidates = matchSkeletonStandard(boneNames, Math.min(topN, 11));

  if (candidates.length === 0) {
    return {
      inputBoneCount: boneNames.length,
      candidates: [],
      refusableDiff: null,
      summary: 'No skeleton standards registered.',
    };
  }

  // Build RefusableDiff from the top candidate
  const topCandidate = candidates[0];
  const refusableDiff = buildRefusableDiff(
    boneNames,
    topCandidate,
    refusalThreshold
  );

  const summary = buildSummary(boneNames, topCandidate, refusableDiff);

  return {
    inputBoneCount: boneNames.length,
    candidates,
    refusableDiff,
    summary,
  };
}

// =============================================================================
// RefusableDiff builder
// =============================================================================

function buildRefusableDiff(
  inputBones: string[],
  topCandidate: SkeletonMatchCandidate,
  refusalThreshold: number
): RefusableDiff {
  const { standard, weightedScore } = topCandidate;
  const profile = SKELETON_PROFILES[standard];
  const reverseMap = buildReverseMap(standard);
  const inputSet = new Set(inputBones);

  const entries: BoneMappingEntry[] = inputBones.map((inputBone) => {
    const canonicalBone = reverseMap.get(inputBone) ?? null;
    const platformName = canonicalBone
      ? (profile.boneMap[canonicalBone]?.platformName ?? null)
      : null;

    let refused = false;
    let refusalReason: string | undefined;

    if (canonicalBone === null) {
      refused = true;
      refusalReason = `Bone "${inputBone}" has no mapping in standard "${standard}". Manual mapping required.`;
    } else if (weightedScore < refusalThreshold) {
      refused = true;
      refusalReason =
        `Standard "${standard}" weighted score (${weightedScore.toFixed(2)}) is below ` +
        `refusal threshold (${refusalThreshold.toFixed(2)}). Verify mapping manually.`;
    }

    return {
      inputBone,
      canonicalBone,
      platformName,
      refused,
      refusalReason,
    };
  });

  // Find canonical bones with no corresponding input bone
  const mappedCanonicals = new Set(
    entries.filter((e) => e.canonicalBone !== null).map((e) => e.canonicalBone!)
  );
  const missingCanonicalBones = HUMANOID_BONE_NAMES.filter(
    (b) => !mappedCanonicals.has(b)
  );

  const refusedCount = entries.filter((e) => e.refused).length;

  return {
    standard,
    weightedScore,
    entries,
    missingCanonicalBones,
    refusedCount,
    autoApprovable: refusedCount === 0,
  };
}

// =============================================================================
// Summary builder
// =============================================================================

function buildSummary(
  inputBones: string[],
  topCandidate: SkeletonMatchCandidate,
  diff: RefusableDiff
): string {
  const lines: string[] = [
    `Input: ${inputBones.length} bones`,
    `Top match: ${topCandidate.standard} ` +
      `(overlap=${(topCandidate.overlapScore * 100).toFixed(1)}%, ` +
      `weighted=${topCandidate.weightedScore.toFixed(3)})`,
    `Matched: ${topCandidate.matchedBones.length} / ${inputBones.length} bones`,
  ];

  if (topCandidate.unmatchedBones.length > 0) {
    const preview = topCandidate.unmatchedBones.slice(0, 5).join(', ');
    const more = topCandidate.unmatchedBones.length > 5
      ? ` … +${topCandidate.unmatchedBones.length - 5} more`
      : '';
    lines.push(`Unmatched: ${preview}${more}`);
  }

  if (diff.missingCanonicalBones.length > 0) {
    lines.push(
      `Missing canonical bones (rig lacks them): ${diff.missingCanonicalBones.length} ` +
        `(e.g. ${diff.missingCanonicalBones.slice(0, 3).join(', ')})`
    );
  }

  if (diff.autoApprovable) {
    lines.push('RefusableDiff: AUTO-APPROVABLE — all mappings above confidence threshold.');
  } else {
    lines.push(
      `RefusableDiff: ${diff.refusedCount} mapping(s) REFUSED — require human review.`
    );
  }

  return lines.join('\n');
}
