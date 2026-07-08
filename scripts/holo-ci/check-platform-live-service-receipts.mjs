#!/usr/bin/env node
/**
 * Collects live HoloKey/x402-adjacent service receipts for @holoscript/platform.
 *
 * This is intentionally separate from package installability checks. By default
 * it is secret-safe and non-invasive: missing live configuration is reported as
 * a blocker-shaped receipt, not as proof. Use --require-live when a deployment
 * lane wants to claim hosted HoloKey/x402 service availability.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = join(ROOT, '.scratch', 'platform-live-service-receipts');
const DEFAULT_MESH_API_BASE = 'https://mcp.holoscript.net/api/holomesh';
const DEFAULT_SYNTHETIC_WALLET = '0x0000000000000000000000000000000000000001';
const SCHEMA = 'holoscript.platform-live-service-receipts.v1';

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function valueFor(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx < 0) return undefined;
  const value = args[idx + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function numberFor(name, fallback) {
  const raw = valueFor(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return value;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function fingerprintSecret(value) {
  return value ? `sha256:${sha256(value).slice(0, 16)}` : null;
}

function redactBearer(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._:/+=-]+/gu, 'Bearer <redacted>')
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._:/+=-]+/giu, '$1<redacted>');
}

function redactWallet(address) {
  const value = String(address || '');
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isWalletAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(address || ''));
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeBase(base) {
  return String(base || DEFAULT_MESH_API_BASE).replace(/\/+$/u, '');
}

function vaultFetch(name, owner, env) {
  const bin = env.HOLOKEY_VAULT_BIN;
  if (!bin) return undefined;
  try {
    const result = spawnSync(process.execPath, [bin, 'resolve', name], {
      env: { ...env, HOLOKEY_OWNER: owner },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1 << 20,
      windowsHide: true,
    });
    if (result.status === 0 && typeof result.stdout === 'string' && result.stdout.length > 0) {
      return result.stdout;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function resolveSecretCandidate(candidate, env) {
  const envValue = env[candidate.name];
  if (envValue) {
    return {
      value: envValue,
      source: `env:${candidate.name}`,
      owner: null,
      vaultAttempted: false,
    };
  }

  const owner = candidate.owner(env);
  const vaultValue = vaultFetch(candidate.name, owner, env);
  if (vaultValue) {
    return {
      value: vaultValue,
      source: `holokey:${candidate.name}`,
      owner,
      vaultAttempted: true,
    };
  }

  return {
    value: undefined,
    source: `missing:${candidate.name}`,
    owner,
    vaultAttempted: Boolean(env.HOLOKEY_VAULT_BIN),
  };
}

function resolveBearer(env) {
  const candidates = [
    {
      name: 'PLATFORM_HOLOKEY_X402_BEARER',
      owner: () => env.HOLOKEY_INFRA_OWNER || 'infra',
    },
    {
      name: 'HOLOSCRIPT_AGENT_X402_BEARER',
      owner: () => env.HOLOSCRIPT_AGENT_HANDLE || env.HOLOKEY_INFRA_OWNER || 'infra',
    },
    {
      name: 'HOLOMESH_API_KEY',
      owner: () => env.HOLOKEY_INFRA_OWNER || 'infra',
    },
    {
      name: 'HOLOSCRIPT_API_KEY',
      owner: () => env.HOLOKEY_INFRA_OWNER || 'infra',
    },
  ];

  const attempts = candidates.map((candidate) => resolveSecretCandidate(candidate, env));
  const found = attempts.find((attempt) => attempt.value);
  return {
    value: found?.value || '',
    source: found?.source || null,
    owner: found?.owner || null,
    fingerprint: fingerprintSecret(found?.value || ''),
    attempts: attempts.map((attempt) => ({
      source: attempt.source,
      owner: attempt.owner,
      present: Boolean(attempt.value),
      vaultAttempted: attempt.vaultAttempted,
    })),
  };
}

function walletFromEnv(env, allowSyntheticWallet) {
  const value =
    env.PLATFORM_LIVE_WALLET_ADDRESS ||
    env.PLATFORM_HOLOKEY_WALLET ||
    env.HOLOSCRIPT_AGENT_WALLET ||
    '';
  if (isWalletAddress(value)) return { value, source: 'env' };
  if (allowSyntheticWallet) return { value: DEFAULT_SYNTHETIC_WALLET, source: 'synthetic' };
  return { value: '', source: null };
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      json,
      text: redactBearer(text).slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeBrokerChallenge({ base, wallet, fetchImpl, timeoutMs }) {
  if (!wallet.value) {
    return {
      id: 'broker-challenge',
      ok: false,
      status: 'missing_wallet',
      requiredEnv: ['PLATFORM_LIVE_WALLET_ADDRESS', 'PLATFORM_HOLOKEY_WALLET', 'HOLOSCRIPT_AGENT_WALLET'],
    };
  }

  const response = await fetchJson(
    fetchImpl,
    `${base}/key/challenge`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet_address: wallet.value }),
    },
    timeoutMs
  );

  return {
    id: 'broker-challenge',
    ok: response.ok && typeof response.json?.nonce === 'string' && response.json.nonce.length > 0,
    status:
      response.ok && typeof response.json?.nonce === 'string' && response.json.nonce.length > 0
        ? 'passed'
        : 'failed',
    httpStatus: response.status,
    durationMs: response.durationMs,
    wallet: redactWallet(wallet.value),
    walletSource: wallet.source,
    nonceReceived: typeof response.json?.nonce === 'string' && response.json.nonce.length > 0,
    responsePreview: response.ok ? undefined : response.text,
  };
}

async function probeBearerAuth({ base, bearer, fetchImpl, timeoutMs }) {
  if (!bearer.value) {
    return {
      id: 'bearer-auth',
      ok: false,
      status: 'missing_bearer',
      requiredEnv: [
        'PLATFORM_HOLOKEY_X402_BEARER',
        'HOLOSCRIPT_AGENT_X402_BEARER',
        'HOLOMESH_API_KEY',
        'HOLOSCRIPT_API_KEY',
      ],
      secretAttempts: bearer.attempts,
    };
  }

  const response = await fetchJson(
    fetchImpl,
    `${base}/me`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearer.value}`,
        'content-type': 'application/json',
      },
    },
    timeoutMs
  );

  return {
    id: 'bearer-auth',
    ok: response.ok && Boolean(response.json?.agentId || response.json?.name || response.json?.wallet),
    status:
      response.ok && Boolean(response.json?.agentId || response.json?.name || response.json?.wallet)
        ? 'passed'
        : 'failed',
    httpStatus: response.status,
    durationMs: response.durationMs,
    bearerSource: bearer.source,
    bearerFingerprint: bearer.fingerprint,
    agent: response.ok
      ? {
          agentId: response.json?.agentId || null,
          name: response.json?.name || null,
          wallet: redactWallet(response.json?.wallet),
          isFounder: typeof response.json?.isFounder === 'boolean' ? response.json.isFounder : null,
        }
      : null,
    responsePreview: response.ok ? undefined : response.text,
  };
}

function blockersFor(probes, requirements) {
  const blockers = [];
  for (const probe of probes) {
    const required = requirements.has(probe.id);
    if (probe.ok) continue;
    if (required || probe.status !== 'missing_wallet' && probe.status !== 'missing_bearer') {
      blockers.push(`${probe.id}: ${probe.status}`);
    }
  }
  return blockers;
}

async function runCheck(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const base = normalizeBase(options.base || env.PLATFORM_HOLOMESH_API_BASE || env.HOLOMESH_API_BASE);
  const timeoutMs = options.timeoutMs || 10000;
  const requireLive = Boolean(options.requireLive);
  const requirements = new Set();
  if (requireLive || options.requireBrokerChallenge) requirements.add('broker-challenge');
  if (requireLive || options.requireBearerAuth) requirements.add('bearer-auth');

  const wallet = walletFromEnv(env, Boolean(options.allowSyntheticWallet));
  const bearer = resolveBearer(env);
  const probes = [];
  probes.push(await probeBrokerChallenge({ base, wallet, fetchImpl, timeoutMs }));
  probes.push(await probeBearerAuth({ base, bearer, fetchImpl, timeoutMs }));

  const blockers = blockersFor(probes, requirements);
  const configuredFailures = probes.filter(
    (probe) =>
      probe.ok !== true &&
      probe.status !== 'missing_wallet' &&
      probe.status !== 'missing_bearer'
  );
  const ok = blockers.length === 0 && configuredFailures.length === 0;
  const liveProofs = probes.filter((probe) => probe.ok === true).map((probe) => probe.id);
  const disposition =
    liveProofs.length === probes.length
      ? 'live_service_receipts_passed'
      : liveProofs.length > 0
        ? 'partial_live_service_receipts'
        : 'live_service_not_configured';

  return {
    schema: SCHEMA,
    generatedAt,
    ok,
    disposition,
    base,
    requirements: [...requirements],
    liveProofs,
    probes,
    blockers,
    caveat:
      'Package API installability is separate from hosted HoloKey/x402 service availability; require live receipts before making hosted-service claims.',
  };
}

function runSelfTest() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/key/challenge')) {
      return new Response(JSON.stringify({ nonce: 'nonce-test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url).endsWith('/me')) {
      return new Response(
        JSON.stringify({
          agentId: 'agent_test',
          name: 'platform-canary-x402',
          wallet: '0x0000000000000000000000000000000000000001',
          isFounder: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response('not found', { status: 404 });
  };

  return runCheck({
    fetchImpl,
    requireLive: true,
    base: 'https://example.invalid/api/holomesh',
    timeoutMs: 100,
    env: {
      PLATFORM_LIVE_WALLET_ADDRESS: DEFAULT_SYNTHETIC_WALLET,
      PLATFORM_HOLOKEY_X402_BEARER: 'secret-test-token',
    },
    generatedAt: '2026-07-07T00:00:00.000Z',
  }).then((receipt) => {
    if (!receipt.ok) throw new Error(`self-test receipt failed: ${JSON.stringify(receipt.blockers)}`);
    if (receipt.liveProofs.length !== 2) throw new Error('self-test did not prove both live stages');
    const auth = calls.find((call) => String(call.url).endsWith('/me'));
    if (!auth) throw new Error('self-test did not call /me');
    if (!String(auth.init.headers.Authorization).startsWith('Bearer secret-test-token')) {
      throw new Error('self-test bearer header missing');
    }
    if (JSON.stringify(receipt).includes('secret-test-token')) {
      throw new Error('self-test leaked bearer into receipt');
    }
    console.log('[platform-live-service] self-test PASS');
  });
}

if (hasFlag('help')) {
  console.log(`Usage:
  node scripts/holo-ci/check-platform-live-service-receipts.mjs [options]

Options:
  --require-live                 Require broker challenge and bearer-auth receipts.
  --require-broker-challenge     Require POST /key/challenge proof.
  --require-bearer-auth          Require authenticated GET /me proof.
  --allow-synthetic-wallet       Use a non-custodial sample wallet when no wallet env is set.
  --base <url>                   HoloMesh API base. Default: HOLOMESH_API_BASE or ${DEFAULT_MESH_API_BASE}
  --out <dir>                    Receipt directory. Default: .scratch/platform-live-service-receipts.
  --timeout-ms <n>               Fetch timeout. Default: 10000.
  --self-test                    Run mocked self-test without network or secrets.
  --json                         Emit JSON only.

Environment:
  PLATFORM_HOLOMESH_API_BASE or HOLOMESH_API_BASE
  PLATFORM_LIVE_WALLET_ADDRESS or PLATFORM_HOLOKEY_WALLET or HOLOSCRIPT_AGENT_WALLET
  PLATFORM_HOLOKEY_X402_BEARER or HOLOSCRIPT_AGENT_X402_BEARER or HOLOMESH_API_KEY or HOLOSCRIPT_API_KEY
  HOLOKEY_VAULT_BIN optionally resolves the bearer names vault-first.
`);
  process.exit(0);
}

if (hasFlag('self-test')) {
  await runSelfTest();
  process.exit(0);
}

const receipt = await runCheck({
  requireLive: hasFlag('require-live'),
  requireBrokerChallenge: hasFlag('require-broker-challenge'),
  requireBearerAuth: hasFlag('require-bearer-auth'),
  allowSyntheticWallet: hasFlag('allow-synthetic-wallet'),
  base: valueFor('base'),
  timeoutMs: numberFor('timeout-ms', 10000),
});

const outDir = resolve(valueFor('out') || DEFAULT_OUT_DIR);
const outFile = join(outDir, 'summary.json');
writeJson(outFile, receipt);

if (hasFlag('json')) {
  console.log(JSON.stringify({ ...receipt, receiptFile: outFile }, null, 2));
} else {
  for (const probe of receipt.probes) {
    console.log(
      `[platform-live-service] ${probe.id} ${probe.ok ? 'PASS' : 'MISS'} ${probe.status}`
    );
  }
  if (receipt.ok) {
    console.log(`[platform-live-service] PASS: receipt written to ${outFile}`);
  } else {
    console.error(`[platform-live-service] FAIL: ${receipt.blockers.length} blocker(s)`);
    for (const blocker of receipt.blockers) console.error(`  - ${blocker}`);
  }
}

process.exitCode = receipt.ok ? 0 : 1;
