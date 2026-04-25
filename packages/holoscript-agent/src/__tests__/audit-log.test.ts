import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLog } from '../audit-log.js';
import type { AgentIdentity, BoardTask, ExecutionResult } from '../types.js';

const IDENTITY: AgentIdentity = {
  handle: 'security-auditor',
  surface: 'security-auditor',
  wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
  x402Bearer: 'fake',
  llmProvider: 'anthropic',
  llmModel: 'claude-opus-4-7',
  brainPath: 'compositions/security-auditor-brain.hsplus',
  budgetUsdPerDay: 5,
  teamId: 't',
  meshApiBase: 'https://mcp.holoscript.net/api/holomesh',
};

const TASK: BoardTask = {
  id: 'task_g10',
  title: 'cross-paper threat-model memo',
  description: '',
  priority: 'high',
  tags: ['security', 'paper-21'],
  status: 'open',
};

const RESULT: ExecutionResult = {
  taskId: 'task_g10',
  responseText: '...',
  usage: { promptTokens: 1500, completionTokens: 800, totalTokens: 2300 },
  costUsd: 0.0825,
  durationMs: 4321,
};

function tmpLog(): string {
  return join(mkdtempSync(join(tmpdir(), 'audit-')), 'audit.jsonl');
}

describe('AuditLog', () => {
  it('appends one JSON-per-line event with full provenance for a task execution', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    log.recordTaskExecuted({ identity: IDENTITY, task: TASK, result: RESULT, commitHash: 'abc123', filePath: 'agent-out/memo.md' });
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const e = JSON.parse(lines[0]);
    expect(e.kind).toBe('task-executed');
    expect(e.agent.handle).toBe('security-auditor');
    expect(e.agent.provider).toBe('anthropic');
    expect(e.agent.model).toBe('claude-opus-4-7');
    expect(e.agent.walletShort).toBe('0x3461…89AB');
    expect(e.task.id).toBe('task_g10');
    expect(e.execution.totalTokens).toBe(2300);
    expect(e.execution.costUsd).toBe(0.0825);
    expect(e.result.commitHash).toBe('abc123');
  });

  it('appends multiple events without overwriting (audit trail must be immutable)', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    for (let i = 0; i < 5; i++) {
      log.recordTaskExecuted({
        identity: IDENTITY,
        task: { ...TASK, id: `t${i}` },
        result: RESULT,
      });
    }
    const events = log.query();
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.task?.id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });

  it('filters by agent / provider / kind / task / since / until / limit', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    log.recordTaskExecuted({ identity: IDENTITY, task: { ...TASK, id: 't1' }, result: RESULT });
    log.recordTaskExecuted({
      identity: { ...IDENTITY, handle: 'lean-theorist', llmProvider: 'openai' },
      task: { ...TASK, id: 't2' },
      result: RESULT,
    });
    log.recordAblationCell({
      identity: IDENTITY,
      matrixId: 'mx1',
      label: 'opus',
      taskId: 't3',
      taskTitle: 'ablation',
      promptHash: 'hash',
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.01,
      durationMs: 200,
      finishReason: 'stop',
    });

    expect(log.query({ agent: 'security-auditor' })).toHaveLength(2);
    expect(log.query({ provider: 'openai' })).toHaveLength(1);
    expect(log.query({ kind: 'ablation-cell' })).toHaveLength(1);
    expect(log.query({ task: 't2' })).toHaveLength(1);
    expect(log.query({ limit: 2 })).toHaveLength(2);
  });

  it('rollup aggregates cost/tokens by agent and by provider — Phase 3 dashboard input', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    log.recordTaskExecuted({ identity: IDENTITY, task: TASK, result: RESULT });
    log.recordTaskExecuted({
      identity: { ...IDENTITY, handle: 'lean-theorist', llmProvider: 'openai' },
      task: TASK,
      result: { ...RESULT, costUsd: 0.05, usage: { ...RESULT.usage, totalTokens: 1000 } },
    });

    const r = log.rollup();
    expect(r.totalEvents).toBe(2);
    expect(r.byAgent['security-auditor'].events).toBe(1);
    expect(r.byAgent['security-auditor'].costUsd).toBeCloseTo(0.0825, 4);
    expect(r.byAgent['lean-theorist'].costUsd).toBeCloseTo(0.05, 4);
    expect(r.byProvider['anthropic'].events).toBe(1);
    expect(r.byProvider['openai'].events).toBe(1);
    expect(r.totalCostUsd).toBeCloseTo(0.1325, 4);
  });

  it('survives a partially-corrupt line without losing the rest of the log', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    log.recordTaskExecuted({ identity: IDENTITY, task: { ...TASK, id: 't1' }, result: RESULT });
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"corrupt": json line}\n`, 'utf8');
    log.recordTaskExecuted({ identity: IDENTITY, task: { ...TASK, id: 't2' }, result: RESULT });
    const events = log.query();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.task?.id)).toEqual(['t1', 't2']);
  });

  it('rotates the log when it exceeds maxBytes (cheap, predictable size cap)', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path, maxBytes: 100 });
    for (let i = 0; i < 5; i++) {
      log.recordTaskExecuted({ identity: IDENTITY, task: { ...TASK, id: `t${i}` }, result: RESULT });
    }
    const finalSize = statSync(path).size;
    expect(finalSize).toBeGreaterThan(0);
    expect(finalSize).toBeLessThan(2000);
  });

  it('returns empty events when the log file does not exist yet', () => {
    const path = tmpLog();
    const log = new AuditLog({ logPath: path });
    expect(log.query()).toEqual([]);
    expect(log.rollup().totalEvents).toBe(0);
  });
});
