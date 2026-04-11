/**
 * DemolitionDemoScene.ts
 *
 * Interactive demolition demo scene integrating all systems:
 * - Fracture physics with shock waves
 * - Structural integrity and building collapse
 * - Debris particle effects with camera shake
 * - User controls and multiple demo scenarios
 *
 * Week 8: Explosive Demolition - Day 6
 */

import { DemolitionPhysics, type DemolitionPhysicsConfig } from './DemolitionPhysics';
import { StructuralIntegrity, type StructuralIntegrityConfig } from './StructuralIntegrity';
import { Fracturable } from './Fracturable';
import type { Vector3 } from './Fragment';
import type { ExplosionConfig } from './ShockWaveSolver';

export type DemoScenario =
  | 'single_explosion'
  | 'building_collapse'
  | 'chain_reaction'
  | 'demolition_sequence'
  | 'sandbox';

export interface CameraConfig {
  /** Camera position */
  position: Vector3;
  /** Camera target (look at) */
  target: Vector3;
  /** Field of view (degrees) */
  fov?: number;
  /** Camera shake intensity */
  shakeIntensity?: number;
  /** Camera shake decay */
  shakeDecay?: number;
  /** Auto-follow explosions */
  autoFollow?: boolean;
}

export interface DemolitionDemoSceneConfig {
  /** Physics configuration */
  physics?: DemolitionPhysicsConfig;
  /** Structural integrity configuration */
  structural?: StructuralIntegrityConfig;
  /** Camera configuration */
  camera?: CameraConfig;
  /** Initial scenario */
  scenario?: DemoScenario;
  /** Enable camera shake */
  enableCameraShake?: boolean;
  /** Enable debris clouds */
  enableDebrisClouds?: boolean;
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean;
  /** Time scale (1.0 = normal speed) */
  timeScale?: number;
}

export interface CameraState {
  /** Current position */
  position: Vector3;
  /** Current target */
  target: Vector3;
  /** Current shake offset */
  shakeOffset: Vector3;
  /** Shake velocity */
  shakeVelocity: Vector3;
  /** Current shake magnitude */
  shakeMagnitude: number;
}

export interface DemoSceneStatistics {
  /** Physics stats */
  physics: any;
  /** Structural stats */
  structural: any;
  /** Camera shake magnitude */
  cameraShake: number;
  /** Active scenarios */
  activeScenario: DemoScenario;
  /** Time scale */
  timeScale: number;
  /** Frame time (ms) */
  frameTime: number;
  /** Total objects */
  totalObjects: number;
  /** Total fragments */
  totalFragments: number;
  /** Total particles */
  totalParticles: number;
  /** Total structural elements */
  totalStructuralElements: number;
}

export interface UserInput {
  /** Mouse position (normalized -1 to 1) */
  mouse: { x: number; y: number };
  /** Mouse buttons */
  mouseButtons: { left: boolean; right: boolean; middle: boolean };
  /** Keyboard keys */
  keys: Set<string>;
}

/**
 * Interactive demolition demo scene
 */
export class DemolitionDemoScene {
  private readonly config: Required<DemolitionDemoSceneConfig>;
  private readonly physics: DemolitionPhysics;
  private readonly structural: StructuralIntegrity;
  private readonly camera: CameraState;
  private readonly userInput: UserInput;

  private scenario: DemoScenario;
  private paused = false;
  private lastFrameTime = 0;
  private frameTime = 0;

  constructor(config: DemolitionDemoSceneConfig = {}) {
    this.config = {
      physics: config.physics || {},
      structural: config.structural || {},
      camera: config.camera || {
        position: { x: 0, y: 20, z: 50 },
        target: { x: 0, y: 10, z: 0 },
        fov: 60,
        shakeIntensity: 1.0,
        shakeDecay: 0.9,
        autoFollow: true,
      },
      scenario: config.scenario || 'sandbox',
      enableCameraShake: config.enableCameraShake ?? true,
      enableDebrisClouds: config.enableDebrisClouds ?? true,
      enablePerformanceMonitoring: config.enablePerformanceMonitoring ?? true,
      timeScale: config.timeScale ?? 1.0,
    };

    // Initialize subsystems
    this.physics = new DemolitionPhysics(this.config.physics);
    this.structural = new StructuralIntegrity(this.config.structural);

    // Initialize camera
    this.camera = {
      position: { ...this.config.camera.position },
      target: { ...this.config.camera.target },
      shakeOffset: { x: 0, y: 0, z: 0 },
      shakeVelocity: { x: 0, y: 0, z: 0 },
      shakeMagnitude: 0,
    };

    // Initialize user input
    this.userInput = {
      mouse: { x: 0, y: 0 },
      mouseButtons: { left: false, right: false, middle: false },
      keys: new Set<string>(),
    };

    this.scenario = this.config.scenario;
  }

  /**
   * Initialize demo scenario
   */
  public initializeScenario(scenario: DemoScenario): void {
    this.scenario = scenario;

    // Clear existing objects
    this.physics.clear();
    this.structural.clear();

    switch (scenario) {
      case 'single_explosion':
        this.setupSingleExplosion();
        break;
      case 'building_collapse':
        this.setupBuildingCollapse();
        break;
      case 'chain_reaction':
        this.setupChainReaction();
        break;
      case 'demolition_sequence':
        this.setupDemolitionSequence();
        break;
      case 'sandbox':
        this.setupSandbox();
        break;
    }
  }

  /**
   * Setup single explosion scenario
   */
  private setupSingleExplosion(): void {
    // Create a few objects to fracture
    for (let i = 0; i < 5; i++) {
      const object = new Fracturable({
        id: `object_${i}`,
        geometry: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
        },
        material: {
          fractureThreshold: 1000,
        },
        position: { x: (i - 2) * 5, y: 5, z: 0 },
      });
      this.physics.addObject(object);
    }

    // Set camera
    this.setCameraPosition({ x: 0, y: 10, z: 30 }, { x: 0, y: 5, z: 0 });
  }

  /**
   * Setup building collapse scenario
   */
  private setupBuildingCollapse(): void {
    // Create a simple building structure (3 floors)
    const floors = 3;
    const columnsPerFloor = 4;

    // Foundation
    const foundations: string[] = [];
    for (let i = 0; i < columnsPerFloor; i++) {
      const x = (i - columnsPerFloor / 2) * 5;
      const foundation = this.structural.addElement({
        type: 'foundation',
        position: { x, y: 0, z: 0 },
        size: { x: 1, y: 1, z: 1 },
        isFoundation: true,
      });
      foundations.push(foundation.id);
    }

    // Build floors with columns and beams
    const columns: string[][] = [foundations];

    for (let floor = 0; floor < floors; floor++) {
      const currentFloor: string[] = [];

      // Columns for this floor
      for (let i = 0; i < columnsPerFloor; i++) {
        const x = (i - columnsPerFloor / 2) * 5;
        const y = (floor + 1) * 4;

        const column = this.structural.addElement({
          type: 'column',
          position: { x, y, z: 0 },
          size: { x: 0.5, y: 3, z: 0.5 },
          maxLoad: 5000,
        });

        // Connect to column below
        if (columns[floor][i]) {
          this.structural.connect(columns[floor][i], column.id);
        }

        currentFloor.push(column.id);
      }

      columns.push(currentFloor);

      // Beams connecting columns
      for (let i = 0; i < columnsPerFloor - 1; i++) {
        const x1 = (i - columnsPerFloor / 2) * 5;
        const x2 = (i + 1 - columnsPerFloor / 2) * 5;
        const y = (floor + 1) * 4 + 1.5;

        const beam = this.structural.addElement({
          type: 'beam',
          position: { x: (x1 + x2) / 2, y, z: 0 },
          size: { x: 4, y: 0.3, z: 0.5 },
          maxLoad: 3000,
        });

        this.structural.connect(currentFloor[i], beam.id);
        this.structural.connect(currentFloor[i + 1], beam.id);
      }
    }

    // Set camera
    this.setCameraPosition({ x: 20, y: 15, z: 40 }, { x: 0, y: 8, z: 0 });
  }

  /**
   * Setup chain reaction scenario
   */
  private setupChainReaction(): void {
    // Create a line of objects
    for (let i = 0; i < 10; i++) {
      const object = new Fracturable({
        id: `object_${i}`,
        geometry: {
          min: { x: -0.75, y: -0.75, z: -0.75 },
          max: { x: 0.75, y: 0.75, z: 0.75 },
        },
        material: {
          fractureThreshold: 800,
        },
        position: { x: i * 4, y: 2, z: 0 },
      });
      this.physics.addObject(object);
    }

    // Set camera
    this.setCameraPosition({ x: 20, y: 10, z: 30 }, { x: 20, y: 2, z: 0 });
  }

  /**
   * Setup demolition sequence scenario
   */
  private setupDemolitionSequence(): void {
    // Combine structural and fracturable objects
    this.setupBuildingCollapse();

    // Add some fracturable objects around the building
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 15;
      const object = new Fracturable({
        id: `debris_${i}`,
        geometry: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
        },
        material: {
          fractureThreshold: 1200,
        },
        position: {
          x: Math.cos(angle) * radius,
          y: 3,
          z: Math.sin(angle) * radius,
        },
      });
      this.physics.addObject(object);
    }
  }

  /**
   * Setup sandbox scenario
   */
  private setupSandbox(): void {
    // Just a few objects to play with
    for (let i = 0; i < 3; i++) {
      const object = new Fracturable({
        id: `object_${i}`,
        geometry: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
        },
        material: {
          fractureThreshold: 1000,
        },
        position: { x: i * 6 - 6, y: 5, z: 0 },
      });
      this.physics.addObject(object);
    }

    // Simple structure
    const foundation = this.structural.addElement({
      type: 'foundation',
      position: { x: 10, y: 0, z: 0 },
      isFoundation: true,
    });

    const column = this.structural.addElement({
      type: 'column',
      position: { x: 10, y: 5, z: 0 },
      size: { x: 0.5, y: 4, z: 0.5 },
    });

    this.structural.connect(foundation.id, column.id);

    // Set camera
    this.setCameraPosition({ x: 0, y: 10, z: 30 }, { x: 0, y: 5, z: 0 });
  }

  /**
   * Create explosion at position
   */
  public createExplosion(config: ExplosionConfig): void {
    this.physics.createExplosion(config);

    // Apply camera shake
    if (this.config.enableCameraShake) {
      const distance = this.distanceToCamera(config.position);
      const shakeMagnitude = (config.force / 1000) * Math.max(0, 1 - distance / 100);
      this.addCameraShake(shakeMagnitude);
    }

    // Auto-focus camera on explosion
    if (this.config.camera.autoFollow) {
      this.camera.target = { ...config.position };
    }

    // Damage structural elements in radius
    const _damaged = this.structural.damageInRadius(
      config.position,
      config.radius,
      config.force / 1000
    );

    // Remove structural elements at explosion center
    this.structural.removeElementAt(config.position, config.radius * 0.3);
  }

  /**
   * Update demo scene
   */
  public update(dt: number): void {
    if (this.paused || dt <= 0) return;

    const startTime = performance.now();

    // Apply time scale
    const scaledDt = dt * this.config.timeScale;

    // Update physics
    this.physics.update(scaledDt);

    // Update structural integrity
    this.structural.update();

    // Update camera
    this.updateCamera(scaledDt);

    // Update LOD based on camera position
    this.physics.setLODCameraPosition(this.camera.position);

    // Calculate frame time
    this.frameTime = performance.now() - startTime;
    this.lastFrameTime = this.frameTime;
  }

  /**
   * Update camera (shake, position, etc.)
   */
  private updateCamera(dt: number): void {
    // Update shake
    if (this.camera.shakeMagnitude > 0.01) {
      // Apply shake decay
      this.camera.shakeMagnitude *= Math.pow(this.config.camera.shakeDecay ?? 0.9, dt * 60);

      // Update shake offset with spring physics
      const springForce = -this.camera.shakeOffset.x * 10;
      const damping = this.camera.shakeVelocity.x * 5;
      this.camera.shakeVelocity.x += (springForce - damping) * dt;
      this.camera.shakeOffset.x += this.camera.shakeVelocity.x * dt;

      // Add random noise
      const noise = (Math.random() - 0.5) * this.camera.shakeMagnitude;
      this.camera.shakeOffset.x += noise * dt * 10;
      this.camera.shakeOffset.y += (Math.random() - 0.5) * this.camera.shakeMagnitude * dt * 10;
      this.camera.shakeOffset.z += (Math.random() - 0.5) * this.camera.shakeMagnitude * dt * 10;
    } else {
      // Reset shake
      this.camera.shakeMagnitude = 0;
      this.camera.shakeOffset = { x: 0, y: 0, z: 0 };
      this.camera.shakeVelocity = { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Add camera shake
   */
  public addCameraShake(magnitude: number): void {
    if (!this.config.enableCameraShake) return;

    this.camera.shakeMagnitude += magnitude * (this.config.camera.shakeIntensity ?? 1.0);
  }

  /**
   * Get distance from camera to point
   */
  private distanceToCamera(point: Vector3): number {
    const dx = this.camera.position.x - point.x;
    const dy = this.camera.position.y - point.y;
    const dz = this.camera.position.z - point.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Set camera position and target
   */
  public setCameraPosition(position: Vector3, target: Vector3): void {
    this.camera.position = { ...position };
    this.camera.target = { ...target };
  }

  /**
   * Get camera state (position with shake applied)
   */
  public getCameraState(): CameraState {
    return {
      position: {
        x: this.camera.position.x + this.camera.shakeOffset.x,
        y: this.camera.position.y + this.camera.shakeOffset.y,
        z: this.camera.position.z + this.camera.shakeOffset.z,
      },
      target: { ...this.camera.target },
      shakeOffset: { ...this.camera.shakeOffset },
      shakeVelocity: { ...this.camera.shakeVelocity },
      shakeMagnitude: this.camera.shakeMagnitude,
    };
  }

  /**
   * Handle user input (mouse/keyboard)
   */
  public handleInput(input: Partial<UserInput>): void {
    if (input.mouse) {
      this.userInput.mouse = { ...input.mouse };
    }

    if (input.mouseButtons) {
      Object.assign(this.userInput.mouseButtons, input.mouseButtons);
    }

    if (input.keys) {
      this.userInput.keys = new Set(input.keys);
    }
  }

  /**
   * Handle mouse click (create explosion, apply force, etc.)
   */
  public handleMouseClick(worldPosition: Vector3, button: 'left' | 'right' | 'middle'): void {
    if (button === 'left') {
      // Create explosion
      this.createExplosion({
        position: worldPosition,
        force: 1000,
        radius: 10,
      });
    } else if (button === 'right') {
      // Apply directional force
      const direction = {
        x: worldPosition.x - this.camera.position.x,
        y: worldPosition.y - this.camera.position.y,
        z: worldPosition.z - this.camera.position.z,
      };
      const magnitude = Math.sqrt(
        direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
      );
      const normalizedDir = {
        x: direction.x / magnitude,
        y: direction.y / magnitude,
        z: direction.z / magnitude,
      };
      const force = {
        x: normalizedDir.x * 500,
        y: normalizedDir.y * 500,
        z: normalizedDir.z * 500,
      };
      this.physics.applyForceInRadius(worldPosition, 5, force, 0.016);
    }
  }

  /**
   * Get all fracturable objects
   */
  public getObjects(): Fracturable[] {
    return this.physics.getObjects();
  }

  /**
   * Get all fragments
   */
  public getFragments() {
    return this.physics.getFragments();
  }

  /**
   * Get debris particles by LOD
   */
  public getDebrisParticlesByLOD(level: 'near' | 'medium' | 'far') {
    return this.physics.getDebrisParticlesByLOD(level);
  }

  /**
   * Get all structural elements
   */
  public getStructuralElements() {
    return this.structural.getElements();
  }

  /**
   * Get statistics
   */
  public getStatistics(): DemoSceneStatistics {
    const physicsStats = this.physics.getStatistics();
    const structuralStats = this.structural.getStatistics();

    return {
      physics: physicsStats,
      structural: structuralStats,
      cameraShake: this.camera.shakeMagnitude,
      activeScenario: this.scenario,
      timeScale: this.config.timeScale,
      frameTime: this.frameTime,
      totalObjects: physicsStats.fracture.totalObjects,
      totalFragments: physicsStats.fracture.totalFragments,
      totalParticles: physicsStats.particles.totalParticles,
      totalStructuralElements: structuralStats.totalElements,
    };
  }

  /**
   * Set time scale
   */
  public setTimeScale(scale: number): void {
    this.config.timeScale = Math.max(0, Math.min(10, scale));
  }

  /**
   * Pause simulation
   */
  public pause(): void {
    this.paused = true;
  }

  /**
   * Resume simulation
   */
  public resume(): void {
    this.paused = false;
  }

  /**
   * Toggle pause
   */
  public togglePause(): void {
    this.paused = !this.paused;
  }

  /**
   * Check if paused
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Get current scenario
   */
  public getScenario(): DemoScenario {
    return this.scenario;
  }

  /**
   * Reset scene
   */
  public reset(): void {
    this.physics.reset();
    this.structural.reset();
    this.camera.shakeMagnitude = 0;
    this.camera.shakeOffset = { x: 0, y: 0, z: 0 };
    this.camera.shakeVelocity = { x: 0, y: 0, z: 0 };
    this.paused = false;
  }

  /**
   * Clear scene
   */
  public clear(): void {
    // Remove all objects
    const objects = this.physics.getObjects();
    for (const object of objects) {
      this.physics.removeObject(object.id);
    }

    // Clear subsystems
    this.physics.clear();
    this.structural.clear();
    this.reset();
  }

  /**
   * Get particle data for rendering
   * Returns Float32Arrays for efficient transfer to renderer
   */
  public getParticleData(): {
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    count: number;
  } | null {
    const particleSystem = this.physics.getDebrisParticleSystem();
    const particles = particleSystem.getParticlesByLOD('near'); // Get visible particles

    if (particles.length === 0) {
      return null;
    }

    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const particle = particles[i];
      const idx = i * 3;

      // Position
      positions[idx] = particle.position.x;
      positions[idx + 1] = particle.position.y;
      positions[idx + 2] = particle.position.z;

      // Color (normalized RGB)
      colors[idx] = particle.color.r / 255;
      colors[idx + 1] = particle.color.g / 255;
      colors[idx + 2] = particle.color.b / 255;

      // Size
      sizes[i] = particle.size;
    }

    return {
      positions,
      colors,
      sizes,
      count,
    };
  }

  /**
   * Get all active particles (for debugging/visualization)
   */
  public getAllParticles(): {
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    count: number;
  } | null {
    const particleSystem = this.physics.getDebrisParticleSystem();
    const stats = particleSystem.getStatistics();

    if (stats.activeParticles === 0) {
      return null;
    }

    // Get all LOD levels
    const nearParticles = particleSystem.getParticlesByLOD('near');
    const mediumParticles = particleSystem.getParticlesByLOD('medium');
    const farParticles = particleSystem.getParticlesByLOD('far');

    const allParticles = [...nearParticles, ...mediumParticles, ...farParticles];
    const count = allParticles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const particle = allParticles[i];
      const idx = i * 3;

      positions[idx] = particle.position.x;
      positions[idx + 1] = particle.position.y;
      positions[idx + 2] = particle.position.z;

      colors[idx] = particle.color.r / 255;
      colors[idx + 1] = particle.color.g / 255;
      colors[idx + 2] = particle.color.b / 255;

      sizes[i] = particle.size;
    }

    return {
      positions,
      colors,
      sizes,
      count,
    };
  }
}
