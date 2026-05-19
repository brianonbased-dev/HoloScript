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
  makeDefaultConversationDaemon,
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
          (nr) => !profile.style.rituals.some((er) => er.name === nr.name)
        ),
      ];
      break;
    case 'replace':
      updatedRituals = parsedRituals;
      break;
    case 'remove':
      // Remove rituals whose names match
      const namesToRemove = new Set(parsedRituals.map((r) => r.name));
      updatedRituals = profile.style.rituals.filter((r) => !namesToRemove.has(r.name));
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