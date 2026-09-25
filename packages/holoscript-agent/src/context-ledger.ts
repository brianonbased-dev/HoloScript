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
 * Correctness rests on the history not being trimmed within a task. Anything that
 * starts compacting or truncating history must reset this ledger (or stop using it),
 * or a pointer could name a copy that is no longer in context.
 */
import { createHash } from 'node:crypto';
import type { ToolResultBlock, ToolUseBlock } from '@holoscript/llm-provider';

/** Results shorter than this are cheaper to resend than to explain. */
export const MIN_ELIDE_CHARS = 512;

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
}

export class ContextLedger {
  private readonly firstCopy = new Map<string, FirstCopy>();
  readonly stats: ContextLedgerStats = { elided: 0, charsSaved: 0 };

  constructor(private readonly minChars: number = MIN_ELIDE_CHARS) {}

  /**
   * Returns the results to push into the history, in the same order. `uses[i]` must
   * be the call that produced `results[i]`. The inputs are not mutated, so callers
   * can keep reading the full results (commit SHAs, vision captions).
   */
  admit(uses: readonly ToolUseBlock[], results: readonly ToolResultBlock[]): ToolResultBlock[] {
    return results.map((result, i) => {
      if (result.is_error || typeof result.content !== 'string') return result;
      if (result.content.length < this.minChars) return result;
      const use = uses[i];
      const tool = use?.name ?? 'tool';
      const call = use ? `${use.name}:${stableStringify(use.input)}` : '';
      const digest = createHash('sha256').update(result.content).digest('hex');
      const first = this.firstCopy.get(digest);
      if (!first) {
        this.firstCopy.set(digest, { toolUseId: result.tool_use_id, tool, call });
        return result;
      }
      const pointer =
        first.call === call
          ? `[unchanged: identical to the result of ${first.tool} ${first.toolUseId} earlier in this conversation (${result.content.length} chars); not repeated]`
          : `[identical to the result of ${first.tool} ${first.toolUseId} earlier in this conversation (${result.content.length} chars); not repeated]`;
      this.stats.elided++;
      this.stats.charsSaved += result.content.length - pointer.length;
      return { ...result, content: pointer };
    });
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
