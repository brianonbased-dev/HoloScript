/**
 * HoloScript Agent Passport
 *
 * A binary-serializable credential bundle that combines:
 * - W3C DID identity (Decentralized Identifier)
 * - AgentState WAL (Write-Ahead Log) snapshot
 * - W/P/G compressed memory (Wisdom, Patterns, Gotchas)
 *
 * The passport serves as a portable, verifiable identity document for
 * HoloScript compiler agents, enabling cross-platform agent authentication,
 * state migration, and knowledge transfer.
 *
 * Binary format uses a custom CBOR-inspired encoding optimized for:
 * - Compact representation (50-70% smaller than JSON)
 * - Zero-copy field access for critical identity fields
 * - Streaming deserialization for large WAL snapshots
 * - Cryptographic integrity via Ed25519 signatures
 *
 * @version 1.0.0
 * @see https://www.w3.org/TR/did-cbor-representation/
 * @see https://arxiv.org/html/2511.02841v1
 */

import * as crypto from 'crypto';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  AgentChecksum,
  AgentKeyPair,
  calculateAgentChecksum,
  type AgentConfig,
} from './AgentIdentity';
import type { CapabilityToken, Capability } from './CapabilityToken';
import { PERMISSION_TO_ACTION, HOLOSCRIPT_RESOURCE_SCHEME } from './CapabilityToken';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Magic bytes identifying an Agent Passport binary: "HSAP" (HoloScript Agent Passport) */
export const PASSPORT_MAGIC = new Uint8Array([0x48, 0x53, 0x41, 0x50]);

/** Current binary format version */
export const PASSPORT_FORMAT_VERSION = 1;

/** Maximum passport size (1 MB) */
export const MAX_PASSPORT_SIZE = 1024 * 1024;

/** Section type identifiers for the binary format */
export enum PassportSection {
  /** DID identity section */
  DID_IDENTITY = 0x01,
  /** Agent state WAL snapshot */
  STATE_WAL = 0x02,
  /** Compressed memory (W/P/G) */
  COMPRESSED_MEMORY = 0x03,
  /** Cryptographic signature */
  SIGNATURE = 0x04,
  /** Permissions manifest */
  PERMISSIONS = 0x05,
  /** Delegation chain (legacy role-based) */
  DELEGATION = 0x06,
  /** UCAN capability delegation chain */
  CAPABILITY_DELEGATION = 0x07,
  /** DID version metadata */
  DID_VERSION = 0x08,
}

/** Memory entry types within compressed memory section */
export enum MemoryEntryType {
  WISDOM = 0x01,
  PATTERN = 0x02,
  GOTCHA = 0x03,
}

// ============================================================================
// DID VERSIONING
// ============================================================================

/**
 * DID format version.
 *
 * - **v1** (role-embedded): `did:holoscript:<role>:<fingerprint>`
 * - **v2** (role-agnostic): `did:holoscript:<fingerprint>`
 *
 * v2 decouples role from identity, allowing the same agent to assume
 * different roles without changing its DID.
 */
export type DIDVersion = 1 | 2;

// ============================================================================
// W3C DID IDENTITY TYPES
// ============================================================================

/**
 * W3C DID Document for an agent
 *
 * Implements a subset of the W3C DID Core specification
 * tailored for HoloScript compiler agents.
 *
 * DID method: did:holoscript:<role>:<fingerprint>
 */
export interface AgentDIDDocument {
  /** DID URI (e.g., v1: "did:holoscript:syntax_analyzer:abc123", v2: "did:holoscript:abc123def456") */
  id: string;

  /** DID method context */
  context: string[];

  /** Verification methods (Ed25519 public keys) */
  verificationMethod: DIDVerificationMethod[];

  /** Authentication references */
  authentication: string[];

  /** Assertion method references */
  assertionMethod: string[];

  /**
   * Capability delegation verification method references.
   *
   * Lists verification method IDs that are authorized to issue
   * UCAN capability tokens on behalf of this DID.
   * Only present in v2 DID documents.
   */
  capabilityDelegation?: string[];

  /**
   * Capability invocation verification method references.
   *
   * Lists verification method IDs that are authorized to invoke
   * capabilities granted via UCAN delegation chains.
   * Only present in v2 DID documents.
   */
  capabilityInvocation?: string[];

  /** Service endpoints for agent communication */
  service?: DIDServiceEndpoint[];

  /** Creation timestamp (ISO 8601) */
  created: string;

  /** Last update timestamp (ISO 8601) */
  updated: string;

  /** Agent role */
  agentRole: AgentRole;

  /** Agent checksum for configuration integrity */
  agentChecksum: AgentChecksum;
}

/**
 * DID Verification Method (Ed25519 key)
 */
export interface DIDVerificationMethod {
  /** Verification method ID */
  id: string;

  /** Method type */
  type: 'Ed25519VerificationKey2020';

  /** Controller DID */
  controller: string;

  /** Public key in multibase format (base58btc) */
  publicKeyMultibase: string;
}

/**
 * DID Service Endpoint
 */
export interface DIDServiceEndpoint {
  /** Service ID */
  id: string;

  /** Service type */
  type: string;

  /** Service endpoint URL */
  serviceEndpoint: string;
}

// ============================================================================
// AGENT STATE WAL TYPES
// ============================================================================

/**
 * Write-Ahead Log entry for agent state changes
 */
export interface WALEntry {
  /** Monotonic sequence number */
  sequence: number;

  /** Entry timestamp (Unix milliseconds) */
  timestamp: number;

  /** Operation type */
  operation: WALOperation;

  /** State key affected */
  key: string;

  /** New value (compressed) */
  value: Uint8Array;

  /** Previous value hash for rollback verification */
  previousHash: string;
}

/**
 * WAL operation types
 */
export enum WALOperation {
  SET = 0x01,
  DELETE = 0x02,
  MERGE = 0x03,
  CHECKPOINT = 0x04,
}

/**
 * Agent state WAL snapshot
 *
 * Captures the agent's current state as a compact WAL that can be
 * replayed to reconstruct state on another host.
 */
export interface AgentStateSnapshot {
  /** Agent ID */
  agentId: string;

  /** Current phase */
  currentPhase: string;

  /** Cycle number at snapshot time */
  cycleNumber: number;

  /** WAL entries since last checkpoint */
  walEntries: WALEntry[];

  /** Checkpoint hash (SHA-256 of full state at last checkpoint) */
  checkpointHash: string;

  /** Snapshot timestamp */
  snapshotTimestamp: number;

  /** Metrics at snapshot time */
  metrics: {
    phasesCompleted: number;
    totalCycles: number;
    efficiencyScore: number;
    tokenUsage: number;
  };
}

// ============================================================================
// COMPRESSED MEMORY TYPES (W/P/G)
// ============================================================================

/**
 * Compressed wisdom entry
 */
export interface CompressedWisdom {
  /** Wisdom ID (e.g., "W.014") */
  id: string;

  /** Compressed content */
  content: string;

  /** Domain classification */
  domain: string;

  /** Confidence score (0-1, stored as uint8 0-255) */
  confidence: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Compressed pattern entry
 */
export interface CompressedPattern {
  /** Pattern ID (e.g., "P.001") */
  id: string;

  /** Pattern name */
  name: string;

  /** Domain classification */
  domain: string;

  /** Confidence score (0-1, stored as uint8 0-255) */
  confidence: number;

  /** Usage count */
  usageCount: number;

  /** Template (compressed) */
  template: string;
}

/**
 * Compressed gotcha entry
 */
export interface CompressedGotcha {
  /** Gotcha ID (e.g., "G.003") */
  id: string;

  /** Trigger condition */
  trigger: string;

  /** Avoidance strategy */
  avoidance: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Occurrence count */
  occurrenceCount: number;
}

/**
 * Complete compressed memory block
 */
export interface CompressedMemory {
  /** Wisdom entries */
  wisdom: CompressedWisdom[];

  /** Pattern entries */
  patterns: CompressedPattern[];

  /** Gotcha entries */
  gotchas: CompressedGotcha[];

  /** Total compression ratio achieved */
  compressionRatio: number;

  /** Original size in bytes */
  originalSizeBytes: number;

  /** Compressed size in bytes */
  compressedSizeBytes: number;
}

// ============================================================================
// AGENT PASSPORT (COMPLETE)
// ============================================================================

/**
 * Complete Agent Passport
 *
 * Combines W3C DID identity, state WAL snapshot, and compressed memory
 * into a single portable, verifiable credential bundle.
 */
export interface AgentPassport {
  /** Format version */
  version: number;

  /**
   * DID format version.
   *
   * - `1` — role-embedded DID (`did:holoscript:<role>:<fingerprint>`)
   * - `2` — role-agnostic DID (`did:holoscript:<fingerprint>`)
   *
   * Defaults to `1` for backward compatibility with existing passports.
   */
  didVersion?: DIDVersion;

  /** W3C DID Document */
  did: AgentDIDDocument;

  /** Agent state WAL snapshot */
  stateSnapshot: AgentStateSnapshot;

  /** Compressed W/P/G memory */
  memory: CompressedMemory;

  /**
   * Permissions granted.
   *
   * @deprecated Use `capabilityDelegationChain` with UCAN tokens instead.
   * Retained for backward compatibility with v1 passports.
   */
  permissions: AgentPermission[];

  /**
   * Delegation chain (ordered list of roles that delegated authority).
   *
   * @deprecated Use `capabilityDelegationChain` with UCAN proof chains instead.
   * Retained for backward compatibility with v1 passports.
   */
  delegationChain: AgentRole[];

  /**
   * UCAN capability delegation chain.
   *
   * An ordered list of signed UCAN capability tokens forming a
   * cryptographic proof chain from a root authority to this agent.
   * Each token attenuates (narrows) the capabilities of its parent.
   *
   * Replaces the legacy `permissions` and `delegationChain` fields
   * with a decentralized, verifiable authorization model.
   */
  capabilityDelegationChain?: CapabilityToken[];

  /** Current workflow step */
  workflowStep: WorkflowStep;

  /** Passport issuance timestamp */
  issuedAt: number;

  /** Passport expiration timestamp */
  expiresAt: number;

  /** Ed25519 signature over passport contents */
  signature?: Uint8Array;

  /** Signing key ID */
  signingKeyId?: string;
}

// ============================================================================
// DID CONSTRUCTION
// ============================================================================

/**
 * Generate a v1 DID URI for an agent (role-embedded).
 *
 * Format: `did:holoscript:<role>:<fingerprint>`
 * Where fingerprint = first 16 hex chars of SHA-256(publicKey)
 *
 * @deprecated Prefer `generateAgentDIDv2` for new passports.
 */
export function generateAgentDID(role: AgentRole, publicKey: string): string {
  const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);
  return `did:holoscript:${role}:${fingerprint}`;
}

/**
 * Generate a v2 DID URI for an agent (role-agnostic).
 *
 * Format: `did:holoscript:<fingerprint>`
 * Where fingerprint = first 32 hex chars of SHA-256(publicKey)
 *
 * The role is NOT embedded in the DID, allowing the same agent identity
 * to assume different roles without changing its identifier.
 * The fingerprint is 32 hex chars (vs 16 for v1) to reduce collision risk
 * across a larger, role-independent namespace.
 */
export function generateAgentDIDv2(publicKey: string): string {
  const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 32);
  return `did:holoscript:${fingerprint}`;
}

/**
 * Create a DID Document for an agent.
 *
 * @param agentConfig - Agent configuration
 * @param keyPair - Agent key pair for DID and signing
 * @param services - Optional service endpoints
 * @param didVersion - DID version (default: 1 for backward compatibility)
 */
export function createDIDDocument(
  agentConfig: AgentConfig,
  keyPair: AgentKeyPair,
  services?: DIDServiceEndpoint[],
  didVersion: DIDVersion = 1
): AgentDIDDocument {
  const did =
    didVersion === 2
      ? generateAgentDIDv2(keyPair.publicKey)
      : generateAgentDID(agentConfig.role, keyPair.publicKey);

  // Convert public key to multibase (base58btc would be 'z' prefix)
  // For simplicity, use base64url with 'u' prefix
  const pubKeyBytes = crypto
    .createPublicKey(keyPair.publicKey)
    .export({ type: 'spki', format: 'der' });
  const publicKeyMultibase = 'u' + pubKeyBytes.toString('base64url');

  const now = new Date().toISOString();
  const checksum = calculateAgentChecksum(agentConfig);

  const contexts = [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1',
    'https://holoscript.dev/ns/agent/v1',
  ];
  if (didVersion === 2) {
    contexts.push('https://holoscript.dev/ns/agent/v2');
  }

  const doc: AgentDIDDocument = {
    id: did,
    context: contexts,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
    service: services,
    created: now,
    updated: now,
    agentRole: agentConfig.role,
    agentChecksum: checksum,
  };

  // Add capability-related verification methods for v2 documents
  if (didVersion === 2) {
    doc.capabilityDelegation = [`${did}#key-1`];
    doc.capabilityInvocation = [`${did}#key-1`];
  }

  return doc;
}

// ============================================================================
// PASSPORT CREATION
// ============================================================================

/**
 * Options for creating an Agent Passport
 */
export interface CreatePassportOptions {
  /** Agent configuration */
  agentConfig: AgentConfig;

  /** Agent key pair for DID and signing */
  keyPair: AgentKeyPair;

  /** Agent state snapshot */
  stateSnapshot: AgentStateSnapshot;

  /** Compressed W/P/G memory */
  memory: CompressedMemory;

  /**
   * Permissions to include.
   * @deprecated Use `capabilityDelegationChain` instead.
   */
  permissions: AgentPermission[];

  /**
   * Delegation chain (legacy role-based).
   * @deprecated Use `capabilityDelegationChain` instead.
   */
  delegationChain?: AgentRole[];

  /**
   * UCAN capability delegation chain.
   * When provided, the passport will use UCAN-based authorization.
   */
  capabilityDelegationChain?: CapabilityToken[];

  /** Current workflow step */
  workflowStep: WorkflowStep;

  /** Token lifetime in seconds (default: 86400 = 24h) */
  lifetimeSeconds?: number;

  /** DID service endpoints */
  services?: DIDServiceEndpoint[];

  /**
   * DID format version (default: 1).
   *
   * Set to `2` to generate a role-agnostic DID.
   */
  didVersion?: DIDVersion;
}

/**
 * Create a new Agent Passport
 *
 * Assembles DID document, state snapshot, and compressed memory
 * into a signed passport credential.
 */
export function createAgentPassport(options: CreatePassportOptions): AgentPassport {
  const {
    agentConfig,
    keyPair,
    stateSnapshot,
    memory,
    permissions,
    delegationChain = [],
    capabilityDelegationChain,
    workflowStep,
    lifetimeSeconds = 86400,
    services,
    didVersion = 1,
  } = options;

  const now = Date.now();
  const did = createDIDDocument(agentConfig, keyPair, services, didVersion);

  const passport: AgentPassport = {
    version: PASSPORT_FORMAT_VERSION,
    didVersion,
    did,
    stateSnapshot,
    memory,
    permissions,
    delegationChain,
    workflowStep,
    issuedAt: now,
    expiresAt: now + lifetimeSeconds * 1000,
  };

  if (capabilityDelegationChain && capabilityDelegationChain.length > 0) {
    passport.capabilityDelegationChain = capabilityDelegationChain;
  }

  return passport;
}

/**
 * Sign a passport with the agent's private key
 *
 * Signs the SHA-256 hash of the passport contents (excluding signature fields)
 * using Ed25519.
 */
export function signPassport(passport: AgentPassport, privateKey: string): AgentPassport {
  // Create a copy without signature fields for hashing
  const { signature: _sig, signingKeyId: _kid, ...passportData } = passport;

  // Serialize to canonical JSON for deterministic hashing
  const canonical = JSON.stringify(passportData, Object.keys(passportData).sort());
  const hash = crypto.createHash('sha256').update(canonical).digest();

  // Sign with Ed25519
  const sig = crypto.sign(null, hash, crypto.createPrivateKey(privateKey));

  return {
    ...passport,
    signature: new Uint8Array(sig),
    signingKeyId: passport.did.verificationMethod[0]?.id || '',
  };
}

/**
 * Verify a passport's cryptographic signature
 */
export function verifyPassportSignature(passport: AgentPassport): boolean {
  if (!passport.signature || !passport.signingKeyId) {
    return false;
  }

  // Find the verification method
  const verificationMethod = passport.did.verificationMethod.find(
    (vm) => vm.id === passport.signingKeyId
  );
  if (!verificationMethod) {
    return false;
  }

  // Reconstruct the canonical hash
  const { signature: _sig, signingKeyId: _kid, ...passportData } = passport;
  const canonical = JSON.stringify(passportData, Object.keys(passportData).sort());
  const hash = crypto.createHash('sha256').update(canonical).digest();

  // Decode multibase public key
  const pubKeyDer = Buffer.from(verificationMethod.publicKeyMultibase.substring(1), 'base64url');
  const publicKey = crypto.createPublicKey({
    key: pubKeyDer,
    format: 'der',
    type: 'spki',
  });

  // Verify Ed25519 signature
  return crypto.verify(null, hash, publicKey, Buffer.from(passport.signature));
}

/**
 * Check if a passport has expired
 */
export function isPassportExpired(passport: AgentPassport): boolean {
  return Date.now() > passport.expiresAt;
}

/**
 * Validate passport structural integrity
 */
export function validatePassport(passport: AgentPassport): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check version
  if (passport.version !== PASSPORT_FORMAT_VERSION) {
    errors.push(`Unsupported format version: ${passport.version}`);
  }

  // Check DID - supports both v1 and v2 formats
  if (!passport.did?.id?.startsWith('did:holoscript:')) {
    errors.push('Invalid DID URI: must start with did:holoscript:');
  }

  // Validate DID format matches declared version
  const didVer = passport.didVersion || 1;
  if (didVer === 1) {
    // v1: did:holoscript:<role>:<fingerprint> (4 colon-separated parts)
    const v1Parts = passport.did?.id?.split(':');
    if (v1Parts && v1Parts.length !== 4) {
      errors.push(
        `DID v1 format expected 4 parts (did:holoscript:<role>:<fingerprint>), got ${v1Parts.length}`
      );
    }
  } else if (didVer === 2) {
    // v2: did:holoscript:<fingerprint> (3 colon-separated parts)
    const v2Parts = passport.did?.id?.split(':');
    if (v2Parts && v2Parts.length !== 3) {
      errors.push(
        `DID v2 format expected 3 parts (did:holoscript:<fingerprint>), got ${v2Parts.length}`
      );
    }
  }

  if (!passport.did?.verificationMethod?.length) {
    errors.push('DID document must contain at least one verification method');
  }

  // Check state snapshot
  if (!passport.stateSnapshot?.agentId) {
    errors.push('State snapshot must contain agentId');
  }
  if (typeof passport.stateSnapshot?.cycleNumber !== 'number') {
    errors.push('State snapshot must contain cycleNumber');
  }

  // Check memory
  if (!passport.memory) {
    errors.push('Passport must contain compressed memory');
  }

  // Check timestamps
  if (!passport.issuedAt || !passport.expiresAt) {
    errors.push('Passport must contain issuedAt and expiresAt timestamps');
  }
  if (passport.expiresAt <= passport.issuedAt) {
    errors.push('expiresAt must be after issuedAt');
  }

  // Check expiration
  if (isPassportExpired(passport)) {
    errors.push('Passport has expired');
  }

  // Check signature if present
  if (passport.signature && !verifyPassportSignature(passport)) {
    errors.push('Invalid cryptographic signature');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a minimal WAL snapshot for testing or initialization
 */
export function createEmptyStateSnapshot(agentId: string): AgentStateSnapshot {
  return {
    agentId,
    currentPhase: 'INTAKE',
    cycleNumber: 0,
    walEntries: [],
    checkpointHash: crypto.createHash('sha256').update('empty').digest('hex'),
    snapshotTimestamp: Date.now(),
    metrics: {
      phasesCompleted: 0,
      totalCycles: 0,
      efficiencyScore: 0,
      tokenUsage: 0,
    },
  };
}

/**
 * Create an empty compressed memory block
 */
export function createEmptyMemory(): CompressedMemory {
  return {
    wisdom: [],
    patterns: [],
    gotchas: [],
    compressionRatio: 1.0,
    originalSizeBytes: 0,
    compressedSizeBytes: 0,
  };
}

/**
 * Extract the agent role from a DID URI.
 *
 * Works for v1 DIDs (`did:holoscript:<role>:<fingerprint>`).
 * Returns `null` for v2 DIDs since the role is not embedded.
 *
 * @example extractRoleFromDID("did:holoscript:syntax_analyzer:abc123") => "syntax_analyzer"
 * @example extractRoleFromDID("did:holoscript:abc123def456") => null
 */
export function extractRoleFromDID(did: string): AgentRole | null {
  const match = did.match(/^did:holoscript:([^:]+):/);
  if (!match) return null;

  const role = match[1] as AgentRole;
  if (!Object.values(AgentRole).includes(role)) return null;

  return role;
}

/**
 * Detect the DID version from a DID URI.
 *
 * - 4 colon-separated parts = v1 (`did:holoscript:<role>:<fingerprint>`)
 * - 3 colon-separated parts = v2 (`did:holoscript:<fingerprint>`)
 *
 * @returns The detected DID version, or `null` if the URI is not a valid HoloScript DID.
 */
export function detectDIDVersion(did: string): DIDVersion | null {
  if (!did.startsWith('did:holoscript:')) return null;

  const parts = did.split(':');
  if (parts.length === 4) return 1;
  if (parts.length === 3) return 2;
  return null;
}

/**
 * Get passport size estimate in bytes (before binary serialization)
 */
export function estimatePassportSize(passport: AgentPassport): number {
  const json = JSON.stringify(passport);
  return Buffer.byteLength(json, 'utf8');
}

// ============================================================================
// DID v2 UTILITIES
// ============================================================================

/**
 * Get the role-agnostic (v2) DID for a passport.
 *
 * If the passport already uses v2, returns the DID as-is.
 * If the passport uses v1, derives the v2 DID from the DID document's
 * first verification method public key.
 *
 * @param passport - The agent passport
 * @returns The v2 DID URI (`did:holoscript:<fingerprint>`)
 */
export function getDIDv2(passport: AgentPassport): string {
  const version = passport.didVersion || detectDIDVersion(passport.did.id) || 1;
  if (version === 2) {
    return passport.did.id;
  }

  // Derive v2 DID from the public key in the verification method
  const vm = passport.did.verificationMethod[0];
  if (!vm) {
    throw new Error('Cannot derive v2 DID: no verification method in DID document');
  }

  // The publicKeyMultibase starts with 'u' prefix (base64url)
  // Decode it back to DER, then hash for v2 fingerprint
  const pubKeyDer = Buffer.from(vm.publicKeyMultibase.substring(1), 'base64url');
  const fingerprint = crypto.createHash('sha256').update(pubKeyDer).digest('hex').substring(0, 32);
  return `did:holoscript:${fingerprint}`;
}

/**
 * Resolve the effective capabilities from a passport's UCAN delegation chain.
 *
 * Walks the `capabilityDelegationChain` and collects the attenuations
 * from the last token (the one granted to this agent). If no delegation
 * chain exists, falls back to converting legacy `permissions` to capabilities.
 *
 * @param passport - The agent passport
 * @returns Array of resolved capabilities
 */
export function getCapabilities(passport: AgentPassport): Capability[] {
  // Prefer UCAN delegation chain if present
  if (passport.capabilityDelegationChain && passport.capabilityDelegationChain.length > 0) {
    // The last token in the chain is the one granted to this agent
    const leafToken =
      passport.capabilityDelegationChain[passport.capabilityDelegationChain.length - 1];
    return [...leafToken.payload.att];
  }

  // Fall back to legacy permissions -> capability conversion
  return passport.permissions.map((perm: AgentPermission) => ({
    with: `${HOLOSCRIPT_RESOURCE_SCHEME}*`,
    can: PERMISSION_TO_ACTION[perm] || perm,
  }));
}

/**
 * Append a UCAN delegation token to a passport's capability delegation chain.
 *
 * Returns a new passport with the token appended (does NOT mutate the original).
 *
 * @param passport - The agent passport
 * @param token - The UCAN capability token to append
 * @returns A new passport with the token appended to `capabilityDelegationChain`
 */
export function addDelegation(passport: AgentPassport, token: CapabilityToken): AgentPassport {
  const existingChain = passport.capabilityDelegationChain || [];
  return {
    ...passport,
    capabilityDelegationChain: [...existingChain, token],
  };
}

/**
 * Migrate a v1 passport to v2 DID format.
 *
 * Produces a new passport with:
 * - `didVersion` set to `2`
 * - Role-agnostic DID
 * - Capability delegation/invocation methods in the DID document
 * - All other fields preserved (including legacy permissions/delegationChain)
 *
 * @param passport - The v1 passport to migrate
 * @returns A new passport with v2 DID format
 */
export function migratePassportToV2(passport: AgentPassport): AgentPassport {
  const currentVersion = passport.didVersion || 1;
  if (currentVersion === 2) {
    return passport; // Already v2
  }

  const v2Did = getDIDv2(passport);

  // Rebuild verification methods with new DID
  const newVerificationMethods = passport.did.verificationMethod.map((vm, idx) => ({
    ...vm,
    id: `${v2Did}#key-${idx + 1}`,
    controller: v2Did,
  }));

  const newDid: AgentDIDDocument = {
    ...passport.did,
    id: v2Did,
    context: [
      ...passport.did.context,
      ...(passport.did.context.includes('https://holoscript.dev/ns/agent/v2')
        ? []
        : ['https://holoscript.dev/ns/agent/v2']),
    ],
    verificationMethod: newVerificationMethods,
    authentication: newVerificationMethods.map((vm) => vm.id),
    assertionMethod: newVerificationMethods.map((vm) => vm.id),
    capabilityDelegation: newVerificationMethods.map((vm) => vm.id),
    capabilityInvocation: newVerificationMethods.map((vm) => vm.id),
  };

  return {
    ...passport,
    didVersion: 2,
    did: newDid,
    // Clear signature since the DID changed
    signature: undefined,
    signingKeyId: undefined,
  };
}
