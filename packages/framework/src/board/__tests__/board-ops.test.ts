import { describe, expect, it } from 'vitest';
import {
  addTasksToBoard,
  blockTask,
  evaluateBoardClaimGate,
  maintainBoard,
  normalizeTaskPriority,
  sweepBlockedTaskLifecycle,
} from '../board-ops';
import type { TeamTask } from '../board-types';

function task(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_1',
    title: 'Board task',
    description: 'Do the thing.\n\n## Done when:\n- Evidence exists.',
    status: 'open',
    priority: 4,
    prioritySortKey: 4,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('board operations phase-0 hygiene', () => {
  it('canonicalizes mixed priority vocabulary at task write time', () => {
    expect(normalizeTaskPriority('P1')).toMatchObject({ priority: 1, prioritySortKey: 1 });
    expect(normalizeTaskPriority('high')).toMatchObject({ priority: 2, prioritySortKey: 2 });
    expect(normalizeTaskPriority('normal')).toMatchObject({ priority: 4, prioritySortKey: 4 });
    expect(normalizeTaskPriority('low')).toMatchObject({ priority: 6, prioritySortKey: 6 });
    expect(normalizeTaskPriority(99)).toMatchObject({ priority: 10, prioritySortKey: 10 });

    const result = addTasksToBoard(
      [],
      [],
      [
        {
          title: 'mixed priority',
          description:
            'Mixed priority should canonicalize.\n\n## Done when:\n- Priority is numeric.',
          priority: 'P1' as never,
        },
      ]
    );
    expect(result.added[0]).toMatchObject({
      priority: 1,
      prioritySortKey: 1,
      priority_raw: 'P1',
    });
  });

  it('uses one claim gate for heartbeat, cap, and required tag failures', () => {
    const board = [
      task({ id: 'candidate', required_tags: ['edge'] }),
      task({ id: 'held', status: 'claimed', claimedBy: 'agent_a' }),
    ];

    expect(
      evaluateBoardClaimGate(board, {
        taskId: 'candidate',
        agentId: 'agent_a',
        hasFreshHeartbeat: false,
      })
    ).toMatchObject({ ok: false, status: 403, code: 'heartbeat_required' });

    expect(
      evaluateBoardClaimGate(board, {
        taskId: 'candidate',
        agentId: 'agent_a',
        hasFreshHeartbeat: true,
        claimCap: 1,
      })
    ).toMatchObject({ ok: false, status: 403, code: 'claim_cap_exceeded' });

    expect(
      evaluateBoardClaimGate(board, {
        taskId: 'candidate',
        agentId: 'agent_b',
        hasFreshHeartbeat: true,
        capabilityTags: ['browser'],
      })
    ).toMatchObject({
      ok: false,
      status: 403,
      code: 'capability_mismatch',
      missing_tags: ['edge'],
    });
  });

  it('runs priority backfill, claim TTL, and blocked lifecycle as one maintenance pass', () => {
    const now = Date.parse('2026-07-13T00:00:00.000Z');
    const board = [
      task({
        id: 'legacy_priority',
        priority: 'P1' as never,
        prioritySortKey: undefined,
        priority_raw: 'P1',
      }),
      task({
        id: 'expired_claim',
        status: 'claimed',
        claimedBy: 'stale-agent',
        claimedAt: '2026-07-11T00:00:00.000Z',
      }),
      task({
        id: 'legacy_claim',
        status: 'claimed',
        claimedBy: 'legacy-agent',
        claimedAt: undefined,
      }),
      task({
        id: 'blocked_old',
        status: 'blocked',
        blockedAt: '2026-07-05T00:00:00.000Z',
      }),
    ];

    const result = maintainBoard(board, { claimTtlMs: 24 * 60 * 60 * 1000, now });

    expect(result.priorityBackfilled.map((t) => t.id)).toEqual(['legacy_priority']);
    expect(board[0]).toMatchObject({ priority: 1, prioritySortKey: 1 });
    expect(board[0].priority_raw).toBeUndefined();
    expect(result.ttlReleased.map((t) => t.id)).toEqual(['expired_claim']);
    expect(board[1]).toMatchObject({ status: 'open', claimedBy: undefined });
    expect(result.ttlClockStarted.map((t) => t.id)).toEqual(['legacy_claim']);
    expect(board[2].claimedAt).toBe('2026-07-13T00:00:00.000Z');
    expect(result.changed).toBe(true);
    expect(result.blockedLifecycle.escalated.map((t) => t.id)).toEqual(['blocked_old']);
  });

  it('requires a reason and stamps blocked lifecycle fields', () => {
    const board = [task()];
    expect(blockTask(board, 'task_1')).toMatchObject({
      success: false,
      code: 'blocked_reason_required',
    });

    const result = blockTask(board, 'task_1', 'waiting on live credential rotation');
    expect(result.success).toBe(true);
    expect(result.task).toMatchObject({
      status: 'blocked',
      blockedReason: 'waiting on live credential rotation',
    });
    expect(Date.parse(result.task!.blockedAt!)).toBeGreaterThan(0);
  });

  it('lazily escalates and reopens stale blocked tasks', () => {
    const now = Date.parse('2026-07-13T00:00:00.000Z');
    const board = [
      task({
        id: 'eight_days',
        status: 'blocked',
        blockedAt: '2026-07-05T00:00:00.000Z',
      }),
      task({
        id: 'fifteen_days',
        status: 'blocked',
        blockedAt: '2026-06-28T00:00:00.000Z',
        claimedBy: 'stale-agent',
      }),
    ];

    const sweep = sweepBlockedTaskLifecycle(board, { now });
    expect(sweep.escalated.map((t) => t.id)).toEqual(['eight_days']);
    expect(sweep.reopened.map((t) => t.id)).toEqual(['fifteen_days']);
    expect(board[0].blockedEscalatedAt).toBe('2026-07-13T00:00:00.000Z');
    expect(board[1]).toMatchObject({
      status: 'open',
      blockedReopenedAt: '2026-07-13T00:00:00.000Z',
      claimedBy: undefined,
    });
  });
});
