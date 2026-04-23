/**
 * Unit tests for context-factory — AUDIT-mode coverage
 *
 * Slice 10 pure factory. Called on runtime construction + reset.
 * Regression here would cause state leaks between contexts.
 *
 * **See**: packages/core/src/runtime/context-factory.ts (slice 10)
 */

import { describe, it, expect } from 'vitest';
import { createEmptyContext } from './context-factory';

describe('createEmptyContext — shape', () => {
  it('returns a RuntimeContext with all expected fields', () => {
    const ctx = createEmptyContext();
    expect(ctx).toHaveProperty('variables');
    expect(ctx).toHaveProperty('functions');
    expect(ctx).toHaveProperty('exports');
    expect(ctx).toHaveProperty('connections');
    expect(ctx).toHaveProperty('spatialMemory');
    expect(ctx).toHaveProperty('hologramState');
    expect(ctx).toHaveProperty('executionStack');
    expect(ctx).toHaveProperty('currentScale');
    expect(ctx).toHaveProperty('scaleMagnitude');
    expect(ctx).toHaveProperty('focusHistory');
    expect(ctx).toHaveProperty('environment');
    expect(ctx).toHaveProperty('templates');
    expect(ctx).toHaveProperty('state');
    expect(ctx).toHaveProperty('stateMachines');
    expect(ctx).toHaveProperty('quests');
    expect(ctx).toHaveProperty('completedQuests');
  });

  it('Maps are empty', () => {
    const ctx = createEmptyContext();
    expect(ctx.variables.size).toBe(0);
    expect(ctx.functions.size).toBe(0);
    expect(ctx.exports.size).toBe(0);
    expect(ctx.spatialMemory.size).toBe(0);
    expect(ctx.hologramState.size).toBe(0);
    expect(ctx.templates.size).toBe(0);
    expect(ctx.stateMachines.size).toBe(0);
    expect(ctx.quests.size).toBe(0);
  });

  it('arrays are empty', () => {
    const ctx = createEmptyContext();
    expect(ctx.connections).toEqual([]);
    expect(ctx.executionStack).toEqual([]);
    expect(ctx.focusHistory).toEqual([]);
  });

  it('completedQuests is an empty Set', () => {
    const ctx = createEmptyContext();
    expect(ctx.completedQuests).toBeInstanceOf(Set);
    expect(ctx.completedQuests.size).toBe(0);
  });

  it('scale defaults: currentScale=1, scaleMagnitude="standard"', () => {
    const ctx = createEmptyContext();
    expect(ctx.currentScale).toBe(1);
    expect(ctx.scaleMagnitude).toBe('standard');
  });

  it('environment starts empty', () => {
    const ctx = createEmptyContext();
    expect(ctx.environment).toEqual({});
  });
});

describe('createEmptyContext — isolation', () => {
  it('two calls produce independent Maps (no shared reference)', () => {
    const a = createEmptyContext();
    const b = createEmptyContext();

    expect(a.variables).not.toBe(b.variables);
    expect(a.templates).not.toBe(b.templates);
    expect(a.spatialMemory).not.toBe(b.spatialMemory);
    expect(a.connections).not.toBe(b.connections);
    expect(a.completedQuests).not.toBe(b.completedQuests);
  });

  it('mutating one context does not affect another', () => {
    const a = createEmptyContext();
    const b = createEmptyContext();

    a.variables.set('foo', 'bar');
    a.connections.push({} as never);
    a.focusHistory.push('target');
    a.completedQuests.add('quest1');
    a.currentScale = 10;

    expect(b.variables.size).toBe(0);
    expect(b.connections).toEqual([]);
    expect(b.focusHistory).toEqual([]);
    expect(b.completedQuests.size).toBe(0);
    expect(b.currentScale).toBe(1);
  });

  it('returned object does not share state reference with prior contexts', () => {
    const a = createEmptyContext();
    const b = createEmptyContext();
    expect(a.state).not.toBe(b.state);
  });
});
