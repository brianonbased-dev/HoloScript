/**
 * HoloScript MCP Agent Orchestration Tools
 *
 * 5 MCP tools for LLM-driven multi-agent coordination:
 * - discover_agents: Find agents by capability/domain/tags
 * - delegate_task: Send a task to a discovered agent
 * - get_task_status: Check status of a delegated task
 * - compose_workflow: Define and validate a skill workflow DAG
 * - execute_workflow: Run a validated workflow
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  AgentRegistry,
  getDefaultRegistry,
  FederatedRegistryAdapter,
  TaskDelegationService,
  SkillWorkflowEngine,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowInput,
  type CapabilityQuery,
} from '@holoscript/core';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const agentOrchestrationTools: Tool[] = [
  {
    name: 'discover_agents',
    description:
      'Find agents by capability, domain, or tag. Searches local registry and optional remote URLs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description:
            'Capability type filter: render, analyze, generate, transform, validate, orchestrate, etc.',
        },
        domain: {
          type: 'string',
          description:
            'Domain filter: spatial, nlp, vision, blockchain, physics, gaming, general, etc.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required tags the agent must have.',
        },
        seedUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional /.well-known/agent-card.json URLs to check.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 10).',
        },
        includeOffline: {
          type: 'boolean',
          description: 'Whether to include offline agents (default false).',
        },
      },
    },
  },
  {
    name: 'delegate_task',
    description:
      'Send a task to a discovered agent. Auto-selects the best agent if agentId is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description:
            'Target agent ID (from discover_agents). Omit for auto-selection by capability.',
        },
        skillId: {
          type: 'string',
          description: 'Skill/tool name to invoke on the target agent.',
        },
        arguments: {
          type: 'object',
          description: 'Arguments to pass to the skill.',
        },
        type: {
          type: 'string',
          description: 'Required capability type for auto-selection (when agentId is omitted).',
        },
        domain: {
          type: 'string',
          description: 'Required domain for auto-selection (when agentId is omitted).',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in ms (default 30000).',
        },
        retries: {
          type: 'number',
          description: 'Number of retries on failure (default 0).',
        },
      },
      required: ['skillId', 'arguments'],
    },
  },
  {
    name: 'get_task_status',
    description: 'Check the status of a previously delegated task by its task ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'Task ID returned by delegate_task.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'compose_workflow',
    description:
      'Define and validate a multi-step skill workflow (DAG). Returns validation result with execution plan.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Workflow name.',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique step identifier.' },
              skillId: { type: 'string', description: 'Skill/tool to invoke.' },
              inputs: {
                type: 'object',
                description:
                  'Input mapping. Values can be {type:"literal",value:...}, {type:"ref",stepId:"...",outputKey:"..."}, or {type:"context",key:"..."}.',
              },
              dependsOn: {
                type: 'array',
                items: { type: 'string' },
                description: 'Step IDs that must complete first.',
              },
              timeout: {
                type: 'number',
                description: 'Per-step timeout in ms.',
              },
              onError: {
                type: 'string',
                enum: ['fail', 'skip', 'fallback'],
                description: 'Error handling: fail (default), skip, or fallback.',
              },
              fallbackSkillId: {
                type: 'string',
                description: 'Fallback skill if primary fails (when onError=fallback).',
              },
            },
            required: ['id', 'skillId'],
          },
          description: 'Workflow steps with optional dependencies.',
        },
        description: {
          type: 'string',
          description: 'Optional workflow description.',
        },
      },
      required: ['name', 'steps'],
    },
  },
  {
    name: 'execute_workflow',
    description:
      'Execute a skill workflow. Each step invokes a local MCP tool. Returns results from every step.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Workflow name.',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              skillId: { type: 'string' },
              inputs: { type: 'object' },
              dependsOn: { type: 'array', items: { type: 'string' } },
              timeout: { type: 'number' },
              onError: { type: 'string' },
              fallbackSkillId: { type: 'string' },
            },
            required: ['id', 'skillId'],
          },
        },
        context: {
          type: 'object',
          description: 'Initial context data passed to the workflow.',
        },
      },
      required: ['name', 'steps'],
    },
  },
];

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

let adapter: FederatedRegistryAdapter | null = null;
let delegator: TaskDelegationService | null = null;
const workflowEngine = new SkillWorkflowEngine();

function getAdapter(): FederatedRegistryAdapter {
  if (!adapter) {
    adapter = new FederatedRegistryAdapter(getDefaultRegistry());
  }
  return adapter;
}

function getDelegator(): TaskDelegationService {
  if (!delegator) {
    delegator = new TaskDelegationService(getDefaultRegistry(), getAdapter());
  }
  return delegator;
}

// =============================================================================
// HANDLER
// =============================================================================

/**
 * Handle agent orchestration tool calls.
 *
 * @param name Tool name
 * @param args Tool arguments
 * @param toolExecutor Optional local tool executor for workflow execution
 * @returns Result or null if tool not handled
 */
export async function handleAgentOrchestrationTool(
  name: string,
  args: Record<string, unknown>,
  toolExecutor?: (toolName: string, toolArgs: Record<string, unknown>) => Promise<unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'discover_agents':
      return handleDiscoverAgents(args);
    case 'delegate_task':
      return handleDelegateTask(args);
    case 'get_task_status':
      return handleGetTaskStatus(args);
    case 'compose_workflow':
      return handleComposeWorkflow(args);
    case 'execute_workflow':
      return handleExecuteWorkflow(args, toolExecutor);
    default:
      return null;
  }
}

// =============================================================================
// INDIVIDUAL HANDLERS
// =============================================================================

async function handleDiscoverAgents(args: Record<string, unknown>): Promise<unknown> {
  const adapterInstance = getAdapter();

  // Add dynamic seed URLs if provided
  const seedUrls = args.seedUrls as string[] | undefined;
  if (seedUrls) {
    for (const url of seedUrls) {
      adapterInstance.addSeedUrl(url);
    }
  }

  const query: CapabilityQuery = {
    type: (args.type as string) || undefined,
    domain: (args.domain as string) || undefined,
    tags: (args.tags as string[]) || undefined,
    limit: (args.limit as number) || 10,
    includeOffline: (args.includeOffline as boolean) || false,
  };

  const matches = await adapterInstance.discoverFederated(query);

  return {
    agents: matches.map((m) => ({
      id: m.manifest.id,
      name: m.manifest.name,
      description: m.manifest.description,
      version: m.manifest.version,
      score: Math.round(m.score * 100) / 100,
      capabilities: m.capabilities.map((c) => ({
        type: c.capability.type,
        domain: c.capability.domain,
        name: c.capability.name,
      })),
      trust: m.manifest.trustLevel,
      status: m.manifest.status,
      tags: m.manifest.tags,
      endpoint: m.manifest.endpoints[0]?.address,
    })),
    total: matches.length,
    registrySize: getDefaultRegistry().size,
  };
}

async function handleDelegateTask(args: Record<string, unknown>): Promise<unknown> {
  const delegatorInstance = getDelegator();

  const skillId = args.skillId as string;
  const skillArgs = (args.arguments as Record<string, unknown>) || {};

  if (!skillId) {
    return { error: 'Missing required parameter: skillId' };
  }

  if (args.agentId) {
    // Direct delegation to specific agent
    const result = await delegatorInstance.delegateTo({
      targetAgentId: args.agentId as string,
      skillId,
      arguments: skillArgs,
      timeout: args.timeout as number | undefined,
      retries: args.retries as number | undefined,
    });
    return formatDelegationResult(result);
  }

  // Auto-delegation by capability
  const query: CapabilityQuery = {};
  if (args.type) query.type = args.type as string;
  if (args.domain) query.domain = args.domain as string;

  const result = await delegatorInstance.autoDelegate(query, skillId, skillArgs, {
    timeout: args.timeout as number | undefined,
    retries: args.retries as number | undefined,
  });
  return formatDelegationResult(result);
}

async function handleGetTaskStatus(args: Record<string, unknown>): Promise<unknown> {
  const taskId = args.taskId as string;
  if (!taskId) {
    return { error: 'Missing required parameter: taskId' };
  }

  const delegatorInstance = getDelegator();
  const result = delegatorInstance.getStatus(taskId);

  if (!result) {
    return {
      taskId,
      status: 'not_found',
      message:
        'Task not found in delegation history. It may have been evicted from the history buffer.',
    };
  }

  return formatDelegationResult(result);
}

async function handleComposeWorkflow(args: Record<string, unknown>): Promise<unknown> {
  const name = args.name as string;
  const rawSteps = args.steps as Array<Record<string, unknown>>;

  if (!name || !rawSteps || rawSteps.length === 0) {
    return { valid: false, errors: ['Missing required parameters: name and steps'] };
  }

  const steps = normalizeSteps(rawSteps);
  const definition: WorkflowDefinition = {
    id: `wf-${Date.now()}`,
    name,
    description: args.description as string | undefined,
    steps,
  };

  const validation = workflowEngine.validate(definition);

  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    executionPlan: validation.executionPlan,
    stepCount: steps.length,
  };
}

async function handleExecuteWorkflow(
  args: Record<string, unknown>,
  toolExecutor?: (toolName: string, toolArgs: Record<string, unknown>) => Promise<unknown>
): Promise<unknown> {
  const name = args.name as string;
  const rawSteps = args.steps as Array<Record<string, unknown>>;
  const context = (args.context as Record<string, unknown>) || {};

  if (!name || !rawSteps || rawSteps.length === 0) {
    return { status: 'failed', error: 'Missing required parameters: name and steps' };
  }

  const steps = normalizeSteps(rawSteps);
  const definition: WorkflowDefinition = {
    id: `wf-${Date.now()}`,
    name,
    steps,
    context,
  };

  // Validate first
  const validation = workflowEngine.validate(definition);
  if (!validation.valid) {
    return {
      status: 'failed',
      error: 'Workflow validation failed',
      validationErrors: validation.errors,
    };
  }

  // Execute with the provided tool executor or a stub
  const executor = toolExecutor
    ? async (skillId: string, inputs: Record<string, unknown>) => {
        const result = await toolExecutor(skillId, inputs);
        return (typeof result === 'object' && result !== null ? result : { result }) as Record<
          string,
          unknown
        >;
      }
    : async (skillId: string, inputs: Record<string, unknown>) => {
        return { skillId, inputs, note: 'No tool executor configured — dry run only' };
      };

  const result = await workflowEngine.execute(definition, executor);

  return {
    workflowId: result.workflowId,
    status: result.status,
    totalDurationMs: result.totalDurationMs,
    steps: result.stepResults.map((sr) => ({
      stepId: sr.stepId,
      status: sr.status,
      durationMs: sr.durationMs,
      output: sr.output,
      error: sr.error,
    })),
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDelegationResult(result: {
  taskId: string;
  status: string;
  result?: unknown;
  error?: string;
  durationMs: number;
  delegatedTo: { agentId: string; endpoint: string };
}) {
  return {
    taskId: result.taskId,
    status: result.status,
    result: result.result,
    error: result.error,
    durationMs: result.durationMs,
    delegatedTo: result.delegatedTo,
  };
}

/**
 * Normalize raw step objects from MCP input into WorkflowStep types.
 * MCP inputs are plain JSON — need to ensure proper typing.
 */
function normalizeSteps(rawSteps: Array<Record<string, unknown>>): WorkflowStep[] {
  return rawSteps.map((raw) => {
    const inputs: Record<string, WorkflowInput> = {};

    if (raw.inputs && typeof raw.inputs === 'object') {
      for (const [key, val] of Object.entries(raw.inputs as Record<string, unknown>)) {
        if (typeof val === 'object' && val !== null && 'type' in val) {
          inputs[key] = val as WorkflowInput;
        } else {
          // Treat as literal value
          inputs[key] = { type: 'literal', value: val };
        }
      }
    }

    return {
      id: raw.id as string,
      skillId: raw.skillId as string,
      inputs,
      dependsOn: raw.dependsOn as string[] | undefined,
      timeout: raw.timeout as number | undefined,
      onError: raw.onError as 'fail' | 'skip' | 'fallback' | undefined,
      fallbackSkillId: raw.fallbackSkillId as string | undefined,
    };
  });
}

/**
 * Reset singletons (for testing).
 */
export function resetOrchestrationSingletons(): void {
  if (adapter) {
    adapter.stopPolling();
  }
  adapter = null;
  delegator = null;
}
