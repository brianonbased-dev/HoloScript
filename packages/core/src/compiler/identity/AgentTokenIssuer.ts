/**
 * HoloScript Compiler Agent Token Issuer — RETIRED jsonwebtoken path.
 *
 * SOVEREIGN TOKEN PATH (dependency-sovereignty-ladder, ratified 2026-07-16;
 * follow-up to the mcp-server agent-identity flip in 9666ba21c):
 * this module no longer touches the `jsonwebtoken` package at all. The legacy
 * HS256 shared-secret JWT path is structurally unusable:
 *
 *   - `issueToken` signs UCAN-style capability tokens (Ed25519 / EdDSA) via
 *     `CapabilityTokenIssuer`, carrying the full legacy `IntentTokenPayload`
 *     view in the token facts (`fct.intent_payload`) so every existing
 *     consumer (AgentRBAC, PopMiddleware, PackageScopeEnforcer,
 *     SpatialMemoryZones, AgentCommitSigner) keeps its claims contract.
 *   - `verifyToken` FAILS CLOSED on any legacy jsonwebtoken/HS256-envelope
 *     token with an explicit reason (`LEGACY_JWT_REJECTED`) — never verified,
 *     never thrown. Only EdDSA capability tokens issued by this path verify.
 *
 * Presentation cache: `CapabilityTokenIssuer.verify` consumes the token nonce
 * (replay protection), which would make a second verification of the SAME raw
 * token fail. The legacy contract verifies one token many times (AgentRBAC
 * checks per resource access), so successful verifications are cached
 * in-process keyed by the SHA-256 of the exact raw token bytes; byte-identical
 * re-presentations are served from the cache (signature already proven for
 * those exact bytes; expiry and workflow-state re-checked on every hit). A
 * tampered token differs in bytes, misses the cache, and fails signature
 * verification. This mirrors the shipped pattern in
 * packages/mcp-server/src/agent-identity-tools.ts.
 *
 * Trust model (same as the mcp-server sovereign lane): tokens are
 * self-certifying — the Ed25519 verification key travels in `fct.publicKey`
 * and the signature must verify against it; issuer/audience claims are then
 * checked against this issuer's identity. The legacy path's shared secret
 * (which defaulted to a well-known dev string) is gone.
 *
 * @deprecated Prefer `CapabilityTokenIssuer` (UCAN capabilities) for new
 * code. This class remains as the compatibility adapter for the legacy
 * `IntentTokenPayload` consumers only; the jsonwebtoken path it used to wrap
 * cannot be reached anymore.
 *
 * @version 2.0.0
 */

import * as crypto from 'crypto';
import {
  AgentRole,
  AgentConfig,
  AgentPermission,
  WorkflowStep,
  IntentTokenPayload,
  AgentKeyPair,
  calculateAgentChecksum,
  getDefaultPermissions,
  isValidWorkflowTransition,
} from './AgentIdentity';
import { getKeystore } from './AgentKeystore';

import type { Capability, CapabilityToken } from './CapabilityToken';

import {
  PERMISSION_TO_ACTION,
  HOLOSCRIPT_RESOURCE_ALL,
  HOLOSCRIPT_RESOURCE_SCHEME,
} from './CapabilityToken';

import { CapabilityTokenIssuer, getCapabilityTokenIssuer } from './CapabilityTokenIssuer';

/**
 * Token issuer configuration
 */
export interface TokenIssuerConfig {
  /** Issuer identifier (default: 'holoscript-orchestrator') */
  issuer?: string;

  /**
   * @deprecated Ignored. The sovereign capability path signs with the
   * request's Ed25519 key pair; there is no shared JWT secret anymore.
   * Accepted so existing construction sites keep compiling.
   */
  jwtSecret?: string;

  /** Token expiration time (default: '24h') */
  tokenExpiration?: string | number;

  /** Enable strict workflow validation */
  strictWorkflowValidation?: boolean;
}

/**
 * Token request parameters
 */
export interface TokenRequest {
  /** Agent configuration */
  agentConfig: AgentConfig;

  /** Current workflow step */
  workflowStep: WorkflowStep;

  /** Workflow identifier */
  workflowId: string;

  /** Agent role initiating the request */
  initiatedBy: AgentRole;

  /** Previous delegation chain */
  delegationChain?: AgentRole[];

  /** Additional execution context */
  executionContext?: Record<string, unknown>;

  /** Agent's key pair for PoP binding */
  keyPair: AgentKeyPair;
}

/**
 * Token verification result
 */
export interface TokenVerificationResult {
  valid: boolean;
  payload?: IntentTokenPayload;
  error?: string;
  errorCode?:
    | 'EXPIRED'
    | 'INVALID_SIGNATURE'
    | 'INVALID_CLAIMS'
    | 'WORKFLOW_VIOLATION'
    | 'LEGACY_JWT_REJECTED';
}

/**
 * Options for issuing a UCAN capability token through the AgentTokenIssuer.
 *
 * Bridges the legacy token request model to the UCAN capability model
 * by mapping agent roles to capabilities automatically.
 */
export interface CapabilityTokenOptions {
  /** Agent configuration (role determines capabilities) */
  agentConfig: AgentConfig;

  /** Audience identifier (DID or agent ID the token is delegated to) */
  audience: string;

  /** Agent's Ed25519 key pair for signing */
  keyPair: AgentKeyPair;

  /** Optional resource scope restriction (e.g. 'packages/core/ast') */
  scope?: string;

  /** Token lifetime in seconds (default: issuer's default) */
  lifetimeSec?: number;

  /** Optional additional facts / metadata attached to the token */
  facts?: Record<string, unknown>;
}

/**
 * Result of issuing a hybrid token pair for the same agent and intent context.
 *
 * Historically `jwt` was an HS256 jsonwebtoken; on the sovereign path both
 * members are EdDSA-signed. The field name is kept for source compatibility.
 */
export interface HybridTokenResult {
  /**
   * Legacy-view token (verifiable via `verifyToken`, carries the
   * `IntentTokenPayload` claims). EdDSA capability format on the wire.
   */
  jwt: string;

  /** UCAN capability token */
  capabilityToken: CapabilityToken;

  /** Agent role that both tokens were issued for */
  agentRole: AgentRole;

  /** Capabilities granted in the UCAN token */
  capabilities: Capability[];

  /** Timestamp when both tokens were issued (Unix seconds) */
  issuedAt: number;
}

/**
 * Options for delegating (attenuating) a UCAN capability token to a target agent.
 */
export interface DelegationRequest {
  /** The parent UCAN capability token being delegated from */
  parentToken: CapabilityToken;

  /** DID or agent identifier of the target (delegatee) */
  targetDID: string;

  /** Attenuated capabilities to grant (must be subsets of parent capabilities) */
  attenuatedCapabilities: Capability[];

  /** Delegator's Ed25519 key pair for signing the new token */
  keyPair: AgentKeyPair;

  /** Optional lifetime in seconds (must not exceed parent's remaining lifetime) */
  lifetimeSec?: number;

  /** Optional additional facts / metadata */
  facts?: Record<string, unknown>;
}

const DEFAULT_ISSUER = 'holoscript-orchestrator';
const DEFAULT_TOKEN_EXPIRATION = '24h';
const LEGACY_AUDIENCE = 'holoscript-compiler';

// ---------------------------------------------------------------------------
// Fail-closed decoding helpers (no external deps)
// ---------------------------------------------------------------------------

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodeJsonSegment(segment: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Structural check for the embedded legacy claims view (fail closed). */
function isIntentTokenPayload(value: unknown): value is IntentTokenPayload {
  const record = asRecord(value);
  if (!record) return false;
  const intent = asRecord(record.intent);
  return (
    typeof record.iss === 'string' &&
    typeof record.sub === 'string' &&
    typeof record.aud === 'string' &&
    typeof record.exp === 'number' &&
    typeof record.agent_role === 'string' &&
    asRecord(record.agent_checksum) !== undefined &&
    Array.isArray(record.permissions) &&
    intent !== undefined &&
    typeof intent.workflow_id === 'string' &&
    typeof intent.workflow_step === 'string'
  );
}

/**
 * Presentation cache — successful verifications keyed by SHA-256 of the exact
 * raw token bytes. Module-level (shared across issuer instances, like the
 * legacy shared-secret verification was process-wide). Expiry and workflow
 * state are re-checked on every hit; entries never bypass claim checks.
 */
const intentPresentationCache = new Map<string, IntentTokenPayload>();

/**
 * Agent Token Issuer — compatibility adapter over the sovereign capability
 * path. See the module docblock for the retirement contract.
 *
 * @deprecated Prefer `CapabilityTokenIssuer` for new code.
 */
export class AgentTokenIssuer {
  private issuer: string;
  private tokenExpiration: string | number;
  private strictWorkflowValidation: boolean;

  /** Active workflow state (for validation) */
  private workflowState: Map<string, WorkflowStep> = new Map();

  constructor(config: TokenIssuerConfig = {}) {
    this.issuer = config.issuer || DEFAULT_ISSUER;
    this.tokenExpiration = config.tokenExpiration || DEFAULT_TOKEN_EXPIRATION;
    this.strictWorkflowValidation = config.strictWorkflowValidation ?? true;
    // config.jwtSecret is deliberately ignored: the jsonwebtoken HS256 path
    // is retired and cannot be re-enabled through configuration.
  }

  /**
   * Issue an intent token for an agent.
   *
   * SOVEREIGN PATH: the token on the wire is an EdDSA UCAN capability token
   * signed with the request's Ed25519 key pair via `CapabilityTokenIssuer`.
   * The full legacy `IntentTokenPayload` view (standard claims, agent
   * identity/checksum, permissions, intent metadata, PoP binding) travels in
   * the token facts and is reconstructed verbatim by `verifyToken`.
   */
  async issueToken(request: TokenRequest): Promise<string> {
    const {
      agentConfig,
      workflowStep,
      workflowId,
      initiatedBy,
      delegationChain = [],
      executionContext = {},
      keyPair,
    } = request;

    // Validate workflow transition if strict mode enabled
    if (this.strictWorkflowValidation) {
      const currentStep = this.workflowState.get(workflowId);
      if (currentStep && !isValidWorkflowTransition(currentStep, workflowStep)) {
        throw new Error(
          `Invalid workflow transition: ${currentStep} → ${workflowStep} in workflow ${workflowId}`
        );
      }
    }

    // Calculate agent checksum
    const agentChecksum = calculateAgentChecksum(agentConfig);

    // Get default permissions for role
    const permissions = getDefaultPermissions(agentConfig.role);

    // Build delegation chain
    const updatedDelegationChain = [...delegationChain, agentConfig.role];

    const now = Math.floor(Date.now() / 1000);
    const lifetimeSec =
      typeof this.tokenExpiration === 'string'
        ? this.parseExpiration(this.tokenExpiration)
        : this.tokenExpiration;

    // Legacy claims view — embedded in the signed token facts and returned
    // verbatim by verifyToken so existing consumers keep their contract.
    const payload: IntentTokenPayload = {
      // Standard claims
      iss: this.issuer,
      sub: `agent:${agentConfig.role}:${agentConfig.name}`,
      aud: LEGACY_AUDIENCE,
      exp: now + lifetimeSec,
      iat: now,
      jti: crypto.randomUUID(),

      // Agent-specific claims
      agent_role: agentConfig.role,
      agent_checksum: agentChecksum,
      permissions,
      scope: agentConfig.scope,

      // Intent claims
      intent: {
        workflow_id: workflowId,
        workflow_step: workflowStep,
        executed_by: agentConfig.role,
        initiated_by: initiatedBy,
        delegation_chain: updatedDelegationChain,
        execution_context: executionContext,
      },

      // Proof-of-Possession (PoP) confirmation
      cnf: {
        jkt: keyPair.thumbprint,
      },

      // Ed25519 public key for HTTP Message Signature verification
      publicKey: keyPair.publicKey,
    };

    // Role permissions → UCAN capabilities (same bridge as the identity framework).
    const resource = agentConfig.scope
      ? `${HOLOSCRIPT_RESOURCE_SCHEME}${agentConfig.scope}`
      : HOLOSCRIPT_RESOURCE_ALL;
    const capabilities: Capability[] = permissions.map((perm) => ({
      with: resource,
      can: PERMISSION_TO_ACTION[perm] || perm,
    }));

    // Sign as an EdDSA capability token (the ONLY signing path).
    const capToken = await this.getCapabilityTokenIssuer().issueRoot(
      {
        issuer: payload.sub,
        audience: LEGACY_AUDIENCE,
        capabilities,
        lifetimeSec,
        facts: {
          intent_payload: payload,
          publicKey: keyPair.publicKey,
        },
      },
      keyPair
    );

    // Update workflow state
    this.workflowState.set(workflowId, workflowStep);

    // Store token in keystore
    const keystore = getKeystore();
    await keystore.storeCredential({
      role: agentConfig.role,
      token: capToken.raw,
      keyPair,
      createdAt: new Date(now * 1000),
      expiresAt: new Date(capToken.payload.exp * 1000),
    });

    return capToken.raw;
  }

  /**
   * Verify an agent token — FAIL CLOSED.
   *
   * Validates:
   * - EdDSA capability-token structure (legacy HS256 jsonwebtoken envelopes
   *   are rejected with `LEGACY_JWT_REJECTED`, never verified)
   * - Ed25519 signature against the embedded verification key
   * - Expiration
   * - Issuer / audience claims
   * - Required legacy claims structure
   * - Workflow step sequence (if strict mode)
   *
   * Never throws — every failure mode maps to a rejected result.
   */
  verifyToken(token: string): TokenVerificationResult {
    try {
      if (typeof token !== 'string' || token.length === 0) {
        return {
          valid: false,
          error: 'Invalid signature or malformed token',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      const tokenSha256 = sha256Hex(token);

      // Byte-identical re-presentation of an already-proven token: serve from
      // the presentation cache instead of re-consuming the replay nonce.
      const cached = intentPresentationCache.get(tokenSha256);
      if (cached) {
        const now = Math.floor(Date.now() / 1000);
        if (cached.exp <= now) {
          intentPresentationCache.delete(tokenSha256);
          return { valid: false, error: 'Token expired', errorCode: 'EXPIRED' };
        }
        return this.checkClaimsAndWorkflow(structuredClone(cached));
      }

      const parts = token.split('.');
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
        return {
          valid: false,
          error: 'Invalid signature or malformed token',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      const header = decodeJsonSegment(parts[0]);
      if (!header || typeof header.alg !== 'string') {
        return {
          valid: false,
          error: 'Malformed token: header segment is not decodable JSON with an alg claim.',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      if (header.alg !== 'EdDSA') {
        // The legacy jsonwebtoken path issued HS256-envelope tokens. Reject
        // them all explicitly — the sovereign capability path is the only
        // accepted one (strangler contract, dependency-sovereignty-ladder).
        return {
          valid: false,
          error:
            `Legacy ${header.alg} jsonwebtoken envelope is no longer accepted. ` +
            'Reissue a sovereign capability token via issueToken.',
          errorCode: 'LEGACY_JWT_REJECTED',
        };
      }

      const rawPayload = decodeJsonSegment(parts[1]);
      if (!rawPayload) {
        return {
          valid: false,
          error: 'Malformed token: payload segment is not decodable JSON.',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      const facts = asRecord(rawPayload.fct);
      const verificationKey = asString(facts?.publicKey);
      if (!verificationKey) {
        return {
          valid: false,
          error:
            'Capability token does not embed its Ed25519 verification key (fct.publicKey). Fail closed.',
          errorCode: 'INVALID_CLAIMS',
        };
      }

      const verification = this.getCapabilityTokenIssuer().verify(token, verificationKey);
      if (!verification.valid || !verification.payload) {
        if (verification.errorCode === 'EXPIRED') {
          return { valid: false, error: 'Token expired', errorCode: 'EXPIRED' };
        }
        return {
          valid: false,
          error: verification.error ?? 'Invalid signature or malformed token',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      const verifiedFacts = asRecord(verification.payload.fct);
      const intentPayload = verifiedFacts?.intent_payload;
      if (!isIntentTokenPayload(intentPayload)) {
        return {
          valid: false,
          error: 'Missing required claims',
          errorCode: 'INVALID_CLAIMS',
        };
      }

      intentPresentationCache.set(tokenSha256, intentPayload);

      return this.checkClaimsAndWorkflow(structuredClone(intentPayload));
    } catch (error: unknown) {
      // Fail closed — no verification error may escape as an unhandled throw.
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'INVALID_CLAIMS',
      };
    }
  }

  /**
   * Issuer/audience claim checks + strict workflow sequencing — run on both
   * the fresh-verification and presentation-cache paths.
   */
  private checkClaimsAndWorkflow(payload: IntentTokenPayload): TokenVerificationResult {
    if (payload.iss !== this.issuer || payload.aud !== LEGACY_AUDIENCE) {
      return {
        valid: false,
        error: `Token issuer/audience mismatch: expected ${this.issuer}/${LEGACY_AUDIENCE}`,
        errorCode: 'INVALID_CLAIMS',
      };
    }

    if (!payload.agent_role || !payload.agent_checksum || !payload.intent) {
      return {
        valid: false,
        error: 'Missing required claims',
        errorCode: 'INVALID_CLAIMS',
      };
    }

    if (this.strictWorkflowValidation) {
      const currentStep = this.workflowState.get(payload.intent.workflow_id);
      if (currentStep && currentStep !== payload.intent.workflow_step) {
        return {
          valid: false,
          error: `Workflow step mismatch: expected ${currentStep}, got ${payload.intent.workflow_step}`,
          errorCode: 'WORKFLOW_VIOLATION',
        };
      }
    }

    return { valid: true, payload };
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    // Support "Bearer <token>" format
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Support plain token
    return authHeader;
  }

  /**
   * Verify agent has required permission
   */
  hasPermission(token: string, required: AgentPermission): boolean {
    const result = this.verifyToken(token);
    if (!result.valid || !result.payload) return false;

    return result.payload.permissions.includes(required);
  }

  /**
   * Check if agent can perform operation
   */
  canPerformOperation(
    token: string,
    requiredPermission: AgentPermission,
    expectedWorkflowStep?: WorkflowStep
  ): boolean {
    const result = this.verifyToken(token);
    if (!result.valid || !result.payload) return false;

    // Check permission
    if (!result.payload.permissions.includes(requiredPermission)) {
      return false;
    }

    // Check workflow step if specified
    if (expectedWorkflowStep && result.payload.intent.workflow_step !== expectedWorkflowStep) {
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // UCAN Capability Token Methods (migration bridge)
  // ---------------------------------------------------------------------------

  /**
   * Issue a UCAN capability token for an agent.
   *
   * Maps the agent's role to capabilities using the PERMISSION_TO_ACTION bridge
   * constants defined in CapabilityToken.ts. This enables agents that currently
   * use legacy tokens to obtain equivalent UCAN capability tokens for the
   * gradual migration to capability-based authorization.
   *
   * @param options  Capability token issuance options
   * @returns        Signed UCAN CapabilityToken
   */
  async issueCapabilityToken(options: CapabilityTokenOptions): Promise<CapabilityToken> {
    const { agentConfig, audience, keyPair, scope, lifetimeSec, facts } = options;

    const capIssuer = this.getCapabilityTokenIssuer();

    // Map role permissions to capabilities using the bridge constants
    const permissions = getDefaultPermissions(agentConfig.role);
    const capabilities: Capability[] = permissions.map((perm) => {
      const action = PERMISSION_TO_ACTION[perm] || perm;
      const resource = scope ? `${HOLOSCRIPT_RESOURCE_SCHEME}${scope}` : HOLOSCRIPT_RESOURCE_ALL;
      return { with: resource, can: action };
    });

    const issuer = `agent:${agentConfig.role}:${agentConfig.name}`;

    return capIssuer.issueRoot(
      {
        issuer,
        audience,
        capabilities,
        lifetimeSec,
        facts: {
          ...facts,
          agent_version: agentConfig.version,
          agent_role: agentConfig.role,
        },
      },
      keyPair
    );
  }

  /**
   * Issue both a legacy-view token and a UCAN capability token for the same
   * agent and intent context.
   *
   * This method enables gradual migration from `IntentTokenPayload`-view
   * authorization to UCAN capability-based authorization. Consuming services
   * can validate either token during the transition period. Both members are
   * EdDSA-signed on the sovereign path.
   *
   * @param request          Standard token request parameters
   * @param capabilityOptions  Additional options for the capability token
   *                           (audience defaults to 'holoscript-compiler')
   * @returns                 HybridTokenResult with both tokens
   */
  async issueHybridToken(
    request: TokenRequest,
    capabilityOptions?: {
      audience?: string;
      scope?: string;
      lifetimeSec?: number;
      facts?: Record<string, unknown>;
    }
  ): Promise<HybridTokenResult> {
    // Issue the legacy-view token (verifiable via verifyToken)
    const jwtToken = await this.issueToken(request);

    // Issue the UCAN capability token
    const audience = capabilityOptions?.audience ?? LEGACY_AUDIENCE;
    const capabilityToken = await this.issueCapabilityToken({
      agentConfig: request.agentConfig,
      audience,
      keyPair: request.keyPair,
      scope: capabilityOptions?.scope ?? request.agentConfig.scope,
      lifetimeSec: capabilityOptions?.lifetimeSec,
      facts: {
        ...capabilityOptions?.facts,
        workflow_id: request.workflowId,
        workflow_step: request.workflowStep,
        initiated_by: request.initiatedBy,
      },
    });

    // Derive the capabilities that were granted
    const permissions = getDefaultPermissions(request.agentConfig.role);
    const scope = capabilityOptions?.scope ?? request.agentConfig.scope;
    const capabilities: Capability[] = permissions.map((perm) => {
      const action = PERMISSION_TO_ACTION[perm] || perm;
      const resource = scope ? `${HOLOSCRIPT_RESOURCE_SCHEME}${scope}` : HOLOSCRIPT_RESOURCE_ALL;
      return { with: resource, can: action };
    });

    return {
      jwt: jwtToken,
      capabilityToken,
      agentRole: request.agentConfig.role,
      capabilities,
      issuedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Delegate (attenuate) an existing UCAN capability token to a target agent.
   *
   * Creates a new UCAN token with a subset of the parent token's capabilities,
   * enforcing UCAN attenuation invariants:
   * - Every capability in the child MUST be a subset of the parent's capabilities
   * - Child expiration MUST NOT exceed parent expiration
   * - Delegation depth MUST NOT exceed the configured maximum
   *
   * @param parentToken             The parent UCAN capability token to delegate from
   * @param targetDID               DID or agent identifier of the delegatee
   * @param attenuatedCapabilities  Capabilities to grant (must be subsets of parent)
   * @param keyPair                 Delegator's Ed25519 key pair for signing
   * @param lifetimeSec             Optional lifetime in seconds
   * @param facts                   Optional metadata
   * @returns                       New signed CapabilityToken (attenuated delegation)
   * @throws                        Error if attenuation invariants are violated
   */
  async delegateCapability(
    parentToken: CapabilityToken,
    targetDID: string,
    attenuatedCapabilities: Capability[],
    keyPair?: AgentKeyPair,
    lifetimeSec?: number,
    facts?: Record<string, unknown>
  ): Promise<CapabilityToken> {
    const capIssuer = this.getCapabilityTokenIssuer();

    // Ensure the parent token is stored for proof chain resolution
    capIssuer.storeToken(parentToken);

    // Use provided keyPair or require one
    if (!keyPair) {
      throw new Error(
        'A key pair is required to sign the delegated capability token. ' +
          "Pass the delegator's AgentKeyPair."
      );
    }

    return capIssuer.delegate(
      {
        parentToken,
        audience: targetDID,
        capabilities: attenuatedCapabilities,
        lifetimeSec,
        facts,
      },
      keyPair
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Get or create the CapabilityTokenIssuer instance used by this issuer.
   * @internal
   */
  private getCapabilityTokenIssuer(): CapabilityTokenIssuer {
    return getCapabilityTokenIssuer();
  }

  /**
   * Get workflow state
   */
  getWorkflowState(workflowId: string): WorkflowStep | undefined {
    return this.workflowState.get(workflowId);
  }

  /**
   * Reset workflow state (for testing)
   */
  resetWorkflowState(workflowId?: string): void {
    if (workflowId) {
      this.workflowState.delete(workflowId);
    } else {
      this.workflowState.clear();
    }
  }

  /**
   * Parse expiration string (e.g., '24h', '7d')
   */
  private parseExpiration(exp: string): number {
    const match = exp.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${exp}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 60 * 60 * 24,
    };

    return value * multipliers[unit];
  }
}

/**
 * Global token issuer instance
 */
let globalIssuer: AgentTokenIssuer | null = null;

/**
 * Get or create global token issuer
 *
 * @deprecated Prefer `getCapabilityTokenIssuer` for new code.
 */
export function getTokenIssuer(config?: TokenIssuerConfig): AgentTokenIssuer {
  if (!globalIssuer) {
    globalIssuer = new AgentTokenIssuer(config);
  }
  return globalIssuer;
}

/**
 * Reset global issuer and the presentation cache (for testing)
 */
export function resetTokenIssuer(): void {
  globalIssuer = null;
  intentPresentationCache.clear();
}
