/**
 * Sprint 47 — @holoscript/adapter-postgres acceptance tests
 * Covers: PostgresHoloAdapter constructor, query(), saveExecution(), IDatabaseProvider interface
 *
 * NOTE: We vi.mock 'pg' and 'cuid' so no real DB connection is needed.
 *       PostgresPool uses a singleton; the mock is set up before any imports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vi.hoisted: declare mock fns before vi.mock factory runs ─────────────────
const { mockQuery, mockOn, mockConnect, mockEnd } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
  mockOn: vi.fn(),
  mockConnect: vi.fn(),
  mockEnd: vi.fn(),
}));

// ── pg mock — must use a real class because pool.ts calls `new Pool(config)` ─
vi.mock('pg', () => {
  class MockPool {
    query = mockQuery;
    on = mockOn;
    connect = mockConnect;
    end = mockEnd;
    constructor(_config?: any) {}
  }
  return { Pool: MockPool };
});

// ── cuid mock ─────────────────────────────────────────────────────────────────
vi.mock('cuid', () => ({
  default: vi.fn().mockReturnValue('cltest00000000000000000000'),
}));

import { PostgresHoloAdapter } from '../index';
import type { IDatabaseProvider } from '../index';

// ═══════════════════════════════════════════════
// PostgresHoloAdapter — construction
// ═══════════════════════════════════════════════
describe('PostgresHoloAdapter constructor', () => {
  it('constructs without arguments (uses env)', () => {
    const adapter = new PostgresHoloAdapter();
    expect(adapter).toBeDefined();
  });

  it('constructs with a connection string', () => {
    const adapter = new PostgresHoloAdapter('postgresql://localhost/test');
    expect(adapter).toBeDefined();
  });

  it('constructs with a PoolConfig object', () => {
    const adapter = new PostgresHoloAdapter({ host: 'localhost', database: 'test' });
    expect(adapter).toBeDefined();
  });

  it('implements IDatabaseProvider interface', () => {
    const adapter: IDatabaseProvider = new PostgresHoloAdapter();
    expect(typeof adapter.query).toBe('function');
    expect(typeof adapter.saveExecution).toBe('function');
  });
});

// ═══════════════════════════════════════════════
// PostgresHoloAdapter — query()
// ═══════════════════════════════════════════════
describe('PostgresHoloAdapter.query()', () => {
  it('is a function', () => {
    const adapter = new PostgresHoloAdapter();
    expect(typeof adapter.query).toBe('function');
  });

  it('returns a Promise', () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const adapter = new PostgresHoloAdapter();
    const result = adapter.query('SELECT 1');
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves with the rows array from the pool result', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 42 }] });
    const adapter = new PostgresHoloAdapter();
    const rows = await adapter.query('SELECT count(*) FROM users');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toEqual({ count: 42 });
  });

  it('passes SQL and params to the underlying pool', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const adapter = new PostgresHoloAdapter();
    await adapter.query('SELECT * FROM test WHERE id = $1', [123]);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [123]);
  });
});

// ═══════════════════════════════════════════════
// PostgresHoloAdapter — saveExecution()
// ═══════════════════════════════════════════════
describe('PostgresHoloAdapter.saveExecution()', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('is a function', () => {
    const adapter = new PostgresHoloAdapter();
    expect(typeof adapter.saveExecution).toBe('function');
  });

  it('returns a Promise', () => {
    const adapter = new PostgresHoloAdapter();
    const result = adapter.saveExecution('script-1', 'cube {}', 'success', 42);
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves without throwing', async () => {
    const adapter = new PostgresHoloAdapter();
    await expect(
      adapter.saveExecution('script-1', 'cube {}', 'success', 100)
    ).resolves.not.toThrow();
  });

  it('resolves even without optional output/error/agentId', async () => {
    const adapter = new PostgresHoloAdapter();
    await expect(
      adapter.saveExecution('script-2', 'sphere {}', 'success', 50)
    ).resolves.not.toThrow();
  });

  it('resolves with optional output and error', async () => {
    const adapter = new PostgresHoloAdapter();
    await expect(
      adapter.saveExecution(
        'script-3',
        'cube {}',
        'error',
        10,
        'output text',
        'SyntaxError',
        'agent-42'
      )
    ).resolves.not.toThrow();
  });

  it('does not throw when the underlying query fails (silent logging)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));
    const adapter = new PostgresHoloAdapter();
    // saveExecution catches errors internally and does not rethrow
    await expect(adapter.saveExecution('script-err', 'cube {}', 'error', 5)).resolves.not.toThrow();
  });
});
