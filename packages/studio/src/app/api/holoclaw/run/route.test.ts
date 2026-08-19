/**
 * Functional coverage for POST/GET/DELETE /api/holoclaw/run — the main
 * success/failure paths, complementing the dedicated security regression
 * suite in ../sec-t05-holoclaw-run-path-traversal.test.ts (which owns the
 * path-traversal / auth-gate guarantees and should not be duplicated here).
 */
import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuthMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawn: spawnMock }));

type FakeChild = EventEmitter & {
  pid: number | undefined;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function makeFakeChild(pid: number | undefined = 4242): FakeChild {
  const proc = new EventEmitter() as FakeChild;
  proc.pid = pid;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

let tempRoot: string;
let savedRepoRoot: string | undefined;
let savedFleetRegister: string | undefined;
let POST: typeof import('./route').POST;
let GET: typeof import('./route').GET;
let DELETE: typeof import('./route').DELETE;

function jsonRequest(method: 'POST' | 'DELETE', body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/holoclaw/run', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function writeSkill(dir: string, fileName: string, content = 'composition "Fixture" {}'): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), content, 'utf-8');
}

beforeEach(async () => {
  vi.resetModules();
  requireAuthMock.mockReset();
  requireAuthMock.mockResolvedValue({ user: { id: 'run-route-test-user' } });
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => makeFakeChild());

  savedRepoRoot = process.env.HOLOSCRIPT_REPO_ROOT;
  savedFleetRegister = process.env.HOLOCLAW_FLEET_REGISTER;
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoclaw-run-route-test-'));
  process.env.HOLOSCRIPT_REPO_ROOT = tempRoot;
  process.env.HOLOCLAW_FLEET_REGISTER = 'false';

  writeSkill(path.join(tempRoot, 'compositions', 'skills'), 'demo.hsplus');

  const mod = await import('./route');
  POST = mod.POST;
  GET = mod.GET;
  DELETE = mod.DELETE;
});

afterEach(() => {
  if (savedRepoRoot === undefined) delete process.env.HOLOSCRIPT_REPO_ROOT;
  else process.env.HOLOSCRIPT_REPO_ROOT = savedRepoRoot;
  if (savedFleetRegister === undefined) delete process.env.HOLOCLAW_FLEET_REGISTER;
  else process.env.HOLOCLAW_FLEET_REGISTER = savedFleetRegister;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('GET /api/holoclaw/run — list running skills', () => {
  it('returns an empty list when nothing is running', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ running: [], count: 0 });
  });

  it('lists a skill spawned by a prior POST, including its embodiment card', async () => {
    await POST(jsonRequest('POST', { name: 'demo' }));
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.running[0]).toMatchObject({ name: 'demo', skillPath: path.join('compositions', 'skills', 'demo.hsplus') });
    expect(body.running[0].embodiment).toMatchObject({ skill: 'demo', status: 'running' });
    expect(typeof body.running[0].pid).toBe('number');
  });
});

describe('POST /api/holoclaw/run — start a skill daemon', () => {
  it('finds the skill under compositions/skills/ and spawns the real `daemon` subcommand with the expected argv', async () => {
    // Regression coverage for research/2026-08-19_holoclaw-composition-design.md §2.2:
    // this route previously spawned the literal string 'holodaemon', a subcommand
    // that has never existed in packages/cli (confirmed by grep and by running it —
    // "[E000] Unknown subcommand: holodaemon"). This test used to pin that broken
    // string as the *expected* argv, which meant it passed against broken code —
    // exactly the false-green shape the fix corrects. It now asserts the real
    // subcommand, 'daemon' (packages/cli/src/cli.ts:4597, case 'daemon'). Note this
    // only proves the route spawns the right subcommand; it does NOT prove the
    // spawned skill runs successfully — every compositions/skills/*.hsplus file
    // still fails to parse under holoscript-runner.js's strict parser (HSP101,
    // typed-inline state dialect) — a separate, still-open gap tracked on the board.
    const res = await POST(jsonRequest('POST', { name: 'demo', cycles: 3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.started).toBe(true);
    expect(body.cycles).toBe(3);
    expect(body.alwaysOn).toBe(false);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('npx');
    expect(args).toEqual([
      'tsx',
      'packages/cli/src/cli.ts',
      'daemon',
      path.join(tempRoot, 'compositions', 'skills', 'demo.hsplus'),
      '--cycles',
      '3',
    ]);
  });

  it('defaults cycles to 5 when not provided', async () => {
    const res = await POST(jsonRequest('POST', { name: 'demo' }));
    const body = await res.json();
    expect(body.cycles).toBe(5);
  });

  it('appends --always-on when alwaysOn is true', async () => {
    await POST(jsonRequest('POST', { name: 'demo', alwaysOn: true }));
    const [, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(args).toContain('--always-on');
  });

  it('does not fall back to a same-named composition outside compositions/skills/', async () => {
    // compositions/ holds ~30 non-skill infrastructure compositions (brains,
    // daemons, dashboards) never meant to be reachable through the marketplace
    // `name` slug — e.g. compositions/holoclaw.hsplus, an experimental
    // always-on MVP agent unrelated to the installed-skills marketplace. A
    // same-named file placed there (not under compositions/skills/) must be
    // invisible to this route, even though its `name` alone passes the
    // SKILL_NAME_RE slug check. Regression coverage for the fallback-path
    // removal referenced by the route.ts comment above SKILLS_ROOT.
    writeSkill(tempRoot + '/compositions', 'holoclaw.hsplus');
    const res = await POST(jsonRequest('POST', { name: 'holoclaw' }));
    expect(res.status).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 404 with the searched path (compositions/skills/ only) when no matching skill file exists', async () => {
    const res = await POST(jsonRequest('POST', { name: 'ghost' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Skill not found: ghost/);
    expect(body.searched).toEqual([path.join('compositions', 'skills', 'ghost.hsplus')]);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the skill is already running', async () => {
    const first = await POST(jsonRequest('POST', { name: 'demo' }));
    expect(first.status).toBe(200);

    const second = await POST(jsonRequest('POST', { name: 'demo' }));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe('Skill already running');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the spawned process has no pid', async () => {
    // Passing `undefined` as the pid argument would just re-trigger the
    // default parameter, so clear it explicitly after construction instead.
    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild();
      child.pid = undefined;
      return child;
    });
    const res = await POST(jsonRequest('POST', { name: 'demo' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to spawn daemon process/i);
  });

  it('embodies the launched agent (non-headless): response carries an embodiment card', async () => {
    const res = await POST(jsonRequest('POST', { name: 'demo' }));
    const body = await res.json();
    expect(body.embodiment).toMatchObject({
      skill: 'demo',
      status: 'running',
      handle: 'holoclaw-demo',
    });
    expect(body.embodiment.avatarHolo).toContain('composition "HoloClaw — demo"');
  });

  it('cleans up (running-skills map, lock file, exit outbox entry) when the child process exits', async () => {
    await POST(jsonRequest('POST', { name: 'demo' }));
    const child = spawnMock.mock.results[0]?.value as FakeChild;

    child.emit('exit', 0);

    const listRes = await GET();
    const listBody = await listRes.json();
    expect(listBody.count).toBe(0);

    const outbox = fs.readFileSync(path.join(tempRoot, '.holoscript', 'outbox.jsonl'), 'utf-8');
    expect(outbox).toContain('Exited with code 0');
  });
});

describe('DELETE /api/holoclaw/run — stop a running skill', () => {
  it('requires a name', async () => {
    const res = await DELETE(jsonRequest('DELETE', {}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the named skill is not running', async () => {
    const res = await DELETE(jsonRequest('DELETE', { name: 'demo' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Skill not running: demo');
  });

  it('kills the running process and removes it from the running list', async () => {
    await POST(jsonRequest('POST', { name: 'demo' }));
    const child = spawnMock.mock.results[0]?.value as FakeChild;

    const res = await DELETE(jsonRequest('DELETE', { name: 'demo' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stopped).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    const listRes = await GET();
    const listBody = await listRes.json();
    expect(listBody.count).toBe(0);
  });
});
