import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentIdentity, BoardTask, ExecutionResult } from './types.js';

export interface CommitHookOptions {
  outputDir: string;
  workingDir?: string;
  authorName?: string;
  authorEmail?: string;
  scope?: string;
  spawn?: typeof spawnSync;
  now?: () => Date;
}

export interface CommitHookResult {
  filePath: string;
  commitHash?: string;
  staged: string[];
  message: string;
}

const SAFE_HANDLE = /^[a-z0-9_-]{1,64}$/i;

export function makeCommitHook(opts: CommitHookOptions) {
  if (!opts.outputDir || opts.outputDir.trim().length === 0) {
    throw new Error('CommitHookOptions.outputDir is required');
  }
  const spawn = opts.spawn ?? spawnSync;
  const cwd = opts.workingDir ?? process.cwd();
  const outputDir = resolve(cwd, opts.outputDir);
  const now = opts.now ?? (() => new Date());
  const scope = opts.scope ?? 'agent';

  return async (result: ExecutionResult, task: BoardTask, identity: AgentIdentity): Promise<CommitHookResult> => {
    if (!SAFE_HANDLE.test(identity.handle)) {
      throw new Error(`Refusing to commit: handle "${identity.handle}" must match ${SAFE_HANDLE}`);
    }
    const date = now().toISOString().slice(0, 10);
    const safeTaskId = task.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const fileName = `${date}_${safeTaskId}_${identity.handle}.md`;
    const filePath = join(outputDir, fileName);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, renderMemo(result, task, identity, date), 'utf8');

    const relPath = relativeTo(cwd, filePath);
    const addRes = spawn('git', ['add', relPath], { cwd, encoding: 'utf8' });
    if (addRes.status !== 0) {
      throw new Error(`git add failed: ${addRes.stderr || addRes.stdout || `exit ${addRes.status}`}`);
    }

    const message = renderCommitMessage({ scope, task, identity, result });
    const commitArgs = ['commit', '-m', message];
    if (opts.authorName && opts.authorEmail) {
      commitArgs.push('--author', `${opts.authorName} <${opts.authorEmail}>`);
    }
    const commitRes = spawn('git', commitArgs, { cwd, encoding: 'utf8' });
    if (commitRes.status !== 0) {
      throw new Error(`git commit failed: ${commitRes.stderr || commitRes.stdout || `exit ${commitRes.status}`}`);
    }

    const hashRes = spawn('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
    const commitHash = hashRes.status === 0 ? hashRes.stdout.trim() : undefined;

    return { filePath, commitHash, staged: [relPath], message };
  };
}

function renderMemo(result: ExecutionResult, task: BoardTask, identity: AgentIdentity, date: string): string {
  return [
    '---',
    `title: "${task.title.replace(/"/g, "'")}"`,
    `task_id: ${task.id}`,
    `agent: ${identity.handle}`,
    `surface: ${identity.surface}`,
    `provider: ${identity.llmProvider}`,
    `model: ${identity.llmModel}`,
    `wallet: ${identity.wallet}`,
    `date: ${date}`,
    `tokens: ${result.usage.totalTokens}`,
    `cost_usd: ${result.costUsd.toFixed(4)}`,
    `duration_ms: ${result.durationMs}`,
    `tags: [${(task.tags ?? []).map((t) => JSON.stringify(t)).join(', ')}]`,
    '---',
    '',
    `# ${task.title}`,
    '',
    '## Task description',
    '',
    task.description ?? '(no description)',
    '',
    '## Agent response',
    '',
    result.responseText.trim(),
    '',
  ].join('\n');
}

const SUBJECT_MAX = 72;

function renderCommitMessage(opts: {
  scope: string;
  task: BoardTask;
  identity: AgentIdentity;
  result: ExecutionResult;
}): string {
  const suffix = ` [agent:${opts.identity.handle}]`;
  const prefix = `${opts.scope}: `;
  const titleBudget = Math.max(8, SUBJECT_MAX - prefix.length - suffix.length);
  const subject = `${prefix}${truncate(opts.task.title, titleBudget)}${suffix}`;
  const body = [
    '',
    `task: ${opts.task.id}`,
    `agent: ${opts.identity.handle} (${opts.identity.llmProvider}/${opts.identity.llmModel})`,
    `wallet: ${opts.identity.wallet}`,
    `cost: $${opts.result.costUsd.toFixed(4)} / ${opts.result.usage.totalTokens} tok / ${opts.result.durationMs}ms`,
  ].join('\n');
  return `${subject}\n${body}\n`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function relativeTo(base: string, target: string): string {
  const b = base.replace(/\\/g, '/');
  const t = target.replace(/\\/g, '/');
  if (t.startsWith(b + '/')) return t.slice(b.length + 1);
  if (t === b) return '.';
  return t;
}
