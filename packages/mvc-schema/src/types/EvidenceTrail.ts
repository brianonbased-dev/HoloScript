/**
 * EvidenceTrail - VCP v1.1 Hash Chain
 *
 * Verifiable Credential Protocol v1.1 compliant hash chain for tamper-proof
 * evidence tracking. Each entry is cryptographically linked to previous entries.
 *
 * Target: <2KB compressed
 * @version 1.0.0
 */

/**
 * Evidence entry type
 */
export type EvidenceType =
  | 'observation'
  | 'action'
  | 'reasoning'
  | 'external_data'
  | 'credential'
  | 'attestation'
  | 'measurement';

/**
 * Hash algorithm identifier
 */
export type HashAlgorithm = 'sha256' | 'sha512' | 'blake3';

/**
 * Single evidence entry in hash chain
 */
export interface EvidenceEntry {
  /** Entry sequence number (monotonically increasing) */
  sequence: number;

  /** Entry type */
  type: EvidenceType;

  /** Entry timestamp */
  timestamp: number;

  /** Evidence content (max 300 chars) */
  content: string;

  /** Hash of this entry's data */
  hash: string;

  /** Hash of previous entry (null for genesis entry) */
  previousHash: string | null;

  /** Agent DID that created this entry */
  agentDid: string;

  /** Optional: Digital signature (DID-based) */
  signature?: string;

  /** Optional: Source/origin of evidence */
  source?: string;

  /** Optional: Confidence score (0-1) */
  confidence?: number;

  /** Optional: Related entity/object ID */
  relatedTo?: string;
}

/**
 * VCP v1.1 metadata
 */
export interface VCPMetadata {
  /** VCP version */
  version: '1.1';

  /** Hash algorithm used */
  hashAlgorithm: HashAlgorithm;

  /** Chain creation timestamp */
  createdAt: number;

  /** Chain creator DID */
  creatorDid: string;

  /** Optional: Chain purpose/context */
  purpose?: string;

  /** Optional: Expiration timestamp */
  expiresAt?: number;
}

/**
 * Hash chain verification result
 */
export interface ChainVerificationResult {
  /** Is chain valid */
  valid: boolean;

  /** Total entries verified */
  entriesVerified: number;

  /** Broken links (if any) */
  brokenLinks: number[];

  /** Invalid signatures (if any) */
  invalidSignatures: number[];

  /** Verification timestamp */
  verifiedAt: number;

  /** Optional: Error message */
  error?: string;
}

/**
 * EvidenceTrail CRDT (Append-only hash chain)
 *
 * Uses VCP v1.1 hash chain for tamper-proof evidence:
 * - Append-only (no edits or deletes)
 * - Each entry cryptographically linked to previous
 * - Merge = append entries in sequence order
 * - Verification detects tampering
 */
export interface EvidenceTrail {
  /** CRDT type identifier */
  crdtType: 'hash-chain';

  /** Unique CRDT instance ID */
  crdtId: string;

  /** VCP v1.1 metadata */
  vcpMetadata: VCPMetadata;

  /** Ordered evidence entries (genesis first) */
  entries: EvidenceEntry[];

  /** Current chain head hash */
  headHash: string;

  /** Last verification result (if verified) */
  lastVerification?: ChainVerificationResult;

  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * EvidenceTrail metadata
 */
export interface EvidenceTrailMetadata {
  /** Total entries in chain */
  entryCount: number;

  /** Chain length (bytes) */
  chainSize: number;

  /** Earliest entry timestamp */
  oldestEntry: number;

  /** Latest entry timestamp */
  newestEntry: number;

  /** Entry type distribution */
  typeDistribution: Record<EvidenceType, number>;

  /** Contributing agent DIDs */
  agentDids: string[];

  /** Is chain verified */
  isVerified: boolean;

  /** Verification timestamp (if verified) */
  lastVerifiedAt?: number;
}
