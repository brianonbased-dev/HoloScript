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
 * drops the oldest context past its num_ctx. So for local providers the ledger only
 * points back within `windowChars` of the newest content; a repeat from further back is
 * sent in full and becomes the new first copy. Anything that starts compacting history
 * in the runner must reset this ledger too.
 */
import { createHash } from 'node:crypto';
import type { ToolResultBlock, ToolUseBlock } from '@holoscript/llm-provider';

/** Results shorter than this are cheaper to resend than to explain. */
export const MIN_ELIDE_CHARS = 512;

/** Hosted APIs reject an oversized request instead of dropping its oldest context. */
const HOSTED_PROVIDERS = new Set(['anthropic', 'openai', 'gemini', 'xai', 'openrouter']);

/**
 * How far back (in characters of tool output) a pointer may reach for this provider.
 * Local models get num_ctx tokens × 2 chars, deliberately under the ~3-4 chars a token
 * usually covers, because the system prompt and assistant turns share that window.
 */
export function contextWindowCharsFor(provider: string): number {
  if (HOSTED_PROVIDERS.has(provider)) return Infinity;
  const raw = process.env.HOLOSCRIPT_LLM_NUM_CTX ?? process.env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX;
  const n = raw ? Number(raw) : NaN;
  // 16384 is local-llm.ts's num_ctx default when neither variable is set.
  return (Number.isFinite(n) && n > 0 ? n : 16384) * 2;
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
  /** Characters admitted before this copy, i.e. where it starts in the ledger's stream. */
  start: number;
}

export interface ContextLedgerOptions {
  minChars?: number;
  /** How far back a pointer may reach; see contextWindowCharsFor. Default: unbounded. */
  windowChars?: number;
}

export class ContextLedger {
  private readonly firstCopy = new Map<string, FirstCopy>();
  readonly stats: ContextLedgerStats = { elided: 0, charsSaved: 0 };
  private readonly minChars: number;
  private readonly windowChars: number;
  /** Total characters of tool output admitted so far (after elision). */
  private position = 0;

  constructor(opts: ContextLedgerOptions = {}) {
    this.minChars = opts.minChars ?? MIN_ELIDE_CHARS;
    this.windowChars = opts.windowChars ?? Infinity;
  }

  /**
   * Returns the results to push into the history, in the same order. `uses[i]` must
   * be the call that produced `results[i]`. The inputs are not mutated, so callers
   * can keep reading the full results (commit SHAs, vision captions).
   */
  admit(uses: readonly ToolUseBlock[], results: readonly ToolResultBlock[]): ToolResultBlock[] {
    return results.map((result, i) => {
      const out = this.admitOne(uses[i], result);
      this.position += typeof out.content === 'string' ? out.content.length : 0;
      return out;
    });
  }

  private admitOne(use: ToolUseBlock | undefined, result: ToolResultBlock): ToolResultBlock {
    if (result.is_error || typeof result.content !== 'string') return result;
    if (result.content.length < this.minChars) return result;
    const tool = use?.name ?? 'tool';
    const call = use ? `${use.name}:${stableStringify(use.input)}` : '';
    const digest = createHash('sha256').update(result.content).digest('hex');
    const first = this.firstCopy.get(digest);
    if (!first || this.position - first.start > this.windowChars) {
      this.firstCopy.set(digest, {
        toolUseId: result.tool_use_id,
        tool,
        call,
        start: this.position,
      });
      return result;
    }
    const pointer =
      first.call === call
        ? `[unchanged: identical to the result of ${first.tool} ${first.toolUseId} earlier in this conversation (${result.content.length} chars); not repeated]`
        : `[identical to the result of ${first.tool} ${first.toolUseId} earlier in this conversation (${result.content.length} chars); not repeated]`;
    this.stats.elided++;
    this.stats.charsSaved += result.content.length - pointer.length;
    return { ...result, content: pointer };
  }
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
