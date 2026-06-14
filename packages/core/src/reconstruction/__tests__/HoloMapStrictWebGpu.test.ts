import { describe, expect, it, vi } from 'vitest';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS } from '../HoloMapRuntime';
import * as webgpuGate from '../webgpuGate';

describe('HoloMap strict WebGPU gate', () => {
  it('throws on init when CPU fallback is disabled and WebGPU is absent', async () => {
    // Force WebGPU absence via a spy so this test is environment-independent.
    // Without the spy, the Dawn binding (webgpu npm package) activates in Node
    // v24 and makes navigator.gpu present, causing the gate to pass instead of
    // throw — which would make the guard invisible on CI machines with a GPU.
    const gpuSpy = vi.spyOn(webgpuGate, 'isWebGpuEnvironmentPresent').mockReturnValue(false);
    try {
      const rt = createHoloMapRuntime();
      await expect(
        rt.init({
          ...HOLOMAP_DEFAULTS,
          allowCpuFallback: false,
          modelHash: 'strict-test',
          seed: 1,
        })
      ).rejects.toThrow(/WebGPU/);
    } finally {
      gpuSpy.mockRestore();
    }
  });
});
