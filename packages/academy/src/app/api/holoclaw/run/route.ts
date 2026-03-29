import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Running skill processes — tracked in memory + lock file
// ---------------------------------------------------------------------------

interface RunningSkill {
  name: string;
  pid: number;
  startedAt: string;
  skillPath: string;
  process: ChildProcess;
}

const runningSkills: Map<string, RunningSkill> = new Map(); // name → process

const REPO_ROOT = process.env.HOLOSCRIPT_REPO_ROOT || process.cwd();
const STATE_DIR = path.join(REPO_ROOT, '.holoscript');

function getLockPath(name: string): string {
  return path.join(STATE_DIR, `skill-${name}.lock`);
}

function writeLock(name: string, pid: number): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getLockPath(name), JSON.stringify({ pid, name, startedAt: new Date().toISOString() }), 'utf-8');
}

function removeLock(name: string): void {
  try { fs.unlinkSync(getLockPath(name)); } catch { /* already gone */ }
}

// ---------------------------------------------------------------------------
// POST /api/holoclaw/run — start a skill daemon
// Body: { name: string, cycles?: number, alwaysOn?: boolean }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; cycles?: number; alwaysOn?: boolean };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Check if already running
  if (runningSkills.has(name)) {
    const running = runningSkills.get(name)!;
    return NextResponse.json({
      error: 'Skill already running',
      name,
      pid: running.pid,
      startedAt: running.startedAt,
    }, { status: 409 });
  }

  // Find the skill file
  const searchPaths = [
    path.join(REPO_ROOT, 'compositions', 'skills', `${name}.hsplus`),
    path.join(REPO_ROOT, 'compositions', `${name}.hsplus`),
  ];

  const skillPath = searchPaths.find(p => fs.existsSync(p));
  if (!skillPath) {
    return NextResponse.json({
      error: `Skill not found: ${name}`,
      searched: searchPaths.map(p => path.relative(REPO_ROOT, p)),
    }, { status: 404 });
  }

  // Spawn daemon process
  const cycles = body.cycles || 5;
  const alwaysOn = body.alwaysOn || false;
  const args = [
    'tsx', 'packages/cli/src/cli.ts', 'holodaemon', skillPath,
    '--cycles', String(cycles),
  ];
  if (alwaysOn) args.push('--always-on');

  const child = spawn('npx', args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  if (!child.pid) {
    return NextResponse.json({ error: 'Failed to spawn daemon process' }, { status: 500 });
  }

  const entry: RunningSkill = {
    name,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    skillPath: path.relative(REPO_ROOT, skillPath),
    process: child,
  };

  runningSkills.set(name, entry);
  writeLock(name, child.pid);

  // Append stdout/stderr to outbox for activity feed
  const outboxPath = path.join(STATE_DIR, 'outbox.jsonl');
  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      const entry = JSON.stringify({ timestamp: new Date().toISOString(), channel: `skill:${name}`, message: line }) + '\n';
      fs.appendFileSync(outboxPath, entry);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      const entry = JSON.stringify({ timestamp: new Date().toISOString(), channel: `skill:${name}:error`, message: line }) + '\n';
      fs.appendFileSync(outboxPath, entry);
    }
  });

  // Cleanup on exit
  child.on('exit', (code) => {
    runningSkills.delete(name);
    removeLock(name);
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), channel: `skill:${name}`, message: `Exited with code ${code}` }) + '\n';
    fs.appendFileSync(outboxPath, entry);
  });

  return NextResponse.json({
    started: true,
    name,
    pid: child.pid,
    skillPath: path.relative(REPO_ROOT, skillPath),
    cycles,
    alwaysOn,
  });
}

// ---------------------------------------------------------------------------
// GET /api/holoclaw/run — list running skills
// ---------------------------------------------------------------------------

export async function GET() {
  const skills = [...runningSkills.values()].map(s => ({
    name: s.name,
    pid: s.pid,
    startedAt: s.startedAt,
    skillPath: s.skillPath,
  }));

  return NextResponse.json({ running: skills, count: skills.length });
}

// ---------------------------------------------------------------------------
// DELETE /api/holoclaw/run — stop a running skill
// Body: { name: string }
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const entry = runningSkills.get(name);
  if (!entry) {
    return NextResponse.json({ error: `Skill not running: ${name}` }, { status: 404 });
  }

  // Kill the process
  try {
    entry.process.kill('SIGTERM');
    // Give it 3 seconds then force
    setTimeout(() => {
      try { entry.process.kill('SIGKILL'); } catch { /* already dead */ }
    }, 3000);
  } catch { /* already dead */ }

  runningSkills.delete(name);
  removeLock(name);

  return NextResponse.json({ stopped: true, name, pid: entry.pid });
}
