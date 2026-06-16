import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type { HoloBrainDecl } from './HoloScriptPlusParser';

describe('HoloScriptPlusParser — @safe_daemon desugar', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('expands @safe_daemon into the five safety traits at composition level', () => {
    const result = parser.parse(`
      composition "Daemon" {
        @safe_daemon {}
      }
    `);
    expect(result.success).toBe(true);
    const traits = (result.ast.root as unknown as { traits: Map<string, unknown> }).traits;
    expect(traits.has('safe_daemon')).toBe(false); // desugared away
    for (const t of ['rate_limiter', 'circuit_breaker', 'timeout_guard', 'economy', 'structured_logger']) {
      expect(traits.has(t)).toBe(true);
    }
    // Default economy balance
    expect((traits.get('economy') as Record<string, unknown>).initial_balance).toBe(5);
  });

  it('applies flat convenience overrides', () => {
    const result = parser.parse(`
      composition "Daemon" {
        @safe_daemon { budget: 25, rate: 8, timeout_ms: 90000 }
      }
    `);
    const traits = (result.ast.root as unknown as { traits: Map<string, unknown> }).traits;
    expect((traits.get('economy') as Record<string, unknown>).initial_balance).toBe(25);
    expect((traits.get('rate_limiter') as Record<string, unknown>).refill_rate).toBe(8);
    expect((traits.get('timeout_guard') as Record<string, unknown>).default_timeout_ms).toBe(90000);
  });

  it('applies nested per-trait overrides', () => {
    const result = parser.parse(`
      composition "Daemon" {
        @safe_daemon { economy: { escrow_enabled: true }, circuit_breaker: { failure_threshold: 12 } }
      }
    `);
    const traits = (result.ast.root as unknown as { traits: Map<string, unknown> }).traits;
    expect((traits.get('economy') as Record<string, unknown>).escrow_enabled).toBe(true);
    expect((traits.get('circuit_breaker') as Record<string, unknown>).failure_threshold).toBe(12);
  });

  it('does not overwrite an explicitly-declared safety trait', () => {
    const result = parser.parse(`
      composition "Daemon" {
        @rate_limiter { max_tokens: 999 }
        @safe_daemon {}
      }
    `);
    const traits = (result.ast.root as unknown as { traits: Map<string, unknown> }).traits;
    // Explicit @rate_limiter wins over the desugared default.
    expect((traits.get('rate_limiter') as Record<string, unknown>).max_tokens).toBe(999);
  });
});

describe('HoloScriptPlusParser — declarative @goal / @escalation / @provider_policy', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  function parseBrain(src: string): HoloBrainDecl {
    const result = parser.parse(src);
    expect(result.success).toBe(true);
    return result.ast.root as unknown as HoloBrainDecl;
  }

  it('accumulates @goal blocks into brain.goals (feeds GoalOrientedTrait)', () => {
    const brain = parseBrain(`
      brain Planner {
        @goal { name: "reach_dock", desiredState: { at_dock: true }, priority: 5 }
        @goal { name: "refuel", priority: 2 }
        state idle {}
      }
    `);
    expect(brain.goals).toHaveLength(2);
    expect(brain.goals![0]).toMatchObject({ name: 'reach_dock', priority: 5 });
    expect(brain.goals![0].desiredState).toEqual({ at_dock: true });
    expect(brain.goals![1]).toMatchObject({ name: 'refuel', priority: 2 });
  });

  it('accumulates @escalation blocks into brain.escalations', () => {
    const brain = parseBrain(`
      brain Watcher {
        @escalation { on: "action_count > 5", action: "pause" }
        @escalation { on: "uncertainty", action: "notify" }
        state idle {}
      }
    `);
    expect(brain.escalations).toHaveLength(2);
    expect(brain.escalations![0]).toEqual({ on: 'action_count > 5', action: 'pause' });
    expect(brain.escalations![1].action).toBe('notify');
  });

  it('parses @provider_policy into brain.providerPolicy', () => {
    const brain = parseBrain(`
      brain Sovereign {
        @provider_policy { prefer: "sovereign", fallback: "anthropic", requires: "vision" }
        state idle {}
      }
    `);
    expect(brain.providerPolicy).toEqual({ prefer: 'sovereign', fallback: 'anthropic', requires: 'vision' });
  });
});

describe('HoloScriptPlusParser — cognitive verb typo signal', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('warns on a near-miss cognitive verb followed by a config block', () => {
    const result = parser.parse(`
      brain Typo {
        state thinking {
          recal { query: "x" }
        }
      }
    `);
    expect(result.success).toBe(true); // warning-only, never a hard error
    expect(result.warnings.some((w) => String((w as { message?: string }).message ?? '').includes('recall'))).toBe(
      true
    );
  });

  it('does NOT warn on a legitimate free-form action that is not verb-like', () => {
    const result = parser.parse(`
      brain Clean {
        state idle {
          patrol the perimeter
        }
      }
    `);
    expect(result.warnings.some((w) => String((w as { message?: string }).message ?? '').includes('did you mean'))).toBe(
      false
    );
  });
});
