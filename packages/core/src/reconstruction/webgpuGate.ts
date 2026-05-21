/**
 * WebGPU presence check for strict native reconstruction mode.
 *
 * In Node.js, `navigator.gpu` is absent unless the `webgpu` npm binding is
 * activated. `ensureNodeWebGpuSync()` bootstraps it on first call so that
 * `isWebGpuEnvironmentPresent()` returns `true` when a GPU is reachable.
 * The `webgpu` binding is the supported path in Node >= 24; the
 * `--experimental-webgpu` flag does NOT exist in that version.
 */

/**
 * Synchronous Node WebGPU bootstrap.
 *
 * Activates the installed Dawn binding (`webgpu` npm package) so that
 * `navigator.gpu` is populated on `globalThis`. Safe no-op in browsers
 * and when the binding is absent.
 *
 * @returns `true` if a GPU adapter was installed on `navigator.gpu`.
 */
export function ensureNodeWebGpuSync(): boolean {
  // Browser / worker — native gpu, nothing to bootstrap.
  if (typeof globalThis.window !== 'undefined') return false;

  // Already bootstrapped — navigator.gpu is present.
  const nav = (globalThis as { navigator?: { gpu?: unknown } }).navigator;
  if (nav?.gpu) return true;

  // Node: try to activate the Dawn binding via require().
  // `require` is in-scope in CJS; in ESM it doesn't exist and the
  // ReferenceError is caught, so the caller should use the async
  // ensureNodeWebGpu() from @holoscript/snn-webgpu instead.
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
      // Install WebGPU globals (GPU, GPUBuffer, etc.) so type checks work.
      const target = globalThis as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(mod.globals ?? {})) {
        if (target[key] == null) {
          Object.defineProperty(globalThis, key, {
            value,
            writable: true,
            configurable: true,
          });
        }
      }
      return true;
    }
  } catch {
    // `webgpu` binding not installed, or require() unavailable (ESM) —
    // leave navigator.gpu absent; caller should use async path.
  }

  return false;
}

/**
 * Check whether WebGPU is available in the current environment.
 *
 * In Node.js, this calls `ensureNodeWebGpuSync()` first to activate the
 * Dawn binding, so the check reflects the real GPU availability. In
 * browsers, `navigator.gpu` is native and the sync bootstrap is a no-op.
 */
export function isWebGpuEnvironmentPresent(): boolean {
  // Activate the Node binding if present (no-op in browser).
  ensureNodeWebGpuSync();

  try {
    const nav = globalThis.navigator as (Navigator & { gpu?: unknown }) | undefined;
    return Boolean(nav && 'gpu' in nav && nav.gpu);
  } catch {
    return false;
  }
}