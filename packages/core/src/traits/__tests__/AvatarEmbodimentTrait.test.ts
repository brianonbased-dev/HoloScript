import { describe, it, expect, beforeEach } from 'vitest';
import { avatarEmbodimentHandler } from '../AvatarEmbodimentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

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

  function state() {
    return (node as any).__avatarEmbodimentState;
  }

  beforeEach(() => {
    node = createMockNode('av');
    ctx = createMockContext();
    attachTrait(avatarEmbodimentHandler, node, cfg, ctx);
  });

  // ── Construction ────────────────────────────────────────────────────────────

  it('initializes idle state on attach', () => {
    expect(state().isEmbodied).toBe(false);
    expect(state().pipelineStage).toBe('idle');
    expect(state().turnCount).toBe(0);
    expect(state().calibrated).toBe(false);
    expect(state().isSpeaking).toBe(false);
    expect(state().isListening).toBe(false);
    expect(state().lipSyncActive).toBe(false);
  });

  it('initializes with neutral expression and idle animation', () => {
    expect(state().currentExpression).toBe('neutral');
    expect(state().currentAnimation).toBe('idle');
  });

  // ── embody ──────────────────────────────────────────────────────────────────

  it('embody event sets isEmbodied=true', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    expect(state().isEmbodied).toBe(true);
  });

  it('embody event emits on_avatar_embodied', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    expect(getEventCount(ctx, 'on_avatar_embodied')).toBe(1);
  });

  it('double embody emits twice', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    expect(getEventCount(ctx, 'on_avatar_embodied')).toBe(2);
  });

  // ── disembody ───────────────────────────────────────────────────────────────

  it('disembody after embody sets isEmbodied=false', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'disembody' });
    expect(state().isEmbodied).toBe(false);
  });

  it('disembody emits on_avatar_disembodied', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'disembody' });
    expect(getEventCount(ctx, 'on_avatar_disembodied')).toBe(1);
  });

  it('disembody without prior embody still emits the event', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'disembody' });
    expect(getEventCount(ctx, 'on_avatar_disembodied')).toBe(1);
    expect(state().isEmbodied).toBe(false);
  });

  // ── calibrate ───────────────────────────────────────────────────────────────

  it('calibrate sets calibrated=true', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'calibrate' });
    expect(state().calibrated).toBe(true);
  });

  it('calibrate emits on_avatar_calibrated', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'calibrate' });
    expect(getEventCount(ctx, 'on_avatar_calibrated')).toBe(1);
  });

  it('calibrate is idempotent (second call still emits)', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'calibrate' });
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'calibrate' });
    expect(getEventCount(ctx, 'on_avatar_calibrated')).toBe(2);
    expect(state().calibrated).toBe(true);
  });

  // ── unknown events ──────────────────────────────────────────────────────────

  it('unknown events do not throw', () => {
    expect(() =>
      sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'unknown_event' })
    ).not.toThrow();
  });

  it('unknown events emit nothing', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'unknown_event' });
    expect(getEventCount(ctx, 'on_avatar_embodied')).toBe(0);
    expect(getEventCount(ctx, 'on_avatar_disembodied')).toBe(0);
    expect(getEventCount(ctx, 'on_avatar_calibrated')).toBe(0);
  });

  // ── detach ──────────────────────────────────────────────────────────────────

  it('detach removes state', () => {
    avatarEmbodimentHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__avatarEmbodimentState).toBeUndefined();
  });

  it('detach while embodied still cleans up', () => {
    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    avatarEmbodimentHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__avatarEmbodimentState).toBeUndefined();
  });

  // ── multiple nodes ──────────────────────────────────────────────────────────

  it('two nodes have independent state', () => {
    const node2 = createMockNode('av2');
    const ctx2 = createMockContext();
    attachTrait(avatarEmbodimentHandler, node2, cfg, ctx2);

    sendEvent(avatarEmbodimentHandler, node, cfg, ctx, { type: 'embody' });
    expect((node as any).__avatarEmbodimentState.isEmbodied).toBe(true);
    expect((node2 as any).__avatarEmbodimentState.isEmbodied).toBe(false);
  });
});
