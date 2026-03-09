/**
 * HoloScript Compiler Agent Token Issuer
 *
 * Issues and verifies short-lived JWT tokens for compiler agents based on
 * Agentic JWT specification.
 *
 * Features:
 * - Workflow-aware token issuance with delegation chains
 * - Proof-of-Possession (PoP) binding via JWK thumbprint
 * - Intent-based authorization (workflow step validation)
 * - Token verification and claims extraction
 *
 * @version 1.0.0
 */

import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import {
  AgentRole,
  AgentConfig,
  AgentPermission,
  WorkflowStep,
  IntentTokenPayload,
  AgentChecksum,
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

  /** JWT signing secret */
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
  executionContext?: Record<string, any>;

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
  errorCode?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'INVALID_CLAIMS' | 'WORKFLOW_VIOLATION';
}

/**
 * Options for issuing a UCAN capability token through the AgentTokenIssuer.
 *
 * Bridges the JWT-based token request model to the UCAN capability model
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
 * Result of issuing a hybrid token containing both JWT and UCAN capability token.
 *
 * Enables gradual migration from JWT-only to UCAN by providing both token formats
 * for the same agent and intent context.
 */
export interface HybridTokenResult {
  /** Traditional JWT token (existing format) */
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
const DEFAULT_JWT_SECRET = process.env.AGENT_JWT_SECRET || 'dev-secret-change-in-production';
const DEFAULT_TOKEN_EXPIRATION = '24h';

/**
 * Agent Token Issuer
 *
 * Central authority for issuing and verifying agent JWT tokens.
 * Implements Agentic JWT specification for workflow-aware authorization.
 */
export class AgentTokenIssuer {
  private issuer: string;
  private jwtSecret: string;
  private tokenExpiration: string | number;
  private strictWorkflowValidation: boolean;

  /** Active workflow state (for validation) */
  private workflowState: Map<string, WorkflowStep> = new Map();

  constructor(config: TokenIssuerConfig = {}) {
    this.issuer = config.issuer || DEFAULT_ISSUER;
    this.jwtSecret = config.jwtSecret || DEFAULT_JWT_SECRET;
    this.tokenExpiration = config.tokenExpiration || DEFAULT_TOKEN_EXPIRATION;
    this.strictWorkflowValidation = config.strictWorkflowValidation ?? true;

    if (this.jwtSecret === DEFAULT_JWT_SECRET && process.env.NODE_ENV === 'production') {
      console.error(
        '[TOKEN_ISSUER] Using default JWT secret in production! Set AGENT_JWT_SECRET environment variable.'
      );
    }
  }

  /**
   * Issue intent token for agent
   *
   * Creates a signed JWT with:
   * - Standard claims (iss, sub, aud, exp, iat, jti)
   * - Agent identity (role, checksum)
   * - Permissions (RBAC)
   * - Intent metadata (workflow context)
   * - PoP binding (JWK thumbprint)
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

    // Create intent token payload
    const now = Math.floor(Date.now() / 1000);
    const payload: IntentTokenPayload = {
      // Standard JWT claims
      iss: this.issuer,
      sub: `agent:${agentConfig.role}:${agentConfig.name}`,
      aud: 'holoscript-compiler',
      exp:
        typeof this.tokenExpiration === 'string'
          ? now + this.parseExpiration(this.tokenExpiration)
          : now + this.tokenExpiration,
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

    // Sign token
    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
    });

    // Update workflow state
    this.workflowState.set(workflowId, workflowStep);

    // Store token in keystore
    const keystore = getKeystore();
    await keystore.storeCredential({
      role: agentConfig.role,
      token,
      keyPair,
      createdAt: new Date(now * 1000),
      expiresAt: new Date(payload.exp * 1000),
    });

    return token;
  }

  /**
   * Verify agent token
   *
   * Validates:
   * - Signature authenticity
   * - Token expiration
   * - Claims structure
   * - Workflow step sequence (if strict mode)
   */
  verifyToken(token: string): TokenVerificationResult {
    try {
      // Verify signature and decode
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: 'holoscript-compiler',
      }) as IntentTokenPayload;

      // Validate required claims
      if (!decoded.agent_role || !decoded.agent_checksum || !decoded.intent) {
        return {
          valid: false,
          error: 'Missing required claims',
          errorCode: 'INVALID_CLAIMS',
        };
      }

      // Validate workflow sequence if strict mode
      if (this.strictWorkflowValidation) {
        const currentStep = this.workflowState.get(decoded.intent.workflow_id);
        if (currentStep && currentStep !== decoded.intent.workflow_step) {
          return {
            valid: false,
            error: `Workflow step mismatch: expected ${currentStep}, got ${decoded.intent.workflow_step}`,
            errorCode: 'WORKFLOW_VIOLATION',
          };
        }
      }

      return {
        valid: true,
        payload: decoded,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired',
          errorCode: 'EXPIRED',
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid signature or malformed token',
          errorCode: 'INVALID_SIGNATURE',
        };
      }

      return {
        valid: false,
        error: error.message,
        errorCode: 'INVALID_CLAIMS',
      };
    }
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
   * use JWT tokens to obtain equivalent UCAN capability tokens for the gradual
   * migration to capability-based authorization.
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
   * Issue both a JWT token and a UCAN capability token for the same agent
   * and intent context.
   *
   * This method enables gradual migration from JWT-only authorization to
   * UCAN capability-based authorization. Consuming services can validate
   * either token during the transition period.
   *
   * @param request          Standard JWT token request parameters
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
    // Issue the traditional JWT token (unchanged behavior)
    const jwtToken = await this.issueToken(request);

    // Issue the UCAN capability token
    const audience = capabilityOptions?.audience ?? 'holoscript-compiler';
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
 */
export function getTokenIssuer(config?: TokenIssuerConfig): AgentTokenIssuer {
  if (!globalIssuer) {
    globalIssuer = new AgentTokenIssuer({
      ...config,
      jwtSecret: process.env.AGENT_JWT_SECRET,
    });
  }
  return globalIssuer;
}

/**
 * Reset global issuer (for testing)
 */
export function resetTokenIssuer(): void {
  globalIssuer = null;
}
