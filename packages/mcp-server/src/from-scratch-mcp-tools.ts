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
 *    caller passes apply:true. A non-dry launch additionally requires a valid
 *    founderGate receipt (GPU spend is founder-gated, F.032 / SPEND.md), and even
 *    then only delegates `--apply --yes-spend` to the CLI, which enforces its OWN
 *    founder-gate + free-first-proof-required governance host-side. Two gates: the
 *    MCP boundary gate here, and the script's local gate.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

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

function isDryRun(args: JsonRecord): boolean {
  if (args.apply === true) return false;
  return args.dryRun !== false;
}

/** Founder-gate receipt summary — same acceptance shape as holotune_launch. */
function founderGateSummary(args: JsonRecord): JsonRecord {
  const gate =
    recordArg(args, 'founderGate') ??
    recordArg(args, 'founderGateReceipt') ??
    recordArg(args, 'founder_gate');
  if (!gate) {
    return { present: false, valid: false, reason: 'missing founderGate receipt' };
  }
  const manifestHash =
    typeof gate.manifestHash === 'string'
      ? gate.manifestHash
      : typeof gate.hash === 'string'
        ? gate.hash
        : typeof gate.receiptHash === 'string'
          ? gate.receiptHash
          : '';
  const approved = gate.approved === true || gate.valid === true || gate.status === 'approved';
  const valid = approved && manifestHash.length > 0;
  return {
    present: true,
    valid,
    manifestHash: manifestHash || null,
    reviewer: typeof gate.reviewer === 'string' ? gate.reviewer : null,
    reason: valid
      ? 'founder gate receipt present'
      : 'founderGate needs manifestHash and approved:true',
  };
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
          description: 'Optional model id to narrow the status to a single library entry (e.g. holorunner-s0).',
        },
      },
    },
  },
  {
    name: 'holo_from_scratch_launch',
    description:
      'Prepare or launch a library-driven from-scratch pretraining run for a model-library entry. SAFE-BY-DEFAULT: previews the delegated CLI plan (dryRun) and spends nothing unless you pass apply:true AND a valid founderGate receipt. A non-dry launch delegates `--apply --yes-spend` to `node scripts/train-from-scratch.mjs launch` in the ai-ecosystem repo, which enforces its OWN founder-gate + free-first-proof-required governance host-side (two gates). GPU spend is founder-gated (SPEND.md). Sovereign-LOCAL-MCP only.',
    inputSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Required for a launch — the from_scratch-lane model id (see holo_from_scratch_status; e.g. holorunner-s0).',
        },
        dryRun: {
          type: 'boolean',
          description: 'Default TRUE (safe): build/return the delegated CLI plan WITHOUT spending. Pass dryRun:false (or apply:true) to actually launch.',
        },
        apply: {
          type: 'boolean',
          description: 'Set true to request a real (non-dry) launch. Also requires a valid founderGate receipt; without one the launch is blocked.',
        },
        runId: {
          type: 'string',
          description: 'Optional run id passed through to the CLI (--run-id). Defaults to a CLI-generated id.',
        },
        maxDph: {
          type: 'number',
          description: 'Optional max dollars-per-hour bid ceiling passed through to the CLI (--max-dph). Defaults to the CLI default (0.35).',
        },
        founderGate: {
          type: 'object',
          description:
            'Founder-gate receipt summary required for a non-dry launch. Accepts manifestHash (or hash/receiptHash) plus approved:true / valid:true / status:"approved".',
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
      note: 'status is free; launch is founder-gated for GPU spend (SPEND.md)',
    },
  };
}

async function launch(args: JsonRecord, callerToken?: string): Promise<JsonRecord> {
  const resolved = resolveAiEcosystemCli();
  if (!resolved) return unreachablePayload('holo_from_scratch_launch');

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
  const gate = founderGateSummary(args);

  // Build the delegated argv from typed inputs (never string-concatenate into a shell).
  const cliArgv = ['launch', '--model', model];
  const runId = stringArg(args, 'runId');
  if (runId) {
    if (!MODEL_RE.test(runId)) {
      return { ok: false, error: 'invalid-run-id', message: `unsafe runId "${runId}"` };
    }
    cliArgv.push('--run-id', runId);
  }
  const maxDph = args.maxDph;
  if (typeof maxDph === 'number' && Number.isFinite(maxDph) && maxDph > 0) {
    cliArgv.push('--max-dph', String(maxDph));
  }

  const previewCommand = `node ${CLI_REL} ${cliArgv.join(' ')}${dryRun ? '' : ' --apply --yes-spend'}`;

  // ── MCP-boundary founder-gate (non-dry only). The CLI ALSO enforces its own
  //    founder-gate + free-first proof host-side; this is the outer gate. ──
  if (!dryRun && gate.valid !== true) {
    return {
      ok: false,
      error: 'founder-gate-required',
      founderGateRequired: true,
      founderGate: gate,
      model,
      previewCommand,
      message:
        'Non-dry from-scratch GPU launch is blocked until a valid founderGate receipt is supplied. GPU spend is founder-gated (SPEND.md). Re-run with dryRun:true to preview.',
    };
  }

  if (dryRun) {
    // Preview by running the CLI in its own dry-run mode (no --apply) — free, no spend.
    const res = await runCli(resolved.cli, resolved.root, cliArgv);
    const payload: JsonRecord = {
      model,
      dryRun: true,
      aiEcosystemRoot: resolved.root,
      previewCommand,
      stdout: res.stdout,
      stderr: res.stderr || undefined,
      exitCode: res.code,
      callerAuthed: Boolean(callerToken),
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

  // Non-dry, founder-gated: delegate the real launch. The CLI runs its own
  // free-first-proof + founder-gate checks and only spends if they pass.
  const res = await runCli(resolved.cli, resolved.root, [...cliArgv, '--apply', '--yes-spend']);
  const payload: JsonRecord = {
    model,
    dryRun: false,
    aiEcosystemRoot: resolved.root,
    previewCommand,
    founderGate: gate,
    callerAuthed: Boolean(callerToken),
    stdout: res.stdout,
    stderr: res.stderr || undefined,
    exitCode: res.code,
  };
  return {
    ok: res.ok,
    ...payload,
    spendIntent: true,
    spendGovernedBy: 'ai-ecosystem/scripts/train-from-scratch.mjs (free-first proof + founder-gate enforced host-side)',
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
 * @param callerToken Raw bearer/signer identity, threaded from the signed request
 *   envelope in index.ts. Used only as a governance breadcrumb on launch payloads;
 *   the authoritative spend gate is the founderGate receipt + the host-side CLI gate.
 */
export async function handleFromScratchTool(
  name: string,
  args: JsonRecord,
  callerToken?: string
): Promise<unknown | null> {
  switch (name) {
    case 'holo_from_scratch_status':
      return status(args);
    case 'holo_from_scratch_launch':
      return launch(args, callerToken);
    default:
      return null;
  }
}
