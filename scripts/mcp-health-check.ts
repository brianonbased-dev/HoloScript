#!/usr/bin/env npx tsx
/**
 * MCP Mesh Health Check Script
 *
 * Pings all registered MCP servers via the orchestrator and reports health status.
 * Designed to run on CI, cron, or manually via:
 *
 *   npx tsx scripts/mcp-health-check.ts
 *
 * Environment:
 *   MCP_ORCHESTRATOR_URL  - Orchestrator URL (default: https://mcp-orchestrator-production-45f9.up.railway.app)
 *   HOLOSCRIPT_API_KEY    - API key for orchestrator auth (REQUIRED)
 *
 * Exits with code 1 if any server is unhealthy.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const ORCHESTRATOR_URL =
  process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';

const API_KEY = process.env.HOLOSCRIPT_API_KEY;

if (!API_KEY) {
  console.error('ERROR: HOLOSCRIPT_API_KEY environment variable is required.');
  console.error('  Set it in .env or export HOLOSCRIPT_API_KEY=<your-key>');
  process.exit(1);
}

const TIMEOUT_MS = 8_000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface RegisteredServer {
  id?: string;
  name?: string;
  url?: string;
  command?: string;
  tools?: string[];
  lastHeartbeat?: string;
  lastSeen?: string;
  status?: string;
  [key: string]: unknown;
}

interface HealthResult {
  name: string;
  url: string;
  healthy: boolean;
  stdioMode: boolean;
  responseTimeMs: number;
  toolCount: number;
  error?: string;
  lastHeartbeat?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const start = performance.now();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-mcp-api-key': API_KEY!,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const elapsed = performance.now() - start;

  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`${label} returned ${res.status}: ${body} (${elapsed.toFixed(0)}ms)`);
  }

  return (await res.json()) as T;
}

async function probeServer(server: RegisteredServer): Promise<HealthResult> {
  const name = server.name || server.id || 'unknown';
  const url = server.url || '';
  const toolCount = server.tools?.length ?? 0;

  // Stdio-based servers have a `command` but no `url` — this is expected
  if (!url) {
    const isStdioServer = !!server.command && toolCount > 0;
    if (isStdioServer) {
      return {
        name,
        url: '(stdio)',
        healthy: true,
        stdioMode: true,
        responseTimeMs: 0,
        toolCount,
        lastHeartbeat: server.lastSeen || server.lastHeartbeat,
      };
    }
    return {
      name,
      url: '(no URL)',
      healthy: false,
      stdioMode: false,
      responseTimeMs: 0,
      toolCount,
      error: 'No URL and no command — ghost server',
    };
  }

  const healthUrl = url.replace(/\/$/, '') + '/health';

  try {
    const start = performance.now();
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const elapsed = performance.now() - start;

    if (!res.ok) {
      return {
        name,
        url,
        healthy: false,
        stdioMode: false,
        responseTimeMs: elapsed,
        toolCount,
        error: `Health endpoint returned ${res.status}`,
        lastHeartbeat: server.lastHeartbeat,
      };
    }

    return {
      name,
      url,
      healthy: true,
      stdioMode: false,
      responseTimeMs: elapsed,
      toolCount,
      lastHeartbeat: server.lastHeartbeat,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      url,
      healthy: false,
      stdioMode: false,
      responseTimeMs: 0,
      toolCount,
      error: msg,
      lastHeartbeat: server.lastHeartbeat,
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           MCP Mesh Health Check                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Orchestrator: ${ORCHESTRATOR_URL}`);
  console.log(`  API Key:      ${API_KEY!.slice(0, 8)}...`);
  console.log(`  Time:         ${new Date().toISOString()}`);
  console.log();

  // 1. Check orchestrator health
  console.log('── Orchestrator Health ──');
  try {
    const health = await fetchJson<Record<string, unknown>>(
      `${ORCHESTRATOR_URL}/health`,
      'Orchestrator /health'
    );
    console.log(`  ✅  Orchestrator is healthy`);
    if (health.uptime) console.log(`      Uptime: ${health.uptime}`);
    if (health.version) console.log(`      Version: ${health.version}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌  Orchestrator UNREACHABLE: ${msg}`);
    process.exit(1);
  }
  console.log();

  // 2. List registered servers
  console.log('── Registered Servers ──');
  let servers: RegisteredServer[];
  try {
    const raw = await fetchJson<RegisteredServer[] | { servers: RegisteredServer[] }>(
      `${ORCHESTRATOR_URL}/servers`,
      'Orchestrator /servers'
    );
    servers = Array.isArray(raw) ? raw : (raw.servers ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌  Failed to list servers: ${msg}`);
    process.exit(1);
  }

  if (servers.length === 0) {
    console.log('  ⚠️  No servers registered. Mesh is empty.');
    console.log();
    process.exit(0);
  }

  console.log(`  Found ${servers.length} registered server(s):`);
  for (const s of servers) {
    console.log(`    • ${s.name || s.id}  (${s.tools?.length ?? 0} tools)  ${s.url || '(no URL)'}`);
  }
  console.log();

  // 3. Probe each server
  console.log('── Server Health Probes ──');
  const results: HealthResult[] = [];

  for (const server of servers) {
    const result = await probeServer(server);
    results.push(result);

    const icon = result.stdioMode ? '📡' : result.healthy ? '✅' : '❌';
    const mode = result.stdioMode ? ` (stdio, ${result.toolCount} tools)` : '';
    const time = result.responseTimeMs > 0 ? ` (${result.responseTimeMs.toFixed(0)}ms)` : '';
    const heartbeat = result.lastHeartbeat ? ` | last seen: ${result.lastHeartbeat}` : '';

    console.log(`  ${icon}  ${result.name}${mode}${time}${heartbeat}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }
  console.log();

  // 4. Summary
  const healthy = results.filter((r) => r.healthy).length;
  const unhealthy = results.filter((r) => !r.healthy).length;
  const totalTools = results.reduce((sum, r) => sum + r.toolCount, 0);

  console.log('── Summary ──');
  console.log(`  Servers: ${healthy} healthy, ${unhealthy} unhealthy`);
  console.log(`  Total tools registered: ${totalTools}`);
  console.log();

  // 5. Prune ghost servers (--prune flag)
  if (args.includes('--prune')) {
    const maxAgeMs =
      parseInt(args[args.indexOf('--prune-age') + 1] || '', 10) || 7 * 24 * 60 * 60 * 1000; // default 7 days
    console.log(`── Pruning (max age: ${Math.round(maxAgeMs / 86400000)}d) ──`);

    const staleCutoff = Date.now() - maxAgeMs;
    let pruned = 0;

    for (const server of servers) {
      const lastSeen = server.lastSeen || server.lastHeartbeat;
      if (!lastSeen) continue;

      const seenAt = new Date(lastSeen).getTime();
      if (seenAt < staleCutoff) {
        const id = server.id || server.name || '';
        process.stdout.write(`  Pruning "${id}" (last seen: ${lastSeen})... `);
        try {
          const res = await fetch(`${ORCHESTRATOR_URL}/servers/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'x-mcp-api-key': API_KEY!, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          console.log(res.ok ? 'DELETED' : `FAILED (${res.status})`);
          if (res.ok) pruned++;
        } catch (err) {
          console.log(`FAILED (${err instanceof Error ? err.message : err})`);
        }
      }
    }

    console.log(`  Pruned ${pruned} stale server(s).`);
    console.log();
  }

  // 6. Send heartbeat (--heartbeat <server-id> flag)
  const heartbeatIdx = args.indexOf('--heartbeat');
  if (heartbeatIdx >= 0 && args[heartbeatIdx + 1]) {
    const serverId = args[heartbeatIdx + 1];
    console.log(`── Heartbeat for "${serverId}" ──`);

    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/heartbeat`, {
        method: 'POST',
        headers: {
          'x-mcp-api-key': API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      console.log(
        res.ok ? `  ✅ Heartbeat acknowledged` : `  ❌ Heartbeat rejected: ${res.status}`
      );
      if (body.lastSeen) console.log(`  Last seen: ${body.lastSeen}`);
    } catch (err) {
      console.log(`  ❌ Heartbeat failed: ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  if (unhealthy > 0) {
    console.log('⚠️  Some servers are unhealthy. Review the errors above.');
    process.exit(1);
  }

  console.log('✅  All servers healthy.');
}

const args = process.argv.slice(2);

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
