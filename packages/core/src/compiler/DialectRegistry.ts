/**
 * MLIR-Style Dialect Registry for HoloScript Compiler Fleet
 *
 * Enables compiler backends to register as self-contained "dialects"
 * with independent lowering passes, rather than requiring manual
 * addition to the ExportManager switch statement.
 *
 * Architecture:
 *   Trait-Level IR (High-Level)
 *       |
 *       v
 *   Domain Dialects (@spatial, @agent, @service, @iot)
 *       |
 *       v
 *   Target-Specific Lowering (progressive, composable passes)
 *       |
 *       v
 *   Code Emission (Unity C#, Node.js, WASM, etc.)
 *
 * @example
 * ```typescript
 * // Register a new compiler dialect
 * DialectRegistry.register({
 *   name: 'node-service',
 *   domain: 'service',
 *   description: 'Compiles @service traits to Express/Fastify applications',
 *   supportedTraits: ['service', 'endpoint', 'route', 'handler', 'middleware'],
 *   riskTier: 'standard',
 *   factory: (options) => new NodeServiceCompiler(options),
 * });
 *
 * // Discover available dialects
 * const dialects = DialectRegistry.listByDomain('service');
 *
 * // Create compiler from dialect
 * const compiler = DialectRegistry.create('node-service', { framework: 'express' });
 * ```
 */

import type { CompilerBase } from './CompilerBase';
import type { HoloComposition, HoloDomainType } from '../parser/HoloCompositionTypes';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Dialect domains extend HoloDomainType with compiler-fleet-specific categories.
 * HoloDomainType covers all 31 spatial + universal domains.
 * Additional dialect-only domains cover compiler target ecosystems.
 */
export type DialectDomain =
  | HoloDomainType
  | 'gamedev'
  | 'social-vr'
  | 'xr'
  | 'mobile'
  | 'web3d'
  | 'web' // HTTP / Next.js style stacks (e.g. nextjs-api dialect)
  | 'runtime'
  | 'shader'
  | 'interchange'
  | 'ai'
  | 'neuromorphic'
  | 'meta'
  | 'mixin'
  | 'observability'
  | 'configuration'; // IDE / toolchain config emitters (e.g. mcp-config)

export type DialectRiskTier = 'standard' | 'high' | 'critical';

/** Intermediate representation produced by a lowering pass */
export interface LoweringResult {
  /** The lowered output (code string or structured output) */
  output: string | Record<string, string>;
  /** Metadata about the lowering (for chaining passes) */
  metadata?: Record<string, unknown>;
  /** Diagnostics/warnings from lowering */
  diagnostics?: LoweringDiagnostic[];
}

export interface LoweringDiagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  source?: string;
  line?: number;
}

/** A composable lowering pass that transforms IR at one level */
export interface LoweringPass {
  /** Pass name (for debugging and ordering) */
  name: string;
  /** Priority (lower = runs earlier in the pipeline) */
  priority: number;
  /** The lowering function */
  lower(composition: HoloComposition, context: LoweringContext): LoweringResult;
}

/** Context passed through the lowering pipeline */
export interface LoweringContext {
  /** Target dialect name */
  target: string;
  /** Compilation options */
  options: Record<string, unknown>;
  /** Results from previous passes (pass name -> result) */
  previousPasses: Map<string, LoweringResult>;
  /** Accumulated diagnostics */
  diagnostics: LoweringDiagnostic[];
}

/** Dialect registration descriptor */
export interface DialectDescriptor {
  /** Unique dialect name (used as compilation target) */
  name: string;
  /** Domain category */
  domain: DialectDomain;
  /** Human-readable description */
  description: string;
  /** Traits this dialect can compile */
  supportedTraits: string[];
  /** Risk tier for RBAC */
  riskTier: DialectRiskTier;
  /** ANS capability path (auto-generated if not provided) */
  ansPath?: string;
  /** Factory function to create compiler instance */
  factory: (options?: Record<string, unknown>) => CompilerBase;
  /** Optional lowering passes (for progressive lowering pipelines) */
  loweringPasses?: LoweringPass[];
  /** File extensions this dialect emits */
  outputExtensions?: string[];
  /** Whether this dialect is experimental (v6 preview) */
  experimental?: boolean;
}

/** Read-only dialect info (without factory, for discovery) */
export interface DialectInfo {
  name: string;
  domain: DialectDomain;
  description: string;
  supportedTraits: readonly string[];
  riskTier: DialectRiskTier;
  ansPath: string;
  outputExtensions: readonly string[];
  experimental: boolean;
}

// ── Registry ─────────────────────────────────────────────────────────────────

class DialectRegistryImpl {
  private dialects = new Map<string, DialectDescriptor>();

  /**
   * Register a new compiler dialect.
   * @throws Error if a dialect with the same name already exists
   */
  register(descriptor: DialectDescriptor): void {
    if (this.dialects.has(descriptor.name)) {
      throw new Error(
        `Dialect "${descriptor.name}" is already registered. ` +
          `Use DialectRegistry.override() to replace an existing dialect.`
      );
    }
    // Auto-generate ANS path if not provided
    if (!descriptor.ansPath) {
      descriptor.ansPath = `/compile/${descriptor.domain}/${descriptor.name}`;
    }
    this.dialects.set(descriptor.name, descriptor);
  }

  /**
   * Override an existing dialect registration.
   */
  override(descriptor: DialectDescriptor): void {
    if (!descriptor.ansPath) {
      descriptor.ansPath = `/compile/${descriptor.domain}/${descriptor.name}`;
    }
    this.dialects.set(descriptor.name, descriptor);
  }

  /**
   * Unregister a dialect.
   */
  unregister(name: string): boolean {
    return this.dialects.delete(name);
  }

  /**
   * Check if a dialect is registered.
   */
  has(name: string): boolean {
    return this.dialects.has(name);
  }

  /**
   * Get dialect info (without factory, safe for discovery).
   */
  get(name: string): DialectInfo | undefined {
    const desc = this.dialects.get(name);
    if (!desc) return undefined;
    return {
      name: desc.name,
      domain: desc.domain,
      description: desc.description,
      supportedTraits: desc.supportedTraits,
      riskTier: desc.riskTier,
      ansPath: desc.ansPath || `/compile/${desc.domain}/${desc.name}`,
      outputExtensions: desc.outputExtensions || [],
      experimental: desc.experimental ?? false,
    };
  }

  /**
   * Create a compiler instance from a registered dialect.
   * @throws Error if dialect not found
   */
  create(name: string, options?: Record<string, unknown>): CompilerBase {
    const desc = this.dialects.get(name);
    if (!desc) {
      const available = [...this.dialects.keys()].join(', ');
      throw new Error(`Unknown dialect "${name}". Available: ${available}`);
    }
    return desc.factory(options);
  }

  /**
   * List all registered dialects.
   */
  list(): DialectInfo[] {
    return [...this.dialects.values()].map((desc) => ({
      name: desc.name,
      domain: desc.domain,
      description: desc.description,
      supportedTraits: desc.supportedTraits,
      riskTier: desc.riskTier,
      ansPath: desc.ansPath || `/compile/${desc.domain}/${desc.name}`,
      outputExtensions: desc.outputExtensions || [],
      experimental: desc.experimental ?? false,
    }));
  }

  /**
   * List dialects filtered by domain.
   */
  listByDomain(domain: DialectDomain): DialectInfo[] {
    return this.list().filter((d) => d.domain === domain);
  }

  /**
   * Find dialects that support a specific trait.
   */
  findByTrait(traitName: string): DialectInfo[] {
    return this.list().filter((d) => d.supportedTraits.includes(traitName));
  }

  /**
   * Get all registered dialect names.
   */
  names(): string[] {
    return [...this.dialects.keys()];
  }

  /**
   * Get count of registered dialects.
   */
  get size(): number {
    return this.dialects.size;
  }

  /**
   * Execute a progressive lowering pipeline for a dialect.
   * Runs all registered lowering passes in priority order.
   */
  executeLoweringPipeline(
    dialectName: string,
    composition: HoloComposition,
    options: Record<string, unknown> = {}
  ): LoweringResult {
    const desc = this.dialects.get(dialectName);
    if (!desc) {
      throw new Error(`Unknown dialect "${dialectName}"`);
    }

    const passes = [...(desc.loweringPasses || [])].sort((a, b) => a.priority - b.priority);

    if (passes.length === 0) {
      throw new Error(
        `Dialect "${dialectName}" has no lowering passes. Use create() for direct compilation.`
      );
    }

    const context: LoweringContext = {
      target: dialectName,
      options,
      previousPasses: new Map(),
      diagnostics: [],
    };

    let lastResult: LoweringResult = { output: '' };

    for (const pass of passes) {
      lastResult = pass.lower(composition, context);
      context.previousPasses.set(pass.name, lastResult);

      if (lastResult.diagnostics) {
        context.diagnostics.push(...lastResult.diagnostics);
      }

      // Stop on error diagnostics
      const hasError = lastResult.diagnostics?.some((d) => d.level === 'error');
      if (hasError) break;
    }

    // Attach accumulated diagnostics
    lastResult.diagnostics = context.diagnostics;
    return lastResult;
  }
}

/** Singleton dialect registry */
export const DialectRegistry = new DialectRegistryImpl();

// Auto-boot: register all built-in compiler backends on first import.
let _autoBooted = false;

/** Ensure all built-in dialects are registered. Idempotent. */
export function ensureDialectsBooted(): void {
  if (_autoBooted) return;
  _autoBooted = true;
  try {
    const { registerBuiltinDialects } = require('./registerBuiltinDialects');
    registerBuiltinDialects();
  } catch {
    // Graceful: registry works without boot (e.g., in test isolation)
  }
}
