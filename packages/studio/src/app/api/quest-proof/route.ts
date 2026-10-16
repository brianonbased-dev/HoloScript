import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
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
 * /api/quest-proof: headset proof capture (POST, or GET ?record=1 when POST
 * fails on the tunnel) and the run's receipt read-back (GET).
 *
 * Every call needs the run's capture token (see lib/questProofCapture.ts):
 * header `x-quest-proof-token` or query `proofToken`. No token or a wrong one is
 * 401 and nothing is written or read. Bodies over 16 KB are 413. Writes go only
 * under the quest-proof data folder, and responses no longer name server paths.
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
    req.headers.get('x-quest-proof-token') ?? req.nextUrl.searchParams.get('proofToken') ?? null
  );
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > QUEST_PROOF_MAX_BODY_BYTES) return tooLarge();
  const text = await req.text().catch(() => '');
  if (Buffer.byteLength(text, 'utf8') > QUEST_PROOF_MAX_BODY_BYTES) return tooLarge();

  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const raw = asObject(parsed);
  const runId = safeRunId(raw.runId);
  if (!verifyQuestProofToken(runId, tokenFrom(req))) return unauthorized();

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

export async function GET(req: NextRequest) {
  if (Buffer.byteLength(req.nextUrl.search, 'utf8') > QUEST_PROOF_MAX_BODY_BYTES) return tooLarge();
  const params = req.nextUrl.searchParams;
  const runId = safeRunId(params.get('runId'));
  if (!verifyQuestProofToken(runId, tokenFrom(req))) return unauthorized();

  if (params.get('record') === '1') {
    const status = params.get('status');
    const receipt: QuestProofReceipt = {
      schema: 'holoscript.quest-proof.v1',
      receivedAt: new Date().toISOString(),
      runId,
      pageId: shortString(params.get('pageId'), 'unknown-page', 160),
      url: params.get('url')?.slice(0, 2000) ?? null,
      status: status === 'OK' || status === 'WARN' || status === 'FAIL' ? status : 'INFO',
      label: shortString(params.get('label'), 'headset observation', 300),
      detail: shortString(params.get('detail'), '', 4000),
      userAgent: params.get('userAgent')?.slice(0, 1000) ?? null,
      viewport: null,
      xr: null,
      checks: { transport: 'get-fallback' },
    };
    if ((await appendReceipt(receipt)) === 'full') return runFull();
    return NextResponse.json({ ok: true, runId, receipt });
  }
  const receipts = await readReceipts(runId);
  return NextResponse.json({ ok: true, runId, count: receipts.length, receipts });
}
