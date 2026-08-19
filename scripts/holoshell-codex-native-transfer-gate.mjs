import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'hololand.holoshell.codex-native-transfer-gate.v0.1.0';
export const AUTHORING_PAIR_SCHEMA = 'codex-native-authoring-pair/v0.1.0';
export const SOURCE_PATH = 'apps/holoshell/source/holoshell-codex-native-transfer-gate.hsplus';
export const DEFAULT_FIXTURE_PATH = 'apps/holoshell/fixtures/codex-native-authoring-pair.receipt.fixture.json';
export const DEFAULT_OUT_PATH = '.tmp/holoshell/codex-native-transfer-gate.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    check: false,
    json: false,
    source: SOURCE_PATH,
    authoringPairReceipt: DEFAULT_FIXTURE_PATH,
    out: DEFAULT_OUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      args.check = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--source') {
      args.source = argv[index + 1];
      index += 1;
    } else if (arg === '--authoring-pair-receipt') {
      args.authoringPairReceipt = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceTokens(sourceText) {
  return [
    'composition "HoloShell Codex Native Transfer Gate"',
    'upstreamReceiptSchema: "codex-native-authoring-pair/v0.1.0"',
    'CodexNativeTransferGate',
    'FrontierAdvantageMustTransfer',
    'ExternalScratchIsProjectionNotSource',
    'NonClaimBoundaryMustStayVisible',
    'consume_authoring_pair_receipt',
    'holoshell:codex-native:transfer-gate',
  ].map((token) => ({
    token,
    present: sourceText.includes(token),
  }));
}

function hasSurface(receipt, predicate) {
  return Array.isArray(receipt.surfaces) && receipt.surfaces.some(predicate);
}

function validateAuthoringPairReceipt(receipt) {
  const gates = Array.isArray(receipt.gates) ? receipt.gates : [];
  const nonClaims = Array.isArray(receipt.nonClaims) ? receipt.nonClaims : [];

  return [
    {
      id: 'schema',
      status: receipt.schemaVersion === AUTHORING_PAIR_SCHEMA ? 'pass' : 'fail',
      detail: `expected ${AUTHORING_PAIR_SCHEMA}`,
    },
    {
      id: 'ready-status',
      status: receipt.status === 'ready' ? 'pass' : 'fail',
      detail: 'authoring pair receipt must be ready',
    },
    {
      id: 'codex-hardware-surface',
      status: hasSurface(receipt, (surface) =>
        surface.id === 'codex-hardware'
        && surface.family === 'openai'
        && surface.role === 'seed_planter'
      ) ? 'pass' : 'fail',
      detail: 'openai/codex seed-planter surface must be visible',
    },
    {
      id: 'sovereign-builder-surface',
      status: hasSurface(receipt, (surface) =>
        surface.id === 'native-first-holoscript-baseline'
        && surface.family === 'sovereign'
        && surface.role === 'builder'
      ) ? 'pass' : 'fail',
      detail: 'sovereign builder surface must be visible',
    },
    {
      id: 'all-gates-pass',
      status: gates.length > 0 && gates.every((gate) => gate.status === 'pass') ? 'pass' : 'fail',
      detail: `${gates.filter((gate) => gate.status === 'pass').length}/${gates.length} upstream gates passed`,
    },
    {
      id: 'non-claims-visible',
      status: nonClaims.includes('not a public model-quality benchmark')
        && nonClaims.includes('not a fresh Jetson prompt run') ? 'pass' : 'fail',
      detail: 'non-claims keep Codex proof scoped to observed local work',
    },
    {
      id: 'next-native-command',
      status: typeof receipt.nextNativeCommand === 'string'
        && receipt.nextNativeCommand.includes('check:codex-native-authoring-pair') ? 'pass' : 'fail',
      detail: 'next sovereign command must be present',
    },
  ];
}

export function buildTransferGateReceipt({
  sourceText,
  sourcePath = SOURCE_PATH,
  authoringPairReceipt,
  authoringPairReceiptText,
  authoringPairReceiptPath = DEFAULT_FIXTURE_PATH,
}) {
  const tokenChecks = sourceTokens(sourceText);
  const upstreamChecks = validateAuthoringPairReceipt(authoringPairReceipt);
  const checks = [
    ...tokenChecks.map((check) => ({
      id: `source:${check.token}`,
      status: check.present ? 'pass' : 'fail',
      detail: check.token,
    })),
    ...upstreamChecks,
  ];

  const gateCount = checks.length;
  const passedGateCount = checks.filter((check) => check.status === 'pass').length;
  const status = gateCount === passedGateCount ? 'ready' : 'blocked';
  const upstreamGates = Array.isArray(authoringPairReceipt.gates) ? authoringPairReceipt.gates : [];
  const upstreamPassedGateCount = upstreamGates.filter((gate) => gate.status === 'pass').length;

  return {
    schemaVersion: SCHEMA_VERSION,
    source: sourcePath,
    generatedAt: new Date().toISOString(),
    status,
    upstreamReceipt: {
      path: authoringPairReceiptPath,
      schemaVersion: authoringPairReceipt.schemaVersion,
      taskId: authoringPairReceipt.taskId ?? '',
      status: authoringPairReceipt.status ?? 'unknown',
      hash: sha256(authoringPairReceiptText),
      gateCount: upstreamGates.length,
      passedGateCount: upstreamPassedGateCount,
    },
    summary: {
      gateCount,
      passedGateCount,
      transferredAdvantageCount: Array.isArray(authoringPairReceipt.surfaces) ? authoringPairReceipt.surfaces.length : 0,
      nonClaimCount: Array.isArray(authoringPairReceipt.nonClaims) ? authoringPairReceipt.nonClaims.length : 0,
      nextNativeCommand: authoringPairReceipt.nextNativeCommand ?? '',
      hololandMutationAllowed: false,
      cockpitProjectionReady: status === 'ready',
    },
    checks,
    nonClaims: Array.isArray(authoringPairReceipt.nonClaims) ? authoringPairReceipt.nonClaims : [],
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
  };
}

export function runTransferGate(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const sourcePath = resolve(repoRoot, args.source);
  const authoringPairReceiptPath = resolve(repoRoot, args.authoringPairReceipt);

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing source contract: ${args.source}`);
  }
  if (!existsSync(authoringPairReceiptPath)) {
    throw new Error(`Missing authoring pair receipt: ${args.authoringPairReceipt}`);
  }

  const sourceText = readFileSync(sourcePath, 'utf8');
  const authoringPairReceiptText = readFileSync(authoringPairReceiptPath, 'utf8');
  const authoringPairReceipt = readJson(args.authoringPairReceipt);
  const receipt = buildTransferGateReceipt({
    sourceText,
    sourcePath: args.source,
    authoringPairReceipt,
    authoringPairReceiptText,
    authoringPairReceiptPath: args.authoringPairReceipt,
  });

  const outPath = resolve(repoRoot, args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stdout.write(`${receipt.status}: ${receipt.summary.passedGateCount}/${receipt.summary.gateCount} gates passed\n`);
  }

  if (args.check && receipt.status !== 'ready') {
    process.exitCode = 1;
  }

  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  runTransferGate();
}
