/**
 * A2A HSNAP Canonical Task Schema
 *
 * Defines the canonical type mapping between A2A (Agent-to-Agent) JSON-RPC
 * task format and HSNAP (.hsplus) payloads, with Zod schemas for runtime
 * validation at protocol boundaries.
 *
 * This is the single source of truth for task shape across the A2A <-> HSNAP
 * bridge. All translation functions reference these types.
 */

import { z } from 'zod';

// =============================================================================
// A2A TASK (Google A2A JSON-RPC format)
// =============================================================================

/**
 * Status values for an A2A task lifecycle.
 */
export type A2ATaskStatus =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

/**
 * A single artifact produced by task execution.
 */
export interface A2ATaskArtifact {
  /** Artifact name/label */
  name?: string;
  /** MIME type of the artifact content */
  mimeType: string;
  /** The artifact data (string for text, object for structured) */
  data: unknown;
  /** Optional index for ordering multiple artifacts */
  index?: number;
}

/**
 * A single entry in the task message history.
 */
export interface A2ATaskMessage {
  /** Role of the sender */
  role: 'user' | 'agent';
  /** Message parts (text, data, file references) */
  parts: A2AMessagePart[];
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * A message part within an A2A task message.
 */
export type A2AMessagePart =
  | { type: 'text'; text: string }
  | { type: 'data'; mimeType: string; data: unknown }
  | { type: 'file'; uri: string; mimeType?: string };

/**
 * Full A2A Task representation (Google A2A JSON-RPC task object).
 *
 * This represents the task as it exists on the wire in `tasks/get` and
 * `tasks/send` responses.
 */
export interface A2ATask {
  /** Unique task identifier */
  id: string;
  /** Current task status */
  status: A2ATaskStatus;
  /** Artifacts produced during execution */
  artifacts: A2ATaskArtifact[];
  /** Ordered message history (user requests + agent responses) */
  history: A2ATaskMessage[];
  /** Metadata bag for extensibility (provenance, billing, routing hints) */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// HSNAP PAYLOAD (.hsplus format)
// =============================================================================

/**
 * A single trait application in an HSNAP composition.
 */
export interface HSNAPTrait {
  /** Trait name (e.g., "Renderable", "Collidable", "AgentBehavior") */
  name: string;
  /** Trait configuration parameters */
  config: Record<string, unknown>;
}

/**
 * A state binding connecting external state to composition properties.
 */
export interface HSNAPStateBinding {
  /** Property path in the composition (e.g., "position.x") */
  target: string;
  /** Source expression or value */
  source: string;
  /** Binding mode */
  mode: 'one-way' | 'two-way' | 'once';
}

/**
 * Full HSNAP Payload representing a .hsplus composition with task metadata.
 *
 * This is the canonical representation of what a .hsplus file describes
 * when used as a task payload.
 */
export interface HSNAPPayload {
  /** Composition name (maps to `composition Name {}` block) */
  composition: string;
  /** Applied traits with their configurations */
  traits: HSNAPTrait[];
  /** State bindings connecting external state to properties */
  stateBindings: HSNAPStateBinding[];
  /** Task metadata extracted from @task directive */
  task: {
    id?: string;
    from?: string;
    to?: string;
    intent?: string;
    priority?: number;
    timeout?: number;
    skillId?: string;
    input?: Record<string, unknown>;
    idempotency_key?: string;
  };
  /** Result metadata extracted from @result directive */
  result?: {
    task_id?: string;
    status?: string;
    duration?: number;
  };
  /** Agent metadata extracted from @agent directive */
  agent?: {
    name?: string;
    accepts: string[];
    emits: string[];
    tools: string[];
    timeout?: number;
    max_concurrent?: number;
  };
  /** Raw .hsplus source (preserved for round-trip fidelity) */
  rawSource?: string;
}

// =============================================================================
// MAPPING FUNCTION TYPES
// =============================================================================

/**
 * Maps an A2A JSON-RPC task to an HSNAP payload.
 *
 * The A2A task's message history and artifacts are translated into
 * traits and state bindings within an HSNAP composition.
 */
export type A2AToHSNAP = (task: A2ATask, options?: MappingOptions) => HSNAPPayload;

/**
 * Maps an HSNAP payload back to an A2A JSON-RPC task.
 *
 * The HSNAP composition, traits, and state bindings are translated
 * into A2A task artifacts and message history.
 */
export type HSNAPToA2A = (payload: HSNAPPayload, options?: MappingOptions) => A2ATask;

/**
 * Options controlling the mapping behavior.
 */
export interface MappingOptions {
  /** Override the generated task/composition ID */
  id?: string;
  /** Include raw source in HSNAP payload for round-trip fidelity */
  preserveRawSource?: boolean;
  /** Default composition name when none is specified */
  defaultCompositionName?: string;
  /** ISO 8601 timestamp override (for deterministic tests) */
  timestamp?: string;
}

// =============================================================================
// ZOD SCHEMAS (Runtime Validation)
// =============================================================================

export const A2ATaskStatusSchema = z.enum([
  'submitted',
  'working',
  'input-required',
  'completed',
  'failed',
  'canceled',
]);

export const A2AMessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('data'), mimeType: z.string(), data: z.unknown() }),
  z.object({ type: z.literal('file'), uri: z.string(), mimeType: z.string().optional() }),
]);

export const A2ATaskMessageSchema = z.object({
  role: z.enum(['user', 'agent']),
  parts: z.array(A2AMessagePartSchema),
  timestamp: z.string(),
});

export const A2ATaskArtifactSchema = z.object({
  name: z.string().optional(),
  mimeType: z.string(),
  data: z.unknown(),
  index: z.number().optional(),
});

export const A2ATaskSchema = z.object({
  id: z.string(),
  status: A2ATaskStatusSchema,
  artifacts: z.array(A2ATaskArtifactSchema),
  history: z.array(A2ATaskMessageSchema),
  metadata: z.record(z.unknown()).optional(),
});

export const HSNAPTraitSchema = z.object({
  name: z.string(),
  config: z.record(z.unknown()),
});

export const HSNAPStateBindingSchema = z.object({
  target: z.string(),
  source: z.string(),
  mode: z.enum(['one-way', 'two-way', 'once']),
});

export const HSNAPTaskMetadataSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  intent: z.string().optional(),
  priority: z.number().optional(),
  timeout: z.number().optional(),
  skillId: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  idempotency_key: z.string().optional(),
});

export const HSNAPResultMetadataSchema = z.object({
  task_id: z.string().optional(),
  status: z.string().optional(),
  duration: z.number().optional(),
});

export const HSNAPAgentMetadataSchema = z.object({
  name: z.string().optional(),
  accepts: z.array(z.string()),
  emits: z.array(z.string()),
  tools: z.array(z.string()),
  timeout: z.number().optional(),
  max_concurrent: z.number().optional(),
});

export const HSNAPPayloadSchema = z.object({
  composition: z.string(),
  traits: z.array(HSNAPTraitSchema),
  stateBindings: z.array(HSNAPStateBindingSchema),
  task: HSNAPTaskMetadataSchema,
  result: HSNAPResultMetadataSchema.optional(),
  agent: HSNAPAgentMetadataSchema.optional(),
  rawSource: z.string().optional(),
});

// =============================================================================
// REFERENCE MAPPING IMPLEMENTATIONS
// =============================================================================

/**
 * Map an A2A task to an HSNAP payload.
 *
 * Extracts task metadata from the A2A message history and maps artifacts
 * to traits. The most recent user message's data part (if canonical
 * task-bridge schema) is used as the task metadata source.
 */
export const mapA2AToHSNAP: A2AToHSNAP = (task, options = {}) => {
  const compositionName = options.defaultCompositionName ?? 'A2ATask';

  // Extract task metadata from the latest user message data part
  const latestUserMessage = [...task.history].reverse().find((m) => m.role === 'user');
  const dataPart = latestUserMessage?.parts.find(
    (p): p is Extract<A2AMessagePart, { type: 'data' }> => p.type === 'data'
  );
  const taskData = (dataPart?.data ?? {}) as Record<string, unknown>;

  // Map artifacts to traits
  const traits: HSNAPTrait[] = task.artifacts.map((artifact, index) => ({
    name: artifact.name ?? `Artifact_${index}`,
    config: {
      mimeType: artifact.mimeType,
      data: artifact.data,
      index: artifact.index ?? index,
    },
  }));

  // Extract state bindings from metadata
  const stateBindings: HSNAPStateBinding[] = [];
  if (task.metadata?.stateBindings && Array.isArray(task.metadata.stateBindings)) {
    for (const binding of task.metadata.stateBindings) {
      if (
        binding &&
        typeof binding === 'object' &&
        'target' in binding &&
        'source' in binding
      ) {
        const b = binding as Record<string, unknown>;
        stateBindings.push({
          target: String(b.target),
          source: String(b.source),
          mode: (b.mode as HSNAPStateBinding['mode']) ?? 'one-way',
        });
      }
    }
  }

  return {
    composition: options.id ?? task.id ?? compositionName,
    traits,
    stateBindings,
    task: {
      id: task.id,
      intent: typeof taskData.intent === 'string' ? taskData.intent : undefined,
      from: typeof taskData.from === 'string' ? taskData.from : undefined,
      to: typeof taskData.to === 'string' ? taskData.to : undefined,
      priority: typeof taskData.priority === 'number' ? taskData.priority : undefined,
      timeout: typeof taskData.timeout === 'number' ? taskData.timeout : undefined,
      skillId: typeof taskData.skillId === 'string' ? taskData.skillId : undefined,
      input:
        taskData.arguments && typeof taskData.arguments === 'object'
          ? (taskData.arguments as Record<string, unknown>)
          : undefined,
      idempotency_key:
        typeof taskData.idempotencyKey === 'string' ? taskData.idempotencyKey : undefined,
    },
    result:
      task.status === 'completed' || task.status === 'failed'
        ? {
            task_id: task.id,
            status: task.status,
          }
        : undefined,
  };
};

/**
 * Map an HSNAP payload back to an A2A task.
 *
 * Converts traits to artifacts and task metadata to history messages.
 */
export const mapHSNAPToA2A: HSNAPToA2A = (payload, options = {}) => {
  const timestamp = options.timestamp ?? new Date().toISOString();

  // Map traits back to artifacts
  const artifacts: A2ATaskArtifact[] = payload.traits.map((trait, index) => ({
    name: trait.name,
    mimeType:
      typeof trait.config.mimeType === 'string' ? trait.config.mimeType : 'application/json',
    data: trait.config.data ?? trait.config,
    index: typeof trait.config.index === 'number' ? trait.config.index : index,
  }));

  // Build history from task metadata
  const history: A2ATaskMessage[] = [];

  // Add initial user message with task metadata
  if (payload.task) {
    history.push({
      role: 'user',
      parts: [
        {
          type: 'data',
          mimeType: 'application/json',
          data: {
            schema: 'holoscript.task-bridge.v1',
            task: payload.task,
            skillId: payload.task.skillId,
            arguments: payload.task.input,
            idempotencyKey: payload.task.idempotency_key,
            ...(options.preserveRawSource && payload.rawSource
              ? { rawSource: payload.rawSource }
              : {}),
          },
        },
      ],
      timestamp,
    });
  }

  // Derive status from result metadata
  let status: A2ATaskStatus = 'submitted';
  if (payload.result?.status === 'completed') {
    status = 'completed';
  } else if (payload.result?.status === 'failed') {
    status = 'failed';
  } else if (payload.result?.status) {
    status = 'working';
  }

  // Reconstruct metadata with state bindings
  const metadata: Record<string, unknown> = {};
  if (payload.stateBindings.length > 0) {
    metadata.stateBindings = payload.stateBindings;
  }
  if (payload.agent) {
    metadata.agent = payload.agent;
  }

  return {
    id: options.id ?? payload.task.id ?? payload.composition,
    status,
    artifacts,
    history,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
};
