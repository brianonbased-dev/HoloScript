#!/usr/bin/env node
/**
 * Root compatibility entrypoint for the Paper 5 GraphRAG accuracy benchmark.
 *
 * The publication cites this path. Keep the real implementation in the
 * absorb-service package so CI and package-local runs share one artifact
 * path. This file mirrors the shape of paper-5-gpu-bench.mjs.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = resolve(root, 'packages', 'absorb-service', 'scripts', 'bench-paper-5-accuracy.mjs');

if (!existsSync(runner)) {
  console.error(`[paper-5-accuracy-bench] missing package runner: ${runner}`);
  process.exit(1);
}

const mod = await import(pathToFileURL(runner).href);
const code = await mod.main(process.argv.slice(2), {
  cwd: root,
  defaultOut: '.bench-logs/paper-5-accuracy-bench.json',
});
process.exit(code);
