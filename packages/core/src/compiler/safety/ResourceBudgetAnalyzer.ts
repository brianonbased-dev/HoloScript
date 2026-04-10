/**
 * @fileoverview Resource Budget Analyzer — Compile-Time Resource Bounds
 * @module @holoscript/core/compiler/safety
 *
 * Uses abstract interpretation to bound resource usage at compile time.
 * Detects per-frame budget violations before code runs.
 *
 * Extends GaussianBudgetValidator with general resource categories:
 * particles, physics bodies, audio sources, network messages, memory.
 *
 * @version 1.0.0
 */

import { EffectRow, VREffect, EffectCategory } from '../../types/effects';

// =============================================================================
// BUDGET DEFINITIONS
// =============================================================================

/** Resource categories tracked by the budget analyzer */
export type ResourceCategory =
  | 'particles' // Active particle systems
  | 'physicsBodies' // Active rigidbodies/colliders
  | 'audioSources' // Playing audio sources
  | 'meshInstances' // Rendered mesh instances
  | 'gaussians' // Gaussian splat primitives
  | 'shaderPasses' // Custom shader passes
  | 'networkMsgs' // Network messages per second
  | 'agentCount' // Active AI agents
  | 'memoryMB' // Estimated memory usage (MB)
  | 'gpuDrawCalls'; // Estimated draw calls

/** Per-platform resource limits */
export interface PlatformBudget {
  platform: string;
  limits: Partial<Record<ResourceCategory, number>>;
}

/** Pre-defined platform budgets */
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

// =============================================================================
// RESOURCE COST TABLE
// =============================================================================

/** Cost of each trait in resource units */
export const TRAIT_RESOURCE_COSTS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  // ── Core Rendering ──
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

  // ── Particles & VFX ──
  '@particle': { particles: 100, gpuDrawCalls: 1, memoryMB: 2 },
  '@vfx': { particles: 200, shaderPasses: 1, gpuDrawCalls: 2 },
  '@volumetric': { gpuDrawCalls: 3, shaderPasses: 2, memoryMB: 4 },
  '@volumetric_window': { gpuDrawCalls: 2, memoryMB: 2 },

  // ── Gaussian Splatting & Neural ──
  // NOTE: These are *per-trait-instance* defaults. For compositions with explicit
  // max_splats config, GaussianBudgetAnalyzer (used by ExportManager) reads the
  // actual declared count. These values serve as conservative fallbacks when no
  // composition AST is available (e.g., trait-only safety checks).
  // See: GaussianBudgetAnalyzer.ts DEFAULT_MAX_SPLATS = 1_000_000 for unconfigured splats.
  '@gaussian': { gaussians: 100_000, memoryMB: 10 },
  '@gaussian_splat': { gaussians: 100_000, memoryMB: 10 },
  '@multiview_gaussian_renderer': { gaussians: 200_000, memoryMB: 20, gpuDrawCalls: 4 },
  '@nerf': { gpuDrawCalls: 4, memoryMB: 16, shaderPasses: 2 },

  // ── Physics & Simulation ──
  '@physics': { physicsBodies: 1 },
  '@rigidbody': { physicsBodies: 1 },
  '@collider': { physicsBodies: 1 },
  '@joint': { physicsBodies: 2 },
  '@trigger': { physicsBodies: 1 },
  '@fluid_simulation': { particles: 500, physicsBodies: 10, memoryMB: 8 },
  '@advanced_cloth': { particles: 200, physicsBodies: 5, memoryMB: 4 },
  '@granular_material': { particles: 300, physicsBodies: 8, memoryMB: 6 },
  '@voronoi_fracture': { physicsBodies: 20, meshInstances: 20, memoryMB: 4 },

  // ── Audio ──
  '@audio': { audioSources: 1 },
  '@spatial_audio': { audioSources: 1 },
  '@environmental_audio': { audioSources: 4, memoryMB: 2 },
  '@voice_mesh': { audioSources: 1, networkMsgs: 10 },
  '@voice_input': { audioSources: 1, memoryMB: 1 },
  '@voice_output': { audioSources: 1, memoryMB: 1 },
  '@lip_sync': { memoryMB: 2, gpuDrawCalls: 1 },
  '@ambisonics': { audioSources: 4, memoryMB: 4 },

  // ── Networking & Multiplayer ──
  '@networked': { networkMsgs: 1 },
  '@networked_avatar': { networkMsgs: 10, meshInstances: 1, memoryMB: 2 },
  '@lobby': { networkMsgs: 5, memoryMB: 2 },
  '@mqtt_sink': { networkMsgs: 5 },
  '@mqtt_source': { networkMsgs: 5 },
  '@sync_tier': { networkMsgs: 2 },
  '@crdt_room': { networkMsgs: 10, memoryMB: 4 },
  '@shareplay': { networkMsgs: 5, memoryMB: 2 },

  // ── AI & Agents ──
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

  // ── Animation & Character ──
  '@animation': { gpuDrawCalls: 1, memoryMB: 2 },
  '@skeleton': { gpuDrawCalls: 1, memoryMB: 1 },
  '@ik': { memoryMB: 1 },
  '@morph': { gpuDrawCalls: 1, memoryMB: 1 },
  '@character': { physicsBodies: 1, meshInstances: 1, gpuDrawCalls: 2, memoryMB: 4 },
  '@emotion_directive': { memoryMB: 1 },
  '@dialog': { memoryMB: 2 },

  // ── Spatial & XR ──
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

  // ── IoT & Infrastructure ──
  '@wot_thing': { networkMsgs: 2, memoryMB: 1 },
  '@urdf_robot': { physicsBodies: 10, meshInstances: 10, memoryMB: 4 },
  '@computer_use': { memoryMB: 4 },
  '@pid_controller': { memoryMB: 0.5 },
  '@biofeedback': { memoryMB: 1 },
};

/** Cost of each built-in function call (per invocation) */
export const BUILTIN_RESOURCE_COSTS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  spawn: { meshInstances: 1, gpuDrawCalls: 1, memoryMB: 0.5 },
  clone: { meshInstances: 1, gpuDrawCalls: 1, memoryMB: 0.5 },
  createParticleSystem: { particles: 500, gpuDrawCalls: 1, memoryMB: 5 },
  spawnAgent: { agentCount: 1, memoryMB: 5 },
  playSound: { audioSources: 1 },
  playSpatial: { audioSources: 1 },
  compileShader: { shaderPasses: 1 },
  allocateBuffer: { memoryMB: 1 },
};

// =============================================================================
// BUDGET ANALYZER
// =============================================================================

/** A budget diagnostic */
export interface BudgetDiagnostic {
  category: ResourceCategory;
  estimated: number;
  limit: number;
  platform: string;
  usagePercent: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  contributors: { name: string; cost: number }[];
}

/** Result of budget analysis */
export interface BudgetAnalysisResult {
  diagnostics: BudgetDiagnostic[];
  passed: boolean;
  totals: Partial<Record<ResourceCategory, number>>;
  platformStatus: Map<string, { exceeded: boolean; worstCategory: string; worstPercent: number }>;
}

/** A resource usage entry from the AST */
export interface ResourceUsageNode {
  name: string;
  traits: string[];
  calls: string[];
  count: number; // How many instances (e.g., in a loop or array)
  /**
   * V11 (L4 Blueprint 4): Optional trait config overrides from composition AST.
   * When present, these override TRAIT_RESOURCE_COSTS defaults with actual
   * declared values (e.g., max_splats for @gaussian_splat).
   *
   * This reconciles the contradiction between ResourceBudgetAnalyzer (flat 100K
   * default for @gaussian_splat) and GaussianBudgetAnalyzer (reads actual
   * max_splats from trait config, potentially 500K+). Without this, a composition
   * with max_splats:500000 PASSES safety analysis at 5.6% utilization while
   * FAILING gaussian budget at 278% of Quest 3's limit.
   */
  traitConfigs?: Record<string, Record<string, number>>;
}

export class ResourceBudgetAnalyzer {
  private targetPlatforms: string[];
  private warningThreshold: number;

  constructor(config: { targetPlatforms?: string[]; warningThreshold?: number } = {}) {
    this.targetPlatforms = config.targetPlatforms || ['quest3', 'webgpu'];
    this.warningThreshold = config.warningThreshold || 0.8;
  }

  /**
   * Analyze resource usage for a set of AST nodes against platform budgets.
   */
  analyze(nodes: ResourceUsageNode[]): BudgetAnalysisResult {
    // 1. Sum up resource costs from all nodes
    const totals: Record<string, number> = {};
    const contributors: Record<string, { name: string; cost: number }[]> = {};

    for (const node of nodes) {
      const instanceCount = node.count || 1;

      // Trait costs
      for (const trait of node.traits) {
        const normalized = trait.startsWith('@') ? trait : `@${trait}`;
        const defaults = TRAIT_RESOURCE_COSTS[normalized];
        if (defaults) {
          // V11 (L4 Blueprint 4): Use actual trait config values when available.
          // This reconciles ResourceBudgetAnalyzer (flat defaults) with
          // GaussianBudgetAnalyzer (reads actual max_splats from config).
          const traitConfig = node.traitConfigs?.[normalized] || node.traitConfigs?.[trait];
          const costs = traitConfig ? { ...defaults } : defaults;
          if (traitConfig) {
            // Override gaussian count with actual max_splats from trait config
            if (traitConfig.max_splats !== undefined && 'gaussians' in costs) {
              (costs as Record<string, number>).gaussians = traitConfig.max_splats;
            }
            // Override particle count with actual config
            if (traitConfig.max_particles !== undefined && 'particles' in costs) {
              (costs as Record<string, number>).particles = traitConfig.max_particles;
            }
            // Override memory with actual config
            if (traitConfig.memory_mb !== undefined && 'memoryMB' in costs) {
              (costs as Record<string, number>).memoryMB = traitConfig.memory_mb;
            }
          }

          for (const [cat, cost] of Object.entries(costs)) {
            const total = (cost as number) * instanceCount;
            totals[cat] = (totals[cat] || 0) + total;
            if (!contributors[cat]) contributors[cat] = [];
            contributors[cat].push({ name: `${node.name}/${normalized}`, cost: total });
          }
        }
      }

      // Builtin costs
      for (const fn of node.calls) {
        const costs = BUILTIN_RESOURCE_COSTS[fn];
        if (costs) {
          for (const [cat, cost] of Object.entries(costs)) {
            const total = (cost as number) * instanceCount;
            totals[cat] = (totals[cat] || 0) + total;
            if (!contributors[cat]) contributors[cat] = [];
            contributors[cat].push({ name: `${node.name}/${fn}()`, cost: total });
          }
        }
      }
    }

    // 2. Check against platform budgets
    const diagnostics: BudgetDiagnostic[] = [];
    const platformStatus = new Map<
      string,
      { exceeded: boolean; worstCategory: string; worstPercent: number }
    >();

    for (const platform of this.targetPlatforms) {
      const limits = PLATFORM_BUDGETS[platform];
      if (!limits) continue;

      let worstPercent = 0;
      let worstCategory = '';
      let exceeded = false;

      for (const [cat, limit] of Object.entries(limits)) {
        const estimated = totals[cat] || 0;
        const percent = estimated / (limit as number);

        if (percent > worstPercent) {
          worstPercent = percent;
          worstCategory = cat;
        }

        if (percent > 1) {
          exceeded = true;
          diagnostics.push({
            category: cat as ResourceCategory,
            estimated,
            limit: limit as number,
            platform,
            usagePercent: percent * 100,
            severity: 'error',
            message: `Budget exceeded: ${cat} uses ${estimated} / ${limit} (${(percent * 100).toFixed(0)}%) on ${platform}`,
            contributors: (contributors[cat] || []).sort((a, b) => b.cost - a.cost).slice(0, 5),
          });
        } else if (percent > this.warningThreshold) {
          diagnostics.push({
            category: cat as ResourceCategory,
            estimated,
            limit: limit as number,
            platform,
            usagePercent: percent * 100,
            severity: 'warning',
            message: `Budget warning: ${cat} at ${(percent * 100).toFixed(0)}% (${estimated}/${limit}) on ${platform}`,
            contributors: (contributors[cat] || []).sort((a, b) => b.cost - a.cost).slice(0, 3),
          });
        }
      }

      platformStatus.set(platform, { exceeded, worstCategory, worstPercent: worstPercent * 100 });
    }

    return {
      diagnostics,
      passed: !diagnostics.some((d) => d.severity === 'error'),
      totals: totals as Partial<Record<ResourceCategory, number>>,
      platformStatus,
    };
  }
}
