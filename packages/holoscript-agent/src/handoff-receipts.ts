/**
 * Native hand-off receipts (2026-10-12): one append-only NDJSON line per native
 * board task this agent handles — the acceptance record for the local-first
 * measurement. Never rewritten or truncated; a write failure is reported to the
 * logger and never breaks the tick.
 *
 * Path: $HOLOSCRIPT_AGENT_HANDOFF_RECEIPTS, else
 *       $HOLOSCRIPT_AGENT_DATA_DIR/receipts/native-handoff.ndjson, else
 *       ~/.holoscript-agent/receipts/native-handoff.ndjson.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

export type HandoffResult = 'finished' | 'released' | 'release_failed' | 'failed';

export interface HandoffReceipt {
  schema: 'native-handoff-v1';
  task_id: string;
  task_title?: string;
  machine: string;
  agent: string;
  provider: string;
  model: string;
  claim_profile: string;
  n_ctx: number | null;
  lane: string;
  result: HandoffResult;
  /** Tick action (executed, no-artifact, reflect-escalate, errored, ...). */
  action: string;
  reason: string | null;
  claimed_at: string;
  ended_at: string;
  duration_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export function defaultHandoffReceiptPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HOLOSCRIPT_AGENT_HANDOFF_RECEIPTS) return env.HOLOSCRIPT_AGENT_HANDOFF_RECEIPTS;
  const base = env.HOLOSCRIPT_AGENT_DATA_DIR ?? join(homedir(), '.holoscript-agent');
  return join(base, 'receipts', 'native-handoff.ndjson');
}

export function machineName(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOLOSCRIPT_AGENT_MACHINE || hostname();
}

export class HandoffReceiptLog {
  constructor(
    readonly path: string | null,
    private readonly onError: (message: string) => void = () => undefined
  ) {}

  /** Append one receipt line. Returns false (and reports) on failure. */
  append(r: HandoffReceipt): boolean {
    if (!this.path) return false;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(r) + '\n', { encoding: 'utf8', flag: 'a' });
      return true;
    } catch (err) {
      this.onError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}
