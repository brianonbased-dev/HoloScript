#!/usr/bin/env node
/**
 * holoclaw-board-bridge.mjs — HoloClaw board→inbox bridge
 *
 * FABLE-PARITY PROGRAM (task_1781140515529_w0jv):
 * Converts the local HoloClaw daemon from on-demand to a real fleet agent
 * that drains the HoloMesh team board.
 *
 * What it does:
 *   1. GET /api/holomesh/team/{teamId}/board — find open tasks matching daemon skills
 *   2. PATCH {action:"claim"} — claim the best-fit task (Phase-3 signed)
 *   3. Write to .holoscript/inbox.jsonl — daemon channel format
 *   4. Poll outbox.jsonl — wait for daemon completion message
 *   5. PATCH {action:"done"} — close the board task with receipt
 *
 * Usage:
 *   node scripts/holoclaw-board-bridge.mjs [--dry-run] [--tags tag1,tag2]
 *   node scripts/holoclaw-board-bridge.mjs --outbox-drain  # step 5 only
 *
 * Flags:
 *   --dry-run     claim + write inbox but don't poll outbox / close the task
 *   --tags a,b    only claim tasks with ALL listed tags (comma-separated)
 *   --outbox-drain  scan outbox.jsonl for unclosed task completions, close them
 *   --task-id <id>  claim a specific task by ID (bypasses filter)
 *   --inbox-dir <path>  override .holoscript dir (default: .holoscript)
 *   --poll-ms <n>  outbox poll interval in ms (default: 5000)
 *   --poll-timeout-ms <n>  give up waiting for outbox after this ms (default: 300000)
 *
 * Environment (inherits from HoloScript .env):
 *   HOLOSCRIPT_API_KEY  — HoloMesh API key (also HOLOMESH_API_KEY)
 *   HOLOMESH_TEAM_ID   — team ID (falls back to hardcoded ecosystem team)
 *   HOLOMESH_AGENT_SURFACE — signing surface (default: claudecode)
 *   HOLOMESH_REQUEST_SIGNING — set to 1 to force signing even if surface unclear
 *
 * @module scripts/holoclaw-board-bridge
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const HOLOSCRIPT_DIR = join(REPO_ROOT, '.holoscript');
const AI_ECOSYSTEM_DIR = join(homedir(), '.ai-ecosystem');

// ── Env / API key resolution ───────────────────────────────────────────────
// Use ai-ecosystem's getHolomeshRuntimeConfig so we pick up the correct
// per-surface x402 seat key (CLAUDECODE_X402_HOLOMESH_KEY etc.), not the
// HoloScript MCP server key (HOLOSCRIPT_API_KEY). The board API requires the
// HoloMesh key, not the MCP server key.

let API_KEY = '';
let TEAM_ID = 'team_1777834718247_unr35n';
let BASE_URL_DEFAULT = 'https://mcp.holoscript.net';

try {
  const envMod = await import(
    new URL(
      `file://${join(AI_ECOSYSTEM_DIR, 'hooks', 'lib', 'holomesh-env.mjs').replace(/\\/g, '/')}`
    ).href
  );
  const cfg = envMod.getHolomeshRuntimeConfig({});
  if (cfg.apiKey) API_KEY = cfg.apiKey;
  if (cfg.teamId) TEAM_ID = cfg.teamId;
  // cfg.apiBase is the full prefix e.g. "https://mcp.holoscript.net/api/holomesh".
  // We strip the path suffix so BASE_URL is just the origin — our paths already
  // start with /api/holomesh/...
  if (cfg.apiBase) {
    try {
      BASE_URL_DEFAULT = new URL(cfg.apiBase).origin;
    } catch {
      /* keep default */
    }
  }
} catch {
  // Fallback: read from .env files directly.
  for (const envPath of [join(REPO_ROOT, '.env'), join(AI_ECOSYSTEM_DIR, '.env')]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^(HOLOMESH_API_KEY|HOLOMESH_TEAM_ID|HOLOMESH_API_BASE)=(.+)/);
      if (m) {
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (m[1] === 'HOLOMESH_API_KEY' && !API_KEY) API_KEY = val;
        if (m[1] === 'HOLOMESH_TEAM_ID') TEAM_ID = val;
        if (m[1] === 'HOLOMESH_API_BASE') BASE_URL_DEFAULT = val;
      }
    }
  }
}
const BASE_URL = process.env.HOLOMESH_BASE_URL || BASE_URL_DEFAULT;
const SURFACE =
  process.env.HOLOMESH_AGENT_SURFACE || process.env.HOLOMESH_RESOLVED_SURFACE || 'claudecode';

if (!API_KEY) {
  console.error(
    '[bridge] ERROR: HOLOMESH_API_KEY not found — ensure holomesh-env.mjs is reachable or set HOLOMESH_API_KEY in .env'
  );
  process.exit(1);
}

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const OUTBOX_DRAIN = args.includes('--outbox-drain');
const tagsIdx = args.indexOf('--tags');
const FILTER_TAGS =
  tagsIdx !== -1 && args[tagsIdx + 1]
    ? args[tagsIdx + 1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
const taskIdIdx = args.indexOf('--task-id');
const FORCE_TASK_ID = taskIdIdx !== -1 ? args[taskIdIdx + 1] : null;
const inboxDirIdx = args.indexOf('--inbox-dir');
const INBOX_DIR = inboxDirIdx !== -1 ? resolve(args[inboxDirIdx + 1]) : HOLOSCRIPT_DIR;
const INBOX_PATH = join(INBOX_DIR, 'inbox.jsonl');
const OUTBOX_PATH = join(INBOX_DIR, 'outbox.jsonl');
const pollMsIdx = args.indexOf('--poll-ms');
const POLL_MS = pollMsIdx !== -1 ? Number(args[pollMsIdx + 1]) || 5000 : 5000;
const pollTimeoutIdx = args.indexOf('--poll-timeout-ms');
const POLL_TIMEOUT_MS = pollTimeoutIdx !== -1 ? Number(args[pollTimeoutIdx + 1]) || 300000 : 300000;

// ── Signing setup ──────────────────────────────────────────────────────────

// Daemon skills — tasks with any of these tags are eligible for claiming.
// Matches compositions/skills/*.hsplus capabilities.
const DAEMON_SKILL_TAGS = new Set([
  'code-health',
  'typefix',
  'lint',
  'type-errors',
  'typescript',
  'git',
  'tests',
  'testing',
  'vitest',
  'dependency-audit',
  'dependencies',
  'dead-code',
  'refactor',
  'journalist',
  'fact-check',
  'verification',
  'self-improvement',
  'improve',
  'coder',
  'skill',
  'hsplus',
  'compositions',
  'engineering',
  'ops',
]);

let bodyTransform = null;
try {
  const signingPath = join(homedir(), '.ai-ecosystem', 'hooks', 'lib', 'holomesh-signing.mjs');
  if (existsSync(signingPath)) {
    const { signingSeatIdFor, buildSignedEnvelope } = await import(
      new URL(`file://${signingPath.replace(/\\/g, '/')}`).href
    );
    const seatId = signingSeatIdFor(SURFACE);
    bodyTransform = async (body) => buildSignedEnvelope(body, { seatId });
    console.log(`[bridge] signing as seat: ${seatId}`);
  } else {
    console.warn(
      '[bridge] holomesh-signing.mjs not found — sending unsigned (may 401 on Phase-3 server)'
    );
  }
} catch (err) {
  console.warn(`[bridge] signing setup failed (${err.message}) — sending unsigned`);
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function apiPatch(path, body) {
  const outBody = bodyTransform ? await bodyTransform(body) : body;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(outBody),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const hint = text.includes('signing-rejected')
      ? ' (signing-rejected: ensure HOLOMESH_REQUEST_SIGNING=1 and seat is provisioned)'
      : '';
    throw new Error(`PATCH ${path} -> ${res.status}: ${text.slice(0, 200)}${hint}`);
  }
  return res.json();
}

// ── Inbox/outbox helpers ───────────────────────────────────────────────────

function writeInbox(entry) {
  appendFileSync(INBOX_PATH, JSON.stringify(entry) + '\n', 'utf8');
  console.log(`[bridge] wrote to inbox: ${INBOX_PATH}`);
}

function readOutbox() {
  if (!existsSync(OUTBOX_PATH)) return [];
  const lines = readFileSync(OUTBOX_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return entries;
}

function findOutboxCompletion(taskId, afterTimestamp) {
  const entries = readOutbox();
  const after = new Date(afterTimestamp).getTime();
  return entries.find((e) => {
    if (new Date(e.timestamp).getTime() <= after) return false;
    // Match by taskId in metadata or message
    const meta = e.metadata || {};
    if (meta.taskId === taskId) return true;
    if (typeof e.message === 'string' && e.message.includes(taskId)) return true;
    // Also accept any "task-complete" or "journalist" channel entry after we wrote inbox
    if (e.channel === 'task-complete' || e.channel === 'journalist') return true;
    return false;
  });
}

// ── Task selection ─────────────────────────────────────────────────────────

function taskFitsSkills(task) {
  if (FORCE_TASK_ID) return task.id === FORCE_TASK_ID;
  const taskTags = Array.isArray(task.tags) ? task.tags : [];
  const role = (task.role || '').toLowerCase();
  const title = (task.title || '').toLowerCase();

  // Required filter tags: ALL must be present
  if (FILTER_TAGS.length > 0) {
    return FILTER_TAGS.every((ft) => taskTags.includes(ft));
  }

  // Default: any of the daemon skill tags
  if (taskTags.some((t) => DAEMON_SKILL_TAGS.has(t))) return true;
  // Fallback: coder / engineering / ops roles
  if (['coder', 'engineering', 'ops'].includes(role)) return true;
  // Last resort: keywords in title
  if (/typefix|lint|test|refactor|skill|journalist|improve|code.health/.test(title)) return true;
  return false;
}

function pickBestTask(tasks) {
  const open = tasks.filter((t) => t.status === 'open' && taskFitsSkills(t));
  if (open.length === 0) return null;
  // Sort by priority ascending (lower number = higher priority), then by createdAt
  open.sort((a, b) => {
    const pa = typeof a.priority === 'number' ? a.priority : 99;
    const pb = typeof b.priority === 'number' ? b.priority : 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
  return open[0];
}

// ── Outbox drain mode ─────────────────────────────────────────────────────

async function outboxDrain() {
  console.log('[bridge] outbox-drain mode: scanning for unclosed task completions');
  const entries = readOutbox();
  let closed = 0;
  for (const entry of entries) {
    const meta = entry.metadata || {};
    const taskId = meta.taskId;
    if (!taskId || meta.boardClosed) continue;
    console.log(`[bridge] found completion for task ${taskId} in outbox`);
    try {
      const result = await apiPatch(`/api/holomesh/team/${TEAM_ID}/board/${taskId}`, {
        action: 'done',
        commit: meta.commitHash || 'no-commit',
        summary: entry.message || 'HoloClaw daemon completed task',
        verification_evidence: [
          meta.verificationEvidence || entry.message || 'outbox completion message',
          `outbox channel: ${entry.channel}`,
          `timestamp: ${entry.timestamp}`,
        ]
          .filter(Boolean)
          .join(' | '),
      });
      if (result?.success) {
        console.log(`[bridge] task ${taskId} closed on board`);
        closed++;
        // Mark as board-closed in outbox (append a marker entry)
        appendFileSync(
          OUTBOX_PATH,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            channel: 'bridge-closed',
            message: `board task ${taskId} closed by bridge outbox-drain`,
            metadata: { taskId, boardClosed: true },
          }) + '\n',
          'utf8'
        );
      } else {
        console.warn(`[bridge] failed to close task ${taskId}:`, result);
      }
    } catch (err) {
      console.error(`[bridge] error closing task ${taskId}: ${err.message}`);
    }
  }
  if (closed === 0) console.log('[bridge] no unclosed completions found');
  else console.log(`[bridge] closed ${closed} task(s)`);
}

// ── Main: claim + write inbox + poll + close ───────────────────────────────

async function main() {
  if (OUTBOX_DRAIN) {
    await outboxDrain();
    return;
  }

  // 1. Get board
  console.log(`[bridge] fetching board for team ${TEAM_ID}`);
  const boardData = await apiGet(`/api/holomesh/team/${TEAM_ID}/board`);
  const allTasks = [
    ...(boardData?.open || []),
    ...(boardData?.tasks?.filter((t) => t.status === 'open') || []),
  ];

  if (allTasks.length === 0 && !FORCE_TASK_ID) {
    console.log('[bridge] no open tasks on board');
    return;
  }

  // 2. Pick best-fit task
  let task;
  if (FORCE_TASK_ID) {
    task = allTasks.find((t) => t.id === FORCE_TASK_ID) || {
      id: FORCE_TASK_ID,
      title: `task ${FORCE_TASK_ID}`,
      status: 'open',
    };
  } else {
    task = pickBestTask(allTasks);
  }

  if (!task) {
    const tagInfo = FILTER_TAGS.length > 0 ? ` (tags: ${FILTER_TAGS.join(',')})` : '';
    console.log(`[bridge] no eligible open tasks found${tagInfo}`);
    console.log(`[bridge] available open tasks: ${allTasks.length}`);
    if (allTasks.length > 0) {
      console.log('[bridge] first 5 open tasks:');
      allTasks.slice(0, 5).forEach((t) => console.log(`  [P${t.priority}] ${t.id}: ${t.title}`));
    }
    return;
  }

  console.log(`[bridge] selected task: [P${task.priority}] ${task.id}: ${task.title}`);

  // 3. Claim the task
  if (!DRY_RUN) {
    console.log(`[bridge] claiming task ${task.id}`);
    const claimed = await apiPatch(`/api/holomesh/team/${TEAM_ID}/board/${task.id}`, {
      action: 'claim',
    });
    if (!claimed?.success && !claimed?.task) {
      console.error('[bridge] claim failed:', claimed);
      return;
    }
    console.log(`[bridge] claimed task ${task.id}`);
  } else {
    console.log(`[bridge] DRY-RUN: would claim task ${task.id}`);
  }

  // 4. Write to inbox.jsonl in daemon channel format
  const inboxTimestamp = new Date().toISOString();
  const inboxEntry = {
    timestamp: inboxTimestamp,
    channel: 'task',
    message: [
      `TASK: ${task.title}`,
      task.description ? `DESCRIPTION: ${task.description}`.slice(0, 500) : '',
      `TASK_ID: ${task.id}`,
      `PRIORITY: ${task.priority ?? 'unknown'}`,
      `ROLE: ${task.role ?? 'coder'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    metadata: {
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      role: task.role,
      tags: task.tags || [],
      source: 'holoclaw-board-bridge',
      claimedAt: inboxTimestamp,
    },
  };
  writeInbox(inboxEntry);

  if (DRY_RUN) {
    console.log('[bridge] DRY-RUN: inbox written; not polling outbox or closing task');
    console.log('[bridge] inbox entry:', JSON.stringify(inboxEntry, null, 2));
    return;
  }

  // 5. Poll outbox.jsonl for daemon completion
  console.log(
    `[bridge] polling outbox for completion (timeout: ${POLL_TIMEOUT_MS}ms, interval: ${POLL_MS}ms)`
  );
  const pollStart = Date.now();
  let completion = null;

  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    completion = findOutboxCompletion(task.id, inboxTimestamp);
    if (completion) {
      console.log(`[bridge] got outbox completion: channel=${completion.channel}`);
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    process.stdout.write('.');
  }

  if (!completion) {
    console.log('\n[bridge] timed out waiting for outbox completion');
    console.log(
      `[bridge] task ${task.id} remains claimed; run --outbox-drain when daemon finishes`
    );
    return;
  }

  console.log('');

  // 6. Close the board task with receipt
  const meta = completion.metadata || {};
  const doneResult = await apiPatch(`/api/holomesh/team/${TEAM_ID}/board/${task.id}`, {
    action: 'done',
    commit: meta.commitHash || 'no-commit',
    summary: completion.message || `HoloClaw completed task ${task.id}`,
    verification_evidence: [
      completion.message || 'outbox completion',
      meta.verificationEvidence ? `evidence: ${meta.verificationEvidence}` : null,
      `outbox channel: ${completion.channel}`,
      `outbox timestamp: ${completion.timestamp}`,
    ]
      .filter(Boolean)
      .join(' | '),
  });

  if (doneResult?.success) {
    console.log(`[bridge] task ${task.id} closed on board`);
    // Mark outbox entry as board-closed
    appendFileSync(
      OUTBOX_PATH,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        channel: 'bridge-closed',
        message: `board task ${task.id} closed by bridge`,
        metadata: { taskId: task.id, boardClosed: true },
      }) + '\n',
      'utf8'
    );
  } else {
    console.error('[bridge] failed to close task on board:', doneResult);
  }
}

main().catch((err) => {
  console.error('[bridge] fatal:', err.message);
  process.exit(1);
});
