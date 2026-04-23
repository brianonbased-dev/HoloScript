/**
 * Unit tests for system-variables — AUDIT-mode coverage
 *
 * Slice 9. Per-tick injection of $time/$user/$location/etc defaults.
 * Security-relevant: parses localStorage JSON via readJson; malformed
 * input must not crash the tick.
 *
 * **See**: packages/core/src/runtime/system-variables.ts (slice 9)
 */

import { describe, it, expect, vi } from 'vitest';
import { updateSystemVariables, type SystemVariablesContext } from './system-variables';

function makeCtx(opts: {
  existingVars?: Record<string, unknown>;
  apiKeysJson?: string | null;
} = {}): {
  ctx: SystemVariablesContext;
  writes: Record<string, unknown>;
} {
  const writes: Record<string, unknown> = {};
  const existing = opts.existingVars ?? {};
  const ctx: SystemVariablesContext = {
    setVariable: (name, value) => { writes[name] = value; },
    getVariable: (name) => existing[name],
    brittneyApiKeysJson: opts.apiKeysJson ?? null,
  };
  return { ctx, writes };
}

describe('updateSystemVariables — time variables (always written)', () => {
  it('writes $time, $date, $timestamp, $hour, $minute, $second', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(typeof writes.$time).toBe('string'); // toLocaleTimeString
    expect(typeof writes.$date).toBe('string'); // toLocaleDateString
    expect(typeof writes.$timestamp).toBe('number');
    expect(typeof writes.$hour).toBe('number');
    expect(typeof writes.$minute).toBe('number');
    expect(typeof writes.$second).toBe('number');
  });

  it('$hour, $minute, $second are in valid ranges', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$hour).toBeGreaterThanOrEqual(0);
    expect(writes.$hour).toBeLessThan(24);
    expect(writes.$minute).toBeGreaterThanOrEqual(0);
    expect(writes.$minute).toBeLessThan(60);
    expect(writes.$second).toBeGreaterThanOrEqual(0);
    expect(writes.$second).toBeLessThan(60);
  });

  it('time variables OVERWRITE existing values every tick', () => {
    const { ctx, writes } = makeCtx({ existingVars: { $time: 'stale' } });
    updateSystemVariables(ctx);
    // Even though $time existed, the tick rewrites it
    expect(writes.$time).not.toBe('stale');
  });
});

describe('updateSystemVariables — mock defaults (set only if undefined)', () => {
  it('$user default is written when absent', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$user).toMatchObject({
      id: 'user_123',
      name: 'Alpha Explorer',
      level: 42,
    });
  });

  it('$user NOT written if already set', () => {
    const { ctx, writes } = makeCtx({
      existingVars: { $user: { id: 'real-user', name: 'Real' } },
    });
    updateSystemVariables(ctx);
    expect(writes.$user).toBeUndefined();
  });

  it('$location default is Neo Tokyo preset', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$location).toMatchObject({ city: 'Neo Tokyo' });
  });

  it('$weather default is Neon Mist preset', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$weather).toMatchObject({ condition: 'Neon Mist' });
  });

  it('$wallet default has balance + currency', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$wallet).toMatchObject({
      balance: 1337.5,
      currency: 'HOLO',
    });
  });

  it('$chat_status default', () => {
    const { ctx, writes } = makeCtx();
    updateSystemVariables(ctx);
    expect(writes.$chat_status).toMatchObject({ active: true, version: '1.0.0-brittney' });
  });
});

describe('updateSystemVariables — $ai_config parsing', () => {
  it('null apiKeysJson → status "pending", providerCount 0', () => {
    const { ctx, writes } = makeCtx({ apiKeysJson: null });
    updateSystemVariables(ctx);
    expect(writes.$ai_config).toMatchObject({
      status: 'pending',
      providerCount: 0,
    });
  });

  it('empty string apiKeysJson → pending, 0', () => {
    const { ctx, writes } = makeCtx({ apiKeysJson: '' });
    updateSystemVariables(ctx);
    expect(writes.$ai_config).toMatchObject({ status: 'pending', providerCount: 0 });
  });

  it('valid JSON with 3 truthy keys → configured, 3', () => {
    const json = JSON.stringify({ anthropic: 'sk-xxx', openai: 'sk-yyy', google: 'api-zzz' });
    const { ctx, writes } = makeCtx({ apiKeysJson: json });
    updateSystemVariables(ctx);
    expect(writes.$ai_config).toMatchObject({
      status: 'configured',
      providerCount: 3,
    });
  });

  it('JSON with mix of truthy/falsy values counts only truthy', () => {
    const json = JSON.stringify({ a: 'xxx', b: '', c: null, d: 'yyy', e: 0 });
    const { ctx, writes } = makeCtx({ apiKeysJson: json });
    updateSystemVariables(ctx);
    expect(writes.$ai_config).toMatchObject({ status: 'configured', providerCount: 2 });
  });

  it('malformed JSON is silently swallowed — still returns pending config', () => {
    const { ctx, writes } = makeCtx({ apiKeysJson: '{not valid json' });
    // The key behavior: DOES NOT throw, still writes $ai_config as pending
    expect(() => updateSystemVariables(ctx)).not.toThrow();
    expect(writes.$ai_config).toMatchObject({ status: 'pending', providerCount: 0 });
  });

  it('adversarial JSON with __proto__ does not crash', () => {
    // Prototype pollution smoke test — readJson should reject or at
    // least not pollute Object.prototype.
    const json = JSON.stringify({ '__proto__': { polluted: true } });
    const { ctx } = makeCtx({ apiKeysJson: json });
    expect(() => updateSystemVariables(ctx)).not.toThrow();
    // Check Object.prototype is clean
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('$ai_config.lastUpdated is a recent timestamp', () => {
    const { ctx, writes } = makeCtx();
    const before = Date.now();
    updateSystemVariables(ctx);
    const after = Date.now();
    const cfg = writes.$ai_config as { lastUpdated: number };
    expect(cfg.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(cfg.lastUpdated).toBeLessThanOrEqual(after);
  });
});

describe('updateSystemVariables — idempotence', () => {
  it('second call only rewrites time vars, not mock defaults (when $user already present)', () => {
    const writes1: Record<string, unknown> = {};
    const writes2: Record<string, unknown> = {};
    const firstCallVars: Record<string, unknown> = {};

    // First tick: populate defaults
    const ctx1: SystemVariablesContext = {
      setVariable: (name, value) => {
        writes1[name] = value;
        firstCallVars[name] = value;
      },
      getVariable: () => undefined, // nothing exists yet
      brittneyApiKeysJson: null,
    };
    updateSystemVariables(ctx1);

    // Second tick: mock-defaults exist from first tick's writes; should NOT re-write them
    const ctx2: SystemVariablesContext = {
      setVariable: (name, value) => { writes2[name] = value; },
      getVariable: (name) => firstCallVars[name],
      brittneyApiKeysJson: null,
    };
    updateSystemVariables(ctx2);

    // Time vars re-written both ticks
    expect(writes2.$time).toBeDefined();
    expect(writes2.$timestamp).toBeDefined();
    // Mock defaults written only on tick 1
    expect(writes2.$user).toBeUndefined();
    expect(writes2.$location).toBeUndefined();
    expect(writes2.$weather).toBeUndefined();
    expect(writes2.$wallet).toBeUndefined();
    expect(writes2.$chat_status).toBeUndefined();
  });
});
