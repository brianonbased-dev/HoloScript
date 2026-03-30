/**
 * A2A (Agent-to-Agent) Protocol Implementation for HoloScript MCP Server
 *
 * Full implementation of the A2A specification (https://a2a-protocol.org/latest/specification/)
 * providing:
 * - Agent Card at /.well-known/agent-card.json (spec-compliant with securitySchemes)
 * - JSON-RPC 2.0 transport (a2a.sendMessage, a2a.getTask, a2a.listTasks, a2a.cancelTask)
 * - Task lifecycle with full state machine (submitted -> working -> completed/failed/canceled/input-required/auth-required/rejected)
 * - Skill mapping from MCP tools to A2A AgentSkill objects with inputSchema/outputSchema
 * - REST fallback endpoints for backwards compatibility
 *
 * Tasks delegate to the existing MCP tool handler pipeline via triple-gate security,
 * bridging A2A interoperability with the full 82+ HoloScript tool surface.
 */

import { randomUUID } from 'crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// A2A TYPES (per specification — https://a2a-protocol.org/latest/specification/)
// =============================================================================

// ── Security Schemes ─────────────────────────────────────────────────────────

export interface APIKeySecurityScheme {
  type: 'apiKey';
  description?: string;
  name: string;
  in: 'header' | 'query';
}

export interface HTTPAuthSecurityScheme {
  type: 'http';
  description?: string;
  scheme: string; // e.g. 'bearer', 'basic'
  bearerFormat?: string;
}

export interface OAuth2Flow {
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes: Record<string, string>;
}

export interface OAuth2SecurityScheme {
  type: 'oauth2';
  description?: string;
  flows: {
    authorizationCode?: OAuth2Flow;
    clientCredentials?: OAuth2Flow;
    implicit?: OAuth2Flow;
  };
}

export interface OpenIdConnectSecurityScheme {
  type: 'openIdConnect';
  description?: string;
  openIdConnectUrl: string;
}

export type SecurityScheme =
  | APIKeySecurityScheme
  | HTTPAuthSecurityScheme
  | OAuth2SecurityScheme
  | OpenIdConnectSecurityScheme;

// ── Agent Card ───────────────────────────────────────────────────────────────

export interface AgentProvider {
  organization: string;
  url: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
  extendedAgentCard?: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes: string[];
  outputModes: string[];
  /** JSON Schema for skill input parameters (derived from MCP tool inputSchema) */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for skill output (derived from MCP tool output format) */
  outputSchema?: Record<string, unknown>;
}

export interface AgentCard {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Detailed agent description */
  description: string;
  /** Service endpoint URL (JSON-RPC 2.0 transport) */
  endpoint: string;
  /** Agent card version */
  version: string;
  /** URL to documentation */
  documentationUrl?: string;
  /** Agent provider information */
  provider: AgentProvider;
  /** Declared capabilities */
  capabilities: AgentCapabilities;
  /** Security scheme definitions (referenced by `security`) */
  securitySchemes: Record<string, SecurityScheme>;
  /** Default security requirements (references keys in securitySchemes) */
  security: Record<string, string[]>[];
  /** Default input content types accepted */
  defaultInputModes: string[];
  /** Default output content types produced */
  defaultOutputModes: string[];
  /** Skill declarations (mapped from MCP tools) */
  skills: AgentSkill[];

  // ── Legacy compatibility fields (kept for backwards-compat) ──────────────
  /** @deprecated Use `endpoint` instead. Kept for legacy consumers. */
  url?: string;
  /** @deprecated Use `securitySchemes` instead. */
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
}

// ── Task Types ───────────────────────────────────────────────────────────────

/**
 * Full task state machine per A2A spec.
 *
 * Active states: submitted, working, input-required, auth-required
 * Terminal states: completed, failed, canceled, rejected
 */
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected';

/** Terminal states that cannot transition further */
const TERMINAL_STATES: TaskState[] = ['completed', 'failed', 'canceled', 'rejected'];

export interface TaskPart {
  type: 'text' | 'data' | 'file';
  /** Text content (when type = 'text') */
  text?: string;
  /** Structured data (when type = 'data') */
  data?: unknown;
  /** MIME type of the content */
  mimeType?: string;
  /** File reference (when type = 'file') */
  fileReference?: {
    url: string;
    name?: string;
    size?: number;
    mimeType?: string;
  };
}

export interface TaskMessage {
  role: 'user' | 'agent';
  parts: TaskPart[];
  timestamp: string;
  /** Conversation context identifier for multi-turn */
  contextId?: string;
  /** Parent task reference */
  taskId?: string;
  /** Related task references */
  referenceTaskIds?: string[];
}

export interface TaskArtifact {
  /** Unique artifact identifier */
  id: string;
  name: string;
  description?: string;
  parts: TaskPart[];
  index: number;
  /** Primary media type */
  mediaType?: string;
  /** Additional artifact metadata */
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  sessionId?: string;
  contextId?: string;
  status: {
    state: TaskState;
    message?: TaskMessage;
    timestamp: string;
  };
  history: TaskMessage[];
  artifacts: TaskArtifact[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Request/Response Types ───────────────────────────────────────────────────

export interface SendTaskRequest {
  id?: string;
  sessionId?: string;
  contextId?: string;
  message: TaskMessage;
  /** Optional: specify which skill (MCP tool) to invoke */
  skillId?: string;
  /** Optional: direct tool arguments for skill invocation */
  arguments?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SendTaskResponse {
  id: string;
  sessionId?: string;
  contextId?: string;
  status: A2ATask['status'];
  artifacts: TaskArtifact[];
  history: TaskMessage[];
}

// ── JSON-RPC 2.0 Types ──────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Standard JSON-RPC error codes
const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL_ERROR = -32603;
// A2A-specific error codes (application layer: -32000 to -32099)
const A2A_TASK_NOT_FOUND = -32001;
const A2A_TASK_NOT_CANCELABLE = -32002;

// =============================================================================
// SKILL CATEGORY MAPPING
// =============================================================================

/**
 * Maps MCP tool name prefixes/patterns to A2A skill tags for rich discoverability.
 */
export function deriveSkillTags(toolName: string): string[] {
  const tags: string[] = ['holoscript'];

  // Parsing & validation
  if (toolName.startsWith('parse_') || toolName === 'validate_holoscript') {
    tags.push('parsing', 'validation', 'language');
  }
  // Universal traits (v6)
  else if (toolName === 'suggest_universal_traits') {
    tags.push('traits', 'universal', 'service', 'infrastructure');
  }
  // Service contracts
  else if (toolName.includes('service_contract')) {
    tags.push('contract', 'openapi', 'codegen', 'service');
  }
  // Traits
  else if (toolName.includes('trait')) {
    tags.push('traits', 'spatial', 'vr');
  }
  // Generation
  else if (toolName.startsWith('generate_') || toolName === 'generate_scene') {
    tags.push('generation', 'ai', 'codegen');
  }
  // Codebase intelligence
  else if (
    toolName.startsWith('holo_absorb') ||
    toolName.startsWith('holo_query') ||
    toolName.startsWith('holo_impact') ||
    toolName.startsWith('holo_detect') ||
    toolName.startsWith('holo_graph_status') ||
    toolName.startsWith('holo_resolve') ||
    toolName.startsWith('holo_get_absorb')
  ) {
    tags.push('codebase', 'analysis', 'intelligence');
  }
  // Graph RAG
  else if (toolName.startsWith('holo_semantic') || toolName.startsWith('holo_ask')) {
    tags.push('search', 'rag', 'knowledge');
  }
  // Graph tools
  else if (
    toolName.startsWith('holo_parse_to') ||
    toolName.startsWith('holo_visualize') ||
    toolName.startsWith('holo_get_node') ||
    toolName.startsWith('holo_design') ||
    toolName.startsWith('holo_diff') ||
    toolName.startsWith('holo_suggest_connections')
  ) {
    tags.push('graph', 'visualization', 'analysis');
  }
  // Self-improve / quality
  else if (
    toolName.startsWith('holo_self') ||
    toolName.startsWith('holo_validate') ||
    toolName.startsWith('holo_quality') ||
    toolName.startsWith('holo_verify')
  ) {
    tags.push('quality', 'self-improvement', 'testing');
  }
  // File operations
  else if (
    toolName.startsWith('holo_write') ||
    toolName.startsWith('holo_edit') ||
    toolName.startsWith('holo_read') ||
    toolName.startsWith('holo_git')
  ) {
    tags.push('filesystem', 'editing', 'git');
  }
  // Wisdom/gotcha
  else if (
    toolName.startsWith('holo_query_wisdom') ||
    toolName.startsWith('holo_list_gotchas') ||
    toolName.startsWith('holo_check_gotchas')
  ) {
    tags.push('knowledge', 'wisdom', 'patterns');
  }
  // Refactor/codegen
  else if (toolName.startsWith('holo_generate_refactor') || toolName.startsWith('holo_scaffold')) {
    tags.push('refactoring', 'codegen', 'architecture');
  }
  // IDE tools
  else if (toolName.startsWith('hs_') && !toolName.startsWith('hs_ai_')) {
    tags.push('ide', 'lsp', 'editing');
  }
  // Brittney-Lite AI
  else if (toolName.startsWith('hs_ai_')) {
    tags.push('ai', 'assistant', 'brittney');
  }
  // Browser control
  else if (toolName.startsWith('browser_')) {
    tags.push('browser', 'preview', 'rendering');
  }
  // Compilation
  else if (
    toolName.startsWith('compile_') ||
    toolName === 'compile_holoscript' ||
    toolName.startsWith('get_compilation') ||
    toolName === 'list_export_targets' ||
    toolName.startsWith('get_circuit')
  ) {
    tags.push('compilation', 'export', 'multi-target');
  }
  // Networking
  else if (toolName.startsWith('push_state') || toolName.startsWith('fetch_authoritative')) {
    tags.push('networking', 'multiplayer', 'sync');
  }
  // Snapshots / temporal
  else if (
    toolName.includes('snapshot') ||
    toolName.includes('rewind') ||
    toolName.includes('temporal')
  ) {
    tags.push('temporal', 'snapshot', 'versioning');
  }
  // Monitoring
  else if (toolName.includes('telemetry') || toolName.includes('metrics')) {
    tags.push('monitoring', 'telemetry', 'observability');
  }
  // Rendering/sharing
  else if (toolName.includes('render') || toolName.includes('share')) {
    tags.push('rendering', 'preview', 'sharing');
  }
  // GLTF
  else if (toolName.includes('gltf')) {
    tags.push('gltf', 'import', 'export', '3d');
  }
  // Agent orchestration
  else if (
    toolName === 'discover_agents' ||
    toolName === 'delegate_task' ||
    toolName === 'get_task_status' ||
    toolName === 'compose_workflow' ||
    toolName === 'execute_workflow'
  ) {
    tags.push('agent', 'orchestration', 'delegation', 'workflow');
  }
  // Absorb service
  else if (toolName.startsWith('absorb_')) {
    tags.push('absorb', 'service', 'pipeline');
  }
  // Testing
  else if (toolName.includes('test') || toolName === 'execute_holotest') {
    tags.push('testing', 'spatial', 'validation');
  }
  // Docs / explanation
  else if (
    toolName.includes('syntax') ||
    toolName.includes('example') ||
    toolName.includes('explain') ||
    toolName.includes('analyze') ||
    toolName.includes('docs')
  ) {
    tags.push('documentation', 'learning', 'reference');
  }
  // Training data
  else if (toolName.includes('training') || toolName.includes('hololand')) {
    tags.push('training', 'dataset', 'fine-tuning');
  }
  // 3D object generation
  else if (toolName === 'generate_3d_object') {
    tags.push('3d', 'mesh', 'generation');
  }
  // Format conversion
  else if (toolName === 'convert_format' || toolName === 'edit_holo') {
    tags.push('conversion', 'transformation', 'editing');
  }
  // Moltbook social tools
  else if (toolName.startsWith('moltbook_')) {
    tags.push('social', 'moltbook', 'engagement');
  }
  // Catch-all
  else {
    tags.push('utility');
  }

  return tags;
}

/**
 * Generate example prompts for a skill based on its tool definition
 */
function deriveSkillExamples(tool: Tool): string[] {
  const examples: string[] = [];
  const name = tool.name;

  if (name === 'parse_hs') {
    examples.push('Parse this HoloScript code: object Cube { position: [0,1,0] }');
  } else if (name === 'validate_holoscript') {
    examples.push('Validate my HoloScript composition for errors');
  } else if (name === 'suggest_traits') {
    examples.push('Suggest traits for a sword that can be picked up and thrown');
  } else if (name === 'suggest_universal_traits') {
    examples.push('Suggest universal traits for a REST API with Redis caching and JWT auth');
  } else if (name === 'generate_service_contract') {
    examples.push('Generate .holo composition from this OpenAPI spec');
  } else if (name === 'explain_service_contract') {
    examples.push('Explain the contract structure of this .holo service composition');
  } else if (name === 'validate_composition') {
    examples.push('Validate this .holo composition for trait constraint violations');
  } else if (name === 'absorb_typescript') {
    examples.push('Convert this Express/TypeScript service to a .holo composition');
  } else if (name === 'generate_scene') {
    examples.push('Generate a multiplayer VR lobby with teleportation');
  } else if (name === 'compile_holoscript') {
    examples.push('Compile this scene to Unity format');
  } else if (name === 'render_preview') {
    examples.push('Render a preview of my 3D scene as PNG');
  } else if (name === 'holo_absorb_repo') {
    examples.push('Scan and index this repository for code intelligence');
  } else if (name === 'holo_ask_codebase') {
    examples.push('How does the compiler pipeline work?');
  }

  return examples;
}

// =============================================================================
// MCP TOOL -> A2A SKILL CONVERSION
// =============================================================================

/**
 * Convert an MCP Tool definition into an A2A AgentSkill.
 *
 * Maps the full MCP inputSchema to A2A's inputSchema field, and generates
 * a standard outputSchema describing the tool's return format.
 */
export function mcpToolToA2ASkill(tool: Tool): AgentSkill {
  const skill: AgentSkill = {
    id: tool.name,
    name: tool.name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/^Hs /, 'HS ')
      .replace(/^Holo /, 'Holo'),
    description: tool.description || `HoloScript tool: ${tool.name}`,
    tags: deriveSkillTags(tool.name),
    examples: deriveSkillExamples(tool),
    inputModes: ['text/plain', 'application/json'],
    outputModes: ['text/plain', 'application/json', 'application/holoscript'],
  };

  // Map MCP tool inputSchema to A2A skill inputSchema
  if (tool.inputSchema) {
    skill.inputSchema = tool.inputSchema as Record<string, unknown>;
  }

  // Standard output schema for all HoloScript tools
  skill.outputSchema = {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['text'] },
            text: { type: 'string' },
          },
        },
      },
    },
  };

  return skill;
}

/**
 * Build the complete A2A Agent Card from the current tool inventory.
 *
 * Generates a spec-compliant Agent Card with:
 * - Unique `id` identifier
 * - `endpoint` URL for JSON-RPC 2.0 transport
 * - `securitySchemes` with API key, Bearer token, and OAuth2 definitions
 * - `security` array referencing the scheme keys
 * - All MCP tools mapped to AgentSkill objects with inputSchema/outputSchema
 */
export function buildAgentCard(
  allTools: Tool[],
  baseUrl: string,
  apiKeyConfigured: boolean
): AgentCard {
  const skills = allTools.map(mcpToolToA2ASkill);

  // Build security schemes based on configuration
  const securitySchemes: Record<string, SecurityScheme> = {};
  const security: Record<string, string[]>[] = [];

  if (apiKeyConfigured) {
    securitySchemes['apiKey'] = {
      type: 'apiKey',
      description: 'API key passed via x-api-key header',
      name: 'x-api-key',
      in: 'header',
    };
    securitySchemes['bearerAuth'] = {
      type: 'http',
      description: 'Bearer token (API key or OAuth2 access token) via Authorization header',
      scheme: 'bearer',
    };
    securitySchemes['oauth2'] = {
      type: 'oauth2',
      description: 'OAuth 2.1 with PKCE (S256) and client credentials flows',
      flows: {
        authorizationCode: {
          authorizationUrl: `${baseUrl}/oauth/authorize`,
          tokenUrl: `${baseUrl}/oauth/token`,
          scopes: {
            'tools:read': 'Read-only access to tool outputs (parse, validate, list, explain)',
            'tools:execute': 'Execute tools that produce output (compile, render, generate)',
            'tasks:read': 'Read A2A task state and history',
            'tasks:write': 'Create, send, and cancel A2A tasks',
            admin: 'Full administrative access to all tools and endpoints',
            // Legacy scope aliases (backwards compatibility)
            'tools:write': 'Legacy alias for tools:execute',
            'tools:admin': 'Legacy alias for admin',
            'admin:*': 'Legacy alias for admin',
          },
        },
        clientCredentials: {
          tokenUrl: `${baseUrl}/oauth/token`,
          scopes: {
            'tools:read': 'Read-only access to tool outputs',
            'tools:execute': 'Execute tools that produce output',
            'tasks:read': 'Read A2A task state and history',
            'tasks:write': 'Create, send, and cancel A2A tasks',
          },
        },
      },
    };
    securitySchemes['openIdConnect'] = {
      type: 'openIdConnect',
      description: 'OpenID Connect discovery for OAuth 2.1',
      openIdConnectUrl: `${baseUrl}/.well-known/openid-configuration`,
    };

    // Any one of these schemes is sufficient
    security.push({ apiKey: [] });
    security.push({ bearerAuth: [] });
    security.push({ oauth2: ['tools:read'] });
  }

  const card: AgentCard = {
    id: 'holoscript-agent',
    name: 'HoloScript Agent',
    description:
      `HoloScript v6.0 language tooling agent — parse, validate, compile, render, and generate ` +
      `spatial computing code (.hs/.hsplus/.holo) across 28+ export targets including Unity, ` +
      `Unreal, WebGPU, VisionOS, and more. Provides ${allTools.length}+ tools for codebase intelligence, ` +
      `AI-assisted code generation, graph analysis, multiplayer networking, and browser preview.`,
    endpoint: `${baseUrl}/a2a`,
    version: '1.0.0',
    documentationUrl: 'https://github.com/buildwithholoscript/HoloScript',
    provider: {
      organization: 'HoloScript',
      url: 'https://holoscript.net',
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extendedAgentCard: false,
    },
    securitySchemes,
    security,
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json', 'application/holoscript'],
    skills,

    // Legacy compatibility
    url: `${baseUrl}/a2a`,
    authentication: apiKeyConfigured
      ? {
          schemes: ['Bearer', 'ApiKey'],
          credentials: 'API key via Authorization: Bearer <key> or x-api-key header',
        }
      : {
          schemes: [],
        },
  };

  return card;
}

// =============================================================================
// IN-MEMORY TASK STORE
// =============================================================================

const taskStore = new Map<string, A2ATask>();
const MAX_TASKS = 10000;
const TASK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Evict expired tasks from the store.
 */
function evictExpiredTasks(): void {
  const now = Date.now();
  for (const [id, task] of taskStore) {
    if (now - new Date(task.createdAt).getTime() > TASK_TTL_MS) {
      taskStore.delete(id);
    }
  }
}

/**
 * Create a new task in the store.
 */
export function createTask(request: SendTaskRequest): A2ATask {
  evictExpiredTasks();

  // Enforce max tasks
  if (taskStore.size >= MAX_TASKS) {
    // Remove oldest completed/failed/canceled/rejected tasks first
    const removable = [...taskStore.entries()]
      .filter(([, t]) => TERMINAL_STATES.includes(t.status.state))
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime());

    for (const [id] of removable) {
      taskStore.delete(id);
      if (taskStore.size < MAX_TASKS) break;
    }
  }

  const now = new Date().toISOString();
  const task: A2ATask = {
    id: request.id || randomUUID(),
    sessionId: request.sessionId,
    contextId: request.contextId,
    status: {
      state: 'submitted',
      timestamp: now,
    },
    history: [request.message],
    artifacts: [],
    metadata: request.metadata,
    createdAt: now,
    updatedAt: now,
  };

  taskStore.set(task.id, task);
  return task;
}

/**
 * Get a task by ID.
 */
export function getTask(id: string): A2ATask | undefined {
  return taskStore.get(id);
}

/**
 * List all tasks, optionally filtered.
 */
export function listTasks(filters?: {
  sessionId?: string;
  contextId?: string;
  state?: TaskState;
  limit?: number;
  offset?: number;
}): { tasks: A2ATask[]; total: number } {
  let tasks = [...taskStore.values()];

  if (filters?.sessionId) {
    tasks = tasks.filter((t) => t.sessionId === filters.sessionId);
  }
  if (filters?.contextId) {
    tasks = tasks.filter((t) => t.contextId === filters.contextId);
  }
  if (filters?.state) {
    tasks = tasks.filter((t) => t.status.state === filters.state);
  }

  // Sort by creation time, newest first
  tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = tasks.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  tasks = tasks.slice(offset, offset + limit);

  return { tasks, total };
}

/**
 * Cancel a task.
 */
export function cancelTask(id: string): A2ATask | undefined {
  const task = taskStore.get(id);
  if (!task) return undefined;

  // Only cancel if not already in a terminal state
  if (TERMINAL_STATES.includes(task.status.state)) {
    return task; // Already terminal, return as-is
  }

  const now = new Date().toISOString();
  task.status = {
    state: 'canceled',
    timestamp: now,
  };
  task.updatedAt = now;
  return task;
}

/**
 * Execute a task by routing to the appropriate MCP tool handler.
 *
 * This is the bridge between A2A task semantics and MCP tool execution.
 * It extracts the tool name and arguments from the task message, invokes
 * the handler pipeline, and updates the task with results.
 */
export async function executeTask(
  task: A2ATask,
  toolHandler: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<A2ATask> {
  const now = () => new Date().toISOString();

  // Transition to working
  task.status = { state: 'working', timestamp: now() };
  task.updatedAt = now();

  try {
    // Extract tool invocation from task
    const { skillId, args } = extractToolInvocation(task);

    if (!skillId) {
      // No specific tool requested; return guidance
      task.status = {
        state: 'input-required',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text:
                'Please specify a skillId (MCP tool name) to invoke. ' +
                'You can discover available skills via GET /.well-known/agent-card.json ' +
                'or by calling the a2a.getExtendedAgentCard JSON-RPC method.',
            },
          ],
          timestamp: now(),
        },
        timestamp: now(),
      };
      task.updatedAt = now();
      return task;
    }

    // Execute the MCP tool
    const result = await toolHandler(skillId, args);

    // Build artifact from result
    const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const artifact: TaskArtifact = {
      id: randomUUID(),
      name: `${skillId}_result`,
      description: `Output from ${skillId} tool execution`,
      parts: [
        {
          type: 'text',
          text: resultText,
          mimeType: typeof result === 'string' ? 'text/plain' : 'application/json',
        },
      ],
      index: task.artifacts.length,
      mediaType: typeof result === 'string' ? 'text/plain' : 'application/json',
    };
    task.artifacts.push(artifact);

    // Build agent response message
    const agentMessage: TaskMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: resultText }],
      timestamp: now(),
      contextId: task.contextId,
      taskId: task.id,
    };
    task.history.push(agentMessage);

    // Transition to completed
    task.status = {
      state: 'completed',
      message: agentMessage,
      timestamp: now(),
    };
    task.updatedAt = now();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const agentMessage: TaskMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: `Error: ${errorMessage}` }],
      timestamp: now(),
      contextId: task.contextId,
      taskId: task.id,
    };
    task.history.push(agentMessage);

    task.status = {
      state: 'failed',
      message: agentMessage,
      timestamp: now(),
    };
    task.updatedAt = now();
  }

  return task;
}

/**
 * Extract the MCP tool name and arguments from a task's request context.
 *
 * Supports multiple invocation patterns:
 * 1. Explicit skillId + arguments in the task metadata
 * 2. JSON payload in the first message part with { tool, arguments }
 * 3. Data parts with tool invocation
 */
function extractToolInvocation(task: A2ATask): {
  skillId: string | undefined;
  args: Record<string, unknown>;
} {
  // Pattern 1: metadata.skillId (set from request body)
  if (task.metadata?.skillId) {
    return {
      skillId: task.metadata.skillId as string,
      args: (task.metadata.arguments as Record<string, unknown>) || {},
    };
  }

  // Pattern 2: Parse the first user message for structured invocation
  const firstMessage = task.history.find((m) => m.role === 'user');
  if (firstMessage) {
    for (const part of firstMessage.parts) {
      // Try parsing as JSON tool invocation
      if (part.type === 'text' && part.text) {
        try {
          const parsed = JSON.parse(part.text);
          if (parsed.tool || parsed.skillId) {
            return {
              skillId: parsed.tool || parsed.skillId,
              args: parsed.arguments || parsed.args || {},
            };
          }
        } catch {
          // Not JSON, try other patterns
        }
      }
      // Data parts with tool invocation
      if (part.type === 'data' && part.data) {
        const data = part.data as Record<string, unknown>;
        if (data.tool || data.skillId) {
          return {
            skillId: (data.tool || data.skillId) as string,
            args: (data.arguments || data.args || {}) as Record<string, unknown>,
          };
        }
      }
    }
  }

  return { skillId: undefined, args: {} };
}

// =============================================================================
// JSON-RPC 2.0 TRANSPORT HANDLER
// =============================================================================

/**
 * Handle a JSON-RPC 2.0 request per A2A specification.
 *
 * Supported methods:
 * - a2a.sendMessage: Send a message to create/continue a task
 * - a2a.getTask: Get task by ID
 * - a2a.listTasks: List tasks with optional filters
 * - a2a.cancelTask: Cancel a running task
 * - a2a.getExtendedAgentCard: Get agent card (authenticated, may include extra info)
 *
 * @param request The parsed JSON-RPC request
 * @param toolHandler Function to execute MCP tools (routed through triple-gate security)
 * @param agentCardBuilder Function to build the agent card for getExtendedAgentCard
 * @returns JSON-RPC response
 */
export async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  toolHandler: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  agentCardBuilder?: () => AgentCard
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  switch (method) {
    // ── a2a.sendMessage ────────────────────────────────────────────────────
    case 'a2a.sendMessage': {
      if (!params?.message) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: JSONRPC_INVALID_PARAMS,
            message: 'Missing required parameter: message',
          },
        };
      }

      const message: TaskMessage = params.message as TaskMessage;
      if (!message.parts || !Array.isArray(message.parts) || message.parts.length === 0) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: JSONRPC_INVALID_PARAMS,
            message: 'message.parts must be a non-empty array',
          },
        };
      }

      // Ensure timestamp
      if (!message.timestamp) {
        message.timestamp = new Date().toISOString();
      }
      if (!message.role) {
        message.role = 'user';
      }

      const taskRequest: SendTaskRequest = {
        id: params.id as string | undefined,
        sessionId: params.sessionId as string | undefined,
        contextId: (params.contextId || message.contextId) as string | undefined,
        message,
        skillId: params.skillId as string | undefined,
        arguments: params.arguments as Record<string, unknown> | undefined,
        metadata: {
          ...((params.metadata as Record<string, unknown>) || {}),
          ...(params.skillId ? { skillId: params.skillId } : {}),
          ...(params.arguments ? { arguments: params.arguments } : {}),
        },
      };

      const task = createTask(taskRequest);
      const executed = await executeTask(task, toolHandler);

      return {
        jsonrpc: '2.0',
        id,
        result: taskToResponse(executed),
      };
    }

    // ── a2a.getTask ────────────────────────────────────────────────────────
    case 'a2a.getTask': {
      const taskId = params?.id as string;
      if (!taskId) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: JSONRPC_INVALID_PARAMS,
            message: 'Missing required parameter: id',
          },
        };
      }

      const task = getTask(taskId);
      if (!task) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: A2A_TASK_NOT_FOUND,
            message: `Task not found: ${taskId}`,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: taskToResponse(task),
      };
    }

    // ── a2a.listTasks ──────────────────────────────────────────────────────
    case 'a2a.listTasks': {
      const filters: {
        sessionId?: string;
        contextId?: string;
        state?: TaskState;
        limit?: number;
        offset?: number;
      } = {};

      if (params?.sessionId) filters.sessionId = params.sessionId as string;
      if (params?.contextId) filters.contextId = params.contextId as string;
      if (params?.state) filters.state = params.state as TaskState;
      if (params?.limit) filters.limit = params.limit as number;
      if (params?.offset) filters.offset = params.offset as number;

      const result = listTasks(filters);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tasks: result.tasks.map(taskToResponse),
          total: result.total,
        },
      };
    }

    // ── a2a.cancelTask ─────────────────────────────────────────────────────
    case 'a2a.cancelTask': {
      const taskId = params?.id as string;
      if (!taskId) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: JSONRPC_INVALID_PARAMS,
            message: 'Missing required parameter: id',
          },
        };
      }

      const task = getTask(taskId);
      if (!task) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: A2A_TASK_NOT_FOUND,
            message: `Task not found: ${taskId}`,
          },
        };
      }

      if (TERMINAL_STATES.includes(task.status.state)) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: A2A_TASK_NOT_CANCELABLE,
            message: `Task ${taskId} is already in terminal state: ${task.status.state}`,
          },
        };
      }

      const canceled = cancelTask(taskId)!;
      return {
        jsonrpc: '2.0',
        id,
        result: taskToResponse(canceled),
      };
    }

    // ── a2a.getExtendedAgentCard ───────────────────────────────────────────
    case 'a2a.getExtendedAgentCard': {
      if (agentCardBuilder) {
        return {
          jsonrpc: '2.0',
          id,
          result: agentCardBuilder(),
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JSONRPC_METHOD_NOT_FOUND,
          message: 'Extended agent card not available',
        },
      };
    }

    // ── Unknown method ─────────────────────────────────────────────────────
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JSONRPC_METHOD_NOT_FOUND,
          message: `Unknown method: ${method}. Supported: a2a.sendMessage, a2a.getTask, a2a.listTasks, a2a.cancelTask, a2a.getExtendedAgentCard`,
        },
      };
  }
}

/**
 * Validate a raw JSON body as a JSON-RPC 2.0 request.
 * Returns the parsed request or an error response.
 */
export function parseJsonRpcRequest(
  body: Record<string, unknown>
): { request: JsonRpcRequest } | { error: JsonRpcResponse } {
  // Validate JSON-RPC 2.0 envelope
  if (body.jsonrpc !== '2.0') {
    return {
      error: {
        jsonrpc: '2.0',
        id: (body.id as string | number | null) ?? null,
        error: {
          code: JSONRPC_INVALID_REQUEST,
          message: 'Invalid JSON-RPC: missing or incorrect "jsonrpc" field (must be "2.0")',
        },
      },
    };
  }

  if (!body.method || typeof body.method !== 'string') {
    return {
      error: {
        jsonrpc: '2.0',
        id: (body.id as string | number | null) ?? null,
        error: {
          code: JSONRPC_INVALID_REQUEST,
          message: 'Invalid JSON-RPC: missing or non-string "method" field',
        },
      },
    };
  }

  return {
    request: {
      jsonrpc: '2.0',
      id: (body.id as string | number | null) ?? null,
      method: body.method as string,
      params: (body.params as Record<string, unknown>) || undefined,
    },
  };
}

// =============================================================================
// HTTP REQUEST/RESPONSE HELPERS
// =============================================================================

/**
 * Format a task as a SendTaskResponse for the API.
 */
export function taskToResponse(task: A2ATask): SendTaskResponse {
  return {
    id: task.id,
    sessionId: task.sessionId,
    contextId: task.contextId,
    status: task.status,
    artifacts: task.artifacts,
    history: task.history,
  };
}
