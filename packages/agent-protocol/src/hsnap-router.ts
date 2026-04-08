import { compileHSNAPToUAAL } from './hsnap-bytecode';

export type HSNAPLifecycleType =
  | 'task.send'
  | 'task.accept'
  | 'task.progress'
  | 'task.complete'
  | 'task.fail'
  | 'task.cancel';

export interface HSNAPTaskMetadata {
  id?: string;
  from?: string;
  to?: string;
  intent?: string;
  priority?: number;
  timeout?: number;
}

export interface HSNAPResultMetadata {
  task_id?: string;
  status?: string;
  duration?: number;
}

export interface HSNAPAgentMetadata {
  name?: string;
  accepts: string[];
  emits: string[];
  tools: string[];
  timeout?: number;
  max_concurrent?: number;
}

export interface HSNAPLifecycleEvent {
  type: HSNAPLifecycleType;
  taskId: string;
  agentId?: string;
  timestamp: number;
  payload?: unknown;
}

export interface HSNAPDispatchMessage {
  source: string;
  task: HSNAPTaskMetadata;
  result?: HSNAPResultMetadata;
  compiled?: unknown;
  target: HSNAPRegisteredAgent;
  reportProgress: (payload: unknown) => void;
}

export interface HSNAPAgentVM {
  dispatch(message: HSNAPDispatchMessage): Promise<unknown>;
}

export interface HSNAPRegisteredAgent {
  id: string;
  name: string;
  accepts: string[];
  emits: string[];
  tools: string[];
  timeout: number;
  maxConcurrent: number;
}

export interface RegisterHSNAPAgentOptions {
  id?: string;
  source?: string;
  metadata?: Partial<HSNAPAgentMetadata> & { name?: string };
  vm: HSNAPAgentVM;
}

export interface HSNAPRouteReceipt {
  taskId: string;
  status: 'accepted' | 'completed' | 'failed';
  target?: HSNAPRegisteredAgent;
  result?: unknown;
  error?: string;
  lifecycle: HSNAPLifecycleEvent[];
}

export interface HSNAPRouterOptions {
  compile?: (source: string) => Promise<unknown>;
  now?: () => number;
}

interface InternalAgentRecord extends HSNAPRegisteredAgent {
  vm: HSNAPAgentVM;
  activeCount: number;
}

export interface ParsedHSNAPPayload {
  task: HSNAPTaskMetadata;
  result?: HSNAPResultMetadata;
  agent?: HSNAPAgentMetadata;
}

export class HSNAPRouter {
  private readonly agents = new Map<string, InternalAgentRecord>();
  private readonly lifecycleHistory: HSNAPLifecycleEvent[] = [];
  private readonly compile?: (source: string) => Promise<unknown>;
  private readonly now: () => number;
  private idCounter = 0;

  constructor(options: HSNAPRouterOptions = {}) {
    this.compile = options.compile ?? compileHSNAPToUAAL;
    this.now = options.now ?? (() => Date.now());
  }

  registerAgent(options: RegisterHSNAPAgentOptions): HSNAPRegisteredAgent {
    const extracted = options.source ? parseHSNAPAgentMetadata(options.source) : undefined;
    const metadata = mergeAgentMetadata(extracted, options.metadata);
    const id = options.id ?? metadata.name ?? `hsnap-agent-${++this.idCounter}`;

    const agent: InternalAgentRecord = {
      id,
      name: metadata.name ?? id,
      accepts: metadata.accepts,
      emits: metadata.emits,
      tools: metadata.tools,
      timeout: metadata.timeout ?? 30_000,
      maxConcurrent: metadata.max_concurrent ?? 1,
      vm: options.vm,
      activeCount: 0,
    };

    this.agents.set(id, agent);
    return toRegisteredAgent(agent);
  }

  unregisterAgent(id: string): boolean {
    return this.agents.delete(id);
  }

  getAgents(): HSNAPRegisteredAgent[] {
    return [...this.agents.values()].map(toRegisteredAgent);
  }

  getLifecycleHistory(taskId?: string): HSNAPLifecycleEvent[] {
    if (!taskId) {
      return [...this.lifecycleHistory];
    }
    return this.lifecycleHistory.filter((event) => event.taskId === taskId);
  }

  async route(source: string): Promise<HSNAPRouteReceipt> {
    const parsed = parseHSNAPPayload(source);
    const taskId = parsed.task.id ?? `task_${++this.idCounter}_${this.now()}`;
    const lifecycle: HSNAPLifecycleEvent[] = [];

    this.recordLifecycle(lifecycle, {
      type: 'task.send',
      taskId,
      payload: {
        from: parsed.task.from,
        to: parsed.task.to,
        intent: parsed.task.intent,
      },
    });

    const target = this.resolveTarget(parsed.task);
    if (!target) {
      this.recordLifecycle(lifecycle, {
        type: 'task.fail',
        taskId,
        payload: { code: 'no_route', message: 'No matching HSNAP agent found' },
      });

      return {
        taskId,
        status: 'failed',
        error: 'No matching HSNAP agent found',
        lifecycle,
      };
    }

    this.recordLifecycle(lifecycle, {
      type: 'task.accept',
      taskId,
      agentId: target.id,
      payload: { timeout: target.timeout, maxConcurrent: target.maxConcurrent },
    });

    target.activeCount += 1;

    try {
      const compiled = this.compile ? await this.compile(source) : undefined;
      const result = await target.vm.dispatch({
        source,
        task: { ...parsed.task, id: taskId },
        result: parsed.result,
        compiled,
        target: toRegisteredAgent(target),
        reportProgress: (payload: unknown) => {
          this.recordLifecycle(lifecycle, {
            type: 'task.progress',
            taskId,
            agentId: target.id,
            payload,
          });
        },
      });

      this.recordLifecycle(lifecycle, {
        type: 'task.complete',
        taskId,
        agentId: target.id,
        payload: result,
      });

      return {
        taskId,
        status: 'completed',
        target: toRegisteredAgent(target),
        result,
        lifecycle,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordLifecycle(lifecycle, {
        type: 'task.fail',
        taskId,
        agentId: target.id,
        payload: { code: 'dispatch_failed', message },
      });

      return {
        taskId,
        status: 'failed',
        target: toRegisteredAgent(target),
        error: message,
        lifecycle,
      };
    } finally {
      target.activeCount = Math.max(0, target.activeCount - 1);
    }
  }

  private resolveTarget(task: HSNAPTaskMetadata): InternalAgentRecord | undefined {
    if (task.to) {
      return [...this.agents.values()].find((agent) => agent.id === task.to || agent.name === task.to);
    }

    const candidates = [...this.agents.values()].filter((agent) => agent.activeCount < agent.maxConcurrent);
    if (candidates.length === 0) {
      return undefined;
    }

    const implicitIntent = task.intent ? [task.intent, `task.${task.intent}`] : [];
    const accepted = candidates.filter((agent) => {
      if (implicitIntent.length === 0) {
        return agent.accepts.includes('.hsplus') || agent.accepts.includes('*');
      }

      return implicitIntent.some((key) => agent.accepts.includes(key)) || agent.accepts.includes('.hsplus') || agent.accepts.includes('*');
    });

    if (accepted.length === 0) {
      return undefined;
    }

    return accepted.sort((left, right) => left.activeCount - right.activeCount)[0];
  }

  private recordLifecycle(
    localEvents: HSNAPLifecycleEvent[],
    event: Omit<HSNAPLifecycleEvent, 'timestamp'>
  ): void {
    const enriched: HSNAPLifecycleEvent = {
      ...event,
      timestamp: this.now(),
    };

    localEvents.push(enriched);
    this.lifecycleHistory.push(enriched);
  }
}

export function parseHSNAPPayload(source: string): ParsedHSNAPPayload {
  return {
    task: parseHSNAPTaskMetadata(source),
    result: parseHSNAPResultMetadata(source),
    agent: parseHSNAPAgentMetadata(source),
  };
}

export function parseHSNAPTaskMetadata(source: string): HSNAPTaskMetadata {
  const raw = extractTraitConfig(source, 'task');
  if (!raw) {
    return {};
  }

  const parsed = parseConfigObject(raw);
  return {
    id: asOptionalString(parsed.id),
    from: asOptionalString(parsed.from),
    to: asOptionalString(parsed.to),
    intent: asOptionalString(parsed.intent),
    priority: asOptionalNumber(parsed.priority),
    timeout: asOptionalNumber(parsed.timeout),
  };
}

export function parseHSNAPResultMetadata(source: string): HSNAPResultMetadata | undefined {
  const raw = extractTraitConfig(source, 'result');
  if (!raw) {
    return undefined;
  }

  const parsed = parseConfigObject(raw);
  return {
    task_id: asOptionalString(parsed.task_id),
    status: asOptionalString(parsed.status),
    duration: asOptionalNumber(parsed.duration),
  };
}

export function parseHSNAPAgentMetadata(source: string): HSNAPAgentMetadata | undefined {
  const raw = extractTraitConfig(source, 'agent');
  if (!raw) {
    return undefined;
  }

  const parsed = parseConfigObject(raw);
  return {
    name: asOptionalString(parsed.name),
    accepts: asStringArray(parsed.accepts),
    emits: asStringArray(parsed.emits),
    tools: asStringArray(parsed.tools),
    timeout: asOptionalNumber(parsed.timeout),
    max_concurrent: asOptionalNumber(parsed.max_concurrent),
  };
}

function mergeAgentMetadata(
  extracted: HSNAPAgentMetadata | undefined,
  explicit: RegisterHSNAPAgentOptions['metadata'] | undefined
): HSNAPAgentMetadata {
  return {
    name: explicit?.name ?? extracted?.name,
    accepts: explicit?.accepts ?? extracted?.accepts ?? [],
    emits: explicit?.emits ?? extracted?.emits ?? [],
    tools: explicit?.tools ?? extracted?.tools ?? [],
    timeout: explicit?.timeout ?? extracted?.timeout,
    max_concurrent: explicit?.max_concurrent ?? extracted?.max_concurrent,
  };
}

function toRegisteredAgent(agent: InternalAgentRecord): HSNAPRegisteredAgent {
  return {
    id: agent.id,
    name: agent.name,
    accepts: [...agent.accepts],
    emits: [...agent.emits],
    tools: [...agent.tools],
    timeout: agent.timeout,
    maxConcurrent: agent.maxConcurrent,
  };
}

function extractTraitConfig(source: string, name: string): string | undefined {
  const blockPattern = new RegExp(`@${name}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const blockMatch = source.match(blockPattern);
  if (blockMatch?.[1]) {
    return blockMatch[1];
  }

  const parenPattern = new RegExp(`@${name}\\s*\\(([^)]*)\\)`, 'm');
  const parenMatch = source.match(parenPattern);
  return parenMatch?.[1];
}

function parseConfigObject(config: string): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const segment of splitTopLevel(config, [',', '\n'])) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    entries[key] = parseValue(value);
  }

  return entries;
}

function parseValue(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return splitTopLevel(inner, [',']).map((item) => parseValue(item.trim()));
  }

  return value;
}

function splitTopLevel(input: string, delimiters: string[]): string[] {
  const results: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if ((char === '"' || char === "'") && input[index - 1] !== '\\') {
      if (quote === char) {
        quote = null;
      } else if (quote === null) {
        quote = char;
      }
    }

    if (quote === null) {
      if (char === '[') {
        bracketDepth += 1;
      } else if (char === ']') {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }

      if (bracketDepth === 0 && delimiters.includes(char)) {
        results.push(current);
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current) {
    results.push(current);
  }

  return results;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}