/**
 * Type stubs for @holoscript/core types used by economy module.
 * Copied from core to avoid cross-package DTS resolution failures.
 * The real types come from @holoscript/core at runtime.
 *
 * Source: packages/core/src/compiler/safety/ResourceBudgetAnalyzer.ts
 * Source: packages/core/src/debug/TelemetryCollector.ts
 */

// =============================================================================
// TelemetryCollector (from core/debug/TelemetryCollector.ts)
// =============================================================================

export interface TelemetryCollector {
  record(event: Record<string, unknown>): unknown;
  recordEvent(
    type: string,
    agentId: string,
    data?: Record<string, unknown>,
    severity?: string,
  ): unknown;
  recordError(agentId: string, error: Error, context?: Record<string, unknown>): unknown;
  startSpan(name: string, options?: Record<string, unknown>): unknown;
  endSpan(spanId: string, status?: string, statusMessage?: string): unknown;
  flush(): Promise<void>;
  getStats(): Record<string, unknown>;
  setEnabled(enabled: boolean): void;
  configure(config: Record<string, unknown>): void;
  clear(): void;
  destroy(): void;
}

// =============================================================================
// ResourceBudgetAnalyzer types (from core/compiler/safety/ResourceBudgetAnalyzer.ts)
// =============================================================================

export interface ResourceBudgetConfig {
  maxTokens?: number;
  maxConcurrency?: number;
  maxCostUSD?: number;
  warningThresholdPercent?: number;
}

export interface BudgetStatus {
  tokensUsed: number;
  tokensRemaining: number;
  costUSD: number;
  utilizationPercent: number;
  isOverBudget: boolean;
}

export interface ResourceBudgetAnalyzer {
  checkBudget(config: ResourceBudgetConfig): BudgetStatus;
}

/** Resource categories tracked by the budget analyzer */
export type ResourceCategory =
  | 'particles'
  | 'physicsBodies'
  | 'audioSources'
  | 'meshInstances'
  | 'gaussians'
  | 'shaderPasses'
  | 'networkMsgs'
  | 'agentCount'
  | 'memoryMB'
  | 'gpuDrawCalls';

/** Pre-defined platform budgets (exact shape from core) */
export const PLATFORM_BUDGETS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  quest3: {
    particles: 5000,
    physicsBodies: 200,
    audioSources: 16,
    meshInstances: 500,
    gaussians: 180_000,
    shaderPasses: 4,
    networkMsgs: 60,
    agentCount: 10,
    memoryMB: 512,
    gpuDrawCalls: 200,
  },
  'desktop-vr': {
    particles: 50000,
    physicsBodies: 2000,
    audioSources: 64,
    meshInstances: 5000,
    gaussians: 2_000_000,
    shaderPasses: 16,
    networkMsgs: 200,
    agentCount: 50,
    memoryMB: 4096,
    gpuDrawCalls: 2000,
  },
  webgpu: {
    particles: 20000,
    physicsBodies: 500,
    audioSources: 32,
    meshInstances: 2000,
    gaussians: 500_000,
    shaderPasses: 8,
    networkMsgs: 100,
    agentCount: 20,
    memoryMB: 1024,
    gpuDrawCalls: 500,
  },
  'mobile-ar': {
    particles: 2000,
    physicsBodies: 50,
    audioSources: 8,
    meshInstances: 200,
    gaussians: 100_000,
    shaderPasses: 2,
    networkMsgs: 30,
    agentCount: 5,
    memoryMB: 256,
    gpuDrawCalls: 100,
  },
};

/** Cost of each trait in resource units (exact shape from core) */
export const TRAIT_RESOURCE_COSTS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  '@mesh': { meshInstances: 1, gpuDrawCalls: 1 },
  '@material': { shaderPasses: 1, gpuDrawCalls: 1, memoryMB: 0.5 },
  '@shader': { shaderPasses: 1, gpuDrawCalls: 1 },
  '@advanced_pbr': { shaderPasses: 2, gpuDrawCalls: 1, memoryMB: 1 },
  '@advanced_lighting': { gpuDrawCalls: 2, shaderPasses: 1 },
  '@advanced_texturing': { memoryMB: 2, gpuDrawCalls: 1 },
  '@light': { gpuDrawCalls: 1, shaderPasses: 1 },
  '@lighting': { gpuDrawCalls: 2, shaderPasses: 1 },
  '@global_illumination': { gpuDrawCalls: 4, shaderPasses: 3, memoryMB: 8 },
  '@ray_tracing': { gpuDrawCalls: 8, shaderPasses: 4, memoryMB: 16 },
  '@screen_space_effects': { shaderPasses: 2, gpuDrawCalls: 2 },
  '@subsurface_scattering': { shaderPasses: 2, gpuDrawCalls: 1 },
  '@rendering': { meshInstances: 1, gpuDrawCalls: 1, memoryMB: 1 },
  '@render_network': { gpuDrawCalls: 2, networkMsgs: 5, memoryMB: 4 },
  '@particle': { particles: 100, gpuDrawCalls: 1, memoryMB: 2 },
  '@vfx': { particles: 200, shaderPasses: 1, gpuDrawCalls: 2 },
  '@volumetric': { gpuDrawCalls: 3, shaderPasses: 2, memoryMB: 4 },
  '@volumetric_window': { gpuDrawCalls: 2, memoryMB: 2 },
  '@gaussian': { gaussians: 100_000, memoryMB: 10 },
  '@gaussian_splat': { gaussians: 100_000, memoryMB: 10 },
  '@multiview_gaussian_renderer': { gaussians: 200_000, memoryMB: 20, gpuDrawCalls: 4 },
  '@nerf': { gpuDrawCalls: 4, memoryMB: 16, shaderPasses: 2 },
  '@physics': { physicsBodies: 1 },
  '@rigidbody': { physicsBodies: 1 },
  '@collider': { physicsBodies: 1 },
  '@joint': { physicsBodies: 2 },
  '@trigger': { physicsBodies: 1 },
  '@fluid_simulation': { particles: 500, physicsBodies: 10, memoryMB: 8 },
  '@advanced_cloth': { particles: 200, physicsBodies: 5, memoryMB: 4 },
  '@granular_material': { particles: 300, physicsBodies: 8, memoryMB: 6 },
  '@voronoi_fracture': { physicsBodies: 20, meshInstances: 20, memoryMB: 4 },
  '@audio': { audioSources: 1 },
  '@spatial_audio': { audioSources: 1 },
  '@environmental_audio': { audioSources: 4, memoryMB: 2 },
  '@voice_mesh': { audioSources: 1, networkMsgs: 10 },
  '@voice_input': { audioSources: 1, memoryMB: 1 },
  '@voice_output': { audioSources: 1, memoryMB: 1 },
  '@lip_sync': { memoryMB: 2, gpuDrawCalls: 1 },
  '@ambisonics': { audioSources: 4, memoryMB: 4 },
  '@networked': { networkMsgs: 1 },
  '@networked_avatar': { networkMsgs: 10, meshInstances: 1, memoryMB: 2 },
  '@lobby': { networkMsgs: 5, memoryMB: 2 },
  '@mqtt_sink': { networkMsgs: 5 },
  '@mqtt_source': { networkMsgs: 5 },
  '@sync_tier': { networkMsgs: 2 },
  '@crdt_room': { networkMsgs: 10, memoryMB: 4 },
  '@shareplay': { networkMsgs: 5, memoryMB: 2 },
  '@agent': { agentCount: 1, memoryMB: 5 },
  '@npc': { agentCount: 1, memoryMB: 3, physicsBodies: 1 },
  '@npc_ai': { agentCount: 1, memoryMB: 8 },
  '@ai_npc_brain': { agentCount: 1, memoryMB: 10 },
  '@multi_agent': { agentCount: 3, memoryMB: 15 },
  '@agent_discovery': { agentCount: 1, memoryMB: 2 },
  '@neural_animation': { memoryMB: 8, gpuDrawCalls: 2 },
  '@neural_forge': { memoryMB: 16, agentCount: 1 },
  '@local_llm': { memoryMB: 32, agentCount: 1 },
  '@rag_knowledge': { memoryMB: 8 },
  '@embedding_search': { memoryMB: 4 },
  '@vector_db': { memoryMB: 8 },
  '@stable_diffusion': { memoryMB: 32, gpuDrawCalls: 1 },
  '@diffusion_realtime': { memoryMB: 16, gpuDrawCalls: 2 },
  '@vision': { memoryMB: 4 },
  '@pose_estimation': { memoryMB: 4, agentCount: 1 },
  '@object_tracking': { memoryMB: 4 },
  '@hand_mesh_ai': { memoryMB: 4, gpuDrawCalls: 1 },
  '@animation': { gpuDrawCalls: 1, memoryMB: 2 },
  '@skeleton': { gpuDrawCalls: 1, memoryMB: 1 },
  '@ik': { memoryMB: 1 },
  '@morph': { gpuDrawCalls: 1, memoryMB: 1 },
  '@character': { physicsBodies: 1, meshInstances: 1, gpuDrawCalls: 2, memoryMB: 4 },
  '@emotion_directive': { memoryMB: 1 },
  '@dialog': { memoryMB: 2 },
  '@scene_reconstruction': { meshInstances: 10, memoryMB: 8, gpuDrawCalls: 5 },
  '@realitykit_mesh': { meshInstances: 5, memoryMB: 4, gpuDrawCalls: 3 },
  '@openxr_hal': { memoryMB: 2 },
  '@spatial_navigation': { memoryMB: 2 },
  '@spatial_persona': { meshInstances: 1, memoryMB: 2, networkMsgs: 5 },
  '@spatial_awareness': { memoryMB: 2 },
  '@orbital': { physicsBodies: 1, memoryMB: 1 },
  '@grabbable': { physicsBodies: 1 },
  '@pressable': { physicsBodies: 1 },
  '@slidable': { physicsBodies: 1 },
  '@wot_thing': { networkMsgs: 2, memoryMB: 1 },
  '@urdf_robot': { physicsBodies: 10, meshInstances: 10, memoryMB: 4 },
  '@computer_use': { memoryMB: 4 },
  '@pid_controller': { memoryMB: 0.5 },
  '@biofeedback': { memoryMB: 1 },
};

/** A resource usage entry from the AST (exact shape from core) */
export interface ResourceUsageNode {
  name: string;
  traits: string[];
  calls: string[];
  count: number;
  traitConfigs?: Record<string, Record<string, number>>;
}
