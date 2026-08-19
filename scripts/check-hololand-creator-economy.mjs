#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.creator-economy.v0.1.0';
const ROOM_SOURCE = 'apps/holoshell/source/hololand-creator-economy-room.holo';
const POLICY_SOURCE = 'apps/holoshell/source/hololand-creator-economy-policy.hsplus';
const API_SPEC = 'docs/api.openapi.yaml';
const SPEC_SOURCE = 'docs/specs/CREATOR_ECONOMY_X402_GATES.md';
const QUICKSTART = 'docs/CREATOR_QUICKSTART.md';
const COMMERCE_VERTICAL = 'source/verticals/commerce/commerce-vertical.hsplus';
const SOURCE_MAP = 'apps/holoshell/docs/HOLOSHELL_SOURCE_MAP.md';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand-creator-economy', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand creator economy check

Usage:
  node scripts/check-hololand-creator-economy.mjs [--output <path>] [--json]
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean))];
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120000,
  });
}

function runTsxTemp(script, name, options = {}) {
  const tempDir = repoPath(path.join('.tmp', 'hololand-creator-economy'));
  mkdirSync(tempDir, { recursive: true });
  const scriptPath = path.join(tempDir, `${name}.mjs`);
  writeFileSync(scriptPath, `${script}\n`, 'utf8');

  const dirArg = options.pnpmDir ? `--dir ${options.pnpmDir.replace(/\\/g, '/')} ` : '';
  const rawScriptArg = options.pnpmDir ? scriptPath : path.relative(process.cwd(), scriptPath);
  const scriptArg = rawScriptArg.replace(/\\/g, '/');
  const command = `pnpm ${dirArg}exec tsx ${scriptArg}`;

  if (process.platform === 'win32') {
    return runCommand('cmd.exe', ['/d', '/s', '/c', command], { timeout: options.timeout ?? 120000 });
  }
  return runCommand('sh', ['-c', command], { timeout: options.timeout ?? 120000 });
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(path.join(candidate, 'package.json'))) || null;
}

function parseWithHoloScript(relativePath) {
  const root = findHoloScriptRoot();
  if (!root) {
    return {
      source: relativePath,
      passed: false,
      kind: 'missing_local_holoscript_root',
      error: 'Set HOLOSCRIPT_ROOT or place HoloScript next to HoloLand before running this check.',
    };
  }

  const absoluteSource = repoPath(relativePath);
  const isHolo = relativePath.endsWith('.holo');
  const parserPath = isHolo
    ? path.join(root, 'packages', 'core', 'src', 'parser', 'HoloCompositionParser.ts')
    : path.join(root, 'packages', 'core', 'src', 'parser', 'HoloScriptPlusParser.ts');
  const parserExport = isHolo ? 'parseHolo' : 'parse';
  const parserUrl = pathToFileURL(parserPath).href;
  const script = `
    import { readFileSync } from 'node:fs';
    import { ${parserExport} as parseSource } from ${JSON.stringify(parserUrl)};
    const result = parseSource(readFileSync(${JSON.stringify(absoluteSource)}, 'utf8'));
    console.log(JSON.stringify({
      success: result.success,
      errors: (result.errors || []).slice(0, 4).map((error) => ({
        message: error.message,
        loc: error.loc || error.location || null,
        severity: error.severity || 'error'
      }))
    }));
    if (!result.success) process.exit(1);
  `;

  const result = runTsxTemp(script, `parse-${path.extname(relativePath).slice(1) || 'source'}`, { pnpmDir: root });
  return {
    source: relativePath,
    passed: result.status === 0,
    kind: 'local_holoscript_source_parser',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-4),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function buildSemanticIr(texts) {
  return {
    room: {
      source: ROOM_SOURCE,
      composition: uniqueMatches(texts.room, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.room, /template\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.room, /channel_id:\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.room, /object\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.room, /action_id:\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.room, /policy_id:\s+"([^"]+)"/g),
      sourceHash: sha256(texts.room),
    },
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policy, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policy, /template\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.policy, /channel\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policy, /policy\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policy, /action\s+([A-Za-z0-9_]+)/g),
      sourceHash: sha256(texts.policy),
    },
    api: {
      source: API_SPEC,
      hash: sha256(texts.api),
      anchors: [
        'CreatorEarningsDashboard',
        'x402_payment_gate',
        '/worlds/{worldId}/x402-gate',
        '/transactions/x402-settlement',
        'settlement_backend_status',
      ].filter((anchor) => texts.api.includes(anchor)),
    },
    commerce: {
      source: COMMERCE_VERTICAL,
      hash: sha256(texts.commerce),
      anchors: [
        'x402_gate_configured',
        'x402_settlement_receipt',
        'creator_earnings_snapshot',
      ].filter((anchor) => texts.commerce.includes(anchor)),
    },
    spec: {
      source: SPEC_SOURCE,
      hash: sha256(texts.spec),
      sourcePointersPresent: includesAll(texts.spec, [ROOM_SOURCE, POLICY_SOURCE, API_SPEC, COMMERCE_VERTICAL]),
    },
    quickstart: {
      source: QUICKSTART,
      hash: sha256(texts.quickstart),
      sourcePointersPresent: includesAll(texts.quickstart, [ROOM_SOURCE, POLICY_SOURCE, SPEC_SOURCE]),
    },
    sourceMap: {
      source: SOURCE_MAP,
      hash: sha256(texts.sourceMap),
      sourcePointersPresent: includesAll(texts.sourceMap, [ROOM_SOURCE, POLICY_SOURCE]),
    },
  };
}

function buildAssertions({ semanticIr, parsers, texts }) {
  return {
    sourceParser: parsers.every((parser) => parser.passed),
    roomDefinesEconomyDashboard: [
      'WorldX402GatePanel',
      'CreatorEarningsPanel',
      'PayoutReadinessPanel',
      'SalesLedgerPanel',
      'RevenueSplitPanel',
      'RefundRiskPanel',
      'PayoutBoundaryPanel',
      'CreatorEconomyReceiptWitness',
    ].every((name) => semanticIr.room.objects.includes(name)),
    roomDefinesEconomyActions: [
      'configure_x402_world_gate',
      'open_creator_earnings_dashboard',
      'capture_x402_settlement_receipt',
      'request_creator_payout_review',
    ].every((name) => semanticIr.room.actions.includes(name)),
    policyDefinesPackets: [
      'WorldX402GatePacket',
      'X402SettlementReceipt',
      'CreatorEarningsSnapshot',
      'CreatorPayoutReceipt',
    ].every((name) => semanticIr.policy.templates.includes(name)),
    policyDefinesRequiredGates: [
      'HoloScriptSourceOwnsPaidWorldGate',
      'X402SettlementReceiptRequired',
      'EarningsDashboardCannotClaimPayoutWithoutSettlement',
      'RefundAndRevocationReserveRequired',
    ].every((name) => semanticIr.policy.policies.includes(name)),
    policyCarriesDashboardFields: includesAll(texts.policy, [
      'grossSalesCents',
      'platformFeeCents',
      'creatorNetCents',
      'pendingPayoutCents',
      'availablePayoutCents',
      'refundReserveCents',
      'payoutWallet',
      'settlementBackendStatus',
    ]),
    apiDefinesX402GateAndEarnings: semanticIr.api.anchors.length === 5,
    commerceVerticalRequiresEconomyReceipts: semanticIr.commerce.anchors.length === 3,
    specReferencesSourceLayer: semanticIr.spec.sourcePointersPresent,
    quickstartReferencesSourceLayer: semanticIr.quickstart.sourcePointersPresent,
    sourceMapReferencesSourceLayer: semanticIr.sourceMap.sourcePointersPresent,
    packageScript: texts.packageJson.includes('"check:hololand-creator-economy": "node scripts/check-hololand-creator-economy.mjs"'),
  };
}

function assertReceipt(receipt) {
  const failures = [];
  for (const [name, passed] of Object.entries(receipt.assertions || {})) {
    if (!passed) failures.push(`failed assertion: ${name}`);
  }
  for (const parser of receipt.parsers || []) {
    if (!parser.passed) failures.push(`parser failed for ${parser.source}: ${parser.error || parser.stderrTail?.join(' ') || parser.status}`);
  }
  if (!receipt.receipt?.receiptHash) failures.push('missing receipt hash');
  if (failures.length) throw new Error(failures.join('\n'));
}

function writeReceipt(output, receipt) {
  const resolved = repoPath(output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolved;
}

function runCheck(args) {
  const texts = {
    room: read(ROOM_SOURCE),
    policy: read(POLICY_SOURCE),
    api: read(API_SPEC),
    spec: read(SPEC_SOURCE),
    quickstart: read(QUICKSTART),
    commerce: read(COMMERCE_VERTICAL),
    sourceMap: read(SOURCE_MAP),
    packageJson: read(PACKAGE_JSON),
  };
  const parsers = [parseWithHoloScript(ROOM_SOURCE), parseWithHoloScript(POLICY_SOURCE)];
  const semanticIr = buildSemanticIr(texts);
  const assertions = buildAssertions({ semanticIr, parsers, texts });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    semanticIr,
    assertions,
    parsers: parsers.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...parser }) => parser),
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      room: ROOM_SOURCE,
      policy: POLICY_SOURCE,
      api: API_SPEC,
      spec: SPEC_SOURCE,
      quickstart: QUICKSTART,
      commerce: COMMERCE_VERTICAL,
      sourceMap: SOURCE_MAP,
    },
    parsers,
    semanticIr,
    assertions,
    policy: {
      sourceOwnedByHoloScript: true,
      x402WorldGateSourceDefined: true,
      creatorDashboardSourceDefined: true,
      livePayoutBackendStillPending: true,
      noRobloxDevExParityClaim: true,
      payoutCopyRequiresTransferReceipt: true,
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawSourceIncluded: false,
    },
  };

  assertReceipt(receipt);
  const output = writeReceipt(args.output, receipt);
  return { receipt, output };
}

try {
  const args = parseArgs();
  const { receipt, output } = runCheck(args);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log('[hololand-creator-economy] ok');
    console.log(`receipt: ${output}`);
    console.log(`room: ${receipt.sources.room}`);
    console.log(`policy: ${receipt.sources.policy}`);
    console.log(`api: ${receipt.sources.api}`);
  }
} catch (error) {
  console.error('[hololand-creator-economy] failed');
  console.error(error.message || error);
  process.exit(1);
}
