import { describe, it, expect, vi } from 'vitest';
import {
  executeServerNode,
  executeDatabaseNode,
  executeFetchNode,
} from '../io-node-executors.js';
import type { IoNodeContext } from '../io-node-executors.js';

function makeCtx(isPublicMode = false): IoNodeContext {
  return { isPublicMode, logInfo: vi.fn() };
}

describe('executeServerNode', () => {
  it('blocks in public mode', async () => {
    const result = await executeServerNode({ port: 3000 }, makeCtx(true));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SecurityViolation/);
  });

  it('succeeds in non-public mode', async () => {
    const result = await executeServerNode({ port: 8080 }, makeCtx(false));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('8080');
  });

  it('returns executionTime 0', async () => {
    const result = await executeServerNode({ port: 9000 }, makeCtx(false));
    expect(result.executionTime).toBe(0);
  });
});

describe('executeDatabaseNode', () => {
  it('blocks in public mode', async () => {
    const result = await executeDatabaseNode({ query: 'SELECT 1' }, makeCtx(true));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SecurityViolation/);
  });

  it('succeeds in non-public mode', async () => {
    const result = await executeDatabaseNode({ query: 'SELECT * FROM users' }, makeCtx(false));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('SELECT');
  });

  it('includes query in output', async () => {
    const result = await executeDatabaseNode({ query: 'DROP TABLE test' }, makeCtx(false));
    expect(String(result.output)).toContain('DROP TABLE test');
  });
});

describe('executeFetchNode', () => {
  it('blocks in public mode', async () => {
    const result = await executeFetchNode({ url: 'https://example.com' }, makeCtx(true));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SecurityViolation/);
  });

  it('succeeds in non-public mode', async () => {
    const result = await executeFetchNode({ url: 'https://api.example.com/data' }, makeCtx(false));
    expect(result.success).toBe(true);
  });

  it('includes url in output', async () => {
    const result = await executeFetchNode({ url: 'https://example.com' }, makeCtx(false));
    expect(String(result.output)).toContain('example.com');
  });
});
