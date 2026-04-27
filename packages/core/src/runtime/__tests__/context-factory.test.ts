import { describe, it, expect } from 'vitest';
import { createEmptyContext } from '../context-factory.js';

describe('createEmptyContext', () => {
  it('returns an object', () => {
    const ctx = createEmptyContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx).toBe('object');
  });

  it('initializes variables as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.variables).toBeInstanceOf(Map);
    expect(ctx.variables.size).toBe(0);
  });

  it('initializes functions as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.functions).toBeInstanceOf(Map);
    expect(ctx.functions.size).toBe(0);
  });

  it('initializes exports as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.exports).toBeInstanceOf(Map);
    expect(ctx.exports.size).toBe(0);
  });

  it('initializes spatialMemory as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.spatialMemory).toBeInstanceOf(Map);
    expect(ctx.spatialMemory.size).toBe(0);
  });

  it('initializes hologramState as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.hologramState).toBeInstanceOf(Map);
    expect(ctx.hologramState.size).toBe(0);
  });

  it('initializes templates as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.templates).toBeInstanceOf(Map);
    expect(ctx.templates.size).toBe(0);
  });

  it('initializes stateMachines as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.stateMachines).toBeInstanceOf(Map);
    expect(ctx.stateMachines.size).toBe(0);
  });

  it('initializes quests as empty Map', () => {
    const ctx = createEmptyContext();
    expect(ctx.quests).toBeInstanceOf(Map);
    expect(ctx.quests.size).toBe(0);
  });

  it('initializes connections as empty array', () => {
    const ctx = createEmptyContext();
    expect(Array.isArray(ctx.connections)).toBe(true);
    expect(ctx.connections.length).toBe(0);
  });

  it('initializes executionStack as empty array', () => {
    const ctx = createEmptyContext();
    expect(Array.isArray(ctx.executionStack)).toBe(true);
    expect(ctx.executionStack.length).toBe(0);
  });

  it('initializes focusHistory as empty array', () => {
    const ctx = createEmptyContext();
    expect(Array.isArray(ctx.focusHistory)).toBe(true);
    expect(ctx.focusHistory.length).toBe(0);
  });

  it('initializes completedQuests as a Set', () => {
    const ctx = createEmptyContext();
    expect(ctx.completedQuests).toBeInstanceOf(Set);
    expect(ctx.completedQuests.size).toBe(0);
  });

  it('initializes currentScale to 1', () => {
    const ctx = createEmptyContext();
    expect(ctx.currentScale).toBe(1);
  });

  it('initializes scaleMagnitude to "standard"', () => {
    const ctx = createEmptyContext();
    expect(ctx.scaleMagnitude).toBe('standard');
  });

  it('initializes environment as empty object', () => {
    const ctx = createEmptyContext();
    expect(ctx.environment).toBeDefined();
    expect(typeof ctx.environment).toBe('object');
    expect(Object.keys(ctx.environment)).toHaveLength(0);
  });

  it('creates independent contexts per call', () => {
    const a = createEmptyContext();
    const b = createEmptyContext();
    a.variables.set('x', 1);
    expect(b.variables.size).toBe(0);
  });
});
