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
  generateAgentDIDv2,
  detectDIDVersion,
  getDIDv2,
  getCapabilities,
  addDelegation,
  migratePassportToV2,
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
import type { CapabilityToken } from '../CapabilityToken';
import { CapabilityActions, HOLOSCRIPT_RESOURCE_SCHEME, PERMISSION_TO_ACTION } from '../CapabilityToken';
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

// ============================================================================
// TEST FIXTURE: UCAN Capability Token
// ============================================================================

function createTestCapabilityToken(
  issuerDid: string,
  audienceDid: string,
  capabilities: Array<{ with: string; can: string }> = [
    { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_READ },
    { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_WRITE },
  ]
): CapabilityToken {
  const now = Math.floor(Date.now() / 1000);
  return {
    header: {
      alg: 'EdDSA',
      typ: 'JWT',
      ucv: '0.10.0',
    },
    payload: {
      iss: issuerDid,
      aud: audienceDid,
      att: capabilities,
      prf: [],
      exp: now + 86400,
      nnc: `nonce-${Date.now()}`,
    },
    signature: 'mock-signature-base64url',
    raw: 'mock.jwt.token',
  };
}

function createTestDelegationToken(
  parentToken: CapabilityToken,
  audienceDid: string,
  capabilities: Array<{ with: string; can: string }>
): CapabilityToken {
  const now = Math.floor(Date.now() / 1000);
  return {
    header: {
      alg: 'EdDSA',
      typ: 'JWT',
      ucv: '0.10.0',
    },
    payload: {
      iss: parentToken.payload.aud,
      aud: audienceDid,
      att: capabilities,
      prf: [parentToken.payload.nnc],
      exp: now + 43200, // Shorter than parent
      nnc: `nonce-delegated-${Date.now()}`,
    },
    signature: 'mock-delegated-signature',
    raw: 'mock.delegated.jwt',
  };
}

// ============================================================================
// TESTS: DID v2 (ROLE-AGNOSTIC)
// ============================================================================

describe('AgentPassport - DID v2 (Role-Agnostic)', () => {
  describe('generateAgentDIDv2', () => {
    it('should generate a v2 DID without role', () => {
      const did = generateAgentDIDv2('test-public-key');
      expect(did).toMatch(/^did:holoscript:[0-9a-f]{32}$/);
    });

    it('should generate deterministic DIDs for the same input', () => {
      const did1 = generateAgentDIDv2('same-key');
      const did2 = generateAgentDIDv2('same-key');
      expect(did1).toBe(did2);
    });

    it('should generate different DIDs for different keys', () => {
      const did1 = generateAgentDIDv2('key-1');
      const did2 = generateAgentDIDv2('key-2');
      expect(did1).not.toBe(did2);
    });

    it('should NOT contain the role in the DID', () => {
      const did = generateAgentDIDv2('test-public-key');
      expect(did).not.toContain('syntax_analyzer');
      expect(did).not.toContain('orchestrator');
      // v2 DIDs should have exactly 3 colon-separated parts
      expect(did.split(':')).toHaveLength(3);
    });
  });

  describe('detectDIDVersion', () => {
    it('should detect v1 DIDs', () => {
      expect(detectDIDVersion('did:holoscript:syntax_analyzer:abc123')).toBe(1);
      expect(detectDIDVersion('did:holoscript:orchestrator:def456')).toBe(1);
    });

    it('should detect v2 DIDs', () => {
      expect(detectDIDVersion('did:holoscript:abc123def456789012345678')).toBe(2);
    });

    it('should return null for non-HoloScript DIDs', () => {
      expect(detectDIDVersion('did:example:123')).toBeNull();
      expect(detectDIDVersion('not-a-did')).toBeNull();
    });
  });

  describe('createDIDDocument with v2', () => {
    it('should create a v2 DID document with role-agnostic DID', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const didDoc = createDIDDocument(config, keyPair, undefined, 2);

      // v2 DID should not contain role
      expect(didDoc.id).toMatch(/^did:holoscript:[0-9a-f]{32}$/);
      expect(didDoc.id.split(':')).toHaveLength(3);

      // Should include v2 context
      expect(didDoc.context).toContain('https://holoscript.dev/ns/agent/v2');

      // Should include capability delegation/invocation
      expect(didDoc.capabilityDelegation).toBeDefined();
      expect(didDoc.capabilityDelegation).toHaveLength(1);
      expect(didDoc.capabilityInvocation).toBeDefined();
      expect(didDoc.capabilityInvocation).toHaveLength(1);

      // Role still stored in agentRole field
      expect(didDoc.agentRole).toBe(AgentRole.SYNTAX_ANALYZER);
    });

    it('should default to v1 when version not specified', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const didDoc = createDIDDocument(config, keyPair);

      // v1 DID should contain role
      expect(didDoc.id).toMatch(/^did:holoscript:syntax_analyzer:/);
      expect(didDoc.id.split(':')).toHaveLength(4);

      // Should NOT include v2 fields
      expect(didDoc.capabilityDelegation).toBeUndefined();
      expect(didDoc.capabilityInvocation).toBeUndefined();
    });
  });

  describe('getDIDv2', () => {
    it('should return v2 DID as-is for v2 passports', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      const v2Did = getDIDv2(passport);
      expect(v2Did).toBe(passport.did.id);
      expect(v2Did.split(':')).toHaveLength(3);
    });

    it('should derive v2 DID from v1 passport', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const v2Did = getDIDv2(passport);
      expect(v2Did).toMatch(/^did:holoscript:[0-9a-f]{32}$/);
      // v1 DID has role, v2 should not
      expect(passport.did.id).toContain('syntax_analyzer');
      expect(v2Did).not.toContain('syntax_analyzer');
    });

    it('should be deterministic for same key', async () => {
      const config = createTestConfig();
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const v2Did1 = getDIDv2(passport);
      const v2Did2 = getDIDv2(passport);
      expect(v2Did1).toBe(v2Did2);
    });
  });

  describe('extractRoleFromDID with v2', () => {
    it('should return null for v2 DIDs (role not embedded)', () => {
      const v2Did = generateAgentDIDv2('test-key');
      expect(extractRoleFromDID(v2Did)).toBeNull();
    });

    it('should still work for v1 DIDs', () => {
      const v1Did = generateAgentDID(AgentRole.SYNTAX_ANALYZER, 'test-key');
      expect(extractRoleFromDID(v1Did)).toBe(AgentRole.SYNTAX_ANALYZER);
    });
  });
});

// ============================================================================
// TESTS: v1 → v2 MIGRATION
// ============================================================================

describe('AgentPassport - v1 to v2 Migration', () => {
  let config: AgentConfig;
  let keyPair: Awaited<ReturnType<typeof generateAgentKeyPair>>;

  beforeEach(async () => {
    config = createTestConfig();
    keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  describe('migratePassportToV2', () => {
    it('should migrate v1 passport to v2', () => {
      const v1Passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE, AgentPermission.WRITE_AST],
        delegationChain: [AgentRole.ORCHESTRATOR],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      expect(v1Passport.did.id.split(':')).toHaveLength(4); // v1 format

      const v2Passport = migratePassportToV2(v1Passport);

      // DID should be v2 (role-agnostic)
      expect(v2Passport.didVersion).toBe(2);
      expect(v2Passport.did.id.split(':')).toHaveLength(3);
      expect(v2Passport.did.id).not.toContain('syntax_analyzer');

      // Should have capability delegation/invocation
      expect(v2Passport.did.capabilityDelegation).toBeDefined();
      expect(v2Passport.did.capabilityDelegation!.length).toBeGreaterThan(0);
      expect(v2Passport.did.capabilityInvocation).toBeDefined();
      expect(v2Passport.did.capabilityInvocation!.length).toBeGreaterThan(0);

      // Legacy fields should be preserved
      expect(v2Passport.permissions).toEqual(v1Passport.permissions);
      expect(v2Passport.delegationChain).toEqual(v1Passport.delegationChain);

      // Signature should be cleared (DID changed)
      expect(v2Passport.signature).toBeUndefined();
      expect(v2Passport.signingKeyId).toBeUndefined();

      // Other fields preserved
      expect(v2Passport.stateSnapshot).toEqual(v1Passport.stateSnapshot);
      expect(v2Passport.memory).toEqual(v1Passport.memory);
      expect(v2Passport.workflowStep).toBe(v1Passport.workflowStep);
    });

    it('should be idempotent for v2 passports', () => {
      const v2Passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      const reMigrated = migratePassportToV2(v2Passport);
      expect(reMigrated).toBe(v2Passport); // Same reference (no-op)
    });

    it('should include v2 context in migrated document', () => {
      const v1Passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const v2Passport = migratePassportToV2(v1Passport);
      expect(v2Passport.did.context).toContain('https://holoscript.dev/ns/agent/v2');
    });

    it('should update verification method references', () => {
      const v1Passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const v2Passport = migratePassportToV2(v1Passport);

      // All references should point to v2 DID
      for (const vm of v2Passport.did.verificationMethod) {
        expect(vm.id).toContain(v2Passport.did.id);
        expect(vm.controller).toBe(v2Passport.did.id);
      }
      for (const auth of v2Passport.did.authentication) {
        expect(auth).toContain(v2Passport.did.id);
      }
    });
  });

  describe('validatePassport with v2', () => {
    it('should validate a v2 passport', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      const result = validatePassport(passport);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect mismatched DID version', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      // Force v1-style DID on a v2 passport
      passport.did.id = 'did:holoscript:syntax_analyzer:abc123';

      const result = validatePassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DID v2 format expected 3 parts'))).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: UCAN DELEGATION CHAIN
// ============================================================================

describe('AgentPassport - UCAN Delegation Chain', () => {
  let config: AgentConfig;
  let keyPair: Awaited<ReturnType<typeof generateAgentKeyPair>>;

  beforeEach(async () => {
    config = createTestConfig();
    keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  describe('createAgentPassport with capabilityDelegationChain', () => {
    it('should create passport with UCAN delegation chain', () => {
      const rootDid = 'did:holoscript:orchestrator:root123';
      const agentDid = generateAgentDIDv2('test-key');
      const token = createTestCapabilityToken(rootDid, agentDid);

      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [], // Legacy field
        capabilityDelegationChain: [token],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      expect(passport.capabilityDelegationChain).toBeDefined();
      expect(passport.capabilityDelegationChain).toHaveLength(1);
      expect(passport.capabilityDelegationChain![0].payload.iss).toBe(rootDid);
      expect(passport.capabilityDelegationChain![0].payload.aud).toBe(agentDid);
    });

    it('should omit capabilityDelegationChain when empty', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        capabilityDelegationChain: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      expect(passport.capabilityDelegationChain).toBeUndefined();
    });
  });

  describe('addDelegation', () => {
    it('should append a token to the delegation chain', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      const rootDid = 'did:holoscript:root123';
      const token = createTestCapabilityToken(rootDid, passport.did.id);

      const updated = addDelegation(passport, token);

      expect(updated.capabilityDelegationChain).toHaveLength(1);
      expect(updated.capabilityDelegationChain![0]).toBe(token);
      // Original should be unchanged
      expect(passport.capabilityDelegationChain).toBeUndefined();
    });

    it('should build a multi-step delegation chain', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      const rootDid = 'did:holoscript:root000';
      const midDid = 'did:holoscript:mid111';

      const rootToken = createTestCapabilityToken(rootDid, midDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}*`, can: CapabilityActions.ALL },
      ]);
      const delegatedToken = createTestDelegationToken(rootToken, passport.did.id, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_READ },
      ]);

      let updated = addDelegation(passport, rootToken);
      updated = addDelegation(updated, delegatedToken);

      expect(updated.capabilityDelegationChain).toHaveLength(2);
      expect(updated.capabilityDelegationChain![0].payload.iss).toBe(rootDid);
      expect(updated.capabilityDelegationChain![1].payload.iss).toBe(midDid);
      expect(updated.capabilityDelegationChain![1].payload.aud).toBe(passport.did.id);
    });
  });

  describe('getCapabilities', () => {
    it('should resolve capabilities from UCAN delegation chain', () => {
      const rootDid = 'did:holoscript:root000';
      const agentDid = generateAgentDIDv2('test-key');

      const token = createTestCapabilityToken(rootDid, agentDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_READ },
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_WRITE },
      ]);

      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE], // Legacy
        capabilityDelegationChain: [token],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      const caps = getCapabilities(passport);

      // Should use UCAN chain, not legacy permissions
      expect(caps).toHaveLength(2);
      expect(caps[0].can).toBe(CapabilityActions.AST_READ);
      expect(caps[1].can).toBe(CapabilityActions.AST_WRITE);
    });

    it('should resolve from last token in multi-step chain', () => {
      const rootDid = 'did:holoscript:root000';
      const midDid = 'did:holoscript:mid111';
      const agentDid = generateAgentDIDv2('test-key');

      const rootToken = createTestCapabilityToken(rootDid, midDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}*`, can: CapabilityActions.ALL },
      ]);
      const leafToken = createTestDelegationToken(rootToken, agentDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_READ },
      ]);

      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        capabilityDelegationChain: [rootToken, leafToken],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      const caps = getCapabilities(passport);

      // Should get capabilities from the LEAF token (last in chain), not root
      expect(caps).toHaveLength(1);
      expect(caps[0].can).toBe(CapabilityActions.AST_READ);
    });

    it('should fall back to legacy permissions when no UCAN chain', () => {
      const passport = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [AgentPermission.READ_SOURCE, AgentPermission.WRITE_AST],
        workflowStep: WorkflowStep.PARSE_TOKENS,
      });

      const caps = getCapabilities(passport);

      expect(caps).toHaveLength(2);
      expect(caps[0].can).toBe(PERMISSION_TO_ACTION[AgentPermission.READ_SOURCE]);
      expect(caps[1].can).toBe(PERMISSION_TO_ACTION[AgentPermission.WRITE_AST]);
      // Legacy fallback uses wildcard resource
      expect(caps[0].with).toBe(`${HOLOSCRIPT_RESOURCE_SCHEME}*`);
    });
  });
});

// ============================================================================
// TESTS: BINARY SERIALIZATION - v2 & UCAN FIELDS
// ============================================================================

describe('AgentPassport - Binary Serialization (v2 & UCAN)', () => {
  let config: AgentConfig;
  let keyPair: Awaited<ReturnType<typeof generateAgentKeyPair>>;

  beforeEach(async () => {
    config = createTestConfig();
    keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  describe('round-trip with v2 DID', () => {
    it('should round-trip a v2 passport', () => {
      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        workflowStep: WorkflowStep.PARSE_TOKENS,
        didVersion: 2,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      expect(restored.didVersion).toBe(2);
      expect(restored.did.id).toBe(original.did.id);
      expect(restored.did.id.split(':')).toHaveLength(3); // v2 format
      expect(restored.did.capabilityDelegation).toEqual(original.did.capabilityDelegation);
      expect(restored.did.capabilityInvocation).toEqual(original.did.capabilityInvocation);
      expect(restored.did.context).toContain('https://holoscript.dev/ns/agent/v2');
    });

    it('should round-trip a v1 passport (backward compatible)', () => {
      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE, AgentPermission.WRITE_AST],
        delegationChain: [AgentRole.ORCHESTRATOR],
        workflowStep: WorkflowStep.BUILD_AST,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      expect(restored.didVersion).toBe(1);
      expect(restored.did.id).toBe(original.did.id);
      expect(restored.did.id.split(':')).toHaveLength(4); // v1 format
      expect(restored.permissions).toEqual(original.permissions);
      expect(restored.delegationChain).toEqual(original.delegationChain);
      // v1 passports should not have capability fields
      expect(restored.did.capabilityDelegation).toBeUndefined();
      expect(restored.did.capabilityInvocation).toBeUndefined();
      expect(restored.capabilityDelegationChain).toBeUndefined();
    });
  });

  describe('round-trip with UCAN delegation chain', () => {
    it('should round-trip passport with single UCAN token', () => {
      const rootDid = 'did:holoscript:root000';
      const agentDid = generateAgentDIDv2('test-key');
      const token = createTestCapabilityToken(rootDid, agentDid);

      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        capabilityDelegationChain: [token],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      expect(restored.capabilityDelegationChain).toBeDefined();
      expect(restored.capabilityDelegationChain).toHaveLength(1);

      const restoredToken = restored.capabilityDelegationChain![0];
      expect(restoredToken.header.alg).toBe('EdDSA');
      expect(restoredToken.header.ucv).toBe('0.10.0');
      expect(restoredToken.payload.iss).toBe(rootDid);
      expect(restoredToken.payload.aud).toBe(agentDid);
      expect(restoredToken.payload.att).toHaveLength(2);
      expect(restoredToken.payload.att[0].can).toBe(CapabilityActions.AST_READ);
      expect(restoredToken.signature).toBe('mock-signature-base64url');
    });

    it('should round-trip passport with multi-step delegation chain', () => {
      const rootDid = 'did:holoscript:root000';
      const midDid = 'did:holoscript:mid111';
      const agentDid = generateAgentDIDv2('test-key');

      const rootToken = createTestCapabilityToken(rootDid, midDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}*`, can: CapabilityActions.ALL },
      ]);
      const leafToken = createTestDelegationToken(rootToken, agentDid, [
        { with: `${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`, can: CapabilityActions.AST_READ },
      ]);

      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createEmptyStateSnapshot('test-agent'),
        memory: createEmptyMemory(),
        permissions: [],
        capabilityDelegationChain: [rootToken, leafToken],
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      expect(restored.capabilityDelegationChain).toHaveLength(2);
      expect(restored.capabilityDelegationChain![0].payload.iss).toBe(rootDid);
      expect(restored.capabilityDelegationChain![0].payload.aud).toBe(midDid);
      expect(restored.capabilityDelegationChain![1].payload.iss).toBe(midDid);
      expect(restored.capabilityDelegationChain![1].payload.aud).toBe(agentDid);
    });

    it('should round-trip a full v2 passport with all features', () => {
      const rootDid = 'did:holoscript:root000';
      const agentDid = generateAgentDIDv2('test-key');
      const token = createTestCapabilityToken(rootDid, agentDid);

      const original = createAgentPassport({
        agentConfig: config,
        keyPair,
        stateSnapshot: createTestStateSnapshot(),
        memory: createTestMemory(),
        permissions: [AgentPermission.READ_SOURCE], // Legacy
        delegationChain: [AgentRole.ORCHESTRATOR], // Legacy
        capabilityDelegationChain: [token], // New
        workflowStep: WorkflowStep.BUILD_AST,
        didVersion: 2,
        services: [
          {
            id: '#comm',
            type: 'AgentCommunication',
            serviceEndpoint: 'wss://holoscript.dev/agents',
          },
        ],
      });

      const binary = serializePassport(original);
      const restored = deserializePassport(binary);

      // v2 fields
      expect(restored.didVersion).toBe(2);
      expect(restored.did.id.split(':')).toHaveLength(3);
      expect(restored.did.capabilityDelegation).toBeDefined();
      expect(restored.capabilityDelegationChain).toHaveLength(1);

      // Legacy fields preserved
      expect(restored.permissions).toEqual([AgentPermission.READ_SOURCE]);
      expect(restored.delegationChain).toEqual([AgentRole.ORCHESTRATOR]);

      // Memory preserved
      expect(restored.memory.wisdom).toHaveLength(2);
      expect(restored.memory.patterns).toHaveLength(1);
      expect(restored.memory.gotchas).toHaveLength(1);

      // Service endpoints preserved
      expect(restored.did.service).toHaveLength(1);
    });
  });
});
