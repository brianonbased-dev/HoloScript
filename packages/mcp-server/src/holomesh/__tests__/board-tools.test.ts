import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boardTools, handleBoardTool } from '../board-tools';
import { teamStore, teamPresenceStore, persistTeamDurable, reloadTeam } from '../state';

// Mock durable persistence to avoid file I/O in tests and assert await boundaries.
vi.mock('../state', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    persistTeamDurable: vi.fn().mockResolvedValue(undefined),
    reloadTeam: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock broadcastToTeam to avoid SSE in tests
vi.mock('../team-room', () => ({
  broadcastToTeam: vi.fn(),
}));

// ── Helper: create a team in the store ──

function seedTeam(teamId: string, overrides: Record<string, unknown> = {}) {
  const team = {
    id: teamId,
    name: 'Test Team',
    description: '',
    type: 'dev',
    visibility: 'private',
    ownerId: 'founder',
    ownerName: 'Founder',
    members: [{ agentId: 'founder', name: 'Founder', role: 'owner' }],
    maxSlots: 5,
    waitlist: [],
    createdAt: new Date().toISOString(),
    taskBoard: [],
    doneLog: [],
    mode: 'build',
    roomConfig: { objective: 'Ship features' },
    ...overrides,
  };
  teamStore.set(teamId, team as any);
  return team;
}

function deferred<T = void>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Tool Definition Tests ──

describe('boardTools definitions', () => {
  it('exports 15 tool definitions', () => {
    expect(boardTools).toHaveLength(15);
  });

  it('all tool names use expected holomesh prefixes', () => {
    for (const tool of boardTools) {
      expect(tool.name).toMatch(
        /^holomesh_(board_|slot_|mode_|scout|suggest|heartbeat|presence|knowledge_)/
      );
    }
  });

  const expectedTools = [
    'holomesh_board_list',
    'holomesh_board_add',
    'holomesh_board_done_log',
    'holomesh_board_claim',
    'holomesh_board_complete',
    'holomesh_board_append_commit',
    'holomesh_slot_assign',
    'holomesh_mode_set',
    'holomesh_scout',
    'holomesh_suggest',
    'holomesh_suggest_vote',
    'holomesh_suggest_list',
    'holomesh_heartbeat',
    'holomesh_presence',
    'holomesh_knowledge_read',
  ];

  it.each(expectedTools)('includes %s', (name) => {
    const tool = boardTools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect(tool!.description).toBeTruthy();
    expect(tool!.inputSchema).toBeDefined();
  });

  it('holomesh_board_list requires team_id', () => {
    const tool = boardTools.find((t) => t.name === 'holomesh_board_list')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
  });

  it('holomesh_board_add requires team_id and tasks', () => {
    const tool = boardTools.find((t) => t.name === 'holomesh_board_add')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
    expect(schema.required).toContain('tasks');
  });

  it('holomesh_board_done_log requires team_id', () => {
    const tool = boardTools.find((t) => t.name === 'holomesh_board_done_log')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
  });

  it('holomesh_board_claim requires team_id and task_id', () => {
    const tool = boardTools.find((t) => t.name === 'holomesh_board_claim')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
    expect(schema.required).toContain('task_id');
  });

  it('holomesh_mode_set requires team_id and mode', () => {
    const tool = boardTools.find((t) => t.name === 'holomesh_mode_set')!;
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain('team_id');
    expect(schema.required).toContain('mode');
  });
});

// ── Handler Dispatch Tests ──

describe('handleBoardTool', () => {
  it('returns null for unknown tool names', async () => {
    const result = await handleBoardTool('holomesh_unknown', {});
    expect(result).toBeNull();
  });

  it('returns null for non-board tool names', async () => {
    const result = await handleBoardTool('holomesh_discover', {});
    expect(result).toBeNull();
  });
});

// ── Validation Tests (missing required args) ──

describe('handleBoardTool validation', () => {
  it('holomesh_board_list returns error when team_id missing', async () => {
    const result = (await handleBoardTool('holomesh_board_list', {})) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/team_id/);
  });

  it('holomesh_board_add returns error when tasks missing', async () => {
    const result = (await handleBoardTool('holomesh_board_add', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/tasks/);
  });

  it('holomesh_board_add returns error when tasks is empty array', async () => {
    const result = (await handleBoardTool('holomesh_board_add', {
      team_id: 'test-team',
      tasks: [],
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/tasks/);
  });

  it('holomesh_board_claim returns error when task_id missing', async () => {
    const result = (await handleBoardTool('holomesh_board_claim', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/task_id/);
  });

  it('holomesh_board_done_log returns error when team_id missing', async () => {
    const result = (await handleBoardTool('holomesh_board_done_log', {})) as Record<
      string,
      unknown
    >;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/team_id/);
  });

  it('holomesh_board_complete returns error when task_id missing', async () => {
    const result = (await handleBoardTool('holomesh_board_complete', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/task_id/);
  });

  it('holomesh_slot_assign returns error when roles missing', async () => {
    const result = (await handleBoardTool('holomesh_slot_assign', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/roles/);
  });

  it('holomesh_mode_set returns error when mode missing', async () => {
    const result = (await handleBoardTool('holomesh_mode_set', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/mode/);
  });

  it('holomesh_suggest returns error when title missing', async () => {
    const result = (await handleBoardTool('holomesh_suggest', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/title/);
  });

  it('holomesh_suggest_vote returns error when suggestion_id missing', async () => {
    const result = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'test-team',
      value: 1,
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/suggestion_id/);
  });

  it('holomesh_suggest_vote returns error when value is invalid', async () => {
    const result = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'test-team',
      suggestion_id: 'sug_1',
      value: 0,
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toMatch(/1 or -1/);
  });
});

// ── In-Memory Store Tests ──

describe('handleBoardTool with in-memory store', () => {
  beforeEach(() => {
    teamStore.clear();
    teamPresenceStore.clear();
    vi.mocked(persistTeamDurable).mockClear();
    vi.mocked(persistTeamDurable).mockResolvedValue(undefined);
    vi.mocked(reloadTeam).mockClear();
    vi.mocked(reloadTeam).mockResolvedValue(undefined);
  });

  it('holomesh_board_list returns team not found for missing team', async () => {
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'nonexistent',
    })) as Record<string, unknown>;
    expect(result!.error).toMatch(/not found/i);
  });

  it('holomesh_board_list returns board state', async () => {
    seedTeam('team-abc', {
      taskBoard: [
        {
          id: 'legacy-priority',
          title: 'Legacy priority',
          description: 'Canonicalize me.\n\n## Done when:\n- Priority is numeric.',
          status: 'open',
          priority: 'P1',
          priority_raw: 'P1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'expired-claim',
          title: 'Expired claim',
          description: 'Release me.\n\n## Done when:\n- Claim returns to open.',
          status: 'claimed',
          priority: 4,
          prioritySortKey: 4,
          claimedBy: 'stale-agent',
          claimedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-abc',
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.board).toBeDefined();
    expect(reloadTeam).toHaveBeenCalledWith('team-abc');
    expect(result.board_maintenance).toEqual({
      priorityBackfilled: ['legacy-priority'],
      ttlReleased: ['expired-claim'],
      ttlClockStarted: [],
      blockedEscalated: [],
      blockedReopened: [],
    });
    const storedBoard = teamStore.get('team-abc')!.taskBoard!;
    expect(storedBoard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-priority',
          priority: 1,
          prioritySortKey: 1,
        }),
        expect.objectContaining({ id: 'expired-claim', status: 'open', claimedBy: undefined }),
      ])
    );
    expect(storedBoard.find((task) => task.id === 'legacy-priority')).not.toHaveProperty(
      'priority_raw'
    );
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');
  });

  it('holomesh_board_list omits limit/offset paging fields when limit is not passed (unbounded default)', async () => {
    seedTeam('team-big', {
      taskBoard: Array.from({ length: 12 }, (_, i) => ({
        id: `open-${i}`,
        title: `Open ${i}`,
        description: 'd',
        status: 'open' as const,
        priority: 5,
        prioritySortKey: 5,
        createdAt: new Date().toISOString(),
      })),
    });
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-big',
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    const board = result.board as { open: unknown[] };
    expect(board.open).toHaveLength(12);
    expect(result.paging).toBeUndefined();
    expect(result.board_totals).toEqual({ open: 12, claimed: 0, blocked: 0 });
  });

  it('holomesh_board_list pages each status bucket independently when limit is passed', async () => {
    seedTeam('team-big', {
      taskBoard: [
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `open-${i}`,
          title: `Open ${i}`,
          description: 'd',
          status: 'open' as const,
          priority: 5,
          prioritySortKey: 5,
          createdAt: new Date().toISOString(),
        })),
        {
          id: 'claimed-1',
          title: 'Claimed',
          description: 'd',
          status: 'claimed' as const,
          priority: 5,
          prioritySortKey: 5,
          claimedBy: 'agent-1',
          claimedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const page1 = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-big',
      limit: 5,
    })) as Record<string, unknown>;
    expect(page1.success).toBe(true);
    const board1 = page1.board as { open: unknown[]; claimed: unknown[] };
    expect(board1.open).toHaveLength(5);
    expect(board1.claimed).toHaveLength(1);
    expect(page1.board_totals).toEqual({ open: 12, claimed: 1, blocked: 0 });
    expect(page1.paging).toEqual({ limit: 5, offset: 0, hasMore: true });

    const page2 = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-big',
      limit: 5,
      offset: 5,
    })) as Record<string, unknown>;
    const board2 = page2.board as { open: unknown[] };
    expect(board2.open).toHaveLength(5);
    expect((page2.paging as Record<string, unknown>).hasMore).toBe(true);

    const page3 = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-big',
      limit: 5,
      offset: 10,
    })) as Record<string, unknown>;
    const board3 = page3.board as { open: unknown[] };
    expect(board3.open).toHaveLength(2);
    expect((page3.paging as Record<string, unknown>).hasMore).toBe(false);
  });

  it('holomesh_board_list status filter scopes to a single bucket', async () => {
    seedTeam('team-abc2', {
      taskBoard: [
        {
          id: 'o1',
          title: 'Open',
          description: 'd',
          status: 'open',
          priority: 5,
          prioritySortKey: 5,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'c1',
          title: 'Claimed',
          description: 'd',
          status: 'claimed',
          priority: 5,
          prioritySortKey: 5,
          claimedBy: 'a',
          claimedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-abc2',
      status: 'open',
    })) as Record<string, unknown>;
    const board = result.board as { open: unknown[]; claimed: unknown[]; blocked: unknown[] };
    expect(board.open).toHaveLength(1);
    expect(board.claimed).toHaveLength(0);
    expect(board.blocked).toHaveLength(0);
    expect(result.filtered_by_status).toBe('open');
  });

  it('holomesh_board_add adds tasks and persists', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Fix bug', priority: 2 }, { title: 'Add test' }],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');

    const tasks = result.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Fix bug');
  });

  it('holomesh_board_done_log returns paginated newest-first compact entries', async () => {
    seedTeam('team-abc', {
      doneLog: [
        {
          taskId: 'task-old',
          title: 'Old completion',
          completedBy: 'claude1',
          timestamp: '2026-01-01T00:00:00.000Z',
          summary: 'old summary',
          commitHash: 'aaa1111',
          verificationEvidence: 'old proof',
        },
        {
          taskId: 'task-mid',
          title: 'Middle completion',
          completedBy: 'codex1',
          completedByTag: 'codex-hardware',
          timestamp: '2026-01-02T00:00:00.000Z',
          summary: 'middle summary',
          commitHash: 'bbb2222',
          verificationEvidence: 'middle proof',
        },
        {
          taskId: 'task-new',
          title: 'Newest completion',
          completedBy: 'grok1',
          timestamp: '2026-01-03T00:00:00.000Z',
          summary: 'new summary',
          commitHash: 'ccc3333',
          verificationEvidence: 'new proof',
        },
      ],
    });

    const result = (await handleBoardTool('holomesh_board_done_log', {
      team_id: 'team-abc',
      limit: 2,
      offset: 1,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      teamId: 'team-abc',
      count: 3,
      returned: 2,
      offset: 1,
      limit: 2,
      hasMore: false,
    });
    expect(result.entries).toEqual([
      {
        id: 'task-mid',
        taskId: 'task-mid',
        title: 'Middle completion',
        completedAt: '2026-01-02T00:00:00.000Z',
        completedBy: 'codex1',
        completedByTag: 'codex-hardware',
        commitHash: 'bbb2222',
        verification_evidence: 'middle proof',
        verificationEvidence: 'middle proof',
        summary: 'middle summary',
      },
      {
        id: 'task-old',
        taskId: 'task-old',
        title: 'Old completion',
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'claude1',
        completedByTag: undefined,
        commitHash: 'aaa1111',
        verification_evidence: 'old proof',
        verificationEvidence: 'old proof',
        summary: 'old summary',
      },
    ]);
  });

  it('awaits durable persistence before returning from holomesh_board_add', async () => {
    seedTeam('team-abc');
    const durable = deferred<void>();
    vi.mocked(persistTeamDurable).mockReturnValueOnce(durable.promise);

    let settled = false;
    const pending = handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Durable write boundary' }],
    }).then((result) => {
      settled = true;
      return result as Record<string, unknown>;
    });

    await Promise.resolve();
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');
    expect(settled).toBe(false);

    durable.resolve();
    const result = await pending;
    expect(settled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('holomesh_board_claim claims an open task', async () => {
    seedTeam('team-abc');
    // Add a task first
    await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Task to claim' }],
    });

    const board = teamStore.get('team-abc')!.taskBoard!;
    const taskId = board[0].id;

    const result = (await handleBoardTool('holomesh_board_claim', {
      team_id: 'team-abc',
      task_id: taskId,
      agent_id: 'founder',
      agent_name: 'Founder',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');
  });

  it('holomesh_board_complete marks a claimed task done', async () => {
    seedTeam('team-abc');
    await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Task to complete' }],
    });

    const board = teamStore.get('team-abc')!.taskBoard!;
    const taskId = board[0].id;

    // Claim first
    await handleBoardTool('holomesh_board_claim', {
      team_id: 'team-abc',
      task_id: taskId,
      agent_id: 'founder',
      agent_name: 'Founder',
    });
    board.push({
      id: 'expired-during-complete',
      title: 'Expired during complete',
      description: 'Completion traffic releases this claim.\n\n## Done when:\n- Claim is open.',
      status: 'claimed',
      priority: 4,
      prioritySortKey: 4,
      createdAt: new Date().toISOString(),
      claimedBy: 'stale-agent',
      claimedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    // Complete
    const result = (await handleBoardTool('holomesh_board_complete', {
      team_id: 'team-abc',
      task_id: taskId,
      commit: 'abc123',
      summary: 'Fixed it',
      verification_evidence: 'vitest board-tools complete path passed',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');
    expect(teamStore.get('team-abc')!.taskBoard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'expired-during-complete', status: 'open' }),
      ])
    );
  });

  it('holomesh_board_claim rejects non-owner MCP claims without a fresh heartbeat', async () => {
    seedTeam('team-abc');
    await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Heartbeat gated MCP claim' }],
    });

    const board = teamStore.get('team-abc')!.taskBoard!;
    const taskId = board[0].id;
    board.push({
      id: 'expired-on-rejected-mcp-claim',
      title: 'Expired on rejected MCP claim',
      description: 'Release despite rejection.\n\n## Done when:\n- Claim returns to open.',
      status: 'claimed',
      priority: 4,
      prioritySortKey: 4,
      createdAt: new Date().toISOString(),
      claimedBy: 'stale-agent',
      claimedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });
    vi.mocked(persistTeamDurable).mockClear();
    const result = (await handleBoardTool('holomesh_board_claim', {
      team_id: 'team-abc',
      task_id: taskId,
      agent_id: 'agent-without-presence',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      code: 'heartbeat_required',
    });
    expect(board.find((task) => task.id === 'expired-on-rejected-mcp-claim')).toMatchObject({
      status: 'open',
      claimedBy: undefined,
    });
    expect(persistTeamDurable).toHaveBeenCalledWith('team-abc');
  });

  it('holomesh_board_claim enforces the same cap gate on the MCP path', async () => {
    seedTeam('team-abc', {
      taskBoard: [
        {
          id: 'held',
          title: 'held',
          description: 'held\n\n## Done when:\n- held',
          status: 'claimed',
          priority: 4,
          prioritySortKey: 4,
          createdAt: new Date().toISOString(),
          claimedBy: 'agent-cap',
        },
        {
          id: 'next',
          title: 'next',
          description: 'next\n\n## Done when:\n- next',
          status: 'open',
          priority: 4,
          prioritySortKey: 4,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    teamPresenceStore.set(
      'team-abc',
      new Map([
        [
          'agent-cap',
          {
            agentId: 'agent-cap',
            agentName: 'Agent Cap',
            status: 'online',
            lastHeartbeat: new Date().toISOString(),
            capabilityTags: [],
          } as never,
        ],
      ])
    );
    const previousCap = process.env.HOLOMESH_CLAIM_CAP;
    process.env.HOLOMESH_CLAIM_CAP = '1';
    try {
      const result = (await handleBoardTool('holomesh_board_claim', {
        team_id: 'team-abc',
        task_id: 'next',
        agent_id: 'agent-cap',
        agent_name: 'Agent Cap',
      })) as Record<string, unknown>;
      expect(result).toMatchObject({
        code: 'claim_cap_exceeded',
        active_claims: 1,
        claim_cap: 1,
      });
    } finally {
      if (previousCap === undefined) delete process.env.HOLOMESH_CLAIM_CAP;
      else process.env.HOLOMESH_CLAIM_CAP = previousCap;
    }
  });

  // ── holomesh_suggest / holomesh_suggest_vote agent attribution (regression) ──

  it('holomesh_suggest attributes proposedBy to the passed agent_id instead of hardcoded mcp-tool', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Attributed suggestion',
      agent_id: 'claude1',
      agent_name: 'Claude One',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const suggestion = result.suggestion as Record<string, unknown>;
    expect(suggestion.proposedBy).toBe('claude1');
    expect(suggestion.proposedByName).toBe('Claude One');
  });

  it('holomesh_suggest defaults proposedBy to mcp-agent when agent_id is omitted', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Unattributed suggestion',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const suggestion = result.suggestion as Record<string, unknown>;
    expect(suggestion.proposedBy).toBe('mcp-agent');
    expect(suggestion.proposedByName).toBe('mcp-agent');
  });

  it('holomesh_suggest_vote: two distinct agent_id votes both count instead of collapsing into one mcp-tool vote', async () => {
    seedTeam('team-abc');
    const created = (await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Suggestion needing real multi-agent votes',
      agent_id: 'claude1',
    })) as Record<string, unknown>;
    const suggestionId = (created.suggestion as Record<string, unknown>).id as string;

    const vote1 = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: suggestionId,
      value: 1,
      agent_id: 'claude1',
    })) as Record<string, unknown>;
    expect(vote1.success).toBe(true);
    expect((vote1.suggestion as Record<string, unknown>).votes as unknown[]).toHaveLength(1);
    expect((vote1.suggestion as Record<string, unknown>).score).toBe(1);

    // A second, DIFFERENT real agent voting must ADD a vote, not overwrite the first one.
    const vote2 = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: suggestionId,
      value: 1,
      agent_id: 'grok1',
    })) as Record<string, unknown>;
    expect(vote2.success).toBe(true);
    const votes = (vote2.suggestion as Record<string, unknown>).votes as Array<
      Record<string, unknown>
    >;
    expect(votes).toHaveLength(2);
    expect(votes.map((v) => v.agentId).sort()).toEqual(['claude1', 'grok1']);
    // Bug symptom: without agent_id threading, both calls hardcoded 'mcp-tool' and the
    // second vote replaced the first, leaving score stuck at 1 no matter how many agents voted.
    expect((vote2.suggestion as Record<string, unknown>).score).toBe(2);
  });

  it('holomesh_suggest_vote: the same agent_id voting twice still replaces its own prior vote', async () => {
    seedTeam('team-abc');
    const created = (await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Suggestion for vote-change test',
      agent_id: 'claude1',
    })) as Record<string, unknown>;
    const suggestionId = (created.suggestion as Record<string, unknown>).id as string;

    await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: suggestionId,
      value: 1,
      agent_id: 'claude1',
    });
    const changed = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: suggestionId,
      value: -1,
      agent_id: 'claude1',
    })) as Record<string, unknown>;

    const votes = (changed.suggestion as Record<string, unknown>).votes as unknown[];
    expect(votes).toHaveLength(1);
    expect((changed.suggestion as Record<string, unknown>).score).toBe(-1);
  });

  it('holomesh_suggest_vote defaults voter attribution to mcp-agent when agent_id is omitted', async () => {
    seedTeam('team-abc');
    const created = (await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Suggestion for default-voter test',
      agent_id: 'claude1',
    })) as Record<string, unknown>;
    const suggestionId = (created.suggestion as Record<string, unknown>).id as string;

    const result = (await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: suggestionId,
      value: 1,
    })) as Record<string, unknown>;

    const votes = (result.suggestion as Record<string, unknown>).votes as Array<
      Record<string, unknown>
    >;
    expect(votes).toHaveLength(1);
    expect(votes[0].agentId).toBe('mcp-agent');
  });

  it('holomesh_mode_set changes team mode', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_mode_set', {
      team_id: 'team-abc',
      mode: 'audit',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.mode).toBe('audit');
    expect(teamStore.get('team-abc')!.mode).toBe('audit');
  });

  it('holomesh_slot_assign sets roles', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_slot_assign', {
      team_id: 'team-abc',
      roles: ['coder', 'tester', 'flex'],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.roles).toEqual(['coder', 'tester', 'flex']);
  });

  it('holomesh_heartbeat refuses the synthetic mcp-agent default and writes no presence row', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_heartbeat', {
      team_id: 'team-abc',
      agent_name: 'test-agent',
      ide_type: 'claude-code',
    })) as Record<string, unknown>;

    expect(result.success).not.toBe(true);
    expect(result.error).toBe('unregistered-agent-id');
    expect(result.code).toBe('unregistered_agent_id');
    expect(teamPresenceStore.get('team-abc')?.has('mcp-agent') ?? false).toBe(false);
    expect(teamPresenceStore.get('team-abc')?.size ?? 0).toBe(0);
  });

  it('holomesh_heartbeat with explicit mcp-agent is refused', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_heartbeat', {
      team_id: 'team-abc',
      agent_id: 'mcp-agent',
    })) as Record<string, unknown>;

    expect(result.error).toBe('unregistered-agent-id');
    expect(teamPresenceStore.get('team-abc')?.size ?? 0).toBe(0);
  });

  it('holomesh_heartbeat lands under a provisioned agent_id (stdio local-trust)', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_heartbeat', {
      team_id: 'team-abc',
      agent_id: 'claude1',
      agent_name: 'Claude One',
      ide_type: 'claude-code',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.online_count).toBe(1);
    const presence = result.presence as { agentId: string; agentName: string };
    expect(presence.agentId).toBe('claude1');
    expect(presence.agentName).toBe('Claude One');
    expect(teamPresenceStore.get('team-abc')?.has('claude1')).toBe(true);
    expect(teamPresenceStore.get('team-abc')?.has('mcp-agent')).toBe(false);
  });

  it('holomesh_heartbeat with authenticated principal omits agent_id and lands under the seat', async () => {
    seedTeam('team-abc');
    const seat = 'agent_1776836330760_kmjr';
    const result = (await handleBoardTool('holomesh_heartbeat', {
      team_id: 'team-abc',
      __authAgentId: seat,
      ide_type: 'claude-code',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.online_count).toBe(1);
    const presence = result.presence as { agentId: string };
    expect(presence.agentId).toBe(seat);
    expect(teamPresenceStore.get('team-abc')?.has(seat)).toBe(true);
    expect(teamPresenceStore.get('team-abc')?.has('mcp-agent')).toBe(false);
  });

  // ── holomesh_scout regression tests (self-derivation guard) ──

  it('holomesh_scout parses valid grep output into tasks', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_scout', {
      team_id: 'team-abc',
      todo_content: [
        'src/auth.ts:42: // TODO: add rate limiting',
        'src/db.ts:100: // FIXME: connection pool leak',
      ].join('\n'),
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.tasks_added).toBe(2);
    const tasks = result.tasks as Array<Record<string, unknown>>;
    expect(tasks[0].title).toContain('TODO:');
    expect(tasks[1].title).toContain('FIXME:');
    expect(tasks[1].priority).toBe(2); // FIXME = priority 2
  });

  it('holomesh_scout produces 0 tasks from board-tools.ts grep output (self-derivation guard)', async () => {
    seedTeam('team-abc');
    // Simulate grep output lines that come from the scanner's own implementation file.
    // These must never become board tasks.
    const boardToolsLines = [
      "packages/mcp-server/src/holomesh/board-tools.ts:210:    description: 'Pass grep TODO/FIXME output as todo_content',",
      "packages/mcp-server/src/holomesh/board-tools.ts:576:      .filter(l => l.includes('TODO:') || l.includes('FIXME:'))",
      "packages/mcp-server/src/holomesh/board-tools.ts:578:        title: l.includes('TODO:') ? 'TODO:' : 'FIXME:'",
    ].join('\n');

    const result = (await handleBoardTool('holomesh_scout', {
      team_id: 'team-abc',
      todo_content: boardToolsLines,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.tasks_added).toBe(0);
  });

  it('holomesh_scout produces 0 tasks from *.test.ts grep output (fixture guard)', async () => {
    seedTeam('team-abc');
    // Test fixture lines must never become board tasks.
    const testLines = [
      "packages/mcp-server/src/holomesh/__tests__/code-health-tools.test.ts:134:      const line = '// TODO: fix this';",
      "packages/framework/src/__tests__/framework.test.ts:171:      'src/foo.ts:1: // TODO: dummy',",
    ].join('\n');

    const result = (await handleBoardTool('holomesh_scout', {
      team_id: 'team-abc',
      todo_content: testLines,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.tasks_added).toBe(0);
  });

  it('holomesh_scout ignores TODO inside string literals (unanchored false-positive guard)', async () => {
    seedTeam('team-abc');
    // A line where TODO appears inside a string/code, not as a comment — must not become a task.
    const codeLines = [
      "src/api.ts:55:    if (l.includes('TODO:')) { /* in a string */ }",
      'src/types.ts:12:  // format-doc: TODO: message format',
    ].join('\n');

    const result = (await handleBoardTool('holomesh_scout', {
      team_id: 'team-abc',
      todo_content: codeLines,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.tasks_added).toBe(0);
  });
});
