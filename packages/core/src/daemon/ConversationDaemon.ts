/**
 * ConversationDaemon — the user's personal daemon face.
 *
 * A daemon is NOT Brittney and NOT the field. It is the visible companion
 * the user taps, clicks, or speaks to. Brittney is the deeper operating
 * field that receives daemon turn receipts, rehydrates context, and
 * coordinates agents. The separation is structural:
 *
 *   personal daemon identity
 *   != Brittney field continuity
 *   != HoloShell evidence substrate
 *
 * Ref: Hololand/apps/holoshell/docs/BRITTNEY_FIELD_AND_USER_DAEMONS.md
 * Task: task_1779149587046_tg2a
 */

// ─── Daemon configuration ────────────────────────────────────────────────────

export type DaemonOwnerPolicy = 'private' | 'shared_household' | 'workspace';

export type MemoryRetentionPolicy =
  | 'session_only'
  | 'persisted_local'
  | 'persisted_with_absorb';

export type DispatchConfidence = 'autonomous' | 'confirm_before' | 'always_ask';

export interface DaemonAppearanceProfile {
  characterClass?: string;
  visualStyle?: string;
  colorPalette?: string[];
  animationSet?: string;
  scale?: 'tiny' | 'small' | 'medium' | 'large';
}

export interface DaemonVoiceProfile {
  enabled: boolean;
  voiceId?: string;
  speed?: number;
  tone?: 'warm' | 'neutral' | 'formal' | 'playful';
}

export interface DaemonToneProfile {
  formality?: 'casual' | 'balanced' | 'formal';
  verbosity?: 'terse' | 'balanced' | 'detailed';
  humor?: 'none' | 'light' | 'moderate';
  patience?: 'quick' | 'patient';
}

export interface DaemonPermissionProfile {
  readOnly: boolean;
  proposeMutations: boolean;
  autonomousMutations: boolean;
  breakGlassAllowed: boolean;
  custodyScope: string[];
  permissionEnvelope: 'read_only' | 'guarded_execute' | 'break_glass';
}

export interface DaemonMemoryPolicy {
  retention: MemoryRetentionPolicy;
  maxContextWindowTokens?: number;
  absorbIntegration: boolean;
  // Memory must be scoped to the owner — daemons do not share memory with the field
  ownerScoped: true;
}

export type DaemonContextSourceKind =
  | 'operator_brief'
  | 'holoscript_surface_map'
  | 'absorb_graph'
  | 'holomesh_lanes'
  | 'recent_receipts'
  | 'room_state'
  | 'holoscript_tool_manifest';

export interface DaemonDispatchPolicy {
  defaultConfidence: DispatchConfidence;
  trustedPatterns: string[];
  receiptRequired: boolean;
  maxAutonomousActionsPerSession: number;
}

export interface DaemonReceiptSink {
  local: boolean;
  holoshell: boolean;
  absorb: boolean;
  holomesh: boolean;
}

export interface DaemonBrittneyRehydrationChannel {
  enabled: boolean;
  // Named channel in the field's routing table — never anonymous
  channelId: string;
  deltaCompression: boolean;
  // 0–1: turns below this significance score are not forwarded to the field
  minimumDeltaSignificance: number;
}

export interface ConversationDaemon {
  daemonId: string;
  ownerId: string;
  ownerPolicy: DaemonOwnerPolicy;
  displayName: string;
  appearanceProfile: DaemonAppearanceProfile;
  voiceProfile: DaemonVoiceProfile;
  careProfile: string;
  toneProfile: DaemonToneProfile;
  permissionProfile: DaemonPermissionProfile;
  memoryPolicy: DaemonMemoryPolicy;
  contextSources: DaemonContextSourceKind[];
  dispatchPolicy: DaemonDispatchPolicy;
  receiptSink: DaemonReceiptSink;
  brittneyRehydrationChannel: DaemonBrittneyRehydrationChannel;
  createdAt: string;
  lastActiveAt?: string;
}

// ─── Daemon turn ─────────────────────────────────────────────────────────────

export type DaemonUrgencyLevel = 'low' | 'medium' | 'high' | 'immediate';

export type DaemonConsentBoundary =
  | 'no_action'
  | 'read_only'
  | 'propose'
  | 'execute';

export interface ExtractedIntent {
  verb: string;
  target?: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

export interface ExtractedArtifact {
  kind: 'file' | 'url' | 'entity' | 'code' | 'receipt' | 'task';
  ref: string;
  label?: string;
}

/**
 * ContextDelta is the durable memory artifact of a daemon turn.
 * Raw conversation text is NOT the durable memory. This is.
 * It feeds the Brittney rehydration channel and Absorb.
 */
export interface ContextDelta {
  newIntentSignals: ExtractedIntent[];
  updatedPreferences: Record<string, unknown>;
  newReceiptRefs: string[];
  capabilityUpdates: Array<{ capability: string; available: boolean }>;
  careSignalHistory: string[];
  // 0–1: used by brittneyRehydrationChannel.minimumDeltaSignificance filter
  significanceScore: number;
}

export interface ProposedAction {
  actionId: string;
  description: string;
  toolRef: string;
  parameters: Record<string, unknown>;
  permissionEnvelope: 'read_only' | 'guarded_execute' | 'break_glass';
  reversible: boolean;
  estimatedImpact: 'none' | 'minor' | 'moderate' | 'significant';
}

export interface ConversationDaemonTurn {
  turnId: string;
  daemonId: string;
  surfaceId: string;
  userUtterance: string;
  selectedShellObject?: string;
  extractedIntent?: ExtractedIntent;
  extractedArtifacts: ExtractedArtifact[];
  careSignal?: string;
  urgency: DaemonUrgencyLevel;
  consentBoundary: DaemonConsentBoundary;
  // The durable memory artifact — not a chat transcript
  contextDelta: ContextDelta;
  proposedNextAction?: ProposedAction;
  requiredApproval: boolean;
  receiptLinks: string[];
  timestamp: string;
}

// ─── Separation invariant ────────────────────────────────────────────────────

export class DaemonFieldSeparationError extends Error {
  constructor(message: string) {
    super(`[ConversationDaemon] ${message}`);
    this.name = 'DaemonFieldSeparationError';
  }
}

/**
 * Enforces the three-way structural separation:
 *   personal daemon identity != Brittney field continuity != HoloShell evidence substrate
 *
 * Call before persisting or dispatching any daemon configuration.
 */
export function assertDaemonFieldSeparation(daemon: ConversationDaemon): void {
  if (daemon.permissionProfile.breakGlassAllowed && daemon.permissionProfile.custodyScope.length === 0) {
    throw new DaemonFieldSeparationError(
      'break-glass requires an explicit custodyScope — a daemon must not hold global field authority'
    );
  }
  if (!daemon.brittneyRehydrationChannel.channelId) {
    throw new DaemonFieldSeparationError(
      'brittneyRehydrationChannel.channelId is required — field routing cannot be anonymous'
    );
  }
  if (daemon.permissionProfile.autonomousMutations && !daemon.dispatchPolicy.receiptRequired) {
    throw new DaemonFieldSeparationError(
      'autonomous mutations require receiptRequired:true — HoloShell cannot prove field actions without receipts'
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function makeDefaultConversationDaemon(
  daemonId: string,
  ownerId: string,
  displayName: string,
  careProfile: string,
): ConversationDaemon {
  return {
    daemonId,
    ownerId,
    ownerPolicy: 'private',
    displayName,
    appearanceProfile: { characterClass: 'companion', scale: 'small' },
    voiceProfile: { enabled: false },
    careProfile,
    toneProfile: { formality: 'balanced', verbosity: 'balanced', humor: 'light', patience: 'patient' },
    permissionProfile: {
      readOnly: true,
      proposeMutations: true,
      autonomousMutations: false,
      breakGlassAllowed: false,
      custodyScope: [],
      permissionEnvelope: 'read_only',
    },
    memoryPolicy: {
      retention: 'persisted_local',
      absorbIntegration: true,
      ownerScoped: true,
    },
    contextSources: ['operator_brief', 'holoscript_surface_map', 'recent_receipts'],
    dispatchPolicy: {
      defaultConfidence: 'confirm_before',
      trustedPatterns: [],
      receiptRequired: true,
      maxAutonomousActionsPerSession: 0,
    },
    receiptSink: { local: true, holoshell: true, absorb: true, holomesh: false },
    brittneyRehydrationChannel: {
      enabled: true,
      channelId: `${ownerId}:${daemonId}`,
      deltaCompression: true,
      minimumDeltaSignificance: 0.2,
    },
    createdAt: new Date().toISOString(),
  };
}

export function makeEmptyContextDelta(): ContextDelta {
  return {
    newIntentSignals: [],
    updatedPreferences: {},
    newReceiptRefs: [],
    capabilityUpdates: [],
    careSignalHistory: [],
    significanceScore: 0,
  };
}
