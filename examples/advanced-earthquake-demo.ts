/**
 * Advanced Earthquake Demo - Integration Example
 *
 * Demonstrates all new Runtime Integration features working together:
 * - EarthquakeRuntimeExecutor (seismic simulation)
 * - GPU Instancing (10K+ debris fragments)
 * - Post-Processing (SSAO, Bloom, TAA)
 * - Optimized Shaders (custom particle & debris shaders)
 * - Scene Inspector (real-time debugging)
 */

import {
  EarthquakeRuntimeExecutor,
  ThreeJSRenderer,
} from '@holoscript/core';
import * as THREE from 'three';

import { createEarthquakeComposition } from './advanced-earthquake-demo/config';
import { setupLighting, setupGround } from './advanced-earthquake-demo/lighting';
import { initializeAdvancedSystems, RenderingSystems } from './advanced-earthquake-demo/rendering';
import { setupControls } from './advanced-earthquake-demo/controls';

/**
 * Main application class
 */
export class AdvancedEarthquakeDemo {
  // Runtime executor
  private earthquakeExecutor: EarthquakeRuntimeExecutor;

  // Rendering systems
  private renderer: ThreeJSRenderer;
  private systems: RenderingSystems;

  // Scene objects
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private webglRenderer: THREE.WebGLRenderer;

  // Animation
  private animationId: number | null = null;
  private clock: THREE.Clock;

  constructor() {
    // Initialize clock
    this.clock = new THREE.Clock();

    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(50, 30, 80);
    this.camera.lookAt(0, 0, 0);

    // Initialize WebGL renderer
    this.webglRenderer = new THREE.WebGLRenderer({
      antialias: false, // We'll use TAA instead
      powerPreference: 'high-performance',
    });
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.webglRenderer.domElement);

    // Initialize HoloScript renderer wrapper
    this.renderer = new ThreeJSRenderer();

    // Initialize advanced systems
    this.systems = initializeAdvancedSystems(this.webglRenderer, this.scene, this.camera);

    // Initialize earthquake executor
    const composition = createEarthquakeComposition();
    this.earthquakeExecutor = new EarthquakeRuntimeExecutor(composition.traits.simulation);

    // Setup scene
    setupLighting(this.scene);
    setupGround(this.scene);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Add keyboard controls
    setupControls({
      earthquakeExecutor: this.earthquakeExecutor,
      inspector: this.systems.inspector,
      postProcessing: this.systems.postProcessing,
    });
  }

  /**
   * Handle window resize
   */
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.systems.postProcessing.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Start the demo
   */
  async start(): Promise<void> {
    // Initialize earthquake simulation
    const composition = createEarthquakeComposition();
    await this.earthquakeExecutor.initialize(composition);

    console.log('✅ Earthquake simulation initialized');
    console.log('🏗️ Buildings:', composition.traits.simulation.buildingCount);
    console.log('📊 Magnitude:', composition.traits.simulation.magnitude);

    // Start animation loop
    this.animate();

    console.log('▶️ Demo started - Press H for help');
  }

  /**
   * Animation loop
   */
  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    // Update systems
    this.systems.shaders.update(deltaTime);
    this.systems.inspector.update();

    // Render with post-processing
    this.systems.postProcessing.render(deltaTime);

    // Log stats every 2 seconds
    if (
      Math.floor(this.clock.getElapsedTime()) % 2 === 0 &&
      this.clock.getElapsedTime() % 1 < deltaTime
    ) {
      const stats = this.systems.inspector.getStats();
      console.log(
        `📊 FPS: ${stats.fps} | Objects: ${stats.objectCount} | Draw Calls: ${stats.drawCalls}`
      );
    }
  }

  /**
   * Stop the demo
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.earthquakeExecutor.dispose();
    this.systems.instancing.dispose();
    this.systems.postProcessing.dispose();
    this.systems.shaders.dispose();
    this.systems.inspector.dispose();

    console.log('⏹️ Demo stopped');
  }
}

// Auto-start demo if running in browser
if (typeof window !== 'undefined') {
  const demo = new AdvancedEarthquakeDemo();
  demo.start();

  // Expose to window for debugging
  (window as any).demo = demo;
}
