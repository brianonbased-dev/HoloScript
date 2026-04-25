/**
 * Edge Case Tests
 *
 * Boundary conditions, empty inputs, degenerate cases,
 * and error recovery across all modules.
 */
import { describe, it, expect } from 'vitest';

// All modules
import { NodeGraph } from '../logic/NodeGraph';
import { NodeGraphCompiler } from '../logic/NodeGraphCompiler';
import { TerrainSystem } from '@holoscript/engine/environment/TerrainSystem';
import { TerrainBrush } from '@holoscript/engine/environment/TerrainBrush';
import { EnvironmentManager } from '@holoscript/engine/environment/EnvironmentPresets';
import { AnimationGraph } from '@holoscript/engine/animation/AnimationGraph';
import { AnimationTransitionSystem } from '@holoscript/engine/animation/AnimationTransitions';
import { CutsceneTimeline, CutsceneBuilder } from '@holoscript/engine/animation/CutsceneTimeline';
import { EntityAuthority } from '@holoscript/mesh';
import { NetworkInterpolation } from '@holoscript/mesh';
import { ReplicationManager } from '@holoscript/mesh';
import { NoiseGenerator } from '@holoscript/engine/procedural/NoiseGenerator';
import { LSystemGenerator } from '@holoscript/engine/procedural/LSystemGenerator';
import { BuildingGenerator } from '@holoscript/engine/procedural/BuildingGenerator';

describe('Cycle 110: Edge Case Tests', () => {
  // -------------------------------------------------------------------------
  // Empty / Zero inputs
  // -------------------------------------------------------------------------

  it('should handle empty graph compilation', () => {
    const graph = new NodeGraph();
    const compiler = new NodeGraphCompiler();
    const result = compiler.compile(graph);

    expect(result.directives).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle terrain height query outside bounds', () => {
    const terrain = new TerrainSystem();
    terrain.createTerrain({
      id: 't',
      width: 10,
      depth: 10,
      resolution: 5,
      maxHeight: 5,
      position: [0, 0, 0],
    });

    expect(terrain.getHeightAt('t', -100, -100)).toBe(0);
    expect(terrain.getHeightAt('t', 1000, 1000)).toBe(0);
    expect(terrain.getHeightAt('nonexistent', 5, 5)).toBe(0);
  });

  it('should handle brush on nonexistent terrain', () => {
    const terrain = new TerrainSystem();
    const brush = new TerrainBrush(terrain);
    const stroke = brush.apply('does_not_exist', 0, 0);

    expect(stroke.affectedCells).toHaveLength(0);
  });

  it('should handle animation graph with no clips', () => {
    const graph = new AnimationGraph();
    const output = graph.update(0.016);
    expect(output.size).toBe(0);
  });

  it('should handle transition system with no active blends', () => {
    const system = new AnimationTransitionSystem();
    const results = system.update(0.016, new Map(), new Map());
    expect(results.size).toBe(0);
    expect(system.isTransitioning('anything')).toBe(false);
  });

  it('should handle cutscene stop and replay', () => {
    const timeline = new CutsceneTimeline();
    const scene = new CutsceneBuilder('test', 'Test')
      .addTrack('Main')
      .addEvent(0, 'animation', 0, 1, {})
      .build();

    timeline.load(scene);
    timeline.play('test');
    timeline.update(0.5);
    timeline.stop('test');

    expect(timeline.isPlaying('test')).toBe(false);
    expect(timeline.getCurrentTime('test')).toBe(0);

    // Replay
    timeline.play('test');
    expect(timeline.isPlaying('test')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Authority edge cases
  // -------------------------------------------------------------------------

  it('should not transfer non-transferable entities', () => {
    const auth = new EntityAuthority('player1');
    auth.register('sacred', 'player2', { transferable: false });
    const request = auth.requestTransfer('sacred');
    expect(request).toBeNull();
  });

  it('should not request transfer of own entity', () => {
    const auth = new EntityAuthority('player1');
    auth.register('my_thing', 'player1');
    const request = auth.requestTransfer('my_thing');
    expect(request).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Network edge cases
  // -------------------------------------------------------------------------

  it('should handle interpolation with no snapshots', () => {
    const interp = new NetworkInterpolation();
    const state = interp.getInterpolatedState('nonexistent', 1000);
    expect(state).toBeNull();
  });

  it('should snap to server position when distance exceeds threshold', () => {
    const interp = new NetworkInterpolation({ snapThreshold: 5 });
    const result = interp.smoothCorrection(
      [0, 0, 0],
      [100, 0, 0], // Far away
      0.016
    );
    // Should snap directly
    expect(result[0]).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Replication edge cases
  // -------------------------------------------------------------------------

  it('should not generate updates for non-dirty entities', () => {
    const mgr = new ReplicationManager();
    mgr.register('e1', 'transform', 'p1', { updateIntervalMs: 0 });
    mgr.updateSnapshot('e1', { position: [1, 0, 0] });

    // First update
    mgr.generateUpdates(100000);

    // No changes → no update
    const updates = mgr.generateUpdates(200000);
    expect(updates.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Procedural edge cases
  // -------------------------------------------------------------------------

  it('should handle single-iteration L-system', () => {
    const gen = new LSystemGenerator();
    const result = gen.generate({
      axiom: 'F',
      rules: [{ symbol: 'F', replacement: 'FF' }],
      angle: 25,
      length: 1,
      lengthScale: 0.8,
      iterations: 1,
    });
    expect(result.segments.length).toBe(2); // FF = 2 segments
  });

  it('should generate 1-floor building', () => {
    const gen = new BuildingGenerator();
    const result = gen.generate({
      id: 'shed',
      floors: 1,
      floorHeight: 2.5,
      footprint: { width: 4, depth: 3 },
      style: 'warehouse',
      seed: 1,
    });

    expect(result.floorPlans).toHaveLength(1);
    expect(result.boundingBox.max[1]).toBe(2.5);
  });

  // -------------------------------------------------------------------------
  // Time of Day edge cases
  // -------------------------------------------------------------------------

  it('should wrap time past 24 hours', () => {
    const mgr = new EnvironmentManager();
    mgr.setTimeOfDay(25); // Should wrap to 1
    expect(mgr.getTimeOfDay().currentHour).toBeCloseTo(1, 0);
  });
});
