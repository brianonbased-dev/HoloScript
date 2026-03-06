/**
 * BabylonCompiler — Production Tests
 *
 * Tests: compile() output shape, helper methods (toBabylonColor3, toBabylonVector,
 * mapShapeToMesh, meshBuilderOptions), light types, camera types, effects,
 * zones, UI, timelines, audio.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BabylonCompiler } from '../BabylonCompiler';
import type { BabylonCompilerOptions } from '../BabylonCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    spatialGroups: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeCompiler(opts: BabylonCompilerOptions = {}): BabylonCompiler {
  return new BabylonCompiler({ useHavok: false, enableXR: false, ...opts });
}

// --- compile() shape ---
describe('BabylonCompiler — compile() structure', () => {
  it('exports a class with the default name', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition());
    expect(code).toContain('export class GeneratedScene');
  });

  it('respects custom className option', () => {
    const c = makeCompiler({ className: 'MyWorld' });
    const code = c.compile(makeComposition());
    expect(code).toContain('export class MyWorld');
  });

  it('contains constructor and build method', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition());
    expect(code).toContain('constructor(canvas:');
    expect(code).toContain('async build()');
  });

  it('contains dispose method', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition());
    expect(code).toContain('dispose()');
  });

  it('includes BABYLON core import', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition());
    expect(code).toContain('@babylonjs/core');
  });

  it('includes GUI import when ui is present', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      ui: {
        elements: [{
          name: 'Label',
          properties: [{ key: 'type', value: 'text' }, { key: 'text', value: 'Hello' }],
        }],
      },
    }));
    expect(code).toContain('@babylonjs/gui');
  });

  it('includes HavokPhysics import when useHavok=true', () => {
    const c = makeCompiler({ useHavok: true });
    const code = c.compile(makeComposition());
    expect(code).toContain('@babylonjs/havok');
  });

  it('includes XR loader import when enableXR=true', () => {
    const c = makeCompiler({ enableXR: true });
    const code = c.compile(makeComposition());
    expect(code).toContain('@babylonjs/loaders');
  });

  it('includes render loop statement', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition());
    expect(code).toContain('runRenderLoop');
  });

  it('uses composition name in comment', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({ name: 'SunsetWorld' }));
    expect(code).toContain('SunsetWorld');
  });
});

// --- objects ---
describe('BabylonCompiler — emitObject', () => {
  it('emits MeshBuilder for sphere geometry', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'Ball',
        properties: [{ key: 'geometry', value: 'sphere' }],
        traits: [],
      }],
    }));
    expect(code).toContain('CreateSphere');
    expect(code).toContain('"Ball"');
  });

  it('emits SceneLoader for model src', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'Robot',
        properties: [{ key: 'src', value: 'models/robot.glb' }],
        traits: [],
      }],
    }));
    expect(code).toContain('ImportMeshAsync');
    expect(code).toContain('models/robot.glb');
  });

  it('emits PBR material when color is provided', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'RedCube',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'color', value: '#ff0000' },
        ],
        traits: [],
      }],
    }));
    expect(code).toContain('PBRMaterial');
    expect(code).toContain('albedoColor');
  });

  it('emits position and rotation', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'MovingBox',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'position', value: [1, 2, 3] },
          { key: 'rotation', value: [0, 90, 0] },
        ],
        traits: [],
      }],
    }));
    expect(code).toContain('1, 2, 3');
    expect(code).toContain('0, 90, 0');
  });

  it('emits uniform scale', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'BigBox',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'scale', value: 2 },
        ],
        traits: [],
      }],
    }));
    expect(code).toContain('Vector3(2, 2, 2)');
  });

  it('emits physics body for @physics trait', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'PhysicsCube',
        properties: [{ key: 'geometry', value: 'cube' }],
        traits: [{ name: 'physics', config: { type: 'dynamic', mass: 10 } }],
      }],
    }));
    expect(code).toContain('PhysicsBody');
    expect(code).toContain('mass: 10');
  });

  it('emits text mesh for text geometry', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'Label',
        properties: [
          { key: 'geometry', value: 'text' },
          { key: 'text', value: 'Hello World' },
        ],
        traits: [],
      }],
    }));
    expect(code).toContain('DynamicTexture');
    expect(code).toContain('Hello World');
  });
});

// --- lights ---
describe('BabylonCompiler — emitLight', () => {
  it('emits HemisphericLight for ambient type', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      lights: [{
        name: 'AmbientLight',
        lightType: 'ambient',
        properties: [{ key: 'intensity', value: 0.5 }],
      }],
    }));
    expect(code).toContain('HemisphericLight');
    expect(code).toContain('intensity = 0.5');
  });

  it('emits DirectionalLight', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      lights: [{
        name: 'Sun',
        lightType: 'directional',
        properties: [{ key: 'direction', value: [0, -1, 0] }],
      }],
    }));
    expect(code).toContain('DirectionalLight');
  });

  it('emits PointLight', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      lights: [{
        name: 'Bulb',
        lightType: 'point',
        properties: [],
      }],
    }));
    expect(code).toContain('PointLight');
  });

  it('emits SpotLight with angle', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      lights: [{
        name: 'Spot',
        lightType: 'spot',
        properties: [{ key: 'angle', value: 0.5 }],
      }],
    }));
    expect(code).toContain('SpotLight');
    expect(code).toContain('0.5');
  });

  it('emits ShadowGenerator when castShadow=true', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      lights: [{
        name: 'ShadowLight',
        lightType: 'directional',
        properties: [{ key: 'cast_shadow', value: true }],
      }],
    }));
    expect(code).toContain('ShadowGenerator');
  });

  it('emits default light when lights array is empty', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({ lights: [] }));
    expect(code).toContain('defaultLight');
  });
});

// --- camera ---
describe('BabylonCompiler — emitCamera', () => {
  it('emits ArcRotateCamera by default', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      camera: { cameraType: 'perspective', properties: [] },
    }));
    expect(code).toContain('ArcRotateCamera');
  });

  it('emits FreeCamera for orthographic type', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      camera: { cameraType: 'orthographic', properties: [] },
    }));
    expect(code).toContain('FreeCamera');
    expect(code).toContain('ORTHOGRAPHIC_CAMERA');
  });

  it('emits fov in radians', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 90 }] },
    }));
    // 90 * (PI / 180) ≈ 1.5707...
    expect(code).toContain('1.5707');
  });
});

// --- color3 helper ---
describe('BabylonCompiler — toBabylonColor3 (via objects)', () => {
  it('converts hex color to BABYLON.Color3', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'RedBox',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'color', value: '#ff0000' },
        ],
        traits: [],
      }],
    }));
    // #ff0000 → r=1.000, g=0.000, b=0.000
    expect(code).toContain('1.000');
    expect(code).toContain('0.000');
  });

  it('uses Color3.White() when color is unrecognized', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      objects: [{
        name: 'WhiteBox',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'color', value: 42 }, // invalid color
        ],
        traits: [],
      }],
    }));
    expect(code).toContain('Color3.White()');
  });
});

// --- effects ---
describe('BabylonCompiler — emitEffects', () => {
  it('emits DefaultRenderingPipeline', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      effects: {
        effects: [{ effectType: 'bloom', properties: { intensity: 0.3 } }],
      },
    }));
    expect(code).toContain('DefaultRenderingPipeline');
    expect(code).toContain('bloomEnabled = true');
    expect(code).toContain('0.3');
  });

  it('emits vignette', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      effects: {
        effects: [{ effectType: 'vignette', properties: { weight: 0.5 } }],
      },
    }));
    expect(code).toContain('vignetteEnabled');
    expect(code).toContain('0.5');
  });
});

// --- audio ---
describe('BabylonCompiler — emitAudio', () => {
  it('emits BABYLON.Sound with src and volume', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      audio: [{
        name: 'Bgm',
        properties: [
          { key: 'src', value: 'audio/music.mp3' },
          { key: 'volume', value: 0.7 },
        ],
      }],
    }));
    expect(code).toContain('BABYLON.Sound');
    expect(code).toContain('audio/music.mp3');
    expect(code).toContain('volume: 0.7');
  });

  it('emits spatialSound option when spatial=true', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      audio: [{
        name: 'Spatial',
        properties: [
          { key: 'src', value: 'sfx.wav' },
          { key: 'spatial', value: true },
        ],
      }],
    }));
    expect(code).toContain('spatialSound: true');
  });
});

// --- zones ---
describe('BabylonCompiler — emitZone', () => {
  it('emits box zone by default', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      zones: [{ name: 'SafeZone', properties: [] }],
    }));
    expect(code).toContain('CreateBox');
    expect(code).toContain('"SafeZone"');
    expect(code).toContain('isVisible = false');
  });

  it('emits sphere zone when shape=sphere', () => {
    const c = makeCompiler();
    const code = c.compile(makeComposition({
      zones: [{ name: 'SphereZone', properties: [{ key: 'shape', value: 'sphere' }] }],
    }));
    expect(code).toContain('CreateSphere');
  });
});
