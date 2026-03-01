/**
 * tauri-bridge.ts — Tauri Desktop Feature Gates & Native Bridge
 *
 * When running inside the Tauri desktop shell, this module:
 *   1. Detects Tauri runtime and exposes native GPU info via IPC
 *   2. Loads WASM from Tauri resource bundle (not /wasm/ fetch)
 *   3. Provides native file system commands for project I/O
 *   4. Exposes native shader preview pipeline (wgpu)
 *
 * Feature Gate Architecture:
 *   Browser path:  fetch('/wasm/holoscript.js') → Web Worker → WASM init
 *   Tauri path:    tauri://localhost/wasm/... → Web Worker → WASM init
 *
 * The WASM Worker works identically in both cases — only the URL changes.
 * Tauri bundles WASM in its resource directory and serves via custom-protocol.
 *
 * @see ADAPTIVE_PLATFORM_LAYERS.md §3 Desktop Layer
 * @see packages/tauri-app/src-tauri/main.rs for Rust IPC handlers
 */

import type { PlatformCapabilities } from './platform-detect';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface TauriGpuInfo {
  name: string;
  vendor: string;
  backend: string;
  supports_webgpu: boolean;
}

export interface TauriProjectMeta {
  name: string;
  version: string;
  created: string;
  modified: string;
  scene_count: number;
}

export interface TauriFeatureGates {
  /** Tauri runtime detected */
  isTauri: boolean;
  /** Native GPU info from wgpu adapter */
  gpuInfo: TauriGpuInfo | null;
  /** App version from Cargo.toml */
  appVersion: string | null;
  /** Whether native shader preview (wgpu) is available */
  hasNativeShaderPreview: boolean;
  /** Whether native file system access is available */
  hasNativeFileSystem: boolean;
  /** WASM URL resolved for Tauri resource bundle */
  wasmUrl: string;
}

type TauriInvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

// ═══════════════════════════════════════════════════════════════════
// Tauri Detection & Invoke
// ═══════════════════════════════════════════════════════════════════

let _invoke: TauriInvokeFn | null | undefined; // undefined = not yet checked

/**
 * Get the Tauri invoke function if running in Tauri context.
 * Returns null if not in Tauri (browser environment).
 * Caches the result for subsequent calls.
 */
export async function getTauriInvoke(): Promise<TauriInvokeFn | null> {
  // Always check the sync heuristic first — if __TAURI__ isn't present, don't try
  if (!isTauri()) {
    _invoke = null;
    return null;
  }

  if (_invoke !== undefined) return _invoke;

  try {
    // @tauri-apps/api is only available inside the Tauri webview
    const { invoke } = await import('@tauri-apps/api/core');
    _invoke = invoke as TauriInvokeFn;
    return _invoke;
  } catch {
    _invoke = null;
    return null;
  }
}

/** Reset the invoke cache (for testing) */
export function _resetTauriCache(): void {
  _invoke = undefined;
}

/** Check if running in Tauri desktop shell (synchronous, heuristic) */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// ═══════════════════════════════════════════════════════════════════
// Feature Gate Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect all Tauri-specific feature gates.
 *
 * In browser mode, returns a minimal object with `isTauri: false`.
 * In Tauri mode, probes native capabilities via IPC commands.
 */
export async function detectTauriFeatures(): Promise<TauriFeatureGates> {
  const defaults: TauriFeatureGates = {
    isTauri: false,
    gpuInfo: null,
    appVersion: null,
    hasNativeShaderPreview: false,
    hasNativeFileSystem: false,
    wasmUrl: '/wasm/holoscript.js',
  };

  if (!isTauri()) return defaults;

  const invoke = await getTauriInvoke();
  if (!invoke) return defaults;

  defaults.isTauri = true;
  // Tauri serves bundled resources from the custom protocol origin
  defaults.wasmUrl = resolveWasmUrl();
  defaults.hasNativeFileSystem = true;

  // Probe native capabilities in parallel
  const [gpuInfo, appVersion, shaderPreviewCheck] = await Promise.allSettled([
    invoke('get_gpu_info') as Promise<TauriGpuInfo>,
    invoke('get_app_version') as Promise<string>,
    invoke('shader_preview_init', { width: 1, height: 1 })
      .then(() => invoke('shader_preview_destroy'))
      .then(() => true)
      .catch(() => false),
  ]);

  if (gpuInfo.status === 'fulfilled') {
    defaults.gpuInfo = gpuInfo.value;
  }
  if (appVersion.status === 'fulfilled') {
    defaults.appVersion = appVersion.value;
  }
  if (shaderPreviewCheck.status === 'fulfilled') {
    defaults.hasNativeShaderPreview = shaderPreviewCheck.value as boolean;
  }

  return defaults;
}

/**
 * Resolve the WASM module URL for the current runtime.
 *
 * - Browser: `/wasm/holoscript.js` (served from public/)
 * - Tauri: Uses the custom protocol to load from bundled resources.
 *   Tauri 2.0 serves `../../../packages/studio/out` as the frontend dist,
 *   so `public/wasm/` is accessible at the same relative path.
 */
export function resolveWasmUrl(): string {
  if (isTauri()) {
    // Tauri custom-protocol serves the frontend dist at the root
    // WASM files in public/wasm/ are served as-is
    return '/wasm/holoscript.js';
  }
  return '/wasm/holoscript.js';
}

// ═══════════════════════════════════════════════════════════════════
// GPU Capability Enhancement
// ═══════════════════════════════════════════════════════════════════

/**
 * Enhance PlatformCapabilities with Tauri-specific GPU info.
 *
 * In Tauri mode, we can get more accurate GPU info from the Rust backend
 * (via wgpu adapter enumeration) than from the browser WebGPU API.
 */
export async function enhancePlatformWithTauri(
  caps: PlatformCapabilities,
): Promise<PlatformCapabilities> {
  if (!caps.isTauri) return caps;

  const features = await detectTauriFeatures();
  if (!features.gpuInfo) return caps;

  // Tauri with wgpu means we definitely have GPU compute available
  return {
    ...caps,
    hasWebGPU: features.gpuInfo.supports_webgpu,
    // Desktop typically has more resources
    recommendedWorld: 'holoscript-runtime',
    recommendedBackend: caps.hasWasm ? 'wasm-component' : 'typescript-fallback',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Native File Operations (Tauri-only)
// ═══════════════════════════════════════════════════════════════════

/**
 * Save a HoloScript file via native file system.
 * Falls back to browser download if not in Tauri.
 */
export async function saveProjectNative(
  path: string,
  content: string,
): Promise<{ success: boolean; message: string }> {
  const invoke = await getTauriInvoke();
  if (!invoke) {
    return { success: false, message: 'Not in Tauri context — use browser save dialog' };
  }

  try {
    const result = await invoke('save_project', { path, content }) as string;
    return { success: true, message: result };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Load a HoloScript file via native file system.
 * Returns null if not in Tauri context.
 */
export async function loadProjectNative(
  path: string,
): Promise<{ success: boolean; content?: string; message: string }> {
  const invoke = await getTauriInvoke();
  if (!invoke) {
    return { success: false, message: 'Not in Tauri context — use browser file picker' };
  }

  try {
    const content = await invoke('load_project', { path }) as string;
    return { success: true, content, message: 'Loaded successfully' };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * List recent HoloScript projects from a directory.
 * Returns empty array if not in Tauri context.
 */
export async function listProjectsNative(
  directory: string,
): Promise<TauriProjectMeta[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) return [];

  try {
    return await invoke('list_projects', { directory }) as TauriProjectMeta[];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Bridge Integration — Connect Tauri to CompilerBridge
// ═══════════════════════════════════════════════════════════════════

/**
 * Initialize the CompilerBridge with Tauri-aware configuration.
 *
 * When in Tauri:
 *   - Uses bundled WASM URL
 *   - Requests 'holoscript-runtime' world (desktop has more memory)
 *   - Logs native GPU info for debugging
 *
 * When in browser:
 *   - Uses standard /wasm/ URL
 *   - Lets platform-detect choose the optimal world
 *
 * @param bridge - The CompilerBridge instance to initialize
 * @param caps - Pre-detected platform capabilities
 */
export async function initBridgeForPlatform(
  bridge: { init(wasmUrl: string, world: 'holoscript-runtime' | 'holoscript-parser' | 'holoscript-compiler' | 'holoscript-spatial'): Promise<unknown> },
  caps: PlatformCapabilities,
): Promise<void> {
  const wasmUrl = resolveWasmUrl();

  if (caps.isTauri) {
    const features = await detectTauriFeatures();
    if (features.gpuInfo) {
      console.info(
        `[HoloScript] Tauri desktop: GPU=${features.gpuInfo.name}, ` +
        `Backend=${features.gpuInfo.backend}, ` +
        `WebGPU=${features.gpuInfo.supports_webgpu}`,
      );
    }
    // Desktop always gets the full runtime
    await bridge.init(wasmUrl, 'holoscript-runtime');
  } else {
    // Use platform-detect recommendation
    await bridge.init(wasmUrl, caps.recommendedWorld);
  }
}
