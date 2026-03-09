/**
 * HoloScript Capability-Aware RBAC Adapter
 *
 * Wraps the existing AgentRBAC enforcer and adds UCAN capability token
 * resolution, enabling **dual-mode access control**: callers can present
 * either a traditional JWT RBAC token OR a UCAN capability token.
 *
 * This adapter is designed as a non-breaking addition to the existing
 * identity system. All existing code that uses `AgentRBAC.checkAccess()`
 * with JWT tokens will continue to work unchanged.
 *
 * Resolution order:
 * 1. Try UCAN capability token verification first
 * 2. Fall back to legacy JWT RBAC verification
 * 3. Return the first successful result (or the last failure)
 *
 * @version 1.0.0
 */

import { AgentRole, AgentPermission, AgentKeyPair } from './AgentIdentity';

import {
  AgentRBAC,
  AccessDecision,
  ResourceAccessRequest,
  ResourceType,
  getRBAC,
  resetRBAC,
} from './AgentRBAC';

import { AgentTokenIssuer } from './AgentTokenIssuer';

import type { Capability, CapabilityToken, CapabilityVerificationResult } from './CapabilityToken';

import {
  PERMISSION_TO_ACTION,
  ACTION_TO_PERMISSION,
  HOLOSCRIPT_RESOURCE_SCHEME,
  CapabilityActions,
} from './CapabilityToken';

import {
  CapabilityTokenIssuer,
  HoloScriptCapabilitySemantics,
  getCapabilityTokenIssuer,
} from './CapabilityTokenIssuer';

// ---------------------------------------------------------------------------
// Resource type to URI mapping
// ---------------------------------------------------------------------------

/**
 * Maps the existing `ResourceType` enum to UCAN resource URIs.
 */
const RESOURCE_TYPE_TO_URI: Record<ResourceType, string> = {
  [ResourceType.SOURCE_FILE]: `${HOLOSCRIPT_RESOURCE_SCHEME}source`,
  [ResourceType.AST]: `${HOLOSCRIPT_RESOURCE_SCHEME}ast`,
  [ResourceType.IR]: `${HOLOSCRIPT_RESOURCE_SCHEME}ir`,
  [ResourceType.CODE]: `${HOLOSCRIPT_RESOURCE_SCHEME}code`,
  [ResourceType.OUTPUT]: `${HOLOSCRIPT_RESOURCE_SCHEME}output`,
  [ResourceType.CONFIG]: `${HOLOSCRIPT_RESOURCE_SCHEME}config`,
};

/**
 * Maps an operation string to a UCAN action suffix.
 */
const OPERATION_TO_ACTION_SUFFIX: Record<string, string> = {
  read: 'read',
  write: 'write',
  execute: 'execute',
  transform: 'transform',
};

// ---------------------------------------------------------------------------
// Dual-mode access decision
// ---------------------------------------------------------------------------

/**
 * Extended access decision that includes capability-specific context.
 */
export interface CapabilityAccessDecision extends AccessDecision {
  /** The authorization mode that was used */
  mode: 'rbac' | 'capability';

  /** Matched capability (when mode === 'capability') */
  matchedCapability?: Capability;

  /** Verification result (when mode === 'capability') */
  capabilityVerification?: CapabilityVerificationResult;
}

// ---------------------------------------------------------------------------
// Dual-mode access request
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CapabilityRBAC adapter
// ---------------------------------------------------------------------------

/**
 * Configuration for the CapabilityRBAC adapter.
 */
export interface CapabilityRBACConfig {
  /** Underlying RBAC enforcer (default: global singleton) */
  rbac?: AgentRBAC;

  /** Capability token issuer (default: global singleton) */
  capabilityIssuer?: CapabilityTokenIssuer;

  /**
   * Resolution strategy:
   * - `capability-first`: Try UCAN first, fall back to JWT (default)
   * - `rbac-first`: Try JWT first, fall back to UCAN
   * - `capability-only`: Only accept UCAN tokens
   * - `rbac-only`: Only accept JWT tokens (equivalent to using AgentRBAC directly)
   */
  strategy?: 'capability-first' | 'rbac-first' | 'capability-only' | 'rbac-only';
}

/**
 * Dual-mode RBAC adapter that accepts both JWT RBAC tokens and UCAN
 * capability tokens.
 *
 * Usage:
 * ```ts
 * const rbac = new CapabilityRBAC();
 *
 * // Legacy JWT mode (unchanged)
 * rbac.checkAccess({ token: jwtToken, resourceType: ResourceType.AST, operation: 'write' });
 *
 * // New UCAN capability mode
 * rbac.checkAccess({
 *   token: '',
 *   capabilityToken: ucanToken,
 *   issuerPublicKey: pubKey,
 *   resourceType: ResourceType.AST,
 *   operation: 'write',
 * });
 * ```
 */
export class CapabilityRBAC {
  private rbac: AgentRBAC;
  private capabilityIssuer: CapabilityTokenIssuer;
  private strategy: NonNullable<CapabilityRBACConfig['strategy']>;
  private semantics: HoloScriptCapabilitySemantics;

  constructor(config: CapabilityRBACConfig = {}) {
    this.rbac = config.rbac ?? getRBAC();
    this.capabilityIssuer = config.capabilityIssuer ?? getCapabilityTokenIssuer();
    this.strategy = config.strategy ?? 'capability-first';
    this.semantics = new HoloScriptCapabilitySemantics();
  }

  // -----------------------------------------------------------------------
  // Core access check
  // -----------------------------------------------------------------------

  /**
   * Check access using dual-mode resolution.
   *
   * Depending on the configured strategy, this will try JWT and/or UCAN
   * verification and return the result.
   */
  checkAccess(request: CapabilityAccessRequest): CapabilityAccessDecision {
    const hasCapability = !!request.capabilityToken && !!request.issuerPublicKey;
    const hasJwt = !!request.token;

    switch (this.strategy) {
      case 'capability-only':
        if (!hasCapability) {
          return {
            allowed: false,
            reason: 'Capability token required (strategy: capability-only)',
            mode: 'capability',
          };
        }
        return this.checkCapability(request);

      case 'rbac-only':
        if (!hasJwt) {
          return {
            allowed: false,
            reason: 'JWT token required (strategy: rbac-only)',
            mode: 'rbac',
          };
        }
        return this.checkRBAC(request);

      case 'rbac-first':
        if (hasJwt) {
          const rbacResult = this.checkRBAC(request);
          if (rbacResult.allowed) return rbacResult;
        }
        if (hasCapability) {
          return this.checkCapability(request);
        }
        return {
          allowed: false,
          reason: 'No valid token provided',
          mode: 'rbac',
        };

      case 'capability-first':
      default:
        if (hasCapability) {
          const capResult = this.checkCapability(request);
          if (capResult.allowed) return capResult;
        }
        if (hasJwt) {
          return this.checkRBAC(request);
        }
        return {
          allowed: false,
          reason: 'No valid token provided',
          mode: 'capability',
        };
    }
  }

  // -----------------------------------------------------------------------
  // UCAN capability check
  // -----------------------------------------------------------------------

  /**
   * Verify access using a UCAN capability token.
   */
  private checkCapability(request: CapabilityAccessRequest): CapabilityAccessDecision {
    const { capabilityToken, issuerPublicKey, resourceType, operation, resourcePath } = request;

    if (!capabilityToken || !issuerPublicKey) {
      return {
        allowed: false,
        reason: 'Missing capability token or issuer public key',
        mode: 'capability',
      };
    }

    // Step 1: Verify token signature and validity
    const verification = this.capabilityIssuer.verify(capabilityToken, issuerPublicKey);
    if (!verification.valid) {
      return {
        allowed: false,
        reason: `Capability token verification failed: ${verification.error}`,
        mode: 'capability',
        capabilityVerification: verification,
      };
    }

    // Step 2: Check if chain is verified (attenuation invariants hold)
    if (verification.chain && !verification.chain.verified) {
      return {
        allowed: false,
        reason: 'Capability token chain verification failed (attenuation invariant violation)',
        mode: 'capability',
        capabilityVerification: verification,
        errorCode: 'ATTENUATION_VIOLATION' as any,
      };
    }

    // Step 3: Check if token grants the requested resource + action
    const resourceUri = this.buildResourceUri(resourceType, resourcePath);
    const action = this.buildAction(resourceType, operation);

    const matchedCapability = capabilityToken.payload.att.find((cap) =>
      this.semantics.canAccess(cap, resourceUri, action)
    );

    if (!matchedCapability) {
      return {
        allowed: false,
        reason: `No capability grants access to resource "${resourceUri}" with action "${action}"`,
        mode: 'capability',
        capabilityVerification: verification,
      };
    }

    return {
      allowed: true,
      mode: 'capability',
      matchedCapability,
      capabilityVerification: verification,
    };
  }

  // -----------------------------------------------------------------------
  // Legacy JWT RBAC check (delegates to existing AgentRBAC)
  // -----------------------------------------------------------------------

  /**
   * Verify access using the legacy JWT RBAC system.
   */
  private checkRBAC(request: CapabilityAccessRequest): CapabilityAccessDecision {
    const decision = this.rbac.checkAccess(request);
    return {
      ...decision,
      mode: 'rbac',
    };
  }

  // -----------------------------------------------------------------------
  // URI / action building
  // -----------------------------------------------------------------------

  /**
   * Build a UCAN resource URI from a ResourceType and optional path.
   */
  private buildResourceUri(resourceType: ResourceType, resourcePath?: string): string {
    const base = RESOURCE_TYPE_TO_URI[resourceType];
    if (resourcePath) {
      return `${base}/${resourcePath}`;
    }
    return base;
  }

  /**
   * Build a UCAN action string from a ResourceType and operation.
   */
  private buildAction(resourceType: ResourceType, operation: string): string {
    // Map resource type to action namespace prefix
    const prefixMap: Record<ResourceType, string> = {
      [ResourceType.SOURCE_FILE]: 'source',
      [ResourceType.AST]: 'ast',
      [ResourceType.IR]: 'ir',
      [ResourceType.CODE]: 'code',
      [ResourceType.OUTPUT]: 'output',
      [ResourceType.CONFIG]: 'config',
    };

    const prefix = prefixMap[resourceType];
    const suffix = OPERATION_TO_ACTION_SUFFIX[operation] ?? operation;
    return `${prefix}/${suffix}`;
  }

  // -----------------------------------------------------------------------
  // Convenience methods (matching AgentRBAC API)
  // -----------------------------------------------------------------------

  /**
   * Check if agent can read source (dual-mode).
   */
  canReadSource(
    tokenOrCapability: string | { token: CapabilityToken; publicKey: string },
    filePath: string
  ): CapabilityAccessDecision {
    if (typeof tokenOrCapability === 'string') {
      return this.checkAccess({
        token: tokenOrCapability,
        resourceType: ResourceType.SOURCE_FILE,
        operation: 'read',
        resourcePath: filePath,
      });
    }

    return this.checkAccess({
      token: '',
      capabilityToken: tokenOrCapability.token,
      issuerPublicKey: tokenOrCapability.publicKey,
      resourceType: ResourceType.SOURCE_FILE,
      operation: 'read',
      resourcePath: filePath,
    });
  }

  /**
   * Check if agent can modify AST (dual-mode).
   */
  canModifyAST(
    tokenOrCapability: string | { token: CapabilityToken; publicKey: string }
  ): CapabilityAccessDecision {
    if (typeof tokenOrCapability === 'string') {
      return this.checkAccess({
        token: tokenOrCapability,
        resourceType: ResourceType.AST,
        operation: 'write',
      });
    }

    return this.checkAccess({
      token: '',
      capabilityToken: tokenOrCapability.token,
      issuerPublicKey: tokenOrCapability.publicKey,
      resourceType: ResourceType.AST,
      operation: 'write',
    });
  }

  /**
   * Check if agent can generate code (dual-mode).
   */
  canGenerateCode(
    tokenOrCapability: string | { token: CapabilityToken; publicKey: string }
  ): CapabilityAccessDecision {
    if (typeof tokenOrCapability === 'string') {
      return this.checkAccess({
        token: tokenOrCapability,
        resourceType: ResourceType.CODE,
        operation: 'write',
      });
    }

    return this.checkAccess({
      token: '',
      capabilityToken: tokenOrCapability.token,
      issuerPublicKey: tokenOrCapability.publicKey,
      resourceType: ResourceType.CODE,
      operation: 'write',
    });
  }

  /**
   * Check if agent can export output (dual-mode).
   */
  canExport(
    tokenOrCapability: string | { token: CapabilityToken; publicKey: string },
    outputPath: string
  ): CapabilityAccessDecision {
    if (typeof tokenOrCapability === 'string') {
      return this.checkAccess({
        token: tokenOrCapability,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: outputPath,
      });
    }

    return this.checkAccess({
      token: '',
      capabilityToken: tokenOrCapability.token,
      issuerPublicKey: tokenOrCapability.publicKey,
      resourceType: ResourceType.OUTPUT,
      operation: 'write',
      resourcePath: outputPath,
    });
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Get the underlying AgentRBAC instance.
   */
  getRBAC(): AgentRBAC {
    return this.rbac;
  }

  /**
   * Get the CapabilityTokenIssuer instance.
   */
  getCapabilityIssuer(): CapabilityTokenIssuer {
    return this.capabilityIssuer;
  }

  /**
   * Get the current resolution strategy.
   */
  getStrategy(): NonNullable<CapabilityRBACConfig['strategy']> {
    return this.strategy;
  }
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

let globalCapabilityRBAC: CapabilityRBAC | null = null;

/**
 * Get or create the global CapabilityRBAC adapter instance.
 */
export function getCapabilityRBAC(config?: CapabilityRBACConfig): CapabilityRBAC {
  if (!globalCapabilityRBAC) {
    globalCapabilityRBAC = new CapabilityRBAC(config);
  }
  return globalCapabilityRBAC;
}

/**
 * Reset the global CapabilityRBAC adapter (for testing).
 */
export function resetCapabilityRBAC(): void {
  globalCapabilityRBAC = null;
}
