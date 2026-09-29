/**
 * Assistant Session
 *
 * Manages conversation history and builds the scene context payload
 * sent to the LLM with each message.
 */

import type { SceneNode } from '@/lib/stores';
import {
  compactedHistory,
  droppedHistory,
  planCompaction,
  type CompactionPlan,
} from './historyCompaction';

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
    // The older part of the chat was summed up to stay under the route's body cap.
    // payload: { messages: AssistantMessage[]; summarized: number }. The caller keeps
    // `messages` as its history, so the next turn does not sum up the same part again.
    | 'history_compacted'
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
  /**
   * True when the SERVER executes this tool itself and will stream a matching
   * `tool_result` event. Clients must NOT run these through their local
   * executor — doing so manufactures "Unknown tool" failures for every
   * MCP/Studio-API/Lotus/embodied call.
   */
  serverExecuted?: boolean;
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
 * The sentence a refusing /api/brittney wrote for people (`notice`), if it wrote
 * one. `message` is not read: the route's 503 diagnostic puts technical text
 * there, which must not be shown as if Brittney had said it.
 */
async function readRefusalNotice(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { notice?: unknown };
    return typeof body.notice === 'string' && body.notice.trim() ? body.notice.trim() : null;
  } catch {
    return null;
  }
}

/** The shortened history a 'history_compacted' event carries, or null. */
export function compactedMessagesFrom(event: AssistantStreamEvent): AssistantMessage[] | null {
  if (event.type !== 'history_compacted') return null;
  const messages = (event.payload as { messages?: unknown } | null)?.messages;
  return Array.isArray(messages) ? (messages as AssistantMessage[]) : null;
}

/**
 * Sums up `plan.older` with Brittney (POST /api/brittney/compact) and returns the
 * history to send. When no summary can be written, the older part is left out with
 * a plain note (an earlier summary is kept), so the chat goes on instead of failing
 * on the size cap. A cancelled send stays cancelled.
 */
async function compactOlder(plan: CompactionPlan, signal?: AbortSignal): Promise<AssistantMessage[]> {
  try {
    const res = await fetch('/api/brittney/compact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ messages: plan.older }),
    });
    const body = res.ok ? ((await res.json().catch(() => null)) as { summary?: unknown } | null) : null;
    const summary = typeof body?.summary === 'string' ? body.summary.trim() : '';
    if (summary) return compactedHistory(summary, plan.recent);
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') throw err;
  }
  return droppedHistory(plan.older, plan.recent);
}

/**
 * Calls POST /api/brittney and yields parsed SSE events.
 */
export async function* streamAssistant(
  messages: AssistantMessage[],
  sceneContext: string,
  signal?: AbortSignal,
  persist?: AssistantPersistOptions,
  workspacePath?: string | null
): AsyncGenerator<AssistantStreamEvent> {
  // A long chat is summed up before it would pass the route's 32,000-byte body cap
  // (lib/brittney/historyCompaction.ts); the person still sees every message.
  let outgoing = messages;
  const plan = planCompaction(
    messages,
    new TextEncoder().encode(
      JSON.stringify({ messages: [], sceneContext, persist, workspacePath: workspacePath ?? null })
    ).length
  );
  if (plan) {
    outgoing = await compactOlder(plan, signal);
    yield { type: 'history_compacted', payload: { messages: outgoing, summarized: plan.older.length } };
  }

  const response = await fetch('/api/brittney', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      messages: outgoing,
      sceneContext,
      // Write-through qq65: only a truthy conversationId is forwarded — a
      // null/empty id with a scope must fall through to the server's
      // create-on-miss path instead of failing ownership lookup.
      ...(persist?.conversationId ? { conversationId: persist.conversationId } : {}),
      ...(persist?.scope !== undefined ? { scope: persist.scope } : {}),
      // Workspace agency: the active workspace's local clone path enables the
      // workspace_* file/build tools server-side (validated there, never
      // echoed into the prompt).
      ...(workspacePath ? { workspacePath } : {}),
    }),
  });

  if (!response.ok || !response.body) {
    // A refusal that explains itself to people (a `notice`, as the daily limit
    // sends) is shown as Brittney's reply, in its own words. It used to reach
    // the person as "API error 429: Too Many Requests", with the server's
    // explanation thrown away.
    const explained = response.ok ? null : await readRefusalNotice(response);
    if (explained) {
      yield { type: 'text', payload: explained };
    } else {
      yield { type: 'error', payload: `API error ${response.status}: ${response.statusText}` };
    }
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
