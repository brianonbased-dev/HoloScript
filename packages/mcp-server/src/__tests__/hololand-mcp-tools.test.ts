/**
 * HoloLand MCP Tools — unit tests
 *
 * Covers: generate_world, world CRUD, shard CRUD, zone CRUD,
 * place CRUD, location quest CRUD.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleHololandMcpTool, clearHololandRegistries } from '../hololand-mcp-tools';
import {
  type Shard,
  type Zone,
  validateShard,
  validateZone,
} from '@holoscript/framework';

describe('hololand-mcp-tools', () => {
  beforeEach(() => {
    clearHololandRegistries();
  });

  // ---------------------------------------------------------------------------
  // generate_world
  // ---------------------------------------------------------------------------

  it('generate_world rejects missing prompt', async () => {
    const result = await handleHololandMcpTool('generate_world', {});
    expect(result).toMatchObject({ error: expect.stringContaining('prompt is required') });
  });

  it('generate_world rejects empty prompt', async () => {
    const result = await handleHololandMcpTool('generate_world', { prompt: '   ' });
    expect(result).toMatchObject({ error: expect.stringContaining('prompt is required') });
  });

  // ---------------------------------------------------------------------------
  // create_world
  // ---------------------------------------------------------------------------

  it('create_world returns a world definition without generation', async () => {
    const result = (await handleHololandMcpTool('create_world', {
      name: 'Test World',
      description: 'A test world',
      maxUsers: 100,
      platforms: ['web', 'quest'],
      category: 'game',
      tags: ['test', 'demo'],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.worldId).toMatch(/^world_\d+_[a-z0-9]+$/);
    expect(result.name).toBe('Test World');
    expect(result.status).toBe('draft');
    expect(result.assetUrl).toBeUndefined();
    expect(result.definition).toBeDefined();
  });

  it('create_world uses provided id', async () => {
    const result = (await handleHololandMcpTool('create_world', {
      id: 'my-custom-world',
      name: 'Custom World',
    })) as Record<string, unknown>;
    expect(result.worldId).toBe('my-custom-world');
  });

  // ---------------------------------------------------------------------------
  // get_world
  // ---------------------------------------------------------------------------

  it('get_world returns created world', async () => {
    const created = (await handleHololandMcpTool('create_world', {
      id: 'get-test-world',
      name: 'Get Test',
    })) as Record<string, unknown>;

    const fetched = (await handleHololandMcpTool('get_world', {
      worldId: created.worldId,
    })) as Record<string, unknown>;

    expect(fetched.success).toBe(true);
    expect(fetched.worldId).toBe(created.worldId);
    expect((fetched.definition as Record<string, unknown>).metadata).toBeDefined();
  });

  it('get_world returns error for missing world', async () => {
    const result = await handleHololandMcpTool('get_world', { worldId: 'does-not-exist' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // update_world
  // ---------------------------------------------------------------------------

  it('update_world mutates fields', async () => {
    await handleHololandMcpTool('create_world', { id: 'update-test', name: 'Before' });

    const updated = (await handleHololandMcpTool('update_world', {
      worldId: 'update-test',
      name: 'After',
      maxUsers: 200,
      status: 'published',
    })) as Record<string, unknown>;

    expect(updated.success).toBe(true);
    expect((updated.definition as Record<string, unknown>).metadata).toMatchObject({
      name: 'After',
      status: 'published',
    });
  });

  it('update_world returns error for missing world', async () => {
    const result = await handleHololandMcpTool('update_world', {
      worldId: 'nope',
      name: 'X',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // delete_world
  // ---------------------------------------------------------------------------

  it('delete_world removes world', async () => {
    await handleHololandMcpTool('create_world', { id: 'delete-test', name: 'Delete Me' });

    const deleted = (await handleHololandMcpTool('delete_world', {
      worldId: 'delete-test',
    })) as Record<string, unknown>;
    expect(deleted.success).toBe(true);
    expect(deleted.deleted).toBe(true);

    const gone = await handleHololandMcpTool('get_world', { worldId: 'delete-test' });
    expect(gone).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('delete_world returns error for missing world', async () => {
    const result = await handleHololandMcpTool('delete_world', { worldId: 'nope' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // list_worlds
  // ---------------------------------------------------------------------------

  it('list_worlds supports filtering and pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await handleHololandMcpTool('create_world', {
        id: `list-w-${i}`,
        name: `List World ${i}`,
        category: i === 0 ? 'game' : 'experience',
        tags: i === 0 ? ['alpha'] : ['beta'],
      });
    }

    const all = (await handleHololandMcpTool('list_worlds', {})) as Record<string, unknown>;
    expect(all.total).toBeGreaterThanOrEqual(3);

    const filtered = (await handleHololandMcpTool('list_worlds', {
      category: 'game',
    })) as Record<string, unknown>;
    expect(filtered.worlds).toHaveLength(1);

    const tagged = (await handleHololandMcpTool('list_worlds', {
      tag: 'beta',
    })) as Record<string, unknown>;
    expect((tagged.worlds as unknown[]).length).toBeGreaterThanOrEqual(2);

    const paged = (await handleHololandMcpTool('list_worlds', {
      limit: 1,
      offset: 0,
    })) as Record<string, unknown>;
    expect((paged.worlds as unknown[]).length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // create_shard
  // ---------------------------------------------------------------------------

  it('create_shard validates and stores', async () => {
    const result = (await handleHololandMcpTool('create_shard', {
      id: 'shard-test',
      name: 'Oasis Shard',
      zones: [{ id: 'z1', name: 'Market', biome: 'urban' }],
      encounters: [{ id: 'e1', name: 'Ambush', trigger: 'on-enter', zoneId: 'z1' }],
      quests: [
        {
          id: 'q1',
          name: 'First Breath',
          steps: [{ id: 's1', objective: 'Find water' }],
        },
      ],
      items: [{ id: 'i1', name: 'Canteen', category: 'equipment' }],
      skills: [{ id: 'sk1', name: 'Survival', rarity: 'common' }],
      lootTables: [
        {
          id: 'lt1',
          name: 'Starter Chest',
          entries: [{ id: 'lte1', itemId: 'i1', weight: 1 }],
        },
      ],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.shardId).toBe('shard-test');
  });

  it('create_shard auto-generates id', async () => {
    const result = (await handleHololandMcpTool('create_shard', {
      name: 'Auto Shard',
    })) as Record<string, unknown>;
    expect(result.shardId).toMatch(/^shard_\d+_[a-z0-9]+$/);
  });

  it('create_shard catches validation errors', async () => {
    const result = await handleHololandMcpTool('create_shard', {
      name: 'Bad Shard',
      zones: [{ id: 'z1', name: 'Bad', biome: 'unknown-biome' }],
    });
    expect(result).toMatchObject({ error: 'Shard validation failed' });
    expect((result as Record<string, unknown>).details).toBeInstanceOf(Array);
  });

  // ---------------------------------------------------------------------------
  // get_shard / update_shard / delete_shard / list_shards
  // ---------------------------------------------------------------------------

  it('get_shard returns stored shard', async () => {
    await handleHololandMcpTool('create_shard', { id: 'gs', name: 'GS' });
    const result = (await handleHololandMcpTool('get_shard', { shardId: 'gs' })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect((result.shard as Shard).name).toBe('GS');
  });

  it('update_shard mutates fields', async () => {
    await handleHololandMcpTool('create_shard', { id: 'us', name: 'Before' });
    const updated = (await handleHololandMcpTool('update_shard', {
      shardId: 'us',
      name: 'After',
    })) as Record<string, unknown>;
    expect((updated.shard as Shard).name).toBe('After');
  });

  it('delete_shard removes shard', async () => {
    await handleHololandMcpTool('create_shard', { id: 'ds', name: 'DS' });
    await handleHololandMcpTool('delete_shard', { shardId: 'ds' });
    const gone = await handleHololandMcpTool('get_shard', { shardId: 'ds' });
    expect(gone).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('list_shards paginates', async () => {
    for (let i = 0; i < 2; i++) {
      await handleHololandMcpTool('create_shard', { id: `ls-${i}`, name: `LS ${i}` });
    }
    const result = (await handleHololandMcpTool('list_shards', { limit: 1 })) as Record<string, unknown>;
    expect((result.shards as unknown[]).length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // create_zone
  // ---------------------------------------------------------------------------

  it('create_zone validates and stores', async () => {
    const result = (await handleHololandMcpTool('create_zone', {
      id: 'zone-test',
      name: 'Dungeon',
      biome: 'underground',
      encounterIds: ['e1'],
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.zoneId).toBe('zone-test');
    expect(result.biome).toBe('underground');
  });

  it('create_zone catches bad biome', async () => {
    const result = await handleHololandMcpTool('create_zone', {
      name: 'Bad',
      biome: 'magic-forest',
    });
    expect(result).toMatchObject({ error: 'Zone validation failed' });
  });

  // ---------------------------------------------------------------------------
  // get_zone / update_zone / delete_zone / list_zones
  // ---------------------------------------------------------------------------

  it('get_zone returns stored zone', async () => {
    await handleHololandMcpTool('create_zone', { id: 'gz', name: 'GZ', biome: 'urban' });
    const result = (await handleHololandMcpTool('get_zone', { zoneId: 'gz' })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect((result.zone as Zone).name).toBe('GZ');
  });

  it('update_zone mutates fields', async () => {
    await handleHololandMcpTool('create_zone', { id: 'uz', name: 'UZ', biome: 'urban' });
    const updated = (await handleHololandMcpTool('update_zone', {
      zoneId: 'uz',
      name: 'Updated',
      encounterIds: ['e2'],
    })) as Record<string, unknown>;
    expect((updated.zone as Zone).name).toBe('Updated');
    expect((updated.zone as Zone).encounterIds).toEqual(['e2']);
  });

  it('delete_zone removes zone', async () => {
    await handleHololandMcpTool('create_zone', { id: 'dz', name: 'DZ', biome: 'urban' });
    await handleHololandMcpTool('delete_zone', { zoneId: 'dz' });
    const gone = await handleHololandMcpTool('get_zone', { zoneId: 'dz' });
    expect(gone).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // create_place
  // ---------------------------------------------------------------------------

  it('create_place stores with defaults', async () => {
    const result = (await handleHololandMcpTool('create_place', {
      id: 'place-test',
      name: 'Museum Entrance',
      lat: 40.7128,
      lng: -74.006,
      radius: 25,
      capacity: 100,
      social: true,
      tags: ['culture', 'indoor'],
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.placeId).toBe('place-test');
    expect((result.place as Record<string, unknown>).radius).toBe(25);
  });

  // ---------------------------------------------------------------------------
  // get_place / update_place / delete_place / list_places
  // ---------------------------------------------------------------------------

  it('get_place returns stored place', async () => {
    await handleHololandMcpTool('create_place', { id: 'gp', name: 'GP' });
    const result = (await handleHololandMcpTool('get_place', { placeId: 'gp' })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect((result.place as Record<string, unknown>).name).toBe('GP');
  });

  it('update_place mutates fields', async () => {
    await handleHololandMcpTool('create_place', { id: 'up', name: 'UP', lat: 0, lng: 0 });
    const updated = (await handleHololandMcpTool('update_place', {
      placeId: 'up',
      name: 'Updated',
      lat: 1,
    })) as Record<string, unknown>;
    expect((updated.place as Record<string, unknown>).name).toBe('Updated');
    expect((updated.place as Record<string, unknown>).lat).toBe(1);
  });

  it('delete_place removes place', async () => {
    await handleHololandMcpTool('create_place', { id: 'dp', name: 'DP' });
    await handleHololandMcpTool('delete_place', { placeId: 'dp' });
    const gone = await handleHololandMcpTool('get_place', { placeId: 'dp' });
    expect(gone).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('list_places filters by social and tag', async () => {
    await handleHololandMcpTool('create_place', { id: 'lp1', name: 'LP1', social: true, tags: ['food'] });
    await handleHololandMcpTool('create_place', { id: 'lp2', name: 'LP2', social: false, tags: ['food'] });

    const socialTrue = (await handleHololandMcpTool('list_places', { social: true })) as Record<string, unknown>;
    expect((socialTrue.places as unknown[]).length).toBeGreaterThanOrEqual(1);

    const tagged = (await handleHololandMcpTool('list_places', { tag: 'food' })) as Record<string, unknown>;
    expect((tagged.places as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // create_location_quest
  // ---------------------------------------------------------------------------

  it('create_location_quest stores with defaults', async () => {
    const result = (await handleHololandMcpTool('create_location_quest', {
      id: 'quest-test',
      name: 'Visit Museum',
      placeId: 'place-test',
      trigger: 'checkin',
      radius: 15,
      rewardItemIds: ['item-badge'],
      tags: ['tutorial'],
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.questId).toBe('quest-test');
    expect((result.quest as Record<string, unknown>).trigger).toBe('checkin');
  });

  // ---------------------------------------------------------------------------
  // get_location_quest / update_location_quest / delete_location_quest / list_location_quests
  // ---------------------------------------------------------------------------

  it('get_location_quest returns stored quest', async () => {
    await handleHololandMcpTool('create_location_quest', { id: 'gq', name: 'GQ', placeId: 'gp' });
    const result = (await handleHololandMcpTool('get_location_quest', { questId: 'gq' })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect((result.quest as Record<string, unknown>).name).toBe('GQ');
  });

  it('update_location_quest mutates fields', async () => {
    await handleHololandMcpTool('create_location_quest', { id: 'uq', name: 'UQ', placeId: 'gp' });
    const updated = (await handleHololandMcpTool('update_location_quest', {
      questId: 'uq',
      name: 'Updated',
      radius: 50,
    })) as Record<string, unknown>;
    expect((updated.quest as Record<string, unknown>).name).toBe('Updated');
    expect((updated.quest as Record<string, unknown>).radius).toBe(50);
  });

  it('delete_location_quest removes quest', async () => {
    await handleHololandMcpTool('create_location_quest', { id: 'dq', name: 'DQ', placeId: 'gp' });
    await handleHololandMcpTool('delete_location_quest', { questId: 'dq' });
    const gone = await handleHololandMcpTool('get_location_quest', { questId: 'dq' });
    expect(gone).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('list_location_quests filters by placeId and trigger', async () => {
    await handleHololandMcpTool('create_location_quest', { id: 'lq1', name: 'LQ1', placeId: 'gp', trigger: 'radius' });
    await handleHololandMcpTool('create_location_quest', { id: 'lq2', name: 'LQ2', placeId: 'gp', trigger: 'checkin' });

    const byPlace = (await handleHololandMcpTool('list_location_quests', { placeId: 'gp' })) as Record<string, unknown>;
    expect((byPlace.quests as unknown[]).length).toBeGreaterThanOrEqual(2);

    const byTrigger = (await handleHololandMcpTool('list_location_quests', { trigger: 'radius' })) as Record<string, unknown>;
    expect((byTrigger.quests as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // hololand_shard_status
  // ---------------------------------------------------------------------------

  it('hololand_shard_status returns operational status', async () => {
    await handleHololandMcpTool('create_shard', {
      id: 'status-shard',
      name: 'Status Shard',
      zones: [{ id: 'z1', name: 'Zone 1', biome: 'urban' }],
      encounters: [{ id: 'e1', name: 'Encounter 1', trigger: 'on-enter', zoneId: 'z1' }],
      quests: [{ id: 'q1', name: 'Quest 1', steps: [{ id: 's1', objective: 'Find item' }] }],
      items: [{ id: 'i1', name: 'Item 1', category: 'equipment' }],
      skills: [{ id: 'sk1', name: 'Skill 1', rarity: 'common' }],
      lootTables: [{ id: 'lt1', name: 'Loot 1', entries: [{ id: 'lte1', itemId: 'i1', weight: 1 }] }],
    });

    const result = (await handleHololandMcpTool('hololand_shard_status', {
      shardId: 'status-shard',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.shardId).toBe('status-shard');
    expect(result.name).toBe('Status Shard');
    expect(result.health).toBe('healthy');
    expect((result.integrity as Record<string, unknown>).zones).toBe(1);
    expect((result.integrity as Record<string, unknown>).encounters).toBe(1);
    expect((result.capacity as Record<string, unknown>).maxAgents).toBe(256);
  });

  it('hololand_shard_status includes receipts when requested', async () => {
    await handleHololandMcpTool('create_shard', { id: 'receipt-shard', name: 'Receipt Shard' });
    await handleHololandMcpTool('hololand_capture_runtime_receipt', {
      shardId: 'receipt-shard',
      receiptType: 'validation',
    });

    const result = (await handleHololandMcpTool('hololand_shard_status', {
      shardId: 'receipt-shard',
      includeReceipts: true,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(Array.isArray(result.receipts)).toBe(true);
    expect((result.receipts as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('hololand_shard_status returns error for missing shard', async () => {
    const result = await handleHololandMcpTool('hololand_shard_status', { shardId: 'nope' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // hololand_publish_zone
  // ---------------------------------------------------------------------------

  it('hololand_publish_zone publishes a zone', async () => {
    await handleHololandMcpTool('create_zone', { id: 'pub-zone', name: 'Pub Zone', biome: 'urban' });

    const result = (await handleHololandMcpTool('hololand_publish_zone', {
      zoneId: 'pub-zone',
      tierGate: 'premium',
      maxAgents: 128,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.zoneId).toBe('pub-zone');
    expect(result.status).toBe('published');
    expect(result.tierGate).toBe('premium');
    expect(result.maxAgents).toBe(128);
  });

  it('hololand_publish_zone rejects unknown zone', async () => {
    const result = await handleHololandMcpTool('hololand_publish_zone', { zoneId: 'nope' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('hololand_publish_zone validates shard membership', async () => {
    await handleHololandMcpTool('create_zone', { id: 'sz-zone', name: 'SZ Zone', biome: 'urban' });
    await handleHololandMcpTool('create_shard', { id: 'sz-shard', name: 'SZ Shard', zones: [] });

    const result = await handleHololandMcpTool('hololand_publish_zone', {
      zoneId: 'sz-zone',
      shardId: 'sz-shard',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not a member') });
  });

  // ---------------------------------------------------------------------------
  // hololand_create_geo_anchor
  // ---------------------------------------------------------------------------

  it('hololand_create_geo_anchor creates anchor with defaults', async () => {
    const result = (await handleHololandMcpTool('hololand_create_geo_anchor', {
      lat: 40.7128,
      lng: -74.006,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.anchorId).toMatch(/^anchor_\d+_[a-z0-9]+$/);
    expect(result.lat).toBe(40.7128);
    expect(result.lng).toBe(-74.006);
    expect(result.radius).toBe(50);
    expect(result.persistent).toBe(true);
  });

  it('hololand_create_geo_anchor binds to place', async () => {
    await handleHololandMcpTool('create_place', { id: 'ga-place', name: 'GA Place' });

    const result = (await handleHololandMcpTool('hololand_create_geo_anchor', {
      id: 'ga1',
      placeId: 'ga-place',
      lat: 40.7128,
      lng: -74.006,
      radius: 25,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.anchorId).toBe('ga1');
    expect((result.boundTo as Record<string, unknown>).placeId).toBe('ga-place');
  });

  it('hololand_create_geo_anchor rejects unknown place', async () => {
    const result = await handleHololandMcpTool('hololand_create_geo_anchor', {
      placeId: 'nope',
      lat: 0,
      lng: 0,
    });
    expect(result).toMatchObject({ error: expect.stringContaining('Place not found') });
  });

  // ---------------------------------------------------------------------------
  // hololand_steward_tick
  // ---------------------------------------------------------------------------

  it('hololand_steward_tick runs on a shard', async () => {
    await handleHololandMcpTool('create_shard', {
      id: 'tick-shard',
      name: 'Tick Shard',
      zones: [{ id: 'tz1', name: 'Tick Zone', biome: 'urban' }],
      encounters: [{ id: 'te1', name: 'Tick Encounter', trigger: 'on-enter', zoneId: 'tz1' }],
    });

    const result = (await handleHololandMcpTool('hololand_steward_tick', {
      shardId: 'tick-shard',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.shardId).toBe('tick-shard');
    expect(typeof result.tickDurationMs).toBe('number');
    expect(result.cleanupOrphans).toBe(true);
    expect(result.validateEncounters).toBe(true);
    expect(result.rollupMetrics).toBe(true);
    expect(Array.isArray(result.zoneMetrics)).toBe(true);
  });

  it('hololand_steward_tick returns error for missing shard', async () => {
    const result = await handleHololandMcpTool('hololand_steward_tick', { shardId: 'nope' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ---------------------------------------------------------------------------
  // hololand_capture_runtime_receipt
  // ---------------------------------------------------------------------------

  it('hololand_capture_runtime_receipt creates validation receipt', async () => {
    await handleHololandMcpTool('create_shard', { id: 'rcpt-shard', name: 'Receipt Shard' });

    const result = (await handleHololandMcpTool('hololand_capture_runtime_receipt', {
      shardId: 'rcpt-shard',
      receiptType: 'validation',
      scenarioId: 'test-scenario',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.shardId).toBe('rcpt-shard');
    expect(result.receiptType).toBe('validation');
    expect(result.scenarioId).toBe('test-scenario');
    expect(result.status).toBe('passed');
    expect(typeof result.hash).toBe('string');
    expect(result.hash).toHaveLength(64);
  });

  it('hololand_capture_runtime_receipt defaults to validation type', async () => {
    await handleHololandMcpTool('create_shard', { id: 'rcpt-default', name: 'RCPT Default' });

    const result = (await handleHololandMcpTool('hololand_capture_runtime_receipt', {
      shardId: 'rcpt-default',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.receiptType).toBe('validation');
  });

  it('hololand_capture_runtime_receipt returns error for missing shard', async () => {
    const result = await handleHololandMcpTool('hololand_capture_runtime_receipt', { shardId: 'nope' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });
});
