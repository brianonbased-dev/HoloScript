/**
 * HumanoidLoader Demo - TypeScript Integration Example
 *
 * Shows practical usage of the HumanoidLoader for loading
 * VRM and Ready Player Me avatars in a Three.js application.
 *
 * @version 1.0.0
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  HumanoidLoader,
  createHumanoidLoader,
  HumanoidConfig,
  HumanoidState,
  VRMExpressionName,
} from '@holoscript/core';

// ============================================================================
// SCENE SETUP
// ============================================================================

class AvatarDemo {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private loader: HumanoidLoader;
  private clock: THREE.Clock;
  private avatarMixers: Map<string, THREE.AnimationMixer> = new Map();
  private vrmInstances: Map<string, unknown> = new Map();

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 1.5, 3);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    // Lighting
    this.setupLighting();

    // Floor
    this.setupFloor();

    // Clock
    this.clock = new THREE.Clock();

    // Humanoid Loader
    this.loader = createHumanoidLoader();

    // Event listeners
    this.setupEventListeners();

    // Handle resize
    window.addEventListener('resize', () => this.onResize(container));
  }

  private setupLighting(): void {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(2, 4, 2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-2, 2, -2);
    this.scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 2, -3);
    this.scene.add(rimLight);
  }

  private setupFloor(): void {
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x333344,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x555566, 0x444455);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  private setupEventListeners(): void {
    this.loader.on('load-start', (event) => {
      console.log(`[Avatar] Loading started: ${event.avatarId}`);
    });

    this.loader.on('load-progress', (event) => {
      const data = event.data as { percent: number };
      console.log(`[Avatar] Loading ${event.avatarId}: ${data.percent.toFixed(1)}%`);
    });

    this.loader.on('load-complete', (event) => {
      console.log(`[Avatar] Loaded: ${event.avatarId}`);
      const data = event.data as { state: HumanoidState };
      console.log(`  - Bones: ${data.state.availableBones.length}`);
      console.log(`  - Expressions: ${data.state.availableExpressions.join(', ')}`);
    });

    this.loader.on('load-error', (event) => {
      console.error(`[Avatar] Error loading ${event.avatarId}:`, event.data);
    });

    this.loader.on('expression-change', (event) => {
      const data = event.data as { expression: string; weight: number };
      console.log(`[Avatar] ${event.avatarId} expression: ${data.expression} (${data.weight})`);
    });
  }

  private onResize(container: HTMLElement): void {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // ============================================================================
  // AVATAR LOADING
  // ============================================================================

  /**
   * Load a VRM avatar
   */
  async loadVRMAvatar(id: string, url: string, position?: THREE.Vector3): Promise<void> {
    await this.loader.initialize();

    const config: HumanoidConfig = {
      url,
      format: 'vrm',
      scale: 1.0,
      enableIK: true,
      enableExpressions: true,
      enableLookAt: true,
      enableSpringBones: true,
      enableMToon: true,
    };

    const result = await this.loader.loadAvatar(id, config);

    // Add to scene
    const model = result.data as THREE.Object3D;
    if (position) {
      model.position.copy(position);
    }
    this.scene.add(model);

    // Enable shadows
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Store VRM instance for updates
    if (result.vrm) {
      this.vrmInstances.set(id, result.vrm);
    }

    // Store mixer if animations present
    if (result.mixer) {
      this.avatarMixers.set(id, result.mixer as THREE.AnimationMixer);
    }

    console.log(`[VRM] Loaded avatar "${id}" with ${result.animations.length} animations`);
  }

  /**
   * Load a Ready Player Me avatar
   */
  async loadRPMAvatar(id: string, avatarIdOrUrl: string, position?: THREE.Vector3): Promise<void> {
    await this.loader.initialize();

    const config: HumanoidConfig = {
      url: avatarIdOrUrl,
      format: 'rpm',
      scale: 1.0,
      enableIK: true,
      enableExpressions: true,
      rpm: {
        quality: 'high',
        morphTargets: 'ARKit,Oculus Visemes',
        textureAtlas: 1024,
        useDraco: true,
        lod: 0,
      },
    };

    const result = await this.loader.loadAvatar(id, config);

    // Add to scene
    const model = result.data as THREE.Object3D;
    if (position) {
      model.position.copy(position);
    }
    this.scene.add(model);

    // Enable shadows
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Store mixer
    if (result.mixer) {
      this.avatarMixers.set(id, result.mixer as THREE.AnimationMixer);
    }

    console.log(`[RPM] Loaded avatar "${id}"`);
    if (result.humanoidState.rpmMetadata) {
      console.log(`  - Body type: ${result.humanoidState.rpmMetadata.bodyType}`);
    }
  }

  // ============================================================================
  // AVATAR CONTROL
  // ============================================================================

  /**
   * Set avatar expression
   */
  setExpression(avatarId: string, expression: VRMExpressionName | string, weight = 1): void {
    this.loader.setExpression(avatarId, expression, weight);

    // Apply to VRM instance
    const vrm = this.vrmInstances.get(avatarId) as any;
    if (vrm?.expressionManager) {
      vrm.expressionManager.setValue(expression, weight);
    }
  }

  /**
   * Set avatar look-at target
   */
  setLookAt(avatarId: string, target: THREE.Vector3): void {
    this.loader.setLookAt(avatarId, { x: target.x, y: target.y, z: target.z });

    // Apply to VRM instance
    const vrm = this.vrmInstances.get(avatarId) as any;
    if (vrm?.lookAt) {
      vrm.lookAt.target = target;
    }
  }

  /**
   * Play animation
   */
  playAnimation(
    avatarId: string,
    animationName: string,
    options?: {
      loop?: boolean;
      crossFade?: number;
    }
  ): void {
    const mixer = this.avatarMixers.get(avatarId);
    if (!mixer) {
      console.warn(`No mixer found for avatar: ${avatarId}`);
      return;
    }

    // This would need the animation clips from the loaded model
    // Implementation depends on how animations are stored
    console.log(`Playing animation "${animationName}" on ${avatarId}`);
  }

  /**
   * Get avatar state
   */
  getAvatarState(avatarId: string): HumanoidState | undefined {
    return this.loader.getState(avatarId);
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================

  /**
   * Start the animation loop
   */
  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();

      // Update VRM instances (spring bones, look-at, etc.)
      for (const vrm of this.vrmInstances.values()) {
        (vrm as any).update?.(delta);
      }

      // Update animation mixers
      for (const mixer of this.avatarMixers.values()) {
        mixer.update(delta);
      }

      // Update controls
      this.controls.update();

      // Render
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.loader.dispose();
    this.avatarMixers.clear();
    this.vrmInstances.clear();
    this.renderer.dispose();
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

async function main() {
  // Get container
  const container = document.getElementById('avatar-demo');
  if (!container) {
    console.error('Container not found');
    return;
  }

  // Create demo
  const demo = new AvatarDemo(container);

  // Start animation loop
  demo.start();

  // Load VRM avatar
  try {
    await demo.loadVRMAvatar(
      'character1',
      'https://example.com/avatars/sample.vrm',
      new THREE.Vector3(-1, 0, 0)
    );

    // Set initial expression
    demo.setExpression('character1', 'happy', 0.5);
  } catch (error) {
    console.error('Failed to load VRM avatar:', error);
  }

  // Load Ready Player Me avatar
  try {
    await demo.loadRPMAvatar(
      'player',
      '64f8a1b2c3d4e5f6a7b8c9d0', // RPM avatar ID
      new THREE.Vector3(1, 0, 0)
    );
  } catch (error) {
    console.error('Failed to load RPM avatar:', error);
  }

  // Example: Cycle through expressions
  const expressions: VRMExpressionName[] = ['happy', 'sad', 'angry', 'surprised', 'neutral'];
  let expressionIndex = 0;

  setInterval(() => {
    const expression = expressions[expressionIndex];
    demo.setExpression('character1', expression, 1.0);
    expressionIndex = (expressionIndex + 1) % expressions.length;
  }, 3000);

  // Example: Make avatar look at mouse
  document.addEventListener('mousemove', (event) => {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    demo.setLookAt('character1', new THREE.Vector3(x * 2, y * 2 + 1.5, 0));
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    demo.dispose();
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

export { AvatarDemo };
