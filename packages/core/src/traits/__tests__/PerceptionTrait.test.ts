import { describe, it, expect, beforeEach } from 'vitest';
import { perceptionHandler } from '../PerceptionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('PerceptionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    sight_range: 20,
    sight_angle: 120,
    hearing_range: 15,
    memory_duration: 10000,
    detection_layers: [] as string[],
    los_check: true,
    peripheral_vision: true,
    peripheral_range: 0.5,
    peripheral_angle: 60,
    alert_radius: 5,
    scan_interval: 0.1,
    confidence_decay: 0.2,
  };

  beforeEach(() => {
    node = createMockNode('guard');
    (node as any).position = { x: 0, y: 0, z: 0 };
    (node as any).rotation = { x: 0, y: 0, z: 0 };
    ctx = createMockContext();
    attachTrait(perceptionHandler, node, cfg, ctx);
  });

  it('initializes with empty perception', () => {
    const s = (node as any).__perceptionState;
    expect(s.entities.size).toBe(0);
    expect(s.alertLevel).toBe(0);
  });

  it('detects entity via perception_detect', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_detect',
      target: { id: 'enemy1', position: { x: 3, y: 0, z: 0 }, tags: [], threat: 0.8 },
    });
    expect((node as any).__perceptionState.entities.has('enemy1')).toBe(true);
    expect(getEventCount(ctx, 'perception_new')).toBe(1);
  });

  it('detects sound via perception_sound', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_sound',
      position: { x: 5, y: 0, z: 0 },
      sourceId: 's1',
    });
    expect((node as any).__perceptionState.entities.has('s1')).toBe(true);
    expect(getEventCount(ctx, 'perception_sound_detected')).toBe(1);
  });

  it('ignores sounds outside hearing range', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_sound',
      position: { x: 100, y: 0, z: 0 },
      sourceId: 's2',
    });
    expect((node as any).__perceptionState.entities.has('s2')).toBe(false);
  });

  it('perception_damage sets max alert', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_damage',
      attackerId: 'attacker1',
      position: { x: 2, y: 0, z: 0 },
    });
    expect((node as any).__perceptionState.alertLevel).toBe(1.0);
    expect(getEventCount(ctx, 'perception_attacked')).toBe(1);
  });

  it('confidence decays over time', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_detect',
      target: { id: 'e1', position: { x: 3, y: 0, z: 0 }, tags: [], threat: 0.5 },
    });
    const before = (node as any).__perceptionState.entities.get('e1').confidence;
    updateTrait(perceptionHandler, node, cfg, ctx, 1.0);
    const after = (node as any).__perceptionState.entities.get('e1')?.confidence ?? 0;
    expect(after).toBeLessThan(before);
  });

  it('perception_forget removes entity', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_detect',
      target: { id: 'e2', position: { x: 1, y: 0, z: 0 } },
    });
    sendEvent(perceptionHandler, node, cfg, ctx, { type: 'perception_forget', entityId: 'e2' });
    expect((node as any).__perceptionState.entities.has('e2')).toBe(false);
  });

  it('perception_clear resets all state', () => {
    sendEvent(perceptionHandler, node, cfg, ctx, {
      type: 'perception_detect',
      target: { id: 'e3', position: { x: 1, y: 0, z: 0 }, threat: 0.9 },
    });
    sendEvent(perceptionHandler, node, cfg, ctx, { type: 'perception_clear' });
    const s = (node as any).__perceptionState;
    expect(s.entities.size).toBe(0);
    expect(s.alertLevel).toBe(0);
  });

  it('cleans up on detach', () => {
    perceptionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__perceptionState).toBeUndefined();
  });
});
