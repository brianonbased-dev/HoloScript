import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
} from '../agent/team-agents';
import type { TeamAgentProfile } from '../agent/team-agents';
import {
  assignAgentsToRoom,
  runAgentCycle,
  compoundKnowledge,
  getRoomAgents,
  getRoomCycleHistory,
  removeAgentFromRoom,
  clearRoom,
  _resetState,
} from '../agent/team-coordinator';
import { teamAgentTools, handleTeamAgentTool } from '../team-agent-tools';

// ── Agent Profile Tests ──

describe('TeamAgentProfiles', () => {
  it('has 4 built-in agent profiles', () => {
    expect(TEAM_AGENT_PROFILES.size).toBe(4);
  });

  it('all profiles have required fields', () => {
    for (const profile of getAllProfiles()) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.role).toBeTruthy();
      expect(profile.capabilities.length).toBeGreaterThan(0);
      expect(profile.model).toBeTruthy();
      expect(profile.provider).toBeTruthy();
      expect(profile.claimFilter.roles.length).toBeGreaterThan(0);
      expect(profile.claimFilter.maxPriority).toBeGreaterThan(0);
      expect(profile.systemPrompt).toBeTruthy();
      expect(profile.knowledgeDomains.length).toBeGreaterThan(0);
    }
  });

  it('Brittney is an architect with reviewer/coder claim roles', () => {
    expect(BRITTNEY_AGENT.role).toBe('architect');
    expect(BRITTNEY_AGENT.claimFilter.roles).toContain('coder');
    expect(BRITTNEY_AGENT.claimFilter.roles).toContain('reviewer');
    expect(BRITTNEY_AGENT.provider).toBe('anthropic');
  });

  it('Daemon is a coder with coder/tester claim roles', () => {
    expect(DAEMON_AGENT.role).toBe('coder');
    expect(DAEMON_AGENT.claimFilter.roles).toContain('coder');
    expect(DAEMON_AGENT.claimFilter.roles).toContain('tester');
  });

  it('Absorb is a researcher with researcher claim role', () => {
    expect(ABSORB_AGENT.role).toBe('researcher');
    expect(ABSORB_AGENT.claimFilter.roles).toContain('researcher');
    expect(ABSORB_AGENT.knowledgeDomains.length).toBeGreaterThanOrEqual(5);
  });

  it('Oracle is a reviewer with reviewer claim role', () => {
    expect(ORACLE_AGENT.role).toBe('reviewer');
    expect(ORACLE_AGENT.claimFilter.roles).toContain('reviewer');
  });

  it('getProfileById returns correct profile', () => {
    expect(getProfileById('agent_brittney')).toBe(BRITTNEY_AGENT);
    expect(getProfileById('agent_daemon')).toBe(DAEMON_AGENT);
    expect(getProfileById('nonexistent')).toBeUndefined();
  });

  it('getProfilesByClaimRole finds agents for coder role', () => {
    const coders = getProfilesByClaimRole('coder');
    expect(coders.length).toBeGreaterThanOrEqual(2); // Brittney + Daemon
    expect(coders.some((p) => p.id === 'agent_brittney')).toBe(true);
    expect(coders.some((p) => p.id === 'agent_daemon')).toBe(true);
  });

  it('getProfilesByClaimRole finds agents for researcher role', () => {
    const researchers = getProfilesByClaimRole('researcher');
    expect(researchers.length).toBeGreaterThanOrEqual(1);
    expect(researchers.some((p) => p.id === 'agent_absorb')).toBe(true);
  });

  it('getProfilesByDomain finds agents for security domain', () => {
    const secAgents = getProfilesByDomain('security');
    expect(secAgents.length).toBeGreaterThanOrEqual(2); // Absorb + Oracle
  });

  it('getProfilesByDomain returns empty for unknown domain', () => {
    expect(getProfilesByDomain('quantum-cooking')).toHaveLength(0);
  });

  it('all agent IDs are unique', () => {
    const ids = getAllProfiles().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no profile uses "any" as model (strict TypeScript agents)', () => {
    for (const p of getAllProfiles()) {
      expect(p.model).not.toBe('any');
    }
  });
});

// ── Team Coordinator Tests ──

describe('TeamCoordinator', () => {
  beforeEach(() => {
    _resetState();
  });

  it('assignAgentsToRoom loads agents into a room', () => {
    const result = assignAgentsToRoom('room-1', ['agent_brittney', 'agent_daemon']);
    expect(result.roomId).toBe('room-1');
    expect(result.loaded).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.loaded[0].agentName).toBe('Brittney');
    expect(result.loaded[1].agentName).toBe('Daemon');
  });

  it('assignAgentsToRoom skips unknown profile IDs', () => {
    const result = assignAgentsToRoom('room-1', ['agent_brittney', 'unknown_agent']);
    expect(result.loaded).toHaveLength(1);
    expect(result.skipped).toContain('unknown_agent');
  });

  it('assignAgentsToRoom skips already-loaded agents', () => {
    assignAgentsToRoom('room-1', ['agent_brittney']);
    const result = assignAgentsToRoom('room-1', ['agent_brittney', 'agent_daemon']);
    expect(result.loaded).toHaveLength(1); // only Daemon is new
    expect(result.skipped).toContain('agent_brittney');
  });

  it('getRoomAgents returns all agents in a room', () => {
    assignAgentsToRoom('room-1', ['agent_brittney', 'agent_oracle']);
    const agents = getRoomAgents('room-1');
    expect(agents).toHaveLength(2);
  });

  it('getRoomAgents returns empty for unknown room', () => {
    expect(getRoomAgents('nonexistent')).toHaveLength(0);
  });

  it('removeAgentFromRoom removes the agent', () => {
    assignAgentsToRoom('room-1', ['agent_brittney', 'agent_daemon']);
    const removed = removeAgentFromRoom('room-1', 'agent_brittney');
    expect(removed).toBe(true);
    expect(getRoomAgents('room-1')).toHaveLength(1);
  });

  it('removeAgentFromRoom returns false for nonexistent agent', () => {
    assignAgentsToRoom('room-1', ['agent_brittney']);
    expect(removeAgentFromRoom('room-1', 'agent_nonexistent')).toBe(false);
  });

  it('clearRoom removes all agents and history', () => {
    assignAgentsToRoom('room-1', ['agent_brittney']);
    clearRoom('room-1');
    expect(getRoomAgents('room-1')).toHaveLength(0);
    expect(getRoomCycleHistory('room-1')).toHaveLength(0);
  });

  it('assignAgentsToRoom maps architect role to reviewer slot', () => {
    const result = assignAgentsToRoom('room-1', ['agent_brittney']);
    expect(result.loaded[0].role).toBe('reviewer');
  });

  it('assignAgentsToRoom maps coder role to coder slot', () => {
    const result = assignAgentsToRoom('room-1', ['agent_daemon']);
    expect(result.loaded[0].role).toBe('coder');
  });

  it('assignAgentsToRoom maps researcher role to researcher slot', () => {
    const result = assignAgentsToRoom('room-1', ['agent_absorb']);
    expect(result.loaded[0].role).toBe('researcher');
  });
});

// ── Cycle Tests (mocked HTTP) ──

describe('TeamCoordinator work cycle', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    _resetState();
    process.env.MCP_API_KEY = 'test-key-123';
    process.env.HOLOMESH_API_KEY = 'test-key-123';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.HOLOSCRIPT_SERVER_URL = 'http://localhost:9999';
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MCP_API_KEY;
    delete process.env.HOLOMESH_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HOLOSCRIPT_SERVER_URL;
  });

  it('runAgentCycle returns empty results when no agents loaded', async () => {
    const results = await runAgentCycle('empty-room');
    expect(results).toHaveLength(0);
  });

  it('runAgentCycle processes agents against open tasks', async () => {
    assignAgentsToRoom('room-1', ['agent_daemon']);

    // Mock board list response
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          board: {
            open: [
              {
                id: 'task_1',
                title: 'Fix type error in parser',
                description: 'The parser has a type mismatch',
                status: 'open',
                priority: 3,
                role: 'coder',
              },
            ],
            claimed: [],
            blocked: [],
          },
        }),
    });

    // Mock claim response
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          task: { id: 'task_1', status: 'claimed' },
        }),
    });

    // Mock LLM response (framework Team calls Anthropic API during executeTask)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              text: 'SUMMARY: Fixed the type error\nKNOWLEDGE:\n- [gotcha] Parser needs strict null checks',
            },
          ],
          usage: { output_tokens: 50 },
        }),
    });

    // Mock complete response
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          task: { id: 'task_1', status: 'done' },
        }),
    });

    const results = await runAgentCycle('room-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('completed');
    expect(results[0].agentName).toBe('Daemon');
    expect(results[0].taskId).toBe('task_1');
    // Knowledge extraction tested in framework protocol-agent tests
    expect(results[0].knowledgeEntries).toBeDefined();
  });

  it('runAgentCycle skips agents with no matching tasks', async () => {
    assignAgentsToRoom('room-1', ['agent_absorb']);

    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          board: {
            open: [
              {
                id: 'task_1',
                title: 'Code review',
                description: 'Review PR',
                status: 'open',
                priority: 3,
                role: 'reviewer',
              },
            ],
            claimed: [],
            blocked: [],
          },
        }),
    });

    const results = await runAgentCycle('room-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('skipped');
  });

  it('runAgentCycle respects priority filter', async () => {
    // Oracle has maxPriority=5, so a priority=8 task should be skipped
    assignAgentsToRoom('room-1', ['agent_oracle']);

    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          board: {
            open: [
              {
                id: 'task_1',
                title: 'Low priority review',
                description: '',
                status: 'open',
                priority: 8,
                role: 'reviewer',
              },
            ],
            claimed: [],
            blocked: [],
          },
        }),
    });

    const results = await runAgentCycle('room-1');
    expect(results[0].action).toBe('skipped');
  });

  it('runAgentCycle prevents two agents from claiming the same task', async () => {
    assignAgentsToRoom('room-1', ['agent_brittney', 'agent_daemon']);

    // Board has only one coder task — both Brittney and Daemon can claim coder
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          board: {
            open: [
              {
                id: 'task_1',
                title: 'Fix bug',
                description: '',
                status: 'open',
                priority: 3,
                role: 'coder',
              },
            ],
            claimed: [],
            blocked: [],
          },
        }),
    });

    // Claim + LLM + complete for the first agent that grabs it
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, task: { id: 'task_1', status: 'claimed' } }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: 'SUMMARY: Fixed bug' }],
          usage: { output_tokens: 20 },
        }),
    });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, task: { id: 'task_1', status: 'done' } }),
    });

    const results = await runAgentCycle('room-1');
    const completed = results.filter((r) => r.action === 'completed');
    const skipped = results.filter((r) => r.action === 'skipped');
    expect(completed).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('runAgentCycle handles board fetch error gracefully', async () => {
    assignAgentsToRoom('room-1', ['agent_daemon']);

    // Board returns error — framework interprets as empty board, agents skip
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    const results = await runAgentCycle('room-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('skipped');
  });

  it('cycle history is stored and retrievable', async () => {
    assignAgentsToRoom('room-1', ['agent_daemon']);

    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          board: { open: [], claimed: [], blocked: [] },
        }),
    });

    await runAgentCycle('room-1');
    const history = getRoomCycleHistory('room-1');
    expect(history).toHaveLength(1);
  });
});

// ── Compound Knowledge Tests ──

describe('compoundKnowledge', () => {
  beforeEach(() => {
    _resetState();
  });

  it('returns empty result for room with no agents', () => {
    const result = compoundKnowledge('empty-room');
    expect(result.agentsInvolved).toHaveLength(0);
    expect(result.insightsShared).toBe(0);
    expect(result.crossReferences).toBe(0);
  });

  it('returns result with agents but zero insights when no cycle has run', () => {
    assignAgentsToRoom('room-1', ['agent_brittney', 'agent_daemon']);
    const result = compoundKnowledge('room-1');
    expect(result.agentsInvolved).toHaveLength(2);
    expect(result.insightsShared).toBe(0);
    expect(result.crossReferences).toBe(0);
    expect(result.timestamp).toBeTruthy();
  });
});

// ── MCP Tool Definition Tests ──

describe('teamAgentTools definitions', () => {
  it('exports 3 tool definitions', () => {
    expect(teamAgentTools).toHaveLength(3);
  });

  it('all tool names start with holomesh_team_', () => {
    for (const tool of teamAgentTools) {
      expect(tool.name).toMatch(/^holomesh_team_/);
    }
  });

  const expectedTools = [
    'holomesh_team_load_agents',
    'holomesh_team_run_cycle',
    'holomesh_team_compound',
  ];

  it.each(expectedTools)('includes %s', (name) => {
    const tool = teamAgentTools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect(tool!.description).toBeTruthy();
    expect(tool!.inputSchema).toBeDefined();
  });

  it('holomesh_team_load_agents requires team_id', () => {
    const tool = teamAgentTools.find((t) => t.name === 'holomesh_team_load_agents')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
  });

  it('holomesh_team_run_cycle requires team_id', () => {
    const tool = teamAgentTools.find((t) => t.name === 'holomesh_team_run_cycle')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
  });

  it('holomesh_team_compound requires team_id', () => {
    const tool = teamAgentTools.find((t) => t.name === 'holomesh_team_compound')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
  });
});

// ── MCP Tool Handler Tests ──

describe('handleTeamAgentTool', () => {
  beforeEach(() => {
    _resetState();
  });

  it('returns null for unknown tool names', async () => {
    const result = await handleTeamAgentTool('holomesh_unknown', {});
    expect(result).toBeNull();
  });

  it('holomesh_team_load_agents returns error when team_id missing', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_load_agents', {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toMatch(/team_id/);
  });

  it('holomesh_team_load_agents loads all agents when no agent_ids given', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_load_agents', {
      team_id: 'room-1',
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.totalAgentsInRoom).toBe(4);
  });

  it('holomesh_team_load_agents loads specific agents', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_load_agents', {
      team_id: 'room-1',
      agent_ids: ['agent_brittney', 'agent_daemon'],
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.totalAgentsInRoom).toBe(2);
  });

  it('holomesh_team_load_agents returns error for unknown agent IDs', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_load_agents', {
      team_id: 'room-1',
      agent_ids: ['agent_brittney', 'agent_unknown'],
    })) as Record<string, unknown>;
    expect(result.error).toMatch(/Unknown agent profile/);
  });

  it('holomesh_team_run_cycle returns error when no agents loaded', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_run_cycle', {
      team_id: 'empty-room',
    })) as Record<string, unknown>;
    expect(result.error).toMatch(/No agents loaded/);
  });

  it('holomesh_team_run_cycle returns error when team_id missing', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_run_cycle', {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toMatch(/team_id/);
  });

  it('holomesh_team_compound returns error when team_id missing', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_compound', {})) as Record<
      string,
      unknown
    >;
    expect(result.error).toMatch(/team_id/);
  });

  it('holomesh_team_compound returns error when no agents loaded', async () => {
    const result = (await handleTeamAgentTool('holomesh_team_compound', {
      team_id: 'empty-room',
    })) as Record<string, unknown>;
    expect(result.error).toMatch(/No agents loaded/);
  });

  it('holomesh_team_compound succeeds with loaded agents', async () => {
    await handleTeamAgentTool('holomesh_team_load_agents', { team_id: 'room-1' });
    const result = (await handleTeamAgentTool('holomesh_team_compound', {
      team_id: 'room-1',
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.agentsInvolved).toHaveLength(4);
  });
});
