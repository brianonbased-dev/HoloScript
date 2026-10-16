/**
 * F1: the token is checked before the body; the body is streamed with a 16 KB
 * cap that ignores Content-Length. Expired tokens are refused.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { mintQuestProofToken } from '@/lib/questProofCapture';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qpf-root-'));
const STUDIO = 'https://holoscript.studio';

function countingStream(chunks: number, size: number) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks) return controller.close();
      pulled += 1;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return { stream, pulled: () => pulled };
}

function streamingPost(stream: ReadableStream<Uint8Array>, token?: string, contentLength?: string) {
  const headers: Record<string, string> = { origin: STUDIO, host: 'holoscript.studio', 'x-forwarded-proto': 'https' };
  if (token) headers['x-quest-proof-token'] = token;
  if (contentLength) headers['content-length'] = contentLength;
  return new NextRequest(`${STUDIO}/api/quest-proof?runId=run-s`, {
    method: 'POST',
    headers,
    body: stream,
    // @ts-expect-error undici needs duplex for streamed bodies
    duplex: 'half',
  });
}

beforeEach(() => {
  vi.stubEnv('QUEST_PROOF_DATA_DIR', ROOT);
  vi.stubEnv('NEXTAUTH_SECRET', 'test-nextauth-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe('F1: token first, then streamed body', () => {
  it('no token: 401 before any body bytes are pulled', async () => {
    const s = countingStream(100, 1024);
    expect((await POST(streamingPost(s.stream))).status).toBe(401);
    expect(s.pulled()).toBeLessThanOrEqual(1);
  });

  it('a WRONG token: 401 before any body bytes are pulled', async () => {
    const s = countingStream(100, 1024);
    expect((await POST(streamingPost(s.stream, 'x'.repeat(20)))).status).toBe(401);
    expect(s.pulled()).toBeLessThanOrEqual(1);
  });

  it('valid token, chunked body over 16 KB with no Content-Length: 413 and the stream is not read to the end', async () => {
    const s = countingStream(1000, 1024);
    const res = await POST(streamingPost(s.stream, mintQuestProofToken('run-s')!));
    expect(res.status).toBe(413);
    expect(s.pulled()).toBeLessThan(40);
  });

  it('valid token, a small Content-Length that lies about a big body: still 413', async () => {
    const s = countingStream(1000, 1024);
    const res = await POST(streamingPost(s.stream, mintQuestProofToken('run-s')!, '10'));
    expect(res.status).toBe(413);
    expect(s.pulled()).toBeLessThan(40);
  });

  it('an expired token is 401 and writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const token = mintQuestProofToken('run-e')!;
    vi.setSystemTime(new Date('2026-10-16T17:00:00Z'));
    const res = await POST(
      new NextRequest(`${STUDIO}/api/quest-proof?runId=run-e`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-quest-proof-token': token, origin: STUDIO, host: 'holoscript.studio', 'x-forwarded-proto': 'https' },
        body: JSON.stringify({ label: 'x' }),
      })
    );
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(ROOT, 'run-e'))).toBe(false);
  });
});
