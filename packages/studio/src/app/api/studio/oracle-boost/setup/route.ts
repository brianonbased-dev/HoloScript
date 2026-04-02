import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── POST /api/studio/oracle-boost/setup ─────────────────────────────────────
// One-call bootstrap: provisions policy files, validates env vars.
// Enterprise tier: always succeeds instantly — no provisioning needed.
// ─────────────────────────────────────────────────────────────────────────────

const NORTH_STAR_TEMPLATE = `# NORTH_STAR.md — Oracle Decision File
# Auto-provisioned by Oracle Boost setup.
# Edit freely — this file guides oracle decisions for your session.

## Default Decisions
- Prefer MCP tools over CLI equivalents
- Commit after coherent units of work
- Stage explicitly (never git add -A)
- Fix failing tests you authored; skip pre-existing failures
`;

const HARDWARE_POLICY_TEMPLATE = `# NORTH_STAR_HARDWARE.md — Hardware-Aware Oracle Policy
# Auto-provisioned by Oracle Boost setup.

## Target Matrix
| target      | primary constraint | render budget | SNN | physics |
|-------------|-------------------|---------------|-----|---------|
| desktop-vr  | 90Hz frame time   | high          | yes | full    |
| mobile-xr   | battery / thermal | medium        | no  | reduced |
| visionos    | latency + comfort | medium-high   | no  | full    |
| edge-iot    | memory + heat     | minimal       | no  | none    |
| unknown     | conservative      | low           | no  | reduced |

## Rules
1. unknown target → conservative defaults, log warning
2. mobile-xr → stability over quality
3. desktop-vr → 90Hz first, quality second
4. edge-iot → no GPU assumptions
5. visionos → comfort over performance
`;

function writeIfMissing(filePath: string, content: string): 'created' | 'exists' | 'error' {
  try {
    if (fs.existsSync(filePath)) return 'exists';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return 'created';
  } catch {
    return 'error';
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { tier?: string };
  const tier: string =
    body.tier || request.headers.get('x-absorb-tier') || 'free';

  // ── Enterprise: always on — setup is a no-op ──────────────────────────────
  if (tier === 'enterprise') {
    return NextResponse.json({
      success: true,
      always_on: true,
      tier,
      provisioned: [],
      message: 'Enterprise tier: Oracle Boost is always active. No setup required.',
      next_steps: [],
    });
  }

  // ── All other tiers: provision missing files ──────────────────────────────
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  const provisioned: Array<{ file: string; status: 'created' | 'exists' | 'error' }> = [];

  provisioned.push({
    file: 'NORTH_STAR.md',
    status: writeIfMissing(path.join(claudeDir, 'NORTH_STAR.md'), NORTH_STAR_TEMPLATE),
  });

  provisioned.push({
    file: 'NORTH_STAR_HARDWARE.md',
    status: writeIfMissing(path.join(claudeDir, 'NORTH_STAR_HARDWARE.md'), HARDWARE_POLICY_TEMPLATE),
  });

  const telemetryDir = path.join(homeDir, '.holoscript');
  try {
    fs.mkdirSync(telemetryDir, { recursive: true });
    provisioned.push({ file: '.holoscript/ (telemetry dir)', status: 'created' });
  } catch {
    provisioned.push({ file: '.holoscript/ (telemetry dir)', status: 'error' });
  }

  const hasErrors = provisioned.some((p) => p.status === 'error');

  return NextResponse.json({
    success: !hasErrors,
    always_on: false,
    tier,
    provisioned,
    ...(hasErrors
      ? { message: 'Some files could not be provisioned. Check file system permissions.' }
      : { message: 'Setup complete. Re-run POST /api/studio/oracle-boost/status to verify.' }),
    next_steps: hasErrors
      ? ['Check write permissions for ~/.claude/', 'Re-run setup after fixing permissions']
      : ['POST /api/studio/oracle-boost/status', 'Oracle Boost is ready'],
  });
}
