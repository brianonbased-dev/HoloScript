/**
 * SpatialAgentOrchestrator.test.ts — v4.0
 * Tests: attach, blueprint→DSL conversion, fromBlueprint, LLM mocked generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spatialAgentHandler } from '../SpatialAgentOrchestrator';
import type { SpatialAgentConfig } from '../SpatialAgentOrchestrator';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

const BASE_CONFIG: SpatialAgentConfig = {
  model: 'llama3',
  llm_base_url: 'http://localhost:11434',
  llm_api_key: '',
  max_objects: 50,
  max_agents: 10,
  auto_render: false,
  auto_mint: false,
  render_quality: 'production',
  compile_target: 'webgpu',
  temperature: 0.8,
};

const SAMPLE_BLUEPRINT = {
  title: 'Neon City',
  description: 'A cyberpunk city at night',
  environment: {
    skybox: 'night_city',
    fogDensity: 0.05,
    ambientColor: '#0a0a1a',
    ambientIntensity: 0.3,
  },
  camera: { fov: 75, near: 0.1, far: 2000, position: [0, 10, 50] as [number, number, number] },
  objects: [
    {
      id: 'building1',
      type: 'mesh' as const,
      geometry: 'box',
      position: [0, 25, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [10, 50, 10] as [number, number, number],
      material: 'glass_neon',
      traits: ['NeonLightTrait'],
    },
  ],
  lights: [
    {
      id: 'main_light',
      type: 'directional' as const,
      color: '#4444ff',
      intensity: 0.5,
      position: [100, 100, 50] as [number, number, number],
      castShadow: true,
    },
  ],
  agents: [
    {
      id: 'guard',
      name: 'CityGuard',
      traits: ['PatrolTrait'],
      role: 'security',
      position: [5, 0, 5] as [number, number, number],
    },
  ],
  materials: {
    glass_neon: {
      type: 'holographic' as const,
      color: '#00ffff',
      emissive: '#00ffff',
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.6,
    },
  },
};

function attach(extra: Partial<SpatialAgentConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  spatialAgentHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('SpatialAgentOrchestrator — onAttach', () => {
  it('emits spatial_agent_ready', () => {
    const { ctx } = attach();
    expect(ctx.of('spatial_agent_ready').length).toBe(1);
  });

  it('initializes ready state', () => {
    const { node } = attach();
    expect(node.__spatialAgentState.isReady).toBe(true);
    expect(node.__spatialAgentState.totalGenerated).toBe(0);
  });
});

// ─── scene_generate_from_blueprint ───────────────────────────────────────────

describe('SpatialAgentOrchestrator — scene_generate_from_blueprint', () => {
  it('emits scene_dsl_ready from blueprint', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT, requestId: 'r1' },
    });
    const dslEvents = ctx.of('scene_dsl_ready');
    expect(dslEvents.length).toBe(1);
    const p = dslEvents[0].payload as any;
    expect(p.requestId).toBe('r1');
    expect(typeof p.dsl).toBe('string');
    expect(p.dsl).toContain('Neon_City');
  });

  it('emits scene_compiled after DSL generation', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT, requestId: 'r2' },
    });
    const compiled = ctx.of('scene_compiled');
    expect(compiled.length).toBe(1);
    const scene = (compiled[0].payload as any).scene;
    expect(scene.title).toBe('Neon City');
    expect(scene.target).toBe('webgpu');
  });

  it('increments totalGenerated', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    expect(node.__spatialAgentState.totalGenerated).toBe(1);
  });

  it('DSL includes environment block', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    const dsl = (ctx.of('scene_dsl_ready')[0].payload as any).dsl as string;
    expect(dsl).toContain('environment');
    expect(dsl).toContain('skybox');
  });

  it('DSL includes objects block', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    const dsl = (ctx.of('scene_dsl_ready')[0].payload as any).dsl as string;
    expect(dsl).toContain('building1');
  });

  it('DSL includes lights block', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    const dsl = (ctx.of('scene_dsl_ready')[0].payload as any).dsl as string;
    expect(dsl).toContain('main_light');
  });

  it('DSL includes agents block', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    const dsl = (ctx.of('scene_dsl_ready')[0].payload as any).dsl as string;
    expect(dsl).toContain('guard');
  });

  it('DSL includes materials block', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    const dsl = (ctx.of('scene_dsl_ready')[0].payload as any).dsl as string;
    expect(dsl).toContain('glass_neon');
  });

  it('does not auto-render when auto_render=false', () => {
    const { node, ctx, config } = attach({ auto_render: false });
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: SAMPLE_BLUEPRINT },
    });
    expect(ctx.of('scene_render_queued').length).toBe(0);
  });

  it('caps objects at max_objects', () => {
    const bigBlueprint = {
      ...SAMPLE_BLUEPRINT,
      objects: Array.from({ length: 100 }, (_, i) => ({
        id: `obj${i}`,
        type: 'mesh' as const,
        geometry: 'box',
        position: [i, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        material: 'default',
        traits: [],
      })),
    };
    const { node, ctx, config } = attach({ max_objects: 5 });
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate_from_blueprint',
      payload: { blueprint: bigBlueprint },
    });
    const scene = (ctx.of('scene_compiled')[0].payload as any).scene;
    expect(scene.blueprint.objects.length).toBeLessThanOrEqual(5);
  });
});

// ─── scene_generate (LLM mocked) ─────────────────────────────────────────────

describe('SpatialAgentOrchestrator — scene_generate (LLM)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: JSON.stringify(SAMPLE_BLUEPRINT) },
      }),
    } as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('emits scene_generation_started', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate',
      payload: { prompt: 'A neon cyberpunk city', requestId: 'gen1' },
    });
    expect(ctx.of('scene_generation_started').length).toBe(1);
    expect((ctx.of('scene_generation_started')[0].payload as any).prompt).toBe(
      'A neon cyberpunk city'
    );
  });

  it('emits scene_blueprint_ready', async () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate',
      payload: { prompt: 'A neon cyberpunk city', requestId: 'gen2' },
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.of('scene_blueprint_ready').length).toBe(1);
  });

  it('emits scene_compiled after LLM generation', async () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate',
      payload: { prompt: 'Forest scene', requestId: 'gen3' },
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.of('scene_compiled').length).toBe(1);
  });

  it('auto-queues render when auto_render=true', async () => {
    const { node, ctx, config } = attach({ auto_render: true });
    spatialAgentHandler.onEvent(node, config, ctx, {
      type: 'scene_generate',
      payload: { prompt: 'A vr space station', requestId: 'gen4' },
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.of('scene_render_queued').length).toBe(1);
  });
});

// ─── scene_list_active ────────────────────────────────────────────────────────

describe('SpatialAgentOrchestrator — scene_list_active', () => {
  it('emits scene_active_list', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onEvent(node, config, ctx, { type: 'scene_list_active' });
    expect(ctx.of('scene_active_list').length).toBe(1);
    expect((ctx.of('scene_active_list')[0].payload as any).total).toBe(0);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('SpatialAgentOrchestrator — onDetach', () => {
  it('emits spatial_agent_stopped', () => {
    const { node, ctx, config } = attach();
    spatialAgentHandler.onDetach(node, config, ctx);
    expect(ctx.of('spatial_agent_stopped').length).toBe(1);
    expect(node.__spatialAgentState).toBeUndefined();
  });
});
