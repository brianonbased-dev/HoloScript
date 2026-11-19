/**
 * Tests for ConversationDaemon lifecycle MCP tools
 * and DaemonBrittneyRehydrationChannel implementation.
 *
 * Task: task_1779158611517_uw6j
 * Source: packages/core/src/daemon/ConversationDaemon.ts + idea-run-14 Pattern F + D.052 ruling
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import type { RehydratedContext } from '../daemon-lifecycle-tools';

// ─── Store isolation (task_1790054928541_kzbo part B) ─────────────────────────
//
// daemon-emergence-store resolves HOLOMESH_DATA_DIR ONCE, at module load, and
// every holo_observe_soul / emergence below write-throughs to that store. Without
// this pin the suite appended its fixtures to the REAL corpus at
// ~/.holoscript/holomesh/emergence/soul-observations.jsonl (soul-emerge-* rows
// were found there on 2026-09-22). The pin must precede the first import of the
// lifecycle module — hence the dynamic imports below (mirrors
// daemon-emergence-persistence.test.ts).

const TEMP_DATA_DIR = mkdtempSync(join(tmpdir(), 'daemon-lifecycle-tools-'));
const PREVIOUS_DATA_DIR = process.env.HOLOMESH_DATA_DIR;
process.env.HOLOMESH_DATA_DIR = TEMP_DATA_DIR;

const {
  daemonLifecycleTools,
  handleDaemonLifecycleTool,
  receiveContextDelta,
  rehydrateDaemon,
  clearDaemonRehydration,
  processDaemonTurn,
  emergentDaemonId,
  _daemonExistsForTest,
} = await import('../daemon-lifecycle-tools');
const { _corpusPathForTest, readEmergenceRecords } = await import('../daemon-emergence-store');

afterAll(() => {
  if (PREVIOUS_DATA_DIR === undefined) delete process.env.HOLOMESH_DATA_DIR;
  else process.env.HOLOMESH_DATA_DIR = PREVIOUS_DATA_DIR;
  rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
});

// Enough significant, model-rich observations to cross the emergence threshold
// (MIN_SIGNIFICANT_TURNS=5 @ significance>=0.5, MIN_MODEL_RICHNESS=3).
function knowingDeltas() {
  return [
    {
      updatedPreferences: { theme: 'dark' },
      careSignalHistory: ['focus'],
      significanceScore: 0.8,
    },
    { updatedPreferences: { lang: 'ts' }, significanceScore: 0.7 },
    {
      updatedPreferences: { pace: 'fast' },
      careSignalHistory: ['encourage'],
      significanceScore: 0.9,
    },
    { newReceiptRefs: ['receipt:x'], significanceScore: 0.6 },
    { updatedPreferences: { editor: 'vim' }, significanceScore: 0.75 },
  ];
}

// ─── Tool Registration ─────────────────────────────────────────────────────────

describe('daemonLifecycleTools', () => {
  it('registers 8 MCP tools with holo_ prefix', () => {
    expect(daemonLifecycleTools).toHaveLength(8);
    const names = daemonLifecycleTools.map((t) => t.name);
    expect(names).toContain('holo_create_daemon');
    expect(names).toContain('holo_get_daemon');
    expect(names).toContain('holo_update_daemon_ritual');
    expect(names).toContain('holo_daemon_turn');
    expect(names).toContain('holo_observe_soul');
    expect(names).toContain('holo_daemon_emergence_check');
    expect(names).toContain('holo_list_daemons');
    expect(names).toContain('holo_export_emergence_corpus');
  });

  it('each tool has required inputSchema properties', () => {
    for (const tool of daemonLifecycleTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('the three daimōn read tools declare callerId (task_1790062507560_px5q)', () => {
    for (const name of ['holo_get_daemon', 'holo_list_daemons', 'holo_daemon_emergence_check']) {
      const tool = daemonLifecycleTools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, { type?: string }>;
      expect(props.callerId?.type, `${name}.callerId`).toBe('string');
    }
  });
});

// ─── holo_daemon_turn (ContextDelta → Brittney field ingest) ──────────────────

describe('holo_daemon_turn', () => {
  async function createTurnDaemon(ownerId: string): Promise<string> {
    const result = (await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId,
    })) as { daemon: ConversationDaemon };
    return result.daemon.daemonId;
  }

  it('feeds an above-threshold ContextDelta to the rehydration channel', async () => {
    const daemonId = await createTurnDaemon('owner-turn-1');
    const result = (await handleDaemonLifecycleTool('holo_daemon_turn', {
      daemonId,
      callerId: 'owner-turn-1',
      userUtterance: 'remember I prefer dark mode',
      surfaceId: 'holoshell',
      contextDelta: {
        updatedPreferences: { theme: 'dark' },
        newReceiptRefs: ['receipt:abc'],
        significanceScore: 0.8,
      },
    })) as {
      accepted: boolean;
      rehydratedContext: RehydratedContext | null;
      daemonId: string;
    };

    expect(result.accepted).toBe(true);
    expect(result.daemonId).toBe(daemonId);
    expect(result.rehydratedContext).not.toBeNull();
    expect(result.rehydratedContext?.aggregatedPreferences).toMatchObject({ theme: 'dark' });
    expect(result.rehydratedContext?.receiptRefs).toContain('receipt:abc');
  });

  it('discards a below-threshold delta (empty delta has significance 0)', async () => {
    const daemonId = await createTurnDaemon('owner-turn-2');
    const result = (await handleDaemonLifecycleTool('holo_daemon_turn', {
      daemonId,
      callerId: 'owner-turn-2',
    })) as { accepted: boolean; rehydratedContext: RehydratedContext | null };

    expect(result.accepted).toBe(false);
    expect(result.rehydratedContext).toBeNull();
  });

  it('rejects a caller that does not own the daemon (D1 audit boundary)', async () => {
    const daemonId = await createTurnDaemon('owner-turn-3');
    await expect(
      handleDaemonLifecycleTool('holo_daemon_turn', {
        daemonId,
        callerId: 'attacker-9',
        contextDelta: { significanceScore: 0.9 },
      })
    ).rejects.toThrow(/Unauthorized daemon access|does not match owner/i);
  });

  it('rejects missing daemonId and callerId', async () => {
    await expect(handleDaemonLifecycleTool('holo_daemon_turn', { callerId: 'x' })).rejects.toThrow(
      'daemonId is required'
    );
    await expect(
      handleDaemonLifecycleTool('holo_daemon_turn', { daemonId: 'nope' })
    ).rejects.toThrow('callerId is required');
  });

  it('rejects a turn for an unknown daemon', async () => {
    await expect(
      handleDaemonLifecycleTool('holo_daemon_turn', {
        daemonId: 'does-not-exist',
        callerId: 'owner-turn-4',
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ─── Emergence: the daimōn appears from being known (D.053) ───────────────────

describe('holo_observe_soul + holo_daemon_emergence_check', () => {
  it('does NOT manifest a daimōn before the knowing threshold is crossed', async () => {
    const ownerId = 'soul-latent-1';
    // Two weak observations — nowhere near the threshold.
    await handleDaemonLifecycleTool('holo_observe_soul', {
      ownerId,
      contextDelta: { updatedPreferences: { theme: 'dark' }, significanceScore: 0.8 },
    });
    const check = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId,
    })) as { emerged: boolean; daemon?: unknown; knowingScore: number };

    expect(check.emerged).toBe(false);
    expect(check.daemon).toBeUndefined();
    expect(check.knowingScore).toBeLessThan(1);
  });

  it('does not count below-significance deltas toward knowing', async () => {
    const ownerId = 'soul-weak-1';
    for (let i = 0; i < 8; i++) {
      await handleDaemonLifecycleTool('holo_observe_soul', {
        ownerId,
        contextDelta: { updatedPreferences: { ['k' + i]: i }, significanceScore: 0.2 },
      });
    }
    const check = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId,
    })) as { emerged: boolean; significantTurns: number };
    // 8 observations but all below the 0.5 floor → zero significant turns → no emergence.
    expect(check.emerged).toBe(false);
    expect(check.significantTurns).toBe(0);
  });

  it('manifests the daimōn once known enough, composed from accumulated context', async () => {
    const ownerId = 'soul-emerge-1';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId, contextDelta: delta });
    }

    // Last observe should report ready.
    const probe = (await handleDaemonLifecycleTool('holo_observe_soul', {
      ownerId,
      contextDelta: { significanceScore: 0.1 },
    })) as { ready: boolean; routedTo: string };
    expect(probe.routedTo).toBe('soul-accumulator');
    expect(probe.ready).toBe(true);

    const emerged = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId,
      // The soul asks for itself — the only caller the rehydrated context is handed to.
      callerId: ownerId,
      displayName: 'Sage',
    })) as {
      emerged: boolean;
      daemon?: ConversationDaemon;
      rehydratedContext?: RehydratedContext | null;
      knowingScore: number;
    };

    expect(emerged.emerged).toBe(true);
    expect(emerged.knowingScore).toBe(1);
    expect(emerged.daemon).toBeDefined();
    expect(emerged.daemon?.ownerId).toBe(ownerId);
    expect(emerged.daemon?.daemonId).toBe(`daemon-${ownerId}`);
    expect(emerged.daemon?.displayName).toBe('Sage');
    // Composed from context: the channel is pre-seeded with what was learned.
    expect(emerged.rehydratedContext).not.toBeNull();
    expect(emerged.rehydratedContext?.aggregatedPreferences).toMatchObject({
      theme: 'dark',
      lang: 'ts',
      pace: 'fast',
      editor: 'vim',
    });
    expect(emerged.rehydratedContext?.careSignals).toEqual(
      expect.arrayContaining(['focus', 'encourage'])
    );
  });

  it('returns the already-emerged daimōn on a second check (idempotent)', async () => {
    const ownerId = 'soul-emerge-2';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId, contextDelta: delta });
    }
    await handleDaemonLifecycleTool('holo_daemon_emergence_check', { ownerId });

    const second = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId,
    })) as { emerged: boolean; alreadyEmerged?: boolean; daemon?: ConversationDaemon };

    expect(second.emerged).toBe(true);
    expect(second.alreadyEmerged).toBe(true);
    expect(second.daemon?.daemonId).toBe(`daemon-${ownerId}`);
  });

  it('routes post-emergence observations to the daimōn channel, not the accumulator', async () => {
    const ownerId = 'soul-emerge-3';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId, contextDelta: delta });
    }
    await handleDaemonLifecycleTool('holo_daemon_emergence_check', { ownerId });

    const post = (await handleDaemonLifecycleTool('holo_observe_soul', {
      ownerId,
      contextDelta: { updatedPreferences: { newPref: 'after' }, significanceScore: 0.9 },
    })) as { routedTo: string };
    expect(post.routedTo).toBe('daemon-channel');

    // The post-emergence delta is readable via the daemon's rehydration.
    const got = (await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: `daemon-${ownerId}`,
      includeRehydrationContext: true,
      callerId: ownerId,
    })) as { rehydrationContext?: RehydratedContext };
    expect(got.rehydrationContext?.aggregatedPreferences).toMatchObject({ newPref: 'after' });
  });

  it('rejects observe/emergence calls missing ownerId', async () => {
    await expect(handleDaemonLifecycleTool('holo_observe_soul', {})).rejects.toThrow(
      'ownerId is required'
    );
    await expect(handleDaemonLifecycleTool('holo_daemon_emergence_check', {})).rejects.toThrow(
      'ownerId is required'
    );
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
    expect(r.daemon.permissionProfile.custodyScope).toContain('holoshell:guardian:emergency');
  });

  it('rejects missing ownerId', async () => {
    await expect(handleDaemonLifecycleTool('holo_create_daemon', {})).rejects.toThrow(
      'ownerId is required'
    );
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
      callerId: 'user-11',
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
    await expect(handleDaemonLifecycleTool('holo_get_daemon', {})).rejects.toThrow(
      'daemonId is required'
    );
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

    // The owner's view: only callerId === ownerId sees the ownerId column.
    const result = await handleDaemonLifecycleTool('holo_list_daemons', {
      ownerId: 'user-filter',
      callerId: 'user-filter',
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
      callerId: 'user-stats',
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

// ─── Owner boundary: the daimōn is private (task_1790062507560_px5q) ──────────

describe('daimōn read tools refuse a caller that is not the owner', () => {
  const OWNER = 'owner-private-1';
  const STRANGER = 'stranger-7';
  const REMEMBERED = { secret: 'the owner takes tea at four' };

  async function createDaemonWithMemory(daemonId: string): Promise<void> {
    await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId });
    expect(
      receiveContextDelta(daemonId, {
        ...makeEmptyContextDelta(),
        significanceScore: 0.9,
        updatedPreferences: { ...REMEMBERED },
        newReceiptRefs: ['receipt:private'],
      })
    ).toBe(true);
  }

  it('holo_get_daemon with context: a stranger is refused, the owner succeeds', async () => {
    await createDaemonWithMemory('private-get');

    await expect(
      handleDaemonLifecycleTool('holo_get_daemon', {
        daemonId: 'private-get',
        includeRehydrationContext: true,
        callerId: STRANGER,
      })
    ).rejects.toThrow(/Unauthorized daemon access|does not match owner/i);

    const asOwner = (await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'private-get',
      includeRehydrationContext: true,
      callerId: OWNER,
    })) as { rehydrationContext?: RehydratedContext; rehydrationStats?: { bufferSize: number } };
    expect(asOwner.rehydrationContext?.aggregatedPreferences).toMatchObject(REMEMBERED);
    expect(asOwner.rehydrationContext?.receiptRefs).toContain('receipt:private');
    expect(asOwner.rehydrationStats?.bufferSize).toBe(1);
  });

  it('holo_get_daemon with context and no callerId is refused (no anonymous memory reads)', async () => {
    await createDaemonWithMemory('private-get-anon');
    await expect(
      handleDaemonLifecycleTool('holo_get_daemon', {
        daemonId: 'private-get-anon',
        includeRehydrationContext: true,
      })
    ).rejects.toThrow('callerId is required');
  });

  it('holo_get_daemon without context returns the record with no memory fields, for any caller', async () => {
    await createDaemonWithMemory('private-get-plain');
    const asStranger = (await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'private-get-plain',
      callerId: STRANGER,
    })) as Record<string, unknown> & { daemon: ConversationDaemon | null };
    expect(asStranger.daemon?.daemonId).toBe('private-get-plain');
    expect(asStranger).not.toHaveProperty('rehydrationContext');
    expect(asStranger).not.toHaveProperty('rehydrationStats');
    expect(JSON.stringify(asStranger)).not.toContain(REMEMBERED.secret);
  });

  it('holo_list_daemons hides ownerId and rehydrationStats from a stranger', async () => {
    await createDaemonWithMemory('private-list');
    type ListRow = Record<string, unknown> & { daemonId: string };
    const rowFor = (result: unknown): ListRow | undefined =>
      (result as { daemons: ListRow[] }).daemons.find((d) => d.daemonId === 'private-list');

    // A stranger, unfiltered, asking for stats: identity only.
    const asStranger = rowFor(
      await handleDaemonLifecycleTool('holo_list_daemons', {
        includeStats: true,
        callerId: STRANGER,
      })
    );
    expect(asStranger).toEqual({ daemonId: 'private-list', displayName: 'Lumi' });

    // No callerId at all: identity only.
    const anonymous = rowFor(
      await handleDaemonLifecycleTool('holo_list_daemons', { includeStats: true })
    );
    expect(anonymous).toEqual({ daemonId: 'private-list', displayName: 'Lumi' });

    // A stranger naming the owner as the filter still gets identity rows only.
    const filteredByStranger = (await handleDaemonLifecycleTool('holo_list_daemons', {
      ownerId: OWNER,
      includeStats: true,
      callerId: STRANGER,
    })) as { daemons: ListRow[] };
    expect(filteredByStranger.daemons.length).toBeGreaterThan(0);
    for (const row of filteredByStranger.daemons) {
      expect(Object.keys(row).sort()).toEqual(['daemonId', 'displayName']);
    }

    // The owner sees the full row, stats included.
    const asOwner = rowFor(
      await handleDaemonLifecycleTool('holo_list_daemons', {
        ownerId: OWNER,
        includeStats: true,
        callerId: OWNER,
      })
    )!;
    expect(asOwner.ownerId).toBe(OWNER);
    expect(asOwner.ownerPolicy).toBe('private');
    expect((asOwner.rehydrationStats as { bufferSize: number } | undefined)?.bufferSize).toBe(1);
  });

  it('holo_daemon_emergence_check hands the rehydrated context only to the owner', async () => {
    const soul = 'soul-private-emerge';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId: soul, contextDelta: delta });
    }

    // A stranger triggers the emergence: the daimōn manifests, its memory is withheld.
    const asStranger = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: soul,
      callerId: STRANGER,
    })) as {
      emerged: boolean;
      daemon?: ConversationDaemon;
      rehydratedContextWithheld?: string;
    };
    expect(asStranger.emerged).toBe(true);
    expect(asStranger.daemon?.daemonId).toBe(`daemon-${soul}`);
    expect(asStranger).not.toHaveProperty('rehydratedContext');
    expect(asStranger.rehydratedContextWithheld).toBe('caller_not_owner');

    // Already emerged, no callerId: still withheld.
    const anonymous = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: soul,
    })) as { alreadyEmerged?: boolean; rehydratedContextWithheld?: string };
    expect(anonymous.alreadyEmerged).toBe(true);
    expect(anonymous).not.toHaveProperty('rehydratedContext');
    expect(anonymous.rehydratedContextWithheld).toBe('caller_not_owner');

    // The soul itself receives what the field learned.
    const asOwner = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: soul,
      callerId: soul,
    })) as { alreadyEmerged?: boolean; rehydratedContext?: RehydratedContext | null };
    expect(asOwner.alreadyEmerged).toBe(true);
    expect(asOwner).not.toHaveProperty('rehydratedContextWithheld');
    expect(asOwner.rehydratedContext?.aggregatedPreferences).toMatchObject({
      theme: 'dark',
      editor: 'vim',
    });
  });
});

// ─── Store isolation (task_1790054928541_kzbo part B) ─────────────────────────

describe('emergence store isolation', () => {
  it('writes soul observations to the pinned temp data dir, never the real store', async () => {
    const corpus = _corpusPathForTest();
    // Positive control: if the pin ever moves below the first import, this fails.
    expect(corpus).toBe(join(TEMP_DATA_DIR, 'emergence', 'soul-observations.jsonl'));
    await handleDaemonLifecycleTool('holo_observe_soul', {
      ownerId: 'soul-isolation-1',
      contextDelta: { updatedPreferences: { pinned: true }, significanceScore: 0.9 },
    });
    expect(existsSync(corpus)).toBe(true);
    expect(statSync(corpus).size).toBeGreaterThan(0);
  });
});

// ─── Identity cannot be squatted or forged (custody review follow-ups) ────────

describe('daimōn identity cannot be squatted', () => {
  const STRANGER = 'stranger-7';

  it('holo_create_daemon refuses an existing daemonId (no overwrite of owner or memory)', async () => {
    await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: 'squat-owner',
      daemonId: 'squat-existing',
    });
    await expect(
      handleDaemonLifecycleTool('holo_create_daemon', {
        ownerId: STRANGER,
        daemonId: 'squat-existing',
      })
    ).rejects.toThrow(/already exists/);
    const plain = (await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: 'squat-existing',
    })) as { daemon: ConversationDaemon };
    expect(plain.daemon.ownerId).toBe('squat-owner');
  });

  it("holo_create_daemon refuses another soul's emergent id (pre-emergence squat)", async () => {
    const soul = 'victim-a1';
    await expect(
      handleDaemonLifecycleTool('holo_create_daemon', {
        ownerId: STRANGER,
        daemonId: `daemon-${soul}`,
      })
    ).rejects.toThrow(/reserved for soul/);
    // The soul's observations still accumulate for the soul, not for a squatter.
    const obs = (await handleDaemonLifecycleTool('holo_observe_soul', {
      ownerId: soul,
      contextDelta: { updatedPreferences: { secret: 'mine' }, significanceScore: 0.9 },
    })) as { routedTo: string };
    expect(obs.routedTo).toBe('soul-accumulator');
    // The soul itself may claim its own emergent id.
    const own = (await handleDaemonLifecycleTool('holo_create_daemon', {
      ownerId: soul,
      daemonId: `daemon-${soul}`,
    })) as { daemon: ConversationDaemon };
    expect(own.daemon.ownerId).toBe(soul);
  });

  it('an emerged daimōn cannot be re-created by anyone (post-emergence hijack)', async () => {
    const soul = 'victim-a2';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId: soul, contextDelta: delta });
    }
    await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: soul,
      callerId: soul,
    });
    for (const ownerId of [STRANGER, soul]) {
      await expect(
        handleDaemonLifecycleTool('holo_create_daemon', { ownerId, daemonId: `daemon-${soul}` })
      ).rejects.toThrow(/already exists/);
    }
    // The owner still reads their own memory afterwards.
    const got = (await handleDaemonLifecycleTool('holo_get_daemon', {
      daemonId: `daemon-${soul}`,
      includeRehydrationContext: true,
      callerId: soul,
    })) as { daemon: ConversationDaemon; rehydrationContext?: RehydratedContext };
    expect(got.daemon.ownerId).toBe(soul);
    expect(got.rehydrationContext?.aggregatedPreferences).toMatchObject({ theme: 'dark' });
  });

  it('a stranger cannot name the daimōn at emergence (the name persists to the corpus)', async () => {
    const soul = 'victim-c';
    for (const delta of knowingDeltas()) {
      await handleDaemonLifecycleTool('holo_observe_soul', { ownerId: soul, contextDelta: delta });
    }
    const r = (await handleDaemonLifecycleTool('holo_daemon_emergence_check', {
      ownerId: soul,
      callerId: STRANGER,
      displayName: 'NamedByStranger',
    })) as { emerged: boolean; daemon?: ConversationDaemon };
    expect(r.emerged).toBe(true);
    expect(r.daemon?.displayName).toBe('Lumi');
    expect(readFileSync(_corpusPathForTest(), 'utf8')).not.toContain('NamedByStranger');
  });
});

describe('callerId is bound to the transport principal when one is present', () => {
  const OWNER = 'bound-owner';
  const DAEMON = 'bound-daemon';
  const REMEMBERED = { secret: 'bound memory' };

  async function ensureDaemon(): Promise<void> {
    const plain = (await handleDaemonLifecycleTool('holo_get_daemon', { daemonId: DAEMON })) as {
      daemon: ConversationDaemon | null;
    };
    if (plain.daemon) return;
    await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId: DAEMON });
    receiveContextDelta(DAEMON, {
      ...makeEmptyContextDelta(),
      significanceScore: 0.9,
      updatedPreferences: { ...REMEMBERED },
    });
  }
  const readMemory = (args: Record<string, unknown>, binding?: unknown) =>
    handleDaemonLifecycleTool(
      'holo_get_daemon',
      { daemonId: DAEMON, includeRehydrationContext: true, ...args },
      binding as Parameters<typeof handleDaemonLifecycleTool>[2]
    ) as Promise<{ rehydrationContext?: RehydratedContext }>;

  it('an authenticated principal claiming another callerId is refused on every bound tool', async () => {
    await ensureDaemon();
    const asStranger = { signer: 'stranger-7' };
    await expect(readMemory({ callerId: OWNER }, asStranger)).rejects.toThrow(
      /not bound to the authenticated principal/
    );
    await expect(
      handleDaemonLifecycleTool(
        'holo_list_daemons',
        { ownerId: OWNER, includeStats: true, callerId: OWNER },
        asStranger
      )
    ).rejects.toThrow(/not bound to the authenticated principal/);
    await expect(
      handleDaemonLifecycleTool(
        'holo_daemon_emergence_check',
        { ownerId: OWNER, callerId: OWNER },
        asStranger
      )
    ).rejects.toThrow(/not bound to the authenticated principal/);
    await expect(
      handleDaemonLifecycleTool(
        'holo_daemon_turn',
        { daemonId: DAEMON, callerId: OWNER, contextDelta: { significanceScore: 0.9 } },
        asStranger
      )
    ).rejects.toThrow(/not bound to the authenticated principal/);
  });

  it('the principal itself passes, with or without typing callerId', async () => {
    await ensureDaemon();
    const typed = await readMemory({ callerId: OWNER }, { signer: OWNER });
    expect(typed.rehydrationContext?.aggregatedPreferences).toMatchObject(REMEMBERED);
    const implied = await readMemory({}, { signer: OWNER });
    expect(implied.rehydrationContext?.aggregatedPreferences).toMatchObject(REMEMBERED);
  });

  it('a wallet signer passes only through the signer-to-caller mapping', async () => {
    await ensureDaemon();
    const wallet = '0x00000000000000000000000000000000000000ab';
    const mapped = await readMemory(
      { callerId: OWNER },
      { signer: wallet, signerMapsToCaller: (s: string, c: string) => s === wallet && c === OWNER }
    );
    expect(mapped.rehydrationContext?.aggregatedPreferences).toMatchObject(REMEMBERED);
    await expect(
      readMemory({ callerId: OWNER }, { signer: wallet, signerMapsToCaller: () => false })
    ).rejects.toThrow(/not bound to the authenticated principal/);
    await expect(readMemory({ callerId: OWNER }, { signer: wallet })).rejects.toThrow(
      /not bound to the authenticated principal/
    );
  });

  it('without a verified principal (stdio, unsigned, stdio-local bridge) callerId stays self-declared', async () => {
    await ensureDaemon();
    for (const binding of [
      undefined,
      null,
      { signer: null },
      { signer: '' },
      { signer: 'stdio-local' },
    ]) {
      const got = await readMemory({ callerId: OWNER }, binding);
      expect(got.rehydrationContext?.aggregatedPreferences).toMatchObject(REMEMBERED);
    }
  });
});

// ─── The four writes that named no principal (task_1790214096204_56rj) ────────
//
// Two custody reviews of #322 found that the binding covered 4 of the 8 daimōn tools:
// holo_observe_soul wrote into ANY soul (the planted line then reaches the model as real
// remembered context and lands in the training corpus), holo_update_daemon_ritual rewrote any
// daimōn's rituals, holo_export_emergence_corpus wrote the whole corpus to a caller-chosen
// path, and holo_create_daemon took its ownerId unchecked — including the reserved emergent
// id `daemon-<soul>`, so a stranger could squat a victim soul's own daemon before the real
// owner ever created it. On the production server registration is open and a public client may
// self-assign tools:execute (which bridges to tools:write), so a stranger reached all four.
// The argument gate lets every absolute path through (only a double `../` is refused).

describe('soul writes, ritual writes and the corpus path are bound to the transport principal', () => {
  const OWNER = 'soulbound-owner';
  const STRANGER = 'stranger-7';
  const soulRows = (soul: string) => readEmergenceRecords().filter((r) => r.ownerId === soul);
  const observe = (
    ownerId: string | undefined,
    binding?: unknown,
    delta: Record<string, unknown> = {
      updatedPreferences: { theme: 'dark' },
      significanceScore: 0.9,
    }
  ) =>
    handleDaemonLifecycleTool(
      'holo_observe_soul',
      { ...(ownerId === undefined ? {} : { ownerId }), contextDelta: delta },
      binding as Parameters<typeof handleDaemonLifecycleTool>[2]
    );

  describe('holo_observe_soul', () => {
    it('refuses a principal writing into another soul, and writes nothing', async () => {
      const soul = 'soulbound-victim-1';
      await expect(observe(soul, { signer: STRANGER })).rejects.toThrow(
        /ownerId "soulbound-victim-1" is not bound to the authenticated principal/
      );
      expect(soulRows(soul)).toHaveLength(0);
    });

    it('is exact: a principal that only starts with, or differs in case from, the soul is refused', async () => {
      for (const [soul, principal] of [
        ['soulbound-exact-a2', 'soulbound-exact-a'],
        ['soulbound-exact-a', 'soulbound-exact-a2'],
        ['Soulbound-Exact-B', 'soulbound-exact-b'],
      ]) {
        await expect(observe(soul, { signer: principal })).rejects.toThrow(
          /not bound to the authenticated principal/
        );
        expect(soulRows(soul)).toHaveLength(0);
      }
    });

    it('lets the soul itself observe, which is what HoloShell does with its owner-bound token', async () => {
      const soul = 'soulbound-self-1';
      const got = (await observe(soul, { signer: soul })) as { observed: boolean; ownerId: string };
      expect(got.observed).toBe(true);
      expect(got.ownerId).toBe(soul);
      expect(soulRows(soul).length).toBeGreaterThan(0);
    });

    it('lets a wallet signer observe only through the signer-to-soul mapping', async () => {
      const wallet = '0x00000000000000000000000000000000000000cd';
      const soul = 'soulbound-wallet-1';
      const ok = (await observe(soul, {
        signer: wallet,
        signerMapsToCaller: (s: string, c: string) => s === wallet && c === soul,
      })) as { observed: boolean };
      expect(ok.observed).toBe(true);
      await expect(
        observe('soulbound-wallet-2', { signer: wallet, signerMapsToCaller: () => false })
      ).rejects.toThrow(/not bound to the authenticated principal/);
      await expect(observe('soulbound-wallet-3', { signer: wallet })).rejects.toThrow(
        /not bound to the authenticated principal/
      );
      expect(soulRows('soulbound-wallet-2')).toHaveLength(0);
      expect(soulRows('soulbound-wallet-3')).toHaveLength(0);
    });

    it('keeps ownerId required, and self-declared without a verified principal', async () => {
      await expect(observe(undefined, { signer: STRANGER })).rejects.toThrow(/ownerId is required/);
      let n = 0;
      for (const binding of [
        undefined,
        null,
        { signer: null },
        { signer: '' },
        { signer: 'stdio-local' },
      ]) {
        const soul = `soulbound-local-${n++}`;
        const got = (await observe(soul, binding)) as { observed: boolean };
        expect(got.observed).toBe(true);
        expect(soulRows(soul).length).toBeGreaterThan(0);
      }
    });
  });

  describe('holo_create_daemon', () => {
    const create = (ownerId: string | undefined, daemonId: string | undefined, binding?: unknown) =>
      handleDaemonLifecycleTool(
        'holo_create_daemon',
        {
          ...(ownerId === undefined ? {} : { ownerId }),
          ...(daemonId === undefined ? {} : { daemonId }),
        },
        binding as Parameters<typeof handleDaemonLifecycleTool>[2]
      ) as Promise<{ daemon: { daemonId: string; ownerId: string } }>;

    it('refuses a principal creating a daemon claimed for another owner, and creates nothing', async () => {
      const victim = 'create-bound-victim-1';
      const id = 'create-bound-plain-1';
      await expect(create(victim, id, { signer: STRANGER })).rejects.toThrow(
        /ownerId "create-bound-victim-1" is not bound to the authenticated principal/
      );
      expect(_daemonExistsForTest(id)).toBe(false);
    });

    it("blocks the emergent-id squat: a stranger cannot pre-create a victim soul's own daemon-<soul> id", async () => {
      const victimSoul = 'create-bound-victim-soul';
      const reservedId = emergentDaemonId(victimSoul);
      await expect(create(victimSoul, reservedId, { signer: STRANGER })).rejects.toThrow(
        /not bound to the authenticated principal/
      );
      expect(_daemonExistsForTest(reservedId)).toBe(false);
      // The real owner can still take the reserved id afterwards — nothing squatted it.
      const got = await create(victimSoul, reservedId, { signer: victimSoul });
      expect(got.daemon.ownerId).toBe(victimSoul);
    });

    it('lets an authenticated principal create a daemon for itself', async () => {
      const owner = 'create-bound-self-1';
      const id = 'create-bound-self-daemon-1';
      const got = await create(owner, id, { signer: owner });
      expect(got.daemon.ownerId).toBe(owner);
      expect(_daemonExistsForTest(id)).toBe(true);
    });

    it('lets a wallet signer create only through the signer-to-owner mapping', async () => {
      const wallet = '0x00000000000000000000000000000000000000ab';
      const owner = 'create-bound-wallet-owner-1';
      const id = 'create-bound-wallet-daemon-1';
      const got = await create(owner, id, {
        signer: wallet,
        signerMapsToCaller: (s: string, c: string) => s === wallet && c === owner,
      });
      expect(got.daemon.ownerId).toBe(owner);
      await expect(
        create('create-bound-wallet-owner-2', 'create-bound-wallet-daemon-2', {
          signer: wallet,
          signerMapsToCaller: () => false,
        })
      ).rejects.toThrow(/not bound to the authenticated principal/);
    });

    it('keeps local trust: no verified principal may still name any ownerId', async () => {
      let n = 0;
      for (const binding of [
        undefined,
        null,
        { signer: null },
        { signer: '' },
        { signer: 'stdio-local' },
      ]) {
        const owner = `create-bound-local-owner-${n}`;
        const id = `create-bound-local-daemon-${n++}`;
        const got = await create(owner, id, binding);
        expect(got.daemon.ownerId).toBe(owner);
      }
    });
  });

  describe('holo_update_daemon_ritual', () => {
    const ritual = (name: string): DaemonRitual => ({
      name,
      trigger: `keyword:${name}`,
      description: `ritual ${name}`,
      enabled: true,
    });
    const update = (
      profileId: string,
      rituals: DaemonRitual[],
      extra: Record<string, unknown> = {},
      binding?: unknown
    ) =>
      handleDaemonLifecycleTool(
        'holo_update_daemon_ritual',
        { profileId, operation: 'add', rituals, ...extra },
        binding as Parameters<typeof handleDaemonLifecycleTool>[2]
      ) as Promise<{ profile: DaemonCustomizationProfile }>;

    it("refuses a principal rewriting another owner's rituals, leaving them untouched", async () => {
      const id = 'ritual-bound-1';
      await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId: id });
      await expect(update(id, [ritual('planted')], {}, { signer: STRANGER })).rejects.toThrow(
        /Unauthorized daemon access/
      );
      await expect(
        update(id, [ritual('planted')], { callerId: OWNER }, { signer: STRANGER })
      ).rejects.toThrow(/not bound to the authenticated principal/);
      const after = await update(id, [ritual('mine')], {}, { signer: OWNER });
      expect(after.profile.style.rituals.map((r: DaemonRitual) => r.name)).toEqual(['mine']);
    });

    it('lets the owner update, with or without typing callerId', async () => {
      const id = 'ritual-bound-2';
      await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId: id });
      const implied = await update(id, [ritual('a')], {}, { signer: OWNER });
      const typed = await update(id, [ritual('b')], { callerId: OWNER }, { signer: OWNER });
      expect(implied.profile.style.rituals.map((r: DaemonRitual) => r.name)).toEqual(['a']);
      expect(typed.profile.style.rituals.map((r: DaemonRitual) => r.name)).toEqual(['a', 'b']);
    });

    it('lets a wallet signer update only through the signer-to-owner mapping', async () => {
      const wallet = '0x00000000000000000000000000000000000000ef';
      const id = 'ritual-bound-3';
      await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId: id });
      const viaMap = {
        signer: wallet,
        signerMapsToCaller: (s: string, c: string) => s === wallet && c === OWNER,
      };
      const mapped = await update(id, [ritual('w')], { callerId: OWNER }, viaMap);
      expect(mapped.profile.style.rituals.map((r: DaemonRitual) => r.name)).toEqual(['w']);
      // An implied callerId is the wallet itself, which is not the owner.
      await expect(update(id, [ritual('x')], {}, viaMap)).rejects.toThrow(
        /Unauthorized daemon access/
      );
      await expect(
        update(
          id,
          [ritual('x')],
          { callerId: OWNER },
          { signer: wallet, signerMapsToCaller: () => false }
        )
      ).rejects.toThrow(/not bound to the authenticated principal/);
      await expect(
        update(id, [ritual('x')], { callerId: OWNER }, { signer: wallet })
      ).rejects.toThrow(/not bound to the authenticated principal/);
    });

    it('keeps local trust: no principal and no callerId still updates; a wrong callerId is refused', async () => {
      const id = 'ritual-bound-4';
      await handleDaemonLifecycleTool('holo_create_daemon', { ownerId: OWNER, daemonId: id });
      let n = 0;
      for (const binding of [
        undefined,
        null,
        { signer: null },
        { signer: '' },
        { signer: 'stdio-local' },
      ]) {
        n += 1;
        const r = await update(id, [ritual(`local${n}`)], {}, binding);
        expect(r.profile.style.rituals).toHaveLength(n);
      }
      await expect(update(id, [ritual('x')], { callerId: STRANGER })).rejects.toThrow(
        /Unauthorized daemon access/
      );
    });
  });

  describe('holo_export_emergence_corpus', () => {
    const exportTo = (outPath?: string, binding?: unknown) =>
      handleDaemonLifecycleTool(
        'holo_export_emergence_corpus',
        outPath === undefined ? {} : { outPath },
        binding as Parameters<typeof handleDaemonLifecycleTool>[2]
      ) as Promise<{ path: string; rows: number }>;

    it('refuses a caller-chosen path from a verified principal, absolute or relative, and writes nothing', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'export-bound-'));
      try {
        for (const target of [join(dir, 'planted.jsonl'), `planted-relative-${Date.now()}.jsonl`]) {
          await expect(exportTo(target, { signer: STRANGER })).rejects.toThrow(
            /outPath is not accepted from an authenticated principal/
          );
          expect(existsSync(target)).toBe(false);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('still exports to the default path for a principal that names no path', async () => {
      const got = await exportTo(undefined, { signer: STRANGER });
      expect(got.path).toBe(join(TEMP_DATA_DIR, 'emergence', 'emergence-corpus.normalized.jsonl'));
      expect(existsSync(got.path)).toBe(true);
    });

    it('keeps local trust: no verified principal may still name the path', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'export-local-'));
      try {
        let n = 0;
        for (const binding of [
          undefined,
          null,
          { signer: null },
          { signer: '' },
          { signer: 'stdio-local' },
        ]) {
          const target = join(dir, `out-${(n += 1)}.jsonl`);
          const got = await exportTo(target, binding);
          expect(got.path).toBe(target);
          expect(existsSync(target)).toBe(true);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Unknown tool returns null ────────────────────────────────────────────────

describe('handleDaemonLifecycleTool dispatch', () => {
  it('returns null for unknown tool name', async () => {
    const result = await handleDaemonLifecycleTool('unknown_daemon_tool', {});
    expect(result).toBeNull();
  });
});
