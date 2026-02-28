'use client';

/**
 * MCPServerConfigPanel - Visual UI for MCP Mesh Orchestrator
 *
 * Provides server discovery, tool browsing, testing, and configuration
 * for the MCP orchestrator at localhost:5567.
 *
 * Features:
 * - Server list with health indicators (green/yellow/red)
 * - Auto-refresh every 30s with health checks
 * - Tool browser with categorized list
 * - Tool tester with visual form builder
 * - Configuration persistence via localStorage
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Server, RefreshCw, X, Play, Check, AlertCircle, ChevronRight, Search, Settings } from 'lucide-react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import { MCPClient, createMCPClient, type MCPToolCallRequest } from '@/lib/mcpClient';
import type { MCPServerConfig, ServerStatus, MCPTool } from '@/lib/orchestrationStore';

// ============================================================================
// HOOKS
// ============================================================================

function useMCPServerHealth(config: MCPServerConfig | null) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const setServerStatus = useOrchestrationStore((s) => s.setServerStatus);

  const checkHealth = useCallback(async () => {
    if (!config || !config.enabled) return;

    setIsChecking(true);
    try {
      const client = createMCPClient(config);
      const newStatus = await client.healthCheck();
      setStatus(newStatus);
      setServerStatus(config.name, newStatus);
    } catch (error) {
      const errorStatus: ServerStatus = {
        name: config.name,
        isHealthy: false,
        lastCheck: new Date(),
        responseTime: 0,
        availableTools: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
      setStatus(errorStatus);
      setServerStatus(config.name, errorStatus);
    } finally {
      setIsChecking(false);
    }
  }, [config, setServerStatus]);

  // Initial check + interval
  useEffect(() => {
    if (!config || !config.enabled) return;

    checkHealth();
    const interval = setInterval(checkHealth, config.healthCheckInterval);

    return () => clearInterval(interval);
  }, [config, checkHealth]);

  return { status, isChecking, checkHealth };
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersisted = useCallback(
    (newValue: T) => {
      try {
        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));
      } catch (error) {
        console.error(`[MCPServerConfigPanel] Failed to persist ${key}:`, error);
      }
    },
    [key]
  );

  return [value, setPersisted];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ServerCardProps {
  server: MCPServerConfig;
  status: ServerStatus | null;
  isSelected: boolean;
  onClick: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

function ServerCard({ server, status, isSelected, onClick, onToggleEnabled }: ServerCardProps) {
  const statusColor = status?.isHealthy ? 'bg-green-500' : status ? 'bg-red-500' : 'bg-gray-500';
  const borderColor = isSelected ? 'border-studio-accent' : 'border-studio-border';

  return (
    <div
      className={`rounded-xl border ${borderColor} bg-studio-surface px-3 py-2.5 cursor-pointer transition hover:border-studio-accent/50`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {/* Status Indicator */}
        <div className={`h-2 w-2 rounded-full ${statusColor}`} title={status?.isHealthy ? 'Online' : 'Offline'} />

        {/* Server Name */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-studio-text truncate">{server.name}</div>
          <div className="text-[9px] text-studio-muted">{server.url}</div>
        </div>

        {/* Tool Count */}
        {status && (
          <div className="text-[9px] text-studio-muted">
            {status.availableTools} tools
          </div>
        )}

        {/* Enabled Toggle */}
        <input
          type="checkbox"
          checked={server.enabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggleEnabled(e.target.checked);
          }}
          className="h-3 w-3"
        />
      </div>

      {/* Error Message */}
      {status && !status.isHealthy && status.errorMessage && (
        <div className="mt-1.5 text-[9px] text-red-400 truncate">{status.errorMessage}</div>
      )}

      {/* Response Time */}
      {status && status.isHealthy && (
        <div className="mt-1 text-[9px] text-studio-muted">
          {status.responseTime.toFixed(0)}ms
        </div>
      )}
    </div>
  );
}

interface ToolBrowserProps {
  server: MCPServerConfig;
  onTestTool: (tool: MCPTool) => void;
}

function ToolBrowser({ server, onTestTool }: ToolBrowserProps) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const loadTools = async () => {
      setLoading(true);
      setError(null);
      try {
        const client = createMCPClient(server);
        const serverTools = await client.getServerTools(server.name);
        setTools(serverTools);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tools');
      } finally {
        setLoading(false);
      }
    };

    loadTools();
  }, [server]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const filteredTools = useMemo(() => {
    if (!debouncedSearchQuery) return tools;
    const query = debouncedSearchQuery.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
    );
  }, [tools, debouncedSearchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-studio-muted">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading tools...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-red-400 text-[10px]">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="shrink-0 px-3 py-2 border-b border-studio-border">
        <div className="flex items-center gap-2 bg-studio-panel rounded px-2 py-1.5">
          <Search className="h-3 w-3 text-studio-muted" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-[10px] text-studio-text outline-none placeholder-studio-muted"
          />
        </div>
      </div>

      {/* Tool List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredTools.length === 0 && (
          <div className="text-center text-studio-muted text-[10px] py-6">
            No tools found
          </div>
        )}

        {filteredTools.map((tool) => (
          <div
            key={tool.name}
            className="rounded-lg border border-studio-border bg-studio-panel px-3 py-2 hover:border-studio-accent/50 transition cursor-pointer"
            onClick={() => onTestTool(tool)}
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] font-semibold text-studio-accent">{tool.name}</div>
              <Play className="h-3 w-3 text-studio-muted" />
            </div>
            <div className="mt-1 text-[9px] text-studio-muted line-clamp-2">{tool.description}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.keys(tool.parameters).map((param) => (
                <span key={param} className="text-[8px] bg-studio-surface px-1.5 py-0.5 rounded text-studio-muted">
                  {param}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ToolTesterProps {
  tool: MCPTool;
  server: MCPServerConfig;
  onClose: () => void;
}

function ToolTester({ tool, server, onClose }: ToolTesterProps) {
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ success: boolean; data?: unknown; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      const client = createMCPClient(server);
      const request: MCPToolCallRequest = {
        server: server.name,
        tool: tool.name,
        args,
      };

      const response = await client.callTool(request);

      setResult({
        success: response.success,
        data: response.result,
        error: response.error,
      });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-studio-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Play className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Test Tool: {tool.name}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Parameters */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {Object.entries(tool.parameters).map(([key, param]) => (
          <div key={key}>
            <label className="block text-[10px] text-studio-muted mb-1">
              {key}
              {param.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type="text"
              placeholder={param.description}
              value={String(args[key] ?? param.default ?? '')}
              onChange={(e) => {
                const value = e.target.value;
                setArgs((prev) => ({ ...prev, [key]: value }));
              }}
              className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1.5 text-[10px] text-studio-text outline-none focus:border-studio-accent"
            />
            <div className="mt-0.5 text-[8px] text-studio-muted">{param.description}</div>
          </div>
        ))}

        {/* Result */}
        {result && (
          <div className="mt-4 rounded-lg border border-studio-border bg-studio-surface p-3">
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <>
                  <Check className="h-4 w-4 text-green-400" />
                  <span className="text-[10px] font-semibold text-green-400">Success</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-[10px] font-semibold text-red-400">Error</span>
                </>
              )}
            </div>
            <pre className="text-[9px] text-studio-text overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result.success ? result.data : result.error, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2.5">
        <button
          onClick={handleTest}
          disabled={testing}
          className="w-full rounded bg-studio-accent px-3 py-1.5 text-[10px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {testing ? (
            <>
              <RefreshCw className="inline h-3 w-3 animate-spin mr-1" />
              Testing...
            </>
          ) : (
            <>
              <Play className="inline h-3 w-3 mr-1" />
              Test Tool
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MCPServerConfigPanelProps {
  onClose: () => void;
}

export function MCPServerConfigPanel({ onClose }: MCPServerConfigPanelProps) {
  const mcpServers = useOrchestrationStore((s) => s.mcpServers);
  const serverStatuses = useOrchestrationStore((s) => s.serverStatuses);
  const selectedServerName = useOrchestrationStore((s) => s.selectedServer);
  const selectServer = useOrchestrationStore((s) => s.selectServer);
  const addMCPServer = useOrchestrationStore((s) => s.addMCPServer);
  const updateMCPServer = useOrchestrationStore((s) => s.updateMCPServer);

  const [apiKey, setApiKey] = useLocalStorage('mcp-api-key', 'dev-key-12345');
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [showAddServer, setShowAddServer] = useState(false);

  const selectedServer = useMemo(() => {
    return selectedServerName ? mcpServers.get(selectedServerName) ?? null : null;
  }, [selectedServerName, mcpServers]);

  const selectedStatus = useMemo(() => {
    return selectedServerName ? serverStatuses.get(selectedServerName) ?? null : null;
  }, [selectedServerName, serverStatuses]);

  useMCPServerHealth(selectedServer);

  const handleToggleEnabled = useCallback(
    (serverName: string, enabled: boolean) => {
      updateMCPServer(serverName, { enabled });
    },
    [updateMCPServer]
  );

  // Initialize default server if none exist
  useEffect(() => {
    if (mcpServers.size === 0) {
      addMCPServer({
        name: 'mcp-orchestrator',
        url: 'http://localhost:5567',
        apiKey: apiKey,
        enabled: true,
        healthCheckInterval: 30000,
        timeout: 10000,
        retryPolicy: { maxRetries: 3, backoffMultiplier: 2 },
        features: { semanticSearch: true, toolDiscovery: true, resourceManagement: true },
      });
    }
  }, [mcpServers, addMCPServer, apiKey]);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Server className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">MCP Servers</span>
        <button
          onClick={() => setShowAddServer(!showAddServer)}
          className="ml-auto rounded bg-studio-surface px-2 py-1 text-[9px] text-studio-text transition hover:bg-studio-border"
        >
          <Settings className="inline h-3 w-3 mr-1" />
          Config
        </button>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Array.from(mcpServers.values()).map((server) => (
          <ServerCard
            key={server.name}
            server={server}
            status={serverStatuses.get(server.name) ?? null}
            isSelected={selectedServerName === server.name}
            onClick={() => selectServer(server.name)}
            onToggleEnabled={(enabled) => handleToggleEnabled(server.name, enabled)}
          />
        ))}

        {mcpServers.size === 0 && (
          <div className="text-center text-studio-muted text-[10px] py-6">
            No servers configured
          </div>
        )}
      </div>

      {/* Tool Browser */}
      {selectedServer && !selectedTool && (
        <div className="shrink-0 border-t border-studio-border" style={{ height: '50%' }}>
          <ToolBrowser server={selectedServer} onTestTool={setSelectedTool} />
        </div>
      )}

      {/* Tool Tester */}
      {selectedServer && selectedTool && (
        <div className="shrink-0 border-t border-studio-border" style={{ height: '60%' }}>
          <ToolTester
            tool={selectedTool}
            server={selectedServer}
            onClose={() => setSelectedTool(null)}
          />
        </div>
      )}
    </div>
  );
}
