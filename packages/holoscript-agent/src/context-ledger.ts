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
 * never trims history within a task, but a local server (Ollama, llama.cpp) silently
 * drops the oldest messages past its num_ctx. So for local providers a pointer may only
 * reach back `windowChars`, measured over the whole history (assistant turns, nudges and
 * tool results alike); a repeat from further back is sent in full and becomes the new
 * first copy. Anything that starts compacting history in the runner must reset this
 * ledger too.
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
  /** Which call with these same arguments produced it (1 = the first). */
  nth: number;
  /** Characters of history before this copy, i.e. where it starts. */
  start: number;
}

export interface ContextLedgerOptions {
  minChars?: number;
  /** How far back a pointer may reach; see contextWindowCharsFor. Default: unbounded. */
  windowChars?: number;
}

export class ContextLedger {
  private readonly firstCopy = new Map<string, FirstCopy>();
  /** How many times each exact call (tool + arguments) has been admitted. */
  private readonly callCount = new Map<string, number>();
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
    let position = history.reduce((sum, m) => sum + messageChars(m), 0);
    return results.map((result, i) => {
      const out = this.admitOne(uses[i], result, position);
      position += JSON.stringify(out).length;
      return out;
    });
  }

  private admitOne(
    use: ToolUseBlock | undefined,
    result: ToolResultBlock,
    position: number
  ): ToolResultBlock {
    const args = use ? stableStringify(use.input) : '';
    const call = use ? `${use.name}:${args}` : '';
    const nth = use ? (this.callCount.get(call) ?? 0) + 1 : 0;
    if (use) this.callCount.set(call, nth);

    if (result.is_error || typeof result.content !== 'string') return result;
    if (result.content.length < this.minChars) return result;
    const tool = use?.name ?? 'tool';
    const digest = createHash('sha256').update(result.content).digest('hex');
    const first = this.firstCopy.get(digest);
    if (!first || position - first.start > this.windowChars) {
      this.firstCopy.set(digest, {
        toolUseId: result.tool_use_id,
        tool,
        call,
        args,
        nth,
        start: position,
      });
      return result;
    }
    // Ids alone are ambiguous: some adapters number calls per turn (call_0, call_0, …),
    // so the pointer names the earlier call by its tool, arguments and ordinal as well.
    const which = `${ordinal(first.nth)} ${first.tool} call`;
    const pointer =
      first.call === call
        ? `[unchanged: identical to what the ${which} with these same arguments returned (tool_use_id ${first.toolUseId}; ${result.content.length} chars); not repeated]`
        : `[identical to what the ${which} with arguments ${shorten(first.args)} returned (tool_use_id ${first.toolUseId}; ${result.content.length} chars); not repeated]`;
    this.stats.elided++;
    this.stats.charsSaved += result.content.length - pointer.length;
    return { ...result, content: pointer };
  }
}

function ordinal(n: number): string {
  if (n <= 0) return 'earlier';
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
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
