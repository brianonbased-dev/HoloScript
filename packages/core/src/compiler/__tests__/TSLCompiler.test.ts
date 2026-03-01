import { describe, it, expect, beforeEach } from 'vitest';
import { TSLCompiler, type TSLCompilerOptions } from '../TSLCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloLight,
  HoloCamera,
  HoloEnvironment,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

function makeObject(
  name: string,
  traits: Array<{ name: string; config?: Record<string, any> }> = [],
  properties: Array<{ key: string; value: any }> = [],
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: properties.map((p) => ({
      type: 'ObjectProperty' as const,
      key: p.key,
      value: p.value,
    })),
    traits: traits.map((t) => ({
      type: 'ObjectTrait' as const,
      name: t.name,
      config: t.config || {},
    })),
  } as HoloObjectDecl;
}

function makeTrait(name: string, config: Record<string, any> = {}): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config,
  } as HoloObjectTrait;
}

function makeLight(
  name: string,
  lightType: string,
  properties: Array<{ key: string; value: any }> = [],
): HoloLight {
  return {
    type: 'Light',
    name,
    lightType,
    properties,
  } as HoloLight;
}

function makeEnvironment(
  properties: Array<{ key: string; value: any }> = [],
): HoloEnvironment {
  return {
    type: 'Environment',
    properties: properties.map((p) => ({
      type: 'EnvironmentProperty' as const,
      key: p.key,
      value: p.value,
    })),
  } as HoloEnvironment;
}

// =============================================================================
// TESTS
// =============================================================================

describe('TSLCompiler', () => {
  let compiler: TSLCompiler;

  beforeEach(() => {
    compiler = new TSLCompiler();
  });

  // =========================================================================
  // Constructor & Configuration
  // =========================================================================

  describe('constructor', () => {
    it('creates compiler with default options', () => {
      const c = new TSLCompiler();
      expect(c).toBeDefined();
    });

    it('accepts custom options', () => {
      const c = new TSLCompiler({
        debug: true,
        enablePBR: false,
        enableCompute: false,
        materialBindGroup: 3,
      });
      expect(c).toBeDefined();
    });
  });

  // =========================================================================
  // Minimal Compilation
  // =========================================================================

  describe('minimal compilation', () => {
    it('compiles empty composition to multi-file output', () => {
      const result = compiler.compile(makeComposition());
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('always produces global uniforms file', () => {
      const result = compiler.compile(makeComposition());
      expect(result['_globals.wgsl']).toBeDefined();
      expect(result['_globals.wgsl']).toContain('CameraUniforms');
      expect(result['_globals.wgsl']).toContain('SceneUniforms');
      expect(result['_globals.wgsl']).toContain('ModelUniforms');
      expect(result['_globals.wgsl']).toContain('LightData');
    });

    it('always produces helpers file when includeHelpers is true', () => {
      const result = compiler.compile(makeComposition());
      expect(result['_helpers.wgsl']).toBeDefined();
      expect(result['_helpers.wgsl']).toContain('simpleNoise');
      expect(result['_helpers.wgsl']).toContain('distributionGGX');
      expect(result['_helpers.wgsl']).toContain('fresnelSchlick');
    });

    it('produces pipeline setup file', () => {
      const result = compiler.compile(makeComposition());
      expect(result['_pipeline.ts']).toBeDefined();
      expect(result['_pipeline.ts']).toContain('createTSLPipelines');
    });

    it('does not produce helpers when disabled', () => {
      const c = new TSLCompiler({ includeHelpers: false });
      const result = c.compile(makeComposition());
      expect(result['_helpers.wgsl']).toBeUndefined();
    });
  });

  // =========================================================================
  // Object Compilation
  // =========================================================================

  describe('object compilation', () => {
    it('generates vertex and fragment shaders for each object', () => {
      const comp = makeComposition({
        objects: [makeObject('MyCube', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);

      expect(result['MyCube.vertex.wgsl']).toBeDefined();
      expect(result['MyCube.fragment.wgsl']).toBeDefined();
      expect(result['MyCube.bindings.wgsl']).toBeDefined();
    });

    it('generates correct vertex shader structure', () => {
      const comp = makeComposition({
        objects: [makeObject('TestObj', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const vs = result['TestObj.vertex.wgsl'];

      expect(vs).toContain('struct VertexInput');
      expect(vs).toContain('struct VertexOutput');
      expect(vs).toContain('@vertex');
      expect(vs).toContain('fn vs_main');
      expect(vs).toContain('CameraUniforms');
      expect(vs).toContain('ModelUniforms');
    });

    it('generates correct fragment shader structure', () => {
      const comp = makeComposition({
        objects: [makeObject('TestObj', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['TestObj.fragment.wgsl'];

      expect(fs).toContain('struct FragmentInput');
      expect(fs).toContain('@fragment');
      expect(fs).toContain('fn fs_main');
      expect(fs).toContain('LightData');
    });

    it('handles multiple objects', () => {
      const comp = makeComposition({
        objects: [
          makeObject('ObjectA', [{ name: 'pbr' }]),
          makeObject('ObjectB', [{ name: 'hologram' }]),
          makeObject('ObjectC', []),
        ],
      });
      const result = compiler.compile(comp);

      expect(result['ObjectA.vertex.wgsl']).toBeDefined();
      expect(result['ObjectA.fragment.wgsl']).toBeDefined();
      expect(result['ObjectB.vertex.wgsl']).toBeDefined();
      expect(result['ObjectB.fragment.wgsl']).toBeDefined();
      expect(result['ObjectC.vertex.wgsl']).toBeDefined();
      expect(result['ObjectC.fragment.wgsl']).toBeDefined();
    });

    it('sanitizes object names with special characters', () => {
      const comp = makeComposition({
        objects: [makeObject('my-complex.object!', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);

      // Should sanitize to valid identifier
      expect(result['my_complex_object_.vertex.wgsl']).toBeDefined();
      expect(result['my_complex_object_.fragment.wgsl']).toBeDefined();
    });
  });

  // =========================================================================
  // Trait -> Shader Mapping
  // =========================================================================

  describe('trait shader mapping', () => {
    // ─── PBR Trait ─────────────────────────────────────────────────────

    it('maps @pbr trait to material uniforms', () => {
      const comp = makeComposition({
        objects: [makeObject('Cube', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Cube.fragment.wgsl'];

      expect(fs).toContain('MaterialUniforms');
      expect(fs).toContain('u_roughness');
      expect(fs).toContain('u_metalness');
      expect(fs).toContain('u_baseColor');
    });

    it('applies PBR config overrides from trait', () => {
      const comp = makeComposition({
        objects: [makeObject('Cube', [{
          name: 'pbr',
          config: { roughness: 0.8, metalness: 1.0 },
        }])],
      });
      const result = compiler.compile(comp);
      const bindings = result['Cube.bindings.wgsl'];

      expect(bindings).toContain('u_roughness');
      expect(bindings).toContain('u_metalness');
    });

    // ─── Emissive Trait ────────────────────────────────────────────────

    it('maps @emissive trait to emission uniforms', () => {
      const comp = makeComposition({
        objects: [makeObject('Glow', [{ name: 'emissive' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Glow.fragment.wgsl'];

      expect(fs).toContain('u_emissiveColor');
      expect(fs).toContain('u_emissiveIntensity');
      expect(fs).toContain('@emissive trait');
    });

    // ─── Transparent Trait ─────────────────────────────────────────────

    it('maps @transparent trait to alpha uniform', () => {
      const comp = makeComposition({
        objects: [makeObject('Glass', [{ name: 'transparent' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Glass.fragment.wgsl'];

      expect(fs).toContain('u_opacity');
      expect(fs).toContain('@transparent trait');
    });

    // ─── Hologram Trait ────────────────────────────────────────────────

    it('maps @hologram trait to holographic shader code', () => {
      const comp = makeComposition({
        objects: [makeObject('Holo', [{ name: 'hologram' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Holo.fragment.wgsl'];

      expect(fs).toContain('u_holoColor');
      expect(fs).toContain('u_scanlineDensity');
      expect(fs).toContain('u_flickerSpeed');
      expect(fs).toContain('holoScanline');
      expect(fs).toContain('holoFlicker');
      expect(fs).toContain('holoFresnel');
    });

    // ─── Dissolve Trait ────────────────────────────────────────────────

    it('maps @dissolve trait to dissolution effect code', () => {
      const comp = makeComposition({
        objects: [makeObject('Disappearing', [{ name: 'dissolve' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Disappearing.fragment.wgsl'];

      expect(fs).toContain('u_dissolveProgress');
      expect(fs).toContain('u_dissolveEdgeColor');
      expect(fs).toContain('dissolveNoise');
      expect(fs).toContain('discard');
    });

    // ─── Force Field Trait ─────────────────────────────────────────────

    it('maps @force_field trait to energy shield code', () => {
      const comp = makeComposition({
        objects: [makeObject('Shield', [{ name: 'force_field' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Shield.fragment.wgsl'];

      expect(fs).toContain('u_fieldColor');
      expect(fs).toContain('u_fieldPulseSpeed');
      expect(fs).toContain('fieldPulse');
    });

    // ─── Billboard Trait ───────────────────────────────────────────────

    it('maps @billboard trait to vertex shader face-camera code', () => {
      const comp = makeComposition({
        objects: [makeObject('Label', [{ name: 'billboard' }])],
      });
      const result = compiler.compile(comp);
      const vs = result['Label.vertex.wgsl'];

      expect(vs).toContain('billboardRight');
      expect(vs).toContain('billboardUp');
      expect(vs).toContain('@billboard trait');
    });

    // ─── Animated Trait ────────────────────────────────────────────────

    it('maps @animated trait to vertex animation code', () => {
      const comp = makeComposition({
        objects: [makeObject('WavyThing', [{ name: 'animated' }])],
      });
      const result = compiler.compile(comp);
      const vs = result['WavyThing.vertex.wgsl'];

      expect(vs).toContain('u_animSpeed');
      expect(vs).toContain('u_animAmplitude');
      expect(vs).toContain('animOffset');
    });

    // ─── Grabbable Trait ───────────────────────────────────────────────

    it('maps @grabbable trait to interaction highlight code', () => {
      const comp = makeComposition({
        objects: [makeObject('Pickable', [{ name: 'grabbable' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Pickable.fragment.wgsl'];

      expect(fs).toContain('u_grabHighlight');
      expect(fs).toContain('u_grabHighlightIntensity');
    });

    // ─── Unknown Trait ─────────────────────────────────────────────────

    it('warns on unknown traits and skips them', () => {
      const comp = makeComposition({
        objects: [makeObject('Foo', [{ name: 'nonexistent_trait_xyz' }])],
      });
      const result = compiler.compile(comp);

      expect(result['_warnings.txt']).toBeDefined();
      expect(result['_warnings.txt']).toContain('nonexistent_trait_xyz');
      expect(result['_warnings.txt']).toContain('no TSL shader mapping');
    });
  });

  // =========================================================================
  // Compute Shader Generation
  // =========================================================================

  describe('compute shaders', () => {
    it('generates compute shader for @gpu_particle trait', () => {
      const comp = makeComposition({
        objects: [makeObject('Particles', [{ name: 'gpu_particle', config: { count: 50000 } }])],
      });
      const result = compiler.compile(comp);

      expect(result['Particles.compute.gpu_particle.wgsl']).toBeDefined();
      const cs = result['Particles.compute.gpu_particle.wgsl'];
      expect(cs).toContain('@compute');
      expect(cs).toContain('@workgroup_size(64)');
      expect(cs).toContain('cs_particle_update');
      expect(cs).toContain('Particle');
    });

    it('generates compute shader for @gpu_physics trait', () => {
      const comp = makeComposition({
        objects: [makeObject('PhysicsObj', [{ name: 'gpu_physics' }])],
      });
      const result = compiler.compile(comp);

      expect(result['PhysicsObj.compute.gpu_physics.wgsl']).toBeDefined();
      const cs = result['PhysicsObj.compute.gpu_physics.wgsl'];
      expect(cs).toContain('@compute');
      expect(cs).toContain('cs_physics_step');
      expect(cs).toContain('RigidBody');
    });

    it('generates compute shader for @compute trait', () => {
      const comp = makeComposition({
        objects: [makeObject('CustomCompute', [{ name: 'compute' }])],
      });
      const result = compiler.compile(comp);

      expect(result['CustomCompute.compute.compute.wgsl']).toBeDefined();
      const cs = result['CustomCompute.compute.compute.wgsl'];
      expect(cs).toContain('cs_generic');
    });

    it('does not generate compute shaders when disabled', () => {
      const c = new TSLCompiler({ enableCompute: false });
      const comp = makeComposition({
        objects: [makeObject('Particles', [{ name: 'gpu_particle' }])],
      });
      const result = c.compile(comp);

      const computeKeys = Object.keys(result).filter((k) => k.includes('.compute.'));
      expect(computeKeys).toHaveLength(0);
    });

    it('includes compute pipeline in pipeline setup', () => {
      const comp = makeComposition({
        objects: [makeObject('Particles', [{ name: 'gpu_particle' }])],
      });
      const result = compiler.compile(comp);
      const pipeline = result['_pipeline.ts'];

      expect(pipeline).toContain('createComputePipeline');
      expect(pipeline).toContain('gpu_particle');
    });
  });

  // =========================================================================
  // Multi-Trait Composition
  // =========================================================================

  describe('multi-trait composition', () => {
    it('composes multiple traits on a single object', () => {
      const comp = makeComposition({
        objects: [makeObject('ComplexObj', [
          { name: 'pbr', config: { roughness: 0.3 } },
          { name: 'emissive', config: { intensity: 2.0 } },
          { name: 'animated', config: { speed: 3.0 } },
        ])],
      });
      const result = compiler.compile(comp);
      const fs = result['ComplexObj.fragment.wgsl'];
      const vs = result['ComplexObj.vertex.wgsl'];

      // Fragment should have both pbr and emissive contributions
      expect(fs).toContain('u_roughness');
      expect(fs).toContain('u_emissiveColor');
      expect(fs).toContain('@pbr trait');
      expect(fs).toContain('@emissive trait');

      // Vertex should have animated contribution
      expect(vs).toContain('u_animSpeed');
      expect(vs).toContain('@animated trait');

      // Traits list in comment
      expect(fs).toContain('@pbr');
      expect(fs).toContain('@emissive');
    });

    it('composes material + VFX traits', () => {
      const comp = makeComposition({
        objects: [makeObject('HoloShield', [
          { name: 'hologram' },
          { name: 'force_field' },
        ])],
      });
      const result = compiler.compile(comp);
      const fs = result['HoloShield.fragment.wgsl'];

      expect(fs).toContain('u_holoColor');
      expect(fs).toContain('u_fieldColor');
      expect(fs).toContain('@hologram trait');
      expect(fs).toContain('@force_field trait');
    });

    it('composes render + compute traits on same object', () => {
      const comp = makeComposition({
        objects: [makeObject('ParticleEmitter', [
          { name: 'pbr' },
          { name: 'gpu_particle' },
        ])],
      });
      const result = compiler.compile(comp);

      // Should have render shaders
      expect(result['ParticleEmitter.vertex.wgsl']).toBeDefined();
      expect(result['ParticleEmitter.fragment.wgsl']).toBeDefined();

      // Should also have compute shader
      expect(result['ParticleEmitter.compute.gpu_particle.wgsl']).toBeDefined();
    });
  });

  // =========================================================================
  // PBR Lighting
  // =========================================================================

  describe('PBR lighting', () => {
    it('includes PBR lighting by default', () => {
      const comp = makeComposition({
        objects: [makeObject('Lit', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Lit.fragment.wgsl'];

      expect(fs).toContain('distributionGGX');
      expect(fs).toContain('geometrySmith');
      expect(fs).toContain('fresnelSchlick');
      expect(fs).toContain('Tone mapping');
      expect(fs).toContain('Gamma correction');
    });

    it('omits PBR when disabled', () => {
      const c = new TSLCompiler({ enablePBR: false });
      const comp = makeComposition({
        objects: [makeObject('Unlit', [{ name: 'pbr' }])],
      });
      const result = c.compile(comp);
      const fs = result['Unlit.fragment.wgsl'];

      expect(fs).toContain('Simple Lighting');
      expect(fs).not.toContain('Tone mapping');
    });
  });

  // =========================================================================
  // Value Conversion
  // =========================================================================

  describe('value conversion', () => {
    it('converts numeric config values to WGSL floats', () => {
      const comp = makeComposition({
        objects: [makeObject('Obj', [{
          name: 'pbr',
          config: { roughness: 0.75 },
        }])],
      });
      const result = compiler.compile(comp);
      const bindings = result['Obj.bindings.wgsl'];

      expect(bindings).toContain('u_roughness');
    });

    it('converts hex color strings to vec3', () => {
      const comp = makeComposition({
        objects: [makeObject('Obj', [{
          name: 'hologram',
          config: { color: '#ff0000' },
        }])],
      });
      const result = compiler.compile(comp);
      const bindings = result['Obj.bindings.wgsl'];

      expect(bindings).toContain('u_holoColor');
    });

    it('converts array values to vectors', () => {
      const comp = makeComposition({
        objects: [makeObject('Obj', [{
          name: 'pbr',
          config: { color: [1.0, 0.5, 0.0] },
        }])],
      });
      const result = compiler.compile(comp);
      const bindings = result['Obj.bindings.wgsl'];

      expect(bindings).toContain('u_baseColor');
    });
  });

  // =========================================================================
  // Environment & Lights
  // =========================================================================

  describe('environment and lights', () => {
    it('includes environment data in global uniforms', () => {
      const comp = makeComposition({
        environment: makeEnvironment([
          { key: 'background', value: '#1a1a2e' },
          { key: 'ambient_light', value: 0.3 },
        ]),
      });
      const result = compiler.compile(comp);
      const globals = result['_globals.wgsl'];

      expect(globals).toContain('Environment defaults');
      expect(globals).toContain('background');
      expect(globals).toContain('ambient_light');
    });

    it('includes light data in global uniforms', () => {
      const comp = makeComposition({
        lights: [
          makeLight('SunLight', 'directional'),
          makeLight('Lamp', 'point'),
        ],
      });
      const result = compiler.compile(comp);
      const globals = result['_globals.wgsl'];

      expect(globals).toContain('Scene lights: 2');
      expect(globals).toContain('SunLight');
      expect(globals).toContain('Lamp');
    });
  });

  // =========================================================================
  // Pipeline Setup
  // =========================================================================

  describe('pipeline setup', () => {
    it('generates render pipeline for objects with traits', () => {
      const comp = makeComposition({
        objects: [makeObject('Hero', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const pipeline = result['_pipeline.ts'];

      expect(pipeline).toContain('createRenderPipeline');
      expect(pipeline).toContain('Hero');
      expect(pipeline).toContain('vs_main');
      expect(pipeline).toContain('fs_main');
      expect(pipeline).toContain('float32x3'); // position format
    });

    it('generates both render and compute pipelines', () => {
      const comp = makeComposition({
        objects: [makeObject('PhysObj', [
          { name: 'pbr' },
          { name: 'gpu_physics' },
        ])],
      });
      const result = compiler.compile(comp);
      const pipeline = result['_pipeline.ts'];

      expect(pipeline).toContain('renderPipelines');
      expect(pipeline).toContain('computePipelines');
      expect(pipeline).toContain('gpu_physics');
    });

    it('includes TypeScript type definitions', () => {
      const comp = makeComposition();
      const result = compiler.compile(comp);
      const pipeline = result['_pipeline.ts'];

      expect(pipeline).toContain('TSLPipelineBundle');
      expect(pipeline).toContain('GPURenderPipeline');
      expect(pipeline).toContain('GPUComputePipeline');
    });
  });

  // =========================================================================
  // Bind Group Layout
  // =========================================================================

  describe('bind group layout', () => {
    it('documents uniform bindings for object with traits', () => {
      const comp = makeComposition({
        objects: [makeObject('Box', [{ name: 'pbr' }])],
      });
      const result = compiler.compile(comp);
      const layout = result['Box.bindings.wgsl'];

      expect(layout).toContain('Group 0: Camera');
      expect(layout).toContain('Group 1: Model');
      expect(layout).toContain('Group 2: Material');
      expect(layout).toContain('u_roughness');
      expect(layout).toContain('u_metalness');
      expect(layout).toContain('@pbr');
    });

    it('notes empty traits when no uniforms', () => {
      const comp = makeComposition({
        objects: [makeObject('Plain', [])],
      });
      const result = compiler.compile(comp);
      const layout = result['Plain.bindings.wgsl'];

      expect(layout).toContain('no trait uniforms');
    });
  });

  // =========================================================================
  // Debug Mode
  // =========================================================================

  describe('debug mode', () => {
    it('adds source trait comments in debug mode', () => {
      const c = new TSLCompiler({ debug: true });
      const comp = makeComposition({
        objects: [makeObject('Dbg', [{ name: 'pbr' }, { name: 'hologram' }])],
      });
      const result = c.compile(comp);
      const fs = result['Dbg.fragment.wgsl'];

      // In debug mode, uniform struct should have trait source comments
      expect(fs).toContain('from @pbr');
      expect(fs).toContain('from @hologram');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles object with no traits', () => {
      const comp = makeComposition({
        objects: [makeObject('Bare', [])],
      });
      const result = compiler.compile(comp);

      expect(result['Bare.vertex.wgsl']).toBeDefined();
      expect(result['Bare.fragment.wgsl']).toBeDefined();
      // Should still have basic shader structure
      expect(result['Bare.vertex.wgsl']).toContain('vs_main');
      expect(result['Bare.fragment.wgsl']).toContain('fs_main');
    });

    it('handles composition with no objects', () => {
      const comp = makeComposition({ objects: [] });
      const result = compiler.compile(comp);

      // Should still produce global files
      expect(result['_globals.wgsl']).toBeDefined();
      expect(result['_pipeline.ts']).toBeDefined();
    });

    it('handles trait with empty config', () => {
      const comp = makeComposition({
        objects: [makeObject('Obj', [{ name: 'pbr', config: {} }])],
      });
      const result = compiler.compile(comp);

      // Should use default values
      expect(result['Obj.fragment.wgsl']).toContain('u_roughness');
    });

    it('handles multiple objects with same trait', () => {
      const comp = makeComposition({
        objects: [
          makeObject('A', [{ name: 'pbr', config: { roughness: 0.1 } }]),
          makeObject('B', [{ name: 'pbr', config: { roughness: 0.9 } }]),
        ],
      });
      const result = compiler.compile(comp);

      // Both objects should have their own shaders
      expect(result['A.fragment.wgsl']).toBeDefined();
      expect(result['B.fragment.wgsl']).toBeDefined();
      expect(result['A.fragment.wgsl']).toContain('u_roughness');
      expect(result['B.fragment.wgsl']).toContain('u_roughness');
    });

    it('handles gaussian_splat special rendering trait', () => {
      const comp = makeComposition({
        objects: [makeObject('Splats', [{ name: 'gaussian_splat' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Splats.fragment.wgsl'];

      expect(fs).toContain('splatAlpha');
      expect(fs).toContain('@gaussian_splat trait');
    });

    it('handles point_cloud trait', () => {
      const comp = makeComposition({
        objects: [makeObject('Cloud', [{ name: 'point_cloud' }])],
      });
      const result = compiler.compile(comp);
      const fs = result['Cloud.fragment.wgsl'];

      expect(fs).toContain('u_pointSize');
      expect(fs).toContain('@point_cloud trait');
    });
  });

  // =========================================================================
  // Output File Keys
  // =========================================================================

  describe('output file keys', () => {
    it('uses correct file naming convention', () => {
      const comp = makeComposition({
        objects: [
          makeObject('Player', [{ name: 'pbr' }, { name: 'gpu_particle' }]),
        ],
      });
      const result = compiler.compile(comp);
      const keys = Object.keys(result);

      expect(keys).toContain('_helpers.wgsl');
      expect(keys).toContain('_globals.wgsl');
      expect(keys).toContain('_pipeline.ts');
      expect(keys).toContain('Player.vertex.wgsl');
      expect(keys).toContain('Player.fragment.wgsl');
      expect(keys).toContain('Player.bindings.wgsl');
      expect(keys).toContain('Player.compute.gpu_particle.wgsl');
    });
  });

  // =========================================================================
  // Composition Name in Output
  // =========================================================================

  describe('composition metadata', () => {
    it('includes composition name in generated headers', () => {
      const comp = makeComposition({ name: 'MyAwesomeScene' });
      const result = compiler.compile(comp);

      expect(result['_globals.wgsl']).toContain('MyAwesomeScene');
      expect(result['_pipeline.ts']).toContain('MyAwesomeScene');
    });

    it('includes trait names in shader comments', () => {
      const comp = makeComposition({
        objects: [makeObject('Obj', [{ name: 'hologram' }, { name: 'dissolve' }])],
      });
      const result = compiler.compile(comp);
      const vs = result['Obj.vertex.wgsl'];
      const fs = result['Obj.fragment.wgsl'];

      expect(vs).toContain('@hologram');
      expect(vs).toContain('@dissolve');
      expect(fs).toContain('@hologram');
      expect(fs).toContain('@dissolve');
    });
  });
});
