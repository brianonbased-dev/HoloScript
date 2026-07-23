#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 45_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_PATH = join(ROOT, '.build-logs', 'pnpm-audit-cache.json');
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function nowIso() {
  return new Date().toISOString();
}

export function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function flagValue(rawArgs, name, fallback) {
  const prefix = `--${name}=`;
  const raw = rawArgs.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function numericFlag(rawArgs, name, fallback) {
  const value = Number(flagValue(rawArgs, name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function requestedScope(rawArgs) {
  if (rawArgs.includes('--prod')) return 'prod';
  if (rawArgs.includes('--dev')) return 'dev';
  return 'all';
}

export function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const timeoutMs = numericFlag(argv, 'timeout-ms', DEFAULT_TIMEOUT_MS);
  const requestedAuditLevel = flagValue(argv, 'audit-level', 'moderate');
  const auditLevel = new Set(['low', 'moderate', 'high', 'critical']).has(requestedAuditLevel)
    ? requestedAuditLevel
    : 'moderate';

  return {
    rawArgs: argv,
    env,
    timeoutMs,
    fallbackTimeoutMs: numericFlag(
      argv,
      'fallback-timeout-ms',
      Math.max(timeoutMs, DEFAULT_FALLBACK_TIMEOUT_MS)
    ),
    cacheTtlMs: numericFlag(argv, 'cache-ttl-ms', DEFAULT_CACHE_TTL_MS),
    auditLevel,
    cachePath: resolve(ROOT, flagValue(argv, 'cache-path', DEFAULT_CACHE_PATH)),
    lockfilePath: join(ROOT, 'pnpm-lock.yaml'),
    registry: env.NPM_CONFIG_REGISTRY || env.npm_config_registry || DEFAULT_REGISTRY,
    noCache: argv.includes('--no-cache'),
    noFailOnVuln: argv.includes('--no-fail-on-vuln'),
    scope: requestedScope(argv),
    prod: argv.includes('--prod'),
    dev: argv.includes('--dev'),
    noOptional: argv.includes('--no-optional'),
    ignoreRegistryErrors: argv.includes('--ignore-registry-errors'),
  };
}

function emptyVulnerabilities(value = null) {
  return {
    info: value,
    low: value,
    moderate: value,
    high: value,
    critical: value,
    total: value,
    blocking: value,
  };
}

export function emptySummary(options, countsAvailable = false) {
  return {
    audit_level: options.auditLevel,
    counts_available: countsAvailable,
    vulnerabilities: emptyVulnerabilities(countsAvailable ? 0 : null),
    advisory_count: countsAvailable ? 0 : null,
    dependency_count: null,
  };
}

function countAdvisories(auditJson) {
  const advisories = auditJson?.advisories;
  if (!advisories || typeof advisories !== 'object') return 0;
  return Object.keys(advisories).length;
}

export function summarizeAudit(auditJson, auditLevel = 'moderate') {
  const metadataVulnerabilities = auditJson?.metadata?.vulnerabilities;
  const vulnerabilities = {};

  if (metadataVulnerabilities && typeof metadataVulnerabilities === 'object') {
    for (const severity of SEVERITIES) {
      const count = Number(metadataVulnerabilities[severity] ?? 0);
      vulnerabilities[severity] = Number.isFinite(count) ? count : 0;
    }
  } else {
    for (const severity of SEVERITIES) vulnerabilities[severity] = 0;

    const advisories = auditJson?.advisories;
    if (advisories && typeof advisories === 'object') {
      for (const advisory of Object.values(advisories)) {
        const severity = String(advisory?.severity ?? '').toLowerCase();
        if (severity in vulnerabilities) vulnerabilities[severity] += 1;
      }
    }
  }

  const explicitTotal = Number(metadataVulnerabilities?.total);
  vulnerabilities.total = Number.isFinite(explicitTotal)
    ? explicitTotal
    : SEVERITIES.reduce((sum, severity) => sum + vulnerabilities[severity], 0);
  const threshold = SEVERITIES.indexOf(auditLevel);
  vulnerabilities.blocking = SEVERITIES
    .slice(threshold >= 0 ? threshold : SEVERITIES.indexOf('moderate'))
    .reduce((sum, severity) => sum + vulnerabilities[severity], 0);

  return {
    audit_level: auditLevel,
    counts_available: true,
    vulnerabilities,
    advisory_count: countAdvisories(auditJson),
    dependency_count: auditJson?.metadata?.dependencies ?? null,
  };
}

export function mergeAuditSummaries(summaries, auditLevel = 'moderate') {
  const merged = {
    audit_level: auditLevel,
    counts_available: summaries.length > 0,
    vulnerabilities: emptyVulnerabilities(0),
    advisory_count: 0,
    dependency_count: 0,
  };

  for (const summary of summaries) {
    for (const severity of [...SEVERITIES, 'total', 'blocking']) {
      const count = Number(summary?.vulnerabilities?.[severity] ?? 0);
      merged.vulnerabilities[severity] += Number.isFinite(count) ? count : 0;
    }
    const advisoryCount = Number(summary?.advisory_count ?? 0);
    if (Number.isFinite(advisoryCount)) merged.advisory_count += advisoryCount;

    const dependencyCount = Number(summary?.dependency_count);
    if (Number.isFinite(dependencyCount)) merged.dependency_count += dependencyCount;
  }

  return merged;
}

function unquoteYamlKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (key.startsWith("'") && key.endsWith("'")) {
    return key.slice(1, -1).replace(/''/gu, "'");
  }
  if (key.startsWith('"') && key.endsWith('"')) {
    try {
      return JSON.parse(key);
    } catch {
      return key;
    }
  }
  return key;
}

export function lockfilePackageVersions(lockfileText) {
  const versionsByPackage = new Map();
  let inPackages = false;

  for (const line of String(lockfileText || '').split(/\r?\n/u)) {
    if (line === 'packages:') {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/u.test(line)) break;
    if (!inPackages) continue;

    const match = line.match(/^  (.+):$/u);
    if (!match) continue;

    let key = unquoteYamlKey(match[1]);
    const peerSuffix = key.indexOf('(');
    if (peerSuffix >= 0) key = key.slice(0, peerSuffix);
    const separator = key.lastIndexOf('@');
    if (separator <= 0) continue;

    const name = key.slice(0, separator);
    const version = key.slice(separator + 1);
    const validName = /^@[^/\s]+\/[^@\s]+$/u.test(name) || /^[^@/\s][^@\s]*$/u.test(name);
    const validVersion = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version);
    if (!validName || !validVersion) continue;

    if (!versionsByPackage.has(name)) versionsByPackage.set(name, new Set());
    versionsByPackage.get(name).add(version);
  }

  const packages = Object.fromEntries(
    [...versionsByPackage.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()])
  );
  return {
    packages,
    packageCount: Object.keys(packages).length,
    versionCount: Object.values(packages).reduce((total, versions) => total + versions.length, 0),
  };
}

export function summarizeBulkAdvisories(bulkAudit, auditLevel = 'moderate') {
  const vulnerabilities = emptyVulnerabilities(0);
  const advisories = [];

  for (const [packageName, packageAdvisories] of Object.entries(bulkAudit || {})) {
    if (!Array.isArray(packageAdvisories)) continue;
    for (const advisory of packageAdvisories) {
      const severity = String(advisory?.severity || '').toLowerCase();
      if (SEVERITIES.includes(severity)) vulnerabilities[severity] += 1;
      advisories.push({
        package: packageName,
        id: advisory?.id ?? null,
        severity,
        title: advisory?.title ?? null,
        url: advisory?.url ?? null,
        vulnerable_versions: advisory?.vulnerable_versions ?? null,
      });
    }
  }

  vulnerabilities.total = SEVERITIES.reduce((sum, severity) => sum + vulnerabilities[severity], 0);
  const threshold = SEVERITIES.indexOf(auditLevel);
  vulnerabilities.blocking = SEVERITIES
    .slice(threshold >= 0 ? threshold : SEVERITIES.indexOf('moderate'))
    .reduce((sum, severity) => sum + vulnerabilities[severity], 0);
  advisories.sort((left, right) => (
    left.package.localeCompare(right.package)
    || left.severity.localeCompare(right.severity)
    || String(left.id).localeCompare(String(right.id))
  ));

  return {
    summary: {
      audit_level: auditLevel,
      counts_available: true,
      vulnerabilities,
      advisory_count: advisories.length,
      dependency_count: null,
      partial: false,
      scopes: ['lockfile'],
      source: 'npm-bulk-advisory',
      count_semantics: 'advisory records matching resolved package versions',
    },
    advisories,
  };
}

function bulkAdvisoryUrl(registry) {
  const base = String(registry || DEFAULT_REGISTRY).endsWith('/')
    ? String(registry || DEFAULT_REGISTRY)
    : `${registry}/`;
  return new URL('-/npm/v1/security/advisories/bulk', base).toString();
}

export async function runBulkAdvisoryAudit(
  options,
  timeoutMs = options.fallbackTimeoutMs,
  fetchImpl = globalThis.fetch
) {
  const startedAt = Date.now();
  if (options.scope !== 'all') {
    return {
      ok: false,
      durationMs: 0,
      error: `bulk advisory fallback cannot prove the requested ${options.scope} scope`,
    };
  }

  try {
    const inventory = lockfilePackageVersions(readFileSync(options.lockfilePath, 'utf8'));
    if (inventory.packageCount === 0) {
      throw new Error(`no resolved package versions found in ${options.lockfilePath}`);
    }

    const url = bulkAdvisoryUrl(options.registry);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'holoscript-bounded-audit/1',
      },
      body: JSON.stringify(inventory.packages),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`npm bulk advisory endpoint returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const audit = parseJsonFromText(text);
    const validShape = audit
      && typeof audit === 'object'
      && !Array.isArray(audit)
      && Object.values(audit).every((value) => Array.isArray(value));
    if (!validShape) throw new Error('npm bulk advisory endpoint returned an invalid response shape');

    const summarized = summarizeBulkAdvisories(audit, options.auditLevel);
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      url,
      packageCount: inventory.packageCount,
      versionCount: inventory.versionCount,
      ...summarized,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
  }
}

function buildAuditArgs(options, scope = options.scope) {
  const auditArgs = ['audit', '--json', `--audit-level=${options.auditLevel}`];
  if (scope === 'prod') auditArgs.push('--prod');
  if (scope === 'dev') auditArgs.push('--dev');
  if (options.noOptional) auditArgs.push('--no-optional');
  if (options.ignoreRegistryErrors) auditArgs.push('--ignore-registry-errors');
  return auditArgs;
}

function commandParts(options, auditArgs) {
  const customCommand = options.env.HOLOSCRIPT_PNPM_AUDIT_COMMAND;
  if (customCommand) return { command: customCommand, args: auditArgs, display: [customCommand, ...auditArgs] };

  if (process.platform === 'win32') {
    const display = ['corepack', 'pnpm', ...auditArgs];
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', display.map(quoteCmdArg).join(' ')],
      display,
    };
  }

  return {
    command: 'corepack',
    args: ['pnpm', ...auditArgs],
    display: ['corepack', 'pnpm', ...auditArgs],
  };
}

function quoteCmdArg(arg) {
  const text = String(arg);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function commandText(parts) {
  return parts.display.join(' ');
}

function readFreshCache(options) {
  if (options.noCache || options.cacheTtlMs === 0 || !existsSync(options.cachePath)) return null;

  try {
    const cached = JSON.parse(readFileSync(options.cachePath, 'utf8'));
    const cachedAt = Date.parse(cached.timestamp);
    if (!Number.isFinite(cachedAt)) return null;

    const ageMs = Date.now() - cachedAt;
    if (ageMs < 0 || ageMs > options.cacheTtlMs) return null;

    return { payload: cached, ageMs };
  } catch {
    return null;
  }
}

function writeCache(options, payload) {
  if (options.noCache) return;

  mkdirSync(dirname(options.cachePath), { recursive: true });
  writeFileSync(options.cachePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function basePayload(options, payload) {
  return {
    schema: 'holoscript.pnpm_audit.v1',
    timestamp: nowIso(),
    command: payload.command,
    timeout_ms: payload.timeout_ms ?? options.timeoutMs,
    fallback_timeout_ms: options.fallbackTimeoutMs,
    cache_path: options.cachePath,
    ...payload,
  };
}

function exitForStatus(options, payload) {
  if (payload.status === 'fail') return options.noFailOnVuln ? 0 : 1;
  if (payload.status === 'cached' && payload.cached_status === 'fail') return options.noFailOnVuln ? 0 : 1;
  return 0;
}

function emit(options, payload) {
  const output = basePayload(options, payload);
  writeFileSync(process.stdout.fd, `${JSON.stringify(output, null, 2)}\n`);
  process.exit(exitForStatus(options, output));
}

function emitCachedOrSkip(options, reason, details = {}) {
  const cached = readFreshCache(options);
  if (cached) {
    emit(options, {
      status: 'cached',
      reason,
      cached_status: cached.payload.status,
      cache_age_ms: cached.ageMs,
      summary: cached.payload.summary,
      command: details.command,
      ...details,
    });
  }

  emit(options, {
    status: 'skip',
    reason,
    summary: emptySummary(options, false),
    ...details,
  });
}

function killProcessTree(child) {
  if (process.platform === 'win32' && child.pid) {
    const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 2_000,
    });
    return {
      attempted: true,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || null,
    };
  }

  return {
    attempted: true,
    status: child.kill('SIGTERM') ? 0 : 1,
    signal: 'SIGTERM',
    error: null,
  };
}

export function runAudit(options, scope = options.scope, timeoutMs = options.timeoutMs) {
  return new Promise((resolveRun) => {
    const auditArgs = buildAuditArgs(options, scope);
    const parts = commandParts(options, auditArgs);
    const start = Date.now();
    const child = spawn(parts.command, parts.args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    function settle(payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        scope,
        command: commandText(parts),
        timeoutMs,
        ...payload,
      });
    }

    timer = setTimeout(() => {
      const termination = killProcessTree(child);
      settle({
        code: 1,
        durationMs: Date.now() - start,
        stderr,
        stdout,
        timedOut: true,
        termination,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      settle({
        code: 1,
        durationMs: Date.now() - start,
        error: error.message,
        stderr,
        stdout,
        timedOut: false,
      });
    });

    child.on('close', (code) => {
      settle({
        code: code ?? 1,
        durationMs: Date.now() - start,
        stderr,
        stdout,
        timedOut: false,
      });
    });
  });
}

function statusFromSummary(summary, exitCode = 0) {
  return exitCode === 0 && summary.vulnerabilities.blocking === 0 ? 'pass' : 'fail';
}

function payloadFromAuditResult(options, result, auditJson, reason = null) {
  const summary = summarizeAudit(auditJson, options.auditLevel);
  return {
    status: statusFromSummary(summary, result.code),
    reason,
    duration_ms: result.durationMs,
    exit_code: result.code,
    command: result.command,
    timeout_ms: result.timeoutMs,
    scope: result.scope,
    summary,
  };
}

async function bulkAdvisoryFallback(options, reason, details = {}) {
  const result = await runBulkAdvisoryAudit(options, options.fallbackTimeoutMs);
  if (!result.ok) return { payload: null, error: result.error };

  const status = statusFromSummary(result.summary, 0);
  return {
    error: null,
    payload: {
      status,
      reason,
      fallback: 'npm-bulk-advisory',
      counts_available: true,
      command: details.command,
      duration_ms: Number(details.duration_ms || 0) + result.durationMs,
      exit_code: status === 'fail' ? 1 : 0,
      summary: result.summary,
      bulk_advisory: {
        url: result.url,
        duration_ms: result.durationMs,
        package_count: result.packageCount,
        version_count: result.versionCount,
        advisories: result.advisories,
      },
      ...details,
    },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseOptions(argv, env);
  const result = await runAudit(options);
  const auditJson = parseJsonFromText(result.stdout);

  if (auditJson) {
    const payload = payloadFromAuditResult(
      options,
      result,
      auditJson,
      result.timedOut ? 'pnpm_audit_timeout_with_parseable_json' : null
    );
    writeCache(options, basePayload(options, payload));
    emit(options, payload);
  }

  const failureDetails = {
    command: result.command,
    duration_ms: result.durationMs,
    exit_code: result.code,
  };

  if (result.timedOut) {
    const fallback = await bulkAdvisoryFallback(options, 'pnpm_audit_timeout_bulk_fallback', failureDetails);
    if (fallback.payload) {
      writeCache(options, basePayload(options, fallback.payload));
      emit(options, fallback.payload);
    }
    emitCachedOrSkip(options, 'pnpm_audit_timeout', {
      ...failureDetails,
      bulk_fallback_error: fallback.error,
    });
  }

  if (result.error) {
    const fallback = await bulkAdvisoryFallback(options, 'pnpm_audit_spawn_error_bulk_fallback', {
      ...failureDetails,
      error: result.error,
    });
    if (fallback.payload) {
      writeCache(options, basePayload(options, fallback.payload));
      emit(options, fallback.payload);
    }
    emitCachedOrSkip(options, 'pnpm_audit_spawn_error', {
      ...failureDetails,
      error: result.error,
      bulk_fallback_error: fallback.error,
    });
  }

  const fallback = await bulkAdvisoryFallback(options, 'pnpm_audit_unparseable_bulk_fallback', {
    ...failureDetails,
    stderr_preview: result.stderr.trim().slice(0, 1000),
    stdout_preview: result.stdout.trim().slice(0, 1000),
  });
  if (fallback.payload) {
    writeCache(options, basePayload(options, fallback.payload));
    emit(options, fallback.payload);
  }

  emitCachedOrSkip(options, 'pnpm_audit_unparseable', {
    ...failureDetails,
    bulk_fallback_error: fallback.error,
    stderr_preview: result.stderr.trim().slice(0, 1000),
    stdout_preview: result.stdout.trim().slice(0, 1000),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[bounded-pnpm-audit] ${error.message}`);
    process.exit(1);
  });
}
