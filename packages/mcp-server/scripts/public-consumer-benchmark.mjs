#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_NAME = '@holoscript/mcp-server';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const IMPORT_MARKER = 'HOLOSCRIPT_IMPORT_RECEIPT ';

export const DEFAULT_BOUNDS = Object.freeze({
  installMsMax: 180_000,
  rootImportMsMax: 10_000,
  rootSettleMsMax: 12_000,
  serviceImportMsMax: 2_000,
  serviceSettleMsMax: 3_000,
  serviceStartMsMax: 30_000,
  packageBytesGrowthPercentMax: 5,
  dependencyNodeGrowthMax: 5,
  peerWarningGrowthMax: 0,
});

export function parseArgs(argv = process.argv.slice(2)) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  return {
    spec: value('--spec'),
    manager: value('--manager') || 'npm',
    packCurrent: argv.includes('--pack-current'),
    baselinePath: value('--baseline'),
    receiptPath: value('--receipt'),
    captureBaseline: argv.includes('--capture-baseline'),
    keepTemp: argv.includes('--keep-temp'),
  };
}

export const SUPPORTED_MANAGERS = Object.freeze(['npm', 'pnpm', 'yarn']);

export function countDependencyNodes(tree) {
  let count = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const dependency of Object.values(node?.dependencies || {})) {
      count += 1;
      visit(dependency);
    }
  };
  visit(tree);
  return count;
}

export function warningMetrics(output) {
  const lines = String(output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const warningLines = lines.filter((line) => /\b(?:warn|warning|deprecated)\b/iu.test(line));
  const peerWarningLines = lines.filter((line) =>
    /peer(?:\s+dependency|\s+dep)?|ERESOLVE/iu.test(line)
  );
  return {
    warningCount: warningLines.length,
    peerWarningCount: peerWarningLines.length,
  };
}

export function compareWithBaseline(metrics, baseline, bounds = DEFAULT_BOUNDS) {
  const baselineMetrics = baseline?.metrics || {};
  const packageBytesBaseline = Number(baselineMetrics.package?.bytes || 0);
  const dependencyBaseline = Number(baselineMetrics.install?.dependencyNodes || 0);
  const peerWarningBaseline = Number(baselineMetrics.install?.peerWarningCount || 0);
  const packageGrowthPercent =
    packageBytesBaseline > 0
      ? ((metrics.package.bytes - packageBytesBaseline) / packageBytesBaseline) * 100
      : 0;

  const checks = {
    installBounded: metrics.install.elapsedMs <= bounds.installMsMax,
    packageGrowthBounded: packageGrowthPercent <= bounds.packageBytesGrowthPercentMax,
    dependencyGrowthBounded:
      metrics.install.dependencyNodes - dependencyBaseline <= bounds.dependencyNodeGrowthMax,
    peerWarningsNotRegressed:
      metrics.install.peerWarningCount - peerWarningBaseline <= bounds.peerWarningGrowthMax,
    rootEsmImportBounded:
      metrics.imports.rootEsm.settled &&
      metrics.imports.rootEsm.importMs <= bounds.rootImportMsMax &&
      metrics.imports.rootEsm.settleMs <= bounds.rootSettleMsMax,
    rootCjsImportBounded:
      metrics.imports.rootCjs.settled &&
      metrics.imports.rootCjs.importMs <= bounds.rootImportMsMax &&
      metrics.imports.rootCjs.settleMs <= bounds.rootSettleMsMax,
    serviceEsmImportBounded:
      metrics.imports.serviceEsm.settled &&
      metrics.imports.serviceEsm.importMs <= bounds.serviceImportMsMax &&
      metrics.imports.serviceEsm.settleMs <= bounds.serviceSettleMsMax,
    serviceCjsImportBounded:
      metrics.imports.serviceCjs.settled &&
      metrics.imports.serviceCjs.importMs <= bounds.serviceImportMsMax &&
      metrics.imports.serviceCjs.settleMs <= bounds.serviceSettleMsMax,
    importsOwnNoPersistentResources: Object.values(metrics.imports).every(
      (probe) => probe.persistentResources.length === 0
    ),
    executableServiceHealthy:
      metrics.serviceStart.healthy && metrics.serviceStart.elapsedMs <= bounds.serviceStartMsMax,
  };

  return {
    baselineVersion: baseline?.package?.version || null,
    deltas: {
      installMs: metrics.install.elapsedMs - Number(baselineMetrics.install?.elapsedMs || 0),
      packageBytes: metrics.package.bytes - packageBytesBaseline,
      packageBytesPercent: Number(packageGrowthPercent.toFixed(3)),
      dependencyNodes: metrics.install.dependencyNodes - dependencyBaseline,
      peerWarnings: metrics.install.peerWarningCount - peerWarningBaseline,
      rootEsmSettleMs:
        metrics.imports.rootEsm.settleMs - Number(baselineMetrics.imports?.rootEsm?.settleMs || 0),
      rootCjsSettleMs:
        metrics.imports.rootCjs.settleMs - Number(baselineMetrics.imports?.rootCjs?.settleMs || 0),
      serviceStartMs:
        metrics.serviceStart.elapsedMs - Number(baselineMetrics.serviceStart?.elapsedMs || 0),
    },
    checks,
    ok: Object.values(checks).every(Boolean),
  };
}

function publicSpec(spec) {
  if (!spec) return null;
  return isAbsolute(spec) ? `file:${basename(spec)}` : spec;
}

function runProcess(command, args, options = {}) {
  const startedAt = performance.now();
  const timeoutMs = options.timeoutMs ?? 180_000;
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (current, chunk) => `${current}${chunk}`.slice(-12_000_000);
    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        status: 'error',
        code: null,
        signal: null,
        elapsedMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        status: 'exit',
        code,
        signal,
        elapsedMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolvePromise({
        status: 'timeout',
        code: null,
        signal: 'timeout',
        elapsedMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    }, timeoutMs);
  });
}

function npmInvocation(args) {
  const npmCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(npmCli)) return { command: process.execPath, args: [npmCli, ...args] };
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    shell: process.platform === 'win32',
  };
}

function pnpmInvocation(args) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli && /pnpm(?:\.c?js)?$/iu.test(pnpmCli)) {
    return { command: process.execPath, args: [pnpmCli, ...args] };
  }
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
    shell: process.platform === 'win32',
  };
}

function yarnInvocation(args) {
  return {
    command: process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    args: ['yarn', ...args],
    shell: process.platform === 'win32',
  };
}

function managerInvocation(manager, action, spec = null) {
  if (manager === 'npm') {
    return npmInvocation([...action, ...(spec ? [spec] : [])]);
  }
  if (manager === 'pnpm') {
    return pnpmInvocation([...action, ...(spec ? [spec] : [])]);
  }
  if (manager === 'yarn') {
    return yarnInvocation([...action, ...(spec ? [spec] : [])]);
  }
  throw new Error(`Unsupported package manager: ${manager}`);
}

async function packCurrent(tempRoot) {
  const packDir = join(tempRoot, 'pack');
  await mkdir(packDir, { recursive: true });
  const invocation = pnpmInvocation(['pack', '--pack-destination', packDir]);
  const result = await runProcess(invocation.command, invocation.args, {
    cwd: PACKAGE_ROOT,
    env: process.env,
    shell: invocation.shell,
    timeoutMs: 120_000,
  });
  if (result.status !== 'exit' || result.code !== 0) {
    throw new Error(`pnpm pack failed: ${result.stderr || result.stdout || result.error}`);
  }
  const tarballs = (await readdir(packDir)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${tarballs.length}`);
  }
  return join(packDir, tarballs[0]);
}

async function measureTree(root) {
  let bytes = 0;
  let files = 0;
  const visit = async (path) => {
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      for (const entry of await readdir(path)) await visit(join(path, entry));
      return;
    }
    if (metadata.isFile()) {
      bytes += metadata.size;
      files += 1;
    }
  };
  await visit(root);
  return { bytes, files };
}

function findPackageRoot(consumerRoot) {
  const require = createRequire(join(consumerRoot, 'package.json'));
  let cursor = dirname(require.resolve(PACKAGE_NAME));
  while (cursor !== dirname(cursor)) {
    const packageJsonPath = join(cursor, 'package.json');
    if (existsSync(packageJsonPath)) return cursor;
    cursor = dirname(cursor);
  }
  throw new Error(`Unable to locate installed ${PACKAGE_NAME} package root`);
}

function importProbeCode(target, moduleKind) {
  const load =
    moduleKind === 'esm'
      ? `await import(${JSON.stringify(target)})`
      : `require(${JSON.stringify(target)})`;
  return `
    const started = performance.now();
    const loaded = ${load};
    const resources = typeof process.getActiveResourcesInfo === 'function'
      ? process.getActiveResourcesInfo()
      : [];
    const receipt = {
      importMs: Math.round(performance.now() - started),
      exportCount: Object.keys(loaded || {}).length,
      resources,
    };
    process.stdout.write(${JSON.stringify(IMPORT_MARKER)} + JSON.stringify(receipt) + '\\n');
  `;
}

async function probeImport(consumerRoot, target, moduleKind, timeoutMs) {
  const args =
    moduleKind === 'esm'
      ? ['--input-type=module', '-e', importProbeCode(target, moduleKind)]
      : ['-e', importProbeCode(target, moduleKind)];
  const result = await runProcess(process.execPath, args, {
    cwd: consumerRoot,
    env: buildServiceEnv(),
    timeoutMs,
  });
  const markerLine = result.stdout.split(/\r?\n/u).find((line) => line.startsWith(IMPORT_MARKER));
  let imported = null;
  if (markerLine) {
    try {
      imported = JSON.parse(markerLine.slice(IMPORT_MARKER.length));
    } catch {
      imported = null;
    }
  }
  const resources = imported?.resources || [];
  const persistentResources = resources.filter((resource) =>
    ['Timeout', 'TCPSocketWrap', 'TCPServerWrap', 'UDPWrap'].includes(resource)
  );
  return {
    target,
    moduleKind,
    imported: Boolean(imported),
    importMs: imported?.importMs ?? result.elapsedMs,
    settleMs: result.elapsedMs,
    exportCount: imported?.exportCount ?? 0,
    settled: result.status === 'exit' && result.code === 0,
    timedOut: result.status === 'timeout',
    persistentResources,
    diagnosticLineCount: result.stderr.split(/\r?\n/u).filter(Boolean).length,
    exitCode: result.code,
  };
}

function buildServiceEnv(extra = {}) {
  const allowed = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'ComSpec',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    NODE_ENV: 'production',
    START_MCP_STDIO: 'false',
    MCP_SERVER_SIZE: 'tiny',
    HOLOSCRIPT_KEEP_ALIVE_ENABLED: 'false',
    ...extra,
  };
}

function reservePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePromise(port)));
    });
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return await new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
}

async function probeHttpService(packageRoot) {
  const port = await reservePort();
  const entry = join(packageRoot, 'bin', 'holoscript-mcp-http.cjs');
  const startedAt = performance.now();
  const child = spawn(process.execPath, [entry, '--size', 'tiny', '--port', String(port)], {
    cwd: packageRoot,
    env: buildServiceEnv({ PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-2_000_000);
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2_000_000);
  });

  let health = null;
  let error = null;
  const deadline = Date.now() + DEFAULT_BOUNDS.serviceStartMsMax;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch (probeError) {
      error = probeError instanceof Error ? probeError.message : String(probeError);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  child.kill();
  if (!(await waitForExit(child, 5_000))) child.kill('SIGKILL');
  return {
    healthy: Boolean(health && health.status === 'healthy'),
    elapsedMs,
    exitBeforeHealth: child.exitCode !== null && !health,
    healthStatus: health?.status || null,
    toolCount: Number.isFinite(health?.tools) ? health.tools : null,
    stdoutLineCount: stdout.split(/\r?\n/u).filter(Boolean).length,
    stderrLineCount: stderr.split(/\r?\n/u).filter(Boolean).length,
    error: health ? null : error,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
}

export async function runBenchmark(options) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'holoscript-mcp-consumer-'));
  const consumerRoot = join(tempRoot, 'consumer');
  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    join(consumerRoot, 'package.json'),
    `${JSON.stringify({ name: 'foreign-mcp-consumer', private: true, type: 'module' }, null, 2)}\n`
  );

  try {
    if (!SUPPORTED_MANAGERS.includes(options.manager || 'npm')) {
      throw new Error(`Unsupported package manager: ${options.manager}`);
    }
    const spec = options.packCurrent ? await packCurrent(tempRoot) : options.spec;
    if (!spec) throw new Error('Pass --spec <package-or-tarball> or --pack-current.');
    const installAction =
      options.manager === 'npm'
        ? [
            'install',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            '--package-lock=false',
            '--loglevel=warn',
          ]
        : options.manager === 'pnpm'
          ? ['add', '--ignore-scripts', '--no-lockfile', '--reporter=append-only']
          : ['add', '--ignore-scripts', '--non-interactive'];
    const manager = managerInvocation(options.manager, installAction, spec);
    const installResult = await runProcess(manager.command, manager.args, {
      cwd: consumerRoot,
      env: process.env,
      shell: manager.shell,
      timeoutMs: DEFAULT_BOUNDS.installMsMax,
    });
    if (installResult.status !== 'exit' || installResult.code !== 0) {
      throw new Error(
        `Cold npm install failed (${installResult.status}/${String(installResult.code)}): ${
          installResult.stderr || installResult.stdout || installResult.error
        }`
      );
    }

    const packageRoot = findPackageRoot(consumerRoot);
    const packageJson = await readJson(join(packageRoot, 'package.json'));
    const packageSize = await measureTree(packageRoot);
    const installWarnings = warningMetrics(`${installResult.stdout}\n${installResult.stderr}`);
    const listAction =
      options.manager === 'npm'
        ? ['ls', '--all', '--json']
        : options.manager === 'pnpm'
          ? ['list', '--depth', 'Infinity', '--json']
          : ['list', '--json'];
    const managerList = managerInvocation(options.manager, listAction);
    const dependencyResult = await runProcess(managerList.command, managerList.args, {
      cwd: consumerRoot,
      env: process.env,
      shell: managerList.shell,
      timeoutMs: 120_000,
    });
    let dependencyTree = {};
    try {
      const jsonLines = String(dependencyResult.stdout || '')
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean);
      const parsed = JSON.parse(
        options.manager === 'yarn' ? jsonLines.at(-1) : dependencyResult.stdout || '{}'
      );
      dependencyTree =
        options.manager === 'yarn'
          ? {
              dependencies: Object.fromEntries(
                (parsed?.data?.trees || []).map((tree) => [
                  tree.name,
                  {
                    dependencies: Object.fromEntries(
                      (tree.children || []).map((child) => [child.name, {}])
                    ),
                  },
                ])
              ),
            }
          : parsed;
    } catch {
      dependencyTree = {};
    }

    const metrics = {
      install: {
        elapsedMs: installResult.elapsedMs,
        warningCount: installWarnings.warningCount,
        peerWarningCount: installWarnings.peerWarningCount,
        dependencyNodes: countDependencyNodes(dependencyTree),
        freshProject: true,
        registryCachePolicy: 'caller-environment',
      },
      package: packageSize,
      imports: {
        rootEsm: await probeImport(
          consumerRoot,
          PACKAGE_NAME,
          'esm',
          DEFAULT_BOUNDS.rootSettleMsMax
        ),
        rootCjs: await probeImport(
          consumerRoot,
          PACKAGE_NAME,
          'cjs',
          DEFAULT_BOUNDS.rootSettleMsMax
        ),
        serviceEsm: await probeImport(
          consumerRoot,
          `${PACKAGE_NAME}/service`,
          'esm',
          DEFAULT_BOUNDS.serviceSettleMsMax
        ),
        serviceCjs: await probeImport(
          consumerRoot,
          `${PACKAGE_NAME}/service`,
          'cjs',
          DEFAULT_BOUNDS.serviceSettleMsMax
        ),
      },
      serviceStart: await probeHttpService(packageRoot),
    };

    const baseline = options.baselinePath ? await readJson(resolve(options.baselinePath)) : null;
    const comparison = baseline
      ? compareWithBaseline(metrics, baseline, baseline.bounds || DEFAULT_BOUNDS)
      : null;
    const receipt = {
      schema: 'holoscript.mcp-server.public-consumer-benchmark.v1',
      mode: options.captureBaseline ? 'baseline-capture' : 'release-comparison',
      generatedAt: new Date().toISOString(),
      package: {
        name: packageJson.name,
        version: packageJson.version,
        spec: publicSpec(spec),
      },
      environment: {
        packageManager: options.manager,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        foreignTempProject: true,
      },
      bounds: options.bounds || DEFAULT_BOUNDS,
      metrics,
      comparison,
      capture: {
        succeeded: installResult.code === 0,
        gateEvaluated: !options.captureBaseline,
      },
      ok: options.captureBaseline ? false : Boolean(comparison?.ok),
      proofBoundary: {
        proves: `fresh ${options.manager} install, ESM/CJS root and service import settlement, package/dependency/peer-warning bounds, and packaged HTTP executable health`,
        doesNotProve:
          'remote cloud or Jetson execution, provider-native planning, or production load capacity',
      },
    };
    if (options.receiptPath) await writeReceipt(resolve(options.receiptPath), receipt);
    return receipt;
  } finally {
    if (!options.keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs();
  const receipt = await runBenchmark(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!options.captureBaseline && !receipt.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
