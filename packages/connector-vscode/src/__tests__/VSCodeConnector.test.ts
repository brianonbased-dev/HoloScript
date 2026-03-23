import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VSCodeConnector } from '../VSCodeConnector.js';
import { vscodeTools } from '../tools.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock McpRegistrar
vi.mock('@holoscript/connector-core', () => ({
  ServiceConnector: class {
    protected isConnected = false;
  },
  McpRegistrar: class {
    async register() {
      return true;
    }
  },
}));

function mockResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
  };
}

describe('VSCodeConnector', () => {
  let connector: VSCodeConnector;

  beforeEach(() => {
    connector = new VSCodeConnector();
    mockFetch.mockReset();
    delete process.env.VSCODE_BRIDGE_URL;
  });

  afterEach(async () => {
    try {
      await connector.disconnect();
    } catch {
      // Already disconnected
    }
  });

  // ── Connection ───────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('should connect when extension bridge is reachable', async () => {
      // /health → ok, /api/workspace/info → workspace data
      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' })) // ping
        .mockResolvedValueOnce(
          mockResponse({
            name: 'holoscript',
            rootPath: '/home/user/holoscript',
            folders: ['src', 'packages'],
            openFiles: ['src/index.ts'],
          })
        ) // workspace info
        .mockResolvedValueOnce(mockResponse({ success: true })); // registrar (if called)

      await connector.connect();
      expect(await connector.health()).toBe(true);
    });

    it('should throw when extension bridge is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(connector.connect()).rejects.toThrow('not reachable');
    });

    it('should use VSCODE_BRIDGE_URL env var when set', async () => {
      process.env.VSCODE_BRIDGE_URL = 'http://192.168.1.100:9999';

      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' }))
        .mockResolvedValueOnce(mockResponse(null, false, 404));

      await connector.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://192.168.1.100:9999/health',
        expect.any(Object)
      );
    });

    it('should default to localhost:17420', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' }))
        .mockResolvedValueOnce(mockResponse(null, false, 404));

      await connector.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17420/health',
        expect.any(Object)
      );
    });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('should disconnect cleanly', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' }))
        .mockResolvedValueOnce(mockResponse(null, false, 404));

      await connector.connect();
      await connector.disconnect();

      expect(await connector.health()).toBe(false);
    });
  });

  // ── Health ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('should return false when not connected', async () => {
      expect(await connector.health()).toBe(false);
    });

    it('should ping extension when connected', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' })) // connect ping
        .mockResolvedValueOnce(mockResponse(null, false, 404)) // workspace info
        .mockResolvedValueOnce(mockResponse({ status: 'ok' })); // health ping

      await connector.connect();
      expect(await connector.health()).toBe(true);
    });
  });

  // ── Tools ───────────────────────────────────────────────────────────────

  describe('listTools()', () => {
    it('should return 8 tools', async () => {
      const tools = await connector.listTools();
      expect(tools).toHaveLength(8);
    });

    it('should include all expected tool names', async () => {
      const tools = await connector.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('vscode_extension_status');
      expect(names).toContain('vscode_file_open');
      expect(names).toContain('vscode_preview_open');
      expect(names).toContain('vscode_sync_push');
      expect(names).toContain('vscode_sync_pull');
      expect(names).toContain('vscode_terminal_run');
      expect(names).toContain('vscode_mcp_status');
      expect(names).toContain('vscode_workspace_info');
    });

    it('should have valid input schemas on all tools', async () => {
      const tools = await connector.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  // ── Tool Execution ──────────────────────────────────────────────────────

  describe('executeTool()', () => {
    beforeEach(async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ status: 'ok' })) // connect
        .mockResolvedValueOnce(mockResponse(null, false, 404)); // workspace info
      await connector.connect();
    });

    it('should throw when not connected', async () => {
      await connector.disconnect();
      await expect(connector.executeTool('vscode_extension_status', {})).rejects.toThrow(
        'not connected'
      );
    });

    it('should call file/open endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await connector.executeTool('vscode_file_open', { path: 'src/index.ts', line: 42 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17420/api/file/open',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: 'src/index.ts', line: 42 }),
        })
      );
    });

    it('should call preview/open endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await connector.executeTool('vscode_preview_open', { path: 'scene.holo' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17420/api/preview/open',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: 'scene.holo' }),
        })
      );
    });

    it('should call sync/push with content', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await connector.executeTool('vscode_sync_push', {
        path: 'compositions/test.holo',
        content: 'object Cube { position: [0,1,0] }',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17420/api/sync/push',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            path: 'compositions/test.holo',
            content: 'object Cube { position: [0,1,0] }',
          }),
        })
      );
    });

    it('should call sync/pull and return file content', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ content: 'object Cube { position: [0,1,0] }', path: 'scene.holo' })
      );

      const result = await connector.executeTool('vscode_sync_pull', { path: 'scene.holo' });

      expect(result).toEqual({ content: 'object Cube { position: [0,1,0] }', path: 'scene.holo' });
    });

    it('should call terminal/run with command', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ exitCode: 0, output: 'Done' }));

      const result = await connector.executeTool('vscode_terminal_run', {
        command: 'pnpm build',
        cwd: '/workspace',
      });

      expect(result).toEqual({ exitCode: 0, output: 'Done' });
    });

    it('should fetch extension status', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          connected: true,
          version: '3.1.0',
          workspace: { name: 'holoscript', rootPath: '/workspace', folders: [], openFiles: [] },
          features: ['preview', 'mcp', 'git'],
        })
      );

      const result = (await connector.executeTool('vscode_extension_status', {})) as any;

      expect(result.connected).toBe(true);
      expect(result.version).toBe('3.1.0');
      expect(result.features).toContain('mcp');
    });

    it('should throw on unknown tool', async () => {
      await expect(connector.executeTool('vscode_unknown_tool', {})).rejects.toThrow(
        'Unknown tool'
      );
    });

    it('should throw on bridge error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: 'File not found' }, false, 404)
      );

      await expect(
        connector.executeTool('vscode_sync_pull', { path: 'nonexistent.holo' })
      ).rejects.toThrow('bridge error');
    });
  });

  // ── Tool Schema Validation ──────────────────────────────────────────────

  describe('tools schema', () => {
    it('vscode_file_open requires path', () => {
      const tool = vscodeTools.find((t) => t.name === 'vscode_file_open')!;
      expect(tool.inputSchema.required).toContain('path');
    });

    it('vscode_sync_push requires path and content', () => {
      const tool = vscodeTools.find((t) => t.name === 'vscode_sync_push')!;
      expect(tool.inputSchema.required).toContain('path');
      expect(tool.inputSchema.required).toContain('content');
    });

    it('vscode_terminal_run requires command', () => {
      const tool = vscodeTools.find((t) => t.name === 'vscode_terminal_run')!;
      expect(tool.inputSchema.required).toContain('command');
    });
  });
});
