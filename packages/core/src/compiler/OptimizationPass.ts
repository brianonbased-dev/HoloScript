/**
 * HoloScript Auto-Optimization Compiler Pass
 *
 * Analyzes a compiled R3FNode tree (or HoloComposition AST) and produces
 * actionable optimization hints.  Each hint carries a severity, a human-readable
 * description, and the node ID it refers to.
 *
 * Categories:
 *   - LOD:        Auto-generate Level-of-Detail tiers
 *   - Culling:    Frustum / occlusion culling suggestions
 *   - Batching:   Static / instanced mesh batching opportunities
 *   - Textures:   VRAM budget warnings & compression suggestions
 *   - Shadows:    Shadow distance / cascade optimization
 *   - DrawCalls:  Merge-able draw-call groups
 *   - Overdraw:   Transparent / overlapping object warnings
 *
 * @version 1.0.0
 */

import type { R3FNode } from './R3FCompiler';

// =============================================================================
// TYPES
// =============================================================================

export type OptimizationCategory =
  | 'lod'
  | 'culling'
  | 'batching'
  | 'textures'
  | 'shadows'
  | 'drawcalls'
  | 'overdraw'
  | 'physics'
  | 'audio'
  | 'general';

export type OptimizationSeverity = 'info' | 'warning' | 'critical';

export interface OptimizationHint {
  category: OptimizationCategory;
  severity: OptimizationSeverity;
  message: string;
  nodeId?: string;
  nodeType?: string;
  suggestion?: string;
  estimatedSavings?: string;
}

export interface LODTier {
  distance: number;
  detail: 'high' | 'medium' | 'low' | 'billboard' | 'cull';
  polyReduction?: number; // percentage reduction from original
}

export interface LODRecommendation {
  nodeId: string;
  nodeType: string;
  tiers: LODTier[];
  reason: string;
}

export interface BatchGroup {
  material: string;
  nodeIds: string[];
  nodeCount: number;
  canInstance: boolean;
  canStaticBatch: boolean;
}

export interface OptimizationReport {
  hints: OptimizationHint[];
  lodRecommendations: LODRecommendation[];
  batchGroups: BatchGroup[];
  stats: SceneStats;
  score: number; // 0-100 optimization score
}

export interface SceneStats {
  totalNodes: number;
  meshCount: number;
  lightCount: number;
  textCount: number;
  groupCount: number;
  transparentCount: number;
  shadowCasterCount: number;
  shadowReceiverCount: number;
  rigidBodyCount: number;
  animatedCount: number;
  audioCount: number;
  uniqueMaterials: number;
  estimatedDrawCalls: number;
  estimatedTriangles: number;
  estimatedVRAM_MB: number;
}

export interface OptimizationOptions {
  /** Target platform affects budgets */
  platform?: 'desktop' | 'mobile' | 'vr' | 'ar';
  /** Max triangle budget */
  triangleBudget?: number;
  /** Max VRAM budget in MB */
  vramBudget_MB?: number;
  /** Max draw-call budget */
  drawCallBudget?: number;
  /** Max active lights */
  lightBudget?: number;
  /** Max shadow casters */
  shadowCasterBudget?: number;
  /** Enable LOD analysis */
  analyzeLOD?: boolean;
  /** Enable batching analysis */
  analyzeBatching?: boolean;
  /** Enable texture analysis */
  analyzeTextures?: boolean;
}

// =============================================================================
// DEFAULT BUDGETS PER PLATFORM
// =============================================================================

const PLATFORM_BUDGETS: Record<string, Partial<OptimizationOptions>> = {
  desktop: {
    triangleBudget: 2_000_000,
    vramBudget_MB: 2048,
    drawCallBudget: 3000,
    lightBudget: 16,
    shadowCasterBudget: 8,
  },
  mobile: {
    triangleBudget: 300_000,
    vramBudget_MB: 512,
    drawCallBudget: 200,
    lightBudget: 4,
    shadowCasterBudget: 2,
  },
  vr: {
    triangleBudget: 750_000,
    vramBudget_MB: 1024,
    drawCallBudget: 500,
    lightBudget: 8,
    shadowCasterBudget: 4,
  },
  ar: {
    triangleBudget: 500_000,
    vramBudget_MB: 768,
    drawCallBudget: 300,
    lightBudget: 6,
    shadowCasterBudget: 3,
  },
};

// Triangle estimates per geometry type
const TRI_ESTIMATES: Record<string, number> = {
  sphere: 2048,
  box: 12,
  cube: 12,
  cylinder: 128,
  cone: 64,
  plane: 2,
  torus: 2048,
  ring: 128,
  capsule: 256,
};

// VRAM estimates per material feature (MB)
const VRAM_PER_TEXTURE_MB = 4; // 1024x1024 RGBA
const VRAM_PER_HIRES_TEXTURE_MB = 16; // 2048x2048

// =============================================================================
// OPTIMIZATION PASS
// =============================================================================

export class OptimizationPass {
  private options: Required<OptimizationOptions>;

  constructor(options: OptimizationOptions = {}) {
    const platform = options.platform || 'desktop';
    const budgets = PLATFORM_BUDGETS[platform] || PLATFORM_BUDGETS.desktop;

    this.options = {
      platform,
      triangleBudget: options.triangleBudget ?? budgets.triangleBudget ?? 2_000_000,
      vramBudget_MB: options.vramBudget_MB ?? budgets.vramBudget_MB ?? 2048,
      drawCallBudget: options.drawCallBudget ?? budgets.drawCallBudget ?? 3000,
      lightBudget: options.lightBudget ?? budgets.lightBudget ?? 16,
      shadowCasterBudget: options.shadowCasterBudget ?? budgets.shadowCasterBudget ?? 8,
      analyzeLOD: options.analyzeLOD ?? true,
      analyzeBatching: options.analyzeBatching ?? true,
      analyzeTextures: options.analyzeTextures ?? true,
    };
  }

  /**
   * Run the full optimization analysis on an R3FNode tree.
   */
  analyze(tree: R3FNode): OptimizationReport {
    const hints: OptimizationHint[] = [];
    const lodRecommendations: LODRecommendation[] = [];
    const batchGroups: BatchGroup[] = [];

    // Gather scene statistics
    const stats = this.gatherStats(tree);

    // Run analyses
    this.analyzeLights(tree, stats, hints);
    this.analyzeShadows(tree, stats, hints);
    this.analyzeDrawCalls(stats, hints);
    this.analyzeTriangleBudget(stats, hints);
    this.analyzeVRAM(stats, hints);
    this.analyzeTransparency(tree, hints);
    this.analyzePhysics(tree, stats, hints);
    this.analyzeAudioSpatial(tree, hints);

    if (this.options.analyzeLOD) {
      this.analyzeLODOpportunities(tree, lodRecommendations, hints);
    }

    if (this.options.analyzeBatching) {
      this.analyzeBatchingOpportunities(tree, batchGroups, hints);
    }

    if (this.options.analyzeTextures) {
      this.analyzeTextureOptimizations(tree, hints);
    }

    // Calculate optimization score
    const score = this.calculateScore(stats, hints);

    return { hints, lodRecommendations, batchGroups, stats, score };
  }

  /**
   * Run optimization analysis directly on a HoloComposition AST.
   * This is a convenience method that compiles first, then analyzes.
   */
  analyzeComposition(composition: unknown, compiler: unknown): OptimizationReport {
    const tree = compiler.compileComposition(composition);
    return this.analyze(tree);
  }

  // ─── Scene Statistics ──────────────────────────────────────────────────

  private gatherStats(tree: R3FNode): SceneStats {
    const stats: SceneStats = {
      totalNodes: 0,
      meshCount: 0,
      lightCount: 0,
      textCount: 0,
      groupCount: 0,
      transparentCount: 0,
      shadowCasterCount: 0,
      shadowReceiverCount: 0,
      rigidBodyCount: 0,
      animatedCount: 0,
      audioCount: 0,
      uniqueMaterials: 0,
      estimatedDrawCalls: 0,
      estimatedTriangles: 0,
      estimatedVRAM_MB: 0,
    };

    const materialKeys = new Set<string>();
    this.walkTree(tree, (node) => {
      stats.totalNodes++;

      if (node.type === 'mesh') {
        stats.meshCount++;
        stats.estimatedDrawCalls++;

        // Estimate triangles
        const hsType = node.props?.hsType || 'box';
        stats.estimatedTriangles += TRI_ESTIMATES[hsType] || 12;

        // Track materials
        const matProps = node.props?.materialProps;
        if (matProps) {
          const matKey = JSON.stringify(matProps);
          materialKeys.add(matKey);

          if (matProps.transparent || matProps.opacity < 1 || matProps.transmission) {
            stats.transparentCount++;
          }

          // VRAM for textures
          const textureKeys = [
            'map',
            'normalMap',
            'roughnessMap',
            'metalnessMap',
            'emissiveMap',
            'aoMap',
          ];
          for (const tk of textureKeys) {
            if (matProps[tk]) stats.estimatedVRAM_MB += VRAM_PER_TEXTURE_MB;
          }
        }

        if (node.props?.castShadow) stats.shadowCasterCount++;
        if (node.props?.receiveShadow) stats.shadowReceiverCount++;
        if (node.props?.rigidBody) stats.rigidBodyCount++;
        if (node.props?.animated) stats.animatedCount++;
      }

      if (node.type === 'gltfModel') {
        stats.meshCount++;
        stats.estimatedDrawCalls += 5; // GLTF models typically have multiple draw calls
        stats.estimatedTriangles += 5000; // Conservative estimate for GLTF
        stats.estimatedVRAM_MB += VRAM_PER_HIRES_TEXTURE_MB;
      }

      if (node.type.toLowerCase().includes('light')) {
        stats.lightCount++;
      }

      if (node.type === 'Text') {
        stats.textCount++;
        stats.estimatedDrawCalls++;
      }

      if (node.type === 'group') {
        stats.groupCount++;
      }

      if (node.type === 'Audio') {
        stats.audioCount++;
      }
    });

    stats.uniqueMaterials = materialKeys.size;

    // Base VRAM for framebuffer, depth, etc.
    stats.estimatedVRAM_MB += 32; // base overhead

    return stats;
  }

  // ─── Light Analysis ────────────────────────────────────────────────────

  private analyzeLights(tree: R3FNode, stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.lightCount > this.options.lightBudget) {
      hints.push({
        category: 'general',
        severity: stats.lightCount > this.options.lightBudget * 1.5 ? 'critical' : 'warning',
        message: `Scene has ${stats.lightCount} lights (budget: ${this.options.lightBudget})`,
        suggestion:
          'Bake static lights, merge area lights, or use light probes for indirect lighting',
        estimatedSavings: `${stats.lightCount - this.options.lightBudget} fewer real-time lights`,
      });
    }

    // Check for redundant ambient lights
    const ambientLights: R3FNode[] = [];
    this.walkTree(tree, (node) => {
      if (node.type === 'ambientLight') ambientLights.push(node);
    });
    if (ambientLights.length > 1) {
      hints.push({
        category: 'general',
        severity: 'warning',
        message: `${ambientLights.length} ambient lights found — only one is needed`,
        suggestion: 'Merge ambient lights into a single light with combined intensity',
      });
    }
  }

  // ─── Shadow Analysis ───────────────────────────────────────────────────

  private analyzeShadows(tree: R3FNode, stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.shadowCasterCount > this.options.shadowCasterBudget) {
      hints.push({
        category: 'shadows',
        severity: 'warning',
        message: `${stats.shadowCasterCount} shadow casters (budget: ${this.options.shadowCasterBudget})`,
        suggestion: 'Disable castShadow on small or distant objects; use shadow LOD',
        estimatedSavings: `~${(stats.shadowCasterCount - this.options.shadowCasterBudget) * 0.5}ms per frame`,
      });
    }

    // Check for objects with shadows but no receiver nearby
    this.walkTree(tree, (node) => {
      if (node.type === 'mesh' && node.props?.castShadow && !node.props?.receiveShadow) {
        const size = node.props?.size || node.props?.args?.[0] || 1;
        if (typeof size === 'number' && size < 0.3) {
          hints.push({
            category: 'shadows',
            severity: 'info',
            nodeId: node.id,
            nodeType: node.type,
            message: `Small object "${node.id}" casts shadows — consider disabling`,
            suggestion: 'Small objects rarely need to cast shadows; disable castShadow',
          });
        }
      }
    });
  }

  // ─── Draw Call Analysis ────────────────────────────────────────────────

  private analyzeDrawCalls(stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.estimatedDrawCalls > this.options.drawCallBudget) {
      hints.push({
        category: 'drawcalls',
        severity: 'critical',
        message: `Estimated ${stats.estimatedDrawCalls} draw calls (budget: ${this.options.drawCallBudget})`,
        suggestion:
          'Use instanced meshes for repeated geometry, batch static objects, merge materials',
        estimatedSavings: `~${stats.estimatedDrawCalls - this.options.drawCallBudget} draw calls`,
      });
    } else if (stats.estimatedDrawCalls > this.options.drawCallBudget * 0.75) {
      hints.push({
        category: 'drawcalls',
        severity: 'warning',
        message: `Draw calls at ${Math.round((stats.estimatedDrawCalls / this.options.drawCallBudget) * 100)}% of budget`,
        suggestion: 'Consider batching static geometry to stay within budget',
      });
    }
  }

  // ─── Triangle Budget Analysis ──────────────────────────────────────────

  private analyzeTriangleBudget(stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.estimatedTriangles > this.options.triangleBudget) {
      hints.push({
        category: 'lod',
        severity: 'critical',
        message: `Estimated ${stats.estimatedTriangles.toLocaleString()} triangles (budget: ${this.options.triangleBudget.toLocaleString()})`,
        suggestion: 'Add LOD levels, reduce tessellation, or simplify distant geometry',
        estimatedSavings: `${(stats.estimatedTriangles - this.options.triangleBudget).toLocaleString()} triangles`,
      });
    }
  }

  // ─── VRAM Analysis ─────────────────────────────────────────────────────

  private analyzeVRAM(stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.estimatedVRAM_MB > this.options.vramBudget_MB) {
      hints.push({
        category: 'textures',
        severity: 'critical',
        message: `Estimated VRAM usage: ${stats.estimatedVRAM_MB}MB (budget: ${this.options.vramBudget_MB}MB)`,
        suggestion: 'Compress textures (BCn/ETC2/ASTC), reduce resolution, atlas small textures',
        estimatedSavings: `~${stats.estimatedVRAM_MB - this.options.vramBudget_MB}MB VRAM`,
      });
    }
  }

  // ─── Transparency Analysis ─────────────────────────────────────────────

  private analyzeTransparency(tree: R3FNode, hints: OptimizationHint[]): void {
    if (this.options.platform === 'vr' || this.options.platform === 'mobile') {
      const transparentNodes: R3FNode[] = [];
      this.walkTree(tree, (node) => {
        const mat = node.props?.materialProps;
        if (
          mat &&
          (mat.transparent || mat.transmission || (mat.opacity !== undefined && mat.opacity < 1))
        ) {
          transparentNodes.push(node);
        }
      });

      if (transparentNodes.length > 3) {
        hints.push({
          category: 'overdraw',
          severity: 'warning',
          message: `${transparentNodes.length} transparent objects — costly on ${this.options.platform}`,
          suggestion:
            'Minimize transparent objects on VR/mobile; use alpha-cutout instead of alpha-blend',
          estimatedSavings: 'Reduced GPU overdraw, better frame timing',
        });
      }
    }
  }

  // ─── Physics Analysis ──────────────────────────────────────────────────

  private analyzePhysics(tree: R3FNode, stats: SceneStats, hints: OptimizationHint[]): void {
    if (stats.rigidBodyCount > 50) {
      hints.push({
        category: 'physics',
        severity: 'warning',
        message: `${stats.rigidBodyCount} rigid bodies — physics solver may struggle`,
        suggestion: 'Sleep distant bodies, use simpler colliders, or reduce active body count',
      });
    }

    // Check for animated + physics (common source of jitter)
    this.walkTree(tree, (node) => {
      if (node.props?.animated && node.props?.rigidBody) {
        hints.push({
          category: 'physics',
          severity: 'info',
          nodeId: node.id,
          message: `"${node.id}" has both animation and physics — may cause jitter`,
          suggestion: 'Use kinematic body type for animated physics objects',
        });
      }
    });
  }

  // ─── Audio Analysis ────────────────────────────────────────────────────

  private analyzeAudioSpatial(tree: R3FNode, hints: OptimizationHint[]): void {
    const audioNodes: R3FNode[] = [];
    this.walkTree(tree, (node) => {
      if (node.type === 'Audio') audioNodes.push(node);
    });

    const spatialAudio = audioNodes.filter((n) => n.props?.spatial === true);
    if (spatialAudio.length > 8) {
      hints.push({
        category: 'audio',
        severity: 'warning',
        message: `${spatialAudio.length} spatial audio sources — high CPU overhead`,
        suggestion: 'Pool spatial audio sources, limit simultaneous spatial sounds to 6-8',
      });
    }
  }

  // ─── LOD Analysis ──────────────────────────────────────────────────────

  private analyzeLODOpportunities(
    tree: R3FNode,
    recommendations: LODRecommendation[],
    hints: OptimizationHint[]
  ): void {
    this.walkTree(tree, (node) => {
      if (node.type !== 'mesh' && node.type !== 'gltfModel') return;

      const hsType = node.props?.hsType || 'box';
      const triEstimate = node.type === 'gltfModel' ? 5000 : TRI_ESTIMATES[hsType] || 12;

      // Only recommend LOD for high-poly objects
      if (triEstimate >= 500) {
        const tiers: LODTier[] = [
          { distance: 0, detail: 'high' },
          { distance: 15, detail: 'medium', polyReduction: 50 },
          { distance: 30, detail: 'low', polyReduction: 75 },
          { distance: 60, detail: 'billboard', polyReduction: 95 },
          { distance: 100, detail: 'cull' },
        ];

        recommendations.push({
          nodeId: node.id || 'unnamed',
          nodeType: hsType,
          tiers,
          reason: `${triEstimate} estimated triangles — LOD reduces GPU load at distance`,
        });
      }
    });

    if (recommendations.length > 0) {
      hints.push({
        category: 'lod',
        severity: 'info',
        message: `${recommendations.length} objects would benefit from LOD`,
        suggestion: 'Auto-generate LOD tiers using HoloScript @lod trait or compiler flag',
        estimatedSavings: `Up to ${Math.round(recommendations.length * 0.6)}x triangle reduction at distance`,
      });
    }
  }

  // ─── Batching Analysis ─────────────────────────────────────────────────

  private analyzeBatchingOpportunities(
    tree: R3FNode,
    groups: BatchGroup[],
    hints: OptimizationHint[]
  ): void {
    const materialGroups = new Map<string, { nodes: R3FNode[]; canInstance: boolean }>();

    this.walkTree(tree, (node) => {
      if (node.type !== 'mesh') return;

      const matProps = node.props?.materialProps;
      const matKey = matProps ? JSON.stringify(matProps) : '__default';
      const hsType = node.props?.hsType || 'box';

      if (!materialGroups.has(matKey)) {
        materialGroups.set(matKey, { nodes: [], canInstance: true });
      }

      const group = materialGroups.get(matKey)!;
      group.nodes.push(node);

      // Instance-able only if same geometry type
      if (group.nodes.length > 1) {
        const firstType = group.nodes[0].props?.hsType || 'box';
        if (firstType !== hsType) group.canInstance = false;
      }
    });

    for (const [matKey, { nodes, canInstance }] of materialGroups) {
      if (nodes.length < 2) continue;

      const isStatic = nodes.every((n) => !n.props?.animated && !n.props?.rigidBody);

      groups.push({
        material: matKey === '__default' ? 'default' : `custom_${groups.length}`,
        nodeIds: nodes.map((n) => n.id || 'unnamed'),
        nodeCount: nodes.length,
        canInstance,
        canStaticBatch: isStatic,
      });
    }

    const batchableCount = groups.reduce((sum, g) => sum + g.nodeCount, 0);
    if (batchableCount > 3) {
      hints.push({
        category: 'batching',
        severity: 'info',
        message: `${batchableCount} meshes across ${groups.length} batch groups — potential for draw call reduction`,
        suggestion: 'Enable auto-batching: static meshes with same material can be merged',
        estimatedSavings: `~${batchableCount - groups.length} fewer draw calls`,
      });
    }
  }

  // ─── Texture Optimization Analysis ─────────────────────────────────────

  private analyzeTextureOptimizations(tree: R3FNode, hints: OptimizationHint[]): void {
    const materialNodes: R3FNode[] = [];
    this.walkTree(tree, (node) => {
      if (node.props?.materialProps) materialNodes.push(node);
    });

    // Check for uncompressed textures suggestion
    if (materialNodes.length > 5) {
      const platformFormat =
        this.options.platform === 'mobile'
          ? 'ETC2/ASTC'
          : this.options.platform === 'vr'
            ? 'ASTC'
            : 'BCn (DXT)';
      hints.push({
        category: 'textures',
        severity: 'info',
        message: `${materialNodes.length} materials found — ensure textures use ${platformFormat} compression`,
        suggestion: `Use ${platformFormat} texture compression for ${this.options.platform} target`,
      });
    }

    // High-res material presets that could use mipmaps
    const highDetailMaterials = materialNodes.filter((n) => {
      const mat = n.props?.materialProps;
      return mat && (mat.iridescence || mat.clearcoat || mat.transmission);
    });

    if (highDetailMaterials.length > 2) {
      hints.push({
        category: 'textures',
        severity: 'info',
        message: `${highDetailMaterials.length} complex PBR materials (iridescence/clearcoat/transmission)`,
        suggestion:
          'Complex PBR features are GPU-intensive; consider simpler materials at distance',
      });
    }
  }

  // ─── Score Calculation ─────────────────────────────────────────────────

  private calculateScore(stats: SceneStats, hints: OptimizationHint[]): number {
    let score = 100;

    // Deduct for critical issues
    const criticalCount = hints.filter((h) => h.severity === 'critical').length;
    const warningCount = hints.filter((h) => h.severity === 'warning').length;

    score -= criticalCount * 20;
    score -= warningCount * 5;

    // Budget ratio penalties
    const triRatio = stats.estimatedTriangles / this.options.triangleBudget;
    if (triRatio > 1) score -= Math.min(20, Math.round((triRatio - 1) * 20));

    const drawRatio = stats.estimatedDrawCalls / this.options.drawCallBudget;
    if (drawRatio > 1) score -= Math.min(20, Math.round((drawRatio - 1) * 20));

    const vramRatio = stats.estimatedVRAM_MB / this.options.vramBudget_MB;
    if (vramRatio > 1) score -= Math.min(20, Math.round((vramRatio - 1) * 20));

    return Math.max(0, Math.min(100, score));
  }

  // ─── Tree Walker ───────────────────────────────────────────────────────

  private walkTree(node: R3FNode, visitor: (node: R3FNode) => void): void {
    visitor(node);
    if (node.children) {
      for (const child of node.children) {
        this.walkTree(child, visitor);
      }
    }
  }
}
