import { describe, expect, it } from 'vitest';
import {
  createProceduralNeRFGrid,
  normalizeNeRFGridModel,
  packNeRFRadianceGrid,
  resolveNeRFConfig,
} from '../components/NeRF';

describe('NeRF R3F component helpers', () => {
  it('resolves compiler-emitted nerf config bags', () => {
    const config = resolveNeRFConfig({
      nerf: {
        method: 'tensorf',
        model_url: '/models/stage.nerf.json',
        near_plane: 0.25,
        far_plane: 8,
        samples_per_ray: 96,
        batch_size: 2048,
        enable_deformation: true,
        background_color: [0.1, 0.2, 0.3],
      },
    });

    expect(config).toMatchObject({
      method: 'tensorf',
      src: '/models/stage.nerf.json',
      nearPlane: 0.25,
      farPlane: 8,
      samplesPerRay: 96,
      batchSize: 2048,
      enableDeformation: true,
      backgroundColor: [0.1, 0.2, 0.3],
    });
  });

  it('normalizes density and RGB arrays into a typed radiance grid', () => {
    const model = normalizeNeRFGridModel({
      gridSize: [2, 1, 1],
      density: [0.25, 1],
      colors: [1, 0.5, 0, 0.1, 0.2, 0.3],
      exposure: 1,
    });

    expect(model.gridSize).toEqual([2, 1, 1]);
    expect(model.density).toBeInstanceOf(Float32Array);
    expect(model.colors).toBeInstanceOf(Float32Array);

    const packed = packNeRFRadianceGrid(model);
    expect([...packed.slice(0, 4)]).toEqual([255, 128, 0, 64]);
    expect([...packed.slice(4, 8)]).toEqual([26, 51, 77, 255]);
  });

  it('rejects undersized model arrays instead of rendering corrupt voxels', () => {
    expect(() =>
      normalizeNeRFGridModel({
        gridSize: [2, 2, 1],
        density: [1, 1, 1],
      })
    ).toThrow(/density has 3 values/);
  });

  it('creates a non-empty procedural fallback radiance field', () => {
    const model = createProceduralNeRFGrid([4, 4, 4]);
    const packed = packNeRFRadianceGrid(model);
    expect(model.density.some((v) => v > 0)).toBe(true);
    expect(packed.length).toBe(4 * 4 * 4 * 4);
    expect(packed.some((v) => v > 0)).toBe(true);
  });
});
