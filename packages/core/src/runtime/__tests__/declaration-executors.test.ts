import { describe, it, expect, vi } from 'vitest';
import {
  executeStateDeclaration,
  executeMemoryDefinition,
} from '../declaration-executors.js';
import type { DeclarationContext } from '../declaration-executors.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeCtx(): DeclarationContext {
  return {
    updateState: vi.fn(),
    evaluateExpression: vi.fn((expr: string) => `evaluated:${expr}`),
  };
}

describe('executeStateDeclaration', () => {
  it('calls updateState with state directive body', async () => {
    const ctx = makeCtx();
    const body = { hp: 100, mana: 50 };
    const node = {
      type: 'state_declaration',
      directives: [{ type: 'state', body }],
    };
    const result = await executeStateDeclaration(node, ctx);
    expect(ctx.updateState).toHaveBeenCalledWith(body);
    expect(result.success).toBe(true);
  });

  it('ignores directives that are not state', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'state_declaration',
      directives: [{ type: 'other', body: {} }],
    };
    const result = await executeStateDeclaration(node, ctx);
    expect(ctx.updateState).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('handles missing directives gracefully', async () => {
    const ctx = makeCtx();
    const node = { type: 'state_declaration' };
    const result = await executeStateDeclaration(node, ctx);
    expect(result.success).toBe(true);
    expect(ctx.updateState).not.toHaveBeenCalled();
  });

  it('returns output "State updated"', async () => {
    const ctx = makeCtx();
    const result = await executeStateDeclaration({ type: 'state_declaration' }, ctx);
    expect(result.output).toBe('State updated');
  });
});

describe('executeMemoryDefinition', () => {
  it('evaluates string properties', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'semantic',
      properties: { name: 'player', level: 5 },
    };
    const result = await executeMemoryDefinition(node, ctx);
    expect(result.success).toBe(true);
    const output = result.output as { type: string; config: Record<string, unknown> };
    expect(output.type).toBe('semantic');
    expect(output.config['name']).toBe('evaluated:player');
  });

  it('passes through non-string values unchanged', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'episodic',
      properties: { count: 42, active: true, data: [1, 2, 3] },
    };
    const result = await executeMemoryDefinition(node, ctx);
    const output = result.output as { type: string; config: Record<string, unknown> };
    expect(output.config['count']).toBe(42);
    expect(output.config['active']).toBe(true);
    expect(output.config['data']).toEqual([1, 2, 3]);
  });

  it('handles empty properties', async () => {
    const ctx = makeCtx();
    const node = { type: 'procedural', properties: {} };
    const result = await executeMemoryDefinition(node, ctx);
    expect(result.success).toBe(true);
    const output = result.output as { type: string; config: Record<string, unknown> };
    expect(output.type).toBe('procedural');
    expect(Object.keys(output.config)).toHaveLength(0);
  });

  it('handles missing properties', async () => {
    const ctx = makeCtx();
    const node = { type: 'semantic' };
    const result = await executeMemoryDefinition(node, ctx);
    expect(result.success).toBe(true);
  });

  it('includes executionTime', async () => {
    const ctx = makeCtx();
    const result = await executeMemoryDefinition({ type: 'semantic', properties: {} }, ctx);
    expect(typeof result.executionTime).toBe('number');
  });
});
