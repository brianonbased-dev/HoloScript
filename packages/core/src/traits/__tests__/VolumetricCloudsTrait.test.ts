/**
 * VolumetricCloudsTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { volumetricCloudsHandler } from '../VolumetricCloudsTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  altitude: 500, thickness: 200, absorption_coeff: 0.04, scattering_coeff: 0.06,
  phase_g: 0.3, max_steps: 64, wind_scale: 1.0, coverage: 0.5, use_weather: false,
};

describe('VolumetricCloudsTrait', () => {
  it('has name "volumetric_clouds"', () => {
    expect(volumetricCloudsHandler.name).toBe('volumetric_clouds');
  });

  it('onAttach emits volumetric_clouds_create', () => {
    const node = makeNode();
    volumetricCloudsHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('volumetric_clouds_create', expect.objectContaining({ altitude: 500 }));
  });
});
