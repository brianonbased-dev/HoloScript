/**
 * /task: script output is capped while it runs, a runaway script is killed,
 * and the response carries no server path (#607 follow-up d).
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ spawn: vi.fn(), kill: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireFounder: async () => ({ user: { id: 'founder' } }) }));
vi.mock('node:child_process', () => ({ spawn: h.spawn, default: { spawn: h.spawn } }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  default: { mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

import { POST } from './route';

function fakeChild(totalBytes: number) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (s?: string) => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let killed = false;
  child.kill = (s?: string) => {
    killed = true;
    h.kill(s);
    setImmediate(() => child.emit('close', null));
  };
  setImmediate(() => {
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    for (let sent = 0; sent < totalBytes && !killed; sent += chunk.length) {
      child.stdout.emit('data', chunk);
      child.stderr.emit('data', chunk);
    }
    if (!killed) child.emit('close', 0);
  });
  return child;
}

const post = () =>
  new NextRequest('https://studio.test/api/quest-proof/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: 'r1', message: 'Fix the thing. task_abc123 filed' }),
  });

afterEach(() => vi.resetAllMocks());

describe('quest-proof/task output caps', () => {
  it('kills a runaway script and keeps at most 8 KB of each stream', async () => {
    h.spawn.mockImplementation(() => fakeChild(8 * 1024 * 1024));
    const body = await (await POST(post())).json();
    expect(h.kill).toHaveBeenCalled();
    expect(body.stdout.length).toBeLessThanOrEqual(8 * 1024);
    expect(body.stderr.length).toBeLessThanOrEqual(8 * 1024);
  });

  it('returns no seedPath or absolute path', async () => {
    h.spawn.mockImplementation(() => fakeChild(1024));
    const body = await (await POST(post())).json();
    expect(body.seedPath).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/[A-Za-z]:\\\\|\/(home|root|tmp|Users)\//);
  });
});
