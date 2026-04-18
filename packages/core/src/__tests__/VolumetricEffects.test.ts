import { describe, it, expect } from 'vitest';
import { FogSystem, VolumetricLight, CloudRenderer } from '@holoscript/engine/rendering';

describe('Cycle 152: Volumetric Effects', () => {
  // -------------------------------------------------------------------------
  // FogSystem
  // -------------------------------------------------------------------------

  it('should compute fog factor with exponential mode', () => {
    const fog = new FogSystem({ mode: 'exponential', density: 0.05 });

    const near = fog.computeFogFactor(5);
    const far = fog.computeFogFactor(100);

    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThanOrEqual(1);
  });

  it('should blend scene color with fog color', () => {
    const fog = new FogSystem({
      mode: 'linear',
      nearDistance: 0,
      farDistance: 100,
      color: [1, 1, 1],
    });

    const original: [number, number, number] = [0, 0, 0]; // Black scene
    const blended = fog.blendWithFog(original, 50);

    // At halfway, fog should be ~50% blended
    expect(blended[0]).toBeGreaterThan(0.3);
    expect(blended[0]).toBeLessThan(0.7);
  });

  it('should apply height fog attenuation', () => {
    const fog = new FogSystem({
      heightFog: true,
      heightStart: 0,
      heightEnd: 100,
      heightDensity: 0.01,
    });

    const low = fog.computeFogFactor(50, 10); // Low altitude — more fog
    const high = fog.computeFogFactor(50, 90); // High altitude — less fog

    expect(low).toBeGreaterThan(high);
  });

  // -------------------------------------------------------------------------
  // VolumetricLight
  // -------------------------------------------------------------------------

  it('should march rays and accumulate scattering', () => {
    const vl = new VolumetricLight();
    vl.addLight({
      id: 'sun',
      position: [0, 100, 0],
      intensity: 2,
      scattering: 0.5,
      samples: 16,
    });

    const samples = vl.march('sun', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(samples.length).toBe(16);
    expect(samples[samples.length - 1].accumulated).toBeGreaterThan(0);
    // Accumulated should be monotonically increasing
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].accumulated).toBeGreaterThanOrEqual(samples[i - 1].accumulated);
    }
  });

  it('should compute scattering falloff with distance', () => {
    const vl = new VolumetricLight();
    vl.addLight({
      id: 'spot',
      position: [0, 0, 0],
      maxDistance: 50,
      scattering: 0.8,
      intensity: 1,
    });

    const near = vl.getScatteringAt('spot', { x: 5, y: 0, z: 0 });
    const far = vl.getScatteringAt('spot', { x: 40, y: 0, z: 0 });
    const outside = vl.getScatteringAt('spot', { x: 60, y: 0, z: 0 });

    expect(near).toBeGreaterThan(far);
    expect(outside).toBe(0);
  });

  // -------------------------------------------------------------------------
  // CloudRenderer
  // -------------------------------------------------------------------------

  it('should sample zero density outside cloud altitude', () => {
    const cr = new CloudRenderer({ altitude: 200, thickness: 50 });

    expect(cr.sampleDensity(0, 100, 0)).toBe(0); // Below
    expect(cr.sampleDensity(0, 300, 0)).toBe(0); // Above
  });

  it('should generate a coverage map and respond to wind', () => {
    const cr = new CloudRenderer({ coverage: 0.8, noiseScale: 0.01, layers: 2 });

    const map1 = cr.getCoverageMap(8, 10);
    cr.update(10); // Advance time (wind drift)
    const map2 = cr.getCoverageMap(8, 10);

    // Maps should differ after wind drift
    let different = false;
    for (let i = 0; i < map1.length; i++) {
      if (Math.abs(map1[i] - map2[i]) > 0.001) {
        different = true;
        break;
      }
    }
    expect(different).toBe(true);
  });
});
