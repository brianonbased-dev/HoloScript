#!/usr/bin/env node
/**
 * HoloScript Canary Harness
 *
 * Reliable MCP/REST/A2A/CLI canary harness with per-probe subprocess timeouts.
 * Avoids AbortController hang by isolating each probe in its own child process.
 *
 * Environment:
 *   CANARY_LIVE=1              Enable live-service probes (default: source-tree only)
 *   CANARY_BASE_URL            Target base URL (default: https://mcp.holoscript.net)
 *   CANARY_TIMEOUT_MS          Per-probe timeout (default: 15000)
 *   CANARY_OUTPUT              JSON artifact path (default: .canary/canary-report.json)
 *   CANARY_FILE_BOARD_TASKS=1  File board tasks on failure
 *   HOLOSCRIPT_API_KEY         Auth for live probes and board filing
 *   HOLOMESH_API_KEY           Fallback auth key
 *   HOLOMESH_TEAM_ID           Team ID for board filing
 *
 * Usage:
 *   node scripts/canary-harness.mjs
 *   CANARY_LIVE=1 node scripts/canary-harness.mjs
 *   CANARY_LIVE=1 CANARY_OUTPUT=/tmp/canary.json node scripts/canary-harness.mjs
 */

import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';

// ─── Configuration ───────────────────────────────────────────────────────────

const LIVE = process.env.CANARY_LIVE === '1' || process.env.MCP_CANARY_LIVE === '1';
const BASE_URL = (process.env.CANARY_BASE_URL || 'https://mcp.holoscript.net').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.CANARY_TIMEOUT_MS || '15000', 10);
const OUTPUT_DIR = resolve(process.env.CANARY_OUTPUT_DIR || '.canary');
const OUTPUT_PATH = resolve(process.env.CANARY_OUTPUT || `${OUTPUT_DIR}/canary-report.json`);
const FILE_BOARD_TASKS = process.env.CANARY_FILE_BOARD_TASKS === '1';
const API_KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID || '';

// ─── Secret Redaction ────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /[a-zA-Z0-9_-]{32,}/g, // long tokens (over-eager fallback)
  /(?:api[_-]?key|token|bearer|password|secret|x402)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{8,}['"]?/gi,
];

function redact(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, (m) => {
      if (/^(true|false|null|\d+|\{|\}|\[|\])$/.test(m)) return m;
      if (m.length < 12) return m;
      return m.slice(0, 4) + '...[REDACTED]';
    });
  }
  return out;
}

// ─── Probe Runner (subprocess isolation) ─────────────────────────────────────

async function runProbe(name, payloadFn, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const probeScript = `
      const done = (ok, status, body, error) => {
        process.stdout.write(JSON.stringify({ ok, status, body, error }));
        process.exit(0);
      };
      (async () => {
        try {
          ${payloadFn}
        } catch (err) {
          done(false, null, null, err.message);
        }
      })();
    `;

    const child = spawn(process.execPath, ['-e', probeScript], {
      timeout: timeoutMs,
      env: { ...process.env },
      cwd: REPO_ROOT,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      resolve({
        name,
        ok: false,
        status: null,
        duration: Date.now() - started,
        error: `spawn error: ${err.message}`,
        stderr: redact(stderr),
      });
    });

    child.on('close', (code, signal) => {
      const duration = Date.now() - started;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        resolve({
          name,
          ok: false,
          status: null,
          duration,
          error: `probe timed out (>${TIMEOUT_MS}ms) — subprocess ${signal}`,
          stderr: redact(stderr),
        });
        return;
      }

      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop() || stdout.trim());
      } catch {
        // Non-JSON fallback
      }

      if (parsed && typeof parsed.ok === 'boolean') {
        resolve({
          name,
          ok: parsed.ok,
          status: parsed.status,
          duration,
          error: parsed.error ? redact(parsed.error) : null,
          body: parsed.body ? redact(JSON.stringify(parsed.body)).slice(0, 500) : null,
          stderr: redact(stderr),
        });
      } else {
        resolve({
          name,
          ok: code === 0,
          status: null,
          duration,
          error: code !== 0 ? redact(stderr || `exit ${code}`) : null,
          stderr: redact(stderr),
        });
      }
    });
  });
}

// ─── Retry Wrapper ───────────────────────────────────────────────────────────

async function runWithRetry(name, payloadFn, retries = 2) {
  let lastResult;
  for (let i = 0; i <= retries; i++) {
    lastResult = await runProbe(name, payloadFn);
    if (lastResult.ok) return lastResult;
    if (i < retries) {
      const delay = 500 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return lastResult;
}

// ─── Batched Concurrency ───────────────────────────────────────────────────

async function runInBatches(probes, batchSize = 3) {
  const results = [];
  for (let i = 0; i < probes.length; i += batchSize) {
    const batch = probes.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    for (const r of batchResults) {
      results.push(r);
      const icon = r.ok ? '✅' : '❌';
      const time = `${r.duration}ms`;
      console.log(`${icon} ${r.name} (${time})${r.error ? ' — ' + r.error : ''}`);
    }
  }
  return results;
}

// ─── HTTP Probe Payload Builders ─────────────────────────────────────────────

function nodeFetchGetProbe(urlPath, extraHeaders = {}, baseUrl = BASE_URL) {
  const headers = JSON.stringify(extraHeaders).replace(/'/g, "\\'");
  return `
    fetch('${baseUrl}${urlPath}', {
      method: 'GET',
      headers: ${headers},
      signal: AbortSignal.timeout(${TIMEOUT_MS - 2000})
    }).then(async r => {
      const text = await r.text();
      done(r.ok, r.status, text.slice(0, 500), null);
    }).catch(err => {
      done(false, null, null, err.message);
    });
  `;
}

function nodeFetchPostProbe(urlPath, bodyObj, extraHeaders = {}, baseUrl = BASE_URL) {
  const body = JSON.stringify(bodyObj);
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  return `
    fetch('${baseUrl}${urlPath}', {
      method: 'POST',
      headers: ${JSON.stringify(headers)},
      body: ${JSON.stringify(body)},
      signal: AbortSignal.timeout(${TIMEOUT_MS - 2000})
    }).then(async r => {
      const text = await r.text();
      done(r.ok, r.status, text.slice(0, 500), null);
    }).catch(err => {
      done(false, null, null, err.message);
    });
  `;
}

// ─── Probes ──────────────────────────────────────────────────────────────────

const MINIMAL_HOLO = `node "MinimalCanary" {
  type: "mesh"
}`;

function buildLiveProbes() {
  const probes = [];
  const probe = (name, payload) => runWithRetry(name, payload, 2);

  // 1. Health
  probes.push(probe('health', nodeFetchGetProbe('/health')));

  // 2. Well-known MCP
  probes.push(probe('well-known-mcp', nodeFetchGetProbe('/.well-known/mcp')));

  // 3. MCP public parse (no auth required — verifies endpoint is reachable)
  probes.push(
    probe(
      'mcp-public-parse',
      nodeFetchPostProbe('/mcp', {
        jsonrpc: '2.0',
        id: 0,
        method: 'tools/call',
        params: { name: 'parse_hs', arguments: { code: 'node "A" { type: "mesh" }' } },
      })
    )
  );

  // 4. MCP tools/list (JSON-RPC over HTTP POST /mcp)
  probes.push(
    probe(
      'mcp-tools-list',
      nodeFetchPostProbe(
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 4. MCP get_tool_manifest
  probes.push(
    probe(
      'mcp-get-tool-manifest',
      nodeFetchPostProbe(
        '/mcp',
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'get_tool_manifest', arguments: {} },
        },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 5. MCP direct compile
  probes.push(
    probe(
      'mcp-direct-compile',
      nodeFetchPostProbe(
        '/mcp',
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'compile_holoscript',
            arguments: { code: MINIMAL_HOLO, target: 'r3f' },
          },
        },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 6. MCP batch compile failure (invalid target should error)
  probes.push(
    probe(
      'mcp-batch-compile-failure',
      nodeFetchPostProbe(
        '/mcp',
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'batch_tool_call',
            arguments: {
              calls: [
                {
                  name: 'compile_holoscript',
                  arguments: { code: MINIMAL_HOLO, target: 'nonexistent-target-xyz' },
                },
              ],
            },
          },
        },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 7. REST compile
  probes.push(
    probe(
      'rest-compile',
      nodeFetchPostProbe(
        '/api/compile',
        { code: MINIMAL_HOLO, target: 'r3f' },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 8. REST render
  probes.push(
    probe(
      'rest-render',
      nodeFetchPostProbe(
        '/api/render',
        { code: MINIMAL_HOLO, format: 'png', resolution: [400, 300] },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 9. REST deploy
  probes.push(
    probe(
      'rest-deploy',
      nodeFetchPostProbe(
        '/api/deploy',
        { code: MINIMAL_HOLO, title: 'canary-deploy' },
        { 'x-mcp-api-key': API_KEY }
      )
    )
  );

  // 10. A2A discovery
  probes.push(probe('a2a-discovery', nodeFetchGetProbe('/a2a')));

  // 11. A2A JSON-RPC
  probes.push(
    probe(
      'a2a-jsonrpc',
      nodeFetchPostProbe('/a2a', {
        jsonrpc: '2.0',
        id: 5,
        method: 'a2a.getExtendedAgentCard',
        params: {},
      })
    )
  );

  // 12. Quickstart
  probes.push(probe('quickstart', nodeFetchGetProbe('/api/holomesh/quickstart')));

  // 13. REST extended health
  probes.push(probe('rest-api-health', nodeFetchGetProbe('/api/health')));

  // 14. REST metrics (Prometheus)
  probes.push(probe('rest-metrics', nodeFetchGetProbe('/metrics')));

  // 15. A2A task lifecycle
  probes.push(
    probe(
      'a2a-task-lifecycle',
      nodeFetchPostProbe('/a2a', {
        jsonrpc: '2.0',
        id: 6,
        method: 'a2a.sendTask',
        params: {
          task: {
            id: 'canary-task-' + Date.now(),
            sessionId: 'canary-session',
            message: { role: 'user', parts: [{ text: 'canary ping' }] },
            acceptedAgents: ['holoscript-canary'],
          },
        },
      })
    )
  );

  return probes;
}

// ─── External Surface Probes ─────────────────────────────────────────────────

const EXTERNAL_SURFACES = {
  absorb: {
    base: 'https://absorb.holoscript.net',
    healthPath: '/health',
    authHeader: null, // absorb uses its own API key or none for health
  },
  orchestrator: {
    base: 'https://mcp-orchestrator-production-45f9.up.railway.app',
    healthPath: '/health',
    authHeader: { 'x-mcp-api-key': API_KEY },
  },
  studio: {
    base: 'https://holoscript.studio',
    healthPath: '/',
    authHeader: null,
  },
};

function buildExternalProbes() {
  const probes = [];
  const probe = (name, payload) => runWithRetry(name, payload, 2);

  // 1. Absorb health — no auth, JSON response, uptime + database fields
  probes.push(
    probe(
      'external-absorb-health',
      nodeFetchGetProbe('/health', {}, EXTERNAL_SURFACES.absorb.base)
    )
  );

  // 2. Absorb scan endpoint — POST with API key, expects JSON (shape: heavy payload)
  probes.push(
    probe(
      'external-absorb-scan',
      nodeFetchPostProbe(
        '/api/absorb/scan',
        { repoUrl: 'https://github.com/holoscript/holoscript', shallow: true },
        { 'x-absorb-api-key': process.env.ABSORB_API_KEY || '' },
        EXTERNAL_SURFACES.absorb.base
      )
    )
  );

  // 3. Orchestrator health — auth required, nested checks object
  probes.push(
    probe(
      'external-orchestrator-health',
      nodeFetchGetProbe('/health', EXTERNAL_SURFACES.orchestrator.authHeader, EXTERNAL_SURFACES.orchestrator.base)
    )
  );

  // 4. Studio availability — HEAD request (lightweight shape, no body)
  probes.push(
    probe(
      'external-studio-availability',
      `
        fetch('${EXTERNAL_SURFACES.studio.base}/', {
          method: 'HEAD',
          signal: AbortSignal.timeout(${TIMEOUT_MS - 2000})
        }).then(async r => {
          done(r.ok, r.status, null, null);
        }).catch(err => {
          done(false, null, null, err.message);
        });
      `
    )
  );

  // 5. Studio HTML landing — GET, text/html response (different content-type shape)
  probes.push(
    probe(
      'external-studio-html',
      `
        fetch('${EXTERNAL_SURFACES.studio.base}/', {
          method: 'GET',
          headers: { 'Accept': 'text/html' },
          signal: AbortSignal.timeout(${TIMEOUT_MS - 2000})
        }).then(async r => {
          const text = await r.text();
          const hasHtml = text.toLowerCase().includes('<!doctype html>') || text.toLowerCase().includes('<html');
          done(r.ok && hasHtml, r.status, text.slice(0, 200), hasHtml ? null : 'missing html doctype');
        }).catch(err => {
          done(false, null, null, err.message);
        });
      `
    )
  );

  return probes;
}

function buildSourceTreeProbes() {
  const probes = [];

  // 13. CLI help (source-tree bootstrap)
  probes.push(
    runProbe(
      'cli-help',
      `
        const { spawn } = require('child_process');
        const child = spawn('"' + process.execPath + '"', ['packages/cli/bin/holoscript.cjs', '--help'], {
          cwd: '${REPO_ROOT.replace(/\\/g, '\\\\')}',
          timeout: ${TIMEOUT_MS},
          shell: ${IS_WIN},
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('error', e => done(false, null, null, e.message));
        child.on('close', code => {
          const ok = code === 0 && out.includes('Usage:');
          done(ok, null, out.slice(0, 500), ok ? null : (err || 'CLI help missing'));
        });
      `
    )
  );

  // 14. CLI build check (verify dist exists)
  probes.push(
    runProbe(
      'cli-dist-exists',
      `
        const fs = require('fs');
        const ok = fs.existsSync('packages/cli/dist/cli.js');
        done(ok, null, null, ok ? null : 'packages/cli/dist/cli.js missing — run pnpm --filter @holoscript/cli build');
      `
    )
  );

  // 15. Provenance gate: artifact-admission-gate has package + receipt validators
  probes.push(
    runProbe(
      'provenance-gate-package-receipt',
      `
        const fs = require('fs');
        const path = require('path');
        const gatePath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'mcp-server', 'src', 'conformance', 'artifact-admission-gate.ts');
        const content = fs.readFileSync(gatePath, 'utf8');
        const hasPackageValidator = content.includes('validatePackageAdmission');
        const hasReceiptValidator = content.includes('validateReceiptAdmission');
        const hasPackageSwitch = content.includes("case 'package':");
        const ok = hasPackageValidator && hasReceiptValidator && hasPackageSwitch;
        done(ok, null, null, ok ? null : 'artifact-admission-gate.ts missing package/receipt validators');
      `
    )
  );

  // 16. Provenance gate: PluginInstallPipeline verifySignature is still a stub
  probes.push(
    runProbe(
      'provenance-plugin-verify-stub',
      `
        const fs = require('fs');
        const path = require('path');
        const pipelinePath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'marketplace-api', 'src', 'PluginInstallPipeline.ts');
        const content = fs.readFileSync(pipelinePath, 'utf8');
        const hasStub = content.includes('return undefined;') && content.includes('verifySignature');
        done(!hasStub, null, null, hasStub ? 'PluginInstallPipeline.verifySignature is still a stub returning undefined' : null);
      `
    )
  );

  // 17. Provenance gate: marketplace signatureStatus hardcoded to unsigned
  probes.push(
    runProbe(
      'provenance-marketplace-unsigned',
      `
        const fs = require('fs');
        const path = require('path');
        const servicePath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'marketplace-api', 'src', 'PluginMarketplaceService.ts');
        const content = fs.readFileSync(servicePath, 'utf8');
        const hardcodedCount = (content.match(/signatureStatus: 'unsigned'/g) || []).length;
        done(hardcodedCount < 3, null, null, hardcodedCount >= 3 ? 'PluginMarketplaceService hardcodes signatureStatus: unsigned in ' + hardcodedCount + ' places' : null);
      `
    )
  );

  // 18. Provenance gate: hololand-receipts exports PackageProvenanceReceipt
  probes.push(
    runProbe(
      'provenance-receipt-type-exported',
      `
        const fs = require('fs');
        const path = require('path');
        const receiptsPath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'framework', 'src', 'board', 'hololand-receipts.ts');
        const content = fs.readFileSync(receiptsPath, 'utf8');
        const hasType = content.includes('PackageProvenanceReceipt');
        const hasValidator = content.includes('validatePackageProvenanceReceipt');
        done(hasType && hasValidator, null, null, (!hasType || !hasValidator) ? 'hololand-receipts.ts missing PackageProvenanceReceipt or validator' : null);
      `
    )
  );

  // 19. Fork sandbox gate: canary tests pass
  probes.push(
    runProbe(
      'fork-sandbox-canary-tests',
      `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [
          'node_modules/vitest/vitest.mjs',
          'run',
          'packages/mcp-server/src/__tests__/fork-sandbox-canary.test.ts'
        ], {
          cwd: '${REPO_ROOT.replace(/\\/g, '\\\\')}',
          timeout: 60000,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('error', e => done(false, null, null, e.message));
        child.on('close', code => {
          const ok = code === 0 && out.includes('passed');
          done(ok, null, out.slice(0, 500), ok ? null : (err || 'fork-sandbox-canary tests failed'));
        });
      `,
      60000
    )
  );

  // 20. Fork sandbox gate: unit tests pass
  probes.push(
    runProbe(
      'fork-sandbox-unit-tests',
      `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [
          'node_modules/vitest/vitest.mjs',
          'run',
          'packages/mcp-server/src/__tests__/fork-sandbox-gate.test.ts'
        ], {
          cwd: '${REPO_ROOT.replace(/\\/g, '\\\\')}',
          timeout: 60000,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('error', e => done(false, null, null, e.message));
        child.on('close', code => {
          const ok = code === 0 && out.includes('passed');
          done(ok, null, out.slice(0, 500), ok ? null : (err || 'fork-sandbox-gate unit tests failed'));
        });
      `,
      60000
    )
  );

  // 21. Fork sandbox gate: PluginManager passes manifest
  probes.push(
    runProbe(
      'fork-sandbox-plugin-manifest-passed',
      `
        const fs = require('fs');
        const path = require('path');
        const pmPath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'mcp-server', 'src', 'PluginManager.ts');
        const content = fs.readFileSync(pmPath, 'utf8');
        const passesManifest = content.includes('gatePluginRegistration(gateManifest)') && content.includes('...manifest');
        done(passesManifest, null, null, passesManifest ? null : 'PluginManager does not pass plugin manifest to fork-sandbox gate');
      `
    )
  );

  // 22. Fork sandbox gate: handlers.ts wires the gate
  probes.push(
    runProbe(
      'fork-sandbox-handlers-wired',
      `
        const fs = require('fs');
        const path = require('path');
        const handlersPath = path.join('${REPO_ROOT.replace(/\\/g, '\\\\')}', 'packages', 'mcp-server', 'src', 'handlers.ts');
        const content = fs.readFileSync(handlersPath, 'utf8');
        const hasGate = content.includes('runForkSandboxGate') && content.includes('gateHoloScriptCode');
        done(hasGate, null, null, hasGate ? null : 'handlers.ts missing fork-sandbox gate wiring');
      `
    )
  );

  // 23. Cross-surface substrate drift canary
  probes.push(
    runProbe(
      'cross-surface-drift-canary',
      `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [
          'scripts/__tests__/cross-surface-drift-canary.test.mjs'
        ], {
          cwd: '${REPO_ROOT.replace(/\\/g, '\\\\')}',
          timeout: 60000,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('error', e => done(false, null, null, e.message));
        child.on('close', code => {
          const ok = code === 0 && out.includes('PASSED');
          done(ok, null, out.slice(0, 500), ok ? null : (err || 'cross-surface drift canary failed'));
        });
      `,
      60000
    )
  );

  // 24. D.040 sovereign trait canary
  probes.push(
    runProbe(
      'd040-sovereign-trait-canary',
      `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [
          'scripts/__tests__/d040-sovereign-trait-canary.test.mjs'
        ], {
          cwd: '${REPO_ROOT.replace(/\\/g, '\\\\')}',
          timeout: 30000,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('error', e => done(false, null, null, e.message));
        child.on('close', code => {
          const ok = code === 0 && out.includes('PASSED');
          done(ok, null, out.slice(0, 500), ok ? null : (err || 'D.040 sovereign trait canary failed'));
        });
      `,
      30000
    )
  );

  return probes;
}

// ─── Board Task Filing ───────────────────────────────────────────────────────

async function fileBoardTask(title, description) {
  if (!FILE_BOARD_TASKS || !API_KEY || !TEAM_ID) return;
  const api = 'https://mcp.holoscript.net/api/holomesh';
  const body = JSON.stringify({
    tasks: [
      {
        title,
        description: redact(description).slice(0, 1990),
        priority: 4,
        tags: ['canary', 'auto-filed', 'ops'],
      },
    ],
  });

  const probeScript = `
    fetch('${api}/team/${TEAM_ID}/board', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || ''), 'Content-Type': 'application/json' },
      body: '${body.replace(/'/g, "\\'")}',
      signal: AbortSignal.timeout(10000)
    }).then(async r => {
      const text = await r.text();
      done(r.ok, r.status, text.slice(0, 500), null);
    }).catch(err => {
      done(false, null, null, err.message);
    });
  `;

  return runProbe('board-file', probeScript);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  // results populated by runInBatches

  console.log('[canary] HoloScript Canary Harness');
  console.log(`  mode: ${LIVE ? 'live-service' : 'source-tree'}`);
  console.log(`  base: ${LIVE ? BASE_URL : REPO_ROOT}`);
  console.log(`  timeout: ${TIMEOUT_MS}ms`);
  console.log(`  output: ${OUTPUT_PATH}`);
  console.log();

  const probes = [
    ...buildSourceTreeProbes(),
    ...(LIVE ? buildLiveProbes() : []),
    ...(LIVE ? buildExternalProbes() : []),
  ];

  const results = await runInBatches(probes, 3);

  const failed = results.filter((r) => !r.ok);
  const report = {
    timestamp: new Date().toISOString(),
    mode: LIVE ? 'live-service' : 'source-tree',
    baseUrl: LIVE ? BASE_URL : undefined,
    repoRoot: REPO_ROOT,
    timeoutMs: TIMEOUT_MS,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    probes: results.map((r) => ({
      name: r.name,
      ok: r.ok,
      status: r.status,
      duration: r.duration,
      error: r.error,
      body: r.body,
      stderr: r.stderr,
    })),
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n[canary] Report written to ${OUTPUT_PATH}`);

  if (failed.length > 0) {
    console.error(`\n[canary] FAILURES: ${failed.length}/${results.length}`);
    const names = failed.map((f) => f.name).join(', ');

    if (FILE_BOARD_TASKS) {
      console.log('[canary] Filing board task...');
      const task = await fileBoardTask(
        `[canary] ${failed.length} probe(s) failed: ${names}`,
        `Canary run at ${report.timestamp} failed on: ${names}\n\nDetails:\n${failed
          .map((f) => `- ${f.name}: ${f.error || 'unknown'}`)
          .join('\n')}\n\nArtifact: ${OUTPUT_PATH}`
      );
      console.log(`[canary] Board task: ${task.ok ? 'filed' : 'FAILED to file'}`);
    }

    process.exit(1);
  }

  const elapsed = Date.now() - started;
  console.log(`\n[canary] All ${results.length} probes passed in ${elapsed}ms.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[canary] Fatal:', err);
  process.exit(1);
});
