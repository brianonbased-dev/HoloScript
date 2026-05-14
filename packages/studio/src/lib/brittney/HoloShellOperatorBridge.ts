import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const HOLOSHELL_OPERATOR_TRANSPORT = 'holoshell';
export const HOLOSHELL_OPERATOR_SCRIPT = path.join('scripts', 'holoshell-brittney-turn.mjs');
export const HOLOSHELL_OPERATOR_SPEC = 'apps/holoshell/docs/BRITTNEY_OPERATOR_SPEC.md';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ITERATIONS = 3;
const MAX_CONTEXT_CHARS = 2_000;

export interface HoloShellOperatorConfig {
  requested: boolean;
  enabled: boolean;
  reason: string;
  hololandRoot: string;
  holoscriptRoot: string;
  scriptPath: string;
  timeoutMs: number;
  maxIterations: number;
}

export interface HoloShellActionProposal {
  id: string;
  objectId: string;
  label: string;
  operation: string;
  permissionEnvelope: string;
  mutating: boolean;
  approvalRequired: boolean;
  receiptRequired: boolean;
  reason: string;
}

export interface HoloShellBrittneyTurnReceipt {
  schemaVersion: string;
  turnId: string;
  generatedAt: string;
  prompt: string;
  sourceAnchors: {
    source: string;
    bridgeScript: string;
    holoscriptRoot: string;
    [key: string]: unknown;
  };
  proposals: HoloShellActionProposal[];
  result: {
    ok: boolean;
    finalText: string;
    rawFinalText?: string;
    error?: string;
    [key: string]: unknown;
  };
  receipt: {
    id: string;
    receiptType: string;
    actor: string;
    route: string;
    source: string;
    worldEffect: string;
    [key: string]: unknown;
  };
  summary: {
    status: string;
    runtimeStatus: string;
    eventCount: number;
    actionProposalCount: number;
    [key: string]: unknown;
  };
}

export function resolveHoloShellOperatorConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): HoloShellOperatorConfig {
  const requested =
    env.BRITTNEY_OPERATOR_TRANSPORT === HOLOSHELL_OPERATOR_TRANSPORT ||
    env.BRITTNEY_USE_HOLOSHELL_OPERATOR === '1';
  const hololandRoot = resolveExistingRoot(
    [env.HOLOLAND_REPO, env.HOLOLAND_ROOT, findSiblingRepo(cwd, 'Hololand')],
    cwd
  );
  const holoscriptRoot = resolveExistingRoot(
    [env.HOLOSCRIPT_REPO, env.HOLOSCRIPT_ROOT, findSiblingRepo(cwd, 'HoloScript')],
    cwd
  );
  const scriptPath = path.join(hololandRoot, HOLOSHELL_OPERATOR_SCRIPT);
  const timeoutMs = Number(env.BRITTNEY_OPERATOR_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const maxIterations = Number(env.BRITTNEY_OPERATOR_MAX_ITERATIONS) || DEFAULT_MAX_ITERATIONS;

  if (!requested) {
    return {
      requested,
      enabled: false,
      reason: 'BRITTNEY_OPERATOR_TRANSPORT is not set to holoshell',
      hololandRoot,
      holoscriptRoot,
      scriptPath,
      timeoutMs,
      maxIterations,
    };
  }

  if (!existsSync(scriptPath)) {
    return {
      requested,
      enabled: false,
      reason: `HoloShell Brittney operator runner not found at ${scriptPath}`,
      hololandRoot,
      holoscriptRoot,
      scriptPath,
      timeoutMs,
      maxIterations,
    };
  }

  return {
    requested,
    enabled: true,
    reason: 'HoloShell Brittney operator runner available',
    hololandRoot,
    holoscriptRoot,
    scriptPath,
    timeoutMs,
    maxIterations,
  };
}

export function buildStudioOperatorPrompt(
  userPrompt: string,
  sceneContext?: string | null
): string {
  const trimmedPrompt = userPrompt.trim();
  const redactedSceneContext = redactLocalDetails(sceneContext ?? '').slice(0, MAX_CONTEXT_CHARS);
  const contextBlock = redactedSceneContext
    ? `\n\nStudio creator-room context (read-only):\n${redactedSceneContext}`
    : '';
  return `Studio is invoking the HoloShell Brittney operator for a creator-room turn.
Do not invent a Studio-only operator. Use the HoloShell operator loop, permission envelopes, action proposals, and receipts.

User intent:
${trimmedPrompt || 'No user prompt supplied.'}${contextBlock}`;
}

export async function runHoloShellOperatorTurn(
  prompt: string,
  sceneContext?: string | null,
  config = resolveHoloShellOperatorConfig()
): Promise<HoloShellBrittneyTurnReceipt> {
  if (!config.enabled) {
    throw new Error(config.reason);
  }

  const operatorPrompt = buildStudioOperatorPrompt(prompt, sceneContext);
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      config.scriptPath,
      '--prompt',
      operatorPrompt,
      '--json',
      '--holoscript-root',
      config.holoscriptRoot,
      '--timeout-ms',
      String(config.timeoutMs),
      '--max-iterations',
      String(config.maxIterations),
      '--turns-dir',
      path.join('.tmp', 'holoshell', 'studio-brittney-turns'),
      '--latest-output',
      path.join('.tmp', 'holoshell', 'studio-brittney-turn-latest.json'),
      '--js-output',
      path.join('.tmp', 'holoshell', 'studio-brittney-turn-latest.js'),
    ],
    {
      cwd: config.hololandRoot,
      timeout: config.timeoutMs + 5_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        HOLOSCRIPT_REPO: config.holoscriptRoot,
      },
    }
  );

  return parseHoloShellOperatorReceipt(stdout);
}

export function parseHoloShellOperatorReceipt(stdout: string): HoloShellBrittneyTurnReceipt {
  const receipt = JSON.parse(stdout) as Partial<HoloShellBrittneyTurnReceipt>;
  if (
    !receipt ||
    typeof receipt.schemaVersion !== 'string' ||
    !receipt.schemaVersion.includes('hololand.holoshell.brittney-turn') ||
    typeof receipt.turnId !== 'string' ||
    !receipt.result ||
    typeof receipt.result.finalText !== 'string' ||
    !receipt.summary ||
    typeof receipt.summary.status !== 'string'
  ) {
    throw new Error('HoloShell operator runner returned an invalid turn receipt');
  }
  return receipt as HoloShellBrittneyTurnReceipt;
}

export function summarizeHoloShellOperatorReceipt(receipt: HoloShellBrittneyTurnReceipt) {
  return {
    source: 'holoshell',
    schemaVersion: receipt.schemaVersion,
    turnId: receipt.turnId,
    receiptId: receipt.receipt.id,
    status: receipt.summary.status,
    runtimeStatus: receipt.summary.runtimeStatus,
    eventCount: receipt.summary.eventCount,
    actionProposalCount: receipt.summary.actionProposalCount,
    proposals: receipt.proposals.map((proposal) => ({
      id: proposal.id,
      objectId: proposal.objectId,
      operation: proposal.operation,
      permissionEnvelope: proposal.permissionEnvelope,
      approvalRequired: proposal.approvalRequired,
      receiptRequired: proposal.receiptRequired,
    })),
    sourceAnchors: {
      operatorSpec: HOLOSHELL_OPERATOR_SPEC,
      bridgeScript: HOLOSHELL_OPERATOR_SCRIPT,
      runtimeSource: receipt.sourceAnchors.source,
    },
  };
}

function resolveExistingRoot(candidates: Array<string | undefined | null>, cwd: string): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(cwd, candidate);
    if (existsSync(resolved)) return resolved;
  }
  return path.resolve(cwd);
}

function findSiblingRepo(start: string, repoName: string): string | null {
  let cursor = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(cursor, repoName);
    if (existsSync(candidate)) return candidate;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  return null;
}

function redactLocalDetails(text: string): string {
  return text
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, '[user-home]')
    .replace(/\/Users\/[^/\s]+/g, '[user-home]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-***');
}
