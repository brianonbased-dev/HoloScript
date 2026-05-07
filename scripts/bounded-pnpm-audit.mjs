#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_PATH = join(ROOT, '.build-logs', 'pnpm-audit-cache.json');

const rawArgs = process.argv.slice(2);

function flagValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = rawArgs.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function numericFlag(name, fallback) {
  const value = Number(flagValue(name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const timeoutMs = numericFlag('timeout-ms', DEFAULT_TIMEOUT_MS);
const cacheTtlMs = numericFlag('cache-ttl-ms', DEFAULT_CACHE_TTL_MS);
const requestedAuditLevel = flagValue('audit-level', 'moderate');
const auditLevel = new Set(['low', 'moderate', 'high', 'critical']).has(requestedAuditLevel)
  ? requestedAuditLevel
  : 'moderate';
const cachePath = resolve(ROOT, flagValue('cache-path', DEFAULT_CACHE_PATH));
const noCache = rawArgs.includes('--no-cache');
const noFailOnVuln = rawArgs.includes('--no-fail-on-vuln');

const auditArgs = ['audit', '--json', `--audit-level=${auditLevel}`];
if (rawArgs.includes('--prod')) auditArgs.push('--prod');
if (rawArgs.includes('--dev')) auditArgs.push('--dev');

const pnpmCommand = 'pnpm';
const commandText = [pnpmCommand, ...auditArgs].join(' ');

function nowIso() {
  return new Date().toISOString();
}

function parseJsonFromText(text) {
  const trimmed = text.trim();
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

function readFreshCache() {
  if (noCache || cacheTtlMs === 0 || !existsSync(cachePath)) return null;

  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    const cachedAt = Date.parse(cached.timestamp);
    if (!Number.isFinite(cachedAt)) return null;

    const ageMs = Date.now() - cachedAt;
    if (ageMs < 0 || ageMs > cacheTtlMs) return null;

    return { payload: cached, ageMs };
  } catch {
    return null;
  }
}

function writeCache(payload) {
  if (noCache) return;

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function countAdvisories(auditJson) {
  const advisories = auditJson?.advisories;
  if (!advisories || typeof advisories !== 'object') return 0;
  return Object.keys(advisories).length;
}

function summarizeAudit(auditJson) {
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  const metadataVulnerabilities = auditJson?.metadata?.vulnerabilities;
  const vulnerabilities = {};

  if (metadataVulnerabilities && typeof metadataVulnerabilities === 'object') {
    for (const severity of severities) {
      const count = Number(metadataVulnerabilities[severity] ?? 0);
      vulnerabilities[severity] = Number.isFinite(count) ? count : 0;
    }
  } else {
    for (const severity of severities) vulnerabilities[severity] = 0;

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
    : severities.reduce((sum, severity) => sum + vulnerabilities[severity], 0);
  const threshold = severities.indexOf(auditLevel);
  vulnerabilities.blocking = severities
    .slice(threshold >= 0 ? threshold : severities.indexOf('moderate'))
    .reduce((sum, severity) => sum + vulnerabilities[severity], 0);

  return {
    audit_level: auditLevel,
    vulnerabilities,
    advisory_count: countAdvisories(auditJson),
    dependency_count: auditJson?.metadata?.dependencies ?? null,
  };
}

function basePayload(payload) {
  return {
    schema: 'holoscript.pnpm_audit.v1',
    timestamp: nowIso(),
    command: commandText,
    timeout_ms: timeoutMs,
    cache_path: cachePath,
    ...payload,
  };
}

function exitForStatus(payload) {
  if (payload.status === 'fail') return noFailOnVuln ? 0 : 1;
  if (payload.status === 'cached' && payload.cached_status === 'fail') return noFailOnVuln ? 0 : 1;
  return 0;
}

function emit(payload) {
  const output = basePayload(payload);
  console.log(JSON.stringify(output, null, 2));
  process.exit(exitForStatus(output));
}

function emitCachedOrSkip(reason, details = {}) {
  const cached = readFreshCache();
  if (cached) {
    emit({
      status: 'cached',
      reason,
      cached_status: cached.payload.status,
      cache_age_ms: cached.ageMs,
      summary: cached.payload.summary,
      ...details,
    });
  }

  emit({
    status: 'skip',
    reason,
    ...details,
  });
}

function runAudit() {
  return new Promise((resolveRun) => {
    const start = Date.now();
    const childCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : pnpmCommand;
    const childArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', commandText]
      : auditArgs;
    const child = spawn(childCommand, childArgs, {
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
      resolveRun(payload);
    }

    function killProcessTree() {
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

    timer = setTimeout(() => {
      killProcessTree();
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

const result = await runAudit();

if (result.timedOut) {
  emitCachedOrSkip('pnpm_audit_timeout', {
    duration_ms: result.durationMs,
  });
}

if (result.error) {
  emitCachedOrSkip('pnpm_audit_spawn_error', {
    duration_ms: result.durationMs,
    error: result.error,
  });
}

const auditJson = parseJsonFromText(result.stdout);
if (!auditJson) {
  emitCachedOrSkip('pnpm_audit_unparseable', {
    duration_ms: result.durationMs,
    exit_code: result.code,
    stderr_preview: result.stderr.trim().slice(0, 1000),
    stdout_preview: result.stdout.trim().slice(0, 1000),
  });
}

const summary = summarizeAudit(auditJson);
const status = result.code === 0 && summary.vulnerabilities.blocking === 0 ? 'pass' : 'fail';
const payload = {
  status,
  duration_ms: result.durationMs,
  exit_code: result.code,
  summary,
};

writeCache(basePayload(payload));
emit(payload);
