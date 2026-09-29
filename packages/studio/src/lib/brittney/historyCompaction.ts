/**
 * Keeping a long Brittney chat under the route's body cap without forgetting.
 *
 * Every turn sends the whole chat so far, and /api/brittney refuses a body over
 * 32,000 bytes ("Body exceeds size limit"). Measured 2026-09-29: nothing shortened
 * a chat, so a long build session simply stopped working. Now, when a request
 * would pass COMPACT_TRIGGER_BYTES, the older part of the chat is summed up by
 * Brittney (POST /api/brittney/compact) and replaced by that summary. The person
 * still sees every message on screen; only what is sent to the model shrinks.
 *
 * The summary travels as the first two messages, a user turn that carries it and
 * a short assistant acknowledgement, so user and assistant turns still alternate.
 * A later compaction folds the earlier summary into the new one.
 */
import type { AssistantMessage } from './BrittneySession';

/** Compact once the whole request body would pass this many bytes (the cap is 32,000). */
export const COMPACT_TRIGGER_BYTES = 26_000;
/** After compacting, the recent messages kept verbatim fit in about this many bytes. */
export const COMPACT_KEEP_RECENT_BYTES = 12_000;
/** The summary Brittney writes is asked to stay under this many characters. */
export const SUMMARY_MAX_CHARS = 3_000;

export const SUMMARY_PREFIX = 'Summary of our conversation so far (older messages were summed up to save space):';
export const SUMMARY_ACK = 'Understood. I will continue from that summary.';

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** Bytes a message adds to the JSON request body. */
export function messageBytes(m: AssistantMessage): number {
  return byteLength(JSON.stringify(m)) + 1;
}

export function isSummaryMessage(m: AssistantMessage | undefined): boolean {
  return Boolean(m && m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(SUMMARY_PREFIX));
}

/** The two messages that carry a summary at the head of the history. */
export function summaryMessages(summary: string): AssistantMessage[] {
  return [
    { role: 'user', content: `${SUMMARY_PREFIX}\n${summary.trim()}` },
    { role: 'assistant', content: SUMMARY_ACK },
  ];
}

export interface CompactionPlan {
  /** Messages to sum up, oldest first (an earlier summary, if any, comes first). */
  older: AssistantMessage[];
  /** Messages kept verbatim; the first one is a user turn. */
  recent: AssistantMessage[];
}

/**
 * Decide whether a request needs compacting, and where to split.
 *
 * `otherBodyBytes` is the size of everything else in the request body (scene
 * context, ids). Returns null when the request fits. The split keeps the longest
 * run of recent messages that fits COMPACT_KEEP_RECENT_BYTES and starts on a user
 * turn; the latest message is always kept, even when it alone is larger.
 */
export function planCompaction(
  history: AssistantMessage[],
  otherBodyBytes: number,
  {
    triggerBytes = COMPACT_TRIGGER_BYTES,
    keepRecentBytes = COMPACT_KEEP_RECENT_BYTES,
  }: { triggerBytes?: number; keepRecentBytes?: number } = {}
): CompactionPlan | null {
  const total = otherBodyBytes + history.reduce((sum, m) => sum + messageBytes(m), 0);
  if (total <= triggerBytes || history.length < 3) return null;

  let start = history.length - 1;
  let kept = messageBytes(history[start]);
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const next = kept + messageBytes(history[i]);
    if (next > keepRecentBytes) break;
    kept = next;
    start = i;
  }
  // Start the kept run on a user turn, so turns still alternate after the summary pair.
  while (start < history.length - 1 && history[start].role !== 'user') start += 1;
  // Nothing to sum up: only an earlier summary lies before the kept run.
  if (start === 0 || (isSummaryMessage(history[0]) && start <= 2)) return null;
  return { older: history.slice(0, start), recent: history.slice(start) };
}

/** The text of an earlier summary at the head of the history, or ''. */
export function priorSummaryText(m: AssistantMessage | undefined): string {
  return m && isSummaryMessage(m) ? m.content.slice(SUMMARY_PREFIX.length).trim() : '';
}

/** What /api/brittney/compact asks the model to write. */
export function summaryPrompt(transcript: string): string {
  return [
    'You are Brittney, the builder assistant in HoloScript Studio. Below is the older part of a',
    'conversation with a person. Write a summary that lets you continue the conversation without it.',
    'Keep:',
    '- what the person is building and why;',
    '- decisions and preferences they stated;',
    '- the current state of their scene or code, with the exact names of objects, files and functions;',
    '- what was tried and did not work, and why, so it is not tried again;',
    '- open questions and next steps.',
    'If an earlier summary appears at the top, fold it in.',
    `Write plain sentences, with no preamble, in under ${SUMMARY_MAX_CHARS} characters.`,
    '',
    '---',
    transcript,
  ].join('\n');
}

/** The summary text: thinking removed, and held to the length the client budgets for. */
export function cleanSummary(raw: string): string {
  const text = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
  if (text.length <= SUMMARY_MAX_CHARS) return text;
  const cut = text.slice(0, SUMMARY_MAX_CHARS);
  const lastStop = cut.lastIndexOf('. ');
  return (lastStop > SUMMARY_MAX_CHARS / 2 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/** The history to send after a compaction. */
export function compactedHistory(summary: string, recent: AssistantMessage[]): AssistantMessage[] {
  return [...summaryMessages(summary), ...recent];
}

/**
 * When a summary cannot be written (Brittney's machine asleep, a network error),
 * the chat still goes on: the older part is left out, and the model is told so
 * plainly, rather than the request failing on the size cap.
 */
export function droppedHistory(older: AssistantMessage[], recent: AssistantMessage[]): AssistantMessage[] {
  const prior = priorSummaryText(older[0]);
  const dropped = older.length - (prior ? 2 : 0);
  const note = `${dropped} older messages could not be summed up and were left out. Ask the person if something from earlier matters.`;
  return compactedHistory(prior ? `${prior}\n\n${note}` : note, recent);
}
