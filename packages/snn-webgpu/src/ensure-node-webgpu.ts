/**
 * Node-only WebGPU bootstrap — shared between gpu-context, SnnAccelerator, and webgpuGate.
 *
 * In a browser/worker `navigator.gpu` is already present. In Node there is no
 * global `navigator.gpu` unless we activate the installed Dawn binding
 * (`webgpu` npm package). This module populates `globalThis.navigator.gpu`
 * and installs the full set of WebGPU globals (`GPU`, `GPUBuffer`, etc.)
 * so device detection finds a real adapter instead of silently falling back
 * to CPU passthrough.
 *
 * NOTE: the `--experimental-webgpu` Node flag does NOT exist in Node >= 24;
 * the `webgpu` npm binding is the supported path for Node WebGPU.
 */

/** Whether the Node bootstrap has been attempted (idempotent guard). */
let _bootstrapAttempted = false;
/** Cached result of the bootstrap — true if `navigator.gpu` was set. */
let _bootstrapResult = false;

/**
 * Synchronous Node WebGPU bootstrap using `require()`.
 *
 * Sets `globalThis.navigator.gpu` and installs all WebGPU globals from
 * `mod.globals` so that `navigator.gpu.requestAdapter()` works.
 *
 * Safe no-op in browser/worker contexts and when the `webgpu` binding is absent.
 * Returns `true` if a GPU adapter was installed, `false` otherwise.
 *
 * Callers that need an async variant (e.g. for ESM interop) should use
 * `ensureNodeWebGpu()` instead.
 */
export function ensureNodeWebGpuSync(): boolean {
  // Browser / worker — native gpu, nothing to bootstrap.
  if (typeof globalThis.window !== 'undefined') return false;

  // Already bootstrapped — return cached result.
  if (_bootstrapAttempted) return _bootstrapResult;

  _bootstrapAttempted = true;

  // Node: try to activate the Dawn binding via require().
  // `require` is in-scope in CJS; in ESM it doesn't exist and the
  // ReferenceError is caught, falling through to the async import() path.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('webgpu') as {
      create?: (flags: string[]) => unknown;
      globals?: Record<string, unknown>;
    };
    const gpu = typeof mod.create === 'function' ? mod.create([]) : undefined;
    if (gpu && typeof (gpu as { requestAdapter?: unknown }).requestAdapter === 'function') {
      const g = globalThis as { navigator?: { gpu?: unknown } };
      g.navigator ??= {} as { gpu?: unknown };
      g.navigator.gpu = gpu as GPU;
      installMissingWebGpuGlobals(mod.globals ?? {});
      _bootstrapResult = true;
      return true;
    }
  } catch {
    // `webgpu` binding not installed, or require() unavailable (ESM) —
    // fall through to async import() in ensureNodeWebGpu().
  }

  return _bootstrapResult;
}

/**
 * Async Node WebGPU bootstrap using `import()`.
 *
 * Same effect as `ensureNodeWebGpuSync()` but uses dynamic ESM import,
 * which works in all module systems. Prefer the sync variant when the
 * caller is synchronous (e.g. feature-detection gates).
 */
export async function ensureNodeWebGpu(): Promise<boolean> {
  // Browser / worker — native gpu, nothing to bootstrap.
  if (typeof globalThis.window !== 'undefined') return false;

  // Already bootstrapped — return cached result.
  if (_bootstrapAttempted) return _bootstrapResult;

  // Try sync path first (cheaper, works in CJS).
  if (ensureNodeWebGpuSync()) return true;

  // Fallback: async ESM import (needed when the caller is in ESM and
  // require() is not available or failed).
  try {
    const mod = (await import('webgpu')) as {
      create?: (flags: string[]) => unknown;
      globals?: Record<string, unknown>;
    };
    const gpu = typeof mod.create === 'function' ? mod.create([]) : undefined;
    if (gpu && typeof (gpu as { requestAdapter?: unknown }).requestAdapter === 'function') {
      const g = globalThis as { navigator?: { gpu?: unknown } };
      g.navigator ??= {} as { gpu?: unknown };
      g.navigator.gpu = gpu as GPU;
      installMissingWebGpuGlobals(mod.globals ?? {});
      _bootstrapResult = true;
      return true;
    }
  } catch {
    // `webgpu` binding not installed — leave navigator.gpu absent.
  }

  return false;
}

/**
 * Install WebGPU globals (`GPU`, `GPUBuffer`, etc.) from the Dawn binding.
 * Skips globals that are already defined on `globalThis`.
 */
function installMissingWebGpuGlobals(globals: Record<string, unknown>): void {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(globals)) {
    if (target[key] != null) continue;
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Reset the bootstrap state (for testing only).
 * Allows re-running the bootstrap in a clean state.
 */
export function _resetNodeWebGpuBootstrap(): void {
  _bootstrapAttempted = false;
  _bootstrapResult = false;
}