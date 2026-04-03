import * as THREE from 'three';
import { hasGPU } from '../runtime-types';

// =============================================================================
// ObjectPool - Reusable pool for Three.js math objects to minimize GC pressure
// =============================================================================

export class ObjectPool {
  private vec3Pool: THREE.Vector3[] = [];
  private mat4Pool: THREE.Matrix4[] = [];
  private quatPool: THREE.Quaternion[] = [];
  private colorPool: THREE.Color[] = [];

  /**
   * Retrieve a Vector3 from the pool, or create a new one.
   * The returned vector is always reset to (0, 0, 0).
   */
  getVec3(): THREE.Vector3 {
    if (this.vec3Pool.length > 0) {
      return this.vec3Pool.pop()!.set(0, 0, 0);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  /**
   * Return a Vector3 to the pool for reuse.
   */
  releaseVec3(v: THREE.Vector3): void {
    this.vec3Pool.push(v);
  }

  /**
   * Retrieve a Matrix4 from the pool, or create a new one.
   * The returned matrix is always reset to the identity matrix.
   */
  getMat4(): THREE.Matrix4 {
    if (this.mat4Pool.length > 0) {
      return this.mat4Pool.pop()!.identity();
    }
    return new THREE.Matrix4();
  }

  /**
   * Return a Matrix4 to the pool for reuse.
   */
  releaseMat4(m: THREE.Matrix4): void {
    this.mat4Pool.push(m);
  }

  /**
   * Retrieve a Quaternion from the pool, or create a new one.
   * The returned quaternion is always reset to the identity (0, 0, 0, 1).
   */
  getQuat(): THREE.Quaternion {
    if (this.quatPool.length > 0) {
      return this.quatPool.pop()!.identity();
    }
    return new THREE.Quaternion();
  }

  /**
   * Return a Quaternion to the pool for reuse.
   */
  releaseQuat(q: THREE.Quaternion): void {
    this.quatPool.push(q);
  }

  /**
   * Retrieve a Color from the pool, or create a new one.
   * The returned color is always reset to black (0, 0, 0).
   */
  getColor(): THREE.Color {
    if (this.colorPool.length > 0) {
      return this.colorPool.pop()!.setRGB(0, 0, 0);
    }
    return new THREE.Color(0, 0, 0);
  }

  /**
   * Return a Color to the pool for reuse.
   */
  releaseColor(c: THREE.Color): void {
    this.colorPool.push(c);
  }

  /**
   * Pre-allocate the given count of each object type into the pool.
   * Useful at startup to avoid allocation spikes during the first few frames.
   */
  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.vec3Pool.push(new THREE.Vector3());
      this.mat4Pool.push(new THREE.Matrix4());
      this.quatPool.push(new THREE.Quaternion());
      this.colorPool.push(new THREE.Color());
    }
  }

  /**
   * Return current pool sizes for diagnostics.
   */
  stats(): { vec3: number; mat4: number; quat: number; color: number } {
    return {
      vec3: this.vec3Pool.length,
      mat4: this.mat4Pool.length,
      quat: this.quatPool.length,
      color: this.colorPool.length,
    };
  }
}

// =============================================================================
// TraitScheduler - Only updates traits on visible/nearby objects
// =============================================================================

export interface TraitSchedulerOptions {
  /** Maximum distance from the camera at which objects receive trait updates. Default: 50 */
  updateRadius?: number;
  /** Multiplier beyond the camera frustum within which objects are still considered visible. Default: 1.2 */
  frustumMargin?: number;
  /** Distance bands controlling update frequency. Default: [10, 25, 50] */
  lodBands?: number[];
}

export class TraitScheduler {
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private cameraWorldPos: THREE.Vector3 = new THREE.Vector3();
  private objectWorldPos: THREE.Vector3 = new THREE.Vector3();

  private updateRadius: number;
  private frustumMargin: number;
  private lodBands: number[];

  constructor(
    private camera: THREE.Camera,
    options?: TraitSchedulerOptions
  ) {
    this.updateRadius = options?.updateRadius ?? 50;
    this.frustumMargin = options?.frustumMargin ?? 1.2;
    this.lodBands = options?.lodBands ?? [10, 25, 50];
  }

  /**
   * Must be called once at the beginning of each frame to update the internal
   * frustum planes from the camera's current projection and world matrices.
   */
  beginFrame(): void {
    this.camera.updateMatrixWorld();

    // Build the combined projection-view matrix
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );

    // Derive frustum planes from the matrix
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    // Cache the camera world position for distance calculations
    this.camera.getWorldPosition(this.cameraWorldPos);
  }

  /**
   * Determine whether a given object should have its traits updated this frame.
   *
   * The decision takes three factors into account:
   *  1. Distance from the camera - objects beyond `updateRadius` never update.
   *  2. Frustum visibility    - objects outside the (optionally expanded) frustum
   *     are culled, unless they are very close to the camera.
   *  3. LOD banding           - distant objects update less frequently.
   *
   * @param object     The Three.js object to evaluate.
   * @param frameCount A monotonically increasing frame counter (0, 1, 2, ...).
   * @returns `true` if the object's traits should be updated this frame.
   */
  shouldUpdate(object: THREE.Object3D, frameCount: number): boolean {
    // Ensure we have up-to-date world position for the object
    object.getWorldPosition(this.objectWorldPos);

    // -- Distance check --
    const distance = this.cameraWorldPos.distanceTo(this.objectWorldPos);
    if (distance > this.updateRadius) {
      return false;
    }

    // -- Frustum check --
    // Objects that are very close (within the first LOD band) always pass the
    // frustum check so that held / attached objects are never culled.
    const withinInnerBand = this.lodBands.length > 0 && distance <= this.lodBands[0];
    if (!withinInnerBand) {
      if (!this.isInExpandedFrustum(object)) {
        return false;
      }
    }

    // -- LOD band frequency --
    const updateInterval = this.getUpdateInterval(distance);
    return frameCount % updateInterval === 0;
  }

  // ---- Private helpers ----

  /**
   * Check whether the object intersects the frustum expanded by `frustumMargin`.
   * We test using the object's bounding sphere when available; otherwise we
   * fall back to a simple point-in-frustum test using a small synthetic sphere.
   */
  private isInExpandedFrustum(object: THREE.Object3D): boolean {
    // Attempt to use existing geometry bounding sphere for accuracy
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }

      if (mesh.geometry.boundingSphere) {
        const sphere = mesh.geometry.boundingSphere.clone();
        sphere.applyMatrix4(object.matrixWorld);
        // Expand the sphere by the frustum margin to keep objects slightly
        // outside the visible cone still eligible for updates.
        sphere.radius *= this.frustumMargin;
        return this.frustum.intersectsSphere(sphere);
      }
    }

    // Fallback: treat the object as a point with a small margin radius
    const fallbackSphere = new THREE.Sphere(this.objectWorldPos, this.frustumMargin);
    return this.frustum.intersectsSphere(fallbackSphere);
  }

  /**
   * Determine how often (every Nth frame) an object at the given distance
   * should be updated.
   *
   * - Within lodBands[0]: every frame          (interval = 1)
   * - Within lodBands[1]: every 2nd frame      (interval = 2)
   * - Within lodBands[2]: every 4th frame      (interval = 4)
   * - Beyond all bands  : every 8th frame      (interval = 8)
   */
  private getUpdateInterval(distance: number): number {
    for (let i = 0; i < this.lodBands.length; i++) {
      if (distance <= this.lodBands[i]) {
        // Band 0 -> 1, Band 1 -> 2, Band 2 -> 4
        return Math.pow(2, i);
      }
    }
    // Beyond the last defined band
    return 8;
  }
}

// =============================================================================
// RendererManager - WebGPU / WebGL renderer with automatic fallback
// =============================================================================

export interface RendererManagerOptions {
  /** Attempt to use WebGPU if available. Default: true */
  preferWebGPU?: boolean;
  /** Enable MSAA. Default: true */
  antialias?: boolean;
  /** Cap the device pixel ratio to prevent excessive GPU load. Default: 2 */
  maxPixelRatio?: number;
}

export class RendererManager {
  private renderer!: THREE.WebGLRenderer;
  private _isWebGPU: boolean = false;
  private canvas: HTMLCanvasElement;
  private options: Required<RendererManagerOptions>;

  constructor(canvas: HTMLCanvasElement, options?: RendererManagerOptions) {
    this.canvas = canvas;
    this.options = {
      preferWebGPU: options?.preferWebGPU ?? true,
      antialias: options?.antialias ?? true,
      maxPixelRatio: options?.maxPixelRatio ?? 2,
    };
  }

  /**
   * Initialize the renderer. When `preferWebGPU` is true the manager will
   * attempt to dynamically import `three/addons/renderers/webgpu/WebGPURenderer.js`
   * and only fall back to WebGLRenderer if the import or initialisation fails.
   */
  async initialize(): Promise<void> {
    if (this.options.preferWebGPU) {
      try {
        const webgpuRenderer = await this.tryCreateWebGPURenderer();
        if (webgpuRenderer) {
          // WebGPURenderer exposes the same public API surface as
          // WebGLRenderer, so we store it in the same field.
          this.renderer = webgpuRenderer as unknown as THREE.WebGLRenderer;
          this._isWebGPU = true;
          this.applyCommonSettings();
          return;
        }
      } catch {
        // WebGPU unavailable or import failed -- fall through to WebGL
      }
    }

    // Fallback: standard WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.options.antialias,
      powerPreference: 'high-performance',
    });
    this._isWebGPU = false;
    this.applyCommonSettings();
  }

  /**
   * Retrieve the active renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Enable WebXR on the renderer for VR/AR experiences.
   */
  enableXR(): void {
    this.renderer.xr.enabled = true;
  }

  /**
   * Dispose of all GPU resources held by the renderer.
   */
  dispose(): void {
    this.renderer.dispose();
  }

  /**
   * Whether the active renderer is backed by WebGPU.
   */
  get isWebGPUActive(): boolean {
    return this._isWebGPU;
  }

  /**
   * Expose `renderer.info` for performance monitoring.
   * Contains `render` (draw-call counts, triangles, etc.) and `memory`
   * (geometry / texture counts) sub-objects.
   */
  get info(): { render: THREE.WebGLInfo['render']; memory: THREE.WebGLInfo['memory'] } {
    return {
      render: this.renderer.info.render,
      memory: this.renderer.info.memory,
    };
  }

  // ---- Private helpers ----

  /**
   * Attempt to dynamically import the Three.js WebGPU renderer addon and
   * initialise it. Returns null if WebGPU is not supported in the current
   * browser or if the import fails.
   */
  private async tryCreateWebGPURenderer(): Promise<unknown | null> {
    // Guard: the WebGPU API must be present on the navigator
    if (typeof navigator === 'undefined' || !hasGPU(navigator)) {
      return null;
    }

    // Request an adapter to confirm the browser can actually provide WebGPU
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return null;
    }

    // Dynamically import the WebGPU renderer from Three.js addons
    const { WebGPURenderer } = await import(
      /* webpackIgnore: true */
      'three/addons/renderers/webgpu/WebGPURenderer.js'
    );

    const renderer = new WebGPURenderer({
      canvas: this.canvas,
      antialias: this.options.antialias,
      powerPreference: 'high-performance',
    });

    // WebGPURenderer requires an async init step
    await renderer.init();

    return renderer;
  }

  /**
   * Apply pixel-ratio capping and other shared settings to whichever renderer
   * was selected.
   */
  private applyCommonSettings(): void {
    const pixelRatio = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      this.options.maxPixelRatio
    );
    this.renderer.setPixelRatio(pixelRatio);

    // Default clear color: black, fully opaque
    this.renderer.setClearColor(0x000000, 1);

    // Enable shadow maps by default for immersive scenes
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping suitable for HDR workflows common in XR
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }
}
