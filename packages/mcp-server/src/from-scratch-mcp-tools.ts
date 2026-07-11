/**
 * from-scratch-mcp-tools.ts — MCP tool surface for the LIBRARY-DRIVEN
 * from-scratch training lane (sovereign pretraining, anti-silo).
 *
 * Why this exists (mirrors holo-ci-tools.ts / holotune-mcp-tools.ts):
 *
 * The founder's directive: "anyone can HoloTune/Train their own from scratch — we
 * have a model library with planned models; runner is only one; we don't want to
 * silo potential." So from-scratch training is NOT a per-model launcher. Any
 * model-library entry (ai-ecosystem/model-library/library.json) with a
 * `holotune.from_scratch` block launches through the ONE governed CLI:
 *
 *     node scripts/train-from-scratch.mjs <status|launch> [--model <id>] ...
 *
 * The plan (library.json#training_plan) is one sovereign from-scratch BASE
 * (holorunner-s0) that use-case models SPRAWL from via fine-tune; every target is
 * trained BOTH from-scratch AND fine-tuned, then benchmarked (HOLO #9).
 *
 * ## Cross-repo dispatch (CRITICAL)
 *
 * `train-from-scratch.mjs` lives in the **ai-ecosystem** repo, not HoloScript.
 * The two are separate repos with no shared module path, so this tool SPAWNS the
 * CLI in the ai-ecosystem working tree instead of importing it. The tree is
 * resolved from `AI_ECOSYSTEM_ROOT` (the same env convention
 * tools/estimate_task_duration.ts already uses) → `~/.ai-ecosystem` by default.
 *
 * This tool is only useful on a **sovereign LOCAL MCP** that shares metal with the
 * ai-ecosystem checkout (R.027 — the remote Railway orchestrator is FS-blind).
 * When the resolved script is not present (e.g. remote deploy), the handler fails
 * HONESTLY with the fix (set AI_ECOSYSTEM_ROOT) rather than faking a result.
 *
 * ## Governance (mirrors holotune_launch / holo_ci_dispatch)
 *
 *  - `holo_from_scratch_status` — read-only, free. Lists every from_scratch-lane
 *    model + its free-first proof state. No spend, no gate.
 *  - `holo_from_scratch_launch` — SAFE-BY-DEFAULT: previews (dryRun) unless the
 *    caller passes apply:true. A non-dry launch additionally requires a signed
 *    spend-authority envelope from the same active HoloMesh seat as the signed
 *    MCP caller. The original authority is delegated to the CLI, which re-verifies
 *    and consumes it before spend; `--yes-spend` remains intent, not authority.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  canonicalizeBody,
  extractEnvelope,
  verifyEnvelope,
  type SignedEnvelope,
} from './holomesh/request-signing';
import {
  getAttestationRegistry,
  type SigningContext,
} from './holomesh/identity/signing-middleware';

const execFileAsync = promisify(execFile);

type JsonRecord = Record<string, unknown>;

const TOOL_NAMES = ['holo_from_scratch_status', 'holo_from_scratch_launch'] as const;
const FROM_SCRATCH_NAMES = new Set<string>(TOOL_NAMES);

export function isFromScratchToolName(name: string): boolean {
  return FROM_SCRATCH_NAMES.has(name);
}

// ─── ai-ecosystem cross-repo resolution ──────────────────────────────────────

/** Relative path (within the ai-ecosystem repo) of the library-driven CLI. */
const CLI_REL = join('scripts', 'train-from-scratch.mjs');

/**
 * Resolve the ai-ecosystem repo root. Same env convention as
 * tools/estimate_task_duration.ts (AI_ECOSYSTEM_ROOT) → ~/.ai-ecosystem default.
 * Returns the first candidate whose train-from-scratch.mjs exists, or null when
 * the server cannot reach an ai-ecosystem checkout (remote / FS-blind deploy).
 */
function resolveAiEcosystemCli(): { root: string; cli: string } | null {
  const candidates = [process.env.AI_ECOSYSTEM_ROOT, join(homedir(), '.ai-ecosystem')].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  for (const candidate of candidates) {
    const root = resolve(candidate);
    const cli = join(root, CLI_REL);
    if (existsSync(cli)) return { root, cli };
  }
  return null;
}

// ─── Governance helpers (mirror holotune-mcp-tools.ts) ───────────────────────

function stringArg(args: JsonRecord, key: string, fallback = ''): string {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function recordArg(args: JsonRecord, key: string): JsonRecord | null {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function hashPayload(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

const SPEND_AUTHORITY_CHALLENGE_PREFIX = '[from-scratch] spend authority challenge: ';
const MAX_SPEND_AUTHORITY_TTL_MS = 15 * 60 * 1000;

function parseJsonRecord(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : null;
  } catch {
    return null;
  }
}

function parseSpendAuthorityChallenge(stdout: string): JsonRecord | null {
  const direct = parseJsonRecord(stdout);
  if (direct) {
    return (
      recordArg(direct, 'spendAuthorityChallenge') ?? recordArg(direct, 'spend_authority_challenge')
    );
  }
  for (const line of stdout.split(/\r?\n/)) {
    const offset = line.indexOf(SPEND_AUTHORITY_CHALLENGE_PREFIX);
    if (offset < 0) continue;
    const challenge = parseJsonRecord(
      line.slice(offset + SPEND_AUTHORITY_CHALLENGE_PREFIX.length).trim()
    );
    if (challenge) return challenge;
  }
  return null;
}

function isDryRun(args: JsonRecord): boolean {
  if (args.apply === true) return false;
  return args.dryRun !== false;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SPEND_AUTHORITY_ENVELOPE_KEYS = [
  'body',
  'nonce',
  'signature',
  'signer_address',
  'timestamp',
] as const;
const SPEND_AUTHORITY_BODY_KEYS = [
  'action',
  'caller',
  'decision',
  'expiresAt',
  'freeFirstReceiptHash',
  'issuedAt',
  'laneManifestHash',
  'launcherConfigHash',
  'maxDph',
  'maxRuntimeHours',
  'maxSpendUsd',
  'model',
  'nonce',
  'rail',
  'receiptId',
  'runId',
  'schema',
] as const;

interface VerifiedSpendAuthority {
  envelope: SignedEnvelope;
  authorityHash: string;
  caller: string;
}

function isVerifiedSpendAuthority(
  value: VerifiedSpendAuthority | JsonRecord
): value is VerifiedSpendAuthority {
  return (
    'envelope' in value &&
    typeof value.envelope === 'object' &&
    value.envelope !== null &&
    typeof value.authorityHash === 'string' &&
    typeof value.caller === 'string'
  );
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function positiveNumberArg(args: JsonRecord, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function canonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function authorityError(reason: string): JsonRecord {
  return {
    ok: false,
    error: 'spend-authority-rejected',
    reason,
    spendAuthorityRequired: true,
  };
}

async function verifySpendAuthority(
  args: JsonRecord,
  signingCtx: SigningContext | undefined,
  nowMs: number = Date.now()
): Promise<VerifiedSpendAuthority | JsonRecord> {
  if (
    !signingCtx?.signedRequest ||
    signingCtx.signingValid !== true ||
    typeof signingCtx.signer !== 'string' ||
    !ADDRESS_RE.test(signingCtx.signer)
  ) {
    return authorityError('signed-mcp-caller-required');
  }

  const caller = normalizeAddress(signingCtx.signer);
  const registry = getAttestationRegistry();
  if (registry.size() === 0 || !registry.isAttested(caller, nowMs)) {
    return authorityError('caller-seat-not-active');
  }

  const authorityRecord = recordArg(args, 'spendAuthority');
  const envelope = extractEnvelope(authorityRecord);
  if (!envelope) return authorityError('signed-spend-authority-required');
  const envelopeKeys = Object.keys(authorityRecord as JsonRecord).sort();
  const expectedEnvelopeKeys = [...SPEND_AUTHORITY_ENVELOPE_KEYS].sort();
  if (
    envelopeKeys.length !== expectedEnvelopeKeys.length ||
    envelopeKeys.some((key, i) => key !== expectedEnvelopeKeys[i])
  ) {
    return authorityError('authority-envelope-shape-mismatch');
  }

  const verified = await verifyEnvelope(envelope, {
    nowMs,
    registryCheck: registry.toRegistryCheck(nowMs),
  });
  if (!verified.valid || !verified.signer) {
    return authorityError(`signature-${verified.reason ?? 'invalid'}`);
  }
  if (normalizeAddress(verified.signer) !== caller) {
    return authorityError('authority-signer-caller-mismatch');
  }

  const body =
    envelope.body && typeof envelope.body === 'object' && !Array.isArray(envelope.body)
      ? (envelope.body as JsonRecord)
      : null;
  if (!body) return authorityError('authority-body-required');
  const bodyKeys = Object.keys(body).sort();
  const expectedKeys = [...SPEND_AUTHORITY_BODY_KEYS].sort();
  if (
    bodyKeys.length !== expectedKeys.length ||
    bodyKeys.some((key, i) => key !== expectedKeys[i])
  ) {
    return authorityError('authority-body-shape-mismatch');
  }

  const requiredBindings: Array<[string, unknown]> = [
    ['schema', 'holo.spend-authority.v1'],
    ['rail', 'purchased_compute'],
    ['action', 'holo_from_scratch_launch'],
    ['decision', 'authorized'],
    ['caller', caller],
    ['model', stringArg(args, 'model')],
    ['runId', stringArg(args, 'runId')],
    ['maxDph', positiveNumberArg(args, 'maxDph')],
    ['maxSpendUsd', positiveNumberArg(args, 'maxSpendUsd')],
    ['maxRuntimeHours', positiveNumberArg(args, 'maxRuntimeHours')],
    ['launcherConfigHash', stringArg(args, 'launcherConfigHash')],
    ['laneManifestHash', stringArg(args, 'laneManifestHash')],
    ['freeFirstReceiptHash', stringArg(args, 'freeFirstReceiptHash')],
    ['issuedAt', envelope.timestamp],
    ['nonce', envelope.nonce],
  ];
  for (const [key, expected] of requiredBindings) {
    const actual =
      key === 'caller' && typeof body[key] === 'string'
        ? normalizeAddress(body[key] as string)
        : body[key];
    if (expected === null || expected === '' || actual !== expected) {
      return authorityError(`authority-${key}-mismatch`);
    }
  }

  if (!RECEIPT_ID_RE.test(String(body.receiptId ?? ''))) {
    return authorityError('authority-receiptId-invalid');
  }
  for (const key of ['launcherConfigHash', 'laneManifestHash', 'freeFirstReceiptHash']) {
    if (!SHA256_RE.test(String(body[key] ?? ''))) {
      return authorityError(`authority-${key}-invalid`);
    }
  }
  if (!canonicalIso(body.issuedAt) || !canonicalIso(body.expiresAt)) {
    return authorityError('authority-timestamp-invalid');
  }
  const issuedAtMs = Date.parse(body.issuedAt);
  const expiresAtMs = Date.parse(body.expiresAt);
  if (expiresAtMs <= nowMs) return authorityError('authority-expired');
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_SPEND_AUTHORITY_TTL_MS) {
    return authorityError('authority-expiry-window-invalid');
  }

  return {
    envelope,
    caller,
    authorityHash: `sha256:${createHash('sha256')
      .update(canonicalizeBody(envelope))
      .digest('hex')}`,
  };
}

async function withRestrictedAuthorityFile<T>(
  authority: SignedEnvelope,
  fn: (path: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'holo-spend-authority-'));
  const path = join(dir, 'authority.json');
  try {
    await chmod(dir, 0o700).catch(() => undefined);
    await writeFile(path, JSON.stringify(authority), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await chmod(path, 0o600).catch(() => undefined);
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ─── CLI dispatch ────────────────────────────────────────────────────────────

/** Validate a model id before it lands in an argv slot. */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

async function runCli(
  cli: string,
  root: string,
  argv: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...argv], {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      // Never inherit a shell — argv is passed verbatim to node, no interpolation.
      windowsHide: true,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? String(err),
      code: typeof e.code === 'number' ? e.code : null,
    };
  }
}

function unreachablePayload(tool: string): JsonRecord {
  return {
    ok: false,
    error: 'ai-ecosystem-unreachable',
    tool,
    message:
      'train-from-scratch.mjs was not found. This tool dispatches the from-scratch training CLI in the ai-ecosystem repo, ' +
      'which the remote (FS-blind) orchestrator cannot reach — run it on a sovereign LOCAL MCP that shares metal with the ' +
      'ai-ecosystem checkout (R.027).',
    fix: 'Set AI_ECOSYSTEM_ROOT to the ai-ecosystem repo root (must contain scripts/train-from-scratch.mjs), or run this MCP server locally where ~/.ai-ecosystem exists.',
    checked: [process.env.AI_ECOSYSTEM_ROOT || null, join(homedir(), '.ai-ecosystem')].filter(
      Boolean
    ),
  };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const fromScratchToolDefinitions: Tool[] = [
  {
    name: 'holo_from_scratch_status',
    description:
      'List every from-scratch-lane model in the ai-ecosystem model library (library.json entries with a holotune.from_scratch block) and its free-first-proof state. Read-only, FREE — no GPU spend, no gate. Dispatches `node scripts/train-from-scratch.mjs status` in the ai-ecosystem repo (resolved via AI_ECOSYSTEM_ROOT → ~/.ai-ecosystem). Sovereign-LOCAL-MCP only: the remote orchestrator is FS-blind and this fails honestly there.',
    inputSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description:
            'Optional model id to narrow the status to a single library entry (e.g. holorunner-s0).',
        },
      },
    },
  },
  {
    name: 'holo_from_scratch_launch',
    description:
      'Prepare or launch a library-driven from-scratch pretraining run for a model-library entry. SAFE-BY-DEFAULT: previews spend-free unless apply:true. An applied launch requires tools:admin plus a signed, active HoloMesh caller and a signed spendAuthority envelope bound to the exact run and active purchased-compute policy. The host CLI independently re-verifies and consumes that authority before spend. Sovereign-LOCAL-MCP only.',
    inputSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description:
            'Required for a launch — the from_scratch-lane model id (see holo_from_scratch_status; e.g. holorunner-s0).',
        },
        dryRun: {
          type: 'boolean',
          description:
            'Default TRUE (safe): build/return the delegated CLI plan WITHOUT spending. Pass dryRun:false (or apply:true) to actually launch.',
        },
        apply: {
          type: 'boolean',
          description:
            'Set true to request a real (non-dry) launch. Requires a signed spendAuthority and active registered HoloMesh caller.',
        },
        runId: {
          type: 'string',
          description:
            'Run id passed through to the CLI (--run-id). Required and signed for an applied launch.',
        },
        maxDph: {
          type: 'number',
          description:
            'Max dollars-per-hour bid ceiling. Required and signed for an applied launch.',
        },
        maxSpendUsd: {
          type: 'number',
          description:
            'Maximum total USD authorized for this run. Required and signed for an applied launch.',
        },
        maxRuntimeHours: {
          type: 'number',
          description:
            'Maximum runtime hours authorized for this run. Required and signed for an applied launch.',
        },
        launcherConfigHash: {
          type: 'string',
          description:
            'sha256 hash of the exact launcher configuration. Required and signed for an applied launch.',
        },
        laneManifestHash: {
          type: 'string',
          description:
            'sha256 hash of the purchased-compute lane manifest. Required and signed for an applied launch.',
        },
        freeFirstReceiptHash: {
          type: 'string',
          description:
            'sha256 hash of the free-first proof receipt. Required and signed for an applied launch.',
        },
        spendAuthority: {
          type: 'object',
          description:
            'EIP-191 envelope {body,signature,signer_address,nonce,timestamp}. Its holo.spend-authority.v1 body must bind the caller, model, run, ceilings, hashes, issuedAt, expiresAt, and nonce exactly.',
        },
      },
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function status(args: JsonRecord): Promise<JsonRecord> {
  const resolved = resolveAiEcosystemCli();
  if (!resolved) return unreachablePayload('holo_from_scratch_status');

  const model = stringArg(args, 'model');
  if (model && !MODEL_RE.test(model)) {
    return { ok: false, error: 'invalid-model-id', message: `unsafe model id "${model}"` };
  }
  const argv = ['status'];
  if (model) argv.push('--model', model);

  const res = await runCli(resolved.cli, resolved.root, argv);
  return {
    ok: res.ok,
    surface: 'from-scratch',
    aiEcosystemRoot: resolved.root,
    cli: `node ${CLI_REL} status${model ? ` --model ${model}` : ''}`,
    model: model || null,
    stdout: res.stdout,
    stderr: res.stderr || undefined,
    exitCode: res.code,
    governance: {
      readOnly: true,
      spend: false,
      note: 'status is free; applied launch requires signed seat authority within the active purchased-compute cap (SPEND.md)',
    },
  };
}

async function launch(args: JsonRecord, signingCtx?: SigningContext): Promise<JsonRecord> {
  const model = stringArg(args, 'model');
  if (!model) {
    return {
      ok: false,
      error: 'model-required',
      message: 'holo_from_scratch_launch requires a "model" id (see holo_from_scratch_status).',
    };
  }
  if (!MODEL_RE.test(model)) {
    return { ok: false, error: 'invalid-model-id', message: `unsafe model id "${model}"` };
  }

  const dryRun = isDryRun(args);

  // Build the delegated argv from typed inputs (never string-concatenate into a shell).
  const cliArgv = ['launch', '--model', model];
  const runId = stringArg(args, 'runId');
  if (runId) {
    if (!MODEL_RE.test(runId)) {
      return { ok: false, error: 'invalid-run-id', message: `unsafe runId "${runId}"` };
    }
    cliArgv.push('--run-id', runId);
  }
  const maxDph = positiveNumberArg(args, 'maxDph');
  if (maxDph !== null) {
    cliArgv.push('--max-dph', String(maxDph));
  }
  const maxSpendUsd = positiveNumberArg(args, 'maxSpendUsd');
  if (maxSpendUsd !== null) {
    cliArgv.push('--max-spend-usd', String(maxSpendUsd));
  }
  const maxRuntimeHours = positiveNumberArg(args, 'maxRuntimeHours');
  if (maxRuntimeHours !== null) {
    cliArgv.push('--max-runtime-hours', String(maxRuntimeHours));
  }

  const previewArgv = dryRun ? [...cliArgv, '--json'] : cliArgv;
  const previewCommand = `node ${CLI_REL} ${previewArgv.join(' ')}${dryRun ? '' : ' --apply --yes-spend'}`;

  if (dryRun) {
    const resolved = resolveAiEcosystemCli();
    if (!resolved) return unreachablePayload('holo_from_scratch_launch');
    // Preview by running the CLI in its own dry-run mode (no --apply) — free, no spend.
    const res = await runCli(resolved.cli, resolved.root, previewArgv);
    const spendAuthorityChallenge = parseSpendAuthorityChallenge(res.stdout);
    const payload: JsonRecord = {
      model,
      dryRun: true,
      aiEcosystemRoot: resolved.root,
      previewCommand,
      stdout: res.stdout,
      stderr: res.stderr || undefined,
      exitCode: res.code,
      callerAuthed: Boolean(signingCtx?.signedRequest && signingCtx.signingValid),
      spendAuthorityChallenge: spendAuthorityChallenge ?? undefined,
    };
    return {
      ok: res.ok,
      ...payload,
      spendIntent: false,
      receipt: {
        schema: 'holo.from-scratch.mcp-operation-receipt.v1',
        action: 'launch',
        generatedAt: new Date().toISOString(),
        ...payload,
        receiptHash: hashPayload(payload),
      },
    };
  }

  const authority = await verifySpendAuthority(args, signingCtx);
  if (!isVerifiedSpendAuthority(authority)) {
    return {
      ...authority,
      model,
      previewCommand,
      spendIntent: false,
      message:
        'Applied from-scratch launch requires a signed spend authority from the same active HoloMesh seat as the signed MCP request. Re-run with dryRun:true to preview.',
    };
  }

  const resolved = resolveAiEcosystemCli();
  if (!resolved) return unreachablePayload('holo_from_scratch_launch');

  // Preserve the original signed envelope across the process boundary. The host
  // re-verifies and atomically consumes it; --yes-spend is intent, not authority.
  const res = await withRestrictedAuthorityFile(authority.envelope, (authorityPath) =>
    runCli(resolved.cli, resolved.root, [
      ...cliArgv,
      '--apply',
      '--yes-spend',
      '--spend-authority-file',
      authorityPath,
      '--spend-authority-hash',
      authority.authorityHash,
      '--spend-authority-caller',
      authority.caller,
    ])
  );
  const payload: JsonRecord = {
    model,
    dryRun: false,
    aiEcosystemRoot: resolved.root,
    previewCommand,
    spendAuthorityHash: authority.authorityHash,
    spendAuthorityCaller: authority.caller,
    callerAuthed: true,
    stdout: res.stdout,
    stderr: res.stderr || undefined,
    exitCode: res.code,
  };
  return {
    ok: res.ok,
    ...payload,
    spendIntent: true,
    spendGovernedBy:
      'ai-ecosystem/scripts/train-from-scratch.mjs (signed seat authority + free-first proof + live purchased-compute cap enforced host-side)',
    receipt: {
      schema: 'holo.from-scratch.mcp-operation-receipt.v1',
      action: 'launch',
      generatedAt: new Date().toISOString(),
      ...payload,
      receiptHash: hashPayload(payload),
    },
  };
}

/**
 * Handle from-scratch tool calls.
 *
 * @param signingCtx Verified MCP request identity, threaded from index.ts. Applied
 *   launch requires a signed active seat; unsigned/stdio callers remain preview-only.
 */
export async function handleFromScratchTool(
  name: string,
  args: JsonRecord,
  signingCtx?: SigningContext
): Promise<unknown | null> {
  switch (name) {
    case 'holo_from_scratch_status':
      return status(args);
    case 'holo_from_scratch_launch':
      return launch(args, signingCtx);
    default:
      return null;
  }
}
