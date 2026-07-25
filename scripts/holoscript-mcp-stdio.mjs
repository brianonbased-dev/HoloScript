#!/usr/bin/env node
/**
 * Resilient local HoloScript MCP stdio launcher.
 *
 * Codex/Claude/VS Code often point directly at packages/mcp-server/dist/index.js.
 * That works only when every workspace dist entry it imports already exists. After
 * a clean, prune, or partial build, the MCP process exits before the stdio
 * handshake and clients report only "Transport closed".
 *
 * This launcher keeps stdout reserved for MCP protocol traffic, repairs missing
 * local build entrypoints on stderr, and supervises the packaged stdio worker.
 * If a rebuild invalidates a loaded chunk or the worker otherwise exits, the
 * client transport stays open. Interrupted calls receive a retryable error; a
 * caught hashed-dist invalidation response is forwarded once before the stale
 * worker is recycled; and the replacement receives the cached MCP handshake.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMcpProcessLifecycle } from './lib/mcp-process-lifecycle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');
export const LAUNCHER_PATH = fileURLToPath(import.meta.url);

export const BUILD_GROUPS = [
  {
    id: 'core',
    label: '@holoscript/core',
    filter: '@holoscript/core',
    requiredFiles: [
      'packages/core/dist/index.js',
      'packages/core/dist/index.cjs',
      'packages/core/dist/index.d.ts',
      'packages/core/dist/compiler/index.js',
    ],
  },
  {
    id: 'absorb-service',
    label: '@holoscript/absorb-service',
    filter: '@holoscript/absorb-service',
    requiredFiles: [
      'packages/absorb-service/dist/index.js',
      'packages/absorb-service/dist/mcp/index.js',
      'packages/absorb-service/dist/mcp/index.cjs',
    ],
  },
  {
    id: 'mcp-server',
    label: '@holoscript/mcp-server',
    filter: '@holoscript/mcp-server',
    requiredFiles: [
      'packages/mcp-server/bin/holoscript-mcp.cjs',
      'packages/mcp-server/dist/index.js',
      'packages/mcp-server/dist/index.d.ts',
    ],
  },
];

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function stderr(line) {
  process.stderr.write(`${line}\n`);
}

export function missingBuildGroups(exists = existsSync, root = ROOT) {
  return BUILD_GROUPS.filter((group) =>
    group.requiredFiles.some((file) => !exists(resolve(root, file)))
  );
}

export function stdioServerPath(root = ROOT) {
  return join(root, 'packages', 'mcp-server', 'bin', 'holoscript-mcp.cjs');
}

export function buildCommandForGroup(group) {
  return {
    command: commandName('corepack'),
    args: ['pnpm', '--filter', group.filter, 'run', 'build'],
  };
}

export function validateAbsorbBackgroundContract(codebaseTools) {
  const absorbTool = codebaseTools.find((tool) => tool?.name === 'holo_absorb_repo');
  if (!absorbTool) {
    throw new Error('holo_absorb_repo missing from @holoscript/absorb-service/mcp');
  }

  const properties = absorbTool.inputSchema?.properties;
  if (!properties || typeof properties !== 'object') {
    throw new Error('holo_absorb_repo inputSchema.properties missing');
  }

  const propertyNames = Object.keys(properties);
  for (const requiredProperty of ['async', 'background']) {
    if (!Object.hasOwn(properties, requiredProperty)) {
      throw new Error(`holo_absorb_repo inputSchema missing ${requiredProperty}`);
    }
  }

  const statusTool = codebaseTools.find((tool) => tool?.name === 'holo_get_absorb_status');
  if (!statusTool) {
    throw new Error('holo_get_absorb_status missing from @holoscript/absorb-service/mcp');
  }

  return {
    ok: true,
    absorbTool: absorbTool.name,
    statusTool: statusTool.name,
    properties: propertyNames,
  };
}

export function isPackagedDistInvalidationResponse(message, root = ROOT) {
  if (!message || typeof message !== 'object' || message.id === undefined || message.method) {
    return false;
  }
  const strings = [];
  const pending = [message];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      strings.push(value);
    } else if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value && typeof value === 'object') {
      pending.push(...Object.values(value));
    }
  }
  const serialized = strings
    .join('\n')
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .toLowerCase();
  const normalizedRoot = resolve(root).replaceAll('\\', '/').toLowerCase();
  return (
    serialized.includes(normalizedRoot) &&
    serialized.includes('/packages/') &&
    serialized.includes('/dist/') &&
    /cannot find module ['"]\.\/[^'"]+-[a-z0-9_-]{6,}\.(?:cjs|mjs|js)['"]/.test(serialized)
  );
}

async function probeAbsorbBackgroundContract() {
  const { codebaseTools } = await import('@holoscript/absorb-service/mcp');
  return validateAbsorbBackgroundContract(codebaseTools);
}

function runBuild(group) {
  const { command, args } = buildCommandForGroup(group);
  stderr(`[holoscript-mcp-stdio] Building ${group.label} before local MCP startup...`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${group.label} build failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function runImportProbe() {
  const probe = `
await import('@holoscript/core');
await import('@holoscript/core/compiler');
await import('@holoscript/absorb-service/mcp');
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    stderr: result.stderr?.trim() || result.stdout?.trim() || '',
  };
}

function ensureBuild({ noBuild = false } = {}) {
  const missing = missingBuildGroups();
  if (missing.length > 0) {
    if (noBuild) {
      throw new Error(
        `Missing local MCP build artifacts for: ${missing.map((group) => group.id).join(', ')}`
      );
    }
    for (const group of missing) runBuild(group);
  }

  let probe = runImportProbe();
  if (!probe.ok && !noBuild) {
    stderr(
      '[holoscript-mcp-stdio] Local package import probe failed; rebuilding MCP dependency chain...'
    );
    if (probe.stderr) stderr(probe.stderr);
    for (const group of BUILD_GROUPS) runBuild(group);
    probe = runImportProbe();
  }

  if (!probe.ok) {
    throw new Error(`Local package import probe failed: ${probe.stderr || 'no stderr'}`);
  }

  return {
    missingGroupsBeforeBuild: missing.map((group) => group.id),
    serverPath: stdioServerPath(),
  };
}

export function startServer({
  input = process.stdin,
  output = process.stdout,
  spawnImpl = spawn,
  spawnSyncImpl = spawnSync,
  lifecycleFactory = startMcpProcessLifecycle,
  exitProcess = (code) => process.exit(code),
  platform = process.platform,
  registerProcessHandlers = true,
  restartDelayMs = (attempt) => Math.min(100 * 2 ** Math.min(attempt - 1, 6), 5_000),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const lifecycle = lifecycleFactory({
    role: 'holoscript-mcp-stdio',
    scriptPath: LAUNCHER_PATH,
  });

  let stopping = false;
  let finished = false;
  let child = null;
  let childGeneration = 0;
  let restartAttempt = 0;
  let restartTimer = null;
  let recycleGeneration = null;
  let inputBuffer = '';
  let outputBuffer = '';
  let initializeLine = null;
  let initializeIdKey = null;
  let initializeCompleted = false;
  let initializedNotificationLine = null;
  let recoveryHandshake = null;
  const queuedLines = [];
  const pendingRequests = new Map();

  const idKey = (id) => `${typeof id}:${JSON.stringify(id)}`;
  const parseLine = (line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  };

  const finish = (code) => {
    if (finished) return;
    finished = true;
    lifecycle.close();
    exitProcess(code);
  };

  const writeToOutput = (line) => {
    lifecycle.touch();
    output.write(line);
  };

  const writeToChild = (line) => {
    if (!child || recoveryHandshake) {
      queuedLines.push(line);
      return;
    }
    if (!child.stdin.write(line)) {
      input.pause();
      child.stdin.once('drain', () => {
        if (!stopping && !recoveryHandshake) input.resume();
      });
    }
  };

  const flushQueuedLines = () => {
    if (!child || recoveryHandshake) return;
    while (queuedLines.length > 0) {
      const line = queuedLines.shift();
      if (!child.stdin.write(line)) {
        input.pause();
        child.stdin.once('drain', () => {
          if (!stopping && !recoveryHandshake) {
            flushQueuedLines();
            input.resume();
          }
        });
        return;
      }
    }
  };

  const completeRecoveryHandshake = () => {
    const handshake = recoveryHandshake;
    recoveryHandshake = null;
    restartAttempt = 0;
    if (handshake?.replayInitialized && initializedNotificationLine && child) {
      child.stdin.write(initializedNotificationLine);
    }
    flushQueuedLines();
    if (!stopping) input.resume();
  };

  const recycleWorker = (generation, reason) => {
    if (
      stopping ||
      !child ||
      generation !== childGeneration ||
      recycleGeneration === generation
    ) {
      return;
    }
    recycleGeneration = generation;
    input.pause();
    stderr(
      `[holoscript-mcp-stdio] Recycling worker generation ${generation} after ${reason}.`
    );
    if (!child.pid || child.killed) return;
    if (platform === 'win32') {
      const result = spawnSyncImpl('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      if (result.status === 0) return;
    }
    child.kill('SIGTERM');
  };

  const handleWorkerLine = (generation, line) => {
    const message = parseLine(line.trim());
    if (!message || message.id === undefined) {
      writeToOutput(line);
      return;
    }

    const key = idKey(message.id);
    if (recoveryHandshake?.initializeIdKey === key) {
      const suppressResponse = recoveryHandshake.suppressResponse;
      if (!message.error) initializeCompleted = true;
      pendingRequests.delete(key);
      completeRecoveryHandshake();
      if (!suppressResponse) writeToOutput(line);
      return;
    }

    pendingRequests.delete(key);
    if (key === initializeIdKey && !message.error) initializeCompleted = true;
    restartAttempt = 0;
    writeToOutput(line);
    if (isPackagedDistInvalidationResponse(message)) {
      recycleWorker(generation, 'a packaged dist chunk was invalidated');
    }
  };

  const handleWorkerData = (generation, chunk) => {
    if (!child || generation !== childGeneration) return;
    lifecycle.touch();
    outputBuffer += chunk.toString();
    let newline = outputBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = outputBuffer.slice(0, newline + 1);
      outputBuffer = outputBuffer.slice(newline + 1);
      handleWorkerLine(generation, line);
      newline = outputBuffer.indexOf('\n');
    }
  };

  const failInterruptedRequests = (generation) => {
    for (const [key, request] of pendingRequests) {
      if (request.method === 'initialize' && !initializeCompleted) continue;
      pendingRequests.delete(key);
      writeToOutput(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32098,
            message:
              'Sovereign MCP worker restarted before completing this request; retry the tool call.',
            data: {
              retryable: true,
              workerRestarted: true,
              generation,
            },
          },
        })}\n`
      );
    }
  };

  const handleClientLine = (line) => {
    const message = parseLine(line.trim());
    if (message?.method === 'initialize' && message.id !== undefined) {
      initializeLine = line;
      initializeIdKey = idKey(message.id);
      initializeCompleted = false;
    }
    if (message?.method === 'notifications/initialized') {
      initializedNotificationLine = line;
    }
    if (message?.method && message.id !== undefined) {
      pendingRequests.set(idKey(message.id), {
        id: message.id,
        method: message.method,
      });
    }
    writeToChild(line);
  };

  const handleInputData = (chunk) => {
    lifecycle.touch();
    inputBuffer += chunk.toString();
    let newline = inputBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = inputBuffer.slice(0, newline + 1);
      inputBuffer = inputBuffer.slice(newline + 1);
      handleClientLine(line);
      newline = inputBuffer.indexOf('\n');
    }
  };

  const spawnWorker = (isRestart = false) => {
    if (stopping) return;
    restartTimer = null;
    outputBuffer = '';
    let nextChild;
    try {
      nextChild = spawnImpl(process.execPath, [stdioServerPath()], {
        cwd: ROOT,
        env: { ...process.env, START_MCP_STDIO: 'true' },
        stdio: ['pipe', 'pipe', 'inherit'],
        windowsHide: true,
      });
    } catch (error) {
      stderr(
        `[holoscript-mcp-stdio] Worker spawn failed: ${
          error instanceof Error ? error.message : error
        }`
      );
      scheduleRestart();
      return;
    }

    child = nextChild;
    childGeneration += 1;
    const generation = childGeneration;
    child.stdin.on('error', (error) => {
      if (!stopping) {
        stderr(`[holoscript-mcp-stdio] Worker stdin error: ${error.message}`);
      }
    });
    child.stdout.on('data', (chunk) => handleWorkerData(generation, chunk));
    child.on('error', (error) => {
      if (!stopping) stderr(`[holoscript-mcp-stdio] Worker error: ${error.message}`);
    });
    child.once('close', (code, signal) => {
      if (generation !== childGeneration) return;
      const closedChild = child;
      child = null;
      recycleGeneration = null;
      outputBuffer = '';
      if (stopping) {
        if (closedChild?.stdout) closedChild.stdout.removeAllListeners('data');
        finish(0);
        return;
      }

      input.pause();
      failInterruptedRequests(generation);
      stderr(
        `[holoscript-mcp-stdio] Worker generation ${generation} closed ` +
          `(code=${code ?? 'null'}, signal=${signal ?? 'none'}); restarting.`
      );
      scheduleRestart();
    });

    if (isRestart && initializeLine && initializeIdKey) {
      recoveryHandshake = {
        initializeIdKey,
        suppressResponse: initializeCompleted,
        replayInitialized: initializeCompleted,
      };
      child.stdin.write(initializeLine);
      return;
    }

    recoveryHandshake = null;
    flushQueuedLines();
    input.resume();
  };

  function scheduleRestart() {
    if (stopping || restartTimer) return;
    restartAttempt += 1;
    const delay = Math.max(0, Number(restartDelayMs(restartAttempt)) || 0);
    restartTimer = setTimeoutImpl(() => spawnWorker(true), delay);
  }

  const stopChildTree = (reason, signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    lifecycle.close();
    input.pause();
    if (restartTimer) {
      clearTimeoutImpl(restartTimer);
      restartTimer = null;
    }
    if (!child) {
      finish(0);
      return;
    }
    if (child.killed || !child.pid) {
      finish(0);
      return;
    }
    if (platform === 'win32') {
      // `child` is a handle returned by this launcher, so the tree rooted at
      // this exact PID is owned. `/T` also reaps parse/embedding workers.
      spawnSyncImpl('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      return;
    }
    child.kill(signal);
  };

  input.on('data', handleInputData);
  input.once('end', () => stopChildTree('stdin_eof'));
  input.once('close', () => stopChildTree('stdin_close'));
  input.once('error', () => stopChildTree('stdin_error'));
  if (registerProcessHandlers) {
    process.once('SIGINT', () => stopChildTree('sigint', 'SIGINT'));
    process.once('SIGTERM', () => stopChildTree('sigterm', 'SIGTERM'));
  }

  spawnWorker(false);

  return {
    get child() {
      return child;
    },
    lifecycle,
    stopChildTree,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const noBuild = args.has('--no-build') || process.env.HOLOSCRIPT_LOCAL_MCP_NO_BUILD === '1';
  const selfTest = args.has('--self-test');
  const json = args.has('--json');

  try {
    const result = ensureBuild({ noBuild });
    if (selfTest) {
      const absorbBackgroundContract = await probeAbsorbBackgroundContract();
      const payload = {
        ok: true,
        root: ROOT,
        serverPath: result.serverPath,
        missingGroupsBeforeBuild: result.missingGroupsBeforeBuild,
        absorbBackgroundContract,
      };
      process.stdout.write(json ? `${JSON.stringify(payload, null, 2)}\n` : 'OK\n');
      return;
    }
    startServer();
  } catch (error) {
    stderr(`[holoscript-mcp-stdio] ERROR: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
