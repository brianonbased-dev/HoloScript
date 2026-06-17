/**
 * BehavioralTraits — unit tests for Tier-1 native runtime handlers.
 *
 * THREE.Object3D is real (no WebGL mocks needed for unit testing).
 * PhysicsWorld is stubbed — only addBody is exercised.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  FollowTrait,
  OrbitTrait,
  CrowdSimTrait,
  ChainTrait,
  AiCompanionTrait,
  AiNpcBrainTrait,
  LlmAgentTrait,
  GpuParticleTrait,
  GpuPhysicsTrait,
  DeformableTerrainTrait,
  SoftBodyProTrait,
  ComputeTrait,
  ObjectTrackingTrait,
  SensorTrait,
  DigitalTwinTrait,
} from '../BehavioralTraits';
import type { TraitContext } from '../TraitSystem';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function stubPhysicsWorld() {
  return { addBody: vi.fn() } as unknown as TraitContext['physicsWorld'];
}

function makeContext(
  object: THREE.Object3D,
  config: Record<string, unknown> = {},
  physicsWorld?: TraitContext['physicsWorld']
): TraitContext {
  return {
    object,
    physicsWorld: physicsWorld ?? stubPhysicsWorld(),
    config,
    data: {},
  };
}

function collectEvents(object: THREE.Object3D): Array<{ type: string; [k: string]: unknown }> {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  const original = object.dispatchEvent.bind(object);
  object.dispatchEvent = ((event: unknown) => {
    const e = event as { type: string; [k: string]: unknown };
    events.push(e);
    return original(e as Parameters<typeof original>[0]);
  }) as typeof object.dispatchEvent;
  return events;
}

// ──────────────────────────────────────────────────────────────────
// FollowTrait
// ──────────────────────────────────────────────────────────────────

describe('FollowTrait', () => {
  it('onApply stores speed, minDistance and marks userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { speed: 3.0, min_distance: 2.0, target: 'hero' });
    FollowTrait.onApply!(ctx);
    expect(ctx.data.speed).toBe(3.0);
    expect(ctx.data.minDistance).toBe(2.0);
    expect(ctx.data.targetId).toBe('hero');
    expect(obj.userData.followEnabled).toBe(true);
  });

  it('onUpdate moves object toward target when in range', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    scene.add(obj);

    const target = new THREE.Object3D();
    target.name = 'hero';
    target.position.set(10, 0, 0);
    scene.add(target);

    const ctx = makeContext(obj, { speed: 5, min_distance: 0.5, target: 'hero', smoothing: 1 });
    FollowTrait.onApply!(ctx);
    FollowTrait.onUpdate!(ctx, 0.016);

    // Should have moved toward the target (x > 0)
    expect(obj.position.x).toBeGreaterThan(0);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj);
    FollowTrait.onApply!(ctx);
    FollowTrait.onRemove!(ctx);
    expect(obj.userData.followEnabled).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// OrbitTrait
// ──────────────────────────────────────────────────────────────────

describe('OrbitTrait', () => {
  it('onApply marks object as orbiting with default radius', () => {
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    const ctx = makeContext(obj, {});
    OrbitTrait.onApply!(ctx);
    expect(ctx.data.radius).toBe(3.0);
    expect(obj.userData.orbiting).toBe(true);
  });

  it('onUpdate changes position each frame', () => {
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    const ctx = makeContext(obj, { radius: 2, speed: 1 });
    OrbitTrait.onApply!(ctx);
    const startX = obj.position.x;
    const startZ = obj.position.z;
    OrbitTrait.onUpdate!(ctx, 0.1);
    // Position should have changed (orbital motion)
    const moved = obj.position.x !== startX || obj.position.z !== startZ;
    expect(moved).toBe(true);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    const ctx = makeContext(obj);
    OrbitTrait.onApply!(ctx);
    OrbitTrait.onRemove!(ctx);
    expect(obj.userData.orbiting).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// CrowdSimTrait
// ──────────────────────────────────────────────────────────────────

describe('CrowdSimTrait', () => {
  it('onApply initialises velocity vector and crowd marker', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { max_speed: 3 });
    CrowdSimTrait.onApply!(ctx);
    expect(ctx.data.velocity).toBeInstanceOf(THREE.Vector3);
    expect(obj.userData.crowdAgent).toBe(true);
    expect(ctx.data.maxSpeed).toBe(3);
  });

  it('onUpdate moves object (wander even with no neighbours)', () => {
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    const ctx = makeContext(obj, { wander_strength: 1.0 });
    CrowdSimTrait.onApply!(ctx);
    const px = obj.position.x;
    const pz = obj.position.z;
    CrowdSimTrait.onUpdate!(ctx, 0.1);
    // With wander the object should move
    const moved = obj.position.x !== px || obj.position.z !== pz;
    expect(moved).toBe(true);
  });

  it('onRemove clears crowd markers', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj);
    CrowdSimTrait.onApply!(ctx);
    CrowdSimTrait.onRemove!(ctx);
    expect(obj.userData.crowdAgent).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// ChainTrait
// ──────────────────────────────────────────────────────────────────

describe('ChainTrait', () => {
  it('onApply creates chain nodes', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    obj.position.set(0, 5, 0);
    scene.add(obj);

    const ctx = makeContext(obj, { segments: 4, segment_length: 0.3 });
    ChainTrait.onApply!(ctx);

    const nodes = ctx.data.nodes as unknown[];
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(4);
    expect(obj.userData.hasChain).toBe(true);
  });

  it('onUpdate advances Verlet integration', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    obj.position.set(0, 5, 0);
    scene.add(obj);

    const ctx = makeContext(obj, { segments: 3, segment_length: 0.3, damping: 0.98, gravity: 9.81 });
    ChainTrait.onApply!(ctx);

    const nodes = ctx.data.nodes as Array<{ position: THREE.Vector3; prev: THREE.Vector3 }>;
    const initialY1 = nodes[1].position.y;
    ChainTrait.onUpdate!(ctx, 0.05);
    // Node 1 should have fallen under gravity
    expect(nodes[1].position.y).toBeLessThanOrEqual(initialY1);
  });

  it('onRemove removes chain group from scene', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    obj.position.set(0, 5, 0);
    scene.add(obj);

    const ctx = makeContext(obj, { segments: 2 });
    ChainTrait.onApply!(ctx);
    ChainTrait.onRemove!(ctx);
    expect(obj.userData.hasChain).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// AiCompanionTrait
// ──────────────────────────────────────────────────────────────────

describe('AiCompanionTrait', () => {
  it('onApply sets state idle and fires ai:companion:ready', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { personality: 'cheerful', think_interval: 2.0 });
    AiCompanionTrait.onApply!(ctx);
    expect(ctx.data.state).toBe('idle');
    expect(obj.userData.aiCompanion).toBe(true);
    expect(obj.userData.aiCompanionPersonality).toBe('cheerful');
    expect(events.some((e) => e.type === 'ai:companion:ready')).toBe(true);
  });

  it('onUpdate fires ai:companion:tick after interval', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { think_interval: 0.05 });
    AiCompanionTrait.onApply!(ctx);
    AiCompanionTrait.onUpdate!(ctx, 0.1); // exceeds interval
    expect(events.some((e) => e.type === 'ai:companion:tick')).toBe(true);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj);
    AiCompanionTrait.onApply!(ctx);
    AiCompanionTrait.onRemove!(ctx);
    expect(obj.userData.aiCompanion).toBeUndefined();
    expect(obj.userData.aiCompanionState).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// AiNpcBrainTrait
// ──────────────────────────────────────────────────────────────────

describe('AiNpcBrainTrait', () => {
  it('onApply emits npc:brain:ready', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { state_duration: 3.0 });
    AiNpcBrainTrait.onApply!(ctx);
    expect(ctx.data.state).toBe('idle');
    expect(events.some((e) => e.type === 'npc:brain:ready')).toBe(true);
  });

  it('onUpdate transitions state after duration', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { state_duration: 0.05 });
    AiNpcBrainTrait.onApply!(ctx);
    AiNpcBrainTrait.onUpdate!(ctx, 0.1);
    expect(events.some((e) => e.type === 'npc:brain:state')).toBe(true);
    expect(ctx.data.state).toBe('patrol');
  });
});

// ──────────────────────────────────────────────────────────────────
// LlmAgentTrait
// ──────────────────────────────────────────────────────────────────

describe('LlmAgentTrait', () => {
  it('onApply emits llm:agent:ready and sets model', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { model: 'qwen3:4b' });
    LlmAgentTrait.onApply!(ctx);
    expect(obj.userData.llmModel).toBe('qwen3:4b');
    expect(events.some((e) => e.type === 'llm:agent:ready')).toBe(true);
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj);
    LlmAgentTrait.onApply!(ctx);
    LlmAgentTrait.onRemove!(ctx);
    expect(obj.userData.llmAgent).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// GpuParticleTrait
// ──────────────────────────────────────────────────────────────────

describe('GpuParticleTrait', () => {
  it('onApply creates a Points child and marks GPU upgrade pending', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { count: 50, spread: 1.0, lifetime: 1.0 });
    GpuParticleTrait.onApply!(ctx);
    expect(ctx.data.points).toBeInstanceOf(THREE.Points);
    expect(obj.userData.gpuParticle).toBe(true);
    expect(obj.userData.gpuParticleUpgradePending).toBe(true);
    expect(obj.children.length).toBeGreaterThan(0);
  });

  it('onUpdate advances particle ages without throwing', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { count: 10 });
    GpuParticleTrait.onApply!(ctx);
    expect(() => GpuParticleTrait.onUpdate!(ctx, 0.016)).not.toThrow();
  });

  it('onRemove removes Points child', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { count: 10 });
    GpuParticleTrait.onApply!(ctx);
    GpuParticleTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(obj.userData.gpuParticle).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// GpuPhysicsTrait
// ──────────────────────────────────────────────────────────────────

describe('GpuPhysicsTrait', () => {
  it('onApply calls physicsWorld.addBody as CPU fallback', () => {
    const obj = new THREE.Object3D();
    obj.name = 'physics-cube';
    const pw = stubPhysicsWorld();
    const ctx = makeContext(obj, { shape: 'box', mass: 2.0 }, pw);
    GpuPhysicsTrait.onApply!(ctx);
    expect(pw.addBody).toHaveBeenCalledWith('physics-cube', obj, 'box', 2.0);
    expect(obj.userData.gpuPhysics).toBe(true);
    expect(obj.userData.gpuPhysicsUpgradePending).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// DeformableTerrainTrait
// ──────────────────────────────────────────────────────────────────

describe('DeformableTerrainTrait', () => {
  it('onApply stores original y positions and marks terrain', () => {
    const obj = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 4, 4));
    const ctx = makeContext(obj, { max_depth: 1.0 });
    DeformableTerrainTrait.onApply!(ctx);
    expect(ctx.data.originalY).toBeInstanceOf(Float32Array);
    expect(obj.userData.deformableTerrain).toBe(true);
  });

  it('onUpdate applies vertex displacement for impact entries', () => {
    const obj = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 8, 8));
    const ctx = makeContext(obj, { max_depth: 2.0, stiffness: 1.0 });
    DeformableTerrainTrait.onApply!(ctx);

    // Inject an impact
    (ctx.data.impacts as Array<{ x: number; z: number; depth: number; radius: number }>).push({
      x: 0, z: 0, depth: 1.0, radius: 1.5,
    });

    DeformableTerrainTrait.onUpdate!(ctx, 0.016);

    const geo = obj.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const originalY = ctx.data.originalY as Float32Array;

    // At least one vertex near origin should be lower than original
    let anyLower = false;
    for (let i = 0; i < posAttr.count; i++) {
      if (positions[i * 3 + 1] < originalY[i * 3 + 1] - 0.001) {
        anyLower = true;
        break;
      }
    }
    expect(anyLower).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// SoftBodyProTrait
// ──────────────────────────────────────────────────────────────────

describe('SoftBodyProTrait', () => {
  it('onApply registers physics body and marks userData', () => {
    const obj = new THREE.Object3D();
    obj.name = 'soft-ball';
    const pw = stubPhysicsWorld();
    const ctx = makeContext(obj, { mass: 0.5, pressure: 300 }, pw);
    SoftBodyProTrait.onApply!(ctx);
    expect(pw.addBody).toHaveBeenCalled();
    expect(obj.userData.softBodyPro).toBe(true);
    expect(ctx.data.pressure).toBe(300);
  });
});

// ──────────────────────────────────────────────────────────────────
// ComputeTrait
// ──────────────────────────────────────────────────────────────────

describe('ComputeTrait', () => {
  it('onApply fires gpu:compute:ready event', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { shader: 'particle_sim', interval: 0 });
    ComputeTrait.onApply!(ctx);
    expect(events.some((e) => e.type === 'gpu:compute:ready')).toBe(true);
    expect(obj.userData.computePending).toBe(true);
  });

  it('onUpdate dispatches compute every frame when interval=0', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { interval: 0 });
    ComputeTrait.onApply!(ctx);
    ComputeTrait.onUpdate!(ctx, 0.016);
    expect(events.some((e) => e.type === 'gpu:compute:dispatch')).toBe(true);
  });

  it('onUpdate respects interval throttle', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj, { interval: 1.0 });
    ComputeTrait.onApply!(ctx);
    const events = collectEvents(obj);
    ComputeTrait.onUpdate!(ctx, 0.016); // too short
    expect(events.filter((e) => e.type === 'gpu:compute:dispatch').length).toBe(0);
    ComputeTrait.onUpdate!(ctx, 1.5); // exceeds interval
    expect(events.some((e) => e.type === 'gpu:compute:dispatch')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// ObjectTrackingTrait
// ──────────────────────────────────────────────────────────────────

describe('ObjectTrackingTrait', () => {
  it('onApply fires ar:tracking:ready', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { target: 'marker-A' });
    ObjectTrackingTrait.onApply!(ctx);
    expect(obj.userData.objectTracking).toBe(true);
    expect(events.some((e) => e.type === 'ar:tracking:ready')).toBe(true);
  });

  it('onUpdate fires ar:tracking:acquired when confidence rises above 0.5', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj);
    ObjectTrackingTrait.onApply!(ctx);
    obj.userData.objectTrackingConfidence = 0.8;
    ObjectTrackingTrait.onUpdate!(ctx, 0.016);
    expect(events.some((e) => e.type === 'ar:tracking:acquired')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// SensorTrait
// ──────────────────────────────────────────────────────────────────

describe('SensorTrait', () => {
  it('onApply fires sensor:ready', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { sensor_id: 'temp-01', poll_interval: 1.0, sensor_type: 'temperature' });
    SensorTrait.onApply!(ctx);
    expect(obj.userData.sensor).toBe(true);
    expect(events.some((e) => e.type === 'sensor:ready')).toBe(true);
  });

  it('onUpdate fires sensor:poll after interval', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { sensor_id: 'temp-01', poll_interval: 0.05 });
    SensorTrait.onApply!(ctx);
    SensorTrait.onUpdate!(ctx, 0.1);
    expect(events.some((e) => e.type === 'sensor:poll')).toBe(true);
  });

  it('fires sensor:value when incoming value set on userData', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { sensor_id: 'temp-01', poll_interval: 100 });
    SensorTrait.onApply!(ctx);
    obj.userData.sensorIncoming = 37.5;
    SensorTrait.onUpdate!(ctx, 0.016);
    expect(events.some((e) => e.type === 'sensor:value')).toBe(true);
    expect(obj.userData.sensorIncoming).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// DigitalTwinTrait
// ──────────────────────────────────────────────────────────────────

describe('DigitalTwinTrait', () => {
  it('onApply fires twin:ready and marks userData', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { device_id: 'robot-arm-01', sync_interval: 5.0 });
    DigitalTwinTrait.onApply!(ctx);
    expect(obj.userData.digitalTwin).toBe(true);
    expect(obj.userData.digitalTwinDeviceId).toBe('robot-arm-01');
    expect(events.some((e) => e.type === 'twin:ready')).toBe(true);
  });

  it('onUpdate fires twin:sync after interval', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { device_id: 'robot-arm-01', sync_interval: 0.05 });
    DigitalTwinTrait.onApply!(ctx);
    DigitalTwinTrait.onUpdate!(ctx, 0.1);
    expect(events.some((e) => e.type === 'twin:sync')).toBe(true);
  });

  it('fires twin:updated when twinIncomingState is set', () => {
    const obj = new THREE.Object3D();
    const events = collectEvents(obj);
    const ctx = makeContext(obj, { device_id: 'arm-01', sync_interval: 100 });
    DigitalTwinTrait.onApply!(ctx);
    obj.userData.twinIncomingState = { position: [1, 2, 3] };
    DigitalTwinTrait.onUpdate!(ctx, 0.016);
    expect(events.some((e) => e.type === 'twin:updated')).toBe(true);
    // Position should be updated
    expect(obj.position.x).toBe(1);
    expect(obj.position.y).toBe(2);
    expect(obj.position.z).toBe(3);
    expect(obj.userData.twinIncomingState).toBeUndefined();
  });

  it('onRemove clears userData', () => {
    const obj = new THREE.Object3D();
    const ctx = makeContext(obj);
    DigitalTwinTrait.onApply!(ctx);
    DigitalTwinTrait.onRemove!(ctx);
    expect(obj.userData.digitalTwin).toBeUndefined();
  });
});
