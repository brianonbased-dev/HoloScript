import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

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

function safeRunId(input: unknown): string {
  const value =
    typeof input === 'string' && input.trim()
      ? input.trim()
      : new Date().toISOString().slice(0, 10);
  return (
    value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96) || new Date().toISOString().slice(0, 10)
  );
}

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

function receiptDir(runId: string): string {
  return path.join(repoRoot(), '.bench-logs', 'format-stress', runId, 'quest-proof');
}

async function appendReceipt(receipt: QuestProofReceipt): Promise<string> {
  const dir = receiptDir(receipt.runId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'receipts.jsonl');
  await appendFile(file, `${JSON.stringify(receipt)}\n`, 'utf8');
  return file;
}

async function readReceipts(runId: string): Promise<QuestProofReceipt[]> {
  const file = path.join(receiptDir(runId), 'receipts.jsonl');
  try {
    const text = await readFile(file, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .slice(-100)
      .map((line) => JSON.parse(line) as QuestProofReceipt);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const raw = asObject(await req.json().catch(() => ({})));
  const runId = safeRunId(raw.runId);
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

  const file = await appendReceipt(receipt);

  return NextResponse.json({
    ok: true,
    runId,
    path: file,
    receipt,
  });
}

export async function GET(req: NextRequest) {
  const runId = safeRunId(req.nextUrl.searchParams.get('runId'));
  if (req.nextUrl.searchParams.get('record') === '1') {
    const receipt: QuestProofReceipt = {
      schema: 'holoscript.quest-proof.v1',
      receivedAt: new Date().toISOString(),
      runId,
      pageId: shortString(req.nextUrl.searchParams.get('pageId'), 'unknown-page', 160),
      url: req.nextUrl.searchParams.get('url')?.slice(0, 2000) ?? null,
      status:
        req.nextUrl.searchParams.get('status') === 'OK' ||
        req.nextUrl.searchParams.get('status') === 'WARN' ||
        req.nextUrl.searchParams.get('status') === 'FAIL'
          ? (req.nextUrl.searchParams.get('status') as 'OK' | 'WARN' | 'FAIL')
          : 'INFO',
      label: shortString(req.nextUrl.searchParams.get('label'), 'headset observation', 300),
      detail: shortString(req.nextUrl.searchParams.get('detail'), '', 4000),
      userAgent: req.nextUrl.searchParams.get('userAgent')?.slice(0, 1000) ?? null,
      viewport: null,
      xr: null,
      checks: { transport: 'get-fallback' },
    };
    const file = await appendReceipt(receipt);
    return NextResponse.json({ ok: true, runId, path: file, receipt });
  }
  const receipts = await readReceipts(runId);
  return NextResponse.json({
    ok: true,
    runId,
    count: receipts.length,
    path: path.join(receiptDir(runId), 'receipts.jsonl'),
    receipts,
  });
}
