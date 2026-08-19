#!/usr/bin/env node
/* global console */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  join,
} from 'node:path';

import { scanHumanOsFrontierExperiments } from '../hololand-experiment-intake.mjs';

function writeFixture(root, file, content = 'fixture\n') {
  const full = join(root, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function writeExperimentTrio(root, workflow) {
  writeFixture(root, `experiments/holoshell-human-os-frontier/${workflow}-room.holo`);
  writeFixture(root, `experiments/holoshell-human-os-frontier/${workflow}-policy.hsplus`);
  writeFixture(root, `experiments/holoshell-human-os-frontier/${workflow}-pipeline.hs`);
}

function writePromotedTrio(root, workflow) {
  writeFixture(root, `apps/holoshell/source/holoshell-${workflow}-room.holo`);
  writeFixture(root, `apps/holoshell/source/holoshell-${workflow}-policy.hsplus`);
  writeFixture(root, `apps/holoshell/source/holoshell-${workflow}-pipeline.hs`);
}

const root = mkdtempSync(join(tmpdir(), 'hololand-experiment-intake-'));

writeExperimentTrio(root, 'browser-account-export');
writePromotedTrio(root, 'browser-account-export');

writeExperimentTrio(root, 'cloud-drive-permission-cleanup');
writeFixture(root, 'apps/holoshell/source/holoshell-cloud-drive-permission-cleanup-room.holo', 'promoted room\n');
writeFixture(root, 'apps/holoshell/source/holoshell-cloud-drive-permission-cleanup-policy.hsplus', 'promoted policy\n');
writeFixture(root, 'apps/holoshell/source/holoshell-cloud-drive-permission-cleanup-pipeline.hs', 'promoted pipeline\n');

writeExperimentTrio(root, 'asset-shard-2');

writeExperimentTrio(root, 'slow-computer-clinic');
writeFixture(root, 'experiments/holoshell-human-os-frontier/slow-computer-clinic-guarded-stop-dry-run.mjs');

writeFixture(root, 'experiments/holoshell-human-os-frontier/partial-workflow-room.holo');

const trackedFiles = [
  'experiments/holoshell-human-os-frontier/browser-account-export-policy.hsplus',
  'experiments/holoshell-human-os-frontier/browser-account-export-pipeline.hs',
  'experiments/holoshell-human-os-frontier/slow-computer-clinic-room.holo',
  'experiments/holoshell-human-os-frontier/slow-computer-clinic-policy.hsplus',
  'experiments/holoshell-human-os-frontier/slow-computer-clinic-pipeline.hs',
  'experiments/holoshell-human-os-frontier/slow-computer-clinic-guarded-stop-dry-run.mjs',
];

const report = scanHumanOsFrontierExperiments({ root, trackedFiles });
const byWorkflow = new Map(report.groups.map((group) => [group.workflow, group]));

assert.equal(byWorkflow.get('browser-account-export')?.status, 'duplicate-of-app-source');
assert.equal(byWorkflow.get('browser-account-export')?.untrackedFileCount, 1);
assert.equal(byWorkflow.get('browser-account-export')?.exactPromotedSources.length, 3);

assert.equal(byWorkflow.get('cloud-drive-permission-cleanup')?.status, 'promoted-drift');
assert.equal(
  byWorkflow.get('cloud-drive-permission-cleanup')?.exactPromotedSourceChecks.every((entry) => !entry.contentMatches),
  true,
);

assert.equal(byWorkflow.get('asset-shard-2')?.status, 'promote-or-archive');
assert.equal(byWorkflow.get('asset-shard-2')?.untrackedFileCount, 3);

assert.equal(byWorkflow.get('slow-computer-clinic')?.status, 'tracked-intake');
assert.equal(byWorkflow.get('slow-computer-clinic-guarded-stop-dry-run')?.status, 'utility-watch');

assert.equal(byWorkflow.get('partial-workflow')?.status, 'incomplete-intake');
assert.deepEqual(byWorkflow.get('partial-workflow')?.missing, ['policy', 'pipeline']);

assert.equal(report.summary.workflowCount, 5);
assert.equal(report.summary.byStatus['duplicate-of-app-source'], 1);
assert.equal(report.summary.byStatus['promoted-drift'], 1);
assert.equal(report.summary.byStatus['promote-or-archive'], 1);
assert.equal(report.summary.byStatus['tracked-intake'], 1);
assert.equal(report.summary.byStatus['incomplete-intake'], 1);
assert.equal(report.summary.byStatus['utility-watch'], 1);
assert.equal(report.summary.untrackedSourceFileCount, 8);

console.log('PASS hololand experiment intake');
