/**
 * P.008.05 — Terminal ops dashboard for MCP HTTP `/ops/status` (+ optional `/ops/lb-weights`).
 *
 * Usage:
 *   pnpm exec tsx docs/ops/admin-cli.ts [--url=http://127.0.0.1:3000] [--interval=5000] [--once] [--mock]
 *
 * Requires `GET /ops/status` (see packages/mcp-server/src/ops/tool-ops-status.ts).
 * `GET /ops/lb-weights` is optional; failures are shown as a single warning line.
 */

export type OpsOverallStatus = 'healthy' | 'degraded' | 'critical';

export interface OpsStatusPayload {
  status: OpsOverallStatus;
  timestamp: string;
  uptimeSeconds: number;
  replicaCount: number;
  regions: Array<{ id: string; status: string; detail?: string }>;
  anomaly: { activeAnomalies: number };
  securedTools: { requests: number; errors: number; errorRate: number };
  circuitBreakers: Array<{
    target: string;
    state: string;
    failureRate: number;
    totalRequests: number;
  }>;
}

export interface LbWeightsSnapshot {
  backends: string[];
  normalizedWeights: Record<string, number>;
  cloudflareOriginWeights?: Record<string, number>;
  updatedAt: string;
  poolId: string;
  dryRun: boolean;
  lastError?: string;
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  clear: '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '\u2026';
}

function colorOverall(status: OpsOverallStatus): string {
  if (status === 'healthy') return ANSI.green + status + ANSI.reset;
  if (status === 'degraded') return ANSI.yellow + status + ANSI.reset;
  return ANSI.red + status + ANSI.reset;
}

function colorRegion(st: string): string {
  if (st === 'healthy') return ANSI.green + st + ANSI.reset;
  if (st === 'unknown') return ANSI.dim + st + ANSI.reset;
  if (st === 'degraded') return ANSI.yellow + st + ANSI.reset;
  return ANSI.red + st + ANSI.reset;
}

/** Single screen — no external TUI deps; ANSI only. */
export function renderDashboard(
  status: OpsStatusPayload,
  lb: LbWeightsSnapshot | null,
  lbError: string | null,
  cols: number
): string {
  const w = Math.max(40, Math.min(cols, 100));
  const line = (s: string) => truncate(s, w);
  const bar = '-'.repeat(Math.min(w, 72));

  const lines: string[] = [
    ANSI.bold + ' HoloScript ops dashboard (P.008.05) ' + ANSI.reset,
    ANSI.dim + bar + ANSI.reset,
    line(` Overall: ${colorOverall(status.status)}   Replicas: ${status.replicaCount}   Uptime: ${Math.floor(status.uptimeSeconds)}s `),
    line(` Snapshot: ${status.timestamp} `),
    line(` Anomalies (active): ${status.anomaly.activeAnomalies} `),
    line(
      ` Secured tools: requests=${status.securedTools.requests} errors=${status.securedTools.errors} rate=${(status.securedTools.errorRate * 100).toFixed(2)}% `
    ),
    ANSI.dim + bar + ANSI.reset,
    ANSI.cyan + ' Regions' + ANSI.reset,
  ];

  for (const r of status.regions) {
    const det = r.detail ? ` (${r.detail})` : '';
    lines.push(line(`  ${r.id.padEnd(12)} ${colorRegion(r.status)}${truncate(det, w - 18)}`));
  }

  lines.push(ANSI.dim + bar + ANSI.reset);
  lines.push(ANSI.cyan + ' Circuit breakers (export targets)' + ANSI.reset);
  for (const c of status.circuitBreakers) {
    lines.push(
      line(
        `  ${String(c.target).padEnd(10)} state=${c.state} failRate=${(c.failureRate * 100).toFixed(1)}% n=${c.totalRequests}`
      )
    );
  }

  lines.push(ANSI.dim + bar + ANSI.reset);
  lines.push(ANSI.cyan + ' Load balancer weights' + ANSI.reset);
  if (lbError) {
    lines.push(line(`  ${ANSI.yellow}(lb-weights unavailable) ${lbError}${ANSI.reset}`));
  } else if (lb) {
    lines.push(
      line(
        `  pool=${lb.poolId} dryRun=${lb.dryRun} updated=${lb.updatedAt}${lb.lastError ? ` err=${lb.lastError}` : ''}`
      )
    );
    const pairs = Object.entries(lb.normalizedWeights || {})
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`)
      .join('  ');
    lines.push(line(`  normalized: ${truncate(pairs, w - 4)}`));
    if (lb.cloudflareOriginWeights && Object.keys(lb.cloudflareOriginWeights).length) {
      const cf = Object.entries(lb.cloudflareOriginWeights)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
        .join('  ');
      lines.push(line(`  cloudflare: ${truncate(cf, w - 4)}`));
    }
  } else {
    lines.push(line(`  ${ANSI.dim}(no lb-weights payload)${ANSI.reset}`));
  }

  lines.push(ANSI.dim + bar + ANSI.reset);
  lines.push(
    line(
      ` ${ANSI.dim}Last scaling event:${ANSI.reset} not on /ops/status — use replicaCount + Railway/autoscale logs. Ctrl+C exit. `
    )
  );

  return lines.join('\n') + '\n';
}

export function joinBase(base: string): string {
  return base.replace(/\/+$/, '');
}

export async function fetchJson<T>(url: string): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function pollOnce(base: string): Promise<{ text: string; status: OpsStatusPayload }> {
  const b = joinBase(base);
  const status = await fetchJson<OpsStatusPayload>(`${b}/ops/status`);
  let lb: LbWeightsSnapshot | null = null;
  let lbError: string | null = null;
  try {
    lb = await fetchJson<LbWeightsSnapshot>(`${b}/ops/lb-weights`);
  } catch (e) {
    lbError = e instanceof Error ? e.message : String(e);
  }
  const cols = typeof process.stdout?.columns === 'number' ? process.stdout.columns : 80;
  const text = renderDashboard(status, lb, lbError, cols);
  return { text, status };
}

export function mockOpsStatus(): OpsStatusPayload {
  return {
    status: 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: 3600,
    replicaCount: 3,
    regions: [
      { id: 'us-west', status: 'healthy' },
      { id: 'eu-west', status: 'degraded', detail: 'http_502' },
      { id: 'ap-east', status: 'unknown', detail: 'no_health_url_configured' },
    ],
    anomaly: { activeAnomalies: 1 },
    securedTools: { requests: 1000, errors: 40, errorRate: 0.04 },
    circuitBreakers: [
      { target: 'r3f', state: 'closed', failureRate: 0.01, totalRequests: 200 },
      { target: 'unity', state: 'open', failureRate: 0.55, totalRequests: 50 },
    ],
  };
}

export function mockLb(): LbWeightsSnapshot {
  return {
    backends: ['us-west', 'eu-west', 'ap-east'],
    normalizedWeights: { 'us-west': 0.45, 'eu-west': 0.35, 'ap-east': 0.2 },
    updatedAt: new Date().toISOString(),
    poolId: 'pool_demo',
    dryRun: true,
  };
}

function parseArgs(argv: string[]) {
  let base = process.env.MCP_OPS_BASE_URL || 'http://127.0.0.1:3000';
  let intervalMs = 5000;
  let once = false;
  let mock = false;
  for (const a of argv) {
    if (a.startsWith('--url=')) base = a.slice(6);
    else if (a.startsWith('--interval=')) intervalMs = Math.max(1000, parseInt(a.slice(11), 10) || 5000);
    else if (a === '--once') once = true;
    else if (a === '--mock') mock = true;
  }
  return { base, intervalMs, once, mock };
}

async function runCli() {
  const { base, intervalMs, once, mock } = parseArgs(process.argv.slice(2));
  if (mock) {
    const t = renderDashboard(mockOpsStatus(), mockLb(), null, 80);
    process.stdout.write(t);
    return;
  }

  const paint = async () => {
    try {
      const { text } = await pollOnce(base);
      if (once) {
        process.stdout.write(text);
      } else {
        process.stdout.write(ANSI.clear + ANSI.hideCursor + text + ANSI.showCursor);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stdout.write(
        ANSI.clear +
          ANSI.red +
          '[ops-dashboard] fetch failed: ' +
          msg +
          ANSI.reset +
          `\n(base=${joinBase(base)} — try --mock or check MCP server)\n`
      );
    }
  };

  await paint();
  if (once) return;

  const id = setInterval(paint, intervalMs);

  const stop = () => {
    clearInterval(id);
    process.stdout.write(ANSI.showCursor);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.env.VITEST !== 'true') {
  void runCli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
