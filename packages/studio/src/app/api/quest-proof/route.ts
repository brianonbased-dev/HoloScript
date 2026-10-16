import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { resolveCorsOrigin } from '../_lib/cors';
import {
  isAllowedCaptureOrigin,
  QUEST_PROOF_MAX_BODY_BYTES,
  QUEST_PROOF_MAX_RUN_FILE_BYTES,
  questProofRunDir,
  safeRunId,
  verifyQuestProofToken,
} from '@/lib/questProofCapture';

export const runtime = 'nodejs';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface QuestProofReceipt {
  schema: 'holoscript.quest-proof.v1';
  receivedAt: string;
  runId: string;
  pageId: string;
  url: string | null;
  status: 'OK' | 'WARN' | 'FAIL' | 'INFO';
  label: string;
  detail: string;
  userAgent: string | null;
  viewport: JsonValue | null;
  xr: JsonValue | null;
  checks: JsonValue | null;
}

/**
 * /api/quest-proof: headset proof capture. Receipts are recorded by POST only
 * (GET ?record=1 is refused); the token travels in the x-quest-proof-token header.
 *
 * Every call needs the run's capture token (see lib/questProofCapture.ts). POST
 * also needs an allowed Origin. Bodies are capped at 16 KB while streaming, writes
 * go only under the quest-proof data folder, and responses name no server paths.
 */

function shortString(input: unknown, fallback: string, max = 4000): string {
  if (typeof input !== 'string') return fallback;
  return input.slice(0, max);
}

function asObject(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function asJsonValue(input: unknown): JsonValue | null {
  if (input === null) return null;
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
    return input;
  if (Array.isArray(input)) return input.map(asJsonValue).filter((v): v is JsonValue => v !== null);
  if (typeof input === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(input)) {
      const json = asJsonValue(value);
      if (json !== null) out[key] = json;
    }
    return out;
  }
  return null;
}

function receiptsFile(runId: string): string {
  return path.join(questProofRunDir(runId), 'receipts.jsonl');
}

async function appendReceipt(receipt: QuestProofReceipt): Promise<'ok' | 'full'> {
  const file = receiptsFile(receipt.runId);
  await mkdir(path.dirname(file), { recursive: true });
  const size = await stat(file).then((s) => s.size, () => 0);
  if (size >= QUEST_PROOF_MAX_RUN_FILE_BYTES) return 'full';
  await appendFile(file, `${JSON.stringify(receipt)}\n`, 'utf8');
  return 'ok';
}

async function readReceipts(runId: string): Promise<QuestProofReceipt[]> {
  try {
    const text = await readFile(receiptsFile(runId), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .slice(-100)
      .map((line) => JSON.parse(line) as QuestProofReceipt);
  } catch {
    return [];
  }
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: 'A valid quest-proof capture token for this runId is required' },
    { status: 401 }
  );
}

function tooLarge() {
  return NextResponse.json({ ok: false, error: 'Capture payload too large' }, { status: 413 });
}

function runFull() {
  return NextResponse.json({ ok: false, error: 'This run has reached its receipt limit' }, { status: 507 });
}

function tokenFrom(req: NextRequest): string | null {
  return (
    // Header only. A ?proofToken= query is ignored, so tokens never sit in URLs,
    // proxy logs or receipts.
    req.headers.get('x-quest-proof-token') ?? null
  );
}

/**
 * Studio's own origin, from configuration only (NEXTAUTH_URL, else
 * NEXT_PUBLIC_STUDIO_URL). Never from Host or X-Forwarded-Host, which a caller
 * can set. Unconfigured: null, and only the CORS allowlist applies.
 */
function ownOrigin(): string | null {
  for (const v of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_STUDIO_URL]) {
    if (!v) continue;
    try {
      return new URL(v).origin;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Read at most `max` bytes, counting as the stream arrives. Content-Length is
 * ignored. Cancels the stream and returns null as soon as the limit is passed.
 */
async function readBodyCapped(req: NextRequest, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * POST /api/quest-proof?runId=<run>: record one headset receipt.
 * Order: Origin check, then the run's token (header or query) against the runId
 * in the query, and only then the body, streamed with a 16 KB cap.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedCaptureOrigin(req, ownOrigin(), resolveCorsOrigin)) {
    return NextResponse.json({ ok: false, error: 'Origin not allowed' }, { status: 403 });
  }
  const runId = safeRunId(req.nextUrl.searchParams.get('runId'));
  if (!req.nextUrl.searchParams.get('runId') || !verifyQuestProofToken(runId, tokenFrom(req))) {
    return unauthorized();
  }
  const text = await readBodyCapped(req, QUEST_PROOF_MAX_BODY_BYTES).catch(() => null);
  if (text === null) return tooLarge();

  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const raw = asObject(parsed);
  if (raw.runId !== undefined && safeRunId(raw.runId) !== runId) return unauthorized();

  const receipt: QuestProofReceipt = {
    schema: 'holoscript.quest-proof.v1',
    receivedAt: new Date().toISOString(),
    runId,
    pageId: shortString(raw.pageId, 'unknown-page', 160),
    url: typeof raw.url === 'string' ? raw.url.slice(0, 2000) : null,
    status:
      raw.status === 'OK' || raw.status === 'WARN' || raw.status === 'FAIL' ? raw.status : 'INFO',
    label: shortString(raw.label, 'headset observation', 300),
    detail: shortString(raw.detail, '', 4000),
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent.slice(0, 1000) : null,
    viewport: asJsonValue(raw.viewport),
    xr: asJsonValue(raw.xr),
    checks: asJsonValue(raw.checks),
  };

  if ((await appendReceipt(receipt)) === 'full') return runFull();
  return NextResponse.json({ ok: true, runId, receipt });
}

/**
 * GET /api/quest-proof?runId=<run> with x-quest-proof-token: read the run's receipts.
 * GET never writes: ?record=1 is refused (receipts are POST-only).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get('record') === '1') {
    return NextResponse.json(
      { ok: false, error: 'Recording is POST-only' },
      { status: 405, headers: { Allow: 'POST' } }
    );
  }
  const runId = safeRunId(params.get('runId'));
  if (!verifyQuestProofToken(runId, tokenFrom(req))) return unauthorized();
  const receipts = await readReceipts(runId);
  return NextResponse.json({ ok: true, runId, count: receipts.length, receipts });
}
