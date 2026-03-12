# WASM Lazy-Loading Architecture for HoloScript Export Targets

## Version: 1.0.0 | Date: 2026-02-28 | Status: PROPOSED

---

## Executive Summary

This document defines the architecture for decomposing HoloScript's 24+ export targets into independently loadable WASM components that are fetched on-demand rather than bundled monolithically. The design leverages the WASM Component Model (WIT interfaces), Rust crate splitting, and a TypeScript-side `ComponentLoader` that orchestrates lazy instantiation.

**Key Outcomes:**

- Initial bundle drops from ~20MB to ~2MB (core parser + validator + spatial engine)
- Each platform compiler loads as a separate 50KB-300KB WASM binary
- Zero-cost when a target is never used (not downloaded, not instantiated)
- Graceful fallback to TypeScript compilers when WASM is unavailable
- Full backward compatibility with existing `ExportManager` API

---

## 1. Current State Analysis

### 1.1 Existing Architecture

```
@holoscript/core (single TS bundle, ~20MB)
  |-- Parser (HoloScriptPlusParser, HoloCompositionParser)
  |-- Runtime (HoloScriptRuntime)
  |-- TypeChecker
  |-- 24 Compiler classes (all eagerly imported by ExportManager)
  |-- CircuitBreaker, BundleSplitter, SemanticCache
  |-- 1,800+ trait definitions
```

**Problem**: `ExportManager` constructor imports ALL 24 compilers via `CompilerFactory.createCompiler()`, which uses a giant `switch` statement with static imports. Even with tsup code-splitting, the shared dependency graph pulls in most compilers when any one is used.

### 1.2 Existing WASM Components

| Package                | Purpose               | Size   | Technology          |
| ---------------------- | --------------------- | ------ | ------------------- |
| `compiler-wasm`        | Parser (Rust)         | ~200KB | wasm-bindgen        |
| `spatial-engine-wasm`  | Noise, collision, A\* | ~50KB  | wasm-bindgen        |
| `holoscript-component` | Full runtime (Rust)   | ~459KB | WIT/Component Model |

### 1.3 Existing WIT Interface

The `holoscript.wit` file already defines:

- **Engine-core targets**: `compile-target` enum (threejs, babylonjs, aframe, gltf, glb, json-ast)
- **Platform-plugin targets**: `platform-target` enum (unity, godot, unreal, vrchat, openxr, visionos, android, webgpu, r3f, playcanvas, urdf, sdf, usd)
- **Plugin boundary**: `platform-compiler` interface with `compile-for-platform` function
- **Worlds**: `holoscript-platform-plugin` world (imports types, exports platform-compiler)

This is the ideal foundation. The WIT already envisions separate platform plugin components.

---

## 2. Target Architecture

### 2.1 Component Decomposition

```
holoscript-core.wasm (~800KB)          <-- Always loaded
  |-- parser interface
  |-- validator interface
  |-- type-checker interface
  |-- compiler interface (core targets: threejs, babylon, aframe, gltf, glb, json-ast)
  |-- generator interface
  |-- formatter interface

holoscript-spatial.wasm (~50KB)        <-- Loaded on first spatial operation
  |-- spatial-engine interface (noise, collision, pathfinding)

holoscript-plugin-unity.wasm (~100KB)      <-- Loaded when target="unity"
holoscript-plugin-unreal.wasm (~120KB)     <-- Loaded when target="unreal"
holoscript-plugin-godot.wasm (~80KB)       <-- Loaded when target="godot"
holoscript-plugin-vrchat.wasm (~90KB)      <-- Loaded when target="vrchat"
holoscript-plugin-openxr.wasm (~70KB)      <-- Loaded when target="openxr"
holoscript-plugin-visionos.wasm (~110KB)   <-- Loaded when target="visionos"
holoscript-plugin-android.wasm (~85KB)     <-- Loaded when target="android"
holoscript-plugin-ios.wasm (~90KB)         <-- Loaded when target="ios"
holoscript-plugin-webgpu.wasm (~95KB)      <-- Loaded when target="webgpu"
holoscript-plugin-r3f.wasm (~75KB)         <-- Loaded when target="r3f"
holoscript-plugin-playcanvas.wasm (~70KB)  <-- Loaded when target="playcanvas"
holoscript-plugin-urdf.wasm (~60KB)        <-- Loaded when target="urdf"
holoscript-plugin-sdf.wasm (~55KB)         <-- Loaded when target="sdf"
holoscript-plugin-usd.wasm (~100KB)        <-- Loaded when target="usd/usdz"
holoscript-plugin-dtdl.wasm (~50KB)        <-- Loaded when target="dtdl"
holoscript-plugin-wasm.wasm (~80KB)        <-- Loaded when target="wasm" (WAT gen)
holoscript-plugin-ar.wasm (~65KB)          <-- Loaded when target="ar"
holoscript-plugin-vrr.wasm (~70KB)         <-- Loaded when target="vrr"
```

### 2.2 Loading Strategy

```
                    Initial Page Load
                         |
                    +----v----+
                    | core.wasm|  (~800KB, always fetched)
                    +----+----+
                         |
          +--------------+--------------+
          |              |              |
     User clicks    User clicks    User clicks
     "Export Unity" "Export URDF"  "Export WebGPU"
          |              |              |
    +-----v------+ +----v-----+ +-----v------+
    |plugin-unity| |plugin-urdf| |plugin-webgpu|
    |  (~100KB)  | |  (~60KB)  | |  (~95KB)   |
    +-----+------+ +----+-----+ +-----+------+
          |              |              |
    compile-for-    compile-for-   compile-for-
    platform()      platform()     platform()
```

### 2.3 Data Flow

```
User Request: export("unity", composition)
    |
    v
ExportManager.export("unity", composition)
    |
    v
LazyCompilerFactory.getCompiler("unity")
    |
    +--> Check: Is WASM plugin loaded?
    |    |
    |    +--> NO: ComponentLoader.load("unity")
    |    |       |
    |    |       +--> fetch("/wasm/holoscript-plugin-unity.wasm")
    |    |       +--> WebAssembly.instantiate(bytes, { types: coreTypes })
    |    |       +--> Cache instance in WeakRef<ComponentInstance>
    |    |       +--> Return WASMPlatformCompiler wrapper
    |    |
    |    +--> YES: Return cached WASMPlatformCompiler wrapper
    |
    v
WASMPlatformCompiler.compile(composition)
    |
    +--> Serialize composition to WIT-compatible format
    +--> Call plugin.compile-for-platform(ast, "unity-csharp")
    +--> Deserialize CompileResult
    +--> Return to ExportManager
    |
    v
ExportResult { target: "unity", success: true, output: "..." }
```

---

## 3. WIT Interface Design (Extended)

### 3.1 Updated `holoscript.wit` Additions

```txt
// Add to existing holoscript.wit

// =============================================================================
// PLUGIN REGISTRY (new interface for lazy loading coordination)
// =============================================================================

/// Plugin registry for dynamic component management
interface plugin-registry {
    use types.{platform-target, compile-result, composition-node};

    /// Check if a platform plugin is loaded and ready
    is-plugin-loaded: func(target: platform-target) -> bool;

    /// Get list of all currently loaded plugins
    loaded-plugins: func() -> list<platform-target>;

    /// Get plugin metadata as JSON (version, capabilities, size)
    plugin-metadata: func(target: platform-target) -> option<string>;
}

// =============================================================================
// PLUGIN MANIFEST (embedded in each plugin component)
// =============================================================================

/// Manifest interface that each plugin exports for discovery
interface plugin-manifest {
    /// Plugin name
    name: func() -> string;

    /// Plugin version (semver)
    version: func() -> string;

    /// Supported platform targets
    targets: func() -> list<string>;

    /// Required core version (minimum compatible holoscript-core version)
    required-core-version: func() -> string;

    /// Estimated compiled binary size in bytes
    binary-size-hint: func() -> u64;

    /// Feature flags this plugin requires from core
    required-features: func() -> list<string>;
}

// =============================================================================
// WORLDS (extended with plugin variants)
// =============================================================================

/// Individual platform plugin (loaded on-demand)
world holoscript-platform-plugin {
    import types;
    export platform-compiler;
    export plugin-manifest;
}

/// Game engine plugins (Unity, Unreal, Godot) - can be bundled together
world holoscript-game-engine-plugins {
    import types;
    export platform-compiler;
    export plugin-manifest;
}

/// Robotics plugins (URDF, SDF, USD) - can be bundled together
world holoscript-robotics-plugins {
    import types;
    export platform-compiler;
    export plugin-manifest;
}

/// Mobile/XR plugins (iOS, Android, VisionOS, OpenXR) - can be bundled together
world holoscript-xr-plugins {
    import types;
    export platform-compiler;
    export plugin-manifest;
}
```

### 3.2 Plugin Grouping Strategy

Plugins can be loaded individually OR as logical groups for users who need related targets:

| Group             | Plugins                                | Combined Size | Use Case            |
| ----------------- | -------------------------------------- | ------------- | ------------------- |
| **Game Engines**  | unity, unreal, godot                   | ~300KB        | Game developers     |
| **Web Platforms** | r3f, babylon, playcanvas, webgpu       | ~315KB        | Web XR developers   |
| **Mobile/XR**     | ios, android, visionos, openxr, vrchat | ~445KB        | XR deployment       |
| **Robotics**      | urdf, sdf, usd                         | ~215KB        | Robotics/simulation |
| **Specialized**   | dtdl, vrr, ar, wasm                    | ~265KB        | Domain-specific     |

---

## 4. Rust Crate Architecture

### 4.1 Workspace Structure

```
packages/
  holoscript-component/          # Core WASM component (existing, enhanced)
    Cargo.toml
    wit/holoscript.wit
    src/
      lib.rs                     # Core: parser, validator, compiler, generator
      compiler.rs
      lexer.rs
      parser.rs
      traits.rs

  holoscript-plugin-shared/      # NEW: Shared library for all plugins
    Cargo.toml
    src/
      lib.rs                     # Common codegen utilities, AST traversal
      codegen.rs                 # Shared code generation patterns
      ast_visitor.rs             # Shared AST visitor trait
      string_builder.rs          # Efficient string building for codegen

  holoscript-plugin-unity/       # NEW: Unity plugin WASM component
    Cargo.toml
    wit/                         # Inherits from core WIT
    src/
      lib.rs                     # Implements platform-compiler for unity-csharp

  holoscript-plugin-unreal/      # NEW: Unreal plugin WASM component
    Cargo.toml
    wit/
    src/
      lib.rs

  holoscript-plugin-godot/       # NEW: Godot plugin WASM component
    ...

  holoscript-plugin-urdf/        # NEW: URDF plugin WASM component
    ...

  # ... one crate per plugin target
```

### 4.2 Shared Plugin Crate (`holoscript-plugin-shared`)

```toml
# packages/holoscript-plugin-shared/Cargo.toml
[package]
name = "holoscript-plugin-shared"
version = "3.0.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### 4.3 Example Plugin Crate (`holoscript-plugin-unity`)

```toml
# packages/holoscript-plugin-unity/Cargo.toml
[package]
name = "holoscript-plugin-unity"
version = "3.0.0"
edition = "2021"
description = "HoloScript Unity C# export plugin (WASM Component)"

[lib]
crate-type = ["cdylib"]

[dependencies]
wit-bindgen = "0.36"
holoscript-plugin-shared = { path = "../holoscript-plugin-shared" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[package.metadata.component]
package = "holoscript:plugin-unity"

[package.metadata.component.target]
path = "../holoscript-component/wit"
world = "holoscript-platform-plugin"
```

### 4.4 Example Plugin Implementation

```rust
// packages/holoscript-plugin-unity/src/lib.rs

mod codegen;

use wit_bindgen::generate;

generate!({
    world: "holoscript-platform-plugin",
    path: "../holoscript-component/wit",
});

use holoscript::core::types::{
    CompileResult, CompositionNode, Diagnostic, PlatformTarget, Severity,
};
use exports::holoscript::core::{
    platform_compiler::Guest as PlatformCompilerGuest,
    plugin_manifest::Guest as PluginManifestGuest,
};

struct UnityPlugin;

impl PlatformCompilerGuest for UnityPlugin {
    fn compile_for_platform(
        ast: CompositionNode,
        target: PlatformTarget,
    ) -> CompileResult {
        match target {
            PlatformTarget::UnityCsharp => {
                match codegen::generate_unity_csharp(&ast) {
                    Ok(code) => CompileResult::Text(code),
                    Err(e) => CompileResult::Error(vec![Diagnostic {
                        severity: Severity::Error,
                        message: format!("Unity compilation failed: {}", e),
                        span: None,
                        code: Some("UNITY_001".to_string()),
                    }]),
                }
            }
            _ => CompileResult::Error(vec![Diagnostic {
                severity: Severity::Error,
                message: format!("Unity plugin does not support target: {:?}", target),
                span: None,
                code: Some("UNITY_002".to_string()),
            }]),
        }
    }

    fn supported_targets() -> Vec<PlatformTarget> {
        vec![PlatformTarget::UnityCsharp]
    }

    fn plugin_info() -> String {
        r#"{"name":"holoscript-plugin-unity","version":"3.0.0","author":"HoloScript Team"}"#
            .to_string()
    }
}

impl PluginManifestGuest for UnityPlugin {
    fn name() -> String { "holoscript-plugin-unity".to_string() }
    fn version() -> String { "3.0.0".to_string() }
    fn targets() -> Vec<String> { vec!["unity-csharp".to_string()] }
    fn required_core_version() -> String { ">=3.0.0".to_string() }
    fn binary_size_hint() -> u64 { 102_400 } // ~100KB
    fn required_features() -> Vec<String> { vec![] }
}

export!(UnityPlugin);
```

---

## 5. TypeScript Lazy Loading Layer

### 5.1 `ComponentLoader` Class

```typescript
// packages/core/src/compiler/wasm/ComponentLoader.ts

/**
 * Lazy WASM Component Loader
 *
 * Manages on-demand loading, instantiation, and caching of WASM
 * platform plugin components. Uses WeakRef for memory-efficient caching.
 */

export interface ComponentLoaderConfig {
  /** Base URL for WASM binaries (default: '/wasm/') */
  wasmBaseUrl: string;
  /** CDN URL for remote WASM loading (optional) */
  cdnUrl?: string;
  /** Maximum cached components (LRU eviction) */
  maxCached: number;
  /** Preload hints for likely-needed targets */
  preloadHints?: PlatformTarget[];
  /** Timeout for component fetch (ms) */
  fetchTimeout: number;
  /** Enable streaming compilation (WebAssembly.compileStreaming) */
  useStreaming: boolean;
  /** Custom fetch function (for service workers, cache-first, etc.) */
  customFetch?: (url: string) => Promise<Response>;
}

export interface LoadedComponent {
  /** Platform compiler interface */
  compiler: PlatformCompilerInterface;
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Load timestamp */
  loadedAt: number;
  /** Binary size in bytes */
  binarySize: number;
  /** Load duration in ms */
  loadDuration: number;
}

export type PlatformTarget =
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'vrchat'
  | 'openxr'
  | 'visionos'
  | 'android'
  | 'ios'
  | 'webgpu'
  | 'r3f'
  | 'playcanvas'
  | 'urdf'
  | 'sdf'
  | 'usd'
  | 'dtdl'
  | 'wasm'
  | 'ar'
  | 'vrr';

export class ComponentLoader {
  private config: ComponentLoaderConfig;
  private cache: Map<PlatformTarget, WeakRef<LoadedComponent>> = new Map();
  private loading: Map<PlatformTarget, Promise<LoadedComponent>> = new Map();
  private compiledModules: Map<PlatformTarget, WebAssembly.Module> = new Map();
  private metrics: Map<PlatformTarget, LoadMetrics> = new Map();

  constructor(config: Partial<ComponentLoaderConfig> = {}) {
    this.config = {
      wasmBaseUrl: config.wasmBaseUrl ?? '/wasm/',
      cdnUrl: config.cdnUrl,
      maxCached: config.maxCached ?? 8,
      preloadHints: config.preloadHints,
      fetchTimeout: config.fetchTimeout ?? 10_000,
      useStreaming: config.useStreaming ?? true,
      customFetch: config.customFetch,
    };

    // Start preloading hinted targets
    if (this.config.preloadHints?.length) {
      this.preload(this.config.preloadHints);
    }
  }

  /**
   * Load a platform plugin component on-demand
   *
   * Returns cached instance if available, otherwise fetches, compiles,
   * and instantiates the WASM component.
   */
  async load(target: PlatformTarget): Promise<LoadedComponent> {
    // Check cache first
    const cached = this.cache.get(target)?.deref();
    if (cached) {
      return cached;
    }

    // Deduplicate concurrent loads for same target
    const existing = this.loading.get(target);
    if (existing) {
      return existing;
    }

    // Start loading
    const loadPromise = this._load(target);
    this.loading.set(target, loadPromise);

    try {
      const component = await loadPromise;
      this.cache.set(target, new WeakRef(component));
      this.enforceMaxCached();
      return component;
    } finally {
      this.loading.delete(target);
    }
  }

  /**
   * Preload WASM modules without instantiating
   * (compile step only - saves instantiation time for later)
   */
  async preload(targets: PlatformTarget[]): Promise<void> {
    const promises = targets.map(async (target) => {
      if (this.compiledModules.has(target)) return;

      try {
        const url = this.resolveUrl(target);
        const response = await this.fetchWithTimeout(url);
        const module = this.config.useStreaming
          ? await WebAssembly.compileStreaming(response)
          : await WebAssembly.compile(await response.arrayBuffer());
        this.compiledModules.set(target, module);
      } catch (err) {
        // Preload failures are non-fatal
        console.warn(`[ComponentLoader] Preload failed for ${target}:`, err);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Check if a component is loaded and cached
   */
  isLoaded(target: PlatformTarget): boolean {
    return this.cache.get(target)?.deref() !== undefined;
  }

  /**
   * Get loading metrics for a target
   */
  getMetrics(target: PlatformTarget): LoadMetrics | undefined {
    return this.metrics.get(target);
  }

  /**
   * Evict a cached component
   */
  evict(target: PlatformTarget): void {
    this.cache.delete(target);
    this.compiledModules.delete(target);
  }

  /**
   * Evict all cached components
   */
  evictAll(): void {
    this.cache.clear();
    this.compiledModules.clear();
  }

  // -- Private Methods --

  private async _load(target: PlatformTarget): Promise<LoadedComponent> {
    const startTime = performance.now();
    const url = this.resolveUrl(target);

    // Step 1: Get compiled module (may already be preloaded)
    let module = this.compiledModules.get(target);
    if (!module) {
      const response = await this.fetchWithTimeout(url);
      const binarySize = parseInt(response.headers.get('content-length') ?? '0');

      module = this.config.useStreaming
        ? await WebAssembly.compileStreaming(response.clone())
        : await WebAssembly.compile(await response.arrayBuffer());

      this.compiledModules.set(target, module);
    }

    // Step 2: Instantiate with shared type imports
    const imports = this.buildImports();
    const instance = await WebAssembly.instantiate(module, imports);

    // Step 3: Wrap in typed interface
    const compiler = this.wrapPlatformCompiler(instance);
    const manifest = this.wrapPluginManifest(instance);

    const loadDuration = performance.now() - startTime;

    const loaded: LoadedComponent = {
      compiler,
      manifest,
      loadedAt: Date.now(),
      binarySize: 0, // Would be captured from fetch
      loadDuration,
    };

    this.metrics.set(target, {
      target,
      loadDuration,
      compileTime: 0, // Would be measured
      instantiateTime: 0,
      binarySize: 0,
    });

    return loaded;
  }

  private resolveUrl(target: PlatformTarget): string {
    const filename = `holoscript-plugin-${target}.wasm`;
    if (this.config.cdnUrl) {
      return `${this.config.cdnUrl}/${filename}`;
    }
    return `${this.config.wasmBaseUrl}${filename}`;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeout);

    try {
      const fetchFn = this.config.customFetch ?? fetch;
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildImports(): WebAssembly.Imports {
    // The WIT types interface is provided as imports to plugin components
    return {
      'holoscript:core/types': {
        // Type constructors and shared functions would go here
        // The Component Model canonical ABI handles type passing
      },
    };
  }

  private wrapPlatformCompiler(_instance: WebAssembly.Instance): PlatformCompilerInterface {
    // Wraps raw WASM exports in typed TypeScript interface
    // Implementation depends on jco-generated bindings
    throw new Error('TODO: Implement jco binding wrapper');
  }

  private wrapPluginManifest(_instance: WebAssembly.Instance): PluginManifest {
    throw new Error('TODO: Implement jco binding wrapper');
  }

  private enforceMaxCached(): void {
    if (this.cache.size <= this.config.maxCached) return;

    // LRU eviction: remove oldest entry
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

interface LoadMetrics {
  target: PlatformTarget;
  loadDuration: number;
  compileTime: number;
  instantiateTime: number;
  binarySize: number;
}

interface PlatformCompilerInterface {
  compileForPlatform(ast: any, target: string): any;
  supportedTargets(): string[];
  pluginInfo(): string;
}

interface PluginManifest {
  name(): string;
  version(): string;
  targets(): string[];
  requiredCoreVersion(): string;
  binarySizeHint(): bigint;
  requiredFeatures(): string[];
}
```

### 5.2 `LazyCompilerFactory` (Replaces `CompilerFactory`)

```typescript
// packages/core/src/compiler/wasm/LazyCompilerFactory.ts

/**
 * Lazy Compiler Factory
 *
 * Replaces the eager CompilerFactory with a lazy-loading version
 * that fetches WASM plugin components on-demand.
 *
 * Backward compatible: Falls back to TypeScript compilers when
 * WASM is unavailable or fails to load.
 */

import { ComponentLoader, type PlatformTarget } from './ComponentLoader';
import type { ExportTarget } from '../CircuitBreaker';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// Map ExportTarget strings to WASM plugin targets
const TARGET_TO_PLUGIN: Partial<Record<ExportTarget, PlatformTarget>> = {
  unity: 'unity',
  unreal: 'unreal',
  godot: 'godot',
  vrchat: 'vrchat',
  openxr: 'openxr',
  visionos: 'visionos',
  android: 'android',
  'android-xr': 'android',
  ios: 'ios',
  webgpu: 'webgpu',
  r3f: 'r3f',
  playcanvas: 'playcanvas',
  urdf: 'urdf',
  sdf: 'sdf',
  usd: 'usd',
  usdz: 'usd',
  dtdl: 'dtdl',
  wasm: 'wasm',
  ar: 'ar',
  vrr: 'vrr',
  babylon: 'babylon', // Note: Babylon is in core targets AND as platform plugin
};

// Targets handled by core WASM component (not separate plugins)
const CORE_TARGETS: ExportTarget[] = ['multi-layer', 'incremental', 'state', 'trait-composition'];

export interface LazyCompilerFactoryConfig {
  /** Enable WASM components (default: true) */
  useWasm: boolean;
  /** Component loader config */
  loaderConfig?: Partial<import('./ComponentLoader').ComponentLoaderConfig>;
  /** Fallback to TS compilers on WASM failure (default: true) */
  fallbackToTypeScript: boolean;
}

export class LazyCompilerFactory {
  private componentLoader: ComponentLoader;
  private config: Required<LazyCompilerFactoryConfig>;

  // Lazy-loaded TS compiler modules (dynamic imports)
  private tsCompilerCache: Map<ExportTarget, any> = new Map();

  constructor(config: Partial<LazyCompilerFactoryConfig> = {}) {
    this.config = {
      useWasm: config.useWasm ?? true,
      loaderConfig: config.loaderConfig ?? {},
      fallbackToTypeScript: config.fallbackToTypeScript ?? true,
    };

    this.componentLoader = new ComponentLoader(this.config.loaderConfig);
  }

  /**
   * Get a compiler for the given target.
   *
   * Strategy:
   * 1. If WASM enabled and target has a plugin -> load WASM plugin
   * 2. If WASM fails or disabled -> dynamic import() TS compiler
   * 3. If TS import fails -> throw
   */
  async createCompiler(
    target: ExportTarget,
    options: Record<string, any> = {}
  ): Promise<ICompiler> {
    // Core targets always use TS compilers (no separate WASM plugin)
    if (CORE_TARGETS.includes(target)) {
      return this.loadTypeScriptCompiler(target, options);
    }

    // Try WASM first
    if (this.config.useWasm) {
      const pluginTarget = TARGET_TO_PLUGIN[target];
      if (pluginTarget) {
        try {
          const component = await this.componentLoader.load(pluginTarget);
          return new WASMCompilerAdapter(component, target);
        } catch (err) {
          console.warn(
            `[LazyCompilerFactory] WASM load failed for ${target}, ` +
              `falling back to TypeScript:`,
            err
          );
        }
      }
    }

    // Fallback to TypeScript compiler
    if (this.config.fallbackToTypeScript) {
      return this.loadTypeScriptCompiler(target, options);
    }

    throw new Error(`No compiler available for target: ${target}`);
  }

  /**
   * Dynamic import of TypeScript compiler module
   */
  private async loadTypeScriptCompiler(
    target: ExportTarget,
    options: Record<string, any>
  ): Promise<ICompiler> {
    // Check cache
    const cached = this.tsCompilerCache.get(target);
    if (cached) {
      return new cached(options);
    }

    // Dynamic import based on target
    const module = await this.dynamicImportCompiler(target);
    const CompilerClass = this.extractCompilerClass(module, target);
    this.tsCompilerCache.set(target, CompilerClass);
    return new CompilerClass(options);
  }

  private async dynamicImportCompiler(target: ExportTarget): Promise<any> {
    // Each target maps to a separate chunk thanks to tsup code splitting
    switch (target) {
      case 'unity':
        return import('../UnityCompiler');
      case 'unreal':
        return import('../UnrealCompiler');
      case 'godot':
        return import('../GodotCompiler');
      case 'vrchat':
        return import('../VRChatCompiler');
      case 'openxr':
        return import('../OpenXRCompiler');
      case 'visionos':
        return import('../VisionOSCompiler');
      case 'android':
      case 'android-xr':
        return import('../AndroidCompiler');
      case 'ios':
        return import('../IOSCompiler');
      case 'webgpu':
        return import('../WebGPUCompiler');
      case 'r3f':
        return import('../R3FCompiler');
      case 'babylon':
        return import('../BabylonCompiler');
      case 'playcanvas':
        return import('../PlayCanvasCompiler');
      case 'urdf':
        return import('../URDFCompiler');
      case 'sdf':
        return import('../SDFCompiler');
      case 'usd':
      case 'usdz':
        return import('../USDPhysicsCompiler');
      case 'dtdl':
        return import('../DTDLCompiler');
      case 'wasm':
        return import('../WASMCompiler');
      case 'ar':
        return import('../ARCompiler');
      case 'vrr':
        return import('../VRRCompiler');
      case 'multi-layer':
        return import('../MultiLayerCompiler');
      case 'incremental':
        return import('../IncrementalCompiler');
      case 'state':
        return import('../StateCompiler');
      case 'trait-composition':
        return import('../TraitCompositionCompiler');
      default:
        throw new Error(`Unknown export target: ${target}`);
    }
  }

  private extractCompilerClass(module: any, target: ExportTarget): any {
    // Extract the named export (e.g., UnityCompiler from the module)
    const className = this.targetToClassName(target);
    return module[className] || module.default;
  }

  private targetToClassName(target: ExportTarget): string {
    const map: Partial<Record<ExportTarget, string>> = {
      unity: 'UnityCompiler',
      unreal: 'UnrealCompiler',
      godot: 'GodotCompiler',
      vrchat: 'VRChatCompiler',
      openxr: 'OpenXRCompiler',
      visionos: 'VisionOSCompiler',
      android: 'AndroidCompiler',
      'android-xr': 'AndroidXRCompiler',
      ios: 'IOSCompiler',
      webgpu: 'WebGPUCompiler',
      r3f: 'R3FCompiler',
      babylon: 'BabylonCompiler',
      playcanvas: 'PlayCanvasCompiler',
      urdf: 'URDFCompiler',
      sdf: 'SDFCompiler',
      usd: 'USDPhysicsCompiler',
      usdz: 'USDZPipeline',
      dtdl: 'DTDLCompiler',
      wasm: 'WASMCompiler',
      ar: 'ARCompiler',
      vrr: 'VRRCompiler',
      'multi-layer': 'MultiLayerCompiler',
      incremental: 'IncrementalCompiler',
      state: 'StateCompiler',
      'trait-composition': 'TraitCompositionCompiler',
    };
    return map[target] || 'Compiler';
  }

  /** Get the underlying component loader for metrics/control */
  getComponentLoader(): ComponentLoader {
    return this.componentLoader;
  }
}

/**
 * Adapter that wraps a WASM platform-compiler component
 * to match the ICompiler TypeScript interface
 */
class WASMCompilerAdapter {
  constructor(
    private component: import('./ComponentLoader').LoadedComponent,
    private target: ExportTarget
  ) {}

  compile(composition: HoloComposition, _agentToken?: string): string {
    const ast = this.serializeToWIT(composition);
    const result = this.component.compiler.compileForPlatform(ast, this.target);
    return this.deserializeResult(result);
  }

  private serializeToWIT(composition: HoloComposition): any {
    // Convert TypeScript HoloComposition to WIT composition-node
    // This follows the Canonical ABI for Component Model types
    return composition; // Simplified; real impl uses jco bindings
  }

  private deserializeResult(result: any): string {
    if (result.tag === 'text') return result.val;
    if (result.tag === 'binary') return Buffer.from(result.val).toString();
    if (result.tag === 'error') {
      throw new Error(result.val.map((d: any) => d.message).join('\n'));
    }
    throw new Error('Unknown compile result type');
  }
}

interface ICompiler {
  compile(
    composition: HoloComposition,
    agentToken?: string,
    outputPath?: string
  ): string | Record<string, string>;
}
```

### 5.3 Updated `ExportManager` Integration

The key change to `ExportManager.ts` is minimal -- replace `CompilerFactory` with `LazyCompilerFactory`:

```typescript
// In ExportManager.ts, replace:
//   private compilerFactory: CompilerFactory;
// With:
//   private compilerFactory: LazyCompilerFactory;

// And make exportWithCircuitBreaker async-aware for the lazy load:
private async exportWithCircuitBreaker(...) {
  const exportOperation = async () => {
    // OLD: const compiler = this.compilerFactory.createCompiler(target, opts);
    // NEW: (now async to allow lazy loading)
    const compiler = await this.compilerFactory.createCompiler(target, opts);
    const output = await compiler.compile(composition);
    return output;
  };
  // ... rest unchanged
}
```

This is backward compatible because `CompilerFactory.createCompiler()` already returns synchronously in the current code, and the `ExportManager.export()` method is already `async`.

---

## 6. Build Pipeline

### 6.1 Rust Plugin Build Script

```bash
#!/usr/bin/env bash
# scripts/build-wasm-plugins.sh

set -euo pipefail

PLUGINS=(
  "unity" "unreal" "godot" "vrchat" "openxr"
  "visionos" "android" "ios" "webgpu" "r3f"
  "playcanvas" "urdf" "sdf" "usd" "dtdl"
  "wasm" "ar" "vrr"
)

OUT_DIR="packages/core/dist/wasm"
mkdir -p "$OUT_DIR"

echo "Building holoscript-core WASM component..."
cd packages/holoscript-component
cargo component build --release
cp target/wasm32-wasip1/release/holoscript_component.wasm "$OUT_DIR/holoscript-core.wasm"
cd ../..

for plugin in "${PLUGINS[@]}"; do
  CRATE_DIR="packages/holoscript-plugin-${plugin}"
  if [ -d "$CRATE_DIR" ]; then
    echo "Building plugin: $plugin..."
    cd "$CRATE_DIR"
    cargo component build --release
    cp "target/wasm32-wasip1/release/holoscript_plugin_${plugin}.wasm" \
       "../../$OUT_DIR/holoscript-plugin-${plugin}.wasm"
    cd ../..

    # Report size
    SIZE=$(stat -f%z "$OUT_DIR/holoscript-plugin-${plugin}.wasm" 2>/dev/null || \
           stat -c%s "$OUT_DIR/holoscript-plugin-${plugin}.wasm" 2>/dev/null || echo "?")
    echo "  -> holoscript-plugin-${plugin}.wasm: ${SIZE} bytes"
  fi
done

echo ""
echo "All WASM plugins built. Output: $OUT_DIR/"
ls -lh "$OUT_DIR/"
```

### 6.2 CDN Deployment

WASM binaries are deployed to CDN with:

- Content-Type: `application/wasm`
- Cache-Control: `public, max-age=31536000, immutable` (versioned URLs)
- Content hashing for cache busting: `holoscript-plugin-unity.a1b2c3.wasm`

### 6.3 NPM Package Distribution

```json
{
  "name": "@holoscript/core",
  "files": ["dist", "dist/wasm/*.wasm"],
  "exports": {
    "./wasm/*": {
      "default": "./dist/wasm/*"
    }
  }
}
```

---

## 7. Performance Characteristics

### 7.1 Loading Timeline

| Phase            | Duration  | Description                               |
| ---------------- | --------- | ----------------------------------------- |
| Initial load     | 50-200ms  | Core parser+validator (~800KB compressed) |
| First export     | 100-500ms | Fetch + compile + instantiate plugin      |
| Cached export    | <5ms      | Instantiate from cached module            |
| Preloaded export | 20-50ms   | Instantiate from pre-compiled module      |

### 7.2 Memory Profile

| Component     | Heap Usage   | Notes                             |
| ------------- | ------------ | --------------------------------- |
| Core WASM     | 2-4 MB       | Parser, validator, core compilers |
| Each plugin   | 0.5-2 MB     | Only when loaded                  |
| WeakRef cache | ~0           | GC reclaims unused plugins        |
| Module cache  | 50-300KB per | Compiled module (reusable)        |

### 7.3 Bundle Size Comparison

| Scenario                | Before (TS monolith) | After (lazy WASM) | Savings |
| ----------------------- | -------------------- | ----------------- | ------- |
| Import @holoscript/core | ~20 MB               | ~2 MB             | **90%** |
| Use 1 compiler          | ~20 MB               | ~2.1 MB           | **89%** |
| Use 3 compilers         | ~20 MB               | ~2.3 MB           | **88%** |
| Use all compilers       | ~20 MB               | ~4.5 MB           | **77%** |

---

## 8. Migration Path

### Phase 1: Foundation (2 weeks)

1. Create `holoscript-plugin-shared` crate with shared codegen utilities
2. Create `ComponentLoader` TypeScript class
3. Create `LazyCompilerFactory` TypeScript class
4. Update `ExportManager` to use `LazyCompilerFactory`
5. All changes backward compatible (TS fallback always available)

### Phase 2: First Plugins (2 weeks)

1. Port `URDFCompiler` to Rust WASM plugin (smallest, most self-contained)
2. Port `SDFCompiler` to Rust WASM plugin
3. Port `DTDLCompiler` to Rust WASM plugin
4. Validate end-to-end: load, compile, output matches TS compiler
5. Benchmark: load time, compile time, output correctness

### Phase 3: Game Engine Plugins (3 weeks)

1. Port `UnityCompiler` to Rust WASM plugin
2. Port `UnrealCompiler` to Rust WASM plugin
3. Port `GodotCompiler` to Rust WASM plugin
4. Test plugin group loading (all game engines at once)

### Phase 4: Remaining Plugins (3 weeks)

1. Port XR targets: VRChat, OpenXR, VisionOS, Android, iOS
2. Port web targets: WebGPU, R3F, PlayCanvas, Babylon
3. Port specialized: WASM, AR, VRR, USD/USDZ

### Phase 5: Optimization (1 week)

1. Binary size optimization (`wasm-opt -Oz`)
2. Preload hint tuning based on usage analytics
3. Service Worker caching strategy
4. CDN deployment pipeline

---

## 9. Testing Strategy

### 9.1 Parity Tests

Every WASM plugin must produce byte-identical output compared to its TypeScript counterpart for a suite of test compositions.

```typescript
describe('UnityPlugin WASM parity', () => {
  for (const fixture of TEST_COMPOSITIONS) {
    it(`matches TS output for ${fixture.name}`, async () => {
      const tsOutput = new UnityCompiler().compile(fixture.composition);
      const wasmPlugin = await componentLoader.load('unity');
      const wasmOutput = wasmPlugin.compiler.compileForPlatform(
        fixture.composition,
        'unity-csharp'
      );
      expect(wasmOutput).toEqual(tsOutput);
    });
  }
});
```

### 9.2 Lazy Loading Tests

```typescript
describe('ComponentLoader', () => {
  it('loads plugin on first request', async () => {
    expect(loader.isLoaded('unity')).toBe(false);
    await loader.load('unity');
    expect(loader.isLoaded('unity')).toBe(true);
  });

  it('returns cached instance on second request', async () => {
    const a = await loader.load('unity');
    const b = await loader.load('unity');
    expect(a).toBe(b);
  });

  it('deduplicates concurrent loads', async () => {
    const [a, b] = await Promise.all([loader.load('unity'), loader.load('unity')]);
    expect(a).toBe(b);
  });

  it('evicts LRU when max exceeded', async () => {
    // Load maxCached + 1 plugins
    // Verify oldest is evicted
  });

  it('falls back to TS on WASM failure', async () => {
    // Mock fetch to fail
    // Verify TS compiler is loaded instead
  });
});
```

---

## 10. Risk Assessment

| Risk                                 | Probability | Impact | Mitigation                                |
| ------------------------------------ | ----------- | ------ | ----------------------------------------- |
| WASM Component Model browser support | Medium      | High   | Always fall back to TS compilers          |
| Plugin binary size too large         | Low         | Medium | `wasm-opt -Oz`, measure per-plugin        |
| AST serialization overhead           | Medium      | Medium | Benchmark; consider shared memory         |
| Plugin version incompatibility       | Low         | High   | Version check in plugin-manifest          |
| CDN availability                     | Low         | Medium | NPM bundle fallback, Service Worker cache |
| jco binding generation breaks        | Medium      | Medium | Pin jco version, integration tests        |

---

## 11. Appendix: Full Target Mapping

| ExportTarget        | WASM Plugin         | WIT platform-target | Plugin Group  |
| ------------------- | ------------------- | ------------------- | ------------- |
| `unity`             | `plugin-unity`      | `unity-csharp`      | Game Engines  |
| `unreal`            | `plugin-unreal`     | `unreal-cpp`        | Game Engines  |
| `godot`             | `plugin-godot`      | `godot-gdscript`    | Game Engines  |
| `vrchat`            | `plugin-vrchat`     | `vrchat-udon`       | Mobile/XR     |
| `openxr`            | `plugin-openxr`     | `openxr`            | Mobile/XR     |
| `android`           | `plugin-android`    | `android-arcore`    | Mobile/XR     |
| `android-xr`        | `plugin-android`    | `android-arcore`    | Mobile/XR     |
| `ios`               | `plugin-ios`        | (new: `ios-arkit`)  | Mobile/XR     |
| `visionos`          | `plugin-visionos`   | `visionos-swift`    | Mobile/XR     |
| `ar`                | `plugin-ar`         | (new: `generic-ar`) | Mobile/XR     |
| `babylon`           | `plugin-babylon`    | (core: `babylonjs`) | Web Platforms |
| `webgpu`            | `plugin-webgpu`     | `webgpu-wgsl`       | Web Platforms |
| `r3f`               | `plugin-r3f`        | `react-three-fiber` | Web Platforms |
| `playcanvas`        | `plugin-playcanvas` | `playcanvas`        | Web Platforms |
| `urdf`              | `plugin-urdf`       | `urdf`              | Robotics      |
| `sdf`               | `plugin-sdf`        | `sdf`               | Robotics      |
| `usd`               | `plugin-usd`        | `usd`               | Robotics      |
| `usdz`              | `plugin-usd`        | `usd`               | Robotics      |
| `dtdl`              | `plugin-dtdl`       | (new: `dtdl`)       | Specialized   |
| `wasm`              | `plugin-wasm`       | (new: `wasm-wat`)   | Specialized   |
| `vrr`               | `plugin-vrr`        | (new: `vrr`)        | Specialized   |
| `multi-layer`       | (core TS)           | N/A                 | Core          |
| `incremental`       | (core TS)           | N/A                 | Core          |
| `state`             | (core TS)           | N/A                 | Core          |
| `trait-composition` | (core TS)           | N/A                 | Core          |

---

_Architecture designed for HoloScript v3.43.0+_
_Author: HoloScript Autonomous Administrator_
_Date: 2026-02-28_
