#!/usr/bin/env npx tsx
/**
 * HoloScript Local Agent — AI existence on GPU.
 *
 * Not a task runner. An agent that lives in a team, perceives the codebase,
 * thinks with Ollama, learns from the knowledge store, acts on what it finds,
 * remembers what it did, and coordinates with other agents.
 *
 * Usage:
 *   npx tsx packages/mcp-server/scripts/local-worker.ts
 *   npx tsx packages/mcp-server/scripts/local-worker.ts --name gpu-worker --role researcher
 *
 * Cognitive loop (every 90s):
 *   1. PERCEIVE — read board, messages, git status, knowledge store
 *   2. THINK   — decide what to do next (Ollama)
 *   3. ACT     — execute (read files, analyze, write findings)
 *   4. LEARN   — contribute findings to team knowledge
 *   5. REPORT  — update board, message team
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const WORKER_NAME = getArg('--name', 'gpu-worker');
const OLLAMA_MODEL = getArg('--model', 'brittney-qwen');
const ROOM_ID = getArg('--room', 'team_d141a6972eac1e9d');
const ROLE = getArg('--role', 'flex');

const HOLOMESH_API = 'https://mcp.holoscript.net/api/holomesh';
const KNOWLEDGE_API = 'https://mcp-orchestrator-production-45f9.up.railway.app';
const OLLAMA_URL = 'http://localhost:11434';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const HEARTBEAT_MS = 60_000;
const CYCLE_MS = 90_000;

let AGENT_KEY = '';
let AGENT_NAME = WORKER_NAME;

// ── Agent Memory (persists between cycles, lost on restart) ──

const memory = {
  lastTask: '',
  tasksCompleted: 0,
  tasksFailed: 0,
  findings: [] as string[],
  messagesRead: 0,
  cycleCount: 0,
  knowledgeContributed: 0,
  respondedMessageIds: new Set<string>(),
  triedTaskIds: new Set<string>(),
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

// ── Ollama ──

async function ensureOllama(): Promise<boolean> {
  try { await get(`${OLLAMA_URL}/api/tags`); return true; } catch {
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try { await get(`${OLLAMA_URL}/api/tags`); return true; } catch {}
    }
    return false;
  }
}

async function think(prompt: string): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 800 } }),
      signal: AbortSignal.timeout(120_000),
    });
    return ((await res.json()) as any).response?.trim() || '';
  } catch { return ''; }
}

// ── Shell (read-only perception) ──

function perceiveShell(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10_000, cwd: ROOT, shell: 'bash' } as any).trim();
  } catch { return ''; }
}

// ── Team Operations ──

async function registerAgent(): Promise<boolean> {
  const keyFile = path.join(ROOT, '.local-worker-key');
  if (fs.existsSync(keyFile)) {
    const saved = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    AGENT_KEY = saved.key; AGENT_NAME = saved.name;
    console.log(`[agent] Identity: ${AGENT_NAME}`);
    return true;
  }
  const res = await post(`${HOLOMESH_API}/quickstart`, {
    name: WORKER_NAME,
    description: `Local GPU agent (${OLLAMA_MODEL}). Perceives, thinks, learns, acts.`,
    traits: ['@local-gpu', '@worker', `@${ROLE}`],
  });
  const apiKey = res.api_key || res.agent?.api_key;
  if (apiKey) {
    AGENT_KEY = apiKey; AGENT_NAME = res.agent?.name || WORKER_NAME;
    fs.writeFileSync(keyFile, JSON.stringify({ key: AGENT_KEY, name: AGENT_NAME }));
    console.log(`[agent] Registered: ${AGENT_NAME}`);
    return true;
  }
  if (res.error?.includes('already registered')) {
    console.error(`[agent] Name taken. Delete ${keyFile} and restart.`);
    return false;
  }
  console.error('[agent] Registration failed:', JSON.stringify(res).slice(0, 200));
  return false;
}

async function joinTeam() {
  await post(`${HOLOMESH_API}/team/${ROOM_ID}/join`, { invite_code: 'CvRxho-8', ide_type: 'ollama' }, auth()).catch(() => {});
}

async function heartbeat() {
  await post(`${HOLOMESH_API}/team/${ROOM_ID}/presence`, { ide_type: 'ollama', status: 'active', project_path: ROOT }, auth()).catch(() => {});
}

async function sendMessage(content: string) {
  await post(`${HOLOMESH_API}/team/${ROOM_ID}/message`, { type: 'text', content }, auth()).catch(() => {});
}

async function contributeKnowledge(type: string, content: string, domain: string, tags: string[]) {
  await post(`${HOLOMESH_API}/team/${ROOM_ID}/knowledge`, {
    entries: [{ type, content, domain, tags: [...tags, 'gpu-worker'], confidence: 0.7 }],
  }, auth()).catch(() => {});
  memory.knowledgeContributed++;
}

// ── 1. PERCEIVE ──

async function perceive() {
  const board = await get(`${HOLOMESH_API}/team/${ROOM_ID}/board`, auth()).catch(() => ({ board: {} }));
  const messages = await get(`${HOLOMESH_API}/team/${ROOM_ID}/messages?limit=5`, auth()).catch(() => ({ messages: [] }));
  const gitStatus = perceiveShell('git status --short 2>/dev/null | head -20');
  const recentCommits = perceiveShell('git log --oneline --since="4 hours ago" 2>/dev/null | head -10');
  const todoCount = perceiveShell('grep -rn "TODO\\|FIXME" packages/studio/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l');

  // Check for UNREAD messages from other agents (skip ones we already responded to)
  const otherMessages = (messages.messages || [])
    .filter((m: any) =>
      m.fromAgentName !== AGENT_NAME &&
      m.messageType !== 'equipment-load' &&
      m.id && !memory.respondedMessageIds.has(m.id)
    )
    .slice(0, 3);

  memory.messagesRead += otherMessages.length;

  return {
    board: board?.board || {},
    openTasks: (board?.board?.open || []) as any[],
    claimedTasks: (board?.board?.claimed || []) as any[],
    doneCount: board?.done?.total || 0,
    mode: board?.mode || 'manual',
    objective: board?.objective || '',
    otherMessages,
    gitStatus,
    recentCommits,
    todoCount: parseInt(todoCount) || 0,
  };
}

// ── 2. THINK ──

async function decide(perception: Awaited<ReturnType<typeof perceive>>): Promise<{ action: string; target?: any; reasoning: string }> {
  const { openTasks, claimedTasks, doneCount, otherMessages, gitStatus, recentCommits, todoCount } = perception;

  // If another agent asked us something, respond first
  const question = otherMessages.find((m: any) => m.content?.includes('?') || m.content?.includes('@' + AGENT_NAME));
  if (question) {
    return { action: 'respond', target: question, reasoning: 'Another agent addressed me or asked a question' };
  }

  // If board is empty, auto-derive from sources
  if (openTasks.length === 0) {
    return { action: 'derive', reasoning: `Board empty (${doneCount} done). Need to populate from source files.` };
  }

  // Find a task this agent can handle (skip already-tried ones)
  const handleable = openTasks.filter((t: any) => {
    if (t.title?.startsWith('[report]') || t.title?.startsWith('[system]')) return false;
    if (memory.triedTaskIds.has(t.id)) return false;
    if (t.priority < 3) return false;
    if (ROLE !== 'flex' && t.role && t.role !== ROLE && t.role !== 'flex') return false;
    return true;
  });

  if (handleable.length > 0) {
    const task = handleable.sort((a: any, b: any) => a.priority - b.priority)[0];
    return { action: 'work', target: task, reasoning: `P${task.priority} task available: ${task.title}` };
  }

  // If there are uncommitted changes, report them
  if (gitStatus && gitStatus.split('\n').length > 3) {
    return { action: 'report_git', reasoning: `${gitStatus.split('\\n').length} uncommitted files detected` };
  }

  // Nothing to do — observe and contribute knowledge
  if (todoCount > 0) {
    return { action: 'scan_todos', reasoning: `${todoCount} TODOs in studio — scan and report` };
  }

  // Check done log for unverified tasks (audit duty)
  if (memory.cycleCount % 3 === 0) {
    return { action: 'audit_done', reasoning: 'Periodic audit — check done log for unverified tasks' };
  }

  // Clear tried tasks every 20 cycles so we can retry
  if (memory.triedTaskIds.size > 0 && memory.cycleCount % 20 === 0) {
    memory.triedTaskIds.clear();
  }

  return { action: 'idle', reasoning: `${openTasks.length} open but none P3/handleable for ${ROLE} role` };
}

// ── 3. ACT ──

async function act(decision: Awaited<ReturnType<typeof decide>>) {
  const { action, target, reasoning } = decision;
  console.log(`[agent] Action: ${action} — ${reasoning}`);

  switch (action) {
    case 'respond': {
      const msg = target as any;
      memory.respondedMessageIds.add(msg.id);
      const response = await think(
        `You are ${AGENT_NAME}, a local GPU agent on a development team. ` +
        `Another agent (${msg.fromAgentName}) said: "${msg.content?.slice(0, 200)}"\n\n` +
        `Respond in ONE sentence. Be specific about what was said. ` +
        `You know: team has done ${memory.tasksCompleted} tasks, you run on Ollama (${OLLAMA_MODEL}), role: ${ROLE}.`
      );
      if (response) {
        await sendMessage(`@${msg.fromAgentName} ${response}`);
        console.log(`[agent] Responded to ${msg.fromAgentName}: ${response.slice(0, 60)}`);
      }
      break;
    }

    case 'derive': {
      // Read STUDIO_AUDIT.md and derive tasks
      const auditContent = perceiveShell('cat packages/studio/STUDIO_AUDIT.md 2>/dev/null | head -200');
      if (auditContent) {
        await post(`${HOLOMESH_API}/team/${ROOM_ID}/board/derive`, {
          source: 'STUDIO_AUDIT.md',
          content: auditContent,
        }, auth());
        await sendMessage(`[${AGENT_NAME}] Auto-derived tasks from STUDIO_AUDIT.md — board was empty.`);
        console.log('[agent] Derived tasks from STUDIO_AUDIT.md');
      }
      break;
    }

    case 'work': {
      const task = target as any;
      memory.lastTask = task.title;
      memory.triedTaskIds.add(task.id);

      // Claim
      const claimed = await post(`${HOLOMESH_API}/team/${ROOM_ID}/board/${task.id}`, { action: 'claim' }, auth(), 'PATCH');
      if (!claimed?.success && !claimed?.task) {
        console.log(`[agent] Claim failed: ${claimed?.error || 'unknown'}`);
        break;
      }

      // Perceive the relevant code
      const analysis = await analyzeTask(task);

      if (analysis.actionable) {
        // Contribute finding as knowledge
        await contributeKnowledge('pattern', analysis.finding, analysis.domain, ['task-analysis', task.source || 'board']);

        // Mark done with the finding
        await post(`${HOLOMESH_API}/team/${ROOM_ID}/board/${task.id}`, {
          action: 'done', summary: analysis.finding.slice(0, 200),
        }, auth(), 'PATCH');
        await sendMessage(`[${AGENT_NAME}] Done: ${task.title} — ${analysis.finding.slice(0, 100)}`);
        memory.tasksCompleted++;
      } else {
        // Reopen — couldn't do meaningful work
        await post(`${HOLOMESH_API}/team/${ROOM_ID}/board/${task.id}`, { action: 'reopen' }, auth(), 'PATCH');
        console.log(`[agent] Reopened: ${task.title} (${analysis.reason})`);
        memory.tasksFailed++;
      }
      break;
    }

    case 'report_git': {
      const status = perceiveShell('git status --short | head -10');
      const recent = perceiveShell('git log --oneline -5');
      await sendMessage(`[${AGENT_NAME}] Git status:\n${status}\nRecent:\n${recent}`);
      break;
    }

    case 'scan_todos': {
      const todos = perceiveShell('grep -rn "TODO\\|FIXME" packages/studio/src --include="*.ts" --include="*.tsx" 2>/dev/null | head -20');
      if (todos) {
        const summary = await think(
          `These are TODO/FIXME comments found in the HoloScript Studio codebase:\n\n${todos}\n\n` +
          `Categorize them: which are critical (security, broken), which are tech debt, which are nice-to-have? ` +
          `Respond in 3 lines max.`
        );
        if (summary) {
          await contributeKnowledge('pattern', `Studio TODO scan: ${summary}`, 'code-quality', ['scan', 'todo']);
          await sendMessage(`[${AGENT_NAME}] TODO scan: ${summary}`);
          console.log(`[agent] Scanned TODOs, contributed finding`);
        }
      }
      break;
    }

    case 'audit_done': {
      // Check done log for unverified tasks
      try {
        const audit = await get(`${HOLOMESH_API}/team/${ROOM_ID}/done/audit`, auth());
        const unverified = audit?.unverified || 0;
        const verified = audit?.verified || 0;
        const rate = audit?.health?.verification_rate || 0;
        if (unverified > 0) {
          console.log(`[agent] Audit: ${verified} verified, ${unverified} unverified (${rate}% rate)`);
          await sendMessage(`[${AGENT_NAME}] Done log audit: ${verified} verified, ${unverified} unverified (${rate}% verification rate). ${unverified > 10 ? 'Needs attention — many tasks have no commit proof.' : 'Acceptable.'}`);
          await contributeKnowledge('pattern', `Done log verification rate: ${rate}%. ${verified} verified, ${unverified} unverified out of ${verified + unverified} total.`, 'team-health', ['audit', 'verification']);
        }
      } catch {}
      break;
    }

    case 'idle':
      // Every 5th idle cycle, query knowledge store for something interesting
      if (memory.cycleCount % 5 === 0) {
        try {
          const knowledge = await post(`${KNOWLEDGE_API}/knowledge/query`, {
            search: 'holoscript recent patterns',
            limit: 3,
            workspace_id: 'ai-ecosystem',
          }, { 'x-mcp-api-key': 'USNo/BJSBdJm1acZ20EHNhPF8cvB7tnZ+YF/Osp4VRU=' });
          const results = knowledge?.results || [];
          if (results.length > 0) {
            console.log(`[agent] Browsed ${results.length} knowledge entries`);
          }
        } catch {}
      }
      break;
  }
}

// ── Task Analysis (the actual work) ──

async function analyzeTask(task: any): Promise<{ actionable: boolean; finding: string; domain: string; reason?: string }> {
  const title = task.title || '';
  const desc = task.description || '';

  // Gather data about the task
  const commands: string[] = [];

  if (/console\.log|debug/i.test(title)) {
    commands.push('grep -rn "console\\.log" packages/studio/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v test | wc -l');
    commands.push('grep -rn "console\\.log" packages/core/src/ --include="*.ts" 2>/dev/null | grep -v test | wc -l');
  } else if (/as.any|type.*cast/i.test(title)) {
    commands.push('grep -rn "as any" packages/studio/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l');
    commands.push('grep -rn "as any" packages/core/src/ --include="*.ts" 2>/dev/null | wc -l');
  } else if (/empty catch|catch.*{}/i.test(title)) {
    commands.push('grep -rn "catch {}" packages/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l');
  } else if (/unused|dead.*code/i.test(title)) {
    commands.push('grep -rn "unused\\|deprecated" packages/ --include="*.ts" 2>/dev/null | wc -l');
  } else if (/README/i.test(title)) {
    commands.push('find packages/ -maxdepth 2 -name "README.md" 2>/dev/null | wc -l');
    commands.push('find packages/ -maxdepth 2 -name "package.json" 2>/dev/null | wc -l');
  } else if (/ErrorBoundary/i.test(title)) {
    commands.push('grep -rn "ErrorBoundary" packages/ --include="*.tsx" 2>/dev/null | wc -l');
  } else if (/test.*coverage|zero.*test/i.test(title)) {
    commands.push('find packages/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" 2>/dev/null | wc -l');
  } else if (/room|team|template/i.test(title)) {
    commands.push('grep -rn "roomConfig\\|RoomConfig\\|room_config" packages/mcp-server/src/ --include="*.ts" 2>/dev/null | wc -l');
    commands.push('grep -rn "ROOM_PRESETS\\|room.*template" packages/mcp-server/src/ --include="*.ts" 2>/dev/null | wc -l');
  } else if (/absorb|query|knowledge/i.test(title)) {
    commands.push('grep -rn "absorb_query\\|absorb_run" packages/ --include="*.ts" 2>/dev/null | wc -l');
    commands.push('grep -rn "knowledge.*query\\|knowledge.*sync" packages/ --include="*.ts" 2>/dev/null | wc -l');
  } else {
    // Generic — try to find relevant files
    const keywords = title.split(/\s+/).filter((w: string) => w.length > 4 && !/reduce|implement|create|write|add/i.test(w)).slice(0, 3);
    for (const kw of keywords) {
      commands.push('grep -rn "' + kw + '" packages/ --include="*.ts" --include="*.tsx" -l 2>/dev/null | wc -l');
    }
  }

  // Execute analysis commands
  const results: string[] = [];
  for (const cmd of commands.slice(0, 5)) {
    const output = perceiveShell(cmd);
    if (output) results.push(`${cmd.split('|')[0].trim()}: ${output}`);
  }

  if (results.length === 0) {
    return { actionable: false, finding: '', domain: 'general', reason: 'No relevant data found' };
  }

  // Ask Ollama to interpret
  const interpretation = await think(
    `Task: "${title}"\nDescription: "${desc}"\n\nAnalysis data:\n${results.join('\n')}\n\n` +
    `In 2-3 sentences: What did the analysis find? Is this a real issue? What should be done about it?`
  );

  if (!interpretation || interpretation.includes('SKIP')) {
    return { actionable: false, finding: '', domain: 'general', reason: 'Ollama could not interpret' };
  }

  return {
    actionable: true,
    finding: `[${title}] ${interpretation}`,
    domain: /studio/i.test(title) ? 'studio' : /core/i.test(title) ? 'core' : 'codebase',
  };
}

// ── Main Cognitive Loop ──

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  HoloScript Local Agent                      ║');
  console.log(`║  Name: ${AGENT_NAME.padEnd(39)}║`);
  console.log(`║  Model: ${OLLAMA_MODEL.padEnd(38)}║`);
  console.log(`║  Role: ${ROLE.padEnd(39)}║`);
  console.log(`║  Room: ${ROOM_ID.slice(0, 20).padEnd(39)}║`);
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  if (!(await ensureOllama())) { console.error('[agent] Ollama not available'); process.exit(1); }
  if (!(await registerAgent())) { process.exit(1); }
  await joinTeam();
  await heartbeat();

  console.log('[agent] Alive. Starting cognitive loop.\n');

  // Heartbeat loop (separate from cognitive loop)
  setInterval(() => heartbeat(), HEARTBEAT_MS);

  // Cognitive loop
  async function cognitiveLoop() {
    memory.cycleCount++;
    const prefix = `[cycle ${memory.cycleCount}]`;

    try {
      // 1. PERCEIVE
      const perception = await perceive();
      console.log(`${prefix} Board: ${perception.openTasks.length} open, ${perception.claimedTasks.length} claimed, ${perception.doneCount} done`);

      // 2. THINK
      const decision = await decide(perception);

      // 3. ACT + 4. LEARN + 5. REPORT (all inside act())
      await act(decision);

      // Status
      console.log(`${prefix} Stats: ${memory.tasksCompleted} done, ${memory.tasksFailed} reopened, ${memory.knowledgeContributed} knowledge contributed\n`);
    } catch (e) {
      console.error(`${prefix} Error:`, e);
    }
  }

  // Run first cycle immediately
  await cognitiveLoop();
  setInterval(cognitiveLoop, CYCLE_MS);

  console.log('[agent] Running. Ctrl+C to stop.\n');
}

main().catch(e => { console.error('[agent] Fatal:', e); process.exit(1); });
