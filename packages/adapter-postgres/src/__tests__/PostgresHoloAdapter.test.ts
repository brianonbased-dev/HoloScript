import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Store reference to mock functions
let mockQuery: Mock;
let mockConnect: Mock;
let mockEnd: Mock;
let mockOn: Mock;
let poolConstructorSpy: Mock;

// Mock pg module
vi.mock('pg', () => {
  const query = vi.fn();
  const connect = vi.fn();
  const end = vi.fn();
  const on = vi.fn();
  const constructorSpy = vi.fn();

  // Use a proper class for the Pool mock
  class MockPool {
    query = query;
    connect = connect;
    end = end;
    on = on;
    constructor(config?: any) {
      constructorSpy(config);
    }
  }

  return {
    Pool: MockPool,
    __getMocks: () => ({ query, connect, end, on, constructorSpy }),
  };
});

// Mock cuid
vi.mock('cuid', () => ({
  default: () => 'mock-cuid-123',
}));

// Import after mocking
import { PostgresHoloAdapter } from '../index';
import { PostgresPool } from '../pool';
import * as pg from 'pg';

describe('PostgresHoloAdapter', () => {
  let adapter: PostgresHoloAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the PostgresPool singleton
    (PostgresPool as any).instance = undefined;

    // Get mock references
    const mocks = (pg as any).__getMocks();
    mockQuery = mocks.query;
    mockConnect = mocks.connect;
    mockEnd = mocks.end;
    mockOn = mocks.on;
    poolConstructorSpy = mocks.constructorSpy;

    // Create a fresh adapter for each test
    adapter = new PostgresHoloAdapter({ connectionString: 'postgres://test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with connection string', () => {
      // Reset singleton again for this test
      (PostgresPool as any).instance = undefined;
      poolConstructorSpy.mockClear();
      const testAdapter = new PostgresHoloAdapter('postgres://localhost:5432/test');
      expect(poolConstructorSpy).toHaveBeenCalled();
    });

    it('should create adapter with config object', () => {
      (PostgresPool as any).instance = undefined;
      poolConstructorSpy.mockClear();
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
        password: 'pass',
      };
      const testAdapter = new PostgresHoloAdapter(config);
      expect(poolConstructorSpy).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should execute SQL query and return rows', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await adapter.query('SELECT * FROM users');

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockRows);
    });

    it('should pass parameters to query', async () => {
      const mockRows = [{ id: 1 }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await adapter.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockRows);
    });

    it('should handle query errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB Error'));

      await expect(adapter.query('BAD SQL')).rejects.toThrow('DB Error');
    });
  });

  describe('saveExecution', () => {
    it('should save execution with all parameters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.saveExecution(
        'script-123',
        'console.log("hello")',
        'success',
        42,
        'hello',
        undefined,
        'agent-001'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "HoloScriptExecution"'),
        expect.arrayContaining([
          'mock-cuid-123',
          'script-123',
          'console.log("hello")',
          'success',
          42,
          'hello',
          null,
          'agent-001',
        ])
      );
    });

    it('should use default agentId when not provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.saveExecution('script-123', 'code', 'success', 10);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['system'])
      );
    });

    it('should generate scriptId when not provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.saveExecution(
        '', // empty scriptId
        'code',
        'success',
        10
      );

      // Check that the second param is the generated cuid (fallback)
      const callArgs = mockQuery.mock.calls[0][1];
      expect(callArgs[1]).toBe('mock-cuid-123');
    });

    it('should handle save errors gracefully without throwing', async () => {
      mockQuery.mockRejectedValue(new Error('Save failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw
      await expect(
        adapter.saveExecution('id', 'code', 'error', 100, undefined, 'error msg')
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should save execution with error message', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.saveExecution('script-err', 'bad code', 'error', 5, undefined, 'Syntax error');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['Syntax error'])
      );
    });
  });
});

describe('PostgresPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (PostgresPool as any).instance = undefined;

    // Get mock references
    const mocks = (pg as any).__getMocks();
    mockQuery = mocks.query;
    mockConnect = mocks.connect;
    mockEnd = mocks.end;
    mockOn = mocks.on;
    poolConstructorSpy = mocks.constructorSpy;
  });

  it('should be a singleton', () => {
    poolConstructorSpy.mockClear();
    const pool1 = PostgresPool.getInstance({ connectionString: 'postgres://test1' });
    const pool2 = PostgresPool.getInstance({ connectionString: 'postgres://test2' });

    // Pool constructor should only be called once (singleton pattern)
    expect(poolConstructorSpy).toHaveBeenCalledTimes(1);
    expect(pool1).toBe(pool2);
  });

  it('should register error handler on pool', () => {
    PostgresPool.getInstance({ connectionString: 'postgres://test' });
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
