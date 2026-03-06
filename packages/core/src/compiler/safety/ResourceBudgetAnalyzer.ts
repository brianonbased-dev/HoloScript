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
  | 'particles'     // Active particle systems
  | 'physicsBodies' // Active rigidbodies/colliders
  | 'audioSources'  // Playing audio sources
  | 'meshInstances' // Rendered mesh instances
  | 'gaussians'     // Gaussian splat primitives
  | 'shaderPasses'  // Custom shader passes
  | 'networkMsgs'   // Network messages per second
  | 'agentCount'    // Active AI agents
  | 'memoryMB'      // Estimated memory usage (MB)
  | 'gpuDrawCalls'; // Estimated draw calls

/** Per-platform resource limits */
export interface PlatformBudget {
  platform: string;
  limits: Partial<Record<ResourceCategory, number>>;
}

/** Pre-defined platform budgets */
export const PLATFORM_BUDGETS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  'quest3': {
    particles: 5000, physicsBodies: 200, audioSources: 16,
    meshInstances: 500, gaussians: 180_000, shaderPasses: 4,
    networkMsgs: 60, agentCount: 10, memoryMB: 512, gpuDrawCalls: 200,
  },
  'desktop-vr': {
    particles: 50000, physicsBodies: 2000, audioSources: 64,
    meshInstances: 5000, gaussians: 2_000_000, shaderPasses: 16,
    networkMsgs: 200, agentCount: 50, memoryMB: 4096, gpuDrawCalls: 2000,
  },
  'webgpu': {
    particles: 20000, physicsBodies: 500, audioSources: 32,
    meshInstances: 2000, gaussians: 500_000, shaderPasses: 8,
    networkMsgs: 100, agentCount: 20, memoryMB: 1024, gpuDrawCalls: 500,
  },
  'mobile-ar': {
    particles: 2000, physicsBodies: 50, audioSources: 8,
    meshInstances: 200, gaussians: 100_000, shaderPasses: 2,
    networkMsgs: 30, agentCount: 5, memoryMB: 256, gpuDrawCalls: 100,
  },
};

// =============================================================================
// RESOURCE COST TABLE
// =============================================================================

/** Cost of each trait in resource units */
export const TRAIT_RESOURCE_COSTS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  '@mesh':        { meshInstances: 1, gpuDrawCalls: 1 },
  '@particle':    { particles: 100, gpuDrawCalls: 1, memoryMB: 2 },
  '@physics':     { physicsBodies: 1 },
  '@rigidbody':   { physicsBodies: 1 },
  '@collider':    { physicsBodies: 1 },
  '@audio':       { audioSources: 1 },
  '@spatial_audio': { audioSources: 1 },
  '@light':       { gpuDrawCalls: 1, shaderPasses: 1 },
  '@shader':      { shaderPasses: 1, gpuDrawCalls: 1 },
  '@gaussian':    { gaussians: 10000, memoryMB: 10 },
  '@agent':       { agentCount: 1, memoryMB: 5 },
  '@npc':         { agentCount: 1, memoryMB: 3, physicsBodies: 1 },
  '@networked':   { networkMsgs: 1 },
  '@vfx':         { particles: 200, shaderPasses: 1, gpuDrawCalls: 2 },
};

/** Cost of each built-in function call (per invocation) */
export const BUILTIN_RESOURCE_COSTS: Record<string, Partial<Record<ResourceCategory, number>>> = {
  'spawn':            { meshInstances: 1, gpuDrawCalls: 1, memoryMB: 0.5 },
  'clone':            { meshInstances: 1, gpuDrawCalls: 1, memoryMB: 0.5 },
  'createParticleSystem': { particles: 500, gpuDrawCalls: 1, memoryMB: 5 },
  'spawnAgent':       { agentCount: 1, memoryMB: 5 },
  'playSound':        { audioSources: 1 },
  'playSpatial':      { audioSources: 1 },
  'compileShader':    { shaderPasses: 1 },
  'allocateBuffer':   { memoryMB: 1 },
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
        const costs = TRAIT_RESOURCE_COSTS[normalized];
        if (costs) {
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
    const platformStatus = new Map<string, { exceeded: boolean; worstCategory: string; worstPercent: number }>();

    for (const platform of this.targetPlatforms) {
      const limits = PLATFORM_BUDGETS[platform];
      if (!limits) continue;

      let worstPercent = 0;
      let worstCategory = '';
      let exceeded = false;

      for (const [cat, limit] of Object.entries(limits)) {
        const estimated = totals[cat] || 0;
        const percent = estimated / (limit as number);

        if (percent > worstPercent) { worstPercent = percent; worstCategory = cat; }

        if (percent > 1) {
          exceeded = true;
          diagnostics.push({
            category: cat as ResourceCategory, estimated, limit: limit as number, platform,
            usagePercent: percent * 100,
            severity: 'error',
            message: `Budget exceeded: ${cat} uses ${estimated} / ${limit} (${(percent * 100).toFixed(0)}%) on ${platform}`,
            contributors: (contributors[cat] || []).sort((a, b) => b.cost - a.cost).slice(0, 5),
          });
        } else if (percent > this.warningThreshold) {
          diagnostics.push({
            category: cat as ResourceCategory, estimated, limit: limit as number, platform,
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
      passed: !diagnostics.some(d => d.severity === 'error'),
      totals: totals as Partial<Record<ResourceCategory, number>>,
      platformStatus,
    };
  }
}
