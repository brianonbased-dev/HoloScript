#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'model-artifact-lanes.json');

export function loadModelLaneConfig(configPath = DEFAULT_CONFIG_PATH) {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function splitEnvPaths(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildModelSearchPaths({ root = REPO_ROOT, env = process.env, config = loadModelLaneConfig() } = {}) {
  const paths = [];
  const explicit = env[config.explicitModelPathEnv];
  if (explicit) paths.push(path.resolve(explicit));

  const artifactRoots = (config.artifactRootEnv || [])
    .flatMap((name) => splitEnvPaths(env[name]));
  for (const artifactRoot of artifactRoots) {
    for (const model of config.models || []) {
      paths.push(path.resolve(artifactRoot, model.file));
    }
  }

  for (const model of config.models || []) {
    if (model.repoFallback) paths.push(path.resolve(root, model.repoFallback));
  }

  return [...new Set(paths)];
}

export function findFirstExistingModel(options = {}) {
  return buildModelSearchPaths(options).find((candidate) => existsSync(candidate)) || null;
}

async function walk(dir, onFile) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}

export async function scanRepoLocalModelDebt({
  root = REPO_ROOT,
  now = new Date(),
  config = loadModelLaneConfig(),
} = {}) {
  const maxAgeDays = Number(config.maxRepoLocalAgeDays || 60);
  const dayMs = 24 * 60 * 60 * 1000;
  const findings = [];

  for (const relRoot of config.localDebtRoots || []) {
    const scanRoot = path.resolve(root, relRoot);
    await walk(scanRoot, async (filePath) => {
      if (!filePath.toLowerCase().endsWith('.gguf')) return;
      const stat = statSync(filePath);
      const ageDays = Math.floor((now.getTime() - stat.mtime.getTime()) / dayMs);
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      findings.push({
        path: filePath,
        relativePath,
        bytes: stat.size,
        ageDays,
        violation: ageDays >= maxAgeDays,
        reason: ageDays >= maxAgeDays
          ? `repo-local GGUF is ${ageDays} days old; move to artifact lane`
          : 'repo-local GGUF is below age threshold but still artifact-lane debt',
      });
    });
  }

  return {
    ok: findings.every((finding) => !finding.violation),
    maxAgeDays,
    findings,
  };
}

async function runSelfTest() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hololand-model-lanes-'));
  try {
    const fakeRoot = path.join(tmp, 'repo');
    mkdirSync(path.join(fakeRoot, 'models'), { recursive: true });
    const modelPath = path.join(fakeRoot, 'models', 'old.gguf');
    writeFileSync(modelPath, 'fake');
    const old = new Date('2026-01-01T00:00:00Z');
    utimesSync(modelPath, old, old);
    const config = {
      explicitModelPathEnv: 'BRITTNEY_MODEL_PATH',
      artifactRootEnv: ['BRITTNEY_MODEL_ROOT'],
      maxRepoLocalAgeDays: 60,
      localDebtRoots: ['models'],
      models: [{ file: 'old.gguf', repoFallback: 'models/old.gguf' }],
    };
    const found = findFirstExistingModel({ root: fakeRoot, env: {}, config });
    if (found !== modelPath) throw new Error(`expected fallback model path, got ${found}`);
    const scan = await scanRepoLocalModelDebt({
      root: fakeRoot,
      now: new Date('2026-06-29T00:00:00Z'),
      config,
    });
    if (scan.ok || scan.findings.length !== 1 || !scan.findings[0].violation) {
      throw new Error('expected one old local model violation');
    }
    console.log('[model-artifact-lanes] self-test ok');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) {
    await runSelfTest();
    return;
  }

  const config = loadModelLaneConfig();
  const searchPaths = buildModelSearchPaths({ config });
  const foundModel = findFirstExistingModel({ config });
  const scan = await scanRepoLocalModelDebt({ config });
  const payload = {
    schema: 'hololand-model-artifact-lane-report/v0.1.0',
    generatedAt: new Date().toISOString(),
    artifactRootEnv: config.artifactRootEnv,
    explicitModelPathEnv: config.explicitModelPathEnv,
    stableArtifactLane: config.stableArtifactLane,
    foundModel,
    searchPaths,
    repoLocalModelDebt: scan,
  };

  if (args.has('--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('HOLOLAND MODEL ARTIFACT LANES');
    console.log(`foundModel: ${foundModel || 'none'}`);
    console.log(`repoLocalDebt: ${scan.ok ? 'ok' : 'violations'}`);
    for (const finding of scan.findings) {
      const mib = Math.round((finding.bytes / 1024 / 1024) * 10) / 10;
      console.log(`- ${finding.relativePath} (${mib} MiB, ${finding.ageDays}d): ${finding.reason}`);
    }
  }

  if (args.has('--check') && !scan.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
