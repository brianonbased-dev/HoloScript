import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSandbox, execute, destroy } from '@holoscript/core';
import { createDefaultPolicy, createStrictPolicy, mergePolicy } from '@holoscript/core';

function defaultSandbox() {
  return createSandbox(createDefaultPolicy());
}

describe('createSandbox', () => {
  it('creates sandbox with idle state', () => {
    const sb = defaultSandbox();
    expect(sb.state).toBe('idle');
    expect(sb.id).toMatch(/^sandbox-/);
    expect(sb.memoryUsed).toBe(0);
    expect(sb.cpuTimeUsed).toBe(0);
  });

  it('generates unique IDs', () => {
    const sb1 = defaultSandbox();
    const sb2 = defaultSandbox();
    expect(sb1.id).not.toBe(sb2.id);
  });
});

describe('execute', () => {
  it('executes simple expression', async () => {
    const sb = defaultSandbox();
    const result = await execute('return 2 + 2;', sb);
    expect(result.success).toBe(true);
    expect(result.result).toBe(4);
    expect(sb.state).toBe('idle');
    destroy(sb);
  });

  it('can use Math', async () => {
    const sb = defaultSandbox();
    const result = await execute('return Math.max(1, 5, 3);', sb);
    expect(result.success).toBe(true);
    expect(result.result).toBe(5);
    destroy(sb);
  });

  it('can use JSON', async () => {
    const sb = defaultSandbox();
    const result = await execute('return JSON.stringify({a: 1});', sb);
    expect(result.success).toBe(true);
    expect(result.result).toBe('{"a":1}');
    destroy(sb);
  });

  it('blocks process access', async () => {
    const sb = defaultSandbox();
    const result = await execute('return typeof process;', sb);
    expect(result.success).toBe(true);
    expect(result.result).toBe('undefined');
    destroy(sb);
  });

  it('blocks require access', async () => {
    const sb = defaultSandbox();
    const result = await execute('return typeof require;', sb);
    expect(result.success).toBe(true);
    expect(result.result).toBe('undefined');
    destroy(sb);
  });

  it('catches runtime errors', async () => {
    const sb = defaultSandbox();
    const result = await execute('throw new Error("boom");', sb);
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
    expect(sb.state).toBe('error');
    destroy(sb);
  });

  it('rejects execution on destroyed sandbox', async () => {
    const sb = defaultSandbox();
    destroy(sb);
    const result = await execute('return 1;', sb);
    expect(result.success).toBe(false);
    expect(result.error).toContain('destroyed');
  });

  it('rejects concurrent execution', async () => {
    const sb = defaultSandbox();
    sb.state = 'running';
    const result = await execute('return 1;', sb);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already executing');
    destroy(sb);
  });

  it('rejects code exceeding memory limit', async () => {
    const strictPolicy = createStrictPolicy(); // 64MB memory limit
    // Create policy with very low memory (0.001MB = ~1KB)
    const tinyPolicy = mergePolicy(strictPolicy, { sandbox: { memoryLimit: 0.001 } });
    const sb = createSandbox(tinyPolicy);
    // Code length * 8 (heuristic) = memory estimate; needs to exceed ~1KB
    const bigCode = 'return "' + 'x'.repeat(500) + '";';
    const result = await execute(bigCode, sb);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Memory limit exceeded');
    destroy(sb);
  });

  it('tracks memory usage', async () => {
    const sb = defaultSandbox();
    await execute('return 42;', sb);
    expect(sb.memoryUsed).toBeGreaterThan(0);
    destroy(sb);
  });

  it('tracks CPU time', async () => {
    const sb = defaultSandbox();
    await execute('return 1;', sb);
    expect(sb.cpuTimeUsed).toBeGreaterThanOrEqual(0);
    destroy(sb);
  });
});

describe('destroy', () => {
  it('sets state to destroyed', () => {
    const sb = defaultSandbox();
    destroy(sb);
    expect(sb.state).toBe('destroyed');
  });

  it('clears context and resets counters', () => {
    const sb = defaultSandbox();
    sb.memoryUsed = 100;
    sb.cpuTimeUsed = 50;
    sb._context.set('test', 'data');
    destroy(sb);
    expect(sb.memoryUsed).toBe(0);
    expect(sb.cpuTimeUsed).toBe(0);
    expect(sb._context.size).toBe(0);
  });
});
