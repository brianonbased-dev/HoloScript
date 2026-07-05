/**
 * HoloTune MCP tools.
 *
 * This is the agent-facing control surface for the sovereign per-identity
 * trace -> corpus -> tune -> eval -> promote -> serve/download loop. The MCP
 * server does not hold the founder's local filesystem or GPU credentials, so
 * these handlers provide safe contracts, receipts, and gate checks. The local
 * ai-ecosystem CLI performs the host-specific file and fleet operations.
 */

import { createHash } from 'node:crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

type JsonRecord = Record<string, unknown>;
type HoloTuneCommand =
  | 'status'
  | 'curate'
  | 'launch'
  | 'eval'
  | 'promote'
  | 'serve'
  | 'download';

const HOLOTUNE_COMMANDS: HoloTuneCommand[] = [
  'status',
  'curate',
  'launch',
  'eval',
  'promote',
  'serve',
  'download',
];

const TOOL_NAMES = HOLOTUNE_COMMANDS.map((command) => `holotune_${command}`);

export const holotuneToolDefinitions: Tool[] = [
  {
    name: 'holotune_status',
    description:
      'Inspect the HoloTune operation surface and return the safe local CLI/MCP contract for per-agent tuning.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string', description: 'Optional agent or daimon identity.' },
      },
    },
  },
  {
    name: 'holotune_curate',
    description:
      'Curate trace rows into HoloTune SFT JSONL and return a content hash. No GPU spend.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string', description: 'Identity that owns the traces.' },
        traceRows: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional inline rows with {system,user,target}.',
        },
        maxRows: { type: 'number', description: 'Maximum rows to include.' },
        includeJsonl: { type: 'boolean', description: 'Include JSONL in the response.' },
      },
    },
  },
  {
    name: 'holotune_launch',
    description:
      'Prepare or launch a HoloTune GPU training run. Safe-by-default: dryRun unless dryRun:false/apply:true; non-dry launch requires a founderGate receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string' },
        corpusHash: { type: 'string' },
        corpusUri: { type: 'string' },
        recipe: { type: 'string' },
        gpuBudgetUsd: { type: 'number' },
        dryRun: { type: 'boolean' },
        apply: { type: 'boolean' },
        founderGate: {
          type: 'object',
          description:
            'Founder-gate receipt summary. Accepts manifestHash plus approved:true/valid:true.',
        },
      },
    },
  },
  {
    name: 'holotune_eval',
    description:
      'Evaluate tuned metrics against baseline metrics and return a promotion gate receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string' },
        baselineMetrics: { type: 'object' },
        tunedMetrics: { type: 'object' },
        requiredBenchmarks: { type: 'array', items: { type: 'string' } },
        minImproved: { type: 'number' },
        improvementThreshold: { type: 'number' },
      },
    },
  },
  {
    name: 'holotune_promote',
    description:
      'Prepare or apply a versioned adapter promotion. Non-dry promote-to-serve requires a founderGate receipt and returns a rollback pointer.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string' },
        version: { type: 'string' },
        adapterUri: { type: 'string' },
        ggufUri: { type: 'string' },
        previousVersion: { type: 'string' },
        evalReceipt: { type: 'object' },
        dryRun: { type: 'boolean' },
        apply: { type: 'boolean' },
        founderGate: { type: 'object' },
      },
    },
  },
  {
    name: 'holotune_serve',
    description:
      'Resolve the active HoloTune adapter into a serving plan, including a native @llama_serve spec (compile with compile_to_llama_server). Does not mutate serving state.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string' },
        version: { type: 'string' },
        adapterUri: { type: 'string' },
        ggufUri: { type: 'string' },
        loraGgufUri: {
          type: 'string',
          description:
            'A llama.cpp LoRA .gguf (from holotune-gguf-convert) for the @llama_serve.lora hot-swap slot — distinct from the PEFT adapterUri directory.',
        },
      },
    },
  },
  {
    name: 'holotune_download',
    description:
      'Build a downloadable sovereign GGUF manifest for an active HoloTune adapter. Fails honestly when no GGUF URI is registered.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string' },
        version: { type: 'string' },
        ggufUri: { type: 'string' },
        artifactUri: { type: 'string' },
      },
    },
  },
];

const HOLOTUNE_NAMES = new Set(TOOL_NAMES);

export function isHoloTuneToolName(name: string): boolean {
  return HOLOTUNE_NAMES.has(name);
}

function stringArg(args: JsonRecord, key: string, fallback = ''): string {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberArg(args: JsonRecord, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArrayArg(args: JsonRecord, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
}

function recordArg(args: JsonRecord, key: string): JsonRecord | null {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function hashPayload(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function stableVersion(identity: string): string {
  return `${identity || 'agent'}-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, '').slice(0, 14)}`;
}

function operationReceipt(action: HoloTuneCommand, payload: JsonRecord): JsonRecord {
  const base = {
    schema: 'holotune.operation-receipt.v1',
    action,
    generatedAt: new Date().toISOString(),
    ...payload,
  };
  return { ...base, receiptHash: hashPayload(base) };
}

function founderGateSummary(args: JsonRecord): JsonRecord {
  const gate =
    recordArg(args, 'founderGate') ??
    recordArg(args, 'founderGateReceipt') ??
    recordArg(args, 'founder_gate');
  if (!gate) {
    return {
      present: false,
      valid: false,
      reason: 'missing founderGate receipt',
    };
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
    reason: valid ? 'founder gate receipt present' : 'founderGate needs manifestHash and approved:true',
  };
}

function isDryRun(args: JsonRecord): boolean {
  if (args.apply === true) return false;
  return args.dryRun !== false;
}

function metricValue(metrics: JsonRecord, key: string): number | null {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function relativeImprovement(baseline: number, tuned: number): number {
  if (baseline === 0) return tuned > 0 ? Infinity : 0;
  return (tuned - baseline) / Math.abs(baseline);
}

function status(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'all');
  return {
    ok: true,
    surface: 'holotune',
    identity,
    mcpTools: TOOL_NAMES,
    localCli: 'node scripts/holotune.mjs <status|curate|launch|eval|promote|serve|download>',
    stateRootHint: '~/.ai-ecosystem/holotune',
    governance: {
      safeByDefault: true,
      gpuSpendRequiresFounderGate: true,
      promoteToServeRequiresFounderGate: true,
      receipts: 'immutable operation receipts with sha256 hashes',
      rollback: 'versioned adapter registry keeps previousVersion for instant rollback',
    },
  };
}

function curate(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'all');
  const maxRows = Math.max(0, Math.floor(numberArg(args, 'maxRows', 10_000)));
  const rawRows = Array.isArray(args.traceRows) ? args.traceRows : [];
  const rows = rawRows
    .filter((row): row is JsonRecord => row !== null && typeof row === 'object' && !Array.isArray(row))
    .filter((row) => typeof row.user === 'string' && typeof row.target === 'string')
    .slice(0, maxRows)
    .map((row) => ({
      system: typeof row.system === 'string' ? row.system : '',
      user: row.user,
      target: row.target,
      source: typeof row.source === 'string' ? row.source : 'mcp-inline-trace',
      agentId: typeof row.agentId === 'string' ? row.agentId : identity,
    }));
  const jsonl = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  return {
    ok: true,
    identity,
    curatedCount: rows.length,
    skippedCount: rawRows.length - rows.length,
    corpusHash: hashPayload(jsonl || `${identity}:empty-corpus`),
    jsonl: args.includeJsonl === true ? jsonl : undefined,
  };
}

function launch(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'unknown-agent');
  const dryRun = isDryRun(args);
  const gate = founderGateSummary(args);
  if (!dryRun && gate.valid !== true) {
    return {
      ok: false,
      error: 'founder-gate-required',
      founderGateRequired: true,
      founderGate: gate,
      message: 'Non-dry HoloTune GPU launch is blocked until a valid founderGate receipt is supplied.',
    };
  }

  const payload = {
    identity,
    dryRun,
    corpusHash: stringArg(args, 'corpusHash') || null,
    corpusUri: stringArg(args, 'corpusUri') || null,
    recipe: stringArg(args, 'recipe', 'datasets/lora-recipe.py'),
    gpuBudgetUsd: numberArg(args, 'gpuBudgetUsd', 0),
    founderGate: gate,
  };

  return {
    ok: true,
    ...payload,
    spendIntent: !dryRun,
    command:
      'node scripts/holotune.mjs launch --identity <id> --corpus <jsonl> --dry-run',
    receipt: operationReceipt('launch', payload),
  };
}

function evalGate(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'unknown-agent');
  const baseline = recordArg(args, 'baselineMetrics') ?? {};
  const tuned = recordArg(args, 'tunedMetrics') ?? {};
  const required = stringArrayArg(args, 'requiredBenchmarks');
  const keys =
    required.length > 0
      ? required
      : Object.keys(baseline).filter((key) => metricValue(tuned, key) !== null);
  const threshold = numberArg(args, 'improvementThreshold', 0.05);
  const minImproved = Math.max(0, Math.floor(numberArg(args, 'minImproved', keys.length ? 1 : 0)));
  const benchmarks = keys.map((key) => {
    const baselineValue = metricValue(baseline, key);
    const tunedValue = metricValue(tuned, key);
    const improvement =
      baselineValue === null || tunedValue === null
        ? null
        : relativeImprovement(baselineValue, tunedValue);
    return {
      id: key,
      baseline: baselineValue,
      tuned: tunedValue,
      improvement,
      improved: improvement !== null && improvement >= threshold,
    };
  });
  const improvedCount = benchmarks.filter((benchmark) => benchmark.improved).length;
  const passed = improvedCount >= minImproved;
  const payload = { identity, threshold, minImproved, improvedCount, passed, benchmarks };
  return {
    ok: true,
    ...payload,
    receipt: operationReceipt('eval', payload),
  };
}

function promote(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'unknown-agent');
  const dryRun = isDryRun(args);
  const adapterUri = stringArg(args, 'adapterUri');
  const ggufUri = stringArg(args, 'ggufUri');
  const version = stringArg(args, 'version', stableVersion(identity));
  const gate = founderGateSummary(args);
  if (!dryRun && gate.valid !== true) {
    return {
      ok: false,
      error: 'founder-gate-required',
      founderGateRequired: true,
      founderGate: gate,
      message: 'Promote-to-serve is blocked until a valid founderGate receipt is supplied.',
    };
  }
  if (!dryRun && !adapterUri) {
    return {
      ok: false,
      error: 'adapter-uri-required',
      message: 'Non-dry promotion requires adapterUri.',
    };
  }

  const payload = {
    identity,
    dryRun,
    version,
    adapterUri: adapterUri || null,
    ggufUri: ggufUri || null,
    previousVersion: stringArg(args, 'previousVersion') || null,
    downloadable: ggufUri.length > 0,
    evalReceipt: recordArg(args, 'evalReceipt'),
    founderGate: gate,
  };

  return {
    ok: true,
    ...payload,
    rollbackPointer: payload.previousVersion,
    receipt: operationReceipt('promote', payload),
  };
}

/** Sanitize an id segment into a sovereign-devices registry handle fragment. */
function serveHandleSegment(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'adapter';
}

/**
 * Render the native `@llama_serve { ... }` block a caller can drop into a `.holo`
 * and compile with `compile_to_llama_server`. This is the M5 seam: HoloTune no
 * longer hands back a bare CLI string — it hands back authorable HoloScript that
 * the sovereign llama.cpp compiler consumes, and it wires the `grammar: "holoscript"`
 * constrained-decode preset so the served adapter emits valid HoloScript by construction.
 */
function buildLlamaServeSnippet(spec: {
  handle: string;
  model: string;
  gguf: string | null;
  lora: string | null;
}): string {
  // Escape values interpolated into double-quoted HoloScript fields: collapse newlines
  // and backslash-escape inner quotes (the lexer accepts \" ), so a stray quote in a URI
  // can't terminate the string early and emit an unparseable @llama_serve block.
  const esc = (v: string): string => v.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines = ['@llama_serve {', `  model: "${esc(spec.model)}"`];
  if (spec.gguf) lines.push(`  gguf: "${esc(spec.gguf)}"`);
  if (spec.lora) lines.push(`  lora: "${esc(spec.lora)}"`);
  lines.push(`  register_as: "${esc(spec.handle)}"`, '  grammar: "holoscript"', '}');
  return lines.join('\n');
}

function serve(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'unknown-agent');
  const adapterUri = stringArg(args, 'adapterUri');
  const ggufUri = stringArg(args, 'ggufUri');
  const loraGgufUri = stringArg(args, 'loraGgufUri');
  const version = stringArg(args, 'version', 'active');
  const serveReady = Boolean(adapterUri || ggufUri);

  // The LoRA slot for a real llama.cpp hot-serve must be a .gguf adapter (produced by
  // holotune-gguf-convert.mjs), NOT the PEFT adapter directory (adapterUri). Prefer an
  // explicit loraGgufUri; accept adapterUri only when it already points at a .gguf.
  const loraPath = loraGgufUri || (adapterUri.endsWith('.gguf') ? adapterUri : null);
  const handle = `${serveHandleSegment(identity)}-${serveHandleSegment(version)}`;
  const llamaServe =
    ggufUri || loraPath
      ? {
          schema: 'holotune.llama-serve.v1',
          handle,
          model: `${identity}:${version}`,
          gguf: ggufUri || null,
          lora: loraPath,
          source: 'holotune' as const,
        }
      : null;

  return {
    ok: true,
    identity,
    version,
    serveReady,
    adapterUri: adapterUri || null,
    ggufUri: ggufUri || null,
    loraGgufUri: loraGgufUri || null,
    // Native @llama_serve spec (compile with target 'llama-server') + its authorable block.
    llamaServe,
    llamaServeHsplus: llamaServe ? buildLlamaServeSnippet(llamaServe) : null,
    command: serveReady
      ? 'node scripts/holotune.mjs serve --identity <id>'
      : 'register an adapter with holotune_promote before serving',
    receipt: operationReceipt('serve', {
      identity,
      version,
      serveReady,
      adapterUri,
      ggufUri,
      loraGgufUri,
    }),
  };
}

function download(args: JsonRecord): JsonRecord {
  const identity = stringArg(args, 'identity', 'unknown-agent');
  const version = stringArg(args, 'version', 'active');
  const ggufUri = stringArg(args, 'ggufUri') || stringArg(args, 'artifactUri');
  if (!ggufUri) {
    return {
      ok: false,
      downloadable: false,
      error: 'gguf-artifact-required',
      message:
        'No GGUF artifact is registered for this adapter. Promote a version with ggufUri before download.',
    };
  }

  const manifest = {
    schema: 'holotune.download-manifest.v1',
    identity,
    version,
    ggufUri,
    generatedAt: new Date().toISOString(),
  };

  return {
    ok: true,
    downloadable: true,
    manifest: { ...manifest, manifestHash: hashPayload(manifest) },
    receipt: operationReceipt('download', { identity, version, ggufUri }),
  };
}

export async function handleHoloTuneTool(
  name: string,
  args: JsonRecord
): Promise<unknown | null> {
  switch (name) {
    case 'holotune_status':
      return status(args);
    case 'holotune_curate':
      return curate(args);
    case 'holotune_launch':
      return launch(args);
    case 'holotune_eval':
      return evalGate(args);
    case 'holotune_promote':
      return promote(args);
    case 'holotune_serve':
      return serve(args);
    case 'holotune_download':
      return download(args);
    default:
      return null;
  }
}
