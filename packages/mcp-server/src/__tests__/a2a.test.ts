/**
 * A2A (Agent-to-Agent) Protocol — Comprehensive Tests
 *
 * Tests the full A2A specification implementation:
 * - Agent Card building with securitySchemes, skills, inputSchema/outputSchema
 * - MCP tool -> A2A skill mapping
 * - Task lifecycle (create, get, list, cancel, execute)
 * - JSON-RPC 2.0 transport handler (a2a.sendMessage, a2a.getTask, etc.)
 * - Task state machine (submitted -> working -> completed/failed/canceled/input-required)
 * - JSON-RPC error handling and validation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildAgentCard,
  mcpToolToA2ASkill,
  createTask,
  getTask,
  listTasks,
  cancelTask,
  executeTask,
  taskToResponse,
  handleJsonRpcRequest,
  parseJsonRpcRequest,
  type AgentCard,
  type AgentSkill,
  type A2ATask,
  type SendTaskRequest,
  type TaskMessage,
  type JsonRpcRequest,
} from '../a2a.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockTool: Tool = {
  name: 'parse_hs',
  description: 'Parse HoloScript code into an AST',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'The HoloScript code to parse' },
      format: { type: 'string', enum: ['hs', 'hsplus'] },
    },
    required: ['code'],
  },
};

const mockTools: Tool[] = [
  mockTool,
  {
    name: 'validate_holoscript',
    description: 'Validate HoloScript code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_holoscript',
    description: 'Compile HoloScript to target',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        target: { type: 'string' },
      },
      required: ['code', 'target'],
    },
  },
  {
    name: 'holo_absorb_repo',
    description: 'Scan and index a repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        force: { type: 'boolean' },
      },
      required: ['path'],
    },
  },
];

function makeMessage(text: string, role: 'user' | 'agent' = 'user'): TaskMessage {
  return {
    role,
    parts: [{ type: 'text', text }],
    timestamp: new Date().toISOString(),
  };
}

function makeTaskRequest(overrides?: Partial<SendTaskRequest>): SendTaskRequest {
  return {
    message: makeMessage('test request'),
    ...overrides,
  };
}

async function mockToolHandler(name: string, args: Record<string, unknown>): Promise<unknown> {
  return { tool: name, args, result: 'success' };
}

async function failingToolHandler(): Promise<unknown> {
  throw new Error('Tool execution failed');
}

// =============================================================================
// AGENT CARD
// =============================================================================

describe('buildAgentCard', () => {
  let card: AgentCard;

  beforeEach(() => {
    card = buildAgentCard(mockTools, 'https://mcp.holoscript.net', true);
  });

  it('has required id field', () => {
    expect(card.id).toBe('holoscript-agent');
  });

  it('has endpoint URL (spec field)', () => {
    expect(card.endpoint).toBe('https://mcp.holoscript.net/a2a');
  });

  it('has legacy url field for backwards compatibility', () => {
    expect(card.url).toBe('https://mcp.holoscript.net/a2a');
  });

  it('has name and description', () => {
    expect(card.name).toBe('HoloScript Agent');
    expect(card.description).toContain('HoloScript language tooling agent');
  });

  it('has version', () => {
    expect(card.version).toBe('1.0.0');
  });

  it('has provider information', () => {
    expect(card.provider.organization).toBe('HoloScript');
    expect(card.provider.url).toBe('https://holoscript.net');
  });

  it('has documentationUrl', () => {
    expect(card.documentationUrl).toContain('github.com');
  });

  it('declares capabilities', () => {
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.stateTransitionHistory).toBe(true);
    expect(card.capabilities.extendedAgentCard).toBe(false);
  });

  it('has securitySchemes when API key is configured', () => {
    expect(card.securitySchemes).toBeDefined();
    expect(card.securitySchemes['apiKey']).toBeDefined();
    expect(card.securitySchemes['apiKey'].type).toBe('apiKey');
    expect(card.securitySchemes['bearerAuth']).toBeDefined();
    expect(card.securitySchemes['bearerAuth'].type).toBe('http');
    expect(card.securitySchemes['oauth2']).toBeDefined();
    expect(card.securitySchemes['oauth2'].type).toBe('oauth2');
    expect(card.securitySchemes['openIdConnect']).toBeDefined();
    expect(card.securitySchemes['openIdConnect'].type).toBe('openIdConnect');
  });

  it('has security requirements referencing scheme keys', () => {
    expect(card.security.length).toBeGreaterThan(0);
    const schemeKeys = card.security.map((s) => Object.keys(s)[0]);
    expect(schemeKeys).toContain('apiKey');
    expect(schemeKeys).toContain('bearerAuth');
    expect(schemeKeys).toContain('oauth2');
  });

  it('has empty securitySchemes when no API key configured', () => {
    const openCard = buildAgentCard(mockTools, 'http://localhost:3000', false);
    expect(Object.keys(openCard.securitySchemes)).toHaveLength(0);
    expect(openCard.security).toHaveLength(0);
  });

  it('has default input/output modes', () => {
    expect(card.defaultInputModes).toContain('text/plain');
    expect(card.defaultInputModes).toContain('application/json');
    expect(card.defaultOutputModes).toContain('application/holoscript');
  });

  it('maps all tools to skills', () => {
    expect(card.skills).toHaveLength(mockTools.length);
  });

  it('includes OAuth2 flow URLs', () => {
    const oauth2 = card.securitySchemes['oauth2'];
    expect(oauth2.type).toBe('oauth2');
    if (oauth2.type === 'oauth2') {
      expect(oauth2.flows.authorizationCode?.authorizationUrl).toContain('/oauth/authorize');
      expect(oauth2.flows.authorizationCode?.tokenUrl).toContain('/oauth/token');
      expect(oauth2.flows.clientCredentials?.tokenUrl).toContain('/oauth/token');
    }
  });

  it('includes OpenID Connect URL', () => {
    const oidc = card.securitySchemes['openIdConnect'];
    if (oidc.type === 'openIdConnect') {
      expect(oidc.openIdConnectUrl).toContain('/.well-known/openid-configuration');
    }
  });

  it('includes legacy authentication field', () => {
    expect(card.authentication).toBeDefined();
    expect(card.authentication!.schemes).toContain('Bearer');
    expect(card.authentication!.schemes).toContain('ApiKey');
  });
});

// =============================================================================
// MCP TOOL -> A2A SKILL CONVERSION
// =============================================================================

describe('mcpToolToA2ASkill', () => {
  it('converts tool name to skill id', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.id).toBe('parse_hs');
  });

  it('generates human-readable name from tool name', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.name).toBe('Parse Hs');
  });

  it('preserves HS prefix for IDE tools', () => {
    const tool: Tool = {
      name: 'hs_diagnostics',
      description: 'Get diagnostics',
      inputSchema: { type: 'object', properties: {} },
    };
    const skill = mcpToolToA2ASkill(tool);
    expect(skill.name).toBe('HS Diagnostics');
  });

  it('includes description from tool', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.description).toBe('Parse HoloScript code into an AST');
  });

  it('has input/output modes', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.inputModes).toContain('text/plain');
    expect(skill.inputModes).toContain('application/json');
    expect(skill.outputModes).toContain('application/holoscript');
  });

  it('maps MCP inputSchema to A2A skill inputSchema', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.inputSchema).toBeDefined();
    expect(skill.inputSchema!.type).toBe('object');
    expect((skill.inputSchema!.properties as Record<string, unknown>)?.code).toBeDefined();
  });

  it('includes outputSchema', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.outputSchema).toBeDefined();
    expect(skill.outputSchema!.type).toBe('object');
  });

  it('derives tags for parsing tools', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.tags).toContain('holoscript');
    expect(skill.tags).toContain('parsing');
    expect(skill.tags).toContain('validation');
  });

  it('derives tags for compilation tools', () => {
    const tool: Tool = {
      name: 'compile_holoscript',
      description: 'Compile',
      inputSchema: { type: 'object', properties: {} },
    };
    const skill = mcpToolToA2ASkill(tool);
    expect(skill.tags).toContain('compilation');
  });

  it('derives tags for codebase intelligence tools', () => {
    const tool: Tool = {
      name: 'holo_absorb_repo',
      description: 'Absorb',
      inputSchema: { type: 'object', properties: {} },
    };
    const skill = mcpToolToA2ASkill(tool);
    expect(skill.tags).toContain('codebase');
    expect(skill.tags).toContain('intelligence');
  });

  it('generates examples for known tools', () => {
    const skill = mcpToolToA2ASkill(mockTool);
    expect(skill.examples!.length).toBeGreaterThan(0);
    expect(skill.examples![0]).toContain('Parse');
  });

  it('returns empty examples for unknown tools', () => {
    const tool: Tool = {
      name: 'custom_tool_xyz',
      description: 'Custom',
      inputSchema: { type: 'object', properties: {} },
    };
    const skill = mcpToolToA2ASkill(tool);
    expect(skill.examples).toHaveLength(0);
  });
});

// =============================================================================
// TASK LIFECYCLE
// =============================================================================

describe('Task Lifecycle', () => {
  beforeEach(() => {
    // Clear task store by creating and canceling tasks doesn't work since store is private
    // We rely on unique IDs to avoid collisions
  });

  describe('createTask', () => {
    it('creates a task with submitted state', () => {
      const task = createTask(makeTaskRequest());
      expect(task.status.state).toBe('submitted');
      expect(task.id).toBeDefined();
      expect(task.history).toHaveLength(1);
      expect(task.artifacts).toHaveLength(0);
    });

    it('uses provided id if given', () => {
      const task = createTask(makeTaskRequest({ id: 'custom-id-123' }));
      expect(task.id).toBe('custom-id-123');
    });

    it('sets sessionId when provided', () => {
      const task = createTask(makeTaskRequest({ sessionId: 'session-abc' }));
      expect(task.sessionId).toBe('session-abc');
    });

    it('sets contextId when provided', () => {
      const task = createTask(makeTaskRequest({ contextId: 'context-xyz' }));
      expect(task.contextId).toBe('context-xyz');
    });

    it('preserves metadata', () => {
      const task = createTask(
        makeTaskRequest({
          metadata: { skillId: 'parse_hs', custom: 'value' },
        })
      );
      expect(task.metadata?.skillId).toBe('parse_hs');
      expect(task.metadata?.custom).toBe('value');
    });

    it('sets timestamps', () => {
      const task = createTask(makeTaskRequest());
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
      expect(task.status.timestamp).toBeDefined();
    });
  });

  describe('getTask', () => {
    it('returns task by id', () => {
      const task = createTask(makeTaskRequest({ id: 'get-test-1' }));
      const found = getTask('get-test-1');
      expect(found).toBeDefined();
      expect(found!.id).toBe(task.id);
    });

    it('returns undefined for non-existent task', () => {
      expect(getTask('non-existent-id')).toBeUndefined();
    });
  });

  describe('listTasks', () => {
    it('returns tasks and total count', () => {
      createTask(makeTaskRequest({ id: 'list-1' }));
      createTask(makeTaskRequest({ id: 'list-2' }));
      const result = listTasks();
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.tasks.some((t) => t.id === 'list-1')).toBe(true);
      expect(result.tasks.some((t) => t.id === 'list-2')).toBe(true);
    });

    it('filters by sessionId', () => {
      createTask(makeTaskRequest({ id: 'sess-a1', sessionId: 'session-a' }));
      createTask(makeTaskRequest({ id: 'sess-b1', sessionId: 'session-b' }));
      const result = listTasks({ sessionId: 'session-a' });
      const ids = result.tasks.map((t) => t.id);
      expect(ids).toContain('sess-a1');
      expect(ids).not.toContain('sess-b1');
    });

    it('filters by contextId', () => {
      createTask(makeTaskRequest({ id: 'ctx-a1', contextId: 'ctx-a' }));
      createTask(makeTaskRequest({ id: 'ctx-b1', contextId: 'ctx-b' }));
      const result = listTasks({ contextId: 'ctx-a' });
      const ids = result.tasks.map((t) => t.id);
      expect(ids).toContain('ctx-a1');
      expect(ids).not.toContain('ctx-b1');
    });

    it('filters by state', () => {
      const task = createTask(makeTaskRequest({ id: 'state-filter' }));
      // All newly created tasks are 'submitted'
      const result = listTasks({ state: 'submitted' });
      expect(result.tasks.some((t) => t.id === 'state-filter')).toBe(true);

      const workingResult = listTasks({ state: 'working' });
      expect(workingResult.tasks.some((t) => t.id === 'state-filter')).toBe(false);
    });

    it('supports limit and offset', () => {
      const result = listTasks({ limit: 2, offset: 0 });
      expect(result.tasks.length).toBeLessThanOrEqual(2);
    });
  });

  describe('cancelTask', () => {
    it('cancels a submitted task', () => {
      const task = createTask(makeTaskRequest({ id: 'cancel-test-1' }));
      const canceled = cancelTask('cancel-test-1');
      expect(canceled).toBeDefined();
      expect(canceled!.status.state).toBe('canceled');
    });

    it('returns undefined for non-existent task', () => {
      expect(cancelTask('non-existent')).toBeUndefined();
    });

    it('does not cancel already completed tasks', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'cancel-completed',
          metadata: { skillId: 'parse_hs', arguments: { code: 'test' } },
        })
      );
      await executeTask(task, mockToolHandler);
      expect(task.status.state).toBe('completed');

      const result = cancelTask('cancel-completed');
      expect(result!.status.state).toBe('completed'); // Unchanged
    });
  });

  describe('executeTask', () => {
    it('transitions through working to completed on success', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-success',
          metadata: { skillId: 'parse_hs', arguments: { code: 'object Cube {}' } },
        })
      );

      const executed = await executeTask(task, mockToolHandler);
      expect(executed.status.state).toBe('completed');
      expect(executed.artifacts.length).toBeGreaterThan(0);
      expect(executed.history.length).toBeGreaterThan(1); // user + agent
    });

    it('transitions to failed on error', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-fail',
          metadata: { skillId: 'parse_hs', arguments: { code: 'bad' } },
        })
      );

      const executed = await executeTask(task, failingToolHandler);
      expect(executed.status.state).toBe('failed');
      expect(executed.status.message?.parts[0].text).toContain('Error');
    });

    it('transitions to input-required when no skillId', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-no-skill',
          // No metadata with skillId
        })
      );

      const executed = await executeTask(task, mockToolHandler);
      expect(executed.status.state).toBe('input-required');
    });

    it('extracts skillId from JSON in message text', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-json-msg',
          message: makeMessage(JSON.stringify({ tool: 'parse_hs', arguments: { code: 'test' } })),
        })
      );

      const executed = await executeTask(task, mockToolHandler);
      expect(executed.status.state).toBe('completed');
    });

    it('extracts skillId from data part', async () => {
      const task = createTask({
        id: 'exec-data-part',
        message: {
          role: 'user',
          parts: [
            { type: 'data', data: { tool: 'validate_holoscript', arguments: { code: 'x' } } },
          ],
          timestamp: new Date().toISOString(),
        },
      });

      const executed = await executeTask(task, mockToolHandler);
      expect(executed.status.state).toBe('completed');
    });

    it('creates artifact with id and mediaType', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-artifact',
          metadata: { skillId: 'parse_hs', arguments: { code: 'test' } },
        })
      );

      const executed = await executeTask(task, mockToolHandler);
      const artifact = executed.artifacts[0];
      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe('parse_hs_result');
      expect(artifact.mediaType).toBe('application/json');
      expect(artifact.index).toBe(0);
    });

    it('includes contextId and taskId in agent response messages', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'exec-context',
          contextId: 'ctx-123',
          metadata: { skillId: 'parse_hs', arguments: { code: 'x' } },
        })
      );

      const executed = await executeTask(task, mockToolHandler);
      const agentMsg = executed.history.find((m) => m.role === 'agent');
      expect(agentMsg?.contextId).toBe('ctx-123');
      expect(agentMsg?.taskId).toBe('exec-context');
    });
  });
});

// =============================================================================
// TASK RESPONSE FORMATTING
// =============================================================================

describe('taskToResponse', () => {
  it('formats task as SendTaskResponse', () => {
    const task = createTask(makeTaskRequest({ id: 'resp-test', contextId: 'ctx-r' }));
    const response = taskToResponse(task);
    expect(response.id).toBe('resp-test');
    expect(response.contextId).toBe('ctx-r');
    expect(response.status.state).toBe('submitted');
    expect(response.artifacts).toHaveLength(0);
    expect(response.history).toHaveLength(1);
  });
});

// =============================================================================
// JSON-RPC 2.0 TRANSPORT
// =============================================================================

describe('parseJsonRpcRequest', () => {
  it('parses valid JSON-RPC request', () => {
    const result = parseJsonRpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'a2a.sendMessage',
      params: { message: { role: 'user', parts: [{ type: 'text', text: 'hi' }] } },
    });
    expect('request' in result).toBe(true);
    if ('request' in result) {
      expect(result.request.method).toBe('a2a.sendMessage');
      expect(result.request.id).toBe(1);
    }
  });

  it('rejects missing jsonrpc field', () => {
    const result = parseJsonRpcRequest({ id: 1, method: 'test' });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.error!.code).toBe(-32600);
    }
  });

  it('rejects wrong jsonrpc version', () => {
    const result = parseJsonRpcRequest({ jsonrpc: '1.0', id: 1, method: 'test' });
    expect('error' in result).toBe(true);
  });

  it('rejects missing method', () => {
    const result = parseJsonRpcRequest({ jsonrpc: '2.0', id: 1 });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.error!.code).toBe(-32600);
    }
  });

  it('handles null id', () => {
    const result = parseJsonRpcRequest({ jsonrpc: '2.0', id: null, method: 'test' });
    expect('request' in result).toBe(true);
    if ('request' in result) {
      expect(result.request.id).toBeNull();
    }
  });

  it('handles string id', () => {
    const result = parseJsonRpcRequest({ jsonrpc: '2.0', id: 'abc-123', method: 'test' });
    expect('request' in result).toBe(true);
    if ('request' in result) {
      expect(result.request.id).toBe('abc-123');
    }
  });
});

describe('handleJsonRpcRequest', () => {
  // ── a2a.sendMessage ────────────────────────────────────────────────────────

  describe('a2a.sendMessage', () => {
    it('creates and executes a task with skillId', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'a2a.sendMessage',
          params: {
            skillId: 'parse_hs',
            arguments: { code: 'object Cube {}' },
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Parse this' }],
              timestamp: new Date().toISOString(),
            },
          },
        },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      const result = response.result as Record<string, unknown>;
      expect((result.status as Record<string, unknown>).state).toBe('completed');
    });

    it('returns input-required when no skill specified', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'a2a.sendMessage',
          params: {
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Help me' }],
              timestamp: new Date().toISOString(),
            },
          },
        },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect((result.status as Record<string, unknown>).state).toBe('input-required');
    });

    it('returns error when message is missing', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'a2a.sendMessage',
          params: {},
        },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });

    it('returns error when message.parts is empty', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'a2a.sendMessage',
          params: {
            message: { role: 'user', parts: [] },
          },
        },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });

    it('supports contextId in request', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'a2a.sendMessage',
          params: {
            contextId: 'conversation-123',
            skillId: 'parse_hs',
            arguments: { code: 'test' },
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Parse' }],
              timestamp: new Date().toISOString(),
            },
          },
        },
        mockToolHandler
      );

      const result = response.result as Record<string, unknown>;
      expect(result.contextId).toBe('conversation-123');
    });

    it('auto-fills missing timestamp and role', async () => {
      const response = await handleJsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'a2a.sendMessage',
          params: {
            skillId: 'parse_hs',
            arguments: { code: 'x' },
            message: {
              parts: [{ type: 'text', text: 'test' }],
            },
          },
        },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect((result.status as Record<string, unknown>).state).toBe('completed');
    });
  });

  // ── a2a.getTask ────────────────────────────────────────────────────────────

  describe('a2a.getTask', () => {
    it('retrieves a task by id', async () => {
      const task = createTask(makeTaskRequest({ id: 'rpc-get-1' }));

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 10, method: 'a2a.getTask', params: { id: 'rpc-get-1' } },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect(result.id).toBe('rpc-get-1');
    });

    it('returns error for non-existent task', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 11, method: 'a2a.getTask', params: { id: 'nope' } },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32001);
    });

    it('returns error when id is missing', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 12, method: 'a2a.getTask', params: {} },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });
  });

  // ── a2a.listTasks ──────────────────────────────────────────────────────────

  describe('a2a.listTasks', () => {
    it('lists tasks without filters', async () => {
      createTask(makeTaskRequest({ id: 'rpc-list-1' }));

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 20, method: 'a2a.listTasks', params: {} },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect(Array.isArray((result as Record<string, unknown>).tasks)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    it('filters by state', async () => {
      createTask(makeTaskRequest({ id: 'rpc-list-state' }));

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 21, method: 'a2a.listTasks', params: { state: 'submitted' } },
        mockToolHandler
      );

      const result = response.result as Record<string, unknown>;
      const tasks = result.tasks as Record<string, unknown>[];
      expect(tasks.some((t) => t.id === 'rpc-list-state')).toBe(true);
    });

    it('supports limit and offset', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 22, method: 'a2a.listTasks', params: { limit: 5, offset: 0 } },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect((result.tasks as unknown[]).length).toBeLessThanOrEqual(5);
    });
  });

  // ── a2a.cancelTask ─────────────────────────────────────────────────────────

  describe('a2a.cancelTask', () => {
    it('cancels a submitted task', async () => {
      createTask(makeTaskRequest({ id: 'rpc-cancel-1' }));

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 30, method: 'a2a.cancelTask', params: { id: 'rpc-cancel-1' } },
        mockToolHandler
      );

      expect(response.error).toBeUndefined();
      const result = response.result as Record<string, unknown>;
      expect((result.status as Record<string, unknown>).state).toBe('canceled');
    });

    it('returns error for non-existent task', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 31, method: 'a2a.cancelTask', params: { id: 'nope' } },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32001);
    });

    it('returns error when task is already completed', async () => {
      const task = createTask(
        makeTaskRequest({
          id: 'rpc-cancel-done',
          metadata: { skillId: 'parse_hs', arguments: { code: 'test' } },
        })
      );
      await executeTask(task, mockToolHandler);

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 32, method: 'a2a.cancelTask', params: { id: 'rpc-cancel-done' } },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32002);
    });

    it('returns error when id is missing', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 33, method: 'a2a.cancelTask', params: {} },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });
  });

  // ── a2a.getExtendedAgentCard ───────────────────────────────────────────────

  describe('a2a.getExtendedAgentCard', () => {
    it('returns agent card when builder is provided', async () => {
      const builder = () => buildAgentCard(mockTools, 'https://test.example.com', true);

      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 40, method: 'a2a.getExtendedAgentCard' },
        mockToolHandler,
        builder
      );

      expect(response.error).toBeUndefined();
      const result = response.result as AgentCard;
      expect(result.id).toBe('holoscript-agent');
      expect(result.skills.length).toBe(mockTools.length);
    });

    it('returns error when builder is not provided', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 41, method: 'a2a.getExtendedAgentCard' },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });
  });

  // ── Unknown method ─────────────────────────────────────────────────────────

  describe('unknown method', () => {
    it('returns method not found error', async () => {
      const response = await handleJsonRpcRequest(
        { jsonrpc: '2.0', id: 50, method: 'a2a.unknownMethod' },
        mockToolHandler
      );

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
      expect(response.error!.message).toContain('Unknown method');
    });
  });
});

// =============================================================================
// TASK STATE MACHINE
// =============================================================================

describe('Task State Machine', () => {
  it('submitted -> working -> completed (success path)', async () => {
    const task = createTask(
      makeTaskRequest({
        id: 'sm-success',
        metadata: { skillId: 'parse_hs', arguments: { code: 'test' } },
      })
    );
    expect(task.status.state).toBe('submitted');

    await executeTask(task, mockToolHandler);
    expect(task.status.state).toBe('completed');
  });

  it('submitted -> working -> failed (error path)', async () => {
    const task = createTask(
      makeTaskRequest({
        id: 'sm-fail',
        metadata: { skillId: 'parse_hs', arguments: { code: 'bad' } },
      })
    );
    expect(task.status.state).toBe('submitted');

    await executeTask(task, failingToolHandler);
    expect(task.status.state).toBe('failed');
  });

  it('submitted -> working -> input-required (missing skill)', async () => {
    const task = createTask(makeTaskRequest({ id: 'sm-input-req' }));

    await executeTask(task, mockToolHandler);
    expect(task.status.state).toBe('input-required');
  });

  it('submitted -> canceled', () => {
    createTask(makeTaskRequest({ id: 'sm-cancel' }));
    const canceled = cancelTask('sm-cancel');
    expect(canceled!.status.state).toBe('canceled');
  });

  it('terminal states cannot be re-canceled', async () => {
    const task = createTask(
      makeTaskRequest({
        id: 'sm-terminal',
        metadata: { skillId: 'parse_hs', arguments: { code: 'x' } },
      })
    );
    await executeTask(task, mockToolHandler);
    expect(task.status.state).toBe('completed');

    // Cancel returns the task but does not change state
    const result = cancelTask('sm-terminal');
    expect(result!.status.state).toBe('completed');
  });
});

// =============================================================================
// SKILL TAG DERIVATION (coverage for all categories)
// =============================================================================

describe('Skill Tag Derivation (comprehensive)', () => {
  const tagCases: [string, string[]][] = [
    ['parse_hs', ['parsing', 'validation']],
    ['validate_holoscript', ['parsing', 'validation']],
    ['list_traits', ['traits', 'spatial']],
    ['generate_object', ['generation', 'ai']],
    ['holo_absorb_repo', ['codebase', 'intelligence']],
    ['holo_semantic_search', ['search', 'rag']],
    ['holo_parse_to_graph', ['graph', 'visualization']],
    ['holo_self_diagnose', ['quality', 'self-improvement']],
    ['holo_write_file', ['filesystem', 'editing']],
    ['holo_query_wisdom', ['codebase', 'analysis', 'intelligence']],
    ['holo_generate_refactor', ['refactoring', 'codegen']],
    ['hs_diagnostics', ['ide', 'lsp']],
    ['hs_ai_explain_error', ['ai', 'assistant']],
    ['browser_launch', ['browser', 'preview']],
    ['compile_to_unity', ['compilation', 'export']],
    ['push_state_delta', ['networking', 'multiplayer']],
    ['create_temporal_snapshot', ['temporal', 'snapshot']],
    ['get_telemetry_metrics', ['monitoring', 'telemetry']],
    ['render_preview', ['rendering', 'preview']],
    ['import_gltf', ['gltf', 'import']],
    ['absorb_pipeline_status', ['absorb', 'service']],
    ['execute_holotest', ['testing', 'spatial']],
    ['get_syntax_reference', ['documentation', 'learning']],
    ['generate_hololand_training', ['generation', 'ai', 'codegen']],
    ['generate_3d_object', ['generation', 'ai', 'codegen']],
    ['convert_format', ['conversion', 'transformation']],
    ['some_unknown_tool', ['utility']],
  ];

  for (const [toolName, expectedTags] of tagCases) {
    it(`derives correct tags for ${toolName}`, () => {
      const tool: Tool = {
        name: toolName,
        description: `Test tool: ${toolName}`,
        inputSchema: { type: 'object', properties: {} },
      };
      const skill = mcpToolToA2ASkill(tool);
      expect(skill.tags).toContain('holoscript');
      for (const tag of expectedTags) {
        expect(skill.tags).toContain(tag);
      }
    });
  }
});
