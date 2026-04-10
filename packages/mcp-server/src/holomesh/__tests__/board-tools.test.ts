import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { boardTools, handleBoardTool } from '../board-tools';

// ── Tool Definition Tests ──

describe('boardTools definitions', () => {
  it('exports 10 tool definitions', () => {
    expect(boardTools).toHaveLength(10);
  });

  it('all tool names use expected holomesh prefixes', () => {
    for (const tool of boardTools) {
      expect(tool.name).toMatch(/^holomesh_(board_|slot_|mode_|scout|suggest)/);
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

// ── Validation Tests (no API key = immediate error) ──

describe('handleBoardTool validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HOLOMESH_API_KEY;
    delete process.env.MCP_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

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

  it('holomesh_board_list returns error when no key set', async () => {
    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'test-team',
    })) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result!.error).toBeTruthy();
  });
});

// ── HTTP Fetch Tests (mocked) ──

describe('handleBoardTool with mocked fetch', () => {
  const originalEnv = { ...process.env };
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env.MCP_API_KEY = 'test-key-123';
    process.env.HOLOSCRIPT_SERVER_URL = 'http://localhost:9999';
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('holomesh_board_list calls GET /api/holomesh/team/:id/board', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, board: { open: [], claimed: [], blocked: [] } }),
    });

    const result = await handleBoardTool('holomesh_board_list', { team_id: 'team-abc' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/board',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ success: true, board: { open: [], claimed: [], blocked: [] } });
  });

  it('holomesh_board_add delegates to framework Team.addTasks', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({ success: true, added: 1, tasks: [{ id: 'task_1', title: 'Fix bug' }] }),
    });

    const result = (await handleBoardTool('holomesh_board_add', {
      team_id: 'team-abc',
      tasks: [{ title: 'Fix bug', priority: 2 }],
    })) as Record<string, unknown>;

    // Framework Team.addTasks delegates to the same POST endpoint internally
    expect(mockFetch).toHaveBeenCalled();
    expect(result.tasks).toBeDefined();
  });

  it('holomesh_board_claim calls PATCH with action=claim', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, task: { id: 'task_1', status: 'claimed' } }),
    });

    await handleBoardTool('holomesh_board_claim', {
      team_id: 'team-abc',
      task_id: 'task_1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/board/task_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'claim' }),
      })
    );
  });

  it('holomesh_board_complete calls PATCH with action=done', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, task: { id: 'task_1', status: 'done' } }),
    });

    await handleBoardTool('holomesh_board_complete', {
      team_id: 'team-abc',
      task_id: 'task_1',
      commit: 'abc123',
      summary: 'Fixed the bug',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/board/task_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'done', commit: 'abc123', summary: 'Fixed the bug' }),
      })
    );
  });

  it('holomesh_slot_assign calls PATCH /roles', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, roles: ['coder', 'tester', 'flex'] }),
    });

    await handleBoardTool('holomesh_slot_assign', {
      team_id: 'team-abc',
      roles: ['coder', 'tester', 'flex'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/roles',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ roles: ['coder', 'tester', 'flex'] }),
      })
    );
  });

  it('holomesh_mode_set calls POST /mode', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, mode: 'audit', objective: 'Fix all issues' }),
    });

    await handleBoardTool('holomesh_mode_set', {
      team_id: 'team-abc',
      mode: 'audit',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/mode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mode: 'audit' }),
      })
    );
  });

  it('holomesh_suggest calls POST /suggestions', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, suggestion: { id: 'sug_1', status: 'open' } }),
    });

    await handleBoardTool('holomesh_suggest', {
      team_id: 'team-abc',
      title: 'Add shared lint profile',
      category: 'tooling',
      evidence: 'Repeated lint drift across packages',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/suggestions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Add shared lint profile',
          category: 'tooling',
          evidence: 'Repeated lint drift across packages',
        }),
      })
    );
  });

  it('holomesh_suggest_vote calls PATCH /suggestions/:id with action=vote', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, suggestion: { id: 'sug_1', score: 2 } }),
    });

    await handleBoardTool('holomesh_suggest_vote', {
      team_id: 'team-abc',
      suggestion_id: 'sug_1',
      value: 1,
      reason: 'Strong leverage',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/suggestions/sug_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'vote', value: 1, reason: 'Strong leverage' }),
      })
    );
  });

  it('holomesh_suggest_list calls GET /suggestions with optional status filter', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, suggestions: [] }),
    });

    await handleBoardTool('holomesh_suggest_list', {
      team_id: 'team-abc',
      status: 'open',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team-abc/suggestions?status=open',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = (await handleBoardTool('holomesh_board_list', {
      team_id: 'team-abc',
    })) as Record<string, unknown>;

    expect(result!.error).toBeTruthy();
  });

  it('sends Authorization header with API key', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await handleBoardTool('holomesh_board_list', { team_id: 'team-abc' });

    const callArgs = mockFetch.mock.calls[0][1] as Record<string, Record<string, string>>;
    expect(callArgs.headers.Authorization).toBe('Bearer test-key-123');
  });

  it('URL-encodes team_id with special characters', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await handleBoardTool('holomesh_board_list', { team_id: 'team with spaces' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/holomesh/team/team%20with%20spaces/board',
      expect.anything()
    );
  });
});
