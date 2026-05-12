/**
 * Core types for the HoloScript Secrets Broker.
 *
 * A secrets broker issues short-lived, scope-bounded capability receipts
 * ("handles") instead of exposing secret material. Any AI surface — mobile,
 * desktop, headless — receives a handle valid for one session or task.
 *
 * Design principles:
 *   1. Handles-only: the broker never returns plaintext in-band.
 *   2. Scope-bounded: each grant lists exact secret refs the agent may resolve.
 *   3. Time-bounded: TTL enforces session-scoped, not long-lived, credentials.
 *   4. Policy-gated: HoloDoor (or equivalent) checks every issuance.
 *   5. Audit-heavy: every grant, resolve, and revocation emits a signed receipt.
 *
 * @module secrets-broker/types
 */

/** A canonical reference to a secret. Format: `<surface>:<key>`.
 *  Surface may be `env`, `x402`, `custodial`, `gold`, `vault`.
 *  The string is the audit-safe label — NEVER the value. */
export type SecretRef = string;

/** A canonical capability reference. Format: `cap://<domain>/<capability>`.
 *  Only `cap://daemon/secrets/*` capabilities are accepted for brokered grants. */
export type CapabilityRef = string;

/** Policy outcome from the gatekeeper (HoloDoor or adapter). */
export type PolicyOutcome = 'allow' | 'warn' | 'block';

/** Issuance parameters for a brokered secret grant. */
export interface SecretGrantInput {
  /** Namespace that scopes the secretRef (workspace, team, project, etc.). */
  namespaceId: string;
  /** Registered agent identity (x402 seat, HoloMesh agentId, etc.). */
  agentId: string;
  /** Canonical secret reference the agent needs access to. */
  secretRef: SecretRef;
  /** Capability the agent claims it needs (must be `cap://daemon/secrets/*`). */
  capabilityRef: CapabilityRef;
  /** Human-readable purpose for audit and compliance. */
  purpose: string;
  /** TTL in seconds (default 15 min, max 1 h). */
  ttlSeconds?: number;
  /** Optional fixed clock for deterministic tests. */
  now?: Date;
  /** If the grant was pre-checked by a policy gate, record the decision id. */
  policyDecisionId?: string;
  /** If the grant was pre-checked, record the outcome. */
  policyOutcome?: PolicyOutcome;
}

/** Immutable receipt issued when a secret grant succeeds.
 *  Contains ZERO secret material — only handles, hashes, and audit metadata. */
export interface SecretGrantReceipt {
  version: 1;
  event: 'secret.granted';
  /** Deterministic grant id. */
  grantId: string;
  namespaceId: string;
  agentId: string;
  /** Convenience alias matching agentId. */
  agent: string;
  /** The canonical secret handle. */
  secretRef: SecretRef;
  /** Convenience alias matching secretRef. */
  ref: SecretRef;
  capabilityRef: CapabilityRef;
  purpose: string;
  issuedAt: string;
  expiresAt: string;
  /** Always `brokered-handle` — plaintext is NEVER returned in-band. */
  accessMode: 'brokered-handle';
  plaintextReturned: false;
  /** HoloDoor decision id that gated this grant, if any. */
  policyDecisionId: string | null;
  /** HoloDoor outcome, if any. */
  policyOutcome: Exclude<PolicyOutcome, 'block'> | null;
  /** SHA-256 over the canonical JSON of this receipt (minus receiptHash). */
  receiptHash: string;
  auditTags: string[];
}

/** Policy configuration enforced before a grant is issued. */
export interface SecretGrantPolicyConfig {
  allowedSecretRefPrefixes?: string[];
  blockedSecretRefPrefixes?: string[];
  allowedCapabilityRefs?: string[];
  blockedCapabilityRefs?: string[];
  allowedAgentIds?: string[];
  blockedAgentIds?: string[];
  maxTtlSeconds?: number;
  requirePurpose?: boolean;
}

/** Structured policy gate definition consumed by the broker. */
export interface SecretBrokerPolicy {
  secretGrants?: SecretGrantPolicyConfig;
  enforcement?: {
    onViolation?: 'warn' | 'block';
  };
}

/** Result of a policy check before issuance. */
export interface PolicyDecision {
  version: 1;
  event: 'holodoor.policy.checked';
  decisionId: string;
  outcome: PolicyOutcome;
  reasons: string[];
  namespaceId: string;
  agentId: string;
  secretRef: SecretRef;
  capabilityRef: CapabilityRef;
  requestedTtlSeconds: number;
  effectiveTtlSeconds: number;
  checkedAt: string;
  plaintextReturned: false;
  receiptHash: string;
  auditTags: string[];
}

/** Combined result when a grant is gated by policy. */
export interface PolicyGatedGrant {
  policyDecision: PolicyDecision;
  grant: SecretGrantReceipt;
}

/** Error thrown when policy blocks a grant. */
export class SecretGrantPolicyError extends Error {
  readonly decision: PolicyDecision;
  constructor(decision: PolicyDecision) {
    super('Policy gate blocked this secret grant request');
    this.name = 'SecretGrantPolicyError';
    this.decision = decision;
  }
}

/** A handle entry in the broker manifest. */
export interface BrokerSecretHandle {
  name: string;
  ref: SecretRef;
  usedBy: string[];
  access: 'broker-only';
}

/** Manifest that maps human-readable names to scoped secret refs. */
export interface BrokerManifest {
  version: 1;
  namespaceId: string;
  storage: 'server-side' | 'github-actions-secret' | 'env-file' | 'vault';
  plaintextInNamespace: false;
  handlesOnly: true;
  handles: BrokerSecretHandle[];
  grantEndpoint: string;
  brokerCapabilities: CapabilityRef[];
}

/** Lease adapter interface — the broker never holds leases itself;
 *  it delegates to a vault-lease registry (e.g. HoloMesh vault-lease-registry). */
export interface LeaseAdapter {
  /** Issue a lease scoped to the given task and agent. */
  issueLease(params: {
    taskId: string;
    agentId: string;
    scope: SecretRef[];
    durationMs?: number;
  }): Promise<{ leaseId: string; expiresAt: string }>;

  /** Resolve whether the lease permits reading `secretRef`. Returns boolean;
   *  the actual value is fetched by a separate secret-store adapter. */
  resolveLease(params: {
    leaseId: string;
    agentId: string;
    secretRef: SecretRef;
  }): Promise<{ ok: boolean; reason?: string }>;

  /** Revoke a lease early (task done, agent compromise, rotation, etc.). */
  revokeLease(params: {
    leaseId: string;
    reason: string;
    by: string;
  }): Promise<{ ok: boolean }>;
}

/** Device-flow provisioning result for a new AI surface. */
export interface DeviceFlowProvisionResult {
  status: 'executed' | 'reused';
  handle: string;
  surface: string;
  seatId: string;
  walletAddress: string;
  bearer?: string;
  agentId?: string;
  envVarLines: string[];
}
