/**
 * demolition-example.ts
 *
 * Complete example showing HoloScript → Runtime integration.
 * Demonstrates the full pipeline from .holo file to execution.
 */

import { RuntimeRegistry } from '../RuntimeRegistry';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// Import demolition runtime (auto-registers)
import '../../../../../examples/demolition-demo/demolition-runtime';

/**
 * Example: Execute HoloScript composition via Runtime Registry
 */
export function demolitionExample() {
  console.log('\n=== HoloScript Runtime Integration Example ===\n');

  // 1. Check registered runtimes
  console.log('1. Checking registered runtimes...');
  const stats = RuntimeRegistry.getStatistics();
  console.log(`   Total runtimes: ${stats.totalRuntimes}`);
  stats.runtimes.forEach((runtime) => {
    console.log(`   - ${runtime.name} (${runtime.id}) v${runtime.version}`);
    console.log(`     Types: ${runtime.types.join(', ')}`);
    console.log(`     Tags: ${runtime.tags.join(', ')}`);
  });

  // 2. Create HoloScript composition (simulated - would come from parser)
  console.log('\n2. Creating HoloScript composition...');
  const composition: HoloComposition = {
    name: 'ExplosiveDemolition',
    type: 'demolition',
    version: '1.0.0',
    entities: [
      {
        name: 'Building',
        type: 'structure',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        traits: [
          {
            name: 'structural',
            properties: {
              floors: 3,
              columnsPerFloor: 4,
              columnSpacing: 5.0,
            },
          },
        ],
      },
      {
        name: 'DebrisObjects',
        type: 'fracturable',
        position: [0, 3, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        count: 8,
        distribution: 'circular',
        radius: 15.0,
        traits: [
          {
            name: 'fracturable',
            properties: {
              geometry: { type: 'box', size: [2, 2, 2] },
              material: { type: 'concrete', fractureThreshold: 1200 },
              fracture: { pattern: 'voronoi', fragmentCount: 10 },
            },
          },
        ],
      },
    ],
    traits: [
      {
        name: 'physics',
        properties: {
          gravity: [0, -9.8, 0],
          timeScale: 1.0,
        },
      },
      {
        name: 'camera',
        properties: {
          position: [0, 20, 50],
          target: [0, 10, 0],
          fov: 60,
          effects: {
            shake: { enabled: true, intensity: 1.0, decay: 0.9 },
            autoFollow: true,
          },
        },
      },
    ],
  };

  console.log(`   Composition: ${composition.name}`);
  console.log(`   Type: ${composition.type}`);
  console.log(`   Entities: ${composition.entities.length}`);
  console.log(`   Traits: ${composition.traits.length}`);

  // 3. Find compatible runtime
  console.log('\n3. Finding compatible runtime...');
  const compatibleRuntimes = RuntimeRegistry.findByType(composition.type!);
  console.log(`   Found ${compatibleRuntimes.length} compatible runtime(s):`);
  compatibleRuntimes.forEach((runtime) => {
    console.log(`   - ${runtime.name} (${runtime.id})`);
  });

  // 4. Execute composition via registry
  console.log('\n4. Executing composition...');
  const executor = RuntimeRegistry.execute(composition, {
    debug: true,
    targetFPS: 60,
    autoPlay: false, // Manual start for this example
  });

  if (!executor) {
    console.error('   Failed to create executor!');
    return;
  }

  console.log('   Executor created successfully');

  // 5. Start execution
  console.log('\n5. Starting runtime execution...');
  executor.start();
  console.log('   Runtime started');

  // 6. Simulate some frames
  console.log('\n6. Simulating frames...');
  for (let i = 0; i < 5; i++) {
    executor.update(1 / 60); // 60 FPS
    const stats = executor.getStatistics();
    console.log(
      `   Frame ${stats.currentFrame}: ${stats.scene.totalObjects} objects, ${stats.scene.totalFragments} fragments`
    );
  }

  // 7. Get runtime state
  console.log('\n7. Runtime state:');
  const state = executor.getStatistics();
  console.log(`   Running: ${state.isRunning}`);
  console.log(`   Execution time: ${state.executionTime.toFixed(2)}ms`);
  console.log(`   Current frame: ${state.currentFrame}`);

  // 8. Stop execution
  console.log('\n8. Stopping execution...');
  executor.stop();
  console.log('   Stopped');

  console.log('\n=== Example Complete ===\n');
}

/**
 * Example: Query runtimes by capability
 */
export function queryRuntimesExample() {
  console.log('\n=== Runtime Query Example ===\n');

  // Find runtimes with physics
  const physicsRuntimes = RuntimeRegistry.findByCapability('physics');
  console.log(`Runtimes with physics: ${physicsRuntimes.length}`);
  physicsRuntimes.forEach((runtime) => {
    console.log(`  - ${runtime.name}`);
  });

  // Find runtimes with particles
  const particleRuntimes = RuntimeRegistry.findByCapability('particles');
  console.log(`\nRuntimes with particles: ${particleRuntimes.length}`);
  particleRuntimes.forEach((runtime) => {
    console.log(`  - ${runtime.name}`);
  });

  // Find runtimes by tag
  const destructionRuntimes = RuntimeRegistry.findByTag('destruction');
  console.log(`\nRuntimes with 'destruction' tag: ${destructionRuntimes.length}`);
  destructionRuntimes.forEach((runtime) => {
    console.log(`  - ${runtime.name}`);
  });
}

/**
 * Example: Direct runtime access
 */
export function directRuntimeExample() {
  console.log('\n=== Direct Runtime Access Example ===\n');

  const runtime = RuntimeRegistry.get('demolition');

  if (!runtime) {
    console.error('Demolition runtime not found!');
    return;
  }

  console.log(`Runtime: ${runtime.name}`);
  console.log(`Version: ${runtime.version}`);
  console.log(`Supported types: ${runtime.supportedTypes.join(', ')}`);

  console.log('\nCapabilities:');
  if (runtime.capabilities.physics) {
    console.log('  Physics:');
    console.log(`    Gravity: ${runtime.capabilities.physics.gravity}`);
    console.log(`    Collision: ${runtime.capabilities.physics.collision}`);
    console.log(`    Fluids: ${runtime.capabilities.physics.fluids}`);
  }

  if (runtime.capabilities.performance) {
    console.log('  Performance:');
    console.log(`    Max entities: ${runtime.capabilities.performance.maxEntities}`);
    console.log(`    Max particles: ${runtime.capabilities.performance.maxParticles}`);
    console.log(`    Target FPS: ${runtime.capabilities.performance.targetFPS}`);
  }

  console.log('\nMetadata:');
  console.log(`  Author: ${runtime.metadata.author}`);
  console.log(`  Description: ${runtime.metadata.description}`);
  console.log(`  License: ${runtime.metadata.license}`);
  console.log(`  Tags: ${runtime.metadata.tags?.join(', ')}`);
}

// Run examples if executed directly
if (require.main === module) {
  demolitionExample();
  queryRuntimesExample();
  directRuntimeExample();
}
