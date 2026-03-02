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
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
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
});
