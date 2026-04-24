import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubConnector } from '../src/GitHubConnector.js';

// Mock @octokit/rest
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function () { return ({
    rest: {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({ status: 200, data: { login: 'testuser' } }),
      },
      meta: {
        get: vi.fn().mockResolvedValue({ status: 200 }),
      },
      repos: {
        get: vi
          .fn()
          .mockResolvedValue({ data: { name: 'test-repo', owner: { login: 'testuser' } } }),
        createForAuthenticatedUser: vi
          .fn()
          .mockResolvedValue({ data: { name: 'new-repo', id: 123 } }),
        listForAuthenticatedUser: vi
          .fn()
          .mockResolvedValue({ data: [{ name: 'repo1' }, { name: 'repo2' }] }),
        listForOrg: vi.fn().mockResolvedValue({ data: [{ name: 'org-repo1' }] }),
        getContent: vi.fn().mockResolvedValue({
          data: {
            content: Buffer.from('object Cube { position: [0,0,0] }').toString('base64'),
            sha: 'abc123',
          },
        }),
        createOrUpdateFileContents: vi
          .fn()
          .mockResolvedValue({ data: { commit: { sha: 'def456' } } }),
      },
      issues: {
        create: vi.fn().mockResolvedValue({ data: { number: 1, title: 'Test Issue' } }),
        listForRepo: vi.fn().mockResolvedValue({ data: [{ number: 1 }, { number: 2 }] }),
        update: vi.fn().mockResolvedValue({ data: { number: 1, state: 'closed' } }),
        createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({ data: { number: 10, title: 'Test PR' } }),
        list: vi.fn().mockResolvedValue({ data: [{ number: 10 }, { number: 11 }] }),
        get: vi.fn().mockResolvedValue({ data: { number: 10, state: 'open' } }),
        merge: vi.fn().mockResolvedValue({ data: { merged: true } }),
        createReview: vi.fn().mockResolvedValue({ data: { id: 888 } }),
      },
      actions: {
        listRepoWorkflows: vi
          .fn()
          .mockResolvedValue({ data: { workflows: [{ id: 1, name: 'CI' }] } }),
        createWorkflowDispatch: vi.fn().mockResolvedValue({ status: 204 }),
        listWorkflowRuns: vi.fn().mockResolvedValue({ data: { workflow_runs: [{ id: 100 }] } }),
        listWorkflowRunsForRepo: vi
          .fn()
          .mockResolvedValue({ data: { workflow_runs: [{ id: 101 }] } }),
      },
      git: {
        getTree: vi.fn().mockResolvedValue({
          data: {
            tree: [
              { type: 'blob', path: 'scene.holo' },
              { type: 'blob', path: 'component.hs' },
              { type: 'blob', path: 'README.md' },
            ],
          },
        }),
      },
    },
  }); }),
}));

// Mock @octokit/auth-token
vi.mock('@octokit/auth-token', () => ({
  createTokenAuth: vi.fn(() => {
    return vi.fn().mockResolvedValue({ token: 'test-token' });
  }),
}));

// Mock fetch for HoloScript MCP calls
global.fetch = vi.fn((url: string) => {
  if (url.includes('mcp.holoscript.net/api/render')) {
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          success: true,
          previewUrl: 'https://preview.holoscript.net/test123',
        }),
    } as Response);
  }

  if (url.includes('mcp-orchestrator-production-45f9.up.railway.app/tools/call')) {
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          valid: true,
          errors: [],
          warnings: [],
        }),
    } as Response);
  }

  return Promise.reject(new Error('Unknown URL'));
}) as any;

describe('GitHubConnector', () => {
  let connector: GitHubConnector;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.GITHUB_TOKEN = 'test-token';
    connector = new GitHubConnector();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect successfully with valid token', async () => {
      await connector.connect();
      expect(connector['isConnected']).toBe(true);
    });

    it('should throw error when GITHUB_TOKEN is missing', async () => {
      delete process.env.GITHUB_TOKEN;
      const newConnector = new GitHubConnector();

      await expect(newConnector.connect()).rejects.toThrow(
        'GITHUB_TOKEN environment variable is required'
      );
    });

    it('should disconnect properly', async () => {
      await connector.connect();
      await connector.disconnect();

      expect(connector['isConnected']).toBe(false);
      expect(connector['octokit']).toBeNull();
    });

    it('should return health status', async () => {
      await connector.connect();
      const healthy = await connector.health();

      expect(healthy).toBe(true);
    });

    it('should return false health when disconnected', async () => {
      const healthy = await connector.health();

      expect(healthy).toBe(false);
    });
  });

  describe('Tool Listing', () => {
    it('should list all GitHub MCP tools', async () => {
      const tools = await connector.listTools();

      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === 'github_repo_get')).toBe(true);
      expect(tools.some((t) => t.name === 'github_issue_create')).toBe(true);
      expect(tools.some((t) => t.name === 'github_pr_create')).toBe(true);
      expect(tools.some((t) => t.name === 'github_holoscript_compile_preview')).toBe(true);
    });
  });

  describe('Repository Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should get repository information', async () => {
      const result = await connector.executeTool('github_repo_get', {
        owner: 'testuser',
        repo: 'test-repo',
      });

      expect(result).toBeDefined();
      expect((result as any).data.name).toBe('test-repo');
    });

    it('should create repository', async () => {
      const result = await connector.executeTool('github_repo_create', {
        name: 'new-repo',
        description: 'Test repository',
        private: false,
      });

      expect(result).toBeDefined();
      expect((result as any).data.name).toBe('new-repo');
    });

    it('should list repositories for authenticated user', async () => {
      const result = await connector.executeTool('github_repo_list', {
        type: 'owner',
        sort: 'updated',
      });

      expect(result).toBeDefined();
      expect(Array.isArray((result as any).data)).toBe(true);
    });

    it('should list repositories for organization', async () => {
      const result = await connector.executeTool('github_repo_list', {
        org: 'testorg',
        type: 'all',
      });

      expect(result).toBeDefined();
      expect(Array.isArray((result as any).data)).toBe(true);
    });
  });

  describe('Issue Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should create issue', async () => {
      const result = await connector.executeTool('github_issue_create', {
        owner: 'testuser',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Issue description',
        labels: ['bug'],
      });

      expect(result).toBeDefined();
      expect((result as any).data.title).toBe('Test Issue');
    });

    it('should list issues', async () => {
      const result = await connector.executeTool('github_issue_list', {
        owner: 'testuser',
        repo: 'test-repo',
        state: 'open',
      });

      expect(result).toBeDefined();
      expect(Array.isArray((result as any).data)).toBe(true);
    });

    it('should update issue', async () => {
      const result = await connector.executeTool('github_issue_update', {
        owner: 'testuser',
        repo: 'test-repo',
        issue_number: 1,
        state: 'closed',
      });

      expect(result).toBeDefined();
      expect((result as any).data.state).toBe('closed');
    });

    it('should add comment to issue', async () => {
      const result = await connector.executeTool('github_issue_comment', {
        owner: 'testuser',
        repo: 'test-repo',
        issue_number: 1,
        body: 'Test comment',
      });

      expect(result).toBeDefined();
      expect((result as any).data.id).toBe(999);
    });
  });

  describe('Pull Request Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should create pull request', async () => {
      const result = await connector.executeTool('github_pr_create', {
        owner: 'testuser',
        repo: 'test-repo',
        title: 'Test PR',
        head: 'feature-branch',
        base: 'main',
      });

      expect(result).toBeDefined();
      expect((result as any).data.title).toBe('Test PR');
    });

    it('should list pull requests', async () => {
      const result = await connector.executeTool('github_pr_list', {
        owner: 'testuser',
        repo: 'test-repo',
        state: 'open',
      });

      expect(result).toBeDefined();
      expect(Array.isArray((result as any).data)).toBe(true);
    });

    it('should get pull request', async () => {
      const result = await connector.executeTool('github_pr_get', {
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 10,
      });

      expect(result).toBeDefined();
      expect((result as any).data.number).toBe(10);
    });

    it('should merge pull request', async () => {
      const result = await connector.executeTool('github_pr_merge', {
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 10,
        merge_method: 'squash',
      });

      expect(result).toBeDefined();
      expect((result as any).data.merged).toBe(true);
    });

    it('should add comment to pull request', async () => {
      const result = await connector.executeTool('github_pr_comment', {
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 10,
        body: 'LGTM!',
      });

      expect(result).toBeDefined();
      expect((result as any).data.id).toBe(999);
    });

    it('should create review on pull request', async () => {
      const result = await connector.executeTool('github_pr_review', {
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 10,
        event: 'APPROVE',
      });

      expect(result).toBeDefined();
      expect((result as any).data.id).toBe(888);
    });
  });

  describe('Workflow Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should list workflows', async () => {
      const result = await connector.executeTool('github_workflow_list', {
        owner: 'testuser',
        repo: 'test-repo',
      });

      expect(result).toBeDefined();
      expect((result as any).data.workflows).toBeDefined();
    });

    it('should trigger workflow', async () => {
      const result = await connector.executeTool('github_workflow_run', {
        owner: 'testuser',
        repo: 'test-repo',
        workflow_id: 'ci.yml',
        ref: 'main',
      });

      expect(result).toBeDefined();
    });

    it('should list workflow runs', async () => {
      const result = await connector.executeTool('github_workflow_runs_list', {
        owner: 'testuser',
        repo: 'test-repo',
        status: 'completed',
      });

      expect(result).toBeDefined();
      expect((result as any).data.workflow_runs).toBeDefined();
    });
  });

  describe('Content Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should get file content', async () => {
      const result = await connector.executeTool('github_content_get', {
        owner: 'testuser',
        repo: 'test-repo',
        path: 'scene.holo',
      });

      expect(result).toBeDefined();
      expect((result as any).data.content).toBeDefined();
    });

    it('should create or update file', async () => {
      const result = await connector.executeTool('github_content_create_or_update', {
        owner: 'testuser',
        repo: 'test-repo',
        path: 'new-file.holo',
        message: 'Add new scene',
        content: 'object Cube { }',
      });

      expect(result).toBeDefined();
      expect((result as any).data.commit).toBeDefined();
    });
  });

  describe('HoloScript-Specific Operations', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should compile HoloScript preview', async () => {
      const result = (await connector.executeTool('github_holoscript_compile_preview', {
        owner: 'testuser',
        repo: 'test-repo',
        ref: 'main',
      })) as any;

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThan(0);
    });

    it('should validate HoloScript scene', async () => {
      const result = (await connector.executeTool('github_holoscript_validate_scene', {
        owner: 'testuser',
        repo: 'test-repo',
        ref: 'main',
      })) as any;

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThan(0);
    });

    it('should compile specified files only', async () => {
      const result = (await connector.executeTool('github_holoscript_compile_preview', {
        owner: 'testuser',
        repo: 'test-repo',
        ref: 'main',
        files: ['scene.holo'],
      })) as any;

      expect(result).toBeDefined();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].file).toBe('scene.holo');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when tool executed without connection', async () => {
      await expect(
        connector.executeTool('github_repo_get', { owner: 'test', repo: 'test' })
      ).rejects.toThrow('not connected');
    });

    it('should throw error for unknown tool', async () => {
      await connector.connect();

      await expect(connector.executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });
  });
});
