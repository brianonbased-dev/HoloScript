/**
 * physics-integration-demo.ts
 * Complete demonstration of HoloScript physics system integration
 *
 * This demo shows:
 * 1. Voronoi fracture destruction
 * 2. Automatic conversion of fragments to granular particles
 * 3. Realistic debris pile formation
 * 4. Camera management and visual effects
 *
 * Run with: tsx samples/physics-integration-demo.ts
 */

import { VoronoiFractureSystem } from '../packages/core/src/traits/VoronoiFractureTrait';
import { GranularMaterialSystem } from '../packages/core/src/traits/GranularMaterialTrait';
import { PhysicsIntegrationManager } from '../packages/core/src/integrations/PhysicsIntegration';

// ============================================================================
// Demo Configuration
// ============================================================================

interface DemoConfig {
  // Simulation
  duration: number; // seconds
  timeStep: number; // seconds
  exportInterval: number; // frames

  // Wall parameters
  wallWidth: number;
  wallHeight: number;
  wallDepth: number;
  wallFragments: number;

  // Wrecking ball
  ballRadius: number;
  ballMass: number;
  ballVelocity: number;

  // Visual output
  exportFrames: boolean;
  logStats: boolean;
}

const DEFAULT_CONFIG: DemoConfig = {
  duration: 10.0,
  timeStep: 0.01,
  exportInterval: 10,

  wallWidth: 4,
  wallHeight: 4,
  wallDepth: 1,
  wallFragments: 50,

  ballRadius: 0.8,
  ballMass: 500,
  ballVelocity: 8,

  exportFrames: false,
  logStats: true,
};

// ============================================================================
// Demo Scene
// ============================================================================

class PhysicsIntegrationDemo {
  private fractureSystem: VoronoiFractureSystem;
  private granularSystem: GranularMaterialSystem;
  private integrationManager: PhysicsIntegrationManager;

  private config: DemoConfig;
  private simulationTime: number = 0;
  private frameCount: number = 0;

  // Wrecking ball state
  private ballPosition = { x: -6, y: 3, z: 0 };
  private ballVelocity = { x: 0, y: 0, z: 0 };

  constructor(config: Partial<DemoConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize physics systems
    this.initializeFractureSystem();
    this.initializeGranularSystem();
    this.integrationManager = new PhysicsIntegrationManager({
      enableDestructionToGranular: true,
      minFragmentSize: 0.01,
      particleSizeScale: 1.0,
      particleDensity: 2400,
    });

    this.log('🎬 Physics Integration Demo Initialized');
    this.log(`Wall: ${this.config.wallFragments} fragments`);
    this.log(`Duration: ${this.config.duration}s @ ${this.config.timeStep}s timestep`);
  }

  private initializeFractureSystem(): void {
    this.fractureSystem = new VoronoiFractureSystem({
      voronoiSites: this.config.wallFragments,
      bounds: {
        min: {
          x: -this.config.wallWidth / 2,
          y: 0,
          z: -this.config.wallDepth / 2,
        },
        max: {
          x: this.config.wallWidth / 2,
          y: this.config.wallHeight,
          z: this.config.wallDepth / 2,
        },
      },
      maxHealth: 100,
      destructionThreshold: 0.3,
      enableCrackPropagation: true,
      crackPropagationSpeed: 5.0,
      enableLOD: true,
      enablePooling: true,
    });

    // Generate the wall fracture pattern
    this.fractureSystem.generateVoronoiFracture();
    this.log(`✓ Voronoi fracture system initialized (${this.config.wallFragments} fragments)`);
  }

  private initializeGranularSystem(): void {
    this.granularSystem = new GranularMaterialSystem({
      material: {
        youngsModulus: 30e9, // Concrete
        poissonsRatio: 0.2,
        frictionCoefficient: 0.7,
        restitution: 0.3,
        cohesion: 50,
        rollingResistance: 0.1,
        density: 2400,
      },
      gravity: { x: 0, y: -9.81, z: 0 },
      timeStep: this.config.timeStep,
      maxVelocity: 20,
      damping: 0.05,
      spatialHashCellSize: 0.1,
    });

    // Add ground plane
    this.granularSystem.addRigidBodyPlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

    this.log('✓ Granular material system initialized');
  }

  // ==========================================================================
  // Simulation Loop
  // ==========================================================================

  run(): void {
    this.log('\n🚀 Starting simulation...\n');

    const startTime = Date.now();

    while (this.simulationTime < this.config.duration) {
      this.update(this.config.timeStep);
      this.simulationTime += this.config.timeStep;
      this.frameCount++;

      // Export frames at intervals
      if (this.config.exportFrames && this.frameCount % this.config.exportInterval === 0) {
        this.exportFrame();
      }

      // Log stats periodically
      if (this.config.logStats && this.frameCount % 100 === 0) {
        this.logStats();
      }
    }

    const endTime = Date.now();
    const computeTime = (endTime - startTime) / 1000;

    this.log('\n✅ Simulation complete!');
    this.log(`Computed ${this.simulationTime.toFixed(2)}s in ${computeTime.toFixed(2)}s`);
    this.log(`Performance: ${(this.simulationTime / computeTime).toFixed(2)}x realtime`);

    this.printFinalStats();
  }

  private update(dt: number): void {
    // 1. Update wrecking ball physics
    this.updateWreckingBall(dt);

    // 2. Check for wrecking ball impact on wall
    this.checkWreckingBallImpact();

    // 3. Simulate fracture system (crack propagation)
    this.fractureSystem.propagateCracks(dt);

    // 4. Convert destroyed fragments to particles
    this.integrationManager.destructionToGranular.convertDestroyedFragments(
      this.fractureSystem,
      this.granularSystem,
      false // don't recycle fragments for demo (keep them destroyed for stats)
    );

    // 5. Simulate granular material
    this.granularSystem.step(dt);

    // 6. Update LOD based on camera
    this.fractureSystem.setCameraPosition({ x: -8, y: 4, z: 8 });
    this.fractureSystem.updateLOD();
  }

  private updateWreckingBall(dt: number): void {
    // Simple physics for wrecking ball
    // In a real implementation, this would use a rigid body solver

    if (this.simulationTime < 0.1) {
      // Initial launch
      this.ballVelocity.x = this.config.ballVelocity;
    }

    // Apply gravity
    this.ballVelocity.y -= 9.81 * dt;

    // Update position
    this.ballPosition.x += this.ballVelocity.x * dt;
    this.ballPosition.y += this.ballVelocity.y * dt;
    this.ballPosition.z += this.ballVelocity.z * dt;

    // Ground collision
    if (this.ballPosition.y < this.config.ballRadius) {
      this.ballPosition.y = this.config.ballRadius;
      this.ballVelocity.y *= -0.5; // Bounce with energy loss
    }

    // Damping
    this.ballVelocity.x *= 0.99;
    this.ballVelocity.z *= 0.99;
  }

  private checkWreckingBallImpact(): void {
    // Check if ball is near wall center
    const wallCenter = { x: 0, y: 2, z: 0 };
    const distance = Math.sqrt(
      Math.pow(this.ballPosition.x - wallCenter.x, 2) +
        Math.pow(this.ballPosition.y - wallCenter.y, 2) +
        Math.pow(this.ballPosition.z - wallCenter.z, 2)
    );

    // Apply damage on impact (one-time trigger)
    if (distance < 2.0 && this.ballVelocity.x > 3.0) {
      this.fractureSystem.applyDamage({
        position: this.ballPosition,
        radius: 3.0, // Increased radius to hit more fragments
        maxDamage: 200, // Increased damage
        falloff: 2.0,
      });

      // Slow down ball on impact
      this.ballVelocity.x *= 0.3;
      this.ballVelocity.y += 2; // Bounce up
    }
  }

  // ==========================================================================
  // Stats and Logging
  // ==========================================================================

  private logStats(): void {
    const destructionProgress = this.fractureSystem.getDestructionProgress();
    const activeFragments = this.fractureSystem.getActiveFragmentCount();
    const particleCount = this.granularSystem.getParticles().length;
    const conversionStats = this.integrationManager.destructionToGranular.getStats();

    console.log(
      `[${this.simulationTime.toFixed(2)}s] ` +
        `Destruction: ${(destructionProgress * 100).toFixed(1)}% | ` +
        `Fragments: ${activeFragments} | ` +
        `Particles: ${particleCount} | ` +
        `Converted: ${conversionStats.fragmentsConverted}`
    );
  }

  private printFinalStats(): void {
    this.log('\n📊 Final Statistics:');
    this.log('─'.repeat(50));

    // Fracture stats
    const fractureStats = {
      total: this.fractureSystem.getFragmentCount(),
      active: this.fractureSystem.getActiveFragmentCount(),
      destroyed: this.fractureSystem.getDestroyedFragmentCount(),
      progress: this.fractureSystem.getDestructionProgress(),
    };

    this.log('\n🧱 Fracture System:');
    this.log(`  Total Fragments: ${fractureStats.total}`);
    this.log(`  Active: ${fractureStats.active}`);
    this.log(`  Destroyed: ${fractureStats.destroyed}`);
    this.log(`  Destruction Progress: ${(fractureStats.progress * 100).toFixed(1)}%`);

    // Granular stats
    const allParticles = this.granularSystem.getParticles();
    const granularStats = {
      particles: allParticles.length,
      active: this.granularSystem.getActiveParticleCount(),
      sleeping: allParticles.filter((p) => p.sleeping).length,
      kineticEnergy: this.granularSystem.getKineticEnergy(),
    };

    this.log('\n⚙️  Granular System:');
    this.log(`  Total Particles: ${granularStats.particles}`);
    this.log(`  Active: ${granularStats.active}`);
    this.log(`  Sleeping: ${granularStats.sleeping}`);
    this.log(`  Kinetic Energy: ${granularStats.kineticEnergy.toFixed(2)} J`);

    // Conversion stats
    const conversionStats = this.integrationManager.destructionToGranular.getStats();

    this.log('\n🔄 Integration:');
    this.log(`  Fragments Converted: ${conversionStats.fragmentsConverted}`);
    this.log(`  Particles Created: ${conversionStats.particlesCreated}`);
    this.log(`  Total Volume: ${conversionStats.totalVolume.toFixed(3)} m³`);
    this.log(
      `  Avg Particle Size: ${(conversionStats.averageParticleSize * 100).toFixed(1)} cm`
    );

    this.log('\n' + '─'.repeat(50));
  }

  private exportFrame(): void {
    // In a real implementation, this would export to JSON/glTF/USD
    const frame = {
      time: this.simulationTime,
      fragments: this.fractureSystem.getFragments().map((f) => ({
        id: f.id,
        position: f.position,
        active: f.active,
        damage: f.damage,
        lodLevel: f.lodLevel,
      })),
      particles: this.granularSystem.getParticles().map((p) => ({
        position: p.position,
        radius: p.radius,
        velocity: p.velocity,
      })),
      ball: {
        position: this.ballPosition,
        velocity: this.ballVelocity,
      },
    };

    // Would save to file here
    // fs.writeFileSync(`frames/frame_${this.frameCount}.json`, JSON.stringify(frame));
  }

  private log(message: string): void {
    console.log(message);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  HoloScript Physics Integration Demo');
  console.log('  Destruction → Granular Materials');
  console.log('═'.repeat(60));
  console.log('');

  const demo = new PhysicsIntegrationDemo({
    duration: 5.0,
    timeStep: 0.01,
    wallFragments: 30,
    logStats: true,
    exportFrames: false,
  });

  demo.run();

  console.log('');
  console.log('💡 Next Steps:');
  console.log('  - Visualize results in Three.js/Babylon.js');
  console.log('  - Export to Unity/Unreal with compiled samples');
  console.log('  - Add fluid interaction for water damage');
  console.log('  - Implement GPU acceleration for 1000+ fragments');
  console.log('');
}

// Run the demo
if (require.main === module) {
  main();
}

export { PhysicsIntegrationDemo };
