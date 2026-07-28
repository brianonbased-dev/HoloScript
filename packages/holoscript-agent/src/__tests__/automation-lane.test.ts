import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '@holoscript/llm-provider';
import { CostGuard } from '../cost-guard.js';
import { AgentRunner } from '../runner.js';
import {
  resolveAutomationLaneConfig,
  isAutomationLaneTask,
  screenAutomationTask,
  selectAutomationTask,
  priorityRank,
  AUTOMATION_LANE_SOURCE,
} from '../automation-lane.js';
import type { AgentIdentity, BoardTask, RuntimeBrainConfig } from '../types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Description mirrors the REAL feeder shape (ai-ecosystem/scripts/
// holoshell-team-automations.mjs descriptionForAutomation): the routing
// boilerplate mentions HoloKey= / x402= / signed-board-task / owned-metal on
// EVERY task, so the safety screen must not false-positive on those tokens.
const FEEDER_BOILERPLATE = [
  'HoloShell local automation due: board intelligence report',
  'Automation id: a-025',
  'Due at: 2026-07-12T06:00:00.000Z (schedule)',
  'Schedule: FREQ=DAILY',
  'Workspaces: C:/Users/josep/.ai-ecosystem',
  'Automation principal: program:a-025',
  'Requester: holoshell-team-automation-registry/a-025 (cloud; provenance only)',
  'Execution lane: local-family / owned-metal; cloud/provider seats are requesters, not the standing executor.',
  'Closeout: signed-board-task with validation evidence; HoloKey=preferred; x402=required.',
  '',
  'Execution contract:',
].join('\n');

function automationTask(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: 'task_auto_a025',
    title: '[automation:a-025] board intelligence report 2026-07-12',
    description:
      `${FEEDER_BOILERPLATE}\n` +
      'Generate the daily board intelligence report from the done-log and write it to ' +
      'the shared output directory as report.md, then summarize the top three shifts.',
    priority: 3,
    tags: ['holoshell-automation', 'team-automation', 'local-family', 'automation:a-025'],
    status: 'open',
    source: AUTOMATION_LANE_SOURCE,
    createdAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

const AGENT_TAGS = ['jetson', 'edge-inference'];

// ── Unit: config resolution ──────────────────────────────────────────────────
describe('resolveAutomationLaneConfig', () => {
  it('defaults OFF when the env flag is unset — deploying the build changes nothing', () => {
    expect(resolveAutomationLaneConfig({})).toEqual({ enabled: false, apply: false });
    expect(resolveAutomationLaneConfig({ HOLOSCRIPT_AGENT_AUTOMATION_LANE: '0' })).toEqual({
      enabled: false,
      apply: false,
    });
  });

  it('LANE=1 alone is dry-run (enabled, apply=false)', () => {
    expect(resolveAutomationLaneConfig({ HOLOSCRIPT_AGENT_AUTOMATION_LANE: '1' })).toEqual({
      enabled: true,
      apply: false,
    });
    expect(resolveAutomationLaneConfig({ HOLOSCRIPT_AGENT_AUTOMATION_LANE: 'true' })).toEqual({
      enabled: true,
      apply: false,
    });
  });

  it('APPLY requires the lane flag too — APPLY alone stays OFF', () => {
    expect(resolveAutomationLaneConfig({ HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY: '1' })).toEqual({
      enabled: false,
      apply: false,
    });
    expect(
      resolveAutomationLaneConfig({
        HOLOSCRIPT_AGENT_AUTOMATION_LANE: '1',
        HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY: '1',
      })
    ).toEqual({ enabled: true, apply: true });
  });
});

// ── Unit: lane membership + priority tolerance ───────────────────────────────
describe('isAutomationLaneTask / priorityRank', () => {
  it('matches by source, by tag, and rejects plain tasks', () => {
    expect(isAutomationLaneTask(automationTask())).toBe(true);
    expect(
      isAutomationLaneTask(automationTask({ source: undefined, tags: ['holoshell-automation'] }))
    ).toBe(true);
    expect(isAutomationLaneTask(automationTask({ source: 'manual', tags: ['security'] }))).toBe(
      false
    );
  });

  it('priorityRank tolerates the board priority babel (memo §2 S2) for ordering', () => {
    expect(priorityRank(2)).toBe(2);
    expect(priorityRank('P1')).toBe(1);
    expect(priorityRank('p3')).toBe(3);
    expect(priorityRank('high')).toBe(2);
    expect(priorityRank('garbage')).toBe(9);
    expect(priorityRank(undefined)).toBe(9);
  });
});

// ── Unit: safety screens ─────────────────────────────────────────────────────
describe('screenAutomationTask', () => {
  it('passes a real feeder-shaped task (routing boilerplate must not false-positive)', () => {
    expect(screenAutomationTask(automationTask(), AGENT_TAGS)).toEqual([]);
  });

  it.each([
    ['spend', 'Reconcile the weekly spend ledger and update the treasury totals.'],
    ['lease', 'Acquire the holo-lease before restarting the shared service.'],
    ['custody', 'Move the seat wallet custody to the new node and re-sign.'],
    ['fleet-destroy', 'Destroy idle Vast fleet workers past their GPU budget window.'],
    ['secret', 'Rotate the API keys and refresh every credential in .env files.'],
    ['deploy', 'Deploy the updated service to Railway after the gate passes.'],
  ])('refuses %s-shaped prompts with a named screen reason', (name, contract) => {
    const task = automationTask({ description: `${FEEDER_BOILERPLATE}\n${contract}` });
    expect(screenAutomationTask(task, AGENT_TAGS)).toContain(`screen:${name}`);
  });

  it('screens the title and tags surface too, not just the description', () => {
    const task = automationTask({ title: '[automation:a-099] fleet autoscaler sweep' });
    expect(screenAutomationTask(task, AGENT_TAGS)).toContain('screen:fleet-destroy');
  });

  it('refuses required_tags this agent does not carry, and accepts them when it does', () => {
    const gated = automationTask({ required_tags: ['owned-metal'] });
    expect(screenAutomationTask(gated, AGENT_TAGS)).toContain('required-tags-unsatisfied');
    expect(screenAutomationTask(gated, [...AGENT_TAGS, 'owned-metal'])).toEqual([]);
  });

  it('refuses unbounded or empty prompts', () => {
    expect(
      screenAutomationTask(automationTask({ description: 'too short' }), AGENT_TAGS)
    ).toContain('description-too-short');
    expect(
      screenAutomationTask(automationTask({ description: 'x'.repeat(9000) }), AGENT_TAGS)
    ).toContain('description-too-long');
  });
});

// ── Unit: selection ──────────────────────────────────────────────────────────
describe('selectAutomationTask', () => {
  it('scans only open, unclaimed automation-lane tasks', () => {
    const decision = selectAutomationTask(
      [
        automationTask(),
        automationTask({ id: 'task_claimed', claimedBy: 'someone' }),
        automationTask({ id: 'task_done', status: 'done' }),
        { ...automationTask({ id: 'task_manual' }), source: 'manual', tags: ['security'] },
      ],
      AGENT_TAGS
    );
    expect(decision.scanned).toBe(1);
    expect(decision.selected?.id).toBe('task_auto_a025');
  });

  it('selects at most ONE task: highest priority first, then FIFO by createdAt', () => {
    const older = automationTask({ id: 'task_old', createdAt: '2026-07-08T00:00:00.000Z' });
    const newer = automationTask({ id: 'task_new', createdAt: '2026-07-11T00:00:00.000Z' });
    const urgent = automationTask({
      id: 'task_urgent',
      priority: 'P2',
      createdAt: '2026-07-12T00:00:00.000Z',
    });
    const decision = selectAutomationTask([newer, older, urgent], AGENT_TAGS);
    expect(decision.selected?.id).toBe('task_urgent'); // P2 beats priority-3 regardless of age
    const samePriority = selectAutomationTask([newer, older], AGENT_TAGS);
    expect(samePriority.selected?.id).toBe('task_old'); // FIFO drain within a priority
  });

  it('reports refusals with named reasons in the selection receipt', () => {
    const screened = automationTask({
      id: 'task_screened',
      description: `${FEEDER_BOILERPLATE}\nRotate the deploy credentials for the fleet.`,
    });
    const decision = selectAutomationTask([screened, automationTask()], AGENT_TAGS);
    expect(decision.selected?.id).toBe('task_auto_a025');
    expect(decision.eligible).toBe(1);
    expect(decision.refused).toHaveLength(1);
    expect(decision.refused[0].id).toBe('task_screened');
    expect(decision.refused[0].reasons).toEqual(
      expect.arrayContaining(['screen:secret', 'screen:deploy', 'screen:fleet-destroy'])
    );
    expect(decision.selectionReason).toMatch(/1 eligible of 2 scanned; 1 refused/);
  });
});

// ── Runner integration ───────────────────────────────────────────────────────
// Same mock idiom as runner.test.ts (mockMesh/mockProvider), plus blockTask.
function mockProvider(opts: {
  toolCallsBeforeText?: string[];
  content?: string;
  completeImpl?: () => Promise<LLMCompletionResponse>;
}): ILLMProvider {
  const toolCalls = opts.toolCallsBeforeText ?? ['write_file'];
  const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      if (opts.completeImpl) return opts.completeImpl();
      const isFirstCallOfTick = (req.messages?.length ?? 0) <= 2;
      if (toolCalls.length > 0 && isFirstCallOfTick) {
        const uses = toolCalls.map((name, i) => ({
          id: `tu-${i}`,
          name,
          input:
            name === 'write_file'
              ? { path: '/root/agent-output/report.md', content: 'daily report body' }
              : { path: '/tmp/x' },
        }));
        return {
          content: '',
          usage,
          model: 'mock-1',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: uses,
          assistantBlocks: uses.map((u) => ({ type: 'tool_use' as const, ...u })),
        } as unknown as LLMCompletionResponse;
      }
      return {
        content: opts.content ?? 'report written with summary of shifts',
        usage,
        model: 'mock-1',
        provider: 'mock',
        finishReason: 'stop',
      };
    },
    async generateHoloScript() {
      throw new Error('not used');
    },
    async healthCheck() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

function mockMesh(tasks: BoardTask[]) {
  return {
    heartbeat: vi.fn(async () => undefined),
    joinTeam: vi.fn(async () => ({ success: true })),
    getOpenTasks: vi.fn(async () => tasks),
    claim: vi.fn(async (id: string) => tasks.find((t) => t.id === id)!),
    blockTask: vi.fn(async () => undefined),
    sendMessageOnTask: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    postAuditRecords: vi.fn(async () => ({ appended: 1, rejected: 0 })),
    queryTeamKnowledge: vi.fn(async () => []),
    queryPrivateKnowledge: vi.fn(async () => []),
    writePrivateKnowledge: vi.fn(async () => true),
    addTasks: vi.fn(async () => ({ added: 0 })),
    invokeTool: vi.fn(async () => ({ ok: true, text: '' })),
  };
}

const IDENTITY: AgentIdentity = {
  handle: 'jetson-orin-super',
  surface: 'jetson',
  wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
  x402Bearer: 'fake-bearer',
  llmProvider: 'mock',
  llmModel: 'mock-1',
  brainPath: '/tmp/brain.hsplus',
  budgetUsdPerDay: 5,
  teamId: 'team_test',
  meshApiBase: 'https://mcp.holoscript.net/api/holomesh',
};

// Capability tags that do NOT match automation task tags/text — so the normal
// capability lane never picks them and the tick reaches the automation lane.
const BRAIN: RuntimeBrainConfig = {
  brainPath: '/tmp/brain.hsplus',
  systemPrompt: 'You are the Jetson edge runner.',
  capabilityTags: AGENT_TAGS,
  domain: 'edge',
  scopeTier: 'warm',
  requires: [],
  prefers: [],
  avoids: [],
};

function freshGuard(): CostGuard {
  const dir = mkdtempSync(join(tmpdir(), 'auto-lane-'));
  return new CostGuard({ statePath: join(dir, 's.json'), dailyBudgetUsd: 5, pricer: () => 0.001 });
}

function makeRunner(opts: {
  tasks: BoardTask[];
  provider?: ILLMProvider;
  events?: Array<Record<string, unknown>>;
}) {
  const mesh = mockMesh(opts.tasks);
  const runner = new AgentRunner({
    identity: IDENTITY,
    brain: BRAIN,
    provider: opts.provider ?? mockProvider({}),
    costGuard: freshGuard(),
    mesh: mesh as never,
    logger: opts.events ? (e) => opts.events!.push(e) : undefined,
  });
  return { runner, mesh };
}

const LANE = 'HOLOSCRIPT_AGENT_AUTOMATION_LANE';
const APPLY = 'HOLOSCRIPT_AGENT_AUTOMATION_LANE_APPLY';

describe('AgentRunner automation lane (board-compass Phase 3)', () => {
  afterEach(() => {
    delete process.env[LANE];
    delete process.env[APPLY];
  });

  it('DEFAULT OFF: with the flag unset, an automation task on the board changes nothing (no-claimable-task, zero claims)', async () => {
    const { runner, mesh } = makeRunner({ tasks: [automationTask()] });
    const result = await runner.tick();
    expect(result.action).toBe('no-claimable-task');
    expect(mesh.claim).not.toHaveBeenCalled();
    expect(mesh.blockTask).not.toHaveBeenCalled();
  });

  it('DRY-RUN (lane=1, no apply): claims NOTHING and logs a selection receipt naming the would-claim task and why', async () => {
    process.env[LANE] = '1';
    const events: Array<Record<string, unknown>> = [];
    const { runner, mesh } = makeRunner({ tasks: [automationTask()], events });

    const result = await runner.tick();
    expect(result.action).toBe('automation-dry-run');
    expect(result.taskId).toBe('task_auto_a025');
    expect(result.message).toContain('would claim automation task task_auto_a025');
    expect(mesh.claim).not.toHaveBeenCalled();

    const receipt = events.find((e) => e.ev === 'automation-lane-receipt');
    expect(receipt).toBeDefined();
    expect(receipt?.mode).toBe('dry-run');
    expect((receipt?.wouldClaim as { id: string }).id).toBe('task_auto_a025');
    expect(receipt?.selectionReason).toMatch(/oldest open automation task at priority 3/);
  });

  it('APPLY: claims the automation task and executes it through the EXISTING closeout machinery (markDone, CAEL)', async () => {
    process.env[LANE] = '1';
    process.env[APPLY] = '1';
    const events: Array<Record<string, unknown>> = [];
    const { runner, mesh } = makeRunner({ tasks: [automationTask()], events });

    const result = await runner.tick();
    expect(result.action).toBe('executed');
    expect(result.taskId).toBe('task_auto_a025');
    expect(mesh.claim).toHaveBeenCalledWith('task_auto_a025');
    expect(mesh.markDone).toHaveBeenCalledTimes(1);
    expect(mesh.postAuditRecords).toHaveBeenCalledTimes(1);
    expect(mesh.blockTask).not.toHaveBeenCalled();
    const receipt = events.find((e) => e.ev === 'automation-lane-receipt');
    expect(receipt?.mode).toBe('apply');
    const claim = events.find((e) => e.ev === 'claim');
    expect(claim?.lane).toBe('automation');
  });

  it('never pre-empts normal capability-matched work: with both on the board, the capability task wins', async () => {
    process.env[LANE] = '1';
    process.env[APPLY] = '1';
    const capabilityTask: BoardTask = {
      id: 'task_edge_work',
      title: 'jetson edge-inference calibration memo',
      description: 'calibrate the edge model',
      priority: 3,
      tags: ['jetson'],
      status: 'open',
    };
    const { runner, mesh } = makeRunner({ tasks: [automationTask(), capabilityTask] });
    const result = await runner.tick();
    expect(result.action).toBe('executed');
    expect(result.taskId).toBe('task_edge_work');
    expect(mesh.claim).toHaveBeenCalledWith('task_edge_work');
    expect(mesh.claim).toHaveBeenCalledTimes(1);
  });

  it('APPLY + safety-screened task: never claimed, refusal named in the receipt, tick falls through to idle', async () => {
    process.env[LANE] = '1';
    process.env[APPLY] = '1';
    const events: Array<Record<string, unknown>> = [];
    const screened = automationTask({
      id: 'task_dangerous',
      description: `${FEEDER_BOILERPLATE}\nDestroy stale fleet workers and rotate the credentials.`,
    });
    const { runner, mesh } = makeRunner({ tasks: [screened], events });

    const result = await runner.tick();
    expect(result.action).toBe('no-claimable-task');
    expect(mesh.claim).not.toHaveBeenCalled();
    const receipt = events.find((e) => e.ev === 'automation-lane-receipt');
    expect(receipt?.wouldClaim).toBeNull();
    const refused = receipt?.refused as Array<{ id: string; reasons: string[] }>;
    expect(refused[0].id).toBe('task_dangerous');
    expect(refused[0].reasons.length).toBeGreaterThan(0);
  });

  it('APPLY + no verifiable artifact: BLOCKS the task with a reason instead of fabricating evidence (W.824 floor)', async () => {
    process.env[LANE] = '1';
    process.env[APPLY] = '1';
    const events: Array<Record<string, unknown>> = [];
    // Read-only tool use only → W.107.b no-artifact path.
    const provider = mockProvider({
      toolCallsBeforeText: ['read_file'],
      content: 'I looked around.',
    });
    const { runner, mesh } = makeRunner({ tasks: [automationTask()], provider, events });

    const result = await runner.tick();
    expect(result.action).toBe('no-artifact');
    expect(mesh.markDone).not.toHaveBeenCalled();
    expect(mesh.blockTask).toHaveBeenCalledTimes(1);
    const [taskId, reason] = mesh.blockTask.mock.calls[0] as [string, string];
    expect(taskId).toBe('task_auto_a025');
    expect(reason).toContain('no verifiable artifact');
    const failure = events.find((e) => e.ev === 'automation-lane-failure');
    expect(failure?.exitCode).toBe(1);
    expect(failure?.kind).toBe('no-artifact');
  });

  it('APPLY + execution error: blocks with the error reason, logs exitCode:1, returns errored WITHOUT throwing', async () => {
    process.env[LANE] = '1';
    process.env[APPLY] = '1';
    const events: Array<Record<string, unknown>> = [];
    const provider = mockProvider({
      completeImpl: async () => {
        throw new Error('local llm endpoint unreachable: connect ECONNREFUSED');
      },
    });
    const { runner, mesh } = makeRunner({ tasks: [automationTask()], provider, events });

    const result = await runner.tick();
    expect(result.action).toBe('errored');
    expect(result.taskId).toBe('task_auto_a025');
    expect(result.message).toContain('automation-lane execution error');
    expect(mesh.blockTask).toHaveBeenCalledTimes(1);
    expect(String(mesh.blockTask.mock.calls[0][1])).toContain('ECONNREFUSED');
    const failure = events.find((e) => e.ev === 'automation-lane-failure');
    expect(failure?.exitCode).toBe(1);
    expect(failure?.kind).toBe('execution-error');
  });

  it('a capability-lane execution error still propagates unchanged (loud-failure wrap is automation-only)', async () => {
    const capabilityTask: BoardTask = {
      id: 'task_edge_err',
      title: 'jetson edge-inference calibration memo',
      description: 'calibrate the edge model',
      priority: 3,
      tags: ['jetson'],
      status: 'open',
    };
    const provider = mockProvider({
      completeImpl: async () => {
        throw new Error('provider exploded');
      },
    });
    const { runner, mesh } = makeRunner({ tasks: [capabilityTask], provider });
    await expect(runner.tick()).rejects.toThrow(/provider exploded/);
    expect(mesh.blockTask).not.toHaveBeenCalled();
  });
});
