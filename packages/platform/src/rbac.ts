/**
 * RBAC Types for Compiler Identity
 *
 * Platform-level stubs for types/functions the compiler system imports.
 * These are duplicated from core/compiler/identity to avoid circular deps.
 */

export enum ResourceType {
  SOURCE_FILE = 'source_file',
  AST = 'ast',
  IR = 'ir',
  CODE = 'code',
  OUTPUT = 'output',
}

export enum WorkflowStep {
  PARSE_TOKENS = 'parse_tokens',
  BUILD_AST = 'build_ast',
  ANALYZE_AST = 'analyze_ast',
  APPLY_TRANSFORMS = 'apply_transforms',
  SELECT_INSTRUCTIONS = 'select_instructions',
  EMIT_CODE = 'emit_code',
  OPTIMIZE = 'optimize',
  LINK = 'link',
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  requiredPermission?: string;
}

/** Minimal RBAC interface for compiler authorization */
export interface AgentRBAC {
  checkAccess(resource: ResourceType, action: string): AccessDecision;
}

/** Capability-aware RBAC wrapper */
export class CapabilityRBAC {
  constructor(config?: { rbac?: AgentRBAC }) {
    // Minimal stub — real implementation in core/compiler/identity
  }
  checkAccess(resource: ResourceType, action: string): AccessDecision {
    return { allowed: true };
  }
}

/** Get default RBAC instance (permissive by default) */
export function getRBAC(): AgentRBAC {
  return {
    checkAccess: () => ({ allowed: true }),
  };
}

/** Get capability-aware RBAC instance */
export function getCapabilityRBAC(): CapabilityRBAC {
  return new CapabilityRBAC();
}
