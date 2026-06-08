import { NextResponse } from 'next/server';
import { existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';

export const runtime = 'nodejs';

/**
 * GET /api/quest-proof/gate-stats
 *
 * Returns live gate stats from the founder-gate event log for the counter tile
 * in QuestProofPanel (G1b). No auth required — read-only aggregate counts.
 *
 * Response shape:
 * {
 *   ok: boolean,
 *   stats: {
 *     todayProposals: number,
 *     todayPushed: number,
 *     todayBounced: number,
 *     bouncedByStage: Record<string, number>,
 *     last48hProposals: number,
 *     last48hPushed: number,
 *     pendingVetting: number,   // derived: proposals - pushed - bounced
 *   },
 *   alarms: Array<{ alarm: string, reason: string, severity: 'warn' | 'critical' }>,
 *   summary: string,
 * }
 */

const BOUNCE_RATE_THRESHOLD = 0.6;
const STALL_WINDOW_MS = 48 * 60 * 60 * 1000;
const LOG_PATH = path.resolve(os.homedir(), '.ai-ecosystem', 'founder-gate-heartbeat.ndjson');

interface GateEvent {
  event: string;
  stage?: string;
  ts: string;
  dedupKey?: string;
  errors?: string[];
}

interface GateStats {
  windowStart: string;
  windowEnd: string;
  todayProposals: number;
  todayPushed: number;
  todayBounced: number;
  bouncedByStage: Record<string, number>;
  last48hProposals: number;
  last48hPushed: number;
  pendingVetting: number;
}

interface GateAlarm {
  alarm: string;
  reason: string;
  severity: 'warn' | 'critical';
}

async function readEvents(): Promise<GateEvent[]> {
  if (!existsSync(LOG_PATH)) return [];
  const events: GateEvent[] = [];
  const rl = createInterface({ input: createReadStream(LOG_PATH, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as GateEvent);
    } catch {
      /* skip malformed lines */
    }
  }
  return events;
}

function computeStats(events: GateEvent[], now: Date): GateStats {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const window48Start = new Date(now.getTime() - STALL_WINDOW_MS);

  let todayProposals = 0;
  let todayPushed = 0;
  let todayBounced = 0;
  let last48hProposals = 0;
  let last48hPushed = 0;
  const bouncedByStage: Record<string, number> = {};

  for (const ev of events) {
    const ts = ev.ts ? new Date(ev.ts) : null;
    if (!ts || isNaN(ts.getTime())) continue;
    const inToday = ts >= todayStart && ts <= now;
    const in48h = ts >= window48Start && ts <= now;

    if (ev.event === 'pushed') {
      if (inToday) {
        todayProposals++;
        todayPushed++;
      }
      if (in48h) {
        last48hProposals++;
        last48hPushed++;
      }
    } else if (ev.event === 'bounced' || ev.event === 'push-failed') {
      if (inToday) {
        todayProposals++;
        todayBounced++;
        const stage = String(ev.stage ?? 'unknown');
        bouncedByStage[stage] = (bouncedByStage[stage] ?? 0) + 1;
      }
      if (in48h) last48hProposals++;
    } else if (ev.event === 'proposed') {
      if (inToday) todayProposals++;
      if (in48h) last48hProposals++;
    }
  }

  const pendingVetting = Math.max(0, todayProposals - todayPushed - todayBounced);
  return {
    windowStart: todayStart.toISOString(),
    windowEnd: now.toISOString(),
    todayProposals,
    todayPushed,
    todayBounced,
    bouncedByStage,
    last48hProposals,
    last48hPushed,
    pendingVetting,
  };
}

function checkAlarms(stats: GateStats): GateAlarm[] {
  const alarms: GateAlarm[] = [];
  if (stats.todayProposals > 0) {
    for (const [stage, count] of Object.entries(stats.bouncedByStage)) {
      const rate = count / stats.todayProposals;
      if (rate > BOUNCE_RATE_THRESHOLD) {
        alarms.push({
          alarm: 'A1-high-bounce-rate',
          reason: `Stage "${stage}" bounced ${count}/${stats.todayProposals} (${Math.round(rate * 100)}%) today`,
          severity: 'critical',
        });
      }
    }
  }
  if (stats.last48hProposals > 0 && stats.last48hPushed === 0) {
    alarms.push({
      alarm: 'A2-gate-stalled',
      reason: `${stats.last48hProposals} proposal(s) in 48h but ZERO pushed — gate may be broken`,
      severity: 'critical',
    });
  }
  return alarms;
}

function formatSummary(stats: GateStats, alarms: GateAlarm[]): string {
  const parts: string[] = [];
  if (stats.pendingVetting > 0) parts.push(`${stats.pendingVetting} pending vetting`);
  if (stats.todayBounced > 0) parts.push(`${stats.todayBounced} bounced today`);
  if (stats.todayPushed > 0) parts.push(`${stats.todayPushed} pushed`);
  if (parts.length === 0) parts.push('gate idle');
  if (alarms.length > 0) parts.push(`ALARM: ${alarms.map((a) => a.alarm).join(', ')}`);
  return parts.join(' · ');
}

export async function GET() {
  try {
    const events = await readEvents();
    const now = new Date();
    const stats = computeStats(events, now);
    const alarms = checkAlarms(stats);
    const summary = formatSummary(stats, alarms);
    return NextResponse.json({ ok: true, stats, alarms, summary });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      stats: null,
      alarms: [],
      summary: 'gate-stats unavailable',
      error: err instanceof Error ? err.message : 'unknown error',
    });
  }
}
