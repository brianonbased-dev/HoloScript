/**
 * Twin Earth Substrate Contract — TypeScript interface projection
 *
 * Canonical code-level specification for the Twin Earth robot/AI monopoly
 * substrate. Every implementation must satisfy these interfaces.
 *
 * Version: 1.0.0
 * Contract: research/2026-05-13_twin-earth-substrate-contract.md
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactVerificationCommand,
} from './board-types';

// ═════════════════════════════════════════════════════════════════════════════
// 1. IDENTITY
// ═════════════════════════════════════════════════════════════════════════════

/** Participation mode — how the participant hosts compute and keys. */
export type ParticipationMode = 'local' | 'BYOK' | 'managed';

/** Substrate role — determines action ceiling. */
export type TwinEarthRole =
  | 'founder'
  | 'steward'
  | 'operator'
  | 'robot'
  | 'ai'
  | 'brittney'
  | 'visitor';

/** Hardware-bound or software-bound participant kind. */
export type TwinEarthKind = 'robot' | 'ai';

/** Every robot and AI on Twin Earth has a substrate identity independent of Brittney. */
export interface TwinEarthIdentity {
  /** Unique substrate identifier — derived from wallet public key. */
  agentId: string;
  /** Wallet address (EVM or Solana) — the root of trust. */
  walletAddress: string;
  /** Human-readable handle — mutable, but changes require wallet-signed attestation. */
  handle: string;
  /** Identity proof — EIP-712 typed-data signature over (agentId + handle + timestamp). */
  attestation: string;
  /** Timestamp of last attestation renewal (max TTL: 90 days). */
  attestedAt: string;
  /** Substrate role. */
  role: TwinEarthRole;
  /** Participation mode. */
  mode: ParticipationMode;
  /** Whether this identity is a robot (hardware) or AI (software). */
  kind: TwinEarthKind;
  /** Optional hardware fingerprint for robots (device serial hash). */
  hardwareFingerprint?: string;
  /** Optional brain composition reference for AIs (D.043 durable seed). */
  brainCompositionId?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. PERMISSIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Actions that can be granted or executed on the substrate. */
export type TwinEarthAction =
  | 'shard:create' | 'shard:update' | 'shard:delete' | 'shard:tick'
  | 'zone:create' | 'zone:update' | 'zone:publish' | 'zone:delete'
  | 'place:create' | 'place:update' | 'place:delete'
  | 'quest:create' | 'quest:update' | 'quest:delete'
  | 'npc:create' | 'npc:update' | 'npc:delete' | 'npc:dialogue'
  | 'receipt:capture' | 'receipt:validate'
  | 'identity:register' | 'identity:renew' | 'identity:revoke'
  | 'contract:propose' | 'contract:ratify';

/** A signed, revocable, substrate-auditable permission grant. */
export interface PermissionGrant {
  /** The identity receiving the permission. */
  granteeId: string;
  /** The identity issuing the permission. */
  granterId: string;
  /** Action being permitted. */
  action: TwinEarthAction;
  /** Scope of the grant (shardId, zoneId, worldId, or '*'). */
  scope: string;
  /** Expiry — null means no expiry. */
  expiresAt: string | null;
  /** Revocation signature — null until revoked. */
  revocationSignature: string | null;
  /** CAEL-signed hash of the canonical grant body. */
  hash: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. SAFETY ENVELOPE
// ═════════════════════════════════════════════════════════════════════════════

/** Runtime-enforced boundary protecting the substrate from misbehaving participants. */
export interface SafetyEnvelope {
  /** Unique envelope identifier. */
  id: string;
  /** Identity this envelope applies to. */
  agentId: string;
  /** Maximum compute budget per tick (milliseconds). */
  maxTickDurationMs: number;
  /** Maximum memory budget per session (bytes). */
  maxMemoryBytes: number;
  /** Maximum outbound network calls per minute. */
  maxNetworkCallsPerMinute: number;
  /** Allowed action whitelist — empty = all permitted (dangerous). */
  allowedActions: TwinEarthAction[];
  /** Blocked action blacklist — overrides whitelist. */
  blockedActions: TwinEarthAction[];
  /** Deterministic mode — if true, randomness is seeded and reproducible. */
  deterministic: boolean;
  /** Local-only mode — no outbound network calls allowed. */
  localOnly: boolean;
  /** Substrate-enforced — cannot be overridden by participant. */
  substrateEnforced: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. RECEIPTS
// ═════════════════════════════════════════════════════════════════════════════

/** Receipt kind emitted by the substrate. */
export type TwinEarthReceiptKind =
  | 'action'
  | 'validation'
  | 'encounter'
  | 'steward_tick'
  | 'contract_upgrade';

/** Execution status recorded in a receipt. */
export type TwinEarthReceiptStatus =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'rejected_by_envelope';

/**
 * Twin Earth Receipt — cryptographically signed proof of execution.
 * Verifiable without calling Brittney.
 */
export interface TwinEarthReceipt {
  /** Stable receipt identifier. */
  id: string;
  /** Receipt kind. */
  kind: TwinEarthReceiptKind;
  /** Identity that produced this receipt. */
  actorId: string;
  /** Action that was executed. */
  action: TwinEarthAction;
  /** Scope (shard/zone/world). */
  scope: string;
  /** Timestamp (ISO-8601). */
  timestamp: string;
  /** Execution status. */
  status: TwinEarthReceiptStatus;
  /** CAEL-signed hash of canonical body. */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Optional payload hash for large inputs. */
  payloadHash?: string;
  /** Verification commands that reproduce this receipt. */
  verificationCommands?: ArtifactVerificationCommand[];
  /** Substrate version that emitted this receipt. */
  substrateVersion: string;
  /** Safety envelope ID that was active during execution. */
  envelopeId: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. PARTICIPATION MODES
// ═════════════════════════════════════════════════════════════════════════════

/** Configuration for a participant's participation mode. */
export interface ParticipationModeConfig {
  mode: ParticipationMode;
  /** Model provider — only relevant for AI participants. */
  modelProvider?: 'cloud' | 'local' | 'sovereign';
  /** Model identifier — e.g., 'brittney-qwen-v23', 'gemma4:e4b'. */
  modelId?: string;
  /** For BYOK: the API key or local endpoint is held by the participant. */
  byokEndpoint?: string;
  /** For managed: the hosting provider's identifier. */
  managedProvider?: string;
  /** Whether the participant can operate offline. */
  offlineCapable: boolean;
  /** Data residency — where state is durably stored. */
  dataResidency: 'device' | 'substrate' | 'managed_cloud';
}

/** Wallet-signed mode transition record. */
export interface ModeTransitionReceipt {
  agentId: string;
  fromMode: ParticipationMode;
  toMode: ParticipationMode;
  timestamp: string;
  /** Wallet signature of canonical body. */
  signedBy: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. SUBSTRATE STATUS
// ═════════════════════════════════════════════════════════════════════════════

/** Aggregate status returned by CLI and MCP status tools. */
export interface TwinEarthSubstrateStatus {
  /** Contract version. */
  contractVersion: string;
  /** Substrate implementation version. */
  substrateVersion: string;
  /** Total registered identities. */
  identities: number;
  /** Robot identities. */
  robots: number;
  /** AI identities. */
  ais: number;
  /** BYOK participants. */
  byokCount: number;
  /** Local participants. */
  localCount: number;
  /** Managed participants. */
  managedCount: number;
  /** Whether Brittney is currently online. */
  brittneyOnline: boolean;
  /** Brittney's role on the substrate. */
  brittneyRole: TwinEarthRole;
  /** Whether substrate enforcement is active. */
  substrateEnforced: boolean;
  /** Number of active safety envelopes. */
  safetyEnvelopes: number;
  /** Total receipt log entries. */
  receiptLogEntries: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. VALIDATORS
// ═════════════════════════════════════════════════════════════════════════════

/** Validate a TwinEarthIdentity. Returns validation errors; empty = valid. */
export function validateTwinEarthIdentity(identity: TwinEarthIdentity): string[] {
  const errors: string[] = [];
  if (!identity.agentId) errors.push('TwinEarthIdentity.agentId is required.');
  if (!identity.walletAddress) errors.push('TwinEarthIdentity.walletAddress is required.');
  if (!identity.handle) errors.push('TwinEarthIdentity.handle is required.');
  if (!identity.attestation) errors.push('TwinEarthIdentity.attestation is required.');
  if (!identity.attestedAt) errors.push('TwinEarthIdentity.attestedAt is required.');
  if (!isSupportedTwinEarthRole(identity.role)) {
    errors.push(`TwinEarthIdentity.role is unsupported: ${String(identity.role)}.`);
  }
  if (!isSupportedParticipationMode(identity.mode)) {
    errors.push(`TwinEarthIdentity.mode is unsupported: ${String(identity.mode)}.`);
  }
  if (!isSupportedTwinEarthKind(identity.kind)) {
    errors.push(`TwinEarthIdentity.kind is unsupported: ${String(identity.kind)}.`);
  }
  return errors;
}

/** Validate a PermissionGrant. */
export function validatePermissionGrant(grant: PermissionGrant): string[] {
  const errors: string[] = [];
  if (!grant.granteeId) errors.push('PermissionGrant.granteeId is required.');
  if (!grant.granterId) errors.push('PermissionGrant.granterId is required.');
  if (!grant.action) errors.push('PermissionGrant.action is required.');
  if (!grant.scope) errors.push('PermissionGrant.scope is required.');
  if (!grant.hash) errors.push('PermissionGrant.hash is required.');
  return errors;
}

/** Validate a SafetyEnvelope. */
export function validateSafetyEnvelope(envelope: SafetyEnvelope): string[] {
  const errors: string[] = [];
  if (!envelope.id) errors.push('SafetyEnvelope.id is required.');
  if (!envelope.agentId) errors.push('SafetyEnvelope.agentId is required.');
  if (typeof envelope.maxTickDurationMs !== 'number' || envelope.maxTickDurationMs < 0) {
    errors.push('SafetyEnvelope.maxTickDurationMs must be a non-negative number.');
  }
  if (typeof envelope.maxMemoryBytes !== 'number' || envelope.maxMemoryBytes < 0) {
    errors.push('SafetyEnvelope.maxMemoryBytes must be a non-negative number.');
  }
  if (typeof envelope.maxNetworkCallsPerMinute !== 'number' || envelope.maxNetworkCallsPerMinute < 0) {
    errors.push('SafetyEnvelope.maxNetworkCallsPerMinute must be a non-negative number.');
  }
  if (!envelope.substrateEnforced) {
    errors.push('SafetyEnvelope.substrateEnforced must be true.');
  }
  return errors;
}

/** Validate a TwinEarthReceipt. */
export function validateTwinEarthReceipt(receipt: TwinEarthReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('TwinEarthReceipt.id is required.');
  if (!isSupportedTwinEarthReceiptKind(receipt.kind)) {
    errors.push(`TwinEarthReceipt.kind is unsupported: ${String(receipt.kind)}.`);
  }
  if (!receipt.actorId) errors.push('TwinEarthReceipt.actorId is required.');
  if (!receipt.action) errors.push('TwinEarthReceipt.action is required.');
  if (!receipt.scope) errors.push('TwinEarthReceipt.scope is required.');
  if (!receipt.timestamp) errors.push('TwinEarthReceipt.timestamp is required.');
  if (!isSupportedTwinEarthReceiptStatus(receipt.status)) {
    errors.push(`TwinEarthReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!receipt.hash) errors.push('TwinEarthReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('TwinEarthReceipt.hashAlgorithm is required.');
  if (!receipt.substrateVersion) errors.push('TwinEarthReceipt.substrateVersion is required.');
  if (!receipt.envelopeId) errors.push('TwinEarthReceipt.envelopeId is required.');
  return errors;
}

/** Validate a ModeTransitionReceipt. */
export function validateModeTransitionReceipt(receipt: ModeTransitionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.agentId) errors.push('ModeTransitionReceipt.agentId is required.');
  if (!isSupportedParticipationMode(receipt.fromMode)) {
    errors.push(`ModeTransitionReceipt.fromMode is unsupported: ${String(receipt.fromMode)}.`);
  }
  if (!isSupportedParticipationMode(receipt.toMode)) {
    errors.push(`ModeTransitionReceipt.toMode is unsupported: ${String(receipt.toMode)}.`);
  }
  if (!receipt.timestamp) errors.push('ModeTransitionReceipt.timestamp is required.');
  if (!receipt.signedBy) errors.push('ModeTransitionReceipt.signedBy is required.');
  return errors;
}

// ── Type guards ──

export function isSupportedTwinEarthRole(role: string): role is TwinEarthRole {
  const roles: readonly string[] = [
    'founder', 'steward', 'operator', 'robot', 'ai', 'brittney', 'visitor',
  ];
  return roles.includes(role);
}

export function isSupportedParticipationMode(mode: string): mode is ParticipationMode {
  const modes: readonly string[] = ['local', 'BYOK', 'managed'];
  return modes.includes(mode);
}

export function isSupportedTwinEarthKind(kind: string): kind is TwinEarthKind {
  const kinds: readonly string[] = ['robot', 'ai'];
  return kinds.includes(kind);
}

export function isSupportedTwinEarthReceiptKind(kind: string): kind is TwinEarthReceiptKind {
  const kinds: readonly string[] = ['action', 'validation', 'encounter', 'steward_tick', 'contract_upgrade'];
  return kinds.includes(kind);
}

export function isSupportedTwinEarthReceiptStatus(
  status: string,
): status is TwinEarthReceiptStatus {
  const statuses: readonly string[] = ['success', 'failure', 'timeout', 'rejected_by_envelope'];
  return statuses.includes(status);
}

// ── Cloning helpers ──

export function cloneTwinEarthIdentity(identity: TwinEarthIdentity): TwinEarthIdentity {
  return {
    ...identity,
    ...(identity.hardwareFingerprint ? {} : {}),
    ...(identity.brainCompositionId ? {} : {}),
  };
}

export function clonePermissionGrant(grant: PermissionGrant): PermissionGrant {
  return { ...grant };
}

export function cloneSafetyEnvelope(envelope: SafetyEnvelope): SafetyEnvelope {
  return {
    ...envelope,
    allowedActions: [...envelope.allowedActions],
    blockedActions: [...envelope.blockedActions],
  };
}

export function cloneTwinEarthReceipt(receipt: TwinEarthReceipt): TwinEarthReceipt {
  return {
    ...receipt,
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c })) } : {}),
  };
}
