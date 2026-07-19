#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  BUILD_GROUPS,
  buildCommandForGroup,
  missingBuildGroups,
  startServer,
  stdioServerPath,
  validateAbsorbBackgroundContract,
} from '../holoscript-mcp-stdio.mjs';

test('local MCP launcher tracks the required build groups in dependency order', () => {
  assert.deepEqual(
    BUILD_GROUPS.map((group) => group.id),
    ['core', 'absorb-service', 'mcp-server']
  );
  assert.ok(
    BUILD_GROUPS[0].requiredFiles.includes('packages/core/dist/index.cjs'),
    'core CJS package root is required for CJS local MCP consumers'
  );
});

test('missingBuildGroups reports only groups with missing sentinel files', () => {
  const missing = new Set(['packages/core/dist/index.cjs', 'packages/mcp-server/dist/index.js']);
  const exists = (file) => {
    const normalized = String(file).replace(/\\/g, '/');
    return ![...missing].some((suffix) => normalized.endsWith(suffix));
  };

  assert.deepEqual(
    missingBuildGroups(exists, 'C:/repo').map((group) => group.id),
    ['core', 'mcp-server']
  );
});

test('build command uses the workspace package filter', () => {
  const core = BUILD_GROUPS.find((group) => group.id === 'core');
  const command = buildCommandForGroup(core);

  assert.match(command.command, /^corepack(\.cmd)?$/);
  assert.deepEqual(command.args, ['pnpm', '--filter', '@holoscript/core', 'run', 'build']);
});

test('stdioServerPath delegates to the packaged MCP stdio bin', () => {
  assert.match(
    stdioServerPath('C:/repo').replace(/\\/g, '/'),
    /C:\/repo\/packages\/mcp-server\/bin\/holoscript-mcp\.cjs$/
  );
});

test('absorb background contract requires async schema and status polling tool', () => {
  const result = validateAbsorbBackgroundContract([
    {
      name: 'holo_absorb_repo',
      inputSchema: {
        properties: {
          rootDir: { type: 'string' },
          async: { type: 'boolean' },
          background: { type: 'boolean' },
        },
      },
    },
    { name: 'holo_get_absorb_status', inputSchema: { properties: {} } },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.properties, ['rootDir', 'async', 'background']);
});

test('absorb background contract fails on stale pre-async schemas', () => {
  assert.throws(
    () =>
      validateAbsorbBackgroundContract([
        {
          name: 'holo_absorb_repo',
          inputSchema: {
            properties: {
              rootDir: { type: 'string' },
              force: { type: 'boolean' },
            },
          },
        },
        { name: 'holo_get_absorb_status', inputSchema: { properties: {} } },
      ]),
    /inputSchema missing async/
  );
});

test('stdio disconnect closes the lease and reaps only the owned child tree', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const child = new PassThrough();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.pid = 4321;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  const calls = [];
  const exitCodes = [];
  let touches = 0;
  let closes = 0;

  startServer({
    input,
    output,
    spawnImpl: () => child,
    spawnSyncImpl: (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    },
    lifecycleFactory: () => ({
      touch: () => {
        touches += 1;
      },
      close: () => {
        closes += 1;
      },
      reapReceipt: { candidates: [], actions: [] },
    }),
    platform: 'win32',
    registerProcessHandlers: false,
    exitProcess: (code) => exitCodes.push(code),
  });

  input.write('request\n');
  input.destroy();
  await once(input, 'close');

  assert.ok(touches >= 1, 'stdin activity refreshes the connection lease');
  assert.ok(closes >= 1, 'disconnect removes the connection lease');
  assert.deepEqual(calls, [{ command: 'taskkill.exe', args: ['/PID', '4321', '/T', '/F'] }]);
  child.emit('exit', null, 'SIGTERM');
  assert.deepEqual(exitCodes, [0], 'an expected disconnect teardown is a clean exit');
});
