/**
 * Quest-proof headset capture: scoped, expiring capture token + confined data folder.
 *
 * Headsets (Quest Browser, usually through a HoloTunnel /t/<id>/ prefix) have no
 * Studio account, so capture cannot use a session. The founder mints a token for
 * ONE runId (GET /api/quest-proof/token, founder-only) and opens the headset link
 * with `?runId=<id>&proofToken=<token>`. The pages POST receipts with the token in
 * the `x-quest-proof-token` header and the runId in `?runId=`.
 *
 * Token: `<exp>.<HMAC-SHA256(key, "quest-proof-capture:v2:<runId>:<exp>")>`.
 * Key: HKDF-SHA256 from NEXTAUTH_SECRET with info 'quest-proof-capture-v1'; the
 * raw secret is never used as a key. No NEXTAUTH_SECRET: every capture is refused.
 *
 * Writes go under one data folder (questProofDataRoot), never the home folder.
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Largest request body accepted, in bytes (counted while streaming). */
export const QUEST_PROOF_MAX_BODY_BYTES = 16 * 1024;
/** Capture tokens expire. Default lifetime and the most a founder may ask for, in seconds. */
export const QUEST_PROOF_TOKEN_DEFAULT_TTL_S = 4 * 60 * 60;
export const QUEST_PROOF_TOKEN_MAX_TTL_S = 24 * 60 * 60;
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

function captureKey(): Buffer | null {
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) return null;
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'quest-proof-capture-v1', 32)
  );
}

function mac(key: Buffer, runId: string, exp: number): string {
  return createHmac('sha256', key)
    .update(`quest-proof-capture:v2:${safeRunId(runId)}:${exp}`)
    .digest('base64url');
}

/**
 * Token format: `<exp>.<mac>`, exp in unix seconds. The MAC covers the runId and
 * exp, so neither can be changed. Tokens without an exp (the old v1 format) are
 * no longer accepted: reissue the link.
 */
export function mintQuestProofToken(
  runId: string,
  opts: { ttlSeconds?: number; nowMs?: number } = {}
): string | null {
  const key = captureKey();
  if (!key) return null;
  const ttl = Math.min(
    Math.max(Math.floor(opts.ttlSeconds ?? QUEST_PROOF_TOKEN_DEFAULT_TTL_S), 60),
    QUEST_PROOF_TOKEN_MAX_TTL_S
  );
  const exp = Math.floor((opts.nowMs ?? Date.now()) / 1000) + ttl;
  return `${exp}.${mac(key, runId, exp)}`;
}

export function questProofTokenExp(token: string): number | null {
  const m = /^(\d{9,11})\./.exec(token);
  return m ? Number(m[1]) : null;
}

export function verifyQuestProofToken(runId: string, token: unknown, nowMs = Date.now()): boolean {
  if (typeof token !== 'string' || token.length === 0 || token.length > 128) return false;
  const key = captureKey();
  if (!key) return false;
  const m = /^(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  const now = Math.floor(nowMs / 1000);
  if (now > exp) return false;
  if (exp - now > QUEST_PROOF_TOKEN_MAX_TTL_S) return false;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(mac(key, runId, exp));
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

/**
 * Capture POSTs must come from a browser page we serve: the request's own origin
 * (which covers the HoloTunnel /t/<id>/ and /live/ path prefixes), or an origin on
 * the Studio CORS allowlist (holoscript.studio, holoscript.net and its subdomains).
 * No Origin header is refused.
 */
export function isAllowedCaptureOrigin(
  req: Request,
  ownOrigin: string,
  allowlisted: (req: Request) => string | null
): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  if (origin === ownOrigin) return true;
  return allowlisted(req) === origin;
}
