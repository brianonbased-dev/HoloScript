/**
 * HoloScript Compiler Agent RBAC (Role-Based Access Control)
 *
 * Enforces fine-grained access control for compiler agents based on:
 * - Agent roles (syntax analyzer, AST optimizer, code generator, exporter)
 * - File path scopes (package-level restrictions)
 * - Operation permissions (read/write/execute)
 * - Workflow step validation
 * - Confabulation risk detection (schema validation gate, v1.1.0)
 *
 * @version 1.1.0
 */

import path from 'path';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  IntentTokenPayload,
  type CulturalProfileMetadata,
} from './AgentIdentity';
import { AgentTokenIssuer, getTokenIssuer } from './AgentTokenIssuer';
import {
  CulturalCompatibilityChecker,
  type AgentCulturalEntry,
  type CulturalCompatibilityResult,
} from '../CulturalCompatibilityChecker';
import {
  ConfabulationValidator,
  getConfabulationValidator,
  type ConfabulationValidationResult,
  type ConfabulationValidatorConfig,
} from './ConfabulationValidator';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

/**
 * Resource types in the compiler pipeline
 */
export enum ResourceType {
  SOURCE_FILE = 'source_file',
  AST = 'ast',
  IR = 'ir',
  CODE = 'code',
  OUTPUT = 'output',
  CONFIG = 'config',
}

/**
 * Access control decision
 */
export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  requiredPermission?: AgentPermission;
  agentRole?: AgentRole;
}

/**
 * Extended access decision that includes confabulation validation results.
 *
 * Returned by `checkAccessWithConfabulationGate()` which chains:
 * 1. RBAC permission check ("are you allowed?")
 * 2. Confabulation schema validation ("is what you generated valid?")
 */
export interface AccessDecisionWithConfabulation extends AccessDecision {
  /** Confabulation validation result (only present when composition was validated) */
  confabulation?: ConfabulationValidationResult;
}

/**
 * Resource access request
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

/**
 * Permission mapping for resource operations
 */
const RESOURCE_PERMISSION_MAP: Record<
  ResourceType,
  Record<'read' | 'write' | 'execute' | 'transform', AgentPermission>
> = {
  [ResourceType.SOURCE_FILE]: {
    read: AgentPermission.READ_SOURCE,
    write: AgentPermission.WRITE_AST, // Source modification creates AST
    execute: AgentPermission.EXECUTE_OPTIMIZATION, // Not applicable
    transform: AgentPermission.TRANSFORM_AST, // Not applicable
  },
  [ResourceType.AST]: {
    read: AgentPermission.READ_AST,
    write: AgentPermission.WRITE_AST,
    execute: AgentPermission.EXECUTE_OPTIMIZATION,
    transform: AgentPermission.TRANSFORM_AST,
  },
  [ResourceType.IR]: {
    read: AgentPermission.READ_IR,
    write: AgentPermission.WRITE_IR,
    execute: AgentPermission.EXECUTE_CODEGEN,
    transform: AgentPermission.TRANSFORM_IR,
  },
  [ResourceType.CODE]: {
    read: AgentPermission.READ_CODE,
    write: AgentPermission.WRITE_CODE,
    execute: AgentPermission.EXECUTE_CODEGEN,
    transform: AgentPermission.TRANSFORM_IR, // Not applicable
  },
  [ResourceType.OUTPUT]: {
    read: AgentPermission.READ_CODE,
    write: AgentPermission.WRITE_OUTPUT,
    execute: AgentPermission.EXECUTE_EXPORT,
    transform: AgentPermission.WRITE_OUTPUT, // Not applicable
  },
  [ResourceType.CONFIG]: {
    read: AgentPermission.READ_CONFIG,
    write: AgentPermission.WRITE_AST, // Config changes trigger rebuild
    execute: AgentPermission.EXECUTE_OPTIMIZATION, // Not applicable
    transform: AgentPermission.TRANSFORM_AST, // Not applicable
  },
};

/**
 * RBAC enforcer for compiler agents
 *
 * Validates agent permissions based on:
 * 1. Token authenticity and expiration
 * 2. Role-based permissions (RBAC)
 * 3. Scope restrictions (package paths)
 * 4. Workflow step validation
 */
export class AgentRBAC {
  private tokenIssuer: AgentTokenIssuer;

  /** Package scope restrictions (role → allowed paths) */
  private scopeRestrictions: Map<AgentRole, string[]> = new Map();

  /** Workflow step restrictions (role → allowed steps) */
  private workflowRestrictions: Map<AgentRole, WorkflowStep[]> = new Map();

  constructor(tokenIssuer?: AgentTokenIssuer) {
    this.tokenIssuer = tokenIssuer || getTokenIssuer();

    // Initialize default workflow restrictions
    this.initializeWorkflowRestrictions();
  }

  /**
   * Initialize default workflow step restrictions for each role
   */
  private initializeWorkflowRestrictions(): void {
    this.workflowRestrictions.set(AgentRole.SYNTAX_ANALYZER, [
      WorkflowStep.PARSE_TOKENS,
      WorkflowStep.BUILD_AST,
    ]);

    this.workflowRestrictions.set(AgentRole.AST_OPTIMIZER, [
      WorkflowStep.ANALYZE_AST,
      WorkflowStep.APPLY_TRANSFORMS,
    ]);

    this.workflowRestrictions.set(AgentRole.CODE_GENERATOR, [
      WorkflowStep.SELECT_INSTRUCTIONS,
      WorkflowStep.GENERATE_ASSEMBLY,
    ]);

    this.workflowRestrictions.set(AgentRole.EXPORTER, [
      WorkflowStep.FORMAT_OUTPUT,
      WorkflowStep.SERIALIZE,
    ]);

    // Orchestrator can execute any step
    this.workflowRestrictions.set(AgentRole.ORCHESTRATOR, Object.values(WorkflowStep));
  }

  /**
   * Set scope restriction for an agent role
   *
   * Example: Restrict syntax analyzer to only process files in 'packages/core'
   */
  setScopeRestriction(role: AgentRole, allowedPaths: string[]): void {
    this.scopeRestrictions.set(role, allowedPaths);
  }

  /**
   * Check if agent can access resource
   */
  checkAccess(request: ResourceAccessRequest): AccessDecision {
    const { token, resourceType, operation, resourcePath, expectedWorkflowStep } = request;

    // Step 1: Verify token
    const verificationResult = this.tokenIssuer.verifyToken(token);
    if (!verificationResult.valid) {
      return {
        allowed: false,
        reason: `Token verification failed: ${verificationResult.error}`,
      };
    }

    const payload = verificationResult.payload!;

    // Step 2: Check required permission
    const requiredPermission = RESOURCE_PERMISSION_MAP[resourceType][operation];
    if (!payload.permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        reason: `Missing required permission: ${requiredPermission}`,
        requiredPermission,
        agentRole: payload.agent_role,
      };
    }

    // Step 3: Validate scope (if restricted)
    if (resourcePath) {
      const scopeAllowed = this.validateScope(payload, resourcePath);
      if (!scopeAllowed) {
        return {
          allowed: false,
          reason: `Resource path '${resourcePath}' is outside agent scope: ${payload.scope || 'unrestricted'}`,
          agentRole: payload.agent_role,
        };
      }
    }

    // Step 4: Validate workflow step (if expected)
    if (expectedWorkflowStep) {
      const currentStep = payload.intent.workflow_step;
      if (currentStep !== expectedWorkflowStep) {
        return {
          allowed: false,
          reason: `Workflow step mismatch: expected ${expectedWorkflowStep}, agent is at ${currentStep}`,
          agentRole: payload.agent_role,
        };
      }
    }

    // Step 5: Validate workflow step is allowed for role
    const allowedSteps = this.workflowRestrictions.get(payload.agent_role);
    if (allowedSteps && !allowedSteps.includes(payload.intent.workflow_step)) {
      return {
        allowed: false,
        reason: `Role ${payload.agent_role} cannot execute workflow step ${payload.intent.workflow_step}`,
        agentRole: payload.agent_role,
      };
    }

    // Access granted
    return {
      allowed: true,
      agentRole: payload.agent_role,
    };
  }

  /**
   * Validate resource path is within agent's scope
   */
  private validateScope(payload: IntentTokenPayload, resourcePath: string): boolean {
    // No scope restriction = allow all
    if (!payload.scope) {
      return true;
    }

    // Normalize paths for comparison
    const normalizedResource = path.normalize(resourcePath);
    const normalizedScope = path.normalize(payload.scope);

    // Check if resource is within scope
    return normalizedResource.startsWith(normalizedScope);
  }

  /**
   * Convenience method: Check if agent can read source file
   */
  canReadSource(token: string, filePath: string): AccessDecision {
    return this.checkAccess({
      token,
      resourceType: ResourceType.SOURCE_FILE,
      operation: 'read',
      resourcePath: filePath,
    });
  }

  /**
   * Convenience method: Check if agent can modify AST
   */
  canModifyAST(token: string, expectedWorkflowStep?: WorkflowStep): AccessDecision {
    return this.checkAccess({
      token,
      resourceType: ResourceType.AST,
      operation: 'write',
      expectedWorkflowStep,
    });
  }

  /**
   * Convenience method: Check if agent can generate code
   */
  canGenerateCode(token: string): AccessDecision {
    return this.checkAccess({
      token,
      resourceType: ResourceType.CODE,
      operation: 'write',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });
  }

  /**
   * Convenience method: Check if agent can export to output path
   */
  canExport(token: string, outputPath: string): AccessDecision {
    return this.checkAccess({
      token,
      resourceType: ResourceType.OUTPUT,
      operation: 'write',
      resourcePath: outputPath,
      expectedWorkflowStep: WorkflowStep.SERIALIZE,
    });
  }

  /**
   * Extract agent role from token (without full verification)
   */
  extractRole(token: string): AgentRole | null {
    const result = this.tokenIssuer.verifyToken(token);
    return result.valid && result.payload ? result.payload.agent_role : null;
  }

  /**
   * Get agent's current workflow step
   */
  getWorkflowStep(token: string): WorkflowStep | null {
    const result = this.tokenIssuer.verifyToken(token);
    return result.valid && result.payload ? result.payload.intent.workflow_step : null;
  }

  // ===========================================================================
  // CONFABULATION RISK LAYER (v1.1.0)
  // ===========================================================================

  /**
   * Check access with confabulation gate.
   *
   * This is the primary enforcement point for AI-generated content. It chains:
   * 1. Standard RBAC permission check (token, role, scope, workflow)
   * 2. Confabulation schema validation (trait properties against 1,800+ schemas)
   *
   * If the RBAC check fails, the confabulation check is skipped (no point
   * validating content from an unauthorized agent).
   *
   * @param request - Standard resource access request
   * @param composition - The HoloComposition to validate for confabulation
   * @param confabConfig - Optional confabulation validator configuration
   * @returns Extended access decision with confabulation validation results
   */
  checkAccessWithConfabulationGate(
    request: ResourceAccessRequest,
    composition: HoloComposition,
    confabConfig?: ConfabulationValidatorConfig
  ): AccessDecisionWithConfabulation {
    // Step 1: Standard RBAC check
    const rbacDecision = this.checkAccess(request);

    if (!rbacDecision.allowed) {
      return rbacDecision;
    }

    // Step 2: Confabulation schema validation
    const validator = confabConfig
      ? new ConfabulationValidator(confabConfig)
      : getConfabulationValidator();

    const confabResult = validator.validateComposition(composition);

    if (!confabResult.valid) {
      return {
        allowed: false,
        reason:
          `Confabulation detected (risk score: ${confabResult.riskScore}/100, ` +
          `${confabResult.errors.length} error(s)): ` +
          confabResult.errors.map((e) => e.message).join('; '),
        agentRole: rbacDecision.agentRole,
        confabulation: confabResult,
      };
    }

    // Both checks passed
    return {
      ...rbacDecision,
      confabulation: confabResult,
    };
  }

  /**
   * Validate a composition for confabulation risk WITHOUT requiring an RBAC token.
   *
   * This is useful for the validate_holoscript MCP tool and the ai-validator
   * package which may not have an agent token but still need to check for
   * confabulated trait properties.
   *
   * @param composition - The HoloComposition to validate
   * @param confabConfig - Optional confabulation validator configuration
   * @returns Confabulation validation result
   */
  validateConfabulation(
    composition: HoloComposition,
    confabConfig?: ConfabulationValidatorConfig
  ): ConfabulationValidationResult {
    const validator = confabConfig
      ? new ConfabulationValidator(confabConfig)
      : getConfabulationValidator();

    return validator.validateComposition(composition);
  }

  // ===========================================================================
  // CULTURAL PROFILE INTEGRATION
  // ===========================================================================

  /**
   * Extract cultural profile metadata from an agent's JWT token.
   *
   * @param token - Agent JWT token
   * @returns The cultural profile if present, or null
   */
  extractCulturalProfile(token: string): CulturalProfileMetadata | null {
    const result = this.tokenIssuer.verifyToken(token);
    if (!result.valid || !result.payload) return null;
    return result.payload.cultural_profile ?? null;
  }

  /**
   * Validate cultural compatibility across multiple agent tokens.
   *
   * Extracts cultural profiles from each provided token and runs them
   * through the CulturalCompatibilityChecker.  Agents whose tokens
   * do not contain cultural profiles are silently skipped.
   *
   * @param agentTokens - Map of agent name to JWT token
   * @param normSets    - Optional map of agent name to norm_set arrays
   *                      (norms are composition-level, not token-level)
   * @returns Cultural compatibility result, or null if fewer than 2 agents
   *          have cultural profiles
   */
  validateCulturalCompatibility(
    agentTokens: Map<string, string>,
    normSets?: Map<string, string[]>
  ): CulturalCompatibilityResult | null {
    const entries: AgentCulturalEntry[] = [];

    for (const [name, token] of agentTokens) {
      const profile = this.extractCulturalProfile(token);
      if (profile) {
        entries.push({
          name,
          profile: {
            cooperation_index: profile.cooperation_index,
            cultural_family: profile.cultural_family,
            prompt_dialect: profile.prompt_dialect,
            norm_set: normSets?.get(name) ?? [],
          },
        });
      }
    }

    // Need at least 2 agents for pairwise checking
    if (entries.length < 2) return null;

    const checker = new CulturalCompatibilityChecker();
    return checker.check(entries);
  }
}

/**
 * Global RBAC instance
 */
let globalRBAC: AgentRBAC | null = null;

/**
 * Get or create global RBAC enforcer
 */
export function getRBAC(tokenIssuer?: AgentTokenIssuer): AgentRBAC {
  if (!globalRBAC) {
    globalRBAC = new AgentRBAC(tokenIssuer);
  }
  return globalRBAC;
}

/**
 * Reset global RBAC (for testing)
 */
export function resetRBAC(): void {
  globalRBAC = null;
}
