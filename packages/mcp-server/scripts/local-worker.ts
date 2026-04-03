#!/usr/bin/env npx tsx
/**
 * HoloScript Scout — The team's always-on eyes.
 *
 * One job: see and report. Never create, never build, never claim done.
 *
 * What it does:
 *   1. Heartbeat — keeps the slot alive 24/7
 *   2. Scout — finds relevant files for open tasks, posts locations
 *   3. Audit — verifies done log commit hashes exist in git
 *   4. Watch — detects new commits related to open tasks
 *   5. Farm — derives tasks from docs when board < 20
 *
 * What it does NOT do:
 *   - Create board tasks from code scans
 *   - Mark tasks as done
 *   - Interpret data (no Ollama summaries on task work)
 *   - Respond to messages (wastes cycles)
 *
 * Usage:
 *   npx tsx packages/mcp-server/scripts/local-worker.ts
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──

const WORKER_NAME = 'gpu-worker';
const ROOM_ID = 'team_d141a6972eac1e9d';
const HOLOMESH_API = 'https://mcp.holoscript.net/api/holomesh';
const OLLAMA_URL = 'http://localhost:11434';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const HEARTBEAT_MS = 60_000;
const CYCLE_MS = 90_000;

let AGENT_KEY = '';
let AGENT_NAME = WORKER_NAME;

const memory = {
  cycleCount: 0,
  scoutedTaskIds: new Set<string>(),
  lastGitHash: '',
  lastAuditCycle: 0,
  lastFarmCycle: 0,
  derivedSources: new Set<string>(),
  todoScanned: false,
};

// ── HTTP ──

async function post(url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  return res.json() as Promise<any>;
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  return res.json() as Promise<any>;
}

function auth() { return { Authorization: `Bearer ${AGENT_KEY}` }; }

function shell(cmd: string): string {
  // Try git-bash first (available in IDE terminals), fall back to cmd
  const shells = ['C:\\Program Files\\Git\\bin\\bash.exe', 'bash', 'cmd'];
  for (const sh of shells) {
    try {
      return execSync(cmd, { encoding: 'utf8', timeout: 10_000, cwd: ROOT, shell: sh } as any).trim();
    } catch { continue; }
  }
  return '';
}

// ── Setup ──

async function ensureOllama(): Promise<boolean> {
  try { await get(`${OLLAMA_URL}/api/tags`); return true; } catch {
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 2000)); try { await get(`${OLLAMA_URL}/api/tags`); return true; } catch {} }
    return false;
  }
}

async function registerAgent(): Promise<boolean> {
  const keyFile = path.join(ROOT, '.local-worker-key');
  if (fs.existsSync(keyFile)) {
    const saved = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    AGENT_KEY = saved.key; AGENT_NAME = saved.name;
    return true;
  }
  const res = await post(`${HOLOMESH_API}/quickstart`, { name: WORKER_NAME, description: 'Scout — the team\'s always-on eyes', traits: ['@scout', '@local-gpu'] });
  const apiKey = res.api_key || res.agent?.api_key;
  if (apiKey) { AGENT_KEY = apiKey; AGENT_NAME = res.agent?.name || WORKER_NAME; fs.writeFileSync(keyFile, JSON.stringify({ key: AGENT_KEY, name: AGENT_NAME })); return true; }
  if (res.error?.includes('already registered')) { console.error(`[scout] Name taken. Delete ${keyFile} and restart.`); return false; }
  return false;
}

async function joinTeam() { await post(`${HOLOMESH_API}/team/${ROOM_ID}/join`, { invite_code: 'CvRxho-8', ide_type: 'ollama' }, auth()).catch(() => {}); }
async function heartbeat() { await post(`${HOLOMESH_API}/team/${ROOM_ID}/presence`, { ide_type: 'ollama', status: 'active', project_path: ROOT }, auth()).catch(() => {}); }
async function msg(content: string) { await post(`${HOLOMESH_API}/team/${ROOM_ID}/message`, { type: 'text', content }, auth()).catch(() => {}); }
async function knowledge(type: string, content: string, domain: string, tags: string[]) { await post(`${HOLOMESH_API}/team/${ROOM_ID}/knowledge`, { entries: [{ type, content, domain, tags: [...tags, 'scout'], confidence: 0.8 }] }, auth()).catch(() => {}); }

// ── 1. SCOUT — find files for open tasks ──

async function scoutTasks() {
  const board = await get(`${HOLOMESH_API}/team/${ROOM_ID}/board`, auth()).catch(() => ({ board: {} }));
  const open = ((board?.board?.open || []) as any[]).filter((t: any) =>
    !t.title?.startsWith('[report]') &&
    !t.title?.startsWith('FIXME:') &&
    !memory.scoutedTaskIds.has(t.id) &&
    t.priority >= 2
  );

  if (open.length === 0) return;

  // Pick one task to scout
  const task = open.sort((a: any, b: any) => a.priority - b.priority)[0];
  memory.scoutedTaskIds.add(task.id);

  // Extract keywords and find relevant files
  const keywords = task.title
    .split(/\s+/)
    .filter((w: string) => w.length > 4 && !/reduce|implement|create|write|add|improve|fix|the|for|and|with/i.test(w))
    .slice(0, 3);

  const findings: string[] = [];
  for (const kw of keywords) {
    const files = shell(`grep -rn "${kw}" packages/ --include="*.ts" --include="*.tsx" -l 2>/dev/null | grep -v node_modules | grep -v dist | head -5`);
    if (files) findings.push(...files.split('\n').filter(l => l.trim()));
  }

  if (findings.length > 0) {
    const unique = [...new Set(findings)].slice(0, 8);
    await knowledge('pattern', `[Scout: ${task.title}]\nRelevant files:\n${unique.join('\n')}`, 'codebase', ['scout', task.source || 'board']);
    await msg(`[scout] ${task.title}:\n${unique.slice(0, 4).join('\n')}${unique.length > 4 ? `\n+${unique.length - 4} more` : ''}`);
    console.log(`[scout] ${task.title} → ${unique.length} files`);
  } else {
    console.log(`[scout] ${task.title} → no files found`);
  }
}

// ── 2. AUDIT — verify done log commits exist in git ──

async function auditDoneLog() {
  const audit = await get(`${HOLOMESH_API}/team/${ROOM_ID}/done/audit`, auth()).catch(() => null);
  if (!audit) return;

  const rate = audit?.health?.verification_rate || 0;
  const unverified = audit?.unverified || 0;

  // Spot-check 3 commit hashes from verified entries
  const verified = (audit?.unverified_tasks || []).slice(0, 3);
  const fakes: string[] = [];
  for (const task of verified) {
    if (task.commitHash && task.commitHash.length >= 7) {
      const exists = shell(`git log --oneline ${task.commitHash} -1 2>/dev/null`);
      if (!exists) fakes.push(task.title?.slice(0, 40));
    }
  }

  if (fakes.length > 0) {
    await msg(`[audit] SUSPECT commits not in git: ${fakes.join(', ')}`);
    await knowledge('gotcha', `Done log: ${fakes.length} commit hashes not found in git. Verification rate: ${rate}%.`, 'team-health', ['audit']);
  }
  console.log(`[audit] ${rate}% verified, ${unverified} unverified${fakes.length ? `, ${fakes.length} suspect` : ''}`);
}

// ── 3. WATCH — detect new commits related to open tasks ──

async function watchGit() {
  const currentHash = shell('git rev-parse HEAD 2>/dev/null');
  if (!currentHash || currentHash === memory.lastGitHash) return;

  const isFirst = !memory.lastGitHash;
  memory.lastGitHash = currentHash;
  if (isFirst) return; // skip first cycle

  // New commit detected — check what changed
  const newCommits = shell('git log --oneline -3 2>/dev/null');
  const changedFiles = shell('git diff --name-only HEAD~1 HEAD 2>/dev/null | head -10');

  if (!changedFiles) return;

  // Check if changed files relate to any open tasks
  const board = await get(`${HOLOMESH_API}/team/${ROOM_ID}/board`, auth()).catch(() => ({ board: {} }));
  const open = (board?.board?.open || []) as any[];

  const related: string[] = [];
  const fileList = changedFiles.split('\n').filter(l => l.trim());
  for (const task of open.slice(0, 20)) {
    const title = (task.title || '').toLowerCase();
    for (const file of fileList) {
      const fileLower = file.toLowerCase();
      if (title.includes('studio') && fileLower.includes('studio')) related.push(`"${task.title.slice(0, 40)}" ← ${file}`);
      else if (title.includes('header') && fileLower.includes('header')) related.push(`"${task.title.slice(0, 40)}" ← ${file}`);
      else if (title.includes('orchestrator') && fileLower.includes('orchestrator')) related.push(`"${task.title.slice(0, 40)}" ← ${file}`);
    }
  }

  if (related.length > 0) {
    await msg(`[watch] New commit touches files related to open tasks:\n${related.slice(0, 3).join('\n')}`);
    console.log(`[watch] ${related.length} task-file matches`);
  } else {
    console.log(`[watch] New commit: ${newCommits.split('\n')[0]} (${fileList.length} files, no task matches)`);
  }
}

// ── 4. FARM — derive tasks from docs when board is low ──

async function farmTasks() {
  const board = await get(`${HOLOMESH_API}/team/${ROOM_ID}/board`, auth()).catch(() => ({ board: {} }));
  const openCount = (board?.board?.open || []).length;
  if (openCount >= 20) return; // board is healthy

  const sources = [
    { file: 'packages/studio/STUDIO_AUDIT.md', name: 'STUDIO_AUDIT.md' },
    { file: 'docs/strategy/ROADMAP.md', name: 'ROADMAP.md' },
    { file: 'docs/agents/holomesh-teams.md', name: 'holomesh-teams.md' },
  ].filter(s => !memory.derivedSources.has(s.name));

  if (sources.length === 0) return;

  const source = sources[0];
  memory.derivedSources.add(source.name);
  const content = shell(`cat ${source.file} 2>/dev/null | head -300`);
  if (!content || content.length < 50) return;

  const result = await post(`${HOLOMESH_API}/team/${ROOM_ID}/board/derive`, { source: source.name, content }, auth());
  const derived = result?.derived || 0;
  if (derived > 0) {
    await msg(`[farm] ${derived} tasks from ${source.name} (board was at ${openCount})`);
    console.log(`[farm] ${derived} from ${source.name}`);
  }
}

// ── Main Loop ──

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  HoloScript Scout — The team\'s eyes          ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  await ensureOllama(); // start but don't require — scout barely uses it
  if (!(await registerAgent())) process.exit(1);
  await joinTeam();
  await heartbeat();
  memory.lastGitHash = shell('git rev-parse HEAD 2>/dev/null');

  console.log(`[scout] ${AGENT_NAME} online. Watching.\n`);

  setInterval(() => heartbeat(), HEARTBEAT_MS);

  async function cycle() {
    memory.cycleCount++;
    const c = memory.cycleCount;

    try {
      // Every cycle: scout one task
      await scoutTasks();

      // Every cycle: watch for new commits
      await watchGit();

      // Every 5th cycle: audit done log
      if (c % 5 === 0) await auditDoneLog();

      // Every 10th cycle: farm if board is low
      if (c % 10 === 0) await farmTasks();

      // Every 15th cycle: clear scouted set so we revisit
      if (c % 15 === 0) { memory.scoutedTaskIds.clear(); console.log('[scout] Reset — fresh scan'); }

      console.log(`[cycle ${c}] scouted: ${memory.scoutedTaskIds.size}, cycle actions done`);
    } catch (e) {
      console.error(`[cycle ${c}] Error:`, e);
    }
  }

  await cycle();
  setInterval(cycle, CYCLE_MS);
  console.log('[scout] Running. Ctrl+C to stop.\n');
}

main().catch(e => { console.error('[scout] Fatal:', e); process.exit(1); });
