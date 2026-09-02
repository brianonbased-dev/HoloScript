/**
 * MCP messaging must deliver through the durable team store.
 *
 * task_1785887810501_f56j: identity injection alone that writes a process-local
 * Map is silent non-delivery. These tests prove:
 *   1. caller-supplied `_agentId` is ignored when `__authAgentId` is stamped
 *   2. success writes teamMessageStore (same store GET /messages reads)
 *   3. the process-local Map stays empty on MCP success
 *   4. a second reader hydrating from team.messages (other process / replica)
 *      sees the DM
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleMessagingTool, getInbox, _resetMessageStore } from '../messaging';
import { teamStore, teamMessageStore, persistTeamDurable } from '../state';
import { mergeTeamMessagesById } from '../team-message-merge';
import type { TeamMessage } from '../types';

vi.mock('../state', () => {
  const teams = new Map();
  const teamStore = {
    get: (id: string) => teams.get(id),
    set: (id: string, team: unknown) => {
      teams.set(id, team);
      return teamStore;
    },
    delete: (id: string) => teams.delete(id),
    usesPostgres: false,
  };
  return {
    teamStore,
    teamMessageStore: new Map(),
    walletToAgent: new Map(),
    persistTeamDurable: vi.fn().mockResolvedValue(undefined),
    reloadTeam: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../team-room', () => ({
  broadcastToTeam: vi.fn(),
  broadcastToRoom: vi.fn(),
}));

const TEAM = 'team-durable-mcp';
const ALICE = { id: 'agent-alice', name: 'alice' };
const BOB = { id: 'agent-bob', name: 'bob' };
const JETSON = { id: 'agent_jetson_orin', name: 'jetson-orin-super' };
const GUEST = { id: 'agent-guest', name: 'guest' };

type TeamWithMessages = { messages?: TeamMessage[] };

function seedTeam() {
  teamStore.set(TEAM, {
    id: TEAM,
    name: 'Durable MCP Team',
    description: '',
    type: 'dev',
    visibility: 'private',
    ownerId: ALICE.id,
    ownerName: ALICE.name,
    members: [
      { agentId: ALICE.id, agentName: ALICE.name, role: 'owner', joinedAt: new Date().toISOString() },
      { agentId: BOB.id, agentName: BOB.name, role: 'member', joinedAt: new Date().toISOString() },
      {
        agentId: JETSON.id,
        agentName: JETSON.name,
        role: 'member',
        joinedAt: new Date().toISOString(),
      },
      {
        agentId: GUEST.id,
        agentName: GUEST.name,
        role: 'guest',
        joinedAt: new Date().toISOString(),
      },
    ],
    maxSlots: 8,
    waitlist: [],
    createdAt: new Date().toISOString(),
  } as never);
}

describe('MCP messaging durable team-store delivery', () => {
  beforeEach(() => {
    _resetMessageStore();
    teamMessageStore.delete(TEAM);
    teamStore.delete(TEAM);
    vi.mocked(persistTeamDurable).mockClear();
    seedTeam();
  });

  afterEach(() => {
    _resetMessageStore();
    teamMessageStore.delete(TEAM);
    teamStore.delete(TEAM);
  });

  it('refuses send when no injected identity is present', async () => {
    const result = (await handleMessagingTool('holomesh_send_message', {
      team_id: TEAM,
      to: JETSON.id,
      content: 'hello jetson',
    })) as { error?: string; success?: boolean };
    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/Authentication required/);
    expect(teamMessageStore.get(TEAM) || []).toHaveLength(0);
  });

  it('refuses send without team_id instead of writing the process-local Map', async () => {
    const result = (await handleMessagingTool('holomesh_send_message', {
      _agentId: ALICE.id,
      _agentName: ALICE.name,
      to: JETSON.id,
      content: 'hello jetson',
    })) as { error?: string };
    expect(result.error).toMatch(/team_id is required/);
    expect(getInbox(JETSON.id)).toHaveLength(0);
  });

  it('stamped principal wins over a caller-supplied _agentId (no impersonation)', async () => {
    const result = (await handleMessagingTool('holomesh_send_message', {
      __authAgentId: ALICE.id,
      _agentId: 'victim',
      _agentName: 'Victim',
      team_id: TEAM,
      to: JETSON.name,
      content: 'handoff for jetson',
    })) as { success: boolean; message: TeamMessage; store?: string };
    expect(result.success).toBe(true);
    expect(result.store).toBe('team-durable');
    expect(result.message.fromAgentId).toBe(ALICE.id);
    expect(result.message.fromAgentId).not.toBe('victim');
    expect(result.message.toAgentId).toBe(JETSON.id);
    expect(result.message.messageType).toBe('dm');
    expect(persistTeamDurable).toHaveBeenCalledWith(TEAM);
    expect((teamMessageStore.get(TEAM) || []).map((msg) => msg.content)).toContain(
      'handoff for jetson'
    );
  });

  it('MCP send is visible to another process hydrating from team.messages, not the local Map', async () => {
    const sent = (await handleMessagingTool('holomesh_send_message', {
      __authAgentId: ALICE.id,
      team_id: TEAM,
      to: JETSON.id,
      content: 'visible to jetson inbox',
      thread_id: 'thread-jetson-1',
    })) as { success: boolean; message: TeamMessage };

    expect(sent.success).toBe(true);
    expect(persistTeamDurable).toHaveBeenCalledWith(TEAM);
    expect((teamMessageStore.get(TEAM) || []).some((msg) => msg.content === 'visible to jetson inbox')).toBe(
      true
    );
    expect(getInbox(JETSON.id)).toHaveLength(0);

    const attached = (teamStore.get(TEAM) as TeamWithMessages).messages || [];
    expect(attached.some((msg) => msg.content === 'visible to jetson inbox')).toBe(true);

    // Simulate a different process: drop the side Map, keep only persisted team.messages.
    teamMessageStore.delete(TEAM);
    const otherProcessInbox = (await handleMessagingTool('holomesh_inbox', {
      __authAgentId: JETSON.id,
      team_id: TEAM,
    })) as { success: boolean; messages: TeamMessage[]; unread_count: number; store?: string };

    expect(otherProcessInbox.success).toBe(true);
    expect(otherProcessInbox.store).toBe('team-durable');
    expect(otherProcessInbox.messages.map((msg) => msg.content)).toContain(
      'visible to jetson inbox'
    );
    expect(otherProcessInbox.unread_count).toBeGreaterThanOrEqual(1);

    const thread = (await handleMessagingTool('holomesh_read_thread', {
      __authAgentId: JETSON.id,
      team_id: TEAM,
      thread_id: 'thread-jetson-1',
    })) as { success: boolean; count: number };
    expect(thread.success).toBe(true);
    expect(thread.count).toBeGreaterThanOrEqual(1);
  });

  it('does not clobber HTTP teamMessageStore rows with a stale team.messages snapshot', async () => {
    const httpOnly: TeamMessage = {
      id: 'msg_http_prior',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'http-first row',
      messageType: 'dm',
      createdAt: new Date().toISOString(),
      toAgentId: JETSON.id,
      toAgentName: JETSON.name,
    };
    teamMessageStore.set(TEAM, [httpOnly]);
    (teamStore.get(TEAM) as TeamWithMessages).messages = [];

    const inbox = (await handleMessagingTool('holomesh_inbox', {
      __authAgentId: JETSON.id,
      team_id: TEAM,
    })) as { success: boolean; messages: TeamMessage[] };
    expect(inbox.success).toBe(true);
    expect(inbox.messages.map((msg) => msg.content)).toContain('http-first row');
    expect((teamMessageStore.get(TEAM) || []).map((msg) => msg.id)).toContain('msg_http_prior');
  });

  it('warm replica inbox merges durable team.messages into a non-empty side map', async () => {
    const boot: TeamMessage = {
      id: 'msg_boot_local',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'already on this replica',
      messageType: 'handoff',
      createdAt: '2026-08-24T00:00:00.000Z',
      toAgentId: JETSON.id,
      toAgentName: JETSON.name,
    };
    const durableDm: TeamMessage = {
      id: 'msg_other_replica',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'jetson must see this',
      messageType: 'dm',
      createdAt: '2026-08-24T00:01:00.000Z',
      toAgentId: JETSON.id,
      toAgentName: JETSON.name,
    };
    teamMessageStore.set(TEAM, [boot]);
    (teamStore.get(TEAM) as TeamWithMessages).messages = [boot, durableDm];

    const inbox = (await handleMessagingTool('holomesh_inbox', {
      __authAgentId: JETSON.id,
      team_id: TEAM,
    })) as { success: boolean; messages: TeamMessage[] };
    expect(inbox.success).toBe(true);
    expect(inbox.messages.map((msg) => msg.content)).toContain('already on this replica');
    expect(inbox.messages.map((msg) => msg.content)).toContain('jetson must see this');
    expect((teamMessageStore.get(TEAM) || []).map((msg) => msg.id)).toEqual(
      expect.arrayContaining(['msg_boot_local', 'msg_other_replica'])
    );
  });

  it('merge by id keeps HTTP-only rows and lets durable overlay the same id', () => {
    const httpOnly: TeamMessage = {
      id: 'msg_http',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'http-only',
      messageType: 'dm',
      createdAt: '2026-08-24T00:00:00.000Z',
      toAgentId: JETSON.id,
    };
    const staleLocal: TeamMessage = {
      id: 'msg_shared',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'stale local',
      messageType: 'dm',
      createdAt: '2026-08-24T00:00:00.000Z',
      toAgentId: JETSON.id,
    };
    const durableShared: TeamMessage = {
      ...staleLocal,
      content: 'durable wins',
      createdAt: '2026-08-24T00:02:00.000Z',
    };
    const durableNew: TeamMessage = {
      id: 'msg_new',
      teamId: TEAM,
      fromAgentId: ALICE.id,
      fromAgentName: ALICE.name,
      content: 'from other replica',
      messageType: 'dm',
      createdAt: '2026-08-24T00:03:00.000Z',
      toAgentId: JETSON.id,
    };
    const merged = mergeTeamMessagesById([httpOnly, staleLocal], [durableShared, durableNew]);
    expect(merged.map((msg) => msg.id)).toEqual(['msg_http', 'msg_shared', 'msg_new']);
    expect(merged.find((msg) => msg.id === 'msg_shared')?.content).toBe('durable wins');
    expect(merged.find((msg) => msg.id === 'msg_http')?.content).toBe('http-only');
  });

  it('refuses send from a guest even when they are a team member', async () => {
    const result = (await handleMessagingTool('holomesh_send_message', {
      __authAgentId: GUEST.id,
      team_id: TEAM,
      to: JETSON.id,
      content: 'guest must not write',
    })) as { error?: string; success?: boolean };
    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/messages:write/);
    expect(teamMessageStore.get(TEAM) || []).toHaveLength(0);
  });

  it('refuses send from a non-member even when authenticated', async () => {
    const result = (await handleMessagingTool('holomesh_send_message', {
      __authAgentId: 'agent-stranger',
      team_id: TEAM,
      to: JETSON.id,
      content: 'should not land',
    })) as { error?: string; success?: boolean };
    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/messages:write/);
    expect(teamMessageStore.get(TEAM) || []).toHaveLength(0);
  });
});
