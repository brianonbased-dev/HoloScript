/**
 * Creator Playable-Template Pipeline — HoloLand content authoring surface.
 *
 * Scope (task_1778186605462_muzd):
 *   - CreatorTemplate: what a creator fills in to generate a Shard
 *   - PlayableChallenge: the generated output, validated as PLAYABLE not decorative
 *   - PublishReview: gate before a challenge becomes a visible HoloLand product slice
 *   - Validation gates: playability scoring, cross-reference integrity, enum drift
 *   - Compiler/runtime hooks: compileTemplateToChallenge, submitForReview, approveChallenge
 *
 * Design contract:
 *   1. Typed surface — CreatorTemplate, PlayableChallenge, PublishReview, gates.
 *   2. Working pipeline — template parameters → generated shard → playability check
 *     → validation receipt → publish review → approved product slice.
 *   3. Tests — valid template/challenge/review pairs + deliberately-broken false cases
 *     (G.GOLD.013 discipline).
 *   4. No gold-plating — no UI, no storage backend, no telemetry. Those land when
 *     a Studio consumer needs them.
 *
 * Sibling to frontier-shard.ts (task_1778186605462_2mlp):
 *   - frontier-shard.ts ─ WHAT THE CONTENT IS (Shard/Zone/Encounter/Quest/...)
 *   - creator-template.ts ─ HOW CREATORS MAKE IT (templates → challenges → reviews)
 * The two are wired by PlayableChallenge.generatedShard, which is a frontier-shard
 * Shard that has passed playability gates.
 *
 * @version 1.0.0
 * @module @holoscript/framework/creator-template
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';
import type {
  ValidationReceipt,
} from './hololand-receipts';
export type { ValidationReceipt } from './hololand-receipts';
import type {
  Shard,
} from './frontier-shard';
export type { Shard } from './frontier-shard';
import {
  validateShard,
} from './frontier-shard';

// ── Template Parameter ──

/**
 * Parameter kind. Drives UI rendering and type-checking during template
 * compilation.
 *
 * - string    — free-text input (name, description, flavour text)
 * - number    — numeric input (difficulty multiplier, reward count)
 * - enum      — closed-set choice (biome, trigger kind, rarity)
 * - shard-ref — reference to an existing Shard (for remix/sequel templates)
 */
export const TEMPLATE_PARAMETER_KINDS = [
  'string',
  'number',
  'enum',
  'shard-ref',
] as const;

export type TemplateParameterKind = (typeof TEMPLATE_PARAMETER_KINDS)[number];

export interface TemplateParameter {
  /** Stable parameter id, e.g. `param_difficulty`. */
  id: string;
  /** Human-readable label shown to creators. */
  name: string;
  /** Parameter kind — drives validation and UI. */
  kind: TemplateParameterKind;
  /** Default value used when the creator does not override. */
  defaultValue?: unknown;
  /** Closed-set allowed values (required when `kind === 'enum'`). */
  allowedValues?: unknown[];
  /** One-line description of what this parameter controls. */
  description?: string;
  metadata?: Record<string, unknown>;
}

// ── Playability Requirements ──

/**
 * Minimum thresholds a generated Shard must meet to be considered PLAYABLE
 * rather than decorative. These are per-template overrides; the framework
 * supplies sensible defaults.
 */
export interface PlayabilityRequirements {
  /** Minimum number of Encounters. Default: 1. */
  minEncounters: number;
  /** Minimum number of Quests. Default: 1. */
  minQuests: number;
  /** Minimum total QuestSteps across all Quests. Default: 1. */
  minQuestSteps: number;
  /** Minimum number of Items. Default: 1. */
  minItems: number;
  /** Minimum number of Skills. Default: 1. */
  minSkills: number;
  /** Minimum number of LootTables. Default: 1. */
  minLootTables: number;
  /** Whether every cross-reference (zoneId, lootTableId, itemId, skillId) must resolve. Default: true. */
  requireCrossReferences: boolean;
  /** Whether the Shard must contain at least one reward path (item or skill granted via quest step or loot table). Default: true. */
  requireRewardPath: boolean;
}

/** Default playability requirements — conservative for a minimal playable challenge. */
export const DEFAULT_PLAYABILITY_REQUIREMENTS: PlayabilityRequirements = {
  minEncounters: 1,
  minQuests: 1,
  minQuestSteps: 1,
  minItems: 1,
  minSkills: 1,
  minLootTables: 1,
  requireCrossReferences: true,
  requireRewardPath: true,
};

// ── CreatorTemplate ──

/**
 * Creator-facing template definition. A template is a blueprint that:
 *   1. Contains a base Shard (the starting point)
 *   2. Declares parameter slots creators can customize
 *   3. Specifies playability requirements the generated challenge must meet
 *
 * The compiler (`compileTemplateToChallenge`) consumes a template + parameter
 * values and emits a `PlayableChallenge`.
 */
export interface CreatorTemplate {
  /** Stable template id, e.g. `tmpl_oasis_ambush_001`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description shown in template galleries / kiosks. */
  description?: string;
  /** Template family. Drives default UI grouping and default playability reqs. */
  templateKind: 'challenge' | 'scene' | 'quest-chain' | 'template-other';
  /** Free-form kind label when `templateKind` is `template-other`. */
  templateKindLabel?: string;
  /** The starting Shard. Parameters mutate shallow copies of this base. */
  baseShard: Shard;
  /** Ordered parameter schema. */
  parameters: TemplateParameter[];
  /** Playability thresholds. Omit to use `DEFAULT_PLAYABILITY_REQUIREMENTS`. */
  playabilityRequirements?: PlayabilityRequirements;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── PlayableChallenge ──

/**
 * The output of compiling a CreatorTemplate. Wraps a generated Shard with
 * playability scoring and a ValidationReceipt proving it round-trips.
 *
 * Status lifecycle:
 *   draft     — generated but not yet validated
 *   playable  — passed playability gates + has a ValidationReceipt
 *   published — approved by a PublishReview, visible in kiosk
 *   rejected  — failed review or gates, not visible in kiosk
 */
export interface PlayableChallenge {
  /** Stable challenge id, e.g. `chal_oasis_ambush_20260507_abc`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  description?: string;
  /** The generated Shard — the actual playable content. */
  generatedShard: Shard;
  /** Playability score [0..1]. 1.0 = exceeds all requirements. */
  playabilityScore: number;
  /** Validation receipt proving the challenge round-trips. */
  validationReceipt: ValidationReceipt;
  /** Lifecycle status. */
  status: 'draft' | 'playable' | 'published' | 'rejected';
  /** Creator identity — wallet address, agent handle, or other stable id. */
  creatorId: string;
  /** Creation timestamp (ISO-8601 or Unix ms). */
  createdAt: string | number;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── PublishReview ──

/**
 * Gate before a PlayableChallenge becomes visible as a HoloLand product slice.
 *
 * Reviews are lightweight — a reviewer (agent or human) inspects the challenge
 * and flips status. No complex workflow; escalation to a full audit lands only
 * when a challenge is flagged.
 */
export interface PublishReview {
  /** Stable review id, e.g. `rev_oasis_ambush_20260507_abc`. */
  id: string;
  /** Challenge id under review. */
  challengeId: string;
  /** Reviewer identity. Omit when status is `pending`. */
  reviewerId?: string;
  /** Review status. */
  status: 'pending' | 'approved' | 'rejected';
  /** Free-form review notes (rejection reason, approval comment). */
  notes?: string;
  /** When the review was resolved. Omit when `pending`. */
  reviewedAt?: string | number;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Type guards ──

export function isSupportedTemplateParameterKind(kind: string): kind is TemplateParameterKind {
  return (TEMPLATE_PARAMETER_KINDS as readonly string[]).includes(kind);
}

// ── Validators ──

export function validateTemplateParameter(param: TemplateParameter): string[] {
  const errors: string[] = [];
  if (!param.id) errors.push('TemplateParameter.id is required.');
  if (!param.name) errors.push(`TemplateParameter ${param.id || '<unknown>'}.name is required.`);
  if (!isSupportedTemplateParameterKind(param.kind)) {
    errors.push(`TemplateParameter ${param.id}.kind is unsupported: ${String(param.kind)}.`);
  }
  if (param.kind === 'enum' && (!Array.isArray(param.allowedValues) || param.allowedValues.length === 0)) {
    errors.push(`TemplateParameter ${param.id} kind=enum requires non-empty allowedValues.`);
  }
  return errors;
}

export function validatePlayabilityRequirements(req: PlayabilityRequirements): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(req.minEncounters) || req.minEncounters < 0) {
    errors.push('PlayabilityRequirements.minEncounters must be a non-negative finite number.');
  }
  if (!Number.isFinite(req.minQuests) || req.minQuests < 0) {
    errors.push('PlayabilityRequirements.minQuests must be a non-negative finite number.');
  }
  if (!Number.isFinite(req.minQuestSteps) || req.minQuestSteps < 0) {
    errors.push('PlayabilityRequirements.minQuestSteps must be a non-negative finite number.');
  }
  if (!Number.isFinite(req.minItems) || req.minItems < 0) {
    errors.push('PlayabilityRequirements.minItems must be a non-negative finite number.');
  }
  if (!Number.isFinite(req.minSkills) || req.minSkills < 0) {
    errors.push('PlayabilityRequirements.minSkills must be a non-negative finite number.');
  }
  if (!Number.isFinite(req.minLootTables) || req.minLootTables < 0) {
    errors.push('PlayabilityRequirements.minLootTables must be a non-negative finite number.');
  }
  return errors;
}

export function validateCreatorTemplate(template: CreatorTemplate): string[] {
  const errors: string[] = [];
  if (!template.id) errors.push('CreatorTemplate.id is required.');
  if (!template.name) errors.push(`CreatorTemplate ${template.id || '<unknown>'}.name is required.`);
  if (!template.baseShard) {
    errors.push(`CreatorTemplate ${template.id}.baseShard is required.`);
  } else {
    for (const e of validateShard(template.baseShard)) {
      errors.push(`CreatorTemplate ${template.id}.baseShard: ${e}`);
    }
  }
  if (!Array.isArray(template.parameters)) {
    errors.push(`CreatorTemplate ${template.id}.parameters must be an array.`);
  } else {
    for (const param of template.parameters) {
      for (const e of validateTemplateParameter(param)) {
        errors.push(`CreatorTemplate ${template.id}.parameters[${param.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  if (template.playabilityRequirements) {
    for (const e of validatePlayabilityRequirements(template.playabilityRequirements)) {
      errors.push(`CreatorTemplate ${template.id}.playabilityRequirements: ${e}`);
    }
  }
  return errors;
}

export function validatePlayableChallenge(challenge: PlayableChallenge): string[] {
  const errors: string[] = [];
  if (!challenge.id) errors.push('PlayableChallenge.id is required.');
  if (!challenge.name) errors.push(`PlayableChallenge ${challenge.id || '<unknown>'}.name is required.`);
  if (!challenge.generatedShard) {
    errors.push(`PlayableChallenge ${challenge.id}.generatedShard is required.`);
  } else {
    for (const e of validateShard(challenge.generatedShard)) {
      errors.push(`PlayableChallenge ${challenge.id}.generatedShard: ${e}`);
    }
  }
  if (!Number.isFinite(challenge.playabilityScore) || challenge.playabilityScore < 0 || challenge.playabilityScore > 1) {
    errors.push(`PlayableChallenge ${challenge.id}.playabilityScore must be in [0, 1].`);
  }
  if (!challenge.validationReceipt) {
    errors.push(`PlayableChallenge ${challenge.id}.validationReceipt is required.`);
  } else {
    if (!challenge.validationReceipt.id) {
      errors.push(`PlayableChallenge ${challenge.id}.validationReceipt.id is required.`);
    }
    if (!challenge.validationReceipt.scenarioId) {
      errors.push(`PlayableChallenge ${challenge.id}.validationReceipt.scenarioId is required.`);
    }
    if (!challenge.validationReceipt.hash) {
      errors.push(`PlayableChallenge ${challenge.id}.validationReceipt.hash is required.`);
    }
    if (!challenge.validationReceipt.hashAlgorithm) {
      errors.push(`PlayableChallenge ${challenge.id}.validationReceipt.hashAlgorithm is required.`);
    }
    if (
      challenge.validationReceipt.validatedAt === undefined ||
      challenge.validationReceipt.validatedAt === null ||
      challenge.validationReceipt.validatedAt === ''
    ) {
      errors.push(`PlayableChallenge ${challenge.id}.validationReceipt.validatedAt is required.`);
    }
  }
  if (!challenge.creatorId) errors.push(`PlayableChallenge ${challenge.id}.creatorId is required.`);
  if (
    challenge.createdAt === undefined ||
    challenge.createdAt === null ||
    challenge.createdAt === ''
  ) {
    errors.push(`PlayableChallenge ${challenge.id}.createdAt is required.`);
  }
  const validStatuses = ['draft', 'playable', 'published', 'rejected'] as const;
  if (!validStatuses.includes(challenge.status)) {
    errors.push(`PlayableChallenge ${challenge.id}.status is unsupported: ${String(challenge.status)}.`);
  }
  return errors;
}

export function validatePublishReview(review: PublishReview): string[] {
  const errors: string[] = [];
  if (!review.id) errors.push('PublishReview.id is required.');
  if (!review.challengeId) errors.push(`PublishReview ${review.id || '<unknown>'}.challengeId is required.`);
  const validStatuses = ['pending', 'approved', 'rejected'] as const;
  if (!validStatuses.includes(review.status)) {
    errors.push(`PublishReview ${review.id}.status is unsupported: ${String(review.status)}.`);
  }
  if ((review.status === 'approved' || review.status === 'rejected') && !review.reviewerId) {
    errors.push(`PublishReview ${review.id} status=${review.status} requires reviewerId.`);
  }
  if ((review.status === 'approved' || review.status === 'rejected') && (
    review.reviewedAt === undefined || review.reviewedAt === null || review.reviewedAt === ''
  )) {
    errors.push(`PublishReview ${review.id} status=${review.status} requires reviewedAt.`);
  }
  return errors;
}

// ── Playability gates ──

/**
 * Score a Shard against playability requirements.
 *
 * Returns:
 *   - score: [0..1] aggregate score (1.0 when every requirement is met or exceeded)
 *   - passed: true when ALL hard requirements are satisfied
 *   - violations: human-readable strings for every unmet requirement
 *
 * The score is the ratio of satisfied requirements to total requirements.
 * When `requireCrossReferences` is true, cross-reference errors from
 * `validateShard` are counted as a single failed requirement.
 * When `requireRewardPath` is true, the shard must have at least one item or
 * skill reachable via a quest step reward or loot table entry.
 */
export function checkPlayability(
  shard: Shard,
  requirements: PlayabilityRequirements = DEFAULT_PLAYABILITY_REQUIREMENTS,
): { score: number; passed: boolean; violations: string[] } {
  const violations: string[] = [];
  let satisfied = 0;
  let total = 0;

  // Helper: count + check
  function check(name: string, actual: number, min: number): void {
    total++;
    if (actual >= min) {
      satisfied++;
    } else {
      violations.push(`${name}: ${actual} < ${min}`);
    }
  }

  check('encounters', shard.encounters?.length ?? 0, requirements.minEncounters);
  check('quests', shard.quests?.length ?? 0, requirements.minQuests);
  const totalSteps = shard.quests?.reduce((acc: number, q) => acc + (q.steps?.length ?? 0), 0) ?? 0;
  check('questSteps', totalSteps, requirements.minQuestSteps);
  check('items', shard.items?.length ?? 0, requirements.minItems);
  check('skills', shard.skills?.length ?? 0, requirements.minSkills);
  check('lootTables', shard.lootTables?.length ?? 0, requirements.minLootTables);

  // Cross-reference integrity
  total++;
  const structuralErrors = validateShard(shard);
  const hasCrossRefErrors = structuralErrors.some((e) =>
    e.includes('references unknown') || e.includes('references unknown'),
  );
  if (requirements.requireCrossReferences) {
    if (hasCrossRefErrors) {
      violations.push(`crossReferences: structural errors present (${structuralErrors.filter((e) => e.includes('references unknown')).length} cross-ref failures)`);
    } else {
      satisfied++;
    }
  } else {
    satisfied++; // not required = auto-satisfied
  }

  // Reward path
  total++;
  if (requirements.requireRewardPath) {
    const itemIds = new Set(shard.items?.map((i: { id: string }) => i.id) ?? []);
    const skillIds = new Set(shard.skills?.map((s: { id: string }) => s.id) ?? []);
    let hasReward = false;

    // Quest step rewards
    for (const quest of shard.quests ?? []) {
      for (const step of quest.steps ?? []) {
        for (const rid of step.rewardItemIds ?? []) {
          if (itemIds.has(rid)) {
            hasReward = true;
            break;
          }
        }
        if (hasReward) break;
      }
      if (hasReward) break;
    }

    // Loot table entries
    if (!hasReward) {
      for (const table of shard.lootTables ?? []) {
        for (const entry of table.entries ?? []) {
          if ((entry.itemId && itemIds.has(entry.itemId)) || (entry.skillId && skillIds.has(entry.skillId))) {
            hasReward = true;
            break;
          }
        }
        if (hasReward) break;
      }
    }

    if (hasReward) {
      satisfied++;
    } else {
      violations.push('rewardPath: no reachable item or skill reward via quest steps or loot tables');
    }
  } else {
    satisfied++; // not required = auto-satisfied
  }

  const score = total === 0 ? 1.0 : satisfied / total;
  return { score, passed: violations.length === 0, violations };
}

// ── Cloning ──

function cloneProvenance(
  provenance: ArtifactProvenanceLink | undefined,
): ArtifactProvenanceLink | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}

export function cloneTemplateParameter(param: TemplateParameter): TemplateParameter {
  return {
    ...param,
    ...(param.allowedValues ? { allowedValues: [...param.allowedValues] } : {}),
    ...(param.metadata ? { metadata: { ...param.metadata } } : {}),
  };
}

export function clonePlayabilityRequirements(req: PlayabilityRequirements): PlayabilityRequirements {
  return { ...req };
}

export function cloneCreatorTemplate(template: CreatorTemplate): CreatorTemplate {
  return {
    ...template,
    parameters: template.parameters.map(cloneTemplateParameter),
    baseShard: structuredClone(template.baseShard),
    ...(template.playabilityRequirements
      ? { playabilityRequirements: clonePlayabilityRequirements(template.playabilityRequirements) }
      : {}),
    ...(template.provenance ? { provenance: cloneProvenance(template.provenance) } : {}),
    ...(template.metadata ? { metadata: { ...template.metadata } } : {}),
  };
}

export function clonePlayableChallenge(challenge: PlayableChallenge): PlayableChallenge {
  return {
    ...challenge,
    generatedShard: structuredClone(challenge.generatedShard),
    validationReceipt: structuredClone(challenge.validationReceipt),
    ...(challenge.provenance ? { provenance: cloneProvenance(challenge.provenance) } : {}),
    ...(challenge.metadata ? { metadata: { ...challenge.metadata } } : {}),
  };
}

export function clonePublishReview(review: PublishReview): PublishReview {
  return {
    ...review,
    ...(review.provenance ? { provenance: cloneProvenance(review.provenance) } : {}),
    ...(review.metadata ? { metadata: { ...review.metadata } } : {}),
  };
}
