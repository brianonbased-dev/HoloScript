#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.mcp-custody-contract.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'mcp-custody-contract.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'mcp-custody-contract.js');

function parseArgs(argv) {
  const args = {
    tmpDir: DEFAULT_TMP,
    hardwareReality: '',
    processHealth: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--process-health') args.processHealth = argv[++index];
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

  if (!args.hardwareReality) args.hardwareReality = path.join(args.tmpDir, 'hardware-reality.json');
  if (!args.processHealth) args.processHealth = path.join(args.tmpDir, 'process-health.json');
  if (args.selfTest) {
    args.output = path.join(DEFAULT_TMP, 'self-test', 'mcp-custody-contract.json');
    args.jsOutput = path.join(DEFAULT_TMP, 'self-test', 'mcp-custody-contract.js');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell MCP custody snapshot contract

Usage:
  node scripts/holoshell-mcp-custody-contract.mjs [options]

Options:
  --tmp-dir <path>              Input receipt directory. Defaults to .tmp/holoshell.
  --hardware-reality <path>     Hardware reality JSON. Defaults to <tmp-dir>/hardware-reality.json.
  --process-health <path>       Process health JSON. Defaults to <tmp-dir>/process-health.json.
  --output <path>               Output JSON. Defaults to .tmp/holoshell/mcp-custody-contract.json.
  --js-output <path>            Browser bootstrap JS. Defaults to .tmp/holoshell/mcp-custody-contract.js.
  --json                        Print JSON.
  --self-test                   Use synthetic fixtures and assert invariants.
  -h, --help                    Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      path: filePath,
      error: error.message,
    };
  }
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_MCP_CUSTODY_CONTRACT = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function check(id, status, detail, data = {}) {
  return { id, status, detail, ...data };
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function hasNumber(object, key) {
  return Number.isFinite(Number(object?.[key]));
}

function contractChecks(hardwareReality, processHealth) {
  const summary = hardwareReality.summary || {};
  const mcp = hardwareReality.mcp || {};
  const processSummary = processHealth.summary || {};
  const terminationPreflights = safeArray(hardwareReality.terminationPreflights);
  const ownerHandoffs = safeArray(hardwareReality.ownerHandoffs);
  const cards = safeArray(hardwareReality.operatorCards);

  const cleanupCount = numberValue(summary.cleanupCandidateCount || summary.terminationPreflightCount);
  const handoffCount = numberValue(summary.ownerHandoffPlanCount || summary.ownerHandoffCount);
  const processCleanupCount = numberValue(processSummary.actionableCleanupCandidateCount || processSummary.cleanupCandidateCount);
  const processHandoffCount = numberValue(processSummary.ownerHandoffPlanCount);
  const nativeMcp = Boolean(mcp.nativeMcpCustodySplit) || (!mcp.fallbackActive && !mcp.processHealthOverlayActive);

  const terminationShapeOk = terminationPreflights.length === 0
    || terminationPreflights.every((item) => item.actionClass && item.cleanupEligible === true && item.ownerLane == null);
  const handoffShapeOk = ownerHandoffs.length === 0
    || ownerHandoffs.every((item) => item.cleanupEligible === false && item.ownerLane && item.recommendedAction);

  return [
    check(
      'summary.cleanup-candidate-count',
      hasNumber(summary, 'cleanupCandidateCount') ? 'pass' : 'fail',
      'Hardware summary exposes owner-unknown cleanup candidate count.',
      { actual: summary.cleanupCandidateCount ?? null },
    ),
    check(
      'summary.owner-handoff-count',
      hasNumber(summary, 'ownerHandoffPlanCount') || hasNumber(summary, 'ownerHandoffCount') ? 'pass' : 'fail',
      'Hardware summary exposes owner-known handoff count.',
      { actual: summary.ownerHandoffPlanCount ?? summary.ownerHandoffCount ?? null },
    ),
    check(
      'preflight.cleanup-shape',
      terminationShapeOk ? 'pass' : 'fail',
      'Termination preflights are only owner-unknown cleanup candidates.',
      { count: terminationPreflights.length },
    ),
    check(
      'handoff.owner-shape',
      handoffShapeOk ? 'pass' : 'fail',
      'Owner handoffs carry owner lane and recommended action.',
      { count: ownerHandoffs.length },
    ),
    check(
      'operator-card.owner-handoff',
      cards.some((card) => card.cardId === 'owner-handoff') ? 'pass' : 'fail',
      'Operator cards expose owner handoff separately from mutation gate.',
    ),
    check(
      'mcp.native-custody-split',
      nativeMcp && !mcp.fallbackActive && !mcp.processHealthOverlayActive ? 'pass' : 'warn',
      'Upstream MCP emits the custody split without fallback or HoloLand overlay.',
      {
        fallbackActive: Boolean(mcp.fallbackActive),
        processHealthOverlayActive: Boolean(mcp.processHealthOverlayActive),
        nativeMcpCustodySplit: Boolean(mcp.nativeMcpCustodySplit),
      },
    ),
    check(
      'process-health.cleanup-count-match',
      nativeMcp || !processSummary.riskState || cleanupCount === processCleanupCount ? 'pass' : 'warn',
      nativeMcp
        ? 'Native MCP custody split is authoritative; process-health count mismatch does not require overlay.'
        : 'Hardware cleanup count matches process-health cleanup count.',
      { hardware: cleanupCount, processHealth: processCleanupCount },
    ),
    check(
      'process-health.handoff-count-match',
      nativeMcp || !processSummary.riskState || handoffCount === processHandoffCount ? 'pass' : 'warn',
      nativeMcp
        ? 'Native MCP custody split is authoritative; process-health handoff mismatch does not require overlay.'
        : 'Hardware owner handoff count matches process-health owner handoff count.',
      { hardware: handoffCount, processHealth: processHandoffCount },
    ),
  ];
}

function contractStatus(checks) {
  const native = checks.find((item) => item.id === 'mcp.native-custody-split');
  if (checks.some((item) => item.status === 'fail')) return 'fail';
  if (native?.status === 'pass' && !checks.some((item) => item.status === 'warn')) return 'pass';
  return 'warn';
}

function compatibilityMode(hardwareReality) {
  const mcp = hardwareReality.mcp || {};
  if (mcp.fallbackActive) return 'receipt_fallback';
  if (mcp.processHealthOverlayActive) return 'hololand_overlay';
  return 'native_mcp';
}

function createContract(args, inputs = null) {
  const hardwareReality = inputs?.hardwareReality || readJson(args.hardwareReality, {});
  const processHealth = inputs?.processHealth || readJson(args.processHealth, {});
  const checks = contractChecks(hardwareReality, processHealth);
  const status = contractStatus(checks);
  const mode = compatibilityMode(hardwareReality);
  const passCount = checks.filter((item) => item.status === 'pass').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;
  const failCount = checks.filter((item) => item.status === 'fail').length;
  const summary = hardwareReality.summary || {};

  const packet = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-mcp-custody-contract.hsplus',
      doc: 'apps/holoshell/docs/MCP_CUSTODY_SNAPSHOT_CONTRACT.md',
      adapter: 'scripts/holoshell-mcp-custody-contract.mjs',
      upstreamTool: 'holoshell_run_registry_snapshot',
    },
    summary: {
      status,
      compatibilityMode: mode,
      nativeMcpCustodySplit: mode === 'native_mcp' && status === 'pass',
      hardwareRealityAvailable: Boolean(hardwareReality.schemaVersion || hardwareReality.summary),
      processHealthAvailable: Boolean(processHealth.schemaVersion || processHealth.summary),
      cleanupCandidateCount: numberValue(summary.cleanupCandidateCount || summary.terminationPreflightCount),
      ownerHandoffPlanCount: numberValue(summary.ownerHandoffPlanCount || summary.ownerHandoffCount),
      terminationPreflightCount: numberValue(summary.terminationPreflightCount),
      checkPassCount: passCount,
      checkWarnCount: warnCount,
      checkFailCount: failCount,
    },
    contract: {
      tool: 'holoshell_run_registry_snapshot',
      requiredSummaryFields: [
        'cleanupCandidateCount',
        'ownerHandoffPlanCount',
        'terminationPreflightCount',
      ],
      requiredTerminationPreflightFields: [
        'pid',
        'reason',
        'actionClass=cleanup_candidate',
        'cleanupEligible=true',
        'ownerLane=null',
        'approvalRequired=true',
        'receiptRequired=true',
      ],
      requiredOwnerHandoffFields: [
        'pid',
        'ownerLane',
        'ownerLaneLabel',
        'reason',
        'recommendedAction=ask_owner_lane_to_extend_close_or_justify',
        'cleanupEligible=false',
        'receiptRequired=true',
      ],
      requiredShellRunFields: [
        'action_class',
        'cleanup_eligible',
        'owner_handoff_required',
      ],
    },
    compliance: {
      checks,
      nextAction: status === 'pass'
        ? 'Native MCP custody split is ready for HoloLand consumption.'
        : mode === 'native_mcp'
          ? 'Fix failed or warning checks in the native MCP snapshot shape.'
          : 'Upgrade upstream MCP snapshot so HoloLand no longer needs fallback or overlay custody splitting.',
    },
    globalization: {
      belongsGlobally: true,
      candidateHome: 'HoloShell MCP and HoloScript agent protocol',
      reason: 'Every local agent needs the same distinction between owner-unknown cleanup risk and lane-owned custody debt.',
      consumerSurfaces: ['HoloLand', 'HoloShell', 'Brittney', 'local agent lanes', 'future hardware-native shells'],
    },
    receipt: {
      contractHash: sha256(JSON.stringify({ summary: hardwareReality.summary || {}, checks })),
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
    },
  };
  return packet;
}

function fixtureInputs(mode = 'overlay') {
  const processHealth = {
    schemaVersion: 'hololand.holoshell.process-health.v0.1.0',
    summary: {
      riskState: 'warn',
      actionableCleanupCandidateCount: 2,
      cleanupCandidateCount: 2,
      ownerHandoffPlanCount: 3,
    },
  };
  const hardwareReality = {
    schemaVersion: 'hololand.holoshell.hardware-reality-bridge.v0.1.0',
    mcp: {
      fallbackActive: false,
      processHealthOverlayActive: mode === 'overlay',
    },
    summary: {
      cleanupCandidateCount: 2,
      ownerHandoffPlanCount: 3,
      terminationPreflightCount: 2,
    },
    terminationPreflights: [
      { pid: 101, reason: 'unowned stale run', actionClass: 'cleanup_candidate', cleanupEligible: true, ownerLane: null, approvalRequired: true, receiptRequired: true },
      { pid: 102, reason: 'unowned parent gap', actionClass: 'cleanup_candidate', cleanupEligible: true, ownerLane: null, approvalRequired: true, receiptRequired: true },
    ],
    ownerHandoffs: [
      { pid: 201, ownerLane: 'codex', ownerLaneLabel: 'Codex', reason: 'lane stale run', recommendedAction: 'ask_owner_lane_to_extend_close_or_justify', cleanupEligible: false, receiptRequired: true },
      { pid: 202, ownerLane: 'claude', ownerLaneLabel: 'Claude', reason: 'lane stale run', recommendedAction: 'ask_owner_lane_to_extend_close_or_justify', cleanupEligible: false, receiptRequired: true },
      { pid: 203, ownerLane: 'gemini', ownerLaneLabel: 'Gemini', reason: 'lane stale run', recommendedAction: 'ask_owner_lane_to_extend_close_or_justify', cleanupEligible: false, receiptRequired: true },
    ],
    operatorCards: [{ cardId: 'owner-handoff' }],
  };
  return { hardwareReality, processHealth };
}

function assertSelfTest(packet) {
  const failures = [];
  if (packet.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (packet.summary.status !== 'warn') failures.push(`expected overlay fixture warn, got ${packet.summary.status}`);
  if (packet.summary.compatibilityMode !== 'hololand_overlay') failures.push('expected overlay compatibility mode');
  if (packet.summary.cleanupCandidateCount !== 2) failures.push('cleanup count mismatch');
  if (packet.summary.ownerHandoffPlanCount !== 3) failures.push('handoff count mismatch');
  if (!packet.compliance.checks.find((item) => item.id === 'mcp.native-custody-split')) failures.push('missing native split check');

  const nativePacket = createContract(parseArgs(['--self-test']), fixtureInputs('native'));
  if (nativePacket.summary.status !== 'pass') failures.push(`expected native fixture pass, got ${nativePacket.summary.status}`);
  if (!nativePacket.summary.nativeMcpCustodySplit) failures.push('expected native fixture to be native');
  const nativeMismatchInputs = fixtureInputs('native');
  nativeMismatchInputs.processHealth.summary.actionableCleanupCandidateCount = 99;
  nativeMismatchInputs.processHealth.summary.ownerHandoffPlanCount = 99;
  const nativeMismatchPacket = createContract(parseArgs(['--self-test']), nativeMismatchInputs);
  if (nativeMismatchPacket.summary.status !== 'pass') {
    failures.push(`expected native fixture to ignore process-health count mismatch, got ${nativeMismatchPacket.summary.status}`);
  }

  const serialized = JSON.stringify(packet);
  if (/commandPreview|commandLine|C:\\\\Users\\\\|api[_-]?key|token\s*=|password\s*=/i.test(serialized)) {
    failures.push('contract leaked raw commands, private paths, or secrets');
  }
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const packet = args.selfTest
    ? createContract(args, fixtureInputs('overlay'))
    : createContract(args);
  const output = writeJson(args.output, packet);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, packet);
  if (args.selfTest) assertSelfTest(packet);

  if (args.json) {
    console.log(JSON.stringify(packet, null, 2));
  } else {
    console.log(`HoloShell MCP custody contract: ${output}`);
    console.log(`HoloShell MCP custody contract bootstrap: ${jsOutput}`);
    console.log(`Status: ${packet.summary.status}`);
    console.log(`Compatibility: ${packet.summary.compatibilityMode}`);
    console.log(`Cleanup candidates: ${packet.summary.cleanupCandidateCount}`);
    console.log(`Owner handoffs: ${packet.summary.ownerHandoffPlanCount}`);
  }
} catch (error) {
  console.error(`holoshell-mcp-custody-contract failed: ${error.message}`);
  process.exit(1);
}
