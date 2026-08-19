#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.operator-terminal.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'operator-terminal.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'operator-terminal.js');
const HUMAN_LABELS = [
  'Ask Brittney',
  'Check System',
  'Build World',
  'Show Agents',
  'Review Approvals',
  'Claim Local Task',
  'Show Receipts',
];
const HUMAN_COMMAND_ROUTES = [
  {
    id: 'ask_brittney',
    label: 'Ask Brittney',
    meaning: 'Send a plain-language request to the HoloShell operator.',
    flowLabel: 'Brittney turn',
    flow: 'brittney_turn',
    permissionEnvelope: 'read_only_or_guarded_by_intent',
    approvalRequired: 'classified_by_intent',
    adapter: 'scripts/holoshell-brittney-turn.mjs',
    packageScript: 'holoshell:brittney-turn',
    developerCommand: 'pnpm run holoshell:brittney-turn -- --prompt <request> --json',
    reads: ['.tmp/holoshell/brittney-context.json', '.tmp/holoshell/operator-brief.json'],
    writes: ['.tmp/holoshell/brittney-turn-latest.json', '.tmp/holoshell/brittney-turn-latest.js'],
    receipt: '.tmp/holoshell/brittney-turn-latest.json',
    target: 'Brittney operator turn bridge',
  },
  {
    id: 'check_system',
    label: 'Check System',
    meaning: 'Show health, services, agents, approvals, and caveats.',
    flowLabel: 'Service manager status',
    flow: 'service_manager_status',
    permissionEnvelope: 'read_only',
    approvalRequired: false,
    adapter: 'scripts/holoshell-service-supervisor.mjs',
    packageScript: 'holoshell:service-supervisor',
    developerCommand: 'pnpm run holoshell:service-supervisor -- --status --json',
    reads: ['.tmp/holoshell/service-heartbeats.json', '.tmp/holoshell/operator-brief.json'],
    writes: ['.tmp/holoshell/service-supervisor.json', '.tmp/holoshell/service-supervisor.js'],
    receipt: '.tmp/holoshell/service-supervisor.json',
    target: 'HoloShell service supervisor',
  },
  {
    id: 'build_world',
    label: 'Build World',
    meaning: 'Start a guided HoloScript/HoloLand build path after readiness checks.',
    flowLabel: 'World build custody',
    flow: 'world_build_custody',
    permissionEnvelope: 'guarded_execute',
    approvalRequired: true,
    adapter: 'scripts/holoshell-build-custody.mjs',
    approvalAdapter: 'scripts/holoshell-workflow-approval-bundle.mjs',
    packageScript: 'holoshell:build-custody',
    developerCommand: 'pnpm run holoshell:build-custody -- --json',
    approvalCommand: 'node scripts/holoshell-workflow-approval-bundle.mjs --json',
    reads: ['.tmp/holoshell/readiness-evidence.json', '.tmp/holoshell/hardware-reality.json', '.tmp/holoshell/legacy-window-inventory.json'],
    writes: ['.tmp/holoshell/build-custody.json', '.tmp/holoshell/build-custody.js'],
    approvalReceipt: '.tmp/holoshell/workflow-approval-latest.json',
    receipt: '.tmp/holoshell/build-custody.json',
    target: 'HoloScript/HoloLand build custody lane',
  },
  {
    id: 'show_agents',
    label: 'Show Agents',
    meaning: 'List active agent lanes and their boundaries.',
    flowLabel: 'Agent lanes',
    flow: 'agent_lanes',
    permissionEnvelope: 'read_only',
    approvalRequired: false,
    adapter: 'scripts/holoshell-agent-lanes.mjs',
    packageScript: null,
    developerCommand: 'node scripts/holoshell-agent-lanes.mjs --json',
    reads: ['.tmp/holoshell/grok-heartbeat.json', 'local process list'],
    writes: ['.tmp/holoshell/agent-lanes.json'],
    receipt: '.tmp/holoshell/agent-lanes.json',
    target: 'HoloMesh agent lane inventory',
  },
  {
    id: 'review_approvals',
    label: 'Review Approvals',
    meaning: 'Inspect pending approval packets before any risky action.',
    flowLabel: 'Approval review',
    flow: 'approval_review',
    permissionEnvelope: 'guarded_execute',
    approvalRequired: false,
    adapter: 'scripts/holoshell-workflow-approval-bundle.mjs',
    secondaryAdapter: 'scripts/holoshell-approval-bundle.mjs',
    packageScript: null,
    developerCommand: 'node scripts/holoshell-workflow-approval-bundle.mjs --json',
    reads: ['.tmp/holoshell/workflow-latest.json', '.tmp/holoshell/approval-bundles/'],
    writes: ['.tmp/holoshell/workflow-approval-latest.json', '.tmp/holoshell/workflow-approval-latest.js'],
    receipt: '.tmp/holoshell/workflow-approval-latest.json',
    target: 'Nonce-bound HoloShell approval packets',
  },
  {
    id: 'claim_local_room_task',
    label: 'Claim Local Task',
    meaning: 'Claim one local HoloMesh room task after guarded browser approval.',
    flowLabel: 'Local task claim',
    flow: 'sovereign_room_task_claim',
    permissionEnvelope: 'guarded_execute',
    approvalRequired: true,
    adapter: 'scripts/holoshell-sovereign-room-marathon.mjs',
    packageScript: null,
    developerCommand: 'node scripts/holoshell-sovereign-room-marathon.mjs --task-lane local --task-tag local --claim --confirm-claim --claim-task-id <selectedTaskId> --json',
    requiresSelectedTaskId: true,
    taskSelectionField: 'selectedTaskId',
    reads: ['HoloMesh local room queue', '.tmp/holoshell/operator-terminal.json'],
    writes: ['.tmp/holoshell/sovereign-room-marathon-latest.json', '.tmp/holoshell/sovereign-room-marathon-latest.js'],
    receipt: '.tmp/holoshell/sovereign-room-marathon-latest.json',
    target: 'HoloMesh local room task claim',
  },
  {
    id: 'show_receipts',
    label: 'Show Receipts',
    meaning: 'Open the evidence trail without exposing raw logs first.',
    flowLabel: 'Receipt control',
    flow: 'receipt_control',
    permissionEnvelope: 'read_only',
    approvalRequired: false,
    adapter: 'scripts/holoshell-receipt-control.mjs',
    packageScript: 'holoshell:receipt-control',
    developerCommand: 'pnpm run holoshell:receipt-control -- --json',
    reads: ['.tmp/holoshell/founder-evidence-demo-latest.json', '.tmp/holoshell/receipt-control-receipts/'],
    writes: ['.tmp/holoshell/receipt-control-latest.json', '.tmp/holoshell/receipt-control-latest.js'],
    receipt: '.tmp/holoshell/receipt-control-latest.json',
    target: 'HoloShell receipt-control timeline',
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: 'human',
    json: false,
    selfTest: false,
    tmpDir: DEFAULT_TMP,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    intentLabel: null,
    prompt: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index];
    else if (arg === '--agent') args.mode = 'agent';
    else if (arg === '--human') args.mode = 'human';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--label' || arg === '--intent-label') args.intentLabel = argv[++index];
    else if (arg === '--prompt') args.prompt = argv[++index] || '';
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['human', 'agent'].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}. Use human or agent.`);
  }
  if (args.selfTest) {
    args.output = path.join(DEFAULT_TMP, 'self-test', 'operator-terminal.json');
    args.jsOutput = path.join(DEFAULT_TMP, 'self-test', 'operator-terminal.js');
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell operator terminal

Usage:
  node scripts/holoshell-operator-terminal.mjs [options]

Options:
  --human              Print the non-developer terminal view. Default.
  --agent              Print machine-readable JSON for agents.
  --mode <human|agent> Select terminal mode.
  --json               Print the full terminal receipt.
  --tmp-dir <path>     Read HoloShell receipts from this directory. Default: .tmp/holoshell.
  --output <path>      JSON receipt output. Default: .tmp/holoshell/operator-terminal.json.
  --js-output <path>   Browser/bootstrap output. Default: .tmp/holoshell/operator-terminal.js.
  --label <text>       Route one human label without running the downstream adapter.
  --prompt <text>      Prompt hash/preview for Ask Brittney route receipts.
  --self-test          Use synthetic receipts and assert terminal invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      path: resolved,
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

function writeBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_OPERATOR_TERMINAL = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function routeForLabel(label) {
  const normalized = normalizeLabel(label);
  return HUMAN_COMMAND_ROUTES.find((route) =>
    route.id === normalized || normalizeLabel(route.label) === normalized
  ) || null;
}

function routeSummaryForHuman(route) {
  return {
    id: route.id,
    label: route.label,
    meaning: route.meaning,
    flow: route.flow,
    flowLabel: route.flowLabel,
    permissionEnvelope: route.permissionEnvelope,
    approvalRequired: route.approvalRequired,
    target: route.target,
    receipt: route.receipt,
    requiresSelectedTaskId: route.requiresSelectedTaskId === true,
    taskSelectionField: route.taskSelectionField || null,
    exposesRawCommandByDefault: false,
  };
}

function routeSummaryForAgent(route) {
  return {
    id: route.id,
    label: route.label,
    flow: route.flow,
    adapter: route.adapter,
    secondaryAdapter: route.secondaryAdapter || null,
    approvalAdapter: route.approvalAdapter || null,
    packageScript: route.packageScript || null,
    developerCommand: route.developerCommand,
    approvalCommand: route.approvalCommand || null,
    reads: route.reads,
    writes: route.writes,
    receipt: route.receipt,
    approvalReceipt: route.approvalReceipt || null,
    permissionEnvelope: route.permissionEnvelope,
    approvalRequired: route.approvalRequired,
    requiresSelectedTaskId: route.requiresSelectedTaskId === true,
    taskSelectionField: route.taskSelectionField || null,
  };
}

function selectedIntentRoute(args) {
  if (!args.intentLabel) return null;
  const route = routeForLabel(args.intentLabel);
  if (!route) {
    throw new Error(`Unknown human label: ${args.intentLabel}. Use one of: ${HUMAN_LABELS.join(', ')}.`);
  }
  const prompt = String(args.prompt || '').trim();
  return {
    selectedAt: new Date().toISOString(),
    status: 'routed_to_existing_holoshell_flow',
    requestedLabel: args.intentLabel,
    human: routeSummaryForHuman(route),
    agent: routeSummaryForAgent(route),
    request: route.id === 'ask_brittney'
      ? {
          promptSupplied: Boolean(prompt),
          promptHash: prompt ? sha256(prompt).slice(0, 16) : null,
          promptPreview: prompt ? `${prompt.slice(0, 72)}${prompt.length > 72 ? '...' : ''}` : null,
        }
      : null,
    execution: {
      performed: false,
      reason: 'operator_terminal_routes_labels_only; downstream adapter remains the executor',
      approvalRequiredBeforeMutation: route.approvalRequired === true || route.permissionEnvelope === 'guarded_execute',
    },
  };
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statusRank(status) {
  if (/^(needs_|.*_review$)/.test(String(status || ''))) return 3;
  if (['critical', 'fail', 'failed', 'blocked', 'attention_required'].includes(status)) return 4;
  if (['warn', 'warning', 'degraded', 'stale', 'missing'].includes(status)) return 3;
  if (['unknown', 'partial'].includes(status)) return 2;
  if (['ready_with_optional_offline', 'ready_with_degraded_optional'].includes(status)) return 1;
  return 0;
}

function normalizeRisk(statuses) {
  const worst = statuses.filter(Boolean).sort((a, b) => statusRank(b) - statusRank(a))[0] || 'unknown';
  if (['critical', 'fail', 'failed', 'blocked', 'attention_required'].includes(worst)) return 'attention_required';
  if (['warn', 'warning', 'degraded', 'stale', 'missing'].includes(worst)) return 'warn';
  if (['unknown', 'partial'].includes(worst)) return 'unknown';
  return 'ready';
}

function receiptPresent(receipt) {
  return Boolean(receipt && typeof receipt === 'object' && receipt.schemaVersion);
}

function loadFeeds(tmpDir) {
  const p = (name) => path.join(tmpDir, name);
  return {
    liveFeed: readJson(p('live-feed.json'), null),
    operatorBrief: readJson(p('operator-brief.json'), null),
    serviceSupervisor: readJson(p('service-supervisor.json'), null),
    agentLanes: readJson(p('agent-lanes.json'), null),
    readinessEvidence: readJson(p('readiness-evidence.json'), null),
    brittneyContext: readJson(p('brittney-context.json'), null),
    brittneyTurn: readJson(p('brittney-turn-latest.json'), null),
    networkReality: readJson(p('network-reality.json'), null),
    shellObjects: readJson(p('shell-objects.json'), null),
  };
}

function fixtureFeeds() {
  return {
    liveFeed: {
      schemaVersion: 'hololand.holoshell.live-feed.v0.1.0',
      summary: {
        overallRisk: 'warn',
        brittneyAvatarStatus: 'online',
        brittneyContextStatus: 'ready',
        serviceSupervisorStatus: 'ready_with_optional_offline',
        laneCount: 8,
        activeLaneCount: 3,
        timelineCount: 22,
        desktopBridgeStatus: 'ready',
        desktopBridgeFreshness: 'fresh',
        desktopBridgeReceiptAgeMs: 250,
        pendingHardwareApprovalCount: 1,
        activeWorkflowApprovalPendingCount: 0,
        readinessEvidenceStatus: 'warn',
        readinessWarningCount: 2,
        shellObjectCount: 95,
      },
      timeline: [
        { id: 'service-supervisor', title: 'Service supervisor refreshed', trustState: 'partial' },
        { id: 'agent-lanes', title: 'Agent lanes refreshed', trustState: 'verified' },
      ],
    },
    operatorBrief: {
      schemaVersion: 'hololand.holoshell.operator-brief.v0.1.0',
      status: 'needs_run_custody',
      nextActions: [
        { source: 'run_custody', priority: 'high', action: 'Claim one visible shell-window run.' },
        { source: 'readiness_evidence', priority: 'medium', action: 'Review two readiness warnings.' },
      ],
      receipt: { briefHash: 'brief-fixture' },
    },
    serviceSupervisor: {
      schemaVersion: 'hololand.holoshell.service-supervisor.v0.1.0',
      summary: {
        status: 'ready_with_optional_offline',
        serviceCount: 5,
        requiredServiceCount: 3,
        requiredOnlineServiceCount: 3,
        requiredAttentionCount: 0,
        controlDaemonServiceStatus: 'offline',
      },
      receipt: { snapshotHash: 'service-fixture' },
    },
    agentLanes: {
      schemaVersion: 'hololand.holoshell.agent-lanes.v0.1.0',
      summary: { laneCount: 8, activeLaneCount: 3, semanticLaneCount: 8 },
      lanes: [
        { laneId: 'codex-hardware', label: 'Codex Hardware', agentKind: 'codex', surfaceKind: 'hardware_shell' },
        { laneId: 'holomesh-team', label: 'HoloMesh Team', agentKind: 'holomesh', surfaceKind: 'network_presence' },
      ],
    },
    readinessEvidence: {
      schemaVersion: 'hololand.holoshell.readiness-evidence.v0.1.0',
      summary: { status: 'warn', tokenCount: 14, warningCount: 2, nextWorkflow: 'operator_terminal' },
      receipt: { readinessHash: 'readiness-fixture' },
    },
    brittneyContext: {
      schemaVersion: 'hololand.holoshell.brittney-context.v0.1.0',
      summary: { status: 'ready', contextHash: 'context-fixture' },
      operatorPromptCard: { firstMove: 'Use the operator brief before action.' },
    },
    brittneyTurn: {
      schemaVersion: 'hololand.holoshell.brittney-turn.v0.1.0',
      summary: { status: 'completed', runtimeStatus: 'available' },
      result: { finalText: 'I can help from HoloShell.' },
    },
    networkReality: {
      schemaVersion: 'hololand.holoshell.network-reality.v0.1.0',
      underlay: { classification: 'home_lan' },
      schemaContract: { validationStatus: 'pass' },
    },
    shellObjects: {
      schemaVersion: 'hololand.holoshell.shell-objects.v0.1.0',
      summary: { shellObjectCount: 95, firstScreenObjectCount: 12 },
    },
  };
}

function missingReceiptList(feeds) {
  return Object.entries({
    liveFeed: feeds.liveFeed,
    operatorBrief: feeds.operatorBrief,
    serviceSupervisor: feeds.serviceSupervisor,
    agentLanes: feeds.agentLanes,
    readinessEvidence: feeds.readinessEvidence,
  })
    .filter(([, receipt]) => !receiptPresent(receipt))
    .map(([name]) => name);
}

function sourceReceiptHashes(feeds) {
  return {
    liveFeed: sha256(JSON.stringify(feeds.liveFeed?.summary || {})).slice(0, 16),
    operatorBrief: feeds.operatorBrief?.receipt?.briefHash || null,
    serviceSupervisor: feeds.serviceSupervisor?.receipt?.snapshotHash || null,
    readinessEvidence: feeds.readinessEvidence?.receipt?.readinessHash || feeds.readinessEvidence?.readinessId || null,
    brittneyContext: feeds.brittneyContext?.summary?.contextHash || feeds.brittneyContext?.receipt?.contextHash || null,
  };
}

function buildCommands() {
  return {
    human: HUMAN_COMMAND_ROUTES.map(routeSummaryForHuman),
    routes: HUMAN_COMMAND_ROUTES.map(routeSummaryForAgent),
    agent: [
      { id: 'agent_json', command: 'node scripts/holoshell-operator-terminal.mjs --agent --json', produces: '.tmp/holoshell/operator-terminal.json' },
      { id: 'refresh_live_feed', command: 'node scripts/holoshell-live-feed.mjs', produces: '.tmp/holoshell/live-feed.json' },
      { id: 'refresh_operator_brief', command: 'pnpm run holoshell:operator-brief', produces: '.tmp/holoshell/operator-brief.json' },
      { id: 'refresh_services', command: 'pnpm run holoshell:service-supervisor', produces: '.tmp/holoshell/service-supervisor.json' },
      { id: 'refresh_readiness', command: 'pnpm run holoshell:readiness-evidence', produces: '.tmp/holoshell/readiness-evidence.json' },
    ],
  };
}

function staleReadinessBriefActions(feeds) {
  const readinessWarningCount = numeric(feeds.readinessEvidence?.summary?.warningCount);
  if (readinessWarningCount > 0) return [];
  return safeArray(feeds.operatorBrief?.nextActions).filter((action) =>
    (action.source || '') === 'readiness_evidence'
      && /warning/i.test(String(action.action || ''))
  );
}

function createNextActions(feeds, missingReceipts) {
  const staleReadinessActions = staleReadinessBriefActions(feeds);
  const staleReadinessActionSet = new Set(staleReadinessActions);
  const briefActions = safeArray(feeds.operatorBrief?.nextActions)
    .filter((action) => !staleReadinessActionSet.has(action))
    .map((action) => ({
    source: action.source || 'operator_brief',
    priority: action.priority || 'medium',
    action: action.action || String(action),
  }));
  const staleActions = staleReadinessActions.length
    ? [{
        source: 'operator_brief',
        priority: 'high',
        action: 'Refresh operator brief; readiness evidence no longer matches the brief next-action list.',
      }]
    : [];
  const missingActions = missingReceipts.map((name) => ({
    source: name,
    priority: name === 'liveFeed' || name === 'operatorBrief' ? 'high' : 'medium',
    action: `Refresh ${name} before treating the terminal as current production truth.`,
  }));
  if (!briefActions.length && !staleActions.length && !missingActions.length) {
    return [{ source: 'operator_terminal', priority: 'low', action: 'Continue operating from current HoloShell receipts.' }];
  }
  return [...briefActions, ...staleActions, ...missingActions].slice(0, 8);
}

function createTerminalReceipt(args, feeds) {
  const live = feeds.liveFeed?.summary || {};
  const services = feeds.serviceSupervisor?.summary || {};
  const lanes = feeds.agentLanes?.summary || {};
  const readiness = feeds.readinessEvidence?.summary || {};
  const missingReceipts = missingReceiptList(feeds);
  const nextActions = createNextActions(feeds, missingReceipts);
  const pendingApprovalCount = numeric(live.pendingHardwareApprovalCount)
    + numeric(live.activeWorkflowApprovalPendingCount)
    + numeric(live.activeShardImportApprovalPendingCount);
  const serviceStatus = services.status || live.serviceSupervisorStatus || 'unknown';
  const readinessStatus = readiness.status || live.readinessEvidenceStatus || 'unknown';
  const status = normalizeRisk([
    live.overallRisk,
    feeds.operatorBrief?.status,
    serviceStatus,
    readinessStatus,
    missingReceipts.length ? 'missing' : 'ready',
  ]);
  const hashes = sourceReceiptHashes(feeds);

  const summary = {
    status,
    mode: args.mode,
    brittneyStatus: feeds.brittneyContext?.summary?.status || live.brittneyContextStatus || live.brittneyAvatarStatus || 'unknown',
    brittneyRuntimeStatus: feeds.brittneyTurn?.summary?.runtimeStatus || 'unknown',
    serviceStatus,
    serviceCount: numeric(services.serviceCount),
    requiredServiceCount: numeric(services.requiredServiceCount),
    requiredOnlineServiceCount: numeric(services.requiredOnlineServiceCount),
    requiredAttentionCount: numeric(services.requiredAttentionCount),
    controlDaemonStatus: services.controlDaemonServiceStatus || live.controlDaemonServiceStatus || 'unknown',
    laneCount: numeric(lanes.laneCount, numeric(live.laneCount)),
    activeLaneCount: numeric(lanes.activeLaneCount, numeric(live.activeLaneCount)),
    readinessStatus,
    readinessTokenCount: numeric(readiness.tokenCount),
    readinessWarningCount: numeric(readiness.warningCount, numeric(live.readinessWarningCount)),
    pendingApprovalCount,
    timelineCount: numeric(live.timelineCount, safeArray(feeds.liveFeed?.timeline).length),
    shellObjectCount: numeric(live.shellObjectCount, numeric(feeds.shellObjects?.summary?.shellObjectCount)),
    nextActionCount: nextActions.length,
    missingReceiptCount: missingReceipts.length,
  };

  const route = {
    primarySurface: 'jetson_holoshell_surface',
    primarySurfaceUrl: 'http://holojetson.local:8747',
    primaryBrain: 'Jetson sovereign local qwen3:4b route when reachable',
    primarySurfaceStatus: feeds.liveFeed ? 'receipt_observed' : 'not_observed',
    laptopRole: 'reasoning_validation_desktop_bridge',
    laptopBridgeStatus: live.desktopBridgeStatus || live.laptopDesktopBridgeStatus || 'check_required',
    laptopBridgeFreshness: live.desktopBridgeFreshness || 'unknown',
    laptopBridgeReceiptAgeMs: live.desktopBridgeReceiptAgeMs ?? null,
    sovereignConsumptionDefault: true,
    providerCloudDependencyAllowed: false,
    vastFleetRole: 'scale_to_zero_on_real_inference_demand',
    paidComputeAtTerminalLaunch: false,
  };

  const commands = buildCommands();
  const routedIntent = selectedIntentRoute(args);
  const sourceAnchors = {
    source: 'apps/holoshell/source/holoshell-operator-terminal.hsplus',
    adapter: 'scripts/holoshell-operator-terminal.mjs',
    launcher: 'scripts/brittney-studio-launch.ps1',
    liveFeed: '.tmp/holoshell/live-feed.json',
    operatorBrief: '.tmp/holoshell/operator-brief.json',
    serviceSupervisor: '.tmp/holoshell/service-supervisor.json',
    agentLanes: '.tmp/holoshell/agent-lanes.json',
    readinessEvidence: '.tmp/holoshell/readiness-evidence.json',
  };

  const caveats = [];
  if (missingReceipts.length) caveats.push(`Missing current receipts: ${missingReceipts.join(', ')}.`);
  if (summary.requiredAttentionCount > 0) caveats.push(`${summary.requiredAttentionCount} required service(s) need attention.`);
  if (summary.readinessWarningCount > 0) caveats.push(`${summary.readinessWarningCount} readiness warning(s) remain.`);
  if (staleReadinessBriefActions(feeds).length) caveats.push('Operator brief has stale readiness-warning guidance; refresh operator brief before acting on that item.');
  if (route.laptopBridgeStatus === 'check_required') caveats.push('Laptop desktop bridge status is not in the latest terminal feed.');
  if (route.laptopBridgeStatus === 'stale') caveats.push(`Laptop desktop bridge status receipt is stale; refresh ${sourceAnchors.liveFeed} after running holoshell:laptop-desktop-bridge -- --status.`);
  if (!caveats.length) caveats.push('No terminal-specific caveats beyond the source receipts.');

  const receiptInput = {
    summary,
    route,
    sourceAnchors,
    hashes,
    missingReceipts,
    nextActions,
    routedIntent,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors,
    route,
    summary,
    commands,
    routedIntent,
    nextActions,
    caveats,
    agentContract: {
      mode: 'agent',
      output: '.tmp/holoshell/operator-terminal.json',
      jsonCommand: 'node scripts/holoshell-operator-terminal.mjs --agent --json',
      requiredBeforeAction: ['operatorBrief', 'serviceSupervisor', 'agentLanes', 'readinessEvidence'],
      missingReceipts,
      sourceReceiptHashes: hashes,
    },
    humanContract: {
      mode: 'human',
      defaultPrompt: 'What do you want Brittney and the agents to help with?',
      hidesDeveloperGrammarByDefault: true,
      labels: commands.human.map((command) => command.label),
      routes: commands.human.map((command) => ({
        label: command.label,
        flowLabel: command.flowLabel,
        permissionEnvelope: command.permissionEnvelope,
        approvalRequired: command.approvalRequired,
      })),
      safeFirst: true,
    },
    safety: {
      readOnlyByDefault: true,
      directMutationAllowed: false,
      rawSecretsIncluded: false,
      rawCommandsIncludedForHuman: false,
      paidComputeAtLaunch: false,
      approvalsRequiredForGuardedExecute: true,
    },
    receipt: {
      terminalHash: sha256(JSON.stringify(receiptInput)),
      sourceReceiptHashes: hashes,
      missingReceipts,
      rawSecretsIncluded: false,
      rawCommandsIncludedForHuman: false,
    },
  };
}

function renderHuman(receipt) {
  const lines = [];
  lines.push('HoloShell Operator Terminal');
  lines.push(`Status: ${receipt.summary.status}`);
  lines.push(`Route: Jetson hosts Brittney at ${receipt.route.primarySurfaceUrl}; laptop bridge ${receipt.route.laptopBridgeStatus}.`);
  lines.push(`Brittney: ${receipt.summary.brittneyStatus} (runtime ${receipt.summary.brittneyRuntimeStatus})`);
  lines.push(`Services: ${receipt.summary.serviceStatus} (${receipt.summary.requiredOnlineServiceCount}/${receipt.summary.requiredServiceCount} required online, ${receipt.summary.requiredAttentionCount} attention)`);
  lines.push(`Agents: ${receipt.summary.activeLaneCount}/${receipt.summary.laneCount} lanes active`);
  lines.push(`Readiness: ${receipt.summary.readinessStatus} (${receipt.summary.readinessWarningCount} warning(s), ${receipt.summary.readinessTokenCount} token(s))`);
  lines.push(`Approvals: ${receipt.summary.pendingApprovalCount} pending | Receipts: ${receipt.summary.timelineCount} timeline item(s)`);
  lines.push('');
  lines.push('Start Here');
  for (const command of receipt.commands.human) {
    lines.push(`  ${command.label}: ${command.meaning} Routes to ${command.flowLabel}.`);
  }
  if (receipt.routedIntent) {
    lines.push('');
    lines.push('Selected Route');
    lines.push(`  ${receipt.routedIntent.human.label}: ${receipt.routedIntent.human.flowLabel}`);
    lines.push(`  Target: ${receipt.routedIntent.human.target}`);
    lines.push(`  Approval: ${receipt.routedIntent.execution.approvalRequiredBeforeMutation ? 'required before mutation' : 'not required for read-only route'}`);
    lines.push(`  Receipt: ${receipt.routedIntent.human.receipt}`);
  }
  lines.push('');
  lines.push('Next');
  receipt.nextActions.slice(0, 5).forEach((action, index) => {
    lines.push(`  ${index + 1}. [${action.priority}] ${action.action}`);
  });
  lines.push('');
  lines.push('Caveats');
  receipt.caveats.forEach((caveat) => lines.push(`  - ${caveat}`));
  lines.push('');
  lines.push('Agent mode: receipt available for automation.');
  lines.push(`Receipt: ${receipt.receipt.terminalHash}`);
  return lines.join('\n');
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.sourceAnchors.source !== 'apps/holoshell/source/holoshell-operator-terminal.hsplus') failures.push('source anchor mismatch');
  if (!receipt.commands.human.find((command) => command.label === 'Ask Brittney')) failures.push('missing Ask Brittney command');
  if (!receipt.commands.human.find((command) => command.label === 'Claim Local Task')) failures.push('missing Claim Local Task command');
  if (!receipt.commands.human.find((command) => command.label === 'Show Receipts')) failures.push('missing Show Receipts command');
  if (receipt.humanContract.labels.join('|') !== HUMAN_LABELS.join('|')) failures.push('human label order changed');
  for (const label of HUMAN_LABELS) {
    const command = receipt.commands.human.find((item) => item.label === label);
    if (!command?.flowLabel) failures.push(`missing human route for ${label}`);
    if (command?.exposesRawCommandByDefault !== false) failures.push(`human route leaks raw command for ${label}`);
    const agentRoute = receipt.commands.routes.find((item) => item.id === command?.id);
    if (!agentRoute?.adapter) failures.push(`missing agent adapter for ${label}`);
  }
  if (!receipt.agentContract.jsonCommand.includes('--agent --json')) failures.push('missing agent JSON command');
  if (receipt.safety.rawSecretsIncluded !== false) failures.push('raw secrets flag must be false');
  if (receipt.safety.rawCommandsIncludedForHuman !== false) failures.push('human raw command flag must be false');
  if (receipt.route.paidComputeAtTerminalLaunch !== false) failures.push('terminal launch must not imply paid compute');
  if (receipt.route.sovereignConsumptionDefault !== true) failures.push('terminal must default to sovereign consumption');
  if (receipt.route.providerCloudDependencyAllowed !== false) failures.push('terminal must not depend on provider cloud');
  if (/ollama cloud|managed-ollama-cloud/i.test(JSON.stringify(receipt))) failures.push('terminal receipt leaked cloud Ollama dependency');
  if (/Jetson Ollama/i.test(JSON.stringify(receipt))) failures.push('terminal receipt should use sovereign local Jetson wording');
  if (!receipt.nextActions.length) failures.push('expected next actions');
  if (!receipt.receipt.terminalHash) failures.push('missing terminal hash');
  const human = renderHuman(receipt);
  if (!human.includes('HoloShell Operator Terminal')) failures.push('human view missing title');
  if (!human.includes('Jetson hosts Brittney')) failures.push('human view missing route');
  if (!human.includes('Agent mode')) failures.push('human view missing agent route');
  if (/pnpm run|node scripts|--agent|--json/.test(human)) failures.push('human view leaked developer grammar');
  const routed = selectedIntentRoute({ intentLabel: 'Ask Brittney', prompt: 'Prepare this computer.' });
  if (routed.human.flow !== 'brittney_turn') failures.push('Ask Brittney did not route to Brittney turn');
  if (routed.execution.performed !== false) failures.push('selected route must not execute downstream adapter');
  const approvals = selectedIntentRoute({ intentLabel: 'Review Approvals', prompt: '' });
  if (approvals.human.flow !== 'approval_review') failures.push('Review Approvals did not route to approval review');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const feeds = args.selfTest ? fixtureFeeds() : loadFeeds(args.tmpDir);
  const receipt = createTerminalReceipt(args, feeds);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBootstrap(args.jsOutput, receipt);
  if (args.selfTest) assertSelfTest(receipt);

  if (args.json || args.mode === 'agent') {
    console.log(JSON.stringify({ ...receipt, output, jsOutput }, null, 2));
  } else {
    console.log(renderHuman(receipt));
    console.log('');
    console.log(`Wrote: ${output}`);
    console.log(`Bootstrap: ${jsOutput}`);
  }
} catch (error) {
  console.error(`holoshell-operator-terminal failed: ${error.message}`);
  process.exit(1);
}
