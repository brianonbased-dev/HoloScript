#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  buildModelSearchPaths,
  findFirstExistingModel,
  scanRepoLocalModelDebt,
} from '../check-model-artifact-lanes.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'hololand-model-lanes-test-'));

try {
  const root = path.join(tmp, 'repo');
  const artifactRoot = path.join(tmp, 'artifact-root');
  mkdirSync(path.join(root, 'models'), { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });

  const repoModel = path.join(root, 'models', 'brittney.gguf');
  const artifactModel = path.join(artifactRoot, 'brittney.gguf');
  writeFileSync(repoModel, 'repo');
  writeFileSync(artifactModel, 'artifact');

  const old = new Date('2026-01-01T00:00:00Z');
  utimesSync(repoModel, old, old);

  const config = {
    explicitModelPathEnv: 'BRITTNEY_MODEL_PATH',
    artifactRootEnv: ['BRITTNEY_MODEL_ROOT'],
    maxRepoLocalAgeDays: 60,
    localDebtRoots: ['models'],
    models: [
      {
        file: 'brittney.gguf',
        repoFallback: 'models/brittney.gguf',
      },
    ],
  };

  const paths = buildModelSearchPaths({
    root,
    env: { BRITTNEY_MODEL_ROOT: artifactRoot },
    config,
  });
  assert.equal(paths[0], artifactModel);
  assert.equal(paths[1], repoModel);

  assert.equal(findFirstExistingModel({
    root,
    env: { BRITTNEY_MODEL_ROOT: artifactRoot },
    config,
  }), artifactModel);

  const scan = await scanRepoLocalModelDebt({
    root,
    now: new Date('2026-06-29T00:00:00Z'),
    config,
  });
  assert.equal(scan.ok, false);
  assert.equal(scan.findings.length, 1);
  assert.equal(scan.findings[0].relativePath, 'models/brittney.gguf');

  console.log('[check-model-artifact-lanes.test] ok');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
