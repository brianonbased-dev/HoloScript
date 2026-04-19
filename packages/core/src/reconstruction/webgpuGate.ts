/**
 * WebGPU presence check for strict native reconstruction mode.
 */

export function isWebGpuEnvironmentPresent(): boolean {
  try {
    const nav = globalThis.navigator as (Navigator & { gpu?: unknown }) | undefined;
    return Boolean(nav && 'gpu' in nav && nav.gpu);
  } catch {
    return false;
  }
}
