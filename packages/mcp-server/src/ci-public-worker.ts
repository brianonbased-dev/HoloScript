/**
 * ci-public-worker.ts — background ci-public lane drain for Railway/Brittney instances.
 *
 * When the mcp-server starts on Railway, this module registers a ci-public seat
 * with the orchestrator (using the admin key) and spawns a background poll loop
 * that claims and runs public HoloCI jobs on the instance's spare CPU.
 *
 * Design constraints:
 * - Best-effort only — never throws, never crashes the server.
 * - No new dependencies — uses node:child_process, node:crypto, node:os.
 * - Self-rate-limits to 1 concurrent job (Railway containers are small).
 * - Graceful on SIGTERM: stops accepting new jobs, lets current job finish.
 */

import { exec } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

const ORCH =
  process.env.ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
const AGENT_KEY = process.env.HOLOSCRIPT_API_KEY || '';
// Admin key for seat registration (ci-public is server-side privileged like ci).
const ADMIN_KEY = process.env.MCP_API_KEY || process.env.HOLOSCRIPT_ADMIN_API_KEY || AGENT_KEY;

const POLL_MS = 20_000;
const JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 min — Railway has 10 min request timeout, leave headroom
const HB_INTERVAL_MS = 20_000;

// Derive a stable seat ID from the Railway service instance.
// RAILWAY_REPLICA_ID is set by Railway; fall back to hostname hash for local dev.
function deriveSeatId(): string {
  const base =
    process.env.RAILWAY_REPLICA_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    createHash('sha256').update(hostname()).digest('hex').slice(0, 12);
  return `ci-pub-railway-${base}`;
}

async function registerSeat(seatId: string): Promise<boolean> {
  if (!ADMIN_KEY) return false;
  try {
    const res = await fetch(`${ORCH}/gpu/seats`, {
      method: 'POST',
      headers: { 'x-mcp-api-key': ADMIN_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: seatId,
        authorized_lanes: ['ci-public'],
        has_gpu: false,
        status: 'active',
        metadata: JSON.stringify({
          role: 'holo-ci-public',
          host: 'railway',
          service: process.env.RAILWAY_SERVICE_NAME || 'mcp-server',
        }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pollNext(seatId: string): Promise<{ id: string; command: string } | null> {
  try {
    const res = await fetch(`${ORCH}/gpu/next?seat=${seatId}&lane=ci-public`, {
      headers: { 'x-mcp-api-key': AGENT_KEY },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; command?: string };
    if (!data.id || !data.command) return null;
    return { id: data.id, command: data.command };
  } catch {
    return null;
  }
}

function startHeartbeat(jobId: string): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await fetch(`${ORCH}/gpu/job/${jobId}/heartbeat`, {
        method: 'POST',
        headers: { 'x-mcp-api-key': AGENT_KEY, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      /* non-fatal */
    }
  }, HB_INTERVAL_MS);
}

async function runJob(job: { id: string; command: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = exec(job.command, { timeout: JOB_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer | string) => {
      stderr += String(d).slice(0, 400);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(null); // success
      } else {
        resolve(`exit ${code ?? '?'}: ${stderr.slice(-300)}`);
      }
    });
    proc.on('error', (err) => resolve(`spawn error: ${err.message}`));
  });
}

async function reportDone(jobId: string, error: string | null): Promise<void> {
  try {
    await fetch(`${ORCH}/gpu/job/${jobId}/done`, {
      method: 'POST',
      headers: { 'x-mcp-api-key': AGENT_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* non-fatal */
  }
}

let stopped = false;

export async function startCiPublicWorker(): Promise<void> {
  // Skip if no orchestrator key configured — mcp-server may be running without fleet access.
  if (!AGENT_KEY) return;

  const seatId = deriveSeatId();
  const registered = await registerSeat(seatId);
  console.info(
    `[ci-public] seat ${seatId} ${registered ? 'registered' : 'registration failed (will retry claims anyway)'}`
  );

  process.on('SIGTERM', () => {
    stopped = true;
  });

  // Fire-and-forget poll loop. Runs for the lifetime of the process.
  (async () => {
    while (!stopped) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stopped) break;

      const job = await pollNext(seatId);
      if (!job) continue;

      console.info(`[ci-public] claimed ${job.id}`);
      const hb = startHeartbeat(job.id);
      const error = await runJob(job);
      clearInterval(hb);
      await reportDone(job.id, error);
      console.info(`[ci-public] done ${job.id} (${error ? 'error' : 'ok'})`);
    }
  })().catch(() => {
    /* loop exited — non-fatal */
  });
}
