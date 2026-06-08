import type { ToolCall } from './ollama-chat.js';

/**
 * Text-based tool-call fallback parser.
 *
 * Tool-capable models (qwen2.5-coder, llama3.1) return structured
 * `message.tool_calls` natively. Weaker / inconsistently-tooled open models
 * (e.g. Gemma's E-series on some Ollama backends) instead emit the tool call
 * as text inside `message.content` — a `<tool_call>` block, a fenced ```json
 * block, or a bare JSON object. Without a fallback, agent.ts treats that text
 * as a final answer and the tool never fires.
 *
 * This extracts those text-embedded calls and normalizes them to the same
 * `ToolCall` shape the native path produces, so the loop is model-agnostic.
 * It is deliberately conservative: a candidate only counts as a tool call when
 * it carries a non-empty string `name` AND an `arguments`/`parameters` field.
 * Anything else returns `[]`, so ordinary prose answers are never misread.
 */
export function extractTextToolCalls(content: string): ToolCall[] {
  if (!content || !content.trim()) return [];

  const candidates: unknown[] = [];

  // 1. <tool_call>...</tool_call> blocks (Hermes / Qwen text convention).
  for (const m of content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)) {
    pushJson(candidates, m[1]);
  }

  // 2. Fenced ```json / ```tool_call code blocks.
  for (const m of content.matchAll(/```(?:json|tool_call)?\s*([\s\S]*?)```/gi)) {
    pushJson(candidates, m[1]);
  }

  // 3. Whole trimmed content is a JSON object/array (no surrounding prose).
  if (candidates.length === 0) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      pushJson(candidates, trimmed);
    }
  }

  const calls: ToolCall[] = [];
  for (const candidate of candidates) {
    for (const obj of asArray(candidate)) {
      const call = toToolCall(obj, calls.length);
      if (call) calls.push(call);
    }
  }
  return calls;
}

function pushJson(out: unknown[], raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  try {
    out.push(JSON.parse(trimmed));
  } catch {
    // Not valid JSON — ignore; this is a best-effort fallback.
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalize one parsed object to a ToolCall, unwrapping the common envelopes
 * models use: `{tool_call: {...}}`, `{function: {...}}`, or the call inline.
 * Returns null when the object isn't a recognizable tool call.
 */
function toToolCall(value: unknown, index: number): ToolCall | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;

  const inner = isRecord(obj.tool_call)
    ? obj.tool_call
    : isRecord(obj.function)
      ? obj.function
      : obj;

  const name = inner.name;
  if (typeof name !== 'string' || !name.trim()) return null;

  const rawArgs = inner.arguments ?? inner.parameters;
  // Require an arguments/parameters field so plain `{name: "..."}` JSON that
  // happens to have a name (e.g. a config blob) is not misread as a call.
  if (rawArgs === undefined) return null;

  const args =
    typeof rawArgs === 'string' || isRecord(rawArgs)
      ? (rawArgs as Record<string, unknown> | string)
      : {};

  return {
    id: typeof obj.id === 'string' ? obj.id : `fallback-${index}`,
    function: { name, arguments: args },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
