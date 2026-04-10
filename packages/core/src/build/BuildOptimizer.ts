/**
 * BuildOptimizer — Minification, compression, and optimization passes
 *
 * Applies optimization passes to build assets including code minification,
 * texture compression, mesh decimation, and dead code elimination.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type OptimizationPass =
  | 'minify'
  | 'compress'
  | 'texture_compress'
  | 'mesh_decimate'
  | 'dead_code'
  | 'tree_shake'
  | 'inline_constants';

export interface OptimizationTarget {
  id: string;
  type: 'js' | 'css' | 'html' | 'texture' | 'mesh' | 'audio';
  originalSize: number;
  optimizedSize: number;
  passesApplied: OptimizationPass[];
  savings: number;
}

export interface OptimizationResult {
  targets: OptimizationTarget[];
  totalOriginalSize: number;
  totalOptimizedSize: number;
  totalSavings: number;
  savingsPercent: number;
  passesRun: OptimizationPass[];
  duration: number;
}

export interface OptimizerConfig {
  enabledPasses: OptimizationPass[];
  textureMaxSize: number;
  meshTargetReduction: number;
  minifyOptions: {
    removeComments: boolean;
    removeWhitespace: boolean;
    mangleNames: boolean;
  };
}

// =============================================================================
// COMPRESSION RATIOS (simulated)
// =============================================================================

const COMPRESSION_RATIOS: Record<OptimizationPass, Record<string, number>> = {
  minify: { js: 0.6, css: 0.7, html: 0.8 },
  compress: { js: 0.4, css: 0.5, html: 0.5, texture: 0.7, mesh: 0.6, audio: 0.8 },
  texture_compress: { texture: 0.3 },
  mesh_decimate: { mesh: 0.5 },
  dead_code: { js: 0.85 },
  tree_shake: { js: 0.75 },
  inline_constants: { js: 0.95 },
};

// =============================================================================
// BUILD OPTIMIZER
// =============================================================================

export class BuildOptimizer {
  private config: OptimizerConfig;
  private targets: Map<string, OptimizationTarget> = new Map();

  constructor(config: Partial<OptimizerConfig> = {}) {
    this.config = {
      enabledPasses: config.enabledPasses ?? ['minify', 'compress', 'dead_code'],
      textureMaxSize: config.textureMaxSize ?? 2048,
      meshTargetReduction: config.meshTargetReduction ?? 0.5,
      minifyOptions: config.minifyOptions ?? {
        removeComments: true,
        removeWhitespace: true,
        mangleNames: false,
      },
    };
  }

  /**
   * Add a target for optimization
   */
  addTarget(id: string, type: OptimizationTarget['type'], sizeBytes: number): void {
    this.targets.set(id, {
      id,
      type,
      originalSize: sizeBytes,
      optimizedSize: sizeBytes,
      passesApplied: [],
      savings: 0,
    });
  }

  /**
   * Apply a single optimization pass to a target
   */
  applyPass(targetId: string, pass: OptimizationPass): number {
    const target = this.targets.get(targetId);
    if (!target) return 0;

    const ratios = COMPRESSION_RATIOS[pass];
    const ratio = ratios[target.type];
    if (!ratio) return 0; // Pass doesn't apply to this type

    const before = target.optimizedSize;
    target.optimizedSize = Math.round(target.optimizedSize * ratio);
    target.passesApplied.push(pass);
    target.savings = target.originalSize - target.optimizedSize;

    return before - target.optimizedSize;
  }

  /**
   * Run all enabled passes on all targets
   */
  optimize(): OptimizationResult {
    const startTime = Date.now();

    for (const pass of this.config.enabledPasses) {
      for (const target of this.targets.values()) {
        this.applyPass(target.id, pass);
      }
    }

    const targets = [...this.targets.values()];
    const totalOriginal = targets.reduce((s, t) => s + t.originalSize, 0);
    const totalOptimized = targets.reduce((s, t) => s + t.optimizedSize, 0);
    const totalSavings = totalOriginal - totalOptimized;

    return {
      targets,
      totalOriginalSize: totalOriginal,
      totalOptimizedSize: totalOptimized,
      totalSavings,
      savingsPercent: totalOriginal > 0 ? Math.round((totalSavings / totalOriginal) * 100) : 0,
      passesRun: [...this.config.enabledPasses],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get a target by ID
   */
  getTarget(id: string): OptimizationTarget | undefined {
    return this.targets.get(id);
  }

  /**
   * Get target count
   */
  getTargetCount(): number {
    return this.targets.size;
  }

  /**
   * Get config
   */
  getConfig(): OptimizerConfig {
    return { ...this.config };
  }

  /**
   * Enable an optimization pass
   */
  enablePass(pass: OptimizationPass): void {
    if (!this.config.enabledPasses.includes(pass)) {
      this.config.enabledPasses.push(pass);
    }
  }

  /**
   * Disable an optimization pass
   */
  disablePass(pass: OptimizationPass): void {
    this.config.enabledPasses = this.config.enabledPasses.filter((p) => p !== pass);
  }
}
