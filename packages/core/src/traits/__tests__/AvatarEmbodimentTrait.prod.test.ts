/**
 * AvatarEmbodimentTrait — Production Test Suite
 *
 * Tests defaultConfig, onAttach state init, onDetach cleanup,
 * and onEvent embody / disembody / calibrate handlers.
 */
import { describe, it, expect, vi } from 'vitest';
import { avatarEmbodimentHandler } from '../AvatarEmbodimentTrait';

function makeNode() {
  return { id: 'avatar_1' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...avatarEmbodimentHandler.defaultConfig!, ...config };
  avatarEmbodimentHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('avatarEmbodimentHandler.defaultConfig', () => {
  it('tracking_source = ai', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.tracking_source).toBe('ai');
  });
  it('ik_mode = upper_body', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.ik_mode).toBe('upper_body');
  });
  it('mirror_expressions = true', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.mirror_expressions).toBe(true);
  });
  it('lip_sync = true', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.lip_sync).toBe(true);
  });
  it('emotion_directives = true', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.emotion_directives).toBe(true);
  });
  it('eye_tracking_forward = false', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.eye_tracking_forward).toBe(false);
  });
  it('personal_space_radius = 0.5', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.personal_space_radius).toBe(0.5);
  });
  it('conversation_fillers = true', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.conversation_fillers).toBe(true);
  });
  it('auto_pipeline = true', () => {
    expect(avatarEmbodimentHandler.defaultConfig!.auto_pipeline).toBe(true);
  });
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('avatarEmbodimentHandler.onAttach', () => {
  it('initializes __avatarEmbodimentState on node', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState).toBeDefined();
  });
  it('initial isEmbodied = false', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(false);
  });
  it('initial calibrated = false', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.calibrated).toBe(false);
  });
  it('initial pipelineStage = idle', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.pipelineStage).toBe('idle');
  });
  it('initial lipSyncActive = false', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.lipSyncActive).toBe(false);
  });
  it('initial currentExpression = neutral', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.currentExpression).toBe('neutral');
  });
  it('initial currentAnimation = idle', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.currentAnimation).toBe('idle');
  });
  it('initial isSpeaking = false', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.isSpeaking).toBe(false);
  });
  it('initial isListening = false', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.isListening).toBe(false);
  });
  it('initial turnCount = 0', () => {
    const { node } = attachNode();
    expect((node as any).__avatarEmbodimentState.turnCount).toBe(0);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('avatarEmbodimentHandler.onDetach', () => {
  it('removes __avatarEmbodimentState from node', () => {
    const { node, cfg, ctx } = attachNode();
    avatarEmbodimentHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__avatarEmbodimentState).toBeUndefined();
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('avatarEmbodimentHandler.onUpdate', () => {
  it('does not throw when called (pipeline managed externally)', () => {
    const { node, cfg, ctx } = attachNode();
    expect(() => avatarEmbodimentHandler.onUpdate!(node, cfg, ctx, 0.016)).not.toThrow();
  });
  it('does not throw when no state (early return)', () => {
    const node = makeNode(); // no state attached
    const ctx = makeContext();
    expect(() =>
      avatarEmbodimentHandler.onUpdate!(node, avatarEmbodimentHandler.defaultConfig!, ctx, 0.016)
    ).not.toThrow();
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('avatarEmbodimentHandler.onEvent — embody', () => {
  it('embody event sets isEmbodied=true', () => {
    const { node, cfg, ctx } = attachNode();
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'embody' });
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(true);
  });
  it('embody event emits on_avatar_embodied', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'embody' });
    expect(ctx.emit).toHaveBeenCalledWith('on_avatar_embodied', expect.objectContaining({ node }));
  });
});

describe('avatarEmbodimentHandler.onEvent — disembody', () => {
  it('disembody event sets isEmbodied=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__avatarEmbodimentState.isEmbodied = true;
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'disembody' });
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(false);
  });
  it('disembody event emits on_avatar_disembodied', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'disembody' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_avatar_disembodied',
      expect.objectContaining({ node })
    );
  });
});

describe('avatarEmbodimentHandler.onEvent — calibrate', () => {
  it('calibrate event sets calibrated=true', () => {
    const { node, cfg, ctx } = attachNode();
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'calibrate' });
    expect((node as any).__avatarEmbodimentState.calibrated).toBe(true);
  });
  it('calibrate event emits on_avatar_calibrated', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'calibrate' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_avatar_calibrated',
      expect.objectContaining({ node })
    );
  });
});

describe('avatarEmbodimentHandler.onEvent — unknown', () => {
  it('unknown event type does not throw', () => {
    const { node, cfg, ctx } = attachNode();
    expect(() =>
      avatarEmbodimentHandler.onEvent!(node, cfg, ctx, { type: 'some_unknown_event' })
    ).not.toThrow();
  });
});
