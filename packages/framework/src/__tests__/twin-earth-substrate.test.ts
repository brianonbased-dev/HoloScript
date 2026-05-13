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
  type ModeTransitionReceipt,
  validateTwinEarthIdentity,
  validatePermissionGrant,
  validateSafetyEnvelope,
  validateTwinEarthReceipt,
  validateModeTransitionReceipt,
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
});
