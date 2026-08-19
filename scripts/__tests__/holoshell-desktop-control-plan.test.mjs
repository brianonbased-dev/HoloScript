import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  buildDesktopControlPlan,
  DESKTOP_CONTROL_SCHEMA,
} from '../holoshell-desktop-control-plan.mjs';

const NODE = process.execPath;
const SCRIPT = resolve('scripts/holoshell-desktop-control-plan.mjs');

const clickPlan = buildDesktopControlPlan({
  intent: 'Use Fara to inspect the screen and click the Save button.',
  createdAt: '2026-06-23T00:00:00.000Z',
});

assert.equal(clickPlan.schemaVersion, DESKTOP_CONTROL_SCHEMA);
assert.equal(clickPlan.summary.status, 'plan_ready');
assert.equal(clickPlan.summary.modelLane, 'fara_gui_grounding');
assert.equal(clickPlan.summary.recommendedModel, 'fara:7b');
assert.equal(clickPlan.summary.primaryAction, 'click_control');
assert.equal(clickPlan.summary.permissionEnvelope, 'guarded_execute');
assert.equal(clickPlan.summary.approvalRequired, true);
assert.equal(clickPlan.receipt.destructiveActionsTaken, false);
assert.ok(clickPlan.actions.some((action) => action.id === 'fara-visual-grounding'));
assert.ok(clickPlan.actions.every((action) => action.mayExecute !== true));

const readOnlyPlan = buildDesktopControlPlan({
  intent: 'Inspect the current desktop and describe which window is active.',
  createdAt: '2026-06-23T00:00:00.000Z',
});

assert.equal(readOnlyPlan.summary.status, 'plan_ready');
assert.equal(readOnlyPlan.summary.permissionEnvelope, 'read_only');
assert.equal(readOnlyPlan.summary.approvalRequired, false);

const naturalOpenUrlPlan = buildDesktopControlPlan({
  intent: 'Open https://example.com/status in the default browser.',
  createdAt: '2026-06-23T00:00:00.000Z',
});

assert.equal(naturalOpenUrlPlan.summary.primaryAction, 'open_url');
assert.equal(naturalOpenUrlPlan.summary.permissionEnvelope, 'guarded_execute');
assert.equal(naturalOpenUrlPlan.summary.approvalRequired, true);
assert.equal(naturalOpenUrlPlan.target.operation, 'open_url');
assert.equal(naturalOpenUrlPlan.target.url, 'https://example.com/status');

const breakGlassPlan = buildDesktopControlPlan({
  intent: 'Delete files and enter my password in the app.',
  createdAt: '2026-06-23T00:00:00.000Z',
});

assert.equal(breakGlassPlan.summary.status, 'blocked_break_glass');
assert.equal(breakGlassPlan.summary.permissionEnvelope, 'break_glass');
assert.equal(breakGlassPlan.summary.founderReviewRequired, true);
assert.equal(breakGlassPlan.receipt.destructiveActionsTaken, false);

const negatedRiskPlan = buildDesktopControlPlan({
  intent: 'Inspect the desktop and stage a harmless Save button click. Do not execute deletes, purchases, credential entry, or sends.',
  createdAt: '2026-06-23T00:00:00.000Z',
});

assert.equal(negatedRiskPlan.summary.status, 'plan_ready');
assert.equal(negatedRiskPlan.summary.permissionEnvelope, 'guarded_execute');
assert.equal(negatedRiskPlan.summary.founderReviewRequired, false);

const tmp = mkdtempSync(join(tmpdir(), 'holoshell-desktop-control-'));
const cliOutput = execFileSync(NODE, [
  SCRIPT,
  '--intent',
  'Click the Save button after Fara identifies it.',
  '--output',
  join(tmp, 'latest.json'),
  '--js-output',
  join(tmp, 'latest.js'),
  '--plan-dir',
  join(tmp, 'plans'),
  '--created-at',
  '2026-06-23T00:00:00.000Z',
  '--json',
], { encoding: 'utf8' });

const parsed = JSON.parse(cliOutput);
assert.equal(parsed.receipt.summary.primaryAction, 'click_control');
assert.match(readFileSync(join(tmp, 'latest.json'), 'utf8'), /desktop-control-plan/);
assert.match(readFileSync(join(tmp, 'latest.js'), 'utf8'), /HOLOSHELL_DESKTOP_CONTROL_PLAN/);

const serveSource = readFileSync(resolve('packages/holoshell/serve.mjs'), 'utf8');
assert.match(serveSource, /\/api\/desktop-control\/plan/);
assert.match(serveSource, /holoshell-desktop-control-plan\.mjs/);
assert.match(serveSource, /\/api\/desktop-control\/bridge\/report/);
assert.match(serveSource, /desktopControl/);
assert.match(serveSource, /primaryAction/);
assert.match(serveSource, /fara_gui_grounding/);

const compileSource = readFileSync(resolve('packages/holoshell/compile.mjs'), 'utf8');
assert.match(compileSource, /Desktop control/);
assert.match(compileSource, /desktopControl/);
assert.match(compileSource, /Approve open URL/);
assert.match(compileSource, /executeApprovedAction/);
assert.match(compileSource, /127\.0\.0\.1:8751/);
assert.match(compileSource, /127\.0\.0\.1:8752/);
assert.match(compileSource, /127\.0\.0\.1:8753/);
