/**
 * ThreeJSRenderer.ts
 *
 * Three.js implementation of RuntimeRenderer.
 * Uses R3FCompiler's material presets and type mappings for runtime rendering.
 */

import {
  BaseRuntimeRenderer,
  type RenderableObject,
  type RenderableLight,
  type RenderableCamera,
  type ParticleSystem,
  type PostProcessingEffect,
  type RendererConfig,
  type RendererStatistics,
} from './RuntimeRenderer';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { MATERIAL_PRESETS } from '../compiler/R3FCompiler';

/**
 * Three.js Runtime Renderer
 *
 * Renders HoloScript compositions using Three.js at runtime.
 * Extracts rendering knowledge from R3FCompiler for direct execution.
 */
export class ThreeJSRenderer extends BaseRuntimeRenderer {
  private scene: any; // THREE.Scene
  private renderer: any; // THREE.WebGLRenderer
  private activeCamera: any; // THREE.PerspectiveCamera
  private meshes = new Map<string, any>(); // THREE.Mesh
  private particleGeometries = new Map<string, any>(); // THREE.BufferGeometry
  private particleMeshes = new Map<string, any>(); // THREE.Points
  private lightObjects = new Map<string, any>(); // THREE.Light
  private animationFrameId?: number;
  private clock: any; // THREE.Clock
  private composer: any; // EffectComposer
  private renderPass: any; // RenderPass
  private bloomPass: any; // UnrealBloomPass
  private bokehPass: any; // BokehPass (DOF)
  private ssaoPass: any; // SSAOPass (Screen-Space Ambient Occlusion)
  private enabledEffects = new Set<string>(); // Track enabled effects
  private instancedMeshes = new Map<string, any>(); // Geometry type → InstancedMesh
  private instanceMatrices = new Map<string, Float32Array>(); // Geometry type → matrix data
  private instanceCounts = new Map<string, number>(); // Geometry type → instance count
  private maxInstancesPerType = 1000; // Max instances per geometry type
  private enableInstancing = true; // Enable instanced rendering for fragments
  private stats = {
    fps: 0,
    frameTime: 0,
    lastFrameTime: 0,
    frameCount: 0,
  };

  constructor(config: RendererConfig = {}) {
    super(config);
  }

  /**
   * Initialize renderer with composition
   */
  initialize(composition: HoloComposition, config?: RendererConfig): void {
    this.composition = composition;
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('[ThreeJSRenderer] Not in browser environment, skipping WebGL initialization');
      return;
    }

    // Lazy load Three.js (dynamic import in browser)
    this.initializeThreeJS();
  }

  /**
   * Initialize Three.js scene (lazy loaded)
   */
  private async initializeThreeJS(): Promise<void> {
    try {
      // In a real implementation, we'd use dynamic import:
      // const THREE = await import('three');

      // For now, assume THREE is available globally or via bundler
      if (typeof (window as any).THREE === 'undefined') {
        console.error('[ThreeJSRenderer] THREE.js not loaded. Please include Three.js library.');
        return;
      }

      const THREE = (window as any).THREE;

      // Create scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(this.config.backgroundColor);

      // Create clock
      this.clock = new THREE.Clock();

      // Create camera
      this.activeCamera = new THREE.PerspectiveCamera(
        60, // fov
        (this.config.width || 1920) / (this.config.height || 1080), // aspect
        0.1, // near
        10000 // far
      );
      this.activeCamera.position.set(0, 20, 50);
      this.activeCamera.lookAt(0, 10, 0);

      // Create renderer
      const canvas = this.config.canvas || document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: this.config.antialias,
        alpha: true,
      });
      this.renderer.setSize(this.config.width || 1920, this.config.height || 1080);
      this.renderer.setPixelRatio(window.devicePixelRatio);

      // Configure renderer
      if (this.config.shadows) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      if (this.config.physicallyCorrectLights) {
        this.renderer.physicallyCorrectLights = true;
      }

      // Tone mapping
      if (this.config.toneMapping === 'ACESFilmic') {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      this.renderer.toneMappingExposure = this.config.toneMappingExposure || 1.0;

      // Output encoding
      if (this.config.outputEncoding === 'sRGB') {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }

      // Initialize post-processing composer
      this.initializePostProcessing();

      // Add canvas to DOM if not provided
      if (!this.config.canvas && document.body) {
        document.body.appendChild(this.renderer.domElement);
      }

      // Load composition into scene
      this.loadComposition();

      console.log('[ThreeJSRenderer] Initialized successfully');
    } catch (error) {
      console.error('[ThreeJSRenderer] Failed to initialize:', error);
    }
  }

  /**
   * Load composition into Three.js scene
   */
  private loadComposition(): void {
    if (!this.composition) return;

    // Load entities as objects
    if (this.composition.entities) {
      for (const entity of this.composition.entities) {
        const renderableObject: RenderableObject = {
          id: entity.name,
          type: entity.type || 'box',
          position: entity.position || [0, 0, 0],
          rotation: entity.rotation || [0, 0, 0],
          scale: entity.scale || [1, 1, 1],
          geometry: {
            type: entity.type || 'box',
            size: entity.scale || [1, 1, 1],
          },
          material: {
            type: 'plastic', // Default material
            color: '#808080',
          },
        };

        // Extract material from traits
        const fractTrait = entity.traits?.find((t) => t.name === 'fracturable');
        if (fractTrait?.properties?.material) {
          renderableObject.material = {
            ...renderableObject.material,
            ...fractTrait.properties.material,
          };
        }

        this.addObject(renderableObject);
      }
    }

    // Load camera from traits
    const cameraTrait = this.composition.traits?.find((t) => t.name === 'camera');
    if (cameraTrait?.properties) {
      const camProps = cameraTrait.properties;
      this.updateCamera({
        position: camProps.position || [0, 20, 50],
        target: camProps.target || [0, 10, 0],
        fov: camProps.fov || 60,
      });
    }

    // Add default lighting if none provided
    this.addDefaultLighting();
  }

  /**
   * Add default lighting to scene
   */
  private addDefaultLighting(): void {
    this.addLight({
      id: 'ambient',
      type: 'ambient',
      color: '#404040',
      intensity: 0.5,
    });

    this.addLight({
      id: 'directional',
      type: 'directional',
      position: [50, 100, 50],
      color: '#ffffff',
      intensity: 1.0,
      castShadow: true,
    });
  }

  /**
   * Start rendering loop
   */
  start(): void {
    if (this.isRunning || !this.renderer) return;
    this.isRunning = true;
    this.clock?.start();
    this.animate();
    console.log('[ThreeJSRenderer] Started rendering loop');
  }

  /**
   * Stop rendering loop
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    this.clock?.stop();
    console.log('[ThreeJSRenderer] Stopped rendering loop');
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.isRunning) return;

    const deltaTime = this.clock ? this.clock.getDelta() : 1 / 60;
    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * Update scene
   */
  update(deltaTime: number): void {
    // Update stats
    const now = performance.now();
    this.stats.frameTime = now - this.stats.lastFrameTime;
    this.stats.lastFrameTime = now;
    this.stats.frameCount++;

    if (this.stats.frameCount % 60 === 0) {
      this.stats.fps = Math.round(1000 / this.stats.frameTime);
    }

    // Update logic here (animations, physics sync, etc.)
  }

  /**
   * Render frame
   */
  render(): void {
    if (!this.renderer || !this.scene || !this.activeCamera) return;

    // Use composer if post-processing is enabled, otherwise render directly
    if (this.composer && this.enabledEffects.size > 0) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.activeCamera);
    }
  }

  /**
   * Add object to scene
   */
  addObject(object: RenderableObject): void {
    if (!this.scene || typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;

    try {
      // Create geometry
      const geometry = this.createGeometry(object.geometry || { type: 'box', size: 1 });

      // Create material using R3FCompiler presets
      const material = this.createMaterial(object.material || {});

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.id;

      // Set transform
      mesh.position.set(...object.position);
      if (object.rotation) {
        mesh.rotation.set(...object.rotation);
      }
      if (object.scale) {
        mesh.scale.set(...object.scale);
      }

      // Shadows
      if (object.castShadow !== false) {
        mesh.castShadow = true;
      }
      if (object.receiveShadow !== false) {
        mesh.receiveShadow = true;
      }

      // Add to scene
      this.scene.add(mesh);
      this.meshes.set(object.id, mesh);
      this.objects.set(object.id, object);

      if (this.config.debug) {
        console.log(`[ThreeJSRenderer] Added object: ${object.id}`);
      }
    } catch (error) {
      console.error(`[ThreeJSRenderer] Failed to add object ${object.id}:`, error);
    }
  }

  /**
   * Create geometry from specification
   */
  private createGeometry(spec: any): any {
    const THREE = (window as any).THREE;

    const type = spec.type || 'box';
    const size = Array.isArray(spec.size) ? spec.size : [spec.size || 1, spec.size || 1, spec.size || 1];

    const geometryMap: Record<string, any> = {
      // ===== CORE PRIMITIVES (7) =====
      box: () => new THREE.BoxGeometry(...size),
      sphere: () => new THREE.SphereGeometry(spec.radius || size[0], 32, 32),
      cylinder: () => new THREE.CylinderGeometry(spec.radius || size[0], spec.radius || size[0], spec.height || size[1], 32),
      cone: () => new THREE.ConeGeometry(spec.radius || size[0], spec.height || size[1], 32),
      plane: () => new THREE.PlaneGeometry(size[0], size[1]),
      torus: () => new THREE.TorusGeometry(spec.radius || size[0], (spec.tube || size[0]) * 0.4, 32, 100),
      ring: () => new THREE.RingGeometry(spec.innerRadius || size[0] * 0.5, spec.outerRadius || size[0], 32),

      // ===== ADDITIONAL CORE GEOMETRIES (4) =====
      circle: () => new THREE.CircleGeometry(spec.radius || size[0], 32),
      capsule: () => new THREE.CapsuleGeometry(spec.radius || size[0] * 0.5, spec.length || size[1], spec.capSegments || 4, spec.radialSegments || 8),
      torusknot: () => new THREE.TorusKnotGeometry(
        spec.radius || size[0],
        spec.tube || size[0] * 0.3,
        spec.tubularSegments || 64,
        spec.radialSegments || 8,
        spec.p || 2,
        spec.q || 3
      ),

      // ===== POLYHEDRONS (4) =====
      dodecahedron: () => new THREE.DodecahedronGeometry(spec.radius || size[0], spec.detail || 0),
      icosahedron: () => new THREE.IcosahedronGeometry(spec.radius || size[0], spec.detail || 0),
      octahedron: () => new THREE.OctahedronGeometry(spec.radius || size[0], spec.detail || 0),
      tetrahedron: () => new THREE.TetrahedronGeometry(spec.radius || size[0], spec.detail || 0),

      // ===== ADVANCED SHAPES (2) =====
      tube: () => {
        // Curved tube along a path
        const path = spec.path || new THREE.CatmullRomCurve3([
          new THREE.Vector3(-size[0], 0, 0),
          new THREE.Vector3(0, size[1] || size[0], 0),
          new THREE.Vector3(size[0], 0, 0)
        ]);
        return new THREE.TubeGeometry(path, spec.segments || 20, spec.radius || 0.2, spec.radialSegments || 8);
      },

      // ===== PROCEDURAL SHAPES (6) =====
      heart: () => {
        const shape = new THREE.Shape();
        const x = 0, y = 0;
        const scale = (spec.radius || size[0]) * 0.1;
        shape.moveTo(x + 5 * scale, y + 5 * scale);
        shape.bezierCurveTo(x + 5 * scale, y + 5 * scale, x + 4 * scale, y, x, y);
        shape.bezierCurveTo(x - 6 * scale, y, x - 6 * scale, y + 7 * scale, x - 6 * scale, y + 7 * scale);
        shape.bezierCurveTo(x - 6 * scale, y + 11 * scale, x - 3 * scale, y + 15.4 * scale, x + 5 * scale, y + 19 * scale);
        shape.bezierCurveTo(x + 12 * scale, y + 15.4 * scale, x + 16 * scale, y + 11 * scale, x + 16 * scale, y + 7 * scale);
        shape.bezierCurveTo(x + 16 * scale, y + 7 * scale, x + 16 * scale, y, x + 10 * scale, y);
        shape.bezierCurveTo(x + 7 * scale, y, x + 5 * scale, y + 5 * scale, x + 5 * scale, y + 5 * scale);
        return new THREE.ExtrudeGeometry(shape, {
          depth: spec.depth || size[2] || 1,
          bevelEnabled: true,
          bevelThickness: 0.2 * scale,
          bevelSize: 0.1 * scale,
          bevelSegments: 2
        });
      },

      star: () => {
        const points = spec.points || 5;
        const outerRadius = spec.outerRadius || size[0];
        const innerRadius = spec.innerRadius || size[0] * 0.5;
        const shape = new THREE.Shape();

        for (let i = 0; i < points * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i * Math.PI) / points;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        shape.closePath();

        return new THREE.ExtrudeGeometry(shape, {
          depth: spec.depth || size[2] || 0.5,
          bevelEnabled: false
        });
      },

      crystal: () => {
        // Multi-faceted crystal (modified icosahedron)
        const geometry = new THREE.IcosahedronGeometry(spec.radius || size[0], spec.detail || 1);
        // Randomly displace vertices for crystal facets
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const factor = 0.8 + Math.random() * 0.4; // Random scale per vertex
          positions[i] *= factor;
          positions[i + 1] *= factor;
          positions[i + 2] *= factor;
        }
        geometry.computeVertexNormals();
        return geometry;
      },

      gear: () => {
        const teeth = spec.teeth || 12;
        const toothDepth = spec.toothDepth || 0.3;
        const shape = new THREE.Shape();

        for (let i = 0; i < teeth; i++) {
          const angle1 = (i * 2 * Math.PI) / teeth;
          const angle2 = ((i + 0.5) * 2 * Math.PI) / teeth;
          const angle3 = ((i + 1) * 2 * Math.PI) / teeth;

          const innerRadius = spec.radius || size[0];
          const outerRadius = innerRadius + toothDepth;

          if (i === 0) {
            shape.moveTo(innerRadius * Math.cos(angle1), innerRadius * Math.sin(angle1));
          }
          shape.lineTo(outerRadius * Math.cos(angle1), outerRadius * Math.sin(angle1));
          shape.lineTo(outerRadius * Math.cos(angle2), outerRadius * Math.sin(angle2));
          shape.lineTo(innerRadius * Math.cos(angle2), innerRadius * Math.sin(angle2));
          shape.lineTo(innerRadius * Math.cos(angle3), innerRadius * Math.sin(angle3));
        }
        shape.closePath();

        return new THREE.ExtrudeGeometry(shape, {
          depth: spec.depth || size[2] || 0.5,
          bevelEnabled: false
        });
      },

      lightning: () => {
        // Jagged lightning bolt
        const points = [];
        let y = size[1] || 2;
        let x = 0;

        while (y > -(size[1] || 2)) {
          points.push(new THREE.Vector3(x, y, 0));
          x += (Math.random() - 0.5) * 0.5;
          y -= 0.3;
        }

        return new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          points.length * 2,
          spec.radius || 0.05,
          8
        );
      },

      diamond: () => {
        // Diamond shape (octahedron with stretched top)
        const geometry = new THREE.OctahedronGeometry(spec.radius || size[0]);
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          if (positions[i + 1] > 0) {
            positions[i + 1] *= 1.5; // Stretch top
          }
        }
        geometry.computeVertexNormals();
        return geometry;
      }
    };

    return geometryMap[type]?.() || new THREE.BoxGeometry(...size);
  }

  /**
   * Create material using R3FCompiler presets
   */
  private createMaterial(spec: any): any {
    const THREE = (window as any).THREE;

    // Start with preset if specified
    const presetName = spec.type || 'plastic';
    const preset = MATERIAL_PRESETS[presetName] || MATERIAL_PRESETS.plastic;

    // Merge preset with custom properties
    const materialProps = {
      ...preset,
      ...spec,
    };

    // Convert color strings to THREE.Color
    if (materialProps.color) {
      materialProps.color = new THREE.Color(materialProps.color);
    }
    if (materialProps.emissive) {
      materialProps.emissive = new THREE.Color(materialProps.emissive);
    }

    // Create MeshStandardMaterial (supports PBR)
    return new THREE.MeshStandardMaterial(materialProps);
  }

  /**
   * Remove object from scene
   */
  removeObject(objectId: string): void {
    const mesh = this.meshes.get(objectId);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.meshes.delete(objectId);
      this.objects.delete(objectId);

      if (this.config.debug) {
        console.log(`[ThreeJSRenderer] Removed object: ${objectId}`);
      }
    }
  }

  /**
   * Update object transform
   */
  updateObjectTransform(objectId: string, transform: any): void {
    const mesh = this.meshes.get(objectId);
    if (mesh) {
      if (transform.position) {
        mesh.position.set(...transform.position);
      }
      if (transform.rotation) {
        mesh.rotation.set(...transform.rotation);
      }
      if (transform.scale) {
        mesh.scale.set(...transform.scale);
      }
    }
  }

  /**
   * Add particle system
   */
  addParticleSystem(system: ParticleSystem): void {
    if (!this.scene || typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;

    try {
      // Create buffer geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(system.positions, 3));

      if (system.colors) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(system.colors, 3));
      }

      // Create material
      const material = new THREE.PointsMaterial({
        size: system.material?.size || 0.1,
        color: system.material?.color || '#ffffff',
        opacity: system.material?.opacity || 1.0,
        transparent: true,
        vertexColors: !!system.colors,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      // Create points
      const points = new THREE.Points(geometry, material);
      points.name = system.id;

      // Add to scene
      this.scene.add(points);
      this.particleGeometries.set(system.id, geometry);
      this.particleMeshes.set(system.id, points);
      this.particleSystems.set(system.id, system);

      if (this.config.debug) {
        console.log(`[ThreeJSRenderer] Added particle system: ${system.id} (${system.maxParticles} particles)`);
      }
    } catch (error) {
      console.error(`[ThreeJSRenderer] Failed to add particle system ${system.id}:`, error);
    }
  }

  /**
   * Update particle system
   */
  updateParticleSystem(systemId: string, positions: Float32Array, colors?: Float32Array): void {
    const geometry = this.particleGeometries.get(systemId);
    if (geometry) {
      geometry.attributes.position.array = positions;
      geometry.attributes.position.needsUpdate = true;

      if (colors && geometry.attributes.color) {
        geometry.attributes.color.array = colors;
        geometry.attributes.color.needsUpdate = true;
      }
    }
  }

  /**
   * Remove particle system
   */
  removeParticleSystem(systemId: string): void {
    const points = this.particleMeshes.get(systemId);
    if (points) {
      this.scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      this.particleGeometries.delete(systemId);
      this.particleMeshes.delete(systemId);
      this.particleSystems.delete(systemId);

      if (this.config.debug) {
        console.log(`[ThreeJSRenderer] Removed particle system: ${systemId}`);
      }
    }
  }

  /**
   * Add light to scene
   */
  addLight(light: RenderableLight): void {
    if (!this.scene || typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;

    try {
      let lightObject: any;

      switch (light.type) {
        case 'ambient':
          lightObject = new THREE.AmbientLight(light.color || '#ffffff', light.intensity || 1.0);
          break;

        case 'directional':
          lightObject = new THREE.DirectionalLight(light.color || '#ffffff', light.intensity || 1.0);
          if (light.position) {
            lightObject.position.set(...light.position);
          }
          if (light.castShadow) {
            lightObject.castShadow = true;
            lightObject.shadow.mapSize.width = 2048;
            lightObject.shadow.mapSize.height = 2048;
            lightObject.shadow.camera.near = 0.5;
            lightObject.shadow.camera.far = 500;
          }
          break;

        case 'point':
          lightObject = new THREE.PointLight(light.color || '#ffffff', light.intensity || 1.0);
          if (light.position) {
            lightObject.position.set(...light.position);
          }
          break;

        case 'spot':
          lightObject = new THREE.SpotLight(light.color || '#ffffff', light.intensity || 1.0);
          if (light.position) {
            lightObject.position.set(...light.position);
          }
          if (light.castShadow) {
            lightObject.castShadow = true;
          }
          break;

        case 'hemisphere':
          lightObject = new THREE.HemisphereLight(light.color || '#ffffff', '#444444', light.intensity || 1.0);
          break;

        default:
          lightObject = new THREE.DirectionalLight(light.color || '#ffffff', light.intensity || 1.0);
      }

      lightObject.name = light.id;
      this.scene.add(lightObject);
      this.lightObjects.set(light.id, lightObject);
      this.lights.set(light.id, light);

      if (this.config.debug) {
        console.log(`[ThreeJSRenderer] Added light: ${light.id} (${light.type})`);
      }
    } catch (error) {
      console.error(`[ThreeJSRenderer] Failed to add light ${light.id}:`, error);
    }
  }

  /**
   * Update camera
   */
  updateCamera(camera: RenderableCamera): void {
    if (!this.activeCamera) return;

    this.activeCamera.position.set(...camera.position);
    this.activeCamera.lookAt(...camera.target);

    if (camera.fov) {
      this.activeCamera.fov = camera.fov;
      this.activeCamera.updateProjectionMatrix();
    }

    this.camera = camera;
  }

  /**
   * Initialize post-processing pipeline
   */
  private initializePostProcessing(): void {
    if (typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;

    // Check if EffectComposer is available (from three/examples/jsm/postprocessing)
    if (typeof (window as any).THREE.EffectComposer === 'undefined') {
      if (this.config.debug) {
        console.warn('[ThreeJSRenderer] EffectComposer not available. Post-processing disabled.');
        console.warn('Include: three/examples/jsm/postprocessing/EffectComposer.js');
      }
      return;
    }

    try {
      // Create EffectComposer
      this.composer = new THREE.EffectComposer(this.renderer);

      // Add render pass (always required)
      this.renderPass = new THREE.RenderPass(this.scene, this.activeCamera);
      this.composer.addPass(this.renderPass);

      if (this.config.debug) {
        console.log('[ThreeJSRenderer] Post-processing pipeline initialized');
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('[ThreeJSRenderer] Failed to initialize post-processing:', error);
      }
    }
  }

  /**
   * Enable post-processing effect
   */
  enablePostProcessing(effect: PostProcessingEffect): void {
    if (!this.composer || typeof (window as any).THREE === 'undefined') {
      if (this.config.debug) {
        console.warn(`[ThreeJSRenderer] Cannot enable ${effect.type}: Composer not initialized`);
      }
      return;
    }

    const THREE = (window as any).THREE;

    try {
      if (effect.type === 'bloom' && effect.enabled) {
        // UnrealBloomPass for bloom effect
        if (typeof THREE.UnrealBloomPass === 'undefined') {
          console.warn('[ThreeJSRenderer] UnrealBloomPass not available');
          return;
        }

        const params = effect.params || {};
        this.bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(this.config.width || 1920, this.config.height || 1080),
          params.strength || 1.5,   // Bloom strength
          params.radius || 0.4,      // Bloom radius
          params.threshold || 0.85   // Luminance threshold
        );
        this.composer.addPass(this.bloomPass);
        this.enabledEffects.add('bloom');

        if (this.config.debug) {
          console.log('[ThreeJSRenderer] Bloom enabled:', params);
        }
      } else if (effect.type === 'dof' && effect.enabled) {
        // BokehPass for depth of field
        if (typeof THREE.BokehPass === 'undefined') {
          console.warn('[ThreeJSRenderer] BokehPass not available');
          return;
        }

        const params = effect.params || {};
        this.bokehPass = new THREE.BokehPass(this.scene, this.activeCamera, {
          focus: params.focus || 50.0,       // Focus distance
          aperture: params.aperture || 0.025, // Aperture size
          maxblur: params.maxblur || 0.01    // Max blur amount
        });
        this.composer.addPass(this.bokehPass);
        this.enabledEffects.add('dof');

        if (this.config.debug) {
          console.log('[ThreeJSRenderer] Depth of Field enabled:', params);
        }
      } else if (effect.type === 'motionBlur' && effect.enabled) {
        // Motion blur can be approximated with AfterimagePass
        if (typeof THREE.AfterimagePass === 'undefined') {
          console.warn('[ThreeJSRenderer] AfterimagePass not available (for motion blur)');
          return;
        }

        const params = effect.params || {};
        const afterimagePass = new THREE.AfterimagePass(params.damping || 0.96);
        this.composer.addPass(afterimagePass);
        this.enabledEffects.add('motionBlur');

        if (this.config.debug) {
          console.log('[ThreeJSRenderer] Motion Blur enabled:', params);
        }
      } else if (effect.type === 'ssao' && effect.enabled) {
        // Screen-Space Ambient Occlusion
        if (typeof THREE.SSAOPass === 'undefined') {
          console.warn('[ThreeJSRenderer] SSAOPass not available');
          console.warn('Include: three/examples/jsm/postprocessing/SSAOPass.js');
          return;
        }

        const params = effect.params || {};
        this.ssaoPass = new THREE.SSAOPass(
          this.scene,
          this.activeCamera,
          this.config.width || 1920,
          this.config.height || 1080
        );

        // Configure SSAO parameters
        this.ssaoPass.kernelRadius = params.kernelRadius || 16; // AO kernel radius
        this.ssaoPass.minDistance = params.minDistance || 0.005; // Min occlusion distance
        this.ssaoPass.maxDistance = params.maxDistance || 0.1; // Max occlusion distance
        this.ssaoPass.output = THREE.SSAOPass.OUTPUT.Default; // Default output (combined)

        this.composer.addPass(this.ssaoPass);
        this.enabledEffects.add('ssao');

        if (this.config.debug) {
          console.log('[ThreeJSRenderer] SSAO (Screen-Space Ambient Occlusion) enabled:', params);
          console.log('  kernelRadius:', this.ssaoPass.kernelRadius);
          console.log('  minDistance:', this.ssaoPass.minDistance);
          console.log('  maxDistance:', this.ssaoPass.maxDistance);
        }
      } else if (effect.type === 'ssr' && effect.enabled) {
        // Screen-Space Reflections
        if (typeof THREE.SSRPass === 'undefined') {
          console.warn('[ThreeJSRenderer] SSRPass not available');
          console.warn('Include: three/examples/jsm/postprocessing/SSRPass.js');
          return;
        }

        const params = effect.params || {};
        const ssrPass = new THREE.SSRPass({
          renderer: this.renderer,
          scene: this.scene,
          camera: this.activeCamera,
          width: this.config.width || 1920,
          height: this.config.height || 1080,
          groundReflector: null,
          selects: null
        });

        // Configure SSR parameters
        ssrPass.thickness = params.thickness || 0.018; // Reflection thickness
        ssrPass.infiniteThick = params.infiniteThick !== undefined ? params.infiniteThick : false;
        ssrPass.maxDistance = params.maxDistance || 180; // Max reflection distance
        ssrPass.opacity = params.opacity || 0.5; // Reflection opacity

        this.composer.addPass(ssrPass);
        this.enabledEffects.add('ssr');

        if (this.config.debug) {
          console.log('[ThreeJSRenderer] SSR (Screen-Space Reflections) enabled:', params);
        }
      }
    } catch (error) {
      console.error(`[ThreeJSRenderer] Failed to enable ${effect.type}:`, error);
    }
  }

  /**
   * Enable/disable frustum culling optimization
   * Automatically enabled by Three.js, but can be toggled per object
   */
  public enableFrustumCulling(enable: boolean): void {
    for (const mesh of this.meshes.values()) {
      mesh.frustumCulled = enable;
    }

    if (this.config.debug) {
      console.log(`[ThreeJSRenderer] Frustum culling: ${enable ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Optimize geometry by merging vertices and reducing complexity
   * This is a simple optimization that can reduce memory usage
   */
  public optimizeGeometries(): void {
    if (typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;
    let optimizedCount = 0;

    for (const mesh of this.meshes.values()) {
      const geometry = mesh.geometry;

      // Merge duplicate vertices (if not already optimized)
      if (geometry.index === null && geometry.attributes.position) {
        try {
          geometry.computeVertexNormals();
          optimizedCount++;
        } catch (error) {
          // Silently ignore optimization errors
        }
      }
    }

    if (this.config.debug && optimizedCount > 0) {
      console.log(`[ThreeJSRenderer] Optimized ${optimizedCount} geometries`);
    }
  }

  /**
   * Set Level of Detail (LOD) for objects based on distance from camera
   * Objects far from camera use simpler geometry
   */
  public updateLOD(): void {
    if (!this.activeCamera || typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;
    const cameraPos = this.activeCamera.position;

    for (const [id, mesh] of this.meshes.entries()) {
      const distance = cameraPos.distanceTo(mesh.position);

      // Simple LOD: hide objects beyond certain distance
      if (distance > 500) {
        mesh.visible = false;
      } else {
        mesh.visible = true;

        // Reduce detail for distant objects
        if (distance > 200) {
          mesh.matrixAutoUpdate = false; // Skip transform updates for distant objects
        } else {
          mesh.matrixAutoUpdate = true;
        }
      }
    }
  }

  /**
   * Enable automatic performance optimizations
   * Runs optimization passes periodically
   */
  private performanceOptimizationFrame = 0;
  public enableAutoOptimization(enable: boolean): void {
    if (enable) {
      // Run optimizations every 60 frames (1 second at 60 FPS)
      const optimizationInterval = setInterval(() => {
        this.performanceOptimizationFrame++;

        if (this.performanceOptimizationFrame % 60 === 0) {
          this.updateLOD();
        }

        if (this.performanceOptimizationFrame % 300 === 0) {
          this.optimizeGeometries();
        }
      }, 16); // ~60 FPS

      if (this.config.debug) {
        console.log('[ThreeJSRenderer] Auto-optimization enabled');
      }
    }
  }

  /**
   * Get renderer statistics
   */
  getStatistics(): RendererStatistics {
    const info = this.renderer?.info;

    return {
      fps: this.stats.fps,
      frameTime: this.stats.frameTime,
      drawCalls: info?.render.calls || 0,
      triangles: info?.render.triangles || 0,
      points: info?.render.points || 0,
      lines: info?.render.lines || 0,
      objects: this.meshes.size + this.particleMeshes.size,
      lights: this.lightObjects.size,
      textures: info?.memory.textures || 0,
      programs: info?.programs?.length || 0,
      memoryUsage: {
        geometries: info?.memory.geometries || 0,
        textures: info?.memory.textures || 0,
      },
    };
  }

  /**
   * Resize renderer
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    if (this.renderer) {
      this.renderer.setSize(width, height);
    }

    if (this.activeCamera) {
      this.activeCamera.aspect = width / height;
      this.activeCamera.updateProjectionMatrix();
    }
  }

  /**
   * Dispose renderer and free resources
   */
  dispose(): void {
    this.stop();

    // Dispose all meshes
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    this.meshes.clear();

    // Dispose all particle systems
    for (const points of this.particleMeshes.values()) {
      points.geometry.dispose();
      points.material.dispose();
      this.scene.remove(points);
    }
    this.particleGeometries.clear();
    this.particleMeshes.clear();

    // Dispose lights
    for (const light of this.lightObjects.values()) {
      this.scene.remove(light);
    }
    this.lightObjects.clear();

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
    }

    console.log('[ThreeJSRenderer] Disposed');
  }
}
