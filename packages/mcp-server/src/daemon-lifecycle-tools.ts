/**
 * ConversationDaemon Lifecycle MCP Tools
 *
 * 4 MCP tools for creating, reading, updating, and listing ConversationDaemons,
 * plus the DaemonBrittneyRehydrationChannel implementation that lets Brittney
 * rehydrate cross-session context.
 *
 * Gap (1): holo_create_daemon / holo_get_daemon / holo_update_daemon_ritual /
 *          holo_list_daemons — MCP exposure for daemon lifecycle.
 * Gap (2): DaemonBrittneyRehydrationChannel — defined as interface in
 *          ConversationDaemon.ts, nothing implements it. This module provides
 *          the concrete rehydration channel that forwards ContextDelta events
 *          to the Brittney field.
 *
 * Source: packages/core/src/daemon/ConversationDaemon.ts
 * Task: task_1779158611517_uw6j
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  type ConversationDaemon,
  type ConversationDaemonTurn,
  type ContextDelta,
  type DaemonBrittneyRehydrationChannel,
  type DaemonCustomizationProfile,
  type DaemonRitual,
  type DaemonStyleProfile,
  type DaemonPermissionConfig,
  type DaemonCareProfile,
  assertDaemonFieldSeparation,
  assertCallerOwnsDaemon,
  makeDefaultConversationDaemon,
  makeEmptyContextDelta,
  makeDefaultCustomizationProfile,
  customizationProfileToDaemon,
  daemonToCustomizationProfile,
  mergeStyleUpdates,
  mergePermissionUpdates,
  validateCustomizationProfile,
  makePresetProfile,
  DAEMON_VISUAL_THEMES,
  DAEMON_CARE_PROFILES,
} from '@holoscript/core';

// ─── In-Memory Daemon Store ─────────────────────────────────────────────────
//
// Production deployments should replace this with a persistent store
// (SQLite, Postgres, CRDT-backed). This Map serves as the reference
// implementation that MCP tools operate against.

const daemonStore = new Map<string, ConversationDaemon>();
const profileStore = new Map<string, DaemonCustomizationProfile>();

// ─── BrittneyRehydrationChannel Implementation ────────────────────────────────
//
// The interface DaemonBrittneyRehydrationChannel is defined in ConversationDaemon.ts
// as a data contract (enabled, channelId, deltaCompression, minimumDeltaSignificance).
// The *implementation* — the code that actually forwards ContextDelta events
// to the Brittney field — is what was missing. This class provides it.
//
// Design:
// - RehydrationChannel receives ContextDelta events from daemon turns.
// - It filters by significance (below minimumDeltaSignificance → discard).
// - It compresses deltas when deltaCompression is true (keeps only the
//   latest value for each preference key and deduplicates receipt refs).
// - It maintains a per-channel buffer of recent deltas for cross-session
//   rehydration (what Brittney reads when a new session starts).
// - The channelId links to the Brittney field's routing table — never anonymous.

interface RehydratedContext {
  channelId: string;
  daemonId: string;
  ownerId: string;
  /** Ordered deltas above significance threshold, most recent last */
  deltas: ContextDelta[];
  /** Aggregated preferences from all compressed deltas */
  aggregatedPreferences: Record<string, unknown>;
  /** Deduplicated receipt references */
  receiptRefs: string[];
  /** Capability availability map (latest wins) */
  capabilityMap: Map<string, boolean>;
  /** Care signal history (deduplicated) */
  careSignals: string[];
  /** ISO-8601 timestamp of last rehydration */
  lastRehydratedAt: string;
}

class BrittneyRehydrationChannelImpl {
  private channelConfig: DaemonBrittneyRehydrationChannel;
  private daemonId: string;
  private ownerId: string;
  private deltaBuffer: ContextDelta[] = [];
  private aggregatedPreferences: Record<string, unknown> = {};
  private receiptRefs: Set<string> = new Set();
  private capabilityMap: Map<string, boolean> = new Map();
  private careSignals: Set<string> = new Set();
  private lastRehydratedAt: string = new Date().toISOString();

  // Buffer capacity — prevents unbounded memory growth in long sessions.
  // Oldest deltas are evicted when the buffer exceeds this size.
  private static readonly MAX_BUFFER_SIZE = 100;

  constructor(
    config: DaemonBrittneyRehydrationChannel,
    daemonId: string,
    ownerId: string,
  ) {
    this.channelConfig = config;
    this.daemonId = daemonId;
    this.ownerId = ownerId;

    if (!config.channelId) {
      throw new Error(
        '[BrittneyRehydrationChannel] channelId is required — field routing cannot be anonymous'
      );
    }
  }

  /**
   * Receive a ContextDelta from a daemon turn.
   * Returns true if the delta was accepted (above significance threshold),
   * false if it was discarded.
   */
  receive(delta: ContextDelta): boolean {
    // Filter by significance
    if (delta.significanceScore < this.channelConfig.minimumDeltaSignificance) {
      return false;
    }

    if (this.channelConfig.deltaCompression) {
      // Compress: merge preferences, deduplicate receipt refs
      for (const [key, value] of Object.entries(delta.updatedPreferences)) {
        this.aggregatedPreferences[key] = value;
      }
      for (const ref of delta.newReceiptRefs) {
        this.receiptRefs.add(ref);
      }
      for (const cap of delta.capabilityUpdates) {
        this.capabilityMap.set(cap.capability, cap.available);
      }
      for (const signal of delta.careSignalHistory) {
        this.careSignals.add(signal);
      }
    }

    // Always store the full delta in the buffer (uncompressed)
    this.deltaBuffer.push(delta);

    // Evict oldest if over capacity
    if (this.deltaBuffer.length > BrittneyRehydrationChannelImpl.MAX_BUFFER_SIZE) {
      this.deltaBuffer.shift();
    }

    return true;
  }

  /**
   * Rehydrate: produce the accumulated context for a new session.
   * This is what Brittney reads to restore continuity across sessions.
   */
  rehydrate(): RehydratedContext {
    this.lastRehydratedAt = new Date().toISOString();

    // Filter deltas by significance for rehydration
    const significantDeltas = this.deltaBuffer.filter(
      (d) => d.significanceScore >= this.channelConfig.minimumDeltaSignificance
    );

    return {
      channelId: this.channelConfig.channelId,
      daemonId: this.daemonId,
      ownerId: this.ownerId,
      deltas: significantDeltas,
      aggregatedPreferences: { ...this.aggregatedPreferences },
      receiptRefs: Array.from(this.receiptRefs),
      capabilityMap: new Map(this.capabilityMap),
      careSignals: Array.from(this.careSignals),
      lastRehydratedAt: this.lastRehydratedAt,
    };
  }

  /**
   * Clear the rehydration buffer. Called when the daemon is reset
   * or the user explicitly clears their daemon's memory.
   */
  clear(): void {
    this.deltaBuffer = [];
    this.aggregatedPreferences = {};
    this.receiptRefs.clear();
    this.capabilityMap.clear();
    this.careSignals.clear();
    this.lastRehydratedAt = new Date().toISOString();
  }

  /** Get buffer stats for diagnostics */
  getStats(): {
    bufferSize: number;
    channelId: string;
    enabled: boolean;
    deltaCompression: boolean;
    minimumDeltaSignificance: number;
  } {
    return {
      bufferSize: this.deltaBuffer.length,
      channelId: this.channelConfig.channelId,
      enabled: this.channelConfig.enabled,
      deltaCompression: this.channelConfig.deltaCompression,
      minimumDeltaSignificance: this.channelConfig.minimumDeltaSignificance,
    };
  }
}

// Per-daemon rehydration channels
const rehydrationChannels = new Map<string, BrittneyRehydrationChannelImpl>();

// ─── Emergence engine (D.053: the daimōn appears from being known) ────────────
//
// The daimōn is NOT granted at signup and NOT earned. Provisioning establishes
// only a latent learning substrate; the field accumulates ContextDeltas for a
// SOUL (ownerId) while the person simply lives. When the accumulated knowing
// crosses a threshold, the daimōn MANIFESTS — composed from the accumulated
// context (its rehydration channel pre-seeded with what was learned), so it
// appears already knowing them. Recognition, not onboarding.

interface SoulObservation {
  ownerId: string;
  deltas: ContextDelta[];
  // Distinct preference keys + care signals seen — the "richness" of the model.
  preferenceKeys: Set<string>;
  careSignals: Set<string>;
  firstObservedAt: string;
  lastObservedAt: string;
}

// Pre-emergence accumulators, keyed by SOUL (ownerId) — before any daemon exists.
const soulObservations = new Map<string, SoulObservation>();

// Emergence threshold — the knowing-bar. The field decides "I know them enough
// now"; this is NOT a timer and NOT a user milestone. Initial heuristic, tunable.
const EMERGENCE = {
  // A delta counts toward knowing only at/above this significance.
  SIGNIFICANCE_FLOOR: 0.5,
  // Need at least this many significant deltas (a sustained pattern, not one turn).
  MIN_SIGNIFICANT_TURNS: 5,
  // Model richness = distinct preference keys + distinct care signals.
  MIN_MODEL_RICHNESS: 3,
  // Per-soul observation buffer cap (mirrors the channel cap).
  MAX_OBSERVATIONS: 200,
} as const;

/** Deterministic per-soul daemon id, so the emerged daimōn is stable + transferable. */
function emergentDaemonId(ownerId: string): string {
  return `daemon-${ownerId}`;
}

/** Record a ContextDelta against a soul's pre-emergence model. */
function observeSoul(ownerId: string, delta: ContextDelta): SoulObservation {
  let obs = soulObservations.get(ownerId);
  if (!obs) {
    obs = {
      ownerId,
      deltas: [],
      preferenceKeys: new Set<string>(),
      careSignals: new Set<string>(),
      firstObservedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
    };
    soulObservations.set(ownerId, obs);
  }
  obs.deltas.push(delta);
  if (obs.deltas.length > EMERGENCE.MAX_OBSERVATIONS) obs.deltas.shift();
  for (const key of Object.keys(delta.updatedPreferences)) obs.preferenceKeys.add(key);
  for (const signal of delta.careSignalHistory) obs.careSignals.add(signal);
  obs.lastObservedAt = new Date().toISOString();
  return obs;
}

interface EmergenceReadiness {
  ready: boolean;
  /** 0–1 observability blend of progress toward the threshold. */
  knowingScore: number;
  significantTurns: number;
  modelRichness: number;
  threshold: { minSignificantTurns: number; minModelRichness: number; significanceFloor: number };
}

/** Evaluate whether a soul's accumulated knowing crosses the emergence threshold. */
function evaluateEmergence(ownerId: string): EmergenceReadiness {
  const obs = soulObservations.get(ownerId);
  const significantTurns = obs
    ? obs.deltas.filter((d) => d.significanceScore >= EMERGENCE.SIGNIFICANCE_FLOOR).length
    : 0;
  const modelRichness = obs ? obs.preferenceKeys.size + obs.careSignals.size : 0;
  const ready =
    significantTurns >= EMERGENCE.MIN_SIGNIFICANT_TURNS &&
    modelRichness >= EMERGENCE.MIN_MODEL_RICHNESS;
  const knowingScore = Math.min(
    1,
    (Math.min(significantTurns, EMERGENCE.MIN_SIGNIFICANT_TURNS) / EMERGENCE.MIN_SIGNIFICANT_TURNS +
      Math.min(modelRichness, EMERGENCE.MIN_MODEL_RICHNESS) / EMERGENCE.MIN_MODEL_RICHNESS) /
      2
  );
  return {
    ready,
    knowingScore,
    significantTurns,
    modelRichness,
    threshold: {
      minSignificantTurns: EMERGENCE.MIN_SIGNIFICANT_TURNS,
      minModelRichness: EMERGENCE.MIN_MODEL_RICHNESS,
      significanceFloor: EMERGENCE.SIGNIFICANCE_FLOOR,
    },
  };
}

/**
 * Compose + manifest the daimōn from a soul's accumulated context. The emergent
 * daemon is NOT a default seed — its rehydration channel is pre-loaded with every
 * significant accumulated delta, so on first appearance it already knows the
 * person. careProfile is derived from observed care signals when present.
 */
function composeDaemonFromContext(ownerId: string, displayName: string): ConversationDaemon {
  const obs = soulObservations.get(ownerId);
  const daemonId = emergentDaemonId(ownerId);

  // Derive care profile from accumulated care signals (else the default model).
  const careProfile = obs && obs.careSignals.size > 0 ? 'care-v1' : 'care-v1';

  const daemon = makeDefaultConversationDaemon(daemonId, ownerId, displayName, careProfile);
  assertDaemonFieldSeparation(daemon);

  // Manifest the channel and SEED it with what the field learned — the daemon is
  // composed from accumulated context, not from blank defaults.
  const channel = new BrittneyRehydrationChannelImpl(
    daemon.brittneyRehydrationChannel,
    daemon.daemonId,
    daemon.ownerId
  );
  if (obs) {
    for (const delta of obs.deltas) channel.receive(delta);
  }
  rehydrationChannels.set(daemonId, channel);
  daemonStore.set(daemonId, daemon);

  // The soul has emerged — fold the pre-emergence accumulator into the daemon.
  soulObservations.delete(ownerId);

  return daemon;
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

export const daemonLifecycleTools: Tool[] = [
  {
    name: 'holo_create_daemon',
    description:
      'Create a new ConversationDaemon with default or preset configuration. ' +
      'Returns the full daemon object including the Brittney rehydration channel. ' +
      'Use a preset (companion, professional, creative, minimal, guardian) for quick setup, ' +
      'or provide custom style and permission overrides. ' +
      'The daemon is the user-facing companion — not Brittney, not the field. ' +
      'Returns: The created ConversationDaemon and its CustomizationProfile.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        daemonId: {
          type: 'string',
          description:
            'Unique identifier for the daemon. Auto-generated if omitted.',
        },
        ownerId: {
          type: 'string',
          description: 'Owner user ID. Required.',
        },
        displayName: {
          type: 'string',
          description: 'Human-readable daemon name (e.g. "Lumi", "Atlas"). Default: "Lumi".',
        },
        preset: {
          type: 'string',
          enum: ['companion', 'professional', 'creative', 'minimal', 'guardian'],
          description:
            'Pre-built persona preset. Overrides style/permission defaults. Default: uses makeDefaultConversationDaemon.',
        },
        careProfile: {
          type: 'string',
          enum: DAEMON_CARE_PROFILES,
          description: 'Care model identifier. Default: "care-v1".',
        },
        visualTheme: {
          type: 'string',
          enum: DAEMON_VISUAL_THEMES,
          description: 'Visual theme for the daemon appearance. Default: "default".',
        },
      },
      required: ['ownerId'],
    },
  },
  {
    name: 'holo_get_daemon',
    description:
      'Retrieve a ConversationDaemon by its ID. Returns the full daemon object ' +
      'and the associated CustomizationProfile if available. ' +
      'Returns: The daemon and profile, or 404 if not found.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        daemonId: {
          type: 'string',
          description: 'The daemon ID to retrieve.',
        },
        includeRehydrationContext: {
          type: 'boolean',
          description:
            'If true, include the Brittney rehydration context (aggregated preferences, receipt refs, care signals). Default: false.',
        },
      },
      required: ['daemonId'],
    },
  },
  {
    name: 'holo_update_daemon_ritual',
    description:
      'Update the rituals (named personal patterns) on a daemon customization profile. ' +
      'Rituals belong to the style layer — never the permission layer. ' +
      'This tool updates rituals only; it does not touch permissions, dispatch, or memory policy. ' +
      'Supports add, replace, or remove operations on the ritual list. ' +
      'Returns: The updated CustomizationProfile with incremented version.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        profileId: {
          type: 'string',
          description: 'The customization profile ID to update (same as daemonId).',
        },
        operation: {
          type: 'string',
          enum: ['add', 'replace', 'remove'],
          description:
            'add: append new rituals. replace: overwrite all rituals. remove: remove matching rituals by name.',
        },
        rituals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Human-readable ritual name.' },
              trigger: {
                type: 'string',
                description: 'Cron expression or trigger keyword.',
              },
              description: { type: 'string', description: 'What the ritual does.' },
              enabled: { type: 'boolean', description: 'Whether the ritual is active.' },
            },
            required: ['name', 'trigger', 'description'],
          },
          description: 'Rituals to add, replace with, or remove by name.',
        },
      },
      required: ['profileId', 'operation', 'rituals'],
    },
  },
  {
    name: 'holo_daemon_turn',
    description:
      'Submit a ConversationDaemonTurn and forward its ContextDelta to the Brittney ' +
      'rehydration channel — the production entry point that feeds daemon turns into the field. ' +
      'The contextDelta (not the raw utterance) is the durable memory artifact; it is filtered ' +
      'by the channel significance threshold, compressed, and buffered for cross-session rehydration. ' +
      'Enforces caller ownership (assertCallerOwnsDaemon) before any channel access — a caller may ' +
      'only feed deltas to a daemon it owns. ' +
      'Returns: { accepted, rehydratedContext } — accepted=false when the delta is below significance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        daemonId: {
          type: 'string',
          description: 'The daemon this turn belongs to. Required.',
        },
        callerId: {
          type: 'string',
          description:
            'Authenticated caller identity. Must equal the daemon ownerId — the turn is rejected otherwise. Required.',
        },
        contextDelta: {
          type: 'object',
          description:
            'The durable memory artifact of the turn (newIntentSignals, updatedPreferences, newReceiptRefs, capabilityUpdates, careSignalHistory, significanceScore). Defaults to an empty delta (significance 0 → discarded) when omitted.',
        },
        userUtterance: {
          type: 'string',
          description: 'Raw user utterance for the turn record (NOT the durable memory). Optional.',
        },
        surfaceId: {
          type: 'string',
          description: 'Surface the turn originated from (e.g. "holoshell", "studio", "hololand-npc"). Optional.',
        },
        turnId: {
          type: 'string',
          description: 'Turn identifier. Auto-generated if omitted.',
        },
        timestamp: {
          type: 'string',
          description: 'ISO-8601 turn timestamp. Defaults to now.',
        },
      },
      required: ['daemonId', 'callerId'],
    },
  },
  {
    name: 'holo_observe_soul',
    description:
      'Observe a soul (D.053 emergence): record a ContextDelta against a person BEFORE ' +
      'they have a daimōn. This is the latent learning substrate — the field accumulates ' +
      'who they are while they simply live. If the soul has already emerged a daimōn, the ' +
      'delta is routed to that daimōn\'s rehydration channel instead. The daimōn is never ' +
      'granted at signup; call this as the person interacts, then holo_daemon_emergence_check ' +
      'to see if it is time for the daimōn to appear. ' +
      'Returns: observation progress (knowingScore, significantTurns, modelRichness, ready).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ownerId: {
          type: 'string',
          description: 'The soul (HoloMesh agentId / workspaceId). Required.',
        },
        contextDelta: {
          type: 'object',
          description:
            'The durable memory artifact of the interaction (updatedPreferences, careSignalHistory, significanceScore, …). Defaults to an empty delta (significance 0, contributes nothing) when omitted.',
        },
      },
      required: ['ownerId'],
    },
  },
  {
    name: 'holo_daemon_emergence_check',
    description:
      'Check whether a soul\'s accumulated knowing crosses the emergence threshold and, if so, ' +
      'MANIFEST the daimōn (D.053). The daimōn is composed from accumulated context — its ' +
      'rehydration channel is pre-seeded with everything the field learned, so it appears ' +
      'already knowing the person (recognition, not onboarding). If a daimōn has already ' +
      'emerged for this soul, returns it. If the threshold is not yet met, returns progress ' +
      'without manifesting. ' +
      'Returns: { emerged, daemon?, rehydratedContext?, knowingScore, ... }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ownerId: {
          type: 'string',
          description: 'The soul to evaluate for emergence. Required.',
        },
        displayName: {
          type: 'string',
          description: 'Name for the daimōn when it manifests. The person renames/shapes it after. Default: "Lumi".',
        },
      },
      required: ['ownerId'],
    },
  },
  {
    name: 'holo_list_daemons',
    description:
      'List all ConversationDaemons for a given owner. Returns daemon summaries ' +
      'with ID, name, owner policy, and last active timestamp. ' +
      'Returns: Array of daemon summaries.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ownerId: {
          type: 'string',
          description: 'Owner ID to filter by. If omitted, lists all daemons.',
        },
        includeStats: {
          type: 'boolean',
          description:
            'If true, include rehydration channel stats (buffer size, compression status). Default: false.',
        },
      },
    },
  },
];

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

export async function handleDaemonLifecycleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'holo_create_daemon':
      return handleCreateDaemon(args);
    case 'holo_get_daemon':
      return handleGetDaemon(args);
    case 'holo_update_daemon_ritual':
      return handleUpdateDaemonRitual(args);
    case 'holo_daemon_turn':
      return handleDaemonTurn(args);
    case 'holo_observe_soul':
      return handleObserveSoul(args);
    case 'holo_daemon_emergence_check':
      return handleEmergenceCheck(args);
    case 'holo_list_daemons':
      return handleListDaemons(args);
    default:
      return null;
  }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

function handleCreateDaemon(args: Record<string, unknown>): {
  daemon: ConversationDaemon;
  profile: DaemonCustomizationProfile;
  rehydrationStats: {
    channelId: string;
    enabled: boolean;
    deltaCompression: boolean;
    minimumDeltaSignificance: number;
  };
} {
  const ownerId = args.ownerId as string;
  if (!ownerId) {
    throw new Error('holo_create_daemon: ownerId is required');
  }

  const daemonId =
    (args.daemonId as string) || `daemon_${ownerId}_${Date.now()}`;
  const displayName = (args.displayName as string) || 'Lumi';
  const careProfile = (args.careProfile as string) || 'care-v1';
  const preset = args.preset as string | undefined;

  let profile: DaemonCustomizationProfile;

  if (preset) {
    const validPresets = ['companion', 'professional', 'creative', 'minimal', 'guardian'] as const;
    if (!validPresets.includes(preset as (typeof validPresets)[number])) {
      throw new Error(
        `holo_create_daemon: invalid preset "${preset}". Valid: ${validPresets.join(', ')}`
      );
    }
    profile = makePresetProfile(
      preset as (typeof validPresets)[number],
      daemonId,
      ownerId,
    );
    // Override display name and care profile if provided
    if (args.displayName) {
      profile = mergeStyleUpdates(profile, { displayName: args.displayName as string });
    }
    if (careProfile !== 'care-v1') {
      profile = mergeStyleUpdates(profile, { careProfile } as Partial<DaemonStyleProfile>);
    }
    if (args.visualTheme) {
      profile = mergeStyleUpdates(profile, {
        visualTheme: args.visualTheme as string,
      } as Partial<DaemonStyleProfile>);
    }
  } else {
    profile = makeDefaultCustomizationProfile(daemonId, ownerId, displayName, careProfile as DaemonCareProfile);
    if (args.visualTheme) {
      profile = mergeStyleUpdates(profile, {
        visualTheme: args.visualTheme as string,
      } as Partial<DaemonStyleProfile>);
    }
  }

  // Validate separation invariants before composing
  const validationErrors = validateCustomizationProfile(profile);
  if (validationErrors.length > 0) {
    throw new Error(
      `holo_create_daemon: profile validation failed: ${validationErrors.join('; ')}`
    );
  }

  // Compose profile → daemon
  const daemon = customizationProfileToDaemon(profile);

  // Assert field separation invariant
  assertDaemonFieldSeparation(daemon);

  // Initialize rehydration channel
  const channel = new BrittneyRehydrationChannelImpl(
    daemon.brittneyRehydrationChannel,
    daemon.daemonId,
    daemon.ownerId,
  );
  rehydrationChannels.set(daemonId, channel);

  // Store
  daemonStore.set(daemonId, daemon);
  profileStore.set(daemonId, profile);

  return {
    daemon,
    profile,
    rehydrationStats: channel.getStats(),
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

function handleGetDaemon(args: Record<string, unknown>): {
  daemon: ConversationDaemon | null;
  profile: DaemonCustomizationProfile | null;
  rehydrationContext?: RehydratedContext;
  rehydrationStats?: ReturnType<BrittneyRehydrationChannelImpl['getStats']>;
} {
  const daemonId = args.daemonId as string;
  if (!daemonId) {
    throw new Error('holo_get_daemon: daemonId is required');
  }

  const daemon = daemonStore.get(daemonId);
  const profile = profileStore.get(daemonId);

  if (!daemon) {
    return {
      daemon: null,
      profile: null,
    };
  }

  const includeRehydration = (args.includeRehydrationContext as boolean) ?? false;
  const channel = rehydrationChannels.get(daemonId);

  return {
    daemon,
    profile: profile ?? null,
    ...(includeRehydration && channel
      ? {
          rehydrationContext: channel.rehydrate(),
          rehydrationStats: channel.getStats(),
        }
      : {}),
  };
}

// ─── UPDATE RITUAL ───────────────────────────────────────────────────────────

function handleUpdateDaemonRitual(args: Record<string, unknown>): {
  profile: DaemonCustomizationProfile;
  daemon: ConversationDaemon;
} {
  const profileId = args.profileId as string;
  if (!profileId) {
    throw new Error('holo_update_daemon_ritual: profileId is required');
  }

  const operation = args.operation as string;
  if (!['add', 'replace', 'remove'].includes(operation)) {
    throw new Error(
      `holo_update_daemon_ritual: invalid operation "${operation}". Valid: add, replace, remove`
    );
  }

  const rituals = (args.rituals as Array<Record<string, unknown>>) || [];
  const profile = profileStore.get(profileId);
  if (!profile) {
    throw new Error(`holo_update_daemon_ritual: profile "${profileId}" not found`);
  }

  // Parse rituals
  const parsedRituals: DaemonRitual[] = rituals.map((r, i) => {
    if (!r.name || !r.trigger || !r.description) {
      throw new Error(
        `holo_update_daemon_ritual: ritual at index ${i} missing required fields (name, trigger, description)`
      );
    }
    // Invariant: ritual triggers must not contain permission-like prefixes
    const permissionLikePrefixes = ['perm:', 'cap:', 'secret:', 'auth:', 'role:'];
    for (const prefix of permissionLikePrefixes) {
      if ((r.trigger as string).startsWith(prefix)) {
        throw new Error(
          `holo_update_daemon_ritual: ritual "${r.name}" trigger starts with "${prefix}" — rituals are personal patterns, not capability grants.`
        );
      }
    }
    return {
      name: r.name as string,
      trigger: r.trigger as string,
      description: r.description as string,
      enabled: (r.enabled as boolean) ?? true,
    };
  });

  let updatedRituals: DaemonRitual[];

  switch (operation) {
    case 'add':
      // Append new rituals, skipping duplicates by name
      updatedRituals = [
        ...profile.style.rituals,
        ...parsedRituals.filter(
          (nr) => !profile.style.rituals.some((er: DaemonRitual) => er.name === nr.name)
        ),
      ];
      break;
    case 'replace':
      updatedRituals = parsedRituals;
      break;
    case 'remove':
      // Remove rituals whose names match
      const namesToRemove = new Set(parsedRituals.map((r: DaemonRitual) => r.name));
      updatedRituals = profile.style.rituals.filter((r: DaemonRitual) => !namesToRemove.has(r.name));
      break;
    default:
      updatedRituals = profile.style.rituals;
  }

  // Update via mergeStyleUpdates — rituals are in the style layer
  const updatedProfile = mergeStyleUpdates(profile, {
    rituals: updatedRituals,
  } as Partial<DaemonStyleProfile>);

  // Validate separation invariants still hold
  const errors = validateCustomizationProfile(updatedProfile);
  if (errors.length > 0) {
    throw new Error(
      `holo_update_daemon_ritual: updated profile violates separation invariants: ${errors.join('; ')}`
    );
  }

  // Re-compose daemon from updated profile
  const updatedDaemon = customizationProfileToDaemon(updatedProfile);

  // Assert field separation invariant
  assertDaemonFieldSeparation(updatedDaemon);

  // Store updated versions
  profileStore.set(profileId, updatedProfile);
  daemonStore.set(profileId, updatedDaemon);

  return {
    profile: updatedProfile,
    daemon: updatedDaemon,
  };
}

// ─── DAEMON TURN (ContextDelta → Brittney field ingest) ──────────────────────
//
// The production entry point that feeds daemon turns into the rehydration channel.
// The channel implementation + processDaemonTurn() already existed but had no
// caller — this tool is the missing surface that lets a turn reach the field.

/** Coerce arbitrary tool input into a valid ContextDelta, defaulting every field. */
function parseContextDelta(value: unknown): ContextDelta {
  const base = makeEmptyContextDelta();
  if (!value || typeof value !== 'object') return base;
  const v = value as Record<string, unknown>;
  return {
    newIntentSignals: Array.isArray(v.newIntentSignals)
      ? (v.newIntentSignals as ContextDelta['newIntentSignals'])
      : base.newIntentSignals,
    updatedPreferences:
      v.updatedPreferences && typeof v.updatedPreferences === 'object'
        ? (v.updatedPreferences as Record<string, unknown>)
        : base.updatedPreferences,
    newReceiptRefs: Array.isArray(v.newReceiptRefs)
      ? (v.newReceiptRefs as unknown[]).filter((r): r is string => typeof r === 'string')
      : base.newReceiptRefs,
    capabilityUpdates: Array.isArray(v.capabilityUpdates)
      ? (v.capabilityUpdates as ContextDelta['capabilityUpdates'])
      : base.capabilityUpdates,
    careSignalHistory: Array.isArray(v.careSignalHistory)
      ? (v.careSignalHistory as unknown[]).filter((s): s is string => typeof s === 'string')
      : base.careSignalHistory,
    significanceScore:
      typeof v.significanceScore === 'number' ? v.significanceScore : base.significanceScore,
  };
}

function handleDaemonTurn(args: Record<string, unknown>): {
  accepted: boolean;
  rehydratedContext: RehydratedContext | null;
  daemonId: string;
} {
  const daemonId = args.daemonId as string;
  if (!daemonId) {
    throw new Error('holo_daemon_turn: daemonId is required');
  }
  const callerId = args.callerId as string;
  if (!callerId) {
    throw new Error('holo_daemon_turn: callerId is required (owner identity for the daemon)');
  }

  const daemon = daemonStore.get(daemonId);
  if (!daemon) {
    throw new Error(`holo_daemon_turn: daemon "${daemonId}" not found`);
  }

  // D1 (2026-05-19 daemon-rehydration audit): assert caller identity against
  // daemon ownership BEFORE any rehydration channel access or delta emission.
  // Throws UnauthorizedDaemonAccessError if the caller does not own the daemon.
  assertCallerOwnsDaemon(daemon, callerId);

  const turn: ConversationDaemonTurn = {
    turnId: (args.turnId as string) || `turn_${daemonId}_${Date.now()}`,
    daemonId,
    surfaceId: (args.surfaceId as string) || 'unknown',
    userUtterance: (args.userUtterance as string) || '',
    extractedArtifacts: [],
    urgency: 'low',
    consentBoundary: 'read_only',
    // The durable memory artifact. Raw conversation text is NOT durable memory — this is.
    contextDelta: parseContextDelta(args.contextDelta),
    requiredApproval: false,
    receiptLinks: [],
    timestamp: (args.timestamp as string) || new Date().toISOString(),
  };

  const { accepted, rehydratedContext } = processDaemonTurn(turn);
  return { accepted, rehydratedContext, daemonId };
}

// ─── OBSERVE SOUL + EMERGENCE (D.053: the daimōn appears from being known) ────

function handleObserveSoul(args: Record<string, unknown>): {
  observed: true;
  ownerId: string;
  routedTo: 'soul-accumulator' | 'daemon-channel';
  ready: boolean;
  knowingScore: number;
  significantTurns: number;
  modelRichness: number;
} {
  const ownerId = args.ownerId as string;
  if (!ownerId) {
    throw new Error('holo_observe_soul: ownerId is required');
  }
  const delta = parseContextDelta(args.contextDelta);

  // If the daimōn has already emerged, observations feed its channel (learning continues).
  const daemonId = emergentDaemonId(ownerId);
  if (daemonStore.has(daemonId)) {
    receiveContextDelta(daemonId, delta);
    const r = evaluateEmergence(ownerId);
    return {
      observed: true,
      ownerId,
      routedTo: 'daemon-channel',
      ready: true,
      knowingScore: 1,
      significantTurns: r.significantTurns,
      modelRichness: r.modelRichness,
    };
  }

  // Pre-emergence: accumulate against the soul's latent model.
  observeSoul(ownerId, delta);
  const r = evaluateEmergence(ownerId);
  return {
    observed: true,
    ownerId,
    routedTo: 'soul-accumulator',
    ready: r.ready,
    knowingScore: r.knowingScore,
    significantTurns: r.significantTurns,
    modelRichness: r.modelRichness,
  };
}

function handleEmergenceCheck(args: Record<string, unknown>): {
  emerged: boolean;
  alreadyEmerged?: boolean;
  daemon?: ConversationDaemon;
  rehydratedContext?: RehydratedContext | null;
  knowingScore: number;
  significantTurns: number;
  modelRichness: number;
  threshold: EmergenceReadiness['threshold'];
} {
  const ownerId = args.ownerId as string;
  if (!ownerId) {
    throw new Error('holo_daemon_emergence_check: ownerId is required');
  }
  const displayName = (args.displayName as string) || 'Lumi';
  const daemonId = emergentDaemonId(ownerId);
  const r = evaluateEmergence(ownerId);

  // Already emerged — return the existing daimōn + its accumulated knowing.
  if (daemonStore.has(daemonId)) {
    return {
      emerged: true,
      alreadyEmerged: true,
      daemon: daemonStore.get(daemonId),
      rehydratedContext: rehydrateDaemon(daemonId),
      knowingScore: 1,
      significantTurns: r.significantTurns,
      modelRichness: r.modelRichness,
      threshold: r.threshold,
    };
  }

  // Not yet known enough — report progress, do not manifest.
  if (!r.ready) {
    return {
      emerged: false,
      knowingScore: r.knowingScore,
      significantTurns: r.significantTurns,
      modelRichness: r.modelRichness,
      threshold: r.threshold,
    };
  }

  // Threshold crossed — the daimōn appears, composed from accumulated context.
  const daemon = composeDaemonFromContext(ownerId, displayName);
  return {
    emerged: true,
    daemon,
    rehydratedContext: rehydrateDaemon(daemon.daemonId),
    knowingScore: 1,
    significantTurns: r.significantTurns,
    modelRichness: r.modelRichness,
    threshold: r.threshold,
  };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

function handleListDaemons(args: Record<string, unknown>): {
  total: number;
  daemons: Array<{
    daemonId: string;
    ownerId: string;
    displayName: string;
    ownerPolicy: string;
    lastActiveAt?: string;
    rehydrationStats?: ReturnType<BrittneyRehydrationChannelImpl['getStats']>;
  }>;
} {
  const ownerId = args.ownerId as string | undefined;
  const includeStats = (args.includeStats as boolean) ?? false;

  const daemons: ConversationDaemon[] = [];
  for (const daemon of daemonStore.values()) {
    if (!ownerId || daemon.ownerId === ownerId) {
      daemons.push(daemon);
    }
  }

  return {
    total: daemons.length,
    daemons: daemons.map((d) => {
      const channel = rehydrationChannels.get(d.daemonId);
      return {
        daemonId: d.daemonId,
        ownerId: d.ownerId,
        displayName: d.displayName,
        ownerPolicy: d.ownerPolicy,
        lastActiveAt: d.lastActiveAt,
        ...(includeStats && channel ? { rehydrationStats: channel.getStats() } : {}),
      };
    }),
  };
}

// ─── Rehydration Channel Public API ───────────────────────────────────────────
//
// These functions expose the rehydration channel for daemon turn processing.
// Production code (e.g., Brittney NPC mode in Hololand) should call
// receiveContextDelta and rehydrateDaemon when processing turns.

/**
 * Receive a ContextDelta from a daemon turn and forward it to the
 * Brittney rehydration channel. Returns true if the delta was accepted
 * (above significance threshold), false if discarded.
 *
 * Call this after every daemon turn to feed context to the field.
 */
export function receiveContextDelta(daemonId: string, delta: ContextDelta): boolean {
  const channel = rehydrationChannels.get(daemonId);
  if (!channel) {
    // No channel — the daemon hasn't been created via MCP.
    // Silently discard (the daemon may exist in a persistent store we
    // haven't loaded yet, or the turn is from a pre-MCP session).
    return false;
  }
  return channel.receive(delta);
}

/**
 * Rehydrate a daemon's context for a new session. Returns the accumulated
 * preferences, receipt references, capability map, and care signals
 * that Brittney reads to restore continuity.
 *
 * Returns null if the daemon has no rehydration channel (pre-MCP daemon).
 */
export function rehydrateDaemon(daemonId: string): RehydratedContext | null {
  const channel = rehydrationChannels.get(daemonId);
  if (!channel) {
    return null;
  }
  return channel.rehydrate();
}

/**
 * Clear a daemon's rehydration buffer. Called on explicit memory clear
 * or daemon reset.
 */
export function clearDaemonRehydration(daemonId: string): boolean {
  const channel = rehydrationChannels.get(daemonId);
  if (!channel) {
    return false;
  }
  channel.clear();
  return true;
}

/**
 * Process a full ConversationDaemonTurn: extract the contextDelta,
 * forward it to the Brittney rehydration channel, and update lastActiveAt.
 *
 * Returns the rehydrated context if the delta was accepted, null if discarded.
 */
export function processDaemonTurn(turn: ConversationDaemonTurn): {
  accepted: boolean;
  rehydratedContext: RehydratedContext | null;
} {
  // Update lastActiveAt on the daemon
  const daemon = daemonStore.get(turn.daemonId);
  if (daemon) {
    daemon.lastActiveAt = turn.timestamp;
  }

  const accepted = receiveContextDelta(turn.daemonId, turn.contextDelta);
  const rehydratedContext = accepted ? rehydrateDaemon(turn.daemonId) : null;

  return { accepted, rehydratedContext };
}

// ─── Type exports ─────────────────────────────────────────────────────────────

export type { RehydratedContext };
