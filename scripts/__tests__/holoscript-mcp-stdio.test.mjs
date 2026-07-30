#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  BUILD_GROUPS,
  buildBootstrapGroups,
  buildEnvironmentForGroup,
  buildGroupFreshness,
  buildGroupsForChangedFiles,
  buildStampCoversInput,
  buildCommandForGroup,
  isPackagedDistInvalidationResponse,
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
    [
      'core-types',
      'agent-protocol',
      'platform',
      'core',
      'secrets-broker',
      'config',
      'llm-provider',
      'framework',
      'crdt-spatial',
      'snn-webgpu',
      'holoembed',
      'engine',
      'runtime',
      'hololand-platform',
      'holomap',
      'mesh',
      'holo-vm',
      'security-sandbox',
      'holollama',
      'meaning',
      'uaal',
      'absorb-service',
      'memory',
      'wasm',
      'mcp-server',
    ]
  );
  const core = BUILD_GROUPS.find((group) => group.id === 'core');
  assert.ok(
    core.requiredFiles.includes('packages/core/dist/index.cjs'),
    'core CJS package root is required for CJS local MCP consumers'
  );
});

test('missingBuildGroups reports only groups with missing sentinel files', () => {
  const missing = new Set([
    'packages/core-types/dist/ans.js',
    'packages/platform/dist/index.js',
    'packages/core/dist/index.cjs',
    'packages/config/dist/index.js',
    'packages/mcp-server/dist/index.js',
  ]);
  const exists = (file) => {
    const normalized = String(file).replace(/\\/g, '/');
    return ![...missing].some((suffix) => normalized.endsWith(suffix));
  };

  assert.deepEqual(
    missingBuildGroups(exists, 'C:/repo').map((group) => group.id),
    ['core-types', 'platform', 'core', 'config', 'mcp-server']
  );
});

test('build freshness detects source newer than packaged dist', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'holoscript-mcp-build-freshness-'));
  const group = {
    id: 'example',
    requiredFiles: ['packages/example/dist/index.js', 'packages/example/dist/index.d.ts'],
  };
  try {
    for (const path of [
      'packages/example/src/index.ts',
      'packages/example/package.json',
      ...group.requiredFiles,
    ]) {
      const absolute = resolve(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, path, 'utf8');
    }
    const old = new Date('2026-01-01T00:00:00.000Z');
    const fresh = new Date('2026-01-02T00:00:00.000Z');
    for (const output of group.requiredFiles) {
      utimesSync(resolve(root, output), old, old);
    }
    utimesSync(resolve(root, 'packages/example/package.json'), old, old);
    utimesSync(resolve(root, 'packages/example/src/index.ts'), fresh, fresh);

    assert.deepEqual(buildGroupFreshness(group, { root }), {
      id: 'example',
      status: 'source-newer-than-dist',
      stale: true,
      missingOutputs: [],
      newestInputMtimeMs: fresh.getTime(),
      oldestOutputMtimeMs: old.getTime(),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('commit change routing rebuilds only affected packages unless a global input changed', () => {
  const absorb = BUILD_GROUPS.find((group) => group.id === 'absorb-service');
  const mcp = BUILD_GROUPS.find((group) => group.id === 'mcp-server');

  assert.deepEqual(
    buildGroupsForChangedFiles([
      'packages/absorb-service/src/mcp/codebase-tools.ts',
      'docs/absorb.md',
    ]).map((group) => group.id),
    ['absorb-service']
  );
  assert.deepEqual(
    buildGroupsForChangedFiles(['packages/mcp-server/src/http-server.ts']).map(
      (group) => group.id
    ),
    ['mcp-server']
  );
  assert.ok(absorb);
  assert.ok(mcp);
  assert.equal(buildGroupsForChangedFiles(['pnpm-lock.yaml']).length, BUILD_GROUPS.length);
});

test('unstamped runtimes rebuild the sovereign absorb and MCP owners once', () => {
  assert.deepEqual(
    buildBootstrapGroups(null).map((group) => group.id),
    ['absorb-service', 'mcp-server']
  );
  assert.deepEqual(
    buildBootstrapGroups({ schemaVersion: 'holoscript.local-mcp-build-stamp.v1' }),
    []
  );
});

test('package input stamps suppress unchanged-input rebuild loops across unrelated commits', () => {
  // Same intent as before -- a group whose inputs did not change must not
  // rebuild just because an unrelated commit landed -- but coverage is now
  // decided by CONTENT DIGEST rather than mtime. mtime could not tell "these
  // bytes were built" from "these bytes merely look old" (task_..._nsog), so a
  // stamp that carries only mtimes no longer grants coverage.
  const freshness = {
    id: 'wasm',
    stale: true,
    newestInputMtimeMs: 2000,
    oldestOutputMtimeMs: 1000,
  };
  const stamp = {
    gitHead: 'abc123',
    inputDigestByGroup: { wasm: 'sha256:unchanged-inputs' },
    inputMtimeMsByGroup: { wasm: 2000 },
  };

  // Inputs unchanged -> covered -> no rebuild loop.
  assert.equal(buildStampCoversInput(freshness, stamp, 'sha256:unchanged-inputs'), true);
  // Inputs actually changed -> not covered, regardless of what mtime says.
  assert.equal(buildStampCoversInput(freshness, stamp, 'sha256:different-bytes'), false);
  assert.equal(buildStampCoversInput(freshness, null, 'sha256:unchanged-inputs'), false);

  // Deliberate behaviour change: a legacy mtime-only stamp is no longer trusted.
  // Costs one rebuild after upgrade instead of blessing possibly-stale output.
  const legacyStamp = { gitHead: 'abc123', inputMtimeMsByGroup: { wasm: 2000 } };
  assert.equal(buildStampCoversInput(freshness, legacyStamp, 'sha256:unchanged-inputs'), false);
});

test('repair groups cover every direct MCP workspace dependency', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../packages/mcp-server/package.json', import.meta.url), 'utf8')
  );
  const workspaceDependencies = Object.entries(manifest.dependencies)
    .filter(([, version]) => String(version).startsWith('workspace:'))
    .map(([name]) => name);
  const coveredFilters = new Set(BUILD_GROUPS.map((group) => group.filter));

  assert.deepEqual(
    workspaceDependencies.filter((name) => !coveredFilters.has(name)),
    []
  );
});

test('build command uses the workspace package filter', () => {
  const core = BUILD_GROUPS.find((group) => group.id === 'core');
  const command = buildCommandForGroup(core);

  assert.match(command.command, /^corepack(\.cmd)?$/);
  assert.deepEqual(command.args, ['pnpm', '--filter', '@holoscript/core', 'run', 'build']);
});

test('repair builds preserve tracked MCP catalog source without changing normal package builds', () => {
  const mcp = BUILD_GROUPS.find((group) => group.id === 'mcp-server');
  const absorb = BUILD_GROUPS.find((group) => group.id === 'absorb-service');
  const base = { PATH: 'test-path' };

  assert.deepEqual(buildEnvironmentForGroup(mcp, base), {
    PATH: 'test-path',
    HOLOSCRIPT_MCP_PRESERVE_TRACKED_CATALOG: '1',
  });
  assert.deepEqual(buildEnvironmentForGroup(absorb, base), base);
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

test('packaged dist invalidation detection is narrow to hashed local chunks', () => {
  const response = {
    jsonrpc: '2.0',
    id: 17,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error:
              "Cannot find module './graph-rag-tools-I65GGOG7.cjs'\n" +
              'Require stack:\n' +
              '- C:\\repo\\packages\\absorb-service\\dist\\chunk-X2DVFQWP.cjs',
          }),
        },
      ],
    },
  };

  assert.equal(isPackagedDistInvalidationResponse(response, 'C:/repo'), true);
  assert.equal(
    isPackagedDistInvalidationResponse(
      {
        jsonrpc: '2.0',
        id: 18,
        result: { content: [{ type: 'text', text: "Cannot find module './user-plugin.cjs'" }] },
      },
      'C:/repo'
    ),
    false
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

  workers[1].stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 42, result: { tools: [] } })}\n`);
  await nextTurn();
  assert.match(outputChunks.join(''), /"id":42/);

  input.destroy();
  await once(input, 'close');
  workers[1].emit('close', null, 'SIGTERM');
});

test('packaged dist invalidation response is forwarded once before worker recycle', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const workers = [fakeWorker(5501), fakeWorker(5502)];
  const workerInput = ['', ''];
  const outputChunks = [];
  const taskkills = [];
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
    spawnSyncImpl: (command, args) => {
      taskkills.push({ command, args });
      return { status: 0 };
    },
    lifecycleFactory: () => ({
      touch: () => {},
      close: () => {},
      reapReceipt: { candidates: [], actions: [] },
    }),
    platform: 'win32',
    registerProcessHandlers: false,
    exitProcess: () => {},
    restartDelayMs: () => 0,
    setTimeoutImpl: (callback) => {
      callback();
      return null;
    },
  });

  input.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      method: 'tools/call',
      params: { name: 'holo_graph_status', arguments: {} },
    })}\n`
  );
  await nextTurn();
  workers[0].stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error:
                "Cannot find module './graph-rag-tools-I65GGOG7.cjs'\n" +
                'Require stack:\n' +
                `- ${process
                  .cwd()
                  .replaceAll('/', '\\')}\\packages\\absorb-service\\dist\\chunk-X2DVFQWP.cjs`,
            }),
          },
        ],
      },
    })}\n`
  );
  await nextTurn();

  assert.deepEqual(taskkills, [{ command: 'taskkill.exe', args: ['/PID', '5501', '/T', '/F'] }]);
  assert.match(outputChunks.join(''), /"id":77/);
  assert.match(outputChunks.join(''), /Cannot find module/);
  assert.doesNotMatch(outputChunks.join(''), /"id":77[^\n]*"retryable":true/);

  workers[0].emit('close', 1, null);
  await nextTurn();
  assert.equal(spawnCount, 2);

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 78, method: 'tools/list' })}\n`);
  await nextTurn();
  assert.match(workerInput[1], /"id":78/);

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
  assert.equal(
    initializeResponses.length,
    1,
    'the client sees only its original handshake response'
  );
  assert.match(workerInput[1], /"method":"notifications\/initialized"/);

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await nextTurn();
  assert.match(workerInput[1], /"id":2/);

  input.destroy();
  await once(input, 'close');
  workers[1].emit('close', null, 'SIGTERM');
});
