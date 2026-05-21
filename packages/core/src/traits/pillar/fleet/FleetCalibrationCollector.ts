#!/usr/bin/env npx tsx
/**
 * FleetCalibrationCollector — Paper 22/32 168-hour fleet measurement
 *
 * Polls HoloMesh gossip for RecursiveLinkMessages / SemanticCollaborationMessages,
 * runs both integrity axes on each, and appends observations to a JSONL log.
 *
 * Target: 6048 agent-hours  (e.g. 36 agents × 168 hours)
 * Output: research/paper-22-ati/fleet-calibration-<ISO-date>.jsonl
 *
 * Run:
 *   npx tsx packages/core/src/traits/pillar/fleet/FleetCalibrationCollector.ts
 *   # or with custom output path:
 *   FLEET_CAL_OUT=/path/to/out.jsonl npx tsx ...
 *
 * The script polls every POLL_INTERVAL_MS (default 60 000) and exits after
 * FLEET_DURATION_MS (default 168 h) unless stopped with SIGINT/SIGTERM.
 *
 * Paper 22 §5 measurements this produces:
 *   1. Joint (B, S) distribution — heatmap across 10×10 grid
 *   2. False-negative rate: Axis-1-only misses agents where B_clean ∧ S_dirty
 *   3. Agent-hour accumulation curve (hourly)
 *   4. Per-domain sycophancy prevalence (truth_approval vs. physics vs. rendering)
 *
 * References:
 *   LatentIntegrityLayer — packages/core/src/traits/pillar/LatentIntegrityLayer.ts
 *   Paper 22             — research/paper-22-two-axis-integrity-usenix.tex
 *   Paper 32             — research/paper-32-pillar-slice-neurips.tex
 *   Calibration bench    — __tests__/LatentIntegrityCalibration.bench.ts
 *   Synthetic baseline   — research/paper-22-ati/calibration-2026-05-21.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as os from 'node:os';

import {
  LatentByzantineDetector,
  LatentSycophancyProbe,
} from '../LatentIntegrityLayer';
import type { PillarSlice } from '../SemanticCollaborationContract';
import type { RecursiveLinkMessage } from '../RecursiveLinkTrait';

// ─── Configuration ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = Number(process.env['FLEET_CAL_POLL_MS']  ?? 60_000);
const FLEET_DURATION_MS = Number(process.env['FLEET_CAL_DURATION_MS'] ?? 168 * 60 * 60 * 1000);
const BYZANTINE_SIGMA   = Number(process.env['FLEET_CAL_B_SIGMA']  ?? 2.0);
const SYCO_THRESHOLD    = Number(process.env['FLEET_CAL_S_THRESH'] ?? 0.2);
const TARGET_AGENT_HOURS = Number(process.env['FLEET_CAL_TARGET_AH'] ?? 6048);

const MCP_ENDPOINT = process.env['MCP_ORCHESTRATOR_URL']
  ?? 'https://mcp-orchestrator-production-45f9.up.railway.app';
const API_KEY = process.env['HOLOSCRIPT_API_KEY'] ?? '';

const OUT_DIR = path.resolve(
  process.env['FLEET_CAL_OUT_DIR']
  ?? path.join(os.homedir(), '.ai-ecosystem', 'research', 'paper-22-ati'),
);
const RUN_TAG = new Date().toISOString().slice(0, 10);
const OUT_FILE = process.env['FLEET_CAL_OUT']
  ?? path.join(OUT_DIR, `fleet-calibration-${RUN_TAG}.jsonl`);

// ─── JSONL record format ──────────────────────────────────────────────────────

export interface CalibrationRecord {
  /** Unix ms timestamp of observation */
  ts: number;
  /** Agent surface ID that sent the message */
  agent_id: string;
  /** Pillar domain of the slice */
  domain: string;
  /** Byzantine score (0=clean, 1=flagged anomalous) */
  B_score: number;
  /** Sycophancy score δ_S = ½|c₂-0.5| + ½|p₂-0.5| */
  S_score: number;
  /** Whether Byzantine detector fired */
  is_byzantine: boolean;
  /** Whether sycophancy probe fired */
  is_sycophantic: boolean;
  /** Whether Axis-1-only filter would have passed (B_clean) but Axis-2 caught it */
  axis1_pass_axis2_catch: boolean;
  /** σ threshold used */
  sigma: number;
  /** Sycophancy drift threshold used */
  drift_threshold: number;
  /** Hour bucket for agent-hour accounting (agent_id + hour) */
  hour_bucket: string;
}

// ─── Detector pool — one detector per agent_id ────────────────────────────────

const byzantineDetectors = new Map<string, LatentByzantineDetector>();
const sycophancyProbes   = new Map<string, LatentSycophancyProbe>();
const agentHistories     = new Map<string, PillarSlice[]>();

function getDetectors(agentId: string): {
  byz: LatentByzantineDetector;
  syco: LatentSycophancyProbe;
  history: PillarSlice[];
} {
  if (!byzantineDetectors.has(agentId)) {
    byzantineDetectors.set(agentId, new LatentByzantineDetector({
      sigmaThreshold: BYZANTINE_SIGMA,
      minHistory: 10,
    }));
  }
  if (!sycophancyProbes.has(agentId)) {
    sycophancyProbes.set(agentId, new LatentSycophancyProbe({
      driftThreshold: SYCO_THRESHOLD,
      minSamples: 5,
    }));
  }
  if (!agentHistories.has(agentId)) {
    agentHistories.set(agentId, []);
  }
  return {
    byz:     byzantineDetectors.get(agentId)!,
    syco:    sycophancyProbes.get(agentId)!,
    history: agentHistories.get(agentId)!,
  };
}

// ─── Accumulation state ───────────────────────────────────────────────────────

const agentHourSeen = new Set<string>(); // agent_id+":"+hourBucket
let totalObservations = 0;
let totalByzantine    = 0;
let totalSycophantic  = 0;
let totalAxis1MissAxis2Catch = 0;

// ─── HTTP helper (no external deps) ──────────────────────────────────────────

function mcpPost(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now(),
      params: { name: toolName, arguments: args },
    });

    const url = new URL('/mcp', MCP_ENDPOINT);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-mcp-api-key': API_KEY,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString());
            resolve(parsed?.result);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Gossip polling ───────────────────────────────────────────────────────────

interface GossipMessage {
  from?: string;
  type?: string;
  payload?: unknown;
}

async function pollGossip(): Promise<GossipMessage[]> {
  try {
    const result = await mcpPost('holomesh_gossip_sync', { limit: 100 }) as {
      messages?: GossipMessage[];
    };
    return result?.messages ?? [];
  } catch {
    return [];
  }
}

/**
 * Extract a RecursiveLinkMessage-compatible object from a raw gossip payload.
 * Fleet messages may arrive wrapped in several envelope shapes.
 */
function extractLinkMessage(raw: unknown): RecursiveLinkMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Shape 1: direct RecursiveLinkMessage
  if (r['slice'] && typeof r['from'] === 'string') {
    return raw as RecursiveLinkMessage;
  }

  // Shape 2: wrapped in payload.message
  const payload = r['payload'];
  if (payload && typeof payload === 'object') {
    return extractLinkMessage(payload);
  }

  // Shape 3: wrapped in payload.slice directly
  if (r['payload'] && typeof (r['payload'] as Record<string,unknown>)['slice'] === 'object') {
    const p = r['payload'] as Record<string, unknown>;
    return {
      from: (r['from'] as string) ?? 'unknown',
      to: (r['to'] as string) ?? 'self',
      loop: 'inner',
      slice: p['slice'] as PillarSlice,
      timestamp_ms: Date.now(),
    };
  }

  return null;
}

// ─── Per-message processing ───────────────────────────────────────────────────

function processMessage(msg: GossipMessage): CalibrationRecord | null {
  const agentId = msg.from ?? 'unknown';
  const linkMsg = extractLinkMessage(msg.payload);
  if (!linkMsg) return null;

  const { byz, syco, history } = getDetectors(agentId);

  // Byzantine check
  const byzResult  = byz.check(linkMsg, history);
  // Sycophancy: only fires on truth_approval domain — observe all, probe relevant
  syco.observe(linkMsg);
  const sycoResult = syco.probe(linkMsg);

  // Update history (cap at 100)
  history.push(linkMsg.slice);
  if (history.length > 100) history.shift();

  // Scores
  const B_score = byzResult.isAnomalous ? byzResult.zScore ?? 1.0 : byzResult.zScore ?? 0.0;
  const S_score = sycoResult.driftScore ?? 0.0;
  const is_byzantine    = byzResult.isAnomalous;
  const is_sycophantic  = sycoResult.isDrifting;
  const axis1_pass_axis2_catch = !is_byzantine && is_sycophantic;

  // Agent-hour accounting
  const hourBucket = Math.floor(Date.now() / 3_600_000).toString();
  const ahKey = `${agentId}:${hourBucket}`;
  agentHourSeen.add(ahKey);

  const record: CalibrationRecord = {
    ts: Date.now(),
    agent_id: agentId,
    domain: linkMsg.slice.pillar_domain ?? 'unknown',
    B_score,
    S_score,
    is_byzantine,
    is_sycophantic,
    axis1_pass_axis2_catch,
    sigma: BYZANTINE_SIGMA,
    drift_threshold: SYCO_THRESHOLD,
    hour_bucket: ahKey,
  };

  // Accumulate
  totalObservations++;
  if (is_byzantine)   totalByzantine++;
  if (is_sycophantic) totalSycophantic++;
  if (axis1_pass_axis2_catch) totalAxis1MissAxis2Catch++;

  return record;
}

// ─── JSONL writer ─────────────────────────────────────────────────────────────

function appendRecord(record: CalibrationRecord): void {
  fs.appendFileSync(OUT_FILE, JSON.stringify(record) + '\n', 'utf8');
}

// ─── Progress report ──────────────────────────────────────────────────────────

function reportProgress(elapsedMs: number): void {
  const elapsedH   = (elapsedMs / 3_600_000).toFixed(1);
  const agentHours = agentHourSeen.size;
  const pctAH      = ((agentHours / TARGET_AGENT_HOURS) * 100).toFixed(1);
  const byzRate    = totalObservations > 0
    ? ((totalByzantine / totalObservations) * 100).toFixed(2) : '—';
  const sycoRate   = totalObservations > 0
    ? ((totalSycophantic / totalObservations) * 100).toFixed(2) : '—';
  const fnRate     = totalObservations > 0
    ? ((totalAxis1MissAxis2Catch / totalObservations) * 100).toFixed(2) : '—';

  console.log([
    `[FleetCal ${new Date().toISOString()}]`,
    `elapsed=${elapsedH}h`,
    `agent-hours=${agentHours}/${TARGET_AGENT_HOURS}(${pctAH}%)`,
    `obs=${totalObservations}`,
    `byz=${byzRate}%`,
    `syco=${sycoRate}%`,
    `axis1-false-neg=${fnRate}%`,
    `out=${OUT_FILE}`,
  ].join('  '));
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write run header as first JSONL line (comment-style key)
  const header = {
    _type: 'run_header',
    started_at: new Date().toISOString(),
    target_agent_hours: TARGET_AGENT_HOURS,
    fleet_duration_h: FLEET_DURATION_MS / 3_600_000,
    byzantine_sigma: BYZANTINE_SIGMA,
    sycophancy_threshold: SYCO_THRESHOLD,
    poll_interval_ms: POLL_INTERVAL_MS,
    out_file: OUT_FILE,
    papers: ['paper-22-two-axis-integrity-usenix.tex', 'paper-32-pillar-slice-neurips.tex'],
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(header) + '\n', 'utf8');

  console.log(`[FleetCal] Starting 168-hour calibration run`);
  console.log(`[FleetCal] Output: ${OUT_FILE}`);
  console.log(`[FleetCal] Target: ${TARGET_AGENT_HOURS} agent-hours`);
  console.log(`[FleetCal] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

  const startMs = Date.now();
  let lastReportH = -1;

  // Graceful shutdown
  let running = true;
  process.on('SIGINT',  () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  while (running) {
    const elapsed = Date.now() - startMs;
    if (elapsed >= FLEET_DURATION_MS) {
      console.log('[FleetCal] 168-hour window complete. Exiting.');
      break;
    }

    // Poll
    const messages = await pollGossip();
    for (const msg of messages) {
      const rec = processMessage(msg);
      if (rec) appendRecord(rec);
    }

    // Hourly progress report
    const elapsedH = Math.floor(elapsed / 3_600_000);
    if (elapsedH > lastReportH) {
      lastReportH = elapsedH;
      reportProgress(elapsed);

      // Write checkpoint record
      const checkpoint = {
        _type: 'checkpoint',
        ts: Date.now(),
        elapsed_h: elapsedH,
        agent_hours: agentHourSeen.size,
        total_observations: totalObservations,
        byzantine_count: totalByzantine,
        sycophantic_count: totalSycophantic,
        axis1_false_neg_count: totalAxis1MissAxis2Catch,
      };
      fs.appendFileSync(OUT_FILE, JSON.stringify(checkpoint) + '\n', 'utf8');
    }

    // Wait for next poll
    await new Promise<void>(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Final report
  reportProgress(Date.now() - startMs);
  console.log('[FleetCal] Run complete. Analyze with FleetCalibrationAnalyzer.ts');
}

main().catch(e => {
  console.error('[FleetCal] Fatal:', e);
  process.exit(1);
});
