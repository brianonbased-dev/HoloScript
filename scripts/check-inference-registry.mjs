#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'docs', 'architecture', 'inference-registry.json');
const strictArtifacts = process.argv.includes('--strict-artifacts');

function fail(message) {
  console.error(`[inference-registry] FAIL: ${message}`);
  process.exitCode = 1;
}

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    fail(`could not read ${path.relative(repoRoot, registryPath)}: ${err.message}`);
    return null;
  }
}

const registry = readRegistry();
if (!registry) process.exit();

if (registry.schema !== 'holoscript-inference-registry/v0.1.0') {
  fail(`unexpected schema ${String(registry.schema)}`);
}

if (!Array.isArray(registry.lanes) || registry.lanes.length === 0) {
  fail('registry.lanes must be a non-empty array');
}

const ids = new Set();
let requiredPathCount = 0;
let optionalPresent = 0;
let optionalMissing = 0;

for (const lane of registry.lanes ?? []) {
  if (!lane || typeof lane !== 'object') {
    fail('lane entry must be an object');
    continue;
  }

  if (!lane.id || typeof lane.id !== 'string') {
    fail('lane missing string id');
    continue;
  }

  if (ids.has(lane.id)) fail(`duplicate lane id: ${lane.id}`);
  ids.add(lane.id);

  for (const field of ['label', 'maturity']) {
    if (!lane[field] || typeof lane[field] !== 'string') {
      fail(`${lane.id}: missing string ${field}`);
    }
  }

  if (!Array.isArray(lane.kind) || lane.kind.length === 0) {
    fail(`${lane.id}: kind must be a non-empty array`);
  }

  for (const group of ['sources', 'tests']) {
    if (!Array.isArray(lane[group])) {
      fail(`${lane.id}: ${group} must be an array`);
      continue;
    }

    for (const relPath of lane[group]) {
      requiredPathCount++;
      if (!exists(relPath)) fail(`${lane.id}: missing ${group.slice(0, -1)} ${relPath}`);
    }
  }

  if (Array.isArray(lane.optionalArtifacts)) {
    for (const artifact of lane.optionalArtifacts) {
      const relPath = artifact?.path;
      if (!relPath || typeof relPath !== 'string') {
        fail(`${lane.id}: optional artifact missing string path`);
        continue;
      }
      if (exists(relPath)) {
        optionalPresent++;
      } else {
        optionalMissing++;
        const message = `${lane.id}: optional artifact not present: ${relPath}`;
        if (strictArtifacts) fail(message);
        else console.warn(`[inference-registry] WARN: ${message}`);
      }
    }
  }
}

if (process.exitCode && process.exitCode !== 0) {
  console.error(
    `[inference-registry] checked ${ids.size} lanes, ${requiredPathCount} required paths, ${optionalPresent} optional artifacts present, ${optionalMissing} optional artifacts missing`
  );
  process.exit();
}

console.log(
  `[inference-registry] PASS: ${ids.size} lanes, ${requiredPathCount} required paths, ${optionalPresent} optional artifacts present, ${optionalMissing} optional artifacts missing`
);
