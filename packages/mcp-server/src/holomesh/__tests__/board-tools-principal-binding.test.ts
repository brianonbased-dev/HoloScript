/**
 * Slice A integration — the MCP board principal binding is actually WIRED into
 * the board mutation handlers (not just correct in the unit-tested resolver).
 * Drives real dispatch through handleBoardTool and asserts the handler rejects a
 * principal/agent_id mismatch under HOLOMESH_BOARD_BIND_SIGNER, before any claim/
 * suggest logic runs. (research/2026-07-26_holomesh-mcp-identity-gap.md, Slice A.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleBoardTool } from '../board-tools';
import { teamStore, teamPresenceStore } from '../state';

vi.mock('../state', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    persistTeamDurable: vi.fn().mockResolvedValue(undefined),
    reloadTeam: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../team-room', () => ({ broadcastToTeam: vi.fn() }));

const FLAG = 'HOLOMESH_BOARD_BIND_SIGNER';
const TEAM = 'sliceA-team';
const P = 'agent_seat_alice';
const MISMATCH = 'agent-id-not-bound-to-caller';

function seedTeam() {
  teamStore.set(TEAM, {
    id: TEAM,
    name: 'Slice A Team',
    ownerId: 'founder',
    ownerName: 'Founder',
    members: [{ agentId: 'founder', name: 'Founder', role: 'owner' }],
    maxSlots: 5,
    taskBoard: [{ id: 'task-1', title: 'T1', status: 'open', createdAt: new Date().toISOString() }],
    doneLog: [],
    createdAt: new Date().toISOString(),
  } as never);
}

const call = (name: string, args: Record<string, unknown>) =>
  handleBoardTool(name, { team_id: TEAM, ...args }) as Promise<Record<string, unknown>>;

const claimedBy = () =>
  (teamStore.get(TEAM) as unknown as { taskBoard: { claimedBy?: string }[] }).taskBoard[0]
    .claimedBy;

describe('Slice A — principal binding wired into board mutation handlers', () => {
  beforeEach(() => {
    teamStore.clear();
    teamPresenceStore.clear();
    delete process.env[FLAG];
    seedTeam();
  });
  afterEach(() => {
    delete process.env[FLAG];
    teamStore.clear();
    teamPresenceStore.clear();
  });

  it('claim: flag ON + agent_id != principal -> rejected before the claim gate, task not claimed', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_board_claim', {
      task_id: 'task-1',
      __authAgentId: P,
      agent_id: 'victim',
    });
    expect(r.error).toBe(MISMATCH);
    expect(claimedBy()).toBeUndefined();
  });

  it('claim: flag OFF + agent_id != principal -> NOT rejected by the binding', async () => {
    const r = await call('holomesh_board_claim', {
      task_id: 'task-1',
      __authAgentId: P,
      agent_id: 'victim',
    });
    expect(r.error).not.toBe(MISMATCH);
  });

  it('claim: no principal (stdio/local-trust) + agent_id -> NOT rejected even with flag ON', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_board_claim', { task_id: 'task-1', agent_id: 'claude1' });
    expect(r.error).not.toBe(MISMATCH);
  });

  it('complete: flag ON + agent_id != principal -> rejected', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_board_complete', {
      task_id: 'task-1',
      __authAgentId: P,
      agent_id: 'victim',
    });
    expect(r.error).toBe(MISMATCH);
  });

  it('append_commit: flag ON + agent_id != principal -> rejected', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_board_append_commit', {
      task_id: 'task-1',
      __authAgentId: P,
      agent_id: 'victim',
      commit: 'abc1234',
    });
    expect(r.error).toBe(MISMATCH);
  });

  it('suggest: flag ON + agent_id != principal -> rejected', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_suggest', {
      __authAgentId: P,
      agent_id: 'victim',
      content: 'a process idea',
      category: 'process',
    });
    expect(r.error).toBe(MISMATCH);
  });

  it('suggest_vote: flag ON + agent_id != principal -> rejected', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_suggest_vote', {
      __authAgentId: P,
      agent_id: 'victim',
      suggestion_id: 's1',
      vote: 'up',
    });
    expect(r.error).toBe(MISMATCH);
  });

  it('matching principal passes the binding (reaches handler logic, not the mismatch reject)', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_board_claim', {
      task_id: 'task-1',
      __authAgentId: P,
      agent_id: P,
    });
    expect(r.error).not.toBe(MISMATCH);
  });

  it('heartbeat: flag ON + agent_id != principal -> rejected, no presence row', async () => {
    process.env[FLAG] = '1';
    const r = await call('holomesh_heartbeat', {
      __authAgentId: P,
      agent_id: 'victim',
    });
    expect(r.error).toBe(MISMATCH);
    expect(teamPresenceStore.get(TEAM)?.size ?? 0).toBe(0);
  });

  it('heartbeat: principal + omitted agent_id lands under the seat, never mcp-agent', async () => {
    const r = await call('holomesh_heartbeat', { __authAgentId: P, ide_type: 'claude-code' });
    expect(r.success).toBe(true);
    expect((r.presence as { agentId: string }).agentId).toBe(P);
    expect(teamPresenceStore.get(TEAM)?.has(P)).toBe(true);
    expect(teamPresenceStore.get(TEAM)?.has('mcp-agent')).toBe(false);
  });
});
