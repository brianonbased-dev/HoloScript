/**
 * platform-plugin-loader.ts — Lazy Platform Plugin Loading
 *
 * Loads platform-specific compiler plugins (Unity, Godot, Unreal, etc.)
 * as separate WASM components on demand. Each plugin implements the
 * `platform-compiler` WIT interface and is loaded only when the user
 * requests compilation for that target.
 *
 * Architecture:
 *   Engine Core WASM (~800KB, always loaded)
 *     ↓ produces JSON AST
 *   Platform Plugin WASM (~100-400KB each, loaded on demand)
 *     ↓ produces target-specific output (C#, GDScript, C++, etc.)
 *
 * Plugin resolution order:
 *   1. Tauri: Ask native side to load from bundled plugins/
 *   2. Browser: Fetch from CDN or /wasm/plugins/
 *   3. OPFS cache: Check local cache first
 *
 * @see packages/holoscript-component/wit/holoscript.wit (platform-compiler interface)
 */

import type { CompileResult, PlatformTarget, Diagnostic } from './wasm-compiler-bridge';
import type { PlatformCapabilities } from './platform-detect';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface PlatformPlugin {
  /** WIT world: holoscript-platform-plugin */
  name: string;
  version: string;
  targets: PlatformTarget[];
  /** Compile AST JSON to platform-specific output */
  compileToPlatform(astJson: string, target: PlatformTarget): CompileResult;
  /** Unload the plugin to free memory */
  unload(): void;
}

export interface PluginManifest {
  name: string;
  version: string;
  targets: PlatformTarget[];
  wasmUrl: string;
  sizeKB: number;
  /** SHA256 hash for integrity checking */
  integrity?: string;
}

export interface PluginLoaderConfig {
  /** Base URL for plugin WASM binaries */
  baseUrl: string;
  /** Whether to cache plugins in OPFS */
  useOPFSCache: boolean;
  /** Maximum total plugin memory in MB */
  maxTotalMemoryMB: number;
  /** Platform capabilities (for choosing optimal load strategy) */
  platform: PlatformCapabilities;
}

interface LoadedPlugin {
  plugin: PlatformPlugin;
  manifest: PluginManifest;
  loadedAt: number;
  lastUsed: number;
  memoryKB: number;
}

// ═══════════════════════════════════════════════════════════════════
// Built-in Plugin Registry
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_MANIFEST: PluginManifest[] = [
  {
    name: 'holoscript-plugin-unity',
    version: '0.1.0',
    targets: ['unity-csharp'],
    wasmUrl: 'plugins/holoscript-plugin-unity.component.wasm',
    sizeKB: 250,
  },
  {
    name: 'holoscript-plugin-godot',
    version: '0.1.0',
    targets: ['godot-gdscript'],
    wasmUrl: 'plugins/holoscript-plugin-godot.component.wasm',
    sizeKB: 200,
  },
  {
    name: 'holoscript-plugin-unreal',
    version: '0.1.0',
    targets: ['unreal-cpp'],
    wasmUrl: 'plugins/holoscript-plugin-unreal.component.wasm',
    sizeKB: 350,
  },
  {
    name: 'holoscript-plugin-vrchat',
    version: '0.1.0',
    targets: ['vrchat-udon'],
    wasmUrl: 'plugins/holoscript-plugin-vrchat.component.wasm',
    sizeKB: 180,
  },
  {
    name: 'holoscript-plugin-xr',
    version: '0.1.0',
    targets: ['openxr', 'visionos-swift', 'android-arcore'],
    wasmUrl: 'plugins/holoscript-plugin-xr.component.wasm',
    sizeKB: 300,
  },
  {
    name: 'holoscript-plugin-webgpu',
    version: '0.1.0',
    targets: ['webgpu-wgsl', 'react-three-fiber', 'playcanvas'],
    wasmUrl: 'plugins/holoscript-plugin-webgpu.component.wasm',
    sizeKB: 220,
  },
  {
    name: 'holoscript-plugin-robotics',
    version: '0.1.0',
    targets: ['urdf', 'sdf', 'usd'],
    wasmUrl: 'plugins/holoscript-plugin-robotics.component.wasm',
    sizeKB: 280,
  },
];

// ═══════════════════════════════════════════════════════════════════
// PlatformPluginLoader
// ═══════════════════════════════════════════════════════════════════

export class PlatformPluginLoader {
  private config: PluginLoaderConfig;
  private manifests: PluginManifest[];
  private loaded = new Map<string, LoadedPlugin>();
  private loading = new Map<string, Promise<PlatformPlugin>>();

  constructor(config: Partial<PluginLoaderConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || '/wasm/',
      useOPFSCache: config.useOPFSCache ?? true,
      maxTotalMemoryMB: config.maxTotalMemoryMB ?? 32,
      platform:
        config.platform ||
        ({
          runtime: 'browser',
          isTauri: false,
          hasWasm: true,
        } as PlatformCapabilities),
    };
    this.manifests = [...DEFAULT_MANIFEST];
  }

  /** Register additional plugin manifests */
  registerPlugins(manifests: PluginManifest[]): void {
    for (const m of manifests) {
      // Replace existing or add new
      const idx = this.manifests.findIndex((e) => e.name === m.name);
      if (idx >= 0) {
        this.manifests[idx] = m;
      } else {
        this.manifests.push(m);
      }
    }
  }

  /** Find which plugin handles a given target */
  findPluginForTarget(target: PlatformTarget): PluginManifest | null {
    return this.manifests.find((m) => m.targets.includes(target)) || null;
  }

  /** Get all supported platform targets */
  getSupportedTargets(): PlatformTarget[] {
    return this.manifests.flatMap((m) => m.targets);
  }

  /**
   * Compile for a platform target, loading the plugin on demand.
   * This is the main entry point — handles loading, caching, and LRU eviction.
   */
  async compileForPlatform(astJson: string, target: PlatformTarget): Promise<CompileResult> {
    const manifest = this.findPluginForTarget(target);
    if (!manifest) {
      return {
        type: 'error',
        diagnostics: [
          {
            severity: 'error',
            message: `No plugin available for target: ${target}. Available targets: ${this.getSupportedTargets().join(', ')}`,
          },
        ],
      };
    }

    try {
      const plugin = await this.ensureLoaded(manifest);
      const entry = this.loaded.get(manifest.name);
      if (entry) entry.lastUsed = Date.now();
      return plugin.compileToPlatform(astJson, target);
    } catch (error) {
      return {
        type: 'error',
        diagnostics: [
          {
            severity: 'error',
            message: `Plugin load failed (${manifest.name}): ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /** Preload a plugin without compiling (warm the cache) */
  async preload(target: PlatformTarget): Promise<boolean> {
    const manifest = this.findPluginForTarget(target);
    if (!manifest) return false;

    try {
      await this.ensureLoaded(manifest);
      return true;
    } catch {
      return false;
    }
  }

  /** Unload a specific plugin */
  unload(pluginName: string): void {
    const entry = this.loaded.get(pluginName);
    if (entry) {
      entry.plugin.unload();
      this.loaded.delete(pluginName);
    }
  }

  /** Unload all plugins */
  unloadAll(): void {
    for (const [name, entry] of this.loaded) {
      entry.plugin.unload();
      this.loaded.delete(name);
    }
    this.loading.clear();
  }

  /** Get loader statistics */
  getStats(): {
    loadedPlugins: string[];
    totalMemoryKB: number;
    availableTargets: PlatformTarget[];
  } {
    const loadedPlugins = [...this.loaded.keys()];
    const totalMemoryKB = [...this.loaded.values()].reduce((sum, e) => sum + e.memoryKB, 0);
    return {
      loadedPlugins,
      totalMemoryKB,
      availableTargets: this.getSupportedTargets(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: Plugin Loading
  // ─────────────────────────────────────────────────────────────────

  private async ensureLoaded(manifest: PluginManifest): Promise<PlatformPlugin> {
    // Already loaded
    const existing = this.loaded.get(manifest.name);
    if (existing) return existing.plugin;

    // Currently loading (dedup concurrent requests)
    const inFlight = this.loading.get(manifest.name);
    if (inFlight) return inFlight;

    // Start loading
    const promise = this.loadPlugin(manifest);
    this.loading.set(manifest.name, promise);

    try {
      const plugin = await promise;
      this.loaded.set(manifest.name, {
        plugin,
        manifest,
        loadedAt: Date.now(),
        lastUsed: Date.now(),
        memoryKB: manifest.sizeKB * 2, // Rough estimate: 2x binary size in memory
      });

      // Evict LRU plugins if over memory budget
      this.evictIfNeeded();

      return plugin;
    } finally {
      this.loading.delete(manifest.name);
    }
  }

  private async loadPlugin(manifest: PluginManifest): Promise<PlatformPlugin> {
    const wasmUrl = new URL(manifest.wasmUrl, this.config.baseUrl).toString();

    // Try OPFS cache first
    if (this.config.useOPFSCache) {
      const cached = await this.loadFromOPFS(manifest);
      if (cached) return cached;
    }

    // Fetch from network
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugin: ${response.status} ${response.statusText} (${wasmUrl})`
      );
    }

    const wasmBytes = await response.arrayBuffer();

    // Integrity check
    if (manifest.integrity) {
      const hash = await computeSHA256(wasmBytes);
      if (hash !== manifest.integrity) {
        throw new Error(`Plugin integrity check failed for ${manifest.name}`);
      }
    }

    // Cache to OPFS for next time
    if (this.config.useOPFSCache) {
      await this.saveToOPFS(manifest, wasmBytes).catch((e) =>
        logger.warn(`[PluginLoader] OPFS cache write failed:`, e)
      );
    }

    return this.instantiatePlugin(manifest, wasmBytes);
  }

  private async instantiatePlugin(
    manifest: PluginManifest,
    wasmBytes: ArrayBuffer
  ): Promise<PlatformPlugin> {
    // Try jco-transpiled JS module first
    try {
      const jsUrl = new URL(
        manifest.wasmUrl.replace('.component.wasm', '.js').replace('.wasm', '.js'),
        this.config.baseUrl
      ).toString();

      const module = (await import(/* @vite-ignore */ jsUrl)) as {
        compileForPlatform(ast: string, target: string): unknown;
        supportedTargets(): string[];
        pluginInfo(): string;
      };

      return {
        name: manifest.name,
        version: manifest.version,
        targets: manifest.targets,
        compileToPlatform(astJson: string, target: PlatformTarget): CompileResult {
          const result = module.compileForPlatform(astJson, target);
          return normalizeCompileResult(result);
        },
        unload() {
          // jco modules don't have explicit cleanup
        },
      };
    } catch {
      // Fall through to raw WASM
    }

    // Raw WebAssembly instantiation fallback
    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    const exports = instance.exports as Record<string, unknown>;

    return {
      name: manifest.name,
      version: manifest.version,
      targets: manifest.targets,
      compileToPlatform(astJson: string, target: PlatformTarget): CompileResult {
        const fn = exports['compile_for_platform'] as
          | ((ast: string, target: string) => unknown)
          | undefined;
        if (!fn) {
          return {
            type: 'error',
            diagnostics: [
              { severity: 'error', message: 'Plugin missing compile_for_platform export' },
            ],
          };
        }
        return normalizeCompileResult(fn(astJson, target));
      },
      unload() {
        // Core WASM doesn't have explicit cleanup
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: OPFS Cache
  // ─────────────────────────────────────────────────────────────────

  private async loadFromOPFS(manifest: PluginManifest): Promise<PlatformPlugin | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const pluginsDir = await root.getDirectoryHandle('holoscript-plugins', { create: false });
      const cacheKey = `${manifest.name}@${manifest.version}.wasm`;
      const fileHandle = await pluginsDir.getFileHandle(cacheKey, { create: false });
      const file = await fileHandle.getFile();
      const bytes = await file.arrayBuffer();
      return this.instantiatePlugin(manifest, bytes);
    } catch {
      return null;
    }
  }

  private async saveToOPFS(manifest: PluginManifest, bytes: ArrayBuffer): Promise<void> {
    const root = await navigator.storage.getDirectory();
    const pluginsDir = await root.getDirectoryHandle('holoscript-plugins', { create: true });
    const cacheKey = `${manifest.name}@${manifest.version}.wasm`;
    const fileHandle = await pluginsDir.getFileHandle(cacheKey, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: LRU Eviction
  // ─────────────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    const maxKB = this.config.maxTotalMemoryMB * 1024;
    let totalKB = [...this.loaded.values()].reduce((sum, e) => sum + e.memoryKB, 0);

    if (totalKB <= maxKB) return;

    // Sort by lastUsed ascending (oldest first)
    const entries = [...this.loaded.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const [name, entry] of entries) {
      if (totalKB <= maxKB) break;
      entry.plugin.unload();
      this.loaded.delete(name);
      totalKB -= entry.memoryKB;
      console.info(`[PluginLoader] Evicted ${name} (LRU, freed ~${entry.memoryKB}KB)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

function normalizeCompileResult(result: unknown): CompileResult {
  if (typeof result === 'object' && result !== null && 'tag' in result) {
    const v = result as { tag: string; val: unknown };
    switch (v.tag) {
      case 'text':
        return { type: 'text', data: v.val as string };
      case 'binary':
        return { type: 'binary', data: v.val as Uint8Array };
      case 'error':
        return { type: 'error', diagnostics: v.val as Diagnostic[] };
    }
  }

  if (typeof result === 'string') {
    return { type: 'text', data: result };
  }

  return { type: 'text', data: JSON.stringify(result) };
}

async function computeSHA256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════

let instance: PlatformPluginLoader | null = null;

export function getPluginLoader(config?: Partial<PluginLoaderConfig>): PlatformPluginLoader {
  if (!instance) {
    instance = new PlatformPluginLoader(config);
  }
  return instance;
}

export function resetPluginLoader(): void {
  instance?.unloadAll();
  instance = null;
}
