#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.pilot-receipt.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_RECEIPTS_DIR = path.join('.tmp', 'holoshell', 'pilot-receipts');

function parseArgs(argv) {
  const args = {
    pilot: 'all',
    target: 'https://mcp.holoscript.net/health',
    receiptsDir: DEFAULT_RECEIPTS_DIR,
    laneId: 'codex-hardware',
    selfTest: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--pilot') args.pilot = argv[++index];
    else if (arg === '--target') args.target = argv[++index];
    else if (arg === '--receipts-dir') args.receiptsDir = argv[++index];
    else if (arg === '--lane-id') args.laneId = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['all', 'browser', 'project', 'legacy'].includes(args.pilot)) {
    throw new Error('--pilot must be one of: all, browser, project, legacy');
  }

  if (args.selfTest) {
    args.pilot = 'all';
    args.target = 'data:text/plain,HoloShell browser pilot self-test';
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell pilot receipts

Usage:
  node scripts/holoshell-pilot.mjs [options]

Options:
  --pilot <name>        all, browser, project, or legacy. Defaults to all.
  --target <url>        Browser pilot target. Defaults to HoloScript health.
  --lane-id <id>        Acting lane. Defaults to codex-hardware.
  --receipts-dir <dir>  Receipt output directory. Defaults to .tmp/holoshell/pilot-receipts.
  --self-test           Run harmless pilot checks and assert receipt invariants.
  --json                Print receipts as JSON.
  -h, --help            Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function receiptId(pilot, seed) {
  return `pilot-${pilot}-${Date.now().toString(36)}-${stableHash(seed)}`;
}

function redact(text) {
  if (!text) return '';
  return String(text)
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"]+/g, '%USERPROFILE%')
    .replace(/(api[-_]?key|token|secret|password|passwd|pwd|authorization)=("[^"]+"|'[^']+'|[^\s]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .slice(0, 1600);
}

function baseReceipt(args, pilot, title) {
  return {
    schemaVersion: SCHEMA_VERSION,
    receiptId: receiptId(pilot, `${pilot}:${args.laneId}:${args.target}`),
    generatedAt: nowIso(),
    pilot,
    title,
    lane: {
      laneId: args.laneId,
      agentKind: args.laneId.includes('codex') ? 'codex' : 'agent',
      surfaceKind: args.laneId.includes('hardware') ? 'hardware_shell' : 'agent_surface',
    },
    source: 'apps/holoshell/source/holoshell-phase1-workflows.hsplus',
    policy: {
      receiptRequired: true,
      automaticMutationAllowed: false,
      breakGlassRequiredForWrite: true,
    },
  };
}

async function runBrowserPilot(args) {
  const receipt = baseReceipt(args, 'browser', 'Browser pilot checked a web surface');
  receipt.intent = 'Check whether this web surface is healthy.';
  receipt.capabilityPath = ['browser-operator', 'holoscript-mcp'];
  receipt.sessionBoundary = {
    name: 'host-fetch-no-browser-profile',
    privateBrowserStateUsed: false,
    note: 'This pilot uses a host fetch witness. Browser profile automation remains guarded.',
  };
  receipt.target = {
    url: args.target,
    urlHash: stableHash(args.target),
  };

  try {
    const started = Date.now();
    const response = await fetch(args.target, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    receipt.status = response.ok ? 'completed' : 'partial';
    receipt.trustState = response.ok ? 'partial' : 'unknown';
    receipt.outcome = response.ok ? 'Target responded to read-only check.' : 'Target responded with a non-success status.';
    receipt.summary = `${response.status} ${response.statusText || 'response'} from ${new URL(args.target).protocol} target.`;
    receipt.witness = {
      url: response.url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      durationMs: Date.now() - started,
      domSummary: redact(text).slice(0, 500),
      screenshotWitness: {
        state: 'unavailable',
        reason: 'No guarded browser automation session was opened by this pilot.',
      },
    };
  } catch (error) {
    receipt.status = 'witness_unavailable';
    receipt.trustState = 'unknown';
    receipt.outcome = 'Read-only browser pilot could not obtain a web witness.';
    receipt.summary = `Witness unavailable: ${error.message}`;
    receipt.witness = {
      screenshotWitness: {
        state: 'unavailable',
        reason: error.message,
      },
    };
  }

  return receipt;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 15000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || null,
  };
}

function runProjectPilot(args) {
  const receipt = baseReceipt(args, 'project', 'Local project pilot checked repository state');
  receipt.intent = 'Check this project without making me use a terminal.';
  receipt.capabilityPath = ['local-projects', 'cli-dev-stack', 'process-run-custody'];
  const gitStatus = runCommand('git', ['status', '--short'], { timeoutMs: 15000 });
  const gitDiff = runCommand('git', ['diff', '--stat', '--', 'apps/holoshell', 'scripts/holoshell-*.mjs'], { timeoutMs: 15000 });
  receipt.status = gitStatus.ok ? 'completed' : 'partial';
  receipt.trustState = gitStatus.ok ? 'verified' : 'partial';
  receipt.outcome = gitStatus.ok ? 'Repository status inspected without mutation.' : 'Repository status inspection returned an error.';
  receipt.summary = gitStatus.ok
    ? `${gitStatus.stdout.split(/\r?\n/).filter(Boolean).length} changed path(s) visible in git status.`
    : `git status failed with ${gitStatus.status}.`;
  receipt.commandReceipt = {
    command: 'git status --short',
    cwd: REPO_ROOT,
    exitCode: gitStatus.status,
    stdoutTail: redact(gitStatus.stdout).slice(-1200),
    stderrTail: redact(gitStatus.stderr || gitStatus.error).slice(-1200),
  };
  receipt.diffReceipt = {
    command: 'git diff --stat -- apps/holoshell scripts/holoshell-*.mjs',
    exitCode: gitDiff.status,
    stdoutTail: redact(gitDiff.stdout).slice(-1200),
    stderrTail: redact(gitDiff.stderr || gitDiff.error).slice(-1200),
  };
  return receipt;
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function runLegacyPilot(args) {
  const receipt = baseReceipt(args, 'legacy', 'Legacy app pilot classified local machines');
  receipt.intent = 'Tell me what installed apps can safely help agents do.';
  receipt.capabilityPath = ['legacy-apps'];
  const inventory = readJson(path.join('.tmp', 'holoshell', 'capability-inventory.json'), {});
  const legacyCapability = (inventory.capabilities || []).find((capability) => capability.id === 'legacy-apps');
  const archetypes = inventory.summary?.legacyArchetypes || legacyCapability?.evidence?.archetypes || {};
  const count = inventory.summary?.legacyProgramCount || legacyCapability?.evidence?.count || 0;
  receipt.status = count > 0 ? 'completed' : 'partial';
  receipt.trustState = count > 0 ? 'partial' : 'unknown';
  receipt.outcome = count > 0
    ? 'Installed programs were grouped into HoloShell machine archetypes.'
    : 'No legacy inventory was available to classify.';
  receipt.summary = `${count} legacy program(s) classified with private names redacted by default.`;
  receipt.classification = {
    redactedByDefault: true,
    programCount: count,
    archetypes,
    defaultAdapterPolicy: 'prefer_api_cli_then_ui_automation_last',
    defaultPermission: 'classified_per_app',
    replacementPath: 'wrap_then_reimagine',
  };
  return receipt;
}

function writeReceipt(args, receipt) {
  const dir = resolveRepoPath(args.receiptsDir);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${receipt.receiptId}.json`);
  receipt.output = { receiptPath: filePath };
  writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

function assertSelfTest(receipts) {
  const failures = [];
  const pilots = new Set(receipts.map((receipt) => receipt.pilot));
  for (const required of ['browser', 'project', 'legacy']) {
    if (!pilots.has(required)) failures.push(`missing ${required} receipt`);
  }
  for (const receipt of receipts) {
    if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push(`${receipt.pilot}: schemaVersion mismatch`);
    if (!receipt.receiptId) failures.push(`${receipt.pilot}: missing receiptId`);
    if (receipt.policy.automaticMutationAllowed !== false) failures.push(`${receipt.pilot}: mutation policy drift`);
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const pilots = args.pilot === 'all' ? ['browser', 'project', 'legacy'] : [args.pilot];
  const receipts = [];

  for (const pilot of pilots) {
    if (pilot === 'browser') receipts.push(writeReceipt(args, await runBrowserPilot(args)));
    if (pilot === 'project') receipts.push(writeReceipt(args, runProjectPilot(args)));
    if (pilot === 'legacy') receipts.push(writeReceipt(args, runLegacyPilot(args)));
  }

  if (args.selfTest) assertSelfTest(receipts);

  if (args.json) {
    console.log(JSON.stringify(receipts, null, 2));
  } else {
    console.log(`HoloShell pilot receipts: ${resolveRepoPath(args.receiptsDir)}`);
    for (const receipt of receipts) {
      console.log(`${receipt.pilot}: ${receipt.status} - ${receipt.summary}`);
    }
  }
} catch (error) {
  console.error(`holoshell-pilot failed: ${error.message}`);
  process.exit(1);
}
