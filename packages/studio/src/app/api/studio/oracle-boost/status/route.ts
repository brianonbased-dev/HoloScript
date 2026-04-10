import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── POST /api/studio/oracle-boost/status ────────────────────────────────────
// Validates all oracle prerequisites for the current session.
// Enterprise tier: always oracle_ready=true, all checks skipped.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeEndpoint(url: string | undefined): string {
  if (!url) return 'https://mcp-orchestrator-production-45f9.up.railway.app';
  return url.startsWith('http') ? url : `https://${url}`;
}

const KNOWLEDGE_ENDPOINT = normalizeEndpoint(
  process.env.MCP_ORCHESTRATOR_PUBLIC_URL || process.env.MCP_ORCHESTRATOR_URL
);

const MCP_API_KEY = process.env.MCP_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY || '';

const ORACLE_TELEMETRY_PATH =
  process.env.ORACLE_TELEMETRY_PATH ||
  path.join(os.homedir(), '.holoscript', 'oracle-telemetry.jsonl');

function inferIdeClient(req: NextRequest): string {
  const ua = req.headers.get('user-agent') || '';
  const client = req.headers.get('x-ide-client') || '';
  if (client) return client.toLowerCase();
  if (ua.includes('vscode') || ua.includes('copilot')) return 'vscode';
  if (ua.includes('cursor')) return 'cursor';
  if (ua.includes('antigravity') || ua.includes('holoscript')) return 'antigravity';
  return 'unknown';
}

function inferHardwareTarget(hint: string | null): string {
  if (!hint) return 'unknown';
  const h = hint.toLowerCase();
  if (h.includes('quest') || h.includes('openxr') || h.includes('android-xr')) return 'desktop-vr';
  if (h.includes('mobile') || h.includes('android') || h.includes('ios')) return 'mobile-xr';
  if (h.includes('vision') || h.includes('visionos')) return 'visionos';
  if (h.includes('edge') || h.includes('iot') || h.includes('raspberry') || h.includes('jetson'))
    return 'edge-iot';
  if (h.includes('desktop') || h.includes('pc') || h.includes('mac')) return 'desktop-vr';
  return 'unknown';
}

function checkPath(filePath: string): 'pass' | 'fail' {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return 'pass';
  } catch {
    return 'fail';
  }
}

async function probeKnowledgeEndpoint(): Promise<{
  status: 'pass' | 'fail';
  entry_count?: number;
}> {
  try {
    const headers: Record<string, string> = {};
    if (MCP_API_KEY) headers['x-mcp-api-key'] = MCP_API_KEY;
    const res = await fetch(`${KNOWLEDGE_ENDPOINT}/health`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { status: 'fail' };
    const body = await res.json().catch(() => ({}));
    return { status: 'pass', entry_count: body.knowledge_entries ?? undefined };
  } catch {
    return { status: 'fail' };
  }
}

function checkTelemetryWritable(): 'pass' | 'fail' {
  try {
    const dir = path.dirname(ORACLE_TELEMETRY_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return 'pass';
  } catch {
    return 'fail';
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    tier?: string;
    hardware_hint?: string;
  };

  const tier: string = body.tier || request.headers.get('x-absorb-tier') || 'free';

  const ideClient = inferIdeClient(request);
  const hardwareTarget = inferHardwareTarget(body.hardware_hint || null);

  // ── Enterprise: always on — skip all prerequisite checks ─────────────────
  if (tier === 'enterprise') {
    return NextResponse.json({
      oracle_ready: true,
      always_on: true,
      tier,
      ide_client: ideClient,
      hardware_target: hardwareTarget,
      checks: {
        north_star_md: 'skipped',
        claude_md: 'skipped',
        hardware_policy: 'skipped',
        knowledge_endpoint: 'skipped',
        telemetry_writable: 'skipped',
      },
      message: 'Enterprise tier: Oracle Boost is always active.',
    });
  }

  // ── All other tiers: validate prerequisites ───────────────────────────────
  const homeDir = os.homedir();
  const northStarPath = path.join(homeDir, '.claude', 'NORTH_STAR.md');
  const claudeMdPath = path.join(homeDir, '.claude', 'CLAUDE.md');
  const hardwarePolicyPath = path.join(homeDir, '.claude', 'NORTH_STAR_HARDWARE.md');

  const [northStarCheck, claudeMdCheck, hardwarePolicyCheck, knowledgeCheck, telemetryCheck] =
    await Promise.all([
      Promise.resolve(checkPath(northStarPath)),
      Promise.resolve(checkPath(claudeMdPath)),
      Promise.resolve(checkPath(hardwarePolicyPath)),
      probeKnowledgeEndpoint(),
      Promise.resolve(checkTelemetryWritable()),
    ]);

  const checks = {
    north_star_md: northStarCheck,
    claude_md: claudeMdCheck,
    hardware_policy: hardwarePolicyCheck,
    knowledge_endpoint: knowledgeCheck.status,
    knowledge_endpoint_entry_count: knowledgeCheck.entry_count,
    telemetry_writable: telemetryCheck,
  };

  const critical = [northStarCheck, claudeMdCheck, knowledgeCheck.status];
  const oracle_ready = critical.every((c) => c === 'pass');

  return NextResponse.json({
    oracle_ready,
    always_on: false,
    tier,
    ide_client: ideClient,
    hardware_target: hardwareTarget,
    checks,
    ...(oracle_ready
      ? {}
      : {
          message:
            'Oracle Boost prerequisites incomplete. Run POST /api/studio/oracle-boost/setup to resolve.',
        }),
  });
}
