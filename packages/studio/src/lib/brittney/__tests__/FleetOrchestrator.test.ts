/**
 * Tests for FleetOrchestrator — the Brittney fleet dispatch decision core.
 *
 * Pure logic, no app/framework imports, so these run in isolation and pin the
 * contracts the live wiring layer (dispatch route + Brittney tool) depends on.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePriority,
  deriveTaskSkills,
  missingRequiredTags,
  scoreAgentForTask,
  matchAgentToTask,
  isClaimable,
  requiresExplicitApproval,
  rankTasks,
  selectNextTask,
  estimateTaskSpendUsd,
  SpendGovernor,
  DEFAULT_DAILY_SPEND_CAP_USD,
  planFleetDispatch,
  utcDayKey,
  type BoardTask,
  type FleetAgent,
} from '../FleetOrchestrator';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return { id: 't1', title: 'Do a thing', status: 'open', ...overrides };
}

function agent(overrides: Partial<FleetAgent> = {}): FleetAgent {
  return {
    id: 'a1',
    handle: 'claude1',
    skills: [],
    status: 'online',
    currentTask: null,
    ...overrides,
  };
}

// ─── normalizePriority ───────────────────────────────────────────────────────

describe('normalizePriority', () => {
  it('maps words and P-levels to lower-is-more-urgent numbers', () => {
    expect(normalizePriority('P0')).toBe(0);
    expect(normalizePriority('high')).toBe(0);
    expect(normalizePriority('P1')).toBe(1);
    expect(normalizePriority('medium')).toBe(2);
    expect(normalizePriority('P2')).toBe(2);
    expect(normalizePriority('low')).toBe(3);
    expect(normalizePriority('P3')).toBe(3);
  });

  it('passes numbers through and defaults unknown to medium (2)', () => {
    expect(normalizePriority(5)).toBe(5);
    expect(normalizePriority(undefined)).toBe(2);
    expect(normalizePriority('weird' as never)).toBe(2);
  });
});

// ─── deriveTaskSkills ────────────────────────────────────────────────────────

describe('deriveTaskSkills', () => {
  it('pulls skills from tags, role hints, and title keywords', () => {
    const skills = deriveTaskSkills(
      task({ title: 'Fix security vuln in auth', role: 'coder', tags: ['studio'] })
    );
    expect(skills.has('studio')).toBe(true); // tag
    expect(skills.has('holoscript-dev')).toBe(true); // role hint + keyword
    expect(skills.has('security')).toBe(true); // keyword
  });

  it('treats required_tags as capability signals', () => {
    const skills = deriveTaskSkills(task({ title: 'run local workload', required_tags: ['owned-metal'] }));
    expect(skills.has('owned-metal')).toBe(true);
  });

  it('returns an empty-ish set for a vague task', () => {
    const skills = deriveTaskSkills(task({ title: 'misc' }));
    expect(skills.size).toBe(0);
  });
});

// ─── scoreAgentForTask / matchAgentToTask ────────────────────────────────────

describe('scoreAgentForTask', () => {
  it('rewards skill overlap', () => {
    const t = task({ title: 'write docs', tags: ['documenter'] });
    const skilled = agent({ id: 'doc', skills: ['documenter'] });
    const generalist = agent({ id: 'gen', skills: ['compile'] });
    expect(scoreAgentForTask(t, skilled)).toBeGreaterThan(scoreAgentForTask(t, generalist));
  });

  it('marks offline/busy/occupied agents ineligible', () => {
    const t = task();
    expect(scoreAgentForTask(t, agent({ status: 'offline' }))).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreAgentForTask(t, agent({ status: 'busy' }))).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreAgentForTask(t, agent({ currentTask: 'tX' }))).toBe(Number.NEGATIVE_INFINITY);
  });

  it('keeps an idle generalist eligible (positive score)', () => {
    expect(scoreAgentForTask(task({ title: 'misc' }), agent())).toBeGreaterThan(0);
  });

  it('makes agents missing required_tags ineligible before dispatch claim', () => {
    const t = task({ title: 'owned metal workload', required_tags: ['owned-metal', 'gpu'] });
    const local = agent({ skills: ['owned-metal'], capabilityTags: ['owned-metal'] });
    const gpu = agent({ skills: ['owned-metal', 'gpu'], capabilityTags: ['owned-metal', 'gpu'] });

    expect(missingRequiredTags(t, local)).toEqual(['gpu']);
    expect(scoreAgentForTask(t, local)).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreAgentForTask(t, gpu)).toBeGreaterThan(0);
  });
});

describe('matchAgentToTask', () => {
  it('returns the best-scoring eligible agent', () => {
    const t = task({ title: 'review the audit', tags: ['critic'] });
    const best = matchAgentToTask(t, [
      agent({ id: 'a', skills: [] }),
      agent({ id: 'b', skills: ['critic', 'scan'] }),
      agent({ id: 'c', status: 'offline', skills: ['critic'] }),
    ]);
    expect(best?.agent.id).toBe('b');
  });

  it('returns null when no agent is eligible', () => {
    expect(matchAgentToTask(task(), [agent({ status: 'offline' })])).toBeNull();
    expect(matchAgentToTask(task(), [])).toBeNull();
  });

  it('skips higher-soft-score agents that lack required_tags', () => {
    const t = task({
      title: 'fix GPU scheduler regression',
      tags: ['holoscript-dev'],
      required_tags: ['owned-metal'],
    });
    const best = matchAgentToTask(t, [
      agent({ id: 'cloud', skills: ['holoscript-dev'] }),
      agent({ id: 'metal', skills: ['owned-metal'], capabilityTags: ['owned-metal'] }),
    ]);
    expect(best?.agent.id).toBe('metal');
  });
});

// ─── claimability + ranking ──────────────────────────────────────────────────

describe('isClaimable', () => {
  it('accepts open/unclaimed tasks only', () => {
    expect(isClaimable(task({ status: 'open' }))).toBe(true);
    expect(isClaimable(task({ status: 'done' }))).toBe(false);
    expect(isClaimable(task({ status: 'blocked' }))).toBe(false);
    expect(isClaimable(task({ status: 'claimed' }))).toBe(false);
    expect(isClaimable(task({ claimedBy: 'a1' }))).toBe(false);
  });

  it('rejects founder/true-spend approval gates before scheduler dispatch', () => {
    const qpu = task({
      id: 'qpu',
      title: '[true-spend-gate][quantum] Run one bounded real-QPU smoke receipt',
      tags: ['quantum-qpu-approval-needed', 'approval-needed'],
      description:
        'The live policy remains enabled=false, autonomous=false, capUsd=0, and approvalRef is unset. Do not spend or silently enable it.',
    });

    expect(requiresExplicitApproval(qpu)).toBe(true);
    expect(isClaimable(qpu)).toBe(false);
  });
});

describe('rankTasks / selectNextTask', () => {
  it('orders by priority then age, filtering unclaimable', () => {
    const tasks = [
      task({ id: 'low', priority: 'low' }),
      task({ id: 'done', priority: 'high', status: 'done' }),
      task({ id: 'p0-new', priority: 'P0', createdAt: '2026-06-07T10:00:00Z' }),
      task({ id: 'p0-old', priority: 'P0', createdAt: '2026-06-01T10:00:00Z' }),
      task({ id: 'med', priority: 'medium' }),
    ];
    const ranked = rankTasks(tasks).map((t) => t.id);
    expect(ranked).toEqual(['p0-old', 'p0-new', 'med', 'low']); // done filtered out
    expect(selectNextTask(tasks)?.id).toBe('p0-old');
  });

  it('selectNextTask returns null when nothing is claimable', () => {
    expect(selectNextTask([task({ status: 'done' })])).toBeNull();
  });
});

// ─── SpendGovernor ───────────────────────────────────────────────────────────

describe('SpendGovernor', () => {
  it('defaults to the conservative daily cap', () => {
    expect(new SpendGovernor().capUsd).toBe(DEFAULT_DAILY_SPEND_CAP_USD);
  });

  it('tracks spend and refuses over-cap dispatch', () => {
    const g = new SpendGovernor({ capUsd: 10 });
    expect(g.remainingUsd()).toBe(10);
    expect(g.canAfford(6)).toBe(true);
    g.record(6);
    expect(g.remainingUsd()).toBe(4);
    expect(g.canAfford(6)).toBe(false);
    expect(g.canAfford(4)).toBe(true);
  });

  it('rejects negative or non-finite estimates', () => {
    const g = new SpendGovernor({ capUsd: 10 });
    expect(g.canAfford(-1)).toBe(false);
    expect(g.canAfford(Number.NaN)).toBe(false);
  });

  it('hydrates from a prior snapshot', () => {
    const g = new SpendGovernor({ capUsd: 20, spentUsd: 15 });
    expect(g.remainingUsd()).toBe(5);
  });

  it('exposes a snapshot for persistence', () => {
    // Inject a `now` on the same UTC day as the pinned dayKey so snapshot() does not
    // roll the day. The prior version called snapshot() with the live clock and so
    // relied on the wall clock being 2026-06-07 — it broke at the next UTC midnight
    // (the cloud-authored core was never run on a real seat; this is that failure).
    const sameDay = new Date('2026-06-07T12:00:00Z');
    const g = new SpendGovernor({ capUsd: 10, dayKey: '2026-06-07', spentUsd: 3 });
    expect(g.snapshot(sameDay)).toMatchObject({
      dayKey: '2026-06-07',
      spentUsd: 3,
      capUsd: 10,
      remainingUsd: 7,
    });
  });
});

describe('utcDayKey', () => {
  it('formats YYYY-MM-DD in UTC', () => {
    expect(utcDayKey(new Date('2026-06-07T23:59:00Z'))).toBe('2026-06-07');
  });
});

// ─── estimateTaskSpendUsd ────────────────────────────────────────────────────

describe('estimateTaskSpendUsd', () => {
  it('scales estimate with urgency', () => {
    expect(estimateTaskSpendUsd(task({ priority: 'P0' }))).toBeGreaterThan(
      estimateTaskSpendUsd(task({ priority: 'low' }))
    );
  });
});

// ─── planFleetDispatch ───────────────────────────────────────────────────────

describe('planFleetDispatch', () => {
  it('assigns the top task to a capable free agent', () => {
    const tasks = [
      task({ id: 'docs', title: 'write docs', priority: 'low', tags: ['documenter'] }),
      task({ id: 'sec', title: 'fix security vuln', priority: 'P0', tags: ['security'] }),
    ];
    const agents = [
      agent({ id: 'writer', skills: ['documenter'] }),
      agent({ id: 'guard', skills: ['security', 'critic'] }),
    ];
    const plan = planFleetDispatch(tasks, agents, new SpendGovernor(), { maxDispatches: 1 });
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0].task.id).toBe('sec'); // P0 first
    expect(plan.decisions[0].agent.id).toBe('guard'); // capability match
  });

  it('does not double-assign an agent across one plan', () => {
    const tasks = [task({ id: 't1', priority: 'P0' }), task({ id: 't2', priority: 'P1' })];
    const agents = [agent({ id: 'only' })];
    const plan = planFleetDispatch(tasks, agents, new SpendGovernor(), { maxDispatches: 2 });
    expect(plan.decisions).toHaveLength(1);
    expect(plan.unassigned.map((t) => t.id)).toContain('t2');
  });

  it('stops at the spend cap and flags capReached', () => {
    const tasks = [
      task({ id: 't1', priority: 'P0' }), // est 3.0
      task({ id: 't2', priority: 'P0' }), // est 3.0
    ];
    const agents = [agent({ id: 'a1' }), agent({ id: 'a2' })];
    const plan = planFleetDispatch(tasks, agents, new SpendGovernor({ capUsd: 4 }), {
      maxDispatches: 2,
    });
    expect(plan.decisions).toHaveLength(1); // only one 3.0 dispatch fits under cap 4
    expect(plan.capReached).toBe(true);
  });

  it('reports tasks with no eligible agent as unassigned', () => {
    const plan = planFleetDispatch(
      [task({ id: 'orphan', priority: 'P0' })],
      [agent({ status: 'offline' })],
      new SpendGovernor()
    );
    expect(plan.decisions).toHaveLength(0);
    expect(plan.unassigned.map((t) => t.id)).toEqual(['orphan']);
  });

  it('reports required_tags mismatches as unassigned instead of planning a doomed claim', () => {
    const plan = planFleetDispatch(
      [task({ id: 'jetson-only', priority: 'P2', required_tags: ['jetson', 'owned-metal'] })],
      [
        agent({
          id: 'cloud-lane',
          skills: ['builder', 'holoscript-dev'],
          capabilityTags: ['builder', 'cloud-lane'],
        }),
      ],
      new SpendGovernor(),
      { maxDispatches: 1 }
    );
    expect(plan.decisions).toHaveLength(0);
    expect(plan.unassigned.map((t) => t.id)).toEqual(['jetson-only']);
  });

  it('shuts off on an EMPTY board — no decisions, no spend (founder condition)', () => {
    const plan = planFleetDispatch(
      [],
      [agent({ id: 'a1' }), agent({ id: 'a2' })],
      new SpendGovernor({ capUsd: 25 }),
      { maxDispatches: 5 }
    );
    expect(plan.decisions).toHaveLength(0);
    expect(plan.capReached).toBe(false);
    // Planning is side-effect-free; the route only records spend on a decision,
    // and 0 decisions ⇒ it returns the preview branch (no claim, no spend).
    expect(plan.spend.spentUsd).toBe(0);
  });

  it('shuts off when every task is already claimed/done — no re-claim, no spend', () => {
    const tasks = [
      task({ id: 'c1', priority: 'P0', claimedBy: 'someone' }),
      task({ id: 'c2', priority: 'P0', status: 'claimed' }),
      task({ id: 'c3', priority: 'P0', status: 'done' }),
    ];
    const plan = planFleetDispatch(tasks, [agent({ id: 'free' })], new SpendGovernor(), {
      maxDispatches: 5,
    });
    expect(plan.decisions).toHaveLength(0); // an all-claimed board is "empty" for dispatch
    expect(plan.spend.spentUsd).toBe(0);
  });

  it('skips approval-needed true-spend tasks but still dispatches safe work', () => {
    const tasks = [
      task({
        id: 'qpu',
        priority: 'P0',
        title: '[true-spend-gate][quantum] Run one bounded real-QPU smoke receipt',
        tags: ['quantum-qpu-approval-needed', 'approval-needed'],
        description:
          'The live policy remains enabled=false, autonomous=false, capUsd=0, and approvalRef is unset. Do not spend or silently enable it.',
      }),
      task({ id: 'safe', priority: 'P2', title: 'Run local service health sweep' }),
    ];

    const plan = planFleetDispatch(tasks, [agent({ id: 'free' })], new SpendGovernor(), {
      maxDispatches: 1,
    });

    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0].task.id).toBe('safe');
  });
});
