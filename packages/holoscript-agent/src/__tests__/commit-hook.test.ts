import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeCommitHook } from '../commit-hook.js';
import type { AgentIdentity, BoardTask, ExecutionResult } from '../types.js';

const IDENTITY: AgentIdentity = {
  handle: 'security-auditor',
  surface: 'security-auditor',
  wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
  x402Bearer: 'fake-bearer',
  llmProvider: 'anthropic',
  llmModel: 'claude-opus-4-7',
  brainPath: '/tmp/brain.hsplus',
  budgetUsdPerDay: 5,
  teamId: 'team_test',
  meshApiBase: 'https://mcp.holoscript.net/api/holomesh',
};

const TASK: BoardTask = {
  id: 'task_g10_threat_model',
  title: 'cross-paper threat-model memo for SimContract narrative',
  description: 'Produce a single memo across Papers 0c/1/3/4/8/9 + capstones.',
  priority: 'high',
  tags: ['security', 'paper-21', 'gap-G10'],
  status: 'open',
};

const RESULT: ExecutionResult = {
  taskId: 'task_g10_threat_model',
  responseText: '# Cross-paper threat model\n\nLayer 1: …',
  usage: { promptTokens: 1500, completionTokens: 800, totalTokens: 2300 },
  costUsd: 0.0825,
  durationMs: 4321,
};

describe('makeCommitHook', () => {
  it('writes a memo with full provenance frontmatter and stages it via git add', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'commit-hook-'));
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawn = vi.fn((cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc1234567890\n', stderr: '' } as never;
      return { status: 0, stdout: '', stderr: '' } as never;
    });

    const hook = makeCommitHook({
      outputDir: 'agent-out',
      workingDir: cwd,
      scope: 'paper-21',
      spawn: spawn as never,
      now: () => new Date('2026-04-24T12:00:00Z'),
    });
    const out = await hook(RESULT, TASK, IDENTITY);

    expect(existsSync(out.filePath)).toBe(true);
    const memo = readFileSync(out.filePath, 'utf8');
    expect(memo).toContain('task_id: task_g10_threat_model');
    expect(memo).toContain('agent: security-auditor');
    expect(memo).toContain('provider: anthropic');
    expect(memo).toContain('cost_usd: 0.0825');
    expect(memo).toContain('Layer 1: …');

    const addCall = calls.find((c) => c.args[0] === 'add');
    expect(addCall?.args[1]).toMatch(/agent-out\/2026-04-24_task_g10_threat_model_security-auditor\.md/);
    const commitCall = calls.find((c) => c.args[0] === 'commit');
    expect(commitCall?.args).toContain('-m');
    const msg = commitCall?.args[commitCall.args.indexOf('-m') + 1] ?? '';
    expect(msg).toMatch(/^paper-21: cross-paper threat-model memo/);
    expect(msg).toContain('agent: security-auditor');
    expect(msg).toContain('cost: $0.0825');

    expect(out.commitHash).toBe('abc1234567890');
  });

  it('rejects unsafe handles to prevent shell-injection in commit messages', async () => {
    const hook = makeCommitHook({
      outputDir: 'agent-out',
      workingDir: mkdtempSync(join(tmpdir(), 'commit-hook-')),
      spawn: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })) as never,
    });
    await expect(
      hook(RESULT, TASK, { ...IDENTITY, handle: 'security; rm -rf /' })
    ).rejects.toThrow(/handle/);
    await expect(
      hook(RESULT, TASK, { ...IDENTITY, handle: 'a/../b' })
    ).rejects.toThrow(/handle/);
  });

  it('throws (does not silently swallow) when git add fails', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'commit-hook-'));
    const spawn = vi.fn(() => ({ status: 1, stdout: '', stderr: 'fatal: not a git repo' }));
    const hook = makeCommitHook({
      outputDir: 'agent-out',
      workingDir: cwd,
      spawn: spawn as never,
    });
    await expect(hook(RESULT, TASK, IDENTITY)).rejects.toThrow(/git add failed.*not a git repo/);
  });

  it('throws when git commit fails (e.g. pre-commit hook rejects)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'commit-hook-'));
    const spawn = vi.fn((cmd: string, args: string[]) => {
      if (args[0] === 'add') return { status: 0, stdout: '', stderr: '' } as never;
      if (args[0] === 'commit') return { status: 1, stdout: '', stderr: 'pre-commit: lint failed' } as never;
      return { status: 0, stdout: '', stderr: '' } as never;
    });
    const hook = makeCommitHook({ outputDir: 'agent-out', workingDir: cwd, spawn: spawn as never });
    await expect(hook(RESULT, TASK, IDENTITY)).rejects.toThrow(/git commit failed.*lint failed/);
  });

  it('truncates long task titles in the commit subject', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'commit-hook-'));
    const calls: Array<{ args: string[] }> = [];
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      calls.push({ args });
      return { status: 0, stdout: '', stderr: '' } as never;
    });
    const longTitle = 'a'.repeat(200);
    const hook = makeCommitHook({ outputDir: '.', workingDir: cwd, spawn: spawn as never });
    await hook(RESULT, { ...TASK, title: longTitle }, IDENTITY);
    const commitCall = calls.find((c) => c.args[0] === 'commit')!;
    const subject = commitCall.args[commitCall.args.indexOf('-m') + 1].split('\n')[0];
    expect(subject.length).toBeLessThanOrEqual(72);
    expect(subject).toContain('…');
    expect(subject).toContain('[agent:security-auditor]');
  });
});
