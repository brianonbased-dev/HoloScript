#!/usr/bin/env node
/**
 * HoloShell consent-gesture capture (founder 2026-06-24).
 *
 * Replaces the agent-assertable `freshUserGesture` boolean flag with a REAL physical keypress
 * proof. Arms a Win32 GetAsyncKeyState poll for a designated consent key, bound to a per-action
 * challenge nonce + the exact preflight-receipt hash, fresh within a short TTL. The proof is
 * HMAC-signed with a per-install secret stored at %USERPROFILE%/.holoshell/consent-gesture.key
 * (mode 0600, OUTSIDE the agent's repo working tree). The bridge issues a desktop-mutation
 * consent token ONLY for a verified proof.
 *
 * Residual (honest, NOT hidden): on a single machine this raises the bar massively — a real key
 * must be physically pressed in-window, and the signing key lives outside the repo — but it is
 * not cryptographically unforgeable against a fully-privileged local agent that can read any
 * file and synthesize keystrokes. The UNFORGEABLE completion is a HARDWARE-token gesture
 * (Trezor button press) — the founder already has one (F.122). This module is the software gate;
 * the hardware gate is the next hardening.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONSENT_GESTURE_SCHEMA = 'hololand.holoshell.consent-gesture.v0.1.0';
const KEY_DIR = path.join(os.homedir(), '.holoshell');
const KEY_PATH = path.join(KEY_DIR, 'consent-gesture.key');
const DEFAULT_KEY = 'F8';
const DEFAULT_MAX_TTL_MS = 30000;
const DEFAULT_FUTURE_SKEW_ALLOWANCE_MS = 5000;
// Virtual-key codes for keys unlikely to be pressed by accident.
const VK = { F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, SCROLLLOCK: 0x91, PAUSE: 0x13 };

/** Per-install HMAC secret, created once at 0600 outside the repo tree. */
export function consentSecret() {
  try {
    if (existsSync(KEY_PATH)) {
      const existing = readFileSync(KEY_PATH, 'utf8').trim();
      if (existing) return existing;
    }
  } catch {
    /* recreate below */
  }
  mkdirSync(KEY_DIR, { recursive: true });
  const secret = crypto.randomBytes(32).toString('hex');
  writeFileSync(KEY_PATH, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export function signProof(fields, secret = consentSecret()) {
  const canonical = [
    fields.schemaVersion,
    fields.challenge,
    fields.preflightReceiptHash,
    fields.key,
    fields.pressedAt,
    fields.observedGesture,
    fields.ttlMs,
  ].join(':');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

/** Pure verification (no I/O beyond the secret). Returns { ok, reason }. */
export function verifyProof(proof, opts = {}) {
  const secret = opts.secret || consentSecret();
  if (!proof || typeof proof !== 'object') return { ok: false, reason: 'missing_gesture_proof' };
  if (proof.schemaVersion !== CONSENT_GESTURE_SCHEMA) return { ok: false, reason: 'gesture_proof_schema_mismatch' };
  if (proof.observedGesture !== true) return { ok: false, reason: 'no_physical_gesture_observed' };
  if (opts.preflightReceiptHash && proof.preflightReceiptHash !== opts.preflightReceiptHash) {
    return { ok: false, reason: 'gesture_proof_preflight_mismatch' };
  }
  if (opts.expectedChallenge && proof.challenge !== opts.expectedChallenge) {
    return { ok: false, reason: 'gesture_proof_challenge_mismatch' };
  }
  const expectedSig = signProof(proof, secret);
  const provided = String(proof.signature || '');
  if (provided.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(provided))) {
    return { ok: false, reason: 'gesture_proof_signature_invalid' };
  }
  const now = Date.parse(opts.nowIso || new Date().toISOString());
  const pressed = Date.parse(proof.pressedAt || '');
  const ttlMs = Number(proof.ttlMs);
  const suppliedMaxTtl = Number(opts.maxTtlMs ?? DEFAULT_MAX_TTL_MS);
  const maxTtlMs = Number.isFinite(suppliedMaxTtl) && suppliedMaxTtl > 0
    ? suppliedMaxTtl
    : DEFAULT_MAX_TTL_MS;
  const suppliedSkewAllowance = Number(opts.futureSkewAllowanceMs ?? DEFAULT_FUTURE_SKEW_ALLOWANCE_MS);
  const futureSkewAllowanceMs = Number.isFinite(suppliedSkewAllowance)
    ? Math.max(0, suppliedSkewAllowance)
    : DEFAULT_FUTURE_SKEW_ALLOWANCE_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return { ok: false, reason: 'gesture_proof_ttl_invalid' };
  }
  if (ttlMs > maxTtlMs) {
    return { ok: false, reason: 'gesture_proof_ttl_exceeds_limit' };
  }
  if (!Number.isFinite(now) || !Number.isFinite(pressed) || now - pressed > ttlMs) {
    return { ok: false, reason: 'gesture_proof_stale' };
  }
  if (pressed - now > futureSkewAllowanceMs) {
    return { ok: false, reason: 'gesture_proof_from_future' };
  }
  return { ok: true, reason: '' };
}

function pollKeypress(key, ttlMs) {
  const vk = VK[String(key).toUpperCase()] ?? VK.F8;
  const script = `
Add-Type @"
using System;using System.Runtime.InteropServices;
public class HoloConsentKey { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey); }
"@
$vk = ${vk}
$deadline = (Get-Date).AddMilliseconds(${Number(ttlMs)})
$pressed = $false
while ((Get-Date) -lt $deadline) {
  if (([HoloConsentKey]::GetAsyncKeyState($vk) -band 0x8000) -ne 0) { $pressed = $true; break }
  Start-Sleep -Milliseconds 40
}
@{ pressed = $pressed; at = (Get-Date).ToString("o") } | ConvertTo-Json
`;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout: Number(ttlMs) + 5000, windowsHide: true }
  );
  try {
    return JSON.parse((r.stdout || '').trim());
  } catch {
    return { pressed: false, at: new Date().toISOString() };
  }
}

/** Arm the gesture capture: wait for a real keypress, return a signed proof. */
export function captureGesture({ challenge, preflightReceiptHash, key = DEFAULT_KEY, ttlMs = 30000 } = {}) {
  const res = process.platform === 'win32'
    ? pollKeypress(key, ttlMs)
    : { pressed: false, at: new Date().toISOString() };
  const fields = {
    schemaVersion: CONSENT_GESTURE_SCHEMA,
    challenge: String(challenge || ''),
    preflightReceiptHash: String(preflightReceiptHash || ''),
    key: String(key).toUpperCase(),
    pressedAt: res.at || new Date().toISOString(),
    observedGesture: res.pressed === true,
    ttlMs: Number(ttlMs),
  };
  return { ...fields, signature: signProof(fields) };
}

function parseArgs(argv) {
  const a = { challenge: '', preflightHash: '', key: DEFAULT_KEY, ttl: 30, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--challenge') a.challenge = argv[++i] || '';
    else if (arg === '--preflight-hash') a.preflightHash = argv[++i] || '';
    else if (arg === '--key') a.key = argv[++i] || DEFAULT_KEY;
    else if (arg === '--ttl') a.ttl = Number(argv[++i] || 30);
    else if (arg === '--json') a.json = true;
    else if (arg === '--help' || arg === '-h') { a.help = true; }
  }
  return a;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    console.log('Usage: node scripts/holoshell-consent-gesture.mjs --challenge <nonce> --preflight-hash <hash> [--key F8] [--ttl 30] [--json]');
    process.exit(0);
  }
  process.stderr.write(`[consent] Press ${a.key} within ${a.ttl}s to APPROVE this desktop action…\n`);
  const proof = captureGesture({ challenge: a.challenge, preflightReceiptHash: a.preflightHash, key: a.key, ttlMs: a.ttl * 1000 });
  if (a.json) console.log(JSON.stringify(proof, null, 2));
  else console.log(proof.observedGesture ? `consent gesture observed (${proof.key})` : 'no consent gesture — timed out, action NOT approved');
  process.exit(proof.observedGesture ? 0 : 1);
}
