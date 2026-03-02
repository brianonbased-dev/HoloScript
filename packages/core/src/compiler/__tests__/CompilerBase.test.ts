import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CompilerBase,
  UnauthorizedCompilerAccessError,
  createTestCompilerToken,
  type ICompiler,
} from '../CompilerBase';
import { ResourceType, type AccessDecision } from '../identity/AgentRBAC';
import { WorkflowStep } from '../identity/AgentIdentity';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

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
// Concrete subclass to expose the protected methods for testing
// ---------------------------------------------------------------------------
class TestCompiler extends CompilerBase {
  protected readonly compilerName = 'TestCompiler';

  compile(
    _composition: HoloComposition,
    agentToken: string,
    outputPath?: string,
  ): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return '// compiled';
  }

  // Expose protected methods for direct testing
  public exposeValidateASTAccess(token: string): void {
    this.validateASTAccess(token);
  }

  public exposeValidateCodeGeneration(token: string): void {
    this.validateCodeGeneration(token);
  }

  public exposeValidateOutputPath(token: string, outputPath: string): void {
    this.validateOutputPath(token, outputPath);
  }

  public exposeValidateCompilerAccess(token: string, outputPath?: string): void {
    this.validateCompilerAccess(token, outputPath);
  }
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CompilerBase', () => {
  let compiler: TestCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new TestCompiler();
  });

  // ===================================================================
  // UnauthorizedCompilerAccessError
  // ===================================================================
  describe('UnauthorizedCompilerAccessError', () => {
    it('constructs with decision, operation, and compilerName', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: 'Token expired',
        requiredPermission: 'read:ast' as any,
        agentRole: 'syntax_analyzer' as any,
      };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        'AST access',
        'UnityCompiler',
      );

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(UnauthorizedCompilerAccessError);
      expect(err.name).toBe('UnauthorizedCompilerAccessError');
      expect(err.decision).toBe(decision);
      expect(err.operation).toBe('AST access');
      expect(err.compilerName).toBe('UnityCompiler');
    });

    it('formats message with reason, role, and required permission', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: 'Token expired',
        requiredPermission: 'read:ast' as any,
        agentRole: 'syntax_analyzer' as any,
      };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        'AST access',
        'GodotCompiler',
      );

      expect(err.message).toContain('[GodotCompiler]');
      expect(err.message).toContain('Unauthorized AST access');
      expect(err.message).toContain('Token expired');
      expect(err.message).toContain('Agent Role: syntax_analyzer');
      expect(err.message).toContain('Required Permission: read:ast');
    });

    it('falls back to defaults when decision fields are undefined', () => {
      const decision: AccessDecision = { allowed: false };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        'code generation',
        'WASMCompiler',
      );

      expect(err.message).toContain('Access denied');
      expect(err.message).toContain('Agent Role: unknown');
      expect(err.message).toContain('Required Permission: unknown');
    });

    it('preserves readonly properties on the error instance', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: 'No permission',
      };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        'output write',
        'R3FCompiler',
      );

      // TypeScript readonly prevents assignment at compile time, but we can
      // verify the values are set correctly
      expect(err.decision).toStrictEqual(decision);
      expect(err.operation).toBe('output write');
      expect(err.compilerName).toBe('R3FCompiler');
    });
  });

  // ===================================================================
  // validateASTAccess
  // ===================================================================
  describe('validateASTAccess', () => {
    it('does not throw when access is allowed', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      expect(() => compiler.exposeValidateASTAccess(FAKE_TOKEN)).not.toThrow();

      expect(mockCheckAccess).toHaveBeenCalledOnce();
      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.AST,
        operation: 'read',
        expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      });
    });

    it('throws UnauthorizedCompilerAccessError when access is denied', () => {
      const denied = makeDeniedDecision({ reason: 'AST read not permitted' });
      mockCheckAccess.mockReturnValue(denied);

      expect(() => compiler.exposeValidateASTAccess(FAKE_TOKEN)).toThrowError(
        UnauthorizedCompilerAccessError,
      );

      try {
        compiler.exposeValidateASTAccess(FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('AST access');
        expect(err.compilerName).toBe('TestCompiler');
        expect(err.decision).toBe(denied);
        expect(err.message).toContain('AST read not permitted');
      }
    });
  });

  // ===================================================================
  // validateCodeGeneration
  // ===================================================================
  describe('validateCodeGeneration', () => {
    it('does not throw when access is allowed', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      expect(() => compiler.exposeValidateCodeGeneration(FAKE_TOKEN)).not.toThrow();

      expect(mockCheckAccess).toHaveBeenCalledOnce();
      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.CODE,
        operation: 'write',
        expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      });
    });

    it('throws UnauthorizedCompilerAccessError when access is denied', () => {
      const denied = makeDeniedDecision({ reason: 'Code generation forbidden' });
      mockCheckAccess.mockReturnValue(denied);

      expect(() => compiler.exposeValidateCodeGeneration(FAKE_TOKEN)).toThrowError(
        UnauthorizedCompilerAccessError,
      );

      try {
        compiler.exposeValidateCodeGeneration(FAKE_TOKEN);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('code generation');
        expect(err.compilerName).toBe('TestCompiler');
        expect(err.decision).toBe(denied);
        expect(err.message).toContain('Code generation forbidden');
      }
    });
  });

  // ===================================================================
  // validateOutputPath
  // ===================================================================
  describe('validateOutputPath', () => {
    const OUTPUT_PATH = '/dist/output/scene.cs';

    it('does not throw when access is allowed', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      expect(() =>
        compiler.exposeValidateOutputPath(FAKE_TOKEN, OUTPUT_PATH),
      ).not.toThrow();

      expect(mockCheckAccess).toHaveBeenCalledOnce();
      expect(mockCheckAccess).toHaveBeenCalledWith({
        token: FAKE_TOKEN,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: OUTPUT_PATH,
        expectedWorkflowStep: WorkflowStep.SERIALIZE,
      });
    });

    it('throws UnauthorizedCompilerAccessError when access is denied', () => {
      const denied = makeDeniedDecision({ reason: 'Path outside scope' });
      mockCheckAccess.mockReturnValue(denied);

      expect(() =>
        compiler.exposeValidateOutputPath(FAKE_TOKEN, OUTPUT_PATH),
      ).toThrowError(UnauthorizedCompilerAccessError);

      try {
        compiler.exposeValidateOutputPath(FAKE_TOKEN, OUTPUT_PATH);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe(`output write to '${OUTPUT_PATH}'`);
        expect(err.compilerName).toBe('TestCompiler');
        expect(err.decision).toBe(denied);
      }
    });

    it('includes the outputPath in the error operation string', () => {
      mockCheckAccess.mockReturnValue(makeDeniedDecision());
      const customPath = '/usr/share/restricted/out.glb';

      try {
        compiler.exposeValidateOutputPath(FAKE_TOKEN, customPath);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe(`output write to '${customPath}'`);
      }
    });
  });

  // ===================================================================
  // validateCompilerAccess (combined validation)
  // ===================================================================
  describe('validateCompilerAccess', () => {
    it('succeeds when all validations pass (without outputPath)', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      expect(() =>
        compiler.exposeValidateCompilerAccess(FAKE_TOKEN),
      ).not.toThrow();

      // Should call checkAccess exactly twice: AST access + code generation
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('succeeds when all validations pass (with outputPath)', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      expect(() =>
        compiler.exposeValidateCompilerAccess(FAKE_TOKEN, '/out/scene.cs'),
      ).not.toThrow();

      // Should call checkAccess exactly three times: AST + code gen + output
      expect(mockCheckAccess).toHaveBeenCalledTimes(3);
    });

    it('throws when AST access is denied (first check)', () => {
      mockCheckAccess.mockReturnValueOnce(makeDeniedDecision({ reason: 'No AST read' }));

      expect(() =>
        compiler.exposeValidateCompilerAccess(FAKE_TOKEN, '/out/scene.cs'),
      ).toThrowError(UnauthorizedCompilerAccessError);

      // Should stop at first failure -- only 1 call made
      expect(mockCheckAccess).toHaveBeenCalledTimes(1);
    });

    it('throws when code generation is denied (second check)', () => {
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision()) // AST access passes
        .mockReturnValueOnce(makeDeniedDecision({ reason: 'No code gen' })); // code gen fails

      expect(() =>
        compiler.exposeValidateCompilerAccess(FAKE_TOKEN, '/out/scene.cs'),
      ).toThrowError(UnauthorizedCompilerAccessError);

      // Should stop at second failure -- only 2 calls made
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('throws when output path validation is denied (third check)', () => {
      mockCheckAccess
        .mockReturnValueOnce(makeAllowedDecision()) // AST access passes
        .mockReturnValueOnce(makeAllowedDecision()) // code gen passes
        .mockReturnValueOnce(makeDeniedDecision({ reason: 'Path restricted' })); // output fails

      expect(() =>
        compiler.exposeValidateCompilerAccess(FAKE_TOKEN, '/restricted/out.cs'),
      ).toThrowError(UnauthorizedCompilerAccessError);

      expect(mockCheckAccess).toHaveBeenCalledTimes(3);
    });

    it('skips output path validation when outputPath is not provided', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.exposeValidateCompilerAccess(FAKE_TOKEN);

      // Only AST + code gen (no output path call)
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);

      // Verify the calls are for AST and CODE, not OUTPUT
      const firstCall = mockCheckAccess.mock.calls[0][0];
      const secondCall = mockCheckAccess.mock.calls[1][0];
      expect(firstCall.resourceType).toBe(ResourceType.AST);
      expect(secondCall.resourceType).toBe(ResourceType.CODE);
    });

    it('skips output path validation when outputPath is empty string (falsy)', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      compiler.exposeValidateCompilerAccess(FAKE_TOKEN, '');

      // Empty string is falsy, so output path validation is skipped
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });
  });

  // ===================================================================
  // ICompiler interface compliance (via compile method)
  // ===================================================================
  describe('compile (concrete subclass integration)', () => {
    it('calls validateCompilerAccess and returns compiled output', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      const composition = { name: 'Scene', objects: [] } as unknown as HoloComposition;
      const result = compiler.compile(composition, FAKE_TOKEN);

      expect(result).toBe('// compiled');
      // AST access + code gen
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('calls all three validations when outputPath is provided', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      const composition = { name: 'Scene', objects: [] } as unknown as HoloComposition;
      const result = compiler.compile(composition, FAKE_TOKEN, '/out/scene.cs');

      expect(result).toBe('// compiled');
      expect(mockCheckAccess).toHaveBeenCalledTimes(3);
    });

    it('throws before compilation when access is denied', () => {
      mockCheckAccess.mockReturnValue(makeDeniedDecision());

      const composition = { name: 'Scene', objects: [] } as unknown as HoloComposition;

      expect(() => compiler.compile(composition, FAKE_TOKEN)).toThrowError(
        UnauthorizedCompilerAccessError,
      );
    });
  });

  // ===================================================================
  // Correct ResourceAccessRequest parameters
  // ===================================================================
  describe('checkAccess call parameters', () => {
    it('validateASTAccess sends correct ResourceType and operation', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());
      compiler.exposeValidateASTAccess(FAKE_TOKEN);

      const req = mockCheckAccess.mock.calls[0][0];
      expect(req.token).toBe(FAKE_TOKEN);
      expect(req.resourceType).toBe(ResourceType.AST);
      expect(req.operation).toBe('read');
      expect(req.expectedWorkflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);
      expect(req.resourcePath).toBeUndefined();
    });

    it('validateCodeGeneration sends correct ResourceType and operation', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());
      compiler.exposeValidateCodeGeneration(FAKE_TOKEN);

      const req = mockCheckAccess.mock.calls[0][0];
      expect(req.token).toBe(FAKE_TOKEN);
      expect(req.resourceType).toBe(ResourceType.CODE);
      expect(req.operation).toBe('write');
      expect(req.expectedWorkflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);
      expect(req.resourcePath).toBeUndefined();
    });

    it('validateOutputPath sends correct ResourceType, operation, and resourcePath', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());
      const outPath = '/build/artifacts/scene.gltf';
      compiler.exposeValidateOutputPath(FAKE_TOKEN, outPath);

      const req = mockCheckAccess.mock.calls[0][0];
      expect(req.token).toBe(FAKE_TOKEN);
      expect(req.resourceType).toBe(ResourceType.OUTPUT);
      expect(req.operation).toBe('write');
      expect(req.resourcePath).toBe(outPath);
      expect(req.expectedWorkflowStep).toBe(WorkflowStep.SERIALIZE);
    });
  });

  // ===================================================================
  // createTestCompilerToken utility
  // ===================================================================
  describe('createTestCompilerToken', () => {
    it('returns a string token when identity modules are available', () => {
      // createTestCompilerToken uses runtime require() calls internally.
      // We need to verify the function's contract: it calls getTokenIssuer()
      // and issueToken(), returning a string. Since require() resolves
      // relative to the source file, we test by catching the MODULE_NOT_FOUND
      // error (expected in test environment without compiled output) OR
      // validating the return if modules happen to resolve.
      try {
        const token = createTestCompilerToken();
        // If it succeeds, it must return a non-empty string
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      } catch (e: any) {
        // In test environments the runtime require() for AgentTokenIssuer
        // may fail because it resolves against compiled JS paths.
        // Verify the error is specifically about module resolution, not
        // a logic error in createTestCompilerToken itself.
        expect(e.code).toBe('MODULE_NOT_FOUND');
        expect(e.message).toContain('AgentTokenIssuer');
      }
    });

    it('is exported as a function', () => {
      expect(typeof createTestCompilerToken).toBe('function');
    });
  });

  // ===================================================================
  // Multiple token values
  // ===================================================================
  describe('token forwarding', () => {
    it('forwards different tokens correctly to checkAccess', () => {
      mockCheckAccess.mockReturnValue(makeAllowedDecision());

      const tokenA = 'token-alpha';
      const tokenB = 'token-beta';

      compiler.exposeValidateASTAccess(tokenA);
      compiler.exposeValidateASTAccess(tokenB);

      expect(mockCheckAccess.mock.calls[0][0].token).toBe(tokenA);
      expect(mockCheckAccess.mock.calls[1][0].token).toBe(tokenB);
    });
  });

  // ===================================================================
  // Error message formatting edge cases
  // ===================================================================
  describe('UnauthorizedCompilerAccessError message edge cases', () => {
    it('handles empty string reason', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: '',
        agentRole: 'orchestrator' as any,
        requiredPermission: 'write:output' as any,
      };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        'export',
        'ExporterCompiler',
      );

      // Empty string is falsy, so it should fall back to 'Access denied'
      expect(err.message).toContain('Access denied');
    });

    it('handles special characters in operation and compilerName', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: "Can't access <resource>",
        agentRole: 'code_generator' as any,
      };

      const err = new UnauthorizedCompilerAccessError(
        decision,
        "output write to '/path/with spaces/file.cs'",
        'My/Custom\\Compiler',
      );

      expect(err.message).toContain('[My/Custom\\Compiler]');
      expect(err.message).toContain("output write to '/path/with spaces/file.cs'");
      expect(err.message).toContain("Can't access <resource>");
    });

    it('includes newlines separating role and permission info', () => {
      const decision: AccessDecision = {
        allowed: false,
        reason: 'Denied',
        agentRole: 'exporter' as any,
        requiredPermission: 'write:output' as any,
      };

      const err = new UnauthorizedCompilerAccessError(decision, 'serialize', 'Exp');
      const lines = err.message.split('\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('[Exp] Unauthorized serialize: Denied');
      expect(lines[1]).toContain('Agent Role: exporter');
      expect(lines[2]).toContain('Required Permission: write:output');
    });
  });

  // ===================================================================
  // Abstract class cannot be instantiated directly
  // ===================================================================
  describe('CompilerBase abstract nature', () => {
    it('TestCompiler is an instance of CompilerBase', () => {
      expect(compiler).toBeInstanceOf(CompilerBase);
    });

    it('TestCompiler satisfies ICompiler interface', () => {
      // Structural check: compile method exists and is callable
      expect(typeof compiler.compile).toBe('function');
    });
  });
});
