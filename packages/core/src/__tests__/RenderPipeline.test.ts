import { describe, it, expect } from 'vitest';
import { RenderPass, MaterialSystem, LightingModel } from '@holoscript/engine/rendering';

describe('Cycle 147: Render Pipeline', () => {
  // -------------------------------------------------------------------------
  // RenderPass
  // -------------------------------------------------------------------------

  it('should order passes by dependencies', () => {
    const rp = new RenderPass();
    rp.addPass({
      id: 'composite',
      name: 'Composite',
      order: 2,
      enabled: true,
      dependencies: ['gbuffer', 'lighting'],
      attachments: [],
      inputs: [],
    });
    rp.addPass({
      id: 'gbuffer',
      name: 'GBuffer',
      order: 0,
      enabled: true,
      dependencies: [],
      attachments: [
        { name: 'albedo', format: 'rgba8', width: 1920, height: 1080, clearOp: 'clear' },
      ],
      inputs: [],
    });
    rp.addPass({
      id: 'lighting',
      name: 'Lighting',
      order: 1,
      enabled: true,
      dependencies: ['gbuffer'],
      attachments: [],
      inputs: ['albedo'],
    });

    const order = rp.getExecutionOrder();
    expect(order.map((p) => p.id)).toEqual(['gbuffer', 'lighting', 'composite']);
  });

  it('should validate dependencies and detect missing inputs', () => {
    const rp = new RenderPass();
    rp.addPass({
      id: 'final',
      name: 'Final',
      order: 0,
      enabled: true,
      dependencies: ['missing'],
      attachments: [],
      inputs: ['nonexistent'],
    });

    const errors = rp.validate();
    expect(errors.some((e) => e.includes('unknown pass'))).toBe(true);
    expect(errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // MaterialSystem
  // -------------------------------------------------------------------------

  it('should create PBR materials with uniforms', () => {
    const ms = new MaterialSystem();
    ms.registerShader('pbr', 'v_src', 'f_src');
    const mat = ms.createMaterial('m1', 'Metal', 'pbr');

    ms.setPBR('m1', { metallic: 0.9, roughness: 0.1, albedo: [0.8, 0.8, 0.85, 1] });
    ms.setUniform('m1', 'time', 'float', 0);

    expect(mat.metallic).toBe(0.9);
    expect(mat.roughness).toBe(0.1);
    expect(ms.getUniform('m1', 'time')?.value).toBe(0);
  });

  it('should sort opaque before transparent', () => {
    const ms = new MaterialSystem();
    ms.createMaterial('glass', 'Glass', 'pbr');
    ms.setBlendMode('glass', 'alpha');
    ms.createMaterial('floor', 'Floor', 'pbr'); // Opaque default

    const sorted = ms.getSortedMaterials();
    expect(sorted[0].blendMode).toBe('opaque');
    expect(sorted[1].blendMode).toBe('alpha');
  });

  it('should clone materials with independent state', () => {
    const ms = new MaterialSystem();
    ms.createMaterial('base', 'Base', 'pbr');
    ms.setPBR('base', { metallic: 0.5 });

    const clone = ms.cloneMaterial('base', 'clone', 'Clone')!;
    ms.setPBR('base', { metallic: 1.0 }); // Modify original

    expect(clone.metallic).toBe(0.5); // Clone unaffected
  });

  // -------------------------------------------------------------------------
  // LightingModel
  // -------------------------------------------------------------------------

  it('should calculate point light attenuation', () => {
    const lm = new LightingModel();
    lm.addLight({
      id: 'lamp',
      type: 'point',
      position: [0, 5, 0],
      intensity: 1,
      range: 20,
    });

    const near = lm.calculateAttenuation('lamp', { x: 0, y: 4, z: 0 });
    const far = lm.calculateAttenuation('lamp', { x: 0, y: -14, z: 0 });
    const beyond = lm.calculateAttenuation('lamp', { x: 0, y: -15, z: 0 });

    expect(near).toBeGreaterThan(far);
    expect(beyond).toBe(0);
  });

  it('should sample GI probes with distance falloff', () => {
    const lm = new LightingModel();
    lm.addGIProbe({
      id: 'p1',
      position: [0, 0, 0],
      radius: 10,
      irradiance: [0.5, 0.4, 0.3],
      weight: 1,
    });

    const inside = lm.sampleGI({ x: 1, y: 0, z: 0 });
    expect(inside[0]).toBeGreaterThan(0);

    const outside = lm.sampleGI({ x: 20, y: 0, z: 0 }); // Outside radius → ambient
    const amb = lm.getAmbient();
    expect(outside[0]).toBeCloseTo(amb.color[0] * amb.intensity, 2);
  });

  it('should cull lights by range and layer', () => {
    const lm = new LightingModel();
    lm.addLight({ id: 'sun', type: 'directional', intensity: 1 });
    lm.addLight({
      id: 'close',
      type: 'point',
      position: [5, 0, 0],
      range: 10,
      layer: 1,
    });
    lm.addLight({
      id: 'far',
      type: 'point',
      position: [500, 0, 0],
      range: 10,
      layer: 2,
    });

    // All layers, near camera
    const visible = lm.getVisibleLights({ x: 0, y: 0, z: 0 }, 50);
    expect(visible.length).toBe(2); // sun + close

    // Layer filter — only layer 2 (sun has all layers so still included)
    const layer2 = lm.getVisibleLights({ x: 0, y: 0, z: 0 }, 50, 2);
    expect(layer2.some((l) => l.id === 'sun')).toBe(true); // Sun passes all masks
    expect(layer2.some((l) => l.id === 'close')).toBe(false); // Close is layer 1, mask 2 → excluded
  });
});
