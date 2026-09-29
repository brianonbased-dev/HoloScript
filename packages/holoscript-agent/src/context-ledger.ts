/**
 * Context ledger — a tool loop pays for a tool result once, not once per repeat.
 *
 * The runner resends the whole task history on every provider call and never trims
 * it inside a task, so a result the model has already seen stays in its context for
 * the rest of the task. When a later tool call returns byte-identical content (the
 * same file read twice, the same status command re-run), sending it again adds those
 * tokens to this call and to every call after it, and fills a small local model's
 * context window. The ledger replaces such a repeat with a one-line pointer to the
 * earlier copy.
 *
 * Append-only by design: earlier messages are never rewritten, so a provider's
 * prompt-cache prefix stays valid. Errors and short results always pass through.
 *
 * Correctness rests on the first copy still being in the model's context. The runner
 * never trims history within a task, but a local server may drop the oldest messages
 * once a prompt passes its context size (some servers reject the request instead, and
 * then this is only conservative). So for local providers a pointer may only reach back
 * `windowChars`, measured over the whole history (assistant turns, nudges and tool
 * results alike, whole messages at a time); a repeat from further back is sent in full
 * and becomes the new first copy. A pointer names the earlier result by how many tool
 * calls back it is, which stays true when the oldest messages are dropped, and on local
 * providers tells the model to call the tool again if it can no longer see that result:
 * the history keeps growing after the pointer is written, so the first copy can still
 * leave the window before the pointer does. Anything that starts compacting history in
 * the runner must reset this ledger too.
 */
import { createHash } from 'node:crypto';
import {
  resolveLocalNumCtx,
  type LLMMessage,
  type ToolResultBlock,
  type ToolUseBlock,
} from '@holoscript/llm-provider';

/** Results shorter than this are cheaper to resend than to explain. */
export const MIN_ELIDE_CHARS = 512;

/** Hosted APIs reject an oversized request instead of dropping its oldest context. */
const HOSTED_PROVIDERS = new Set(['anthropic', 'openai', 'gemini', 'xai', 'openrouter']);

/**
 * Characters assumed per token when sizing a local window. Real text runs ~3-4, so 2
 * overcounts tokens and errs toward resending in full.
 */
const CHARS_PER_TOKEN = 2;

/** Longest argument text a pointer quotes to name the earlier call. */
const MAX_ARGS_IN_POINTER = 120;

export interface ContextWindowRequest {
  /** The request's maxTokens: output the server reserves inside num_ctx. */
  maxTokens: number;
  /** Characters every request carries besides the history: system prompt and tool schemas. */
  fixedChars: number;
}

/**
 * How far back (in characters of history) a pointer may reach for this provider.
 * Unbounded for hosted APIs. For local ones: num_ctx minus the output reserve, in
 * characters, minus what every request carries anyway. 0 means never elide.
 *
 * resolveLocalNumCtx is the num_ctx the local adapter sends on its native Ollama path.
 * Its OpenAI-compatible path (HoloServe, HoloLlama, llama-server) sends none, so there
 * the same value is an assumed window, not one the server was told.
 */
export function contextWindowCharsFor(provider: string, request: ContextWindowRequest): number {
  if (HOSTED_PROVIDERS.has(provider)) return Infinity;
  const tokens = resolveLocalNumCtx() - request.maxTokens;
  return Math.max(0, tokens * CHARS_PER_TOKEN - request.fixedChars);
}

/** Flattened size of a message as sent: its text, or its blocks serialized. */
export function messageChars(message: LLMMessage): number {
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content.length;
  return JSON.stringify(content ?? '').length;
}

export interface ContextLedgerStats {
  /** Tool results replaced by a pointer to an earlier identical copy. */
  elided: number;
  /** Characters not resent in the replaced results (net of the pointer text). */
  charsSaved: number;
}

interface FirstCopy {
  toolUseId: string;
  tool: string;
  call: string;
  args: string;
  /** Position of this result among all tool results admitted in the task (1-based). */
  index: number;
  /** Characters of history before the message that carries this copy. */
  start: number;
}

export interface ContextLedgerOptions {
  minChars?: number;
  /** How far back a pointer may reach; see contextWindowCharsFor. Default: unbounded. */
  windowChars?: number;
}

export class ContextLedger {
  private readonly firstCopy = new Map<string, FirstCopy>();
  /** Tool results admitted so far in this task. */
  private admitted = 0;
  readonly stats: ContextLedgerStats = { elided: 0, charsSaved: 0 };
  private readonly minChars: number;
  private readonly windowChars: number;

  constructor(opts: ContextLedgerOptions = {}) {
    this.minChars = opts.minChars ?? MIN_ELIDE_CHARS;
    this.windowChars = opts.windowChars ?? Infinity;
  }

  /**
   * Returns the results to push into `history`, in the same order. `history` is the
   * conversation as it stands just before these results are appended (the assistant
   * turn that asked for them included). `uses[i]` must be the call that produced
   * `results[i]`. Nothing is mutated, so callers can keep reading the full results
   * (commit SHAs, vision captions).
   */
  admit(
    history: readonly LLMMessage[],
    uses: readonly ToolUseBlock[],
    results: readonly ToolResultBlock[]
  ): ToolResultBlock[] {
    // A server that drops context drops whole messages, so the batch is one unit: its
    // copies start where its message starts, and a pointer in it must reach back from
    // the end of the whole batch, counted at full size (an overestimate, so it errs
    // toward resending).
    const start = history.reduce((sum, m) => sum + messageChars(m), 0);
    const end = results.reduce((sum, r) => sum + JSON.stringify(r).length, start);
    return results.map((result, i) => this.admitOne(uses[i], result, start, end));
  }

  private admitOne(
    use: ToolUseBlock | undefined,
    result: ToolResultBlock,
    start: number,
    end: number
  ): ToolResultBlock {
    const index = ++this.admitted;
    if (result.is_error || typeof result.content !== 'string') return result;
    if (result.content.length < this.minChars) return result;
    const tool = use?.name ?? 'tool';
    const args = use ? stableStringify(use.input) : '';
    const call = use ? `${use.name}:${args}` : '';
    const digest = createHash('sha256').update(result.content).digest('hex');
    const first = this.firstCopy.get(digest);
    if (!first || end - first.start > this.windowChars) {
      this.firstCopy.set(digest, { toolUseId: result.tool_use_id, tool, call, args, index, start });
      return result;
    }
    // Named by distance, not by id or by count from the start of the task: some adapters
    // number calls per turn (call_0, call_0, …), and a local server may have dropped the
    // oldest messages, but every result after the first copy is still there to count.
    const back = index - first.index;
    const where = `${back} tool ${back === 1 ? 'call' : 'calls'} back`;
    const what =
      first.call === call
        ? `[unchanged: identical to the result of this same ${first.tool} call ${where}`
        : `[identical to the result of the ${first.tool} call with arguments ${shorten(first.args)}, ${where}`;
    const recall = Number.isFinite(this.windowChars)
      ? `; if you can no longer see that result, call ${tool} again`
      : '';
    const pointer = `${what} (tool_use_id ${first.toolUseId}; ${result.content.length} chars); not repeated${recall}]`;
    this.stats.elided++;
    this.stats.charsSaved += result.content.length - pointer.length;
    return { ...result, content: pointer };
  }
}

function shorten(text: string): string {
  return text.length <= MAX_ARGS_IN_POINTER ? text : `${text.slice(0, MAX_ARGS_IN_POINTER - 1)}…`;
}

/** JSON with object keys sorted, so `{a,b}` and `{b,a}` name the same call. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}
