import { describe, it, expect, vi } from 'vitest';
import { perceptionHandler } from '../PerceptionTrait';
type PercConfig = NonNullable<Parameters<typeof perceptionHandler.onAttach>[1]>;
function mkCfg(o: Partial<PercConfig> = {}): PercConfig {
  return { ...perceptionHandler.defaultConfig!, ...o };
}
function mkNode(id = 'perc-node', position = { x: 0, y: 0, z: 0 }) {
  return { id, position, rotation: { x: 0, y: 0, z: 0 } } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  perceptionHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}
function detect(
  node: any,
  ctx: any,
  cfg: PercConfig,
  id: string,
  pos: { x: number; y: number; z: number },
  threat = 0.5
) {
  perceptionHandler.onEvent!(
    node,
    cfg,
    ctx as any,
    { type: 'perception_detect', target: { id, position: pos, threat, tags: [] } } as any
  );
}

describe('perceptionHandler — defaultConfig', () => {
  it('sight_range = 20', () => expect(perceptionHandler.defaultConfig?.sight_range).toBe(20));
  it('sight_angle = 120', () => expect(perceptionHandler.defaultConfig?.sight_angle).toBe(120));
  it('hearing_range = 15', () => expect(perceptionHandler.defaultConfig?.hearing_range).toBe(15));
  it('memory_duration = 10000', () =>
    expect(perceptionHandler.defaultConfig?.memory_duration).toBe(10000));
  it('confidence_decay = 0.2', () =>
    expect(perceptionHandler.defaultConfig?.confidence_decay).toBe(0.2));
  it('scan_interval = 0.1', () => expect(perceptionHandler.defaultConfig?.scan_interval).toBe(0.1));
});

describe('perceptionHandler — onAttach', () => {
  it('creates __perceptionState', () => {
    const { node } = attach();
    expect((node as any).__perceptionState).toBeDefined();
  });
  it('entities Map is empty', () => {
    const { node } = attach();
    expect((node as any).__perceptionState.entities.size).toBe(0);
  });
  it('alertLevel = 0', () => {
    const { node } = attach();
    expect((node as any).__perceptionState.alertLevel).toBe(0);
  });
  it('isSearching = false', () => {
    const { node } = attach();
    expect((node as any).__perceptionState.isSearching).toBe(false);
  });
});

describe('perceptionHandler — onDetach', () => {
  it('removes __perceptionState', () => {
    const cfg = mkCfg();
    const node = mkNode();
    const ctx = mkCtx();
    perceptionHandler.onAttach!(node, cfg, ctx as any);
    perceptionHandler.onDetach!(node);
    expect((node as any).__perceptionState).toBeUndefined();
  });
});

describe('perceptionHandler — onEvent: perception_detect', () => {
  it('adds entity within sight range + angle', () => {
    // Node at origin, facing +Z (rotation.y=0). Target directly in front at z=5 (within 20 range, 0° angle)
    const { node, ctx, cfg } = attach(
      mkCfg({ sight_range: 20, sight_angle: 120, detection_layers: [] })
    );
    detect(node, ctx, cfg, 'e1', { x: 0, y: 0, z: 5 });
    expect((node as any).__perceptionState.entities.has('e1')).toBe(true);
  });
  it('emits perception_new for first detection', () => {
    const { node, ctx, cfg } = attach(mkCfg({ detection_layers: [] }));
    detect(node, ctx, cfg, 'e2', { x: 0, y: 0, z: 5 });
    expect(ctx.emitted.some((e: any) => e.type === 'perception_new')).toBe(true);
  });
  it('no perception_new on second detection of same entity', () => {
    const { node, ctx, cfg } = attach(mkCfg({ detection_layers: [] }));
    detect(node, ctx, cfg, 'dup', { x: 0, y: 0, z: 5 });
    ctx.emitted.length = 0;
    detect(node, ctx, cfg, 'dup', { x: 0, y: 0, z: 5 });
    expect(ctx.emitted.some((e: any) => e.type === 'perception_new')).toBe(false);
  });
  it('stores entity beyond sight/hearing as proximity type (no hard cutoff without layers)', () => {
    // The trait stores any detected entity; range only affects senseType and confidence.
    // A far entity is stored with senseType='proximity' — use detection_layers to truly filter.
    const { node, ctx, cfg } = attach(
      mkCfg({ sight_range: 5, hearing_range: 3, alert_radius: 1, detection_layers: [] })
    );
    detect(node, ctx, cfg, 'far', { x: 0, y: 0, z: 100 });
    const entity = (node as any).__perceptionState.entities.get('far');
    expect(entity?.senseType).toBe('proximity');
  });
  it('filters by detection_layers', () => {
    const { node, ctx, cfg } = attach(
      mkCfg({ detection_layers: ['enemy'], sight_range: 20, hearing_range: 15 })
    );
    // Target has no enemy tag -> should be ignored
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'perception_detect',
        target: { id: 'npc', position: { x: 0, y: 0, z: 5 }, tags: ['friendly'], threat: 0.1 },
      } as any
    );
    expect((node as any).__perceptionState.entities.has('npc')).toBe(false);
  });
  it('accepts entity with matching tag in detection_layers', () => {
    const { node, ctx, cfg } = attach(
      mkCfg({ detection_layers: ['enemy'], sight_range: 20, hearing_range: 15 })
    );
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'perception_detect',
        target: { id: 'badguy', position: { x: 0, y: 0, z: 5 }, tags: ['enemy'], threat: 0.8 },
      } as any
    );
    expect((node as any).__perceptionState.entities.has('badguy')).toBe(true);
  });
  it('uses senseType=sight for target directly in front within range', () => {
    const { node, ctx, cfg } = attach(
      mkCfg({ sight_range: 20, sight_angle: 120, detection_layers: [] })
    );
    detect(node, ctx, cfg, 'sight_ent', { x: 0, y: 0, z: 10 });
    const entity = (node as any).__perceptionState.entities.get('sight_ent');
    expect(entity?.senseType).toBe('sight');
  });
  it('uses senseType=hearing for entity within hearing range but outside FOV', () => {
    // Target at x=10 (90° off axis) - outside 120° FOV but within 15m hearing range
    const { node, ctx, cfg } = attach(
      mkCfg({
        sight_range: 20,
        sight_angle: 60,
        hearing_range: 15,
        alert_radius: 1,
        detection_layers: [],
      })
    );
    detect(node, ctx, cfg, 'hear_ent', { x: 10, y: 0, z: 0 });
    const entity = (node as any).__perceptionState.entities.get('hear_ent');
    expect(entity?.senseType).toBe('hearing');
  });
  it('no-op when target id is missing', () => {
    const { node, ctx, cfg } = attach();
    expect(() =>
      perceptionHandler.onEvent!(
        node,
        cfg,
        ctx as any,
        { type: 'perception_detect', target: { position: { x: 0, y: 0, z: 5 } } } as any
      )
    ).not.toThrow();
    expect((node as any).__perceptionState.entities.size).toBe(0);
  });
});

describe('perceptionHandler — onEvent: perception_sound', () => {
  it('adds entity within hearing range', () => {
    const { node, ctx, cfg } = attach(mkCfg({ hearing_range: 15 }));
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'perception_sound',
        position: { x: 0, y: 0, z: 10 },
        sourceId: 'snd1',
        threat: 0.3,
      } as any
    );
    expect((node as any).__perceptionState.entities.has('snd1')).toBe(true);
  });
  it('emits perception_sound_detected', () => {
    const { node, ctx, cfg } = attach(mkCfg({ hearing_range: 15 }));
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_sound', position: { x: 5, y: 0, z: 0 }, sourceId: 'snd2' } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'perception_sound_detected')).toBe(true);
  });
  it('ignores sound beyond hearing range', () => {
    const { node, ctx, cfg } = attach(mkCfg({ hearing_range: 5 }));
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_sound', position: { x: 100, y: 0, z: 0 }, sourceId: 'far_snd' } as any
    );
    expect((node as any).__perceptionState.entities.has('far_snd')).toBe(false);
  });
});

describe('perceptionHandler — onEvent: perception_damage', () => {
  it('registers attacker with threat=1.0 and confidence=1.0', () => {
    const { node, ctx, cfg } = attach();
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_damage', attackerId: 'atk1', position: { x: 3, y: 0, z: 0 } } as any
    );
    const entity = (node as any).__perceptionState.entities.get('atk1');
    expect(entity?.threat).toBe(1.0);
    expect(entity?.confidence).toBe(1.0);
  });
  it('sets alertLevel = 1.0 on damage', () => {
    const { node, ctx, cfg } = attach();
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_damage', attackerId: 'atk2', position: { x: 1, y: 0, z: 0 } } as any
    );
    expect((node as any).__perceptionState.alertLevel).toBe(1.0);
  });
  it('emits perception_attacked', () => {
    const { node, ctx, cfg } = attach();
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_damage', attackerId: 'atk3', position: { x: 2, y: 0, z: 0 } } as any
    );
    expect(ctx.emitted.some((e: any) => e.type === 'perception_attacked')).toBe(true);
  });
  it('no-op when attackerId missing', () => {
    const { node, ctx, cfg } = attach();
    expect(() =>
      perceptionHandler.onEvent!(
        node,
        cfg,
        ctx as any,
        { type: 'perception_damage', position: { x: 0, y: 0, z: 0 } } as any
      )
    ).not.toThrow();
  });
});

describe('perceptionHandler — onEvent: forget / clear', () => {
  it('perception_forget removes single entity', () => {
    const { node, ctx, cfg } = attach(mkCfg({ detection_layers: [] }));
    detect(node, ctx, cfg, 'rem_me', { x: 0, y: 0, z: 5 });
    perceptionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'perception_forget', entityId: 'rem_me' } as any
    );
    expect((node as any).__perceptionState.entities.has('rem_me')).toBe(false);
  });
  it('perception_clear removes all entities and resets state', () => {
    const { node, ctx, cfg } = attach(mkCfg({ detection_layers: [] }));
    detect(node, ctx, cfg, 'a', { x: 0, y: 0, z: 5 });
    detect(node, ctx, cfg, 'b', { x: 1, y: 0, z: 5 });
    perceptionHandler.onEvent!(node, cfg, ctx as any, { type: 'perception_clear' } as any);
    expect((node as any).__perceptionState.entities.size).toBe(0);
    expect((node as any).__perceptionState.alertLevel).toBe(0);
    expect((node as any).__perceptionState.lastKnownPosition).toBeNull();
  });
});

describe('perceptionHandler — onUpdate', () => {
  it('emits perception_scan_request after scan_interval', () => {
    const cfg = mkCfg({ scan_interval: 0.1, detection_layers: [] });
    const { node, ctx } = attach(cfg);
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 0.15); // > scan_interval
    expect(ctx.emitted.some((e: any) => e.type === 'perception_scan_request')).toBe(true);
  });
  it('no scan request before scan_interval', () => {
    const cfg = mkCfg({ scan_interval: 1.0, detection_layers: [] });
    const { node, ctx } = attach(cfg);
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 0.05);
    expect(ctx.emitted.some((e: any) => e.type === 'perception_scan_request')).toBe(false);
  });
  it('emits perception_lost when confidence decays to 0', () => {
    const cfg = mkCfg({ confidence_decay: 100, memory_duration: 60000, detection_layers: [] });
    const { node, ctx } = attach(cfg);
    detect(node, ctx, cfg, 'fading', { x: 0, y: 0, z: 5 });
    ctx.emitted.length = 0;
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 1.0); // 100 decay × 1s = -100 confidence
    expect(ctx.emitted.some((e: any) => e.type === 'perception_lost')).toBe(true);
    expect((node as any).__perceptionState.entities.has('fading')).toBe(false);
  });
  it('emits perception_lost when entity exceeds memory_duration', () => {
    const cfg = mkCfg({ memory_duration: 1, confidence_decay: 0, detection_layers: [] });
    const { node, ctx } = attach(cfg);
    detect(node, ctx, cfg, 'old', { x: 0, y: 0, z: 5 });
    // Manually age the entity
    const entity = (node as any).__perceptionState.entities.get('old');
    entity.lastSeen = Date.now() - 5000; // 5 seconds old, well past 1ms memory_duration
    ctx.emitted.length = 0;
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'perception_lost')).toBe(true);
  });
  it('emits perception_alert when alertLevel crosses 0.5 threshold', () => {
    const cfg = mkCfg({ detection_layers: [] });
    const { node, ctx } = attach(cfg);
    // Inject entity with high threat directly
    (node as any).__perceptionState.entities.set('threat_high', {
      id: 'threat_high',
      position: { x: 0, y: 0, z: 5 },
      lastSeen: Date.now(),
      senseType: 'sight',
      confidence: 0.9,
      threat: 0.9,
      tags: [],
    });
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 0.001); // tiny delta to not decay much
    expect(ctx.emitted.some((e: any) => e.type === 'perception_alert')).toBe(true);
  });
  it('scan_request has correct sightRange and hearingRange', () => {
    const cfg = mkCfg({
      scan_interval: 0.1,
      sight_range: 30,
      hearing_range: 20,
      detection_layers: [],
    });
    const { node, ctx } = attach(cfg);
    perceptionHandler.onUpdate!(node, cfg, ctx as any, 0.15);
    const ev = ctx.emitted.find((e: any) => e.type === 'perception_scan_request');
    expect(ev?.payload.sightRange).toBe(30);
    expect(ev?.payload.hearingRange).toBe(20);
  });
});
