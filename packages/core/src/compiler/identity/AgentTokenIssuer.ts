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
      exp: typeof this.tokenExpiration === 'string'
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
