/**
 * HoloGate mutation authority check — identify → authorize → scope → admit → log
 *
 * Verifies that all 16 create_* / update_* / delete_* mutation tools are gated
 * behind the authority pre-check in handleHololandMcpTool:
 *
 *   1. identify  — requesterId extracted from args (or defaulted to 'mcp-caller')
 *   2. authorize — valid mutation op (create | update | delete)
 *   3. scope     — resource kind is in the allowed HoloGate mutation set
 *   4. admit     — lightweight pass for all ops (structural gate deferred to handler)
 *   5. log       — authorityReceipt merged into successful mutation responses
 *
 * Authority: task_1781033663944_2qbl
 * Paper evidence: gate coverage measurable via capabilities:cartographer
 *   pnpm run capabilities:cartographer -- --goal "create update delete HoloGate authority" --no-live --limit 8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleHololandMcpTool, clearHololandRegistries } from '../hololand-mcp-tools';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callMutation(tool: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return (await handleHololandMcpTool(tool, args)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixtures — minimal valid args for each mutation tool
// ---------------------------------------------------------------------------

const CREATE_FIXTURES: Record<string, Record<string, unknown>> = {
  create_world: { name: 'Auth Test World' },
  create_shard: { name: 'Auth Test Shard' },
  create_zone: { name: 'Auth Test Zone', biome: 'urban' },
  create_place: { name: 'Auth Test Place' },
  create_location_quest: { name: 'Auth Test Quest', placeId: 'p1' },
};

const UPDATE_FIXTURES: Record<string, (createResult: Record<string, unknown>) => Record<string, unknown>> = {
  update_world: (r) => ({ worldId: r.worldId, name: 'Updated World' }),
  update_shard: (r) => ({ shardId: r.shardId, name: 'Updated Shard' }),
  update_zone: (r) => ({ zoneId: r.zoneId, name: 'Updated Zone' }),
  update_place: (r) => ({ placeId: r.placeId, name: 'Updated Place' }),
  update_location_quest: (r) => ({ questId: r.questId, name: 'Updated Quest' }),
};

const CREATE_ID_FIELDS: Record<string, string> = {
  create_world: 'worldId',
  create_shard: 'shardId',
  create_zone: 'zoneId',
  create_place: 'placeId',
  create_location_quest: 'questId',
};

const DELETE_FIXTURES: Record<string, (createResult: Record<string, unknown>) => Record<string, unknown>> = {
  delete_world: (r) => ({ worldId: r.worldId }),
  delete_shard: (r) => ({ shardId: r.shardId }),
  delete_zone: (r) => ({ zoneId: r.zoneId }),
  delete_place: (r) => ({ placeId: r.placeId }),
  delete_location_quest: (r) => ({ questId: r.questId }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HoloGate mutation authority — create_* cluster', () => {
  beforeEach(() => clearHololandRegistries());

  for (const [tool, fixture] of Object.entries(CREATE_FIXTURES)) {
    it(`${tool} — authority receipt present in response`, async () => {
      const result = await callMutation(tool, fixture);
      expect(result.success).toBe(true);
      expect(result.authorityReceipt).toBeDefined();
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.authorityChecked).toBe(true);
      expect(receipt.toolName).toBe(tool);
      expect(receipt.op).toBe('create');
      expect(typeof receipt.resourceKind).toBe('string');
      expect(typeof receipt.ts).toBe('string');
    });

    it(`${tool} — receipt captures requesterId from args`, async () => {
      const result = await callMutation(tool, { ...fixture, requesterId: 'agent-test-001' });
      expect(result.success).toBe(true);
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.requesterId).toBe('agent-test-001');
    });

    it(`${tool} — receipt defaults requesterId to mcp-caller`, async () => {
      const result = await callMutation(tool, fixture);
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.requesterId).toBe('mcp-caller');
    });
  }
});

describe('HoloGate mutation authority — update_* cluster', () => {
  beforeEach(() => clearHololandRegistries());

  for (const [tool, argsBuilder] of Object.entries(UPDATE_FIXTURES)) {
    const createTool = tool.replace('update_', 'create_');
    const idField = CREATE_ID_FIELDS[createTool];

    it(`${tool} — authority receipt present in response`, async () => {
      const createResult = await callMutation(createTool, CREATE_FIXTURES[createTool]);
      expect(createResult.success).toBe(true);
      const updateArgs = argsBuilder(createResult);
      const result = await callMutation(tool, updateArgs);
      expect(result.success).toBe(true);
      expect(result.authorityReceipt).toBeDefined();
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.authorityChecked).toBe(true);
      expect(receipt.toolName).toBe(tool);
      expect(receipt.op).toBe('update');
    });

    it(`${tool} — receipt logs resource id`, async () => {
      const createResult = await callMutation(createTool, CREATE_FIXTURES[createTool]);
      const updateArgs = argsBuilder(createResult);
      const result = await callMutation(tool, updateArgs);
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.resourceId).toBe(createResult[idField]);
    });
  }
});

describe('HoloGate mutation authority — delete_* cluster', () => {
  beforeEach(() => clearHololandRegistries());

  for (const [tool, argsBuilder] of Object.entries(DELETE_FIXTURES)) {
    const createTool = tool.replace('delete_', 'create_');

    it(`${tool} — authority receipt present in response`, async () => {
      const createResult = await callMutation(createTool, CREATE_FIXTURES[createTool]);
      expect(createResult.success).toBe(true);
      const deleteArgs = argsBuilder(createResult);
      const result = await callMutation(tool, deleteArgs);
      expect(result.success).toBe(true);
      expect(result.authorityReceipt).toBeDefined();
      const receipt = result.authorityReceipt as Record<string, unknown>;
      expect(receipt.authorityChecked).toBe(true);
      expect(receipt.toolName).toBe(tool);
      expect(receipt.op).toBe('delete');
    });
  }
});

describe('HoloGate mutation authority — receipt shape invariants', () => {
  beforeEach(() => clearHololandRegistries());

  it('receipt has all required fields', async () => {
    const result = await callMutation('create_world', { name: 'Shape Test World' });
    const receipt = result.authorityReceipt as Record<string, unknown>;
    for (const field of ['authorityChecked', 'toolName', 'op', 'resourceKind', 'resourceId', 'requesterId', 'admissionScope', 'ts']) {
      expect(receipt[field], `field '${field}' missing`).toBeDefined();
    }
  });

  it('admissionScope is lightweight for all mutation tools', async () => {
    const result = await callMutation('create_world', { name: 'Scope Test World' });
    const receipt = result.authorityReceipt as Record<string, unknown>;
    expect(receipt.admissionScope).toBe('lightweight');
  });

  it('receipt ts is a valid ISO 8601 string', async () => {
    const result = await callMutation('create_world', { name: 'TS Test World' });
    const receipt = result.authorityReceipt as Record<string, unknown>;
    expect(() => new Date(receipt.ts as string).toISOString()).not.toThrow();
  });
});
