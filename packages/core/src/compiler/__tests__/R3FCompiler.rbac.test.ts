/**
 * R3FCompiler RBAC Enforcement Tests
 *
 * Validates that R3FCompiler enforces agent identity and role-based
 * access control via AgentRBAC before performing compilation.
 *
 * Tests cover:
 * - compile() with valid/invalid/missing tokens
 * - compileComposition() with valid/invalid/missing tokens
 * - Output path validation
 * - Backwards compatibility (no token = no enforcement)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R3FCompiler } from '../R3FCompiler';
import { UnauthorizedCompilerAccessError } from '../CompilerBase';
import { ResourceType, type AccessDecision } from '../identity/AgentRBAC';
import { WorkflowStep } from '../identity/AgentIdentity';

// ---------------------------------------------------------------------------
// Mock getRBAC so we can control checkAccess() per-test
// ---------------------------------------------------------------------------
const mockCheckAccess = vi.fn<(...args: any[]) => AccessDecision>();

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: mockCheckAccess,
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAllowedDecision(role = 'code_generator'): AccessDecision {
  return { allowed: true, agentRole: role as any };
}

function makeDeniedDecision(overrides: Partial<AccessDecision> = {}): AccessDecision {
  return {
    allowed: false,
    reason: 'Insufficient permissions',
    requiredPermission: 'write:code' as any,
    agentRole: 'syntax_analyzer' as any,
    ...overrides,
  };
}

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.fake.token';

function minimalAST(): any {
  return {
    version: '3.0',
    root: { type: 'scene', children: [] },
  };
}

function minimalComposition(): any {
  return { name: 'TestScene', objects: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('R3FCompiler RBAC Enforcement', () => {
  let compiler: R3FCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new R3FCompiler();
  });

  // ===================================================================
  // compile() — RBAC enforcement
  // ===================================================================
  describe('compile() with RBAC', () => {
    it('compiles successfully when agent token is valid and access is allowed', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      const result = compiler.compile(minimalAST(), FAKE_TOKEN);

      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
      // Should have called checkAccess twice: AST read + CODE write
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('validates AST read access with correct parameters', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.compile(minimalAST(), FAKE_TOKEN);

      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.AST,
        operation: 'read',
        expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      });
    });

    it('validates code generation access with correct parameters', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.compile(minimalAST(), FAKE_TOKEN);

      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.CODE,
        operation: 'write',
        expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      });
    });

    it('throws UnauthorizedCompilerAccessError when AST access is denied', () => {
      const denied = makeDeniedDecision({ reason: 'AST read not permitted' });
      mockCheckAccess.mockReturnValue(denied);

      expect(() => compiler.compile(minimalAST(), FAKE_TOKEN)).toThrowError(
        UnauthorizedCompilerAccessError,
      );

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('AST access');
        expect(err.compilerName).toBe('R3FCompiler');
        expect(err.decision).toBe(denied);
        expect(err.message).toContain('AST read not permitted');
      }
    });

    it('throws UnauthorizedCompilerAccessError when code generation is denied', () => {
      // First call (AST) allowed, second call (CODE) denied
      const denied = makeDeniedDecision({ reason: 'Code generation forbidden' });
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision())
        .mockReturnValueOnce(denied);

      expect(() => compiler.compile(minimalAST(), FAKE_TOKEN)).toThrowError(
        UnauthorizedCompilerAccessError,
      );

      // Reset and re-test to verify error details
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision())
        .mockReturnValueOnce(denied);

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('code generation');
        expect(err.compilerName).toBe('R3FCompiler');
        expect(err.message).toContain('Code generation forbidden');
      }
    });

    it('skips RBAC validation when no token is provided (backwards compatibility)', () => {
      const result = compiler.compile(minimalAST());

      expect(result).toBeDefined();
      expect(mockCheckAccess).not.toHaveBeenCalled();
    });

    it('skips RBAC validation when token is empty string (backwards compatibility)', () => {
      const result = compiler.compile(minimalAST(), '');

      expect(result).toBeDefined();
      expect(mockCheckAccess).not.toHaveBeenCalled();
    });

    it('validates output path when provided', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.compile(minimalAST(), FAKE_TOKEN, '/output/scene.r3f');

      // Should have called checkAccess 3 times: AST + CODE + OUTPUT
      expect(mockCheckAccess).toHaveBeenCalledTimes(3);
      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: '/output/scene.r3f',
        expectedWorkflowStep: WorkflowStep.SERIALIZE,
      });
    });

    it('throws when output path validation fails', () => {
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision()) // AST allowed
        .mockReturnValueOnce(makeAllowedDecision()) // CODE allowed
        .mockReturnValueOnce(makeDeniedDecision({ reason: 'Path outside scope' })); // OUTPUT denied

      expect(() =>
        compiler.compile(minimalAST(), FAKE_TOKEN, '/restricted/path'),
      ).toThrowError(UnauthorizedCompilerAccessError);
    });
  });

  // ===================================================================
  // compileComposition() — RBAC enforcement
  // ===================================================================
  describe('compileComposition() with RBAC', () => {
    it('compiles successfully when agent token is valid and access is allowed', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      const result = compiler.compileComposition(minimalComposition(), FAKE_TOKEN);

      expect(result).toBeDefined();
      expect(result.type).toBe('group');
      expect(result.id).toBe('TestScene');
      // Should have called checkAccess twice: AST read + CODE write
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('throws UnauthorizedCompilerAccessError when AST access is denied', () => {
      const denied = makeDeniedDecision({ reason: 'Composition access not permitted' });
      mockCheckAccess.mockReturnValue(denied);

      expect(() =>
        compiler.compileComposition(minimalComposition(), FAKE_TOKEN),
      ).toThrowError(UnauthorizedCompilerAccessError);
    });

    it('throws UnauthorizedCompilerAccessError when code generation is denied', () => {
      const denied = makeDeniedDecision({ reason: 'R3F generation forbidden' });
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision())
        .mockReturnValueOnce(denied);

      expect(() =>
        compiler.compileComposition(minimalComposition(), FAKE_TOKEN),
      ).toThrowError(UnauthorizedCompilerAccessError);
    });

    it('skips RBAC validation when no token is provided (backwards compatibility)', () => {
      const result = compiler.compileComposition(minimalComposition());

      expect(result).toBeDefined();
      expect(result.type).toBe('group');
      expect(mockCheckAccess).not.toHaveBeenCalled();
    });

    it('validates output path when provided', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.compileComposition(minimalComposition(), FAKE_TOKEN, '/output/scene.r3f');

      expect(mockCheckAccess).toHaveBeenCalledTimes(3);
      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: '/output/scene.r3f',
        expectedWorkflowStep: WorkflowStep.SERIALIZE,
      });
    });

    it('throws when output path validation fails', () => {
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision()) // AST allowed
        .mockReturnValueOnce(makeAllowedDecision()) // CODE allowed
        .mockReturnValueOnce(makeDeniedDecision({ reason: 'Path outside scope' })); // OUTPUT denied

      expect(() =>
        compiler.compileComposition(minimalComposition(), FAKE_TOKEN, '/restricted/path'),
      ).toThrowError(UnauthorizedCompilerAccessError);
    });
  });

  // ===================================================================
  // Error message formatting
  // ===================================================================
  describe('Error message formatting', () => {
    it('includes R3FCompiler name in error messages', () => {
      mockCheckAccess.mockReturnValue(makeDeniedDecision());

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.message).toContain('[R3FCompiler]');
        expect(err.compilerName).toBe('R3FCompiler');
      }
    });

    it('includes agent role in error messages', () => {
      mockCheckAccess.mockReturnValue(
        makeDeniedDecision({ agentRole: 'syntax_analyzer' as any }),
      );

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.message).toContain('Agent Role: syntax_analyzer');
      }
    });

    it('includes required permission in error messages', () => {
      mockCheckAccess.mockReturnValue(
        makeDeniedDecision({ requiredPermission: 'write:code' as any }),
      );

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.message).toContain('Required Permission: write:code');
      }
    });

    it('includes output path in error message for output validation failures', () => {
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision())
        .mockReturnValueOnce(makeAllowedDecision())
        .mockReturnValueOnce(makeDeniedDecision({ reason: 'Scope violation' }));

      try {
        compiler.compile(minimalAST(), FAKE_TOKEN, '/some/restricted/path');
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toContain('/some/restricted/path');
      }
    });
  });

  // ===================================================================
  // Security invariants
  // ===================================================================
  describe('Security invariants', () => {
    it('RBAC check occurs before any compilation logic', () => {
      // If RBAC denies, no compilation should happen
      mockCheckAccess.mockReturnValue(makeDeniedDecision());

      expect(() => compiler.compile(minimalAST(), FAKE_TOKEN)).toThrow();

      // Verify the compile was blocked (only 1 call = AST check failed immediately)
      expect(mockCheckAccess).toHaveBeenCalledTimes(1);
    });

    it('RBAC check occurs before composition compilation logic', () => {
      mockCheckAccess.mockReturnValue(makeDeniedDecision());

      expect(() =>
        compiler.compileComposition(minimalComposition(), FAKE_TOKEN),
      ).toThrow();

      expect(mockCheckAccess).toHaveBeenCalledTimes(1);
    });

    it('validates both AST and CODE permissions in sequence', () => {
      const callOrder: string[] = [];

      mockCheckAccess.mockImplementation((request: any) => {
        callOrder.push(`${request.resourceType}:${request.operation}`);
        return makeAllowedDecision();
      });

      compiler.compile(minimalAST(), FAKE_TOKEN);

      expect(callOrder).toEqual(['ast:read', 'code:write']);
    });

    it('validates AST, CODE, and OUTPUT permissions with outputPath', () => {
      const callOrder: string[] = [];

      mockCheckAccess.mockImplementation((request: any) => {
        callOrder.push(`${request.resourceType}:${request.operation}`);
        return makeAllowedDecision();
      });

      compiler.compile(minimalAST(), FAKE_TOKEN, '/output/path');

      expect(callOrder).toEqual(['ast:read', 'code:write', 'output:write']);
    });

    it('does not leak partial compilation results on RBAC failure', () => {
      mockCheckAccess.mockReturnValue(makeDeniedDecision());

      let result: any;
      try {
        result = compiler.compile(minimalAST(), FAKE_TOKEN);
      } catch {
        // Expected
      }

      expect(result).toBeUndefined();
    });
  });
});
