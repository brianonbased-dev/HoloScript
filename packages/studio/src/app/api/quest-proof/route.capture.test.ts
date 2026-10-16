/**
 * /api/quest-proof headset capture: per-run capture token, 16 KB cap, writes
 * confined to the quest-proof data folder, no server paths in responses.
 * QUEST_PROOF_DATA_DIR points at a temp dir; nothing else on disk is touched.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-root-'));
const SECRET = 'test-capture-secret';

import { POST, GET } from './route';
import { mintQuestProofToken } from '@/lib/questProofCapture';

function listAll(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join((e as unknown as { parentPath?: string; path?: string }).parentPath ?? (e as unknown as { path: string }).path, e.name));
}

const post = (body: unknown, token?: string | null, raw?: string) =>
  new NextRequest('https://studio.test/api/quest-proof', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-quest-proof-token': token } : {}),
    },
    body: raw ?? JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv('QUEST_PROOF_DATA_DIR', ROOT);
  vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', SECRET);
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe('quest-proof capture', () => {
  it('anonymous (no token) POST is 401 and writes nothing', async () => {
    const res = await POST(post({ runId: 'run-a', label: 'x' }));
    expect(res.status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('a token for another run, or a garbage token, is 401 and writes nothing', async () => {
    const other = mintQuestProofToken('run-b')!;
    expect((await POST(post({ runId: 'run-a' }, other))).status).toBe(401);
    expect((await POST(post({ runId: 'run-a' }, 'nope'))).status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('GET ?record=1 without a token is 401, and reading receipts needs the token too', async () => {
    const rec = new NextRequest('https://studio.test/api/quest-proof?record=1&runId=run-a&label=x');
    expect((await GET(rec)).status).toBe(401);
    const read = new NextRequest('https://studio.test/api/quest-proof?runId=run-a');
    expect((await GET(read)).status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('an oversize body is 413 and writes nothing, even with a valid token', async () => {
    const token = mintQuestProofToken('run-a')!;
    const big = JSON.stringify({ runId: 'run-a', detail: 'x'.repeat(20_000) });
    const res = await POST(post(null, token, big));
    expect(res.status).toBe(413);
    expect(listAll(ROOT)).toEqual([]);
  });

  it('a traversal runId is confined to the data folder', async () => {
    const runId = '../../../etc/evil';
    const token = mintQuestProofToken(runId)!;
    const res = await POST(post({ runId, label: 'x' }, token));
    expect(res.status).toBe(200);
    const files = listAll(ROOT);
    expect(files.length).toBe(1);
    expect(path.resolve(files[0]).startsWith(path.resolve(ROOT) + path.sep)).toBe(true);
  });

  it('happy path: valid token writes one receipt under the data folder, no server path returned', async () => {
    const token = mintQuestProofToken('2026-10-16-quest-proof')!;
    const res = await POST(
      post({ runId: '2026-10-16-quest-proof', pageId: 'quest-probe', label: 'XR ok', status: 'OK' }, token)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.path).toBeUndefined();
    const files = listAll(ROOT);
    expect(files).toEqual([path.join(ROOT, '2026-10-16-quest-proof', 'quest-proof', 'receipts.jsonl')]);

    const read = new NextRequest(
      `https://studio.test/api/quest-proof?runId=2026-10-16-quest-proof&proofToken=${encodeURIComponent(token)}`
    );
    const readBody = await (await GET(read)).json();
    expect(readBody.count).toBe(1);
    expect(readBody.path).toBeUndefined();
  });

  it('GET ?record=1 fallback with the token in the query writes', async () => {
    const token = mintQuestProofToken('run-g')!;
    const res = await GET(
      new NextRequest(
        `https://studio.test/api/quest-proof?record=1&runId=run-g&label=x&proofToken=${encodeURIComponent(token)}`
      )
    );
    expect(res.status).toBe(200);
    expect(listAll(ROOT).length).toBe(1);
  });

  it('with no capture secret configured every capture is refused', async () => {
    vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    const res = await POST(post({ runId: 'run-a' }, 'anything'));
    expect(res.status).toBe(401);
    expect(listAll(ROOT)).toEqual([]);
  });
});
