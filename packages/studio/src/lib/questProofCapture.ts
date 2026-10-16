/**
 * Quest-proof headset capture: scoped capture token + confined data folder.
 *
 * Headsets (Quest Browser, usually through a HoloTunnel /t/<id>/ prefix) have no
 * Studio account, so capture cannot use a session. Instead the founder mints a
 * capture token for ONE runId (GET /api/quest-proof/token, founder-only) and
 * opens the headset link with `?runId=<id>&proofToken=<token>`. The pages
 * forward that token (header `x-quest-proof-token`, or `proofToken` in the GET
 * fallback query). The token is HMAC-SHA256 over the sanitised runId, so it
 * only admits writes for that run; there is nothing to store or expire.
 *
 * Secret: QUEST_PROOF_CAPTURE_SECRET, else NEXTAUTH_SECRET (already set wherever
 * sign-in works). With neither, every capture is refused (fail closed).
 *
 * Writes go under one data folder (questProofDataRoot), never the home folder.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Largest request body (POST) or query string (GET ?record=1) accepted, in bytes. */
export const QUEST_PROOF_MAX_BODY_BYTES = 16 * 1024;
/** A run's receipts file stops accepting lines past this size. */
export const QUEST_PROOF_MAX_RUN_FILE_BYTES = 2 * 1024 * 1024;

export function safeRunId(input: unknown): string {
  const value =
    typeof input === 'string' && input.trim()
      ? input.trim()
      : new Date().toISOString().slice(0, 10);
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96);
  // No name made only of dots ('.', '..') may become a path segment.
  if (!cleaned || /^\.+$/.test(cleaned)) return new Date().toISOString().slice(0, 10);
  return cleaned;
}

function captureSecret(): string {
  return process.env.QUEST_PROOF_CAPTURE_SECRET || process.env.NEXTAUTH_SECRET || '';
}

export function mintQuestProofToken(runId: string): string | null {
  const secret = captureSecret();
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`quest-proof-capture:v1:${safeRunId(runId)}`)
    .digest('base64url');
}

export function verifyQuestProofToken(runId: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length === 0 || token.length > 128) return false;
  const expected = mintQuestProofToken(runId);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), '../..');
}

/**
 * The single data folder for quest-proof writes. QUEST_PROOF_DATA_DIR if set,
 * otherwise the existing receipts location (<repo>/.bench-logs/format-stress).
 * Never derived from the home folder.
 */
export function questProofDataRoot(): string {
  return path.resolve(
    process.env.QUEST_PROOF_DATA_DIR || path.join(repoRoot(), '.bench-logs', 'format-stress')
  );
}

/** <root>/<runId>/quest-proof[/...rest], refused if it would leave the root. */
export function questProofRunDir(runId: string, ...rest: string[]): string {
  const root = questProofDataRoot();
  const dir = path.resolve(root, safeRunId(runId), 'quest-proof', ...rest);
  if (!dir.startsWith(root + path.sep)) {
    throw new Error('quest-proof path escapes the data folder');
  }
  return dir;
}
