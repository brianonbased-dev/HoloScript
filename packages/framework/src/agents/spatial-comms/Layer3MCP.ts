/**
 * @holoscript/core - Layer 3: MCP Metadata Layer
 *
 * Model Context Protocol integration for high-level commands and tool access.
 * Features:
 * - World creation and management
 * - Agent registry queries
 * - Performance metrics collection
 * - Global configuration
 * - System event triggering
 */

import { EventEmitter } from 'events';
import { DEFAULT_MCP_CONFIG } from './ProtocolTypes';
import type {
  MCPCommandType,
  MCPCommandRequest,
  MCPCommandResponse,
  MCPProtocolConfig,
  WorldSpec,
  WorldStatus,
  PerformanceMetrics,
  ExportFormat,
} from './ProtocolTypes';

// ============================================================================
// MCP TOOL DEFINITIONS
// ============================================================================

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Available MCP tools for spatial agent communication
 */
export const SPATIAL_MCP_TOOLS: MCPTool[] = [
  {
    name: 'create_world',
    description: 'Create a new VR world with multi-agent support',
    parameters: {
      type: 'object',
      properties: {
        world_spec: {
          type: 'object',
          description: 'World specification including dimensions, features, and agent roles',
        },
      },
      required: ['world_spec'],
    },
  },
  {
    name: 'get_world_status',
    description: 'Get current status of a VR world including agent activity and performance',
    parameters: {
      type: 'object',
      properties: {
        world_id: {
          type: 'string',
          description: 'ID of the world to query',
        },
      },
      required: ['world_id'],
    },
  },
  {
    name: 'export_world',
    description: 'Export VR world to specified format',
    parameters: {
      type: 'object',
      properties: {
        world_id: {
          type: 'string',
          description: 'ID of the world to export',
        },
        format: {
          type: 'string',
          enum: ['gltf', 'fbx', 'usdz', 'vrm', 'json', 'holoscript'],
          description: 'Export format',
        },
      },
      required: ['world_id', 'format'],
    },
  },
  {
    name: 'get_agent_registry',
    description: 'Get all registered agents in the spatial communication system',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional filter criteria (status, role, etc.)',
        },
      },
    },
  },
  {
    name: 'get_performance_metrics',
    description: 'Get real-time performance metrics for agents and system',
    parameters: {
      type: 'object',
      properties: {
        world_id: {
          type: 'string',
          description: 'Optional world ID to filter metrics',
        },
        agent_id: {
          type: 'string',
          description: 'Optional agent ID to filter metrics',
        },
      },
    },
  },
  {
    name: 'set_global_config',
    description: 'Set global configuration for spatial communication system',
    parameters: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Configuration object with settings to update',
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'trigger_event',
    description: 'Trigger a system-wide event for agent coordination',
    parameters: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          description: 'Type of event to trigger',
        },
        event_data: {
          type: 'object',
          description: 'Event payload data',
        },
      },
      required: ['event_type'],
    },
  },
];

// ============================================================================
// LAYER 3 CLIENT
// ============================================================================

/**
 * Layer 3 MCP Metadata Client
 */
export class Layer3MCPClient extends EventEmitter {
  private config: MCPProtocolConfig;
  private agentId: string;

  constructor(agentId: string, config?: Partial<MCPProtocolConfig>) {
    super();
    this.agentId = agentId;
    this.config = { ...DEFAULT_MCP_CONFIG, ...config } as MCPProtocolConfig;
  }

  /**
   * Execute MCP command
   */
  async execute(command: MCPCommandType, params: Record<string, any>): Promise<MCPCommandResponse> {
    const request: MCPCommandRequest = {
      command,
      params,
    };

    try {
      const response = await this.sendMCPRequest(request);
      this.emit('command_success', { command, params, response });
      return response;
    } catch (error) {
      this.emit('command_error', { command, params, error });
      throw error;
    }
  }

  /**
   * Create new VR world
   */
  async createWorld(worldSpec: WorldSpec): Promise<{ world_id: string; status: WorldStatus }> {
    const response = await this.execute('create_world', { world_spec: worldSpec });

    if (!response.success) {
      throw new Error(response.error || 'Failed to create world');
    }

    return response.data as { world_id: string; status: WorldStatus };
  }

  /**
   * Get world status
   */
  async getWorldStatus(worldId: string): Promise<WorldStatus> {
    const response = await this.execute('get_world_status', { world_id: worldId });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get world status');
    }

    return response.data as WorldStatus;
  }

  /**
   * Export world
   */
  async exportWorld(worldId: string, format: ExportFormat): Promise<{ url: string; size: number }> {
    const response = await this.execute('export_world', { world_id: worldId, format });

    if (!response.success) {
      throw new Error(response.error || 'Failed to export world');
    }

    return response.data as { url: string; size: number };
  }

  /**
   * Get agent registry
   */
  async getAgentRegistry(filter?: {
    status?: 'online' | 'offline' | 'degraded';
    role?: string;
    world_id?: string;
  }): Promise<{
    agents: Array<{
      agent_id: string;
      role: string;
      status: 'online' | 'offline' | 'degraded';
      world_id?: string;
      capabilities: string[];
    }>;
    total: number;
  }> {
    const response = await this.execute('get_agent_registry', { filter });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get agent registry');
    }

    return response.data as {
      agents: Array<{
        agent_id: string;
        role: string;
        status: 'online' | 'offline' | 'degraded';
        world_id?: string;
        capabilities: string[];
      }>;
      total: number;
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(options?: {
    world_id?: string;
    agent_id?: string;
  }): Promise<PerformanceMetrics> {
    const response = await this.execute('get_performance_metrics', options || {});

    if (!response.success) {
      throw new Error(response.error || 'Failed to get performance metrics');
    }

    return response.data as PerformanceMetrics;
  }

  /**
   * Set global configuration
   */
  async setGlobalConfig(config: {
    target_fps?: number;
    max_agents?: number;
    quality_level?: 'high' | 'medium' | 'low' | 'minimal';
    enable_spatial_audio?: boolean;
    enable_physics?: boolean;
  }): Promise<void> {
    const response = await this.execute('set_global_config', { config });

    if (!response.success) {
      throw new Error(response.error || 'Failed to set global config');
    }
  }

  /**
   * Trigger system event
   */
  async triggerEvent(eventType: string, eventData?: Record<string, any>): Promise<void> {
    const response = await this.execute('trigger_event', {
      event_type: eventType,
      event_data: eventData,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to trigger event');
    }
  }

  /**
   * Call MCP tool directly
   */
  async callTool(
    server: string,
    tool: string,
    args: Record<string, any>
  ): Promise<MCPCommandResponse> {
    try {
      const response = await this.mcpToolCall(server, tool, args);
      this.emit('tool_call_success', { server, tool, args, response });
      return {
        success: true,
        data: response,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.emit('tool_call_error', { server, tool, args, error });
      return {
        success: false,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get available MCP tools
   */
  getAvailableTools(): MCPTool[] {
    return SPATIAL_MCP_TOOLS;
  }

  /**
   * Send MCP request
   */
  private async sendMCPRequest(request: MCPCommandRequest): Promise<MCPCommandResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.endpoint}/mcp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': this.config.apiKey,
          'x-agent-id': this.agentId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as MCPCommandResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Call MCP tool via orchestrator
   */
  private async mcpToolCall(server: string, tool: string, args: Record<string, any>): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.endpoint}/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          server,
          tool,
          args,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP Tool Call HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// MCP SERVER (Backend)
// ============================================================================

/**
 * MCP command handler
 */
export type MCPCommandHandler = (
  params: Record<string, any>,
  context: { agent_id: string }
) => Promise<any>;

/**
 * Layer 3 MCP Server
 * Handles incoming MCP commands from agents
 */
export class Layer3MCPServer extends EventEmitter {
  private handlers: Map<MCPCommandType, MCPCommandHandler> = new Map();
  private worlds: Map<string, WorldStatus> = new Map();

  constructor() {
    super();
    this.registerDefaultHandlers();
  }

  /**
   * Register command handler
   */
  registerHandler(command: MCPCommandType, handler: MCPCommandHandler): void {
    this.handlers.set(command, handler);
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(
    request: MCPCommandRequest,
    context: { agent_id: string }
  ): Promise<MCPCommandResponse> {
    try {
      const handler = this.handlers.get(request.command);

      if (!handler) {
        return {
          success: false,
          error: `Unknown command: ${request.command}`,
          timestamp: Date.now(),
        };
      }

      const data = await handler(request.params, context);

      this.emit('command_handled', { request, context, data });

      return {
        success: true,
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.emit('command_error', { request, context, error });

      return {
        success: false,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Register default handlers
   */
  private registerDefaultHandlers(): void {
    // Create world handler
    this.registerHandler('create_world', async (params, context) => {
      const worldSpec = params.world_spec as WorldSpec;

      const worldId = worldSpec.world_id || `world-${Date.now()}`;

      const status: WorldStatus = {
        world_id: worldId,
        name: worldSpec.name,
        status: 'initializing',
        active_agents: [],
        performance: {
          current_fps: worldSpec.target_fps,
          target_fps: worldSpec.target_fps,
          frame_time_avg_ms: 1000 / worldSpec.target_fps,
          frame_time_max_ms: 1000 / worldSpec.target_fps,
          quality_level: 'high',
        },
        spatial_conflicts: 0,
        resource_utilization: {
          cpu_percent: 0,
          memory_mb: 0,
          gpu_percent: 0,
        },
        uptime_ms: 0,
        created_at: new Date().toISOString(),
      };

      this.worlds.set(worldId, status);

      this.emit('world_created', { worldId, worldSpec, context });

      return { world_id: worldId, status };
    });

    // Get world status handler
    this.registerHandler('get_world_status', async (params, context) => {
      const worldId = params.world_id as string;
      const status = this.worlds.get(worldId);

      if (!status) {
        throw new Error(`World not found: ${worldId}`);
      }

      return status;
    });

    // Export world handler
    this.registerHandler('export_world', async (params, context) => {
      const worldId = params.world_id as string;
      const format = params.format as ExportFormat;

      const world = this.worlds.get(worldId);
      if (!world) {
        throw new Error(`World not found: ${worldId}`);
      }

      this.emit('world_exported', { worldId, format, context });

      // Simulate export
      return {
        url: `https://hololand.io/exports/${worldId}.${format}`,
        size: 1024 * 1024 * 10, // 10MB
      };
    });

    // Get agent registry handler
    this.registerHandler('get_agent_registry', async (params, context) => {
      const filter = params.filter as Record<string, unknown> | undefined;

      // Get all agents from worlds
      const agents: Record<string, unknown>[] = [];

      for (const world of this.worlds.values()) {
        for (const agent of world.active_agents) {
          if (filter) {
            if (filter.status && agent.status !== filter.status) continue;
            if (filter.role && agent.role !== filter.role) continue;
            if (filter.world_id && world.world_id !== filter.world_id) continue;
          }

          agents.push({
            ...agent,
            world_id: world.world_id,
            capabilities: [],
          });
        }
      }

      return {
        agents,
        total: agents.length,
      };
    });

    // Get performance metrics handler
    this.registerHandler('get_performance_metrics', async (params, context) => {
      const worldId = params.world_id as string | undefined;
      const agentId = params.agent_id as string | undefined;

      // Aggregate metrics from worlds
      const metrics: PerformanceMetrics = {
        timestamp: Date.now(),
        agents: [],
        system: {
          total_fps: 90,
          target_fps: 90,
          frame_time_avg_ms: 11.1,
          frame_time_max_ms: 15,
          quality_level: 'high',
          cpu_percent: 45,
          memory_mb: 2048,
          gpu_percent: 60,
        },
      };

      for (const world of this.worlds.values()) {
        if (worldId && world.world_id !== worldId) continue;

        for (const agent of world.active_agents) {
          if (agentId && agent.agent_id !== agentId) continue;

          metrics.agents.push({
            agent_id: agent.agent_id,
            role: agent.role,
            frame_time_avg_ms: 10,
            frame_time_max_ms: 12,
            messages_sent: 0,
            messages_received: 0,
            spatial_conflicts: 0,
          });
        }
      }

      return metrics;
    });

    // Set global config handler
    this.registerHandler('set_global_config', async (params, context) => {
      const config = params.config as Record<string, unknown>;

      this.emit('config_updated', { config, context });

      return { success: true };
    });

    // Trigger event handler
    this.registerHandler('trigger_event', async (params, context) => {
      const eventType = params.event_type as string;
      const eventData = params.event_data as Record<string, unknown>;

      this.emit('system_event', { eventType, eventData, context });

      return { success: true };
    });
  }

  /**
   * Get all worlds
   */
  getWorlds(): WorldStatus[] {
    return Array.from(this.worlds.values());
  }

  /**
   * Update world status
   */
  updateWorld(worldId: string, updates: Partial<WorldStatus>): void {
    const world = this.worlds.get(worldId);
    if (world) {
      Object.assign(world, updates);
      this.emit('world_updated', { worldId, updates });
    }
  }
}
