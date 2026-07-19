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
 * local build entrypoints on stderr, then delegates to the packaged stdio bin.
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
} = {}) {
  const lifecycle = lifecycleFactory({
    role: 'holoscript-mcp-stdio',
    scriptPath: LAUNCHER_PATH,
  });
  const child = spawnImpl(process.execPath, [stdioServerPath()], {
    cwd: ROOT,
    env: { ...process.env, START_MCP_STDIO: 'true' },
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  });

  input.pipe(child.stdin);
  child.stdout.pipe(output);
  input.on('data', lifecycle.touch);
  child.stdout.on('data', lifecycle.touch);

  let stopping = false;
  const stopChildTree = (reason, signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    lifecycle.close();
    try {
      input.unpipe(child.stdin);
      child.stdout.unpipe(output);
    } catch {
      // Streams may already be torn down by the client disconnect.
    }
    if (child.killed || !child.pid) return;
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

  input.once('end', () => stopChildTree('stdin_eof'));
  input.once('close', () => stopChildTree('stdin_close'));
  input.once('error', () => stopChildTree('stdin_error'));
  if (registerProcessHandlers) {
    process.once('SIGINT', () => stopChildTree('sigint', 'SIGINT'));
    process.once('SIGTERM', () => stopChildTree('sigterm', 'SIGTERM'));
  }

  child.on('exit', (code, signal) => {
    lifecycle.close();
    exitProcess(stopping ? 0 : signal ? 1 : (code ?? 1));
  });

  return { child, lifecycle, stopChildTree };
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
