/**
 * HoloLand Item Manifest — Items as Characters (W.506)
 *
 * Extends HoloLand items from flat stat-bundles (InventoryItem) to
 * character-like entities with backstory, state, trajectory, and the
 * same five sovereign traits as NPCs — ticked at slower cadence
 * (per in-world day rather than per in-world hour).
 *
 * Reference: research/2026-05-10_shangri-la-frontier-npc-feel-EXTENSION.md
 * Pre-condition: D.040 sovereign trait skeletons (packages/core/src/traits/)
 */

import type {
  VerbalFingerprintConfig,
} from '../traits/VerbalFingerprintTrait';
import type {
  AutonomousAgendaConfig,
} from '../traits/AutonomousAgendaTrait';
import type {
  ReputationLedgerConfig,
} from '../traits/ReputationLedgerTrait';
import type {
  VocabularyRegisterConfig,
} from '../traits/VocabularyRegisterTrait';
import type {
  SpeechAwareEncounterConfig,
} from '../traits/SpeechAwareEncounterTrait';

// =============================================================================
// ANCESTRY — Where the item came from
// =============================================================================

export interface ItemAncestry {
  /** Origin category in the lore chain. */
  originType:
    | 'colossus'
    | 'boss_summon'
    | 'drop'
    | 'npc_craft'
    | 'player_equipment'
    | 'lore_event'
    | 'world_spawn';

  /** Origin entity identifier (boss ID, NPC ID, event ID). */
  originId: string;

  /** Human-readable origin name. */
  originName: string;

  /** Specific lore event that produced this item. */
  loreEvent?: string;

  /** NPC that crafted this item (for npc_craft origin). */
  crafterNpcId?: string;

  /** Source material item ID (e.g., Arctus Regalecus → Bilac-crafted gear). */
  materialSourceItemId?: string;
}

// =============================================================================
// STATE — What the item is right now
// =============================================================================

export interface ItemState {
  /** Structural integrity 0-1. */
  durability: number;

  /** Corrosion / decay 0-1 (Decayed Areadbhair). */
  corrosion: number;

  /** Curse intensity 0-1 (Lycagon's Marking → Contusion). */
  curseDepth: number;

  /** Restoration arc progress 0-1. */
  restorationProgress: number;

  /** Whether the item has been awakened / unlocked. */
  awakened: boolean;

  /** Cumulative seconds this item has been equipped. */
  equippedDurationSeconds: number;

  /** Player the item is soul-bound to, if any. */
  boundToPlayerId?: string;
}

// =============================================================================
// TRAJECTORY — What the item could become
// =============================================================================

export interface ItemTrajectory {
  /** Arc category. */
  type: 'restoration' | 'awakening' | 'curse_deepening' | 'evolution' | 'none';

  /** Human-readable condition to advance (e.g., "Take to Legendary Craftsman Vysache"). */
  conditionDescription: string;

  /** Target state partial diff upon arc completion. */
  targetState: Partial<ItemState>;

  /** NPC required to advance the arc. */
  requiredNpcId?: string;

  /** Location required to advance the arc. */
  requiredLocationId?: string;

  /** Another item required as catalyst or material. */
  requiredItemId?: string;
}

// =============================================================================
// CONSTRAINT — Playstyle driver, not punishment
// =============================================================================

export interface ItemConstraint {
  /** Human-readable constraint (e.g., "Torso and leg armor disabled"). */
  description: string;

  /** Equipment slots this constraint disables. */
  affectedEquipmentSlots?: string[];

  /** Max seconds the item can be equipped before consequence (Lycagon's Contusion = 180). */
  maxEquipDurationSeconds?: number;

  /** How this constraint shapes playstyle identity. */
  playstyleImpact: string;
}

// =============================================================================
// ITEM MANIFEST
// =============================================================================

export interface HoloLandItem {
  /** Unique item identifier. */
  id: string;

  /** Internal name. */
  name: string;

  /** Player-facing name. */
  displayName: string;

  /** Description text (vocabularyRegister + verbalFingerprint voice). */
  description: string;

  /** Lore origin. */
  ancestry: ItemAncestry;

  /** Current physical / magical state. */
  state: ItemState;

  /** Implied future-state arc. */
  trajectory: ItemTrajectory;

  /** Playstyle-driving constraint. */
  constraint: ItemConstraint;

  /** Sovereign trait: description voice fingerprint. */
  verbalFingerprint: VerbalFingerprintConfig;

  /** Sovereign trait: slow-tick agenda (state changes, restoration arcs). */
  autonomousAgenda: AutonomousAgendaConfig;

  /** Sovereign trait: trust + behavior log (NPCs react to cursed gear). */
  reputationLedger: ReputationLedgerConfig;

  /** Sovereign trait: vocabulary register for description text tone. */
  vocabularyRegister: VocabularyRegisterConfig;

  /** Sovereign trait (optional): items that "hear" player speech (sword responding to oaths). */
  speechAwareEncounter?: SpeechAwareEncounterConfig;

  /** Previous item in the lore chain (e.g., raw material). */
  previousItemId?: string;

  /** Next item in the lore chain (e.g., crafted derivative). */
  nextItemId?: string;

  /** Distance from origin in the item chain (0 = Colossus drop). */
  chainDepth: number;

  /** HoloScript trait names attached to this item at runtime. */
  traits: string[];

  /** Discovery / categorization tags. */
  tags: string[];
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Item tick interval representing one in-world day at timeScale = 1.
 * Runtime scales this by the world's configured timeScale.
 * NPC default is 60_000 ms (per in-world hour conceptual mapping);
 * item default is 24× slower = 86_400_000 ms (per in-world day).
 */
export const ITEM_DEFAULT_TICK_INTERVAL_MS = 86_400_000;

export const DEFAULT_ITEM_VERBAL_FINGERPRINT: VerbalFingerprintConfig = {
  fingerprint_key: 'item_default',
  style: {
    label: 'item_neutral',
    minSentenceLength: 5,
    maxSentenceLength: 40,
    forbiddenPhrases: [],
    requiredPhrases: [],
    tone: 'neutral',
  },
  enforce: false,
  rolling_window: 50,
};

export const DEFAULT_ITEM_AUTONOMOUS_AGENDA: AutonomousAgendaConfig = {
  agent_class: 'item',
  tick_interval_ms: ITEM_DEFAULT_TICK_INTERVAL_MS,
  daily_budget_usd: 0.05,
  max_actions_per_tick: 1,
  max_actions_per_day: 5,
  pause_on_ceiling: true,
};

export const DEFAULT_ITEM_REPUTATION_LEDGER: ReputationLedgerConfig = {
  world_id: '',
  subject_id: '',
  initial_trust: 50,
  max_behavior_facts: 20,
  world_ttl_days: 90,
  emit_world_entry_disclosure: true,
  disclosure_text: '',
  deletion_modes: ['npc', 'global'],
  ttl_breach_alert_rule: 'behavior_fact_ttl_breach',
};

export const DEFAULT_ITEM_VOCABULARY_REGISTER: VocabularyRegisterConfig = {
  active_register: 'medieval-fantasy',
  max_injected_entries: 20,
  prepend_tone_hint: true,
};

// =============================================================================
// FACTORY
// =============================================================================

export interface CreateHoloLandItemOptions {
  displayName?: string;
  description?: string;
  ancestry?: Partial<ItemAncestry>;
  state?: Partial<ItemState>;
  trajectory?: Partial<ItemTrajectory>;
  constraint?: Partial<ItemConstraint>;
  verbalFingerprint?: Partial<VerbalFingerprintConfig>;
  autonomousAgenda?: Partial<AutonomousAgendaConfig>;
  reputationLedger?: Partial<ReputationLedgerConfig>;
  vocabularyRegister?: Partial<VocabularyRegisterConfig>;
  speechAwareEncounter?: SpeechAwareEncounterConfig;
  previousItemId?: string;
  nextItemId?: string;
  chainDepth?: number;
  traits?: string[];
  tags?: string[];
}

export function createHoloLandItem(
  id: string,
  name: string,
  options: CreateHoloLandItemOptions = {}
): HoloLandItem {
  const ancestry: ItemAncestry = {
    originType: options.ancestry?.originType ?? 'world_spawn',
    originId: options.ancestry?.originId ?? 'world',
    originName: options.ancestry?.originName ?? 'World Spawn',
    loreEvent: options.ancestry?.loreEvent,
    crafterNpcId: options.ancestry?.crafterNpcId,
    materialSourceItemId: options.ancestry?.materialSourceItemId,
  };

  const state: ItemState = {
    durability: options.state?.durability ?? 1.0,
    corrosion: options.state?.corrosion ?? 0.0,
    curseDepth: options.state?.curseDepth ?? 0.0,
    restorationProgress: options.state?.restorationProgress ?? 0.0,
    awakened: options.state?.awakened ?? false,
    equippedDurationSeconds: options.state?.equippedDurationSeconds ?? 0,
    boundToPlayerId: options.state?.boundToPlayerId,
  };

  const trajectory: ItemTrajectory = {
    type: options.trajectory?.type ?? 'none',
    conditionDescription: options.trajectory?.conditionDescription ?? '',
    targetState: options.trajectory?.targetState ?? {},
    requiredNpcId: options.trajectory?.requiredNpcId,
    requiredLocationId: options.trajectory?.requiredLocationId,
    requiredItemId: options.trajectory?.requiredItemId,
  };

  const constraint: ItemConstraint = {
    description: options.constraint?.description ?? '',
    affectedEquipmentSlots: options.constraint?.affectedEquipmentSlots,
    maxEquipDurationSeconds: options.constraint?.maxEquipDurationSeconds,
    playstyleImpact: options.constraint?.playstyleImpact ?? '',
  };

  const verbalFingerprint: VerbalFingerprintConfig = {
    ...DEFAULT_ITEM_VERBAL_FINGERPRINT,
    ...options.verbalFingerprint,
    style: {
      ...DEFAULT_ITEM_VERBAL_FINGERPRINT.style,
      ...options.verbalFingerprint?.style,
    },
  };

  const autonomousAgenda: AutonomousAgendaConfig = {
    ...DEFAULT_ITEM_AUTONOMOUS_AGENDA,
    ...options.autonomousAgenda,
  };

  const reputationLedger: ReputationLedgerConfig = {
    ...DEFAULT_ITEM_REPUTATION_LEDGER,
    subject_id: id,
    ...options.reputationLedger,
  };

  const vocabularyRegister: VocabularyRegisterConfig = {
    ...DEFAULT_ITEM_VOCABULARY_REGISTER,
    ...options.vocabularyRegister,
  };

  return {
    id,
    name,
    displayName: options.displayName ?? name,
    description: options.description ?? '',
    ancestry,
    state,
    trajectory,
    constraint,
    verbalFingerprint,
    autonomousAgenda,
    reputationLedger,
    vocabularyRegister,
    speechAwareEncounter: options.speechAwareEncounter,
    previousItemId: options.previousItemId,
    nextItemId: options.nextItemId,
    chainDepth: options.chainDepth ?? 0,
    traits: options.traits ?? [],
    tags: options.tags ?? [],
  };
}

// =============================================================================
// CHAIN HELPERS
// =============================================================================

/**
 * Link two items in a continuous lore thread.
 * Example: Colossus drop (source) → NPC craft (derivative).
 */
export function linkItems(source: HoloLandItem, derivative: HoloLandItem): void {
  source.nextItemId = derivative.id;
  derivative.previousItemId = source.id;
  derivative.chainDepth = source.chainDepth + 1;
  derivative.ancestry.materialSourceItemId = source.id;
}

/**
 * Build a flat array of the item chain from origin to this item.
 */
export function getItemChain(
  item: HoloLandItem,
  itemIndex: Map<string, HoloLandItem>
): HoloLandItem[] {
  const chain: HoloLandItem[] = [item];
  let current = item.previousItemId;
  while (current) {
    const prev = itemIndex.get(current);
    if (!prev) break;
    chain.unshift(prev);
    current = prev.previousItemId;
  }
  return chain;
}
