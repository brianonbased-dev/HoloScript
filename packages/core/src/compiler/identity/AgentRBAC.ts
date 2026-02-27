/**
 * HoloScript Compiler Agent RBAC (Role-Based Access Control)
 *
 * Enforces fine-grained access control for compiler agents based on:
 * - Agent roles (syntax analyzer, AST optimizer, code generator, exporter)
 * - File path scopes (package-level restrictions)
 * - Operation permissions (read/write/execute)
 * - Workflow step validation
 *
 * @version 1.0.0
 */

import path from 'path';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  IntentTokenPayload,
} from './AgentIdentity';
import { AgentTokenIssuer, getTokenIssuer } from './AgentTokenIssuer';

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
