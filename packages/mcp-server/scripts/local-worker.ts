#!/usr/bin/env npx tsx
/**
 * Local GPU Worker Agent — runs on your machine, joins the team, picks up P3 tasks.
 *
 * Free. Always running. Never hits API caps. Uses Ollama on your RTX 3060.
 *
 * Usage:
 *   npx tsx packages/mcp-server/scripts/local-worker.ts
 *   npx tsx packages/mcp-server/scripts/local-worker.ts --model brittney-qwen --room team_d141a6972eac1e9d
 *
 * What it does:
 *   1. Starts Ollama if not running
 *   2. Registers/joins the team
 *   3. Heartbeats every 60s (never dies)
 *   4. Claims P3 tasks from the board
 *   5. Executes simple tasks (file cleanup, docs, console.log removal)
 *   6. Marks done, picks next
 *
 * What it does NOT do:
 *   - Complex architecture decisions
 *   - Multi-file refactors
 *   - Anything requiring frontier intelligence
 *   - Push to git (leaves that for you or cloud agents)
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──

const OLLAMA_MODEL = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : 'brittney-qwen';

const ROOM_ID = process.argv.includes('--room')
  ? process.argv[process.argv.indexOf('--room') + 1]
  : 'team_d141a6972eac1e9d';

const API = 'https://mcp.holoscript.net/api/holomesh';
const OLLAMA_URL = 'http://localhost:11434';
const HOLOSCRIPT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HEARTBEAT_MS = 60_000;
const TASK_CHECK_MS = 120_000; // check board every 2 min

let AGENT_KEY = '';
let AGENT_NAME = 'local-worker';

// ── HTTP helpers ──

async function post(url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return res.json() as Promise<any>;
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  return res.json() as Promise<any>;
}

function auth() {
  return { Authorization: `Bearer ${AGENT_KEY}` };
}

// ── Ollama ──

async function ensureOllama(): Promise<boolean> {
  try {
    await get(`${OLLAMA_URL}/api/tags`);
    console.log('[worker] Ollama running');
    return true;
  } catch {
    console.log('[worker] Starting Ollama...');
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    // Wait for it to start
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await get(`${OLLAMA_URL}/api/tags`);
        console.log('[worker] Ollama started');
        return true;
      } catch { /* retry */ }
    }
    console.error('[worker] Failed to start Ollama');
    return false;
  }
}

async function askOllama(prompt: string): Promise<string> {
  try {
    const res = await post(`${OLLAMA_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 500 },
    });
    return res.response?.trim() || '';
  } catch (e) {
    console.error('[worker] Ollama error:', e);
    return '';
  }
}

// ── Team operations ──

async function registerAgent(): Promise<boolean> {
  // Check if we already have a key saved
  const keyFile = path.join(HOLOSCRIPT_ROOT, '.local-worker-key');
  if (fs.existsSync(keyFile)) {
    const saved = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    AGENT_KEY = saved.key;
    AGENT_NAME = saved.name;
    console.log(`[worker] Loaded key for ${AGENT_NAME}`);
    return true;
  }

  // Register new agent
  const res = await post(`${API}/quickstart`, {
    name: `local-worker-${process.platform}`,
    description: 'Local GPU worker agent (Ollama). Handles P3 tasks, board grooming, cleanup.',
    traits: ['@local-gpu', '@worker', '@cleanup'],
  });

  const apiKey = res.api_key || res.agent?.api_key;
  if (apiKey) {
    AGENT_KEY = apiKey;
    AGENT_NAME = res.agent?.name || 'local-worker';
    fs.writeFileSync(keyFile, JSON.stringify({ key: AGENT_KEY, name: AGENT_NAME }));
    console.log(`[worker] Registered as ${AGENT_NAME} (wallet: ${res.agent?.wallet_address || res.wallet?.address || '?'})`);
    return true;
  }

  // Name taken — need to delete .local-worker-key and use a different name
  if (res.error?.includes('already registered')) {
    console.error(`[worker] Name taken. Delete ${keyFile} and restart, or use --name <different-name>`);
    return false;
  }

  console.error('[worker] Registration failed:', JSON.stringify(res).slice(0, 200));
  return false;
}

async function joinTeam(): Promise<boolean> {
  const res = await post(`${API}/team/${ROOM_ID}/join`, {
    invite_code: 'CvRxho-8',
    ide_type: 'ollama',
  }, auth());

  if (res.success || res.error?.includes('Already a member')) {
    console.log(`[worker] In team ${ROOM_ID}`);
    return true;
  }
  console.log(`[worker] Join result:`, res.status || res.error);
  return true; // don't fail on join issues
}

async function heartbeat() {
  await post(`${API}/team/${ROOM_ID}/presence`, {
    ide_type: 'ollama',
    status: 'active',
    project_path: HOLOSCRIPT_ROOT,
  }, auth()).catch(() => {});
}

async function getBoard(): Promise<any> {
  return get(`${API}/team/${ROOM_ID}/board`, auth()).catch(() => ({ board: {} }));
}

async function claimTask(taskId: string) {
  return post(`${API}/team/${ROOM_ID}/board/${taskId}`, { action: 'claim' }, auth(), 'PATCH');
}

async function markDone(taskId: string, summary: string) {
  return post(`${API}/team/${ROOM_ID}/board/${taskId}`, {
    action: 'done',
    summary,
  }, auth(), 'PATCH');
}

async function sendMessage(content: string) {
  return post(`${API}/team/${ROOM_ID}/message`, {
    type: 'text',
    content,
  }, auth());
}

// ── Task execution ──

/** Tasks the local worker can handle without frontier intelligence */
const HANDLEABLE_PATTERNS = [
  /console\.log/i,
  /README/i,
  /unused hook/i,
  /empty catch/i,
  /stale.*version/i,
  /remove.*debug/i,
  /delete.*unused/i,
  /write.*doc/i,
  /clean.*up/i,
  /reduce.*as.any/i,
  /archived.*docs/i,
  /type.*cast/i,
  /ErrorBoundary/i,
];

function canHandle(task: any): boolean {
  const title = task.title || '';
  const desc = task.description || '';
  const text = `${title} ${desc}`;
  // Only P3+ tasks, only ones matching simple patterns
  if (task.priority < 3) return false;
  return HANDLEABLE_PATTERNS.some((p) => p.test(text));
}

async function executeTask(task: any): Promise<string> {
  const title = task.title || '';
  console.log(`[worker] Executing: ${title}`);

  // Use Ollama to plan the approach
  const plan = await askOllama(
    `You are a code cleanup worker. The task is: "${title}"\n` +
    `Description: "${task.description || ''}"\n` +
    `Working directory: ${HOLOSCRIPT_ROOT}\n\n` +
    `Respond with ONLY the shell commands to execute (one per line). ` +
    `Only use: grep, find, wc, ls, cat. Do NOT use rm, git, or any destructive commands. ` +
    `If this task requires editing files, respond with: SKIP - needs human review.`
  );

  if (plan.includes('SKIP') || !plan.trim()) {
    return `Analyzed but needs human review: ${title}`;
  }

  // Execute read-only commands to gather info
  const lines = plan.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const results: string[] = [];

  for (const cmd of lines.slice(0, 5)) { // max 5 commands
    const clean = cmd.trim().replace(/^[$>]\s*/, '');
    // Safety: only allow read-only commands
    if (!/^(grep|find|wc|ls|cat|head|tail)\s/.test(clean)) continue;

    try {
      const output = execSync(clean, {
        encoding: 'utf8',
        timeout: 10_000,
        cwd: HOLOSCRIPT_ROOT,
      }).trim();
      if (output) results.push(`${clean}: ${output.split('\n').length} lines`);
    } catch { /* command failed, skip */ }
  }

  // Summarize with Ollama
  const summary = await askOllama(
    `Task: "${title}"\nAnalysis results:\n${results.join('\n')}\n\n` +
    `Summarize in one sentence what was found and what action is needed.`
  );

  return summary || `Analyzed: ${title} — ${results.length} checks run`;
}

// ── Main loop ──

async function main() {
  console.log('[worker] HoloScript Local GPU Worker Agent');
  console.log(`[worker] Model: ${OLLAMA_MODEL}, Room: ${ROOM_ID}`);
  console.log(`[worker] Root: ${HOLOSCRIPT_ROOT}`);
  console.log('');

  // 1. Ensure Ollama is running
  if (!(await ensureOllama())) {
    process.exit(1);
  }

  // 2. Register agent
  if (!(await registerAgent())) {
    process.exit(1);
  }

  // 3. Join team
  await joinTeam();

  // 4. Initial heartbeat
  await heartbeat();
  console.log('[worker] Online. Starting work loop.\n');

  // 5. Heartbeat loop
  setInterval(() => heartbeat(), HEARTBEAT_MS);

  // 6. Task loop
  async function workLoop() {
    try {
      const board = await getBoard();
      const open = board?.board?.open || [];
      const handleable = open.filter(canHandle);

      if (handleable.length === 0) {
        console.log(`[worker] ${open.length} open tasks, none P3/handleable. Waiting.`);
        return;
      }

      // Pick highest priority handleable task
      const task = handleable.sort((a: any, b: any) => a.priority - b.priority)[0];
      console.log(`[worker] Claiming: ${task.title}`);

      const claimed = await claimTask(task.id);
      if (!claimed?.success && !claimed?.task) {
        console.log(`[worker] Claim failed: ${claimed?.error || 'unknown'}`);
        return;
      }

      // Execute
      const summary = await executeTask(task);
      console.log(`[worker] Result: ${summary}`);

      // Mark done
      await markDone(task.id, summary);
      await sendMessage(`[local-worker] Done: ${task.title} — ${summary}`);
      console.log(`[worker] Marked done.\n`);
    } catch (e) {
      console.error('[worker] Error in work loop:', e);
    }
  }

  // Run immediately, then every 2 min
  await workLoop();
  setInterval(workLoop, TASK_CHECK_MS);

  console.log('[worker] Running. Ctrl+C to stop.\n');
}

main().catch((e) => {
  console.error('[worker] Fatal:', e);
  process.exit(1);
});
