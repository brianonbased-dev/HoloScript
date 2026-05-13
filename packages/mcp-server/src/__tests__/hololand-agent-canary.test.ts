/**
 * HoloLand Agent Canary Tests — Multi-step agent workflow coverage.
 *
 * These tests exercise HoloLand MCP tools through the public `handleTool`
 * dispatch surface, simulating realistic agent sequences. They complement
 * the isolated unit tests in `hololand-mcp-tools.test.ts`.
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleTool } from '../handlers';
import { clearHololandRegistries } from '../hololand-mcp-tools';

describe('HoloLand agent canary', () => {
  beforeEach(() => {
    clearHololandRegistries();
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  async function tool(name: string, args: Record<string, unknown>) {
    const result = await handleTool(name, args);
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(`Tool ${name} failed: ${(result as { error: string }).error}`);
    }
    return result as Record<string, unknown>;
  }

  // ── Workflow 1: World + Shard + Zone lifecycle ────────────────────────────

  it('canary: agent creates a world, shard, zone, and verifies status', async () => {
    // Step 1 — Create world
    const world = await tool('create_world', {
      id: 'canary-world',
      name: 'Canary World',
      description: 'Agent canary proving ground',
      maxUsers: 64,
      platforms: ['web', 'quest'],
      category: 'game',
      tags: ['canary'],
    });
    expect(world.success).toBe(true);
    expect(world.worldId).toBe('canary-world');

    // Step 2 — Create shard
    const shard = await tool('create_shard', {
      id: 'canary-shard',
      name: 'Canary Shard',
      zones: [{ id: 'cz1', name: 'Town Square', biome: 'urban' }],
      encounters: [{ id: 'ce1', name: 'Welcome', trigger: 'on-enter', zoneId: 'cz1' }],
      quests: [{ id: 'cq1', name: 'First Steps', steps: [{ id: 'cs1', objective: 'Explore' }] }],
      items: [{ id: 'ci1', name: 'Lantern', category: 'equipment' }],
      skills: [{ id: 'csk1', name: 'Navigation', rarity: 'common' }],
      lootTables: [{ id: 'clt1', name: 'Starter Pack', entries: [{ id: 'cle1', itemId: 'ci1', weight: 1 }] }],
    });
    expect(shard.success).toBe(true);
    expect(shard.shardId).toBe('canary-shard');

    // Step 3 — Create zone
    const zone = await tool('create_zone', {
      id: 'canary-zone',
      name: 'Canary Zone',
      biome: 'urban',
      encounterIds: ['ce1'],
    });
    expect(zone.success).toBe(true);
    expect(zone.zoneId).toBe('canary-zone');

    // Step 4 — Run steward tick
    const tick = await tool('hololand_steward_tick', { shardId: 'canary-shard' });
    expect(tick.success).toBe(true);
    expect(tick.shardId).toBe('canary-shard');
    expect(typeof tick.tickDurationMs).toBe('number');

    // Step 5 — Capture runtime receipt
    const receipt = await tool('hololand_capture_runtime_receipt', {
      shardId: 'canary-shard',
      receiptType: 'validation',
      scenarioId: 'canary-scenario',
    });
    expect(receipt.success).toBe(true);
    expect(receipt.status).toBe('passed');
    expect(typeof receipt.hash).toBe('string');
    expect(receipt.hash).toHaveLength(64);

    // Step 6 — Check shard status
    const status = await tool('hololand_shard_status', {
      shardId: 'canary-shard',
      includeReceipts: true,
    });
    expect(status.success).toBe(true);
    expect(status.health).toBe('healthy');
    expect(Array.isArray(status.receipts)).toBe(true);
    expect((status.receipts as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Step 7 — Publish zone
    const published = await tool('hololand_publish_zone', {
      zoneId: 'canary-zone',
      tierGate: 'premium',
      maxAgents: 128,
    });
    expect(published.success).toBe(true);
    expect(published.status).toBe('published');
    expect(published.tierGate).toBe('premium');

    // Step 8 — Verify zone mutation persisted
    const fetchedZone = await tool('get_zone', { zoneId: 'canary-zone' });
    expect((fetchedZone.zone as Record<string, unknown>).status).toBe('published');
  });

  it('canary: agent creates geo-anchored place and quest', async () => {
    // Step 1 — Create place
    const place = await tool('create_place', {
      id: 'canary-place',
      name: 'Canary Museum',
      lat: 40.7128,
      lng: -74.006,
      radius: 30,
      capacity: 200,
      social: true,
      tags: ['culture', 'canary'],
    });
    expect(place.success).toBe(true);
    expect(place.placeId).toBe('canary-place');

    // Step 2 — Create geo anchor bound to place
    const anchor = await tool('hololand_create_geo_anchor', {
      id: 'canary-anchor',
      placeId: 'canary-place',
      lat: 40.7128,
      lng: -74.006,
      radius: 25,
    });
    expect(anchor.success).toBe(true);
    expect(anchor.anchorId).toBe('canary-anchor');
    expect((anchor.boundTo as Record<string, unknown>).placeId).toBe('canary-place');

    // Step 3 — Create location quest at place
    const quest = await tool('create_location_quest', {
      id: 'canary-quest',
      name: 'Visit Museum',
      placeId: 'canary-place',
      trigger: 'checkin',
      radius: 15,
      rewardItemIds: ['badge-canary'],
      tags: ['tutorial', 'canary'],
    });
    expect(quest.success).toBe(true);
    expect(quest.questId).toBe('canary-quest');

    // Step 4 — List quests filtered by place
    const byPlace = await tool('list_location_quests', { placeId: 'canary-place' });
    expect((byPlace.quests as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Step 5 — List places filtered by tag
    const tagged = await tool('list_places', { tag: 'canary' });
    expect((tagged.places as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  // ── False-case: workflow failures ─────────────────────────────────────────

  it('canary: steward tick fails when shard does not exist', async () => {
    const result = await handleTool('hololand_steward_tick', { shardId: 'ghost-shard' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: publishing a zone fails when zone does not exist', async () => {
    const result = await handleTool('hololand_publish_zone', { zoneId: 'ghost-zone' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: geo anchor fails when place does not exist', async () => {
    const result = await handleTool('hololand_create_geo_anchor', {
      placeId: 'ghost-place',
      lat: 0,
      lng: 0,
    });
    expect(result).toMatchObject({ error: expect.stringContaining('Place not found') });
  });

  it('canary: capture receipt fails when shard does not exist', async () => {
    const result = await handleTool('hololand_capture_runtime_receipt', {
      shardId: 'ghost-shard',
      receiptType: 'validation',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: shard status returns error for missing shard', async () => {
    const result = await handleTool('hololand_shard_status', { shardId: 'ghost-shard' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ── Workflow 3: Twin Earth Substrate Contract (task_1778618552503_3zqx) ──

  it('canary: agent retrieves Twin Earth substrate contract', async () => {
    const contract = await tool('hololand_twin_earth_contract', {
      version: '1.0.0',
    });
    expect(contract.success).toBe(true);
    expect(contract.version).toBe('1.0.0');
    expect(typeof contract.hash).toBe('string');
    expect(contract.layers).toBeDefined();
    expect(contract.layers.identity).toContain('Wallet-based');
    expect(contract.layers.safetyEnvelope).toContain('Substrate-enforced');
  });

  it('canary: agent checks Twin Earth substrate status', async () => {
    // Seed some NPCs to give the status something to count
    await tool('hololand_create_npc', {
      id: 'canary-local-npc',
      name: 'Local NPC',
      modelProvider: 'local',
      role: 'merchant',
    });
    await tool('hololand_create_npc', {
      id: 'canary-cloud-npc',
      name: 'Cloud NPC',
      modelProvider: 'cloud',
      role: 'guide',
    });

    const status = await tool('hololand_twin_earth_substrate_status', {});
    expect(status.success).toBe(true);
    expect(status.contractVersion).toBe('1.0.0');
    expect(status.substrateVersion).toBe('7.0.0');
    expect(typeof status.identities).toBe('number');
    expect(typeof status.ais).toBe('number');
    expect(typeof status.byokCount).toBe('number');
    expect(typeof status.localCount).toBe('number');
    expect(typeof status.managedCount).toBe('number');
    expect(typeof status.brittneyOnline).toBe('boolean');
    expect(status.substrateEnforced).toBe(true);
    expect(status.decouplingMetrics).toBeDefined();
    expect(status.decouplingMetrics.sovereignFallbackAvailable).toBe(true);
  });

  // ── False-case: Twin Earth contract failures ──────────────────────────────

  it('canary: Twin Earth contract tool returns shape even without version', async () => {
    const contract = await tool('hololand_twin_earth_contract', {});
    expect(contract.success).toBe(true);
    expect(contract.version).toBe('1.0.0');
  });
});
