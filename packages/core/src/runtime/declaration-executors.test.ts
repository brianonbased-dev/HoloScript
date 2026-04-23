/**
 * Unit tests for runtime/declaration-executors.ts (W1-T4 slice 33).
 *
 * Covers executeStateDeclaration + executeMemoryDefinition in
 * isolation from HoloScriptRuntime.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executeStateDeclaration,
  executeMemoryDefinition,
  type DeclarationContext,
} from './declaration-executors';
import type { HoloScriptValue } from '../types';

function mkCtx(overrides: Partial<DeclarationContext> = {}): DeclarationContext & {
  __updates: Array<Record<string, HoloScriptValue>>;
} {
  const updates: Array<Record<string, HoloScriptValue>> = [];
  return {
    updateState: (body) => {
      updates.push(body);
    },
    evaluateExpression: (expr) => expr as HoloScriptValue,
    ...overrides,
    __updates: updates,
  } as DeclarationContext & { __updates: typeof updates };
}

describe('runtime/declaration-executors', () => {
  describe('executeStateDeclaration', () => {
    it('forwards state directive body to updateState', async () => {
      const ctx = mkCtx();
      const res = await executeStateDeclaration(
        {
          type: 'state-declaration',
          directives: [
            { type: 'state', body: { health: 100, level: 1 } },
          ],
        } as never,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('State updated');
      expect(ctx.__updates).toHaveLength(1);
      expect(ctx.__updates[0]).toEqual({ health: 100, level: 1 });
    });

    it('finds FIRST state directive when multiple exist', async () => {
      const ctx = mkCtx();
      await executeStateDeclaration(
        {
          type: 'state-declaration',
          directives: [
            { type: 'style', body: { color: 'red' } },
            { type: 'state', body: { score: 42 } },
            { type: 'state', body: { score: 999 } }, // ignored
          ],
        } as never,
        ctx,
      );
      expect(ctx.__updates).toHaveLength(1);
      expect(ctx.__updates[0]).toEqual({ score: 42 });
    });

    it('no-ops (but still succeeds) when no state directive present', async () => {
      const ctx = mkCtx();
      const res = await executeStateDeclaration(
        {
          type: 'state-declaration',
          directives: [{ type: 'unrelated', body: { x: 1 } }],
        } as never,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('State updated');
      expect(ctx.__updates).toHaveLength(0);
    });

    it('no-ops (but still succeeds) when directives array missing entirely', async () => {
      const ctx = mkCtx();
      const res = await executeStateDeclaration(
        { type: 'state-declaration' } as never,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(ctx.__updates).toHaveLength(0);
    });
  });

  describe('executeMemoryDefinition', () => {
    it('evaluates string properties, pass-through numbers/booleans/objects', async () => {
      const evalFn = vi.fn((expr: string) => `EVAL:${expr}` as HoloScriptValue);
      const ctx = mkCtx({ evaluateExpression: evalFn });
      const res = await executeMemoryDefinition(
        {
          type: 'semantic-memory',
          properties: {
            summary: 'last 5 actions',  // string → evaluated
            maxItems: 100,              // number → pass-through
            enabled: true,              // boolean → pass-through
            tags: ['a', 'b'],           // array → pass-through
            nested: { k: 'v' },         // object → pass-through
          },
        },
        ctx,
      );
      expect(res.success).toBe(true);
      const output = res.output as unknown as {
        type: string;
        config: Record<string, unknown>;
      };
      expect(output.type).toBe('semantic-memory');
      expect(output.config).toEqual({
        summary: 'EVAL:last 5 actions',
        maxItems: 100,
        enabled: true,
        tags: ['a', 'b'],
        nested: { k: 'v' },
      });
      // Only the one string was evaluated
      expect(evalFn).toHaveBeenCalledTimes(1);
      expect(evalFn).toHaveBeenCalledWith('last 5 actions');
    });

    it('preserves node.type in output (semantic / episodic / procedural)', async () => {
      const ctx = mkCtx();
      for (const type of ['semantic-memory', 'episodic-memory', 'procedural-memory']) {
        const res = await executeMemoryDefinition(
          { type, properties: {} },
          ctx,
        );
        expect((res.output as { type: string }).type).toBe(type);
      }
    });

    it('handles empty / missing properties — returns empty config', async () => {
      const ctx = mkCtx();
      const r1 = await executeMemoryDefinition({ type: 'semantic-memory' }, ctx);
      const r2 = await executeMemoryDefinition({ type: 'semantic-memory', properties: {} }, ctx);
      expect((r1.output as { config: unknown }).config).toEqual({});
      expect((r2.output as { config: unknown }).config).toEqual({});
    });

    it('emits executionTime field (>=0)', async () => {
      const ctx = mkCtx();
      const res = await executeMemoryDefinition(
        { type: 'semantic-memory', properties: { a: 'x' } },
        ctx,
      );
      expect(res.executionTime).toBeGreaterThanOrEqual(0);
    });
  });
});
