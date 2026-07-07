#!/usr/bin/env node
/**
 * Collects HoloLlama live-service lifecycle receipts for owned fleet lanes.
 *
 * This is intentionally separate from the deterministic package-consumption
 * gate. It touches live endpoints when they are configured or explicitly
 * required, writes receipts under .scratch by default, and fails closed for
 * required lanes with missing or unhealthy live proof.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DIST_INDEX = join(ROOT, 'packages', 'holollama', 'dist', 'index.js');
const DEFAULT_OUT_DIR = join(ROOT, '.scratch', 'holollama-live-fleet-receipts');
const DEFAULT_JETSON_ENDPOINT = 'http://192.168.0.119:18080';
const PROFILES = new Set(['jetson-orin', 'vast-linux-gpu']);

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function valuesFor(name) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== `--${name}`) continue;
    const value = args[i + 1];
    if (value && !value.startsWith('--')) {
      out.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
      i += 1;
    }
  }
  return out;
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

function validateProfiles(label, profiles) {
  for (const profile of profiles) {
    if (!PROFILES.has(profile)) {
      throw new Error(`${label} contains unsupported HoloLlama live profile: ${profile}`);
    }
  }
}

function endpointFor(profile, requiredProfiles) {
  if (profile === 'jetson-orin') {
    return (
      process.env.HOLOLLAMA_JETSON_ENDPOINT ||
      process.env.JETSON_HOLOLLAMA_ENDPOINT ||
      process.env.HOLOLLAMA_ENDPOINT ||
      (requiredProfiles.has(profile) || hasFlag('use-default-jetson-endpoint')
        ? DEFAULT_JETSON_ENDPOINT
        : '')
    );
  }
  return (
    process.env.HOLOLLAMA_VAST_ENDPOINT ||
    process.env.VAST_HOLOLLAMA_ENDPOINT ||
    process.env.VAST_ENDPOINT ||
    ''
  );
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function scrubError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._:-]+/g, 'Bearer <redacted>');
}

function stage(profile, id, lifecycle) {
  return lifecycle.profiles
    ?.find((candidate) => candidate.profile === profile)
    ?.stages?.find((candidate) => candidate.id === id);
}

function formatProfile(result) {
  if (result.status === 'missing_endpoint') {
    return `[holollama-live-fleet] ${result.profile} missing endpoint (${result.required ? 'required' : 'optional'})`;
  }
  if (result.status === 'error') {
    return `[holollama-live-fleet] ${result.profile} ERROR ${result.error}`;
  }
  return `[holollama-live-fleet] ${result.profile} ${result.ok ? 'PASS' : 'FAIL'} ${result.endpoint} receipt=${result.receiptHash || 'none'}`;
}

if (hasFlag('help')) {
  console.log(`Usage:
  node scripts/holo-ci/check-holollama-live-fleet.mjs [options]

Options:
  --profiles jetson-orin,vast-linux-gpu   Profiles to inspect. Default: both.
  --require-profile <profile>[,<profile>] Require live proof for the profile(s).
  --require-live                          Require live proof for every selected profile.
  --out <dir>                             Receipt directory. Default: .scratch/holollama-live-fleet-receipts.
  --team-id <id>                          HoloMesh team id for lifecycle receipts.
  --timeout-ms <n>                        Live probe timeout. Default: 10000.
  --max-tokens <n>                        Tiny completion max tokens. Default: 4.
  --systemd                               Attempt systemd proof instead of HTTP-only service proof.
  --footprint                             Attempt SSH/procfs footprint proof.
  --use-default-jetson-endpoint           Probe ${DEFAULT_JETSON_ENDPOINT} even when Jetson is optional.
  --json                                  Emit JSON only.

Environment endpoints:
  HOLOLLAMA_JETSON_ENDPOINT or JETSON_HOLOLLAMA_ENDPOINT
  HOLOLLAMA_VAST_ENDPOINT or VAST_HOLOLLAMA_ENDPOINT
`);
  process.exit(0);
}

if (!existsSync(DIST_INDEX)) {
  console.error(
    `[holollama-live-fleet] built package missing: ${DIST_INDEX}\n` +
      '[holollama-live-fleet] Run: corepack pnpm --filter @holoscript/holollama run build'
  );
  process.exit(1);
}

const selectedProfiles = valuesFor('profile').concat(valuesFor('profiles'));
const profiles = selectedProfiles.length ? selectedProfiles : ['jetson-orin', 'vast-linux-gpu'];
validateProfiles('--profiles', profiles);

const requiredProfiles = new Set(valuesFor('require-profile'));
if (hasFlag('require-live')) {
  for (const profile of profiles) requiredProfiles.add(profile);
}
validateProfiles('--require-profile', [...requiredProfiles]);

const outDir = resolve(valueFor('out') || DEFAULT_OUT_DIR);
const teamId = valueFor('team-id') || process.env.HOLOMESH_TEAM_ID || 'team_test';
const timeoutMs = numberFor('timeout-ms', 10000);
const maxTokens = numberFor('max-tokens', 4);
const prompt = valueFor('prompt') || 'Reply with OK.';
const jsonOut = hasFlag('json');
mkdirSync(outDir, { recursive: true });

const api = await import(pathToFileURL(DIST_INDEX).href);
const generatedAt = new Date().toISOString();
const results = [];

for (const profile of profiles) {
  const endpoint = endpointFor(profile, requiredProfiles);
  const required = requiredProfiles.has(profile);
  if (!endpoint) {
    results.push({
      profile,
      required,
      ok: !required,
      status: 'missing_endpoint',
      message:
        profile === 'vast-linux-gpu'
          ? 'Set HOLOLLAMA_VAST_ENDPOINT or VAST_HOLOLLAMA_ENDPOINT to require Vast live proof.'
          : 'Set HOLOLLAMA_JETSON_ENDPOINT or pass --use-default-jetson-endpoint.',
    });
    continue;
  }

  try {
    const live = await api.probeHoloLlamaLiveLifecycle({
      profile,
      endpoint,
      generatedAt,
      timeoutMs,
      maxTokens,
      prompt,
      skipSystemd: !hasFlag('systemd'),
      skipFootprint: !hasFlag('footprint'),
    });
    const lifecycle = api.buildHoloLlamaFleetLifecycleReport({
      profile,
      teamId,
      generatedAt,
      requireLiveLifecycle: true,
      liveLifecycleReceipts: { [profile]: live },
    });
    const liveStage = stage(profile, 'live-lifecycle', lifecycle);
    const ok = live.ok && lifecycle.ok && liveStage?.ok === true;
    const profileDir = join(outDir, profile);
    mkdirSync(profileDir, { recursive: true });
    writeJson(join(profileDir, 'live-lifecycle.json'), live);
    writeJson(join(profileDir, 'fleet-lifecycle.json'), lifecycle);
    results.push({
      profile,
      required,
      ok,
      status: ok ? 'live_lifecycle_passed' : 'live_lifecycle_failed',
      endpoint,
      runtimeState: live.runtimeState,
      receiptHash: live.receiptHash,
      model: live.checks.model?.id ?? null,
      completionOk: live.checks.completion?.completionOk ?? false,
      lifecycleOk: lifecycle.ok,
      liveStageOk: liveStage?.ok === true,
      warnings: live.warnings,
      failures: live.failures,
      receiptFiles: [
        join(profileDir, 'live-lifecycle.json'),
        join(profileDir, 'fleet-lifecycle.json'),
      ],
    });
  } catch (error) {
    results.push({
      profile,
      required,
      ok: false,
      status: 'error',
      endpoint,
      error: scrubError(error),
    });
  }
}

const failures = results.filter((result) => result.ok !== true);
const requiredFailures = failures.filter((result) => result.required);
const configuredFailures = failures.filter((result) => result.endpoint);
const output = {
  schema: 'holoscript.holollama-live-fleet-check.v1',
  generatedAt,
  ok: requiredFailures.length === 0 && configuredFailures.length === 0,
  receiptDir: outDir,
  teamId,
  requiredProfiles: [...requiredProfiles],
  profiles: results,
  blockers: [...requiredFailures, ...configuredFailures].map((result) => {
    if (result.status === 'missing_endpoint') return `${result.profile}: ${result.message}`;
    if (result.status === 'error') return `${result.profile}: ${result.error}`;
    return `${result.profile}: live lifecycle did not pass`;
  }),
};

writeJson(join(outDir, 'summary.json'), output);

if (jsonOut) {
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const result of results) console.log(formatProfile(result));
  if (output.ok) {
    console.log(`[holollama-live-fleet] PASS: receipts written to ${outDir}`);
  } else {
    console.error(`[holollama-live-fleet] FAIL: ${output.blockers.length} blocker(s)`);
    for (const blocker of output.blockers) console.error(`  - ${blocker}`);
  }
}

process.exitCode = output.ok ? 0 : 1;
