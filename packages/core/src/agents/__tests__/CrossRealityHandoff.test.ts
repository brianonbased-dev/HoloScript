/**
 * @fileoverview Tests for Cross-Reality Handoff + Authenticated CRDTs
 */

import { describe, it, expect } from 'vitest';
import {
  negotiateHandoff, createMVCPayload, validatePayloadBudget, estimatePayloadSize,
  DeviceCapabilities, DecisionEntry, TaskState, UserPreferences, SpatialContext, EvidenceEntry,
} from '../CrossRealityHandoff';
import {
  signOperation, verifyOperation, LWWRegister, GCounter, ORSet,
  createAgentState, setRegister, getRegister, incrementCounter, getCounter, mergeStates,
  DID,
} from '../AuthenticatedCRDT';
import { PLATFORM_CAPABILITIES } from '../../compiler/platform/PlatformConditional';

// ── Test Fixtures ──────────────────────────────────────────────────────────

const questDevice: DeviceCapabilities = {
  deviceId: 'quest-001', platform: 'quest3',
  capabilities: PLATFORM_CAPABILITIES['quest3'],
  embodiment: 'Avatar3D', available: true,
};

const phoneDevice: DeviceCapabilities = {
  deviceId: 'phone-001', platform: 'android',
  capabilities: PLATFORM_CAPABILITIES['android'],
  embodiment: 'UI2D', available: true,
};

const carDevice: DeviceCapabilities = {
  deviceId: 'car-001', platform: 'android-auto',
  capabilities: PLATFORM_CAPABILITIES['android-auto'],
  embodiment: 'VoiceHUD', available: true,
};

const testDID: DID = {
  id: 'did:key:z6MkTest', deviceId: 'device-001',
  scope: ['*'], revoked: false,
};

const revokedDID: DID = {
  id: 'did:key:z6MkRevoked', deviceId: 'device-002',
  scope: ['*'], revoked: true,
};

const scopedDID: DID = {
  id: 'did:key:z6MkScoped', deviceId: 'device-003',
  scope: ['state:task', 'state:preferences'], revoked: false,
};

const testTask: TaskState = {
  taskId: 'task-001', description: 'Navigate to meeting',
  progress: 0.6, subtasks: [{ id: 's1', label: 'Get directions', done: true }],
  priority: 'high',
};

const testPrefs: UserPreferences = {
  personality: 'professional', modality: 'voice', language: 'en',
  accessibility: {}, custom: {},
};

const testSpatial: SpatialContext = {
  latitude: 37.7749, longitude: -122.4194, altitude: 50,
  heading: 90, accuracy: 5, fixTimestamp: '2026-03-06T12:00:00Z',
};

// =============================================================================
// HANDOFF TESTS
// =============================================================================

describe('CrossRealityHandoff', () => {
  describe('negotiateHandoff', () => {
    it('VR→Phone loses spatial tracking, gains GPS', () => {
      const result = negotiateHandoff(questDevice, phoneDevice);
      expect(result.lost).toContain('spatialTracking');
      expect(result.lost).toContain('handTracking');
      expect(result.gained).toContain('gps');
      expect(result.transition.from).toBe('Avatar3D');
      expect(result.transition.to).toBe('UI2D');
    });

    it('Phone→Car gains spatial audio', () => {
      const result = negotiateHandoff(phoneDevice, carDevice);
      expect(result.gained).toContain('spatialAudio');
      expect(result.lost).toContain('gpu3D');
      expect(result.transition.to).toBe('VoiceHUD');
    });

    it('unavailable target is not feasible', () => {
      const offline = { ...phoneDevice, available: false };
      const result = negotiateHandoff(questDevice, offline);
      expect(result.feasible).toBe(false);
      expect(result.reason).toContain('not available');
    });

    it('same-category handoff is faster', () => {
      const quest2: DeviceCapabilities = {
        ...questDevice, deviceId: 'quest-002', platform: 'pcvr',
        capabilities: PLATFORM_CAPABILITIES['pcvr'],
      };
      const same = negotiateHandoff(questDevice, quest2);
      const cross = negotiateHandoff(questDevice, phoneDevice);
      expect(same.estimatedLatencyMs).toBeLessThan(cross.estimatedLatencyMs);
    });
  });

  describe('MVC Payload', () => {
    it('creates valid payload with 5 typed objects', () => {
      const payload = createMVCPayload(
        'did:key:z6MkAgent', 'session-001',
        { deviceId: 'quest-001', platform: 'quest3' },
        {
          decisions: [{ id: 'd1', action: 'navigate', reasoning: 'shortest path', timestamp: '2026-03-06T12:00:00Z', confidence: 0.9 }],
          task: testTask,
          preferences: testPrefs,
          spatial: testSpatial,
          evidence: [{ type: 'observation', summary: 'Saw landmark', timestamp: '2026-03-06T12:00:00Z', source: 'camera', relevance: 0.8 }],
        },
      );
      expect(payload.version).toBe('1.0');
      expect(payload.decisions).toHaveLength(1);
      expect(payload.task.taskId).toBe('task-001');
      expect(payload.preferences.personality).toBe('professional');
      expect(payload.spatial.latitude).toBe(37.7749);
      expect(payload.evidence).toHaveLength(1);
    });

    it('stays within 10KB budget', () => {
      const payload = createMVCPayload(
        'did:key:z6MkAgent', 'session-001',
        { deviceId: 'quest-001', platform: 'quest3' },
        {
          decisions: Array.from({ length: 20 }, (_, i) => ({
            id: `d${i}`, action: `action_${i}`, reasoning: 'test',
            timestamp: '2026-03-06T12:00:00Z', confidence: 0.9,
          })),
          task: testTask, preferences: testPrefs, spatial: testSpatial,
          evidence: Array.from({ length: 30 }, (_, i) => ({
            type: 'observation' as const, summary: `Evidence ${i}`,
            timestamp: '2026-03-06T12:00:00Z', source: 'test', relevance: i / 30,
          })),
        },
      );
      const validation = validatePayloadBudget(payload);
      expect(validation.valid).toBe(true);
      expect(validation.sizeBytes).toBeLessThan(10 * 1024);
      // Verify trimming happened
      expect(payload.decisions.length).toBeLessThanOrEqual(10);
      expect(payload.evidence.length).toBeLessThanOrEqual(15);
    });
  });
});

// =============================================================================
// AUTHENTICATED CRDT TESTS
// =============================================================================

describe('AuthenticatedCRDT', () => {
  describe('signOperation + verify', () => {
    it('valid signed operation verifies', () => {
      const op = signOperation('hello', testDID, 'state:greeting', 1);
      expect(verifyOperation(op).valid).toBe(true);
    });

    it('revoked DID fails verification', () => {
      const op = signOperation('hello', revokedDID, 'state:greeting', 1);
      expect(verifyOperation(op).valid).toBe(false);
      expect(verifyOperation(op).reason).toContain('revoked');
    });

    it('out-of-scope DID fails verification', () => {
      const op = signOperation('hello', scopedDID, 'state:secret', 1);
      expect(verifyOperation(op).valid).toBe(false);
      expect(verifyOperation(op).reason).toContain('scope');
    });

    it('scoped DID passes for in-scope operations', () => {
      const op = signOperation('task update', scopedDID, 'state:task', 1);
      expect(verifyOperation(op).valid).toBe(true);
    });
  });

  describe('LWWRegister', () => {
    it('sets and gets value', () => {
      const reg = new LWWRegister('initial');
      const op = signOperation('updated', testDID, 'state:test', 1);
      reg.set(op);
      expect(reg.get()).toBe('updated');
    });

    it('rejects stale timestamps', () => {
      const reg = new LWWRegister('initial');
      reg.set(signOperation('v1', testDID, 'state:test', 2));
      const result = reg.set(signOperation('v0', testDID, 'state:test', 1));
      expect(result.accepted).toBe(false);
      expect(reg.get()).toBe('v1');
    });

    it('rejects revoked signer', () => {
      const reg = new LWWRegister('initial');
      const result = reg.set(signOperation('evil', revokedDID, 'state:test', 1));
      expect(result.accepted).toBe(false);
    });

    it('merges by picking latest timestamp', () => {
      const a = new LWWRegister('a');
      a.set(signOperation('val_a', testDID, 'state:test', 5));
      const b = new LWWRegister('b');
      b.set(signOperation('val_b', testDID, 'state:test', 3));
      a.merge(b);
      expect(a.get()).toBe('val_a'); // a wins (ts=5 > ts=3)
    });
  });

  describe('GCounter', () => {
    it('increments per node', () => {
      const counter = new GCounter();
      counter.increment('node-a', 3);
      counter.increment('node-b', 2);
      expect(counter.value()).toBe(5);
    });

    it('merges by taking max per node', () => {
      const a = new GCounter();
      a.increment('node-a', 5);
      a.increment('node-b', 3);
      const b = new GCounter();
      b.increment('node-a', 3);
      b.increment('node-b', 7);
      b.increment('node-c', 1);
      a.merge(b);
      expect(a.nodeValue('node-a')).toBe(5); // max(5,3)
      expect(a.nodeValue('node-b')).toBe(7); // max(3,7)
      expect(a.nodeValue('node-c')).toBe(1); // new node
      expect(a.value()).toBe(13);
    });

    it('serializes to/from JSON', () => {
      const counter = new GCounter();
      counter.increment('a', 10);
      const json = counter.toJSON();
      const restored = GCounter.fromJSON(json);
      expect(restored.value()).toBe(10);
    });
  });

  describe('ORSet', () => {
    it('adds and checks membership', () => {
      const set = new ORSet<string>();
      set.add('hello', testDID, 1);
      expect(set.has('hello')).toBe(true);
      expect(set.has('world')).toBe(false);
    });

    it('removes elements', () => {
      const set = new ORSet<string>();
      set.add('hello', testDID, 1);
      set.remove('hello', testDID);
      expect(set.has('hello')).toBe(false);
    });

    it('concurrent adds win over removes on merge', () => {
      const a = new ORSet<string>();
      const b = new ORSet<string>();
      // Both add 'x'
      a.add('x', testDID, 1);
      b.add('x', testDID, 2);
      // a removes 'x'
      a.remove('x', testDID);
      // Merge: b's add should survive
      a.merge(b);
      expect(a.has('x')).toBe(true);
    });

    it('rejects adds from revoked DID', () => {
      const set = new ORSet<string>();
      set.add('evil', revokedDID, 1);
      expect(set.has('evil')).toBe(false);
    });

    it('deduplicates values', () => {
      const set = new ORSet<string>();
      set.add('hello', testDID, 1);
      set.add('hello', testDID, 2);
      expect(set.values()).toEqual(['hello']);
    });
  });

  describe('AuthenticatedAgentState', () => {
    it('creates empty state', () => {
      const state = createAgentState('did:key:z6MkAgent');
      expect(state.agentDID).toBe('did:key:z6MkAgent');
    });

    it('sets and gets registers', () => {
      const state = createAgentState('did:key:z6MkAgent');
      setRegister(state, 'task', 'navigate', testDID, 1);
      expect(getRegister<string>(state, 'task')).toBe('navigate');
    });

    it('rejects unauthorized register writes', () => {
      const state = createAgentState('did:key:z6MkAgent');
      const result = setRegister(state, 'secret', 'hacked', revokedDID, 1);
      expect(result.accepted).toBe(false);
    });

    it('increments and gets counters', () => {
      const state = createAgentState('did:key:z6MkAgent');
      incrementCounter(state, 'interactions', 'quest-001', 5);
      incrementCounter(state, 'interactions', 'phone-001', 3);
      expect(getCounter(state, 'interactions')).toBe(8);
    });

    it('merges two states', () => {
      const local = createAgentState('did:key:z6MkAgent');
      setRegister(local, 'location', 'office', testDID, 1);
      incrementCounter(local, 'steps', 'quest', 100);

      const remote = createAgentState('did:key:z6MkAgent');
      setRegister(remote, 'location', 'cafe', testDID, 5); // newer
      incrementCounter(remote, 'steps', 'phone', 50);

      mergeStates(local, remote);
      expect(getRegister<string>(local, 'location')).toBe('cafe'); // LWW: remote wins
      expect(getCounter(local, 'steps')).toBe(150); // sum: 100+50
    });
  });
});
