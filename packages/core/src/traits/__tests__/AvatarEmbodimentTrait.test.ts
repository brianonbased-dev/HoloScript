import { describe, it, expect, beforeEach } from 'vitest';
import { avatarEmbodimentHandler } from '../AvatarEmbodimentTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('AvatarEmbodimentTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    tracking_source: 'ai' as const,
    ik_mode: 'upper_body' as const,
    mirror_expressions: true,
    lip_sync: true,
    emotion_directives: true,
    eye_tracking_forward: false,
    personal_space_radius: 0.5,
    conversation_fillers: true,
    auto_pipeline: true,
  };

  beforeEach(() => {
    node = createMockNode('av');
    ctx = createMockContext();
    attachTrait(avatarEmbodimentHandler, node, cfg, ctx);
  });

  it('initializes idle state', () => {
    const s = (node as any).__avatarEmbodimentState;
    expect(s.isEmbodied).toBe(false);
    expect(s.pipelineStage).toBe('idle');
    expect(s.turnCount).toBe(0);
  });

  it('embody event activates avatar', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(true);
    expect(getEventCount(ctx, 'on_avatar_embodied')).toBe(1);
  });

  it('disembody event deactivates avatar', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'disembody' });
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(false);
    expect(getEventCount(ctx, 'on_avatar_disembodied')).toBe(1);
  });

  it('calibrate event sets calibrated', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'calibrate' });
    expect((node as any).__avatarEmbodimentState.calibrated).toBe(true);
    expect(getEventCount(ctx, 'on_avatar_calibrated')).toBe(1);
  });

  it('detach cleans up', () => {
    avatarEmbodimentHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__avatarEmbodimentState).toBeUndefined();
  });
});
