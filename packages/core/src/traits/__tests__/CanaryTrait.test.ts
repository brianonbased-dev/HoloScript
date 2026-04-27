import { describe, it, expect, beforeEach } from 'vitest';
import { canaryHandler } from '../CanaryTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext(): TraitContext & { emitted: Array<{ type: string; payload: unknown }> } {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  return {
    emitted,
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  } as unknown as TraitContext & { emitted: Array<{ type: string; payload: unknown }> };
}

const defaultConfig = canaryHandler.defaultConfig!;

describe('CanaryTrait', () => {
  describe('handler metadata', () => {
    it('has name "canary"', () => {
      expect(canaryHandler.name).toBe('canary');
    });

    it('has default config with initial_percentage 5 and increment 10', () => {
      expect(canaryHandler.defaultConfig).toEqual({ initial_percentage: 5, increment: 10 });
    });
  });

  describe('onAttach', () => {
    it('initialises __canaryState with inactive empty state', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      const state = node.__canaryState as {
        active: boolean;
        version: string;
        percentage: number;
        started: number;
      };
      expect(state.active).toBe(false);
      expect(state.version).toBe('');
      expect(state.percentage).toBe(0);
      expect(typeof state.started).toBe('number');
    });

    it('does not emit on attach', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      expect(ctx.emitted).toHaveLength(0);
    });
  });

  describe('onDetach', () => {
    it('removes __canaryState from node', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onDetach!(node, defaultConfig, ctx);
      expect(node.__canaryState).toBeUndefined();
    });
  });

  describe('onUpdate', () => {
    it('is a no-op (no-op method)', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      expect(() => canaryHandler.onUpdate!(node, defaultConfig, ctx, 0.016)).not.toThrow();
      expect(ctx.emitted).toHaveLength(0);
    });
  });

  describe('onEvent — canary:start', () => {
    it('marks canary active and stores version and percentage', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      const event: TraitEvent = { type: 'canary:start', version: 'v2.0', percentage: 10 };
      canaryHandler.onEvent!(node, defaultConfig, ctx, event);
      const state = node.__canaryState as { active: boolean; version: string; percentage: number };
      expect(state.active).toBe(true);
      expect(state.version).toBe('v2.0');
      expect(state.percentage).toBe(10);
    });

    it('uses initial_percentage from config when no percentage provided', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      const event: TraitEvent = { type: 'canary:start', version: 'v2.0' };
      canaryHandler.onEvent!(node, defaultConfig, ctx, event);
      const state = node.__canaryState as { percentage: number };
      expect(state.percentage).toBe(defaultConfig.initial_percentage);
    });

    it('emits canary:status with current state after start', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 15,
      });
      const emission = ctx.emitted.find((e) => e.type === 'canary:status');
      expect(emission).toBeDefined();
      expect((emission!.payload as Record<string, unknown>).version).toBe('v2');
      expect((emission!.payload as Record<string, unknown>).percentage).toBe(15);
      expect((emission!.payload as Record<string, unknown>).active).toBe(true);
    });

    it('sets started to a positive timestamp', () => {
      const node = makeNode();
      const ctx = makeContext();
      const before = Date.now();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v3',
        percentage: 5,
      });
      const after = Date.now();
      const state = node.__canaryState as { started: number };
      expect(state.started).toBeGreaterThanOrEqual(before);
      expect(state.started).toBeLessThanOrEqual(after);
    });
  });

  describe('onEvent — canary:adjust', () => {
    it('updates percentage when canary is active', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 10,
      });
      ctx.emitted.length = 0;
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:adjust', percentage: 30 });
      const state = node.__canaryState as { percentage: number };
      expect(state.percentage).toBe(30);
    });

    it('increments by config.increment when no percentage provided', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 20,
      });
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:adjust' });
      const state = node.__canaryState as { percentage: number };
      expect(state.percentage).toBe(30); // 20 + 10
    });

    it('caps percentage at 100', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 95,
      });
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:adjust', percentage: 150 });
      const state = node.__canaryState as { percentage: number };
      expect(state.percentage).toBe(100);
    });

    it('does nothing when canary is inactive', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:adjust', percentage: 50 });
      const state = node.__canaryState as { percentage: number };
      expect(state.percentage).toBe(0);
    });

    it('emits canary:status after adjust', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 10,
      });
      ctx.emitted.length = 0;
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:adjust', percentage: 25 });
      expect(ctx.emitted.some((e) => e.type === 'canary:status')).toBe(true);
    });
  });

  describe('onEvent — canary:promote', () => {
    it('sets percentage to 100 and marks inactive', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 50,
      });
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:promote' });
      const state = node.__canaryState as { active: boolean; percentage: number };
      expect(state.percentage).toBe(100);
      expect(state.active).toBe(false);
    });

    it('emits canary:status with promoted flag', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 50,
      });
      ctx.emitted.length = 0;
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:promote' });
      const emission = ctx.emitted.find((e) => e.type === 'canary:status');
      expect(emission).toBeDefined();
      expect((emission!.payload as Record<string, unknown>).promoted).toBe(true);
    });
  });

  describe('onEvent — canary:abort', () => {
    it('marks inactive and resets percentage to 0', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 40,
      });
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:abort' });
      const state = node.__canaryState as { active: boolean; percentage: number };
      expect(state.active).toBe(false);
      expect(state.percentage).toBe(0);
    });

    it('emits canary:status with aborted flag', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v2',
        percentage: 20,
      });
      ctx.emitted.length = 0;
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:abort' });
      const emission = ctx.emitted.find((e) => e.type === 'canary:status');
      expect(emission).toBeDefined();
      expect((emission!.payload as Record<string, unknown>).aborted).toBe(true);
    });
  });

  describe('onEvent — canary:get_status', () => {
    it('emits current state without modifying it', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'canary:start',
        version: 'v1',
        percentage: 12,
      });
      ctx.emitted.length = 0;
      canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:get_status' });
      const emission = ctx.emitted.find((e) => e.type === 'canary:status');
      expect(emission).toBeDefined();
      expect((emission!.payload as Record<string, unknown>).percentage).toBe(12);
      expect((emission!.payload as Record<string, unknown>).version).toBe('v1');
    });
  });

  describe('edge cases', () => {
    it('ignores events when __canaryState is missing', () => {
      const node = makeNode();
      const ctx = makeContext();
      // no onAttach
      expect(() =>
        canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'canary:start', version: 'v1' })
      ).not.toThrow();
      expect(ctx.emitted).toHaveLength(0);
    });

    it('ignores unknown event types', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      expect(() =>
        canaryHandler.onEvent!(node, defaultConfig, ctx, { type: 'unknown:event' })
      ).not.toThrow();
      expect(ctx.emitted).toHaveLength(0);
    });

    it('handles string event type', () => {
      const node = makeNode();
      const ctx = makeContext();
      canaryHandler.onAttach!(node, defaultConfig, ctx);
      canaryHandler.onEvent!(node, defaultConfig, ctx, 'canary:get_status' as unknown as TraitEvent);
      expect(ctx.emitted).toHaveLength(1);
      expect(ctx.emitted[0].type).toBe('canary:status');
    });
  });
});
