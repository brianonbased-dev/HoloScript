import { describe, expect, it, vi } from 'vitest';

import {
  resolveSovereignMemoryConfigFromEnv,
  runSovereignMemoryRoundTrip,
} from './consumer-runtime.js';
import {
  SOVEREIGN_MEMORY_REQUIRED_COLUMNS,
  SOVEREIGN_MEMORY_SCHEMA,
  SOVEREIGN_MEMORY_SCHEMA_SQL,
  SOVEREIGN_MEMORY_SCHEMA_VERSION,
  SOVEREIGN_MEMORY_TABLE,
  type MemoryEntry,
  type SovereignMemoryHealth,
  type SovereignMemorySchemaReceipt,
} from './sovereign-memory-store.js';

function healthReceipt(): SovereignMemoryHealth {
  return {
    schema: SOVEREIGN_MEMORY_SCHEMA,
    ok: true,
    schemaReady: true,
    table: SOVEREIGN_MEMORY_TABLE,
    workspaceId: 'consumer-test',
    requiredColumnCount: SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length,
    presentColumnCount: SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length,
    checkedAt: '2026-07-11T00:00:00.000Z',
  };
}

function schemaReceipt(): SovereignMemorySchemaReceipt {
  return {
    ...healthReceipt(),
    initialized: true,
    statementsApplied: SOVEREIGN_MEMORY_SCHEMA_SQL.length,
    schemaVersion: SOVEREIGN_MEMORY_SCHEMA_VERSION,
  };
}

describe('sovereign memory consumer runtime', () => {
  it('resolves a standard connection string without leaking it into status', () => {
    const resolved = resolveSovereignMemoryConfigFromEnv({
      MEMORY_DATABASE_URL: 'postgres://memory:secret@example.test/knowledge',
      MEMORY_WORKSPACE: 'outside-consumer',
    });

    expect(resolved.config.connectionString).toContain('secret');
    expect(resolved.status).toEqual({
      configured: true,
      mode: 'connection-string',
      connectionSource: 'MEMORY_DATABASE_URL',
      credentialPresent: true,
      workspaceId: 'outside-consumer',
    });
    expect(JSON.stringify(resolved.status)).not.toContain('secret');
    expect(JSON.stringify(resolved.status)).not.toContain('example.test');
  });

  it('resolves split Postgres fields for vault-injected consumers', () => {
    const resolved = resolveSovereignMemoryConfigFromEnv({
      MEMORY_PGHOST: 'db.example.test',
      MEMORY_PGPORT: '6543',
      MEMORY_PGDATABASE: 'memory',
      MEMORY_PGUSER: 'memory_agent',
      MEMORY_PGPASSWORD: 'secret',
    });

    expect(resolved.config).toMatchObject({
      host: 'db.example.test',
      port: 6543,
      database: 'memory',
      user: 'memory_agent',
      password: 'secret',
    });
    expect(resolved.status.mode).toBe('fields');
    expect(resolved.status.credentialPresent).toBe(true);
  });

  it('wires schema, health, store, recall, cleanup, and cleanup verification in order', async () => {
    const calls: string[] = [];
    const entry: MemoryEntry = {
      id: 'P.MEMORY.probe-1',
      authorAgent: 'consumer-agent',
      section: 'P',
      type: 'pattern',
      content: 'stored',
      tags: ['public-package'],
      domain: 'consumer-proof',
      confidence: 1,
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    let recallCount = 0;
    const store = {
      ensureSchema: vi.fn(async () => {
        calls.push('schema');
        return schemaReceipt();
      }),
      health: vi.fn(async () => {
        calls.push('health');
        return healthReceipt();
      }),
      store: vi.fn(async () => {
        calls.push('store');
        return entry.id;
      }),
      recall: vi.fn(async () => {
        calls.push('recall');
        recallCount += 1;
        return recallCount === 1 ? [entry] : [];
      }),
      forget: vi.fn(async () => {
        calls.push('forget');
      }),
    };

    const receipt = await runSovereignMemoryRoundTrip({
      store,
      workspaceId: 'consumer-test',
      authorAgent: 'consumer-agent',
      idFactory: () => 'probe-1',
      clock: () => '2026-07-11T00:00:00.000Z',
    });

    expect(calls).toEqual(['schema', 'health', 'store', 'recall', 'forget', 'recall']);
    expect(receipt.ok).toBe(true);
    expect(receipt.probe.matched).toBe(true);
    expect(receipt.probe.cleanupVerified).toBe(true);
    expect(receipt.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(receipt)).not.toContain('memory-round-trip-probe-1');
  });
});
