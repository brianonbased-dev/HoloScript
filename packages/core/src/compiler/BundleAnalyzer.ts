/**
 * Bundle Analyzer - Comprehensive bundle analysis and optimization insights
 *
 * Sprint 4 Priority 5: Bundle Analyzer
 *
 * Features:
 * - Size analysis (raw, gzipped, minified)
 * - Module breakdown with dependency tree
 * - Duplicate detection
 * - Treeshaking opportunities
 * - Code splitting recommendations
 * - Performance metrics
 * - Visual report generation
 *
 * @version 1.0.0
 */

import { createHash } from 'crypto';

/**
 * Module information
 */
export interface ModuleInfo {
  id: string;
  path: string;
  size: number;
  gzipSize?: number;
  minifiedSize?: number;
  type: ModuleType;
  dependencies: string[];
  dependents: string[];
  isEntryPoint: boolean;
  isDynamicImport: boolean;
  exports: string[];
  unusedExports: string[];
  sideEffects: boolean;
  hash: string;
}

/**
 * Module types
 */
export type ModuleType =
  | 'holo'
  | 'template'
  | 'trait'
  | 'runtime'
  | 'external'
  | 'asset'
  | 'json'
  | 'unknown';

/**
 * Bundle chunk information
 */
export interface ChunkInfo {
  id: string;
  name: string;
  files: string[];
  modules: ModuleInfo[];
  size: number;
  gzipSize?: number;
  isEntry: boolean;
  isAsync: boolean;
  parentChunks: string[];
  childChunks: string[];
}

/**
 * Duplicate module info
 */
export interface DuplicateInfo {
  name: string;
  instances: Array<{
    path: string;
    version?: string;
    size: number;
  }>;
  totalWaste: number;
  recommendation: string;
}

/**
 * Treeshaking opportunity
 */
export interface TreeshakingOpportunity {
  module: string;
  unusedExports: string[];
  potentialSavings: number;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string;
}

/**
 * Code splitting recommendation
 */
export interface SplittingRecommendation {
  type: 'route' | 'vendor' | 'async' | 'common';
  modules: string[];
  currentSize: number;
  estimatedSavings: number;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalSize: number;
  totalGzipSize: number;
  initialLoadSize: number;
  asyncChunksSize: number;
  moduleCount: number;
  chunkCount: number;
  avgModuleSize: number;
  largestModule: { path: string; size: number };
  smallestModule: { path: string; size: number };
  duplicateWaste: number;
  unusedCodeSize: number;
}

/**
 * Analysis report
 */
export interface BundleAnalysisReport {
  timestamp: number;
  version: string;
  chunks: ChunkInfo[];
  modules: ModuleInfo[];
  duplicates: DuplicateInfo[];
  treeshakingOpportunities: TreeshakingOpportunity[];
  splittingRecommendations: SplittingRecommendation[];
  metrics: PerformanceMetrics;
  warnings: AnalysisWarning[];
  suggestions: string[];
}

/**
 * Analysis warning
 */
export interface AnalysisWarning {
  type: 'size' | 'duplicate' | 'circular' | 'unused' | 'sideeffects';
  severity: 'error' | 'warning' | 'info';
  message: string;
  modules?: string[];
  recommendation?: string;
}

/**
 * Analyzer options
 */
export interface BundleAnalyzerOptions {
  /** Size thresholds for warnings (in bytes) */
  sizeThresholds?: {
    module?: number; // default: 100KB
    chunk?: number; // default: 250KB
    total?: number; // default: 1MB
    initialLoad?: number; // default: 500KB
  };
  /** Enable gzip size estimation */
  estimateGzip?: boolean;
  /** Enable minified size estimation */
  estimateMinified?: boolean;
  /** Detect circular dependencies */
  detectCircular?: boolean;
  /** Track unused exports */
  trackUnusedExports?: boolean;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Bundle input for analysis
 */
export interface BundleInput {
  chunks: Array<{
    id: string;
    name: string;
    isEntry: boolean;
    isAsync: boolean;
    files: Array<{
      path: string;
      content: string;
      type?: ModuleType;
    }>;
  }>;
  dependencies?: Record<string, string[]>;
  exports?: Record<string, string[]>;
  usedExports?: Record<string, string[]>;
}

/**
 * Estimate gzip size (simplified)
 */
function estimateGzipSize(content: string): number {
  // Rough estimate: gzip typically achieves 60-80% compression on code
  // Use a conservative 70% compression ratio
  return Math.round(content.length * 0.3);
}

/**
 * Estimate minified size (simplified)
 */
function estimateMinifiedSize(content: string): number {
  // Rough estimate: minification typically removes 30-50% of code
  // Remove whitespace and comments for estimation
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const withoutWhitespace = withoutComments.replace(/\s+/g, ' ');
  return withoutWhitespace.length;
}

/**
 * Hash content
 */
function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

/**
 * Detect module type from path
 */
function detectModuleType(path: string): ModuleType {
  if (path.endsWith('.holo') || path.endsWith('.hsplus')) return 'holo';
  if (path.includes('template') || path.includes('Template')) return 'template';
  if (path.includes('trait') || path.includes('Trait')) return 'trait';
  if (path.includes('runtime') || path.includes('Runtime')) return 'runtime';
  if (path.includes('node_modules')) return 'external';
  if (path.endsWith('.json')) return 'json';
  if (/\.(png|jpg|svg|gltf|glb)$/i.test(path)) return 'asset';
  return 'unknown';
}

/**
 * Bundle Analyzer
 */
export class BundleAnalyzer {
  private options: Required<BundleAnalyzerOptions>;
  private modules: Map<string, ModuleInfo> = new Map();
  private chunks: Map<string, ChunkInfo> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();

  constructor(options: BundleAnalyzerOptions = {}) {
    this.options = {
      sizeThresholds: {
        module: options.sizeThresholds?.module ?? 100 * 1024,
        chunk: options.sizeThresholds?.chunk ?? 250 * 1024,
        total: options.sizeThresholds?.total ?? 1024 * 1024,
        initialLoad: options.sizeThresholds?.initialLoad ?? 500 * 1024,
      },
      estimateGzip: options.estimateGzip ?? true,
      estimateMinified: options.estimateMinified ?? true,
      detectCircular: options.detectCircular ?? true,
      trackUnusedExports: options.trackUnusedExports ?? true,
      debug: options.debug ?? false,
    };
  }

  /**
   * Analyze a bundle
   */
  analyze(input: BundleInput): BundleAnalysisReport {
    // Reset state
    this.modules.clear();
    this.chunks.clear();
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    // Process chunks and modules
    this.processChunks(input);

    // Build dependency graphs
    this.buildDependencyGraphs(input.dependencies ?? {});

    // Calculate unused exports
    if (this.options.trackUnusedExports && input.usedExports) {
      this.calculateUnusedExports(input.exports ?? {}, input.usedExports);
    }

    // Generate report
    return this.generateReport();
  }

  /**
   * Process chunks and modules
   */
  private processChunks(input: BundleInput): void {
    for (const chunkInput of input.chunks) {
      const modules: ModuleInfo[] = [];

      for (const file of chunkInput.files) {
        const moduleInfo = this.processModule(file, chunkInput.isEntry);
        modules.push(moduleInfo);
        this.modules.set(file.path, moduleInfo);
      }

      const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
      const totalGzipSize = modules.reduce((sum, m) => sum + (m.gzipSize ?? 0), 0);

      const chunkInfo: ChunkInfo = {
        id: chunkInput.id,
        name: chunkInput.name,
        files: chunkInput.files.map((f) => f.path),
        modules,
        size: totalSize,
        gzipSize: this.options.estimateGzip ? totalGzipSize : undefined,
        isEntry: chunkInput.isEntry,
        isAsync: chunkInput.isAsync,
        parentChunks: [],
        childChunks: [],
      };

      this.chunks.set(chunkInput.id, chunkInfo);
    }

    // Build chunk relationships
    this.buildChunkRelationships();
  }

  /**
   * Process a single module
   */
  private processModule(
    file: { path: string; content: string; type?: ModuleType },
    isEntry: boolean
  ): ModuleInfo {
    const size = file.content.length;

    return {
      id: hashContent(file.path + file.content),
      path: file.path,
      size,
      gzipSize: this.options.estimateGzip ? estimateGzipSize(file.content) : undefined,
      minifiedSize: this.options.estimateMinified ? estimateMinifiedSize(file.content) : undefined,
      type: file.type ?? detectModuleType(file.path),
      dependencies: [],
      dependents: [],
      isEntryPoint: isEntry,
      isDynamicImport: false,
      exports: [],
      unusedExports: [],
      sideEffects: this.detectSideEffects(file.content),
      hash: hashContent(file.content),
    };
  }

  /**
   * Detect if module has side effects
   */
  private detectSideEffects(content: string): boolean {
    // Simple heuristics for side effects detection
    const sideEffectPatterns = [
      /console\./,
      /window\./,
      /document\./,
      /globalThis\./,
      /process\./,
      /module\.exports/,
      /Object\.defineProperty/,
      /Object\.assign\s*\(\s*(?:window|global)/,
    ];

    return sideEffectPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Build dependency graphs - optimized single-pass implementation
   */
  private buildDependencyGraphs(dependencies: Record<string, string[]>): void {
    // Single iteration to build all dependency structures at once
    for (const [modulePath, deps] of Object.entries(dependencies)) {
      // Update module dependencies
      this.updateModuleDependencies(modulePath, deps);
      
      // Build forward graph
      this.buildForwardGraph(modulePath, deps);
      
      // Build reverse graph
      this.buildReverseGraph(modulePath, deps);
    }
  }

  /**
   * Update module dependencies list
   */
  private updateModuleDependencies(modulePath: string, deps: string[]): void {
    const module = this.modules.get(modulePath);
    if (module) {
      module.dependencies = deps;
    }
  }

  /**
   * Build forward dependency graph
   */
  private buildForwardGraph(modulePath: string, deps: string[]): void {
    this.dependencyGraph.set(modulePath, new Set(deps));
  }

  /**
   * Build reverse dependency graph
   */
  private buildReverseGraph(modulePath: string, deps: string[]): void {
    for (const dep of deps) {
      // Initialize reverse dependency set if needed
      if (!this.reverseDependencyGraph.has(dep)) {
        this.reverseDependencyGraph.set(dep, new Set());
      }
      this.reverseDependencyGraph.get(dep)!.add(modulePath);

      // Update dependents list in the dependency module
      const depModule = this.modules.get(dep);
      if (depModule) {
        depModule.dependents.push(modulePath);
      }
    }
  }

  /**
   * Build chunk parent/child relationships - optimized with file-to-chunk mapping
   */
  private buildChunkRelationships(): void {
    // Pre-build file-to-chunk mapping for O(1) lookup
    const fileToChunk = new Map<string, string>();
    for (const [chunkId, chunk] of this.chunks) {
      for (const file of chunk.files) {
        fileToChunk.set(file, chunkId);
      }
    }

    // Use Sets to avoid duplicate relationships
    const parentSets = new Map<string, Set<string>>();
    const childSets = new Map<string, Set<string>>();
    
    for (const [chunkId, chunk] of this.chunks) {
      parentSets.set(chunkId, new Set(chunk.parentChunks));
      childSets.set(chunkId, new Set(chunk.childChunks));
    }

    // Analyze module dependencies with O(1) chunk lookup
    for (const [chunkId, chunk] of this.chunks) {
      for (const modulePath of chunk.files) {
        const module = this.modules.get(modulePath);
        if (!module) continue;

        for (const dep of module.dependencies) {
          const depChunkId = fileToChunk.get(dep);
          if (depChunkId && depChunkId !== chunkId) {
            parentSets.get(chunkId)!.add(depChunkId);
            childSets.get(depChunkId)!.add(chunkId);
          }
        }
      }
    }

    // Update chunk objects with final relationships
    for (const [chunkId, chunk] of this.chunks) {
      chunk.parentChunks = Array.from(parentSets.get(chunkId)!);
      chunk.childChunks = Array.from(childSets.get(chunkId)!);
    }
  }

  /**
   * Calculate unused exports - optimized with Set for O(1) lookup
   */
  private calculateUnusedExports(
    exports: Record<string, string[]>,
    usedExports: Record<string, string[]>
  ): void {
    for (const [modulePath, moduleExports] of Object.entries(exports)) {
      const module = this.modules.get(modulePath);
      if (!module) continue;

      module.exports = moduleExports;
      const usedSet = new Set(usedExports[modulePath] ?? []);
      module.unusedExports = moduleExports.filter((e) => !usedSet.has(e));
    }
  }

  /**
   * Detect circular dependencies - optimized with early termination
   */
  private detectCircularDependencies(): string[][] {
    const circles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);

      const deps = this.dependencyGraph.get(node);
      if (!deps) {
        recursionStack.delete(node);
        return;
      }

      for (const dep of deps) {
        if (recursionStack.has(dep)) {
          // Found circular dependency - construct minimal cycle
          const circleStart = path.indexOf(dep);
          if (circleStart >= 0) {
            const circle = path.slice(circleStart).concat(dep);
            circles.push(circle);
          }
        } else if (!visited.has(dep)) {
          dfs(dep, [...path, dep]);
        }
      }

      recursionStack.delete(node);
    };

    for (const module of this.modules.keys()) {
      if (!visited.has(module)) {
        dfs(module, [module]);
      }
    }

    return circles;
  }

  /**
   * Find duplicate modules
   */
  private findDuplicates(): DuplicateInfo[] {
    const byContent = new Map<string, ModuleInfo[]>();

    for (const module of this.modules.values()) {
      if (!byContent.has(module.hash)) {
        byContent.set(module.hash, []);
      }
      byContent.get(module.hash)!.push(module);
    }

    const duplicates: DuplicateInfo[] = [];

    for (const [, modules] of byContent) {
      if (modules.length > 1) {
        const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
        const wastedSize = totalSize - modules[0].size;

        duplicates.push({
          name: modules[0].path.split('/').pop() ?? 'unknown',
          instances: modules.map((m) => ({
            path: m.path,
            size: m.size,
          })),
          totalWaste: wastedSize,
          recommendation: `Deduplicate by hoisting to a common chunk or using module aliases`,
        });
      }
    }

    return duplicates.sort((a, b) => b.totalWaste - a.totalWaste);
  }

  /**
   * Find treeshaking opportunities
   */
  private findTreeshakingOpportunities(): TreeshakingOpportunity[] {
    const opportunities: TreeshakingOpportunity[] = [];

    for (const module of this.modules.values()) {
      if (module.unusedExports.length > 0) {
        // Estimate savings (rough: assume each export is ~5% of module)
        const exportRatio = module.unusedExports.length / Math.max(module.exports.length, 1);
        const potentialSavings = Math.round(module.size * exportRatio * 0.5);

        opportunities.push({
          module: module.path,
          unusedExports: module.unusedExports,
          potentialSavings,
          confidence: exportRatio > 0.5 ? 'high' : exportRatio > 0.2 ? 'medium' : 'low',
          recommendation: `Remove unused exports: ${module.unusedExports.join(', ')}`,
        });
      }
    }

    return opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  /**
   * Generate splitting recommendations
   */
  private generateSplittingRecommendations(): SplittingRecommendation[] {
    const recommendations: SplittingRecommendation[] = [];

    // Find large modules that could be split
    for (const module of this.modules.values()) {
      if (module.size > this.options.sizeThresholds.module!) {
        recommendations.push({
          type: 'async',
          modules: [module.path],
          currentSize: module.size,
          estimatedSavings: Math.round(module.size * 0.8),
          priority: module.size > this.options.sizeThresholds.module! * 2 ? 'high' : 'medium',
          description: `Consider lazy-loading ${module.path} as it's ${Math.round(module.size / 1024)}KB`,
        });
      }
    }

    // Find external modules that could be in a vendor chunk
    const externalModules = Array.from(this.modules.values()).filter((m) => m.type === 'external');
    if (externalModules.length > 3) {
      const totalSize = externalModules.reduce((sum, m) => sum + m.size, 0);
      recommendations.push({
        type: 'vendor',
        modules: externalModules.map((m) => m.path),
        currentSize: totalSize,
        estimatedSavings: Math.round(totalSize * 0.3), // Better caching
        priority: 'medium',
        description: `Create a vendor chunk for ${externalModules.length} external modules for better caching`,
      });
    }

    // Find commonly imported modules
    const importCounts = new Map<string, number>();
    for (const module of this.modules.values()) {
      for (const dep of module.dependencies) {
        importCounts.set(dep, (importCounts.get(dep) ?? 0) + 1);
      }
    }

    const commonModules = Array.from(importCounts.entries())
      .filter(([, count]) => count > 3)
      .map(([path]) => path);

    if (commonModules.length > 2) {
      const commonSize = commonModules.reduce((sum, path) => {
        const mod = this.modules.get(path);
        return sum + (mod?.size ?? 0);
      }, 0);

      recommendations.push({
        type: 'common',
        modules: commonModules,
        currentSize: commonSize,
        estimatedSavings: Math.round(commonSize * 0.5),
        priority: 'high',
        description: `Extract ${commonModules.length} commonly used modules into a shared chunk`,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate warnings
   */
  private generateWarnings(): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];

    // Size warnings
    for (const module of this.modules.values()) {
      if (module.size > this.options.sizeThresholds.module!) {
        warnings.push({
          type: 'size',
          severity: module.size > this.options.sizeThresholds.module! * 2 ? 'error' : 'warning',
          message: `Module ${module.path} is ${Math.round(module.size / 1024)}KB`,
          modules: [module.path],
          recommendation: 'Consider splitting or lazy-loading this module',
        });
      }
    }

    for (const chunk of this.chunks.values()) {
      if (chunk.size > this.options.sizeThresholds.chunk!) {
        warnings.push({
          type: 'size',
          severity: chunk.size > this.options.sizeThresholds.chunk! * 2 ? 'error' : 'warning',
          message: `Chunk ${chunk.name} is ${Math.round(chunk.size / 1024)}KB`,
          modules: chunk.files,
          recommendation: 'Consider splitting this chunk',
        });
      }
    }

    // Circular dependency warnings
    if (this.options.detectCircular) {
      const circles = this.detectCircularDependencies();
      for (const circle of circles) {
        warnings.push({
          type: 'circular',
          severity: 'warning',
          message: `Circular dependency detected: ${circle.join(' -> ')}`,
          modules: circle,
          recommendation: 'Refactor to break the circular dependency',
        });
      }
    }

    // Unused exports warnings
    for (const module of this.modules.values()) {
      if (module.unusedExports.length > module.exports.length * 0.5) {
        warnings.push({
          type: 'unused',
          severity: 'info',
          message: `Module ${module.path} has ${module.unusedExports.length} unused exports`,
          modules: [module.path],
          recommendation: 'Consider removing unused exports or check if they are needed',
        });
      }
    }

    // Side effects warnings
    const modulesWithSideEffects = Array.from(this.modules.values()).filter((m) => m.sideEffects);
    if (modulesWithSideEffects.length > this.modules.size * 0.3) {
      warnings.push({
        type: 'sideeffects',
        severity: 'info',
        message: `${modulesWithSideEffects.length} modules have side effects`,
        modules: modulesWithSideEffects.map((m) => m.path),
        recommendation: 'Review modules with side effects to improve treeshaking',
      });
    }

    return warnings;
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(): PerformanceMetrics {
    const modules = Array.from(this.modules.values());
    const chunks = Array.from(this.chunks.values());

    const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
    const totalGzipSize = modules.reduce((sum, m) => sum + (m.gzipSize ?? 0), 0);

    const entryChunks = chunks.filter((c) => c.isEntry);
    const asyncChunks = chunks.filter((c) => c.isAsync);

    const initialLoadSize = entryChunks.reduce((sum, c) => sum + c.size, 0);
    const asyncChunksSize = asyncChunks.reduce((sum, c) => sum + c.size, 0);

    const duplicates = this.findDuplicates();
    const duplicateWaste = duplicates.reduce((sum, d) => sum + d.totalWaste, 0);

    const unusedCodeSize = modules.reduce((sum, m) => {
      const exportRatio = m.unusedExports.length / Math.max(m.exports.length, 1);
      return sum + Math.round(m.size * exportRatio * 0.5);
    }, 0);

    const sortedBySize = [...modules].sort((a, b) => b.size - a.size);

    return {
      totalSize,
      totalGzipSize,
      initialLoadSize,
      asyncChunksSize,
      moduleCount: modules.length,
      chunkCount: chunks.length,
      avgModuleSize: Math.round(totalSize / Math.max(modules.length, 1)),
      largestModule: sortedBySize[0]
        ? { path: sortedBySize[0].path, size: sortedBySize[0].size }
        : { path: '', size: 0 },
      smallestModule: sortedBySize[sortedBySize.length - 1]
        ? {
            path: sortedBySize[sortedBySize.length - 1].path,
            size: sortedBySize[sortedBySize.length - 1].size,
          }
        : { path: '', size: 0 },
      duplicateWaste,
      unusedCodeSize,
    };
  }

  /**
   * Generate analysis report
   */
  private generateReport(): BundleAnalysisReport {
    const metrics = this.calculateMetrics();
    const duplicates = this.findDuplicates();
    const treeshakingOpportunities = this.findTreeshakingOpportunities();
    const splittingRecommendations = this.generateSplittingRecommendations();
    const warnings = this.generateWarnings();

    // Generate suggestions
    const suggestions: string[] = [];

    if (metrics.totalSize > this.options.sizeThresholds.total!) {
      suggestions.push(
        `Total bundle size (${Math.round(metrics.totalSize / 1024)}KB) exceeds threshold. Consider code splitting.`
      );
    }

    if (metrics.initialLoadSize > this.options.sizeThresholds.initialLoad!) {
      suggestions.push(
        `Initial load size (${Math.round(metrics.initialLoadSize / 1024)}KB) is large. Consider lazy-loading non-critical modules.`
      );
    }

    if (duplicates.length > 0) {
      suggestions.push(
        `Found ${duplicates.length} duplicate modules wasting ${Math.round(metrics.duplicateWaste / 1024)}KB. Deduplicate dependencies.`
      );
    }

    if (treeshakingOpportunities.length > 0) {
      const totalSavings = treeshakingOpportunities.reduce((sum, t) => sum + t.potentialSavings, 0);
      suggestions.push(
        `Treeshaking could save ~${Math.round(totalSavings / 1024)}KB. Review unused exports.`
      );
    }

    return {
      timestamp: Date.now(),
      version: '1.0.0',
      chunks: Array.from(this.chunks.values()),
      modules: Array.from(this.modules.values()),
      duplicates,
      treeshakingOpportunities,
      splittingRecommendations,
      metrics,
      warnings,
      suggestions,
    };
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(report: BundleAnalysisReport): string {
    const formatSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return `<!DOCTYPE html>
<html>
<head>
  <title>HoloScript Bundle Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
    h1, h2, h3 { color: #333; }
    .metric { display: inline-block; padding: 10px 20px; background: #f5f5f5; border-radius: 8px; margin: 5px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #0066cc; }
    .metric-label { font-size: 12px; color: #666; }
    .warning { padding: 10px; margin: 5px 0; border-radius: 4px; }
    .warning.error { background: #ffebee; border-left: 4px solid #f44336; }
    .warning.warning { background: #fff3e0; border-left: 4px solid #ff9800; }
    .warning.info { background: #e3f2fd; border-left: 4px solid #2196f3; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
    .size-bar { height: 10px; background: #0066cc; border-radius: 2px; }
    .suggestion { padding: 10px; background: #e8f5e9; border-radius: 4px; margin: 5px 0; }
  </style>
</head>
<body>
  <h1>HoloScript Bundle Analysis Report</h1>
  <p>Generated: ${new Date(report.timestamp).toISOString()}</p>

  <h2>Overview</h2>
  <div>
    <div class="metric">
      <div class="metric-value">${formatSize(report.metrics.totalSize)}</div>
      <div class="metric-label">Total Size</div>
    </div>
    <div class="metric">
      <div class="metric-value">${formatSize(report.metrics.totalGzipSize)}</div>
      <div class="metric-label">Gzipped</div>
    </div>
    <div class="metric">
      <div class="metric-value">${report.metrics.moduleCount}</div>
      <div class="metric-label">Modules</div>
    </div>
    <div class="metric">
      <div class="metric-value">${report.metrics.chunkCount}</div>
      <div class="metric-label">Chunks</div>
    </div>
  </div>

  <h2>Warnings (${report.warnings.length})</h2>
  ${report.warnings
    .map(
      (w) => `
    <div class="warning ${w.severity}">
      <strong>${w.type.toUpperCase()}</strong>: ${w.message}
      ${w.recommendation ? `<br><em>${w.recommendation}</em>` : ''}
    </div>
  `
    )
    .join('')}

  <h2>Suggestions</h2>
  ${report.suggestions.map((s) => `<div class="suggestion">💡 ${s}</div>`).join('')}

  <h2>Chunks</h2>
  <table>
    <tr><th>Name</th><th>Type</th><th>Size</th><th>Modules</th></tr>
    ${report.chunks
      .map(
        (c) => `
      <tr>
        <td>${c.name}</td>
        <td>${c.isEntry ? 'Entry' : c.isAsync ? 'Async' : 'Normal'}</td>
        <td>${formatSize(c.size)}</td>
        <td>${c.modules.length}</td>
      </tr>
    `
      )
      .join('')}
  </table>

  <h2>Largest Modules</h2>
  <table>
    <tr><th>Path</th><th>Type</th><th>Size</th><th>Gzip</th></tr>
    ${report.modules
      .sort((a, b) => b.size - a.size)
      .slice(0, 20)
      .map(
        (m) => `
        <tr>
          <td>${m.path}</td>
          <td>${m.type}</td>
          <td>${formatSize(m.size)}</td>
          <td>${m.gzipSize ? formatSize(m.gzipSize) : '-'}</td>
        </tr>
      `
      )
      .join('')}
  </table>

  ${
    report.duplicates.length > 0
      ? `
    <h2>Duplicates (${report.duplicates.length})</h2>
    <table>
      <tr><th>Module</th><th>Instances</th><th>Wasted</th></tr>
      ${report.duplicates
        .map(
          (d) => `
        <tr>
          <td>${d.name}</td>
          <td>${d.instances.length}</td>
          <td>${formatSize(d.totalWaste)}</td>
        </tr>
      `
        )
        .join('')}
    </table>
  `
      : ''
  }

  ${
    report.splittingRecommendations.length > 0
      ? `
    <h2>Splitting Recommendations</h2>
    ${report.splittingRecommendations
      .map(
        (r) => `
      <div class="warning info">
        <strong>${r.type.toUpperCase()} (${r.priority})</strong>: ${r.description}
        <br>Potential savings: ${formatSize(r.estimatedSavings)}
      </div>
    `
      )
      .join('')}
  `
      : ''
  }
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(report: BundleAnalysisReport): string {
    return JSON.stringify(report, null, 2);
  }
}

/**
 * Create a bundle analyzer
 */
export function createBundleAnalyzer(options?: BundleAnalyzerOptions): BundleAnalyzer {
  return new BundleAnalyzer(options);
}
