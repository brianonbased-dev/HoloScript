/**
 * /api/quest-proof headset capture (#607 + Release gate F1/F3):
 * Origin check, per-run expiring token checked before the body, streaming
 * 16 KB cap, POST-only recording, writes confined to the data folder.
 * QUEST_PROOF_DATA_DIR points at a temp dir; nothing else on disk is touched.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-root-'));
const STUDIO = 'https://holoscript.studio';

import { POST, GET } from './route';
import { mintQuestProofToken } from '@/lib/questProofCapture';

function listAll(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

function capture(
  runId: string,
  body: unknown,
  opts: { token?: string | null; origin?: string | null; prefix?: string; raw?: BodyInit } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', host: 'holoscript.studio', 'x-forwarded-proto': 'https' };
  if (opts.token) headers['x-quest-proof-token'] = opts.token;
  if (opts.origin !== null) headers.origin = opts.origin ?? STUDIO;
  return new NextRequest(`${STUDIO}${opts.prefix ?? ''}/api/quest-proof?runId=${encodeURIComponent(runId)}`, {
    method: 'POST',
    headers,
    body: opts.raw ?? JSON.stringify(body),
    // @ts-expect-error undici needs duplex for streamed bodies
    duplex: 'half',
  });
}

beforeEach(() => {
  vi.stubEnv('QUEST_PROOF_DATA_DIR', ROOT);
  vi.stubEnv('NEXTAUTH_SECRET', 'test-nextauth-secret');
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe('quest-proof capture', () => {
  it('anonymous (no token) POST is 401 and writes nothing', async () => {
    const res = await POST(capture('run-a', { label: 'x' }));
    expect(res.status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('a token for another run, or a garbage token, is 401 and writes nothing', async () => {
    expect((await POST(capture('run-a', {}, { token: mintQuestProofToken('run-b')! }))).status).toBe(401);
    expect((await POST(capture('run-a', {}, { token: 'nope' }))).status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('a body runId that differs from the token run is 401', async () => {
    const res = await POST(capture('run-a', { runId: 'run-b' }, { token: mintQuestProofToken('run-a')! }));
    expect(res.status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('F3: GET ?record=1 is refused (405) even with a valid token, and writes nothing', async () => {
    const token = mintQuestProofToken('run-a')!;
    const res = await GET(
      new NextRequest(`${STUDIO}/api/quest-proof?record=1&runId=run-a&label=x&proofToken=${encodeURIComponent(token)}`)
    );
    expect(res.status).toBe(405);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('reading receipts needs the token', async () => {
    expect((await GET(new NextRequest(`${STUDIO}/api/quest-proof?runId=run-a`))).status).toBe(401);
  });

  it('F3: missing, null or foreign Origin is 403 and writes nothing', async () => {
    const token = mintQuestProofToken('run-a')!;
    expect((await POST(capture('run-a', {}, { token, origin: null }))).status).toBe(403);
    expect((await POST(capture('run-a', {}, { token, origin: 'null' }))).status).toBe(403);
    expect((await POST(capture('run-a', {}, { token, origin: 'https://evil.example' }))).status).toBe(403);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('F3: HoloTunnel /t/<id>/ and /live/ pages (same origin) and *.holoscript.net can capture', async () => {
    const token = mintQuestProofToken('run-t')!;
    expect((await POST(capture('run-t', { label: 't' }, { token, prefix: '/t/abc123' }))).status).toBe(200);
    expect((await POST(capture('run-t', { label: 'l' }, { token, prefix: '/live' }))).status).toBe(200);
    expect((await POST(capture('run-t', { label: 'n' }, { token, origin: 'https://tunnel.holoscript.net' }))).status).toBe(200);
  });

  it('an oversize body is 413 and writes nothing, even with a valid token', async () => {
    const token = mintQuestProofToken('run-a')!;
    const big = JSON.stringify({ detail: 'x'.repeat(20_000) });
    const res = await POST(capture('run-a', null, { token, raw: big }));
    expect(res.status).toBe(413);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('a traversal runId is confined to the data folder', async () => {
    const runId = '../../../etc/evil';
    const res = await POST(capture(runId, { label: 'x' }, { token: mintQuestProofToken(runId)! }));
    expect(res.status).toBe(200);
    const files = listAll(ROOT);
    expect(files.length).toBe(1);
    expect(path.resolve(files[0]).startsWith(path.resolve(ROOT) + path.sep)).toBe(true);
  });

  it('happy path: headset-shaped POST writes one receipt, no server path, read-back works', async () => {
    const runId = '2026-10-16-quest-proof';
    const token = mintQuestProofToken(runId)!;
    const res = await POST(
      capture(runId, { runId, pageId: 'quest-probe', label: 'XR ok', status: 'OK', url: `${STUDIO}/quest-probe?runId=${runId}`, userAgent: 'Quest 3' }, { token })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.path).toBeUndefined();
    expect(listAll(ROOT)).toEqual([path.join(ROOT, runId, 'quest-proof', 'receipts.jsonl')]);
    const read = await (await GET(new NextRequest(`${STUDIO}/api/quest-proof?runId=${runId}&proofToken=${encodeURIComponent(token)}`))).json();
    expect(read.count).toBe(1);
    expect(read.path).toBeUndefined();
  });

  it('with no NEXTAUTH_SECRET every capture is refused', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', '');
    const res = await POST(capture('run-a', {}, { token: '9999999999.' + 'a'.repeat(43) }));
    expect(res.status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });
});
