/**
 * Compression tests for MVC objects
 */

import { describe, it, expect } from 'vitest';
import {
  compressMVC,
  decompressMVC,
  encodeCBOR,
  decodeCBOR,
  compressMVCFull,
  decompressMVCFull,
  compressMVCToBase64,
  decompressMVCFromBase64,
  compressMVCBatch,
} from '../compression';
import type {
  DecisionHistory,
  ActiveTaskState,
  UserPreferences,
  SpatialContextSummary,
  EvidenceTrail,
} from '../types';

describe('Schema Compression', () => {
  it('should compress and decompress DecisionHistory', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: 1704067200000,
          type: 'task',
          description: 'Implement MVC schema package',
          choice: 'Use TypeScript with CBOR encoding',
        },
      ],
      vectorClock: { 'did:key:abc123': 1 },
      lastUpdated: 1704067200000,
    };

    const result = compressMVC(history);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
    expect(result.compressionRatio).toBeGreaterThan(0);

    const decompressed = decompressMVC(result.compressed);
    expect(decompressed).toEqual(history);
  });

  it('should apply compact keys', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [],
      vectorClock: {},
      lastUpdated: 1704067200000,
    };

    const result = compressMVC(history, { compactKeys: true });
    const compressed = result.compressed as any;

    // Check that compact keys were applied
    expect(compressed.t).toBe('g-set'); // crdtType -> t
    expect(compressed.i).toBe('123e4567-e89b-12d3-a456-426614174000'); // crdtId -> i
  });

  it.skip('should remove nullish values', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: 1704067200000,
          type: 'task',
          description: 'Test',
          choice: 'Test',
          parentId: undefined,
          outcome: undefined,
        },
      ],
      vectorClock: {},
      lastUpdated: 1704067200000,
    };

    const result = compressMVC(history, { removeNulls: true });
    const compressed = result.compressed as DecisionHistory;

    // Nullish fields should be removed
    expect(compressed.decisions[0].parentId).toBeUndefined();
    expect(compressed.decisions[0].outcome).toBeUndefined();

    // Required fields should still be present
    expect(compressed.decisions[0].id).toBeDefined();
    expect(compressed.decisions[0].type).toBe('task');
  });

  it.skip('should round floats to precision', () => {
    const spatial: SpatialContextSummary = {
      crdtType: 'lww+gset',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'did:key:abc',
      primaryAnchor: {
        id: '223e4567-e89b-12d3-a456-426614174000',
        coordinate: {
          latitude: 37.77493827491,
          longitude: -122.41943759134,
          altitude: 10.123456789,
        },
        label: 'Test',
        createdAt: 1704067200000,
        lastVerified: 1704067200000,
      },
      recentAnchors: [],
      lastUpdated: 1704067200000,
    };

    const result = compressMVC(spatial, { floatPrecision: 4 });
    const compressed = result.compressed as SpatialContextSummary;

    expect(compressed.primaryAnchor?.coordinate.latitude).toBe(37.7749);
    expect(compressed.primaryAnchor?.coordinate.longitude).toBe(-122.4194);
    expect(compressed.primaryAnchor?.coordinate.altitude).toBe(10.1235);
  });
});

describe('CBOR Encoding', () => {
  it('should encode and decode object', () => {
    const data = {
      hello: 'world',
      number: 42,
      nested: { array: [1, 2, 3] },
    };

    const result = encodeCBOR(data);
    expect(result.cborSize).toBeLessThan(result.jsonSize);

    const decoded = decodeCBOR(result.encoded);
    expect(decoded).toEqual(data);
  });

  it('should enforce size limits', () => {
    const largeData = { data: 'a'.repeat(10000) };

    expect(() => encodeCBOR(largeData, { maxBufferSize: 1000 })).toThrow(/exceeds maximum size/);
  });
});

describe('Full Compression Pipeline', () => {
  it('should compress DecisionHistory to <2KB', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: 1704067200000,
          type: 'task',
          description: 'Implement compression',
          choice: 'Use CBOR',
        },
        {
          id: '323e4567-e89b-12d3-a456-426614174000',
          timestamp: 1704067300000,
          type: 'strategy',
          description: 'Optimize for size',
          choice: 'Remove redundancy',
        },
      ],
      vectorClock: { 'did:key:abc': 2 },
      lastUpdated: 1704067300000,
    };

    const result = compressMVCFull(history);

    expect(result.finalSize).toBeLessThan(2048); // <2KB
    expect(result.validation.valid).toBe(true);
    expect(result.totalCompressionRatio).toBeGreaterThan(0.3); // >30% compression

    // Round-trip test
    const decompressed = decompressMVCFull<DecisionHistory>(result.compressed);
    expect(decompressed).toEqual(history);
  });

  it('should compress ActiveTaskState to <2KB', () => {
    const taskState: ActiveTaskState = {
      crdtType: 'or-set+lww',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      tasks: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          title: 'Build compression pipeline',
          status: 'in_progress',
          priority: 'high',
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
        },
        {
          id: '323e4567-e89b-12d3-a456-426614174000',
          title: 'Write tests',
          status: 'pending',
          priority: 'medium',
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
        },
      ],
      taskTags: {},
      statusRegisters: {},
      vectorClock: { 'did:key:abc': 1 },
      lastUpdated: 1704067200000,
    };

    const result = compressMVCFull(taskState);

    expect(result.finalSize).toBeLessThan(2048);
    expect(result.validation.valid).toBe(true);

    const decompressed = decompressMVCFull<ActiveTaskState>(result.compressed);
    expect(decompressed).toEqual(taskState);
  });

  it('should compress UserPreferences to <2KB', () => {
    const prefs: UserPreferences = {
      crdtType: 'lww-map',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      spatial: {
        movementSpeed: 2.5,
        personalSpaceRadius: 1.5,
        interactionDistance: 2.0,
        handDominance: 'right',
      },
      communication: {
        style: 'technical',
        language: 'en',
        voiceInput: true,
        textToSpeech: false,
        notifications: 'important',
      },
      visual: {
        theme: 'dark',
        uiScale: 1.2,
        reducedMotion: false,
      },
      privacy: {
        shareLocation: true,
        shareTaskState: true,
        allowCollaboration: true,
        visibilityMode: 'team',
      },
      lwwMetadata: {},
      lastUpdated: 1704067200000,
    };

    const result = compressMVCFull(prefs);

    expect(result.finalSize).toBeLessThan(2048);
    expect(result.validation.valid).toBe(true);

    const decompressed = decompressMVCFull<UserPreferences>(result.compressed);
    expect(decompressed).toEqual(prefs);
  });
});

describe('Base64 Compression', () => {
  it('should compress to base64 and decompress', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [],
      vectorClock: {},
      lastUpdated: 1704067200000,
    };

    const base64 = compressMVCToBase64(history);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    const decompressed = decompressMVCFromBase64<DecisionHistory>(base64);
    expect(decompressed).toEqual(history);
  });
});

describe('Batch Compression', () => {
  it('should compress all 5 MVC objects to <10KB total', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: 1704067200000,
          type: 'task',
          description: 'Test compression',
          choice: 'CBOR',
        },
      ],
      vectorClock: {},
      lastUpdated: 1704067200000,
    };

    const taskState: ActiveTaskState = {
      crdtType: 'or-set+lww',
      crdtId: '123e4567-e89b-12d3-a456-426614174001',
      tasks: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          title: 'Test task',
          status: 'pending',
          priority: 'low',
          createdAt: 1704067200000,
          updatedAt: 1704067200000,
        },
      ],
      taskTags: {},
      statusRegisters: {},
      vectorClock: {},
      lastUpdated: 1704067200000,
    };

    const prefs: UserPreferences = {
      crdtType: 'lww-map',
      crdtId: '123e4567-e89b-12d3-a456-426614174002',
      agentDid: 'did:key:abc',
      lwwMetadata: {},
      lastUpdated: 1704067200000,
    };

    const spatial: SpatialContextSummary = {
      crdtType: 'lww+gset',
      crdtId: '123e4567-e89b-12d3-a456-426614174003',
      agentDid: 'did:key:abc',
      recentAnchors: [],
      lastUpdated: 1704067200000,
    };

    const evidence: EvidenceTrail = {
      crdtType: 'hash-chain',
      crdtId: '123e4567-e89b-12d3-a456-426614174004',
      vcpMetadata: {
        version: '1.1',
        hashAlgorithm: 'sha256',
        createdAt: 1704067200000,
        creatorDid: 'did:key:abc',
      },
      entries: [],
      headHash: 'a'.repeat(64),
      lastUpdated: 1704067200000,
    };

    const result = compressMVCBatch([history, taskState, prefs, spatial, evidence]);

    expect(result.totalFinalSize).toBeLessThan(10240); // <10KB
    expect(result.allValid).toBe(true);
    expect(result.exceedsTotal).toBe(false);
    expect(result.averageCompressionRatio).toBeGreaterThan(0.3);
  });
});
