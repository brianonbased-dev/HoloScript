#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.mcp-custody-upstream-handoff.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_CONTRACT = path.join(DEFAULT_TMP, 'mcp-custody-contract.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'mcp-custody-upstream-handoff.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'mcp-custody-upstream-handoff.js');

function parseArgs(argv) {
  const args = {
    tmpDir: DEFAULT_TMP,
    contract: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--contract') args.contract = argv[++index];
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

  if (!args.contract) args.contract = path.join(args.tmpDir, 'mcp-custody-contract.json');
  if (args.selfTest) {
    args.output = path.join(DEFAULT_TMP, 'self-test', 'mcp-custody-upstream-handoff.json');
    args.jsOutput = path.join(DEFAULT_TMP, 'self-test', 'mcp-custody-upstream-handoff.js');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell MCP upstream custody handoff

Usage:
  node scripts/holoshell-mcp-upstream-handoff.mjs [options]

Options:
  --tmp-dir <path>          Input receipt directory. Defaults to .tmp/holoshell.
  --contract <path>         MCP custody contract JSON. Defaults to <tmp-dir>/mcp-custody-contract.json.
  --output <path>           Output JSON. Defaults to .tmp/holoshell/mcp-custody-upstream-handoff.json.
  --js-output <path>        Browser bootstrap JS. Defaults to .tmp/holoshell/mcp-custody-upstream-handoff.js.
  --json                    Print JSON.
  --self-test               Use a synthetic contract and assert invariants.
  -h, --help                Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      path: path.basename(resolved),
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
  writeFileSync(resolved, `window.HOLOSHELL_MCP_UPSTREAM_HANDOFF = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function fixtureContract() {
  return {
    schemaVersion: 'hololand.holoshell.mcp-custody-contract.v0.1.0',
    generatedAt: '2026-05-15T00:00:00.000Z',
    summary: {
      status: 'warn',
      compatibilityMode: 'receipt_fallback',
      nativeMcpCustodySplit: false,
      hardwareRealityAvailable: true,
      processHealthAvailable: true,
      cleanupCandidateCount: 2,
      ownerHandoffPlanCount: 3,
      terminationPreflightCount: 2,
      checkPassCount: 5,
      checkWarnCount: 3,
      checkFailCount: 0,
    },
    contract: {
      tool: 'holoshell_run_registry_snapshot',
      requiredSummaryFields: ['cleanupCandidateCount', 'ownerHandoffPlanCount', 'terminationPreflightCount'],
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
      requiredShellRunFields: ['actionClass', 'cleanupEligible', 'ownerHandoffRequired'],
    },
    compliance: {
      nextAction: 'Upgrade upstream MCP snapshot so HoloLand no longer needs fallback or overlay custody splitting.',
    },
    receipt: { contractHash: 'fixture-contract-hash' },
  };
}

function createHandoff(args, inputs = null) {
  const contract = inputs?.contract || readJson(args.contract, {});
  const summary = contract.summary || {};
  const contractShape = contract.contract || {};
  const nativeReady = Boolean(summary.nativeMcpCustodySplit);
  const targetTool = contractShape.tool || 'holoshell_run_registry_snapshot';
  const status = contract.schemaVersion
    ? nativeReady
      ? 'native_ready_no_handoff_needed'
      : 'ready_for_upstream_agent'
    : 'blocked_missing_contract';

  const tasks = [
    {
      id: 'locate-tool-owner',
      title: 'Locate the MCP server module registering holoshell_run_registry_snapshot.',
      expectedChange: 'Modify the tool implementation in its owning MCP host, not the HoloLand compatibility bridge.',
      doneWhen: 'The returned snapshot object owns the custody split before HoloLand overlay/fallback code runs.',
    },
    {
      id: 'split-cleanup-vs-owner-handoff',
      title: 'Emit owner-unknown cleanup candidates separately from owner-known handoffs.',
      expectedChange: 'Map owner-unknown risk to terminationPreflights[] and lane-owned risk to ownerHandoffs[].',
      doneWhen: 'Lane-owned PIDs never appear in terminationPreflights[].',
    },
    {
      id: 'stamp-shell-runs',
      title: 'Add custody fields to each shellRuns[] row.',
      expectedChange: 'Each row carries actionClass, cleanupEligible, and ownerHandoffRequired.',
      doneWhen: 'Consumers can classify a run without recomputing process ownership.',
    },
    {
      id: 'add-owner-handoff-card',
      title: 'Expose an owner-handoff operator card separate from mutation gates.',
      expectedChange: 'The snapshot operatorCards[] includes cardId owner-handoff.',
      doneWhen: 'Brittney can explain handoff debt without suggesting process termination.',
    },
    {
      id: 'prove-native-mode',
      title: 'Re-run HoloLand custody contract until compatibilityMode is native_mcp.',
      expectedChange: 'No fallbackActive or processHealthOverlayActive flags are needed for the contract to pass.',
      doneWhen: 'mcp-custody-contract summary reports status pass and nativeMcpCustodySplit true.',
    },
  ];

  const acceptanceGates = [
    {
      id: 'fixture-contract',
      command: 'node scripts/holoshell-mcp-custody-contract.mjs --self-test',
      expected: 'pass',
    },
    {
      id: 'refresh-hardware-reality',
      command: 'pnpm run holoshell:hardware-reality',
      expected: 'snapshot generated without destructive actions',
    },
    {
      id: 'contract-native',
      command: 'pnpm run holoshell:mcp-custody-contract',
      expected: 'summary.status=pass and summary.compatibilityMode=native_mcp',
    },
    {
      id: 'downstream-consumption',
      command: 'node scripts/holoshell-live-feed.mjs && node scripts/holoshell-brittney-context.mjs',
      expected: 'live feed and Brittney context report nativeMcpCustodySplit=true',
    },
  ];

  const dataContract = {
    targetTool,
    requiredSummaryFields: safeArray(contractShape.requiredSummaryFields),
    requiredTerminationPreflightFields: safeArray(contractShape.requiredTerminationPreflightFields),
    requiredOwnerHandoffFields: safeArray(contractShape.requiredOwnerHandoffFields),
    requiredShellRunFields: safeArray(contractShape.requiredShellRunFields),
    invariants: [
      'terminationPreflights[] contains only owner-unknown cleanup candidates',
      'ownerHandoffs[] contains only owner-known non-destructive handoff plans',
      'cleanupEligible is true only for owner-unknown cleanup candidates',
      'ownerLane is null on termination preflights and populated on owner handoffs',
      'raw command text and secrets are not required for any downstream consumer',
    ],
    recommendedAlgorithms: [
      {
        id: 'cleanup-candidate',
        when: 'process has risk and ownerLane is missing',
        emit: 'terminationPreflights[] item with actionClass cleanup_candidate and cleanupEligible true',
      },
      {
        id: 'owner-handoff',
        when: 'process has risk and ownerLane is present',
        emit: 'ownerHandoffs[] item with recommendedAction ask_owner_lane_to_extend_close_or_justify and cleanupEligible false',
      },
      {
        id: 'shell-run-stamping',
        when: 'shellRuns[] rows are assembled',
        emit: 'actionClass, cleanupEligible, ownerHandoffRequired, ownerLane, ownerLaneLabel',
      },
    ],
  };

  const handoff = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    handoffId: `mcp-custody-upstream-${sha256(JSON.stringify({ summary, dataContract, tasks })).slice(0, 12)}`,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-mcp-custody-upstream-handoff.hsplus',
      doc: 'apps/holoshell/docs/MCP_CUSTODY_UPSTREAM_HANDOFF.md',
      adapter: 'scripts/holoshell-mcp-upstream-handoff.mjs',
      contractAdapter: 'scripts/holoshell-mcp-custody-contract.mjs',
      contractReceipt: args.contract || DEFAULT_CONTRACT,
    },
    summary: {
      status,
      targetTool,
      currentCompatibilityMode: summary.compatibilityMode || 'unknown',
      nativeMcpCustodySplit: nativeReady,
      currentContractStatus: summary.status || 'unknown',
      cleanupCandidateCount: summary.cleanupCandidateCount || 0,
      ownerHandoffPlanCount: summary.ownerHandoffPlanCount || 0,
      taskCount: tasks.length,
      acceptanceGateCount: acceptanceGates.length,
      upstreamRepoRequired: true,
    },
    upstreamRequest: {
      title: 'Make holoshell_run_registry_snapshot emit the custody split natively',
      owner: 'MCP host that registers holoshell_run_registry_snapshot',
      reason: 'HoloLand can consume fallback receipts, but all local agents need one global truth for cleanup candidates vs lane-owned handoffs.',
      applyInHoloLand: false,
      targetTool,
    },
    dataContract,
    tasks,
    acceptanceGates,
    safety: {
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
      rawWindowTitlesIncluded: false,
      neverDo: [
        'Do not put lane-owned PIDs in terminationPreflights[].',
        'Do not require raw command text to classify custody.',
        'Do not auto-terminate a process as part of snapshot generation.',
        'Do not make HoloLand overlay the permanent source of truth.',
      ],
    },
    receipt: {
      handoffHash: sha256(JSON.stringify({ targetTool, summary, dataContract, tasks, acceptanceGates })),
      contractHash: contract.receipt?.contractHash || '',
      redacted: true,
    },
  };
  return handoff;
}

function assertSelfTest(handoff) {
  const failures = [];
  if (handoff.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (handoff.summary.status !== 'ready_for_upstream_agent') failures.push(`expected ready handoff, got ${handoff.summary.status}`);
  if (handoff.summary.targetTool !== 'holoshell_run_registry_snapshot') failures.push('target tool mismatch');
  if (handoff.summary.nativeMcpCustodySplit !== false) failures.push('fixture should not be native yet');
  if (handoff.summary.taskCount < 5) failures.push('expected concrete upstream tasks');
  if (!handoff.dataContract.invariants.some((item) => item.includes('terminationPreflights'))) failures.push('missing preflight invariant');
  if (!handoff.acceptanceGates.some((gate) => gate.id === 'contract-native')) failures.push('missing native acceptance gate');
  const serialized = JSON.stringify(handoff);
  if (/commandLine|commandText|rawCommandValue|C:\\\\Users\\\\|api[_-]?key|token\s*=|password\s*=/i.test(serialized)) {
    failures.push('handoff leaked raw commands, private paths, or secrets');
  }
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const handoff = args.selfTest
    ? createHandoff(args, { contract: fixtureContract() })
    : createHandoff(args);
  const output = writeJson(args.output, handoff);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, handoff);
  if (args.selfTest) assertSelfTest(handoff);

  if (args.json) {
    console.log(JSON.stringify(handoff, null, 2));
  } else {
    console.log(`HoloShell MCP upstream handoff: ${output}`);
    console.log(`HoloShell MCP upstream handoff bootstrap: ${jsOutput}`);
    console.log(`Status: ${handoff.summary.status}`);
    console.log(`Target: ${handoff.summary.targetTool}`);
    console.log(`Compatibility: ${handoff.summary.currentCompatibilityMode}`);
    console.log(`Tasks: ${handoff.summary.taskCount}`);
  }
} catch (error) {
  console.error(`holoshell-mcp-upstream-handoff failed: ${error.message}`);
  process.exit(1);
}
