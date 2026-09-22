import { randomBytes } from 'node:crypto';

/**
 * The id a tool call carries through the whole loop: the assistant message
 * announces it, the tool result answers to it, and both wire protocols
 * (Ollama native, OpenAI-compatible) see the same string.
 *
 * Minted once, where the ToolCall is created, for every call that arrives
 * without an id — OpenAI-style servers that omit `id`, Ollama-native calls,
 * and calls recovered from text. Positional ids (`call_0`, `fallback-0`)
 * collided across iterations and never matched the tool result's
 * `tool_call_id`, so strict servers rejected the history and lenient ones
 * attributed results to the wrong call.
 *
 * Process-scoped: one REPL process is one conversation. The random prefix
 * keeps ids distinct across processes (and across duplicate bundle copies of
 * this module); the counter keeps them distinct within one.
 */
const prefix = randomBytes(3).toString('hex');
let sequence = 0;

export function mintToolCallId(): string {
  sequence += 1;
  return `call_${prefix}_${sequence}`;
}
