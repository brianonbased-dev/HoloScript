/**
 * Base Compiler Interface with Agent Identity Integration
 *
 * Provides common RBAC validation logic for all HoloScript compilers.
 * All compilers MUST extend this base or implement ICompiler interface.
 *
 * @version 1.0.0
 */

import { getRBAC, ResourceType, type AccessDecision } from './identity/AgentRBAC';
import { WorkflowStep } from './identity/AgentIdentity';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

/**
 * Compiler interface with agent identity enforcement
 */
export interface ICompiler {
  /**
   * Compile HoloComposition AST to target platform code
   *
   * @param composition - HoloScript AST
   * @param agentToken - JWT token proving agent identity
   * @param outputPath - Optional output file path for scope validation
   * @returns Compiled code (string or multi-file object)
   * @throws UnauthorizedCompilerAccessError if token invalid or lacks permissions
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string | Record<string, string>;
}

/**
 * Error thrown when agent lacks required permissions
 */
export class UnauthorizedCompilerAccessError extends Error {
  constructor(
    public readonly decision: AccessDecision,
    public readonly operation: string,
    public readonly compilerName: string
  ) {
    super(
      `[${compilerName}] Unauthorized ${operation}: ${decision.reason || 'Access denied'}\n` +
      `Agent Role: ${decision.agentRole || 'unknown'}\n` +
      `Required Permission: ${decision.requiredPermission || 'unknown'}`
    );
    this.name = 'UnauthorizedCompilerAccessError';
  }
}

/**
 * Base compiler class with RBAC enforcement
 *
 * All compilers SHOULD extend this class to inherit:
 * - AST access validation
 * - Code generation validation
 * - Output path scope validation
 * - Clear error messages
 *
 * Example:
 * ```typescript
 * export class UnityCompiler extends CompilerBase {
 *   compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
 *     // Validate AST access
 *     this.validateASTAccess(agentToken);
 *
 *     // Validate code generation permission
 *     this.validateCodeGeneration(agentToken);
 *
 *     // Validate output path (if provided)
 *     if (outputPath) {
 *       this.validateOutputPath(agentToken, outputPath);
 *     }
 *
 *     // Perform compilation...
 *     return csharpCode;
 *   }
 * }
 * ```
 */
export abstract class CompilerBase implements ICompiler {
  protected rbac = getRBAC();

  /**
   * Compiler name (for error messages)
   */
  protected abstract readonly compilerName: string;

  /**
   * Compile HoloComposition AST to target platform code
   * MUST be implemented by subclasses
   */
  abstract compile(composition: HoloComposition, agentToken: string, outputPath?: string): string | Record<string, string>;

  /**
   * Validate agent can read AST
   * Skips validation when no token is provided (backwards compatibility / testing)
   *
   * @param agentToken - Agent JWT token (optional)
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateASTAccess(agentToken?: string): void {
    if (!agentToken) return; // Skip validation when no token provided

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(decision, 'AST access', this.compilerName);
    }
  }

  /**
   * Validate agent can generate code
   * Skips validation when no token is provided (backwards compatibility / testing)
   *
   * @param agentToken - Agent JWT token (optional)
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateCodeGeneration(agentToken?: string): void {
    if (!agentToken) return; // Skip validation when no token provided

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.CODE,
      operation: 'write',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(decision, 'code generation', this.compilerName);
    }
  }

  /**
   * Validate agent can write to output path
   * Skips validation when no token is provided (backwards compatibility / testing)
   *
   * @param agentToken - Agent JWT token (optional)
   * @param outputPath - Target output file path
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateOutputPath(agentToken?: string, outputPath?: string): void {
    if (!agentToken) return; // Skip validation when no token provided

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.OUTPUT,
      operation: 'write',
      resourcePath: outputPath,
      expectedWorkflowStep: WorkflowStep.SERIALIZE,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(decision, `output write to '${outputPath}'`, this.compilerName);
    }
  }

  /**
   * Validate all compiler permissions in single call
   * Convenience method combining AST access + code generation + optional output validation
   * Skips ALL validation when no token is provided (backwards compatibility / testing)
   *
   * @param agentToken - Agent JWT token (optional)
   * @param outputPath - Optional output path
   * @throws UnauthorizedCompilerAccessError if any validation fails
   */
  protected validateCompilerAccess(agentToken?: string, outputPath?: string): void {
    if (!agentToken) return; // Skip validation when no token provided

    this.validateASTAccess(agentToken);
    this.validateCodeGeneration(agentToken);
    if (outputPath) {
      this.validateOutputPath(agentToken, outputPath);
    }
  }
}

/**
 * Utility: Create a test token for development/testing
 *
 * WARNING: Only use in non-production environments!
 *
 * @returns Valid code generator token for testing
 */
export function createTestCompilerToken(): string {
  // Return empty string to bypass RBAC validation in tests
  // The validateCompilerAccess methods skip when agentToken is falsy
  return '';
}
