/**
 * #607 follow-ups on /api/quest-proof: expired tokens, no-token refusal before
 * any body read, and a streaming cap for bodies with no Content-Length.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { mintQuestProofToken } from '@/lib/questProofCapture';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qpf-root-'));

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

function streamingPost(stream: ReadableStream<Uint8Array>, token?: string) {
  return new NextRequest('https://studio.test/api/quest-proof?runId=run-s', {
    method: 'POST',
    headers: token ? { 'x-quest-proof-token': token } : {},
    body: stream,
    // @ts-expect-error undici needs duplex for streamed bodies
    duplex: 'half',
  });
}

beforeEach(() => {
  vi.stubEnv('QUEST_PROOF_DATA_DIR', ROOT);
  vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', 'test-capture-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe('quest-proof capture follow-ups', () => {
  it('no token: 401 before any body bytes are pulled', async () => {
    const s = countingStream(100, 1024);
    const res = await POST(streamingPost(s.stream));
    expect(res.status).toBe(401);
    expect(s.pulled()).toBeLessThanOrEqual(1);
  });

  it('chunked body with no Content-Length over 16 KB: 413 and the stream is not read to the end', async () => {
    const s = countingStream(1000, 1024); // ~1 MB if fully read
    const res = await POST(streamingPost(s.stream, 'x'.repeat(20)));
    expect(res.status).toBe(413);
    expect(s.pulled()).toBeLessThan(40);
  });

  it('an expired token is 401 and writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const token = mintQuestProofToken('run-e')!;
    vi.setSystemTime(new Date('2026-10-16T17:00:00Z'));
    const res = await POST(
      new NextRequest('https://studio.test/api/quest-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-quest-proof-token': token },
        body: JSON.stringify({ runId: 'run-e', label: 'x' }),
      })
    );
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(ROOT, 'run-e'))).toBe(false);
  });
});
