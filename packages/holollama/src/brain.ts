import { createHash } from 'node:crypto';

export type HoloLlamaBrainId =
  | 'audio'
  | 'confounder'
  | 'game-design'
  | 'gamedev'
  | 'journalist'
  | 'look-dev'
  | 'narrative'
  | 'netcode'
  | 'quantum-lab';
export type HoloLlamaBrainConsumerProfileId =
  | 'jetson-edge'
  | 'laptop-owned-metal'
  | 'vast-sovereign-overflow';

export interface HoloLlamaBrainDefinition {
  id: HoloLlamaBrainId;
  displayName: string;
  identityName: string;
  description: string;
  packageName: string;
  version: string;
  compositionStem: string;
  brainPath: string;
  instructionPath: string;
  trust: 'canonical' | 'compatibility';
  consumerProfileIds: HoloLlamaBrainConsumerProfileId[];
  terms: string[];
}

export interface HoloLlamaBrainConsumerProfileDefinition {
  id: HoloLlamaBrainConsumerProfileId;
  label: string;
  deviceClass: 'jetson' | 'laptop' | 'vast';
  description: string;
  holoLlamaProfile: 'jetson-orin' | 'laptop-windows' | 'vast-linux-gpu';
  deviceAliases: string[];
}

export interface SelectHoloLlamaBrainOptions {
  task: string;
  brain?: string;
  requestedBrain?: string;
  skill?: string;
  requestedSkill?: string;
  profileId?: string;
  consumerProfileId?: string;
  selectedDevice?: string;
  device?: string;
  generatedAt?: string;
}

export interface HoloLlamaBrainScore {
  id: HoloLlamaBrainId;
  value: number;
  matches: string[];
  reason: string;
}

export interface HoloLlamaBrainSelection {
  schema: typeof HOLOLLAMA_BRAIN_SELECTION_SCHEMA;
  generatedAt: string;
  task: {
    text: string;
    sha256: string;
  };
  lexicon: typeof HOLOLLAMA_BRAIN_LEXICON;
  requestedBrain: string;
  selectedBrain: {
    id: HoloLlamaBrainId;
    displayName: string;
    identityName: string;
    packageName: string;
    version: string;
    compositionStem: string;
    brainPath: string;
    instructionPath: string;
    trust: HoloLlamaBrainDefinition['trust'];
    consumerProfileIds: HoloLlamaBrainConsumerProfileId[];
    source: {
      packageName: '@holoscript/holollama';
      compatibilityUnit: 'skill';
      compatibilityId: HoloLlamaBrainId;
    };
  };
  selectedCompatibilitySkill: {
    id: HoloLlamaBrainId;
    displayName: string;
    identityName: string;
    packageName: string;
    version: string;
    compositionStem: string;
    paths: {
      brain: string;
      instructions: string;
    };
    trust: HoloLlamaBrainDefinition['trust'];
  };
  selectedConsumerProfile: HoloLlamaBrainConsumerProfileDefinition;
  routing: {
    source: '@holoscript/holollama';
    selector: 'selectHoloLlamaBrain';
    requestedUnit: 'Brain';
    compatibilityUnit: 'skill';
    selectionPolicy: 'explicit-brain' | 'explicit-skill-alias' | 'keyword-score-default';
    defaultBrainId: HoloLlamaBrainId;
  };
  score: HoloLlamaBrainScore;
  candidateBrains: HoloLlamaBrainScore[];
  autonomyCapability: {
    unit: 'Brain';
    id: HoloLlamaBrainId;
    packageName: string;
    consumerProfileId: HoloLlamaBrainConsumerProfileId;
  };
  compatibility: {
    skillAliasesAccepted: true;
    selectedSkillId: HoloLlamaBrainId;
    note: string;
  };
  warnings: string[];
  blockers: string[];
}

const DEFAULT_BRAIN_ID: HoloLlamaBrainId = 'gamedev';

export const HOLOLLAMA_BRAIN_SELECTION_SCHEMA = 'holollama-brain-router.selection.v1';
export const HOLOLLAMA_BRAIN_LEXICON = {
  userFacingUnit: 'Brain',
  compatibilityUnit: 'skill',
} as const;

export const HOLOLLAMA_BRAIN_CONSUMER_PROFILE_DEFINITIONS: Record<
  HoloLlamaBrainConsumerProfileId,
  HoloLlamaBrainConsumerProfileDefinition
> = {
  'jetson-edge': {
    id: 'jetson-edge',
    label: 'Jetson edge Brain runtime',
    deviceClass: 'jetson',
    description: 'Always-on owned-metal Brain consumer on the Jetson HoloShell appliance.',
    holoLlamaProfile: 'jetson-orin',
    deviceAliases: ['jetson', 'orin', 'jetson-orin', 'jetson-orin-super', 'edge'],
  },
  'laptop-owned-metal': {
    id: 'laptop-owned-metal',
    label: 'Laptop owned-metal Brain runtime',
    deviceClass: 'laptop',
    description:
      'Founder laptop Brain consumer for local validation, desktop work, and overflow reasoning.',
    holoLlamaProfile: 'laptop-windows',
    deviceAliases: ['laptop', 'windows', 'rtx3060', 'laptop-rtx3060', 'workstation'],
  },
  'vast-sovereign-overflow': {
    id: 'vast-sovereign-overflow',
    label: 'Vast sovereign overflow Brain runtime',
    deviceClass: 'vast',
    description: 'Paid GPU overflow Brain consumer for receipt-gated fleet escalation.',
    holoLlamaProfile: 'vast-linux-gpu',
    deviceAliases: ['vast', 'gpu', 'linux-gpu', 'overflow', 'fleet'],
  },
};

export const HOLOLLAMA_BRAIN_DEFINITIONS: Record<HoloLlamaBrainId, HoloLlamaBrainDefinition> = {
  audio: {
    id: 'audio',
    displayName: 'Audio Brain',
    identityName: 'audio',
    description:
      'Game music, sound effects, ambience, spatial audio, and audio implementation planning.',
    packageName: '@holoscript/audio',
    version: '0.1.0',
    compositionStem: 'audio',
    brainPath: 'graduated-skills/audio/audio.hsplus',
    instructionPath: 'skills/audio/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'audio',
      'music',
      'sound',
      'sfx',
      'ambience',
      'ambient',
      'soundtrack',
      'foley',
      'eerie',
      'melody',
      'mix',
      'spatial audio',
    ],
  },
  confounder: {
    id: 'confounder',
    displayName: 'Confounder Brain',
    identityName: 'confounder',
    description:
      'Causal-claim guardrail for separating evidence, correlation, and unsupported improvement claims.',
    packageName: '@holoscript/confounder',
    version: '0.1.0',
    compositionStem: 'confounder',
    brainPath: 'graduated-skills/confounder/confounder.hsplus',
    instructionPath: 'skills/confounder/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'caused',
      'causal',
      'causality',
      'improved',
      'correlation',
      'confounder',
      'unsupported claim',
    ],
  },
  'game-design': {
    id: 'game-design',
    displayName: 'Game Design Brain',
    identityName: 'game-design',
    description: 'Game loops, systems, progression, mechanics, balance, and player-facing design.',
    packageName: '@holoscript/game-design',
    version: '0.1.0',
    compositionStem: 'game-design',
    brainPath: 'graduated-skills/game-design/game-design.hsplus',
    instructionPath: 'skills/game-design/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'mechanic',
      'loop',
      'progression',
      'balance',
      'quest',
      'reward',
      'player',
      'game design',
    ],
  },
  gamedev: {
    id: 'gamedev',
    displayName: 'GameDev Brain',
    identityName: 'gamedev',
    description:
      'Umbrella game-development Brain for general interactive, runtime, and playable work.',
    packageName: '@holoscript/gamedev',
    version: '0.1.0',
    compositionStem: 'gamedev',
    brainPath: 'graduated-skills/gamedev/gamedev.hsplus',
    instructionPath: 'skills/gamedev/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'game',
      'playable',
      'unity',
      'unreal',
      'godot',
      'webxr',
      'runtime',
      'prototype',
      'interactive',
    ],
  },
  journalist: {
    id: 'journalist',
    displayName: 'Journalist Brain',
    identityName: 'journalist',
    description:
      'Investigative fact checking, claim verification, and evidence-backed shipped-work reporting.',
    packageName: '@holoscript/journalist',
    version: '0.1.0',
    compositionStem: 'journalist',
    brainPath: 'graduated-skills/journalist/journalist.hsplus',
    instructionPath: 'skills/journalist/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: ['fact check', 'verify', 'claim', 'journalist', 'report', 'evidence', 'source'],
  },
  'look-dev': {
    id: 'look-dev',
    displayName: 'Look Dev Brain',
    identityName: 'look-dev',
    description:
      'Rendered visuals, materials, lighting, composition, and visual-quality direction.',
    packageName: '@holoscript/look-dev',
    version: '0.1.0',
    compositionStem: 'look-dev',
    brainPath: 'graduated-skills/look-dev/look-dev.hsplus',
    instructionPath: 'skills/look-dev/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'render',
      'visual',
      'lighting',
      'material',
      'shader',
      'look',
      'composition',
      'style',
      'scene',
    ],
  },
  narrative: {
    id: 'narrative',
    displayName: 'Narrative Brain',
    identityName: 'narrative',
    description: 'Story, lore, quests, dialogue, character voice, and narrative-system planning.',
    packageName: '@holoscript/narrative',
    version: '0.1.0',
    compositionStem: 'narrative',
    brainPath: 'graduated-skills/narrative/narrative.hsplus',
    instructionPath: 'skills/narrative/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'story',
      'lore',
      'dialogue',
      'character',
      'quest',
      'plot',
      'narrative',
      'voice',
      'script',
    ],
  },
  netcode: {
    id: 'netcode',
    displayName: 'Netcode Brain',
    identityName: 'netcode',
    description:
      'Multiplayer architecture, shared sessions, authority, synchronization, and latency planning.',
    packageName: '@holoscript/netcode',
    version: '0.1.0',
    compositionStem: 'netcode',
    brainPath: 'graduated-skills/netcode/netcode.hsplus',
    instructionPath: 'skills/netcode/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: [
      'multiplayer',
      'network',
      'netcode',
      'replication',
      'sync',
      'latency',
      'session',
      'server authority',
    ],
  },
  'quantum-lab': {
    id: 'quantum-lab',
    displayName: 'Quantum Lab Brain',
    identityName: 'quantum-lab',
    description:
      'Quantum experiments, circuits, VQE, QPU/simulator routing, and hardware-backed receipts.',
    packageName: '@holoscript/quantum-lab',
    version: '0.1.0',
    compositionStem: 'quantum-lab',
    brainPath: 'graduated-skills/quantum-lab/quantum-lab.hsplus',
    instructionPath: 'skills/quantum-lab/SKILL.md',
    trust: 'canonical',
    consumerProfileIds: ['jetson-edge', 'laptop-owned-metal', 'vast-sovereign-overflow'],
    terms: ['quantum', 'qpu', 'circuit', 'vqe', 'qiskit', 'qubit', 'simulator', 'hamiltonian'],
  },
};

export function listHoloLlamaBrains(): HoloLlamaBrainDefinition[] {
  return Object.values(HOLOLLAMA_BRAIN_DEFINITIONS);
}

export function listHoloLlamaBrainConsumerProfiles(): HoloLlamaBrainConsumerProfileDefinition[] {
  return Object.values(HOLOLLAMA_BRAIN_CONSUMER_PROFILE_DEFINITIONS);
}

export function profileIdForHoloLlamaDevice(
  selectedDevice?: string
): HoloLlamaBrainConsumerProfileId | undefined {
  const normalized = normalizeSelector(selectedDevice);
  if (!normalized) return undefined;
  for (const profile of listHoloLlamaBrainConsumerProfiles()) {
    if (
      profile.id === normalized ||
      profile.deviceClass === normalized ||
      profile.deviceAliases.some((alias) => normalizeSelector(alias) === normalized)
    ) {
      return profile.id;
    }
  }
  return undefined;
}

export function scoreHoloLlamaBrain(
  task: string,
  brain: HoloLlamaBrainDefinition
): HoloLlamaBrainScore {
  const normalizedTask = normalizeText(task);
  const matches = brain.terms.filter((term) => normalizedTask.includes(normalizeText(term)));
  if (normalizedTask.includes(normalizeText(brain.id)) && !matches.includes(brain.id)) {
    matches.push(brain.id);
  }
  const value = matches.length;
  return {
    id: brain.id,
    value,
    matches,
    reason: value > 0 ? `matched ${matches.join(', ')}` : 'no task keyword match',
  };
}

export function scoreHoloLlamaBrains(task: string): HoloLlamaBrainScore[] {
  return listHoloLlamaBrains()
    .map((brain) => scoreHoloLlamaBrain(task, brain))
    .sort((left, right) => {
      if (right.value !== left.value) return right.value - left.value;
      return left.id.localeCompare(right.id);
    });
}

export function selectHoloLlamaBrain(
  options: SelectHoloLlamaBrainOptions
): HoloLlamaBrainSelection {
  const task = String(options.task || '').trim();
  if (!task) throw new Error('selectHoloLlamaBrain requires a non-empty task');

  const explicitBrain = normalizeSelector(options.requestedBrain ?? options.brain);
  const explicitSkill = normalizeSelector(options.requestedSkill ?? options.skill);
  const requested = explicitBrain || explicitSkill || 'auto';
  const selectionPolicy =
    explicitBrain && explicitBrain !== 'auto'
      ? 'explicit-brain'
      : explicitSkill && explicitSkill !== 'auto'
        ? 'explicit-skill-alias'
        : 'keyword-score-default';
  const explicitId =
    explicitBrain && explicitBrain !== 'auto'
      ? assertBrainId(explicitBrain)
      : explicitSkill && explicitSkill !== 'auto'
        ? assertBrainId(explicitSkill)
        : undefined;

  const scored = scoreHoloLlamaBrains(task);
  const selectedId = explicitId ?? (scored[0]?.value ? scored[0].id : DEFAULT_BRAIN_ID);
  const selected = HOLOLLAMA_BRAIN_DEFINITIONS[selectedId];
  const selectedScore = explicitId
    ? {
        id: selectedId,
        value: 1000,
        matches: [requested],
        reason: `${selectionPolicy} requested ${requested}`,
      }
    : (scored.find((score) => score.id === selectedId) ?? scoreHoloLlamaBrain(task, selected));
  const profileId = resolveBrainConsumerProfileId(options, selected);
  const selectedConsumerProfile = HOLOLLAMA_BRAIN_CONSUMER_PROFILE_DEFINITIONS[profileId];

  return {
    schema: HOLOLLAMA_BRAIN_SELECTION_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    task: {
      text: task,
      sha256: createHash('sha256').update(task).digest('hex'),
    },
    lexicon: HOLOLLAMA_BRAIN_LEXICON,
    requestedBrain: requested,
    selectedBrain: {
      id: selected.id,
      displayName: selected.displayName,
      identityName: selected.identityName,
      packageName: selected.packageName,
      version: selected.version,
      compositionStem: selected.compositionStem,
      brainPath: selected.brainPath,
      instructionPath: selected.instructionPath,
      trust: selected.trust,
      consumerProfileIds: selected.consumerProfileIds,
      source: {
        packageName: '@holoscript/holollama',
        compatibilityUnit: 'skill',
        compatibilityId: selected.id,
      },
    },
    selectedCompatibilitySkill: {
      id: selected.id,
      displayName: selected.displayName,
      identityName: selected.identityName,
      packageName: selected.packageName,
      version: selected.version,
      compositionStem: selected.compositionStem,
      paths: {
        brain: selected.brainPath,
        instructions: selected.instructionPath,
      },
      trust: selected.trust,
    },
    selectedConsumerProfile,
    routing: {
      source: '@holoscript/holollama',
      selector: 'selectHoloLlamaBrain',
      requestedUnit: 'Brain',
      compatibilityUnit: 'skill',
      selectionPolicy,
      defaultBrainId: DEFAULT_BRAIN_ID,
    },
    score: selectedScore,
    candidateBrains: scored,
    autonomyCapability: {
      unit: 'Brain',
      id: selected.id,
      packageName: selected.packageName,
      consumerProfileId: selectedConsumerProfile.id,
    },
    compatibility: {
      skillAliasesAccepted: true,
      selectedSkillId: selected.id,
      note: 'Brain is the user-facing unit; skill remains accepted as a compatibility selector.',
    },
    warnings: [],
    blockers: [],
  };
}

function resolveBrainConsumerProfileId(
  options: SelectHoloLlamaBrainOptions,
  selected: HoloLlamaBrainDefinition
): HoloLlamaBrainConsumerProfileId {
  const explicitProfile = normalizeSelector(options.consumerProfileId ?? options.profileId);
  if (explicitProfile) {
    const profile = assertBrainConsumerProfileId(explicitProfile);
    if (selected.consumerProfileIds.includes(profile)) return profile;
    throw new Error(`Brain ${selected.id} cannot run on consumer profile ${profile}`);
  }

  const deviceProfile = profileIdForHoloLlamaDevice(options.selectedDevice ?? options.device);
  if (deviceProfile && selected.consumerProfileIds.includes(deviceProfile)) return deviceProfile;
  return selected.consumerProfileIds[0] ?? 'jetson-edge';
}

function assertBrainId(value: string): HoloLlamaBrainId {
  if (value in HOLOLLAMA_BRAIN_DEFINITIONS) return value as HoloLlamaBrainId;
  throw new Error(`Unknown HoloLlama Brain: ${value}`);
}

function assertBrainConsumerProfileId(value: string): HoloLlamaBrainConsumerProfileId {
  if (value in HOLOLLAMA_BRAIN_CONSUMER_PROFILE_DEFINITIONS)
    return value as HoloLlamaBrainConsumerProfileId;
  throw new Error(`Unknown HoloLlama Brain consumer profile: ${value}`);
}

function normalizeSelector(value?: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/^@holoscript\//, '');
}

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_/]+/g, '-');
}
