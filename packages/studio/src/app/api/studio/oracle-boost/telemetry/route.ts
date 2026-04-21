export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { corsHeaders } from '../../../_lib/cors';
// ─── GET /api/studio/oracle-boost/telemetry ──────────────────────────────────
// Reads oracle-telemetry.jsonl and returns aggregated usage + outcome data.
// Enterprise tier: always returns telemetry — no gate.
// ─────────────────────────────────────────────────────────────────────────────

const ORACLE_TELEMETRY_PATH =
  process.env.ORACLE_TELEMETRY_PATH ||
  path.join(os.homedir(), '.holoscript', 'oracle-telemetry.jsonl');

interface TelemetryEntry {
  timestamp?: string;
  hardware_target?: string;
  ide_client?: string;
  outcome?: string;
  consulted?: boolean;
  source?: string;
}

function parseTelemetry(): TelemetryEntry[] {
  try {
    if (!fs.existsSync(ORACLE_TELEMETRY_PATH)) return [];
    const raw = fs.readFileSync(ORACLE_TELEMETRY_PATH, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TelemetryEntry;
        } catch {
          return {};
        }
      })
      .filter((e) => Object.keys(e).length > 0);
  } catch {
    return [];
  }
}

function aggregate(entries: TelemetryEntry[]) {
  const byHardware: Record<string, number> = {};
  const byIde: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const e of entries) {
    const hw = e.hardware_target || 'unknown';
    const ide = e.ide_client || 'unknown';
    const outcome = e.outcome || 'unknown';
    const source = e.source || 'unknown';

    byHardware[hw] = (byHardware[hw] ?? 0) + 1;
    byIde[ide] = (byIde[ide] ?? 0) + 1;
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
  }

  return { byHardware, byIde, byOutcome, bySource };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tier = searchParams.get('tier') || request.headers.get('x-absorb-tier') || 'free';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  const all = parseTelemetry();
  const recent = all.slice(-Math.min(limit, all.length));
  const summary = aggregate(all);

  return NextResponse.json({
    tier,
    always_on: tier === 'enterprise',
    total_entries: all.length,
    returning_entries: recent.length,
    telemetry_path: ORACLE_TELEMETRY_PATH,
    summary,
    recent,
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
