import {
  parseHSNAPPayload,
  type HSNAPAgentMetadata,
  type HSNAPResultMetadata,
  type HSNAPTaskMetadata,
} from './hsnap-router';

export const CANONICAL_TASK_BRIDGE_SCHEMA = 'holoscript.task-bridge.v1' as const;

export interface CanonicalTaskEnvelope {
  schema: typeof CANONICAL_TASK_BRIDGE_SCHEMA;
  task: HSNAPTaskMetadata;
  result?: HSNAPResultMetadata;
  agent?: HSNAPAgentMetadata;
}

export interface A2ASendMessageRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'a2a.sendMessage';
  params: {
    message: {
      role: 'user';
      parts: Array<{
        type: 'data';
        mimeType: 'application/json';
        data: Record<string, unknown>;
      }>;
      timestamp: string;
    };
  };
}

export function createCanonicalTaskEnvelope(
  task: HSNAPTaskMetadata,
  options: {
    result?: HSNAPResultMetadata;
    agent?: HSNAPAgentMetadata;
  } = {}
): CanonicalTaskEnvelope {
  return {
    schema: CANONICAL_TASK_BRIDGE_SCHEMA,
    task,
    ...(options.result ? { result: options.result } : {}),
    ...(options.agent ? { agent: options.agent } : {}),
  };
}

export function canonicalTaskToA2ASendMessage(
  envelope: CanonicalTaskEnvelope,
  requestId: string,
  timestamp = new Date().toISOString()
): A2ASendMessageRequest {
  return {
    jsonrpc: '2.0',
    id: requestId,
    method: 'a2a.sendMessage',
    params: {
      message: {
        role: 'user',
        parts: [
          {
            type: 'data',
            mimeType: 'application/json',
            data: {
              schema: envelope.schema,
              task: envelope.task,
              ...(envelope.result ? { result: envelope.result } : {}),
              ...(envelope.agent ? { agent: envelope.agent } : {}),
              skillId: envelope.task.skillId,
              arguments: envelope.task.input,
              idempotencyKey: envelope.task.idempotency_key,
            },
          },
        ],
        timestamp,
      },
    },
  };
}

export function a2aSendMessageToCanonicalTaskEnvelope(payload: unknown): CanonicalTaskEnvelope | null {
  if (!payload || typeof payload !== 'object') return null;
  const request = payload as {
    params?: { message?: { parts?: Array<{ data?: Record<string, unknown> }> } };
  };

  const data = request.params?.message?.parts?.find((part) => part?.data)?.data;
  if (!data || typeof data !== 'object') return null;

  if (data.schema === CANONICAL_TASK_BRIDGE_SCHEMA && data.task && typeof data.task === 'object') {
    return createCanonicalTaskEnvelope(data.task as HSNAPTaskMetadata, {
      result: (data.result as HSNAPResultMetadata | undefined) ?? undefined,
      agent: (data.agent as HSNAPAgentMetadata | undefined) ?? undefined,
    });
  }

  const legacyTask: HSNAPTaskMetadata = {
    id: typeof data.taskId === 'string' ? data.taskId : undefined,
    from: typeof data.from === 'string' ? data.from : undefined,
    to: typeof data.to === 'string' ? data.to : undefined,
    intent: typeof data.intent === 'string' ? data.intent : undefined,
    timeout: typeof data.timeout === 'number' ? data.timeout : undefined,
    skillId: typeof data.skillId === 'string' ? data.skillId : undefined,
    input: isRecord(data.arguments) ? data.arguments : undefined,
    idempotency_key:
      typeof data.idempotencyKey === 'string' ? data.idempotencyKey : undefined,
  };

  return createCanonicalTaskEnvelope(legacyTask);
}

export function canonicalTaskToHSNAPSource(
  envelope: CanonicalTaskEnvelope,
  compositionName = 'TranslatedTask'
): string {
  const sections: string[] = [];

  sections.push(`@task ${serializeObjectLiteral(envelope.task)}`);
  if (envelope.result) {
    sections.push(`@result ${serializeObjectLiteral(envelope.result)}`);
  }
  if (envelope.agent) {
    sections.push(`@agent ${serializeObjectLiteral(envelope.agent)}`);
  }

  sections.push(`composition ${compositionName} {}`);
  return sections.join('\n\n');
}

export function hsnapSourceToCanonicalTaskEnvelope(source: string): CanonicalTaskEnvelope {
  const parsed = parseHSNAPPayload(source);
  return createCanonicalTaskEnvelope(parsed.task, {
    result: parsed.result,
    agent: parsed.agent,
  });
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeValue(item)).join(', ')}]`;
  }
  if (isRecord(value)) {
    return serializeObjectLiteral(value);
  }
  return JSON.stringify(value);
}

function serializeObjectLiteral(record: Record<string, unknown>): string {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined);
  return `{ ${entries.map(([key, value]) => `${key}: ${serializeValue(value)}`).join(', ')} }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
