#!/usr/bin/env node
/**
 * gpu-job-queue.mjs — minimal FIFO runner for shared-GPU / fleet experiments
 *
 * Keeps a JSON queue of shell commands, runs them sequentially, time-boxes each
 * run, and appends one JSON line per job to a log (default: ./gpu-job-log.jsonl).
 *
 * Usage (from repo root):
 *   cp scripts/gpu-jobs.example.json scripts/gpu-jobs.local.json
 *   # edit gpu-jobs.local.json — real commands, labels, PAPER=…
 *   node scripts/gpu-job-queue.mjs --dry-run
 *   set GPU_JOB_QUEUE=scripts/gpu-jobs.local.json   # Windows
 *   node scripts/gpu-job-queue.mjs
 *
 * Env:
 *   GPU_JOB_QUEUE   — path to queue JSON (default: ./scripts/gpu-jobs.local.json if present, else ./scripts/gpu-jobs.example.json)
 *   GPU_JOB_LOG     — log path (default: ./gpu-job-log.jsonl)
 *
 * @see docs/Definitions.md — Shared GPU utilization
 */

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || args.includes('-n');
const ONCE = args.includes('--once');

function defaultQueuePath() {
  const local = join(REPO_ROOT, 'scripts', 'gpu-jobs.local.json');
  if (existsSync(local)) return local;
  return join(REPO_ROOT, 'scripts', 'gpu-jobs.example.json');
}

const queuePath = resolve(process.env.GPU_JOB_QUEUE || defaultQueuePath());
const logPath = resolve(process.env.GPU_JOB_LOG || join(REPO_ROOT, 'gpu-job-log.jsonl'));

function logLine(obj) {
  const line = JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n';
  appendFileSync(logPath, line, 'utf8');
  if (obj.phase === 'end' && typeof obj.exitCode === 'number') {
    const tag = obj.exitCode === 0 ? 'ok' : 'fail';
    console.log(`[gpu-job-queue] ${tag} ${obj.id} ${obj.durationMs}ms code=${obj.exitCode}`);
  }
}

function loadQueue() {
  const raw = readFileSync(queuePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error('Invalid queue: expected { jobs: [...] }');
  }
  return data;
}

function runOne(job, defaults) {
  const timeBoxSec = job.timeBoxSec ?? defaults?.timeBoxSec ?? 3600;
  const cwd = job.cwd ? resolve(REPO_ROOT, job.cwd) : REPO_ROOT;
  const cmd = job.command;
  if (!Array.isArray(cmd) || cmd.length < 1) {
    return Promise.reject(new Error(`Job ${job.id}: missing command array`));
  }

  const start = Date.now();
  logLine({ phase: 'start', id: job.id, label: job.label, timeBoxSec, cwd, command: cmd });

  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd,
      env: { ...process.env, ...job.env },
      stdio: 'inherit',
      windowsHide: true,
    });

    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      console.error(`[gpu-job-queue] TIMEOUT ${job.id} after ${timeBoxSec}s — sending SIGTERM`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!done) child.kill('SIGKILL');
      }, 5000);
    }, timeBoxSec * 1000);

    const finish = (code, signal) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const durationMs = Date.now() - start;
      logLine({
        phase: 'end',
        id: job.id,
        label: job.label,
        exitCode: code,
        signal: signal || null,
        durationMs,
      });
      resolveP({ code, signal, durationMs });
    };

    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const durationMs = Date.now() - start;
      logLine({ phase: 'error', id: job.id, err: String(err), durationMs });
      rejectP(err);
    });
    child.on('exit', (code, signal) => finish(code ?? 1, signal));
  });
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`gpu-job-queue.mjs
  Runs jobs from a JSON queue sequentially (FIFO), with per-job time boxes.

  GPU_JOB_QUEUE   path to JSON (default: scripts/gpu-jobs.local.json or .example)
  GPU_JOB_LOG     jsonl log path (default: ./gpu-job-log.jsonl)

  Flags:
  --dry-run  Print jobs, do not execute
  --once     Run only the first job
`);
    return;
  }

  console.log(`[gpu-job-queue] queue=${queuePath}`);
  console.log(`[gpu-job-queue] log=${logPath}`);
  if (queuePath.includes('example') && !DRY) {
    console.warn(
      '[gpu-job-queue] Using example queue. Copy to scripts/gpu-jobs.local.json and set GPU_JOB_QUEUE, or you may run placeholder commands.',
    );
  }

  const data = loadQueue();
  const jobs = ONCE ? data.jobs.slice(0, 1) : data.jobs;

  if (DRY) {
    for (const j of jobs) {
      console.log('[dry-run]', j.id, j.label, j.command, `timeBoxSec=${j.timeBoxSec ?? data.defaults?.timeBoxSec ?? 3600}`);
    }
    return;
  }

  for (const job of jobs) {
    try {
      await runOne(job, data.defaults);
    } catch (e) {
      console.error(`[gpu-job-queue] job failed: ${job.id}`, e);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
