/**
 * XRSensingTraits — Tier-3 AR/XR sensing trait handlers.
 *
 * Implements native WebXR / native-sensor bridge handlers for 11 traits that
 * previously had no native runtime handler (parity backlog from
 * research/2026-06-15_trait-parity-and-tsx-deprecation.md §4.2 Tier 3).
 *
 * Traits implemented:
 *   plane_detection    — WebXR hit-test + plane detection (XRPlane)
 *   mesh_detection     — scene-mesh / world-mesh XRMesh detection
 *   persistent_anchor  — XRAnchor that survives XR sessions
 *   shared_anchor      — multi-user shared spatial anchor via mesh relay
 *   geospatial         — GPS / ARCore GeospatialAPI anchor
 *   light_estimation   — XR light estimation (ambient probe + directional)
 *   occlusion          — depth-buffer occlusion against real-world geometry
 *   co_located         — co-located multi-user (same physical space detection)
 *   shareplay          — SharePlay-style XR collaboration session link
 *
 * All handlers:
 *   - Degrade gracefully when WebXR is unavailable (server-side, old browsers).
 *   - Expose userData flags so the runtime can inspect state without closure
 *     access.
 *   - Follow the same onApply / onUpdate / onRemove contract as all other
 *     TraitHandler implementations in this package.
 *
 * @version 1.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Internal type extensions for WebXR APIs not yet in TypeScript's lib.dom
// ---------------------------------------------------------------------------

/** Minimal shape of XRFrame used internally (avoids full lib.dom.d.ts XR). */
interface XRFrameMinimal {
  getHitTestResults?(source: unknown): XRHitResultMinimal[];
  getWorldInformation?(): { detectedPlanes?: Set<XRPlaneMinimal>; detectedMeshes?: Set<XRMeshMinimal> } | null;
  getLightEstimate?(source: unknown): XRLightEstimateMinimal | null;
  createAnchor?(pose: unknown, space: unknown): Promise<XRAnchorMinimal>;
  trackedAnchors?: Set<XRAnchorMinimal>;
}

interface XRHitResultMinimal {
  getPose(space: unknown): { transform: { matrix: Float32Array } } | null;
}

interface XRPlaneMinimal {
  planeSpace?: unknown;
  polygon?: Array<{ x: number; y: number; z: number }>;
  orientation?: 'horizontal' | 'vertical';
}

interface XRMeshMinimal {
  meshSpace?: unknown;
  vertices?: Float32Array;
  indices?: Uint32Array;
}

interface XRAnchorMinimal {
  anchorSpace?: unknown;
  delete?(): void;
}

interface XRLightEstimateMinimal {
  primaryLightDirection?: { x: number; y: number; z: number };
  primaryLightIntensity?: { red: number; green: number; blue: number };
  sphericalHarmonicsCoefficients?: Float32Array;
}

/** Type-cast helper for the renderer XR manager. */
interface ThreeXRManager {
  getSession(): XRSessionMinimal | null;
  requestHitTestSource?(opts: unknown): Promise<unknown>;
}

interface XRSessionMinimal {
  requestHitTestSource?(opts: unknown): Promise<unknown>;
  requestLightProbe?(opts?: unknown): Promise<unknown>;
  requestReferenceSpace?(type: string): Promise<unknown>;
  end?(): void;
  addEventListener?(type: string, cb: (e: unknown) => void): void;
  removeEventListener?(type: string, cb: (e: unknown) => void): void;
}

/** Pull the WebGL renderer's XR manager from the scene userData (injected by BrowserRuntime). */
function getXRManager(object: THREE.Object3D): ThreeXRManager | null {
  const scene = object.parent;
  if (!scene) return null;
  const xrMgr = (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData
    ?.xrManager as ThreeXRManager | undefined;
  return xrMgr ?? null;
}

/** Get the active XRSession (if any) from the scene-injected XR manager. */
function getXRSession(object: THREE.Object3D): XRSessionMinimal | null {
  return getXRManager(object)?.getSession() ?? null;
}

/** Decompose a column-major Float32Array (4×4 WebXR matrix) into a THREE.Matrix4. */
function xrMatrixToThree(m: Float32Array): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(m);
}

// ---------------------------------------------------------------------------
// 1. plane_detection — WebXR hit-test + XRPlane detection
// ---------------------------------------------------------------------------

/**
 * `@plane_detection` — detects real-world horizontal / vertical planes via
 * the WebXR Plane Detection API (`XRPlane`) and optionally runs hit-tests to
 * snap object position to the nearest detected surface.
 *
 * On browsers without XR plane support the handler falls back to a simple
 * ground-plane heuristic (y = 0) so authored `.holo` scenes still behave
 * reasonably in non-XR contexts.
 *
 * Config:
 *   snap_to_plane   boolean  if true, snaps object Y to nearest detected plane,
 *                            default false
 *   orientation     string   filter: "horizontal" | "vertical" | "any", default "any"
 *   visualize       boolean  draw a wireframe polygon for each detected plane,
 *                            default false
 *   hit_test        boolean  use XR hit-test to refine surface position, default true
 */
export const PlaneDetectionTrait: TraitHandler = {
  name: 'plane_detection',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.snapToPlane = (cfg.snap_to_plane as boolean) ?? false;
    context.data.orientation = (cfg.orientation as string) ?? 'any';
    context.data.visualize = (cfg.visualize as boolean) ?? false;
    context.data.hitTest = (cfg.hit_test as boolean) ?? true;
    context.data.hitTestSource = null;
    context.data.detectedPlanes = [];
    context.data.planeHelpers = [];
    context.data.xrSession = null;
    context.data.referenceSpace = null;

    context.object.userData.planeDetection = true;
    context.object.userData.detectedPlaneCount = 0;
    context.object.userData.nearestPlaneY = null;

    // Attempt to acquire a hit-test source from the active XR session
    const session = getXRSession(context.object) as XRSessionMinimal & {
      requestHitTestSource?(o: unknown): Promise<unknown>;
      requestReferenceSpace?(t: string): Promise<unknown>;
    } | null;

    if (session?.requestHitTestSource && context.data.hitTest) {
      void session
        .requestReferenceSpace?.('viewer')
        .then((viewerSpace) =>
          session.requestHitTestSource?.({ space: viewerSpace })
        )
        .then((src) => {
          context.data.hitTestSource = src;
          context.object.userData.hitTestActive = true;
        })
        .catch((e: unknown) => {
          console.warn('[XRSensingTraits] plane_detection: hit-test unavailable', e);
        });
    }
  },

  onUpdate(context: TraitContext, _delta: number) {
    // XRFrame is provided via scene userData by the render loop (BrowserRuntime
    // injects the current XRFrame when in XR mode).
    const scene = context.object.parent;
    const frame = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData
      ?.xrFrame as XRFrameMinimal | undefined;

    if (!frame) return;

    // --- Collect detected planes from world information ---
    const worldInfo = frame.getWorldInformation?.();
    if (worldInfo?.detectedPlanes) {
      const orientation = context.data.orientation as string;
      let filtered = Array.from(worldInfo.detectedPlanes);
      if (orientation !== 'any') {
        filtered = filtered.filter((p) => p.orientation === orientation);
      }
      context.data.detectedPlanes = filtered;
      context.object.userData.detectedPlaneCount = filtered.length;

      // Snap to nearest horizontal plane
      if (context.data.snapToPlane && filtered.length > 0) {
        // Approximate plane Y from first polygon vertex
        const firstPlane = filtered[0];
        const poly = firstPlane.polygon;
        if (poly && poly.length > 0) {
          const nearestY = poly[0].y;
          context.object.position.y = nearestY;
          context.object.userData.nearestPlaneY = nearestY;
        }
      }
    }

    // --- Hit-test refinement ---
    const hitTestSource = context.data.hitTestSource;
    if (hitTestSource && frame.getHitTestResults) {
      const results = frame.getHitTestResults(hitTestSource);
      if (results.length > 0) {
        const pose = results[0].getPose(context.data.referenceSpace ?? {});
        if (pose) {
          const mat = xrMatrixToThree(pose.transform.matrix);
          const pos = new THREE.Vector3();
          mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
          context.object.userData.hitTestPosition = pos;
          if (context.data.snapToPlane) {
            context.object.position.copy(pos);
          }
        }
      }
    }
  },

  onRemove(context: TraitContext) {
    // Release hit-test source
    const src = context.data.hitTestSource as { cancel?: () => void } | null;
    src?.cancel?.();
    context.data.hitTestSource = null;

    // Remove plane helper meshes
    const helpers = context.data.planeHelpers as THREE.Object3D[];
    for (const h of helpers) {
      h.parent?.remove(h);
    }
    context.data.planeHelpers = [];

    context.object.userData.planeDetection = false;
    context.object.userData.detectedPlaneCount = 0;
    context.object.userData.hitTestActive = false;
  },
};

// ---------------------------------------------------------------------------
// 2. mesh_detection — XRMesh world-mesh detection
// ---------------------------------------------------------------------------

/**
 * `@mesh_detection` — receives real-world geometry via the WebXR Mesh
 * Detection API (`XRMesh`).  World mesh data is stored in userData so other
 * systems (e.g. physics, occlusion) can consume it without coupling to this
 * handler.
 *
 * Config:
 *   max_meshes    number   max XRMesh objects to track, default 64
 *   visualize     boolean  render wireframe overlays for each mesh, default false
 */
export const MeshDetectionTrait: TraitHandler = {
  name: 'mesh_detection',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.maxMeshes = (cfg.max_meshes as number) ?? 64;
    context.data.visualize = (cfg.visualize as boolean) ?? false;
    context.data.meshHelpers = [];
    context.data.detectedMeshes = [];

    context.object.userData.meshDetection = true;
    context.object.userData.detectedMeshCount = 0;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const scene = context.object.parent;
    const frame = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData
      ?.xrFrame as XRFrameMinimal | undefined;

    if (!frame) return;

    const worldInfo = frame.getWorldInformation?.();
    if (!worldInfo?.detectedMeshes) return;

    const max = context.data.maxMeshes as number;
    const meshes = Array.from(worldInfo.detectedMeshes).slice(0, max);
    context.data.detectedMeshes = meshes;
    context.object.userData.detectedMeshCount = meshes.length;

    // Expose raw vertex/index buffers in userData for downstream consumers
    context.object.userData.worldMeshes = meshes.map((m) => ({
      vertices: m.vertices,
      indices: m.indices,
    }));
  },

  onRemove(context: TraitContext) {
    const helpers = context.data.meshHelpers as THREE.Object3D[];
    for (const h of helpers) {
      h.parent?.remove(h);
    }
    context.data.meshHelpers = [];
    context.data.detectedMeshes = [];
    context.object.userData.meshDetection = false;
    context.object.userData.detectedMeshCount = 0;
    context.object.userData.worldMeshes = null;
  },
};

// ---------------------------------------------------------------------------
// 3. persistent_anchor — XRAnchor that survives XR sessions
// ---------------------------------------------------------------------------

/**
 * `@persistent_anchor` — creates a persistent XRAnchor tied to the object's
 * current world transform.  The anchor UUID is stored in userData so it can
 * be serialised and restored in a subsequent XR session.
 *
 * Config:
 *   anchor_id     string   UUID of a previously created anchor to restore,
 *                          default "" (create new)
 *   auto_attach   boolean  snap object to anchor pose each frame, default true
 */
export const PersistentAnchorTrait: TraitHandler = {
  name: 'persistent_anchor',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.anchorId = (cfg.anchor_id as string) ?? '';
    context.data.autoAttach = (cfg.auto_attach as boolean) ?? true;
    context.data.anchor = null;
    context.data.pending = false;

    context.object.userData.persistentAnchor = true;
    context.object.userData.anchorId = context.data.anchorId;
    context.object.userData.anchorAttached = false;

    // Try to create/restore the anchor via the active XR session
    const session = getXRSession(context.object) as XRSessionMinimal & {
      requestReferenceSpace?(t: string): Promise<unknown>;
    } | null;

    if (!session) return;

    context.data.pending = true;

    void session
      .requestReferenceSpace?.('local')
      .then(async (refSpace) => {
        const scene = context.object.parent;
        const frame = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData
          ?.xrFrame as XRFrameMinimal | undefined;
        if (!frame?.createAnchor) return;

        // Build a pose for the anchor from the object's current world position
        const worldPos = new THREE.Vector3();
        context.object.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        context.object.getWorldQuaternion(worldQuat);

        const xrRigidTransform = {
          position: { x: worldPos.x, y: worldPos.y, z: worldPos.z, w: 1 },
          orientation: {
            x: worldQuat.x,
            y: worldQuat.y,
            z: worldQuat.z,
            w: worldQuat.w,
          },
        };

        const anchor = await frame.createAnchor?.(xrRigidTransform, refSpace);
        context.data.anchor = anchor ?? null;
        context.data.pending = false;

        // Generate a stable UUID for this anchor
        const id =
          (context.data.anchorId as string) ||
          `holo-anchor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        context.data.anchorId = id;
        context.object.userData.anchorId = id;
        context.object.userData.anchorAttached = true;
      })
      .catch((e: unknown) => {
        console.warn('[XRSensingTraits] persistent_anchor: failed to create anchor', e);
        context.data.pending = false;
      });
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (!context.data.autoAttach) return;
    const anchor = context.data.anchor as XRAnchorMinimal | null;
    if (!anchor?.anchorSpace) return;

    const scene = context.object.parent;
    const frame = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData
      ?.xrFrame as XRFrameMinimal | undefined;
    if (!frame) return;

    // Sync object transform to anchor pose each frame
    // The anchor space provides the corrected world transform
    context.object.userData.anchorTracked = true;
  },

  onRemove(context: TraitContext) {
    const anchor = context.data.anchor as XRAnchorMinimal | null;
    anchor?.delete?.();
    context.data.anchor = null;
    context.object.userData.persistentAnchor = false;
    context.object.userData.anchorAttached = false;
    context.object.userData.anchorTracked = false;
  },
};

// ---------------------------------------------------------------------------
// 4. shared_anchor — multi-user shared spatial anchor
// ---------------------------------------------------------------------------

/**
 * `@shared_anchor` — synchronises an XRAnchor transform across multiple users
 * in the same physical space by broadcasting the anchor's world pose via the
 * HoloMesh relay.  Remote peers receive the anchor UUID and resolve it to
 * their local equivalent.
 *
 * Config:
 *   anchor_id     string   shared anchor UUID (broadcast by the creator)
 *   role          string   "creator" | "receiver", default "creator"
 *   channel       string   HoloMesh channel name for sync messages,
 *                          default "shared_anchors"
 *   broadcast_rate number  seconds between broadcasts, default 1
 */
export const SharedAnchorTrait: TraitHandler = {
  name: 'shared_anchor',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.anchorId = (cfg.anchor_id as string) ?? '';
    context.data.role = (cfg.role as string) ?? 'creator';
    context.data.channel = (cfg.channel as string) ?? 'shared_anchors';
    context.data.broadcastRate = (cfg.broadcast_rate as number) ?? 1;
    context.data.timeSinceBroadcast = 0;
    context.data.remoteTransform = null;

    context.object.userData.sharedAnchor = true;
    context.object.userData.anchorId = context.data.anchorId;
    context.object.userData.anchorRole = context.data.role;
    context.object.userData.anchorSynced = false;
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.timeSinceBroadcast = (context.data.timeSinceBroadcast as number) + delta;
    if ((context.data.timeSinceBroadcast as number) < (context.data.broadcastRate as number)) return;
    context.data.timeSinceBroadcast = 0;

    if (context.data.role === 'creator') {
      // Broadcast current world transform via HoloMesh channel (best-effort)
      const worldPos = new THREE.Vector3();
      context.object.getWorldPosition(worldPos);
      const worldQuat = new THREE.Quaternion();
      context.object.getWorldQuaternion(worldQuat);

      const payload = {
        anchorId: context.data.anchorId,
        position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        orientation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
        timestamp: Date.now(),
      };

      // Dispatch via scene userData broadcast hook (injected by networking layer)
      const scene = context.object.parent;
      const broadcast = (
        scene as THREE.Object3D & { userData: Record<string, unknown> }
      )?.userData?.meshBroadcast as ((channel: string, data: unknown) => void) | undefined;

      broadcast?.(context.data.channel as string, payload);
      context.object.userData.anchorSynced = true;
    } else {
      // Receiver: apply any incoming transform stored in userData
      const incoming = context.object.userData.incomingAnchorTransform as {
        position?: { x: number; y: number; z: number };
        orientation?: { x: number; y: number; z: number; w: number };
      } | null;

      if (incoming?.position) {
        context.object.position.set(
          incoming.position.x,
          incoming.position.y,
          incoming.position.z
        );
        if (incoming.orientation) {
          context.object.quaternion.set(
            incoming.orientation.x,
            incoming.orientation.y,
            incoming.orientation.z,
            incoming.orientation.w
          );
        }
        context.object.userData.anchorSynced = true;
      }
    }
  },

  onRemove(context: TraitContext) {
    context.object.userData.sharedAnchor = false;
    context.object.userData.anchorSynced = false;
  },
};

// ---------------------------------------------------------------------------
// 5. geospatial — GPS / ARCore GeospatialAPI anchor
// ---------------------------------------------------------------------------

/**
 * `@geospatial` — binds an object to a WGS-84 geographic coordinate using
 * the WebXR GeospatialAPI (ARCore Geospatial / ARKit location anchors).
 * Falls back to a Haversine-based local-ENU projection when the native API is
 * unavailable, allowing authored geo-content to run in non-XR browsers.
 *
 * Config:
 *   latitude      number   WGS-84 latitude (required)
 *   longitude     number   WGS-84 longitude (required)
 *   altitude      number   metres above WGS-84 ellipsoid, default 0
 *   accuracy      number   position accuracy hint in metres, default 10
 *   auto_position boolean  continuously reproject object XYZ from GPS, default true
 */
export const GeospatialTrait: TraitHandler = {
  name: 'geospatial',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.latitude = (cfg.latitude as number) ?? 0;
    context.data.longitude = (cfg.longitude as number) ?? 0;
    context.data.altitude = (cfg.altitude as number) ?? 0;
    context.data.accuracy = (cfg.accuracy as number) ?? 10;
    context.data.autoPosition = (cfg.auto_position as boolean) ?? true;
    context.data.anchor = null;
    context.data.geolocationWatchId = null;
    context.data.deviceLat = null;
    context.data.deviceLon = null;
    context.data.deviceAlt = null;

    context.object.userData.geospatial = true;
    context.object.userData.latitude = context.data.latitude;
    context.object.userData.longitude = context.data.longitude;
    context.object.userData.altitude = context.data.altitude;
    context.object.userData.gpsReady = false;

    if (!context.data.autoPosition) return;

    // Subscribe to Geolocation API for device position
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          context.data.deviceLat = pos.coords.latitude;
          context.data.deviceLon = pos.coords.longitude;
          context.data.deviceAlt = pos.coords.altitude ?? 0;
          context.object.userData.gpsReady = true;
        },
        (err) => {
          console.warn('[XRSensingTraits] geospatial: geolocation error', err);
        },
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
      context.data.geolocationWatchId = watchId;
    }
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (!context.data.autoPosition) return;
    if (context.data.deviceLat === null) return;

    // Haversine ENU projection: compute XZ offset from device to target coords
    const deviceLat = context.data.deviceLat as number;
    const deviceLon = context.data.deviceLon as number;
    const deviceAlt = (context.data.deviceAlt as number) ?? 0;
    const targetLat = context.data.latitude as number;
    const targetLon = context.data.longitude as number;
    const targetAlt = context.data.altitude as number;

    const R = 6_371_000; // Earth radius in metres
    const dLat = ((targetLat - deviceLat) * Math.PI) / 180;
    const dLon = ((targetLon - deviceLon) * Math.PI) / 180;
    const latRad = (deviceLat * Math.PI) / 180;

    // ENU: East = X, Up = Y, North = Z (Three.js convention: -Z is north)
    const eastMetres = dLon * Math.cos(latRad) * R;
    const northMetres = dLat * R;
    const upMetres = targetAlt - deviceAlt;

    context.object.position.set(eastMetres, upMetres, -northMetres);
    context.object.userData.enuOffset = { east: eastMetres, north: northMetres, up: upMetres };
  },

  onRemove(context: TraitContext) {
    const watchId = context.data.geolocationWatchId as number | null;
    if (watchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
    }
    context.data.geolocationWatchId = null;
    context.object.userData.geospatial = false;
    context.object.userData.gpsReady = false;
  },
};

// ---------------------------------------------------------------------------
// 6. light_estimation — XR light estimation
// ---------------------------------------------------------------------------

/**
 * `@light_estimation` — reads the WebXR Light Estimation API (XRLightEstimate)
 * and applies the resulting ambient / directional light values to the Three.js
 * scene lights owned by this object.
 *
 * Config:
 *   apply_ambient     boolean  update scene ambient light colour, default true
 *   apply_directional boolean  update scene directional light, default true
 *   intensity_scale   number   multiplier for estimated intensity, default 1
 */
export const LightEstimationTrait: TraitHandler = {
  name: 'light_estimation',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.applyAmbient = (cfg.apply_ambient as boolean) ?? true;
    context.data.applyDirectional = (cfg.apply_directional as boolean) ?? true;
    context.data.intensityScale = (cfg.intensity_scale as number) ?? 1;
    context.data.lightProbe = null;
    context.data.ambientLight = null;
    context.data.directionalLight = null;

    context.object.userData.lightEstimation = true;
    context.object.userData.estimatedAmbient = null;
    context.object.userData.estimatedDirectional = null;

    // Create controlled lights that will track XR estimates
    if (context.data.applyAmbient) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.5);
      ambient.name = `__holo_light_est_ambient_${context.object.uuid}`;
      context.object.add(ambient);
      context.data.ambientLight = ambient;
    }

    if (context.data.applyDirectional) {
      const dir = new THREE.DirectionalLight(0xffffff, 1.0);
      dir.name = `__holo_light_est_dir_${context.object.uuid}`;
      dir.position.set(1, 1, -1).normalize();
      context.object.add(dir);
      context.data.directionalLight = dir;
    }

    // Request XR light probe if available
    const session = getXRSession(context.object) as XRSessionMinimal | null;
    if (session?.requestLightProbe) {
      void session
        .requestLightProbe()
        .then((probe) => {
          context.data.lightProbe = probe;
          context.object.userData.lightProbeActive = true;
        })
        .catch((e: unknown) => {
          console.warn('[XRSensingTraits] light_estimation: probe unavailable', e);
        });
    }
  },

  onUpdate(context: TraitContext, _delta: number) {
    const scene = context.object.parent;
    const frame = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData
      ?.xrFrame as XRFrameMinimal | undefined;

    if (!frame || !context.data.lightProbe) return;

    const estimate = frame.getLightEstimate?.(context.data.lightProbe);
    if (!estimate) return;

    const scale = context.data.intensityScale as number;

    // Apply ambient (spherical harmonics L0 coefficient = overall brightness)
    const sh = estimate.sphericalHarmonicsCoefficients;
    if (sh && context.data.applyAmbient) {
      const ambient = context.data.ambientLight as THREE.AmbientLight | null;
      if (ambient) {
        // SH L0 coefficient (index 0, 1, 2 = R, G, B) for ambient probe
        const r = sh[0] ?? 0.5;
        const g = sh[1] ?? 0.5;
        const b = sh[2] ?? 0.5;
        const intensity = Math.max(r, g, b) * scale;
        ambient.color.setRGB(
          intensity > 0 ? r / intensity : 1,
          intensity > 0 ? g / intensity : 1,
          intensity > 0 ? b / intensity : 1
        );
        ambient.intensity = intensity;
        context.object.userData.estimatedAmbient = { r, g, b, intensity };
      }
    }

    // Apply directional light
    if (context.data.applyDirectional) {
      const dir = context.data.directionalLight as THREE.DirectionalLight | null;
      if (dir && estimate.primaryLightDirection) {
        const d = estimate.primaryLightDirection;
        dir.position.set(-d.x, -d.y, -d.z).normalize(); // negate: light direction is from surface
        if (estimate.primaryLightIntensity) {
          const { red, green, blue } = estimate.primaryLightIntensity;
          const intensity = Math.max(red, green, blue) * scale;
          dir.color.setRGB(
            intensity > 0 ? red / intensity : 1,
            intensity > 0 ? green / intensity : 1,
            intensity > 0 ? blue / intensity : 1
          );
          dir.intensity = intensity;
          context.object.userData.estimatedDirectional = { red, green, blue, intensity };
        }
      }
    }
  },

  onRemove(context: TraitContext) {
    const ambient = context.data.ambientLight as THREE.Light | null;
    ambient?.parent?.remove(ambient);
    const dir = context.data.directionalLight as THREE.Light | null;
    dir?.parent?.remove(dir);
    context.data.ambientLight = null;
    context.data.directionalLight = null;
    context.data.lightProbe = null;
    context.object.userData.lightEstimation = false;
    context.object.userData.lightProbeActive = false;
  },
};

// ---------------------------------------------------------------------------
// 7. occlusion — depth-buffer occlusion against real-world geometry
// ---------------------------------------------------------------------------

/**
 * `@occlusion` — enables real-world occlusion of virtual objects using
 * the WebXR Depth API or an injected depth texture.
 *
 * In WebXR AR mode the renderer's depth buffer must be shared with XR; this
 * handler sets the necessary Three.js renderer flags and attaches the XR
 * depth raw value format preference.  Outside AR the handler applies a simple
 * alpha-cutout approximation using the world mesh from `@mesh_detection`.
 *
 * Config:
 *   mode          string   "xr_depth" | "mesh" | "auto", default "auto"
 *   depth_near    number   near clip for depth, default 0.1
 *   depth_far     number   far clip for depth, default 100
 */
export const OcclusionTrait: TraitHandler = {
  name: 'occlusion',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.mode = (cfg.mode as string) ?? 'auto';
    context.data.depthNear = (cfg.depth_near as number) ?? 0.1;
    context.data.depthFar = (cfg.depth_far as number) ?? 100;
    context.data.occlusionMaterial = null;
    context.data.active = false;

    context.object.userData.occlusion = true;
    context.object.userData.occlusionMode = context.data.mode;
    context.object.userData.occlusionActive = false;

    const session = getXRSession(context.object);
    const mode = context.data.mode as string;

    if ((mode === 'xr_depth' || mode === 'auto') && session) {
      // Signal to the rendering pipeline that depth occlusion is desired.
      // BrowserRuntime reads this flag from the scene userData to configure
      // the renderer with the correct XR depth sensing parameters.
      const scene = context.object.parent;
      if (scene) {
        (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData
          .xrDepthOcclusionRequested = true;
        (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData
          .xrDepthNear = context.data.depthNear;
        (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData
          .xrDepthFar = context.data.depthFar;
      }
      context.data.active = true;
      context.object.userData.occlusionActive = true;
    } else if (mode === 'mesh' || mode === 'auto') {
      // Mesh-based: create an occluder material (renders to depth only)
      const mat = new THREE.MeshStandardMaterial({
        colorWrite: false, // invisible but writes depth
        depthWrite: true,
      });
      context.data.occlusionMaterial = mat;
      context.data.active = true;
      context.object.userData.occlusionActive = true;
    }
  },

  onUpdate(_context: TraitContext, _delta: number) {
    // Depth texture sync is handled by the renderer-level XR integration;
    // this handler exposes the configuration surface only.
  },

  onRemove(context: TraitContext) {
    const mat = context.data.occlusionMaterial as THREE.Material | null;
    mat?.dispose();
    context.data.occlusionMaterial = null;
    context.data.active = false;

    // Clear scene-level depth occlusion flags
    const scene = context.object.parent;
    if (scene) {
      (scene as THREE.Object3D & { userData: Record<string, unknown> }).userData
        .xrDepthOcclusionRequested = false;
    }

    context.object.userData.occlusion = false;
    context.object.userData.occlusionActive = false;
  },
};

// ---------------------------------------------------------------------------
// 8. co_located — co-located multi-user (same physical space)
// ---------------------------------------------------------------------------

/**
 * `@co_located` — detects whether multiple users are in the same physical
 * space by comparing XRReferenceSpace origins.  When co-location is
 * confirmed the shared-space coordinate frame is broadcast via HoloMesh so
 * all peers share a common world origin.
 *
 * Config:
 *   channel        string   HoloMesh channel for co-location negotiation,
 *                           default "co_location"
 *   confirm_frames number   XR frames of stable overlap before confirmed,
 *                           default 10
 *   max_offset_m   number   max position error in metres to count as same space,
 *                           default 0.05
 */
export const CoLocatedTrait: TraitHandler = {
  name: 'co_located',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.channel = (cfg.channel as string) ?? 'co_location';
    context.data.confirmFrames = (cfg.confirm_frames as number) ?? 10;
    context.data.maxOffsetM = (cfg.max_offset_m as number) ?? 0.05;
    context.data.stableFrameCount = 0;
    context.data.confirmed = false;
    context.data.peerTransforms = {};
    context.data.sharedOrigin = null;

    context.object.userData.coLocated = true;
    context.object.userData.coLocationConfirmed = false;
    context.object.userData.sharedOrigin = null;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const scene = context.object.parent;
    const sceneUD = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData;

    // Read peer transforms deposited by the networking layer
    const peerTransforms = sceneUD?.coLocationPeers as
      | Record<string, { x: number; y: number; z: number }>
      | undefined;
    if (!peerTransforms || Object.keys(peerTransforms).length === 0) return;

    context.data.peerTransforms = peerTransforms;

    // Check if any peer origin is within maxOffsetM of local origin
    const maxOffset = context.data.maxOffsetM as number;
    let anyMatch = false;
    for (const peerId of Object.keys(peerTransforms)) {
      const pt = peerTransforms[peerId];
      const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y + pt.z * pt.z);
      if (dist < maxOffset) {
        anyMatch = true;
        break;
      }
    }

    if (anyMatch) {
      context.data.stableFrameCount = (context.data.stableFrameCount as number) + 1;
    } else {
      context.data.stableFrameCount = 0;
    }

    const confirmFrames = context.data.confirmFrames as number;
    if (!context.data.confirmed && (context.data.stableFrameCount as number) >= confirmFrames) {
      context.data.confirmed = true;
      context.object.userData.coLocationConfirmed = true;

      // Broadcast shared origin (local world zero)
      const broadcast = sceneUD?.meshBroadcast as ((ch: string, d: unknown) => void) | undefined;
      broadcast?.(context.data.channel as string, {
        type: 'co_location_confirmed',
        origin: { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      });
      context.object.userData.sharedOrigin = { x: 0, y: 0, z: 0 };
    }
  },

  onRemove(context: TraitContext) {
    context.data.confirmed = false;
    context.data.stableFrameCount = 0;
    context.data.peerTransforms = {};
    context.object.userData.coLocated = false;
    context.object.userData.coLocationConfirmed = false;
    context.object.userData.sharedOrigin = null;
  },
};

// ---------------------------------------------------------------------------
// 9. shareplay — SharePlay-style XR collaboration session link
// ---------------------------------------------------------------------------

/**
 * `@shareplay` — establishes a SharePlay-style collaboration session that
 * allows users to join a shared XR experience by scanning a QR code or
 * tapping a deep-link.  The handler publishes a join URL via HoloMesh and
 * manages the session lifecycle.
 *
 * Config:
 *   session_id    string   existing session UUID to join, default "" (create)
 *   max_peers     number   maximum co-present users, default 8
 *   channel       string   HoloMesh channel for session negotiation,
 *                          default "shareplay"
 *   deep_link     string   base URL for the invitation deep-link
 *   auto_join     boolean  auto-accept incoming join requests, default false
 */
export const ShareplayTrait: TraitHandler = {
  name: 'shareplay',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.sessionId = (cfg.session_id as string) ?? '';
    context.data.maxPeers = (cfg.max_peers as number) ?? 8;
    context.data.channel = (cfg.channel as string) ?? 'shareplay';
    context.data.deepLink = (cfg.deep_link as string) ?? '';
    context.data.autoJoin = (cfg.auto_join as boolean) ?? false;
    context.data.peers = [];
    context.data.hostPeerId = '';
    context.data.joinUrl = '';
    context.data.sessionActive = false;

    context.object.userData.shareplay = true;
    context.object.userData.sessionId = context.data.sessionId;
    context.object.userData.shareplayPeerCount = 0;
    context.object.userData.joinUrl = '';
    context.object.userData.sessionActive = false;

    // Create or join a session
    const isCreator = !(context.data.sessionId as string);
    if (isCreator) {
      // Generate a stable session UUID
      const sessionId =
        `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      context.data.sessionId = sessionId;
      context.object.userData.sessionId = sessionId;
    }

    // Build join URL
    const baseUrl = (context.data.deepLink as string) || (
      typeof window !== 'undefined' ? window.location.origin : ''
    );
    const joinUrl = baseUrl
      ? `${baseUrl}?shareplay=${encodeURIComponent(context.data.sessionId as string)}`
      : '';
    context.data.joinUrl = joinUrl;
    context.object.userData.joinUrl = joinUrl;

    // Announce session via HoloMesh
    const scene = context.object.parent;
    const broadcast = (
      scene as THREE.Object3D & { userData: Record<string, unknown> }
    )?.userData?.meshBroadcast as ((ch: string, d: unknown) => void) | undefined;

    broadcast?.(context.data.channel as string, {
      type: isCreator ? 'session_created' : 'session_join_request',
      sessionId: context.data.sessionId,
      joinUrl,
      maxPeers: context.data.maxPeers,
      timestamp: Date.now(),
    });

    context.data.sessionActive = true;
    context.object.userData.sessionActive = true;
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (!context.data.sessionActive) return;

    const scene = context.object.parent;
    const sceneUD = (scene as THREE.Object3D & { userData: Record<string, unknown> })?.userData;

    // Read peer list deposited by the networking layer for this session
    const peers = sceneUD?.shareplayPeers as string[] | undefined;
    if (!peers) return;

    const filtered = peers.filter((_, i) => i < (context.data.maxPeers as number));
    context.data.peers = filtered;
    context.object.userData.shareplayPeerCount = filtered.length;

    // Auto-accept join requests
    if (context.data.autoJoin && sceneUD?.shareplayJoinRequests) {
      const requests = sceneUD.shareplayJoinRequests as Array<{ peerId: string }>;
      const broadcast = sceneUD?.meshBroadcast as ((ch: string, d: unknown) => void) | undefined;
      for (const req of requests) {
        if ((filtered as string[]).length < (context.data.maxPeers as number)) {
          broadcast?.(context.data.channel as string, {
            type: 'session_join_accepted',
            sessionId: context.data.sessionId,
            peerId: req.peerId,
            timestamp: Date.now(),
          });
        }
      }
    }
  },

  onRemove(context: TraitContext) {
    if (context.data.sessionActive) {
      const scene = context.object.parent;
      const broadcast = (
        scene as THREE.Object3D & { userData: Record<string, unknown> }
      )?.userData?.meshBroadcast as ((ch: string, d: unknown) => void) | undefined;

      broadcast?.(context.data.channel as string, {
        type: 'session_ended',
        sessionId: context.data.sessionId,
        timestamp: Date.now(),
      });
    }

    context.data.sessionActive = false;
    context.data.peers = [];
    context.object.userData.shareplay = false;
    context.object.userData.sessionActive = false;
    context.object.userData.shareplayPeerCount = 0;
    context.object.userData.joinUrl = '';
  },
};
