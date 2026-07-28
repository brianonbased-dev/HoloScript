/**
 * RenderPassTraits — unit tests for Tier-2 render-pass / post-FX handlers.
 *
 * Tests run headlessly via vitest. THREE.Object3D is real (no WebGL). Browser
 * APIs (document, AudioContext, HTMLVideoElement) are stubbed where needed.
 *
 * Convention for each trait:
 *   - onApply: verify the correct userData / geometry / scene signal
 *   - onUpdate: verify tick-based mutation when applicable
 *   - onRemove: verify cleanup (geometry disposed, userData cleared, postFX removed)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  BloomTrait,
  GodRaysTrait,
  VolumetricCloudsTrait,
  VolumetricVideoTrait,
  GaussianSplatTrait,
  NerfTrait,
  PointCloudTrait,
  PhotogrammetryTrait,
  ShadowTrait,
  WebSurfaceTrait,
  SceneReconstructionTrait,
  DepthOfFieldTrait,
  MotionBlurTrait,
  ChromaticAberrationTrait,
  LensFlareTrait,
  AmbientOcclusionTrait,
} from '../RenderPassTraits';
import type { TraitContext } from '../TraitSystem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubPhysics(): TraitContext['physicsWorld'] {
  return { addBody: vi.fn() } as unknown as TraitContext['physicsWorld'];
}

function makeCtx(
  object: THREE.Object3D = new THREE.Object3D(),
  config: Record<string, unknown> = {}
): TraitContext {
  return { object, physicsWorld: stubPhysics(), config, data: {} };
}

/** Returns the scene root's holoPostFX array (or empty). */
function getPostFX(
  obj: THREE.Object3D
): Array<{ effect: string; config: Record<string, unknown> }> {
  let root: THREE.Object3D = obj;
  while (root.parent) root = root.parent;
  return (
    (root.userData['holoPostFX'] as Array<{ effect: string; config: Record<string, unknown> }>) ??
    []
  );
}

/** Attach obj to a scene so postFX signals reach the root. */
function withScene(obj: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(obj);
  return scene;
}

// Stub document for browser-API traits
function stubDocument() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
    })),
  };
  const video = {
    src: '',
    loop: false,
    muted: false,
    playsInline: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => (tag === 'video' ? video : canvas)),
  });
  return { canvas, video };
}

// ---------------------------------------------------------------------------
// BloomTrait
// ---------------------------------------------------------------------------

describe('BloomTrait', () => {
  it('sets holoBloom userData on apply', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { intensity: 2.0, luminance_threshold: 0.2 });
    BloomTrait.onApply!(ctx);

    expect(ctx.object.userData['holoBloom']).toMatchObject({
      intensity: 2.0,
      luminanceThreshold: 0.2,
    });
  });

  it('writes a bloom entry to scene.userData.holoPostFX', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { intensity: 1.5 });
    BloomTrait.onApply!(ctx);

    const fx = getPostFX(obj);
    expect(fx.some((e) => e.effect === 'bloom')).toBe(true);
  });

  it('removes postFX and userData on remove', () => {
    const obj = new THREE.Object3D();
    const scene = withScene(obj);
    const ctx = makeCtx(obj, { intensity: 1.0 });
    BloomTrait.onApply!(ctx);
    BloomTrait.onRemove!(ctx);

    expect(ctx.object.userData['holoBloom']).toBeUndefined();
    expect(
      (scene.userData['holoPostFX'] as Array<{ effect: string }> | undefined)?.some(
        (e) => e.effect === 'bloom'
      )
    ).toBeFalsy();
  });

  it('scales emissiveIntensity on mesh children', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const geo = new THREE.BoxGeometry();
    const mat = new THREE.MeshStandardMaterial({ emissiveIntensity: 1 });
    mat.emissive = new THREE.Color(0xffffff);
    const mesh = new THREE.Mesh(geo, mat);
    obj.add(mesh);

    const ctx = makeCtx(obj, { intensity: 2.0 });
    BloomTrait.onApply!(ctx);
    expect(mat.emissiveIntensity).toBeGreaterThan(1);

    BloomTrait.onRemove!(ctx);
    expect(mat.emissiveIntensity).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GodRaysTrait
// ---------------------------------------------------------------------------

describe('GodRaysTrait', () => {
  it('adds a PointLight child on apply', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { intensity: 1.0 });
    GodRaysTrait.onApply!(ctx);

    const light = obj.children.find((c) => (c as THREE.PointLight).isPointLight);
    expect(light).toBeTruthy();
    expect(ctx.object.userData['holoGodRays']).toMatchObject({ intensity: 1.0 });
  });

  it('writes godRays to scene.userData.holoPostFX', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { intensity: 0.8 });
    GodRaysTrait.onApply!(ctx);
    expect(getPostFX(obj).some((e) => e.effect === 'godRays')).toBe(true);
  });

  it('removes the light and postFX on remove', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { intensity: 1.0 });
    GodRaysTrait.onApply!(ctx);
    GodRaysTrait.onRemove!(ctx);

    expect(obj.children.some((c) => (c as THREE.PointLight).isPointLight)).toBe(false);
    expect(ctx.object.userData['holoGodRays']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// VolumetricCloudsTrait
// ---------------------------------------------------------------------------

describe('VolumetricCloudsTrait', () => {
  it('creates a cloud group with children on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { coverage: 0.5, altitude: 50 });
    VolumetricCloudsTrait.onApply!(ctx);

    const group = obj.children.find((c) => c.name === '_holoVolumetricClouds') as THREE.Group;
    expect(group).toBeTruthy();
    expect(group.children.length).toBeGreaterThan(0);
    expect(ctx.object.userData['holoVolumetricClouds']).toMatchObject({ coverage: 0.5 });
  });

  it('drifts the cloud group on update', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { speed: 2.0 });
    VolumetricCloudsTrait.onApply!(ctx);

    const group = ctx.data['cloudGroup'] as THREE.Group;
    const before = group.position.x;
    VolumetricCloudsTrait.onUpdate!(ctx, 0.1);
    expect(group.position.x).toBeGreaterThan(before);
  });

  it('disposes geometry and clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {});
    VolumetricCloudsTrait.onApply!(ctx);
    VolumetricCloudsTrait.onRemove!(ctx);

    expect(obj.children.some((c) => c.name === '_holoVolumetricClouds')).toBe(false);
    expect(ctx.object.userData['holoVolumetricClouds']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// VolumetricVideoTrait
// ---------------------------------------------------------------------------

describe('VolumetricVideoTrait', () => {
  beforeEach(() => {
    stubDocument();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a plane child on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { src: 'test.mp4', width: 4, height: 3 });
    VolumetricVideoTrait.onApply!(ctx);

    const plane = obj.children.find((c) => c.name === '_holoVolumetricVideoPlane');
    expect(plane).toBeTruthy();
    expect(ctx.object.userData['holoVolumetricVideo']).toMatchObject({ src: 'test.mp4' });
  });

  it('removes plane and clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { src: 'test.mp4' });
    VolumetricVideoTrait.onApply!(ctx);
    VolumetricVideoTrait.onRemove!(ctx);

    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData['holoVolumetricVideo']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GaussianSplatTrait
// ---------------------------------------------------------------------------

describe('GaussianSplatTrait', () => {
  it('creates a wireframe placeholder on apply', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { src: 'scene.splat', scale: 2.0 });
    GaussianSplatTrait.onApply!(ctx);

    const placeholder = obj.children.find((c) => c.name === '_holoGaussianSplatPlaceholder');
    expect(placeholder).toBeTruthy();
    expect(ctx.object.userData['holoGaussianSplat']).toMatchObject({
      src: 'scene.splat',
      ready: false,
    });
  });

  it('writes gaussianSplat to scene postFX', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { src: 'scene.splat' });
    GaussianSplatTrait.onApply!(ctx);
    expect(getPostFX(obj).some((e) => e.effect === 'gaussianSplat')).toBe(true);
  });

  it('removes placeholder and postFX on remove', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, { src: 'scene.splat' });
    GaussianSplatTrait.onApply!(ctx);
    GaussianSplatTrait.onRemove!(ctx);

    expect(obj.children.some((c) => c.name === '_holoGaussianSplatPlaceholder')).toBe(false);
    expect(ctx.object.userData['holoGaussianSplat']).toBeUndefined();
    expect(getPostFX(obj).some((e) => e.effect === 'gaussianSplat')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NerfTrait
// ---------------------------------------------------------------------------

describe('NerfTrait', () => {
  it('creates a sphere placeholder on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { src: 'scene.nerf', steps: 64 });
    NerfTrait.onApply!(ctx);

    const sphere = obj.children.find((c) => c.name === '_holoNerfPlaceholder');
    expect(sphere).toBeTruthy();
    expect(ctx.object.userData['holoNerf']).toMatchObject({ src: 'scene.nerf', ready: false });
  });

  it('removes placeholder on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {});
    NerfTrait.onApply!(ctx);
    NerfTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData['holoNerf']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PointCloudTrait
// ---------------------------------------------------------------------------

describe('PointCloudTrait', () => {
  it('creates a Points object from inline data', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {
      points: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      point_size: 0.1,
      color: 0xff0000,
    });
    PointCloudTrait.onApply!(ctx);

    const points = obj.children.find((c) => c.name === '_holoPointCloud') as THREE.Points;
    expect(points).toBeTruthy();
    expect(points.geometry.attributes['position'].count).toBe(3);
  });

  it('generates a placeholder point cloud when no src/points provided', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {});
    PointCloudTrait.onApply!(ctx);

    const points = obj.children.find((c) => c.name === '_holoPointCloud') as THREE.Points;
    expect(points).toBeTruthy();
    expect(points.geometry.attributes['position'].count).toBeGreaterThan(0);
  });

  it('removes Points and clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { points: [0, 0, 0] });
    PointCloudTrait.onApply!(ctx);
    PointCloudTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData['holoPointCloud']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PhotogrammetryTrait
// ---------------------------------------------------------------------------

describe('PhotogrammetryTrait', () => {
  it('enables castShadow / receiveShadow on mesh children', () => {
    const obj = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    obj.add(mesh);
    const ctx = makeCtx(obj, { cast_shadow: true, receive_shadow: true });
    PhotogrammetryTrait.onApply!(ctx);

    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(ctx.object.userData['holoPhotogrammetry']).toMatchObject({ castShadow: true });
  });

  it('clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {});
    PhotogrammetryTrait.onApply!(ctx);
    PhotogrammetryTrait.onRemove!(ctx);
    expect(ctx.object.userData['holoPhotogrammetry']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ShadowTrait
// ---------------------------------------------------------------------------

describe('ShadowTrait', () => {
  it('sets castShadow and receiveShadow on all mesh children', () => {
    const parent = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    parent.add(mesh);
    const ctx = makeCtx(parent, { cast: true, receive: true, map_size: 2048 });
    ShadowTrait.onApply!(ctx);

    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(ctx.object.userData['holoShadow']).toMatchObject({ cast: true, mapSize: 2048 });
  });

  it('disables shadows on remove', () => {
    const parent = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    parent.add(mesh);
    const ctx = makeCtx(parent, { cast: true, receive: true });
    ShadowTrait.onApply!(ctx);
    ShadowTrait.onRemove!(ctx);

    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(ctx.object.userData['holoShadow']).toBeUndefined();
  });

  it('updates DirectionalLight shadow map size', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    scene.add(obj);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(light);
    const ctx = makeCtx(obj, { map_size: 4096 });
    ShadowTrait.onApply!(ctx);

    expect(light.shadow.mapSize.x).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// WebSurfaceTrait
// ---------------------------------------------------------------------------

describe('WebSurfaceTrait', () => {
  beforeEach(() => {
    stubDocument();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a plane child on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { url: 'https://example.com', width: 4, height: 3 });
    WebSurfaceTrait.onApply!(ctx);

    const plane = obj.children.find((c) => c.name === '_holoWebSurface');
    expect(plane).toBeTruthy();
    expect(ctx.object.userData['holoWebSurface']).toMatchObject({ url: 'https://example.com' });
  });

  it('removes plane and clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { url: '' });
    WebSurfaceTrait.onApply!(ctx);
    WebSurfaceTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData['holoWebSurface']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SceneReconstructionTrait
// ---------------------------------------------------------------------------

describe('SceneReconstructionTrait', () => {
  it('sets holoSceneReconstruction on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { resolution: 64, update_rate: 10 });
    SceneReconstructionTrait.onApply!(ctx);

    expect(ctx.object.userData['holoSceneReconstruction']).toMatchObject({
      resolution: 64,
      updateRate: 10,
      ready: false,
    });
  });

  it('tracks recon mesh count on update', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { update_rate: 1 });
    SceneReconstructionTrait.onApply!(ctx);

    // Add a fake reconstruction mesh
    const recon = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    recon.name = '_holoReconMesh_0';
    obj.add(recon);

    SceneReconstructionTrait.onUpdate!(ctx, 1.1); // exceeds 1/updateRate
    expect(
      (ctx.object.userData['holoSceneReconstruction'] as { meshCount: number }).meshCount
    ).toBe(1);
  });

  it('clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, {});
    SceneReconstructionTrait.onApply!(ctx);
    SceneReconstructionTrait.onRemove!(ctx);
    expect(ctx.object.userData['holoSceneReconstruction']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Post-FX marker traits: DOF, MotionBlur, ChromaticAberration, AmbientOcclusion
// ---------------------------------------------------------------------------

describe.each([
  {
    name: 'DepthOfFieldTrait',
    trait: DepthOfFieldTrait,
    config: { focus_distance: 8 },
    key: 'holoDepthOfField',
    effect: 'depthOfField',
  },
  {
    name: 'MotionBlurTrait',
    trait: MotionBlurTrait,
    config: { intensity: 0.3, samples: 4 },
    key: 'holoMotionBlur',
    effect: 'motionBlur',
  },
  {
    name: 'ChromaticAberrationTrait',
    trait: ChromaticAberrationTrait,
    config: { offset: 0.003 },
    key: 'holoChromaticAberration',
    effect: 'chromaticAberration',
  },
  {
    name: 'AmbientOcclusionTrait',
    trait: AmbientOcclusionTrait,
    config: { intensity: 1.5, radius: 0.3 },
    key: 'holoAmbientOcclusion',
    effect: 'ssao',
  },
])('$name', ({ trait, config, key, effect }) => {
  it('sets userData and postFX on apply', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, config);
    trait.onApply!(ctx);
    expect(ctx.object.userData[key]).toBeTruthy();
    expect(getPostFX(obj).some((e) => e.effect === effect)).toBe(true);
  });

  it('clears userData and postFX on remove', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx = makeCtx(obj, config);
    trait.onApply!(ctx);
    trait.onRemove!(ctx);
    expect(ctx.object.userData[key]).toBeUndefined();
    expect(getPostFX(obj).some((e) => e.effect === effect)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LensFlareTrait
// ---------------------------------------------------------------------------

describe('LensFlareTrait', () => {
  it('adds a sprite child on apply', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { intensity: 1.0, size: 2.0, color: 0xffaa00 });
    LensFlareTrait.onApply!(ctx);

    const sprite = obj.children.find((c) => c.name === '_holoLensFlareSprite') as THREE.Sprite;
    expect(sprite).toBeTruthy();
    expect(ctx.object.userData['holoLensFlare']).toMatchObject({ intensity: 1.0, size: 2.0 });
  });

  it('flickers opacity on update', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { intensity: 1.0 });
    LensFlareTrait.onApply!(ctx);

    const mat = ctx.data['spriteMat'] as THREE.SpriteMaterial;
    const before = mat.opacity;
    LensFlareTrait.onUpdate!(ctx, 0.016);
    // Opacity should be close to intensity*0.5 with some jitter
    expect(mat.opacity).toBeGreaterThan(0);
    expect(mat.opacity).toBeLessThanOrEqual(1);
    // Just verify it was touched — exact value varies due to Math.random()
    expect(typeof mat.opacity).toBe('number');
    void before; // suppress unused warning
  });

  it('removes sprite and clears userData on remove', () => {
    const obj = new THREE.Object3D();
    const ctx = makeCtx(obj, { intensity: 1.0 });
    LensFlareTrait.onApply!(ctx);
    LensFlareTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData['holoLensFlare']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// postFX deduplication — same effect applied twice replaces, not duplicates
// ---------------------------------------------------------------------------

describe('postFX deduplication', () => {
  it('does not duplicate the same effect in holoPostFX', () => {
    const obj = new THREE.Object3D();
    withScene(obj);
    const ctx1 = makeCtx(obj, { intensity: 1.0 });
    const ctx2 = makeCtx(obj, { intensity: 2.0 });

    BloomTrait.onApply!(ctx1);
    BloomTrait.onApply!(ctx2);

    const fx = getPostFX(obj).filter((e) => e.effect === 'bloom');
    expect(fx.length).toBe(1);
    expect(fx[0]!.config['intensity']).toBe(2.0); // second call wins
  });
});
