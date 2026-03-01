/**
 * platform-detect.ts — Runtime Platform & Feature Detection
 *
 * Detects the current runtime environment (Tauri desktop, browser, worker)
 * and available capabilities (WASM, SharedArrayBuffer, WebGPU, WebXR, etc.)
 * to choose the optimal execution strategy.
 *
 * Architecture:
 *   Tauri Desktop → Full native GPU, shader-preview-wgpu via IPC
 *   Browser (Chrome/Edge) → WASM component + WebGPU + WebXR
 *   Browser (Firefox/Safari) → WASM component + WebGL fallback
 *   SSR / Node.js → TypeScript fallback only (no WASM)
 *
 * @see ADAPTIVE_PLATFORM_LAYERS.md for the three-tier architecture
 */

// ═══════════════════════════════════════════════════════════════════
// Capability Flags
// ═══════════════════════════════════════════════════════════════════

export interface PlatformCapabilities {
  /** Runtime environment */
  runtime: 'tauri' | 'browser' | 'worker' | 'node' | 'unknown';

  /** Tauri-specific */
  isTauri: boolean;
  tauriVersion?: string;

  /** WASM support */
  hasWasm: boolean;
  hasWasmThreads: boolean;
  hasWasmSIMD: boolean;
  hasWasmComponentModel: boolean;

  /** Concurrency */
  hasWebWorkers: boolean;
  hasSharedArrayBuffer: boolean;

  /** GPU */
  hasWebGPU: boolean;
  hasWebGL2: boolean;
  hasWebGL1: boolean;

  /** XR */
  hasWebXR: boolean;
  hasWebXRImmersive: boolean;
  hasWebXRAR: boolean;

  /** Storage */
  hasIndexedDB: boolean;
  hasOPFS: boolean;

  /** Network */
  hasServiceWorker: boolean;
  isSecureContext: boolean;

  /** Performance hints */
  hardwareConcurrency: number;
  deviceMemoryGB: number;

  /** Recommended WASM world to load */
  recommendedWorld: 'holoscript-runtime' | 'holoscript-parser' | 'holoscript-compiler' | 'holoscript-spatial';

  /** Recommended compiler backend */
  recommendedBackend: 'wasm-component' | 'wasm-legacy' | 'typescript-fallback';
}

// ═══════════════════════════════════════════════════════════════════
// Detection Functions
// ═══════════════════════════════════════════════════════════════════

/** Detect full platform capabilities (async — some checks require probing) */
export async function detectPlatform(): Promise<PlatformCapabilities> {
  const caps = detectPlatformSync();

  // Async probes
  caps.hasWebXR = await probeWebXR();
  caps.hasWebXRImmersive = await probeWebXRImmersive();
  caps.hasWebXRAR = await probeWebXRAR();
  caps.hasWebGPU = await probeWebGPU();
  caps.hasOPFS = await probeOPFS();

  // Compute recommendations based on detected caps
  caps.recommendedWorld = computeRecommendedWorld(caps);
  caps.recommendedBackend = computeRecommendedBackend(caps);

  return caps;
}

/** Synchronous detection (subset — no WebXR/WebGPU probes) */
export function detectPlatformSync(): PlatformCapabilities {
  const runtime = detectRuntime();
  const isTauri = runtime === 'tauri';

  return {
    runtime,
    isTauri,
    tauriVersion: isTauri ? getTauriVersion() : undefined,

    hasWasm: typeof WebAssembly !== 'undefined',
    hasWasmThreads: detectWasmThreads(),
    hasWasmSIMD: detectWasmSIMD(),
    hasWasmComponentModel: detectWasmComponentModel(),

    hasWebWorkers: typeof Worker !== 'undefined',
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',

    hasWebGPU: false, // requires async probe
    hasWebGL2: detectWebGL2(),
    hasWebGL1: detectWebGL1(),

    hasWebXR: false,  // requires async probe
    hasWebXRImmersive: false,
    hasWebXRAR: false,

    hasIndexedDB: typeof indexedDB !== 'undefined',
    hasOPFS: false,   // requires async probe

    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    isSecureContext: typeof isSecureContext !== 'undefined' && isSecureContext,

    hardwareConcurrency: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 1) : 1,
    deviceMemoryGB: getDeviceMemory(),

    recommendedWorld: 'holoscript-runtime',
    recommendedBackend: 'typescript-fallback',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Runtime Detection
// ═══════════════════════════════════════════════════════════════════

function detectRuntime(): PlatformCapabilities['runtime'] {
  // Tauri injects __TAURI__ into the window
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'tauri';
  }

  // Web Worker
  if (typeof self !== 'undefined' && typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function') {
    return 'worker';
  }

  // Browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  // Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  return 'unknown';
}

function getTauriVersion(): string | undefined {
  try {
    // Tauri 2.0 exposes version via __TAURI_INTERNALS__
    const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
      { metadata?: { tauriVersion?: string } } | undefined;
    return internals?.metadata?.tauriVersion;
  } catch {
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════
// WASM Feature Detection
// ═══════════════════════════════════════════════════════════════════

function detectWasmThreads(): boolean {
  try {
    // WASM threads require SharedArrayBuffer
    if (typeof SharedArrayBuffer === 'undefined') return false;
    // Probe by validating a WASM module with shared memory
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      0x05, 0x04, 0x01,       // memory section
      0x03, 0x01, 0x01,       // shared memory, 1 page min, 1 page max
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

function detectWasmSIMD(): boolean {
  try {
    // Probe with v128.const instruction
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
      0x03, 0x02, 0x01, 0x00, // func
      0x0a, 0x15, 0x01, 0x13, 0x00, // code
      0xfd, 0x0c, // v128.const
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0b, // end
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

function detectWasmComponentModel(): boolean {
  // The WASM Component Model is supported via jco transpilation to core WASM
  // So effectively any browser with WASM support can use component model
  // via the jco-generated JS shim. True native CM support is tracked by:
  // https://github.com/nicolo-ribaudo/tc39-proposal-wasm-esm-integration
  return typeof WebAssembly !== 'undefined';
}

// ═══════════════════════════════════════════════════════════════════
// GPU Feature Detection
// ═══════════════════════════════════════════════════════════════════

function detectWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

function detectWebGL1(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

async function probeWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown | null> } }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// XR Feature Detection
// ═══════════════════════════════════════════════════════════════════

async function probeWebXR(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    return 'xr' in navigator;
  } catch {
    return false;
  }
}

async function probeWebXRImmersive(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    const xr = (navigator as unknown as Record<string, { isSessionSupported(mode: string): Promise<boolean> }>).xr;
    if (!xr) return false;
    return await xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}

async function probeWebXRAR(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    const xr = (navigator as unknown as Record<string, { isSessionSupported(mode: string): Promise<boolean> }>).xr;
    if (!xr) return false;
    return await xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Storage Detection
// ═══════════════════════════════════════════════════════════════════

async function probeOPFS(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined') return false;
    const root = await navigator.storage.getDirectory();
    return root !== null && root !== undefined;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Performance Hints
// ═══════════════════════════════════════════════════════════════════

function getDeviceMemory(): number {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    return (navigator as unknown as { deviceMemory: number }).deviceMemory;
  }
  return 4; // default assumption: 4GB
}

// ═══════════════════════════════════════════════════════════════════
// Recommendation Logic
// ═══════════════════════════════════════════════════════════════════

function computeRecommendedWorld(caps: PlatformCapabilities): PlatformCapabilities['recommendedWorld'] {
  // Tauri desktop: full runtime (native GPU handles rendering)
  if (caps.isTauri) {
    return 'holoscript-runtime';
  }

  // High-end browser: full runtime
  if (caps.deviceMemoryGB >= 4 && caps.hardwareConcurrency >= 4) {
    return 'holoscript-runtime';
  }

  // Mid-range: parser only (compiler runs server-side)
  if (caps.deviceMemoryGB >= 2) {
    return 'holoscript-parser';
  }

  // Low-end: spatial engine only (smallest binary)
  return 'holoscript-spatial';
}

function computeRecommendedBackend(caps: PlatformCapabilities): PlatformCapabilities['recommendedBackend'] {
  // No WASM at all → TS fallback
  if (!caps.hasWasm) {
    return 'typescript-fallback';
  }

  // WASM Component Model (via jco shim) is always preferred when WASM is available
  if (caps.hasWasmComponentModel) {
    return 'wasm-component';
  }

  // Shouldn't reach here since CM detection = WASM detection, but just in case
  return 'wasm-legacy';
}

// ═══════════════════════════════════════════════════════════════════
// Performance Budget Checker
// ═══════════════════════════════════════════════════════════════════

export interface PerformanceBudget {
  maxWasmBinaryKB: number;
  maxInitTimeMs: number;
  maxParseTimeMs: number;
  maxCompileTimeMs: number;
  maxMemoryMB: number;
}

/** Default budgets per platform (from ADAPTIVE_PLATFORM_LAYERS.md) */
export const PLATFORM_BUDGETS: Record<string, PerformanceBudget> = {
  'tauri': {
    maxWasmBinaryKB: 2048,   // 2MB (less constrained on desktop)
    maxInitTimeMs: 500,
    maxParseTimeMs: 50,
    maxCompileTimeMs: 500,
    maxMemoryMB: 256,
  },
  'browser': {
    maxWasmBinaryKB: 1200,   // 1.2MB target
    maxInitTimeMs: 300,       // Must feel instant
    maxParseTimeMs: 30,       // Real-time editing
    maxCompileTimeMs: 300,
    maxMemoryMB: 64,
  },
  'mobile': {
    maxWasmBinaryKB: 800,    // Smaller for mobile
    maxInitTimeMs: 200,
    maxParseTimeMs: 20,
    maxCompileTimeMs: 200,
    maxMemoryMB: 32,
  },
};

/** Check if actual metrics are within budget */
export function checkBudget(
  platform: string,
  metrics: Partial<PerformanceBudget>,
): { withinBudget: boolean; violations: string[] } {
  const budget = PLATFORM_BUDGETS[platform] || PLATFORM_BUDGETS['browser'];
  const violations: string[] = [];

  if (metrics.maxWasmBinaryKB !== undefined && metrics.maxWasmBinaryKB > budget.maxWasmBinaryKB) {
    violations.push(`WASM binary: ${metrics.maxWasmBinaryKB}KB > ${budget.maxWasmBinaryKB}KB budget`);
  }
  if (metrics.maxInitTimeMs !== undefined && metrics.maxInitTimeMs > budget.maxInitTimeMs) {
    violations.push(`Init time: ${metrics.maxInitTimeMs}ms > ${budget.maxInitTimeMs}ms budget`);
  }
  if (metrics.maxParseTimeMs !== undefined && metrics.maxParseTimeMs > budget.maxParseTimeMs) {
    violations.push(`Parse time: ${metrics.maxParseTimeMs}ms > ${budget.maxParseTimeMs}ms budget`);
  }
  if (metrics.maxCompileTimeMs !== undefined && metrics.maxCompileTimeMs > budget.maxCompileTimeMs) {
    violations.push(`Compile time: ${metrics.maxCompileTimeMs}ms > ${budget.maxCompileTimeMs}ms budget`);
  }
  if (metrics.maxMemoryMB !== undefined && metrics.maxMemoryMB > budget.maxMemoryMB) {
    violations.push(`Memory: ${metrics.maxMemoryMB}MB > ${budget.maxMemoryMB}MB budget`);
  }

  return { withinBudget: violations.length === 0, violations };
}
