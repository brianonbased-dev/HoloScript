/**
 * Integration Tests
 *
 * Cross-system scenarios that verify multiple modules working together.
 * Tests the boundaries between subsystems created across Cycles 103-109.
 */
import { describe, it, expect } from 'vitest';

// Logic layer
import { NodeGraph, BUILT_IN_TYPES } from '../logic/NodeGraph';
import { NodeGraphCompiler } from '../logic/NodeGraphCompiler';

// Environment layer
import { TerrainSystem } from '@holoscript/engine/environment/TerrainSystem';
import {
  EnvironmentManager,
  PRESET_SUNNY_DAY,
} from '@holoscript/engine/environment/EnvironmentPresets';
import { TerrainBrush } from '@holoscript/engine/environment/TerrainBrush';

// Physics layer
import { ConstraintSolver } from '@holoscript/engine/physics/ConstraintSolver';
import { VehicleSystem, createDefaultCar } from '@holoscript/engine/physics/VehicleSystem';

// Multiplayer layer
import { EntityAuthority } from '@holoscript/mesh/multiplayer/EntityAuthority';
import { NetworkInterpolation } from '@holoscript/mesh/multiplayer/NetworkInterpolation';
import { ReplicationManager } from '@holoscript/mesh/multiplayer/ReplicationManager';

// Procedural layer
import { NoiseGenerator } from '@holoscript/engine/procedural/NoiseGenerator';
import { LSystemGenerator, TREE_SIMPLE } from '@holoscript/engine/procedural/LSystemGenerator';
import { BuildingGenerator } from '@holoscript/engine/procedural/BuildingGenerator';

// Animation layer
import { AnimationGraph, AnimationClip } from '@holoscript/engine/animation/AnimationGraph';
import { CutsceneTimeline, CutsceneBuilder } from '@holoscript/engine/animation/CutsceneTimeline';

describe('Cycle 110: Integration Tests', () => {
  // -------------------------------------------------------------------------
  // Logic → Compiler Pipeline
  // -------------------------------------------------------------------------

  it('should compile a visual graph with events and state into HoloScript directives', () => {
    const graph = new NodeGraph();

    // Build: OnEvent, SetState, MathAdd — compiler detects them by type
    const eventNode = graph.addNode('OnEvent', { x: 0, y: 0 }, { eventName: 'click' });
    const stateNode = graph.addNode('SetState', { x: 2, y: 0 }, { key: 'score', initialValue: 10 });
    const mathNode = graph.addNode('MathAdd', { x: 4, y: 0 }, { a: 5, b: 3 });

    // Connect OnEvent payload (any) → SetState value (any) — type compatible
    graph.connect(eventNode.id, 'payload', stateNode.id, 'value');

    const compiler = new NodeGraphCompiler();
    const result = compiler.compile(graph);

    expect(result.directives.length).toBeGreaterThan(0);
    // Compiler extracts state from SetState nodes
    const stateDirective = result.directives.find((d) => d.type === 'state');
    expect(stateDirective).toBeDefined();
    // Compiler extracts lifecycle handlers from OnEvent nodes
    const lifecycleDirective = result.directives.find((d) => d.type === 'lifecycle');
    expect(lifecycleDirective).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Terrain + Noise + Brush Pipeline
  // -------------------------------------------------------------------------

  it('should create terrain from noise then sculpt with brush', () => {
    const noise = new NoiseGenerator({ seed: 42, scale: 0.05, octaves: 4 });
    const terrain = new TerrainSystem();

    // Generate heightmap from noise
    const res = 33;
    const heightmap = noise.generateMap(res, res, 'value');
    terrain.createFromHeightmap(
      {
        id: 'world',
        width: 100,
        depth: 100,
        resolution: res,
        maxHeight: 15,
        position: [0, 0, 0],
      },
      heightmap
    );

    // Sculpt with brush
    const brush = new TerrainBrush(terrain, { mode: 'raise', radius: 3, strength: 0.5 });
    const stroke = brush.apply('world', 16, 16);

    expect(stroke.affectedCells.length).toBeGreaterThan(0);

    // Verify height changed
    const h = terrain.getHeightAt('world', 50, 50);
    expect(h).toBeGreaterThan(0);

    // Collider should work
    const collider = terrain.getCollider('world');
    expect(collider).not.toBeNull();
    expect(typeof collider!.getHeightAt(50, 50)).toBe('number');
  });

  // -------------------------------------------------------------------------
  // Vehicle + Replication Pipeline
  // -------------------------------------------------------------------------

  it('should replicate a vehicle with delta compression', () => {
    const vehicleSystem = new VehicleSystem();
    const replication = new ReplicationManager();

    // Create vehicle
    const carDef = createDefaultCar('net_car');
    const car = vehicleSystem.createVehicle(carDef, { x: 0, y: 0.65, z: 0 });

    // Register for replication
    replication.register('net_car', 'vehicle', 'player1', { updateIntervalMs: 0 });
    replication.updateSnapshot('net_car', {
      position: { ...car.position },
      velocity: { ...car.linearVelocity },
    });

    // First update: full snapshot
    const updates1 = replication.generateUpdates(100000);
    expect(updates1.length).toBe(1);
    expect(updates1[0].isFullSnapshot).toBe(true);

    // Simulate driving
    vehicleSystem.setThrottle('net_car', 1);
    vehicleSystem.update('net_car', 1 / 60);
    const updatedCar = vehicleSystem.getVehicle('net_car')!;

    // Update replication
    replication.updateSnapshot('net_car', {
      position: { ...updatedCar.position },
      velocity: { ...updatedCar.linearVelocity },
    });

    const updates2 = replication.generateUpdates(200000);
    expect(updates2.length).toBe(1);
    expect(updates2[0].isFullSnapshot).toBe(false); // Delta
  });

  // -------------------------------------------------------------------------
  // Animation + Cutscene Pipeline
  // -------------------------------------------------------------------------

  it('should run animation graph states within a cutscene timeline', () => {
    // Animation graph
    const animGraph = new AnimationGraph();
    animGraph.addClip({
      id: 'walk',
      name: 'Walk',
      duration: 1,
      loop: true,
      speed: 1,
      tracks: [
        {
          targetProperty: 'position.z',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 2 },
          ],
          interpolation: 'linear',
        },
      ],
    });
    animGraph.addState('walk', 'walk');

    // Cutscene that plays animation
    const timeline = new CutsceneTimeline();
    const scene = new CutsceneBuilder('chase', 'Chase Scene')
      .addTrack('Character Animation')
      .addEvent(0, 'animation', 0, 3, { clipId: 'walk', entityId: 'hero' })
      .addTrack('Camera')
      .addEvent(1, 'camera', 0, 3, { position: [0, 5, -10], target: 'hero' })
      .build();

    timeline.load(scene);
    timeline.play('chase');

    // Advance both systems
    const timelineEvents = timeline.update(0.5);
    const animOutput = animGraph.update(0.5);

    expect(timelineEvents.get('chase')!.length).toBeGreaterThan(0);
    expect(animOutput.has('position.z')).toBe(true);
    expect(animOutput.get('position.z')!).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Procedural + Environment
  // -------------------------------------------------------------------------

  it('should scatter L-system trees on noise-generated terrain', () => {
    const noise = new NoiseGenerator({ seed: 77, scale: 0.02 });
    const terrain = new TerrainSystem();
    const lsys = new LSystemGenerator(42);

    // Create terrain
    const heightmap = noise.generateMap(17, 17, 'value');
    terrain.createFromHeightmap(
      {
        id: 'forest',
        width: 50,
        depth: 50,
        resolution: 17,
        maxHeight: 10,
        position: [0, 0, 0],
      },
      heightmap
    );

    // Place trees at sample points
    const treePositions: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const wx = 5 + i * 8;
      const wz = 25;
      const h = terrain.getHeightAt('forest', wx, wz);
      treePositions.push({ x: wx, y: h, z: wz });
    }

    // Generate a tree for each position
    const tree = lsys.generate(TREE_SIMPLE);
    expect(tree.segments.length).toBeGreaterThan(0);
    expect(treePositions).toHaveLength(5);
    expect(treePositions.every((p) => p.y >= 0)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Authority + Interpolation handoff
  // -------------------------------------------------------------------------

  it('should transfer authority and start interpolating remote entity', () => {
    const auth = new EntityAuthority('player1');
    const interp = new NetworkInterpolation({ bufferTimeMs: 50 });

    // Player2 owns entity
    auth.register('crate', 'player2');
    expect(auth.isLocalOwner('crate')).toBe(false);

    // Player1 requests transfer
    const request = auth.requestTransfer('crate');
    expect(request).not.toBeNull();
    auth.approveTransfer(request!.id);
    expect(auth.isLocalOwner('crate')).toBe(true);

    // Push network snapshots for the entity before and after transfer
    interp.pushSnapshot({
      entityId: 'crate',
      timestamp: 0,
      position: [0, 1, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    interp.pushSnapshot({
      entityId: 'crate',
      timestamp: 100,
      position: [5, 1, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });

    // Interpolate at midpoint
    const state = interp.getInterpolatedState('crate', 100); // renderTime = 50
    expect(state).not.toBeNull();
    expect(state!.position.x).toBeCloseTo(2.5, 0);
  });
});
