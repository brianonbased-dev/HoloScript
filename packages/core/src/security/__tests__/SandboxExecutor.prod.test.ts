/**
 * SandboxExecutor — production test suite
 *
 * Tests: sandbox creation, code execution, policy enforcement,
 * resource tracking, error handling, and lifecycle management.
 */

import { describe, it, expect } from 'vitest';
import {
  createSandbox,
  execute,
  destroy,
} from '../SandboxExecutor';
import { createDefaultPolicy, createStrictPolicy } from '../SecurityPolicy';
import type { SecurityPolicy } from '../SecurityPolicy';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<SecurityPolicy['sandbox']> = {}): SecurityPolicy {
  const base = createDefaultPolicy();
  base.sandbox = { ...base.sandbox, ...overrides };
  return base;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SandboxExecutor: production', () => {

  // ─── Creation ────────────────────────────────────────────────────────────
  describe('createSandbox', () => {
    it('creates a sandbox with id', () => {
      const sb = createSandbox(makePolicy());
      expect(typeof sb.id).toBe('string');
      expect(sb.id.length).toBeGreaterThan(0);
    });

    it('starts in idle state', () => {
      const sb = createSandbox(makePolicy());
      expect(sb.state).toBe('idle');
    });

    it('initialises with zero resource usage', () => {
      const sb = createSandbox(makePolicy());
      expect(sb.memoryUsed).toBe(0);
      expect(sb.cpuTimeUsed).toBe(0);
    });

    it('stores the provided policy', () => {
      const policy = makePolicy({ memoryLimit: 32 });
      const sb = createSandbox(policy);
      expect(sb.policy.sandbox.memoryLimit).toBe(32);
    });

    it('each sandbox gets a unique id', () => {
      const a = createSandbox(makePolicy());
      const b = createSandbox(makePolicy());
      expect(a.id).not.toBe(b.id);
    });

    it('works with createDefaultPolicy()', () => {
      const sb = createSandbox(createDefaultPolicy());
      expect(sb.state).toBe('idle');
    });

    it('works with createStrictPolicy()', () => {
      const sb = createSandbox(createStrictPolicy());
      expect(sb.policy.sandbox.memoryLimit).toBe(64);
      expect(sb.policy.sandbox.cpuTimeLimit).toBe(5);
    });
  });

  // ─── Execution ────────────────────────────────────────────────────────────
  describe('execute', () => {
    it('runs simple arithmetic code', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return 2 + 2', sb);
      expect(result.success).toBe(true);
      expect(result.result).toBe(4);
    });

    it('runs string code', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return "Hello".toUpperCase()', sb);
      expect(result.success).toBe(true);
      expect(result.result).toBe('HELLO');
    });

    it('runs Math operations', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return Math.sqrt(16)', sb);
      expect(result.success).toBe(true);
      expect(result.result).toBeCloseTo(4);
    });

    it('runs JSON operations', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return JSON.stringify({ x: 1 })', sb);
      expect(result.success).toBe(true);
      expect(result.result).toBe('{"x":1}');
    });

    it('returns success=false on syntax error', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('{{{{invalid', sb);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success=false on runtime error', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('null.toString()', sb);
      expect(result.success).toBe(false);
    });

    it('blocks access to process (returns undefined or throws)', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return typeof process', sb);
      // Blocked globals shadow to undefined, so typeof returns 'undefined'
      if (result.success) {
        expect(result.result).toBe('undefined');
      } else {
        expect(result.success).toBe(false);
      }
    });

    it('blocks access to require (returns undefined or throws)', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('return typeof require', sb);
      if (result.success) {
        expect(result.result).toBe('undefined');
      } else {
        expect(result.success).toBe(false);
      }
    });

    it('records memory usage after execution', async () => {
      const sb = createSandbox(makePolicy());
      await execute('Math.PI', sb);
      expect(sb.memoryUsed).toBeGreaterThan(0);
    });

    it('records cpu time after execution', async () => {
      const sb = createSandbox(makePolicy());
      await execute('1+1', sb);
      expect(sb.cpuTimeUsed).toBeGreaterThanOrEqual(0);
    });

    it('returns memoryUsed and cpuTimeUsed in result', async () => {
      const sb = createSandbox(makePolicy());
      const result = await execute('1+1', sb);
      expect(result.memoryUsed).toBeGreaterThanOrEqual(0);
      expect(result.cpuTimeUsed).toBeGreaterThanOrEqual(0);
    });

    it('can execute multiple statements on the same sandbox', async () => {
      const sb = createSandbox(makePolicy());
      const r1 = await execute('1+1', sb);
      const r2 = await execute('2+2', sb);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });
  });

  // ─── Destroy ──────────────────────────────────────────────────────────────
  describe('destroy', () => {
    it('sets sandbox state to destroyed', () => {
      const sb = createSandbox(makePolicy());
      destroy(sb);
      expect(sb.state).toBe('destroyed');
    });

    it('does not throw when destroying an idle sandbox', () => {
      const sb = createSandbox(makePolicy());
      expect(() => destroy(sb)).not.toThrow();
    });

    it('destroyed sandbox returns failure on execute', async () => {
      const sb = createSandbox(makePolicy());
      destroy(sb);
      const result = await execute('1+1', sb);
      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });

    it('resets memoryUsed and cpuTimeUsed after destroy', async () => {
      const sb = createSandbox(makePolicy());
      await execute('Math.random()', sb);
      destroy(sb);
      expect(sb.memoryUsed).toBe(0);
      expect(sb.cpuTimeUsed).toBe(0);
    });
  });
});
