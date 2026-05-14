/**
 * HoloScriptAgentRuntime fork-sandbox gate tests
 * Canary task: task_1778618757735_zpt5
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptAgentRuntime } from '../HoloScriptAgentRuntime';

describe('HoloScriptAgentRuntime.checkForkSandbox', () => {
  function makeAgentNode(props: Record<string, unknown> = {}, directives: unknown[] = []) {
    return {
      type: 'orb' as const,
      id: 'test-agent',
      name: 'test-agent',
      template: 'default-brain',
      properties: props,
      directives,
    };
  }

  function makeParentRuntime() {
    const rootScope = { variables: new Map() };
    return {
      callFunction: async () => ({ success: false, error: 'stub' }),
      getRootScope: () => rootScope,
      getVariable: () => undefined,
      executeProgram: async () => [{ success: false, error: 'stub' }],
      emit: async () => undefined,
      executeHoloProgram: async () => [{ success: false, error: 'stub' }],
      evaluateExpression: () => undefined,
    };
  }

  it('allows benign agent without suspicious patterns', () => {
    const runtime = new HoloScriptAgentRuntime(
      makeAgentNode({ wallet: '0x123', handle: 'hero' }),
      makeParentRuntime()
    );
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(true);
  });

  it('blocks agent with HS010 blocked keyword in template', () => {
    const node = makeAgentNode();
    (node as any).template = 'eval("bad")';
    const runtime = new HoloScriptAgentRuntime(node, makeParentRuntime());
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('HS010-blocked-keyword:eval');
  });

  it('blocks agent with blocked keyword in brainCompositionRef', () => {
    const runtime = new HoloScriptAgentRuntime(
      makeAgentNode({ brainCompositionRef: 'process.exit()' }),
      makeParentRuntime()
    );
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('HS010-blocked-keyword:process');
  });

  it('blocks agent with unknown compiler version in property', () => {
    const runtime = new HoloScriptAgentRuntime(
      makeAgentNode({ compilerMeta: '@compiler version "99.0.0"' }),
      makeParentRuntime()
    );
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('unknown-compiler-version:99.0.0');
  });

  it('blocks agent with non-canonical import in directive body', () => {
    const node = makeAgentNode({}, [
      { type: 'method', name: 'hack', body: 'import { x } from "@evil/pkg";' },
    ]);
    const runtime = new HoloScriptAgentRuntime(node, makeParentRuntime());
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('non-canonical-import');
  });

  it('blocks agent with no-op security trait in directive body', () => {
    const node = makeAgentNode({}, [
      { type: 'method', name: 'init', body: 'orb x { @security_sandbox }' },
    ]);
    const runtime = new HoloScriptAgentRuntime(node, makeParentRuntime());
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('no-op-security-trait');
  });

  it('allows canonical compiler version', () => {
    const runtime = new HoloScriptAgentRuntime(
      makeAgentNode({ compilerMeta: '@compiler version "7.0.0"' }),
      makeParentRuntime()
    );
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(true);
  });

  it('allows canonical @holoscript imports in directive body', () => {
    const node = makeAgentNode({}, [
      { type: 'method', name: 'act', body: 'import { x } from "@holoscript/core";' },
    ]);
    const runtime = new HoloScriptAgentRuntime(node, makeParentRuntime());
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(true);
  });

  it('blocks fs keyword in properties', () => {
    const runtime = new HoloScriptAgentRuntime(
      makeAgentNode({ script: 'fs.readFileSync("secret")' }),
      makeParentRuntime()
    );
    const check = (runtime as any).checkForkSandbox();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('HS010-blocked-keyword:fs');
  });

  it('executeAction returns error when fork sandbox blocks', async () => {
    const node = makeAgentNode({ brainCompositionRef: 'eval("bad")' });
    const runtime = new HoloScriptAgentRuntime(node, makeParentRuntime());
    const result = await runtime.executeAction('anyAction', []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ForkSandboxGate');
  });
});
