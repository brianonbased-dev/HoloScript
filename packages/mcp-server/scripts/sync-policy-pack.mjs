#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = resolve(ROOT, 'src', 'policy', 'policy-pack.holo.hsplus');
const DEFAULT_DESTINATION = resolve(ROOT, 'dist', 'policy-pack.holo.hsplus');

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function syncPolicyPack({
  source = DEFAULT_SOURCE,
  destination = DEFAULT_DESTINATION,
} = {}) {
  if (!existsSync(source)) throw new Error(`policy pack source missing: ${source}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  const sourceHash = sha256File(source);
  const destinationHash = sha256File(destination);
  if (sourceHash !== destinationHash) {
    throw new Error('policy pack build copy failed integrity verification');
  }
  return { source, destination, sha256: destinationHash };
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entryUrl === import.meta.url) {
  const result = syncPolicyPack();
  process.stdout.write(`[mcp-server] policy pack -> ${result.destination} sha256:${result.sha256}\n`);
}
