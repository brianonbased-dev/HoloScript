/**
 * HoloScript UCAN-Style Capability Token Interfaces
 *
 * Implements capability-based authorization following the UCAN (User Controlled
 * Authorization Networks) specification. Capability tokens enable decentralized,
 * attenuated delegation of permissions without requiring a central authority
 * for every access decision.
 *
 * Key concepts:
 * - **Capability Semantics**: Resource + action pairs (with/can pattern)
 * - **Attenuation**: Delegated tokens can only narrow, never widen parent scope
 * - **Proof chains**: Tokens carry cryptographic proof of their delegation lineage
 * - **Self-certifying**: Each token is signed by the issuer's Ed25519 key
 *
 * @version 1.0.0
 * @see https://ucan.xyz/
 * @see https://github.com/ucan-wg/spec
 */

import { AgentRole, AgentPermission } from './AgentIdentity';

// ---------------------------------------------------------------------------
// Capability Semantics (with / can pattern)
// ---------------------------------------------------------------------------

/**
 * A single capability grant following the UCAN "with/can" pattern.
 *
 * `with` identifies the resource (URI-style), `can` identifies the action
 * namespace, and `nb` (not-before caveats) carry additional constraints.
 *
 * @example
 * ```ts
 * const cap: Capability = {
 *   with: 'holoscript://packages/core/ast',
 *   can: 'ast/write',
 * };
 * ```
 */
export interface Capability {
  /** Resource URI the capability applies to (e.g. "holoscript://packages/core/ast") */
  with: string;

  /** Action namespace (e.g. "ast/read", "ast/write", "code/generate") */
  can: string;

  /** Optional caveats / constraints narrowing this capability */
  nb?: Record<string, unknown>;
}

/**
 * Semantics engine for evaluating whether one capability is a valid
 * attenuation (subset) of another.
 *
 * Implementations decide the resource hierarchy and action containment
 * rules for a particular domain.
 */
export interface CapabilitySemantics {
  /**
   * Return `true` if `child` is equal to or a strict subset of `parent`.
   *
   * This is the core attenuation check: a delegated capability must never
   * grant more authority than its parent.
   */
  isSubsetOf(child: Capability, parent: Capability): boolean;

  /**
   * Return `true` if `capability` authorises the given resource + action pair.
   */
  canAccess(capability: Capability, resource: string, action: string): boolean;

  /**
   * Parse a HoloScript `AgentPermission` enum value into a `Capability`.
   *
   * Allows bridging between the legacy RBAC permission model and the new
   * capability system.
   */
  fromPermission(permission: AgentPermission, scope?: string): Capability;
}

// ---------------------------------------------------------------------------
// Capability Token (UCAN-aligned)
// ---------------------------------------------------------------------------

/**
 * UCAN capability token header.
 *
 * Based on the UCAN 0.10 specification header fields.
 */
export interface CapabilityTokenHeader {
  /** Algorithm — always Ed25519 for HoloScript */
  alg: 'EdDSA';

  /** Token type */
  typ: 'JWT';

  /** UCAN version */
  ucv: '0.10.0';
}

/**
 * Core UCAN-style capability token payload.
 *
 * Fields follow the UCAN specification naming conventions:
 * - `iss` — Issuer DID (the entity that created and signed this token)
 * - `aud` — Audience DID (the entity this token is delegated *to*)
 * - `att` — Attenuations (the capabilities being granted)
 * - `prf` — Proofs (CIDs / references to parent tokens in the chain)
 * - `exp` — Expiration (Unix timestamp, seconds)
 * - `nbf` — Not-before (Unix timestamp, seconds)
 * - `nnc` — Nonce (prevents replay)
 * - `fct` — Facts (arbitrary metadata about this token)
 */
export interface CapabilityTokenPayload {
  /** Issuer — DID or agent identifier that created this token */
  iss: string;

  /** Audience — DID or agent identifier this token is delegated to */
  aud: string;

  /** Attenuations — capabilities granted by this token */
  att: Capability[];

  /** Proof references — identifiers of parent tokens in the delegation chain */
  prf: string[];

  /** Expiration time (Unix timestamp in seconds) */
  exp: number;

  /** Not-before time (Unix timestamp in seconds). Token is invalid before this. */
  nbf?: number;

  /** Nonce — unique value to prevent replay attacks */
  nnc: string;

  /** Facts — additional metadata (non-authoritative) */
  fct?: Record<string, unknown>;
}

/**
 * A fully-formed, signed capability token.
 *
 * This is the "wire format" representation that gets passed between agents
 * and verified on receipt.
 */
export interface CapabilityToken {
  /** Token header */
  header: CapabilityTokenHeader;

  /** Token payload */
  payload: CapabilityTokenPayload;

  /** Ed25519 signature over `header.payload` (base64url encoded) */
  signature: string;

  /** The serialised JWT string (header.payload.signature) */
  raw: string;
}

// ---------------------------------------------------------------------------
// Attenuation / Delegation Chain
// ---------------------------------------------------------------------------

/**
 * A single link in a delegation chain.
 *
 * Records who delegated to whom, what capabilities were passed down, and
 * when the delegation happened.
 */
export interface DelegationLink {
  /** The token ID (nnc) of this delegation */
  tokenId: string;

  /** Issuer of this link (delegator) */
  issuer: string;

  /** Audience of this link (delegatee) */
  audience: string;

  /** Agent role of the issuer (if applicable) */
  issuerRole?: AgentRole;

  /** Agent role of the audience (if applicable) */
  audienceRole?: AgentRole;

  /** Capabilities granted at this link */
  capabilities: Capability[];

  /** Timestamp of this delegation (Unix seconds) */
  issuedAt: number;

  /** Expiration of this delegation (Unix seconds) */
  expiresAt: number;
}

/**
 * A complete attenuation chain tracking the full delegation lineage from
 * the root authority to the current holder.
 *
 * Invariant: for every adjacent pair `(chain[i], chain[i+1])`:
 *   - `chain[i+1].issuer === chain[i].audience`
 *   - every capability in `chain[i+1].capabilities` is a subset of
 *     at least one capability in `chain[i].capabilities`
 *   - `chain[i+1].expiresAt <= chain[i].expiresAt`
 *
 * Violation of any invariant makes the chain invalid.
 */
export interface AttenuationChain {
  /** Ordered list of delegation links (index 0 = root authority) */
  links: DelegationLink[];

  /** The root authority's identifier (must match links[0].issuer) */
  rootAuthority: string;

  /** Whether the chain has been verified end-to-end */
  verified: boolean;

  /** Timestamp of last verification */
  verifiedAt?: string;
}

// ---------------------------------------------------------------------------
// Verification results
// ---------------------------------------------------------------------------

/**
 * Result of verifying a capability token.
 */
export interface CapabilityVerificationResult {
  /** Whether the token is valid */
  valid: boolean;

  /** Decoded payload (present when valid) */
  payload?: CapabilityTokenPayload;

  /** Resolved attenuation chain (present when valid) */
  chain?: AttenuationChain;

  /** Error message (present when invalid) */
  error?: string;

  /** Structured error code */
  errorCode?:
    | 'EXPIRED'
    | 'NOT_YET_VALID'
    | 'INVALID_SIGNATURE'
    | 'INVALID_CHAIN'
    | 'ATTENUATION_VIOLATION'
    | 'MISSING_PROOF'
    | 'REPLAY_DETECTED';
}

// ---------------------------------------------------------------------------
// Token creation helpers
// ---------------------------------------------------------------------------

/**
 * Options for issuing a new root capability token (no parent proofs).
 */
export interface RootTokenOptions {
  /** Issuer identifier (DID or agent ID) */
  issuer: string;

  /** Audience identifier (DID or agent ID) */
  audience: string;

  /** Capabilities to grant */
  capabilities: Capability[];

  /** Lifetime in seconds (default: 86400 = 24 h) */
  lifetimeSec?: number;

  /** Optional not-before offset in seconds from now */
  notBeforeOffsetSec?: number;

  /** Optional additional facts / metadata */
  facts?: Record<string, unknown>;
}

/**
 * Options for delegating (attenuating) an existing capability token.
 */
export interface DelegationOptions {
  /** The parent token being delegated from */
  parentToken: CapabilityToken;

  /** New audience (delegatee) */
  audience: string;

  /**
   * Capabilities to grant in the delegated token.
   * Each MUST be a subset of the parent's attenuations.
   */
  capabilities: Capability[];

  /** Lifetime in seconds (MUST NOT exceed parent's remaining lifetime) */
  lifetimeSec?: number;

  /** Optional additional facts / metadata */
  facts?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// HoloScript-specific capability constants
// ---------------------------------------------------------------------------

/**
 * Standard resource URI scheme for HoloScript capabilities.
 */
export const HOLOSCRIPT_RESOURCE_SCHEME = 'holoscript://';

/**
 * Wildcard resource — matches any HoloScript resource.
 * Only the root orchestrator should hold this.
 */
export const HOLOSCRIPT_RESOURCE_ALL = 'holoscript://*';

/**
 * Standard HoloScript capability action namespaces.
 *
 * Mirrors the existing `AgentPermission` enum but in UCAN action-namespace
 * form.
 */
export const CapabilityActions = {
  // Source
  SOURCE_READ: 'source/read',

  // Config
  CONFIG_READ: 'config/read',

  // AST
  AST_READ: 'ast/read',
  AST_WRITE: 'ast/write',
  AST_TRANSFORM: 'ast/transform',

  // IR
  IR_READ: 'ir/read',
  IR_WRITE: 'ir/write',
  IR_TRANSFORM: 'ir/transform',

  // Code
  CODE_READ: 'code/read',
  CODE_WRITE: 'code/write',

  // Output
  OUTPUT_WRITE: 'output/write',

  // Execution
  EXECUTE_OPTIMIZATION: 'execute/optimization',
  EXECUTE_CODEGEN: 'execute/codegen',
  EXECUTE_EXPORT: 'execute/export',

  // Proof-of-Play (computation attestation)
  PROOF_OF_PLAY_WRITE: 'proof_of_play/write',
  PROOF_OF_PLAY_READ: 'proof_of_play/read',
  PROOF_OF_PLAY_VERIFY: 'proof_of_play/verify',

  // Wildcard (orchestrator only)
  ALL: '*',
} as const;

export type CapabilityAction = (typeof CapabilityActions)[keyof typeof CapabilityActions];

/**
 * Mapping from legacy `AgentPermission` enum values to UCAN capability
 * action strings. Used by the bridge adapter (`CapabilityRBAC`).
 */
export const PERMISSION_TO_ACTION: Record<AgentPermission, string> = {
  [AgentPermission.READ_SOURCE]: CapabilityActions.SOURCE_READ,
  [AgentPermission.READ_CONFIG]: CapabilityActions.CONFIG_READ,
  [AgentPermission.READ_AST]: CapabilityActions.AST_READ,
  [AgentPermission.READ_IR]: CapabilityActions.IR_READ,
  [AgentPermission.READ_CODE]: CapabilityActions.CODE_READ,
  [AgentPermission.WRITE_AST]: CapabilityActions.AST_WRITE,
  [AgentPermission.WRITE_IR]: CapabilityActions.IR_WRITE,
  [AgentPermission.WRITE_CODE]: CapabilityActions.CODE_WRITE,
  [AgentPermission.WRITE_OUTPUT]: CapabilityActions.OUTPUT_WRITE,
  [AgentPermission.TRANSFORM_AST]: CapabilityActions.AST_TRANSFORM,
  [AgentPermission.TRANSFORM_IR]: CapabilityActions.IR_TRANSFORM,
  [AgentPermission.EXECUTE_OPTIMIZATION]: CapabilityActions.EXECUTE_OPTIMIZATION,
  [AgentPermission.EXECUTE_CODEGEN]: CapabilityActions.EXECUTE_CODEGEN,
  [AgentPermission.EXECUTE_EXPORT]: CapabilityActions.EXECUTE_EXPORT,
};

/**
 * Reverse mapping: UCAN action string -> legacy AgentPermission.
 */
export const ACTION_TO_PERMISSION: Record<string, AgentPermission> = Object.fromEntries(
  Object.entries(PERMISSION_TO_ACTION).map(([perm, action]) => [action, perm as AgentPermission])
) as Record<string, AgentPermission>;
