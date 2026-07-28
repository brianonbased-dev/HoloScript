#!/usr/bin/env node
/**
 * HoloShell Ready World
 *
 * Current-host readiness primitive for the HoloLand creator room. It collects
 * redacted host, repo, hardware, and source-contract facts into one hashable
 * evidence pack without reading credentials or mutating product worktrees.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, freemem, hostname, platform, release, totalmem } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VERSION = '0.1.0';
export const WORKFLOW = 'holoshell-ready-world';
export const TOOL_NAME = 'holoshell_ready_world';
export const SCHEMA_VERSION = 'holoscript.holoshell.ready-world.evidence-pack.v0.1.0';
export const DEFAULT_HOLOSCRIPT_ROOT = repoRoot();
export const DEFAULT_HOLOLAND_ROOT = resolve(DEFAULT_HOLOSCRIPT_ROOT, '..', 'Hololand');
export const DEFAULT_SOURCE_TRIO = [
  'experiments/holoshell-human-os-frontier/flagship-readiness-room.holo',
  'experiments/holoshell-human-os-frontier/flagship-readiness-policy.hsplus',
  'experiments/holoshell-human-os-frontier/flagship-readiness-pipeline.hs',
];

const DEFAULT_REASON = 'prepare-computer-for-hololand-world';
const REDACTED_PATH_PREFIX = '<local-repo>';

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function parseArgs(argv) {
  const args = {
    holoscriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    hololandRoot: DEFAULT_HOLOLAND_ROOT,
    out: '',
    latestOut: '',
    now: '',
    reason: DEFAULT_REASON,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index] || '';
    else if (arg === '--hololand-root') args.hololandRoot = argv[++index] || '';
    else if (arg === '--out') args.out = argv[++index] || '';
    else if (arg === '--latest-out') args.latestOut = argv[++index] || '';
    else if (arg === '--now') args.now = argv[++index] || '';
    else if (arg === '--reason') args.reason = argv[++index] || DEFAULT_REASON;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Ready World ${VERSION}

Usage:
  node scripts/holoshell-ready-world.mjs [--out <receipt.json>] [--json]
  node scripts/holoshell-ready-world.mjs --self-test

Options:
  --holoscript-root <path>  HoloScript repo root. Defaults to this repo.
  --hololand-root <path>    HoloLand repo root. Defaults to ../Hololand.
  --out <path>              Evidence pack output. Defaults to dated .bench-logs.
  --latest-out <path>       Stable latest pointer. Defaults to .bench-logs/.../latest.
  --now <iso>               Deterministic timestamp for tests.
  --reason <text>           Human workflow reason. Defaults to ${DEFAULT_REASON}.
  --json                    Print full evidence pack JSON.
`);
}

function nowIso(options = {}) {
  const value = options.now || new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function resolvePath(root, filePath) {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
}

function defaultOutPath(root, now) {
  const date = now.slice(0, 10);
  const safe = now.replace(/[:.]/g, '-');
  return join(
    root,
    '.bench-logs',
    'holoshell-human-os-frontier',
    date,
    `ready-world-evidence-pack-${safe}.json`
  );
}

function defaultLatestOutPath(root) {
  return join(
    root,
    '.bench-logs',
    'holoshell-human-os-frontier',
    'latest',
    'ready-world-evidence-pack.json'
  );
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function hashValue(value) {
  return `sha256:${sha256Text(JSON.stringify(sortForJson(value)))}`;
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) sorted[key] = sortForJson(child);
  }
  return sorted;
}

function redactPath(repoRootPath, filePath) {
  const relativePath = relative(repoRootPath, resolve(filePath)).replace(/\\/g, '/');
  if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    return `${REDACTED_PATH_PREFIX}/${relativePath}`;
  }
  return `<local-path>/${basename(filePath)}`;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 8_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

function collectGitRepo(root, label) {
  const exists = existsSync(root);
  if (!exists) {
    return {
      label,
      exists: false,
      redactedRoot: `<missing-repo>/${basename(root)}`,
      status: 'missing',
    };
  }

  const commit = runCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
  const branch = runCommand('git', ['branch', '--show-current'], { cwd: root });
  const status = runCommand('git', ['status', '--porcelain'], { cwd: root });
  const changedFiles = status.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^..?\s+/, ''));

  return {
    label,
    exists: true,
    redactedRoot: `<local-repo>/${basename(root)}`,
    branch: branch.stdout.trim() || 'detached-or-unknown',
    commit: commit.status === 0 ? commit.stdout.trim() : undefined,
    dirty: changedFiles.length > 0,
    changedFileCount: changedFiles.length,
    changedFileSample: changedFiles.slice(0, 20),
    status: commit.status === 0 ? 'present' : 'not-a-git-repo',
  };
}

function collectRuntimeFacts(options) {
  const cpu = cpus()[0];
  const pnpm =
    platform() === 'win32'
      ? runCommand(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd --version'], {
          cwd: options.holoscriptRoot,
        })
      : runCommand('pnpm', ['--version'], { cwd: options.holoscriptRoot });
  const nvidia = runCommand(
    'nvidia-smi',
    ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.total', '--format=csv,noheader'],
    { timeoutMs: 8_000 }
  );

  return {
    hostFingerprint: `sha256:${sha256Text(
      `${hostname()}|${platform()}|${release()}|${arch()}`
    ).slice(0, 24)}`,
    platform: platform(),
    release: release(),
    arch: arch(),
    nodeVersion: process.version,
    pnpmVersion: pnpm.status === 0 ? pnpm.stdout.trim() : undefined,
    cpuModel: cpu?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryGB: roundGB(totalmem()),
    freeMemoryGB: roundGB(freemem()),
    gpu: parseNvidiaSmi(nvidia),
  };
}

function parseNvidiaSmi(result) {
  if (result.status !== 0 || !result.stdout.trim()) {
    return {
      status: 'unknown',
      detail: 'nvidia-smi unavailable or returned no GPU rows',
    };
  }
  return {
    status: 'observed',
    controllers: result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [name, utilization, temperatureC, memoryTotal] = line.split(',').map((x) => x.trim());
        return { name, utilization, temperatureC, memoryTotal };
      }),
  };
}

function roundGB(bytes) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function collectSourceContract(options) {
  const holoscriptRoot = options.holoscriptRoot;
  const sources = DEFAULT_SOURCE_TRIO.map((sourcePath) => {
    const absolute = resolvePath(holoscriptRoot, sourcePath);
    const exists = existsSync(absolute);
    return {
      path: sourcePath,
      redactedPath: redactPath(holoscriptRoot, absolute),
      exists,
      sha256: exists ? `sha256:${sha256File(absolute)}` : undefined,
      bytes: exists ? statSync(absolute).size : undefined,
    };
  });

  const room = sources.find((source) => source.path.endsWith('.holo'));
  const policy = sources.find((source) => source.path.endsWith('.hsplus'));
  const pipeline = sources.find((source) => source.path.endsWith('.hs'));
  const pipelineText = pipeline?.exists
    ? readFileSync(resolvePath(holoscriptRoot, pipeline.path), 'utf8')
    : '';
  const stalePathMatches = pipelineText.match(/2026-05-14|2026-05-20|2026-05-16/g) ?? [];
  const consumesCurrentInput =
    pipelineText.includes('${input.current_host_readiness_pack}') ||
    pipelineText.includes('latest/ready-world-evidence-pack.json');

  return {
    status:
      sources.every((source) => source.exists) &&
      stalePathMatches.length === 0 &&
      consumesCurrentInput
        ? 'pass'
        : 'warn',
    sources,
    contractChecks: [
      {
        id: 'room-source-present',
        status: room?.exists ? 'pass' : 'fail',
        detail: 'Visible HoloShell room .holo source is present.',
      },
      {
        id: 'policy-source-present',
        status: policy?.exists ? 'pass' : 'fail',
        detail: 'Readiness policy .hsplus source is present.',
      },
      {
        id: 'pipeline-source-present',
        status: pipeline?.exists ? 'pass' : 'fail',
        detail: 'Readiness pipeline .hs source is present.',
      },
      {
        id: 'pipeline-current-host-input',
        status: consumesCurrentInput ? 'pass' : 'fail',
        detail:
          'Pipeline consumes the current-host ready-world pack instead of historical fixed receipts.',
      },
      {
        id: 'pipeline-no-fixed-2026-05-14',
        status: stalePathMatches.length === 0 ? 'pass' : 'fail',
        detail:
          stalePathMatches.length === 0
            ? 'No historical May 2026 receipt paths remain in the flagship readiness pipeline.'
            : `Found stale historical receipt markers: ${[...new Set(stalePathMatches)].join(', ')}`,
      },
    ],
  };
}

function deriveBlockers(repos, sourceContract, runtime) {
  const blockers = [];
  const warnings = [];
  for (const repo of repos) {
    if (!repo.exists || repo.status !== 'present') {
      blockers.push({
        id: `${repo.label.toLowerCase()}-repo-missing`,
        severity: 'blocker',
        summary: `${repo.label} repository is missing or is not a git repository.`,
      });
    } else if (repo.dirty) {
      warnings.push({
        id: `${repo.label.toLowerCase()}-dirty-worktree`,
        severity: 'warn',
        summary: `${repo.label} has ${repo.changedFileCount} changed file(s); preserve peer edits before build/publish.`,
      });
    }
  }
  for (const check of sourceContract.contractChecks) {
    if (check.status === 'fail') {
      blockers.push({
        id: check.id,
        severity: 'blocker',
        summary: check.detail,
      });
    }
  }
  if (!runtime.pnpmVersion) {
    warnings.push({
      id: 'pnpm-version-unavailable',
      severity: 'warn',
      summary: 'pnpm version could not be observed; package-manager readiness is unproven.',
    });
  }
  if (runtime.gpu.status !== 'observed') {
    warnings.push({
      id: 'gpu-inventory-unavailable',
      severity: 'warn',
      summary: runtime.gpu.detail,
    });
  }
  return { blockers, warnings };
}

export function validateReadyWorldEvidencePack(pack) {
  const errors = [];
  if (pack?.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion mismatch');
  if (!pack?.generatedAt || Number.isNaN(Date.parse(pack.generatedAt))) {
    errors.push('generatedAt missing or invalid');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(pack?.packHash || ''))) {
    errors.push('packHash missing or invalid');
  }
  if (!pack?.host?.hostFingerprint?.startsWith('sha256:')) {
    errors.push('redacted host fingerprint missing');
  }
  if (JSON.stringify(pack).includes('HOLOMESH_WALLET_KEY')) {
    errors.push('pack must not include wallet key names');
  }
  if (!Array.isArray(pack?.sourceContract?.sources) || pack.sourceContract.sources.length < 3) {
    errors.push('source trio missing');
  }
  if (
    !pack?.sourceContract?.contractChecks?.some(
      (check) => check.id === 'pipeline-current-host-input' && check.status === 'pass'
    )
  ) {
    errors.push('pipeline current-host input check did not pass');
  }
  return errors;
}

export function buildReadyWorldEvidencePack(options = {}) {
  const generatedAt = nowIso(options);
  const holoscriptRoot = resolve(options.holoscriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const hololandRoot = resolve(options.hololandRoot || DEFAULT_HOLOLAND_ROOT);
  const repos = [
    collectGitRepo(holoscriptRoot, 'HoloScript'),
    collectGitRepo(hololandRoot, 'HoloLand'),
  ];
  const host = collectRuntimeFacts({ holoscriptRoot });
  const sourceContract = collectSourceContract({ holoscriptRoot });
  const { blockers, warnings } = deriveBlockers(repos, sourceContract, host);
  const body = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'holoshell-ready-world-evidence-pack',
    workflow: WORKFLOW,
    toolName: TOOL_NAME,
    generatedAt,
    generatedBy: 'scripts/holoshell-ready-world.mjs',
    reason: options.reason || DEFAULT_REASON,
    redaction: {
      policy:
        'repo-relative paths and hashed host identity only; no env, wallet, token, or credential reads',
      pathPrefix: REDACTED_PATH_PREFIX,
    },
    host,
    repos,
    sourceContract,
    readiness: {
      status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warn' : 'pass',
      blockers,
      warnings,
      nextHumanActions: blockers.length
        ? ['Fix blockers or file deduped HoloMesh tasks before claiming world-build readiness.']
        : ['Open HoloLand creator room and consume this pack as the host-readiness source.'],
    },
    hololandConsumption: {
      primitive: TOOL_NAME,
      creatorRoomTool: 'Ready My Computer',
      consumeAs: '@host_readiness',
      productLogicBoundary:
        'HoloLand reads this pack; host/repo/hardware readiness logic remains in HoloScript/HoloShell.',
    },
    verificationCommands: [
      'node scripts/holoshell-ready-world.mjs --self-test',
      'node scripts/__tests__/holoshell-ready-world.test.mjs',
      'node scripts/verify-holoshell-mcp-registration.mjs',
    ],
  };

  const packHash = hashValue(body);
  const pack = {
    packId: `hsrw_${packHash.replace('sha256:', '').slice(0, 16)}`,
    packHash,
    ...body,
  };
  const errors = validateReadyWorldEvidencePack(pack);
  if (errors.length > 0) {
    throw new Error(`ready-world evidence pack invalid: ${errors.join('; ')}`);
  }
  return pack;
}

export function writeReadyWorldEvidencePack(options = {}) {
  const holoscriptRoot = resolve(options.holoscriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const generatedAt = nowIso(options);
  const pack = buildReadyWorldEvidencePack({ ...options, now: generatedAt, holoscriptRoot });
  const out = resolvePath(
    holoscriptRoot,
    options.out || defaultOutPath(holoscriptRoot, generatedAt)
  );
  const latestOut = resolvePath(
    holoscriptRoot,
    options.latestOut || defaultLatestOutPath(holoscriptRoot)
  );
  writeJson(out, pack);
  writeJson(latestOut, {
    ...pack,
    latestPointer: true,
    canonicalPackPath: redactPath(holoscriptRoot, out),
  });
  return { pack, out, latestOut };
}

function runSelfTest() {
  const pack = buildReadyWorldEvidencePack({
    now: '2026-07-13T00:00:00.000Z',
    holoscriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    hololandRoot: DEFAULT_HOLOLAND_ROOT,
  });
  const errors = validateReadyWorldEvidencePack(pack);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (pack.sourceContract.status !== 'pass') {
    throw new Error(`source contract is not current-host ready: ${pack.sourceContract.status}`);
  }
  return { ok: true, packId: pack.packId, status: pack.readiness.status, packHash: pack.packHash };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }
  const result = writeReadyWorldEvidencePack(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result.pack, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          out: result.out,
          latestOut: result.latestOut,
          packId: result.pack.packId,
          status: result.pack.readiness.status,
          blockerCount: result.pack.readiness.blockers.length,
          warningCount: result.pack.readiness.warnings.length,
          packHash: result.pack.packHash,
        },
        null,
        2
      )}\n`
    );
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    process.exit(1);
  }
}
