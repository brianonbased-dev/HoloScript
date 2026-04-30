/**
 * Tool-loop runner — the agentic core of v0.2.
 *
 * Flow:
 *   1. Send the conversation + tool catalog to Ollama (non-streaming).
 *   2. If the model returns plain text → done, return it.
 *   3. If the model returns tool_calls → dispatch each via the orchestrator,
 *      append the results as role=tool messages, loop back to (1).
 *   4. Cap iterations to avoid runaway loops on a confused model.
 *
 * The streaming path stays in ollama-stream.ts for the no-tools REPL turn —
 * v0.2 deliberately doesn't try to stream through tool calls (Ollama's
 * tool-calls aren't reliably streamable across all backends, and the local
 * 7B latency makes a single non-streaming round-trip per step fine).
 */

import type { Session, ChatMessage } from './session.js';
import { chatOnceFromOllama, type ToolCall } from './ollama-chat.js';
import { findTool, ollamaToolsPayload } from './tools.js';
import type { McpClient } from './mcp-client.js';

export interface AgentEvent {
  kind: 'thinking' | 'tool-call' | 'tool-result' | 'final' | 'error';
  message: string;
  data?: unknown;
}

export interface RunAgentOptions {
  session: Session;
  mcp: McpClient;
  /** Cap iterations to keep a confused model from looping forever. */
  maxIterations?: number;
  /** Hook for the REPL to print per-step status. */
  onEvent?: (e: AgentEvent) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface AgentRunResult {
  ok: boolean;
  finalText: string;
  toolCallsExecuted: number;
  iterations: number;
  error?: string;
}

const DEFAULT_MAX_ITERATIONS = 6;

export async function runAgentTurn(opts: RunAgentOptions): Promise<AgentRunResult> {
  const { session, mcp } = opts;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tools = ollamaToolsPayload();
  let toolCallsExecuted = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    opts.onEvent?.({ kind: 'thinking', message: `iteration ${iter}/${maxIterations}` });
    const result = await chatOnceFromOllama({
      host: session.config.ollamaHost,
      model: session.config.model,
      messages: session.messages(),
      tools,
      apiKey: session.config.apiKey || undefined,
      signal: opts.signal,
      fetchImpl: opts.fetchImpl,
    });
    if (!result.ok) {
      opts.onEvent?.({ kind: 'error', message: result.error });
      return { ok: false, finalText: '', toolCallsExecuted, iterations: iter, error: result.error };
    }
    const calls = result.message.tool_calls ?? [];
    if (calls.length === 0) {
      const text = result.message.content;
      session.pushRaw({ role: 'assistant', content: text });
      opts.onEvent?.({ kind: 'final', message: text });
      return { ok: true, finalText: text, toolCallsExecuted, iterations: iter };
    }

    // Persist the assistant's tool-call request so the model can see its own
    // intent on the next round (Ollama / OpenAI conventions both expect it).
    session.pushRaw({
      role: 'assistant',
      content: result.message.content,
      tool_calls: calls,
    });

    for (const call of calls) {
      toolCallsExecuted++;
      const args = normalizeArgs(call);
      const def = findTool(call.function.name);
      if (!def) {
        const msg: ChatMessage = {
          role: 'tool',
          name: call.function.name,
          tool_call_id: call.id,
          content: JSON.stringify({
            error: `unknown tool "${call.function.name}" — not in catalog`,
          }),
        };
        session.pushRaw(msg);
        opts.onEvent?.({
          kind: 'tool-result',
          message: `${call.function.name} → unknown tool`,
        });
        continue;
      }
      opts.onEvent?.({
        kind: 'tool-call',
        message: `${def.function.name} ${shortenArgs(args)}`,
        data: args,
      });
      const callRes = await mcp.callTool({
        server: def.route.server,
        tool: def.route.tool,
        args,
      });
      const content = JSON.stringify(
        callRes.ok
          ? callRes.data
          : { error: callRes.error ?? `tool failed (HTTP ${callRes.status})` },
      );
      session.pushRaw({
        role: 'tool',
        name: call.function.name,
        tool_call_id: call.id,
        content,
      });
      opts.onEvent?.({
        kind: 'tool-result',
        message: callRes.ok
          ? `${def.function.name} → ok (${content.length} bytes)`
          : `${def.function.name} → error: ${callRes.error}`,
      });
    }
    // Loop: with the tool results appended, ask the model again.
  }

  const msg = `tool loop hit max iterations (${maxIterations}); stopping`;
  opts.onEvent?.({ kind: 'error', message: msg });
  return {
    ok: false,
    finalText: '',
    toolCallsExecuted,
    iterations: maxIterations,
    error: msg,
  };
}

function normalizeArgs(call: ToolCall): Record<string, unknown> {
  const a = call.function.arguments;
  if (typeof a === 'string') {
    try {
      const parsed = JSON.parse(a);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return a ?? {};
}

function shortenArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
