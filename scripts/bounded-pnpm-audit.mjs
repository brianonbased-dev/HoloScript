#!/usr/bin/env node

import { spawn } from 'node:child_process';
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
  console.log(JSON.stringify(output, null, 2));
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
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${child.pid} /T /F`], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
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
      killProcessTree(child);
      settle({
        code: 1,
        durationMs: Date.now() - start,
        stderr,
        stdout,
        timedOut: true,
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

async function fallbackSplitAudit(options, reason, details = {}) {
  const scopes = options.scope === 'all' ? ['prod', 'dev'] : [options.scope];
  const successes = [];
  const failures = [];

  for (const scope of scopes) {
    const result = await runAudit(options, scope, options.fallbackTimeoutMs);
    const auditJson = parseJsonFromText(result.stdout);
    if (auditJson) {
      successes.push({
        scope,
        command: result.command,
        duration_ms: result.durationMs,
        exit_code: result.code,
        summary: summarizeAudit(auditJson, options.auditLevel),
      });
    } else {
      failures.push({
        scope,
        command: result.command,
        duration_ms: result.durationMs,
        timed_out: Boolean(result.timedOut),
        error: result.error || null,
        stderr_preview: String(result.stderr || '').trim().slice(0, 1000),
        stdout_preview: String(result.stdout || '').trim().slice(0, 1000),
      });
    }
  }

  if (!successes.length) return null;

  const summary = mergeAuditSummaries(
    successes.map((entry) => entry.summary),
    options.auditLevel
  );
  summary.partial = failures.length > 0;
  summary.scopes = successes.map((entry) => entry.scope);

  return {
    status: statusFromSummary(summary, failures.length ? 1 : 0),
    reason,
    fallback: 'split-prod-dev',
    counts_available: true,
    command: details.command,
    duration_ms: details.duration_ms,
    exit_code: details.exit_code,
    summary,
    fallback_successes: successes,
    fallback_failures: failures,
    ...details,
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
    const fallback = await fallbackSplitAudit(options, 'pnpm_audit_timeout_split_fallback', failureDetails);
    if (fallback) {
      writeCache(options, basePayload(options, fallback));
      emit(options, fallback);
    }
    emitCachedOrSkip(options, 'pnpm_audit_timeout', failureDetails);
  }

  if (result.error) {
    const fallback = await fallbackSplitAudit(options, 'pnpm_audit_spawn_error_split_fallback', {
      ...failureDetails,
      error: result.error,
    });
    if (fallback) {
      writeCache(options, basePayload(options, fallback));
      emit(options, fallback);
    }
    emitCachedOrSkip(options, 'pnpm_audit_spawn_error', {
      ...failureDetails,
      error: result.error,
    });
  }

  const fallback = await fallbackSplitAudit(options, 'pnpm_audit_unparseable_split_fallback', {
    ...failureDetails,
    stderr_preview: result.stderr.trim().slice(0, 1000),
    stdout_preview: result.stdout.trim().slice(0, 1000),
  });
  if (fallback) {
    writeCache(options, basePayload(options, fallback));
    emit(options, fallback);
  }

  emitCachedOrSkip(options, 'pnpm_audit_unparseable', {
    ...failureDetails,
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
