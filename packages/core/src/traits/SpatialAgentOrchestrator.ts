// @ts-expect-error During migration
import type { Trait, HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';
/**
 * SpatialAgentOrchestrator — v4.0
 *
 * Text → 3D scene generation. HoloScript's core differentiator over OpenClaw.
 * "Build me a cyberpunk city at night" → HoloScript DSL scene + optional render/mint.
 *
 * Pipeline:
 *  1. Natural language → scene blueprint (LLM call)
 *  2. Blueprint → HoloScript DSL code (template + LLM)
 *  3. DSL → compiled scene (via compiler)
 *  4. Optional: render (RenderNetworkTrait), publish for minting (via Web3Connector)
 *
 * Events emitted:
 *  scene_generation_started  { node, requestId, prompt }
 *  scene_blueprint_ready     { node, requestId, blueprint }
 *  scene_dsl_ready           { node, requestId, dsl }
 *  scene_compiled            { node, requestId, scene }
 *  scene_generation_failed   { node, requestId, error, step }
 *  scene_generation_progress { node, requestId, step, pct }
 *  scene_render_queued       { node, requestId, jobId }
 *  scene_minted              { node, requestId, tokenId, txHash }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneBlueprint {
  title: string;
  description: string;
  environment: {
    skybox: string;
    fogDensity: number;
    ambientColor: string;
    ambientIntensity: number;
  };
  camera: { fov: number; near: number; far: number; position: [number, number, number] };
  objects: SceneObject[];
  lights: SceneLight[];
  agents: SceneAgent[];
  materials: Record<string, SceneMaterial>;
}

export interface SceneObject {
  id: string;
  type: 'mesh' | 'splat' | 'volume' | 'terrain' | 'water';
  geometry: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material: string;
  traits: string[];
  children?: SceneObject[];
}

export interface SceneLight {
  id: string;
  type: 'directional' | 'point' | 'spot' | 'area';
  color: string;
  intensity: number;
  position: [number, number, number];
  castShadow: boolean;
}

export interface SceneAgent {
  id: string;
  name: string;
  traits: string[];
  role: string;
  position: [number, number, number];
}

export interface SceneMaterial {
  type: 'pbr' | 'unlit' | 'toon' | 'holographic';
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export interface SpatialAgentConfig {
  /** LLM model for scene generation */
  model: string;
  /** LLM API endpoint (local or remote) */
  llm_base_url: string;
  /** API key (empty for local) */
  llm_api_key: string;
  /** Max objects per generated scene */
  max_objects: number;
  /** Max agents per generated scene */
  max_agents: number;
  /** Auto-submit to RenderNetworkTrait after generation */
  auto_render: boolean;
  /** Auto-publish scene for NFT minting (handled by web3 provider) */
  auto_mint: boolean;
  /** Default render quality */
  render_quality: 'preview' | 'production' | 'film';
  /** Output target for compiler */
  compile_target: 'webgpu' | 'threejs' | 'unity' | 'unreal' | 'usdz';
  /** Temperature for LLM calls */
  temperature: number;
}

export interface SpatialAgentState {
  isReady: boolean;
  activeGenerations: Map<string, { prompt: string; step: string; startedAt: number }>;
  totalGenerated: number;
  totalRendered: number;
  totalMinted: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const BLUEPRINT_PROMPT = `You are a 3D scene designer for HoloScript spatial computing.
Given a text description, output a valid JSON scene blueprint with this exact schema:
{ "title": string, "description": string, "environment": { skybox, fogDensity, ambientColor, ambientIntensity },
  "camera": { fov, near, far, position }, "objects": [...], "lights": [...], "agents": [...], "materials": {} }
Objects schema: { id, type(mesh|splat|volume), geometry(box|sphere|cylinder|plane|custom), position[x,y,z], rotation[x,y,z], scale[x,y,z], material, traits[] }
Lights schema: { id, type(directional|point|spot), color(hex), intensity, position[x,y,z], castShadow }
Materials schema: key → { type(pbr|unlit|toon|holographic), color(hex), metalness, roughness, emissive, emissiveIntensity }
Respond ONLY with valid JSON. No commentary.`;

const DEFAULT_CONFIG: SpatialAgentConfig = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function blueprintToDSL(bp: SceneBlueprint, target: string): string {
  const lines: string[] = [
    `// HoloScript Scene: ${bp.title}`,
    `// Generated by SpatialAgentOrchestrator v4.0`,
    `// Target: ${target}`,
    ``,
    `scene ${bp.title.replace(/\s+/g, '_')} {`,
    `  environment {`,
    `    skybox: "${bp.environment.skybox}"`,
    `    fog: ${bp.environment.fogDensity}`,
    `    ambient: "${bp.environment.ambientColor}" @ ${bp.environment.ambientIntensity}`,
    `  }`,
    ``,
    `  camera {`,
    `    fov: ${bp.camera.fov}`,
    `    near: ${bp.camera.near}`,
    `    far: ${bp.camera.far}`,
    `    position: [${bp.camera.position.join(', ')}]`,
    `  }`,
    ``,
  ];

  // Materials
  for (const [id, mat] of Object.entries(bp.materials)) {
    lines.push(`  material ${id} : ${mat.type} {`);
    lines.push(`    color: "${mat.color}"`);
    if (mat.metalness !== undefined) lines.push(`    metalness: ${mat.metalness}`);
    if (mat.roughness !== undefined) lines.push(`    roughness: ${mat.roughness}`);
    if (mat.emissive) {
      lines.push(`    emissive: "${mat.emissive}" @ ${mat.emissiveIntensity ?? 1}`);
    }
    lines.push(`  }`);
    lines.push(``);
  }

  // Lights
  for (const light of bp.lights) {
    lines.push(`  light ${light.id} : ${light.type} {`);
    lines.push(`    color: "${light.color}"`);
    lines.push(`    intensity: ${light.intensity}`);
    lines.push(`    position: [${light.position.join(', ')}]`);
    if (light.castShadow) lines.push(`    shadow: true`);
    lines.push(`  }`);
    lines.push(``);
  }

  // Objects
  for (const obj of bp.objects) {
    lines.push(`  object ${obj.id} : ${obj.geometry} {`);
    lines.push(`    type: ${obj.type}`);
    lines.push(`    position: [${obj.position.join(', ')}]`);
    lines.push(`    rotation: [${obj.rotation.join(', ')}]`);
    lines.push(`    scale: [${obj.scale.join(', ')}]`);
    lines.push(`    material: ${obj.material}`);
    if (obj.traits.length > 0)
      lines.push(`    traits: [${obj.traits.map((t) => `"${t}"`).join(', ')}]`);
    lines.push(`  }`);
    lines.push(``);
  }

  // Agents
  for (const agent of bp.agents) {
    lines.push(`  agent ${agent.id} {`);
    lines.push(`    name: "${agent.name}"`);
    lines.push(`    role: "${agent.role}"`);
    lines.push(`    position: [${agent.position.join(', ')}]`);
    lines.push(`    traits: [${agent.traits.map((t) => `"${t}"`).join(', ')}]`);
    lines.push(`  }`);
    lines.push(``);
  }

  lines.push(`}`);
  return lines.join('\n');
}

async function callLLM(
  config: SpatialAgentConfig,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const isOllama = !config.llm_api_key;
  const endpoint = isOllama
    ? `${config.llm_base_url}/api/chat`
    : `${config.llm_base_url}/v1/chat/completions`;

  const body = isOllama
    ? {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: { temperature: config.temperature },
      }
    : {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        temperature: config.temperature,
      };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.llm_api_key) headers['Authorization'] = `Bearer ${config.llm_api_key}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return isOllama ? (data.message?.content ?? '') : (data.choices?.[0]?.message?.content ?? '');
}

function parseBlueprint(json: string): SceneBlueprint {
  // Strip markdown code blocks if LLM wrapped them
  const cleaned = json
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const spatialAgentHandler = {
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, _config: SpatialAgentConfig, ctx: TraitContext): void {
    const state: SpatialAgentState = {
      isReady: true,
      activeGenerations: new Map(),
      totalGenerated: 0,
      totalRendered: 0,
      totalMinted: 0,
    };
    node.__spatialAgentState = state;
    ctx.emit('spatial_agent_ready', { node });
  },

  onDetach(node: HSPlusNode, _config: SpatialAgentConfig, ctx: TraitContext): void {
    // @ts-expect-error
    const state: SpatialAgentState | undefined = node.__spatialAgentState;
    if (!state) return;
    ctx.emit('spatial_agent_stopped', { node, totalGenerated: state.totalGenerated });
    delete node.__spatialAgentState;
  },

  onEvent(node: HSPlusNode, config: SpatialAgentConfig, ctx: TraitContext, event: TraitEvent): void {
    // @ts-expect-error
    const state: SpatialAgentState | undefined = node.__spatialAgentState;
    if (!state?.isReady) return;

    switch (event.type) {
      case 'scene_generate':
        this._generate(state, node, config, ctx, (event.payload as Record<string, unknown>));
        break;
      case 'scene_generate_from_blueprint':
        this._fromBlueprint(state, node, config, ctx, (event.payload as Record<string, unknown>));
        break;
      case 'scene_list_active':
        ctx.emit('scene_active_list', {
          node,
          active: [...state.activeGenerations.values()],
          total: state.activeGenerations.size,
        });
        break;
    }
  },

  onUpdate(_node: HSPlusNode, _config: SpatialAgentConfig, _ctx: TraitContext, _dt: number): void {
    /* async */
  },

  _generate(
    state: SpatialAgentState,
    node: HSPlusNode,
    config: SpatialAgentConfig,
    ctx: TraitContext,
    payload: Record<string, unknown>
  ): void {
    if (!payload?.prompt) return;
    const requestId = (payload.requestId as string) ?? generateRequestId();
    state.activeGenerations.set(requestId, {
// @ts-expect-error During migration
      prompt: payload.prompt,
      step: 'blueprint',
      startedAt: Date.now(),
    });
    ctx.emit('scene_generation_started', { node, requestId, prompt: payload.prompt });
    ctx.emit('scene_generation_progress', { node, requestId, step: 'blueprint', pct: 5 });

// @ts-expect-error During migration
    this._runGeneration(state, node, ((config as SpatialAgentConfig) as string), ctx, requestId, payload.prompt).catch((err: Error) => {
      state.activeGenerations.delete(requestId);
      ctx.emit('scene_generation_failed', {
        node,
        requestId,
        error: err.message,
        step: state.activeGenerations.get(requestId)?.step ?? 'unknown',
      });
    });
  },

  async _runGeneration(
    state: SpatialAgentState,
    node: HSPlusNode,
    config: SpatialAgentConfig,
    ctx: TraitContext,
    requestId: string,
    prompt: string
  ): Promise<void> {
    // Step 1: Generate blueprint
    ctx.emit('scene_generation_progress', { node, requestId, step: 'blueprint', pct: 10 });
    const blueprintRaw = await callLLM(config, BLUEPRINT_PROMPT, prompt);

    let blueprint: SceneBlueprint;
    try {
      blueprint = parseBlueprint(blueprintRaw);
    } catch {
      throw new Error(`Failed to parse scene blueprint: ${blueprintRaw.slice(0, 200)}`);
    }

    // Cap to config limits
    blueprint.objects = blueprint.objects.slice(0, config.max_objects);
    blueprint.agents = blueprint.agents.slice(0, config.max_agents);

    ctx.emit('scene_blueprint_ready', { node, requestId, blueprint });
    ctx.emit('scene_generation_progress', { node, requestId, step: 'dsl', pct: 50 });

    // Step 2: Blueprint → DSL
    const dsl = blueprintToDSL(blueprint, config.compile_target);
    ctx.emit('scene_dsl_ready', { node, requestId, dsl });
    ctx.emit('scene_generation_progress', { node, requestId, step: 'compile', pct: 75 });

    // Step 3: Compile (emit event for compiler to pick up)
    const scene = {
      requestId,
      title: blueprint.title,
      description: blueprint.description,
      dsl,
      blueprint,
      target: config.compile_target,
      generatedAt: Date.now(),
    };

    state.activeGenerations.delete(requestId);
    state.totalGenerated++;

    ctx.emit('scene_compiled', { node, requestId, scene });
    ctx.emit('scene_generation_progress', { node, requestId, step: 'complete', pct: 100 });

    // Step 4: Optional auto-render
    if (config.auto_render) {
      state.totalRendered++;
      ctx.emit('render_submit', {
        scene: { id: requestId, data: dsl },
        quality: config.render_quality,
        frames: { start: 0, end: 0 },
      });
      ctx.emit('scene_render_queued', { node, requestId });
    }

    // Step 5: Optional auto-mint
    if (config.auto_mint) {
      state.totalMinted++;
      ctx.emit('scene_published', {
        sceneId: requestId,
        title: blueprint.title,
        description: blueprint.description,
      });
    }
  },

  _fromBlueprint(
    state: SpatialAgentState,
    node: HSPlusNode,
    config: SpatialAgentConfig,
    ctx: TraitContext,
    payload: Record<string, unknown>
  ): void {
    if (!payload?.blueprint) return;
    const requestId = payload.requestId ?? generateRequestId();
    // Clone and cap to config limits
// @ts-expect-error During migration
    const blueprint: SceneBlueprint = {
      ...payload.blueprint,
// @ts-expect-error During migration
      objects: (payload.blueprint.objects ?? []).slice(0, config.max_objects),
// @ts-expect-error During migration
      agents: (payload.blueprint.agents ?? []).slice(0, config.max_agents),
    };
    const dsl = blueprintToDSL(blueprint, config.compile_target);

    ctx.emit('scene_dsl_ready', { node, requestId, dsl });
    const scene = {
      requestId,
      title: blueprint.title,
      description: blueprint.description,
      dsl,
      blueprint,
      target: config.compile_target,
      generatedAt: Date.now(),
    };
    state.totalGenerated++;
    ctx.emit('scene_compiled', { node, requestId, scene });

    // Auto-render if configured
    if (config.auto_render) {
      state.totalRendered++;
      ctx.emit('render_submit', {
        scene: { id: requestId, data: dsl },
        quality: config.render_quality,
        frames: { start: 0, end: 0 },
      });
      ctx.emit('scene_render_queued', { node, requestId });
    }
  },
} as const;
