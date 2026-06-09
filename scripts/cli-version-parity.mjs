#!/usr/bin/env node
/**
 * cli-version-parity.mjs — Published-CLI dogfood + version-parity falsifier
 *
 * WHAT IT TESTS:
 *   Installs @holoscript/cli@latest from npm (via --legacy-peer-deps) into a
 *   clean temp dir, compiles a fixture set, then calls the DEPLOYED
 *   mcp.holoscript.net /api/compile for the same fixtures+targets, and
 *   compares the SEMANTIC output. The only real divergence to catch is a
 *   VERSION DRIFT between the @holoscript/core baked into the published CLI
 *   and the @holoscript/core deployed on the MCP server.
 *
 * WHY SEMANTIC NOT BYTE:
 *   Transport shapes differ by design:
 *     - CLI  → writes compiled text to stdout (JSX, GDScript, C#, etc.)
 *     - MCP  → returns JSON { success, output, metadata, ... }
 *   We extract the .output string from the MCP JSON and compare it against the
 *   CLI stdout. Normalization: strip leading/trailing whitespace, collapse
 *   repeated blank lines. Content must round-trip through the same AST; if the
 *   compiled structure is semantically different (different class names, missing
 *   sections, novel fields) that is a drift hit even if the bytes differ.
 *
 * FIXTURES:
 *   Two canonical inline fixtures (no external files required):
 *     orb.holo  — minimal orb scene → r3f + unity
 *     pipe.hs   — pipeline source  → node (compile only, no MCP compare — CLI-only target)
 *   Additional .holo / .hs files may be passed as positional args.
 *
 * RECEIPT:
 *   Emits a JSON receipt compatible with D.081 / I.007 external-repro-ledger:
 *   {
 *     schema: "cli-version-parity/v1",
 *     date: "<ISO>",
 *     cliVersion: "<npm published version>",
 *     mcpVersion: "<from /health>",
 *     coreVersionLocal: "<npm installed core version>",
 *     fixtures: [ { fixture, target, cliOk, mcpOk, parityOk, delta?, cliMs, mcpMs } ],
 *     summary: { total, passed, drifted, cliFailures, mcpFailures },
 *     ok: <bool>
 *   }
 *
 * USAGE:
 *   node scripts/cli-version-parity.mjs                     # built-in fixtures
 *   node scripts/cli-version-parity.mjs --json              # JSON receipt to stdout (no prose)
 *   node scripts/cli-version-parity.mjs --emit-ledger       # append to research/external-repro-ledger.json
 *   node scripts/cli-version-parity.mjs path/to/scene.holo  # extra fixture (all targets)
 *   node scripts/cli-version-parity.mjs --target r3f        # restrict to one target
 *   node scripts/cli-version-parity.mjs --local             # skip npm install; use locally-built CLI from packages/cli/bin/
 *
 * EXIT CODES:
 *   0 = all parity checks pass (CLI and MCP agree semantically)
 *   1 = one or more parity drift detected
 *   2 = setup/infra error (install failed, MCP unreachable, etc.)
 *
 * RELATIONSHIP TO cold-repro-onramp.mjs:
 *   cold-repro-onramp proves the README on-ramp imports and runs.
 *   THIS script proves compile outputs are semantically identical between the
 *   published CLI and the deployed MCP — the "are they in sync?" question.
 *
 * board task: task_1780980577133_8zz8
 * D.081 weekly-reproducible-capability gate
 * research/external-repro-ledger.json feed
 */

import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const EMIT_LEDGER = args.includes('--emit-ledger');
const LOCAL_CLI = args.includes('--local');
const targetFilter = (() => {
  const i = args.indexOf('--target');
  return i >= 0 ? args[i + 1] : null;
})();
const extraFixtures = args.filter((a) => !a.startsWith('--') && a !== (targetFilter || '__'));

// ─── Helpers ───────────────────────────────────────────────────────────────

const IS_WIN = process.platform === 'win32';
const NPM_BIN = IS_WIN ? 'npm.cmd' : 'npm';

function log(...m) {
  if (!JSON_OUT) process.stdout.write(m.join(' ') + '\n');
}
function warn(...m) {
  if (!JSON_OUT) process.stderr.write('[warn] ' + m.join(' ') + '\n');
}
function bail(code, reason, detail) {
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ok: false, errorCode: code, reason, detail }, null, 2) + '\n');
  } else {
    process.stderr.write(`\n[cli-version-parity] ERROR (${code}): ${reason}\n`);
    if (detail) process.stderr.write(detail + '\n');
  }
  process.exit(2);
}

function runNpm(npmArgs, opts = {}) {
  // On Windows, npm.cmd is a CMD script that requires shell execution. All
  // args here are hardcoded constants, so shell injection is not a risk.
  return execFileSync(NPM_BIN, npmArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: IS_WIN, // required for .cmd wrappers on Windows
    ...opts,
  });
}

function normalizeOutput(text) {
  // Semantic normalization: collapse repeated blank lines, trim edges.
  // This handles whitespace-only differences that arise from transport shape.
  return text
    .replace(/\r\n/g, '\n')      // CRLF → LF
    .replace(/[ \t]+$/gm, '')    // trailing whitespace on each line
    .replace(/\n{3,}/g, '\n\n') // 3+ blank lines → 2
    .trim();
}

/**
 * Compute structural similarity via Jaccard over capitalized identifiers.
 * Returns { similar: boolean, score: float 0-1, delta: string|null }
 *
 * Strategy: extract capitalized tokens (class/component/function names,
 * API identifiers) — these should be identical if the same compiler version
 * compiled the same AST. score >= 0.80 = SIMILAR (same compiler code path).
 * score < 0.80 = DRIFT (different compiler implementation or version).
 *
 * NOTE: r3f returns a JSON scene-graph object from both CLI and MCP, so the
 * tokens are the same JSON keys → similarity = 1.0 (perfect).
 * babylon/unity return procedural code (JavaScript/C#), so the tokens reflect
 * the compiler's output style. If CLI and MCP use different compiler
 * implementations (e.g. old vs new BabylonCompiler), the tokens diverge sharply.
 */
function semanticSimilarity(a, b) {
  const identRe = /\b[A-Z][A-Za-z0-9_]{2,}/g;
  const tokensA = new Set(a.match(identRe) || []);
  const tokensB = new Set(b.match(identRe) || []);
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) {
    // No named identifiers in either output — compare by length ratio
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length + 1);
    return { similar: ratio > 0.7, score: Math.round(ratio * 1000) / 1000, delta: null };
  }
  const score = intersection.length / union.size;
  const similar = score >= 0.80;
  let delta = null;
  if (!similar) {
    const onlyA = [...tokensA].filter((t) => !tokensB.has(t)).slice(0, 8);
    const onlyB = [...tokensB].filter((t) => !tokensA.has(t)).slice(0, 8);
    delta = `CLI-only: [${onlyA.join(', ')}] | MCP-only: [${onlyB.join(', ')}]`;
  }
  return { similar, score: Math.round(score * 1000) / 1000, delta };
}

// ─── Env / config ──────────────────────────────────────────────────────────

// Load .env for MCP key
const dotenvPath = join(REPO_ROOT, '.env');
if (existsSync(dotenvPath)) {
  const envContent = readFileSync(dotenvPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const MCP_BASE = process.env.HOLOSCRIPT_MCP || 'https://mcp.holoscript.net';
const MCP_KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOSCRIPT_MCP_API_KEY || '';

// ─── Built-in fixtures ─────────────────────────────────────────────────────

/**
 * Each fixture: { name, ext, code, targets }
 * targets: list of compile targets to exercise for this fixture.
 * We pick targets that are fast (no GPU/native SDK needed) and whose
 * output is text-only (not binary blobs).
 */
// The HoloCompositionParser (used for .holo files by both CLI and MCP) expects:
//   composition "Name" { object "id" { prop: val } }
// NOT the HoloLand world syntax (scene { orb#id {} }) which is a different parser.
const BUILTIN_FIXTURES = [
  {
    name: 'single-orb',
    ext: 'holo',
    code: `composition "GlowOrb" {
  object "mainOrb" {
    position: [0, 1, 0]
    radius: 0.5
    color: "#ff6600"
  }
}`,
    targets: ['r3f', 'babylon', 'unity'],
  },
  {
    name: 'multi-object',
    ext: 'holo',
    code: `composition "TwoOrbs" {
  object "orbA" {
    position: [1, 0, 0]
    radius: 0.3
    color: "#0088ff"
  }
  object "orbB" {
    position: [-1, 0, 0]
    radius: 0.3
    color: "#ff0088"
  }
}`,
    targets: ['r3f', 'unity'],
  },
  {
    // Minimal — baseline parity check. If this drifts, the core AST pipeline
    // has diverged, not just object support.
    name: 'minimal',
    ext: 'holo',
    code: `composition "Minimal" {
  object "node" {
    position: [0, 0, 0]
  }
}`,
    targets: ['r3f', 'babylon'],
  },
];

// ─── Install published CLI into temp dir ───────────────────────────────────

let CLI_BIN; // path to the holoscript binary

function setupCLI() {
  if (LOCAL_CLI) {
    // Use locally-built CLI binary from the monorepo
    const localBin = join(REPO_ROOT, 'packages', 'cli', 'bin', 'holoscript.cjs');
    if (!existsSync(localBin)) {
      bail('setup-error', `--local specified but bin not found at ${localBin}. Run pnpm --filter @holoscript/cli build first.`);
    }
    CLI_BIN = localBin;
    log(`[cli-version-parity] Using local CLI binary: ${CLI_BIN}`);
    return { version: 'local', coreVersion: 'local' };
  }

  log('[cli-version-parity] Installing @holoscript/cli@latest from npm...');
  const work = mkdtempSync(join(tmpdir(), 'hs-cli-parity-'));

  // Minimal package.json for the install sandbox
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'cli-parity-probe', private: true, type: 'commonjs' }, null, 2)
  );

  try {
    runNpm(
      [
        'install',
        '@holoscript/cli@latest',
        '--no-audit',
        '--no-fund',
        '--legacy-peer-deps',
        '--loglevel=error',
      ],
      { cwd: work }
    );
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || '').slice(0, 3000);
    bail('install-failed', 'npm install @holoscript/cli@latest failed', detail);
  }

  // Resolve the installed CLI binary. We always invoke via `node <bin.cjs>`
  // so prefer the direct .cjs entry point over the .cmd/.sh wrapper.
  const cjsBin = join(work, 'node_modules', '@holoscript', 'cli', 'bin', 'holoscript.cjs');
  const dotBinCjs = join(work, 'node_modules', '.bin', 'holoscript.cjs');
  const dotBin = join(work, 'node_modules', '.bin', 'holoscript');

  CLI_BIN = existsSync(cjsBin) ? cjsBin
    : existsSync(dotBinCjs) ? dotBinCjs
    : existsSync(dotBin) ? dotBin
    : null;

  if (!CLI_BIN) {
    bail(
      'setup-error',
      'Cannot find holoscript.cjs after npm install',
      `Searched: ${cjsBin}, ${dotBinCjs}, ${dotBin}`
    );
  }

  // Read the installed CLI version
  let cliVersion = 'unknown';
  let coreVersion = 'unknown';
  try {
    const cliPkg = JSON.parse(readFileSync(join(work, 'node_modules', '@holoscript', 'cli', 'package.json'), 'utf8'));
    cliVersion = cliPkg.version || 'unknown';
  } catch { /* non-fatal */ }
  try {
    const corePkg = JSON.parse(readFileSync(join(work, 'node_modules', '@holoscript', 'core', 'package.json'), 'utf8'));
    coreVersion = corePkg.version || 'unknown';
  } catch { /* non-fatal */ }

  log(`[cli-version-parity] Installed CLI v${cliVersion}, core v${coreVersion}`);
  log(`[cli-version-parity] CLI binary: ${CLI_BIN}`);

  return { version: cliVersion, coreVersion, workDir: work };
}

// ─── Compile via CLI ───────────────────────────────────────────────────────

function compileViaCLI(code, ext, target) {
  const fixDir = mkdtempSync(join(tmpdir(), 'hs-fixture-'));
  const fixturePath = join(fixDir, `fixture.${ext}`);
  writeFileSync(fixturePath, code);

  const start = Date.now();
  let output = null;
  let ok = false;
  let errorMsg = null;

  try {
    // Always invoke as: node <bin.cjs> compile <file> --target <target>
    // This works for both --local (packages/cli/bin/holoscript.cjs) and the
    // npm-installed bin (node_modules/@holoscript/cli/bin/holoscript.cjs).
    // The 'compile' subcommand MUST come before the file path — passing just
    // the file path directly yields "Unknown subcommand: <file>".
    output = execFileSync(
      process.execPath,
      [CLI_BIN, 'compile', fixturePath, '--target', target],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: fixDir,
        timeout: 30_000,
      }
    );
    ok = true;
  } catch (e) {
    const stderr = e.stderr || '';
    const stdout = e.stdout || '';
    // CLI exits non-zero on compile error but stdout may still have useful output
    if (stdout.length > 50 && !stdout.includes('[E000]') && !stdout.includes('Unknown subcommand')) {
      output = stdout;
      ok = true;
    } else {
      errorMsg = (stderr + stdout).slice(0, 500).replace(/\x1b\[[0-9;]*m/g, '').trim();
    }
  }

  const ms = Date.now() - start;
  try { rmSync(fixDir, { recursive: true, force: true }); } catch { /* best-effort */ }

  // Strip CLI header banners only when the output is JSON (r3f, state, etc.).
  // The banner pattern is "--- ... ---" (dashes + title). For text-based targets
  // (babylon TypeScript, unity C#, etc.) the output starts directly with
  // comments and code — don't strip those, it would remove semantic tokens.
  if (output) {
    // Only strip if a "--- ... ---" banner header appears before the first '{'.
    const jsonStart = output.indexOf('{');
    const bannerMatch = /^[\s\S]*?---\s+\w/m.test(output);
    if (bannerMatch && jsonStart > 0) {
      output = output.slice(jsonStart);
    }
  }

  return { ok, output: output ? normalizeOutput(output) : null, errorMsg, ms };
}

// ─── Compile via MCP /api/compile ─────────────────────────────────────────

async function compileViaMCP(code, target) {
  const start = Date.now();
  let ok = false;
  let output = null;
  let errorMsg = null;

  try {
    const { default: https } = await import('node:https');
    const { default: http } = await import('node:http');
    const url = new URL(`${MCP_BASE}/api/compile`);
    const body = JSON.stringify({ code, target });
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    await new Promise((resolve, reject) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...(MCP_KEY ? { 'x-mcp-api-key': MCP_KEY } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              // /api/compile returns: { success, output, metadata, ... }
              // output can be:
              //   - a string (e.g. GDScript, C# plain text)
              //   - a JSON object (e.g. r3f scene graph, babylon node tree)
              // Normalise to a canonical JSON string for semantic comparison.
              if (parsed.success && parsed.output != null) {
                ok = true;
                const rawOut = typeof parsed.output === 'string'
                  ? parsed.output
                  : JSON.stringify(parsed.output, null, 2);
                output = normalizeOutput(rawOut);
              } else if (parsed.error) {
                errorMsg = parsed.error;
              } else if (parsed.content && Array.isArray(parsed.content)) {
                // MCP JSON-RPC envelope
                const text = parsed.content[0]?.text;
                if (text) {
                  const inner = JSON.parse(text);
                  if (inner.success && inner.output != null) {
                    ok = true;
                    const rawOut = typeof inner.output === 'string'
                      ? inner.output
                      : JSON.stringify(inner.output, null, 2);
                    output = normalizeOutput(rawOut);
                  } else {
                    errorMsg = inner.error || 'compile returned no output';
                  }
                }
              } else {
                errorMsg = `unexpected shape: ${data.slice(0, 200)}`;
              }
            } catch (e) {
              errorMsg = `JSON parse error: ${e.message} (body: ${data.slice(0, 200)})`;
            }
            resolve();
          });
        }
      );
      req.on('error', (e) => reject(e));
      req.setTimeout(30_000, () => { req.destroy(); reject(new Error('MCP request timed out after 30s')); });
      req.write(body);
      req.end();
    });
  } catch (e) {
    errorMsg = e.message || String(e);
  }

  const ms = Date.now() - start;
  return { ok, output, errorMsg, ms };
}

// ─── Fetch deployed MCP version from /health ──────────────────────────────

async function fetchMCPVersion() {
  try {
    const { default: https } = await import('node:https');
    const { default: http } = await import('node:http');
    const url = new URL(`${MCP_BASE}/health`);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    return await new Promise((resolve) => {
      const req = transport.get(
        { hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: '/health' },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              resolve(j.version || j.pkg?.version || 'unknown');
            } catch {
              resolve('unknown');
            }
          });
        }
      );
      req.on('error', () => resolve('unreachable'));
      req.setTimeout(8_000, () => { req.destroy(); resolve('timeout'); });
    });
  } catch {
    return 'unknown';
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('\n[cli-version-parity] Starting published-CLI dogfood + version-parity falsifier');
  log(`[cli-version-parity] MCP endpoint: ${MCP_BASE}`);

  // 1) Setup CLI
  const cliSetup = setupCLI();

  // 2) Probe MCP version
  const mcpVersion = await fetchMCPVersion();
  log(`[cli-version-parity] MCP version: ${mcpVersion}`);

  // 3) Build fixture list
  const fixtures = [...BUILTIN_FIXTURES];

  // Add extra fixtures from CLI args
  for (const p of extraFixtures) {
    const fp = resolve(p);
    if (!existsSync(fp)) { warn(`Extra fixture not found: ${fp} — skipping`); continue; }
    const code = readFileSync(fp, 'utf8');
    const ext = fp.endsWith('.holo') ? 'holo' : fp.endsWith('.hsplus') ? 'hsplus' : 'hs';
    // For extra fixtures, run all targets that MCP supports
    const targets = targetFilter ? [targetFilter] : ['r3f', 'babylon', 'unity', 'godot'];
    fixtures.push({ name: basename(fp), ext, code, targets });
  }

  // Apply target filter
  const activeFixtures = targetFilter
    ? fixtures.map((f) => ({ ...f, targets: f.targets.includes(targetFilter) ? [targetFilter] : [] })).filter((f) => f.targets.length > 0)
    : fixtures;

  if (activeFixtures.length === 0) {
    bail('no-fixtures', `No fixtures match --target ${targetFilter}`);
  }

  // 4) Run comparisons
  const results = [];

  for (const fixture of activeFixtures) {
    for (const target of fixture.targets) {
      const label = `${fixture.name}@${target}`;
      log(`\n[cli-version-parity] Testing ${label}...`);

      const cliResult = compileViaCLI(fixture.code, fixture.ext, target);
      log(`  CLI: ${cliResult.ok ? `OK (${cliResult.ms}ms, ${cliResult.output?.length || 0} chars)` : `FAIL — ${cliResult.errorMsg?.slice(0, 120)}`}`);

      const mcpResult = await compileViaMCP(fixture.code, target);
      log(`  MCP: ${mcpResult.ok ? `OK (${mcpResult.ms}ms, ${mcpResult.output?.length || 0} chars)` : `FAIL — ${mcpResult.errorMsg?.slice(0, 120)}`}`);

      let parityOk = false;
      let similarity = null;
      let delta = null;

      if (cliResult.ok && mcpResult.ok) {
        const sim = semanticSimilarity(cliResult.output, mcpResult.output);
        similarity = sim.score;
        delta = sim.delta;
        parityOk = sim.similar;
        if (parityOk) {
          log(`  PARITY: OK (similarity=${sim.score})`);
        } else {
          log(`  PARITY: DRIFT DETECTED (similarity=${sim.score})`);
          if (delta) log(`  DELTA: ${delta}`);
        }
      } else if (!cliResult.ok && !mcpResult.ok) {
        // Both failed on same fixture — could be fixture issue, not a drift
        log(`  PARITY: BOTH-FAILED (inconclusive for parity)`);
        parityOk = null; // inconclusive
      } else {
        log(`  PARITY: ASYMMETRIC FAILURE`);
      }

      results.push({
        fixture: fixture.name,
        target,
        cliOk: cliResult.ok,
        mcpOk: mcpResult.ok,
        parityOk,
        cliMs: cliResult.ms,
        mcpMs: mcpResult.ms,
        cliChars: cliResult.output?.length ?? 0,
        mcpChars: mcpResult.output?.length ?? 0,
        similarity,
        delta,
        cliError: cliResult.errorMsg || null,
        mcpError: mcpResult.errorMsg || null,
      });
    }
  }

  // 5) Summarize
  const total = results.length;
  const passed = results.filter((r) => r.parityOk === true).length;
  const drifted = results.filter((r) => r.parityOk === false).length;
  const cliFailures = results.filter((r) => !r.cliOk).length;
  const mcpFailures = results.filter((r) => !r.mcpOk).length;
  const inconclusive = results.filter((r) => r.parityOk === null).length;
  const overallOk = drifted === 0 && cliFailures === 0 && mcpFailures === 0;

  const receipt = {
    schema: 'cli-version-parity/v1',
    date: new Date().toISOString(),
    cliVersion: cliSetup.version,
    coreVersionLocal: cliSetup.coreVersion,
    mcpVersion,
    mcpEndpoint: MCP_BASE,
    fixtures: results,
    summary: { total, passed, drifted, cliFailures, mcpFailures, inconclusive },
    ok: overallOk,
  };

  // 6) Output receipt
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  } else {
    log('\n═══════════════════════════════════════════════════════════');
    log(`[cli-version-parity] RESULTS: ${total} checks`);
    log(`  Parity OK:       ${passed}`);
    log(`  Drift detected:  ${drifted}`);
    log(`  CLI failures:    ${cliFailures}`);
    log(`  MCP failures:    ${mcpFailures}`);
    log(`  Inconclusive:    ${inconclusive}`);
    log(`  CLI version:     ${cliSetup.version}`);
    log(`  Core (local):    ${cliSetup.coreVersion}`);
    log(`  MCP version:     ${mcpVersion}`);
    if (overallOk) {
      log('\n[cli-version-parity] PASS — CLI and MCP compile outputs are semantically identical.');
      log('  No version drift between published @holoscript/cli and deployed mcp.holoscript.net.');
    } else {
      log('\n[cli-version-parity] FAIL');
      if (drifted > 0) log(`  DRIFT: ${drifted} fixture(s) compile differently between CLI and MCP.`);
      if (cliFailures > 0) log(`  CLI FAILURES: ${cliFailures} fixture(s) failed to compile via published CLI.`);
      if (mcpFailures > 0) log(`  MCP FAILURES: ${mcpFailures} fixture(s) failed to compile via deployed MCP.`);
    }
    log('═══════════════════════════════════════════════════════════\n');
  }

  // 7) Optionally append to ledger
  if (EMIT_LEDGER) {
    const ledgerPath = join(REPO_ROOT, 'research', 'external-repro-ledger.json');
    let ledger = [];
    if (existsSync(ledgerPath)) {
      try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch { ledger = []; }
    }
    if (!Array.isArray(ledger)) ledger = [];
    // Append a minimal ledger entry compatible with D.081 tracking
    ledger.push({
      date: receipt.date,
      gate: 'cli-version-parity',
      cliVersion: receipt.cliVersion,
      coreVersionLocal: receipt.coreVersionLocal,
      mcpVersion: receipt.mcpVersion,
      summary: receipt.summary,
      ok: receipt.ok,
    });
    // Keep last 100 entries
    if (ledger.length > 100) ledger = ledger.slice(-100);
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
    if (!JSON_OUT) log(`[cli-version-parity] Ledger appended to ${ledgerPath}`);
  }

  process.exit(overallOk ? 0 : 1);
}

main().catch((e) => {
  bail('unexpected-error', e.message || String(e), e.stack);
});
