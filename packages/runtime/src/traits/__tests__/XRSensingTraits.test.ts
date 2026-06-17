/**
 * XRSensingTraits — unit tests for Tier-3 AR/XR sensing handlers.
 *
 * WebXR, Geolocation, and AudioContext are all stubbed via vi.fn() — no real
 * browser or XR device required.  THREE.Object3D is real (no WebGL).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  PlaneDetectionTrait,
  MeshDetectionTrait,
  PersistentAnchorTrait,
  SharedAnchorTrait,
  GeospatialTrait,
  LightEstimationTrait,
  OcclusionTrait,
  CoLocatedTrait,
  ShareplayTrait,
} from '../XRSensingTraits';
import type { TraitContext } from '../TraitSystem';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function stubPhysics(): TraitContext['physicsWorld'] {
  return { addBody: vi.fn() } as unknown as TraitContext['physicsWorld'];
}

function makeContext(
  object: THREE.Object3D,
  config: Record<string, unknown> = {}
): TraitContext {
  return { object, physicsWorld: stubPhysics(), config, data: {} };
}

/** Build a minimal parent scene that the XR helpers inspect. */
function makeSceneWithXR(overrides: Record<string, unknown> = {}): THREE.Object3D {
  const scene = new THREE.Object3D();
  (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData = {
    xrManager: null,
    xrFrame: null,
    meshBroadcast: vi.fn(),
    ...overrides,
  };
  return scene;
}

// ──────────────────────────────────────────────────────────────────
// 1. plane_detection
// ──────────────────────────────────────────────────────────────────

describe('PlaneDetectionTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
    ctx = makeContext(obj);
  });

  it('registers userData flags on apply', () => {
    PlaneDetectionTrait.onApply!(ctx);
    expect(ctx.object.userData.planeDetection).toBe(true);
    expect(ctx.object.userData.detectedPlaneCount).toBe(0);
    expect(ctx.object.userData.nearestPlaneY).toBeNull();
  });

  it('defaults config values', () => {
    PlaneDetectionTrait.onApply!(ctx);
    expect(ctx.data.orientation).toBe('any');
    expect(ctx.data.hitTest).toBe(true);
    expect(ctx.data.snapToPlane).toBe(false);
  });

  it('reads config overrides', () => {
    ctx = makeContext(obj, { orientation: 'horizontal', snap_to_plane: true, hit_test: false });
    PlaneDetectionTrait.onApply!(ctx);
    expect(ctx.data.orientation).toBe('horizontal');
    expect(ctx.data.snapToPlane).toBe(true);
    expect(ctx.data.hitTest).toBe(false);
  });

  it('updates detectedPlaneCount from xrFrame worldInfo', () => {
    PlaneDetectionTrait.onApply!(ctx);

    const fakePlane = { orientation: 'horizontal', polygon: [{ x: 0, y: 0.5, z: 0 }] };
    const fakeFrame = {
      getWorldInformation: () => ({ detectedPlanes: new Set([fakePlane]) }),
    };
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.xrFrame =
      fakeFrame;

    PlaneDetectionTrait.onUpdate!(ctx, 0.016);
    expect(ctx.object.userData.detectedPlaneCount).toBe(1);
  });

  it('snaps Y to nearest plane polygon vertex when snap_to_plane is true', () => {
    ctx = makeContext(obj, { snap_to_plane: true });
    PlaneDetectionTrait.onApply!(ctx);

    const fakePlane = { orientation: 'horizontal', polygon: [{ x: 0, y: 1.2, z: 0 }] };
    const fakeFrame = {
      getWorldInformation: () => ({ detectedPlanes: new Set([fakePlane]) }),
    };
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.xrFrame =
      fakeFrame;

    PlaneDetectionTrait.onUpdate!(ctx, 0.016);
    expect(ctx.object.position.y).toBeCloseTo(1.2);
  });

  it('clears flags on remove', () => {
    PlaneDetectionTrait.onApply!(ctx);
    PlaneDetectionTrait.onRemove!(ctx);
    expect(ctx.object.userData.planeDetection).toBe(false);
    expect(ctx.object.userData.hitTestActive).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. mesh_detection
// ──────────────────────────────────────────────────────────────────

describe('MeshDetectionTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
    ctx = makeContext(obj);
  });

  it('registers userData on apply', () => {
    MeshDetectionTrait.onApply!(ctx);
    expect(ctx.object.userData.meshDetection).toBe(true);
    expect(ctx.object.userData.detectedMeshCount).toBe(0);
  });

  it('respects max_meshes config', () => {
    ctx = makeContext(obj, { max_meshes: 2 });
    MeshDetectionTrait.onApply!(ctx);
    expect(ctx.data.maxMeshes).toBe(2);

    const meshes = [
      { vertices: new Float32Array([0, 0, 0]), indices: new Uint32Array([0]) },
      { vertices: new Float32Array([1, 0, 0]), indices: new Uint32Array([0]) },
      { vertices: new Float32Array([2, 0, 0]), indices: new Uint32Array([0]) },
    ];
    const fakeFrame = {
      getWorldInformation: () => ({ detectedMeshes: new Set(meshes) }),
    };
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.xrFrame =
      fakeFrame;

    MeshDetectionTrait.onUpdate!(ctx, 0.016);
    expect(ctx.object.userData.detectedMeshCount).toBe(2); // capped at max_meshes
  });

  it('clears flags on remove', () => {
    MeshDetectionTrait.onApply!(ctx);
    MeshDetectionTrait.onRemove!(ctx);
    expect(ctx.object.userData.meshDetection).toBe(false);
    expect(ctx.object.userData.worldMeshes).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. persistent_anchor
// ──────────────────────────────────────────────────────────────────

describe('PersistentAnchorTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
    ctx = makeContext(obj);
  });

  it('registers userData on apply', () => {
    PersistentAnchorTrait.onApply!(ctx);
    expect(ctx.object.userData.persistentAnchor).toBe(true);
    expect(ctx.object.userData.anchorAttached).toBe(false);
  });

  it('applies default auto_attach', () => {
    PersistentAnchorTrait.onApply!(ctx);
    expect(ctx.data.autoAttach).toBe(true);
  });

  it('accepts config anchor_id', () => {
    ctx = makeContext(obj, { anchor_id: 'holo-anchor-abc123' });
    PersistentAnchorTrait.onApply!(ctx);
    expect(ctx.data.anchorId).toBe('holo-anchor-abc123');
  });

  it('clears anchor and flags on remove', () => {
    PersistentAnchorTrait.onApply!(ctx);
    PersistentAnchorTrait.onRemove!(ctx);
    expect(ctx.object.userData.persistentAnchor).toBe(false);
    expect(ctx.object.userData.anchorAttached).toBe(false);
    expect(ctx.data.anchor).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. shared_anchor
// ──────────────────────────────────────────────────────────────────

describe('SharedAnchorTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcast = vi.fn();
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR({ meshBroadcast: broadcast });
    ctx = makeContext(obj);
  });

  it('defaults to creator role', () => {
    SharedAnchorTrait.onApply!(ctx);
    expect(ctx.data.role).toBe('creator');
    expect(ctx.object.userData.anchorRole).toBe('creator');
  });

  it('broadcasts world transform at broadcastRate', () => {
    ctx = makeContext(obj, { broadcast_rate: 0.5 });
    SharedAnchorTrait.onApply!(ctx);

    // Under rate — no broadcast
    SharedAnchorTrait.onUpdate!(ctx, 0.3);
    expect(broadcast).not.toHaveBeenCalled();

    // Over rate — broadcast fires
    SharedAnchorTrait.onUpdate!(ctx, 0.3);
    expect(broadcast).toHaveBeenCalledWith('shared_anchors', expect.objectContaining({
      position: expect.any(Object),
      orientation: expect.any(Object),
    }));
  });

  it('receiver applies incoming transform', () => {
    ctx = makeContext(obj, { role: 'receiver' });
    SharedAnchorTrait.onApply!(ctx);
    obj.userData.incomingAnchorTransform = {
      position: { x: 3, y: 1, z: 2 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    SharedAnchorTrait.onUpdate!(ctx, 1.1); // past broadcastRate default 1
    expect(obj.position.x).toBeCloseTo(3);
    expect(obj.position.y).toBeCloseTo(1);
  });

  it('clears flags on remove', () => {
    SharedAnchorTrait.onApply!(ctx);
    SharedAnchorTrait.onRemove!(ctx);
    expect(ctx.object.userData.sharedAnchor).toBe(false);
    expect(ctx.object.userData.anchorSynced).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. geospatial
// ──────────────────────────────────────────────────────────────────

describe('GeospatialTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
  });

  it('stores lat/lon/alt in userData on apply', () => {
    ctx = makeContext(obj, { latitude: 41.3851, longitude: 2.1734, altitude: 50 });
    GeospatialTrait.onApply!(ctx);
    expect(ctx.object.userData.latitude).toBeCloseTo(41.3851);
    expect(ctx.object.userData.longitude).toBeCloseTo(2.1734);
    expect(ctx.object.userData.altitude).toBeCloseTo(50);
  });

  it('projects to ENU position when device GPS is available', () => {
    ctx = makeContext(obj, { latitude: 41.3852, longitude: 2.1734, altitude: 0 });
    GeospatialTrait.onApply!(ctx);

    // Simulate device at slightly different position
    ctx.data.deviceLat = 41.3851;
    ctx.data.deviceLon = 2.1734;
    ctx.data.deviceAlt = 0;
    ctx.object.userData.gpsReady = true;

    GeospatialTrait.onUpdate!(ctx, 0.016);

    // ~11m north: Z should be negative (Three.js convention) and small
    const enuZ = ctx.object.position.z;
    expect(enuZ).toBeLessThan(0); // north is -Z
    const enuOffset = ctx.object.userData.enuOffset as { north: number };
    expect(enuOffset.north).toBeGreaterThan(0);
  });

  it('does not move object when no device GPS yet', () => {
    ctx = makeContext(obj, { latitude: 41.3851, longitude: 2.1734, auto_position: true });
    GeospatialTrait.onApply!(ctx);
    ctx.data.deviceLat = null;

    const posBefore = obj.position.clone();
    GeospatialTrait.onUpdate!(ctx, 0.016);
    expect(obj.position.equals(posBefore)).toBe(true);
  });

  it('clears watchId and flags on remove', () => {
    ctx = makeContext(obj, { auto_position: false });
    GeospatialTrait.onApply!(ctx);
    GeospatialTrait.onRemove!(ctx);
    expect(ctx.object.userData.geospatial).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. light_estimation
// ──────────────────────────────────────────────────────────────────

describe('LightEstimationTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
    ctx = makeContext(obj);
  });

  it('registers userData on apply', () => {
    LightEstimationTrait.onApply!(ctx);
    expect(ctx.object.userData.lightEstimation).toBe(true);
  });

  it('adds controlled ambient and directional lights to object', () => {
    LightEstimationTrait.onApply!(ctx);
    expect(ctx.data.ambientLight).toBeInstanceOf(THREE.AmbientLight);
    expect(ctx.data.directionalLight).toBeInstanceOf(THREE.DirectionalLight);
    expect(obj.children.length).toBe(2);
  });

  it('applies SH coefficients to ambient intensity on update', () => {
    LightEstimationTrait.onApply!(ctx);
    ctx.data.lightProbe = {}; // simulate acquired probe

    const fakeSH = new Float32Array([0.8, 0.7, 0.6, 0, 0, 0, 0, 0, 0]);
    const fakeEstimate: { sphericalHarmonicsCoefficients: Float32Array } = {
      sphericalHarmonicsCoefficients: fakeSH,
    };
    const fakeFrame = { getLightEstimate: () => fakeEstimate };
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.xrFrame =
      fakeFrame;

    LightEstimationTrait.onUpdate!(ctx, 0.016);

    const ambient = ctx.data.ambientLight as THREE.AmbientLight;
    expect(ambient.intensity).toBeCloseTo(0.8); // max(0.8, 0.7, 0.6) * scale 1
  });

  it('removes child lights on remove', () => {
    LightEstimationTrait.onApply!(ctx);
    expect(obj.children.length).toBe(2);
    LightEstimationTrait.onRemove!(ctx);
    expect(obj.children.length).toBe(0);
    expect(ctx.object.userData.lightEstimation).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 7. occlusion
// ──────────────────────────────────────────────────────────────────

describe('OcclusionTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR();
    ctx = makeContext(obj);
  });

  it('registers userData on apply', () => {
    OcclusionTrait.onApply!(ctx);
    expect(ctx.object.userData.occlusion).toBe(true);
  });

  it('creates occluder material in mesh mode', () => {
    ctx = makeContext(obj, { mode: 'mesh' });
    OcclusionTrait.onApply!(ctx);
    expect(ctx.data.occlusionMaterial).toBeInstanceOf(THREE.MeshStandardMaterial);
    const mat = ctx.data.occlusionMaterial as THREE.MeshStandardMaterial;
    expect(mat.colorWrite).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  it('sets xrDepthOcclusionRequested on scene in xr_depth mode', () => {
    ctx = makeContext(obj, { mode: 'xr_depth' });
    // Simulate active XR session
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.xrManager = {
      getSession: () => ({ requestReferenceSpace: vi.fn() }),
    };
    OcclusionTrait.onApply!(ctx);
    const sceneUD = (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData;
    expect(sceneUD.xrDepthOcclusionRequested).toBe(true);
  });

  it('clears flags on remove', () => {
    ctx = makeContext(obj, { mode: 'mesh' });
    OcclusionTrait.onApply!(ctx);
    OcclusionTrait.onRemove!(ctx);
    expect(ctx.object.userData.occlusion).toBe(false);
    expect(ctx.object.userData.occlusionActive).toBe(false);
    expect(ctx.data.occlusionMaterial).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// 8. co_located
// ──────────────────────────────────────────────────────────────────

describe('CoLocatedTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcast = vi.fn();
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR({ meshBroadcast: broadcast });
    ctx = makeContext(obj, { confirm_frames: 3, max_offset_m: 0.1 });
  });

  it('registers userData on apply', () => {
    CoLocatedTrait.onApply!(ctx);
    expect(ctx.object.userData.coLocated).toBe(true);
    expect(ctx.object.userData.coLocationConfirmed).toBe(false);
  });

  it('counts stable frames when peer is within maxOffset', () => {
    CoLocatedTrait.onApply!(ctx);
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.coLocationPeers =
      { peer1: { x: 0.01, y: 0, z: 0 } }; // within 0.1m

    CoLocatedTrait.onUpdate!(ctx, 0.016);
    expect(ctx.data.stableFrameCount).toBe(1);
    CoLocatedTrait.onUpdate!(ctx, 0.016);
    expect(ctx.data.stableFrameCount).toBe(2);
    CoLocatedTrait.onUpdate!(ctx, 0.016); // reaches confirmFrames=3
    expect(ctx.object.userData.coLocationConfirmed).toBe(true);
    expect(broadcast).toHaveBeenCalledWith('co_location', expect.objectContaining({
      type: 'co_location_confirmed',
    }));
  });

  it('resets stable count when peer moves out of range', () => {
    CoLocatedTrait.onApply!(ctx);
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.coLocationPeers =
      { peer1: { x: 0.05, y: 0, z: 0 } }; // within range
    CoLocatedTrait.onUpdate!(ctx, 0.016);
    expect(ctx.data.stableFrameCount).toBe(1);

    // Peer moves away
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.coLocationPeers =
      { peer1: { x: 5, y: 0, z: 0 } };
    CoLocatedTrait.onUpdate!(ctx, 0.016);
    expect(ctx.data.stableFrameCount).toBe(0);
  });

  it('clears flags on remove', () => {
    CoLocatedTrait.onApply!(ctx);
    CoLocatedTrait.onRemove!(ctx);
    expect(ctx.object.userData.coLocated).toBe(false);
    expect(ctx.object.userData.coLocationConfirmed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 9. shareplay
// ──────────────────────────────────────────────────────────────────

describe('ShareplayTrait', () => {
  let obj: THREE.Object3D;
  let ctx: TraitContext;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcast = vi.fn();
    obj = new THREE.Object3D();
    obj.parent = makeSceneWithXR({ meshBroadcast: broadcast });
    ctx = makeContext(obj);
  });

  it('creates a session_created message on apply when no session_id', () => {
    ShareplayTrait.onApply!(ctx);
    expect(broadcast).toHaveBeenCalledWith('shareplay', expect.objectContaining({
      type: 'session_created',
    }));
    expect(ctx.object.userData.sessionActive).toBe(true);
    expect(ctx.object.userData.sessionId).toBeTruthy();
  });

  it('creates a join_request message when session_id provided', () => {
    ctx = makeContext(obj, { session_id: 'existing-session-xyz' });
    ShareplayTrait.onApply!(ctx);
    expect(broadcast).toHaveBeenCalledWith('shareplay', expect.objectContaining({
      type: 'session_join_request',
      sessionId: 'existing-session-xyz',
    }));
  });

  it('generates a joinUrl from window.location.origin when available', () => {
    ctx = makeContext(obj, { deep_link: 'https://hololand.io' });
    ShareplayTrait.onApply!(ctx);
    const joinUrl = ctx.object.userData.joinUrl as string;
    expect(joinUrl).toContain('shareplay=');
    expect(joinUrl).toContain('hololand.io');
  });

  it('caps peer count to max_peers on update', () => {
    ctx = makeContext(obj, { max_peers: 2 });
    ShareplayTrait.onApply!(ctx);
    (obj.parent as THREE.Object3D & { userData: Record<string, unknown> }).userData.shareplayPeers =
      ['p1', 'p2', 'p3'];

    ShareplayTrait.onUpdate!(ctx, 0.016);
    expect(ctx.object.userData.shareplayPeerCount).toBe(2);
  });

  it('broadcasts session_ended on remove', () => {
    ShareplayTrait.onApply!(ctx);
    broadcast.mockClear();
    ShareplayTrait.onRemove!(ctx);
    expect(broadcast).toHaveBeenCalledWith('shareplay', expect.objectContaining({
      type: 'session_ended',
    }));
    expect(ctx.object.userData.sessionActive).toBe(false);
  });
});
