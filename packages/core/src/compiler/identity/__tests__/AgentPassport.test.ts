/**
 * Tests for AgentPassport and AgentPassportSerializer modules
 *
 * Covers:
 * - DID document creation and validation
 * - Passport creation, signing, and verification
 * - Binary serialization round-trip (serialize/deserialize)
 * - Size reduction compared to JSON
 * - Edge cases (empty memory, expired passports, etc.)
 * - WAL snapshot serialization
 * - Compressed memory (W/P/G) serialization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  generateAgentKeyPair,
} from '../AgentIdentity';
import type { AgentConfig } from '../AgentIdentity';
import {
  generateAgentDID,
  createDIDDocument,
  createAgentPassport,
  signPassport,
  verifyPassportSignature,
  isPassportExpired,
  validatePassport,
  createEmptyStateSnapshot,
  createEmptyMemory,
  extractRoleFromDID,
  estimatePassportSize,
  PASSPORT_FORMAT_VERSION,
  PASSPORT_MAGIC,
  type AgentPassport,
  type AgentStateSnapshot,
  type CompressedMemory,
  type CompressedWisdom,
  type CompressedPattern,
  type CompressedGotcha,
  type WALEntry,
  WALOperation,
} from '../AgentPassport';
import {
  serializePassport,
  deserializePassport,
  calculateSizeReduction,
  isPassportBinary,
} from '../AgentPassportSerializer';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestConfig(role: AgentRole = AgentRole.SYNTAX_ANALYZER): AgentConfig {
  return {
    role,
    name: `test-${role}`,
    version: '1.0.0',
    prompt: 'Test agent prompt',
    tools: ['tool-a', 'tool-b'],
    configuration: { testMode: true },
  };
}

function createTestMemory(): CompressedMemory {
  const wisdom: CompressedWisdom[] = [
    {
      id: 'W.001',
      content: 'Always validate input before processing',
      domain: 'security',
      confidence: 0.95,
      timestamp: Date.now(),
    },
    {
      id: 'W.002',
      content: 'Binary formats reduce payload size by 50-70%',
      domain: 'serialization',
      confidence: 0.88,
      timestamp: Date.now(),
    },
  ];

  const patterns: CompressedPattern[] = [
    {
      id: 'P.001',
      name: 'TLV Encoding',
      domain: 'binary',
      confidence: 0.92,
      usageCount: 42,
      template: 'type(uint8) + length(uint16) + value(bytes)',
    },
  ];

  const gotchas: CompressedGotcha[] = [
    {
      id: 'G.001',
      trigger: 'Endianness mismatch between platforms',
      avoidance: 'Always use big-endian (network byte order) for binary formats',
      severity: 'high',
      occurrenceCount: 3,
    },
  ];

  return {
    wisdom,
    patterns,
    gotchas,
    compressionRatio: 0.45,
    originalSizeBytes: 2048,
    compressedSizeBytes: 921,
  };
}

function createTestWALEntries(): WALEntry[] {
  return [
    {
      sequence: 1,
      timestamp: Date.now() - 1000,
      operation: WALOperation.SET,
      key: 'current_phase',
      value: new Uint8Array(Buffer.from('EXECUTE')),
      previousHash: 'abc123',
    },
    {
      sequence: 2,
      timestamp: Date.now(),
      operation: WALOperation.MERGE,
      key: 'metrics.efficiency',
      value: new Uint8Array(Buffer.from('0.87')),
      previousHash: 'def456',
    },
  ];
}

function createTestStateSnapshot(): AgentStateSnapshot {
  return {
    agentId: 'agent:syntax_analyzer:test-syntax_analyzer',
    currentPhase: 'EXECUTE',
    cycleNumber: 5,
    walEntries: createTestWALEntries(),
    checkpointHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    snapshotTimestamp: Date.now(),
    metrics: {
      phasesCompleted: 15,
      totalCycles: 5,
      efficiencyScore: 0.87,
      tokenUsage: 12500,
    },
  };
}

// ============================================================================
// TESTS: DID IDENTITY
// ============================================================================

describe('AgentPassport - DID Identity', () => {
  describe('generateAgentDID', () => {
    it('should generate a valid DID URI', () => {
      const did = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'test-public-key');
      expect(did).toMatch(/^did:holoscript:syntax_analyzer:[0-9a-f]{16}$/);
    });

    it('should generate deterministic DIDs for the same input', () => {
      const did1 = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'same-key');
      const did2 = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'same-key');
      expect(did1).toBe(did2);
    });

    it('should generate different DIDs for different keys', () => {
      const did1 = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'key-1');
      const did2 = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'key-2');
      expect(did1).not.toBe(did2);
    });

    it('should generate different DIDs for different roles', () => {
      const did1 = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'same-key');
      const did2 = generateAgentDID(AgentRole.CODE_GENERATOR, 'same-key');
      expect(did1).not.toBe(did2);
    });
  });

  describe('createDIDDocument', () => {
    it('should create a valid DID document', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const didDoc = createDIDDocument(config, keyPair);

      expect(didDoc.id).toMatch(/^did:holoscript:syntax_analyzer:/);
      expect(didDoc.context).toContain('https://www.w3.org/ns/did/v1');
      expect(didDoc.verificationMethod).toHaveLength(1);
      expect(didDoc.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
      expect(didDoc.authentication).toHaveLength(1);
      expect(didDoc.assertionMethod).toHaveLength(1);
      expect(didDoc.agentRole).toBe(AgentRole.SYNTAX_ANALYZER);
      expect(didDoc.agentChecksum.algorithm).toBe('sha256');
    });

    it('should include service endpoints when provided', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const services = [
        {
          id: '#agent-comm',
          type: 'AgentCommunication',
          serviceEndpoint: 'wss://holoscript.dev/agents',
        },
      ];

      const didDoc = createDIDDocument(config, keyPair, services);
      expect(didDoc.service).toHaveLength(1);
      expect(didDoc.service![0].type).toBe('AgentCommunication');
    });
  });

  describe('extractRoleFromDID', () => {
    it('should extract role from valid DID', () => {
      const role = extractRoleFromDID('did:holoscript:syntax_analyzer:abc123');
      expect(role).toBe(AgentRole.SYNTAX_ANALYZER);
    });

    it('should return null for invalid DID', () => {
      expect(extractRoleFromDID('did:example:123')).toBeNull();
      expect(extractRoleFromDID('not-a-did')).toBeNull();
    });

    it('should return null for unknown role', () => {
      expect(extractRoleFromDID('did:holoscript:unknown_role:abc123')).toBeNull();
    });
  });
});

// ============================================================================
// TESTS: PASSPORT CREATION & VALIDATION
// ============================================================================

describe('AgentPassport - Creation & Validation', () => {
  let config: AgentConfig;
  let keyPair: Awaited<ReturnType<typeof generateAgentKeyPair>>;

  beforeEach(async () => {
    config = createTestConfig();
    keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  describe('createAgentPassport', () => {
    it('should create a valid passport with all sections', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE, AgentPermission.WRITE_AST],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      expect(passport.version).toBe(PASSPORT_FORMAT_VERSION);
      expect(passport.did.id).toMatch(/^did:holoscript:/);
      expect(passport.stateSnapshot.agentId).toBeTruthy();
      expect(passport.memory.wisdom).toHaveLength(2);
      expect(passport.memory.patterns).toHaveLength(1);
      expect(passport.memory.gotchas).toHaveLength(1);
      expect(passport.permissions).toHaveLength(2);
      expect(passport.workflowStep).toBe(WorkflowStep.BUILD_AST);
      expect(passport.issuedAt).toBeLessThanOrEqual(Date.now());
      expect(passport.expiresAt).toBeGreaterThan(passport.issuedAt);
    });

    it('should create passport with custom lifetime', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        lifetimeSeconds: 3600, // 1 hour
      });

      const expectedExpiry = passport.issuedAt + 3600 * 1000;
      expect(passport.expiresAt).toBe(expectedExpiry);
    });

    it('should include delegation chain', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.SYNTAX_ANALYZER],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      expect(passport.delegationChain).toEqual([
        AgentRole.ORCHESTRATOR,
        AgentRole.SYNTAX_ANALYZER,
      ]);
    });
  });

  describe('signPassport & verifyPassportSignature', () => {
    it('should sign and verify passport signature', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const signed = signPassport(passport, keyPair.privateKey);

      expect(signed.signature).toBeDefined();
      expect(signed.signature).toBeInstanceOf(Uint8Array);
      expect(signed.signingKeyId).toBeTruthy();

      const isValid = verifyPassportSignature(signed);
      expect(isValid).toBe(true);
    });

    it('should reject tampered passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const signed = signPassport(passport, keyPair.privateKey);

      // Tamper with the passport
      const tampered = { ...signed, issuedAt: signed.issuedAt - 1000 };

      const isValid = verifyPassportSignature(tampered);
      expect(isValid).toBe(false);
    });

    it('should return false for unsigned passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      expect(verifyPassportSignature(passport)).toBe(false);
    });
  });

  describe('isPassportExpired', () => {
    it('should return false for valid passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      expect(isPassportExpired(passport)).toBe(false);
    });

    it('should return true for expired passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        lifetimeSeconds: -1, // Already expired
      });

      expect(isPassportExpired(passport)).toBe(true);
    });
  });

  describe('validatePassport', () => {
    it('should validate a well-formed passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      const result = validatePassport(passport);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect expired passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        lifetimeSeconds: -1,
      });

      const result = validatePassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passport has expired');
    });

    it('should detect invalid DID', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      // Tamper with DID
      passport.did.id = 'invalid-did';

      const result = validatePassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid DID URI'))).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: BINARY SERIALIZATION
// ============================================================================

describe('AgentPassport - Binary Serialization', () => {
  let config: AgentConfig;
  let keyPair: Awaited<ReturnType<typeof generateAgentKeyPair>>;

  beforeEach(async () => {
    config = createTestConfig();
    keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  describe('serializePassport / deserializePassport round-trip', () => {
    it('should round-trip a minimal passport', () => {
      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      expect(restored.version).toBe(original.version);
      expect(restored.did.id).toBe(original.did.id);
      expect(restored.did.agentRole).toBe(original.did.agentRole);
      expect(restored.stateSnapshot.agentId).toBe(original.stateSnapshot.agentId);
      expect(restored.stateSnapshot.cycleNumber).toBe(original.stateSnapshot.cycleNumber);
      expect(restored.permissions).toEqual(original.permissions);
      expect(restored.workflowStep).toBe(original.workflowStep);
      expect(restored.issuedAt).toBe(original.issuedAt);
      expect(restored.expiresAt).toBe(original.expiresAt);
    });

    it('should round-trip a full passport with W/P/G memory', () => {
      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [
          AgentPermission.READ_SOURCE,
          AgentPermission.WRITE_AST,
          AgentPermission.READ_CONFIG,
        ],
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.SYNTAX_ANALYZER],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      // DID
      expect(restored.did.id).toBe(original.did.id);
      expect(restored.did.context).toEqual(original.did.context);
      expect(restored.did.verificationMethod).toHaveLength(1);
      expect(restored.did.verificationMethod[0].publicKeyMultibase).toBe(
        original.did.verificationMethod[0].publicKeyMultibase
      );

      // State
      expect(restored.stateSnapshot.currentPhase).toBe('EXECUTE');
      expect(restored.stateSnapshot.cycleNumber).toBe(5);
      expect(restored.stateSnapshot.metrics.efficiencyScore).toBeCloseTo(0.87, 10);
      expect(restored.stateSnapshot.metrics.tokenUsage).toBe(12500);

      // WAL entries
      expect(restored.stateSnapshot.walEntries).toHaveLength(2);
      expect(restored.stateSnapshot.walEntries[0].operation).toBe(WALOperation.SET);
      expect(restored.stateSnapshot.walEntries[0].key).toBe('current_phase');
      expect(Buffer.from(restored.stateSnapshot.walEntries[0].value).toString()).toBe('EXECUTE');

      // Memory
      expect(restored.memory.wisdom).toHaveLength(2);
      expect(restored.memory.wisdom[0].id).toBe('W.001');
      expect(restored.memory.wisdom[0].content).toBe(
        'Always validate input before processing'
      );
      // Confidence is quantized to uint8, so check approximate match
      expect(restored.memory.wisdom[0].confidence).toBeCloseTo(0.95, 1);

      expect(restored.memory.patterns).toHaveLength(1);
      expect(restored.memory.patterns[0].id).toBe('P.001');
      expect(restored.memory.patterns[0].name).toBe('TLV Encoding');
      expect(restored.memory.patterns[0].usageCount).toBe(42);

      expect(restored.memory.gotchas).toHaveLength(1);
      expect(restored.memory.gotchas[0].id).toBe('G.001');
      expect(restored.memory.gotchas[0].severity).toBe('high');
      expect(restored.memory.gotchas[0].occurrenceCount).toBe(3);

      // Permissions
      expect(restored.permissions).toEqual(original.permissions);

      // Delegation
      expect(restored.delegationChain).toEqual([
        AgentRole.ORCHESTRATOR,
        AgentRole.SYNTAX_ANALYZER,
      ]);
    });

    it('should round-trip a signed passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const signed = signPassport(passport, keyPair.privateKey);
      const binary = serializePassport(signed);
      const restored = deserializePassport(binary);

      expect(restored.signature).toBeDefined();
      expect(restored.signingKeyId).toBe(signed.signingKeyId);
      expect(Buffer.from(restored.signature!)).toEqual(Buffer.from(signed.signature!));
    });

    it('should round-trip with DID service endpoints', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        services: [
          {
            id: '#comm',
            type: 'AgentCommunication',
            serviceEndpoint: 'wss://holoscript.dev/agents',
          },
        ],
      });

      const binary = serializePassport(passport);
      const restored = deserializePassport(binary);

      expect(restored.did.service).toHaveLength(1);
      expect(restored.did.service![0].type).toBe('AgentCommunication');
      expect(restored.did.service![0].serviceEndpoint).toBe('wss://holoscript.dev/agents');
    });
  });

  describe('isPassportBinary', () => {
    it('should detect valid passport binary', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const binary = serializePassport(passport);
      expect(isPassportBinary(binary)).toBe(true);
    });

    it('should reject non-passport data', () => {
      expect(isPassportBinary(Buffer.from('not a passport'))).toBe(false);
      expect(isPassportBinary(Buffer.from([]))).toBe(false);
      expect(isPassportBinary(Buffer.from([0x48, 0x53]))).toBe(false);
    });

    it('should detect magic bytes correctly', () => {
      const hsap = Buffer.from([0x48, 0x53, 0x41, 0x50, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(isPassportBinary(hsap)).toBe(true);
    });
  });

  describe('calculateSizeReduction', () => {
    it('should show binary is smaller than JSON', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE, AgentPermission.WRITE_AST],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      const { jsonSize, binarySize, reductionPercent } = calculateSizeReduction(passport);

      expect(binarySize).toBeLessThan(jsonSize);
      expect(reductionPercent).toBeGreaterThan(0);

      // Log for informational purposes
      console.log(
        `Size reduction: JSON=${jsonSize}B, Binary=${binarySize}B, ` +
          `Reduction=${reductionPercent.toFixed(1)}%`
      );
    });
  });

  describe('error handling', () => {
    it('should throw on invalid magic bytes', () => {
      const badData = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(() => deserializePassport(badData)).toThrow('Invalid passport magic bytes');
    });

    it('should throw on unsupported version', () => {
      const badData = Buffer.from([0x48, 0x53, 0x41, 0x50, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(() => deserializePassport(badData)).toThrow('Unsupported passport version');
    });

    it('should throw on truncated data', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const binary = serializePassport(passport);
      // Truncate to just header
      const truncated = binary.subarray(0, 20);
      expect(() => deserializePassport(truncated)).toThrow();
    });
  });
});

// ============================================================================
// TESTS: UTILITY FUNCTIONS
// ============================================================================

describe('AgentPassport - Utilities', () => {
  describe('createEmptyStateSnapshot', () => {
    it('should create valid empty snapshot', () => {
      const snapshot = createEmptyStateSnapshot('agent-test');
      expect(snapshot.agentId).toBe('agent-test');
      expect(snapshot.currentPhase).toBe('INTAKE');
      expect(snapshot.cycleNumber).toBe(0);
      expect(snapshot.walEntries).toHaveLength(0);
      expect(snapshot.checkpointHash).toBeTruthy();
    });
  });

  describe('createEmptyMemory', () => {
    it('should create valid empty memory', () => {
      const memory = createEmptyMemory();
      expect(memory.wisdom).toHaveLength(0);
      expect(memory.patterns).toHaveLength(0);
      expect(memory.gotchas).toHaveLength(0);
      expect(memory.compressionRatio).toBe(1.0);
    });
  });

  describe('estimatePassportSize', () => {
    it('should return a positive number', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      const size = estimatePassportSize(passport);
      expect(size).toBeGreaterThan(0);
    });
  });
});
