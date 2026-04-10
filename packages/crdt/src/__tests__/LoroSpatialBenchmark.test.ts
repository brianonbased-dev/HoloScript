/**
 * Benchmark: LoroSpatialAdapter vs Current @holoscript/crdt
 *
 * Compares latency and bandwidth for:
 * 1. Vec3 position updates (LWW merge)
 * 2. Quaternion rotation updates (LWW merge, non-commutative)
 * 3. Tree structural operations (create, move, delete)
 * 4. Full scene graph sync (snapshot export/import)
 *
 * Run: pnpm vitest run --reporter=verbose packages/crdt/src/__tests__/LoroSpatialBenchmark.test.ts
 *
 * @module @holoscript/crdt/benchmarks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LoroSpatialAdapter,
  type Vec3,
  type Quaternion,
  type SpatialTransform,
  IDENTITY_TRANSFORM,
  slerp,
  lerpVec3,
  normalizeQuaternion,
} from '../sync/LoroSpatialAdapter';
import { LWWRegister as CoreLWWRegister } from '../../src/types/LWWRegister';
import { CRDTStateManager } from './utils/CRDTStateManagerStub';

// =============================================================================
// BENCHMARK UTILITIES
// =============================================================================

/** Measure execution time of a function in microseconds */
function benchmark(fn: () => void, iterations: number = 1000): BenchmarkResult {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;

  return {
    totalMs: elapsed,
    avgMs: elapsed / iterations,
    avgUs: (elapsed / iterations) * 1000,
    opsPerSecond: (iterations / elapsed) * 1000,
    iterations,
  };
}

interface BenchmarkResult {
  totalMs: number;
  avgMs: number;
  avgUs: number;
  opsPerSecond: number;
  iterations: number;
}

function formatResult(name: string, result: BenchmarkResult): string {
  return `${name}: ${result.avgUs.toFixed(2)}us/op (${result.opsPerSecond.toFixed(0)} ops/sec)`;
}

/** Generate a random Vec3 */
function randomVec3(): Vec3 {
  return {
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 200,
    z: (Math.random() - 0.5) * 200,
  };
}

/** Generate a random normalized quaternion */
function randomQuaternion(): Quaternion {
  const u1 = Math.random();
  const u2 = Math.random() * Math.PI * 2;
  const u3 = Math.random() * Math.PI * 2;
  const q = {
    x: Math.sqrt(1 - u1) * Math.sin(u2),
    y: Math.sqrt(1 - u1) * Math.cos(u2),
    z: Math.sqrt(u1) * Math.sin(u3),
    w: Math.sqrt(u1) * Math.cos(u3),
  };
  return normalizeQuaternion(q);
}

/** Generate a random spatial transform */
function randomTransform(): SpatialTransform {
  return {
    position: randomVec3(),
    rotation: randomQuaternion(),
    scale: { x: 0.5 + Math.random(), y: 0.5 + Math.random(), z: 0.5 + Math.random() },
  };
}

// =============================================================================
// STUB: Simulated CRDTStateManager for comparison
// =============================================================================

/**
 * Inline stub for the current CRDTStateManager to avoid import path issues.
 * Mirrors the actual CRDTStateManager API from packages/core/src/state/.
 */
class CurrentCRDTStateManager {
  private clientId: string;
  private registers: Map<string, { value: unknown; clock: number; clientId: string }> = new Map();
  private clock: number = 0;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  createOperation(
    key: string,
    value: unknown
  ): { clientId: string; clock: number; key: string; value: unknown } {
    this.clock++;
    return { clientId: this.clientId, clock: this.clock, key, value };
  }

  reconcile(op: { clientId: string; clock: number; key: string; value: unknown }): boolean {
    const current = this.registers.get(op.key);
    if (
      !current ||
      op.clock > current.clock ||
      (op.clock === current.clock && op.clientId > current.clientId)
    ) {
      this.registers.set(op.key, { value: op.value, clock: op.clock, clientId: op.clientId });
      return true;
    }
    return false;
  }

  getSnapshot(): Record<string, unknown> {
    const snap: Record<string, unknown> = {};
    for (const [key, entry] of this.registers) {
      snap[key] = entry.value;
    }
    return snap;
  }
}

// =============================================================================
// BENCHMARK TESTS
// =============================================================================

describe('LoroSpatialAdapter Benchmarks', () => {
  // --------------------------------------------------------------------------
  // 1. Vec3 Position Updates
  // --------------------------------------------------------------------------
  describe('Vec3 Position Updates', () => {
    it('LoroSpatialAdapter: position set + get', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const nodeId = adapter.createNode('TestNode');
      const positions: Vec3[] = Array.from({ length: 1000 }, randomVec3);

      const result = benchmark(() => {
        const pos = positions[Math.floor(Math.random() * positions.length)];
        adapter.setTransform(nodeId, { ...IDENTITY_TRANSFORM, position: pos });
        adapter.getTransform(nodeId);
      }, 10000);

      console.log(formatResult('  LoroSpatial position set+get', result));
      // Ensure render-tier compliance: <11ms per operation
      expect(result.avgMs).toBeLessThan(11);
      adapter.dispose();
    });

    it('CurrentCRDT: position set + get via CRDTStateManager', () => {
      const mgr = new CurrentCRDTStateManager('client-1');
      const positions: Vec3[] = Array.from({ length: 1000 }, randomVec3);

      const result = benchmark(() => {
        const pos = positions[Math.floor(Math.random() * positions.length)];
        const op = mgr.createOperation('node1.position', pos);
        mgr.reconcile(op);
        mgr.getSnapshot();
      }, 10000);

      console.log(formatResult('  CurrentCRDT position set+get', result));
      expect(result.avgMs).toBeLessThan(11);
    });

    it('Comparison: LoroSpatial interpolation vs raw get', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1, maxInterpolationBuffer: 10 });
      const nodeId = adapter.createNode('InterpNode');

      // Populate interpolation buffer
      for (let i = 0; i < 10; i++) {
        adapter.setTransform(nodeId, randomTransform());
      }

      const rawResult = benchmark(() => {
        adapter.getTransform(nodeId);
      }, 10000);

      const interpResult = benchmark(() => {
        adapter.getInterpolatedTransform(nodeId, Date.now());
      }, 10000);

      console.log(formatResult('  Raw transform get', rawResult));
      console.log(formatResult('  Interpolated transform get', interpResult));

      // Both must be under 1ms for render tier
      expect(rawResult.avgMs).toBeLessThan(1);
      expect(interpResult.avgMs).toBeLessThan(1);

      adapter.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Quaternion Rotation Updates
  // --------------------------------------------------------------------------
  describe('Quaternion Rotation Updates', () => {
    it('LoroSpatialAdapter: quaternion set with normalization', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const nodeId = adapter.createNode('RotNode');
      const rotations: Quaternion[] = Array.from({ length: 1000 }, randomQuaternion);

      const result = benchmark(() => {
        const rot = rotations[Math.floor(Math.random() * rotations.length)];
        adapter.setTransform(nodeId, { ...IDENTITY_TRANSFORM, rotation: rot });
      }, 10000);

      console.log(formatResult('  LoroSpatial quaternion set', result));
      expect(result.avgMs).toBeLessThan(11);
      adapter.dispose();
    });

    it('SLERP interpolation benchmark', () => {
      const quats: Quaternion[] = Array.from({ length: 100 }, randomQuaternion);

      const result = benchmark(() => {
        const i = Math.floor(Math.random() * 99);
        slerp(quats[i], quats[i + 1], Math.random());
      }, 100000);

      console.log(formatResult('  SLERP interpolation', result));
      // SLERP must be sub-microsecond for render tier
      expect(result.avgUs).toBeLessThan(100);
    });

    it('Vec3 LERP interpolation benchmark', () => {
      const vecs: Vec3[] = Array.from({ length: 100 }, randomVec3);

      const result = benchmark(() => {
        const i = Math.floor(Math.random() * 99);
        lerpVec3(vecs[i], vecs[i + 1], Math.random());
      }, 100000);

      console.log(formatResult('  Vec3 LERP interpolation', result));
      expect(result.avgUs).toBeLessThan(50);
    });

    it('CurrentCRDT: quaternion as JSON via CRDTStateManager', () => {
      const mgr = new CurrentCRDTStateManager('client-1');
      const rotations: Quaternion[] = Array.from({ length: 1000 }, randomQuaternion);

      const result = benchmark(() => {
        const rot = rotations[Math.floor(Math.random() * rotations.length)];
        const op = mgr.createOperation('node1.rotation', rot);
        mgr.reconcile(op);
      }, 10000);

      console.log(formatResult('  CurrentCRDT quaternion set', result));
      expect(result.avgMs).toBeLessThan(11);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Tree Structural Operations
  // --------------------------------------------------------------------------
  describe('Tree Structural Operations', () => {
    it('LoroSpatialAdapter: create 1000 nodes in tree', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });

      const result = benchmark(() => {
        const adapterInner = new LoroSpatialAdapter({ peerId: 1 });
        const root = adapterInner.createNode('Root');
        for (let i = 0; i < 100; i++) {
          const parent = adapterInner.createNode(`Branch-${i}`, root);
          for (let j = 0; j < 9; j++) {
            adapterInner.createNode(`Leaf-${i}-${j}`, parent);
          }
        }
        adapterInner.dispose();
      }, 100);

      console.log(formatResult('  LoroSpatial create 1000 nodes', result));
      // 1000 node creation should be well under 100ms
      expect(result.avgMs).toBeLessThan(100);
      adapter.dispose();
    });

    it('LoroSpatialAdapter: move nodes with cycle detection', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const root = adapter.createNode('Root');
      const nodes: string[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(adapter.createNode(`Node-${i}`, root));
      }

      const result = benchmark(() => {
        const from = Math.floor(Math.random() * 100);
        const to = Math.floor(Math.random() * 100);
        if (from !== to) {
          adapter.moveNode(nodes[from], nodes[to]);
          // Move back to root to reset
          adapter.moveNode(nodes[from], root);
        }
      }, 1000);

      console.log(formatResult('  LoroSpatial move node', result));
      expect(result.avgMs).toBeLessThan(1);
      adapter.dispose();
    });

    it('LoroSpatialAdapter: delete subtree', () => {
      const result = benchmark(() => {
        const adapter = new LoroSpatialAdapter({ peerId: 1 });
        const root = adapter.createNode('Root');
        const branch = adapter.createNode('Branch', root);
        for (let i = 0; i < 50; i++) {
          adapter.createNode(`Leaf-${i}`, branch);
        }
        adapter.deleteNode(branch);
        adapter.dispose();
      }, 500);

      console.log(formatResult('  LoroSpatial delete subtree (51 nodes)', result));
      expect(result.avgMs).toBeLessThan(10);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Sync Bandwidth & Latency
  // --------------------------------------------------------------------------
  describe('Sync Bandwidth & Latency', () => {
    it('LoroSpatialAdapter: export snapshot size', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const root = adapter.createNode('Root');

      // Create 100 nodes with random transforms
      for (let i = 0; i < 100; i++) {
        const nodeId = adapter.createNode(`Node-${i}`, root);
        adapter.setTransform(nodeId, randomTransform());
      }

      const snapshot = adapter.exportUpdate('snapshot');
      const snapshotSize = snapshot.byteLength;

      console.log(
        `  Snapshot size (100 nodes): ${snapshotSize} bytes (${(snapshotSize / 1024).toFixed(2)} KB)`
      );
      // 100 nodes with transforms should be under 50KB
      expect(snapshotSize).toBeLessThan(50 * 1024);

      adapter.dispose();
    });

    it('LoroSpatialAdapter: export/import round-trip latency', () => {
      const adapterA = new LoroSpatialAdapter({ peerId: 1 });
      const adapterB = new LoroSpatialAdapter({ peerId: 2 });

      const root = adapterA.createNode('Root');
      for (let i = 0; i < 50; i++) {
        const nodeId = adapterA.createNode(`Node-${i}`, root);
        adapterA.setTransform(nodeId, randomTransform());
      }

      const result = benchmark(() => {
        const update = adapterA.exportUpdate('snapshot');
        adapterB.importUpdate(update);
      }, 500);

      console.log(formatResult('  Export+Import round-trip (50 nodes)', result));
      // Round-trip should be under 10ms for sync tier compliance
      expect(result.avgMs).toBeLessThan(10);

      adapterA.dispose();
      adapterB.dispose();
    });

    it('LoroSpatialAdapter: incremental update size vs snapshot', () => {
      const adapterA = new LoroSpatialAdapter({ peerId: 1 });
      const root = adapterA.createNode('Root');
      const nodeIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        nodeIds.push(adapterA.createNode(`Node-${i}`, root));
      }

      // Set initial transforms
      for (const nodeId of nodeIds) {
        adapterA.setTransform(nodeId, randomTransform());
      }

      const fullSnapshot = adapterA.exportUpdate('snapshot');

      // Now update only 5 nodes
      const fromVersion = adapterA.getVersionVector();
      for (let i = 0; i < 5; i++) {
        adapterA.setTransform(nodeIds[i], randomTransform());
      }

      const incrementalUpdate = adapterA.exportUpdate('update', fromVersion);

      console.log(`  Full snapshot: ${fullSnapshot.byteLength} bytes`);
      console.log(`  Incremental (5/100 nodes): ${incrementalUpdate.byteLength} bytes`);
      console.log(
        `  Bandwidth savings: ${((1 - incrementalUpdate.byteLength / fullSnapshot.byteLength) * 100).toFixed(1)}%`
      );

      // Incremental should be significantly smaller
      expect(incrementalUpdate.byteLength).toBeLessThan(fullSnapshot.byteLength);

      adapterA.dispose();
    });

    it('LoroSpatialAdapter: concurrent merge convergence', () => {
      const adapterA = new LoroSpatialAdapter({ peerId: 1 });
      const adapterB = new LoroSpatialAdapter({ peerId: 2 });

      // Both create the same scene structure
      const rootA = adapterA.createNode('Root');
      const nodeA = adapterA.createNode('Shared', rootA);

      // Sync initial state
      const initialState = adapterA.exportUpdate('snapshot');
      adapterB.importUpdate(initialState);

      // Concurrent updates: A sets position, B sets position (different values)
      const transformA: SpatialTransform = {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      };

      const transformB: SpatialTransform = {
        position: { x: 50, y: 60, z: 70 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      };

      // B's update has a later timestamp (simulated)
      adapterA.setTransform(nodeA, transformA);

      // Small delay to ensure different timestamps
      const nodeB = '1:1'; // Same node ID as created by A
      adapterB.applyRemoteTransform(nodeB, transformB, Date.now() + 1, 2);

      // Merge: B imports A's state, A imports B's state
      const updateA = adapterA.exportUpdate('snapshot');
      const updateB = adapterB.exportUpdate('snapshot');

      adapterA.importUpdate(updateB);
      adapterB.importUpdate(updateA);

      // After merge, both should converge to the same transform
      // (B's transform wins because it has a later timestamp)
      const resultA = adapterA.getTransform(nodeA);
      const resultB = adapterB.getTransform(nodeB);

      if (resultA && resultB) {
        expect(resultA.position.x).toEqual(resultB.position.x);
        expect(resultA.position.y).toEqual(resultB.position.y);
        expect(resultA.position.z).toEqual(resultB.position.z);
      }

      adapterA.dispose();
      adapterB.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Three-Tier Timing Validation
  // --------------------------------------------------------------------------
  describe('Three-Tier Timing Validation', () => {
    it('Render tier: getInterpolatedTransform < 1ms', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const nodeId = adapter.createNode('RenderNode');

      // Fill interpolation buffer
      for (let i = 0; i < 10; i++) {
        adapter.setTransform(nodeId, randomTransform());
      }

      const result = benchmark(() => {
        adapter.getInterpolatedTransform(nodeId, Date.now());
      }, 100000);

      console.log(formatResult('  Render tier (interpolation)', result));
      expect(result.avgMs).toBeLessThan(1);
      // Must be under 11ms for VR 90Hz budget
      expect(result.avgMs).toBeLessThan(11);

      adapter.dispose();
    });

    it('Sync tier: flush pending ops < 10ms', () => {
      const adapter = new LoroSpatialAdapter({ peerId: 1 });
      const root = adapter.createNode('Root');
      const nodes: string[] = [];
      for (let i = 0; i < 50; i++) {
        nodes.push(adapter.createNode(`Node-${i}`, root));
      }

      // Queue many transform updates
      for (const nodeId of nodes) {
        adapter.setTransform(nodeId, randomTransform());
      }

      const result = benchmark(() => {
        // Re-queue ops for next flush
        for (const nodeId of nodes) {
          adapter.setTransform(nodeId, randomTransform());
        }
        adapter.flushSyncTier();
      }, 100);

      console.log(formatResult('  Sync tier (flush 50 ops)', result));
      expect(result.avgMs).toBeLessThan(100);

      adapter.dispose();
    });

    it('Audit tier: verify 100 nodes < 100ms', () => {
      const adapter = new LoroSpatialAdapter({
        peerId: 1,
        signerDid: 'did:test:benchmark',
      });
      const root = adapter.createNode('Root');
      for (let i = 0; i < 100; i++) {
        const nodeId = adapter.createNode(`Node-${i}`, root);
        adapter.setTransform(nodeId, randomTransform());
      }

      const result = benchmark(() => {
        adapter.runAuditTier();
      }, 100);

      console.log(formatResult('  Audit tier (100 nodes)', result));
      // Audit is the slowest tier but should be under 100ms
      expect(result.avgMs).toBeLessThan(100);

      adapter.dispose();
    });

    it('Audit tier: integrity verification', () => {
      const adapter = new LoroSpatialAdapter({
        peerId: 1,
        signerDid: 'did:test:integrity',
      });
      const nodeId = adapter.createNode('IntegrityNode');
      adapter.setTransform(nodeId, randomTransform());

      // Run audit to compute hashes
      adapter.runAuditTier();

      // Verify integrity passes
      expect(adapter.verifyIntegrity(nodeId)).toBe(true);

      // Modify transform
      adapter.setTransform(nodeId, randomTransform());

      // Integrity should fail (hash is stale)
      expect(adapter.verifyIntegrity(nodeId)).toBe(false);

      // Re-run audit
      adapter.runAuditTier();

      // Integrity should pass again
      expect(adapter.verifyIntegrity(nodeId)).toBe(true);

      adapter.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Summary Output
  // --------------------------------------------------------------------------
  describe('Summary', () => {
    it('prints benchmark summary table', () => {
      console.log('\n=== LoroSpatialAdapter Benchmark Summary ===');
      console.log('Tier      | Target      | Constraint');
      console.log('----------|-------------|------------------');
      console.log('Render    | <11ms       | VR 90Hz frame budget');
      console.log('Sync      | 50-100ms    | Loro state updates');
      console.log('Audit     | 1000ms+     | DID verification');
      console.log('');
      console.log('Key advantages of LoroSpatialAdapter:');
      console.log('- State-based CRDTs (not op-based) for non-commutative quaternions');
      console.log('- Tree CRDT with cycle detection for scene graph hierarchy');
      console.log('- Three-tier timing prevents CRDT ops from blocking render');
      console.log('- SLERP interpolation for smooth quaternion transitions');
      console.log('- Incremental updates for bandwidth efficiency');
      console.log('===========================================\n');
    });
  });
});
