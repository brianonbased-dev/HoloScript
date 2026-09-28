#!/usr/bin/env node
/**
 * Named test: a service image that ships @holoscript/core must also ship
 * @holoscript/wasm/node (compiler-wasm pkg-node, the package link, and a
 * load check that expects HS-TYPE-RETURN-001).
 *
 * Marketplace is parked and must stay a gap. export-api has the same gap
 * and is left unchanged. Absorb, mcp-server, and studio must not be gaps.
 *
 * Run: node --test scripts/__tests__/docker-wasm-ship.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectWasmShipGaps } from '../holo-ci/check-docker-drift.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAP =
  'runtime ships @holoscript/core without @holoscript/wasm/node (pkg-node + package link + HS-TYPE-RETURN-001 load check)';

const PARKED = [
  `infrastructure/Dockerfile.export-api :: ${GAP}`,
  `infrastructure/Dockerfile.marketplace-api :: ${GAP}`,
];

test('core runtime images ship compiler-wasm', () => {
  const gate = spawnSync(process.execPath, ['scripts/holo-ci/check-docker-drift.mjs', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);
  const report = JSON.parse(gate.stdout);
  assert.deepEqual(report.wasmShipGaps, PARKED);

  const marketplace = readFileSync(
    path.join(root, 'infrastructure/Dockerfile.marketplace-api'),
    'utf8'
  );
  assert.equal(
    marketplace.includes('packages/compiler-wasm'),
    false,
    'marketplace is parked; this test must not start shipping compiler-wasm there'
  );

  const missing = collectWasmShipGaps([
    {
      rel: 'infrastructure/Dockerfile.example',
      text: [
        'FROM node:20 AS builder',
        'COPY packages/core/ packages/core/',
        'FROM node:20',
        'COPY --from=builder /app/packages/core/dist packages/core/dist',
      ].join('\n'),
    },
  ]);
  assert.deepEqual(missing, [`infrastructure/Dockerfile.example :: ${GAP}`]);

  const shipped = collectWasmShipGaps([
    {
      rel: 'infrastructure/Dockerfile.example',
      text: [
        'FROM node:20 AS builder',
        'COPY packages/core/ packages/core/',
        'COPY packages/compiler-wasm/ packages/compiler-wasm/',
        'FROM node:20',
        'COPY --from=builder /app/packages/core/dist packages/core/dist',
        'COPY --from=builder /app/packages/compiler-wasm/pkg-node packages/compiler-wasm/pkg-node',
        'RUN ln -sfn /app/packages/compiler-wasm /app/node_modules/@holoscript/wasm && node -e "validate_detailed HS-TYPE-RETURN-001"',
      ].join('\n'),
    },
  ]);
  assert.deepEqual(shipped, []);

  const studioMiss = collectWasmShipGaps([
    {
      rel: 'packages/studio/Dockerfile',
      text: 'FROM node:20\nCOPY --from=builder /app/.next/standalone ./\n',
      nextConfig: 'outputFileTracingIncludes: {}\nserverExternalPackages: []\n',
    },
  ]);
  assert.deepEqual(studioMiss, [`packages/studio/Dockerfile :: ${GAP}`]);
});
