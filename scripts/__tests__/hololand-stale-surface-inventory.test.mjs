#!/usr/bin/env node
/* global console */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanStaleSurfaces } from '../hololand-stale-surface-inventory.mjs';

function writeFixture(root, file, content) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function setOld(root, file) {
  const old = new Date('2026-01-01T00:00:00.000Z');
  utimesSync(join(root, file), old, old);
}

const root = mkdtempSync(join(tmpdir(), 'hololand-stale-surface-inventory-'));

writeFixture(root, 'pnpm-workspace.yaml', `
packages:
  - examples/*
  - packages/platform/*
  - packages/ar/*
`);

writeFixture(root, 'examples/source-only/world.holo', 'object "World" {}');
setOld(root, 'examples/source-only/world.holo');

writeFixture(root, 'examples/stale-react/package.json', '{"name":"stale-react"}');
writeFixture(root, 'examples/stale-react/src/App.tsx', 'export function App() { return null; }');
setOld(root, 'examples/stale-react/package.json');
setOld(root, 'examples/stale-react/src/App.tsx');

writeFixture(root, 'packages/platform/renderer/package.json', '{"name":"@hololand/renderer"}');
writeFixture(root, 'packages/platform/renderer/src/index.ts', 'export const renderer = true;');
writeFixture(root, 'packages/platform/renderer/source/renderer.hsplus', 'object "RendererBridge" {}');
setOld(root, 'packages/platform/renderer/package.json');
setOld(root, 'packages/platform/renderer/src/index.ts');
setOld(root, 'packages/platform/renderer/source/renderer.hsplus');

writeFixture(root, 'packages/ar/tracking/package.json', '{"name":"@hololand/ar-tracking"}');
writeFixture(root, 'packages/ar/tracking/src/index.ts', 'export const tracking = true;');
setOld(root, 'packages/ar/tracking/package.json');
setOld(root, 'packages/ar/tracking/src/index.ts');

writeFixture(root, 'docs/runtime.md', `
The production readiness flow keeps packages/ar/tracking until the deployment receipt is replaced.
`);

const report = scanStaleSurfaces({
  root,
  maxAgeDays: 60,
  candidateRoots: ['examples', 'packages/platform', 'packages/ar'],
});

const byPath = new Map(report.surfaces.map((surface) => [surface.path, surface]));

assert.equal(byPath.get('examples/source-only')?.status, 'active-proof');
assert.equal(byPath.get('examples/source-only')?.workspaceCovered, true);
assert.equal(byPath.get('examples/stale-react')?.status, 'jetson-archive-candidate');
assert.equal(byPath.get('packages/platform/renderer')?.status, 'bridge-debt');
assert.equal(byPath.get('packages/ar/tracking')?.status, 'watch');
assert.equal(byPath.get('packages/ar/tracking')?.references.deployment, 1);
assert.ok(report.summary.archiveCandidateCount >= 1);

console.log('PASS hololand stale surface inventory');
