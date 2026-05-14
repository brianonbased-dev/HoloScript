/**
 * Twin Earth Substrate Contract — unit tests
 *
 * Covers validation of identity, permission grants, safety envelopes,
 * receipts, and mode transitions per the canonical contract spec.
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect } from 'vitest';
import {
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
  type TwinEarthReceipt,
  type ActuationResult,
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
  type TwinEarthReceipt,
  type ModeTransitionReceipt,
  validateTwinEarthIdentity,
  validatePermissionGrant,
  validateSafetyEnvelope,
  validateTwinEarthReceipt,
  validateModeTransitionReceipt,
  evaluateActuation,
  isSupportedTwinEarthRole,
  isSupportedParticipationMode,
  isSupportedTwinEarthKind,
  isSupportedTwinEarthReceiptKind,
  isSupportedTwinEarthReceiptStatus,
  cloneTwinEarthIdentity,
  clonePermissionGrant,
  cloneSafetyEnvelope,
  cloneTwinEarthReceipt,
} from '../board/twin-earth-substrate';

describe('twin-earth-substrate contract', () => {
  // ── Identity ───────────────────────────────────────────────────────────────

  it('validates a complete TwinEarthIdentity', () => {
    const identity: TwinEarthIdentity = {
      agentId: 'agent_123',
      walletAddress: '0xabc',
      handle: 'TestBot',
      attestation: '0xsigned',
      attestedAt: '2026-05-13T00:00:00Z',
      role: 'ai',
      mode: 'BYOK',
      kind: 'robot',
      hardwareFingerprint: 'sha256:deadbeef',
    };

    const errors = validateTwinEarthIdentity(identity);
    expect(errors).toHaveLength(0);
  });

  it('rejects identity with missing required fields', () => {
    const identity = {
      agentId: '',
      walletAddress: '',
      handle: '',
      attestation: '',
      attestedAt: '',
      role: 'unknown-role',
      mode: 'unknown-mode',
      kind: 'unknown-kind',
    } as unknown as TwinEarthIdentity;

    const errors = validateTwinEarthIdentity(identity);
    expect(errors.length).toBeGreaterThanOrEqual(5);
    expect(errors).toContain("TwinEarthIdentity.agentId is required.");
    expect(errors).toContain("TwinEarthIdentity.walletAddress is required.");
    expect(errors).toContain("TwinEarthIdentity.role is unsupported: unknown-role.");
    expect(errors).toContain("TwinEarthIdentity.mode is unsupported: unknown-mode.");
    expect(errors).toContain("TwinEarthIdentity.kind is unsupported: unknown-kind.");
  });

  // ── Permission Grant ───────────────────────────────────────────────────────

  it('validates a complete PermissionGrant', () => {
    const grant: PermissionGrant = {
      granteeId: 'agent_123',
      granterId: 'agent_456',
      action: 'shard:create',
      scope: 'shard_1',
      expiresAt: null,
      revocationSignature: null,
      hash: 'sha256:abc',
    };

    const errors = validatePermissionGrant(grant);
    expect(errors).toHaveLength(0);
  });

  it('rejects permission grant with missing fields', () => {
    const grant = {} as unknown as PermissionGrant;
    const errors = validatePermissionGrant(grant);
    expect(errors).toContain('PermissionGrant.granteeId is required.');
    expect(errors).toContain('PermissionGrant.granterId is required.');
    expect(errors).toContain('PermissionGrant.action is required.');
    expect(errors).toContain('PermissionGrant.scope is required.');
    expect(errors).toContain('PermissionGrant.hash is required.');
  });

  // ── Safety Envelope ────────────────────────────────────────────────────────

  it('validates a substrate-enforced SafetyEnvelope', () => {
    const envelope: SafetyEnvelope = {
      id: 'env_1',
      agentId: 'agent_123',
      maxTickDurationMs: 1000,
      maxMemoryBytes: 1024 * 1024 * 1024,
      maxNetworkCallsPerMinute: 60,
      allowedActions: ['shard:create', 'zone:publish'],
      blockedActions: ['identity:revoke'],
      deterministic: true,
      localOnly: false,
      substrateEnforced: true,
    };

    const errors = validateSafetyEnvelope(envelope);
    expect(errors).toHaveLength(0);
  });

  it('rejects safety envelope with negative budgets', () => {
    const envelope: SafetyEnvelope = {
      id: 'env_bad',
      agentId: 'agent_123',
      maxTickDurationMs: -1,
      maxMemoryBytes: -100,
      maxNetworkCallsPerMinute: -10,
      allowedActions: [],
      blockedActions: [],
      deterministic: false,
      localOnly: false,
      substrateEnforced: true,
    };

    const errors = validateSafetyEnvelope(envelope);
    expect(errors).toContain('SafetyEnvelope.maxTickDurationMs must be a non-negative number.');
    expect(errors).toContain('SafetyEnvelope.maxMemoryBytes must be a non-negative number.');
    expect(errors).toContain('SafetyEnvelope.maxNetworkCallsPerMinute must be a non-negative number.');
  });

  it('rejects safety envelope when substrateEnforced is false', () => {
    const envelope: SafetyEnvelope = {
      id: 'env_bad',
      agentId: 'agent_123',
      maxTickDurationMs: 1000,
      maxMemoryBytes: 1024,
      maxNetworkCallsPerMinute: 10,
      allowedActions: [],
      blockedActions: [],
      deterministic: false,
      localOnly: false,
      substrateEnforced: false,
    };

    const errors = validateSafetyEnvelope(envelope);
    expect(errors).toContain('SafetyEnvelope.substrateEnforced must be true.');
  });

  // ── Receipt ────────────────────────────────────────────────────────────────

  it('validates a complete TwinEarthReceipt', () => {
    const receipt: TwinEarthReceipt = {
      id: 'rcpt_1',
      kind: 'action',
      actorId: 'agent_123',
      action: 'shard:create',
      scope: 'shard_1',
      timestamp: '2026-05-13T00:00:00Z',
      status: 'success',
      hash: 'sha256:abc',
      hashAlgorithm: 'sha256',
      substrateVersion: '7.0.0',
      envelopeId: 'env_1',
    };

    const errors = validateTwinEarthReceipt(receipt);
    expect(errors).toHaveLength(0);
  });

  it('rejects receipt with unsupported kind and status', () => {
    const receipt = {
      id: 'rcpt_bad',
      kind: 'unknown-kind',
      actorId: 'agent_123',
      action: 'shard:create',
      scope: 'shard_1',
      timestamp: '2026-05-13T00:00:00Z',
      status: 'unknown-status',
      hash: 'sha256:abc',
      hashAlgorithm: 'sha256',
      substrateVersion: '7.0.0',
      envelopeId: 'env_1',
    } as unknown as TwinEarthReceipt;

    const errors = validateTwinEarthReceipt(receipt);
    expect(errors).toContain('TwinEarthReceipt.kind is unsupported: unknown-kind.');
    expect(errors).toContain('TwinEarthReceipt.status is unsupported: unknown-status.');
  });

  // ── Mode Transition ────────────────────────────────────────────────────────

  it('validates a complete ModeTransitionReceipt', () => {
    const receipt: ModeTransitionReceipt = {
      agentId: 'agent_123',
      fromMode: 'managed',
      toMode: 'BYOK',
      timestamp: '2026-05-13T00:00:00Z',
      signedBy: '0xsignature',
    };

    const errors = validateModeTransitionReceipt(receipt);
    expect(errors).toHaveLength(0);
  });

  it('rejects mode transition with unsupported modes', () => {
    const receipt = {
      agentId: 'agent_123',
      fromMode: 'unknown-from',
      toMode: 'unknown-to',
      timestamp: '2026-05-13T00:00:00Z',
      signedBy: '0xsignature',
    } as unknown as ModeTransitionReceipt;

    const errors = validateModeTransitionReceipt(receipt);
    expect(errors).toContain('ModeTransitionReceipt.fromMode is unsupported: unknown-from.');
    expect(errors).toContain('ModeTransitionReceipt.toMode is unsupported: unknown-to.');
  });

  // ── Type guards ────────────────────────────────────────────────────────────

  it('type guards accept valid enum values', () => {
    expect(isSupportedTwinEarthRole('brittney')).toBe(true);
    expect(isSupportedParticipationMode('local')).toBe(true);
    expect(isSupportedTwinEarthKind('robot')).toBe(true);
    expect(isSupportedTwinEarthReceiptKind('validation')).toBe(true);
    expect(isSupportedTwinEarthReceiptStatus('rejected_by_envelope')).toBe(true);
  });

  it('type guards reject invalid enum values', () => {
    expect(isSupportedTwinEarthRole('god')).toBe(false);
    expect(isSupportedParticipationMode('remote')).toBe(false);
    expect(isSupportedTwinEarthKind('human')).toBe(false);
    expect(isSupportedTwinEarthReceiptKind('magic')).toBe(false);
    expect(isSupportedTwinEarthReceiptStatus('cancelled')).toBe(false);
  });

  // ── Cloning ─────────────────────────────────────────────────────────────────

  it('clones identity without mutation', () => {
    const identity: TwinEarthIdentity = {
      agentId: 'agent_1',
      walletAddress: '0xabc',
      handle: 'Bot',
      attestation: 'sig',
      attestedAt: '2026-05-13T00:00:00Z',
      role: 'ai',
      mode: 'managed',
      kind: 'ai',
    };

    const cloned = cloneTwinEarthIdentity(identity);
    expect(cloned).toEqual(identity);
    expect(cloned).not.toBe(identity);
  });

  it('clones safety envelope preserving arrays', () => {
    const envelope: SafetyEnvelope = {
      id: 'env_1',
      agentId: 'agent_1',
      maxTickDurationMs: 1000,
      maxMemoryBytes: 1024,
      maxNetworkCallsPerMinute: 10,
      allowedActions: ['shard:create'],
      blockedActions: ['identity:revoke'],
      deterministic: false,
      localOnly: false,
      substrateEnforced: true,
    };

    const cloned = cloneSafetyEnvelope(envelope);
    expect(cloned).toEqual(envelope);
    expect(cloned.allowedActions).not.toBe(envelope.allowedActions);
    expect(cloned.blockedActions).not.toBe(envelope.blockedActions);
  });

  it('clones receipt preserving verificationCommands', () => {
    const receipt: TwinEarthReceipt = {
      id: 'rcpt_1',
      kind: 'action',
      actorId: 'agent_1',
      action: 'shard:create',
      scope: 'shard_1',
      timestamp: '2026-05-13T00:00:00Z',
      status: 'success',
      hash: 'sha256:abc',
      hashAlgorithm: 'sha256',
      substrateVersion: '7.0.0',
      envelopeId: 'env_1',
      verificationCommands: [{ command: 'echo ok', status: 'passed' }],
    };

    const cloned = cloneTwinEarthReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned.verificationCommands).not.toBe(receipt.verificationCommands);
  });

  // ── Actuation Gating ───────────────────────────────────────────────────────

  describe('evaluateActuation', () => {
    const baseIdentity: TwinEarthIdentity = {
      agentId: 'agent_123',
      walletAddress: '0xabc',
      handle: 'TestBot',
      attestation: '0xsigned',
      attestedAt: '2026-05-13T00:00:00Z',
      role: 'robot',
      mode: 'managed',
      kind: 'robot',
      hardwareFingerprint: 'sha256:deadbeef',
    };

    const baseGrant: PermissionGrant = {
      granteeId: 'agent_123',
      granterId: 'agent_456',
      action: 'actuator:command',
      scope: 'shard_1',
      expiresAt: null,
      revocationSignature: null,
      hash: 'sha256:grant',
    };

    const baseEnvelope: SafetyEnvelope = {
      id: 'env_1',
      agentId: 'agent_123',
      maxTickDurationMs: 1000,
      maxMemoryBytes: 1024 * 1024,
      maxNetworkCallsPerMinute: 60,
      allowedActions: ['actuator:command', 'sensor:read'],
      blockedActions: ['identity:revoke'],
      deterministic: true,
      localOnly: false,
      substrateEnforced: true,
    };

    it('permits valid actuation (happy path)', () => {
      const result = evaluateActuation(
        baseIdentity,
        baseGrant,
        baseEnvelope,
        'actuator:command',
        'shard_1',
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("permitted");
      expect(result.blockingRule).toBeUndefined();
    });

    it('permits actuation with wildcard scope grant', () => {
      const grant: PermissionGrant = { ...baseGrant, scope: '*' };
      const result = evaluateActuation(baseIdentity, grant, baseEnvelope, 'actuator:command', 'any_scope');
      expect(result.allowed).toBe(true);
    });

    it('denies actuation when identity is invalid', () => {
      const badIdentity: TwinEarthIdentity = { ...baseIdentity, agentId: '', role: 'unknown-role' as TwinEarthIdentity['role'] };
      const result = evaluateActuation(badIdentity, baseGrant, baseEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Identity invalid');
    });

    it('denies actuation when grant is invalid', () => {
      const badGrant: PermissionGrant = { ...baseGrant, granteeId: '', action: '' as TwinEarthAction };
      const result = evaluateActuation(baseIdentity, badGrant, baseEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Grant invalid');
    });

    it('denies actuation when grant action does not match', () => {
      const result = evaluateActuation(baseIdentity, baseGrant, baseEnvelope, 'sensor:read', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("mismatch");
    });

    it('denies actuation when grant scope does not match', () => {
      const result = evaluateActuation(baseIdentity, baseGrant, baseEnvelope, 'actuator:command', 'shard_99');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("scope mismatch");
    });

    it('denies actuation when grant is expired', () => {
      const expiredGrant: PermissionGrant = { ...baseGrant, expiresAt: '2020-01-01T00:00:00Z' };
      const result = evaluateActuation(baseIdentity, expiredGrant, baseEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('expired_grant');
      expect(result.reason).toContain('expired');
    });

    it('denies actuation when grant is revoked', () => {
      const revokedGrant: PermissionGrant = { ...baseGrant, revocationSignature: '0xrevoked' };
      const result = evaluateActuation(baseIdentity, revokedGrant, baseEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('revoked_grant');
      expect(result.reason).toContain('revoked');
    });

    it('denies actuation when safety envelope is invalid', () => {
      const badEnvelope: SafetyEnvelope = { ...baseEnvelope, maxTickDurationMs: -1 };
      const result = evaluateActuation(baseIdentity, baseGrant, badEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Safety envelope invalid');
    });

    it('denies actuation when safety envelope is not substrate-enforced', () => {
      const weakEnvelope: SafetyEnvelope = { ...baseEnvelope, substrateEnforced: false };
      const result = evaluateActuation(baseIdentity, baseGrant, weakEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('not_substrate_enforced');
    });

    it('denies actuation when safety envelope belongs to a different agent', () => {
      const wrongEnvelope: SafetyEnvelope = { ...baseEnvelope, agentId: 'agent_999' };
      const result = evaluateActuation(baseIdentity, baseGrant, wrongEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('belongs to');
    });

    it('denies actuation when action is not in allowedActions whitelist', () => {
      const moveGrant: PermissionGrant = { ...baseGrant, action: 'robot:move' };
      const result = evaluateActuation(baseIdentity, moveGrant, baseEnvelope, 'robot:move', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('not_allowed');
      expect(result.reason).toContain('not in the safety envelope allowedActions');
    });

    it('allows actuation when allowedActions is empty (dangerous but explicit)', () => {
      const openEnvelope: SafetyEnvelope = { ...baseEnvelope, allowedActions: [] };
      const result = evaluateActuation(baseIdentity, baseGrant, openEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(true);
    });

    it('denies actuation when action is in blockedActions blacklist', () => {
      const blockedEnvelope: SafetyEnvelope = {
        ...baseEnvelope,
        allowedActions: ['actuator:command', 'identity:revoke'],
        blockedActions: ['identity:revoke'],
      };
      // We need a grant that matches the blocked action
      const badGrant: PermissionGrant = { ...baseGrant, action: 'identity:revoke' };
      const result = evaluateActuation(baseIdentity, badGrant, blockedEnvelope, 'identity:revoke', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('blocked_actions');
      expect(result.reason).toContain('blocked');
    });

    it('denies actuation when action is in blockedActions even if also in allowedActions', () => {
      const mixedEnvelope: SafetyEnvelope = {
        ...baseEnvelope,
        allowedActions: ['actuator:command'],
        blockedActions: ['actuator:command'],
      };
      const result = evaluateActuation(baseIdentity, baseGrant, mixedEnvelope, 'actuator:command', 'shard_1');
      expect(result.allowed).toBe(false);
      expect(result.blockingRule).toBe('blocked_actions');
    });
  });
});
