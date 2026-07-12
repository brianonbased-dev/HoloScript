#!/usr/bin/env node
/**
 * Secret-safe live service receipt for @holoscript/platform.
 *
 * This gate proves hosted HoloKey/x402 identity-service availability separately
 * from package installability. It intentionally does not use API keys, wallet
 * private keys, signatures, payments, or registration mutations. The only live
 * mutation it permits is an ephemeral registration challenge nonce for a
 * generated canary wallet address.
 */

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const endpointIdx = args.indexOf('--endpoint');
const outIdx = args.indexOf('--out');
const timeoutIdx = args.indexOf('--timeout-ms');
const ENDPOINT = normalizeEndpoint(
  endpointIdx >= 0
    ? args[endpointIdx + 1]
    : process.env.HOLOSCRIPT_PLATFORM_LIVE_ENDPOINT ||
        process.env.HOLOSCRIPT_MCP_BASE_URL ||
        'https://mcp.holoscript.net'
);
const OUT_PATH = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;
const TIMEOUT_MS =
  timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : Number(process.env.PLATFORM_LIVE_TIMEOUT_MS || 15_000);

const SECRET_KEY_PATTERN =
  /(?:private[_-]?key|wallet[_-]?key|api[_-]?key|authorization|bearer|secret|access[_-]?token|refresh[_-]?token|session[_-]?token)/iu;
const SECRET_VALUE_PATTERN = /(?:holomesh_sk_|hls_[a-z0-9_]+|sk-[a-z0-9_-]{16,}|0x[a-f0-9]{64})/iu;

function normalizeEndpoint(value) {
  return String(value || '').replace(/\/+$/u, '');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canaryWallet() {
  return `0x${sha256(`platform-live-service:${Date.now()}:${process.pid}`).slice(0, 40)}`;
}

function safeUrl(path) {
  return `${ENDPOINT}${path}`;
}

function truncate(value, max = 1600) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function fetchJson(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(safeUrl(path), {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { nonJsonBodyPrefix: truncate(text, 300) };
  }
  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    body,
  };
}

function secretFindings(value, path = '$') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...secretFindings(entry, `${path}[${index}]`)));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SECRET_KEY_PATTERN.test(key)) findings.push({ path: childPath, reason: 'secret-shaped-key' });
      findings.push(...secretFindings(nested, childPath));
    }
    return findings;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    findings.push({ path, reason: 'secret-shaped-value' });
  }
  return findings;
}

function summarizeHealth(body) {
  if (!body || typeof body !== 'object') return { shape: 'missing' };
  return {
    success: body.success === true || body.status === 'ok' || body.ok === true,
    status: typeof body.status === 'string' ? body.status : null,
    tools: typeof body.tools === 'number' ? body.tools : null,
    version: typeof body.version === 'string' ? body.version : null,
    keys: Object.keys(body).sort().slice(0, 20),
  };
}

function summarizeChallenge(body) {
  const challenge = body?.challenge && typeof body.challenge === 'object' ? body.challenge : {};
  return {
    success: body?.success === true,
    noncePresent: typeof body?.nonce === 'string' && body.nonce.length >= 8,
    nonceSha256: typeof body?.nonce === 'string' ? `sha256:${sha256(body.nonce)}` : null,
    expiresIn: typeof body?.expires_in === 'number' ? body.expires_in : null,
    challengeDomain: typeof challenge.domain === 'string' ? challenge.domain : null,
    challengeWalletMatches: false,
    nextInstruction:
      typeof body?.instructions?.next === 'string'
        ? body.instructions.next.replace(/0x[a-fA-F0-9]{40}/gu, '<wallet>')
        : null,
    responseKeys: body && typeof body === 'object' ? Object.keys(body).sort() : [],
  };
}

async function runProbe(name, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      name,
      ok: false,
      error: {
        message: truncate(error?.message || error),
        name: error?.name || 'Error',
      },
    };
  }
}

async function healthProbe() {
  const response = await fetchJson('/health');
  const leaks = secretFindings(response.body);
  const summary = summarizeHealth(response.body);
  return {
    name: 'hosted-health',
    method: 'GET',
    path: '/health',
    ok: response.status === 200 && leaks.length === 0 && (summary.success === true || summary.tools !== null),
    status: response.status,
    durationMs: response.durationMs,
    summary,
    secretLeakFindings: leaks,
  };
}

async function challengeProbe() {
  const walletAddress = canaryWallet();
  const response = await fetchJson('/api/holomesh/register/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  const leaks = secretFindings(response.body);
  const summary = summarizeChallenge(response.body);
  summary.challengeWalletMatches = response.body?.challenge?.walletAddress === walletAddress;
  return {
    name: 'holokey-x402-registration-challenge',
    method: 'POST',
    path: '/api/holomesh/register/challenge',
    ok:
      response.status === 200 &&
      summary.success === true &&
      summary.noncePresent === true &&
      summary.challengeWalletMatches === true &&
      summary.challengeDomain === 'HoloMesh Registration' &&
      leaks.length === 0,
    status: response.status,
    durationMs: response.durationMs,
    canaryWalletSha256: `sha256:${sha256(walletAddress.toLowerCase())}`,
    summary,
    secretLeakFindings: leaks,
  };
}

async function buildReceipt() {
  const probes = [
    await runProbe('hosted-health', healthProbe),
    await runProbe('holokey-x402-registration-challenge', challengeProbe),
  ];
  const ok = probes.every((probe) => probe.ok === true);
  return {
    schema: 'holoscript.platform-live-service-receipt.v1',
    generatedAt: new Date().toISOString(),
    ok,
    endpoint: {
      origin: ENDPOINT,
      originSha256: `sha256:${sha256(ENDPOINT)}`,
    },
    package: '@holoscript/platform',
    scope: 'hosted HoloKey/x402 identity-service availability',
    safety: {
      usesApiKey: false,
      usesWalletPrivateKey: false,
      signsChallenge: false,
      createsAgentIdentity: false,
      executesPayment: false,
      mutatesWalletEnv: false,
      allowedLiveMutation: 'ephemeral registration challenge nonce only',
    },
    probes,
    finalDisposition: ok ? 'platform_live_holokey_x402_receipt_passed' : 'platform_live_holokey_x402_receipt_failed',
  };
}

function emit(receipt) {
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (OUT_PATH) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, text);
  }
  if (JSON_OUT || !OUT_PATH) {
    console.log(text.trimEnd());
  } else {
    console.log(`[platform-live-service] ${receipt.ok ? 'PASS' : 'FAIL'} -> ${OUT_PATH}`);
  }
}

buildReceipt()
  .then((receipt) => {
    emit(receipt);
    process.exit(receipt.ok ? 0 : 1);
  })
  .catch((error) => {
    const receipt = {
      schema: 'holoscript.platform-live-service-receipt.v1',
      generatedAt: new Date().toISOString(),
      ok: false,
      endpoint: { origin: ENDPOINT, originSha256: `sha256:${sha256(ENDPOINT)}` },
      package: '@holoscript/platform',
      scope: 'hosted HoloKey/x402 identity-service availability',
      safety: {
        usesApiKey: false,
        usesWalletPrivateKey: false,
        signsChallenge: false,
        createsAgentIdentity: false,
        executesPayment: false,
        mutatesWalletEnv: false,
        allowedLiveMutation: 'ephemeral registration challenge nonce only',
      },
      probes: [],
      finalDisposition: 'platform_live_holokey_x402_receipt_crashed',
      failure: { message: truncate(error?.message || error), name: error?.name || 'Error' },
    };
    emit(receipt);
    process.exit(1);
  });
