/**
 * GlobalIlluminationTrait — validate() tests
 */
import { describe, it, expect } from 'vitest';
import { GlobalIlluminationTrait } from '../GlobalIlluminationTrait';

describe('GlobalIlluminationTrait — metadata', () => {
  it('has name "global_illumination"', () => {
    expect(GlobalIlluminationTrait.name).toBe('global_illumination');
  });
});

describe('GlobalIlluminationTrait — validate()', () => {
  it('accepts valid sh_probes config', () => {
    expect(
      GlobalIlluminationTrait.validate!({
        mode: 'sh_probes',
        sh: { gridResolution: [8, 4, 8], cellSize: 2, order: 3 },
      } as never)
    ).toBe(true);
  });

  it('rejects invalid mode', () => {
    expect(() =>
      GlobalIlluminationTrait.validate!({ mode: 'bad_mode' as never } as never)
    ).toThrow('GI mode');
  });

  it('rejects sh_probes without sh config', () => {
    expect(() =>
      GlobalIlluminationTrait.validate!({ mode: 'sh_probes' } as never)
    ).toThrow('sh config');
  });

  it('rejects ddgi without ddgi config', () => {
    expect(() =>
      GlobalIlluminationTrait.validate!({ mode: 'ddgi' } as never)
    ).toThrow('ddgi config');
  });

  it('rejects ddgi with invalid hysteresis', () => {
    expect(() =>
      GlobalIlluminationTrait.validate!({
        mode: 'ddgi',
        ddgi: { probeCount: 64, raysPerProbe: 256, irradianceTexSize: 8, visibilityTexSize: 16, normalBias: 0.1, hysteresis: 2 },
      } as never)
    ).toThrow('hysteresis');
  });

  it('accepts valid lightmap config', () => {
    expect(
      GlobalIlluminationTrait.validate!({
        mode: 'lightmap',
        lightmap: { resolution: 16, samples: 512, denoise: true, bounces: 3 },
      } as never)
    ).toBe(true);
  });

  it('rejects negative skyIntensity', () => {
    expect(() =>
      GlobalIlluminationTrait.validate!({
        mode: 'lumen',
        skyIntensity: -1,
      } as never)
    ).toThrow('skyIntensity');
  });
});
