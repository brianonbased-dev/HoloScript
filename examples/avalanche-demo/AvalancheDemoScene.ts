/**
 * AvalancheDemoScene.ts
 *
 * Interactive avalanche demonstration scene with UI controls, camera system,
 * and real-time statistics display.
 *
 * Week 6: Avalanche Simulation - Interactive Demo Scene
 */

import { TerrainGenerator, type TerrainConfig } from './TerrainGenerator';
import { SnowAccumulation, type SnowConfig } from './SnowAccumulation';
import { AvalanchePhysics, type AvalancheConfig } from './AvalanchePhysics';
import { AvalancheSimulation, type SimulationConfig } from './AvalancheSimulation';

export interface DemoConfig {
  /** Canvas element for rendering */
  canvas: HTMLCanvasElement;
  /** Terrain configuration */
  terrain: TerrainConfig;
  /** Snow configuration */
  snow: SnowConfig;
  /** Avalanche physics configuration */
  physics: AvalancheConfig;
  /** Simulation configuration */
  simulation: SimulationConfig;
}

export interface CameraMode {
  /** Camera mode name */
  name: 'overview' | 'follow' | 'topdown' | 'cinematic' | 'free';
  /** Camera position */
  position: [number, number, number];
  /** Camera target (look-at point) */
  target: [number, number, number];
  /** Field of view in degrees */
  fov: number;
}

export interface UIState {
  /** Is avalanche active */
  avalancheActive: boolean;
  /** Current camera mode */
  cameraMode: string;
  /** Show debug info */
  showDebug: boolean;
  /** Slow motion mode */
  slowMotion: boolean;
  /** Paused */
  paused: boolean;
}

/**
 * Interactive avalanche demonstration scene
 */
export class AvalancheDemoScene {
  private canvas: HTMLCanvasElement;
  private simulation: AvalancheSimulation;
  private terrain: any;
  private cameraMode: CameraMode;
  private uiState: UIState;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private statusMessage = '';
  private statusTimeout: number | null = null;

  // Camera modes
  private cameraModes: Map<string, CameraMode> = new Map([
    [
      'overview',
      {
        name: 'overview',
        position: [100, 80, 100],
        target: [0, 0, 0],
        fov: 60,
      },
    ],
    [
      'follow',
      {
        name: 'follow',
        position: [0, 50, 80],
        target: [0, 0, 0],
        fov: 70,
      },
    ],
    [
      'topdown',
      {
        name: 'topdown',
        position: [0, 150, 0.1],
        target: [0, 0, 0],
        fov: 50,
      },
    ],
    [
      'cinematic',
      {
        name: 'cinematic',
        position: [120, 60, 120],
        target: [0, 20, 0],
        fov: 65,
      },
    ],
    [
      'free',
      {
        name: 'free',
        position: [80, 60, 80],
        target: [0, 0, 0],
        fov: 60,
      },
    ],
  ]);

  constructor(config: DemoConfig) {
    this.canvas = config.canvas;

    // Create terrain
    const terrainGen = new TerrainGenerator(config.terrain);
    this.terrain = terrainGen.generateTerrain();

    // Create snow accumulation
    const snow = new SnowAccumulation(this.terrain, config.snow);

    // Create physics
    const physics = new AvalanchePhysics(this.terrain, snow.getParticles(), config.physics);

    // Create simulation
    this.simulation = new AvalancheSimulation(this.terrain, physics, config.simulation);

    // Initialize camera
    this.cameraMode = this.cameraModes.get('overview')!;

    // Initialize UI state
    this.uiState = {
      avalancheActive: false,
      cameraMode: 'overview',
      showDebug: false,
      slowMotion: false,
      paused: false,
    };

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup keyboard and UI event listeners
   */
  private setupEventListeners(): void {
    // Only setup DOM event listeners if in browser environment
    if (typeof window !== 'undefined') {
      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // Mouse events for free camera (canvas is mocked in tests)
    if (this.canvas.addEventListener) {
      this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.canvas.addEventListener('wheel', (e) => this.handleMouseWheel(e));
    }
  }

  /**
   * Handle keyboard input
   */
  private handleKeyboard(event: KeyboardEvent): void {
    switch (event.key.toLowerCase()) {
      case ' ':
        event.preventDefault();
        this.handleTriggerAvalanche();
        break;
      case 'r':
        this.handleReset();
        break;
      case 's':
        this.toggleSlowMotion();
        break;
      case 'p':
        this.togglePause();
        break;
      case 'd':
        this.toggleDebug();
        break;
      case '1':
        this.setCameraMode('overview');
        break;
      case '2':
        this.setCameraMode('follow');
        break;
      case '3':
        this.setCameraMode('topdown');
        break;
      case '4':
        this.setCameraMode('cinematic');
        break;
      case '5':
        this.setCameraMode('free');
        break;
    }
  }

  /**
   * Handle mouse down
   */
  private handleMouseDown(event: MouseEvent): void {
    if (this.uiState.cameraMode === 'free') {
      // Start camera rotation
    }
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.uiState.cameraMode === 'free') {
      // Update camera rotation
    }
  }

  /**
   * Handle mouse wheel
   */
  private handleMouseWheel(event: WheelEvent): void {
    event.preventDefault();
    // Zoom camera
  }

  /**
   * Trigger avalanche at center
   */
  public handleTriggerAvalanche(): void {
    const epicenter: [number, number] = [0, 0];
    const radius = 30;

    this.simulation.triggerAvalanche(epicenter, radius);
    this.uiState.avalancheActive = true;

    this.showStatus('Avalanche triggered!');
  }

  /**
   * Reset simulation
   */
  public handleReset(): void {
    this.simulation.reset();
    this.uiState.avalancheActive = false;
    this.uiState.paused = false;

    this.showStatus('Simulation reset');
  }

  /**
   * Toggle slow motion
   */
  public toggleSlowMotion(): void {
    this.uiState.slowMotion = !this.uiState.slowMotion;
    this.showStatus(`Slow motion: ${this.uiState.slowMotion ? 'ON' : 'OFF'}`);
  }

  /**
   * Toggle pause
   */
  public togglePause(): void {
    this.uiState.paused = !this.uiState.paused;
    this.showStatus(`Simulation: ${this.uiState.paused ? 'PAUSED' : 'RUNNING'}`);
  }

  /**
   * Toggle debug display
   */
  public toggleDebug(): void {
    this.uiState.showDebug = !this.uiState.showDebug;
  }

  /**
   * Set camera mode
   */
  public setCameraMode(mode: string): void {
    const newMode = this.cameraModes.get(mode);
    if (newMode) {
      this.cameraMode = newMode;
      this.uiState.cameraMode = mode;
      this.showStatus(`Camera: ${mode}`);
    }
  }

  /**
   * Show status message
   */
  private showStatus(message: string): void {
    this.statusMessage = message;

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
    }

    // Only set timeout if in browser environment
    if (typeof window !== 'undefined') {
      this.statusTimeout = window.setTimeout(() => {
        this.statusMessage = '';
        this.statusTimeout = null;
      }, 3000);
    }
  }

  /**
   * Start animation loop
   */
  public start(): void {
    if (this.animationFrameId !== null) {
      return; // Already running
    }

    this.lastTime = performance.now();
    this.animate();
  }

  /**
   * Stop animation loop
   */
  public stop(): void {
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    const currentTime = performance.now();
    let dt = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Apply slow motion
    if (this.uiState.slowMotion) {
      dt *= 0.25;
    }

    // Update simulation (if not paused)
    if (!this.uiState.paused) {
      this.simulation.update(dt).catch((err) => {
        console.error('Simulation update error:', err);
      });
    }

    // Update camera (follow mode)
    if (this.uiState.cameraMode === 'follow') {
      this.updateFollowCamera();
    }

    // Render (would call WebGL/WebGPU renderer here)
    this.render();

    // Continue loop (only if in browser environment)
    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  };

  /**
   * Update follow camera to track avalanche
   */
  private updateFollowCamera(): void {
    const stats = this.simulation.getStatistics();

    if (stats.slidingCount + stats.airborneCount > 0) {
      // Calculate center of mass of moving particles
      const particles = this.simulation.getParticles();
      const movingParticles = particles.filter(
        (p) => p.state === 'sliding' || p.state === 'airborne'
      );

      if (movingParticles.length > 0) {
        let centerX = 0;
        let centerY = 0;
        let centerZ = 0;

        for (const p of movingParticles) {
          centerX += p.position[0];
          centerY += p.position[1];
          centerZ += p.position[2];
        }

        centerX /= movingParticles.length;
        centerY /= movingParticles.length;
        centerZ /= movingParticles.length;

        // Update camera target (smooth lerp)
        const lerp = 0.05;
        this.cameraMode.target[0] += (centerX - this.cameraMode.target[0]) * lerp;
        this.cameraMode.target[1] += (centerY - this.cameraMode.target[1]) * lerp;
        this.cameraMode.target[2] += (centerZ - this.cameraMode.target[2]) * lerp;
      }
    }
  }

  /**
   * Render scene (placeholder for actual WebGL/WebGPU rendering)
   */
  private render(): void {
    // In a real implementation, this would:
    // 1. Clear canvas
    // 2. Render terrain mesh
    // 3. Render snow particles (instanced rendering)
    // 4. Render UI overlay with stats
    // 5. Display status message

    // For now, just update UI
    this.updateUI();
  }

  /**
   * Update UI display
   */
  private updateUI(): void {
    const stats = this.simulation.getStatistics();
    const metrics = this.simulation.getPerformanceMetrics();

    // Create UI overlay (would be actual DOM or WebGPU text rendering)
    const uiData = {
      fps: metrics.fps.toFixed(1),
      particles: {
        resting: stats.restingCount,
        sliding: stats.slidingCount,
        airborne: stats.airborneCount,
        total: stats.restingCount + stats.slidingCount + stats.airborneCount,
      },
      avalanche: {
        active: stats.isActive,
        time: stats.elapsedTime.toFixed(1),
        avgVelocity: stats.avgVelocity.toFixed(2),
        maxVelocity: stats.maxVelocity.toFixed(2),
        events: stats.collapseEvents,
      },
      performance: {
        cpu: metrics.cpuPhysicsTime.toFixed(2),
        gpu: metrics.gpuComputeTime.toFixed(2),
        total: metrics.totalFrameTime.toFixed(2),
        memory: metrics.memoryUsage.toFixed(2),
      },
      camera: this.uiState.cameraMode,
      status: this.statusMessage,
    };

    // Would render UI here
    this.renderUIOverlay(uiData);
  }

  /**
   * Render UI overlay (placeholder)
   */
  private renderUIOverlay(data: any): void {
    // In a real implementation, this would render UI to canvas or DOM
  }

  /**
   * Get current statistics
   */
  public getStatistics() {
    return this.simulation.getStatistics();
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics() {
    return this.simulation.getPerformanceMetrics();
  }

  /**
   * Get UI state
   */
  public getUIState(): UIState {
    return { ...this.uiState };
  }

  /**
   * Get camera mode
   */
  public getCameraMode(): CameraMode {
    return { ...this.cameraMode };
  }

  /**
   * Get status message
   */
  public getStatusMessage(): string {
    return this.statusMessage;
  }

  /**
   * Get particle data for renderer (Runtime Integration)
   */
  public getParticleData(): {
    positions: Float32Array;
    colors: Float32Array;
    count: number;
  } | null {
    const particles = this.simulation.getAvalancheParticles();
    if (!particles || particles.length === 0) return null;

    const count = Math.min(particles.length, 50000); // Cap at renderer limit
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const particle = particles[i];
      const idx = i * 3;

      positions[idx] = particle.position[0];
      positions[idx + 1] = particle.position[1];
      positions[idx + 2] = particle.position[2];

      // Color based on particle state and material
      const state = particle.state || 'resting';
      if (state === 'sliding' || state === 'airborne') {
        colors[idx] = 1.0; // R
        colors[idx + 1] = 1.0; // G
        colors[idx + 2] = 1.0; // B (white - moving)
      } else {
        colors[idx] = 0.9; // R
        colors[idx + 1] = 0.9; // G
        colors[idx + 2] = 0.95; // B (light grey - resting)
      }
    }

    return { positions, colors, count };
  }

  /**
   * Get terrain data for renderer (Runtime Integration)
   */
  public getTerrainData(): any {
    return this.simulation.getTerrainData();
  }

  /**
   * Trigger avalanche at position (Runtime Integration)
   */
  public triggerAvalanche(position: { x: number; y: number; z: number }, radius: number): void {
    this.simulation.triggerAvalanche(position.x, position.z, radius);
  }

  /**
   * Reset simulation (Runtime Integration)
   */
  public reset(): void {
    this.handleReset();
  }

  /**
   * Update simulation (Runtime Integration)
   */
  public update(deltaTime: number): void {
    this.simulation.step(deltaTime);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stop();

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
    }

    // Remove event listeners (only if in browser environment)
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', (e) => this.handleKeyboard(e));
    }
  }
}
