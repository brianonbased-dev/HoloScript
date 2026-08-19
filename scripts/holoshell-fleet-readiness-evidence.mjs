#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.fleet-readiness-evidence.v0.1.0';
const UPSTREAM_EVIDENCE_FILE = 'fleet-job-readiness-evidence.json';
const DEFAULT_TMP_DIR = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT_NAME = 'fleet-readiness-evidence.json';
const DEFAULT_JS_OUTPUT_NAME = 'fleet-readiness-evidence.js';
const DEFAULT_HOLOSCRIPT_EVIDENCE_ROOT = path.resolve(
  REPO_ROOT,
  '..',
  'HoloScript',
  '.bench-logs',
  'holoshell-human-os-frontier'
);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    source: '',
    sourceDir: '',
    sourceRoot: '',
    tmpDir: DEFAULT_TMP_DIR,
    output: '',
    jsOutput: '',
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--source') args.source = argv[++index];
    else if (arg === '--source-dir') args.sourceDir = argv[++index];
    else if (arg === '--source-root') args.sourceRoot = argv[++index];
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.output) args.output = path.join(args.tmpDir, DEFAULT_OUTPUT_NAME);
  if (!args.jsOutput) args.jsOutput = path.join(args.tmpDir, DEFAULT_JS_OUTPUT_NAME);
  return args;
}

function printHelp() {
  console.log(`HoloShell Fleet readiness evidence ingester

Usage:
  node scripts/holoshell-fleet-readiness-evidence.mjs [options]

Options:
  --source <file>      Exact fleet-job-readiness-evidence.json file to read.
  --source-dir <dir>   Directory containing fleet-job-readiness-evidence.json.
  --source-root <dir>  Evidence root containing dated runs. Defaults to HoloScript
                       .bench-logs plus local readiness-custody scratch roots.
  --tmp-dir <dir>      HoloShell local artifact directory. Default: ${DEFAULT_TMP_DIR}
  --output <file>      JSON output. Default: ${path.join(DEFAULT_TMP_DIR, DEFAULT_OUTPUT_NAME)}
  --js-output <file>   Browser bootstrap output. Default: ${path.join(DEFAULT_TMP_DIR, DEFAULT_JS_OUTPUT_NAME)}
  --json               Print generated evidence feed.
  --self-test          Build a fixture feed and assert Fleet projection invariants.
  -h, --help           Show this help.
`);
}

function resolveRepoPath(filePath) {
  if (!filePath) return '';
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(REPO_ROOT, filePath);
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function redactionPairs() {
  const holoscriptRoot = path.resolve(REPO_ROOT, '..', 'HoloScript');
  const pairs = [
    [REPO_ROOT, '[hololand-root]'],
    [holoscriptRoot, '[holoscript-root]'],
    [process.env.USERPROFILE || process.env.HOME || '', '[user-home]'],
    [process.env.TEMP || process.env.TMP || '', '[temp]'],
  ];
  return pairs
    .filter(([target]) => target)
    .flatMap(([target, label]) => [
      [target, label],
      [normalizeSlashes(target), label],
    ]);
}

function redactText(value) {
  let out = String(value || '');
  for (const [target, label] of redactionPairs()) {
    out = out.split(target).join(label);
  }
  return out
    .replace(/(api[_-]?key|token|secret|password)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]');
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)]));
}

function shortHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function slug(value, fallback = 'unknown') {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || fallback
  );
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, feed) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(feed, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_FLEET_READINESS_EVIDENCE = ${payload};\n`, 'utf8');
  return resolved;
}

function defaultSourceRoots() {
  const roots = [DEFAULT_HOLOSCRIPT_EVIDENCE_ROOT];
  const scratchRoot = path.resolve(REPO_ROOT, '..', 'HoloScript', '.scratch');
  if (!existsSync(scratchRoot)) return roots;

  const custodyRoots = readdirSync(scratchRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('holoshell-readiness-custody-'))
    .map((entry) =>
      path.join(scratchRoot, entry.name, '.bench-logs', 'holoshell-human-os-frontier')
    )
    .filter((dirPath) => existsSync(dirPath))
    .sort((left, right) => right.localeCompare(left));
  return [...roots, ...custodyRoots];
}

function collectEvidenceFiles(root, depth = 2) {
  const resolved = resolveRepoPath(root);
  if (!resolved || !existsSync(resolved)) return [];
  const files = [];
  const directFile = path.join(resolved, UPSTREAM_EVIDENCE_FILE);
  if (existsSync(directFile)) files.push(directFile);
  if (depth <= 0) return files;

  for (const entry of readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    files.push(...collectEvidenceFiles(path.join(resolved, entry.name), depth - 1));
  }
  return files;
}

function latestEvidenceFile(roots) {
  const files = roots.flatMap((root) => collectEvidenceFiles(root, 3));
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((left, right) => {
      const mtimeDelta = statSync(right).mtimeMs - statSync(left).mtimeMs;
      return mtimeDelta || right.localeCompare(left);
    })[0] || '';
}

function resolveSourcePath(args) {
  if (args.source) return resolveRepoPath(args.source);
  if (args.sourceDir) return path.join(resolveRepoPath(args.sourceDir), UPSTREAM_EVIDENCE_FILE);
  const roots = args.sourceRoot ? [args.sourceRoot] : defaultSourceRoots();
  return latestEvidenceFile(roots);
}

function statusTrust(status) {
  if (status === 'pass' || status === 'ready') return 'verified';
  if (['warn', 'blocked', 'fail', 'failed', 'skipped'].includes(status)) return 'partial';
  return 'unknown';
}

function statusRank(status) {
  if (['blocked', 'fail', 'failed'].includes(status)) return 3;
  if (['warn', 'skipped'].includes(status)) return 2;
  if (status === 'unknown') return 1;
  return 0;
}

function summarizeStatus(statuses) {
  if (!statuses.length) return 'unknown';
  return [...statuses].sort((left, right) => statusRank(right) - statusRank(left))[0];
}

function gateTitle(gateId) {
  const titles = {
    'lane-identity': 'Lane identity',
    'lane-freshness': 'Lane heartbeat freshness',
    'owner-custody': 'Owner custody',
    'budget-envelope': 'Budget envelope',
    'model-route': 'Model route',
    'job-command': 'Job command',
    'permission-envelope': 'Permission envelope',
    'replay-rollback': 'Replay and rollback',
  };
  return titles[gateId] || String(gateId || 'Fleet gate').replace(/-/g, ' ');
}

function nextActionForGate(gateId) {
  const actions = {
    'lane-identity': 'Attach a Fleet lane id and replay readiness.',
    'lane-freshness': 'Refresh the Fleet lane heartbeat and replay readiness.',
    'owner-custody': 'Attach lane owner custody before launch.',
    'budget-envelope': 'Attach visible daily, current, and job budget fields.',
    'permission-envelope': 'Attach a supported permission envelope before launch.',
    'replay-rollback': 'Attach replay and rollback custody before launch.',
  };
  return actions[gateId] || 'Resolve the Fleet gate and replay readiness.';
}

function tokenIdForGate(gateId, index) {
  return `fleet-job-ready.${slug(gateId || `gate-${index + 1}`)}`;
}

function normalizeGate(gate, index, evidencePath, receiptType) {
  const gateId = gate?.gateId || `gate-${index + 1}`;
  const status = gate?.status || 'unknown';
  const detail =
    gate?.blocker ||
    gate?.reason ||
    gate?.authorityProof ||
    gate?.detail ||
    'Fleet readiness gate recorded.';
  return {
    id: tokenIdForGate(gateId, index),
    kind: 'fleet_job_ready_gate',
    gateId,
    title: gateTitle(gateId),
    status,
    detail,
    checkedAt: gate?.checkedAt || '',
    source: evidencePath,
    trustState: statusTrust(status),
    receiptType,
    nextAction: status === 'pass' || status === 'ready' ? '' : nextActionForGate(gateId),
  };
}

function parseBlockedReason(reason) {
  const raw = String(reason || '').trim();
  const match = raw.match(/^([^:]+):\s*(.*)$/);
  return {
    raw,
    gateId: match?.[1]?.trim() || '',
    detail: match?.[2]?.trim() || raw,
  };
}

function normalizeBlockedReasons(token, gates) {
  if (Array.isArray(token?.blockedReasons) && token.blockedReasons.length) {
    return token.blockedReasons.map((reason) => String(reason || '').trim()).filter(Boolean);
  }
  return gates
    .filter((gate) => !['pass', 'ready'].includes(gate?.status || 'unknown'))
    .map((gate) => `${gate.gateId || 'gate'}: ${gate.blocker || gate.reason || gate.status || 'unready'}`);
}

function commandByLabel(commands, labelNeedle) {
  return (commands || []).find((command) => String(command?.label || '').includes(labelNeedle)) || {};
}

function verificationCommands(evidence, token) {
  const commands = Array.isArray(evidence?.verificationCommands)
    ? evidence.verificationCommands
    : Array.isArray(token?.verificationCommands)
      ? token.verificationCommands
      : [];
  return commands.map((command) => ({
    label: command?.label || '',
    command: redactText(command?.command || ''),
    cwd: redactText(command?.cwd || ''),
  }));
}

function createFleetFeed(evidence = {}, evidencePath = '') {
  const token = evidence?.token || {};
  const gates = Array.isArray(token.gates) ? token.gates : [];
  const gateStatuses = gates.map((gate) => gate?.status || 'unknown');
  const status = token.status || evidence.status || summarizeStatus(gateStatuses);
  const receiptType = token.schemaVersion || evidence.schemaVersion || 'holoshell.fleet-job-ready.v1';
  const gateTokens = gates.map((gate, index) => normalizeGate(gate, index, evidencePath, receiptType));
  const blockedReasons = normalizeBlockedReasons(token, gates);
  const lane = token.lane || {};
  const job = token.job || {};
  const budget = token.budget || {};
  const commands = verificationCommands(evidence, token);
  const replayCommand = commandByLabel(commands, 'replay');
  const verifyCommand = commandByLabel(commands, 'verify');
  const laneId = lane.id || '';
  const ownerLaneId = lane.ownerLaneId || lane.owner || token.ownerLaneId || token.createdBy || evidence.createdBy || '';
  const budgetKeys = Object.keys(budget || {});
  const passGateCount = gateTokens.filter((gate) => gate.status === 'pass' || gate.status === 'ready').length;
  const blockedGateCount = gateTokens.filter((gate) => ['blocked', 'fail', 'failed'].includes(gate.status)).length;
  const warnGateCount = gateTokens.filter((gate) => ['warn', 'skipped'].includes(gate.status)).length;

  const feed = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    fleetReadinessId: evidence.id || token.id || `fleet-readiness-${shortHash(evidencePath || JSON.stringify(evidence))}`,
    status,
    source: {
      evidencePath,
      upstreamId: evidence.id || '',
      upstreamSchemaVersion: evidence.schemaVersion || '',
      queuePath: evidence.source?.queuePath || token.provenance?.ref || '',
      selectedJobId: evidence.source?.selectedJobId || job.id || '',
      queueVersion: evidence.source?.queueVersion ?? null,
      sourceKind: token.provenance?.kind || 'fleet-job-queue',
    },
    summary: {
      status,
      readyForLaunch: ['ready', 'pass'].includes(status),
      laneId,
      laneProfile: lane.profile || job.profile || '',
      ownerLaneId,
      jobId: job.id || evidence.source?.selectedJobId || '',
      jobLabel: job.label || '',
      jobProfile: job.profile || lane.profile || '',
      paper: job.paper || '',
      timeBoxSec: job.timeBoxSec ?? null,
      permissionEnvelope: token.permissionEnvelope || '',
      budgetStatus: budget.status || (budgetKeys.length ? 'present' : 'missing'),
      budgetFieldCount: budgetKeys.length,
      heartbeatAgeMs: lane.heartbeatAgeMs ?? lane.heartbeat?.ageMs ?? null,
      requiredGateCount: Array.isArray(token.requiredGates) ? token.requiredGates.length : 0,
      gateCount: gateTokens.length,
      passGateCount,
      blockedGateCount,
      warnGateCount,
      blockedReasonCount: blockedReasons.length,
      tokenCount: gateTokens.length,
      launchReceiptRequired: Boolean(token.actionReceipts?.launchReceiptRequired),
      stopReceiptRequired: Boolean(token.actionReceipts?.stopReceiptRequired),
      tokenHash: token.hash || '',
      evidenceHash: evidence.hash || '',
      verificationCommandCount: commands.length,
      createdBy: evidence.createdBy || token.createdBy || '',
      mutationPerformed: false,
      fleetJobMutationPerformed: false,
    },
    lanes: [
      {
        id: laneId,
        profile: lane.profile || job.profile || '',
        ownerLaneId,
        heartbeatAgeMs: lane.heartbeatAgeMs ?? lane.heartbeat?.ageMs ?? null,
        status: laneId ? status : 'blocked',
      },
    ],
    jobs: [
      {
        id: job.id || evidence.source?.selectedJobId || '',
        label: job.label || '',
        profile: job.profile || lane.profile || '',
        paper: job.paper || '',
        timeBoxSec: job.timeBoxSec ?? null,
        commandHash: job.commandHash || '',
        status: gateTokens.find((gate) => gate.gateId === 'job-command')?.status || 'unknown',
      },
    ],
    tokens: gateTokens,
    blockers: blockedReasons.map((reason, index) => {
      const parsed = parseBlockedReason(reason);
      return {
        id: `fleet-job.${slug(parsed.gateId || `blocker-${index + 1}`)}`,
        gateId: parsed.gateId,
        status: gateTokens.find((gate) => gate.gateId === parsed.gateId)?.status || 'blocked',
        detail: parsed.detail,
        raw: parsed.raw,
        receiptTokenId: parsed.gateId ? tokenIdForGate(parsed.gateId, index) : '',
        nextAction: parsed.gateId ? nextActionForGate(parsed.gateId) : 'Resolve the Fleet blocker and replay readiness.',
      };
    }),
    fleetJobReadyToken: {
      id: token.id || '',
      status,
      hash: token.hash || '',
      requiredGates: Array.isArray(token.requiredGates) ? token.requiredGates : [],
      blockedReasons,
      actionReceipts: token.actionReceipts || {},
    },
    commands: {
      replay: replayCommand.command || '',
      verify: verifyCommand.command || '',
      rollback:
        'Read-only projection; delete .tmp/holoshell/fleet-readiness-evidence.json and .tmp/holoshell/fleet-readiness-evidence.js to clear it.',
    },
    verificationCommands: commands,
    privacy: {
      redacted: true,
      rawCommandsIncluded: false,
      rawSecretsIncluded: false,
      localPathLabels: ['[hololand-root]', '[holoscript-root]', '[user-home]', '[temp]'],
    },
  };

  return redactValue(feed);
}

function fixtureFleetEvidence() {
  return {
    schemaVersion: 'holoshell.fleet-job-readiness-evidence.v1',
    id: 'fleet-job-readiness-fixture',
    status: 'blocked',
    generatedAt: '2026-05-26T23:59:00.000Z',
    createdBy: 'codex-hardware',
    source: {
      queuePath: 'scripts/gpu-jobs.example.json',
      selectedJobId: 'example-snn-smoke',
      queueVersion: 1,
    },
    token: {
      schemaVersion: 'holoshell.fleet-job-ready.v1',
      id: 'fleet-job-ready-example-snn-smoke',
      status: 'blocked',
      lane: {
        id: '',
        profile: 'webgpu-smoke',
      },
      job: {
        id: 'example-snn-smoke',
        label: 'PAPER-00 example - replace ids/commands with your experiment',
        commandHash: 'sha256:fixture-command-hash',
        profile: 'webgpu-smoke',
        paper: '00',
        timeBoxSec: 300,
      },
      budget: {},
      modelRoute: {
        status: 'not_required',
      },
      permissionEnvelope: '',
      gates: [
        { gateId: 'lane-identity', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing lane id' },
        { gateId: 'lane-freshness', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing or stale lane heartbeat' },
        { gateId: 'owner-custody', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing lane owner' },
        { gateId: 'budget-envelope', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing visible daily/current/job budget fields' },
        { gateId: 'model-route', status: 'pass', checkedAt: '2026-05-26T23:59:00.000Z', reason: 'not_required' },
        { gateId: 'job-command', status: 'pass', checkedAt: '2026-05-26T23:59:00.000Z', authorityProof: 'sha256:fixture-command-hash' },
        { gateId: 'permission-envelope', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing or unsupported permission envelope' },
        { gateId: 'replay-rollback', status: 'blocked', checkedAt: '2026-05-26T23:59:00.000Z', blocker: 'missing rollback note for launched child process or remote job' },
      ],
      requiredGates: [
        'lane-identity',
        'lane-freshness',
        'owner-custody',
        'budget-envelope',
        'model-route',
        'job-command',
        'permission-envelope',
        'replay-rollback',
      ],
      blockedReasons: [
        'lane-identity: missing lane id',
        'lane-freshness: missing or stale lane heartbeat',
        'owner-custody: missing lane owner',
        'budget-envelope: missing visible daily/current/job budget fields',
        'permission-envelope: missing or unsupported permission envelope',
        'replay-rollback: missing rollback note for launched child process or remote job',
      ],
      actionReceipts: {
        launchReceiptRequired: true,
        stopReceiptRequired: true,
      },
      hash: 'sha256:fixture-token-hash',
      verificationCommands: [
        {
          label: 'replay-fleet-job-readiness',
          command: 'node scripts/holoshell-fleet-job-readiness-runner.mjs run --queue scripts/gpu-jobs.example.json --out .bench-logs/holoshell-human-os-frontier/2026-05-26/fleet-job-readiness-evidence.json',
          cwd: path.resolve(REPO_ROOT, '..', 'HoloScript'),
        },
        {
          label: 'verify-fleet-job-readiness',
          command: 'node scripts/holoshell-fleet-job-readiness-runner.mjs verify --input .bench-logs/holoshell-human-os-frontier/2026-05-26/fleet-job-readiness-evidence.json',
          cwd: path.resolve(REPO_ROOT, '..', 'HoloScript'),
        },
      ],
      provenance: {
        kind: 'fleet-job-queue',
        ref: 'scripts/gpu-jobs.example.json',
      },
      createdAt: '2026-05-26T23:59:00.000Z',
      createdBy: 'codex-hardware',
    },
    verificationCommands: [
      {
        label: 'replay-fleet-job-readiness',
        command: 'node scripts/holoshell-fleet-job-readiness-runner.mjs run --queue scripts/gpu-jobs.example.json --out .bench-logs/holoshell-human-os-frontier/2026-05-26/fleet-job-readiness-evidence.json',
        cwd: path.resolve(REPO_ROOT, '..', 'HoloScript'),
      },
      {
        label: 'verify-fleet-job-readiness',
        command: 'node scripts/holoshell-fleet-job-readiness-runner.mjs verify --input .bench-logs/holoshell-human-os-frontier/2026-05-26/fleet-job-readiness-evidence.json',
        cwd: path.resolve(REPO_ROOT, '..', 'HoloScript'),
      },
    ],
    hash: 'sha256:fixture-evidence-hash',
  };
}

function assertSelfTest(feed) {
  const failures = [];
  if (feed.schemaVersion !== SCHEMA_VERSION) failures.push('schema version mismatch');
  if (feed.summary.status !== 'blocked') failures.push('expected blocked Fleet status');
  if (feed.summary.jobId !== 'example-snn-smoke') failures.push('expected fixture job id');
  if (feed.summary.laneProfile !== 'webgpu-smoke') failures.push('expected lane profile');
  if (feed.summary.blockedReasonCount !== 6) failures.push('expected six blocked reasons');
  if (feed.summary.passGateCount !== 2) failures.push('expected two pass gates');
  if (feed.summary.mutationPerformed !== false) failures.push('expected read-only mutation marker');
  if (!feed.tokens.find((token) => token.id === 'fleet-job-ready.lane-identity')) {
    failures.push('expected lane identity token');
  }
  if (!feed.blockers.find((blocker) => blocker.gateId === 'permission-envelope')) {
    failures.push('expected permission envelope blocker');
  }
  if (!feed.commands.replay.includes('holoshell-fleet-job-readiness-runner.mjs')) {
    failures.push('expected replay command');
  }
  if (JSON.stringify(feed).includes(path.resolve(REPO_ROOT, '..', 'HoloScript'))) {
    failures.push('expected HoloScript absolute path redaction');
  }
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function main() {
  const args = parseArgs();
  const sourcePath = args.selfTest ? 'fixture/fleet-job-readiness-evidence.json' : resolveSourcePath(args);
  const evidence = args.selfTest
    ? fixtureFleetEvidence()
    : sourcePath
      ? readJsonFile(sourcePath)
      : {};
  const feed = createFleetFeed(evidence, sourcePath);
  if (args.selfTest) assertSelfTest(feed);

  const output = writeJson(args.output, feed);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, feed);
  if (args.json) {
    console.log(JSON.stringify(feed, null, 2));
  } else {
    console.log(`HoloShell Fleet readiness evidence: ${output}`);
    console.log(`HoloShell Fleet readiness bootstrap: ${jsOutput}`);
    console.log(`Status: ${feed.summary.status}`);
    console.log(`Fleet job: ${feed.summary.jobId || 'unknown'}`);
    console.log(`Fleet blockers: ${feed.summary.blockedReasonCount}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`holoshell-fleet-readiness-evidence failed: ${error.message}`);
    process.exit(1);
  }
}

export { createFleetFeed, fixtureFleetEvidence };
