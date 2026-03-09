/**
 * Tests for MarketplaceWebview
 *
 * Validates the Marketplace webview panel including:
 *   - Panel creation and lifecycle (createOrShow, revive, dispose)
 *   - Tab switching (traits, mcpServers, agentMarketplace, agents)
 *   - MCP orchestrator integration (server listing, tools, health polling)
 *   - Server enable/disable actions
 *   - Agent marketplace fetching
 *   - Trait search, selection, and installation
 *   - Agent template search and installation
 *   - Health polling start/stop lifecycle
 *   - Message routing from webview
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock globals
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Mock McpOrchestratorClient
// ---------------------------------------------------------------------------

const mockGetServers = vi.fn();
const mockGetServerTools = vi.fn();
const mockGetHealth = vi.fn();
const mockEnableServer = vi.fn();
const mockDisableServer = vi.fn();
const mockGetAgents = vi.fn();
const mockGetStatus = vi.fn();
const mockStart = vi.fn();

vi.mock('../services/McpOrchestratorClient', () => ({
  McpOrchestratorClient: vi.fn().mockImplementation(function () {
    return {
      getServers: mockGetServers,
      getServerTools: mockGetServerTools,
      getHealth: mockGetHealth,
      enableServer: mockEnableServer,
      disableServer: mockDisableServer,
      getAgents: mockGetAgents,
      getStatus: mockGetStatus,
      start: mockStart,
    };
  }),
}));

// ---------------------------------------------------------------------------
// Mock vscode
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn();
const mockDispose = vi.fn();
const mockOnDidReceiveMessage = vi.fn();
const mockOnDidDispose = vi.fn();
const mockReveal = vi.fn();

const createMockPanel = () => ({
  webview: {
    html: '',
    postMessage: mockPostMessage,
    onDidReceiveMessage: mockOnDidReceiveMessage,
    asWebviewUri: vi.fn((uri: any) => uri),
    cspSource: 'https://mock.csp',
  },
  onDidDispose: mockOnDidDispose,
  reveal: mockReveal,
  dispose: mockDispose,
  viewType: 'holoscriptMarketplace',
});

let mockPanel: ReturnType<typeof createMockPanel>;

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createTerminal: vi.fn(() => ({
      sendText: vi.fn(),
      show: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultVal?: any) => {
        if (key === 'marketplaceApiUrl') return 'http://localhost:3001';
        if (key === 'mcpmeUrl') return 'https://mcp-orchestrator.test';
        return defaultVal;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
  },
  ViewColumn: { One: 1 },
  Uri: {
    joinPath: vi.fn((...args: any[]) => args.join('/')),
    parse: vi.fn((url: string) => url),
  },
  env: {
    openExternal: vi.fn(),
    clipboard: {
      writeText: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { MarketplaceWebview } from '../webview/MarketplaceWebview';
import { McpOrchestratorClient } from '../services/McpOrchestratorClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessageHandler(): (msg: any) => Promise<void> {
  // The handler is the first argument of the first call to onDidReceiveMessage
  const call = mockOnDidReceiveMessage.mock.calls[0];
  return call[0]; // the callback
}

function createPanel(client?: any): MarketplaceWebview {
  // Reset static
  (MarketplaceWebview as any).currentPanel = undefined;
  return MarketplaceWebview.createOrShow(
    'test-extension-uri' as any,
    client ?? new McpOrchestratorClient()
  ) as MarketplaceWebview;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketplaceWebview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPanel = createMockPanel();
    (MarketplaceWebview as any).currentPanel = undefined;

    // Default mock returns
    mockGetHealth.mockResolvedValue({ status: 'ok', uptime: 1000, serverCount: 5 });
    mockGetServers.mockResolvedValue([]);
    mockGetServerTools.mockResolvedValue([]);
    mockGetAgents.mockResolvedValue([]);
    mockEnableServer.mockResolvedValue(true);
    mockDisableServer.mockResolvedValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 0 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Panel lifecycle ────────────────────────────────────────────────────

  describe('panel lifecycle', () => {
    it('should create a new panel when none exists', () => {
      const panel = createPanel();

      expect(panel).toBeDefined();
      expect(MarketplaceWebview.currentPanel).toBe(panel);
    });

    it('should reveal existing panel instead of creating a new one', () => {
      const first = createPanel();
      const second = MarketplaceWebview.createOrShow('test-uri' as any);

      expect(second).toBe(first);
      expect(mockReveal).toHaveBeenCalled();
    });

    it('should set webview HTML on creation', () => {
      createPanel();

      expect(mockPanel.webview.html).toContain('HoloScript Marketplace');
      expect(mockPanel.webview.html).toContain('MCP Servers');
      expect(mockPanel.webview.html).toContain('Agent Marketplace');
    });

    it('should include MCP health indicator in HTML', () => {
      createPanel();

      expect(mockPanel.webview.html).toContain('mcp-health-indicator');
      expect(mockPanel.webview.html).toContain('mcp-status');
    });

    it('should include MCP servers list section in HTML', () => {
      createPanel();

      expect(mockPanel.webview.html).toContain('mcp-servers-list');
    });

    it('should include agent marketplace section in HTML', () => {
      createPanel();

      expect(mockPanel.webview.html).toContain('agent-marketplace-list');
    });

    it('should register message handler on creation', () => {
      createPanel();

      expect(mockOnDidReceiveMessage).toHaveBeenCalledTimes(1);
    });

    it('should register dispose handler on creation', () => {
      createPanel();

      expect(mockOnDidDispose).toHaveBeenCalledTimes(1);
    });

    it('should clear currentPanel on dispose', () => {
      const panel = createPanel();

      // Get the dispose callback
      const disposeCallback = mockOnDidDispose.mock.calls[0][0];
      disposeCallback();

      expect(MarketplaceWebview.currentPanel).toBeUndefined();
    });

    it('should revive panel from persisted state', () => {
      const freshPanel = createMockPanel();
      MarketplaceWebview.revive(freshPanel as any, 'test-uri' as any);

      expect(MarketplaceWebview.currentPanel).toBeDefined();
    });
  });

  // ── Health polling ─────────────────────────────────────────────────────

  describe('health polling', () => {
    it('should poll health immediately on creation', async () => {
      createPanel();

      // Let initial poll resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(mockGetHealth).toHaveBeenCalledTimes(1);
    });

    it('should send health update to webview after poll', async () => {
      mockGetHealth.mockResolvedValue({
        status: 'ok',
        uptime: 5000,
        serverCount: 3,
        version: '2.0.0',
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpHealthUpdate',
          health: expect.objectContaining({ status: 'ok' }),
        })
      );
    });

    it('should poll health every 30 seconds', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      mockGetHealth.mockClear();

      // Advance 30 seconds
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockGetHealth).toHaveBeenCalledTimes(1);

      // Advance another 30 seconds
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockGetHealth).toHaveBeenCalledTimes(2);
    });

    it('should handle health poll failure gracefully', async () => {
      mockGetHealth.mockRejectedValue(new Error('Network error'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      // Should send down status on failure
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpHealthUpdate',
          health: expect.objectContaining({ status: 'down' }),
        })
      );
    });

    it('should stop health polling on dispose', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      // Dispose
      const disposeCallback = mockOnDidDispose.mock.calls[0][0];
      disposeCallback();

      mockGetHealth.mockClear();

      // Advance past another poll interval
      await vi.advanceTimersByTimeAsync(60_000);

      // Should not have polled again
      expect(mockGetHealth).not.toHaveBeenCalled();
    });
  });

  // ── Tab switching ──────────────────────────────────────────────────────

  describe('tab switching', () => {
    it('should switch to mcpServers tab and fetch servers', async () => {
      const serverList = [{ id: 'srv-1', name: 'Test Server', status: 'active', tools: ['t1'] }];
      mockGetServers.mockResolvedValue(serverList);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'switchTab', tab: 'mcpServers' });

      expect(mockGetServers).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpServersResult',
          servers: serverList,
          total: 1,
        })
      );
    });

    it('should switch to agentMarketplace tab and fetch agents', async () => {
      const agentList = [
        { id: 'agent-1', name: 'Brittney', protocol: 'agent-protocol', status: 'online' },
      ];
      mockGetAgents.mockResolvedValue(agentList);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'switchTab', tab: 'agentMarketplace' });

      expect(mockGetAgents).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpAgentsResult',
          agents: agentList,
          total: 1,
        })
      );
    });

    it('should switch to traits tab and perform search', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 'trait-1' }], total: 1 }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'switchTab', tab: 'traits' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/traits/search'));
    });

    it('should switch to agents tab and search MCPMe agents', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ templates: [], total: 0 }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'switchTab', tab: 'agents' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/marketplace/search'));
    });
  });

  // ── MCP Servers ────────────────────────────────────────────────────────

  describe('MCP servers', () => {
    it('should refresh MCP servers on command', async () => {
      const servers = [
        { id: 's1', name: 'Server 1', status: 'active', tools: ['tool-a', 'tool-b'] },
        { id: 's2', name: 'Server 2', status: 'inactive', tools: [] },
      ];
      mockGetServers.mockResolvedValue(servers);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'refreshMcpServers' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpServersResult',
          servers,
          total: 2,
        })
      );
    });

    it('should handle server fetch failure', async () => {
      mockGetServers.mockRejectedValue(new Error('Connection refused'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'refreshMcpServers' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'error',
          message: expect.stringContaining('Failed to fetch MCP servers'),
        })
      );
    });

    it('should send loading state during server fetch', async () => {
      mockGetServers.mockResolvedValue([]);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockPostMessage.mockClear();

      const handler = getMessageHandler();
      await handler({ command: 'refreshMcpServers' });

      // Should have sent loading: true then loading: false
      const loadingMessages = mockPostMessage.mock.calls.filter(
        (c: any[]) => c[0].command === 'loading'
      );
      expect(loadingMessages.length).toBeGreaterThanOrEqual(2);
      expect(loadingMessages[0][0].loading).toBe(true);
      expect(loadingMessages[loadingMessages.length - 1][0].loading).toBe(false);
    });
  });

  // ── Server tools ───────────────────────────────────────────────────────

  describe('server tools', () => {
    it('should fetch tools for a specific server', async () => {
      const tools = [
        { name: 'search_knowledge', description: 'Semantic search' },
        { name: 'add_pattern', description: 'Add a pattern' },
      ];
      mockGetServerTools.mockResolvedValue(tools);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'fetchServerTools', serverId: 'semantic-search-hub' });

      expect(mockGetServerTools).toHaveBeenCalledWith('semantic-search-hub');
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpServerToolsResult',
          serverId: 'semantic-search-hub',
          tools,
        })
      );
    });

    it('should handle tools fetch failure', async () => {
      mockGetServerTools.mockRejectedValue(new Error('Not found'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'fetchServerTools', serverId: 'bad-server' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'error',
          message: expect.stringContaining('Failed to fetch tools'),
        })
      );
    });
  });

  // ── Enable/Disable server ──────────────────────────────────────────────

  describe('enable/disable server', () => {
    it('should enable a server and refresh the list', async () => {
      mockEnableServer.mockResolvedValue(true);
      mockGetServers.mockResolvedValue([
        { id: 'my-server', name: 'My Server', status: 'active', tools: [] },
      ]);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'enableServer', serverId: 'my-server' });

      const vscode = await import('vscode');
      expect(mockEnableServer).toHaveBeenCalledWith('my-server');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('my-server')
      );
      // Should also refresh server list
      expect(mockGetServers).toHaveBeenCalled();
    });

    it('should show warning when enable fails', async () => {
      mockEnableServer.mockResolvedValue(false);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'enableServer', serverId: 'bad-server' });

      const vscode = await import('vscode');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to enable')
      );
    });

    it('should show error when enable throws', async () => {
      mockEnableServer.mockRejectedValue(new Error('Network error'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'enableServer', serverId: 'crash-server' });

      const vscode = await import('vscode');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Enable server failed')
      );
    });

    it('should disable a server and refresh the list', async () => {
      mockDisableServer.mockResolvedValue(true);
      mockGetServers.mockResolvedValue([]);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'disableServer', serverId: 'my-server' });

      const vscode = await import('vscode');
      expect(mockDisableServer).toHaveBeenCalledWith('my-server');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('disabled')
      );
    });

    it('should show warning when disable fails', async () => {
      mockDisableServer.mockResolvedValue(false);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'disableServer', serverId: 'locked-server' });

      const vscode = await import('vscode');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to disable')
      );
    });

    it('should show error when disable throws', async () => {
      mockDisableServer.mockRejectedValue(new Error('Access denied'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'disableServer', serverId: 'protected-server' });

      const vscode = await import('vscode');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Disable server failed')
      );
    });

    it('should send installing state during enable/disable', async () => {
      mockEnableServer.mockResolvedValue(true);
      mockGetServers.mockResolvedValue([]);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockPostMessage.mockClear();

      const handler = getMessageHandler();
      await handler({ command: 'enableServer', serverId: 'test-srv' });

      const installingMessages = mockPostMessage.mock.calls.filter(
        (c: any[]) => c[0].command === 'installing' && c[0].serverId === 'test-srv'
      );
      expect(installingMessages.length).toBe(2);
      expect(installingMessages[0][0].installing).toBe(true);
      expect(installingMessages[1][0].installing).toBe(false);
    });
  });

  // ── Agent Marketplace ──────────────────────────────────────────────────

  describe('agent marketplace', () => {
    it('should fetch agent-protocol agents', async () => {
      const agents = [
        {
          id: 'brittney-1',
          name: 'Brittney AI',
          description: 'VR assistant',
          protocol: 'agent-protocol',
          status: 'online',
          capabilities: ['chat', 'code-gen'],
        },
      ];
      mockGetAgents.mockResolvedValue(agents);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'refreshAgentMarketplace' });

      expect(mockGetAgents).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'mcpAgentsResult',
          agents,
          total: 1,
        })
      );
    });

    it('should handle agent fetch failure', async () => {
      mockGetAgents.mockRejectedValue(new Error('Service unavailable'));

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'refreshAgentMarketplace' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'error',
          message: expect.stringContaining('Failed to fetch MCP agents'),
        })
      );
    });
  });

  // ── Trait operations ───────────────────────────────────────────────────

  describe('trait operations', () => {
    it('should perform initial trait search on creation', async () => {
      createPanel();

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/traits/search'));
    });

    it('should search traits with query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 'grabbable' }], total: 1 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'search', query: 'grabbable' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=grabbable'));
    });

    it('should select a trait and fetch details', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [], total: 0 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'grabbable', name: 'Grabbable', version: '1.0.0' }),
        });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'selectTrait', traitId: 'grabbable' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'traitDetails',
        })
      );
    });

    it('should handle trait search error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'error',
        })
      );
    });

    it('should install a trait via terminal', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'installTrait', traitId: '@holoscript/physics', version: '2.0.0' });

      const vscode = await import('vscode');
      expect(vscode.window.createTerminal).toHaveBeenCalledWith('HoloScript Install');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('@holoscript/physics')
      );
    });

    it('should filter by category', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'filterByCategory', category: 'physics' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=physics'));
    });
  });

  // ── Agent template operations ──────────────────────────────────────────

  describe('agent template operations', () => {
    it('should search agent templates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ templates: [{ id: 'tpl-1' }], total: 1 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ templates: [{ id: 'tpl-1' }], total: 1 }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'searchAgents', query: 'assistant' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=assistant'));
    });

    it('should install an agent template', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            templateName: 'My Agent',
            programType: 'holoscript',
          }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'installAgent', agentId: 'agent-tpl-1' });

      const vscode = await import('vscode');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('My Agent')
      );
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'agentInstalled',
          agentId: 'agent-tpl-1',
        })
      );
    });

    it('should handle agent install failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Quota exceeded' }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'installAgent', agentId: 'agent-tpl-2' });

      const vscode = await import('vscode');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Quota exceeded');
    });
  });

  // ── Misc message commands ──────────────────────────────────────────────

  describe('misc message commands', () => {
    it('should handle openExternal command', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'openExternal', url: 'https://holoscript.net' });

      const vscode = await import('vscode');
      expect(vscode.env.openExternal).toHaveBeenCalled();
    });

    it('should handle copyToClipboard command', async () => {
      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      await handler({ command: 'copyToClipboard', text: '@grabbable' });

      const vscode = await import('vscode');
      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('@grabbable');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Copied to clipboard!');
    });

    it('should handle refresh command for traits tab', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      createPanel();
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      const handler = getMessageHandler();
      await handler({ command: 'refresh' });

      // Default tab is traits, so should search traits
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/traits/search'));
    });

    it('should handle refresh command for mcpServers tab', async () => {
      mockGetServers.mockResolvedValue([]);

      createPanel();
      await vi.advanceTimersByTimeAsync(0);

      const handler = getMessageHandler();
      // Switch to mcpServers first
      await handler({ command: 'switchTab', tab: 'mcpServers' });
      mockGetServers.mockClear();

      // Now refresh
      await handler({ command: 'refresh' });

      expect(mockGetServers).toHaveBeenCalled();
    });
  });

  // ── CSP and nonce ──────────────────────────────────────────────────────

  describe('security', () => {
    it('should include CSP header with nonce in HTML', () => {
      createPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('Content-Security-Policy');
      expect(html).toMatch(/nonce-[A-Za-z0-9]{32}/);
    });

    it('should use nonce on script tag', () => {
      createPanel();

      const html = mockPanel.webview.html;
      // Script tag should have a nonce attribute
      expect(html).toMatch(/<script nonce="[A-Za-z0-9]{32}"/);
    });
  });

  // ── HTML content ───────────────────────────────────────────────────────

  describe('HTML content', () => {
    it('should include all four tab buttons', () => {
      createPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('data-tab="traits"');
      expect(html).toContain('data-tab="mcpServers"');
      expect(html).toContain('data-tab="agentMarketplace"');
      expect(html).toContain('data-tab="agents"');
    });

    it('should include category filter buttons', () => {
      createPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('data-category="core"');
      expect(html).toContain('data-category="physics"');
      expect(html).toContain('data-category="ai"');
    });

    it('should include search input', () => {
      createPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('id="search-input"');
    });

    it('should include status bar with MCP status', () => {
      createPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('id="mcp-status"');
      expect(html).toContain('MCP: checking...');
    });
  });
});
