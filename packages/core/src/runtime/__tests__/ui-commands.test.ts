import { describe, it, expect, vi } from 'vitest';
import {
  executeShowCommand,
  executeHideCommand,
  executeCreateCommand,
} from '../ui-commands.js';
import type { UICommandContext } from '../ui-commands.js';

function makeCtx(): UICommandContext {
  return {
    spatialMemory: new Map(),
    animations: new Map(),
    createParticleEffect: vi.fn(),
    createConnectionStream: vi.fn(),
  };
}

describe('executeShowCommand', () => {
  it('stores position in spatialMemory', async () => {
    const ctx = makeCtx();
    const node = { type: 'ShowNode', position: [1, 2, 3] as [number, number, number] };
    await executeShowCommand('myObj', node, ctx);
    expect(ctx.spatialMemory.has('myObj')).toBe(true);
  });

  it('calls createParticleEffect', async () => {
    const ctx = makeCtx();
    await executeShowCommand('myObj', { type: 'ShowNode' }, ctx);
    expect(ctx.createParticleEffect).toHaveBeenCalled();
  });

  it('returns showed target', async () => {
    const ctx = makeCtx();
    const result = await executeShowCommand('foo', { type: 'ShowNode' }, ctx);
    expect(result.showed).toBe('foo');
  });

  it('uses default position [0,0,0] when not provided', async () => {
    const ctx = makeCtx();
    await executeShowCommand('bar', { type: 'ShowNode' }, ctx);
    expect(ctx.spatialMemory.get('bar')).toEqual([0, 0, 0]);
  });
});

describe('executeHideCommand', () => {
  it('calls createParticleEffect', async () => {
    const ctx = makeCtx();
    const result = await executeHideCommand('myObj', { type: 'HideNode' }, ctx);
    expect(ctx.createParticleEffect).toHaveBeenCalled();
    expect(result.hidden).toBe('myObj');
  });

  it('uses stored position from spatialMemory', async () => {
    const ctx = makeCtx();
    ctx.spatialMemory.set('stored', [5, 6, 7]);
    await executeHideCommand('stored', { type: 'HideNode' }, ctx);
    expect(ctx.createParticleEffect).toHaveBeenCalledWith(
      expect.any(String),
      [5, 6, 7],
      expect.any(String),
      expect.any(Number),
    );
  });
});

describe('executeCreateCommand', () => {
  it('returns error when fewer than 2 tokens', async () => {
    const ctx = makeCtx();
    const result = await executeCreateCommand(['cube'], { type: 'CreateNode' }, ctx);
    expect(result.error).toBeTruthy();
  });

  it('creates object with shape and name', async () => {
    const ctx = makeCtx();
    const result = await executeCreateCommand(['sphere', 'ball'], { type: 'CreateNode' }, ctx);
    expect(result.created).toBe('ball');
    expect(result.shape).toBe('sphere');
  });

  it('stores position in spatialMemory', async () => {
    const ctx = makeCtx();
    const node = { type: 'CreateNode', position: [3, 4, 5] as [number, number, number] };
    await executeCreateCommand(['cube', 'box'], node, ctx);
    expect(ctx.spatialMemory.has('box')).toBe(true);
  });

  it('calls createParticleEffect', async () => {
    const ctx = makeCtx();
    await executeCreateCommand(['cylinder', 'pipe'], { type: 'CreateNode' }, ctx);
    expect(ctx.createParticleEffect).toHaveBeenCalled();
  });
});
