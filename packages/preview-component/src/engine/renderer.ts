/**
 * Three.js scene renderer for HoloScript preview.
 *
 * Creates and manages a Three.js scene from parsed HoloScript objects.
 * Handles geometry creation, material assignment, animations, and
 * environment setup (skybox, fog, lighting).
 */

import type * as THREE_NS from 'three';
import { resolveColor, SKYBOX_GRADIENTS } from './colors';
import type {
  ParsedObject,
  ParsedEnvironment,
  AnimatedEntry,
  SceneState,
  RendererConfig,
} from './types';

// We accept THREE as a parameter to avoid bundling it
type THREE = typeof THREE_NS;

const DEFAULT_CONFIG: Required<RendererConfig> = {
  backgroundColor: 0x1a1a2e,
  shadows: true,
  antialias: true,
  maxPixelRatio: 2,
  enableDamping: true,
  fov: 60,
  cameraPosition: [8, 6, 8],
  showGrid: true,
  showAxes: true,
  gridSize: 20,
};

/**
 * The preview scene renderer.
 * Manages the full lifecycle of a Three.js scene for HoloScript preview.
 */
export class PreviewRenderer {
  private THREE: THREE;
  private config: Required<RendererConfig>;

  private renderer!: THREE_NS.WebGLRenderer;
  private scene!: THREE_NS.Scene;
  private camera!: THREE_NS.PerspectiveCamera;
  private controls: any; // OrbitControls
  private clock!: THREE_NS.Clock;

  private gridHelper!: THREE_NS.GridHelper;
  private axesHelper!: THREE_NS.AxesHelper;

  private state: SceneState = {
    objects: [],
    animatedObjects: [],
    particleSystems: [],
    wireframeMode: false,
    showGrid: true,
    showAxes: true,
  };

  private animationFrameId: number | null = null;
  private disposed = false;

  constructor(
    threeModule: THREE,
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    config: RendererConfig = {}
  ) {
    this.THREE = threeModule;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state.showGrid = this.config.showGrid;
    this.state.showAxes = this.config.showAxes;
  }

  /**
   * Initialize the Three.js scene, camera, renderer, and controls.
   * Must be called before any rendering.
   */
  init(OrbitControls?: any): void {
    const T = this.THREE;
    this.clock = new T.Clock();

    // Scene
    this.scene = new T.Scene();
    this.scene.background = new T.Color(this.config.backgroundColor);
    this.scene.fog = new T.Fog(this.config.backgroundColor, 10, 50);

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new T.PerspectiveCamera(this.config.fov, aspect, 0.1, 1000);
    const [cx, cy, cz] = this.config.cameraPosition;
    this.camera.position.set(cx, cy, cz);

    // Renderer
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.config.antialias,
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.config.maxPixelRatio));

    if (this.config.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    }

    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Controls
    if (OrbitControls) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      if (this.config.enableDamping) {
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
      }
    }

    // Grid & Axes
    this.gridHelper = new T.GridHelper(
      this.config.gridSize,
      this.config.gridSize,
      0x444444,
      0x333333
    );
    this.gridHelper.visible = this.config.showGrid;
    this.scene.add(this.gridHelper);

    this.axesHelper = new T.AxesHelper(5);
    this.axesHelper.visible = this.config.showAxes;
    this.scene.add(this.axesHelper);

    // Lighting
    this.setupLighting();

    // Ground (shadow receiver)
    const ground = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.ShadowMaterial({ opacity: 0.3 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Handle resize
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  private setupLighting(): void {
    const T = this.THREE;

    // Hemisphere light
    const hemiLight = new T.HemisphereLight(0x87ceeb, 0x3d3d5c, 0.6);
    this.scene.add(hemiLight);

    // Key light
    const keyLight = new T.DirectionalLight(0xfff5e6, 2.0);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new T.DirectionalLight(0x8ec8ff, 0.8);
    fillLight.position.set(-5, 3, -5);
    this.scene.add(fillLight);

    // Rim light
    const rimLight = new T.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 5, -10);
    this.scene.add(rimLight);
  }

  /**
   * Apply environment settings (skybox, background).
   */
  applyEnvironment(env: ParsedEnvironment): void {
    const T = this.THREE;

    if (env.skybox) {
      const gradient = SKYBOX_GRADIENTS[env.skybox];
      if (gradient) {
        const [top, mid, bottom] = gradient;
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#' + top.toString(16).padStart(6, '0'));
        grad.addColorStop(0.5, '#' + mid.toString(16).padStart(6, '0'));
        grad.addColorStop(1, '#' + bottom.toString(16).padStart(6, '0'));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 512);
        const texture = new T.CanvasTexture(canvas);
        texture.mapping = T.EquirectangularReflectionMapping;
        this.scene.background = texture;
      } else {
        this.scene.background = new T.Color(resolveColor(env.skybox));
      }
    } else if (env.background) {
      this.scene.background = new T.Color(resolveColor(env.background));
    }
  }

  /**
   * Create a Three.js geometry from a geometry type name.
   */
  private createGeometry(geoType: string): THREE_NS.BufferGeometry {
    const T = this.THREE;

    switch (geoType) {
      case 'sphere':
      case 'orb':
        return new T.SphereGeometry(0.5, 32, 32);
      case 'cylinder':
        return new T.CylinderGeometry(0.5, 0.5, 1, 32);
      case 'cone':
        return new T.ConeGeometry(0.5, 1, 32);
      case 'torus':
      case 'ring':
        return new T.TorusGeometry(0.4, 0.15, 16, 48);
      case 'plane':
        return new T.PlaneGeometry(1, 1);
      case 'torusknot':
        return new T.TorusKnotGeometry(0.3, 0.1, 100, 16);
      case 'dodecahedron':
        return new T.DodecahedronGeometry(0.5);
      case 'icosahedron':
        return new T.IcosahedronGeometry(0.5);
      case 'octahedron':
        return new T.OctahedronGeometry(0.5);
      case 'tetrahedron':
        return new T.TetrahedronGeometry(0.5);
      case 'capsule':
        return new T.CapsuleGeometry(0.3, 0.6, 8, 16);
      case 'diamond':
      case 'crystal': {
        const geo = new T.OctahedronGeometry(0.5);
        geo.scale(1, 1.5, 1);
        return geo;
      }
      case 'hexagon':
        return new T.CylinderGeometry(0.5, 0.5, 0.2, 6);
      case 'pyramid':
        return new T.ConeGeometry(0.5, 1, 4);
      case 'star':
        return new T.DodecahedronGeometry(0.4, 0);
      case 'heart': {
        const shape = new T.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0, -0.3, -0.5, -0.3, -0.5, 0);
        shape.bezierCurveTo(-0.5, 0.3, 0, 0.6, 0, 0.9);
        shape.bezierCurveTo(0, 0.6, 0.5, 0.3, 0.5, 0);
        shape.bezierCurveTo(0.5, -0.3, 0, -0.3, 0, 0);
        const geo = new T.ExtrudeGeometry(shape, {
          depth: 0.2,
          bevelEnabled: true,
          bevelThickness: 0.05,
        });
        geo.center();
        geo.rotateX(Math.PI);
        return geo;
      }
      case 'gear':
        return new T.TorusGeometry(0.4, 0.08, 8, 24);
      case 'cube':
      default:
        return new T.BoxGeometry(1, 1, 1);
    }
  }

  /**
   * Create a Three.js material from material type, color, and glow flag.
   */
  private createMaterial(matType: string, color: number, glow: boolean): THREE_NS.Material {
    const T = this.THREE;

    switch (matType) {
      case 'glass':
        return new T.MeshPhysicalMaterial({
          color,
          transparent: true,
          opacity: 0.3,
          roughness: 0,
          metalness: 0,
          transmission: 0.9,
          thickness: 0.5,
        });
      case 'hologram':
        return new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          wireframe: true,
        });
      case 'neon':
        return new T.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.5,
        });
      case 'chrome':
      case 'metal':
        return new T.MeshStandardMaterial({
          color: 0xe0e0e0,
          metalness: 1,
          roughness: 0.1,
        });
      case 'matte':
        return new T.MeshLambertMaterial({ color });
      case 'wireframe':
        return new T.MeshBasicMaterial({ color, wireframe: true });
      case 'standard':
      default:
        return new T.MeshStandardMaterial({
          color,
          metalness: 0.3,
          roughness: 0.6,
          emissive: glow ? color : 0x000000,
          emissiveIntensity: glow ? 0.3 : 0,
        });
    }
  }

  /**
   * Add a parsed object to the scene.
   */
  addObject(obj: ParsedObject): THREE_NS.Mesh {
    const T = this.THREE;

    const geometry = this.createGeometry(obj.geometry);
    const material = this.createMaterial(obj.material, obj.color, obj.glow);

    // Load texture if specified
    if (obj.texture && material instanceof T.MeshStandardMaterial) {
      const textureLoader = new T.TextureLoader();
      textureLoader.setCrossOrigin('anonymous');
      textureLoader.load(
        obj.texture,
        (texture: THREE_NS.Texture) => {
          texture.wrapS = T.RepeatWrapping;
          texture.wrapT = T.RepeatWrapping;
          if (obj.textureRepeat) {
            texture.repeat.set(obj.textureRepeat[0], obj.textureRepeat[1]);
          }
          if (obj.textureOffset) {
            texture.offset.set(obj.textureOffset[0], obj.textureOffset[1]);
          }
          (material as THREE_NS.MeshStandardMaterial).map = texture;
          (material as THREE_NS.MeshStandardMaterial).needsUpdate = true;
        },
        undefined,
        () => {
          // Silently ignore texture load failures in preview
        }
      );
    }

    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
    mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
    mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = obj.name;

    this.scene.add(mesh);
    this.state.objects.push(mesh);

    // Register animation
    if (obj.animate) {
      this.state.animatedObjects.push({
        mesh,
        type: obj.animate,
        speed: obj.animSpeed ?? 1,
        amplitude: obj.animAmplitude ?? 0.3,
        radius: obj.animRadius ?? 1,
        originalY: obj.position[1],
        originalPos: { x: obj.position[0], y: obj.position[1], z: obj.position[2] },
      });
    }

    return mesh;
  }

  /**
   * Clear all user objects from the scene (keeps lights, grid, axes).
   */
  clearObjects(): void {
    for (const obj of this.state.objects) {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: THREE_NS.Material) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    this.state.objects = [];
    this.state.animatedObjects = [];
    this.state.particleSystems = [];
  }

  /**
   * Start the animation loop.
   */
  startAnimationLoop(): void {
    if (this.disposed) return;

    const animate = () => {
      if (this.disposed) return;
      this.animationFrameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Animate objects
      for (const item of this.state.animatedObjects) {
        const { mesh, type, speed, amplitude, radius, originalY, originalPos } = item;
        const t = elapsed * speed;

        switch (type) {
          case 'spin':
            mesh.rotation.y += delta * speed * 2;
            break;
          case 'float':
            mesh.position.y = originalY + Math.sin(t * 2) * amplitude;
            break;
          case 'pulse': {
            const s = 1 + Math.sin(t * 3) * 0.15;
            mesh.scale.set(s, s, s);
            break;
          }
          case 'orbit':
            mesh.position.x = originalPos.x + Math.cos(t) * radius;
            mesh.position.z = originalPos.z + Math.sin(t) * radius;
            break;
          case 'bob':
            mesh.position.y = originalY + Math.sin(t * 4) * amplitude * 0.5;
            break;
          case 'sway':
            mesh.rotation.z = Math.sin(t * 2) * amplitude;
            break;
          case 'flicker':
            if ((mesh.material as any).emissiveIntensity !== undefined) {
              (mesh.material as any).emissiveIntensity = 0.5 + Math.random() * 0.5;
            }
            break;
          case 'rainbow':
            if ((mesh.material as any).color) {
              (mesh.material as any).color.setHSL((t * 0.1) % 1, 0.8, 0.5);
            }
            break;
        }
      }

      // Update controls
      if (this.controls) {
        this.controls.update();
      }

      // Render
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /**
   * Stop the animation loop.
   */
  stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /** Toggle wireframe mode on all objects. */
  toggleWireframe(): boolean {
    this.state.wireframeMode = !this.state.wireframeMode;
    for (const obj of this.state.objects) {
      if ((obj as any).material) {
        (obj as any).material.wireframe = this.state.wireframeMode;
      }
    }
    return this.state.wireframeMode;
  }

  /** Toggle grid visibility. */
  toggleGrid(): boolean {
    this.state.showGrid = !this.state.showGrid;
    this.gridHelper.visible = this.state.showGrid;
    return this.state.showGrid;
  }

  /** Toggle axes visibility. */
  toggleAxes(): boolean {
    this.state.showAxes = !this.state.showAxes;
    this.axesHelper.visible = this.state.showAxes;
    return this.state.showAxes;
  }

  /** Reset camera to initial position. */
  resetCamera(): void {
    const [cx, cy, cz] = this.config.cameraPosition;
    this.camera.position.set(cx, cy, cz);
    if (this.controls) {
      this.controls.reset();
    }
  }

  /** Handle window resize. */
  handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Get the count of objects in the scene. */
  getObjectCount(): number {
    return this.state.objects.length;
  }

  /**
   * Dispose all resources and stop rendering.
   */
  dispose(): void {
    this.disposed = true;
    this.stopAnimationLoop();
    window.removeEventListener('resize', this.handleResize);

    this.clearObjects();

    if (this.controls) {
      this.controls.dispose();
    }

    this.renderer.dispose();
  }
}
