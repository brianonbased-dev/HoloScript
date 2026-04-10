/**
 * CompilerBase Dual-Mode Access Control Tests (P3 Migration Bridge)
 *
 * Tests that CompilerBase.validateCompilerAccess() correctly routes to:
 * - Legacy JWT RBAC (AgentRBAC.checkAccess()) when given a string token
 * - UCAN capability verification (CapabilityRBAC.checkAccess()) when given
 *   a CapabilityTokenCredential
 *
 * Also tests:
 * - isCapabilityTokenCredential() type guard
 * - getRequiredCapability() ANS namespace derivation
 * - Backwards compatibility (no token, empty string token)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AccessDecision } from '../identity/AgentRBAC';
import { ResourceType } from '../identity/AgentRBAC';
import type { CapabilityAccessDecision } from '../identity/CapabilityRBAC';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type { CapabilityToken } from '../identity/CapabilityToken';

// ---------------------------------------------------------------------------
// Mock getRBAC (legacy JWT path)
// ---------------------------------------------------------------------------
const mockJwtCheckAccess = vi.fn<(...args: any[]) => AccessDecision>();

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: mockJwtCheckAccess,
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock getCapabilityRBAC (UCAN path)
// ---------------------------------------------------------------------------
const mockCapCheckAccess = vi.fn<(...args: any[]) => CapabilityAccessDecision>();

vi.mock('../identity/CapabilityRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/CapabilityRBAC')>();
  return {
    ...actual,
    getCapabilityRBAC: () => ({
      checkAccess: mockCapCheckAccess,
    }),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------
import {
  CompilerBase,
  UnauthorizedCompilerAccessError,
  isCapabilityTokenCredential,
  type CapabilityTokenCredential,
  type CompilerToken,
} from '../CompilerBase';

// ---------------------------------------------------------------------------
// Concrete test subclass exposing protected methods
// ---------------------------------------------------------------------------
class TestDualModeCompiler extends CompilerBase {
  protected readonly compilerName = 'TestDualModeCompiler';

  compile(_composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return '// compiled';
  }

  // Expose protected methods for direct testing
  public exposeValidateCompilerAccess(token?: CompilerToken, outputPath?: string): void {
    this.validateCompilerAccess(token, outputPath);
  }

  public exposeValidateCapabilityAccess(
    credential: CapabilityTokenCredential,
    outputPath?: string
  ): void {
    this.validateCapabilityAccess(credential, outputPath);
  }

  public exposeGetRequiredCapability() {
    return this.getRequiredCapability();
  }
}

// Test subclass with a known compiler name that maps to ANS
class TestUnityCompiler extends CompilerBase {
  protected readonly compilerName = 'UnityCompiler';

  compile(_composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return '// unity compiled';
  }

  public exposeGetRequiredCapability() {
    return this.getRequiredCapability();
  }
}

// Test subclass with a custom ANS namespace override
class TestCustomCapabilityCompiler extends CompilerBase {
  protected readonly compilerName = 'CustomCompiler';

  compile(_composition: HoloComposition, agentToken: string): string {
    this.validateCompilerAccess(agentToken);
    return '// custom compiled';
  }

  protected getRequiredCapability(): string | undefined {
    return '/compile/web3d/r3f';
  }

  public exposeGetRequiredCapability() {
    return this.getRequiredCapability();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAllowedJwt(role = 'code_generator'): AccessDecision {
  return { allowed: true, agentRole: role as any };
}

function makeDeniedJwt(reason = 'Insufficient permissions'): AccessDecision {
  return {
    allowed: false,
    reason,
    requiredPermission: 'write:code' as any,
    agentRole: 'syntax_analyzer' as any,
  };
}

function makeAllowedCap(): CapabilityAccessDecision {
  return {
    allowed: true,
    mode: 'capability',
    matchedCapability: { with: 'holoscript://ast', can: 'ast/read' },
  };
}

function makeDeniedCap(reason = 'Capability not granted'): CapabilityAccessDecision {
  return {
    allowed: false,
    reason,
    mode: 'capability',
  };
}

const FAKE_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.fake.token';

function makeFakeCapabilityToken(): CapabilityToken {
  return {
    header: { alg: 'EdDSA', typ: 'JWT', ucv: '0.10.0' },
    payload: {
      iss: 'agent:orchestrator',
      aud: 'agent:compiler',
      att: [
        { with: 'holoscript://ast', can: 'ast/read' },
        { with: 'holoscript://code', can: 'code/write' },
        { with: 'holoscript://output', can: 'output/write' },
      ],
      prf: [],
      exp: Math.floor(Date.now() / 1000) + 3600,
      nnc: 'test-nonce-123',
    },
    signature: 'fake-signature-base64url',
    raw: 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.fake-signature',
  };
}

function makeFakeCredential(): CapabilityTokenCredential {
  return {
    capabilityToken: makeFakeCapabilityToken(),
    issuerPublicKey:
      '-----BEGIN PUBLIC KEY-----\nfake-ed25519-public-key\n-----END PUBLIC KEY-----',
  };
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('CompilerBase Dual-Mode (P3 Migration Bridge)', () => {
  let compiler: TestDualModeCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new TestDualModeCompiler();
  });

  // =========================================================================
  // isCapabilityTokenCredential type guard
  // =========================================================================

  describe('isCapabilityTokenCredential', () => {
    it('returns false for undefined', () => {
      expect(isCapabilityTokenCredential(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isCapabilityTokenCredential(null)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isCapabilityTokenCredential('')).toBe(false);
    });

    it('returns false for non-empty string (JWT token)', () => {
      expect(isCapabilityTokenCredential(FAKE_JWT_TOKEN)).toBe(false);
    });

    it('returns true for valid CapabilityTokenCredential', () => {
      expect(isCapabilityTokenCredential(makeFakeCredential())).toBe(true);
    });

    it('returns false for object missing capabilityToken', () => {
      const partial = { issuerPublicKey: 'some-key' } as any;
      expect(isCapabilityTokenCredential(partial)).toBe(false);
    });

    it('returns false for object missing issuerPublicKey', () => {
      const partial = { capabilityToken: makeFakeCapabilityToken() } as any;
      expect(isCapabilityTokenCredential(partial)).toBe(false);
    });

    it('returns false for object with null capabilityToken', () => {
      const partial = {
        capabilityToken: null,
        issuerPublicKey: 'some-key',
      } as any;
      expect(isCapabilityTokenCredential(partial)).toBe(false);
    });

    it('returns false for object with non-string issuerPublicKey', () => {
      const partial = {
        capabilityToken: makeFakeCapabilityToken(),
        issuerPublicKey: 12345,
      } as any;
      expect(isCapabilityTokenCredential(partial)).toBe(false);
    });
  });

  // =========================================================================
  // JWT RBAC path (unchanged legacy behavior)
  // =========================================================================

  describe('JWT RBAC path (legacy)', () => {
    it('routes string token to AgentRBAC.checkAccess()', () => {
      mockJwtCheckAccess.mockReturnValue(makeAllowedJwt());

      compiler.exposeValidateCompilerAccess(FAKE_JWT_TOKEN);

      // Should call JWT checkAccess for AST + CODE (2 calls)
      expect(mockJwtCheckAccess).toHaveBeenCalledTimes(2);
      // Should NOT call capability checkAccess
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedCompilerAccessError when JWT access denied', () => {
      mockJwtCheckAccess.mockReturnValue(makeDeniedJwt('No access'));

      expect(() => compiler.exposeValidateCompilerAccess(FAKE_JWT_TOKEN)).toThrow(
        UnauthorizedCompilerAccessError
      );

      expect(mockJwtCheckAccess).toHaveBeenCalledTimes(1);
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });

    it('passes through output path for JWT tokens', () => {
      mockJwtCheckAccess.mockReturnValue(makeAllowedJwt());

      compiler.exposeValidateCompilerAccess(FAKE_JWT_TOKEN, '/out/scene.cs');

      // AST + CODE + OUTPUT = 3 calls
      expect(mockJwtCheckAccess).toHaveBeenCalledTimes(3);
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // UCAN Capability path (P3 Migration Bridge)
  // =========================================================================

  describe('UCAN Capability path', () => {
    it('routes CapabilityTokenCredential to CapabilityRBAC.checkAccess()', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential);

      // Should call capability checkAccess for AST + CODE (2 calls)
      expect(mockCapCheckAccess).toHaveBeenCalledTimes(2);
      // Should NOT call JWT checkAccess
      expect(mockJwtCheckAccess).not.toHaveBeenCalled();
    });

    it('passes capabilityToken and issuerPublicKey to CapabilityRBAC', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential);

      const firstCall = mockCapCheckAccess.mock.calls[0][0];
      expect(firstCall.capabilityToken).toBe(credential.capabilityToken);
      expect(firstCall.issuerPublicKey).toBe(credential.issuerPublicKey);
      expect(firstCall.token).toBe('');
    });

    it('checks AST read as first capability check', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential);

      const firstCall = mockCapCheckAccess.mock.calls[0][0];
      expect(firstCall.resourceType).toBe(ResourceType.AST);
      expect(firstCall.operation).toBe('read');
    });

    it('checks CODE write as second capability check', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential);

      const secondCall = mockCapCheckAccess.mock.calls[1][0];
      expect(secondCall.resourceType).toBe(ResourceType.CODE);
      expect(secondCall.operation).toBe('write');
    });

    it('checks OUTPUT write when outputPath is provided', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential, '/out/scene.gltf');

      // AST + CODE + OUTPUT = 3 calls
      expect(mockCapCheckAccess).toHaveBeenCalledTimes(3);

      const thirdCall = mockCapCheckAccess.mock.calls[2][0];
      expect(thirdCall.resourceType).toBe(ResourceType.OUTPUT);
      expect(thirdCall.operation).toBe('write');
      expect(thirdCall.resourcePath).toBe('/out/scene.gltf');
    });

    it('throws UnauthorizedCompilerAccessError when AST capability denied', () => {
      mockCapCheckAccess.mockReturnValue(makeDeniedCap('No AST capability'));
      const credential = makeFakeCredential();

      expect(() => compiler.exposeValidateCompilerAccess(credential)).toThrow(
        UnauthorizedCompilerAccessError
      );

      try {
        compiler.exposeValidateCompilerAccess(credential);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('AST access');
        expect(err.compilerName).toBe('TestDualModeCompiler');
      }
    });

    it('throws UnauthorizedCompilerAccessError when CODE capability denied', () => {
      mockCapCheckAccess
        .mockReturnValueOnce(makeAllowedCap()) // AST passes
        .mockReturnValueOnce(makeDeniedCap('No code capability')); // CODE fails

      const credential = makeFakeCredential();

      expect(() => compiler.exposeValidateCompilerAccess(credential)).toThrow(
        UnauthorizedCompilerAccessError
      );

      // Should stop after second call (CODE denied)
      expect(mockCapCheckAccess).toHaveBeenCalledTimes(2);

      try {
        // Re-setup mocks for the second try
        mockCapCheckAccess.mockClear();
        mockCapCheckAccess
          .mockReturnValueOnce(makeAllowedCap())
          .mockReturnValueOnce(makeDeniedCap('No code capability'));

        compiler.exposeValidateCompilerAccess(credential);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.operation).toBe('code generation');
        expect(err.compilerName).toBe('TestDualModeCompiler');
      }
    });

    it('throws UnauthorizedCompilerAccessError when OUTPUT capability denied', () => {
      mockCapCheckAccess
        .mockReturnValueOnce(makeAllowedCap()) // AST passes
        .mockReturnValueOnce(makeAllowedCap()) // CODE passes
        .mockReturnValueOnce(makeDeniedCap('No output capability')); // OUTPUT fails

      const credential = makeFakeCredential();

      expect(() => compiler.exposeValidateCompilerAccess(credential, '/restricted/out.cs')).toThrow(
        UnauthorizedCompilerAccessError
      );

      expect(mockCapCheckAccess).toHaveBeenCalledTimes(3);
    });

    it('does not check OUTPUT when no outputPath is provided', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      compiler.exposeValidateCompilerAccess(credential);

      // Only AST + CODE (no output)
      expect(mockCapCheckAccess).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Backwards compatibility (no token / empty token)
  // =========================================================================

  describe('Backwards compatibility', () => {
    it('skips all validation when no token provided', () => {
      compiler.exposeValidateCompilerAccess(undefined);

      expect(mockJwtCheckAccess).not.toHaveBeenCalled();
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });

    it('skips all validation when empty string token provided', () => {
      compiler.exposeValidateCompilerAccess('');

      expect(mockJwtCheckAccess).not.toHaveBeenCalled();
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });

    it('compile() with string token still works (ICompiler interface)', () => {
      mockJwtCheckAccess.mockReturnValue(makeAllowedJwt());

      const composition = { name: 'Scene', objects: [] } as unknown as HoloComposition;
      const result = compiler.compile(composition, FAKE_JWT_TOKEN);

      expect(result).toBe('// compiled');
      expect(mockJwtCheckAccess).toHaveBeenCalledTimes(2);
    });

    it('compile() with empty string token bypasses validation', () => {
      const composition = { name: 'Scene', objects: [] } as unknown as HoloComposition;
      const result = compiler.compile(composition, '');

      expect(result).toBe('// compiled');
      expect(mockJwtCheckAccess).not.toHaveBeenCalled();
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getRequiredCapability() ANS namespace derivation
  // =========================================================================

  describe('getRequiredCapability()', () => {
    it('returns undefined for unknown compiler names', () => {
      // TestDualModeCompiler has compilerName = 'TestDualModeCompiler'
      // which is not in the COMPILER_CLASS_TO_ANS_NAME map
      expect(compiler.exposeGetRequiredCapability()).toBeUndefined();
    });

    it('returns correct ANS path for UnityCompiler', () => {
      const unityCompiler = new TestUnityCompiler();
      expect(unityCompiler.exposeGetRequiredCapability()).toBe('/compile/gamedev/unity');
    });

    it('returns custom namespace when overridden', () => {
      const customCompiler = new TestCustomCapabilityCompiler();
      expect(customCompiler.exposeGetRequiredCapability()).toBe('/compile/web3d/r3f');
    });
  });

  // =========================================================================
  // validateCapabilityAccess() direct testing
  // =========================================================================

  describe('validateCapabilityAccess()', () => {
    it('succeeds when all capability checks pass', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      expect(() => compiler.exposeValidateCapabilityAccess(credential)).not.toThrow();
    });

    it('succeeds with output path when all capability checks pass', () => {
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      const credential = makeFakeCredential();

      expect(() =>
        compiler.exposeValidateCapabilityAccess(credential, '/out/scene.cs')
      ).not.toThrow();

      expect(mockCapCheckAccess).toHaveBeenCalledTimes(3);
    });

    it('error includes correct compiler name', () => {
      mockCapCheckAccess.mockReturnValue(makeDeniedCap('No access'));
      const credential = makeFakeCredential();

      try {
        compiler.exposeValidateCapabilityAccess(credential);
      } catch (e) {
        const err = e as UnauthorizedCompilerAccessError;
        expect(err.compilerName).toBe('TestDualModeCompiler');
        expect(err.message).toContain('TestDualModeCompiler');
      }
    });
  });

  // =========================================================================
  // Mixed scenarios
  // =========================================================================

  describe('Mixed token scenarios', () => {
    it('handles sequential calls with different token types', () => {
      // First call with JWT
      mockJwtCheckAccess.mockReturnValue(makeAllowedJwt());
      compiler.exposeValidateCompilerAccess(FAKE_JWT_TOKEN);
      expect(mockJwtCheckAccess).toHaveBeenCalledTimes(2);
      expect(mockCapCheckAccess).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Second call with UCAN
      mockCapCheckAccess.mockReturnValue(makeAllowedCap());
      compiler.exposeValidateCompilerAccess(makeFakeCredential());
      expect(mockCapCheckAccess).toHaveBeenCalledTimes(2);
      expect(mockJwtCheckAccess).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Third call with no token (skip)
      compiler.exposeValidateCompilerAccess(undefined);
      expect(mockJwtCheckAccess).not.toHaveBeenCalled();
      expect(mockCapCheckAccess).not.toHaveBeenCalled();
    });
  });
});
