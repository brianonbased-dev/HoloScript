/**
 * Core Subsystem Benchmarks
 *
 * Measures performance of animation, physics, ECS, traits, and serialization.
 * Complements performance.bench.ts which covers parser/runtime/type-checker.
 *
 * Run with: npx vitest bench src/__tests__/CoreBenchmarks.bench.ts
 *
 * @module benchmarks
 */

import { describe, bench, beforeAll } from 'vitest';
import { AnimationEngine, Easing } from '../animation/AnimationEngine';
import { SpringAnimator, SpringPresets } from '../animation/SpringAnimator';
import { EntityRegistry } from '../ecs/EntityRegistry';
import { ComponentStore } from '../ecs/ComponentStore';
import { BoneSystem } from '../animation/BoneSystem';
import { IKSolver } from '../animation/IKSolver';

// =============================================================================
// ANIMATION ENGINE BENCHMARKS
// =============================================================================

describe('AnimationEngine Performance', () => {
  let engine: AnimationEngine;

  beforeAll(() => {
    engine = new AnimationEngine();
  });

  bench('start + update 100 animations', () => {
    const localEngine = new AnimationEngine();
    for (let i = 0; i < 100; i++) {
      localEngine.start({
        target: `node-${i}`,
        property: 'opacity',
        from: 0,
        to: 1,
        duration: 1.0,
        easing: Easing.easeInOut,
      });
    }
    // Simulate 60 frames
    for (let f = 0; f < 60; f++) {
      localEngine.update(0.016);
    }
  });

  bench('spring animator 1000 updates', () => {
    const spring = new SpringAnimator(0, SpringPresets.snappy);
    spring.setTarget(1.0);
    for (let i = 0; i < 1000; i++) {
      spring.update(0.016);
    }
  });

  bench('10 concurrent springs', () => {
    const springs: SpringAnimator[] = [];
    for (let i = 0; i < 10; i++) {
      const s = new SpringAnimator(0, SpringPresets.gentle);
      s.setTarget(Math.random() * 10);
      springs.push(s);
    }
    for (let frame = 0; frame < 120; frame++) {
      for (const s of springs) s.update(0.016);
    }
  });
});

// =============================================================================
// BONE / IK BENCHMARKS
// =============================================================================

describe('Skeletal & IK Performance', () => {
  bench('build 50-bone skeleton', () => {
    const bones = new BoneSystem();
    bones.addBone('root', 'Root', null);
    for (let i = 1; i < 50; i++) {
      bones.addBone(`bone-${i}`, `Bone${i}`, i < 10 ? 'root' : `bone-${i - 1}`, { ty: 0.1 });
    }
    bones.updateWorldTransforms();
  });

  bench('IK solve 10 chains × 20 iterations', () => {
    const solver = new IKSolver();
    for (let c = 0; c < 10; c++) {
      solver.addChain({
        id: `chain-${c}`,
        bones: [
          { id: `b1-${c}`, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.3 },
          { id: `b2-${c}`, position: { x: 0.3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.3 },
        ],
        target: { x: 0.5, y: 0.2, z: 0 },
        weight: 1,
        iterations: 20,
      });
    }
    solver.solveAll();
  });
});

// =============================================================================
// ECS BENCHMARKS
// =============================================================================

describe('ECS Performance', () => {
  bench('create 1000 entities', () => {
    const registry = new EntityRegistry();
    for (let i = 0; i < 1000; i++) {
      registry.create();
    }
  });

  bench('create + tag 500 entities', () => {
    const registry = new EntityRegistry();
    for (let i = 0; i < 500; i++) {
      const id = registry.create();
      registry.addTag(id, i % 2 === 0 ? 'static' : 'dynamic');
    }
  });

  bench('component store: add + query 1000', () => {
    const store = new ComponentStore();
    for (let i = 0; i < 1000; i++) {
      store.set(i, 'position', { x: i, y: i * 2, z: 0 });
      store.set(i, 'velocity', { x: 0, y: 0, z: -1 });
    }
    // Query all with both components
    const results: number[] = [];
    store.forEach(['position', 'velocity'], (entity) => {
      results.push(entity);
    });
  });
});

// =============================================================================
// TRAIT REGISTRATION BENCHMARKS
// =============================================================================

describe('Trait Attach/Detach Performance', () => {
  bench('attach 500 traits (lightweight handler)', () => {
    // Simulates the attach overhead of trait handlers
    const nodes: any[] = [];
    const handler = {
      name: 'benchTrait',
      defaultConfig: { speed: 1, strength: 10 },
      onAttach(node: any, config: any) {
        node.__benchState = { ...config, active: true };
      },
      onDetach(node: any) {
        delete node.__benchState;
      },
    };

    for (let i = 0; i < 500; i++) {
      const node = { id: `node-${i}` };
      handler.onAttach(node, handler.defaultConfig);
      nodes.push(node);
    }
  });

  bench('attach + detach 500 traits', () => {
    const handler = {
      name: 'benchTrait',
      defaultConfig: { speed: 1 },
      onAttach(node: any, config: any) {
        node.__s = { ...config };
      },
      onDetach(node: any) {
        delete node.__s;
      },
    };

    for (let i = 0; i < 500; i++) {
      const node = { id: `n${i}` };
      handler.onAttach(node, handler.defaultConfig);
      handler.onDetach(node);
    }
  });
});

// =============================================================================
// SERIALIZATION BENCHMARKS
// =============================================================================

describe('Serialization Performance', () => {
  bench('JSON serialize 1000-node graph', () => {
    const nodes: any[] = [];
    for (let i = 0; i < 1000; i++) {
      nodes.push({
        id: `node-${i}`,
        type: 'entity',
        properties: { position: { x: i, y: i * 2, z: 0 }, scale: 1.0, color: '#ff0000' },
        traits: ['pressable', 'grabbable'],
        children: i < 999 ? [`node-${i + 1}`] : [],
      });
    }
    JSON.stringify(nodes);
  });

  bench('JSON round-trip 500-node graph', () => {
    const nodes: any[] = [];
    for (let i = 0; i < 500; i++) {
      nodes.push({
        id: `n-${i}`,
        props: { x: i, y: i, z: i, traits: ['a', 'b'], meta: { created: Date.now() } },
      });
    }
    const json = JSON.stringify(nodes);
    JSON.parse(json);
  });

  bench('Map serialize (1000 entries via Array.from)', () => {
    const map = new Map<string, any>();
    for (let i = 0; i < 1000; i++) {
      map.set(`key-${i}`, { value: i, label: `Item ${i}` });
    }
    const serialized = JSON.stringify(Array.from(map.entries()));
    const restored = new Map(JSON.parse(serialized));
  });
});
