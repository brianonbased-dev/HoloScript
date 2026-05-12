import { describe, it, expect, beforeEach } from 'vitest';
import { avatarIntentHandler } from '../AvatarIntentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
  updateTrait,
} from './traitTestHelpers';

describe('AvatarIntentTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('ai-1');
    ctx = createMockContext();
  });

  it('emits ready with mapping rules', () => {
    attachTrait(avatarIntentHandler, node, {}, ctx);
    const ev = getLastEvent(ctx, 'avatar_intent_ready');
    expect(ev.mappingRuleCount).toBeGreaterThanOrEqual(1);
    expect(ev.smoothingWindowMs).toBe(150);
  });

  it('maps grab intent from hand-tracking pinch', () => {
    attachTrait(avatarIntentHandler, node, {}, ctx);
    sendEvent(avatarIntentHandler, node, {}, ctx, {
      type: 'avatar_input_sample',
      device: 'hand_tracking_right',
      axes: {},
      buttons: { pinch: true },
    });
    updateTrait(avatarIntentHandler, node, {}, ctx, 0.1);
    const ev = getLastEvent(ctx, 'intent_mapped');
    expect(ev.intent).toBe('grab');
    expect(ev.primaryDevice).toBe('hand_tracking_right');
  });

  it('falls to idle when no rule matches (false-case)', () => {
    attachTrait(avatarIntentHandler, node, {}, ctx);
    updateTrait(avatarIntentHandler, node, {}, ctx, 0.1);
    const ev = getLastEvent(ctx, 'intent_mapped');
    expect(ev.intent).toBe('idle');
  });

  it('rest intent from controller thumbstick press', () => {
    attachTrait(avatarIntentHandler, node, {}, ctx);
    sendEvent(avatarIntentHandler, node, {}, ctx, {
      type: 'avatar_input_sample',
      device: 'controller_left',
      axes: {},
      buttons: { thumbstick_press: true },
    });
    updateTrait(avatarIntentHandler, node, {}, ctx, 0.1);
    const ev = getLastEvent(ctx, 'intent_mapped');
    expect(ev.intent).toBe('rest');
  });

  it('applies dead-zone to small axis values', () => {
    attachTrait(avatarIntentHandler, node, { dead_zone: 0.2 }, ctx);
    sendEvent(avatarIntentHandler, node, { dead_zone: 0.2 }, ctx, {
      type: 'avatar_input_sample',
      device: 'controller_left',
      axes: { x: 0.05, y: 0.1 },
      buttons: {},
    });
    updateTrait(avatarIntentHandler, node, { dead_zone: 0.2 }, ctx, 0.1);
    const ev = getLastEvent(ctx, 'intent_mapped');
    // With only low axes and no buttons, no rule matches; falls to idle.
    expect(ev.intent).toBe('idle');
  });

  it('responds to query with current state', () => {
    attachTrait(avatarIntentHandler, node, {}, ctx);
    sendEvent(avatarIntentHandler, node, {}, ctx, {
      type: 'avatar_intent_query',
      queryId: 'q1',
    });
    const state = getLastEvent(ctx, 'avatar_intent_state');
    expect(state.queryId).toBe('q1');
    expect(state.lastResolved).toBeNull();
    expect(state.sampleCount).toBe(0);
  });
});
