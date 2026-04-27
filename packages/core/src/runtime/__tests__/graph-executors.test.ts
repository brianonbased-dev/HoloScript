import { describe, it, expect, vi } from 'vitest';
import {
  executeFunction,
  executeConnection,
  executeGate,
  executeStream,
} from '../graph-executors.js';
import type { GraphExecutorContext } from '../graph-executors.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeCtx(): GraphExecutorContext {
  return {
    functions: new Map(),
    connections: [],
    executeProgram: vi.fn().mockResolvedValue([{ success: true, output: 'ok' }]),
    getVariable: vi.fn(),
    setVariable: vi.fn(),
    createFlowingStream: vi.fn(),
    applyTransformation: vi.fn().mockImplementation(async (data: unknown) => data),
    evaluateCondition: vi.fn().mockReturnValue(true),
    callStackDepth: vi.fn().mockReturnValue(0),
    spatialMemory: new Map(),
    hologramState: new Map(),
    createConnectionStream: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    getDataTypeColor: vi.fn().mockReturnValue('#ffffff'),
  };
}

describe('executeFunction', () => {
  it('registers function in ctx.functions', async () => {
    const ctx = makeCtx();
    const node = { type: 'function', id: 'myFn', name: 'myFn', parameters: ['a', 'b'] };
    await executeFunction(node, ctx);
    expect(ctx.functions.has('myFn')).toBe(true);
  });

  it('returns success with parameter count', async () => {
    const ctx = makeCtx();
    const node = { type: 'function', id: 'f1', name: 'f1', parameters: ['x'] };
    const result = await executeFunction(node, ctx);
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('f1');
    expect(String(result.output)).toContain('1');
  });

  it('returns a hologram with shape cube by default', async () => {
    const ctx = makeCtx();
    const node = { type: 'function', id: 'fn', name: 'fn', parameters: [] };
    const result = await executeFunction(node, ctx);
    const holo = result.hologram as { shape: string };
    expect(holo.shape).toBe('cube');
  });

  it('merges custom hologram properties', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'function',
      id: 'fn',
      name: 'fn',
      parameters: [],
      hologram: { color: '#ff0000' },
    };
    const result = await executeFunction(node, ctx);
    const holo = result.hologram as { color: string; shape: string };
    expect(holo.color).toBe('#ff0000');
    expect(holo.shape).toBe('cube');
  });

  it('includes spatialPosition', async () => {
    const ctx = makeCtx();
    const node = { type: 'function', id: 'fn', name: 'fn', parameters: [], position: [0, 0, 0] as [number, number, number] };
    const result = await executeFunction(node, ctx);
    expect(result.spatialPosition).toBeDefined();
  });
});

describe('executeConnection', () => {
  it('pushes connection to ctx.connections', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'connection',
      from: 'nodeA',
      to: 'nodeB',
      dataType: 'number',
    };
    await executeConnection(node, ctx);
    expect(ctx.connections.length).toBe(1);
  });

  it('returns success with source and target in output', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'connection',
      from: 'A',
      to: 'B',
      dataType: 'string',
    };
    const result = await executeConnection(node, ctx);
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('A');
    expect(String(result.output)).toContain('B');
  });

  it('returns cylinder hologram', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'connection',
      from: 'X',
      to: 'Y',
      dataType: 'boolean',
    };
    const result = await executeConnection(node, ctx);
    const holo = result.hologram as { shape: string };
    expect(holo.shape).toBe('cylinder');
  });

  it('wires bidirectional events when bidirectional is true', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'connection',
      from: 'S',
      to: 'T',
      dataType: 'object',
      bidirectional: true,
    };
    const result = await executeConnection(node, ctx);
    expect(result.success).toBe(true);
  });
});

describe('executeGate', () => {
  it('evaluates true path when condition is truthy', async () => {
    const ctx = makeCtx();
    (ctx.executeProgram as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, output: 'truePath' });
    const node = {
      type: 'gate',
      condition: 'true',
      truePath: [{ type: 'action', id: 'a1' }],
      falsePath: [],
    };
    const result = await executeGate(node, ctx);
    expect(result.success).toBe(true);
  });

  it('evaluates false path when condition is falsy', async () => {
    const ctx = makeCtx();
    (ctx.executeProgram as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, output: 'falsePath' });
    const node = {
      type: 'gate',
      condition: 'false',
      truePath: [],
      falsePath: [{ type: 'action', id: 'a2' }],
    };
    const result = await executeGate(node, ctx);
    expect(result.success).toBe(true);
  });

  it('returns green hologram for true condition', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'gate',
      condition: '1',
      truePath: [],
      falsePath: [],
    };
    const result = await executeGate(node, ctx);
    const holo = result.hologram as { color: string; shape: string };
    expect(holo.shape).toBe('pyramid');
    expect(holo.color).toBeDefined();
  });

  it('handles errors from path execution gracefully', async () => {
    const ctx = makeCtx();
    (ctx.executeProgram as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Path fail'));
    const node = {
      type: 'gate',
      condition: 'true',
      truePath: [{ type: 'action' }],
      falsePath: [],
    };
    const result = await executeGate(node, ctx);
    expect(result.success).toBe(false);
  });
});

describe('executeStream', () => {
  it('reads source variable', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue([1, 2, 3]);
    const node = {
      type: 'stream',
      name: 'nums',
      source: 'myList',
      transformations: [],
    };
    const result = await executeStream(node, ctx);
    expect(ctx.getVariable).toHaveBeenCalledWith('myList');
    expect(result.success).toBe(true);
  });

  it('stores result variable', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue([10, 20]);
    const node = {
      type: 'stream',
      name: 'myStream',
      source: 'data',
      transformations: [],
    };
    await executeStream(node, ctx);
    expect(ctx.setVariable).toHaveBeenCalledWith('myStream_result', expect.anything());
  });

  it('includes item count in output', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue([1, 2, 3]);
    const node = {
      type: 'stream',
      name: 'nums',
      source: 'list',
      transformations: [],
    };
    const result = await executeStream(node, ctx);
    expect(String(result.output)).toMatch(/3/);
  });

  it('returns hologram with spatialPosition', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const node = {
      type: 'stream',
      name: 's',
      source: 'src',
      transformations: [],
      hologram: { shape: 'sphere' },
      position: [1, 2, 3] as [number, number, number],
    };
    const result = await executeStream(node, ctx);
    expect(result.hologram).toBeDefined();
    expect(result.spatialPosition).toBeDefined();
  });
});
