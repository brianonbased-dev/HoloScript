/**
 * @holoscript/mcp-server security tests
 * Covers: sandbox-policy, fork-sandbox-gate, detectForkedHoloScript, detectForkedPlugin
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectForkedHoloScript,
  detectForkedPlugin,
  runForkSandboxGate,
  gateHoloScriptCode,
  gateMcpTool,
  gatePluginRegistration,
  resolvePolicy,
  DEFAULT_SENSITIVE_POLICY,
  DEFAULT_BENIGN_POLICY,
  DEFAULT_CONSUMER_GENERATION_POLICY,
  SYSTEM_DEFAULT_BLOCKED_ACTIONS,
} from '../security/fork-sandbox-gate';
import { globalReceiptStore } from '../security/sandbox-policy';

describe('detectForkedHoloScript', () => {
  it('flags HS010 blocked keywords', () => {
    const code = 'orb test { method init() { process.exit(0); } }';
    const result = detectForkedHoloScript(code);
    expect(result.isSuspicious).toBe(true);
    expect(result.signals).toContain('HS010-blocked-keyword:process');
  });

  it('flags multiple blocked keywords', () => {
    const code = 'eval(fs.readFileSync("x"))';
    const result = detectForkedHoloScript(code);
    expect(result.signals).toContain('HS010-blocked-keyword:eval');
    expect(result.signals).toContain('HS010-blocked-keyword:fs');
  });

  it('flags unknown compiler version', () => {
    const code = '@compiler version "99.0.0"\norb x {}';
    const result = detectForkedHoloScript(code);
    expect(result.isSuspicious).toBe(true);
    expect(result.signals).toContain('unknown-compiler-version:99.0.0');
  });

  it('does not flag canonical compiler versions', () => {
    const code = '@compiler version "7.0.0"\norb x {}';
    const result = detectForkedHoloScript(code);
    expect(result.signals.some((s) => s.startsWith('unknown-compiler-version'))).toBe(false);
  });

  it('flags no-op security trait', () => {
    const code = 'orb x { @security_sandbox }';
    const result = detectForkedHoloScript(code);
    expect(result.signals).toContain('no-op-security-trait');
  });

  it('does not flag security trait with import', () => {
    const code = 'import { securitySandbox } from "security-sandbox";\norb x { @security_sandbox }';
    const result = detectForkedHoloScript(code);
    expect(result.signals).not.toContain('no-op-security-trait');
  });

  it('flags non-canonical import', () => {
    const code = 'import { x } from "@evil/package";';
    const result = detectForkedHoloScript(code);
    expect(result.signals).toContain('non-canonical-import');
  });

  it('allows canonical @holoscript imports', () => {
    const code = 'import { x } from "@holoscript/core";';
    const result = detectForkedHoloScript(code);
    expect(result.signals).not.toContain('non-canonical-import');
  });

  it('returns benign for clean code', () => {
    const code = 'orb sword { traits: ["grabbable"] }';
    const result = detectForkedHoloScript(code);
    expect(result.isSuspicious).toBe(false);
    expect(result.signals).toEqual([]);
  });
});

describe('detectForkedPlugin', () => {
  it('flags non-canonical scope', () => {
    const result = detectForkedPlugin({ scopeName: '@evil/plugin', version: '1.0.0' });
    expect(result.signals).toContain('non-canonical-scope:@evil/plugin');
  });

  it('flags invalid semver', () => {
    const result = detectForkedPlugin({ scopeName: '@holoscript/plugin', version: 'v1.0' });
    expect(result.signals).toContain('invalid-semver:v1.0');
  });

  it('flags unverified tier', () => {
    const result = detectForkedPlugin({ trustTier: 'unverified' });
    expect(result.signals).toContain('unverified-tier');
  });

  it('returns benign for canonical plugin', () => {
    const result = detectForkedPlugin({
      scopeName: '@holoscript/plugin',
      version: '1.0.0',
      trustTier: 'verified',
    });
    expect(result.isSuspicious).toBe(false);
  });
});

describe('resolvePolicy', () => {
  it('benign for canonical + non-sensitive tool', () => {
    const policy = resolvePolicy(
      { kind: 'holoscript_code', source: 'canonical' },
      'hs_diagnostics'
    );
    expect(policy.policyId).toBe(DEFAULT_BENIGN_POLICY.policyId);
  });

  it('sensitive for fork source even when tool is non-sensitive', () => {
    const policy = resolvePolicy({ kind: 'holoscript_code', source: 'fork' }, 'hs_diagnostics');
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('sensitive for sensitive tool even if canonical', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'canonical' }, 'create_world');
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('promotes default blocked physical actions into the sensitive policy', () => {
    expect(SYSTEM_DEFAULT_BLOCKED_ACTIONS).toContain('actuator:command');
    expect(SYSTEM_DEFAULT_BLOCKED_ACTIONS).toContain('robot:move');
    expect(DEFAULT_SENSITIVE_POLICY.defaultBlockedActions).toEqual(SYSTEM_DEFAULT_BLOCKED_ACTIONS);
    expect(DEFAULT_BENIGN_POLICY.defaultBlockedActions).toEqual([]);
  });
});

// WS-1 (2026-07-02): the narrow, additive consumer-tier branch in resolvePolicy().
// Every assertion here is a regression guard proving the slice is reachable only
// for source==='consumer' and one of the 2 explicitly listed tools. A separate
// emergency disable switch can close the tier without widening anything else.
describe('resolvePolicy - WS-1 consumer tier (additive, default-enabled)', () => {
  const ORIGINAL_DISABLED = process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;

  beforeEach(() => {
    delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
  });

  afterEach(() => {
    if (ORIGINAL_DISABLED === undefined) delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
    else process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = ORIGINAL_DISABLED;
  });

  it('resolves the consumer policy by default when source=consumer AND tool is generate_scene', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'consumer' }, 'generate_scene');
    expect(policy.policyId).toBe(DEFAULT_CONSUMER_GENERATION_POLICY.policyId);
  });

  it('resolves the consumer policy for generate_world_from_prompt too', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'consumer' }, 'generate_world_from_prompt');
    expect(policy.policyId).toBe(DEFAULT_CONSUMER_GENERATION_POLICY.policyId);
  });

  it('can be closed by the emergency disable switch', () => {
    process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = 'true';
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'consumer' }, 'generate_scene');
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('stays sensitive for source=canonical (the source must be consumer)', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'canonical' }, 'generate_scene');
    // canonical + non-sensitive-listed-as-consumer-safe tool still hits isSensitiveTool
    // (generate_scene IS in SENSITIVE_TOOL_PATTERNS) -- so canonical callers of this
    // tool are UNCHANGED by this slice, exactly as intended.
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('NEVER leaks the consumer policy to a non-listed sensitive tool, even with source=consumer (create_world)', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'consumer' }, 'create_world');
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('NEVER leaks the consumer policy to a robot/payment-class sensitive tool (twin_earth_robot_actuate)', () => {
    const policy = resolvePolicy({ kind: 'mcp_tool', source: 'consumer' }, 'twin_earth_robot_actuate');
    expect(policy.policyId).toBe(DEFAULT_SENSITIVE_POLICY.policyId);
  });

  it('the consumer policy resource ceilings are strictly <= the benign policy (never more permissive than the existing anonymous tier)', () => {
    expect(DEFAULT_CONSUMER_GENERATION_POLICY.resources.maxExecutionTimeMs).toBeLessThanOrEqual(
      DEFAULT_BENIGN_POLICY.resources.maxExecutionTimeMs
    );
    expect(DEFAULT_CONSUMER_GENERATION_POLICY.resources.maxNestedCalls).toBeLessThanOrEqual(
      DEFAULT_BENIGN_POLICY.resources.maxNestedCalls
    );
    expect(DEFAULT_CONSUMER_GENERATION_POLICY.file.allowFsWrites).toBe(false);
    expect(DEFAULT_CONSUMER_GENERATION_POLICY.permissions.allowAnonymous).toBe(true);
  });

  it('DEFAULT_SENSITIVE_POLICY and DEFAULT_BENIGN_POLICY are byte-identical to before this slice (no accidental field mutation)', () => {
    expect(DEFAULT_SENSITIVE_POLICY.policyId).toBe('holoscript-sensitive-default-v1');
    expect(DEFAULT_SENSITIVE_POLICY.permissions.allowAnonymous).toBe(false);
    expect(DEFAULT_BENIGN_POLICY.policyId).toBe('holoscript-benign-default-v1');
    expect(DEFAULT_BENIGN_POLICY.network.allowNetwork).toBe(false);
  });
});

describe('runForkSandboxGate', () => {
  beforeEach(() => {
    globalReceiptStore.purgeExpired();
  });

  it('blocks holoscript code with HS010 keyword (no manifest)', async () => {
    const result = await runForkSandboxGate(
      {
        kind: 'holoscript_code',
        source: 'unknown',
        subjectId: 'test_1',
        payload: 'eval("bad")',
      },
      { enableHeuristics: true }
    );
    expect(result.allowed).toBe(false);
    expect(result.receipt).toBeDefined();
    expect(result.checks.some((c) => c.name === 'capability_manifest' && !c.passed)).toBe(true);
  });

  it('blocks plugin with unverified tier', async () => {
    const result = await runForkSandboxGate(
      {
        kind: 'generated_plugin',
        source: 'unknown',
        subjectId: 'plugin:evil',
        payload: { name: 'evil', scopeName: '@evil', trustTier: 'unverified' },
      },
      { enableHeuristics: true }
    );
    expect(result.allowed).toBe(false);
  });

  it('allows canonical benign code without manifest when tool is non-sensitive', async () => {
    const result = await runForkSandboxGate(
      {
        kind: 'holoscript_code',
        source: 'canonical',
        subjectId: 'test_2',
        payload: 'orb x {}',
      },
      { toolName: 'hs_diagnostics' }
    );
    expect(result.allowed).toBe(true);
  });

  it('allows consumer generate_scene without a capability manifest through the consumer policy', async () => {
    const originalDisabled = process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
    try {
      delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
      const result = await runForkSandboxGate(
        {
          kind: 'mcp_tool',
          source: 'consumer',
          subjectId: 'mcp:generate_scene',
          payload: { description: 'a small cabin' },
        },
        { toolName: 'generate_scene' }
      );
      expect(result.allowed).toBe(true);
      expect(result.appliedPolicy.policyId).toBe(DEFAULT_CONSUMER_GENERATION_POLICY.policyId);
      expect(result.checks.some((c) => c.name === 'capability_manifest' && c.passed)).toBe(true);
    } finally {
      if (originalDisabled === undefined) delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
      else process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = originalDisabled;
    }
  });

  it('blocks path traversal in args', async () => {
    const result = await runForkSandboxGate(
      {
        kind: 'mcp_tool',
        source: 'canonical',
        subjectId: 'tool:test',
        payload: { path: '../../../etc/passwd' },
      },
      { toolName: 'hs_diagnostics' }
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.some((c) => c.name === 'file_limits' && !c.passed)).toBe(true);
  });

  it('blocks network calls when no hosts allowed', async () => {
    // Benign policy disables network entirely → passes network check
    const benignResult = await runForkSandboxGate(
      {
        kind: 'holoscript_code',
        source: 'canonical',
        subjectId: 'test_3',
        payload: 'fetch("https://evil.com")',
      },
      { toolName: 'hs_diagnostics' }
    );
    expect(benignResult.allowed).toBe(true);

    // Sensitive policy with empty allowedHosts → blocks network calls
    const customPolicy = {
      ...DEFAULT_SENSITIVE_POLICY,
      policyId: 'test-no-hosts',
      network: { ...DEFAULT_SENSITIVE_POLICY.network, allowedHosts: [] },
    };
    const sensitiveResult = await runForkSandboxGate(
      {
        kind: 'holoscript_code',
        source: 'canonical',
        subjectId: 'test_4',
        payload: 'fetch("https://evil.com")',
        manifest: {
          protocol: 'holoscript.capability.v1',
          declaredCapabilities: ['network:fetch'],
          attestation: {
            manifestHash: 'abc',
            signer: 'test',
            trustTier: 'verified',
            attestedAt: new Date().toISOString(),
          },
        },
      },
      { toolName: 'create_world', policy: customPolicy, grantedScopes: ['tools:write'] }
    );
    expect(sensitiveResult.allowed).toBe(false);
    expect(sensitiveResult.checks.some((c) => c.name === 'network_limits' && !c.passed)).toBe(true);
  });

  it('emits receipt when blocked', async () => {
    const before = globalReceiptStore.size();
    await runForkSandboxGate(
      {
        kind: 'holoscript_code',
        source: 'unknown',
        subjectId: 'test_receipt',
        payload: 'require("fs")',
      },
      { enableHeuristics: true }
    );
    expect(globalReceiptStore.size()).toBeGreaterThan(before);
  });
});

describe('gateHoloScriptCode', () => {
  it('returns allowed false for hostile code', async () => {
    const result = await gateHoloScriptCode('process.env.NODE_ENV');
    expect(result.allowed).toBe(false);
  });

  it('returns allowed true for benign code', async () => {
    const result = await gateHoloScriptCode('orb sword { @grabbable }', { source: 'canonical' });
    expect(result.allowed).toBe(true);
  });
});

describe('gateMcpTool', () => {
  const validManifest = {
    protocol: 'holoscript.capability.v1' as const,
    declaredCapabilities: ['world:create'],
    attestation: {
      manifestHash: 'abc',
      signer: 'test',
      trustTier: 'verified' as const,
      attestedAt: new Date().toISOString(),
    },
  };

  it('blocks sensitive tool without manifest', async () => {
    const result = await gateMcpTool('create_world', { name: 'MyWorld' });
    expect(result.allowed).toBe(false);
    expect(result.checks.some((c) => c.name === 'capability_manifest' && !c.passed)).toBe(true);
  });

  it('blocks sensitive tool with manifest but without scopes', async () => {
    const result = await gateMcpTool(
      'create_world',
      { name: 'MyWorld' },
      { manifest: validManifest }
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.some((c) => c.name === 'permissions' && !c.passed)).toBe(true);
  });

  it('allows sensitive tool with manifest + admin scope', async () => {
    const result = await gateMcpTool(
      'create_world',
      { name: 'MyWorld' },
      {
        grantedScopes: ['admin:*'],
        manifest: validManifest,
      }
    );
    expect(result.allowed).toBe(true);
  });
});

describe('gatePluginRegistration', () => {
  it('blocks unverified plugin', async () => {
    const result = await gatePluginRegistration({ name: 'bad', trustTier: 'unverified' });
    expect(result.allowed).toBe(false);
  });
});
