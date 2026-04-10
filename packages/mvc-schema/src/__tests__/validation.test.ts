/**
 * Validation tests for all MVC objects
 */

import { describe, it, expect } from 'vitest';
import {
  validateDecisionHistory,
  validateTaskState,
  validatePreferences,
  validateSpatialContext,
  validateEvidenceTrail,
  validateAuto,
  validateBatch,
} from '../validation';
import type {
  DecisionHistory,
  ActiveTaskState,
  UserPreferences,
  SpatialContextSummary,
  EvidenceTrail,
} from '../types';

describe('DecisionHistory Validation', () => {
  it('should validate valid DecisionHistory', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: Date.now(),
          type: 'task',
          description: 'Decided to implement MVC schema',
          choice: 'Use TypeScript and CBOR',
        },
      ],
      vectorClock: { 'did:key:abc123': 1 },
      lastUpdated: Date.now(),
    };

    const result = validateDecisionHistory(history);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject invalid crdtType', () => {
    const invalid = {
      crdtType: 'wrong-type',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [],
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateDecisionHistory(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].path).toContain('crdtType');
  });

  it('should reject missing required fields', () => {
    const invalid = {
      crdtType: 'g-set',
      decisions: [],
    };

    const result = validateDecisionHistory(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject decision with invalid type', () => {
    const invalid: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: Date.now(),
          type: 'invalid-type' as any,
          description: 'Test',
          choice: 'Test',
        },
      ],
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateDecisionHistory(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject description exceeding 200 chars', () => {
    const invalid: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          timestamp: Date.now(),
          type: 'task',
          description: 'a'.repeat(201),
          choice: 'Test',
        },
      ],
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateDecisionHistory(invalid);
    expect(result.valid).toBe(false);
  });
});

describe('ActiveTaskState Validation', () => {
  it('should validate valid ActiveTaskState', () => {
    const taskState: ActiveTaskState = {
      crdtType: 'or-set+lww',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      tasks: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          title: 'Implement compression',
          status: 'in_progress',
          priority: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      taskTags: {},
      statusRegisters: {},
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateTaskState(taskState);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid task status', () => {
    const invalid: ActiveTaskState = {
      crdtType: 'or-set+lww',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      tasks: [
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: 'invalid-status' as any,
          priority: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      taskTags: {},
      statusRegisters: {},
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateTaskState(invalid);
    expect(result.valid).toBe(false);
  });
});

describe('UserPreferences Validation', () => {
  it('should validate valid UserPreferences', () => {
    const prefs: UserPreferences = {
      crdtType: 'lww-map',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      spatial: {
        movementSpeed: 2.5,
        personalSpaceRadius: 1.5,
      },
      communication: {
        style: 'technical',
        language: 'en',
      },
      lwwMetadata: {},
      lastUpdated: Date.now(),
    };

    const result = validatePreferences(prefs);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid DID format', () => {
    const invalid: UserPreferences = {
      crdtType: 'lww-map',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'not-a-valid-did',
      lwwMetadata: {},
      lastUpdated: Date.now(),
    };

    const result = validatePreferences(invalid);
    expect(result.valid).toBe(false);
  });
});

describe('SpatialContextSummary Validation', () => {
  it('should validate valid SpatialContextSummary', () => {
    const spatial: SpatialContextSummary = {
      crdtType: 'lww+gset',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      primaryAnchor: {
        id: '223e4567-e89b-12d3-a456-426614174000',
        coordinate: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10.0,
        },
        label: 'San Francisco Office',
        createdAt: Date.now(),
        lastVerified: Date.now(),
      },
      recentAnchors: [],
      lastUpdated: Date.now(),
    };

    const result = validateSpatialContext(spatial);
    expect(result.valid).toBe(true);
  });

  it('should reject latitude out of range', () => {
    const invalid: SpatialContextSummary = {
      crdtType: 'lww+gset',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      primaryAnchor: {
        id: '223e4567-e89b-12d3-a456-426614174000',
        coordinate: {
          latitude: 91.0, // Invalid
          longitude: -122.4194,
          altitude: 10.0,
        },
        label: 'Test',
        createdAt: Date.now(),
        lastVerified: Date.now(),
      },
      recentAnchors: [],
      lastUpdated: Date.now(),
    };

    const result = validateSpatialContext(invalid);
    expect(result.valid).toBe(false);
  });
});

describe('EvidenceTrail Validation', () => {
  it('should validate valid EvidenceTrail', () => {
    const evidence: EvidenceTrail = {
      crdtType: 'hash-chain',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      vcpMetadata: {
        version: '1.1',
        hashAlgorithm: 'sha256',
        createdAt: Date.now(),
        creatorDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
      entries: [
        {
          sequence: 0,
          type: 'observation',
          timestamp: Date.now(),
          content: 'Genesis entry',
          hash: 'a'.repeat(64),
          previousHash: null,
          agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        },
      ],
      headHash: 'a'.repeat(64),
      lastUpdated: Date.now(),
    };

    const result = validateEvidenceTrail(evidence);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid hash format', () => {
    const invalid: EvidenceTrail = {
      crdtType: 'hash-chain',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      vcpMetadata: {
        version: '1.1',
        hashAlgorithm: 'sha256',
        createdAt: Date.now(),
        creatorDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
      entries: [
        {
          sequence: 0,
          type: 'observation',
          timestamp: Date.now(),
          content: 'Test',
          hash: 'invalid-hash',
          previousHash: null,
          agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        },
      ],
      headHash: 'a'.repeat(64),
      lastUpdated: Date.now(),
    };

    const result = validateEvidenceTrail(invalid);
    expect(result.valid).toBe(false);
  });
});

describe('Auto Validation', () => {
  it('should auto-detect and validate DecisionHistory', () => {
    const history: DecisionHistory = {
      crdtType: 'g-set',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
      decisions: [],
      vectorClock: {},
      lastUpdated: Date.now(),
    };

    const result = validateAuto(history);
    expect(result.valid).toBe(true);
    expect(result.schemaType).toBe('decision-history');
  });

  it('should reject unknown crdtType', () => {
    const invalid = {
      crdtType: 'unknown-type',
      crdtId: '123e4567-e89b-12d3-a456-426614174000',
    };

    const result = validateAuto(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

describe('Batch Validation', () => {
  it('should validate multiple objects', () => {
    const objects = [
      {
        obj: {
          crdtType: 'g-set',
          crdtId: '123e4567-e89b-12d3-a456-426614174000',
          decisions: [],
          vectorClock: {},
          lastUpdated: Date.now(),
        },
        schemaType: 'decision-history' as const,
      },
      {
        obj: {
          crdtType: 'or-set+lww',
          crdtId: '123e4567-e89b-12d3-a456-426614174000',
          tasks: [],
          taskTags: {},
          statusRegisters: {},
          vectorClock: {},
          lastUpdated: Date.now(),
        },
        schemaType: 'task-state' as const,
      },
    ];

    const result = validateBatch(objects);
    expect(result.allValid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('should report batch errors', () => {
    const objects = [
      {
        obj: {
          crdtType: 'invalid',
        },
      },
      {
        obj: {
          crdtType: 'g-set',
          // Missing required fields
        },
      },
    ];

    const result = validateBatch(objects);
    expect(result.allValid).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});
