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
  scoreAgentForTask,
  matchAgentToTask,
  isClaimable,
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
});
