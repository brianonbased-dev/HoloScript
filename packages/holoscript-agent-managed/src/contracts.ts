export const ANTHROPIC_MANAGED_AGENTS_BETA = 'managed-agents-2026-04-01';
export const ANTHROPIC_AGENT_MEMORY_BETA = 'agent-memory-2026-07-22';
export const MAX_INITIAL_EVENTS = 50;
export const MAX_EVENT_DELTA_TYPES = 100;

export type ManagedAgentEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ManagedAgentEffort = ManagedAgentEffortLevel | { type: ManagedAgentEffortLevel };

export interface ManagedAgentModelConfiguration {
  id: string;
  effort?: ManagedAgentEffort;
  speed?: 'standard' | 'fast';
}

export interface ManagedAgentCreateInput {
  name: string;
  model: string | ManagedAgentModelConfiguration;
  system?: string;
  description?: string;
  tools?: readonly unknown[];
  mcp_servers?: readonly unknown[];
  skills?: readonly unknown[];
  metadata?: Readonly<Record<string, string>>;
}

export interface ManagedAgentUpdateInput {
  version?: number;
  model?: string | ManagedAgentModelConfiguration;
  system?: string | null;
  description?: string | null;
  tools?: readonly unknown[];
  mcp_servers?: readonly unknown[];
  skills?: readonly unknown[];
  metadata?: Readonly<Record<string, string>>;
}

export interface ManagedAgentUpdateContract {
  request: ManagedAgentUpdateInput;
  concurrency: 'optimistic' | 'last-write-wins';
}

export interface ManagedAgentTextBlock {
  type: 'text';
  text: string;
}

export interface ManagedAgentInitialUserMessage {
  type: 'user.message';
  content: readonly ManagedAgentTextBlock[];
}

export interface ManagedAgentInitialOutcome {
  type: 'user.define_outcome';
  rubric: unknown;
}

export type ManagedAgentInitialEvent = ManagedAgentInitialUserMessage | ManagedAgentInitialOutcome;

export type ManagedAgentReference =
  | string
  | { type: 'agent'; id: string; version: number }
  | {
      type: 'agent_with_overrides';
      id: string;
      version?: number;
      model?: string | ManagedAgentModelConfiguration;
      system?: string | null;
      tools?: readonly unknown[];
      mcp_servers?: readonly unknown[];
      skills?: readonly unknown[];
    };

export interface ManagedAgentSessionCreateInput {
  agent: ManagedAgentReference;
  environment_id: string;
  initial_events?: readonly ManagedAgentInitialEvent[];
  vault_ids?: readonly string[];
  metadata?: Readonly<Record<string, string>>;
}

export type ManagedAgentEventDeltaType = 'agent.message' | 'agent.thinking';

export interface ManagedAgentThreadStreamInput {
  sessionId: string;
  threadId: string;
  eventDeltas?: readonly ManagedAgentEventDeltaType[];
}

export interface ManagedAgentThreadStreamRequest {
  path: string;
  query: string;
  eventDeltas: ManagedAgentEventDeltaType[];
  scope: 'thread';
}

export interface ManagedAgentEventStart {
  type: 'event_start';
  event: {
    type: ManagedAgentEventDeltaType;
    id: string;
  };
}

export interface ManagedAgentEventDelta {
  type: 'event_delta';
  event_id: string;
  delta: {
    type: 'content_delta';
    index: number;
    content: ManagedAgentTextBlock;
  };
}

export function buildManagedAgentCreateInput(
  input: ManagedAgentCreateInput
): ManagedAgentCreateInput {
  assertNonEmpty(input.name, 'agent name');
  assertModel(input.model);
  return clone(input);
}

export function buildManagedAgentUpdateContract(
  input: ManagedAgentUpdateInput
): ManagedAgentUpdateContract {
  if (input.version !== undefined) {
    assertPositiveInteger(input.version, 'agent version');
  }
  if (input.model !== undefined) assertModel(input.model);
  return {
    request: clone(input),
    concurrency: input.version === undefined ? 'last-write-wins' : 'optimistic',
  };
}

export function buildManagedAgentSessionCreateInput(
  input: ManagedAgentSessionCreateInput
): ManagedAgentSessionCreateInput {
  assertAgentReference(input.agent);
  assertNonEmpty(input.environment_id, 'environment_id');
  const initialEvents = input.initial_events ?? [];
  if (initialEvents.length > MAX_INITIAL_EVENTS) {
    throw new Error(`initial_events must contain at most ${MAX_INITIAL_EVENTS} events.`);
  }
  let outcomeCount = 0;
  for (const event of initialEvents) {
    if (event.type === 'user.message') {
      if (!event.content.length) {
        throw new Error('user.message initial event requires at least one content block.');
      }
      for (const block of event.content) {
        if (block.type !== 'text')
          throw new Error('initial user.message supports text blocks only.');
        assertNonEmpty(block.text, 'initial user.message text');
      }
      continue;
    }
    if (event.type === 'user.define_outcome') {
      outcomeCount += 1;
      if (event.rubric === undefined || event.rubric === null) {
        throw new Error('user.define_outcome initial event requires a rubric.');
      }
      continue;
    }
    throw new Error(`unsupported initial event type: ${(event as { type?: unknown }).type}`);
  }
  if (outcomeCount > 1) {
    throw new Error('initial_events accepts at most one user.define_outcome event.');
  }
  return clone(input);
}

export function buildManagedAgentThreadStreamRequest(
  input: ManagedAgentThreadStreamInput
): ManagedAgentThreadStreamRequest {
  assertNonEmpty(input.sessionId, 'sessionId');
  assertNonEmpty(input.threadId, 'threadId');
  const eventDeltas = [...new Set(input.eventDeltas ?? [])];
  if (eventDeltas.length > MAX_EVENT_DELTA_TYPES) {
    throw new Error(`event_deltas must contain at most ${MAX_EVENT_DELTA_TYPES} values.`);
  }
  for (const eventType of eventDeltas) {
    if (eventType !== 'agent.message' && eventType !== 'agent.thinking') {
      throw new Error(`unsupported event delta type: ${String(eventType)}`);
    }
  }
  const query = new URLSearchParams();
  for (const eventType of eventDeltas) query.append('event_deltas[]', eventType);
  return {
    path: `/v1/sessions/${encodeURIComponent(input.sessionId)}/threads/${encodeURIComponent(input.threadId)}/stream`,
    query: query.toString(),
    eventDeltas,
    scope: 'thread',
  };
}

function assertAgentReference(agent: ManagedAgentReference): void {
  if (typeof agent === 'string') {
    assertNonEmpty(agent, 'agent');
    return;
  }
  assertNonEmpty(agent.id, 'agent id');
  if (agent.version !== undefined) assertPositiveInteger(agent.version, 'agent version');
  if (agent.type !== 'agent' && agent.type !== 'agent_with_overrides') {
    throw new Error(`unsupported agent reference type: ${(agent as { type?: unknown }).type}`);
  }
  if (agent.type === 'agent_with_overrides' && agent.model !== undefined) {
    assertModel(agent.model);
  }
}

function assertModel(model: string | ManagedAgentModelConfiguration): void {
  if (typeof model === 'string') {
    assertNonEmpty(model, 'model');
    return;
  }
  assertNonEmpty(model.id, 'model id');
  const effort = typeof model.effort === 'string' ? model.effort : model.effort?.type;
  if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error(`unsupported model effort: ${effort}`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer greater than or equal to 1.`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
