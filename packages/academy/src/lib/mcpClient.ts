/**
 * MCP Client - HTTP client for MCP Mesh Orchestrator
 *
 * Communicates with MCP Mesh Orchestrator (production Railway)
 * Handles authentication, rate limiting, and health checks.
 *
 * Based on patterns from AI Ecosystem:
 * - payload-monitoring.ts (Observable pattern)
 * - auth-middleware.ts (Bearer token auth, rate limiting)
 * - deployment-agent.ts (Health check pattern)
 */

import type { MCPServerConfig, ServerStatus, MCPTool } from './orchestrationStore';

// ============================================================================
// TYPES
// ============================================================================

export interface MCPServer {
  name: string;
  version: string;
  tools: string[];
  resources: string[];
  prompts: string[];
}

export interface MCPToolCallRequest {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface MCPToolCallResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  duration: number; // ms
}

interface RateLimitState {
  requests: number;
  resetTime: number;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimitMap = new Map<string, RateLimitState>();
const RATE_LIMIT = 100; // requests per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let state = rateLimitMap.get(key);

  if (!state || now > state.resetTime) {
    state = { requests: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, state);
    return { allowed: true };
  }

  if (state.requests >= RATE_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.ceil((state.resetTime - now) / 1000),
    };
  }

  state.requests++;
  return { allowed: true };
}

// ============================================================================
// MCP CLIENT CLASS
// ============================================================================

export class MCPClient {
  private config: MCPServerConfig;
  private abortController: AbortController | null = null;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  updateConfig(updates: Partial<MCPServerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // HTTP HELPERS
  // ==========================================================================

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.url}${endpoint}`;

    // Rate limit check
    const rateLimitKey = `${this.config.name}:${endpoint}`;
    const rateLimitResult = checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      throw new Error(
        `Rate limit exceeded for ${this.config.name}. Retry after ${rateLimitResult.retryAfter}s`
      );
    }

    // Setup abort controller
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'x-mcp-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.config.timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred');
    } finally {
      this.abortController = null;
    }
  }

  cancelPendingRequests(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  async healthCheck(): Promise<ServerStatus> {
    const startTime = performance.now();

    try {
      const response = await this.fetch<{ status: string; toolCount?: number }>('/health', {
        method: 'GET',
      });

      const responseTime = performance.now() - startTime;

      return {
        name: this.config.name,
        isHealthy: true,
        lastCheck: new Date(),
        responseTime,
        availableTools: response.toolCount || 0,
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;

      return {
        name: this.config.name,
        isHealthy: false,
        lastCheck: new Date(),
        responseTime,
        availableTools: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // SERVER DISCOVERY
  // ==========================================================================

  async getServers(): Promise<MCPServer[]> {
    return await this.fetch<MCPServer[]>('/servers', {
      method: 'GET',
    });
  }

  async getServerInfo(serverName: string): Promise<MCPServer> {
    return await this.fetch<MCPServer>(`/servers/${serverName}`, {
      method: 'GET',
    });
  }

  // ==========================================================================
  // TOOL DISCOVERY
  // ==========================================================================

  async getTools(): Promise<MCPTool[]> {
    return await this.fetch<MCPTool[]>('/tools', {
      method: 'GET',
    });
  }

  async getServerTools(serverName: string): Promise<MCPTool[]> {
    return await this.fetch<MCPTool[]>(`/servers/${serverName}/tools`, {
      method: 'GET',
    });
  }

  async getToolInfo(serverName: string, toolName: string): Promise<MCPTool> {
    return await this.fetch<MCPTool>(`/servers/${serverName}/tools/${toolName}`, {
      method: 'GET',
    });
  }

  // ==========================================================================
  // TOOL EXECUTION
  // ==========================================================================

  async callTool<T = unknown>(request: MCPToolCallRequest): Promise<MCPToolCallResponse<T>> {
    const startTime = performance.now();

    try {
      const result = await this.fetch<T>('/tools/call', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const duration = performance.now() - startTime;

      return {
        success: true,
        result,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  // ==========================================================================
  // RETRY LOGIC
  // ==========================================================================

  async callToolWithRetry<T = unknown>(
    request: MCPToolCallRequest,
    options?: {
      maxRetries?: number;
      backoffMultiplier?: number;
    }
  ): Promise<MCPToolCallResponse<T>> {
    const maxRetries = options?.maxRetries ?? this.config.retryPolicy.maxRetries;
    const backoffMultiplier =
      options?.backoffMultiplier ?? this.config.retryPolicy.backoffMultiplier;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.callTool<T>(request);

        if (response.success) {
          return response;
        }

        // If explicit error, don't retry
        if (response.error) {
          return response;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't sleep on last attempt
        if (attempt < maxRetries) {
          const backoffDelay = Math.pow(backoffMultiplier, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }
    }

    const errorMessage = lastError?.message || 'Max retries exceeded';
    return {
      success: false,
      error: errorMessage,
      duration: 0,
    };
  }

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  async callToolsBatch<T = unknown>(
    requests: MCPToolCallRequest[]
  ): Promise<MCPToolCallResponse<T>[]> {
    return Promise.all(requests.map((req) => this.callTool<T>(req)));
  }

  // ==========================================================================
  // RESOURCE OPERATIONS
  // ==========================================================================

  async getResources(serverName: string): Promise<unknown[]> {
    return await this.fetch<unknown[]>(`/servers/${serverName}/resources`, {
      method: 'GET',
    });
  }

  async readResource<T = unknown>(serverName: string, uri: string): Promise<T> {
    return await this.fetch<T>(`/servers/${serverName}/resources/read`, {
      method: 'POST',
      body: JSON.stringify({ uri }),
    });
  }

  // ==========================================================================
  // PROMPT OPERATIONS
  // ==========================================================================

  async getPrompts(serverName: string): Promise<unknown[]> {
    return await this.fetch<unknown[]>(`/servers/${serverName}/prompts`, {
      method: 'GET',
    });
  }
}

// ============================================================================
// FACTORY & UTILITIES
// ============================================================================

/** Default MCP configuration (orchestrator — tool routing + knowledge federation) */
export const DEFAULT_MCP_CONFIG: MCPServerConfig = {
  name: 'default',
  url: process.env.NEXT_PUBLIC_MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',
  apiKey: process.env.NEXT_PUBLIC_MCP_API_KEY || '',
  enabled: true,
  healthCheckInterval: 30000, // 30 seconds
  timeout: 10000, // 10 seconds
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2,
  },
  features: {
    semanticSearch: true,
    toolDiscovery: true,
    resourceManagement: true,
  },
};

/** HoloScript MCP direct access (37+ tools — parse, compile, graph, render, share) */
export const HOLOSCRIPT_MCP_URL = 'https://mcp.holoscript.net';

/** Create MCP client with default config */
export function createMCPClient(overrides?: Partial<MCPServerConfig>): MCPClient {
  const config = { ...DEFAULT_MCP_CONFIG, ...overrides };
  return new MCPClient(config);
}

/** Global MCP client registry */
const clientRegistry = new Map<string, MCPClient>();

/** Get or create MCP client */
export function getMCPClient(name: string, config?: MCPServerConfig): MCPClient {
  let client = clientRegistry.get(name);

  if (!client && config) {
    client = new MCPClient(config);
    clientRegistry.set(name, client);
  } else if (!client) {
    throw new Error(`MCP client "${name}" not found. Provide config to create.`);
  }

  return client;
}

/** Remove MCP client from registry */
export function removeMCPClient(name: string): boolean {
  const client = clientRegistry.get(name);
  if (client) {
    client.cancelPendingRequests();
    return clientRegistry.delete(name);
  }
  return false;
}

/** Clear all MCP clients */
export function clearMCPClients(): void {
  clientRegistry.forEach((client) => client.cancelPendingRequests());
  clientRegistry.clear();
}
