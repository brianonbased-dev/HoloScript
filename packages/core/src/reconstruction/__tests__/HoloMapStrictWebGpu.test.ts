import { describe, expect, it } from 'vitest';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS } from '../HoloMapRuntime';

describe('HoloMap strict WebGPU gate', () => {
  it('throws on init when CPU fallback is disabled and WebGPU is absent', async () => {
    const rt = createHoloMapRuntime();
    await expect(
      rt.init({
        ...HOLOMAP_DEFAULTS,
        allowCpuFallback: false,
        modelHash: 'strict-test',
        seed: 1,
      }),
    ).rejects.toThrow(/WebGPU/);
  });
});
