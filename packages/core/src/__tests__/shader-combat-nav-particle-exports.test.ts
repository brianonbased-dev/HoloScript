/**
 * @fileoverview Tests for ShaderGraph, CombatManager, AStarPathfinder, ParticleSystem barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  ShaderGraph,
  SHADER_NODES,
  CombatManager,
  AStarPathfinder,
  NavMesh,
  ParticleSystem,
} from '../index';

describe('ShaderGraph exports', () => {
  it('ShaderGraph creates nodes and compiles', () => {
    const sg = new ShaderGraph();
    const color = sg.addNode('Color', 0, 0);
    const output = sg.addNode('Output', 200, 0);
    expect(color).not.toBeNull();
    expect(output).not.toBeNull();
    expect(sg.getNodeCount()).toBe(2);

    const compiled = sg.compile();
    expect(compiled.nodeCount).toBe(2);
    expect(typeof compiled.fragmentCode).toBe('string');
  });

  it('ShaderGraph connects nodes', () => {
    const sg = new ShaderGraph();
    const c = sg.addNode('Color', 0, 0)!;
    const o = sg.addNode('Output', 100, 0)!;
    const conn = sg.connect(c.id, 'rgba', o.id, 'albedo');
    expect(conn).not.toBeNull();
    expect(sg.getConnections().length).toBe(1);
  });

  it('ShaderGraph registers multiple node types', () => {
    const sg = new ShaderGraph();
    const color = sg.addNode('Color', 0, 0);
    const output = sg.addNode('Output', 300, 0);
    expect(color).not.toBeNull();
    expect(output).not.toBeNull();
    // Verify nodes are tracked
    expect(sg.getNodeCount()).toBe(2);
    expect(sg.getNodes().length).toBe(2);
  });

  it('ShaderGraph removeNode works', () => {
    const sg = new ShaderGraph();
    const n = sg.addNode('Color', 0, 0)!;
    expect(sg.getNodeCount()).toBe(1);
    sg.removeNode(n.id);
    expect(sg.getNodeCount()).toBe(0);
  });

  it('ShaderGraph topoSort returns node order', () => {
    const sg = new ShaderGraph();
    sg.addNode('Color', 0, 0);
    sg.addNode('Output', 100, 0);
    const sorted = sg.topoSort();
    expect(sorted.length).toBe(2);
  });
});

describe('CombatManager exports', () => {
  it('CombatManager detects hitbox/hurtbox collisions', () => {
    const cm = new CombatManager();
    cm.addHitBox({
      id: 'hb1',
      ownerId: 'a',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      active: true,
      damage: 10,
      damageType: 'physical',
      knockback: 1,
    });
    cm.addHurtBox({
      id: 'hr1',
      ownerId: 'b',
      position: { x: 0.5, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      active: true,
    });
    const hits = cm.checkCollisions();
    expect(hits.length).toBe(1);
    expect(hits[0].hitbox.id).toBe('hb1');
  });

  it('CombatManager combo system advances correctly', () => {
    const cm = new CombatManager();
    cm.registerCombo('c1', [
      { name: 'Jab', input: 'A', damage: 5, window: 1 },
      { name: 'Cross', input: 'B', damage: 8, window: 1 },
    ]);
    const r1 = cm.advanceCombo('c1', 'A');
    expect(r1.hit).toBe(true);
    expect(r1.completed).toBe(false);
    const r2 = cm.advanceCombo('c1', 'B');
    expect(r2.hit).toBe(true);
    expect(r2.completed).toBe(true);
  });

  it('CombatManager cooldowns work', () => {
    const cm = new CombatManager();
    cm.startCooldown('fireball', 2);
    expect(cm.isOnCooldown('fireball')).toBe(true);
    cm.updateCooldowns(1);
    expect(cm.getCooldownRemaining('fireball')).toBeCloseTo(1);
    cm.updateCooldowns(1.5);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  it('CombatManager findTargets sorts by distance/priority', () => {
    const cm = new CombatManager();
    const targets = cm.findTargets(
      { x: 0, y: 0, z: 0 },
      [
        { entityId: 'far', position: { x: 10, y: 0, z: 0 } },
        { entityId: 'near', position: { x: 2, y: 0, z: 0 } },
      ],
      20
    );
    expect(targets.length).toBe(2);
    expect(targets[0].entityId).toBe('near');
  });

  it('CombatManager no self-hit', () => {
    const cm = new CombatManager();
    cm.addHitBox({
      id: 'self-hb',
      ownerId: 'player',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      active: true,
      damage: 10,
      damageType: 'physical',
      knockback: 1,
    });
    cm.addHurtBox({
      id: 'self-hr',
      ownerId: 'player',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      active: true,
    });
    const hits = cm.checkCollisions();
    expect(hits.length).toBe(0);
  });
});

describe('AStarPathfinder exports', () => {
  function createSimpleMesh(): NavMesh {
    const mesh = new NavMesh();
    const a = mesh.addPolygon(
      [
        { x: -1, y: 0, z: -1 },
        { x: 1, y: 0, z: -1 },
        { x: 1, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
      ],
      true,
      1
    );
    const b = mesh.addPolygon(
      [
        { x: 3, y: 0, z: -1 },
        { x: 5, y: 0, z: -1 },
        { x: 5, y: 0, z: 1 },
        { x: 3, y: 0, z: 1 },
      ],
      true,
      1
    );
    mesh.connectPolygons(a.id, b.id);
    return mesh;
  }

  it('AStarPathfinder finds path between connected polygons', () => {
    const pf = new AStarPathfinder(createSimpleMesh());
    const result = pf.findPath({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('AStarPathfinder obstacle blocks path', () => {
    const pf = new AStarPathfinder(createSimpleMesh());
    pf.addObstacle('wall', { x: 4, y: 0, z: 0 }, 2);
    expect(pf.getObstacleCount()).toBe(1);
    const result = pf.findPath({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    expect(result.found).toBe(false);
  });

  it('AStarPathfinder smoothPath reduces waypoints', () => {
    const pf = new AStarPathfinder(createSimpleMesh());
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    const smoothed = pf.smoothPath(points);
    expect(smoothed.length).toBeLessThanOrEqual(points.length);
  });
});

describe('ParticleSystem exports', () => {
  it('ParticleSystem creates and emits particles', () => {
    const ps = new ParticleSystem({
      shape: 'point',
      rate: 100,
      maxParticles: 50,
      lifetime: [1, 2],
      speed: [1, 3],
      size: [0.1, 0.3],
      sizeEnd: [0, 0],
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      position: { x: 0, y: 0, z: 0 },
    });
    ps.update(0.1);
    expect(ps.getActiveCount()).toBeGreaterThan(0);
  });

  it('ParticleSystem burst mode integrates with update', () => {
    const ps = new ParticleSystem({
      shape: 'point',
      rate: 0,
      maxParticles: 100,
      lifetime: [1, 2],
      speed: [1, 3],
      size: [0.1, 0.3],
      sizeEnd: [0, 0],
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      position: { x: 0, y: 0, z: 0 },
    });
    ps.burst(20);
    ps.update(0.016); // Tick to process burst
    expect(ps.getActiveCount()).toBeGreaterThan(0);
  });

  it('ParticleSystem setEmitting controls emission', () => {
    const ps = new ParticleSystem({
      shape: 'point',
      rate: 100,
      maxParticles: 50,
      lifetime: [1, 2],
      speed: [1, 3],
      size: [0.1, 0.3],
      sizeEnd: [0, 0],
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      position: { x: 0, y: 0, z: 0 },
    });
    expect(ps.isEmitting()).toBe(true);
    ps.setEmitting(false);
    expect(ps.isEmitting()).toBe(false);
  });

  it('ParticleSystem particles eventually expire', () => {
    const ps = new ParticleSystem({
      shape: 'point',
      rate: 100,
      maxParticles: 50,
      lifetime: [0.05, 0.05],
      speed: [1, 1],
      size: [0.1, 0.1],
      sizeEnd: [0, 0],
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      position: { x: 0, y: 0, z: 0 },
    });
    ps.update(0.01); // Emit some
    const countBefore = ps.getActiveCount();
    expect(countBefore).toBeGreaterThan(0);
    ps.setEmitting(false);
    ps.update(1.0); // Wait well past lifetime
    expect(ps.getActiveCount()).toBe(0);
  });

  it('ParticleSystem setPosition moves emitter', () => {
    const ps = new ParticleSystem({
      shape: 'point',
      rate: 10,
      maxParticles: 50,
      lifetime: [1, 2],
      speed: [1, 3],
      size: [0.1, 0.3],
      sizeEnd: [0, 0],
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      position: { x: 0, y: 0, z: 0 },
    });
    ps.setPosition(5, 10, 3);
    expect(ps.getConfig().position.x).toBe(5);
    expect(ps.getConfig().position.y).toBe(10);
  });
});
