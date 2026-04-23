/**
 * Unit tests for ui-commands — AUDIT-mode coverage
 *
 * Slice 18. Seven imperative UI commands dispatched by the generic
 * voice-command executor. Tests verify spatial memory updates,
 * animation registration, particle-callback invocation.
 *
 * **See**: packages/core/src/runtime/ui-commands.ts (slice 18)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeShowCommand,
  executeHideCommand,
  executeCreateCommand,
  executeAnimateCommand,
  executePulseCommand,
  executeMoveCommand,
  executeDeleteCommand,
  type UICommandContext,
} from './ui-commands';
import type { ASTNode, Animation, SpatialPosition } from '../types';

function makeCtx(): {
  ctx: UICommandContext;
  spatialMemory: Map<string, SpatialPosition>;
  animations: Map<string, Animation>;
  createParticleEffect: ReturnType<typeof vi.fn>;
  createConnectionStream: ReturnType<typeof vi.fn>;
} {
  const spatialMemory = new Map<string, SpatialPosition>();
  const animations = new Map<string, Animation>();
  const createParticleEffect = vi.fn();
  const createConnectionStream = vi.fn();
  const ctx: UICommandContext = {
    spatialMemory,
    animations,
    createParticleEffect,
    createConnectionStream,
  };
  return { ctx, spatialMemory, animations, createParticleEffect, createConnectionStream };
}

describe('executeShowCommand', () => {
  it('sets spatial memory + calls createParticleEffect', async () => {
    const { ctx, spatialMemory, createParticleEffect } = makeCtx();
    const node: ASTNode & { position?: SpatialPosition } = {
      type: 'voice',
      position: [1, 2, 3],
    };
    const result = await executeShowCommand('orb', node, ctx);
    expect(spatialMemory.get('orb')).toEqual([1, 2, 3]);
    expect(createParticleEffect).toHaveBeenCalledWith('orb_show', [1, 2, 3], '#00ffff', 15);
    expect(result.showed).toBe('orb');
  });

  it('uses [0,0,0] when node.position absent', async () => {
    const { ctx, spatialMemory } = makeCtx();
    await executeShowCommand('target', { type: 'voice' } as ASTNode, ctx);
    expect(spatialMemory.get('target')).toEqual([0, 0, 0]);
  });

  it('uses node.hologram.color when provided', async () => {
    const { ctx, createParticleEffect } = makeCtx();
    const node = { type: 'voice', hologram: { color: '#ff0000' } } as ASTNode & { hologram?: { color: string } };
    await executeShowCommand('orb', node as never, ctx);
    // Custom hologram color passed to particle effect
    expect(createParticleEffect.mock.calls[0][2]).toBe('#ff0000');
  });
});

describe('executeHideCommand', () => {
  it('uses spatialMemory lookup for position', async () => {
    const { ctx, spatialMemory, createParticleEffect } = makeCtx();
    spatialMemory.set('orb', [5, 5, 5]);
    await executeHideCommand('orb', { type: 'voice' } as ASTNode, ctx);
    expect(createParticleEffect).toHaveBeenCalledWith('orb_hide', [5, 5, 5], '#ff0000', 10);
  });

  it('falls back to [0,0,0] when target has no spatial entry', async () => {
    const { ctx, createParticleEffect } = makeCtx();
    await executeHideCommand('ghost', { type: 'voice' } as ASTNode, ctx);
    expect(createParticleEffect).toHaveBeenCalledWith('ghost_hide', [0, 0, 0], '#ff0000', 10);
  });
});

describe('executeCreateCommand', () => {
  it('requires at least 2 tokens — returns error envelope otherwise', async () => {
    const { ctx } = makeCtx();
    const result = await executeCreateCommand(['only-one'], { type: 'voice' } as ASTNode, ctx);
    expect(result.error).toBe('Create command requires shape and name');
  });

  it('writes spatial memory + creates particle effect with 20 particles', async () => {
    const { ctx, spatialMemory, createParticleEffect } = makeCtx();
    const node = { type: 'voice', position: [0, 0, 0] } as ASTNode & { position: SpatialPosition };
    const result = await executeCreateCommand(['sphere', 'my_sphere'], node, ctx);
    expect(spatialMemory.get('my_sphere')).toEqual([0, 0, 0]);
    expect(createParticleEffect.mock.calls[0]).toEqual([
      'my_sphere_create', [0, 0, 0], '#00ffff', 20,
    ]);
    expect(result.created).toBe('my_sphere');
    expect(result.shape).toBe('sphere');
  });

  it('defaults size to 1 and interactive to true', async () => {
    const { ctx } = makeCtx();
    const result = await executeCreateCommand(
      ['cube', 'box'],
      { type: 'voice' } as ASTNode,
      ctx,
    );
    const hologram = result.hologram as Record<string, unknown>;
    expect(hologram.size).toBe(1);
    expect(hologram.interactive).toBe(true);
  });

  it('explicit interactive:false propagates', async () => {
    const { ctx } = makeCtx();
    const node = { type: 'voice', hologram: { interactive: false } } as ASTNode & { hologram: { interactive: boolean } };
    const result = await executeCreateCommand(['cube', 'c'], node as never, ctx);
    const hologram = result.hologram as Record<string, unknown>;
    expect(hologram.interactive).toBe(false);
  });
});

describe('executeAnimateCommand', () => {
  it('registers Animation in the map under "<target>_<property>"', async () => {
    const { ctx, animations } = makeCtx();
    await executeAnimateCommand('obj', ['scale', '500'], { type: 'voice' } as ASTNode, ctx);
    expect(animations.has('obj_scale')).toBe(true);
    const anim = animations.get('obj_scale')!;
    expect(anim.target).toBe('obj');
    expect(anim.property).toBe('scale');
    expect(anim.duration).toBe(500);
  });

  it('default property is "position[1]", default duration 1000', async () => {
    const { ctx, animations } = makeCtx();
    await executeAnimateCommand('t', [], { type: 'voice' } as ASTNode, ctx);
    const anim = animations.get('t_position[1]')!;
    expect(anim.property).toBe('position[1]');
    expect(anim.duration).toBe(1000);
  });

  it('from=0, to=1 defaults', async () => {
    const { ctx, animations } = makeCtx();
    await executeAnimateCommand('t', [], { type: 'voice' } as ASTNode, ctx);
    const anim = animations.get('t_position[1]')!;
    expect(anim.from).toBe(0);
    expect(anim.to).toBe(1);
  });

  it('easing defaults to "ease-in-out"', async () => {
    const { ctx, animations } = makeCtx();
    await executeAnimateCommand('t', [], { type: 'voice' } as ASTNode, ctx);
    expect(animations.get('t_position[1]')!.easing).toBe('ease-in-out');
  });
});

describe('executePulseCommand', () => {
  it('creates scale animation with yoyo+loop enabled', async () => {
    const { ctx, animations } = makeCtx();
    await executePulseCommand('obj', ['1000'], { type: 'voice' } as ASTNode, ctx);
    const anim = animations.get('obj_pulse')!;
    expect(anim.yoyo).toBe(true);
    expect(anim.loop).toBe(true);
    expect(anim.property).toBe('scale');
    expect(anim.from).toBe(1);
    expect(anim.to).toBe(1.5);
    expect(anim.duration).toBe(1000);
  });

  it('default duration is 500', async () => {
    const { ctx, animations } = makeCtx();
    await executePulseCommand('obj', [], { type: 'voice' } as ASTNode, ctx);
    expect(animations.get('obj_pulse')!.duration).toBe(500);
  });

  it('emits pulse particle effect with 30 particles', async () => {
    const { ctx, createParticleEffect } = makeCtx();
    await executePulseCommand('obj', [], { type: 'voice' } as ASTNode, ctx);
    expect(createParticleEffect).toHaveBeenCalledWith('obj_pulse', [0, 0, 0], '#ffff00', 30);
  });
});

describe('executeMoveCommand', () => {
  it('writes new position + creates connection-stream when target had prior position', async () => {
    const { ctx, spatialMemory, createConnectionStream } = makeCtx();
    spatialMemory.set('obj', [0, 0, 0]);
    await executeMoveCommand('obj', ['5', '10', '15'], { type: 'voice' } as ASTNode, ctx);
    expect(spatialMemory.get('obj')).toEqual([5, 10, 15]);
    expect(createConnectionStream).toHaveBeenCalledWith(
      'obj', 'obj_move', [0, 0, 0], [5, 10, 15], 'movement',
    );
  });

  it('writes new position without trail when target is new', async () => {
    const { ctx, spatialMemory, createConnectionStream } = makeCtx();
    await executeMoveCommand('new', ['1', '2', '3'], { type: 'voice' } as ASTNode, ctx);
    expect(spatialMemory.get('new')).toEqual([1, 2, 3]);
    expect(createConnectionStream).not.toHaveBeenCalled();
  });

  it('missing tokens default to 0', async () => {
    const { ctx, spatialMemory } = makeCtx();
    await executeMoveCommand('t', [], { type: 'voice' } as ASTNode, ctx);
    expect(spatialMemory.get('t')).toEqual([0, 0, 0]);
  });
});

describe('executeDeleteCommand', () => {
  it('removes spatial memory + emits red particle effect', async () => {
    const { ctx, spatialMemory, createParticleEffect } = makeCtx();
    spatialMemory.set('orb', [1, 2, 3]);
    await executeDeleteCommand('orb', { type: 'voice' } as ASTNode, ctx);
    expect(spatialMemory.has('orb')).toBe(false);
    expect(createParticleEffect).toHaveBeenCalledWith('orb_delete', [1, 2, 3], '#ff0000', 15);
  });

  it('no-op when target does not exist in spatial memory', async () => {
    const { ctx, createParticleEffect } = makeCtx();
    await executeDeleteCommand('ghost', { type: 'voice' } as ASTNode, ctx);
    expect(createParticleEffect).not.toHaveBeenCalled();
  });

  it('returns deleted envelope even for no-op case', async () => {
    const { ctx } = makeCtx();
    const result = await executeDeleteCommand('ghost', { type: 'voice' } as ASTNode, ctx);
    expect(result.deleted).toBe('ghost');
  });
});
