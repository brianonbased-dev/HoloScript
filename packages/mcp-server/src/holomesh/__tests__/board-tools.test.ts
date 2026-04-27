import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boardTools, handleBoardTool } from '../board-tools';
import { teamStore, teamPresenceStore, persistTeamStore } from '../state';

// Mock persistTeamStore to avoid file I/O in tests
vi.mock('../state', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    persistTeamStore: vi.fn(),
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

// ── Tool Definition Tests ──

describe('boardTools definitions', () => {
  it('exports 12 tool definitions', () => {
    expect(boardTools).toHaveLength(12);
  });

  it('all tool names use expected holomesh prefixes', () => {
    for (const tool of boardTools) {
      expect(tool.name).toMatch(/^holomesh_(board_|slot_|mode_|scout|suggest|heartbeat|knowledge_)/);
    }
  });

  const expectedTools = [
    'holomesh_board_list',
    'holomesh_board_add',
    'holomesh_board_claim',
    'holomesh_board_complete',
    'holomesh_slot_assign',
    'holomesh_mode_set',
    'holomesh_scout',
    'holomesh_suggest',
    'holomesh_suggest_vote',
    'holomesh_suggest_list',
    'holomesh_heartbeat',
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
  });

  it('holomesh_board_list returns team not found for missing team', async () => {
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'nonexistent',
    })) as Record<string, unknown>;
    expect(result!.error).toMatch(/not found/i);
  });

  it('holomesh_board_list returns board state', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-abc',
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.board).toBeDefined();
  });

  it('holomesh_board_add adds tasks and persists', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Fix bug', priority: 2 }, { title: 'Add test' }],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(persistTeamStore).toHaveBeenCalled();

    const tasks = result.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Fix bug');
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
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(persistTeamStore).toHaveBeenCalled();
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
    });

    // Complete
    const result = (await handleBoardTool('holomesh_board_complete', {
      team_id: 'team-abc',
      task_id: taskId,
      commit: 'abc123',
      summary: 'Fixed it',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(persistTeamStore).toHaveBeenCalled();
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

  it('holomesh_heartbeat creates presence entry', async () => {
    seedTeam('team-abc');
    const result = (await handleBoardTool('holomesh_heartbeat', {
      team_id: 'team-abc',
      agent_name: 'test-agent',
      ide_type: 'claude-code',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.online_count).toBe(1);
    expect(teamPresenceStore.get('team-abc')?.size).toBe(1);
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
      "src/types.ts:12:  // format-doc: TODO: message format",
    ].join('\n');

    const result = (await handleBoardTool('holomesh_scout', {
      team_id: 'team-abc',
      todo_content: codeLines,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.tasks_added).toBe(0);
  });
});
