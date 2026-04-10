/**
 * HoloScript Robotics Pipeline Demonstration
 *
 * This script demonstrates:
 * 1. HoloScript → URDF compilation for a 2-DOF robot arm
 * 2. HoloScript → SDF compilation for Gazebo/Isaac Sim
 * 3. HoloScript → USD Physics compilation for NVIDIA Isaac Sim native
 * 4. @joint trait support for articulated robots
 *
 * Run with: npx tsx examples/robotics/demo-urdf-compilation.ts
 */

import { URDFCompiler } from '../../packages/core/src/compiler/URDFCompiler';
import { SDFCompiler } from '../../packages/core/src/compiler/SDFCompiler';
import {
  USDPhysicsCompiler,
  compileForIsaacSim,
} from '../../packages/core/src/compiler/USDPhysicsCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
} from '../../packages/core/src/parser/HoloCompositionTypes';
import * as fs from 'fs';
import * as path from 'path';

// Helper to create a robot arm composition programmatically
// In production, this would come from parsing a .holo file
function createTwoDoFRobotArm(): HoloComposition {
  return {
    type: 'Composition',
    name: 'TwoDoFRobotArm',
    objects: [
      // Base (mounted to world)
      {
        name: 'Base',
        properties: [
          { key: 'geometry', value: 'cylinder' },
          { key: 'position', value: [0, 0, 0.05] },
          { key: 'scale', value: 0.15 },
          { key: 'physics', value: { mass: 10.0, type: 'static' } },
        ],
        traits: ['physics', 'collidable'],
      } as HoloObjectDecl,

      // Shoulder joint (first DOF - rotates around Z)
      {
        name: 'ShoulderJoint',
        properties: [
          { key: 'geometry', value: 'cylinder' },
          { key: 'position', value: [0, 0, 0.1] },
          { key: 'scale', value: 0.05 },
          { key: 'physics', value: { mass: 0.5 } },
        ],
        traits: [
          'physics',
          {
            name: 'joint',
            jointType: 'hinge',
            connectedBody: 'Base',
            axis: { x: 0, y: 0, z: 1 },
            limits: { min: -180, max: 180, effort: 100, velocity: 1 },
            damping: 0.1,
          },
        ],
      } as HoloObjectDecl,

      // Upper arm link
      {
        name: 'UpperArm',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'position', value: [0.2, 0, 0.1] },
          { key: 'scale', value: [0.4, 0.08, 0.08] },
          { key: 'physics', value: { mass: 2.0 } },
        ],
        traits: ['physics', 'collidable'],
      } as HoloObjectDecl,

      // Elbow joint (second DOF - rotates around Y)
      {
        name: 'ElbowJoint',
        properties: [
          { key: 'geometry', value: 'cylinder' },
          { key: 'position', value: [0.4, 0, 0.1] },
          { key: 'scale', value: 0.04 },
          { key: 'physics', value: { mass: 0.3 } },
        ],
        traits: [
          'physics',
          {
            name: 'joint',
            jointType: 'hinge',
            connectedBody: 'UpperArm',
            axis: { x: 0, y: 1, z: 0 },
            limits: { min: -135, max: 135, effort: 50, velocity: 1 },
            damping: 0.1,
          },
        ],
      } as HoloObjectDecl,

      // Forearm link
      {
        name: 'Forearm',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'position', value: [0.55, 0, 0.1] },
          { key: 'scale', value: [0.3, 0.06, 0.06] },
          { key: 'physics', value: { mass: 1.0 } },
        ],
        traits: ['physics', 'collidable'],
      } as HoloObjectDecl,

      // End effector
      {
        name: 'EndEffector',
        properties: [
          { key: 'geometry', value: 'sphere' },
          { key: 'position', value: [0.7, 0, 0.1] },
          { key: 'scale', value: 0.05 },
          { key: 'physics', value: { mass: 0.2 } },
        ],
        traits: ['physics'],
      } as HoloObjectDecl,
    ],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    environment: {
      properties: [
        { key: 'physics_engine', value: 'ode' },
        { key: 'gravity', value: [0, 0, -9.81] },
      ],
    },
  };
}

// Main demonstration
async function main() {
  console.log('🤖 HoloScript Robotics Pipeline Demonstration\n');
  console.log('='.repeat(60) + '\n');

  // Create the robot arm composition
  const composition = createTwoDoFRobotArm();
  console.log(`✅ Created composition: "${composition.name}"`);
  console.log(`   - ${composition.objects.length} objects`);
  console.log(`   - 2 revolute joints (shoulder, elbow)\n`);

  // Compile to URDF
  console.log('📦 Compiling to URDF (ROS 2 / Gazebo)...\n');
  const urdfCompiler = new URDFCompiler({
    robotName: 'HoloScriptTwoDoFArm',
    includeVisual: true,
    includeCollision: true,
    includeInertial: true,
  });
  const urdf = urdfCompiler.compile(composition);

  // Save URDF
  const urdfPath = path.join(__dirname, 'output', 'two_dof_arm.urdf');
  fs.mkdirSync(path.dirname(urdfPath), { recursive: true });
  fs.writeFileSync(urdfPath, urdf);
  console.log(`✅ URDF saved to: ${urdfPath}`);
  console.log(`   - Size: ${urdf.length} bytes`);
  console.log(`   - Lines: ${urdf.split('\n').length}\n`);

  // Compile to SDF
  console.log('📦 Compiling to SDF (Gazebo Classic / Isaac Sim)...\n');
  const sdfCompiler = new SDFCompiler({
    worldName: 'HoloScriptRobotWorld',
    physicsEngine: 'ode',
  });
  const sdf = sdfCompiler.compile(composition);

  // Save SDF
  const sdfPath = path.join(__dirname, 'output', 'two_dof_arm.sdf');
  fs.writeFileSync(sdfPath, sdf);
  console.log(`✅ SDF saved to: ${sdfPath}`);
  console.log(`   - Size: ${sdf.length} bytes`);
  console.log(`   - Lines: ${sdf.split('\n').length}\n`);

  // Compile to USD Physics (Isaac Sim Native)
  console.log('📦 Compiling to USD Physics (Isaac Sim Native)...\n');
  const usdPhysics = compileForIsaacSim(composition);

  // Save USD
  const usdPath = path.join(__dirname, 'output', 'two_dof_arm.usda');
  fs.writeFileSync(usdPath, usdPhysics);
  console.log(`✅ USD Physics saved to: ${usdPath}`);
  console.log(`   - Size: ${usdPhysics.length} bytes`);
  console.log(`   - Lines: ${usdPhysics.split('\n').length}`);
  console.log(`   - Includes: PhysicsScene, ArticulationRootAPI, DriveAPI\n`);

  // Print summary
  console.log('='.repeat(60));
  console.log('\n🎯 Pipeline Summary:\n');
  console.log('   HoloScript Composition');
  console.log('         ↓');
  console.log('   URDFCompiler → URDF XML (ROS 2 / Gazebo)');
  console.log('         ↓');
  console.log('   SDFCompiler → SDF XML (Gazebo / Isaac Sim)');
  console.log('         ↓');
  console.log('   USDPhysicsCompiler → USD Physics (Isaac Sim Native) ✅\n');

  console.log('📝 Next Steps for NVIDIA Isaac Sim Integration:');
  console.log('   1. Load USD file directly in Isaac Sim');
  console.log('   2. PhysicsScene pre-configured for Isaac GPU dynamics');
  console.log('   3. ArticulationRootAPI enables robot joint simulation');
  console.log('   4. Ready for OmniGraph control\n');

  // Preview URDF structure
  console.log('📄 URDF Preview (first 50 lines):');
  console.log('-'.repeat(60));
  console.log(urdf.split('\n').slice(0, 50).join('\n'));
  console.log('...\n');

  // Preview USD structure
  console.log('📄 USD Physics Preview (first 50 lines):');
  console.log('-'.repeat(60));
  console.log(usdPhysics.split('\n').slice(0, 50).join('\n'));
  console.log('...\n');
}

main().catch(console.error);
