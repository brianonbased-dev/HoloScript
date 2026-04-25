import { createHash } from 'node:crypto';
import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMProviderName,
  TokenUsage,
} from '@holoscript/llm-provider';
import type { CostGuard } from './cost-guard.js';
import type { AuditLog } from './audit-log.js';
import type { AgentIdentity } from './types.js';

export interface AblationProviderSpec {
  label: string;
  provider: LLMProviderName;
  model: string;
  build: () => Promise<ILLMProvider> | ILLMProvider;
  pricer?: (usage: TokenUsage) => number;
}

export interface AblationTaskSpec {
  taskId: string;
  taskTitle: string;
  systemPrompt: string;
  userPrompt: string;
  brainPath?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AblationCell {
  label: string;
  provider: LLMProviderName;
  model: string;
  responseText: string;
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
  finishReason: string;
  errorMessage?: string;
}

export interface AblationMatrix {
  taskId: string;
  taskTitle: string;
  brainPath?: string;
  promptHash: string;
  cells: AblationCell[];
  totalCostUsd: number;
  startedAt: string;
  completedAt: string;
  budgetExhausted: boolean;
}

export interface RunAblationOptions {
  task: AblationTaskSpec;
  providers: AblationProviderSpec[];
  costGuard?: CostGuard;
  timeoutPerCellMs?: number;
  auditLog?: AuditLog;
  matrixId?: string;
  identityFor?: (spec: AblationProviderSpec) => AgentIdentity;
}

export async function runAblation(opts: RunAblationOptions): Promise<AblationMatrix> {
  const { task, providers, costGuard } = opts;
  const startedAt = new Date().toISOString();
  const promptHash = hashPrompt(task.systemPrompt, task.userPrompt);

  const request: LLMCompletionRequest = {
    messages: [
      { role: 'system', content: task.systemPrompt },
      { role: 'user', content: task.userPrompt },
    ],
    maxTokens: task.maxTokens ?? 2048,
    temperature: task.temperature ?? 0.4,
  };

  const cells: AblationCell[] = [];
  let budgetExhausted = false;
  const matrixId = opts.matrixId ?? `mx_${promptHash}_${Date.now()}`;

  for (const spec of providers) {
    if (costGuard?.isOverBudget()) {
      budgetExhausted = true;
      cells.push({
        label: spec.label,
        provider: spec.provider,
        model: spec.model,
        responseText: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: 0,
        durationMs: 0,
        finishReason: 'error',
        errorMessage: 'budget-exhausted-before-cell',
      });
      continue;
    }

    const t0 = Date.now();
    try {
      const provider = await spec.build();
      const cellPromise = provider.complete(request, spec.model);
      const response = opts.timeoutPerCellMs
        ? await withTimeout(cellPromise, opts.timeoutPerCellMs, spec.label)
        : await cellPromise;
      const durationMs = Date.now() - t0;

      const costUsd = spec.pricer
        ? spec.pricer(response.usage)
        : costGuard?.recordUsage(spec.model, response.usage).costUsd ?? 0;
      if (spec.pricer && costGuard) {
        costGuard.recordUsage(spec.model, response.usage);
      }

      cells.push({
        label: spec.label,
        provider: spec.provider,
        model: spec.model,
        responseText: response.content,
        usage: response.usage,
        costUsd,
        durationMs,
        finishReason: response.finishReason,
      });
      recordAblationCellIfWired(opts, spec, {
        matrixId,
        promptHash,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        costUsd,
        durationMs,
        finishReason: response.finishReason,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      cells.push({
        label: spec.label,
        provider: spec.provider,
        model: spec.model,
        responseText: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: 0,
        durationMs: Date.now() - t0,
        finishReason: 'error',
        errorMessage,
      });
      recordAblationCellIfWired(opts, spec, {
        matrixId,
        promptHash,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - t0,
        finishReason: 'error',
        errorMessage,
      });
    }
  }

  return {
    taskId: task.taskId,
    taskTitle: task.taskTitle,
    brainPath: task.brainPath,
    promptHash,
    cells,
    totalCostUsd: cells.reduce((sum, c) => sum + c.costUsd, 0),
    startedAt,
    completedAt: new Date().toISOString(),
    budgetExhausted,
  };
}

export function renderAblationMarkdown(matrix: AblationMatrix): string {
  const header = [
    `# Ablation: ${matrix.taskTitle}`,
    '',
    `- task_id: \`${matrix.taskId}\``,
    `- prompt_hash: \`${matrix.promptHash}\``,
    matrix.brainPath ? `- brain: \`${matrix.brainPath}\`` : '- brain: _(none)_',
    `- started: ${matrix.startedAt}`,
    `- completed: ${matrix.completedAt}`,
    `- total_cost_usd: $${matrix.totalCostUsd.toFixed(4)}`,
    matrix.budgetExhausted ? `- **budget_exhausted: true** (some cells skipped)` : '',
    '',
    '| Label | Provider | Model | Tokens (in/out) | Cost (USD) | Duration (ms) | Finish | Excerpt |',
    '|---|---|---|---|---|---|---|---|',
  ].filter((line) => line !== '');

  const rows = matrix.cells.map((c) => {
    const tokens = `${c.usage.promptTokens}/${c.usage.completionTokens}`;
    const excerpt = c.errorMessage
      ? `_error: ${truncate(c.errorMessage, 80)}_`
      : truncate(escapeMd(c.responseText.replace(/\n/g, ' ')), 80);
    return `| ${c.label} | ${c.provider} | ${c.model} | ${tokens} | $${c.costUsd.toFixed(4)} | ${c.durationMs} | ${c.finishReason} | ${excerpt} |`;
  });

  return [...header, ...rows, ''].join('\n');
}

function recordAblationCellIfWired(
  opts: RunAblationOptions,
  spec: AblationProviderSpec,
  cell: {
    matrixId: string;
    promptHash: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    durationMs: number;
    finishReason: string;
    errorMessage?: string;
  }
): void {
  if (!opts.auditLog) return;
  const identity = opts.identityFor?.(spec) ?? {
    handle: `ablation:${spec.label}`,
    surface: `ablation:${spec.label}`,
    wallet: '0x0000000000000000000000000000000000000000',
    x402Bearer: '',
    llmProvider: spec.provider,
    llmModel: spec.model,
    brainPath: opts.task.brainPath ?? '(none)',
    budgetUsdPerDay: 0,
    teamId: '(ablation)',
    meshApiBase: '(ablation)',
  };
  try {
    opts.auditLog.recordAblationCell({
      identity,
      matrixId: cell.matrixId,
      label: spec.label,
      taskId: opts.task.taskId,
      taskTitle: opts.task.taskTitle,
      promptHash: cell.promptHash,
      promptTokens: cell.promptTokens,
      completionTokens: cell.completionTokens,
      costUsd: cell.costUsd,
      durationMs: cell.durationMs,
      finishReason: cell.finishReason,
      errorMessage: cell.errorMessage,
    });
  } catch {
    // Audit log write must never break the ablation matrix output.
  }
}

function hashPrompt(system: string, user: string): string {
  return createHash('sha256').update(`SYS:${system}\nUSR:${user}`).digest('hex').slice(0, 16);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ablation cell "${label}" timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}
