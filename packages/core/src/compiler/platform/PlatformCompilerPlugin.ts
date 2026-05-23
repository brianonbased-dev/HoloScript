/**
 * @fileoverview Stable Platform-Compiler Plugin Interface (APL-WIT-2)
 * @module @holoscript/core/compiler/platform/PlatformCompilerPlugin
 *
 * Defines the stable plugin contract for the WIT `holoscript-platform-plugin`
 * world. Each plugin implements this interface and is loaded lazily by the
 * PlatformPluginLoader (Studio) or by the WASM component runtime.
 *
 * This interface is the TypeScript mirror of the WIT `platform-compiler`
 * interface defined in `packages/holoscript-component/wit/holoscript.wit`.
 * The contract is:
 *
 *   1. Plugin declares which targets it handles (targets()).
 *   2. Plugin declares its version and memory budget (metadata).
 *   3. Plugin can compile AST JSON to target-specific output (compile).
 *   4. Plugin can query trait availability for its targets (traitQuery).
 *   5. Plugin can list available traits for its targets (traitList).
 *   6. Plugin can generate target-specific code for a trait (traitCodegen).
 *
 * The bridge between this TS interface and the WIT world is mediated by
 * TraitRegistryBridge, which provides the unified trait-evaluation surface
 * that both the lightweight `holoscript-parser` WASM world and the lazy
 * `holoscript-platform-plugin` WASM world call into.
 *
 * Plugin loading flow:
 *   1. PlatformPluginLoader.findPluginForTarget(target) → PluginManifest
 *   2. PlatformPluginLoader.ensureLoaded(manifest) → loads WASM or TS plugin
 *   3. Plugin.compile(astJson, target) → CompileResult
 *
 * Lazy loading guarantees:
 *   - Only the WASM component for the requested target is fetched and instantiated
 *   - The core runtime (~800KB) is always loaded; plugins add ~100-400KB each
 *   - LRU eviction ensures total plugin memory stays within budget
 *
 * @version 1.0.0 — APL-WIT-2: stable interface + first two lazy plugins
 * @see research/2026-05-21_apl_wit_trait-evaluation_gap_report.md Gap #2
 * @see packages/studio/src/lib/platform-plugin-loader.ts (Studio consumer)
 * @see packages/core/src/compiler/TraitRegistryBridge.ts (trait dispatch)
 */

import type { CompileResult, Diagnostic } from '@holoscript/core/compiler';
import type { PlatformTarget } from './PlatformConditional';
import type { TraitInfo, TraitQueryOptions } from '../TraitRegistryBridge';

// =============================================================================
// PLUGIN INTERFACE
// =============================================================================

/**
 * Plugin metadata — static declaration that doesn't require instantiation.
 * Matches the PluginManifest in Studio's platform-plugin-loader.ts but is
 * defined here in core so plugins can self-declare without depending on Studio.
 */
export interface PlatformPluginMetadata {
  /** Unique plugin identifier (e.g. 'holoscript-plugin-webgpu-wgsl') */
  name: string;
  /** Semantic version of the plugin */
  version: string;
  /** Platform targets this plugin can compile for */
  targets: PlatformTarget[];
  /** Estimated memory footprint in KB when loaded */
  sizeKB: number;
  /** SHA256 integrity hash of the WASM binary (empty for TS-only plugins) */
  integrity?: string;
  /** Minimum core runtime version required */
  minCoreVersion?: string;
}

/**
 * Trait compilation context — passed to traitCodegen for per-target codegen.
 *
 * Provides the full compilation context: which target, what config overrides,
 * and whether the caller wants inline or standalone output.
 */
export interface TraitCompileContext {
  /** The compilation target (e.g. 'webgpu-wgsl', 'android-arcore') */
  target: PlatformTarget;
  /** Per-trait configuration overrides */
  config: Record<string, unknown>;
  /** Output format preference: inline snippet vs. standalone module */
  format: 'inline' | 'module';
  /** Whether to include provenance / receipt metadata */
  includeProvenance: boolean;
}

/**
 * Trait compilation result — output from traitCodegen.
 */
export interface TraitCompileOutput {
  /** Generated code lines */
  code: string[];
  /** Target language (e.g. 'wgsl', 'kotlin', 'swift') */
  language: string;
  /** Whether the trait was fully mapped or is a stub */
  fidelity: 'full' | 'partial' | 'stub';
  /** Source registry that provided the mapping */
  sourceMap: string;
  /** Optional provenance receipt if includeProvenance was true */
  provenance?: {
    pluginName: string;
    pluginVersion: string;
    traitName: string;
    timestamp: string;
  };
}

/**
 * PlatformCompilerPlugin — the stable contract for WASM platform plugins.
 *
 * This interface bridges the WIT `platform-compiler` world with the TypeScript
 * dispatch surface. Each plugin implements this interface and registers with
 * the PlatformPluginRegistry.
 *
 * Two implementation paths exist:
 *   1. WASM component: loaded by PlatformPluginLoader from a .component.wasm
 *      binary. The WASM exports map to these methods.
 *   2. TypeScript native: implements this interface directly, delegates to the
 *      existing TS compilers (WebGPUCompiler, AndroidXRCompiler, etc.).
 *
 * The TS native path is what the first two lazy plugins use — they delegate
 * to TraitRegistryBridge for trait queries and to the real TS compilers for
 * full compilation, without requiring WASM binary builds.
 */
export interface PlatformCompilerPlugin {
  /** Static metadata — available before instantiation */
  readonly metadata: PlatformPluginMetadata;

  // ─────────────────────────────────────────────────────────────────────
  // Core compilation (WIT `compile` function)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Compile a HoloScript AST (JSON) to platform-specific output.
   *
   * This is the primary entry point matching the WIT `compile` function.
   * The AST JSON is the output of the core parser (holoscript-parser world).
   *
   * @param astJson - Serialized HoloScript AST
   * @param target - Specific platform target to compile for
   * @returns Compile result (text, binary, or error diagnostics)
   */
  compile(astJson: string, target: PlatformTarget): CompileResult;

  // ─────────────────────────────────────────────────────────────────────
  // Trait evaluation (WIT validator interface bridged through host)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Check whether a trait is available for this plugin's targets.
   *
   * Delegates to TraitRegistryBridge for the unified cross-target lookup.
   * This is the WIT `trait-exists` function for the plugin world.
   */
  traitExists(name: string): boolean;

  /**
   * Query detailed trait information for this plugin's targets.
   *
   * Returns codegen availability, source map, and documentation.
   * This is the WIT `get-trait` function for the plugin world.
   */
  traitQuery(name: string, opts?: TraitQueryOptions): TraitInfo;

  /**
   * List all available traits for this plugin's targets.
   *
   * Returns the union of traits across all this plugin's target platforms.
   * This is the WIT `list-traits` function for the plugin world.
   */
  traitList(): string[];

  // ─────────────────────────────────────────────────────────────────────
  // Trait codegen (WIT platform-compiler extension)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Generate target-specific code for a trait.
   *
   * This is the primary differentiator between plugins — each plugin knows
   * how to emit code for its specific targets (WGSL shaders, Kotlin/ARCore,
   * Swift/RealityKit, etc.).
   *
   * @param traitName - Name of the trait to generate code for
   * @param context - Compilation context with target, config, and format
   * @returns Generated code with language, fidelity, and provenance info
   */
  traitCodegen(traitName: string, context: TraitCompileContext): TraitCompileOutput;

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  /** Called when the plugin is being unloaded to free resources */
  unload(): void;
}

// =============================================================================
// PLUGIN REGISTRY
// =============================================================================

/**
 * Central registry for PlatformCompilerPlugins.
 *
 * Plugins register themselves at import time (side-effect registration)
 * or via explicit `register()` calls. The registry is consumed by:
 *   - Studio's PlatformPluginLoader (via getPluginForTarget)
 *   - WASM world host functions (via the same registry)
 *   - CLI compilation (via getPluginForTarget)
 *
 * This is the stable surface that replaces the old DEFAULT_MANIFEST array
 * in platform-plugin-loader.ts. Manifests are derived from registered plugins.
 */
class PlatformPluginRegistry {
  private plugins = new Map<string, PlatformCompilerPlugin>();
  private targetIndex = new Map<PlatformTarget, PlatformCompilerPlugin>();

  /**
   * Register a plugin. Indexes by name and by each target.
   * Overwrites any existing plugin with the same name.
   */
  register(plugin: PlatformCompilerPlugin): void {
    const { name } = plugin.metadata;
    // Remove old target index entries if overwriting
    const existing = this.plugins.get(name);
    if (existing) {
      for (const target of existing.metadata.targets) {
        this.targetIndex.delete(target);
      }
    }
    this.plugins.set(name, plugin);
    for (const target of plugin.metadata.targets) {
      this.targetIndex.set(target, plugin);
    }
  }

  /** Get a plugin by its unique name */
  getByName(name: string): PlatformCompilerPlugin | undefined {
    return this.plugins.get(name);
  }

  /** Get the plugin that handles a given target */
  getPluginForTarget(target: PlatformTarget): PlatformCompilerPlugin | undefined {
    return this.targetIndex.get(target);
  }

  /** List all registered plugin names */
  listPluginNames(): string[] {
    return [...this.plugins.keys()];
  }

  /** Get all registered plugins */
  listPlugins(): PlatformCompilerPlugin[] {
    return [...this.plugins.values()];
  }

  /** Get all supported targets across all plugins */
  listAllTargets(): PlatformTarget[] {
    return [...this.targetIndex.keys()];
  }

  /** Unregister a plugin by name, cleaning up target index */
  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      for (const target of plugin.metadata.targets) {
        this.targetIndex.delete(target);
      }
      this.plugins.delete(name);
    }
  }

  /** Unregister all plugins */
  clear(): void {
    this.plugins.clear();
    this.targetIndex.clear();
  }
}

/** Singleton plugin registry */
export const platformPluginRegistry = new PlatformPluginRegistry();

// =============================================================================
// DERIVED MANIFEST HELPERS
// =============================================================================

/**
 * Convert a PlatformCompilerPlugin to a PluginManifest for Studio's loader.
 *
 * Studio's PlatformPluginLoader works with PluginManifest objects for
 * lazy WASM loading. This helper bridges the core plugin interface to
 * Studio's manifest format.
 */
export interface PluginManifest {
  name: string;
  version: string;
  targets: PlatformTarget[];
  wasmUrl: string;
  sizeKB: number;
  integrity?: string;
}

/**
 * Derive a PluginManifest from a registered plugin.
 * The wasmUrl is computed from the plugin name following the convention:
 *   holoscript-plugin-{shortName}.component.wasm
 */
export function manifestFromPlugin(plugin: PlatformCompilerPlugin): PluginManifest {
  const { name, version, targets, sizeKB, integrity } = plugin.metadata;
  // Derive short name: 'holoscript-plugin-webgpu-wgsl' → 'webgpu-wgsl'
  const shortName = name.replace(/^holoscript-plugin-/, '');
  return {
    name,
    version,
    targets,
    wasmUrl: `plugins/holoscript-plugin-${shortName}.component.wasm`,
    sizeKB,
    integrity,
  };
}

/**
 * Get all manifests from currently registered plugins.
 */
export function getAllManifests(): PluginManifest[] {
  return platformPluginRegistry.listPlugins().map(manifestFromPlugin);
}