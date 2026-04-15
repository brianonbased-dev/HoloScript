/**
 * RBAC Enforcement Tests for Non-CompilerBase Compilers
 *
 * Tests that IncrementalCompiler, StateCompiler, and TraitCompositionCompiler
 * all enforce RBAC access control via AgentRBAC.checkAccess().
 *
 * Each compiler:
 *  - Accepts an agentToken parameter
 *  - Calls getRBAC().checkAccess() when a token is provided
 *  - Throws an Unauthorized* error when access is denied
 *  - Succeeds when access is allowed
 *  - Skips validation when no token is provided (backwards compatibility)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AccessDecision } from '@holoscript/platform';
import { ResourceType } from '@holoscript/platform';

// ── Mock getRBAC with controllable checkAccess ─────────────────────────────
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

// ── Lazy imports (after mock is set up) ────────────────────────────────────
import { StateCompiler, UnauthorizedStateCompilerAccessError } from '../StateCompiler';

import {
  TraitCompositionCompiler,
  UnauthorizedTraitCompositionAccessError,
  type TraitCompositionDecl,
  type ComponentTraitHandler,
} from '../TraitCompositionCompiler';

import {
  IncrementalCompiler,
  UnauthorizedIncrementalCompilerAccessError,
} from '../IncrementalCompiler';

import type { HSPlusAST, HSPlusNode } from '../../types/HoloScriptPlus';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAllowed(): AccessDecision {
  return { allowed: true, agentRole: 'code_generator' as any };
}

function makeDenied(reason = 'Insufficient permissions'): AccessDecision {
  return {
    allowed: false,
    reason,
    requiredPermission: 'read:ast' as any,
    agentRole: 'syntax_analyzer' as any,
  };
}

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.rbac-test.token';

// ── StateCompiler helpers ──────────────────────────────────────────────────

function makeHSPlusNode(name: string, stateBlock?: Record<string, unknown>): HSPlusNode {
  return { type: 'Object', name, stateBlock, children: [] };
}

function makeHSPlusAST(root: HSPlusNode): HSPlusAST {
  return { type: 'Program', root, body: [] };
}

// ── TraitCompositionCompiler helpers ───────────────────────────────────────

function makeHandler(defaults: Record<string, unknown> = {}): ComponentTraitHandler {
  return { defaultConfig: defaults };
}

function makeRegistry(
  entries: Record<string, ComponentTraitHandler>
): (name: string) => ComponentTraitHandler | undefined {
  return (name) => entries[name];
}

// ── IncrementalCompiler helpers ────────────────────────────────────────────

function makeObj(name: string): HoloObjectDecl {
  return { name, type: 'object', properties: [], traits: [], children: [] } as any;
}

function makeComposition(objects: HoloObjectDecl[]): HoloComposition {
  return { name: 'TestScene', objects, spatialGroups: [] } as any;
}

const compileObj = (obj: HoloObjectDecl) => `/* compiled:${obj.name} */`;

// ===========================================================================
// TESTS
// ===========================================================================

describe('RBAC Enforcement — StateCompiler', () => {
  let compiler: StateCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new StateCompiler();
  });

  it('compiles successfully with a valid token (access allowed)', () => {
    mockCheckAccess.mockReturnValue(makeAllowed());
    const ast = makeHSPlusAST(makeHSPlusNode('Player', { hp: 100 }));

    const result = compiler.compile(ast, FAKE_TOKEN);

    expect(result.has('Player')).toBe(true);
    expect(result.get('Player')!.initialState.hp).toBe(100);
    expect(mockCheckAccess).toHaveBeenCalledOnce();
    expect(mockCheckAccess).toHaveBeenCalledWith({
      token: FAKE_TOKEN,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: 'generate_assembly',
    });
  });

  it('throws UnauthorizedStateCompilerAccessError when access is denied', () => {
    mockCheckAccess.mockReturnValue(makeDenied('State compilation not permitted'));
    const ast = makeHSPlusAST(makeHSPlusNode('Player', { hp: 100 }));

    expect(() => compiler.compile(ast, FAKE_TOKEN)).toThrow(UnauthorizedStateCompilerAccessError);

    try {
      compiler.compile(ast, FAKE_TOKEN);
    } catch (e) {
      const err = e as UnauthorizedStateCompilerAccessError;
      expect(err.name).toBe('UnauthorizedStateCompilerAccessError');
      expect(err.compilerName).toBe('StateCompiler');
      expect(err.message).toContain('State compilation not permitted');
      expect(err.message).toContain('StateCompiler');
      expect(err.decision.allowed).toBe(false);
    }
  });

  it('skips RBAC validation when no token is provided (backwards compatibility)', () => {
    const ast = makeHSPlusAST(makeHSPlusNode('Widget', { count: 0 }));

    // Call without agentToken
    const result = compiler.compile(ast);

    expect(result.has('Widget')).toBe(true);
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('skips RBAC validation when empty string token is provided', () => {
    const ast = makeHSPlusAST(makeHSPlusNode('Widget', { count: 0 }));

    // Empty string is falsy, should skip validation
    const result = compiler.compile(ast, '');

    expect(result.has('Widget')).toBe(true);
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('error class is an instance of Error', () => {
    const decision = makeDenied();
    const err = new UnauthorizedStateCompilerAccessError(decision, 'StateCompiler');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnauthorizedStateCompilerAccessError);
  });
});

describe('RBAC Enforcement — TraitCompositionCompiler', () => {
  let compiler: TraitCompositionCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new TraitCompositionCompiler();
  });

  it('compiles successfully with a valid token (access allowed)', () => {
    mockCheckAccess.mockReturnValue(makeAllowed());

    const decl: TraitCompositionDecl = { name: 'Warrior', components: ['combat'] };
    const registry = makeRegistry({ combat: makeHandler({ damage: 10 }) });

    const [def] = compiler.compile([decl], registry, undefined, FAKE_TOKEN);

    expect(def.name).toBe('Warrior');
    expect(def.defaultConfig.damage).toBe(10);
    expect(mockCheckAccess).toHaveBeenCalledOnce();
    expect(mockCheckAccess).toHaveBeenCalledWith({
      token: FAKE_TOKEN,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: 'generate_assembly',
    });
  });

  it('throws UnauthorizedTraitCompositionAccessError when access is denied', () => {
    mockCheckAccess.mockReturnValue(makeDenied('Trait composition not permitted'));

    const decl: TraitCompositionDecl = { name: 'Warrior', components: ['combat'] };
    const registry = makeRegistry({ combat: makeHandler({ damage: 10 }) });

    expect(() => compiler.compile([decl], registry, undefined, FAKE_TOKEN)).toThrow(
      UnauthorizedTraitCompositionAccessError
    );

    try {
      compiler.compile([decl], registry, undefined, FAKE_TOKEN);
    } catch (e) {
      const err = e as UnauthorizedTraitCompositionAccessError;
      expect(err.name).toBe('UnauthorizedTraitCompositionAccessError');
      expect(err.compilerName).toBe('TraitCompositionCompiler');
      expect(err.message).toContain('Trait composition not permitted');
      expect(err.message).toContain('TraitCompositionCompiler');
      expect(err.decision.allowed).toBe(false);
    }
  });

  it('skips RBAC validation when no token is provided (backwards compatibility)', () => {
    const decl: TraitCompositionDecl = { name: 'Solo', components: ['x'] };
    const registry = makeRegistry({ x: makeHandler({}) });

    // Call without agentToken (3rd param is traitGraph, 4th is agentToken)
    const [def] = compiler.compile([decl], registry);

    expect(def.name).toBe('Solo');
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('skips RBAC validation when empty string token is provided', () => {
    const decl: TraitCompositionDecl = { name: 'Solo', components: ['x'] };
    const registry = makeRegistry({ x: makeHandler({}) });

    // Empty string is falsy, should skip validation
    const [def] = compiler.compile([decl], registry, undefined, '');

    expect(def.name).toBe('Solo');
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('error class is an instance of Error', () => {
    const decision = makeDenied();
    const err = new UnauthorizedTraitCompositionAccessError(decision, 'TraitCompositionCompiler');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnauthorizedTraitCompositionAccessError);
  });
});

describe('RBAC Enforcement — IncrementalCompiler', () => {
  let compiler: IncrementalCompiler;

  beforeEach(() => {
    vi.clearAllMocks();
    compiler = new IncrementalCompiler();
  });

  it('compiles successfully with a valid token (access allowed)', async () => {
    mockCheckAccess.mockReturnValue(makeAllowed());

    const ast = makeComposition([makeObj('Cube')]);
    const result = await compiler.compile(ast, compileObj, { agentToken: FAKE_TOKEN });

    expect(result.recompiledObjects).toContain('Cube');
    expect(result.compiledCode).toContain('compiled:Cube');
    expect(mockCheckAccess).toHaveBeenCalledOnce();
    expect(mockCheckAccess).toHaveBeenCalledWith({
      token: FAKE_TOKEN,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: 'generate_assembly',
    });
  });

  it('throws UnauthorizedIncrementalCompilerAccessError when access is denied', async () => {
    mockCheckAccess.mockReturnValue(makeDenied('Incremental compilation not permitted'));

    const ast = makeComposition([makeObj('Cube')]);

    await expect(compiler.compile(ast, compileObj, { agentToken: FAKE_TOKEN })).rejects.toThrow(
      UnauthorizedIncrementalCompilerAccessError
    );

    try {
      await compiler.compile(ast, compileObj, { agentToken: FAKE_TOKEN });
    } catch (e) {
      const err = e as UnauthorizedIncrementalCompilerAccessError;
      expect(err.name).toBe('UnauthorizedIncrementalCompilerAccessError');
      expect(err.compilerName).toBe('IncrementalCompiler');
      expect(err.message).toContain('Incremental compilation not permitted');
      expect(err.message).toContain('IncrementalCompiler');
      expect(err.decision.allowed).toBe(false);
    }
  });

  it('skips RBAC validation when no agentToken in options (backwards compatibility)', async () => {
    const ast = makeComposition([makeObj('Sphere')]);

    // Call without agentToken in options
    const result = await compiler.compile(ast, compileObj, {});

    expect(result.recompiledObjects).toContain('Sphere');
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('skips RBAC validation when options are omitted entirely', async () => {
    const ast = makeComposition([makeObj('Sphere')]);

    // Call with default options (no agentToken)
    const result = await compiler.compile(ast, compileObj);

    expect(result.recompiledObjects).toContain('Sphere');
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('skips RBAC validation when empty string token is provided', async () => {
    const ast = makeComposition([makeObj('Sphere')]);

    // Empty string is falsy, should skip validation
    const result = await compiler.compile(ast, compileObj, { agentToken: '' });

    expect(result.recompiledObjects).toContain('Sphere');
    expect(mockCheckAccess).not.toHaveBeenCalled();
  });

  it('error class is an instance of Error', () => {
    const decision = makeDenied();
    const err = new UnauthorizedIncrementalCompilerAccessError(decision, 'IncrementalCompiler');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnauthorizedIncrementalCompilerAccessError);
  });
});
