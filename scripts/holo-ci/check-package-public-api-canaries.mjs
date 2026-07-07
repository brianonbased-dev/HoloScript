#!/usr/bin/env node
/**
 * Runs public API registry canaries declared in package-stewardship-manifest.
 *
 * These canaries prove that published packages expose a narrow, useful API from
 * a repo-less npm install. The manifest stays the source of truth; this runner
 * only extracts validationCommands that call check-registry-cold-start.mjs with
 * a `*-public-api` probe.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const LIST = args.includes('--list');
const packageIdx = args.indexOf('--package');
const idIdx = args.indexOf('--id');
const probeIdx = args.indexOf('--probe');
const registryIdx = args.indexOf('--registry');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST_PATH =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'package-stewardship-manifest.json');
const TARGET_PACKAGE = packageIdx >= 0 ? args[packageIdx + 1] : null;
const TARGET_ID = idIdx >= 0 ? args[idIdx + 1] : null;
const TARGET_PROBE = probeIdx >= 0 ? args[probeIdx + 1] : null;
const REGISTRY_URL = registryIdx >= 0 ? args[registryIdx + 1] : null;
const PASS_THROUGH_FLAGS = ['--disable-public-fallback'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packageNameFromSpec(spec) {
  return String(spec || '').replace(/@latest$/u, '');
}

function parseColdStartPublicApiCommand(command) {
  const text = String(command || '');
  if (!text.includes('check-registry-cold-start.mjs')) return null;
  const packageMatch = text.match(/--package\s+("[^"]+"|'[^']+'|\S+)/u);
  const probeMatch = text.match(/--probe\s+("[^"]+"|'[^']+'|\S+)/u);
  if (!packageMatch || !probeMatch) return null;
  const packageSpec = packageMatch[1].replace(/^["']|["']$/gu, '');
  const probe = probeMatch[1].replace(/^["']|["']$/gu, '');
  if (!probe.endsWith('-public-api')) return null;
  return {
    packageSpec,
    packageName: packageNameFromSpec(packageSpec),
    probe,
  };
}

function publicApiCanariesFromManifest(manifest) {
  const rows = [];
  for (const record of manifest.packages || []) {
    for (const command of record.validationCommands || []) {
      const parsed = parseColdStartPublicApiCommand(command);
      if (!parsed) continue;
      rows.push({
        id: record.id,
        status: record.status,
        registry: record.registry,
        packageName: record.packageName || parsed.packageName,
        packageSpec: parsed.packageSpec,
        probe: parsed.probe,
        command,
      });
    }
  }
  return rows.sort((a, b) => `${a.packageName}:${a.probe}`.localeCompare(`${b.packageName}:${b.probe}`));
}

function filterCanaries(rows) {
  return rows.filter((row) => {
    if (TARGET_ID && row.id !== TARGET_ID) return false;
    if (TARGET_PACKAGE && row.packageName !== TARGET_PACKAGE && row.packageSpec !== TARGET_PACKAGE) {
      return false;
    }
    if (TARGET_PROBE && row.probe !== TARGET_PROBE) return false;
    return true;
  });
}

function runColdStart(row) {
  const cmdArgs = [
    'scripts/holo-ci/check-registry-cold-start.mjs',
    '--package',
    row.packageSpec,
    '--probe',
    row.probe,
    '--json',
  ];
  if (REGISTRY_URL) cmdArgs.push('--registry', REGISTRY_URL);
  for (const flag of PASS_THROUGH_FLAGS) {
    if (args.includes(flag)) cmdArgs.push(flag);
  }

  const startedAt = Date.now();
  try {
    const stdout = execFileSync(process.execPath, cmdArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    const receipt = JSON.parse(stdout);
    return summarizeReceipt(row, receipt, Date.now() - startedAt);
  } catch (error) {
    const detail = String(error.stdout || error.stderr || error.message || error).trim();
    let receipt = null;
    try {
      receipt = detail ? JSON.parse(detail) : null;
    } catch {
      receipt = null;
    }
    return {
      ...row,
      ok: false,
      durationMs: Date.now() - startedAt,
      version: receipt?.package?.installed?.version || null,
      finalDisposition: receipt?.finalDisposition || null,
      failure: receipt?.failure || { reason: 'canary-crashed', detail: detail.slice(0, 2000) },
    };
  }
}

function summarizeReceipt(row, receipt, durationMs) {
  return {
    ...row,
    ok: receipt.ok === true,
    durationMs,
    version: receipt.package?.installed?.version || null,
    integrity: receipt.package?.installed?.integrity || null,
    finalDisposition: receipt.finalDisposition || null,
    checks: receipt.probe?.checks || null,
    failure: receipt.failure || null,
  };
}

function validateCanaryRows(rows) {
  const errors = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.packageName}:${row.probe}`;
    if (seen.has(key)) errors.push(`duplicate public API canary: ${key}`);
    seen.add(key);
    if (row.registry !== 'npm') errors.push(`${row.id}: public API canary must be npm-backed`);
    if (!row.packageSpec.endsWith('@latest')) {
      errors.push(`${row.id}: package spec should use @latest for registry proof: ${row.packageSpec}`);
    }
  }
  return errors;
}

function runSelfTest() {
  const fixture = {
    packages: [
      {
        id: 'engine-runtime',
        registry: 'npm',
        packageName: '@holoscript/engine',
        status: 'release-candidate',
        validationCommands: [
          'node scripts/holo-ci/check-registry-cold-start.mjs --package @holoscript/engine@latest --probe engine-public-api --json',
        ],
      },
      {
        id: 'not-a-canary',
        registry: 'npm',
        packageName: '@holoscript/core',
        validationCommands: [
          'node scripts/holo-ci/check-registry-cold-start.mjs --package @holoscript/core@latest --probe core-holo-webgpu --json',
        ],
      },
    ],
  };
  const rows = publicApiCanariesFromManifest(fixture);
  if (rows.length !== 1) throw new Error(`expected one public API canary, got ${rows.length}`);
  if (rows[0].packageName !== '@holoscript/engine') throw new Error('wrong package extracted');
  if (rows[0].probe !== 'engine-public-api') throw new Error('wrong probe extracted');
  const errors = validateCanaryRows(rows);
  if (errors.length > 0) throw new Error(`valid canary fixture failed: ${errors.join('; ')}`);
  console.log('[package-public-api-canaries] self-test PASS');
}

function emitList(rows) {
  if (JSON_OUT) {
    console.log(JSON.stringify({ schema: 'holoscript.package-public-api-canaries.list.v1', rows }, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(`[package-public-api-canaries] ${row.packageName} ${row.probe} (${row.id})`);
  }
}

function main() {
  if (SELF_TEST) {
    runSelfTest();
    return;
  }

  const manifest = readJson(MANIFEST_PATH);
  const allRows = publicApiCanariesFromManifest(manifest);
  const manifestErrors = validateCanaryRows(allRows);
  if (manifestErrors.length > 0) {
    for (const error of manifestErrors) console.error(`[package-public-api-canaries] ${error}`);
    process.exit(1);
  }

  const rows = filterCanaries(allRows);
  if (rows.length === 0) {
    console.error('[package-public-api-canaries] no public API canaries matched the requested filters');
    process.exit(1);
  }

  if (LIST) {
    emitList(rows);
    return;
  }

  const results = rows.map(runColdStart);
  const ok = results.every((row) => row.ok);
  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          schema: 'holoscript.package-public-api-canaries.v1',
          generatedAt: new Date().toISOString(),
          ok,
          results,
        },
        null,
        2
      )
    );
  } else {
    for (const row of results) {
      const status = row.ok ? 'PASS' : 'FAIL';
      const version = row.version ? `@${row.version}` : '';
      console.log(
        `[package-public-api-canaries] ${status} ${row.packageName}${version} ${row.probe} ${row.finalDisposition || ''}`.trim()
      );
      if (!row.ok && row.failure) {
        console.error(`[package-public-api-canaries] ${row.packageName}: ${JSON.stringify(row.failure)}`);
      }
    }
    if (ok) console.log(`[package-public-api-canaries] PASS: ${results.length} public API canary(s) passed.`);
  }

  process.exit(ok ? 0 : 1);
}

main();
