/**
 * SceneInspector.ts
 *
 * Comprehensive debugging and inspection system for HoloScript scenes.
 * Provides visual debugging overlays, performance metrics, and scene exploration tools.
 *
 * Features:
 * - Scene hierarchy visualization
 * - Object property inspection
 * - Performance metrics (FPS, draw calls, memory)
 * - Visual debug overlays (bounding boxes, normals, wireframe)
 * - Camera debugging
 * - Particle system visualization
 * - Physics debug rendering
 */

import * as THREE from 'three';

export interface InspectorConfig {
  /** Show FPS counter */
  showFPS?: boolean;
  /** Show memory usage */
  showMemory?: boolean;
  /** Show draw calls */
  showDrawCalls?: boolean;
  /** Show scene hierarchy */
  showHierarchy?: boolean;
  /** Show bounding boxes */
  showBoundingBoxes?: boolean;
  /** Show wireframe overlay */
  showWireframe?: boolean;
  /** Show normals */
  showNormals?: boolean;
  /** Show camera frustum */
  showCameraFrustum?: boolean;
  /** Show coordinate axes */
  showAxes?: boolean;
  /** Show grid */
  showGrid?: boolean;
}

export interface SceneStats {
  fps: number;
  frameTime: number;
  objectCount: number;
  triangleCount: number;
  drawCalls: number;
  memory: {
    geometries: number;
    textures: number;
    total: number;
  };
  particleSystems: number;
  activeLights: number;
  cameras: number;
}

export interface ObjectInfo {
  name: string;
  type: string;
  uuid: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  visible: boolean;
  children: number;
  triangles: number;
}

/**
 * Scene Inspector for debugging and visualization
 */
export class SceneInspector {
  private config: Required<InspectorConfig>;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

  // Debug overlays
  private boundingBoxHelpers = new Map<string, THREE.Box3Helper>();
  private normalHelpers = new Map<string, THREE.VertexNormalsHelper>();
  private axesHelper: THREE.AxesHelper | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private cameraHelper: THREE.CameraHelper | null = null;

  // Performance tracking
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private frameTime = 16.67;
  private frameTimeSamples: number[] = [];

  constructor(config: InspectorConfig = {}) {
    this.config = {
      showFPS: config.showFPS ?? true,
      showMemory: config.showMemory ?? true,
      showDrawCalls: config.showDrawCalls ?? true,
      showHierarchy: config.showHierarchy ?? false,
      showBoundingBoxes: config.showBoundingBoxes ?? false,
      showWireframe: config.showWireframe ?? false,
      showNormals: config.showNormals ?? false,
      showCameraFrustum: config.showCameraFrustum ?? false,
      showAxes: config.showAxes ?? true,
      showGrid: config.showGrid ?? true,
    };
  }

  /**
   * Attach inspector to a scene
   */
  attach(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Initialize debug overlays
    this.initializeDebugOverlays();
  }

  /**
   * Detach inspector from scene
   */
  detach(): void {
    this.clearDebugOverlays();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  /**
   * Initialize debug overlay objects
   */
  private initializeDebugOverlays(): void {
    if (!this.scene) return;

    // Add axes helper
    if (this.config.showAxes) {
      this.axesHelper = new THREE.AxesHelper(100);
      this.scene.add(this.axesHelper);
    }

    // Add grid helper
    if (this.config.showGrid) {
      this.gridHelper = new THREE.GridHelper(200, 20);
      this.scene.add(this.gridHelper);
    }

    // Add camera frustum helper
    if (this.config.showCameraFrustum && this.camera) {
      if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
        this.cameraHelper = new THREE.CameraHelper(this.camera);
        this.scene.add(this.cameraHelper);
      }
    }
  }

  /**
   * Clear all debug overlays
   */
  private clearDebugOverlays(): void {
    if (!this.scene) return;

    // Remove bounding boxes
    for (const helper of this.boundingBoxHelpers.values()) {
      this.scene.remove(helper);
      helper.dispose();
    }
    this.boundingBoxHelpers.clear();

    // Remove normal helpers
    for (const helper of this.normalHelpers.values()) {
      this.scene.remove(helper);
      helper.dispose();
    }
    this.normalHelpers.clear();

    // Remove axes
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper.dispose();
      this.axesHelper = null;
    }

    // Remove grid
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
      this.gridHelper = null;
    }

    // Remove camera helper
    if (this.cameraHelper) {
      this.scene.remove(this.cameraHelper);
      this.cameraHelper.dispose();
      this.cameraHelper = null;
    }
  }

  /**
   * Update debug visualizations (call each frame)
   */
  update(): void {
    this.updatePerformanceMetrics();
    this.updateDebugOverlays();
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;

    this.frameTimeSamples.push(deltaTime);
    if (this.frameTimeSamples.length > 60) {
      this.frameTimeSamples.shift();
    }

    // Calculate average frame time
    const avgFrameTime = this.frameTimeSamples.reduce((a, b) => a + b, 0) / this.frameTimeSamples.length;
    this.frameTime = avgFrameTime;
    this.fps = 1000 / avgFrameTime;

    this.lastTime = currentTime;
    this.frameCount++;
  }

  /**
   * Update debug overlay objects
   */
  private updateDebugOverlays(): void {
    if (!this.scene) return;

    // Update bounding boxes
    if (this.config.showBoundingBoxes) {
      this.updateBoundingBoxes();
    } else {
      this.clearBoundingBoxes();
    }

    // Update normals
    if (this.config.showNormals) {
      this.updateNormals();
    } else {
      this.clearNormals();
    }

    // Update camera helper
    if (this.cameraHelper && this.config.showCameraFrustum) {
      this.cameraHelper.update();
    }
  }

  /**
   * Update bounding box helpers
   */
  private updateBoundingBoxes(): void {
    if (!this.scene) return;

    const currentUUIDs = new Set<string>();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        currentUUIDs.add(object.uuid);

        if (!this.boundingBoxHelpers.has(object.uuid)) {
          const box = new THREE.Box3().setFromObject(object);
          const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
          this.boundingBoxHelpers.set(object.uuid, helper);
          this.scene!.add(helper);
        } else {
          // Update existing helper
          const helper = this.boundingBoxHelpers.get(object.uuid)!;
          const box = new THREE.Box3().setFromObject(object);
          helper.box = box;
        }
      }
    });

    // Remove helpers for deleted objects
    for (const [uuid, helper] of this.boundingBoxHelpers) {
      if (!currentUUIDs.has(uuid)) {
        this.scene.remove(helper);
        helper.dispose();
        this.boundingBoxHelpers.delete(uuid);
      }
    }
  }

  /**
   * Clear bounding box helpers
   */
  private clearBoundingBoxes(): void {
    if (!this.scene) return;

    for (const helper of this.boundingBoxHelpers.values()) {
      this.scene.remove(helper);
      helper.dispose();
    }
    this.boundingBoxHelpers.clear();
  }

  /**
   * Update normal helpers
   */
  private updateNormals(): void {
    if (!this.scene) return;

    const currentUUIDs = new Set<string>();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        currentUUIDs.add(object.uuid);

        if (!this.normalHelpers.has(object.uuid)) {
          const helper = new THREE.VertexNormalsHelper(object, 1, 0xff0000);
          this.normalHelpers.set(object.uuid, helper);
          this.scene!.add(helper);
        } else {
          // Update existing helper
          const helper = this.normalHelpers.get(object.uuid)!;
          helper.update();
        }
      }
    });

    // Remove helpers for deleted objects
    for (const [uuid, helper] of this.normalHelpers) {
      if (!currentUUIDs.has(uuid)) {
        this.scene.remove(helper);
        helper.dispose();
        this.normalHelpers.delete(uuid);
      }
    }
  }

  /**
   * Clear normal helpers
   */
  private clearNormals(): void {
    if (!this.scene) return;

    for (const helper of this.normalHelpers.values()) {
      this.scene.remove(helper);
      helper.dispose();
    }
    this.normalHelpers.clear();
  }

  /**
   * Get comprehensive scene statistics
   */
  getStats(): SceneStats {
    if (!this.scene || !this.renderer) {
      return this.getEmptyStats();
    }

    let objectCount = 0;
    let triangleCount = 0;
    let particleSystems = 0;
    let activeLights = 0;
    let cameras = 0;

    this.scene.traverse((object) => {
      objectCount++;

      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          const geometry = object.geometry;
          const positions = geometry.attributes.position;
          if (positions) {
            triangleCount += positions.count / 3;
          }
        }
      } else if (object instanceof THREE.Points) {
        particleSystems++;
      } else if (object instanceof THREE.Light) {
        if ((object as any).intensity > 0) {
          activeLights++;
        }
      } else if (object instanceof THREE.Camera) {
        cameras++;
      }
    });

    const rendererInfo = this.renderer.info;

    return {
      fps: Math.round(this.fps),
      frameTime: Math.round(this.frameTime * 100) / 100,
      objectCount,
      triangleCount: Math.round(triangleCount),
      drawCalls: rendererInfo.render.calls,
      memory: {
        geometries: rendererInfo.memory.geometries,
        textures: rendererInfo.memory.textures,
        total: rendererInfo.memory.geometries + rendererInfo.memory.textures,
      },
      particleSystems,
      activeLights,
      cameras,
    };
  }

  /**
   * Get empty stats structure
   */
  private getEmptyStats(): SceneStats {
    return {
      fps: 0,
      frameTime: 0,
      objectCount: 0,
      triangleCount: 0,
      drawCalls: 0,
      memory: { geometries: 0, textures: 0, total: 0 },
      particleSystems: 0,
      activeLights: 0,
      cameras: 0,
    };
  }

  /**
   * Get scene hierarchy as tree structure
   */
  getSceneHierarchy(): ObjectInfo[] {
    if (!this.scene) return [];

    const hierarchy: ObjectInfo[] = [];

    this.scene.traverse((object) => {
      const info = this.getObjectInfo(object);
      hierarchy.push(info);
    });

    return hierarchy;
  }

  /**
   * Get detailed information about a specific object
   */
  getObjectInfo(object: THREE.Object3D): ObjectInfo {
    let triangles = 0;

    if (object instanceof THREE.Mesh && object.geometry) {
      const positions = object.geometry.attributes.position;
      if (positions) {
        triangles = positions.count / 3;
      }
    }

    return {
      name: object.name || 'Unnamed',
      type: object.type,
      uuid: object.uuid,
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
      children: object.children.length,
      triangles: Math.round(triangles),
    };
  }

  /**
   * Find object by UUID
   */
  findObject(uuid: string): THREE.Object3D | null {
    if (!this.scene) return null;

    let found: THREE.Object3D | null = null;

    this.scene.traverse((object) => {
      if (object.uuid === uuid) {
        found = object;
      }
    });

    return found;
  }

  /**
   * Find objects by name
   */
  findObjectsByName(name: string): THREE.Object3D[] {
    if (!this.scene) return [];

    const objects: THREE.Object3D[] = [];

    this.scene.traverse((object) => {
      if (object.name === name) {
        objects.push(object);
      }
    });

    return objects;
  }

  /**
   * Find objects by type
   */
  findObjectsByType(type: string): THREE.Object3D[] {
    if (!this.scene) return [];

    const objects: THREE.Object3D[] = [];

    this.scene.traverse((object) => {
      if (object.type === type) {
        objects.push(object);
      }
    });

    return objects;
  }

  /**
   * Toggle debug feature
   */
  toggleFeature(feature: keyof InspectorConfig, enabled?: boolean): void {
    this.config[feature] = enabled ?? !this.config[feature];

    // Update overlays based on changed feature
    if (feature === 'showAxes') {
      if (this.config.showAxes && this.scene && !this.axesHelper) {
        this.axesHelper = new THREE.AxesHelper(100);
        this.scene.add(this.axesHelper);
      } else if (!this.config.showAxes && this.axesHelper && this.scene) {
        this.scene.remove(this.axesHelper);
        this.axesHelper.dispose();
        this.axesHelper = null;
      }
    } else if (feature === 'showGrid') {
      if (this.config.showGrid && this.scene && !this.gridHelper) {
        this.gridHelper = new THREE.GridHelper(200, 20);
        this.scene.add(this.gridHelper);
      } else if (!this.config.showGrid && this.gridHelper && this.scene) {
        this.scene.remove(this.gridHelper);
        this.gridHelper.dispose();
        this.gridHelper = null;
      }
    } else if (feature === 'showBoundingBoxes') {
      if (!this.config.showBoundingBoxes) {
        this.clearBoundingBoxes();
      }
    } else if (feature === 'showNormals') {
      if (!this.config.showNormals) {
        this.clearNormals();
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<InspectorConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<InspectorConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Handle feature changes
    for (const key in config) {
      if (oldConfig[key as keyof InspectorConfig] !== this.config[key as keyof InspectorConfig]) {
        this.toggleFeature(key as keyof InspectorConfig, this.config[key as keyof InspectorConfig]);
      }
    }
  }

  /**
   * Export scene statistics as JSON
   */
  exportStats(): string {
    const stats = this.getStats();
    const hierarchy = this.getSceneHierarchy();

    return JSON.stringify(
      {
        stats,
        hierarchy,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Dispose inspector and cleanup
   */
  dispose(): void {
    this.clearDebugOverlays();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.frameTimeSamples = [];
  }
}
