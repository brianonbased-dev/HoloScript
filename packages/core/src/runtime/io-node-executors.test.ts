/**
 * Unit tests for runtime/io-node-executors.ts (W1-T4 slice 32).
 *
 * Verifies the shared shape (public-mode gate + log + success result)
 * across server/database/fetch executors in isolation from
 * HoloScriptRuntime.
 */
import { describe, it, expect } from 'vitest';
import {
  executeServerNode,
  executeDatabaseNode,
  executeFetchNode,
  type IoNodeContext,
} from './io-node-executors';

function mkCtx(isPublicMode: boolean): IoNodeContext & { __logs: string[] } {
  const logs: string[] = [];
  return {
    isPublicMode,
    logInfo: (msg) => {
      logs.push(msg);
    },
    __logs: logs,
  } as IoNodeContext & { __logs: string[] };
}

describe('runtime/io-node-executors', () => {
  describe('executeServerNode', () => {
    it('blocks in public mode with SecurityViolation', async () => {
      const ctx = mkCtx(true);
      const res = await executeServerNode({ port: 8080 }, ctx);
      expect(res.success).toBe(false);
      expect(res.error).toContain('SecurityViolation');
      expect(res.error).toContain('Server creation blocked in public mode');
      expect(res.executionTime).toBe(0);
      expect(ctx.__logs).toEqual([]); // never logged (blocked early)
    });

    it('succeeds in non-public mode, logs start, passes through hologram', async () => {
      const ctx = mkCtx(false);
      const hologram = { shape: 'cube' };
      const res = await executeServerNode({ port: 3000, hologram }, ctx);
      expect(res.success).toBe(true);
      expect(res.output).toBe('Server listening on port 3000');
      expect(res.hologram).toBe(hologram);
      expect(ctx.__logs).toEqual(['Starting server on port 3000']);
    });
  });

  describe('executeDatabaseNode', () => {
    it('blocks in public mode with SecurityViolation', async () => {
      const ctx = mkCtx(true);
      const res = await executeDatabaseNode({ query: 'SELECT 1' }, ctx);
      expect(res.success).toBe(false);
      expect(res.error).toContain('SecurityViolation');
      expect(res.error).toContain('DB access blocked in public mode');
      expect(ctx.__logs).toEqual([]);
    });

    it('succeeds in non-public mode, logs query, passes through hologram', async () => {
      const ctx = mkCtx(false);
      const hologram = { shape: 'sphere' };
      const res = await executeDatabaseNode({ query: 'SELECT * FROM users', hologram }, ctx);
      expect(res.success).toBe(true);
      expect(res.output).toBe('Query executed: SELECT * FROM users');
      expect(res.hologram).toBe(hologram);
      expect(ctx.__logs).toEqual(['Executing Query: SELECT * FROM users']);
    });
  });

  describe('executeFetchNode', () => {
    it('blocks in public mode with SecurityViolation', async () => {
      const ctx = mkCtx(true);
      const res = await executeFetchNode({ url: 'https://api.example.com' }, ctx);
      expect(res.success).toBe(false);
      expect(res.error).toContain('SecurityViolation');
      expect(res.error).toContain('External fetch blocked in public mode');
      expect(ctx.__logs).toEqual([]);
    });

    it('succeeds in non-public mode, logs fetch URL, passes through hologram', async () => {
      const ctx = mkCtx(false);
      const hologram = { shape: 'pyramid' };
      const res = await executeFetchNode(
        { url: 'https://holoscript.net/health', hologram },
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('Fetched data from https://holoscript.net/health');
      expect(res.hologram).toBe(hologram);
      expect(ctx.__logs).toEqual(['Fetching: https://holoscript.net/health']);
    });
  });

  describe('shared shape invariants', () => {
    it('all three return executionTime=0 on both paths (sync stub)', async () => {
      const allowCtx = mkCtx(false);
      const blockCtx = mkCtx(true);
      const s1 = await executeServerNode({ port: 80 }, allowCtx);
      const s2 = await executeServerNode({ port: 80 }, blockCtx);
      const d1 = await executeDatabaseNode({ query: 'x' }, allowCtx);
      const d2 = await executeDatabaseNode({ query: 'x' }, blockCtx);
      const f1 = await executeFetchNode({ url: 'x' }, allowCtx);
      const f2 = await executeFetchNode({ url: 'x' }, blockCtx);
      for (const r of [s1, s2, d1, d2, f1, f2]) {
        expect(r.executionTime).toBe(0);
      }
    });

    it("hologram is undefined when not provided (type boundary)", async () => {
      const ctx = mkCtx(false);
      const res = await executeServerNode({ port: 1 }, ctx);
      expect(res.hologram).toBeUndefined();
    });
  });
});
