/**
 * Frontier Shard 0 — canonical content primitives for HoloLand.
 *
 * HoloLand's product gap is content authoring: a Shard is the unit of
 * playable, validatable HoloLand content. A Shard contains Zones (spatial
 * regions), Encounters (scripted moments), Quests (multi-step objectives),
 * Items (collectible payloads), Skills (agent-side capability gates), and
 * LootTables (probabilistic reward bindings).
 *
 * Layered on top of the existing ArtifactReceipt + ValidationReceipt
 * infrastructure in this package. Shard 0 is the bootstrap shard — every
 * later shard inherits its schema and validator surface.
 *
 * Sibling to `hololand-receipts.ts` (task_1778186605462_4z0o):
 *   - hololand-receipts.ts ─ capture/replay/agent-action receipts
 *     (proof of WHAT HAPPENED on a Shard)
 *   - frontier-shard.ts    ─ Shard/Zone/Encounter/Quest/Item/Skill/LootTable
 *     (proof of WHAT THE CONTENT IS)
 * The two are wired together by ShardReceipt, which references
 * ValidationReceipts as evidence that a Shard's encounters round-trip.
 *
 * Created: task_1778186605462_2mlp (P1 holoscript-upstream)
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';
import type { ValidationReceipt } from './hololand-receipts';
import { validateSpatialRule, cloneSpatialRule } from './spatial-logic';
import type { SpatialRule } from './spatial-logic';

// ── Skill — agent-side capability gate ──

/**
 * Skill rarity tier. Drives default LootTable weights and gating cost.
 *
 * - common      — baseline capability every steward picks up early
 * - uncommon    — non-trivial capability, modest gate
 * - rare        — meaningful gate, blocks ~half of attempts at first contact
 * - epic        — capstone capability, often quest-locked
 * - legendary   — single-instance / lore-bearing capability
 * - skill-other — anything outside the enumerated set; describe in
 *   `Skill.rarityLabel`.
 */
export const SKILL_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'skill-other',
] as const;

export type SkillRarity = (typeof SKILL_RARITIES)[number];

export interface Skill {
  /** Stable skill id, e.g. `skill_lockpick_basic`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Rarity bucket. Use `skill-other` and `rarityLabel` for off-list. */
  rarity: SkillRarity;
  /** Free-form rarity label when `rarity` is `skill-other`. */
  rarityLabel?: string;
  /** One-line description shown to stewards/players. */
  description?: string;
  /** Other skill ids that unlock this one. */
  prerequisites?: string[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Item — collectible / payload ──

/**
 * Item category. Drives default storage + LootTable bucketing.
 *
 * - artifact   — story-significant carry-able item
 * - consumable — single-use payload (potion, key, token)
 * - equipment  — durable equipment (gear, tool)
 * - currency   — fungible value-bearing token
 * - quest-item — bound to a Quest and not freely tradable
 * - cosmetic   — visual-only collectible
 * - item-other — anything outside the enumerated set; describe in
 *   `Item.categoryLabel`.
 */
export const ITEM_CATEGORIES = [
  'artifact',
  'consumable',
  'equipment',
  'currency',
  'quest-item',
  'cosmetic',
  'item-other',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface Item {
  /** Stable item id, e.g. `item_compass_brass_001`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Category bucket. Use `item-other` and `categoryLabel` for off-list. */
  category: ItemCategory;
  /** Free-form category label when `category` is `item-other`. */
  categoryLabel?: string;
  /** One-line description. */
  description?: string;
  /** Stack size cap for consumable/currency; omit for single-instance items. */
  stackSize?: number;
  /** Hash of the canonical item body (id + immutable fields). */
  hash?: string;
  hashAlgorithm?: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── LootTable — probabilistic reward binding ──

/**
 * Single entry in a LootTable. Either references an Item or a Skill (not both).
 */
export interface LootTableEntry {
  /** Stable entry id within the table. */
  id: string;
  /** Item id awarded (mutually exclusive with `skillId`). */
  itemId?: string;
  /** Skill id granted (mutually exclusive with `itemId`). */
  skillId?: string;
  /** Relative weight in the table. Must be a non-negative finite number. */
  weight: number;
  /** Optional fixed quantity (for items). Defaults to 1 when omitted. */
  quantity?: number;
  /** Optional gating condition expression (consumer-defined). */
  condition?: string;
  metadata?: Record<string, unknown>;
}

export interface LootTable {
  /** Stable table id, e.g. `loot_chest_common_001`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Drop entries. Weights are relative; consumer normalizes at roll-time. */
  entries: LootTableEntry[];
  /** Maximum number of independent rolls per invocation. Defaults to 1. */
  rollsPerInvocation?: number;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Encounter — scripted moment ──

/**
 * Encounter trigger kind. Drives how the Shard runtime arms the encounter.
 *
 * - on-enter        — fires when an agent first enters the parent Zone
 * - on-interact     — fires on explicit interact action
 * - on-quest-step   — fires when a referenced Quest reaches a step
 * - on-timer        — fires after a duration once armed
 * - on-broadcast    — fires on a named broadcast event
 * - encounter-other — anything outside the enumerated set; describe in
 *   `Encounter.triggerLabel`.
 */
export const ENCOUNTER_TRIGGER_KINDS = [
  'on-enter',
  'on-interact',
  'on-quest-step',
  'on-timer',
  'on-broadcast',
  'encounter-other',
] as const;

export type EncounterTriggerKind = (typeof ENCOUNTER_TRIGGER_KINDS)[number];

export interface Encounter {
  /** Stable encounter id, e.g. `enc_camp_ambush_001`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Trigger family. Use `encounter-other` and `triggerLabel` for off-list. */
  trigger: EncounterTriggerKind;
  /** Free-form trigger label when `trigger` is `encounter-other`. */
  triggerLabel?: string;
  /** Zone id this encounter is bound to (must be a Zone in the same Shard). */
  zoneId: string;
  /** Optional LootTable id to roll on completion. */
  lootTableId?: string;
  /** Optional Quest step reference (`<questId>:<stepId>`). */
  questStepRef?: string;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Quest — multi-step objective ──

export interface QuestStep {
  /** Stable step id within the parent Quest. */
  id: string;
  /** One-line objective shown to stewards/players. */
  objective: string;
  /** Skill id required to begin this step (optional gate). */
  requiresSkillId?: string;
  /** Encounter ids that satisfy this step. */
  encounterIds?: string[];
  /** Optional fixed reward Item ids granted on step completion. */
  rewardItemIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface Quest {
  /** Stable quest id, e.g. `quest_oasis_first_breath`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Ordered steps. Must be non-empty. */
  steps: QuestStep[];
  /** Optional LootTable id rolled on full quest completion. */
  rewardLootTableId?: string;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Zone — spatial region inside a Shard ──

/**
 * Zone biome bucket. Free string; this list is convention, not enum.
 * Stewards may extend with shard-local biomes.
 */
export const ZONE_BIOMES = [
  'urban',
  'wilderness',
  'underground',
  'aquatic',
  'aerial',
  'liminal',
  'biome-other',
] as const;

export type ZoneBiome = (typeof ZONE_BIOMES)[number];

export interface Zone {
  /** Stable zone id, e.g. `zone_market_square`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Biome bucket. Use `biome-other` and `biomeLabel` for off-list. */
  biome: ZoneBiome;
  /** Free-form biome label when `biome` is `biome-other`. */
  biomeLabel?: string;
  /** Encounter ids spawned/armed in this zone. */
  encounterIds?: string[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Shard — top-level content envelope ──

/**
 * Shard is the unit of HoloLand playable content. Aggregates every
 * primitive and is the root referenced by a ShardReceipt.
 */
export interface Shard {
  /** Stable shard id, e.g. `shard_oasis_0`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Schema version — bump when primitive shape changes incompatibly. */
  schemaVersion: number;
  /** Hash of the canonical shard body (id + ordered primitive ids). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  zones: Zone[];
  encounters: Encounter[];
  quests: Quest[];
  items: Item[];
  skills: Skill[];
  lootTables: LootTable[];
  /** Spatial Logic Framework rules for SLF-grade game intricacies. */
  spatialRules?: SpatialRule[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── ShardReceipt — top-level envelope wiring Shard + ValidationReceipts ──

/**
 * ShardReceipt — proof envelope a Shard ships with. References the
 * Shard schema body and the ValidationReceipts that prove its
 * encounters round-trip on hardware/replay.
 */
export interface ShardReceipt {
  /** Stable receipt id, e.g. `srcpt_oasis_0_20260507`. */
  id: string;
  /** Shard id this receipt is for. */
  shardId: string;
  /** Receipt status. */
  status: 'authored' | 'validated' | 'rejected' | 'inconclusive';
  /** When the receipt was sealed (ISO-8601 or Unix ms). */
  sealedAt: string | number;
  /** Hash of the canonical receipt body (id + shardId + ordered children). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Validation receipts (from hololand-receipts) that back this shard. */
  validationReceipts?: ValidationReceipt[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the shard re-loads + replays. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Type guards ──

export function isSupportedSkillRarity(rarity: string): rarity is SkillRarity {
  return (SKILL_RARITIES as readonly string[]).includes(rarity);
}

export function isSupportedItemCategory(category: string): category is ItemCategory {
  return (ITEM_CATEGORIES as readonly string[]).includes(category);
}

export function isSupportedEncounterTrigger(
  trigger: string,
): trigger is EncounterTriggerKind {
  return (ENCOUNTER_TRIGGER_KINDS as readonly string[]).includes(trigger);
}

export function isSupportedZoneBiome(biome: string): biome is ZoneBiome {
  return (ZONE_BIOMES as readonly string[]).includes(biome);
}

const SHARD_RECEIPT_STATUSES = [
  'authored',
  'validated',
  'rejected',
  'inconclusive',
] as const;

export function isSupportedShardReceiptStatus(
  status: string,
): status is ShardReceipt['status'] {
  return (SHARD_RECEIPT_STATUSES as readonly string[]).includes(status);
}

// ── Validators ──

export function validateSkill(skill: Skill): string[] {
  const errors: string[] = [];
  if (!skill.id) errors.push('Skill.id is required.');
  if (!skill.name) errors.push(`Skill ${skill.id || '<unknown>'}.name is required.`);
  if (!isSupportedSkillRarity(skill.rarity)) {
    errors.push(`Skill.rarity is unsupported: ${String(skill.rarity)}.`);
  }
  if (skill.rarity === 'skill-other' && !skill.rarityLabel) {
    errors.push(`Skill ${skill.id} rarity=skill-other requires rarityLabel.`);
  }
  return errors;
}

export function validateItem(item: Item): string[] {
  const errors: string[] = [];
  if (!item.id) errors.push('Item.id is required.');
  if (!item.name) errors.push(`Item ${item.id || '<unknown>'}.name is required.`);
  if (!isSupportedItemCategory(item.category)) {
    errors.push(`Item.category is unsupported: ${String(item.category)}.`);
  }
  if (item.category === 'item-other' && !item.categoryLabel) {
    errors.push(`Item ${item.id} category=item-other requires categoryLabel.`);
  }
  if (item.hash && !item.hashAlgorithm) {
    errors.push(`Item ${item.id}.hashAlgorithm is required when hash is set.`);
  }
  if (item.stackSize !== undefined && (!Number.isFinite(item.stackSize) || item.stackSize < 1)) {
    errors.push(`Item ${item.id}.stackSize must be a finite number >= 1.`);
  }
  return errors;
}

export function validateLootTableEntry(entry: LootTableEntry): string[] {
  const errors: string[] = [];
  if (!entry.id) errors.push('LootTableEntry.id is required.');
  const hasItem = Boolean(entry.itemId);
  const hasSkill = Boolean(entry.skillId);
  if (hasItem && hasSkill) {
    errors.push(
      `LootTableEntry ${entry.id} cannot reference both itemId and skillId (mutually exclusive).`,
    );
  }
  if (!hasItem && !hasSkill) {
    errors.push(
      `LootTableEntry ${entry.id} must reference either itemId or skillId.`,
    );
  }
  if (!Number.isFinite(entry.weight) || entry.weight < 0) {
    errors.push(`LootTableEntry ${entry.id}.weight must be a non-negative finite number.`);
  }
  if (entry.quantity !== undefined && (!Number.isFinite(entry.quantity) || entry.quantity < 1)) {
    errors.push(`LootTableEntry ${entry.id}.quantity must be a finite number >= 1.`);
  }
  return errors;
}

export function validateLootTable(table: LootTable): string[] {
  const errors: string[] = [];
  if (!table.id) errors.push('LootTable.id is required.');
  if (!table.name) errors.push(`LootTable ${table.id || '<unknown>'}.name is required.`);
  if (!Array.isArray(table.entries) || table.entries.length === 0) {
    errors.push(`LootTable ${table.id}.entries must be a non-empty array.`);
  } else {
    for (const entry of table.entries) {
      for (const e of validateLootTableEntry(entry)) {
        errors.push(`LootTable ${table.id}.entries[${entry.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  if (
    table.rollsPerInvocation !== undefined &&
    (!Number.isFinite(table.rollsPerInvocation) || table.rollsPerInvocation < 1)
  ) {
    errors.push(`LootTable ${table.id}.rollsPerInvocation must be a finite number >= 1.`);
  }
  return errors;
}

export function validateEncounter(encounter: Encounter): string[] {
  const errors: string[] = [];
  if (!encounter.id) errors.push('Encounter.id is required.');
  if (!encounter.name) {
    errors.push(`Encounter ${encounter.id || '<unknown>'}.name is required.`);
  }
  if (!isSupportedEncounterTrigger(encounter.trigger)) {
    errors.push(`Encounter.trigger is unsupported: ${String(encounter.trigger)}.`);
  }
  if (encounter.trigger === 'encounter-other' && !encounter.triggerLabel) {
    errors.push(
      `Encounter ${encounter.id} trigger=encounter-other requires triggerLabel.`,
    );
  }
  if (!encounter.zoneId) errors.push(`Encounter ${encounter.id}.zoneId is required.`);
  return errors;
}

export function validateQuestStep(step: QuestStep): string[] {
  const errors: string[] = [];
  if (!step.id) errors.push('QuestStep.id is required.');
  if (!step.objective) {
    errors.push(`QuestStep ${step.id || '<unknown>'}.objective is required.`);
  }
  return errors;
}

export function validateQuest(quest: Quest): string[] {
  const errors: string[] = [];
  if (!quest.id) errors.push('Quest.id is required.');
  if (!quest.name) errors.push(`Quest ${quest.id || '<unknown>'}.name is required.`);
  if (!Array.isArray(quest.steps) || quest.steps.length === 0) {
    errors.push(`Quest ${quest.id}.steps must be a non-empty array.`);
  } else {
    for (const step of quest.steps) {
      for (const e of validateQuestStep(step)) {
        errors.push(`Quest ${quest.id}.steps[${step.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  return errors;
}

export function validateZone(zone: Zone): string[] {
  const errors: string[] = [];
  if (!zone.id) errors.push('Zone.id is required.');
  if (!zone.name) errors.push(`Zone ${zone.id || '<unknown>'}.name is required.`);
  if (!isSupportedZoneBiome(zone.biome)) {
    errors.push(`Zone.biome is unsupported: ${String(zone.biome)}.`);
  }
  if (zone.biome === 'biome-other' && !zone.biomeLabel) {
    errors.push(`Zone ${zone.id} biome=biome-other requires biomeLabel.`);
  }
  return errors;
}

/**
 * Validate a Shard envelope. Recursively validates every primitive,
 * checks structural invariants (unique ids per primitive class,
 * cross-references resolve), and reports errors with grep-friendly
 * `<class>[id]: ` prefixes for nested errors.
 */
export function validateShard(shard: Shard): string[] {
  const errors: string[] = [];
  if (!shard.id) errors.push('Shard.id is required.');
  if (!shard.name) errors.push(`Shard ${shard.id || '<unknown>'}.name is required.`);
  if (!Number.isFinite(shard.schemaVersion) || shard.schemaVersion < 0) {
    errors.push(`Shard ${shard.id}.schemaVersion must be a non-negative finite number.`);
  }
  if (!shard.hash) errors.push(`Shard ${shard.id}.hash is required.`);
  if (!shard.hashAlgorithm) errors.push(`Shard ${shard.id}.hashAlgorithm is required.`);
  if (!Array.isArray(shard.zones)) errors.push(`Shard ${shard.id}.zones must be an array.`);
  if (!Array.isArray(shard.encounters)) errors.push(`Shard ${shard.id}.encounters must be an array.`);
  if (!Array.isArray(shard.quests)) errors.push(`Shard ${shard.id}.quests must be an array.`);
  if (!Array.isArray(shard.items)) errors.push(`Shard ${shard.id}.items must be an array.`);
  if (!Array.isArray(shard.skills)) errors.push(`Shard ${shard.id}.skills must be an array.`);
  if (!Array.isArray(shard.lootTables)) errors.push(`Shard ${shard.id}.lootTables must be an array.`);

  // Per-primitive validation
  for (const zone of shard.zones ?? []) {
    for (const e of validateZone(zone)) {
      errors.push(`Shard ${shard.id}.zones[${zone.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const encounter of shard.encounters ?? []) {
    for (const e of validateEncounter(encounter)) {
      errors.push(`Shard ${shard.id}.encounters[${encounter.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const quest of shard.quests ?? []) {
    for (const e of validateQuest(quest)) {
      errors.push(`Shard ${shard.id}.quests[${quest.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const item of shard.items ?? []) {
    for (const e of validateItem(item)) {
      errors.push(`Shard ${shard.id}.items[${item.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const skill of shard.skills ?? []) {
    for (const e of validateSkill(skill)) {
      errors.push(`Shard ${shard.id}.skills[${skill.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const table of shard.lootTables ?? []) {
    for (const e of validateLootTable(table)) {
      errors.push(`Shard ${shard.id}.lootTables[${table.id || '<unknown>'}]: ${e}`);
    }
  }
  if (shard.spatialRules !== undefined) {
    if (!Array.isArray(shard.spatialRules)) {
      errors.push(`Shard ${shard.id}.spatialRules must be an array.`);
    } else {
      for (const rule of shard.spatialRules) {
        for (const e of validateSpatialRule(rule)) {
          errors.push(`Shard ${shard.id}.spatialRules[${rule.id || '<unknown>'}]: ${e}`);
        }
      }
    }
  }

  // Cross-reference integrity (only when arrays are present)
  if (Array.isArray(shard.zones) && Array.isArray(shard.encounters)) {
    const zoneIds = new Set(shard.zones.map((z) => z.id));
    for (const encounter of shard.encounters) {
      if (encounter.zoneId && !zoneIds.has(encounter.zoneId)) {
        errors.push(
          `Shard ${shard.id}.encounters[${encounter.id}].zoneId references unknown Zone: ${encounter.zoneId}.`,
        );
      }
    }
  }
  if (Array.isArray(shard.encounters) && Array.isArray(shard.lootTables)) {
    const tableIds = new Set(shard.lootTables.map((t) => t.id));
    for (const encounter of shard.encounters) {
      if (encounter.lootTableId && !tableIds.has(encounter.lootTableId)) {
        errors.push(
          `Shard ${shard.id}.encounters[${encounter.id}].lootTableId references unknown LootTable: ${encounter.lootTableId}.`,
        );
      }
    }
  }
  if (Array.isArray(shard.lootTables) && Array.isArray(shard.items) && Array.isArray(shard.skills)) {
    const itemIds = new Set(shard.items.map((i) => i.id));
    const skillIds = new Set(shard.skills.map((s) => s.id));
    for (const table of shard.lootTables) {
      for (const entry of table.entries ?? []) {
        if (entry.itemId && !itemIds.has(entry.itemId)) {
          errors.push(
            `Shard ${shard.id}.lootTables[${table.id}].entries[${entry.id}].itemId references unknown Item: ${entry.itemId}.`,
          );
        }
        if (entry.skillId && !skillIds.has(entry.skillId)) {
          errors.push(
            `Shard ${shard.id}.lootTables[${table.id}].entries[${entry.id}].skillId references unknown Skill: ${entry.skillId}.`,
          );
        }
      }
    }
  }
  if (Array.isArray(shard.quests) && Array.isArray(shard.skills) && Array.isArray(shard.items)) {
    const skillIds = new Set(shard.skills.map((s) => s.id));
    const itemIds = new Set(shard.items.map((i) => i.id));
    for (const quest of shard.quests) {
      for (const step of quest.steps ?? []) {
        if (step.requiresSkillId && !skillIds.has(step.requiresSkillId)) {
          errors.push(
            `Shard ${shard.id}.quests[${quest.id}].steps[${step.id}].requiresSkillId references unknown Skill: ${step.requiresSkillId}.`,
          );
        }
        for (const rewardId of step.rewardItemIds ?? []) {
          if (!itemIds.has(rewardId)) {
            errors.push(
              `Shard ${shard.id}.quests[${quest.id}].steps[${step.id}].rewardItemIds references unknown Item: ${rewardId}.`,
            );
          }
        }
      }
    }
  }

  // Cross-reference: spatialRules zoneId references
  if (Array.isArray(shard.spatialRules) && Array.isArray(shard.zones)) {
    const zoneIds = new Set(shard.zones.map((z) => z.id));
    for (const rule of shard.spatialRules) {
      if (rule.zoneId && !zoneIds.has(rule.zoneId)) {
        errors.push(
          `Shard ${shard.id}.spatialRules[${rule.id}].zoneId references unknown Zone: ${rule.zoneId}.`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate a ShardReceipt envelope. Validates structural fields and
 * recursively validates any nested ValidationReceipts.
 */
export function validateShardReceipt(
  receipt: ShardReceipt,
  validateValidation: (v: ValidationReceipt) => string[],
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ShardReceipt.id is required.');
  if (!receipt.shardId) errors.push('ShardReceipt.shardId is required.');
  if (!isSupportedShardReceiptStatus(receipt.status)) {
    errors.push(`ShardReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!receipt.hash) errors.push('ShardReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('ShardReceipt.hashAlgorithm is required.');
  if (
    receipt.sealedAt === undefined ||
    receipt.sealedAt === null ||
    receipt.sealedAt === ''
  ) {
    errors.push('ShardReceipt.sealedAt is required.');
  }
  for (const validation of receipt.validationReceipts ?? []) {
    for (const e of validateValidation(validation)) {
      errors.push(`validationReceipts[${validation.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        `ShardReceipt ${receipt.id} has a verification command without command text.`,
      );
    }
  }
  return errors;
}

// ── Cloning ──

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
): ArtifactVerificationCommand[] | undefined {
  if (!commands) return undefined;
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

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

export function cloneSkill(skill: Skill): Skill {
  return {
    ...skill,
    ...(skill.prerequisites ? { prerequisites: [...skill.prerequisites] } : {}),
    ...(skill.provenance ? { provenance: cloneProvenance(skill.provenance) } : {}),
    ...(skill.metadata ? { metadata: { ...skill.metadata } } : {}),
  };
}

export function cloneItem(item: Item): Item {
  return {
    ...item,
    ...(item.provenance ? { provenance: cloneProvenance(item.provenance) } : {}),
    ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
  };
}

export function cloneLootTableEntry(entry: LootTableEntry): LootTableEntry {
  return {
    ...entry,
    ...(entry.metadata ? { metadata: { ...entry.metadata } } : {}),
  };
}

export function cloneLootTable(table: LootTable): LootTable {
  return {
    ...table,
    entries: table.entries.map(cloneLootTableEntry),
    ...(table.provenance ? { provenance: cloneProvenance(table.provenance) } : {}),
    ...(table.metadata ? { metadata: { ...table.metadata } } : {}),
  };
}

export function cloneEncounter(encounter: Encounter): Encounter {
  return {
    ...encounter,
    ...(encounter.provenance ? { provenance: cloneProvenance(encounter.provenance) } : {}),
    ...(encounter.metadata ? { metadata: { ...encounter.metadata } } : {}),
  };
}

export function cloneQuestStep(step: QuestStep): QuestStep {
  return {
    ...step,
    ...(step.encounterIds ? { encounterIds: [...step.encounterIds] } : {}),
    ...(step.rewardItemIds ? { rewardItemIds: [...step.rewardItemIds] } : {}),
    ...(step.metadata ? { metadata: { ...step.metadata } } : {}),
  };
}

export function cloneQuest(quest: Quest): Quest {
  return {
    ...quest,
    steps: quest.steps.map(cloneQuestStep),
    ...(quest.provenance ? { provenance: cloneProvenance(quest.provenance) } : {}),
    ...(quest.metadata ? { metadata: { ...quest.metadata } } : {}),
  };
}

export function cloneZone(zone: Zone): Zone {
  return {
    ...zone,
    ...(zone.encounterIds ? { encounterIds: [...zone.encounterIds] } : {}),
    ...(zone.provenance ? { provenance: cloneProvenance(zone.provenance) } : {}),
    ...(zone.metadata ? { metadata: { ...zone.metadata } } : {}),
  };
}

export function cloneShard(shard: Shard): Shard {
  return {
    ...shard,
    zones: shard.zones.map(cloneZone),
    encounters: shard.encounters.map(cloneEncounter),
    quests: shard.quests.map(cloneQuest),
    items: shard.items.map(cloneItem),
    skills: shard.skills.map(cloneSkill),
    lootTables: shard.lootTables.map(cloneLootTable),
    ...(shard.spatialRules ? { spatialRules: shard.spatialRules.map(cloneSpatialRule) } : {}),
    ...(shard.provenance ? { provenance: cloneProvenance(shard.provenance) } : {}),
    ...(shard.metadata ? { metadata: { ...shard.metadata } } : {}),
  };
}

export function cloneShardReceipt(
  receipt: ShardReceipt,
  cloneValidation: (v: ValidationReceipt) => ValidationReceipt,
): ShardReceipt {
  return {
    ...receipt,
    ...(receipt.validationReceipts
      ? { validationReceipts: receipt.validationReceipts.map(cloneValidation) }
      : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
