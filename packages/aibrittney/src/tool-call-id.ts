import { randomInt } from 'node:crypto';

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
 * Shape: exactly 9 alphanumeric characters. Mistral, Devstral and Nemo chat
 * templates raise on any other length (a `call_<hex>_<n>` id would fail the
 * whole turn there with a 500); Qwen and Llama templates never render the id,
 * and llama-server mints its own 32-character ids when it emits any, so this
 * only has to satisfy the strictest template.
 *
 * Uniqueness: 62^9 random values, plus a process-scoped set of every id this
 * process has issued, so no two calls in one conversation ever share one.
 * One REPL process is one conversation.
 */
export const TOOL_CALL_ID_LENGTH = 9;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const issued = new Set<string>();

function randomAlphanumeric(): string {
  let id = '';
  for (let i = 0; i < TOOL_CALL_ID_LENGTH; i += 1) {
    id += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return id;
}

/**
 * Mint an id no earlier call in this process has used. `generate` is
 * injectable for tests; the default draws from node:crypto.
 */
export function mintToolCallId(generate: () => string = randomAlphanumeric): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = generate();
    if (!issued.has(id)) {
      issued.add(id);
      return id;
    }
  }
  throw new Error('mintToolCallId: no unused id after 1000 draws');
}
