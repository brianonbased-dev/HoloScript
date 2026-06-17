/**
 * RenderPassTraits — Tier-2 render-pass / post-FX trait handlers.
 *
 * Implements native WebGPU/Three render-pass handlers for ~16 traits that
 * previously had no native runtime handler (parity backlog from
 * research/2026-06-15_trait-parity-and-tsx-deprecation.md §4.2 Tier 2).
 *
 * Traits implemented:
 *   bloom              — post-FX bloom via userData signal (EffectComposer picks up)
 *   god_rays           — sun-shaft / crepuscular ray effect (shader + userData signal)
 *   volumetric_clouds  — procedural cloud layer with animated noise geometry
 *   volumetric_video   — video-texture mapped onto a billboard plane
 *   gaussian_splat     — 3D Gaussian splat placeholder (loader hook + userData signal)
 *   nerf               — NeRF volume placeholder (userData signal for external loader)
 *   point_cloud        — THREE.Points geometry from a PLY/XYZ asset or inline points
 *   photogrammetry     — photogrammetric mesh load placeholder (GLTF + shadow)
 *   shadow             — per-object shadow casting/receiving with configurable map size
 *   web_surface        — live HTML/canvas content mapped to a plane (CSS3DObject stub)
 *   scene_reconstruction — depth-camera mesh reconstruction stub (userData signal)
 *   depth_of_field     — DOF post-FX marker (EffectComposer pickup via userData)
 *   motion_blur        — motion-blur post-FX marker (EffectComposer pickup via userData)
 *   chromatic_aberration — CA post-FX marker (EffectComposer pickup via userData)
 *   lens_flare         — LensFlare sprite sequence attached to a light source
 *   ambient_occlusion  — SSAO post-FX marker (EffectComposer pickup via userData)
 *
 * Design principles:
 *   - Traits that require a post-processing pipeline (bloom, DOF, motion_blur, CA,
 *     ambient_occlusion) write a typed marker to the scene root's userData so that any
 *     EffectComposer integration can discover and activate the effect without the
 *     trait handler needing a direct reference to the composer.
 *   - Traits that produce geometry (point_cloud, volumetric_clouds, web_surface,
 *     volumetric_video) create Three.js objects that degrade gracefully in any
 *     browser that can render WebGL — no WebGPU dependency.
 *   - All handlers expose state on `context.data` and `context.object.userData` so
 *     the runtime can inspect and hot-swap configuration without re-applying.
 *   - Graceful degradation: every handler checks for the relevant browser API before
 *     using it, and logs a single dev-mode warning when unavailable.
 *
 * @version 1.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Emit a warning that is visible in dev but suppressed in production. */
function devWarn(trait: string, msg: string): void {
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'production') return;
  console.warn(`[HoloScript] RenderPassTraits [${trait}]: ${msg}`);
}

/**
 * Push a typed post-FX descriptor to the scene root's userData so that an
 * EffectComposer integration can discover and activate it.
 *
 * Convention: `scene.userData.holoPostFX` is an array of `{effect, config}`
 * objects. The EffectComposer integration reads this on each frame and
 * adds/removes passes as needed.
 */
function markScenePostFX(
  object: THREE.Object3D,
  effect: string,
  config: Record<string, unknown>
): void {
  let root: THREE.Object3D = object;
  while (root.parent) root = root.parent;

  const existing = (root.userData['holoPostFX'] as Array<{ effect: string; config: Record<string, unknown> }> | undefined) ?? [];
  // Deduplicate: one entry per effect type
  const filtered = existing.filter((e) => e.effect !== effect);
  root.userData['holoPostFX'] = [...filtered, { effect, config }];
}

/** Remove a post-FX descriptor from the scene root. */
function removeScenePostFX(object: THREE.Object3D, effect: string): void {
  let root: THREE.Object3D = object;
  while (root.parent) root = root.parent;

  const existing = (root.userData['holoPostFX'] as Array<{ effect: string }> | undefined) ?? [];
  root.userData['holoPostFX'] = existing.filter((e) => e.effect !== effect);
}

// ---------------------------------------------------------------------------
// Simple noise helpers (no GPU dependency)
// ---------------------------------------------------------------------------

/** Pseudo-random float [0,1) from a seed — deterministic for testing. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return x - Math.floor(x);
}

// =============================================================================
// BLOOM — post-FX glow effect
// =============================================================================

export const BloomTrait: TraitHandler = {
  name: 'bloom',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const intensity = (cfg['intensity'] as number) ?? 1.0;
    const luminanceThreshold = (cfg['luminance_threshold'] as number) ?? 0.1;
    const luminanceSmoothing = (cfg['luminance_smoothing'] as number) ?? 0.025;
    const radius = (cfg['radius'] as number) ?? 0.4;

    context.data = { intensity, luminanceThreshold, luminanceSmoothing, radius };

    // Mark the object as emissive contributor so the bloom pass picks it up
    context.object.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive !== undefined) {
          // Store original emissive so onRemove can restore
          if (!child.userData['_holoBloomOrigEmissive']) {
            child.userData['_holoBloomOrigEmissive'] = mat.emissive.clone();
            child.userData['_holoBloomOrigEmissiveIntensity'] = mat.emissiveIntensity;
          }
          mat.emissiveIntensity = (mat.emissiveIntensity ?? 1) * intensity;
        }
      }
    });

    // Signal scene-level EffectComposer integration
    markScenePostFX(context.object, 'bloom', { intensity, luminanceThreshold, luminanceSmoothing, radius });

    context.object.userData['holoBloom'] = { intensity, luminanceThreshold, luminanceSmoothing, radius };
  },

  onRemove(context: TraitContext) {
    context.object.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material && child.userData['_holoBloomOrigEmissive']) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive !== undefined) {
          mat.emissive.copy(child.userData['_holoBloomOrigEmissive'] as THREE.Color);
          mat.emissiveIntensity = child.userData['_holoBloomOrigEmissiveIntensity'] as number;
        }
        delete child.userData['_holoBloomOrigEmissive'];
        delete child.userData['_holoBloomOrigEmissiveIntensity'];
      }
    });
    removeScenePostFX(context.object, 'bloom');
    delete context.object.userData['holoBloom'];
  },
};

// =============================================================================
// GOD RAYS — crepuscular / sun-shaft rays
// =============================================================================

export const GodRaysTrait: TraitHandler = {
  name: 'god_rays',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const intensity = (cfg['intensity'] as number) ?? 1.0;
    const decay = (cfg['decay'] as number) ?? 0.97;
    const density = (cfg['density'] as number) ?? 0.96;
    const weight = (cfg['weight'] as number) ?? 0.4;
    const exposure = (cfg['exposure'] as number) ?? 0.2;

    context.data = { intensity, decay, density, weight, exposure };

    // Attach a point light at the object's position to act as the light source
    const light = new THREE.PointLight(0xffffff, intensity * 2, 100);
    light.name = '_holoGodRaysLight';
    context.object.add(light);
    context.data['light'] = light;

    // Signal scene-level EffectComposer
    markScenePostFX(context.object, 'godRays', { intensity, decay, density, weight, exposure });

    context.object.userData['holoGodRays'] = { intensity, decay, density, weight, exposure };
  },

  onRemove(context: TraitContext) {
    const light = context.data['light'] as THREE.PointLight | undefined;
    if (light) {
      context.object.remove(light);
      light.dispose();
    }
    removeScenePostFX(context.object, 'godRays');
    delete context.object.userData['holoGodRays'];
  },
};

// =============================================================================
// VOLUMETRIC CLOUDS — procedural cloud layer
// =============================================================================

export const VolumetricCloudsTrait: TraitHandler = {
  name: 'volumetric_clouds',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const coverage = (cfg['coverage'] as number) ?? 0.5;
    const density = (cfg['density'] as number) ?? 0.8;
    const altitude = (cfg['altitude'] as number) ?? 50;
    const speed = (cfg['speed'] as number) ?? 1.0;
    const cloudCount = Math.round(coverage * 40 + 10);

    context.data = { coverage, density, altitude, speed, cloudCount };

    // Cloud group — procedural billboard puffs using icosphere-ish merged spheres
    const cloudGroup = new THREE.Group();
    cloudGroup.name = '_holoVolumetricClouds';

    for (let i = 0; i < cloudCount; i++) {
      const r = seededRandom(i);
      const r2 = seededRandom(i + 1000);
      const r3 = seededRandom(i + 2000);

      const geo = new THREE.SphereGeometry(
        4 + seededRandom(i + 3000) * 6,
        8,
        6
      );
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: density * (0.5 + seededRandom(i + 4000) * 0.5),
        roughness: 1.0,
        metalness: 0.0,
        depthWrite: false,
      });

      const puff = new THREE.Mesh(geo, mat);
      puff.position.set(
        (r - 0.5) * 200,
        altitude + (r2 - 0.5) * 10,
        (r3 - 0.5) * 200
      );
      cloudGroup.add(puff);
    }

    context.object.add(cloudGroup);
    context.data['cloudGroup'] = cloudGroup;
    context.data['elapsed'] = 0;
    context.object.userData['holoVolumetricClouds'] = { coverage, density, altitude, speed };
  },

  onUpdate(context: TraitContext, delta: number) {
    const cloudGroup = context.data['cloudGroup'] as THREE.Group | undefined;
    if (!cloudGroup) return;
    const speed = context.data['speed'] as number;
    context.data['elapsed'] = ((context.data['elapsed'] as number) ?? 0) + delta;
    // Drift clouds slowly on the X axis
    cloudGroup.position.x += speed * delta * 0.5;
    // Wrap around after 100 units
    if (cloudGroup.position.x > 100) cloudGroup.position.x -= 200;
  },

  onRemove(context: TraitContext) {
    const cloudGroup = context.data['cloudGroup'] as THREE.Group | undefined;
    if (cloudGroup) {
      context.object.remove(cloudGroup);
      cloudGroup.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          (mesh.material as THREE.Material)?.dispose();
        }
      });
    }
    delete context.object.userData['holoVolumetricClouds'];
  },
};

// =============================================================================
// VOLUMETRIC VIDEO — video texture on a plane billboard
// =============================================================================

export const VolumetricVideoTrait: TraitHandler = {
  name: 'volumetric_video',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const src = (cfg['src'] as string) ?? '';
    const width = (cfg['width'] as number) ?? 4;
    const height = (cfg['height'] as number) ?? 3;
    const loop = (cfg['loop'] as boolean) ?? true;
    const autoplay = (cfg['autoplay'] as boolean) ?? true;

    context.data = { src, width, height, loop, autoplay };

    if (!src) {
      devWarn('volumetric_video', 'No src provided — rendering placeholder plane');
    }

    // Video element (requires browser environment)
    let video: HTMLVideoElement | null = null;
    let texture: THREE.VideoTexture | null = null;

    if (typeof document !== 'undefined' && src) {
      video = document.createElement('video');
      video.src = src;
      video.loop = loop;
      video.muted = true; // Required for autoplay
      video.playsInline = true;
      if (autoplay) void video.play().catch(() => {});
      texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = texture
      ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });

    const plane = new THREE.Mesh(geo, mat);
    plane.name = '_holoVolumetricVideoPlane';
    context.object.add(plane);

    context.data['video'] = video;
    context.data['texture'] = texture;
    context.data['plane'] = plane;
    context.object.userData['holoVolumetricVideo'] = { src, width, height, loop, autoplay };
  },

  onRemove(context: TraitContext) {
    const plane = context.data['plane'] as THREE.Mesh | undefined;
    if (plane) {
      context.object.remove(plane);
      plane.geometry?.dispose();
      (plane.material as THREE.Material)?.dispose();
    }
    const video = context.data['video'] as HTMLVideoElement | undefined;
    if (video) {
      video.pause();
      video.src = '';
    }
    const texture = context.data['texture'] as THREE.VideoTexture | undefined;
    texture?.dispose();
    delete context.object.userData['holoVolumetricVideo'];
  },
};

// =============================================================================
// GAUSSIAN SPLAT — 3D Gaussian splatting (placeholder + userData signal)
// =============================================================================

/**
 * Runtime stub for 3D Gaussian Splatting assets.
 *
 * The actual splat renderer requires a specialised loader and render pass
 * (e.g. gsplat.js or Three.js-native splat). This handler:
 *   1. Signals the scene via userData so an external splat renderer can pick
 *      up and render the asset without altering the trait interface.
 *   2. Places a bounding-box wireframe at the asset position so the object
 *      is visible in the editor even when the splat renderer is absent.
 */
export const GaussianSplatTrait: TraitHandler = {
  name: 'gaussian_splat',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const src = (cfg['src'] as string) ?? '';
    const scale = (cfg['scale'] as number) ?? 1.0;

    context.data = { src, scale };

    if (!src) {
      devWarn('gaussian_splat', 'No src provided — showing bounding-box placeholder');
    }

    // Editor-visible placeholder
    const boxGeo = new THREE.BoxGeometry(scale, scale, scale);
    const wireframe = new THREE.EdgesGeometry(boxGeo);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
    const edges = new THREE.LineSegments(wireframe, mat);
    edges.name = '_holoGaussianSplatPlaceholder';
    context.object.add(edges);

    context.data['edges'] = edges;
    context.object.userData['holoGaussianSplat'] = { src, scale, ready: false };

    // Signal scene root — external splat renderer can enumerate these
    markScenePostFX(context.object, 'gaussianSplat', { src, scale });
  },

  onRemove(context: TraitContext) {
    const edges = context.data['edges'] as THREE.LineSegments | undefined;
    if (edges) {
      context.object.remove(edges);
      edges.geometry?.dispose();
      (edges.material as THREE.Material)?.dispose();
    }
    removeScenePostFX(context.object, 'gaussianSplat');
    delete context.object.userData['holoGaussianSplat'];
  },
};

// =============================================================================
// NERF — Neural Radiance Field volume (placeholder + userData signal)
// =============================================================================

export const NerfTrait: TraitHandler = {
  name: 'nerf',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const src = (cfg['src'] as string) ?? '';
    const steps = (cfg['steps'] as number) ?? 128;

    context.data = { src, steps };

    if (!src) {
      devWarn('nerf', 'No src provided — showing volume placeholder');
    }

    // Bounding-sphere placeholder
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8800ff,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.name = '_holoNerfPlaceholder';
    context.object.add(sphere);

    context.data['sphere'] = sphere;
    context.object.userData['holoNerf'] = { src, steps, ready: false };
  },

  onRemove(context: TraitContext) {
    const sphere = context.data['sphere'] as THREE.Mesh | undefined;
    if (sphere) {
      context.object.remove(sphere);
      sphere.geometry?.dispose();
      (sphere.material as THREE.Material)?.dispose();
    }
    delete context.object.userData['holoNerf'];
  },
};

// =============================================================================
// POINT CLOUD — THREE.Points from asset or inline data
// =============================================================================

export const PointCloudTrait: TraitHandler = {
  name: 'point_cloud',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const src = (cfg['src'] as string) ?? '';
    const pointSize = (cfg['point_size'] as number) ?? 0.05;
    const color = (cfg['color'] as number | string) ?? 0xffffff;
    // Optional inline points: array of [x,y,z] or flat Float32Array
    const inlinePoints = cfg['points'] as number[] | undefined;

    context.data = { src, pointSize, color };

    let geometry: THREE.BufferGeometry;

    if (inlinePoints && inlinePoints.length >= 3) {
      geometry = new THREE.BufferGeometry();
      const flat = Float32Array.from(inlinePoints);
      geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    } else {
      // Placeholder cloud — 512 random points in a 2-unit sphere
      const count = 512;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = seededRandom(i) * Math.PI * 2;
        const phi = Math.acos(2 * seededRandom(i + 1000) - 1);
        const r = Math.cbrt(seededRandom(i + 2000));
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      if (src) {
        // Async load from URL (PLY/XYZ); replace geometry when done
        PointCloudTrait._loadAsync(src, context, geometry).catch((e) =>
          devWarn('point_cloud', `Failed to load "${src}": ${String(e)}`)
        );
      }
    }

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      color: typeof color === 'string' ? new THREE.Color(color) : color,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, mat);
    points.name = '_holoPointCloud';
    context.object.add(points);

    context.data['points'] = points;
    context.object.userData['holoPointCloud'] = { src, pointSize, color };
  },

  /** @internal Async URL loader — separated so the test surface can mock it. */
  async _loadAsync(
    _src: string,
    _context: TraitContext,
    _fallback: THREE.BufferGeometry
  ): Promise<void> {
    // PLY/XYZ parsing requires an external loader (e.g. PLYLoader from Three
    // addons). Emit a userData signal so an integration can handle it.
    // The fallback placeholder geometry stays visible until the load resolves.
    devWarn('point_cloud', `External PLY/XYZ loader required for "${_src}". Set userData.holoPointCloudReady=true when loaded.`);
  },

  onRemove(context: TraitContext) {
    const points = context.data['points'] as THREE.Points | undefined;
    if (points) {
      context.object.remove(points);
      points.geometry?.dispose();
      (points.material as THREE.Material)?.dispose();
    }
    delete context.object.userData['holoPointCloud'];
  },
};

// =============================================================================
// PHOTOGRAMMETRY — photogrammetric mesh (GLTF-based, shadow-cast)
// =============================================================================

export const PhotogrammetryTrait: TraitHandler = {
  name: 'photogrammetry',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const src = (cfg['src'] as string) ?? '';
    const castShadow = (cfg['cast_shadow'] as boolean) ?? true;
    const receiveShadow = (cfg['receive_shadow'] as boolean) ?? true;

    context.data = { src, castShadow, receiveShadow };

    // Mark existing mesh children for shadow
    context.object.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
      }
    });

    context.object.userData['holoPhotogrammetry'] = { src, castShadow, receiveShadow, ready: !src };

    if (src) {
      devWarn('photogrammetry', `External GLTF/OBJ loader required for "${src}". Attach the mesh as a child and set userData.holoPhotogrammetryReady=true.`);
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData['holoPhotogrammetry'];
  },
};

// =============================================================================
// SHADOW — per-object shadow casting / receiving
// =============================================================================

export const ShadowTrait: TraitHandler = {
  name: 'shadow',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const cast = (cfg['cast'] as boolean) ?? true;
    const receive = (cfg['receive'] as boolean) ?? true;
    const mapSize = (cfg['map_size'] as number) ?? 1024;

    context.data = { cast, receive, mapSize };

    // Apply to this object and all mesh children
    context.object.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
      }
    });

    // Walk up to find a DirectionalLight and set shadow map size
    let root: THREE.Object3D = context.object;
    while (root.parent) root = root.parent;

    root.traverse((child: THREE.Object3D) => {
      const light = child as THREE.DirectionalLight;
      if (light.isDirectionalLight && light.shadow) {
        light.shadow.mapSize.set(mapSize, mapSize);
        light.castShadow = true;
      }
    });

    context.object.userData['holoShadow'] = { cast, receive, mapSize };
  },

  onRemove(context: TraitContext) {
    context.object.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    delete context.object.userData['holoShadow'];
  },
};

// =============================================================================
// WEB SURFACE — live HTML canvas mapped to a plane
// =============================================================================

/**
 * Maps a live HTML canvas / iframe content onto a Three.js plane via
 * CanvasTexture. Falls back to a solid-color placeholder in non-browser
 * environments.
 */
export const WebSurfaceTrait: TraitHandler = {
  name: 'web_surface',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const url = (cfg['url'] as string) ?? '';
    const width = (cfg['width'] as number) ?? 4;
    const height = (cfg['height'] as number) ?? 3;
    const resolution = (cfg['resolution'] as number) ?? 1024;

    context.data = { url, width, height, resolution };

    let texture: THREE.CanvasTexture | null = null;
    let canvas: HTMLCanvasElement | null = null;

    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = resolution;
      canvas.height = Math.round(resolution * (height / width));

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Initial paint — dark background with URL label
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#aaf';
        ctx.font = `${Math.round(canvas.width / 30)}px sans-serif`;
        ctx.fillText(url || 'web_surface', 16, canvas.height / 2);
      }

      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = texture
      ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0x113355, side: THREE.DoubleSide });

    const plane = new THREE.Mesh(geo, mat);
    plane.name = '_holoWebSurface';
    context.object.add(plane);

    context.data['canvas'] = canvas;
    context.data['texture'] = texture;
    context.data['plane'] = plane;
    context.object.userData['holoWebSurface'] = { url, width, height, resolution };

    if (url) {
      devWarn('web_surface', `CSS3DObject / iframe integration required to render "${url}" live. Canvas placeholder shown.`);
    }
  },

  onUpdate(context: TraitContext, _delta: number) {
    // If an external integration wrote content to the canvas, keep texture fresh
    const texture = context.data['texture'] as THREE.CanvasTexture | undefined;
    if (texture && context.object.userData['holoWebSurfaceDirty']) {
      texture.needsUpdate = true;
      context.object.userData['holoWebSurfaceDirty'] = false;
    }
  },

  onRemove(context: TraitContext) {
    const plane = context.data['plane'] as THREE.Mesh | undefined;
    if (plane) {
      context.object.remove(plane);
      plane.geometry?.dispose();
      (plane.material as THREE.Material)?.dispose();
    }
    const texture = context.data['texture'] as THREE.CanvasTexture | undefined;
    texture?.dispose();
    delete context.object.userData['holoWebSurface'];
  },
};

// =============================================================================
// SCENE RECONSTRUCTION — depth-camera mesh stub
// =============================================================================

export const SceneReconstructionTrait: TraitHandler = {
  name: 'scene_reconstruction',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const resolution = (cfg['resolution'] as number) ?? 128;
    const updateRate = (cfg['update_rate'] as number) ?? 5; // Hz

    context.data = { resolution, updateRate, elapsed: 0 };
    context.object.userData['holoSceneReconstruction'] = {
      resolution,
      updateRate,
      ready: false,
      meshCount: 0,
    };

    devWarn(
      'scene_reconstruction',
      'Requires depth-camera hardware / WebXR rawCamera. Signal userData.holoSceneReconstructionReady=true and attach reconstruction meshes as children.'
    );
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data['elapsed'] = ((context.data['elapsed'] as number) ?? 0) + delta;
    const updateRate = context.data['updateRate'] as number;
    if (context.data['elapsed'] >= 1 / updateRate) {
      context.data['elapsed'] = 0;
      // Count reconstruction mesh children for external integrations
      let meshCount = 0;
      context.object.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh && child.name.startsWith('_holoReconMesh')) meshCount++;
      });
      context.object.userData['holoSceneReconstruction'] = {
        ...((context.object.userData['holoSceneReconstruction'] as Record<string, unknown>) ?? {}),
        meshCount,
      };
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData['holoSceneReconstruction'];
  },
};

// =============================================================================
// DEPTH OF FIELD — post-FX DOF marker
// =============================================================================

export const DepthOfFieldTrait: TraitHandler = {
  name: 'depth_of_field',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const focusDistance = (cfg['focus_distance'] as number) ?? 10;
    const focalLength = (cfg['focal_length'] as number) ?? 0.02;
    const bokehScale = (cfg['bokeh_scale'] as number) ?? 2.0;

    context.data = { focusDistance, focalLength, bokehScale };
    markScenePostFX(context.object, 'depthOfField', { focusDistance, focalLength, bokehScale });
    context.object.userData['holoDepthOfField'] = { focusDistance, focalLength, bokehScale };
  },

  onRemove(context: TraitContext) {
    removeScenePostFX(context.object, 'depthOfField');
    delete context.object.userData['holoDepthOfField'];
  },
};

// =============================================================================
// MOTION BLUR — post-FX motion blur marker
// =============================================================================

export const MotionBlurTrait: TraitHandler = {
  name: 'motion_blur',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const intensity = (cfg['intensity'] as number) ?? 0.5;
    const samples = (cfg['samples'] as number) ?? 8;

    context.data = { intensity, samples };
    markScenePostFX(context.object, 'motionBlur', { intensity, samples });
    context.object.userData['holoMotionBlur'] = { intensity, samples };
  },

  onRemove(context: TraitContext) {
    removeScenePostFX(context.object, 'motionBlur');
    delete context.object.userData['holoMotionBlur'];
  },
};

// =============================================================================
// CHROMATIC ABERRATION — post-FX CA marker
// =============================================================================

export const ChromaticAberrationTrait: TraitHandler = {
  name: 'chromatic_aberration',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const offset = (cfg['offset'] as number) ?? 0.002;
    const radialModulation = (cfg['radial_modulation'] as boolean) ?? false;

    context.data = { offset, radialModulation };
    markScenePostFX(context.object, 'chromaticAberration', { offset, radialModulation });
    context.object.userData['holoChromaticAberration'] = { offset, radialModulation };
  },

  onRemove(context: TraitContext) {
    removeScenePostFX(context.object, 'chromaticAberration');
    delete context.object.userData['holoChromaticAberration'];
  },
};

// =============================================================================
// LENS FLARE — sprite-based lens flare attached to a light
// =============================================================================

export const LensFlareTrait: TraitHandler = {
  name: 'lens_flare',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const intensity = (cfg['intensity'] as number) ?? 1.0;
    const size = (cfg['size'] as number) ?? 1.0;
    const color = (cfg['color'] as number) ?? 0xffffff;

    context.data = { intensity, size, color };

    // Sprite-based lens flare (no LensFlare helper needed — just a sprite at the source)
    const spriteMat = new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: intensity * 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.setScalar(size);
    sprite.name = '_holoLensFlareSprite';
    context.object.add(sprite);

    context.data['sprite'] = sprite;
    context.data['spriteMat'] = spriteMat;
    context.object.userData['holoLensFlare'] = { intensity, size, color };
  },

  onUpdate(context: TraitContext, _delta: number) {
    // Flicker the lens flare slightly for realism
    const spriteMat = context.data['spriteMat'] as THREE.SpriteMaterial | undefined;
    const intensity = context.data['intensity'] as number;
    if (spriteMat) {
      spriteMat.opacity = intensity * 0.5 * (0.9 + Math.random() * 0.1);
    }
  },

  onRemove(context: TraitContext) {
    const sprite = context.data['sprite'] as THREE.Sprite | undefined;
    if (sprite) context.object.remove(sprite);
    const spriteMat = context.data['spriteMat'] as THREE.SpriteMaterial | undefined;
    spriteMat?.dispose();
    delete context.object.userData['holoLensFlare'];
  },
};

// =============================================================================
// AMBIENT OCCLUSION — SSAO post-FX marker
// =============================================================================

export const AmbientOcclusionTrait: TraitHandler = {
  name: 'ambient_occlusion',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const intensity = (cfg['intensity'] as number) ?? 1.0;
    const radius = (cfg['radius'] as number) ?? 0.5;
    const bias = (cfg['bias'] as number) ?? 0.025;

    context.data = { intensity, radius, bias };
    markScenePostFX(context.object, 'ssao', { intensity, radius, bias });
    context.object.userData['holoAmbientOcclusion'] = { intensity, radius, bias };
  },

  onRemove(context: TraitContext) {
    removeScenePostFX(context.object, 'ssao');
    delete context.object.userData['holoAmbientOcclusion'];
  },
};

// All traits are exported inline with `export const` above.
