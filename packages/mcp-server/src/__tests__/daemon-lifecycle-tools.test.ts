/**
 * Tests for ConversationDaemon lifecycle MCP tools
 * and DaemonBrittneyRehydrationChannel implementation.
 *
 * Task: task_1779158611517_uw6j
 * Source: packages/core/src/daemon/ConversationDaemon.ts + idea-run-14 Pattern F + D.052 ruling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type ConversationDaemon,
  type DaemonCustomizationProfile,
  type DaemonRitual,
  type ContextDelta,
  type ConversationDaemonTurn,
  makeDefaultConversationDaemon,
  makeEmptyContextDelta,
  assertDaemonFieldSeparation,
  makeDefaultCustomizationProfile,
  makePresetProfile,
  customizationProfileToDaemon,
  daemonToCustomizationProfile,
  validateCustomizationProfile,
  DaemonFieldSeparationError,
} from '@holoscript/core';
import {
  daemonLifecycleTools,
  handleDaemonLifecycleTool,
  receiveContextDelta,
  rehydrateDaemon,
  clearDaemonRehydration,
  processDaemonTurn,
  type RehydratedContext,
} from '../daemon-lifecycle-tools';

// ─── Tool Registration ─────────────────────────────────────────────────────────

describe('daemonLifecycleTools', () => {
  it('registers 4 MCP tools with holo_ prefix', () => {
    expect(daemonLifecycleTools).toHaveLength(4);
    const names = daemonLifecycleTools.map((t) => t.name);
    expect(names).toContain('holo_create_daemon');
    expect(names).toContain('holo_get_daemon');
    expect(names).toContain('holo_update_daemon_ritual');
    expect(names).toContain('holo_list_daemons');
  });

  it('each tool has required inputSchema properties', () => {
    for (const tool of daemonLifecycleTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

// ─── holo_create_daemon ───────────────────────────────────────────────────────

describe('holo_create_daemon', () => {
  it('creates a daemon with defaults', async () => {
    const result = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-1',
    });
    expect(result).not.toBeNull();
    const r = result as {
      daemon: ConversationDaemon;
      profile: DaemonCustomizationProfile;
      rehydrationStats: { channelId: string; enabled: boolean };
    };
    expect(r.daemon.ownerId).toBe('user-1');
    expect(r.daemon.displayName).toBe('Lumi');
    expect(r.daemon.ownerPolicy).toBe('private');
    expect(r.daemon.permissionProfile.readOnly).toBe(true);
    expect(r.daemon.brittneyRehydrationChannel.enabled).toBe(true);
    expect(r.rehydrationStats.channelId).toBe(`user-1:${r.daemon.daemonId}`);
    expect(r.rehydrationStats.enabled).toBe(true);
  });

  it('creates a daemon with custom name and preset', async () => {
    const result = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-2',
      displayName: 'Atlas',
      preset: 'professional',
    });
    const r = result as { daemon: ConversationDaemon };
    expect(r.daemon.displayName).toBe('Atlas');
    expect(r.daemon.ownerId).toBe('user-2');
  });

  it('creates a guardian preset with escalated permissions', async () => {
    const result = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-3',
      preset: 'guardian',
    });
    const r = result as { daemon: ConversationDaemon };
    expect(r.daemon.permissionProfile.breakGlassAllowed).toBe(true);
    expect(r.daemon.permissionProfile.custodyScope).toContain(
      'holoshell:guardian:emergency'
    );
  });

  it('rejects missing ownerId', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_create_daemon', {})
    ).rejects.toThrow('ownerId is required');
  });

  it('rejects invalid preset', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_create_daemon', {
        ownerId: 'user-4',
        preset: 'nonexistent',
      })
    ).rejects.toThrow('invalid preset');
  });

  it('daemon passes assertDaemonFieldSeparation', async () => {
    const result = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-5',
    });
    const r = result as { daemon: ConversationDaemon };
    // Should not throw — the factory produces valid daemons
    expect(() => assertDaemonFieldSeparation(r.daemon)).not.toThrow();
  });
});

// ─── holo_get_daemon ──────────────────────────────────────────────────────────

describe('holo_get_daemon', () => {
  it('retrieves a created daemon', async () => {
    const createResult = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-10',
      daemonId: 'get-test-daemon',
    });
    const created = createResult as { daemon: ConversationDaemon };

    const getResult = await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'get-test-daemon',
    });
    const g = getResult as { daemon: ConversationDaemon; profile: DaemonCustomizationProfile };
    expect(g.daemon).not.toBeNull();
    expect(g.daemon.daemonId).toBe('get-test-daemon');
    expect(g.profile).not.toBeNull();
  });

  it('returns nulls for nonexistent daemon', async () => {
    const result = await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'nonexistent',
    });
    const r = result as { daemon: null; profile: null };
    expect(r.daemon).toBeNull();
    expect(r.profile).toBeNull();
  });

  it('includes rehydration context when requested', async () => {
    const createResult = await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-11',
      daemonId: 'rehy-test',
    });

    // Feed a context delta
    const delta: ContextDelta = {
      ...makeEmptyContextDelta(),
      significanceScore: 0.5,
      newReceiptRefs: ['receipt-1'],
      updatedPreferences: { theme: 'dark' },
    };
    receiveContextDelta('rehy-test', delta);

    const getResult = await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'rehy-test',
      includeRehydrationContext: true,
    });
    const g = getResult as {
      daemon: ConversationDaemon;
      rehydrationContext: RehydratedContext;
      rehydrationStats: { bufferSize: number };
    };
    expect(g.rehydrationContext).toBeDefined();
    expect(g.rehydrationContext.channelId).toBeTruthy();
    expect(g.rehydrationContext.aggregatedPreferences.theme).toBe('dark');
    expect(g.rehydrationStats.bufferSize).toBe(1);
  });

  it('rejects missing daemonId', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_get_daemon', {})
    ).rejects.toThrow('daemonId is required');
  });
});

// ─── holo_update_daemon_ritual ────────────────────────────────────────────────

describe('holo_update_daemon_ritual', () => {
  const testRituals: DaemonRitual[] = [
    {
      name: 'morning_briefing',
      trigger: 'cron:0 8 * * *',
      description: 'Daily morning briefing',
      enabled: true,
    },
    {
      name: 'focus_mode',
      trigger: 'keyword:focus',
      description: 'Enter focus mode',
      enabled: true,
    },
  ];

  it('adds rituals to a daemon profile', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-20',
      daemonId: 'ritual-add',
    });

    const result = await handleDaemonLifecycleTool('holo_update_daemon_ritual', {
      profileId: 'ritual-add',
      operation: 'add',
      rituals: testRituals,
    });
    const r = result as { profile: DaemonCustomizationProfile };
    expect(r.profile.style.rituals).toHaveLength(2);
    expect(r.profile.style.rituals[0].name).toBe('morning_briefing');
    expect(r.profile.version).toBe(2); // incremented from merge
  });

  it('replaces all rituals', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-21',
      daemonId: 'ritual-replace',
    });

    // Add initial rituals
    await handleDaemonLifecycleTool('holo_update_daemon_ritual', {
      profileId: 'ritual-replace',
      operation: 'add',
      rituals: testRituals,
    });

    // Replace with a single new ritual
    const newRitual: DaemonRitual = {
      name: 'end_of_day_review',
      trigger: 'cron:0 18 * * *',
      description: 'End of day review',
      enabled: true,
    };
    const result = await handleDaemonLifecycleTool('holo_update_daemon_ritual', {
      profileId: 'ritual-replace',
      operation: 'replace',
      rituals: [newRitual],
    });
    const r = result as { profile: DaemonCustomizationProfile };
    expect(r.profile.style.rituals).toHaveLength(1);
    expect(r.profile.style.rituals[0].name).toBe('end_of_day_review');
  });

  it('removes rituals by name', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-22',
      daemonId: 'ritual-remove',
    });

    // Add rituals
    await handleDaemonLifecycleTool('holo_update_daemon_ritual', {
      profileId: 'ritual-remove',
      operation: 'add',
      rituals: testRituals,
    });

    // Remove one by name
    const result = await handleDaemonLifecycleTool('holo_update_daemon_ritual', {
      profileId: 'ritual-remove',
      operation: 'remove',
      rituals: [{ name: 'focus_mode', trigger: 'keyword:focus', description: 'Remove' }],
    });
    const r = result as { profile: DaemonCustomizationProfile };
    expect(r.profile.style.rituals).toHaveLength(1);
    expect(r.profile.style.rituals[0].name).toBe('morning_briefing');
  });

  it('rejects rituals with permission-like triggers', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-23',
      daemonId: 'ritual-permission',
    });

    await expect(
      handleDaemonLifecycleTool('holo_update_daemon_ritual', {
        profileId: 'ritual-permission',
        operation: 'add',
        rituals: [
          {
            name: 'bad_ritual',
            trigger: 'perm:admin',
            description: 'Should be rejected',
          },
        ],
      })
    ).rejects.toThrow('rituals are personal patterns, not capability grants');
  });

  it('rejects missing profileId', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_update_daemon_ritual', {
        operation: 'add',
        rituals: [],
      })
    ).rejects.toThrow('profileId is required');
  });

  it('rejects nonexistent profile', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_update_daemon_ritual', {
        profileId: 'no-such-profile',
        operation: 'add',
        rituals: testRituals,
      })
    ).rejects.toThrow('not found');
  });
});

// ─── holo_list_daemons ────────────────────────────────────────────────────────

describe('holo_list_daemons', () => {
  it('lists all daemons', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-30',
      daemonId: 'list-a',
    });
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-31',
      daemonId: 'list-b',
    });

    const result = await handleDaemonLifecycleTool('holo_list_daemons', {});
    const r = result as {
      total: number;
      daemons: Array<{ daemonId: string; ownerId: string }>;
    };
    expect(r.total).toBeGreaterThanOrEqual(2);
    const ids = r.daemons.map((d) => d.daemonId);
    expect(ids).toContain('list-a');
    expect(ids).toContain('list-b');
  });

  it('filters by ownerId', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-filter',
      daemonId: 'filter-a',
    });
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-other',
      daemonId: 'filter-b',
    });

    const result = await handleDaemonLifecycleTool('holo_list_daemons', {
      ownerId: 'user-filter',
    });
    const r = result as {
      total: number;
      daemons: Array<{ daemonId: string; ownerId: string }>;
    };
    expect(r.total).toBeGreaterThanOrEqual(1);
    for (const d of r.daemons) {
      expect(d.ownerId).toBe('user-filter');
    }
  });

  it('includes rehydration stats when requested', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'user-stats',
      daemonId: 'stats-daemon',
    });

    const result = await handleDaemonLifecycleTool('holo_list_daemons', {
      ownerId: 'user-stats',
      includeStats: true,
    });
    const r = result as {
      daemons: Array<{
        daemonId: string;
        rehydrationStats?: { channelId: string; bufferSize: number };
      }>;
    };
    const daemon = r.daemons.find((d) => d.daemonId === 'stats-daemon');
    expect(daemon).toBeDefined();
    expect(daemon!.rehydrationStats).toBeDefined();
    expect(daemon!.rehydrationStats!.channelId).toBeTruthy();
  });
});

// ─── BrittneyRehydrationChannel ───────────────────────────────────────────────

describe('BrittneyRehydrationChannel implementation', () => {
  it('receives deltas above significance threshold', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'rehy-owner',
      daemonId: 'rehy-accept',
    });

    const delta: ContextDelta = {
      ...makeEmptyContextDelta(),
      significanceScore: 0.5,
      newReceiptRefs: ['receipt-001'],
      updatedPreferences: { color: 'blue' },
    };
    const accepted = receiveContextDelta('rehy-accept', delta);
    expect(accepted).toBe(true);
  });

  it('discards deltas below significance threshold', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'rehy-owner2',
      daemonId: 'rehy-discard',
    });

    const delta: ContextDelta = {
      ...makeEmptyContextDelta(),
      significanceScore: 0.05, // Below default threshold of 0.2
    };
    const accepted = receiveContextDelta('rehy-discard', delta);
    expect(accepted).toBe(false);
  });

  it('rehydrates with aggregated preferences and deduplicated receipt refs', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'rehy-owner3',
      daemonId: 'rehy-aggregate',
    });

    // Feed multiple deltas
    receiveContextDelta('rehy-aggregate', {
      ...makeEmptyContextDelta(),
      significanceScore: 0.5,
      updatedPreferences: { theme: 'dark', lang: 'en' },
      newReceiptRefs: ['r1', 'r2'],
    });
    receiveContextDelta('rehy-aggregate', {
      ...makeEmptyContextDelta(),
      significanceScore: 0.6,
      updatedPreferences: { theme: 'light' }, // overrides theme
      newReceiptRefs: ['r2', 'r3'], // r2 is duplicate
    });

    const context = rehydrateDaemon('rehy-aggregate');
    expect(context).not.toBeNull();
    expect(context!.aggregatedPreferences.theme).toBe('light'); // latest wins
    expect(context!.aggregatedPreferences.lang).toBe('en'); // preserved
    expect(context!.receiptRefs).toContain('r1');
    expect(context!.receiptRefs).toContain('r2');
    expect(context!.receiptRefs).toContain('r3');
    // Deduplicated
    expect(context!.receiptRefs.filter((r) => r === 'r2')).toHaveLength(1);
  });

  it('clears rehydration buffer', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'rehy-owner4',
      daemonId: 'rehy-clear',
    });

    receiveContextDelta('rehy-clear', {
      ...makeEmptyContextDelta(),
      significanceScore: 0.5,
      updatedPreferences: { key: 'value' },
    });

    const cleared = clearDaemonRehydration('rehy-clear');
    expect(cleared).toBe(true);

    const context = rehydrateDaemon('rehy-clear');
    expect(context!.aggregatedPreferences).toEqual({});
    expect(context!.receiptRefs).toHaveLength(0);
  });

  it('returns false for nonexistent daemon when receiving delta', () => {
    const accepted = receiveContextDelta('nonexistent-daemon', makeEmptyContextDelta());
    expect(accepted).toBe(false);
  });

  it('returns null for nonexistent daemon when rehydrating', () => {
    const context = rehydrateDaemon('nonexistent-daemon');
    expect(context).toBeNull();
  });

  it('returns false for nonexistent daemon when clearing', () => {
    const cleared = clearDaemonRehydration('nonexistent-daemon');
    expect(cleared).toBe(false);
  });
});

// ─── processDaemonTurn ─────────────────────────────────────────────────────────

describe('processDaemonTurn', () => {
  it('processes a turn and returns rehydrated context', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'turn-owner',
      daemonId: 'turn-daemon',
    });

    const turn: ConversationDaemonTurn = {
      turnId: 'turn-001',
      daemonId: 'turn-daemon',
      surfaceId: 'holoshell:room:home',
      userUtterance: 'What is my schedule today?',
      extractedArtifacts: [],
      urgency: 'medium',
      consentBoundary: 'read_only',
      contextDelta: {
        ...makeEmptyContextDelta(),
        significanceScore: 0.7,
        newIntentSignals: [{ verb: 'check', target: 'schedule', parameters: {}, confidence: 0.9 }],
        updatedPreferences: { morning_briefing: true },
      },
      requiredApproval: false,
      receiptLinks: [],
      timestamp: new Date().toISOString(),
    };

    const result = processDaemonTurn(turn);
    expect(result.accepted).toBe(true);
    expect(result.rehydratedContext).not.toBeNull();
    expect(result.rehydratedContext!.aggregatedPreferences.morning_briefing).toBe(true);
  });

  it('rejects low-significance turns', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'turn-owner2',
      daemonId: 'turn-low',
    });

    const turn: ConversationDaemonTurn = {
      turnId: 'turn-002',
      daemonId: 'turn-low',
      surfaceId: 'holoshell:room:home',
      userUtterance: 'hmm',
      extractedArtifacts: [],
      urgency: 'low',
      consentBoundary: 'no_action',
      contextDelta: {
        ...makeEmptyContextDelta(),
        significanceScore: 0.05, // Below default 0.2 threshold
      },
      requiredApproval: false,
      receiptLinks: [],
      timestamp: new Date().toISOString(),
    };

    const result = processDaemonTurn(turn);
    expect(result.accepted).toBe(false);
    expect(result.rehydratedContext).toBeNull();
  });

  it('updates lastActiveAt on the daemon', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'turn-owner3',
      daemonId: 'turn-active',
    });

    const turn: ConversationDaemonTurn = {
      turnId: 'turn-003',
      daemonId: 'turn-active',
      surfaceId: 'holoshell:room:home',
      userUtterance: 'Show me the weather',
      extractedArtifacts: [],
      urgency: 'low',
      consentBoundary: 'read_only',
      contextDelta: {
        ...makeEmptyContextDelta(),
        significanceScore: 0.5,
      },
      requiredApproval: false,
      receiptLinks: [],
      timestamp: '2026-05-18T10:00:00.000Z',
    };

    processDaemonTurn(turn);

    const getResult = await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'turn-active',
    });
    const g = getResult as { daemon: ConversationDaemon };
    expect(g.daemon.lastActiveAt).toBe('2026-05-18T10:00:00.000Z');
  });
});

// ─── Unknown tool returns null ────────────────────────────────────────────────

describe('handleDaemonLifecycleTool dispatch', () => {
  it('returns null for unknown tool name', async () => {
    const result = await handleDaemonLifecycleTool('unknown_daemon_tool', {});
    expect(result).toBeNull();
  });
});