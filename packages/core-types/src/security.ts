/**
 * @holoscript/core-types Security Types -- RBAC, Capabilities, Permissions
 *
 * Pure type definitions for the HoloScript security layer. Covers:
 * - Agent roles and permissions (compiler pipeline RBAC)
 * - Resource access control (requests, decisions)
 * - UCAN capability tokens (with/can pattern, delegation chains)
 * - Capability-aware dual-mode RBAC
 * - Role trait permissions (scene-level)
 * - Confabulation validation results
 *
 * This file has ZERO imports. All referenced types are inlined so that
 * downstream packages can depend on @holoscript/core-types without
 * pulling in @holoscript/core or any Node.js built-ins.
 *
 * @version 1.0.0
 */

// =============================================================================
// AGENT ROLES & PERMISSIONS (compiler pipeline)
// =============================================================================

/**
 * Agent roles in the HoloScript compiler pipeline.
 *
 * Mirrors `AgentRole` enum from `@holoscript/core` as a string union
 * so consumers do not need a runtime enum import.
 */
export type AgentRole =
  | 'syntax_analyzer'
  | 'ast_optimizer'
  | 'code_generator'
  | 'exporter'
  | 'orchestrator';

/**
 * Fine-grained permissions for compiler agent operations.
 *
 * Mirrors `AgentPermission` enum from `@holoscript/core` as a string union.
 */
export type AgentPermission =
  // Read
  | 'read:source'
  | 'read:config'
  | 'read:ast'
  | 'read:ir'
  | 'read:code'
  // Write
  | 'write:ast'
  | 'write:ir'
  | 'write:code'
  | 'write:output'
  // Transform
  | 'transform:ast'
  | 'transform:ir'
  // Execute
  | 'execute:optimization'
  | 'execute:codegen'
  | 'execute:export';

/**
 * Workflow steps in the compilation pipeline.
 *
 * Mirrors `WorkflowStep` enum from `@holoscript/core` as a string union.
 */
export type WorkflowStep =
  | 'parse_tokens'
  | 'build_ast'
  | 'analyze_ast'
  | 'apply_transforms'
  | 'select_instructions'
  | 'generate_assembly'
  | 'format_output'
  | 'serialize';

// =============================================================================
// CULTURAL PROFILE (identity-layer)
// =============================================================================

/**
 * Cultural family archetype for agent cooperation styles.
 */
export type CulturalFamily =
  | 'cooperative'
  | 'competitive'
  | 'hierarchical'
  | 'egalitarian'
  | 'isolationist';

/**
 * Prompt / communication dialect for agent interactions.
 */
export type PromptDialect =
  | 'directive'
  | 'socratic'
  | 'narrative'
  | 'structured'
  | 'consensus'
  | 'reactive';

/**
 * Cultural profile metadata embedded in agent JWT tokens.
 *
 * Carries the same dimensions as `CulturalProfileTrait` so they can
 * travel inside tokens and be validated without re-parsing the composition.
 */
export interface CulturalProfileMetadata {
  /** Willingness to cooperate, 0-1 (0 = adversarial, 1 = fully cooperative) */
  cooperation_index: number;

  /** Cultural family archetype */
  cultural_family: CulturalFamily;

  /** Prompt / communication dialect */
  prompt_dialect: PromptDialect;
}

// =============================================================================
// AGENT IDENTITY
// =============================================================================

/**
 * Agent configuration used for checksum calculation.
 */
export interface AgentConfig {
  role: AgentRole;
  name: string;
  version: string;

  /** Agent-specific prompt or system instructions */
  prompt?: string;

  /** Tools/capabilities available to this agent */
  tools?: string[];

  /** Configuration parameters */
  configuration?: Record<string, unknown>;

  /** Optional target scope (e.g., package path restriction) */
  scope?: string;

  /** Optional cultural profile metadata */
  culturalProfile?: CulturalProfileMetadata;
}

/**
 * Agent checksum for deterministic identity.
 * Based on Agentic JWT specification Section 3.2.
 */
export interface AgentChecksum {
  /** SHA-256 hash of agent configuration */
  hash: string;

  /** Algorithm used (always 'sha256') */
  algorithm: 'sha256';

  /** Timestamp when checksum was calculated */
  calculatedAt: string;

  /** Human-readable label for debugging */
  label: string;
}

/**
 * Ed25519 key pair for Proof-of-Possession.
 */
export interface AgentKeyPair {
  publicKey: string;
  privateKey: string;
  kid: string;
  thumbprint: string;
}

/**
 * Intent token payload extending standard JWT.
 * Based on Agentic JWT specification Section 4.
 */
export interface IntentTokenPayload {
  /** Standard JWT claims */
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;

  /** Agent-specific claims */
  agent_role: AgentRole;
  agent_checksum: AgentChecksum;

  /** Permissions granted to this agent */
  permissions: AgentPermission[];

  /** Scope restriction (e.g., package path) */
  scope?: string;

  /** Workflow metadata */
  intent: {
    workflow_id: string;
    workflow_step: WorkflowStep;
    executed_by: AgentRole;
    initiated_by: AgentRole;
    delegation_chain: AgentRole[];
    execution_context?: Record<string, unknown>;
  };

  /** Cultural profile metadata embedded in the token */
  cultural_profile?: CulturalProfileMetadata;

  /** Proof-of-Possession confirmation (JWK thumbprint) */
  cnf?: {
    jkt: string;
  };

  /** Ed25519 public key for PoP verification (PEM format) */
  publicKey?: string;
}

// =============================================================================
// RESOURCE ACCESS CONTROL
// =============================================================================

/**
 * Resource types in the compiler pipeline.
 *
 * Mirrors `ResourceType` enum from `@holoscript/core` as a string union.
 */
export type ResourceType = 'source_file' | 'ast' | 'ir' | 'code' | 'output' | 'config';

/**
 * Access control decision returned by AgentRBAC.
 */
export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  requiredPermission?: AgentPermission;
  agentRole?: AgentRole;
}

/**
 * Resource access request used by AgentRBAC.
 */
export interface ResourceAccessRequest {
  /** Agent's JWT token */
  token: string;

  /** Resource type being accessed */
  resourceType: ResourceType;

  /** Operation being performed */
  operation: 'read' | 'write' | 'execute' | 'transform';

  /** Resource path (for scope validation) */
  resourcePath?: string;

  /** Expected workflow step */
  expectedWorkflowStep?: WorkflowStep;
}

// =============================================================================
// UCAN CAPABILITY TOKENS
// =============================================================================

/**
 * A single capability grant following the UCAN "with/can" pattern.
 *
 * `with` identifies the resource (URI-style), `can` identifies the action
 * namespace, and `nb` (not-before caveats) carry additional constraints.
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
 * Semantics engine interface for evaluating capability attenuation.
 */
export interface CapabilitySemantics {
  /** Return true if child is equal to or a strict subset of parent */
  isSubsetOf(child: Capability, parent: Capability): boolean;

  /** Return true if capability authorises the given resource + action pair */
  canAccess(capability: Capability, resource: string, action: string): boolean;

  /** Parse a legacy AgentPermission into a Capability */
  fromPermission(permission: AgentPermission, scope?: string): Capability;
}

/**
 * UCAN capability token header.
 */
export interface CapabilityTokenHeader {
  /** Algorithm -- always Ed25519 for HoloScript */
  alg: 'EdDSA';

  /** Token type */
  typ: 'JWT';

  /** UCAN version */
  ucv: '0.10.0';
}

/**
 * Core UCAN-style capability token payload.
 */
export interface CapabilityTokenPayload {
  /** Issuer -- DID or agent identifier that created this token */
  iss: string;

  /** Audience -- DID or agent identifier this token is delegated to */
  aud: string;

  /** Attenuations -- capabilities granted by this token */
  att: Capability[];

  /** Proof references -- identifiers of parent tokens in the delegation chain */
  prf: string[];

  /** Expiration time (Unix timestamp in seconds) */
  exp: number;

  /** Not-before time (Unix timestamp in seconds) */
  nbf?: number;

  /** Nonce -- unique value to prevent replay attacks */
  nnc: string;

  /** Facts -- additional metadata (non-authoritative) */
  fct?: Record<string, unknown>;
}

/**
 * A fully-formed, signed capability token (wire format).
 */
export interface CapabilityToken {
  /** Token header */
  header: CapabilityTokenHeader;

  /** Token payload */
  payload: CapabilityTokenPayload;

  /** Ed25519 signature over header.payload (base64url encoded) */
  signature: string;

  /** The serialised JWT string (header.payload.signature) */
  raw: string;
}

// =============================================================================
// DELEGATION CHAIN (UCAN attenuation)
// =============================================================================

/**
 * A single link in a delegation chain.
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
 * A complete attenuation chain tracking delegation lineage from root to holder.
 *
 * Invariant: for every adjacent pair (chain[i], chain[i+1]):
 *   - chain[i+1].issuer === chain[i].audience
 *   - every capability in chain[i+1] is a subset of chain[i]
 *   - chain[i+1].expiresAt <= chain[i].expiresAt
 */
export interface AttenuationChain {
  /** Ordered list of delegation links (index 0 = root authority) */
  links: DelegationLink[];

  /** The root authority's identifier */
  rootAuthority: string;

  /** Whether the chain has been verified end-to-end */
  verified: boolean;

  /** Timestamp of last verification */
  verifiedAt?: string;
}

// =============================================================================
// CAPABILITY VERIFICATION
// =============================================================================

/**
 * Structured error codes for capability token verification.
 */
export type CapabilityVerificationErrorCode =
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'INVALID_SIGNATURE'
  | 'INVALID_CHAIN'
  | 'ATTENUATION_VIOLATION'
  | 'MISSING_PROOF'
  | 'REPLAY_DETECTED';

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
  errorCode?: CapabilityVerificationErrorCode;
}

// =============================================================================
// TOKEN CREATION OPTIONS
// =============================================================================

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

  /** Lifetime in seconds (default: 86400 = 24h) */
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

// =============================================================================
// CAPABILITY-AWARE DUAL-MODE RBAC
// =============================================================================

/**
 * Configuration for the CapabilityRBAC adapter.
 */
export interface CapabilityRBACConfig {
  /**
   * Resolution strategy:
   * - `capability-first`: Try UCAN first, fall back to JWT (default)
   * - `rbac-first`: Try JWT first, fall back to UCAN
   * - `capability-only`: Only accept UCAN tokens
   * - `rbac-only`: Only accept JWT tokens
   */
  strategy?: 'capability-first' | 'rbac-first' | 'capability-only' | 'rbac-only';
}

/**
 * Extended access decision that includes capability-specific context.
 *
 * Returned by the CapabilityRBAC adapter for dual-mode authorization.
 */
export interface CapabilityAccessDecision extends AccessDecision {
  /** The authorization mode that was used */
  mode: 'rbac' | 'capability';

  /** Matched capability (when mode === 'capability') */
  matchedCapability?: Capability;

  /** Verification result (when mode === 'capability') */
  capabilityVerification?: CapabilityVerificationResult;

  /** Optional detailed error code */
  errorCode?: string;
}

/**
 * Extended resource access request that can carry either a JWT token
 * or a UCAN capability token.
 */
export interface CapabilityAccessRequest extends ResourceAccessRequest {
  /**
   * UCAN capability token (alternative to the JWT `token` field).
   * When provided, the adapter will try UCAN verification first.
   */
  capabilityToken?: CapabilityToken;

  /**
   * Ed25519 public key for UCAN signature verification.
   * Required when `capabilityToken` is provided.
   */
  issuerPublicKey?: string;
}

// =============================================================================
// CONFABULATION VALIDATION
// =============================================================================

/**
 * Allowed types for trait property values.
 */
export type TraitPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'color'
  | 'vector3'
  | 'enum'
  | 'any';

/**
 * Schema definition for a single trait property.
 */
export interface TraitPropertySchema {
  /** Property name */
  name: string;

  /** Expected type */
  type: TraitPropertyType;

  /** Whether the property is required */
  required?: boolean;

  /** Default value (if any) */
  defaultValue?: unknown;

  /** Minimum value (for numbers) */
  min?: number;

  /** Maximum value (for numbers) */
  max?: number;

  /** Allowed enum values (for enum type) */
  enumValues?: string[];

  /** Description for diagnostics */
  description?: string;
}

/**
 * Schema definition for a complete trait.
 */
export interface TraitSchema {
  /** Canonical trait name (e.g., 'grabbable', 'physics') */
  name: string;

  /** Trait category (e.g., 'interaction', 'physics', 'visual') */
  category: string;

  /** Property schemas for this trait */
  properties: TraitPropertySchema[];

  /** Traits that conflict with this one (mutually exclusive) */
  conflictsWith?: string[];

  /** Traits that this one requires as prerequisites */
  requires?: string[];
}

/**
 * Error codes for confabulation detection.
 */
export type ConfabulationErrorCode =
  | 'CONFAB_UNKNOWN_TRAIT'
  | 'CONFAB_UNKNOWN_PROPERTY'
  | 'CONFAB_TYPE_MISMATCH'
  | 'CONFAB_VALUE_OUT_OF_RANGE'
  | 'CONFAB_INVALID_ENUM_VALUE'
  | 'CONFAB_CONFLICTING_TRAITS'
  | 'CONFAB_MISSING_REQUIRED_TRAIT'
  | 'CONFAB_MISSING_REQUIRED_PROPERTY';

/**
 * A confabulation error (blocks compiler output).
 */
export interface ConfabulationError {
  /** Error code for programmatic handling */
  code: ConfabulationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Object name where the error occurred */
  objectName?: string;

  /** Trait name where the error occurred */
  traitName?: string;

  /** Property name where the error occurred */
  propertyName?: string;

  /** Suggestion for fixing the error */
  suggestion?: string;

  /** Risk contribution to the overall score */
  riskContribution: number;
}

/**
 * A confabulation warning (does not block compiler output).
 */
export interface ConfabulationWarning {
  /** Warning code */
  code: string;

  /** Human-readable warning message */
  message: string;

  /** Object/trait context */
  objectName?: string;
  traitName?: string;

  /** Risk contribution */
  riskContribution: number;
}

/**
 * Result of confabulation validation.
 */
export interface ConfabulationValidationResult {
  /** Whether the composition passed validation */
  valid: boolean;

  /** Confabulation risk score (0-100, higher = more likely confabulated) */
  riskScore: number;

  /** Validation errors (blocking) */
  errors: ConfabulationError[];

  /** Validation warnings (non-blocking) */
  warnings: ConfabulationWarning[];

  /** Number of traits validated */
  traitsChecked: number;

  /** Number of properties validated */
  propertiesChecked: number;

  /** Validation time in milliseconds */
  validationTimeMs: number;
}

/**
 * Extended access decision that includes confabulation validation results.
 */
export interface AccessDecisionWithConfabulation extends AccessDecision {
  /** Confabulation validation result (only present when composition was validated) */
  confabulation?: ConfabulationValidationResult;
}

// =============================================================================
// ROLE TRAIT PERMISSIONS (scene-level)
// =============================================================================

/**
 * Scene-level permission for object interaction.
 *
 * Used by the `role` trait to control what users can do with objects
 * based on their assigned roles (distinct from compiler-pipeline
 * `AgentPermission`).
 */
export type Permission =
  | 'view'
  | 'interact'
  | 'edit'
  | 'delete'
  | 'admin'
  | 'transfer'
  | 'configure';

/**
 * Runtime state for the role trait.
 */
export interface RoleState {
  currentRole: string;
  effectivePermissions: Set<Permission>;
  roleHistory: Array<{ role: string; timestamp: number }>;
  pendingRoleChange: string | null;
}

/**
 * Configuration for the role trait.
 */
export interface RoleConfig {
  role_id: string;
  permissions: Permission[];
  display_badge: boolean;
  badge_color: string;
  inherits_from: string;
  role_hierarchy: Record<string, Permission[]>;
}

// =============================================================================
// CAPABILITY ACTION CONSTANTS (type-level)
// =============================================================================

/**
 * Standard HoloScript capability action namespace values.
 *
 * Mirrors the `CapabilityActions` const object as a string union
 * for type-only consumers.
 */
export type CapabilityAction =
  | 'source/read'
  | 'config/read'
  | 'ast/read'
  | 'ast/write'
  | 'ast/transform'
  | 'ir/read'
  | 'ir/write'
  | 'ir/transform'
  | 'code/read'
  | 'code/write'
  | 'output/write'
  | 'execute/optimization'
  | 'execute/codegen'
  | 'execute/export'
  | '*';
