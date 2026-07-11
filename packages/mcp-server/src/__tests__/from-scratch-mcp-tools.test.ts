import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { tools } from '../tools';
import {
  fromScratchToolDefinitions,
  handleFromScratchTool,
  isFromScratchToolName,
} from '../from-scratch-mcp-tools';
import { buildSigningPayload, type SignedEnvelope } from '../holomesh/request-signing';
import {
  getAttestationRegistry,
  resetAttestationRegistry,
  type SigningContext,
} from '../holomesh/identity/signing-middleware';
import { authorizeToolCall, getToolRiskLevel, getToolScopes } from '../security/tool-scopes';

const TOOL_NAMES = ['holo_from_scratch_status', 'holo_from_scratch_launch'];
const PRIVATE_KEY = `0x${'1'.repeat(64)}` as const;
const OTHER_PRIVATE_KEY = `0x${'2'.repeat(64)}` as const;
const OTHER_ADDRESS = `0x${'2'.repeat(40)}`;
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY);

let fakeRoot = '';

const baseArgs = {
  model: 'holorunner-s0',
  runId: 'run-secure-1',
  maxDph: 0.35,
  maxSpendUsd: 2.1,
  maxRuntimeHours: 6,
  launcherConfigHash: HASH_A,
  laneManifestHash: HASH_B,
  freeFirstReceiptHash: HASH_C,
  apply: true,
};

function signingContext(signer: string = account.address): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer,
    signingProtocol: 'classical',
  };
}

function attestAddress(address: string, seatId = 'test-seat'): void {
  getAttestationRegistry().attest({
    publicKey: address,
    seatId,
    authorizedBy: 'test-root',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
}

function attestCaller(): void {
  attestAddress(account.address);
}

async function signedAuthority(
  options: {
    issuedAt?: string;
    expiresAt?: string;
    body?: Record<string, unknown>;
    signerAddress?: string;
  } = {}
): Promise<SignedEnvelope> {
  const issuedAt = options.issuedAt ?? new Date().toISOString();
  const nonce = 'authority-nonce-1';
  const body = {
    schema: 'holo.spend-authority.v1',
    rail: 'purchased_compute',
    action: 'holo_from_scratch_launch',
    decision: 'authorized',
    receiptId: 'receipt-secure-1',
    caller: account.address.toLowerCase(),
    model: baseArgs.model,
    runId: baseArgs.runId,
    maxDph: baseArgs.maxDph,
    maxSpendUsd: baseArgs.maxSpendUsd,
    maxRuntimeHours: baseArgs.maxRuntimeHours,
    launcherConfigHash: baseArgs.launcherConfigHash,
    laneManifestHash: baseArgs.laneManifestHash,
    freeFirstReceiptHash: baseArgs.freeFirstReceiptHash,
    issuedAt,
    expiresAt: options.expiresAt ?? new Date(Date.parse(issuedAt) + 2 * 60_000).toISOString(),
    nonce,
    ...(options.body ?? {}),
  };
  const unsigned = { body, nonce, timestamp: issuedAt };
  const signature = await account.signMessage({ message: buildSigningPayload(unsigned) });
  return {
    ...unsigned,
    signature,
    signer_address: options.signerAddress ?? account.address,
  };
}

beforeEach(async () => {
  resetAttestationRegistry();
  fakeRoot = await mkdtemp(join(tmpdir(), 'holo-from-scratch-mcp-test-'));
  const scripts = join(fakeRoot, 'scripts');
  await mkdir(scripts, { recursive: true });
  await writeFile(
    join(scripts, 'train-from-scratch.mjs'),
    [
      "import { existsSync, readFileSync } from 'node:fs';",
      'const argv = process.argv.slice(2);',
      "const at = argv.indexOf('--spend-authority-file');",
      'const authorityPath = at >= 0 ? argv[at + 1] : null;',
      "const authority = authorityPath ? JSON.parse(readFileSync(authorityPath, 'utf8')) : null;",
      `const spendAuthorityChallenge = authorityPath ? null : { launcherConfigHash: '${HASH_A}', laneManifestHash: '${HASH_B}', freeFirstReceiptHash: '${HASH_C}', maxDph: 0.35, maxSpendUsd: 2.1, maxRuntimeHours: 6 };`,
      'if (authorityPath) process.stdout.write(JSON.stringify({ argv, authorityPath, authority, authorityPresent: existsSync(authorityPath) }));',
      "else if (process.env.HOLO_TEST_FORCE_PREFIX === '1') process.stdout.write(`[from-scratch] preparing preview\\n[from-scratch] spend authority challenge: ${JSON.stringify(spendAuthorityChallenge)}\\n[from-scratch] preview complete\\n`);",
      'else process.stdout.write(JSON.stringify({ argv, spendAuthorityChallenge }));',
    ].join('\n'),
    'utf8'
  );
  vi.stubEnv('AI_ECOSYSTEM_ROOT', fakeRoot);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetAttestationRegistry();
  if (fakeRoot) await rm(fakeRoot, { recursive: true, force: true });
});

describe('from-scratch MCP tools', () => {
  it('exports both tool definitions and registers them in tools.ts', () => {
    expect(fromScratchToolDefinitions.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const name of TOOL_NAMES) {
      expect(isFromScratchToolName(name)).toBe(true);
      expect(tools.some((tool) => tool.name === name)).toBe(true);
    }
    expect(isFromScratchToolName('holo_from_scratch_bogus')).toBe(false);
  });

  it('maps status to tools:read/low and launch to tools:admin/critical', () => {
    expect(getToolScopes('holo_from_scratch_status')).toEqual(['tools:read']);
    expect(getToolRiskLevel('holo_from_scratch_status')).toBe('low');
    expect(getToolScopes('holo_from_scratch_launch')).toEqual(['tools:admin']);
    expect(getToolRiskLevel('holo_from_scratch_launch')).toBe('critical');
    expect(authorizeToolCall('holo_from_scratch_launch', ['tools:read']).authorized).toBe(false);
    expect(authorizeToolCall('holo_from_scratch_launch', ['tools:admin']).authorized).toBe(true);
    expect(getToolScopes('batch_tool_call')).toEqual(['tools:read']);
    expect(getToolRiskLevel('batch_tool_call')).toBe('medium');
  });

  it('requires a model id for launch (before any spend or dispatch)', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {})) as Record<
      string,
      unknown
    >;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('model-required');
  });

  it('rejects an unsafe model id', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'bad id; rm -rf /',
    })) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid-model-id');
  });

  it('rejects an applied launch from an unsigned MCP caller', async () => {
    const authority = await signedAuthority();
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      ...baseArgs,
      spendAuthority: authority,
    })) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('spend-authority-rejected');
    expect(result.reason).toBe('signed-mcp-caller-required');
    expect(result.spendIntent).toBe(false);
  });

  it('rejects a cryptographically signed caller that has no active seat attestation', async () => {
    const authority = await signedAuthority();
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('caller-seat-not-active');
  });

  it('rejects the old caller-asserted founderGate shape', async () => {
    attestCaller();
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, founderGate: { approved: true, manifestHash: HASH_A } },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signed-spend-authority-required');
  });

  it('rejects a forged authority signature before dispatch', async () => {
    attestCaller();
    const authority = await signedAuthority({ signerAddress: OTHER_ADDRESS });
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.reason)).toMatch(/^signature-/);
  });

  it('rejects authority from a different active seat than the signed MCP caller', async () => {
    attestCaller();
    attestAddress(otherAccount.address, 'other-test-seat');
    const authority = await signedAuthority();
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext(otherAccount.address)
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('authority-signer-caller-mismatch');
  });

  it('rejects signed authority whose exact model binding differs', async () => {
    attestCaller();
    const authority = await signedAuthority({ body: { model: 'different-model' } });
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('authority-model-mismatch');
  });

  it('rejects an expired authority even when its signature is valid', async () => {
    attestCaller();
    const issuedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const authority = await signedAuthority({
      issuedAt,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('authority-expired');
  });

  // NOTE: this test must never trigger a real GPU launch. It keeps dryRun:true so
  // the handler previews via the CLI's own dry-run (no --apply, no --yes-spend, no
  // spend) — while still exercising the safe preview branch end to end.
  it('previews a dry-run launch without signing or spending', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'holorunner-s0',
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.spendIntent).toBe(false);
    expect(String(result.previewCommand)).not.toContain('--yes-spend');
    expect(String(result.previewCommand)).toContain('--json');
    expect(result.spendAuthorityChallenge).toEqual({
      launcherConfigHash: HASH_A,
      laneManifestHash: HASH_B,
      freeFirstReceiptHash: HASH_C,
      maxDph: 0.35,
      maxSpendUsd: 2.1,
      maxRuntimeHours: 6,
    });
  });

  it('retains stable prefixed challenge parsing for older host wrappers', async () => {
    vi.stubEnv('HOLO_TEST_FORCE_PREFIX', '1');
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'holorunner-s0',
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.spendAuthorityChallenge).toEqual({
      launcherConfigHash: HASH_A,
      laneManifestHash: HASH_B,
      freeFirstReceiptHash: HASH_C,
      maxDph: 0.35,
      maxSpendUsd: 2.1,
      maxRuntimeHours: 6,
    });
  });

  it('passes an exact valid authority through a restricted transient file', async () => {
    attestCaller();
    const authority = await signedAuthority();
    const result = (await handleFromScratchTool(
      'holo_from_scratch_launch',
      { ...baseArgs, spendAuthority: authority },
      signingContext()
    )) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.spendIntent).toBe(true);
    expect(result.spendAuthorityCaller).toBe(account.address.toLowerCase());
    expect(String(result.spendAuthorityHash)).toMatch(/^sha256:[0-9a-f]{64}$/);

    const child = JSON.parse(String(result.stdout)) as {
      argv: string[];
      authorityPath: string;
      authority: SignedEnvelope;
      authorityPresent: boolean;
    };
    expect(child.authorityPresent).toBe(true);
    expect(child.authority).toEqual(authority);
    expect(child.argv).toContain('--spend-authority-hash');
    expect(child.argv).toContain(String(result.spendAuthorityHash));
    expect(child.argv).toContain('--spend-authority-caller');
    expect(child.argv).toContain(account.address.toLowerCase());
    expect(child.argv).toContain('--max-spend-usd');
    expect(child.argv).toContain(String(baseArgs.maxSpendUsd));
    expect(child.argv).toContain('--max-runtime-hours');
    expect(child.argv).toContain(String(baseArgs.maxRuntimeHours));
    expect(existsSync(child.authorityPath)).toBe(false);
  });

  it('returns null for an unknown tool name', async () => {
    const result = await handleFromScratchTool('not_a_from_scratch_tool', {});
    expect(result).toBeNull();
  });
});
