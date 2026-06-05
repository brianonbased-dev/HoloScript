#!/usr/bin/env node
/**
 * solver-smoke-check.mjs — fail loud if the DEPLOYED solver path is broken.
 *
 * WHY THIS EXISTS (task_1780642348529_g527, 2026-06-05):
 *   The paid solver path at mcp.holoscript.net was DOWN for ~a day and nobody
 *   noticed — solve_thermal/solve_structural returned success:false because the
 *   deployed engine couldn't load @holoscript/holoembed (a stale deployed image,
 *   built before holoembed's dist was published). The failure was invisible:
 *   - it was buried inside the MCP result envelope (content[0].text JSON), and
 *   - there was NO health probe on the solver path. It surfaced only by chance
 *     during an unrelated investigation, and was fixed only by an incidental
 *     redeploy. This probe turns that silent failure into a loud one.
 *
 * WHAT IT DOES:
 *   POSTs a known-good solve_thermal config to the live MCP endpoint, unwraps the
 *   MCP envelope, and asserts GENUINE execution — not just a 2xx, and not a stub:
 *     - success === true
 *     - caelTraceId is a real "cael:" trace (proves the solver actually ran)
 *     - device !== "CPU-stub"  (catches the key-less stub-fallback that returns
 *       success:true but ran no real physics — the billing edge flagged in g527)
 *   Any other outcome (module error, stub fallback, 401, timeout) → exit 1, loud.
 *
 * KEY RESOLUTION (HOLOSCRIPT_MCP_API_KEY — note: NOT the orchestrator key, which
 *   401s here): process.env first, then ~/.ai-ecosystem/.env, then <repo>/.env.
 *
 * Usage:
 *   node scripts/holo-ci/solver-smoke-check.mjs [--endpoint <url>] [--timeout-ms <n>]
 * Exit 0 = solver healthy (real solve). Exit 1 = broken/degraded. Exit 2 = no key/usage.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const ENDPOINT = argVal('--endpoint', 'https://mcp.holoscript.net/mcp');
const TIMEOUT_MS = Number(argVal('--timeout-ms', '60000'));

function resolveKey() {
  if (process.env.HOLOSCRIPT_MCP_API_KEY) return process.env.HOLOSCRIPT_MCP_API_KEY.trim();
  const candidates = [join(homedir(), '.ai-ecosystem', '.env'), join(process.cwd(), '.env')];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith('HOLOSCRIPT_MCP_API_KEY='));
    if (line) return line.slice('HOLOSCRIPT_MCP_API_KEY='.length).replace(/^["']|["']$/g, '').trim();
  }
  return null;
}

// Known-good config (mirrors packages/mcp-server/src/__tests__/simulation-tools.test.ts).
const CONFIG = {
  gridResolution: [3, 3, 3], domainSize: [1, 1, 1], timeStep: 0.01,
  materials: {}, defaultMaterial: 'water', boundaryConditions: [], sources: [], initialTemperature: 20,
};

// Carries an exit code; logs loud. We NEVER call process.exit() — on Windows that
// force-tears-down undici's still-closing socket and trips a libuv assertion
// (UV_HANDLE_CLOSING), masking the real code. Set process.exitCode + drain (W.683).
class SmokeFail extends Error {
  constructor(msg, detail, code = 1) { super(msg); this.code = code; this.detail = detail; }
}

async function main() {
  const KEY = resolveKey();
  if (!KEY) throw new SmokeFail('no HOLOSCRIPT_MCP_API_KEY (env, ~/.ai-ecosystem/.env, or <repo>/.env)', null, 2);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': KEY },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'solve_thermal', arguments: { config: CONFIG } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new SmokeFail(e?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS}ms` : 'request threw', e?.message || String(e));
  }

  const raw = await res.text();
  if (!res.ok) throw new SmokeFail(`HTTP ${res.status} from ${ENDPOINT}`, raw);

  let env;
  try { env = JSON.parse(raw); } catch { throw new SmokeFail('response was not JSON', raw); }
  if (env.error) throw new SmokeFail('JSON-RPC error envelope', JSON.stringify(env.error));

  // Unwrap MCP envelope: result.content[0].text holds the solver result as a JSON string.
  const text = env?.result?.content?.[0]?.text;
  if (!text) throw new SmokeFail('no result.content[0].text in envelope', raw);
  let r;
  try { r = JSON.parse(text); } catch { throw new SmokeFail('inner result text not JSON', text); }

  if (r.success !== true) throw new SmokeFail('solver returned success!=true', r.error || JSON.stringify(r));
  const trace = r.caelTraceId || r.cael_trace_id;
  if (typeof trace !== 'string' || !trace.startsWith('cael')) throw new SmokeFail('no real caelTraceId (solver did not genuinely execute)', JSON.stringify(r).slice(0, 300));
  const device = r._device || r.device || r?.result_summary?.device;
  if (device === 'CPU-stub') throw new SmokeFail('solver fell back to CPU-stub (no real physics ran — billing edge)', JSON.stringify(r).slice(0, 300));

  console.log(`[solver-smoke] OK — solve_thermal genuine execution. caelTraceId=${trace}${device ? ` device=${device}` : ''}`);
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    const code = e instanceof SmokeFail ? e.code : 1;
    console.error(`[solver-smoke] FAIL(${code}): ${e.message}`);
    if (e.detail) console.error('  ' + String(e.detail).slice(0, 600));
    process.exitCode = code;
  });
