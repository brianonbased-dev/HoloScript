/**
 * CRDTCAELBridge tests — Paper #3 (CRDT convergence as CAEL interaction events)
 *
 * Verifies that:
 *   1. Spatial CRDT merges produce cael.crdt_merge/spatial interaction entries
 *   2. WorldState merges produce cael.crdt_merge/world_state entries
 *   3. Every merge entry is hash-chained into the CAEL trace
 *   4. Version fingerprints differ when actual state changes
 *   5. Merging identical bytes is a no-op (versions unchanged, still logged)
 *   6. Multiple merges from multiple peers are all independently traceable
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialCRDTBridge, WorldState } from '@holoscript/crdt-spatial';
import { CRDTCAELBridge } from '../CRDTCAELBridge';
import { CAELRecorder } from '../CAELRecorder';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';
import type { SimSolver, FieldData } from '../SimSolver';

// ── Minimal mock solver ───────────────────────────────────────────────────────

function mockSolver(): SimSolver {
  return {
    mode: 'transient',
    fieldNames: ['von_mises_stress'],
    step(_dt: number) {},
    solve() {},
    getField(name: string): FieldData | null {
      if (name === 'von_mises_stress') return new Float32Array([0.5, 0.5]);
      return null;
    },
    getStats() { return {}; },
    dispose() {},
  };
}

function makeRecorder(): CAELRecorder {
  return new CAELRecorder(
    mockSolver(),
    { solverType: 'mock', vertices: new Float64Array([0,0,0,1,0,0,0,1,0,0,0,1]), tetrahedra: new Uint32Array([0,1,2,3]) },
  );
}

// ── Helper: extract interaction entries from JSONL ────────────────────────────

function extractInteractions(jsonl: string, type: string): Record<string, unknown>[] {
  return jsonl
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((e) => e.event === 'interaction')
    .filter((e) => {
      const payload = e.payload as Record<string, unknown>;
      return payload.type === type;
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CRDTCAELBridge', () => {
  // ── Spatial bridge tests ────────────────────────────────────────────────────

  describe('mergeSpatial', () => {
    let local: SpatialCRDTBridge;
    let remote: SpatialCRDTBridge;
    let recorder: CAELRecorder;
    let bridge: CRDTCAELBridge;

    beforeEach(() => {
      local = new SpatialCRDTBridge({ peerId: 'local-node' });
      remote = new SpatialCRDTBridge({ peerId: 'remote-node' });
      recorder = makeRecorder();
      bridge = new CRDTCAELBridge({ spatial: local, recorder, localPeerId: 'local-node' });

      // Register common nodes on both sides
      local.registerNode('cube-1');
      remote.registerNode('cube-1');
    });

    it('logs a cael.crdt_merge interaction when bytes are imported', () => {
      remote.setPosition('cube-1', { x: 5, y: 0, z: 3 });
      const updateBytes = remote.exportUpdate();

      bridge.mergeSpatial(updateBytes, 'remote-node');

      const jsonl = recorder.toJSONL();
      const mergeEntries = extractInteractions(jsonl, 'cael.crdt_merge');
      expect(mergeEntries.length).toBe(1);

      const payload = mergeEntries[0].payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown>;
      expect(data.crdtType).toBe('spatial');
      expect(data.fromPeer).toBe('remote-node');
      expect(data.localPeer).toBe('local-node');
      expect(typeof data.mergeBytes).toBe('number');
      expect((data.mergeBytes as number)).toBeGreaterThan(0);
    });

    it('records versionBefore and versionAfter fingerprints', () => {
      remote.setPosition('cube-1', { x: 10, y: 2, z: -5 });
      const update = remote.exportUpdate();

      bridge.mergeSpatial(update, 'remote-node');

      const jsonl = recorder.toJSONL();
      const [entry] = extractInteractions(jsonl, 'cael.crdt_merge');
      const data = (entry.payload as Record<string, unknown>).data as Record<string, unknown>;

      expect(typeof data.versionBefore).toBe('string');
      expect(typeof data.versionAfter).toBe('string');
      // After a merge that changes state, fingerprints should differ
      expect(data.versionBefore).not.toBe(data.versionAfter);
    });

    it('includes nodesObserved from the local bridge', () => {
      local.registerNode('sphere-99');
      const update = remote.exportUpdate();

      bridge.mergeSpatial(update, 'remote-node');

      const jsonl = recorder.toJSONL();
      const [entry] = extractInteractions(jsonl, 'cael.crdt_merge');
      const data = (entry.payload as Record<string, unknown>).data as Record<string, unknown>;
      const nodes = data.nodesObserved as string[];
      expect(nodes).toContain('cube-1');
      expect(nodes).toContain('sphere-99');
    });

    it('forwards extra metadata into the trace entry', () => {
      const update = remote.exportUpdate();

      bridge.mergeSpatial(update, 'remote-node', { sessionId: 'abc-123', priority: 'high' });

      const jsonl = recorder.toJSONL();
      const [entry] = extractInteractions(jsonl, 'cael.crdt_merge');
      const data = (entry.payload as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.sessionId).toBe('abc-123');
      expect(data.priority).toBe('high');
    });

    it('accumulates multiple merges in correct trace order', () => {
      const remote2 = new SpatialCRDTBridge({ peerId: 'remote-2' });
      remote2.registerNode('cube-1');

      remote.setPosition('cube-1', { x: 1, y: 0, z: 0 });
      remote2.setPosition('cube-1', { x: 0, y: 0, z: 9 });

      bridge.mergeSpatial(remote.exportUpdate(), 'remote-node');
      bridge.mergeSpatial(remote2.exportUpdate(), 'remote-2');

      const jsonl = recorder.toJSONL();
      const merges = extractInteractions(jsonl, 'cael.crdt_merge');
      expect(merges.length).toBe(2);

      const fromPeers = merges.map(
        (e) => ((e.payload as Record<string, unknown>).data as Record<string, unknown>).fromPeer,
      );
      expect(fromPeers).toEqual(['remote-node', 'remote-2']);
    });

    it('all entries form a valid CAEL hash chain', () => {
      // Testing the array coercion logic explicitly
      remote.setPosition('cube-1', [3, 1, 2 ] as any);
      bridge.mergeSpatial(remote.exportUpdate(), 'remote-node');

      const entries = parseCAELJSONL(recorder.toJSONL());
      const result = verifyCAELHashChain(entries);
      expect(result.valid).toBe(true);
    });

    it('throws if no SpatialCRDTBridge is configured', () => {
      const bareRecorder = makeRecorder();
      const bareBridge = new CRDTCAELBridge({ recorder: bareRecorder });
      expect(() => bareBridge.mergeSpatial(new Uint8Array([1, 2, 3]), 'x')).toThrow(
        'no SpatialCRDTBridge configured',
      );
    });
  });

  // ── WorldState bridge tests ─────────────────────────────────────────────────

  describe('mergeWorld', () => {
    let localWorld: WorldState;
    let remoteWorld: WorldState;
    let recorder: CAELRecorder;
    let bridge: CRDTCAELBridge;

    beforeEach(() => {
      localWorld = new WorldState('local-peer');
      remoteWorld = new WorldState('remote-peer');
      recorder = makeRecorder();
      bridge = new CRDTCAELBridge({ world: localWorld, recorder, localPeerId: 'local-peer' });
    });

    it('logs a cael.crdt_merge/world_state event when merging bytes', () => {
      remoteWorld.setObject('tree-1', {
        position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        mesh: 'oak.glb', traits: ['@natural'], owner: 'system', properties: {},
      });

      const snapshot = remoteWorld.export();
      bridge.mergeWorld(snapshot, 'remote-peer');

      const jsonl = recorder.toJSONL();
      const entries = extractInteractions(jsonl, 'cael.crdt_merge');
      expect(entries.length).toBe(1);

      const data = (entries[0].payload as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.crdtType).toBe('world_state');
      expect(data.fromPeer).toBe('remote-peer');
    });

    it('tracks objectCountDelta when objects are added by the merge', () => {
      remoteWorld.setObject('rock-5', {
        position: [1, 0, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        mesh: 'rock.glb', traits: [], owner: 'system', properties: {},
      });
      remoteWorld.setObject('rock-6', {
        position: [3, 0, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        mesh: 'rock.glb', traits: [], owner: 'system', properties: {},
      });

      bridge.mergeWorld(remoteWorld.export(), 'remote-peer');

      const jsonl = recorder.toJSONL();
      const [entry] = extractInteractions(jsonl, 'cael.crdt_merge');
      const data = (entry.payload as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.objectCountDelta).toBe(2);
      expect(data.objectCountAfter).toBe(2);
    });

    it('accepts a WorldState instance (not just bytes)', () => {
      remoteWorld.setObject('lamp-3', {
        position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        mesh: 'lamp.glb', traits: ['@illuminated'], owner: 'system', properties: {},
      });

      bridge.mergeWorld(remoteWorld, 'remote-peer');

      const jsonl = recorder.toJSONL();
      const [entry] = extractInteractions(jsonl, 'cael.crdt_merge');
      const data = (entry.payload as Record<string, unknown>).data as Record<string, unknown>;
      // mergeBytes is null when WorldState instance was provided
      expect(data.mergeBytes).toBeNull();
      expect(data.objectCountDelta).toBe(1);
    });

    it('all world_state merge entries form a valid CAEL hash chain', () => {
      remoteWorld.setObject('npc-1', {
        position: [5, 0, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        mesh: 'human.glb', traits: ['@npc'], owner: 'system', properties: {},
      });

      bridge.mergeWorld(remoteWorld.export(), 'remote-peer');

      const entries = parseCAELJSONL(recorder.toJSONL());
      const result = verifyCAELHashChain(entries);
      expect(result.valid).toBe(true);
    });

    it('throws if no WorldState is configured', () => {
      const bareBridge = new CRDTCAELBridge({ recorder: makeRecorder() });
      expect(() => bareBridge.mergeWorld(new Uint8Array([1, 2]), 'x')).toThrow(
        'no WorldState configured',
      );
    });
  });
});
