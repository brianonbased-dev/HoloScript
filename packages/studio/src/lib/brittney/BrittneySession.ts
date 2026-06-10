/**
 * Assistant Session
 *
 * Manages conversation history and builds the scene context payload
 * sent to the LLM with each message.
 */

import type { SceneNode } from '@/lib/stores';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantStreamEvent {
  // 'conversation' / 'persisted' are the server-side chat write-through
  // signals (write-through qq65): 'conversation' arrives early — before any
  // LLM text — and is THE confirmation that the server persists this turn;
  // 'persisted' events are informational per-row acks.
  type:
    | 'text'
    | 'tool_call'
    | 'tool_result'
    | 'operator_receipt'
    | 'conversation'
    | 'persisted'
    | 'error'
    | 'done';
  payload: unknown;
}

/**
 * Optional conversation identity for server-side chat persistence
 * (write-through qq65). `conversationId` targets an existing owned thread;
 * `scope` alone asks the server to create one on miss. Omitting both keeps
 * the request byte-identical to the legacy (no-persistence) behavior.
 */
export interface AssistantPersistOptions {
  conversationId?: string | null;
  scope?: string;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Payload for `tool_result` events emitted by `app/api/brittney/route.ts`
 * after an MCP / embodied / studio tool resolves. `data` carries the raw
 * MCP envelope so hologram-typed responses (task_1778114362909_zp7u) can
 * be detected at the chat surface.
 */
export interface ToolResultPayload {
  name: string;
  success: boolean;
  data: unknown;
  error?: string;
}

// ─── Context serializer ───────────────────────────────────────────────────────

/**
 * Converts the current SceneNode array into a compact text summary
 * that fits in the system prompt without overwhelming the context window.
 */
export function buildSceneContext(nodes: SceneNode[], selectedId: string | null): string {
  if (nodes.length === 0) return 'Scene is empty — no objects yet.';

  const lines: string[] = [`Scene contains ${nodes.length} object(s):`];

  for (const node of nodes) {
    const traitList =
      node.traits.length === 0
        ? 'no traits'
        : node.traits
            .map((t) => {
              const props = Object.entries(t.properties)
                .slice(0, 3)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ');
              return `@${t.name}${props ? `(${props})` : ''}`;
            })
            .join(', ');

    const selected = node.id === selectedId ? ' [SELECTED]' : '';
    lines.push(`  - "${node.name}" (${node.type})${selected}: ${traitList}`);
  }

  return lines.join('\n');
}

/**
 * Rich context builder — includes the raw .holo code so the assistant can
 * directly read and modify the scene source. Prioritises code over the
 * node graph summary when both are available.
 */
export function buildRichContext(
  code: string,
  nodes: SceneNode[],
  selectedId: string | null,
  selectedName: string | null
): string {
  const sections: string[] = [];

  // Selected object hint
  if (selectedName) {
    sections.push(`Currently selected object: "${selectedName}"`);
  } else {
    sections.push('No object is currently selected.');
  }

  // Node graph summary (compact)
  if (nodes.length > 0) {
    sections.push(buildSceneContext(nodes, selectedId));
  }

  // Full scene source — the ground truth
  if (code.trim()) {
    const truncated = code.length > 4000 ? code.slice(0, 4000) + '\n… (truncated)' : code;
    sections.push(`\nFull scene code (HoloScript):\n\`\`\`holoscript\n${truncated}\n\`\`\``);
  } else {
    sections.push('\nScene code is empty. You can create objects with createObject().');
  }

  return sections.join('\n\n');
}

// ─── Stream consumer ──────────────────────────────────────────────────────────

/**
 * Calls POST /api/brittney and yields parsed SSE events.
 */
export async function* streamAssistant(
  messages: AssistantMessage[],
  sceneContext: string,
  signal?: AbortSignal,
  persist?: AssistantPersistOptions
): AsyncGenerator<AssistantStreamEvent> {
  const response = await fetch('/api/brittney', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      messages,
      sceneContext,
      // Write-through qq65: only a truthy conversationId is forwarded — a
      // null/empty id with a scope must fall through to the server's
      // create-on-miss path instead of failing ownership lookup.
      ...(persist?.conversationId ? { conversationId: persist.conversationId } : {}),
      ...(persist?.scope !== undefined ? { scope: persist.scope } : {}),
    }),
  });

  if (!response.ok || !response.body) {
    yield { type: 'error', payload: `API error ${response.status}: ${response.statusText}` };
    yield { type: 'done', payload: null };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as AssistantStreamEvent;
        yield event;
        if (event.type === 'done') return;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}

// Backward-compatible aliases while Studio migrates off persona-specific names.
export type BrittneyMessage = AssistantMessage;
export type BrittneyStreamEvent = AssistantStreamEvent;
export const streamBrittney = streamAssistant;
