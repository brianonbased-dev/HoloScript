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

function fakeWorker(pid) {
  const child = new PassThrough();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.pid = pid;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

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
  const child = fakeWorker(4321);
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
  child.emit('close', null, 'SIGTERM');
  assert.deepEqual(exitCodes, [0], 'an expected disconnect teardown is a clean exit');
});

test('unexpected worker closure keeps stdio open, fails in-flight work, and respawns', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const workers = [fakeWorker(5001), fakeWorker(5002)];
  const exitCodes = [];
  const outputChunks = [];
  let spawnCount = 0;
  output.on('data', (chunk) => outputChunks.push(chunk.toString()));

  startServer({
    input,
    output,
    spawnImpl: () => workers[spawnCount++],
    lifecycleFactory: () => ({
      touch: () => {},
      close: () => {},
      reapReceipt: { candidates: [], actions: [] },
    }),
    registerProcessHandlers: false,
    exitProcess: (code) => exitCodes.push(code),
    restartDelayMs: () => 0,
    setTimeoutImpl: (callback) => {
      callback();
      return null;
    },
  });

  input.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'holo_graph_status', arguments: {} },
    })}\n`
  );
  await nextTurn();
  workers[0].emit('close', 1, null);
  await nextTurn();

  assert.equal(spawnCount, 2, 'the launcher starts a replacement worker');
  assert.deepEqual(exitCodes, [], 'the client-facing transport remains open');
  assert.match(outputChunks.join(''), /"id":41/);
  assert.match(outputChunks.join(''), /"retryable":true/);

  let replacementInput = '';
  workers[1].stdin.on('data', (chunk) => {
    replacementInput += chunk.toString();
  });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/list' })}\n`);
  await nextTurn();
  assert.match(replacementInput, /"id":42/);

  workers[1].stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 42, result: { tools: [] } })}\n`
  );
  await nextTurn();
  assert.match(outputChunks.join(''), /"id":42/);

  input.destroy();
  await once(input, 'close');
  workers[1].emit('close', null, 'SIGTERM');
});

test('replacement worker receives the cached handshake without duplicating its response', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const workers = [fakeWorker(6001), fakeWorker(6002)];
  const workerInput = ['', ''];
  const outputChunks = [];
  let spawnCount = 0;
  workers.forEach((worker, index) => {
    worker.stdin.on('data', (chunk) => {
      workerInput[index] += chunk.toString();
    });
  });
  output.on('data', (chunk) => outputChunks.push(chunk.toString()));

  startServer({
    input,
    output,
    spawnImpl: () => workers[spawnCount++],
    lifecycleFactory: () => ({
      touch: () => {},
      close: () => {},
      reapReceipt: { candidates: [], actions: [] },
    }),
    registerProcessHandlers: false,
    exitProcess: () => {},
    restartDelayMs: () => 0,
    setTimeoutImpl: (callback) => {
      callback();
      return null;
    },
  });

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'recovery-test', version: '1.0.0' },
    },
  };
  input.write(`${JSON.stringify(initialize)}\n`);
  workers[0].stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'holoscript-local', version: 'test' },
      },
    })}\n`
  );
  input.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`
  );
  await nextTurn();

  workers[0].emit('close', 1, null);
  await nextTurn();
  assert.equal(spawnCount, 2);
  assert.match(workerInput[1], /"method":"initialize"/);

  workers[1].stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'holoscript-local', version: 'test' },
      },
    })}\n`
  );
  await nextTurn();

  const initializeResponses = outputChunks
    .join('')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((message) => message.id === 1);
  assert.equal(initializeResponses.length, 1, 'the client sees only its original handshake response');
  assert.match(workerInput[1], /"method":"notifications\/initialized"/);

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await nextTurn();
  assert.match(workerInput[1], /"id":2/);

  input.destroy();
  await once(input, 'close');
  workers[1].emit('close', null, 'SIGTERM');
});
