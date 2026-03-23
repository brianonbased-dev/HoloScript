/**
 * A2A (Agent-to-Agent) Protocol Implementation for HoloScript MCP Server
 *
 * Implements the A2A specification (https://a2a-protocol.org/latest/specification/)
 * providing:
 * - Agent Card at /.well-known/agent-card.json
 * - Task lifecycle (create, get, list, cancel)
 * - Skill mapping from MCP tools to A2A AgentSkill objects
 *
 * Tasks delegate to the existing MCP tool handler pipeline, bridging A2A
 * interoperability with the full 82+ HoloScript tool surface.
 */

import { randomUUID } from 'crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// A2A TYPES (per specification)
// =============================================================================

export interface AgentProvider {
  organization: string;
  url: string;
}

export interface AgentAuthentication {
  schemes: string[];
  credentials?: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  documentationUrl?: string;
  provider: AgentProvider;
  capabilities: AgentCapabilities;
  authentication: AgentAuthentication;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
}

// Task states per A2A spec
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface TaskMessage {
  role: 'user' | 'agent';
  parts: TaskPart[];
  timestamp: string;
}

export interface TaskPart {
  type: 'text' | 'data' | 'file';
  text?: string;
  data?: unknown;
  mimeType?: string;
}

export interface TaskArtifact {
  name: string;
  description?: string;
  parts: TaskPart[];
  index: number;
}

export interface A2ATask {
  id: string;
  sessionId?: string;
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

export interface SendTaskRequest {
  id?: string;
  sessionId?: string;
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
  status: A2ATask['status'];
  artifacts: TaskArtifact[];
  history: TaskMessage[];
}

// =============================================================================
// SKILL CATEGORY MAPPING
// =============================================================================

/**
 * Maps MCP tool name prefixes/patterns to A2A skill tags for rich discoverability.
 */
function deriveSkillTags(toolName: string): string[] {
  const tags: string[] = ['holoscript'];

  // Parsing & validation
  if (toolName.startsWith('parse_') || toolName === 'validate_holoscript') {
    tags.push('parsing', 'validation', 'language');
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
  else if (toolName.startsWith('holo_absorb') || toolName.startsWith('holo_query') ||
           toolName.startsWith('holo_impact') || toolName.startsWith('holo_detect') ||
           toolName.startsWith('holo_graph_status') || toolName.startsWith('holo_resolve') ||
           toolName.startsWith('holo_get_absorb')) {
    tags.push('codebase', 'analysis', 'intelligence');
  }
  // Graph RAG
  else if (toolName.startsWith('holo_semantic') || toolName.startsWith('holo_ask')) {
    tags.push('search', 'rag', 'knowledge');
  }
  // Graph tools
  else if (toolName.startsWith('holo_parse_to') || toolName.startsWith('holo_visualize') ||
           toolName.startsWith('holo_get_node') || toolName.startsWith('holo_design') ||
           toolName.startsWith('holo_diff') || toolName.startsWith('holo_suggest_connections')) {
    tags.push('graph', 'visualization', 'analysis');
  }
  // Self-improve / quality
  else if (toolName.startsWith('holo_self') || toolName.startsWith('holo_validate') ||
           toolName.startsWith('holo_quality') || toolName.startsWith('holo_verify')) {
    tags.push('quality', 'self-improvement', 'testing');
  }
  // File operations
  else if (toolName.startsWith('holo_write') || toolName.startsWith('holo_edit') ||
           toolName.startsWith('holo_read') || toolName.startsWith('holo_git')) {
    tags.push('filesystem', 'editing', 'git');
  }
  // Wisdom/gotcha
  else if (toolName.startsWith('holo_query_wisdom') || toolName.startsWith('holo_list_gotchas') ||
           toolName.startsWith('holo_check_gotchas')) {
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
  else if (toolName.startsWith('compile_') || toolName === 'compile_holoscript' ||
           toolName.startsWith('get_compilation') || toolName === 'list_export_targets' ||
           toolName.startsWith('get_circuit')) {
    tags.push('compilation', 'export', 'multi-target');
  }
  // Networking
  else if (toolName.startsWith('push_state') || toolName.startsWith('fetch_authoritative')) {
    tags.push('networking', 'multiplayer', 'sync');
  }
  // Snapshots / temporal
  else if (toolName.includes('snapshot') || toolName.includes('rewind') || toolName.includes('temporal')) {
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
  // Absorb service
  else if (toolName.startsWith('absorb_')) {
    tags.push('absorb', 'service', 'pipeline');
  }
  // Testing
  else if (toolName.includes('test') || toolName === 'execute_holotest') {
    tags.push('testing', 'spatial', 'validation');
  }
  // Docs / explanation
  else if (toolName.includes('syntax') || toolName.includes('example') ||
           toolName.includes('explain') || toolName.includes('analyze') ||
           toolName.includes('docs')) {
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
 */
export function mcpToolToA2ASkill(tool: Tool): AgentSkill {
  return {
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
}

/**
 * Build the complete A2A Agent Card from the current tool inventory.
 */
export function buildAgentCard(
  allTools: Tool[],
  baseUrl: string,
  apiKeyConfigured: boolean
): AgentCard {
  const skills = allTools.map(mcpToolToA2ASkill);

  return {
    name: 'HoloScript Agent',
    description:
      'HoloScript language tooling agent — parse, validate, compile, render, and generate ' +
      'spatial computing code (.hs/.hsplus/.holo) across 28+ export targets including Unity, ' +
      'Unreal, WebGPU, VisionOS, and more. Provides 82+ tools for codebase intelligence, ' +
      'AI-assisted code generation, graph analysis, multiplayer networking, and browser preview.',
    url: `${baseUrl}/a2a`,
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
    },
    authentication: apiKeyConfigured
      ? {
          schemes: ['Bearer', 'ApiKey'],
          credentials: 'API key via Authorization: Bearer <key> or x-api-key header',
        }
      : {
          schemes: [],
        },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json', 'application/holoscript'],
    skills,
  };
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
    // Remove oldest completed/failed/canceled tasks first
    const removable = [...taskStore.entries()]
      .filter(([, t]) => ['completed', 'failed', 'canceled'].includes(t.status.state))
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
  state?: TaskState;
  limit?: number;
  offset?: number;
}): { tasks: A2ATask[]; total: number } {
  let tasks = [...taskStore.values()];

  if (filters?.sessionId) {
    tasks = tasks.filter((t) => t.sessionId === filters.sessionId);
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
  if (['completed', 'failed', 'canceled'].includes(task.status.state)) {
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
                'You can discover available skills via GET /.well-known/agent-card.json',
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
    };
    task.artifacts.push(artifact);

    // Build agent response message
    const agentMessage: TaskMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: resultText }],
      timestamp: now(),
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
 * 3. Text-based skill routing via the first message
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
// HTTP REQUEST/RESPONSE HELPERS
// =============================================================================

/**
 * Format a task as a SendTaskResponse for the API.
 */
export function taskToResponse(task: A2ATask): SendTaskResponse {
  return {
    id: task.id,
    sessionId: task.sessionId,
    status: task.status,
    artifacts: task.artifacts,
    history: task.history,
  };
}
