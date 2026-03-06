/**
 * Tests for McpOrchestratorClient
 *
 * Validates the MCP orchestrator client that registers the HoloScript
 * VS Code extension with a central MCP mesh orchestrator, sends heartbeats,
 * and reports connection status.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock globals
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('vscode', () => {
  const configValues: Record<string, any> = {
    orchestratorUrl: 'http://localhost:5567',
    apiKey: 'test-api-key',
    enabled: true,
    heartbeatSeconds: 20,
    visibility: 'public',
    workspaceId: 'holoscript',
  };

  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal?: any) => {
          return configValues[key] ?? defaultVal;
        }),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    env: {
      machineId: 'abcdef12',
    },
  };
});

import { McpOrchestratorClient } from '../services/McpOrchestratorClient';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('McpOrchestratorClient', () => {
  let client: McpOrchestratorClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    client = new McpOrchestratorClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── getStatus ──────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return ok when orchestrator is healthy and authenticated', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 }) // health
        .mockResolvedValueOnce({ ok: true, status: 200 }); // servers

      const status = await client.getStatus();

      expect(status.ok).toBe(true);
      expect(status.message).toContain('Connected');
    });

    it('should return not ok when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const status = await client.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('Health check failed');
      expect(status.message).toContain('503');
    });

    it('should return not ok when auth fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 }) // health OK
        .mockResolvedValueOnce({ ok: false, status: 401 }); // servers 401

      const status = await client.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('Auth failed');
    });

    it('should return not ok when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const status = await client.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('Connection failed');
      expect(status.message).toContain('ECONNREFUSED');
    });
  });

  // ── start ──────────────────────────────────────────────────────────────

  describe('start', () => {
    it('should register with the orchestrator on start', async () => {
      const mockContext = {
        subscriptions: { push: vi.fn() },
      };

      client.start(mockContext as any);

      // Wait for the async register to complete
      await vi.advanceTimersByTimeAsync(0);

      // Should have called fetch for registration
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5567/servers/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-mcp-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should include tool list in registration payload', async () => {
      const mockContext = {
        subscriptions: { push: vi.fn() },
      };

      client.start(mockContext as any);
      await vi.advanceTimersByTimeAsync(0);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.tools).toBeInstanceOf(Array);
      expect(body.tools).toContain('holoscript.agent.createFile');
      expect(body.tools).toContain('holoscript.agent.generateObject');
      expect(body.tools).toContain('holoscript.openPreview');
    });

    it('should add dispose handler to context subscriptions', () => {
      const subscriptions: any[] = [];
      const mockContext = {
        subscriptions: { push: (s: any) => subscriptions.push(s) },
      };

      client.start(mockContext as any);

      expect(subscriptions.length).toBe(1);
      expect(typeof subscriptions[0].dispose).toBe('function');
    });

    it('should set registration payload id based on machineId', async () => {
      const mockContext = {
        subscriptions: { push: vi.fn() },
      };

      client.start(mockContext as any);
      await vi.advanceTimersByTimeAsync(0);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.id).toBe('holoscript-vscode-abcdef12');
      expect(body.name).toBe('HoloScript VS Code Extension');
      expect(body.status).toBe('active');
    });

    it('should start heartbeat timer', async () => {
      const mockContext = {
        subscriptions: { push: vi.fn() },
      };

      client.start(mockContext as any);

      // Clear the registration call
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      // Advance past one heartbeat interval (20 seconds)
      await vi.advanceTimersByTimeAsync(20000);

      // Should have sent a heartbeat
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/heartbeat'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should send heartbeat to correct endpoint', async () => {
      const mockContext = {
        subscriptions: { push: vi.fn() },
      };

      client.start(mockContext as any);
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      await vi.advanceTimersByTimeAsync(20000);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe(
        'http://localhost:5567/servers/holoscript-vscode-abcdef12/heartbeat'
      );
    });
  });

  // ── disabled configuration ─────────────────────────────────────────────

  describe('disabled configuration', () => {
    it('should report not ok when disabled', async () => {
      // Override getConfiguration to return enabled=false
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn((key: string, defaultVal?: any) => {
          if (key === 'enabled') return false;
          return defaultVal;
        }),
      });

      const disabledClient = new McpOrchestratorClient();
      const status = await disabledClient.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('disabled');
    });

    it('should report not ok when URL is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn((key: string, defaultVal?: any) => {
          if (key === 'enabled') return true;
          if (key === 'orchestratorUrl') return '';
          if (key === 'apiKey') return 'some-key';
          return defaultVal;
        }),
      });

      const noUrlClient = new McpOrchestratorClient();
      const status = await noUrlClient.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('Missing orchestrator URL');
    });

    it('should report not ok when API key is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn((key: string, defaultVal?: any) => {
          if (key === 'enabled') return true;
          if (key === 'orchestratorUrl') return 'http://localhost:5567';
          if (key === 'apiKey') return '';
          return defaultVal;
        }),
      });

      // Clear MCP_API_KEY env to avoid fallback
      const origEnv = process.env.MCP_API_KEY;
      delete process.env.MCP_API_KEY;

      const noKeyClient = new McpOrchestratorClient();
      const status = await noKeyClient.getStatus();

      expect(status.ok).toBe(false);
      expect(status.message).toContain('Missing MCP API key');

      // Restore
      if (origEnv !== undefined) {
        process.env.MCP_API_KEY = origEnv;
      }
    });
  });

  // ── getServers ────────────────────────────────────────────────────────

  describe('getServers', () => {
    it('should fetch and normalize servers from array response', async () => {
      const serverData = [
        {
          id: 'server-1',
          name: 'Test Server',
          status: 'active',
          tools: ['tool-a', 'tool-b'],
          workspace: 'holoscript',
          visibility: 'public',
          lastHeartbeat: '2026-03-06T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverData),
      });

      const servers = await client.getServers();

      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('server-1');
      expect(servers[0].name).toBe('Test Server');
      expect(servers[0].status).toBe('active');
      expect(servers[0].tools).toEqual(['tool-a', 'tool-b']);
    });

    it('should fetch and normalize servers from object response', async () => {
      const serverData = {
        servers: [
          { id: 'srv-2', name: 'Second', status: 'inactive', tools: [] },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverData),
      });

      const servers = await client.getServers();

      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('srv-2');
      expect(servers[0].status).toBe('inactive');
    });

    it('should return empty array when config is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noConfigClient = new McpOrchestratorClient();
      const servers = await noConfigClient.getServers();

      expect(servers).toEqual([]);
    });

    it('should throw when fetch returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(client.getServers()).rejects.toThrow('Failed to fetch servers');
    });

    it('should handle servers with missing fields gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'minimal' }]),
      });

      const servers = await client.getServers();

      expect(servers[0].id).toBe('minimal');
      expect(servers[0].name).toBe('minimal'); // falls back to id
      expect(servers[0].status).toBe('inactive'); // default
      expect(servers[0].tools).toEqual([]); // default
    });
  });

  // ── getServerTools ────────────────────────────────────────────────────

  describe('getServerTools', () => {
    it('should fetch tools for a given server', async () => {
      const toolsData = [
        { name: 'search_knowledge', description: 'Semantic search', inputSchema: { type: 'object' } },
        { name: 'add_pattern' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(toolsData),
      });

      const tools = await client.getServerTools('semantic-search-hub');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5567/servers/semantic-search-hub/tools',
        expect.objectContaining({
          headers: { 'x-mcp-api-key': 'test-api-key' },
        })
      );
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('search_knowledge');
      expect(tools[0].description).toBe('Semantic search');
      expect(tools[1].description).toBeUndefined();
    });

    it('should handle object-wrapped tools response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [{ name: 'tool1' }] }),
      });

      const tools = await client.getServerTools('test-server');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool1');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(client.getServerTools('nonexistent')).rejects.toThrow(
        'Failed to fetch tools for nonexistent'
      );
    });

    it('should return empty array when config is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noConfigClient = new McpOrchestratorClient();
      const tools = await noConfigClient.getServerTools('any');

      expect(tools).toEqual([]);
    });
  });

  // ── getHealth ─────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('should return ok status for healthy orchestrator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', uptime: 12345, serverCount: 8, version: '1.0.0' }),
      });

      const health = await client.getHealth();

      expect(health.status).toBe('ok');
      expect(health.uptime).toBe(12345);
      expect(health.serverCount).toBe(8);
      expect(health.version).toBe('1.0.0');
    });

    it('should normalize "healthy" status to "ok"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' }),
      });

      const health = await client.getHealth();
      expect(health.status).toBe('ok');
    });

    it('should return down when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const health = await client.getHealth();
      expect(health.status).toBe('down');
    });

    it('should return down when URL is not configured', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noUrlClient = new McpOrchestratorClient();
      const health = await noUrlClient.getHealth();

      expect(health.status).toBe('down');
    });

    it('should handle degraded status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'degraded' }),
      });

      const health = await client.getHealth();
      expect(health.status).toBe('degraded');
    });

    it('should handle snake_case server_count field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', server_count: 5 }),
      });

      const health = await client.getHealth();
      expect(health.serverCount).toBe(5);
    });
  });

  // ── enableServer ──────────────────────────────────────────────────────

  describe('enableServer', () => {
    it('should POST to enable endpoint and return true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await client.enableServer('my-server');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5567/servers/my-server/enable',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-mcp-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should return false on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await client.enableServer('bad-server');
      expect(result).toBe(false);
    });

    it('should return false when config is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noConfigClient = new McpOrchestratorClient();
      const result = await noConfigClient.enableServer('any');

      expect(result).toBe(false);
    });

    it('should URL-encode the server ID', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await client.enableServer('server with spaces');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5567/servers/server%20with%20spaces/enable',
        expect.any(Object)
      );
    });
  });

  // ── disableServer ─────────────────────────────────────────────────────

  describe('disableServer', () => {
    it('should POST to disable endpoint and return true on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await client.disableServer('my-server');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5567/servers/my-server/disable',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return false on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await client.disableServer('locked-server');
      expect(result).toBe(false);
    });

    it('should return false when config is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noConfigClient = new McpOrchestratorClient();
      const result = await noConfigClient.disableServer('any');

      expect(result).toBe(false);
    });
  });

  // ── getAgents ─────────────────────────────────────────────────────────

  describe('getAgents', () => {
    it('should fetch and normalize agents from array response', async () => {
      const agentData = [
        {
          id: 'agent-1',
          name: 'Brittney',
          description: 'AI assistant',
          protocol: 'agent-protocol',
          endpoint: 'http://localhost:8000',
          capabilities: ['chat', 'code'],
          status: 'online',
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(agentData),
      });

      const agents = await client.getAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-1');
      expect(agents[0].name).toBe('Brittney');
      expect(agents[0].protocol).toBe('agent-protocol');
      expect(agents[0].capabilities).toEqual(['chat', 'code']);
      expect(agents[0].status).toBe('online');
    });

    it('should handle object-wrapped response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ agents: [{ id: 'a1', name: 'Test' }] }),
      });

      const agents = await client.getAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('a1');
    });

    it('should return empty array when endpoint returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const agents = await client.getAgents();
      expect(agents).toEqual([]);
    });

    it('should return empty array when config is missing', async () => {
      const vscode = await import('vscode');
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: vi.fn(() => ''),
      });

      const noConfigClient = new McpOrchestratorClient();
      const agents = await noConfigClient.getAgents();

      expect(agents).toEqual([]);
    });

    it('should handle agents with missing fields gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'minimal-agent' }]),
      });

      const agents = await client.getAgents();

      expect(agents[0].id).toBe('minimal-agent');
      expect(agents[0].name).toBe('minimal-agent'); // falls back to id
      expect(agents[0].protocol).toBe('agent-protocol'); // default
      expect(agents[0].capabilities).toEqual([]); // default
      expect(agents[0].status).toBe('unknown'); // default
    });
  });
});
