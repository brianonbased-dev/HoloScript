import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildBridgeStatus } from '../holoshell-laptop-desktop-bridge.mjs';

const NODE = process.execPath;
const tmp = mkdtempSync(join(tmpdir(), 'holoshell-live-feed-bridge-'));
const bridgeDir = join(tmp, 'desktop-control-bridge');
mkdirSync(bridgeDir, { recursive: true });

const bridge = buildBridgeStatus({
  host: '127.0.0.1',
  port: 8751,
  createdAt: new Date().toISOString(),
});
writeFileSync(join(bridgeDir, 'latest-status.json'), `${JSON.stringify(bridge, null, 2)}\n`, 'utf8');

function runJson(args) {
  return JSON.parse(execFileSync(NODE, args, { encoding: 'utf8' }));
}

const liveFeed = runJson([
  resolve('scripts/holoshell-live-feed.mjs'),
  '--tmp-dir',
  tmp,
  '--output',
  join(tmp, 'live-feed.json'),
  '--js-output',
  join(tmp, 'live-feed.js'),
  '--json',
]);

assert.equal(liveFeed.summary.desktopBridgeStatus, 'ready');
assert.equal(liveFeed.summary.laptopDesktopBridgeStatus, 'ready');
assert.equal(liveFeed.summary.desktopBridgeFreshness, 'fresh');
assert.equal(liveFeed.summary.desktopBridgeDestructiveActionsTaken, false);
assert.equal(liveFeed.feeds.desktopBridgeStatus.status, 'ready');
assert.ok(liveFeed.timeline.some((item) => item.kind === 'desktop_control_bridge'));

const terminal = runJson([
  resolve('scripts/holoshell-operator-terminal.mjs'),
  '--tmp-dir',
  tmp,
  '--output',
  join(tmp, 'operator-terminal.json'),
  '--js-output',
  join(tmp, 'operator-terminal.js'),
  '--agent',
  '--json',
]);

assert.equal(terminal.route.laptopBridgeStatus, 'ready');
assert.equal(terminal.route.laptopBridgeFreshness, 'fresh');
assert.doesNotMatch(terminal.caveats.join('\n'), /check_required|not in the latest terminal feed/);
