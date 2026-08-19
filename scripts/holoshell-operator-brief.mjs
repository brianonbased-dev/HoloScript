#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.operator-brief.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_HARDWARE_REALITY = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_RUN_CUSTODY = path.join('.tmp', 'holoshell', 'run-custody.json');
const DEFAULT_BUILD_CUSTODY = path.join('.tmp', 'holoshell', 'build-custody.json');
const DEFAULT_LEGACY_ABSORPTION = path.join('.tmp', 'holoshell', 'legacy-app-absorption.json');
const DEFAULT_LEGACY_WINDOWS = path.join('.tmp', 'holoshell', 'legacy-window-inventory.json');
const DEFAULT_READINESS_EVIDENCE = path.join('.tmp', 'holoshell', 'readiness-evidence.json');
const DEFAULT_VISUAL_WITNESS = path.join('.tmp', 'holoshell', 'visual-witness.json');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'operator-brief.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'operator-brief.js');

function parseArgs(argv) {
  const args = {
    hardwareReality: DEFAULT_HARDWARE_REALITY,
    runCustody: DEFAULT_RUN_CUSTODY,
    buildCustody: DEFAULT_BUILD_CUSTODY,
    legacyAbsorption: DEFAULT_LEGACY_ABSORPTION,
    legacyWindows: DEFAULT_LEGACY_WINDOWS,
    readinessEvidence: DEFAULT_READINESS_EVIDENCE,
    visualWitness: DEFAULT_VISUAL_WITNESS,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--run-custody') args.runCustody = argv[++index];
    else if (arg === '--build-custody') args.buildCustody = argv[++index];
    else if (arg === '--legacy-absorption') args.legacyAbsorption = argv[++index];
    else if (arg === '--legacy-windows') args.legacyWindows = argv[++index];
    else if (arg === '--readiness-evidence') args.readinessEvidence = argv[++index];
    else if (arg === '--visual-witness') args.visualWitness = argv[++index];
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
  return args;
}

function printHelp() {
  console.log(`HoloShell operator brief

Usage:
  node scripts/holoshell-operator-brief.mjs [options]

Options:
  --hardware-reality <path>    Hardware reality JSON.
  --run-custody <path>         Run custody JSON.
  --build-custody <path>       Build custody JSON.
  --legacy-absorption <path>   Legacy absorption JSON.
  --legacy-windows <path>      Legacy window inventory JSON.
  --readiness-evidence <path>  Readiness evidence JSON.
  --visual-witness <path>      Visual witness JSON.
  --output <path>              Output JSON. Default: .tmp/holoshell/operator-brief.json.
  --js-output <path>           Browser bootstrap JS. Default: .tmp/holoshell/operator-brief.js.
  --json                       Print JSON.
  --self-test                  Use synthetic fixtures and assert invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function loadInput(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}. Run holoshell:hardware-reality, holoshell:run-custody, and holoshell:legacy-apps first.`);
  }
  return readJson(resolved);
}

function loadOptionalInput(filePath) {
  const resolved = resolveRepoPath(filePath);
  return existsSync(resolved) ? readJson(resolved) : null;
}

function syntheticInputs() {
  return {
    hardwareReality: {
      generatedAt: '2026-05-14T00:00:00.000Z',
      summary: {
        riskState: 'warn',
        processCount: 10,
        shellRunCount: 2,
        activeLaneCount: 2,
        laneCount: 2,
        legacyAppCount: 3,
        terminationPreflightCount: 5,
      },
      safety: { destructiveActionsTaken: false, preflightRequiredForTermination: true },
      receipt: { snapshotHash: 'hardware-fixture', destructiveActionsTaken: false },
      recommendations: [{ kind: 'preflight_before_mutation', text: 'Use preflight tools.' }],
      shellRuns: [
        { runId: 'pid-202', pid: 202, parentPid: 909, processName: 'node.exe', healthState: 'listening', listeningPorts: [4747], commandHash: 'node-fixture-command', rawCommandHidden: true },
        { runId: 'pid-404', pid: 404, parentPid: 909, processName: 'pwsh.exe', healthState: 'observed', listeningPorts: [], commandHash: 'pwsh-fixture-command', ownerLaneId: 'codex', ownerLaneLabel: 'Codex', ownerSurfaceKind: 'codex', ownerEvidence: 'parent_pid', rawCommandHidden: true },
      ],
    },
    runCustody: {
      summary: {
        observedRunCount: 2,
        claimedRunCount: 1,
        observedOwnerCount: 0,
        ownerUnknownCount: 1,
        staleRunCount: 0,
        closedRunCount: 0,
      },
      safety: { destructiveActionsTaken: false, rawCommandsIncluded: false },
      runs: [
        { runId: 'pid-202', pid: 202, parentPid: 909, processName: 'node.exe', status: 'owner_unknown', listeningPorts: [4747], commandHash: 'node-fixture-command', rawCommandHidden: true },
        { runId: 'pid-404', pid: 404, parentPid: 909, processName: 'pwsh.exe', status: 'lane_observed', laneId: 'codex', laneLabel: 'Codex', agentKind: 'codex', ownerEvidence: 'parent_pid', listeningPorts: [], commandHash: 'pwsh-fixture-command', rawCommandHidden: true },
      ],
      recommendations: [{ action: 'claim', runId: 'pid-404', reason: 'Owner unknown.' }],
      brittneyBrief: {
        status: 'needs_triage',
        requiredNextAction: 'claim pid-404',
        blockedActions: ['kill_process', 'delete_file'],
      },
      receipt: { custodyHash: 'custody-fixture' },
    },
    buildCustody: {
      summary: {
        riskState: 'pass',
        processCount: 12,
        buildProcessCount: 4,
        activeBuildCount: 4,
        activeBuildTreeCount: 1,
        buildTreeCount: 1,
        longRunningBuildCount: 0,
        highMemoryBuildCount: 0,
        reviewRequiredCount: 0,
        rawCommandsIncluded: false,
      },
      buildTrees: [
        { treeId: 'build-tree-100', rootPid: 100, status: 'active', processCount: 4, totalMemoryMb: 460, processPids: [100, 101, 102, 103] },
      ],
      buildProcesses: [
        { pid: 100, ppid: 10, name: 'pwsh.exe', buildKind: 'pnpm_build', commandHash: 'build-fixture-command', rawCommandHidden: true, custodyState: 'active_build' },
      ],
      brittneyBrief: {
        status: 'active_builds_visible',
        requiredNextAction: '1 active build tree visible; observe custody and do not terminate without break-glass approval.',
        blockedActions: ['kill_build_process', 'stop_build_tree'],
        custodySummary: '4 build process(es) across 1 tree(s); 0 long-running; 0 high-memory.',
      },
      safety: { destructiveActionsTaken: false, rawCommandsIncluded: false, processTerminationAllowed: false },
      receipt: { buildCustodyHash: 'build-custody-fixture', rawCommandsIncluded: false },
    },
    legacyAbsorption: {
      summary: {
        observedAppCount: 3,
        visibleWindowCount: 5,
        peerSurfaceCount: 2,
        peerWindowCount: 2,
        aiPeerSurfaceCount: 2,
        aiPeerWindowCount: 2,
        shellSurfaceCount: 1,
        shellWindowCount: 1,
        operatingSurfaceCount: 3,
        operatingSurfaceWindowCount: 3,
        appGroupCount: 2,
        captureCandidateCount: 2,
        preflightRequiredCount: 2,
        mutationAllowedCount: 0,
      },
      safety: { destructiveActionsTaken: false, preflightRequiredForMutation: true },
      recommendations: [{ action: 'capture_browser_surface', appName: 'msedge', reason: 'High-value surface.' }],
      brittneyBrief: {
        status: 'legacy_surfaces_visible',
        requiredNextAction: 'capture_browser_surface for msedge',
        blockedActions: ['alter_registry', 'click_destructive_ui'],
      },
      receipt: { absorptionHash: 'legacy-fixture' },
    },
    legacyWindows: {
      summary: {
        visibleWindowCount: 5,
        peerSurfaceCount: 2,
        peerWindowCount: 2,
        aiPeerSurfaceCount: 2,
        aiPeerWindowCount: 2,
        shellSurfaceCount: 1,
        shellWindowCount: 1,
        operatingSurfaceCount: 3,
        operatingSurfaceWindowCount: 3,
        legacyWindowCount: 2,
        rawWindowTitlesIncluded: false,
      },
      peerSurfaces: [
        { laneId: 'codex', label: 'Codex', windowInstanceCount: 1, processCount: 1 },
        { laneId: 'claude', label: 'Claude', windowInstanceCount: 1, processCount: 1 },
      ],
      shellSurfaces: [
        { laneId: 'terminal', label: 'Terminal', peerKind: 'shell', surfaceClass: 'shell_surface', windowInstanceCount: 1, processCount: 1, pids: [909], sampleWindowIds: ['window-terminal'] },
      ],
      operatingSurfaces: [
        { laneId: 'codex', label: 'Codex', peerKind: 'agent', surfaceClass: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1 },
        { laneId: 'claude', label: 'Claude', peerKind: 'agent', surfaceClass: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1 },
        { laneId: 'terminal', label: 'Terminal', peerKind: 'shell', surfaceClass: 'shell_surface', windowInstanceCount: 1, processCount: 1 },
      ],
      windows: [
        { windowId: 'window-terminal', pid: 909, appName: 'terminal', appLabel: 'Terminal', archetype: 'shell_surface', titleLabel: 'shell_window', rawTitleHidden: true },
        { windowId: 'window-codex', pid: 101, appName: 'codex', appLabel: 'Codex', archetype: 'ai_peer_surface', titleLabel: 'codex_home', rawTitleHidden: true },
      ],
      brittneyBrief: {
        status: 'legacy_windows_visible',
        requiredNextAction: 'Use AI peer window counts separately from shell surface counts before trusting PID lane counts.',
        peerWindowSummary: 'Codex:1, Claude:1',
        shellWindowSummary: 'Terminal:1',
        blockedActions: ['close_window', 'click_destructive_ui'],
      },
      safety: { destructiveActionsTaken: false, rawWindowTitlesIncluded: false },
      receipt: { windowInventoryHash: 'window-fixture', rawWindowTitlesIncluded: false },
    },
    readinessEvidence: {
      summary: {
        status: 'ready',
        tokenCount: 8,
        warningCount: 0,
        buildStatus: 'passed',
        graphStatus: 'ok',
        nextWorkflow: 'holoshell_operating_turn',
      },
      tokens: [
        { tokenId: 'readiness.build', status: 'passed', label: 'Build evidence' },
        { tokenId: 'readiness.webgpu', status: 'available', label: 'WebGPU evidence' },
      ],
      receipt: { readinessHash: 'readiness-fixture' },
    },
    visualWitness: {
      status: 'pass',
      screenshot: { path: '.tmp/holoshell/hardware-reality-room.png' },
      receipt: { witnessHash: 'witness-fixture' },
      safety: { destructiveActionsTaken: false },
    },
  };
}

function loadInputs(args) {
  if (args.selfTest) return syntheticInputs();
  return {
    hardwareReality: loadInput(args.hardwareReality, 'hardware reality'),
    runCustody: loadInput(args.runCustody, 'run custody'),
    buildCustody: loadOptionalInput(args.buildCustody) || {
      summary: {
        riskState: 'unknown',
        processCount: 0,
        buildProcessCount: 0,
        activeBuildCount: 0,
        activeBuildTreeCount: 0,
        buildTreeCount: 0,
        longRunningBuildCount: 0,
        highMemoryBuildCount: 0,
        reviewRequiredCount: 0,
        rawCommandsIncluded: false,
      },
      buildTrees: [],
      buildProcesses: [],
      brittneyBrief: {
        status: 'build_custody_missing',
        requiredNextAction: 'Run holoshell:build-custody before trusting active build state.',
        blockedActions: ['kill_build_process', 'stop_build_tree'],
        custodySummary: 'build custody missing',
      },
      safety: { destructiveActionsTaken: false, rawCommandsIncluded: false, processTerminationAllowed: false },
      receipt: { buildCustodyHash: null, rawCommandsIncluded: false },
    },
    legacyAbsorption: loadInput(args.legacyAbsorption, 'legacy absorption'),
    legacyWindows: loadOptionalInput(args.legacyWindows) || {
      summary: {
        visibleWindowCount: 0,
        peerSurfaceCount: 0,
        peerWindowCount: 0,
        aiPeerSurfaceCount: 0,
        aiPeerWindowCount: 0,
        shellSurfaceCount: 0,
        shellWindowCount: 0,
        operatingSurfaceCount: 0,
        operatingSurfaceWindowCount: 0,
        rawWindowTitlesIncluded: false,
      },
      peerSurfaces: [],
      shellSurfaces: [],
      operatingSurfaces: [],
      brittneyBrief: {
        status: 'window_inventory_missing',
        requiredNextAction: 'Run holoshell:legacy-windows before trusting peer instance counts.',
        peerWindowSummary: 'window inventory missing',
        shellWindowSummary: 'window inventory missing',
        blockedActions: ['close_window', 'click_destructive_ui'],
      },
      safety: { destructiveActionsTaken: false, rawWindowTitlesIncluded: false },
      receipt: { windowInventoryHash: null, rawWindowTitlesIncluded: false },
    },
    readinessEvidence: loadOptionalInput(args.readinessEvidence) || {
      summary: {
        status: 'missing',
        tokenCount: 0,
        warningCount: 0,
        buildStatus: 'unknown',
        graphStatus: 'unknown',
        nextWorkflow: 'run holoshell:readiness-evidence',
      },
      tokens: [],
      receipt: { readinessHash: null },
    },
    visualWitness: loadOptionalInput(args.visualWitness) || {
      status: 'missing',
      screenshot: null,
      receipt: { witnessHash: null },
      safety: { destructiveActionsTaken: false },
    },
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function runCustodyById(runCustody) {
  return new Map(safeArray(runCustody.runs).map((run) => [run.runId || `pid-${run.pid}`, run]));
}

function normalizeShellRun(hardwareRun, custodyRun = {}) {
  const runId = hardwareRun.runId || custodyRun.runId || `pid-${hardwareRun.pid || custodyRun.pid}`;
  return {
    runId,
    pid: numericOrNull(hardwareRun.pid ?? custodyRun.pid),
    parentPid: numericOrNull(hardwareRun.parentPid ?? custodyRun.parentPid),
    processName: hardwareRun.processName || custodyRun.processName || 'process',
    healthState: hardwareRun.healthState || custodyRun.healthState || 'observed',
    listeningPorts: safeArray(hardwareRun.listeningPorts?.length ? hardwareRun.listeningPorts : custodyRun.listeningPorts),
    status: custodyRun.status || (hardwareRun.ownerLaneId ? 'lane_observed' : 'owner_unknown'),
    laneId: custodyRun.laneId || hardwareRun.ownerLaneId || null,
    laneLabel: custodyRun.laneLabel || hardwareRun.ownerLaneLabel || null,
    agentKind: custodyRun.agentKind || hardwareRun.ownerSurfaceKind || null,
    ownerEvidence: custodyRun.ownerEvidence || hardwareRun.ownerEvidence || null,
    ownerTrustState: custodyRun.ownerTrustState || hardwareRun.ownerTrustState || null,
    commandHash: custodyRun.commandHash || hardwareRun.commandHash || null,
    rawCommandHidden: true,
  };
}

function shellRunsForCustody(inputs) {
  const custody = runCustodyById(inputs.runCustody);
  const byId = new Map();
  for (const hardwareRun of safeArray(inputs.hardwareReality.shellRuns)) {
    const runId = hardwareRun.runId || `pid-${hardwareRun.pid}`;
    byId.set(runId, normalizeShellRun(hardwareRun, custody.get(runId) || {}));
  }
  for (const custodyRun of safeArray(inputs.runCustody.runs)) {
    const runId = custodyRun.runId || `pid-${custodyRun.pid}`;
    if (!byId.has(runId)) byId.set(runId, normalizeShellRun({}, custodyRun));
  }
  return [...byId.values()].filter((run) => Number.isInteger(run.pid));
}

function shellWindowsForCustody(legacyWindows) {
  return safeArray(legacyWindows.windows)
    .filter((window) => window.archetype === 'shell_surface' || window.appName === 'terminal')
    .map((window) => ({
      windowId: window.windowId,
      pid: numericOrNull(window.pid),
      appName: window.appName,
      label: window.appLabel || 'Terminal',
      titleLabel: window.titleLabel || 'shell_window',
      rawTitleHidden: true,
    }))
    .filter((window) => window.windowId && Number.isInteger(window.pid));
}

function statusForShellWindow(runs) {
  if (!runs.length) return 'window_unbound';
  if (runs.some((run) => run.status === 'owner_unknown')) return 'needs_run_custody';
  if (runs.some((run) => run.status === 'stale')) return 'stale_run_visible';
  if (runs.some((run) => run.status === 'claimed')) return 'claimed';
  if (runs.some((run) => run.status === 'lane_observed')) return 'lane_observed';
  return runs[0].status || 'observed';
}

function buildShellWindowCustody(inputs) {
  const windows = shellWindowsForCustody(inputs.legacyWindows);
  const runs = shellRunsForCustody(inputs);
  const runsByParentPid = new Map();
  const runsByPid = new Map();
  for (const run of runs) {
    if (Number.isInteger(run.parentPid)) {
      if (!runsByParentPid.has(run.parentPid)) runsByParentPid.set(run.parentPid, []);
      runsByParentPid.get(run.parentPid).push(run);
    }
    if (Number.isInteger(run.pid)) {
      if (!runsByPid.has(run.pid)) runsByPid.set(run.pid, []);
      runsByPid.get(run.pid).push(run);
    }
  }

  const windowBindings = windows.map((window) => {
    const directRuns = runsByPid.get(window.pid) || [];
    const childRuns = runsByParentPid.get(window.pid) || [];
    const boundRuns = [...new Map([...directRuns, ...childRuns].map((run) => [run.runId, run])).values()];
    const ownerUnknownRunCount = boundRuns.filter((run) => run.status === 'owner_unknown').length;
    const laneObservedRunCount = boundRuns.filter((run) => run.status === 'lane_observed').length;
    const claimedRunCount = boundRuns.filter((run) => run.status === 'claimed').length;
    return {
      windowId: window.windowId,
      pid: window.pid,
      label: window.label,
      titleLabel: window.titleLabel,
      status: statusForShellWindow(boundRuns),
      bindingEvidence: boundRuns.length
        ? childRuns.length ? 'parent_pid' : 'direct_pid'
        : 'no_matching_shell_run',
      boundRunCount: boundRuns.length,
      ownerUnknownRunCount,
      laneObservedRunCount,
      claimedRunCount,
      laneIds: unique(boundRuns.map((run) => run.laneId)),
      runs: boundRuns.slice(0, 12).map((run) => ({
        runId: run.runId,
        pid: run.pid,
        parentPid: run.parentPid,
        processName: run.processName,
        status: run.status,
        laneId: run.laneId,
        laneLabel: run.laneLabel,
        agentKind: run.agentKind,
        ownerEvidence: run.ownerEvidence,
        listeningPorts: run.listeningPorts,
        rawCommandHidden: true,
      })),
      rawTitleHidden: true,
      receiptRequired: true,
    };
  });

  const boundRunIds = new Set(windowBindings.flatMap((window) => window.runs.map((run) => run.runId)));
  const unboundRuns = runs.filter((run) => !boundRunIds.has(run.runId));
  const boundRuns = runs.filter((run) => boundRunIds.has(run.runId));
  const ownerUnknownRunCount = boundRuns.filter((run) => run.status === 'owner_unknown').length;
  const laneObservedRunCount = boundRuns.filter((run) => run.status === 'lane_observed').length;
  const claimedRunCount = boundRuns.filter((run) => run.status === 'claimed').length;

  return {
    source: 'legacy_window_inventory + hardware_reality + run_custody',
    windowCount: windowBindings.length,
    boundWindowCount: windowBindings.filter((window) => window.boundRunCount > 0).length,
    unboundWindowCount: windowBindings.filter((window) => window.boundRunCount === 0).length,
    boundRunCount: boundRunIds.size,
    windowRunAttachmentCount: windowBindings.reduce((sum, window) => sum + window.boundRunCount, 0),
    unboundRunCount: unboundRuns.length,
    ownerUnknownRunCount,
    laneObservedRunCount,
    claimedRunCount,
    windows: windowBindings,
    unboundRuns: unboundRuns.slice(0, 12).map((run) => ({
      runId: run.runId,
      pid: run.pid,
      parentPid: run.parentPid,
      processName: run.processName,
      status: run.status,
      laneId: run.laneId,
      ownerEvidence: run.ownerEvidence,
      rawCommandHidden: true,
    })),
    rawWindowTitlesIncluded: false,
    rawCommandsIncluded: false,
  };
}

function statusFor({ hardwareReality, runCustody, buildCustody, legacyAbsorption, readinessEvidence }) {
  if (hardwareReality.summary?.riskState === 'critical') return 'critical_triage';
  if (buildCustody.summary?.riskState === 'critical') return 'build_custody_review';
  if ((runCustody.summary?.ownerUnknownCount || 0) > 0) return 'needs_run_custody';
  if ((buildCustody.summary?.reviewRequiredCount || 0) > 0) return 'build_custody_review';
  if ((legacyAbsorption.summary?.captureCandidateCount || 0) > 0) return 'legacy_absorption_ready';
  if (readinessEvidence.summary?.status === 'missing') return 'readiness_missing';
  if (hardwareReality.summary?.riskState === 'warn') return 'hardware_warn';
  return 'ready';
}

function buildNextActions({ hardwareReality, runCustody, buildCustody, legacyAbsorption, legacyWindows, shellWindowCustody, readinessEvidence, visualWitness }) {
  const actions = [];
  if ((buildCustody.summary?.activeBuildTreeCount || 0) > 0 || buildCustody.brittneyBrief?.status === 'build_custody_missing') {
    actions.push({
      source: 'build_custody',
      priority: (buildCustody.summary?.reviewRequiredCount || 0) > 0 ? 'high' : 'medium',
      action: buildCustody.brittneyBrief?.requiredNextAction || 'Refresh active build custody.',
    });
  }
  if (runCustody.brittneyBrief?.requiredNextAction && runCustody.brittneyBrief?.status !== 'ready') {
    actions.push({
      source: 'run_custody',
      priority: (runCustody.summary?.ownerUnknownCount || 0) > 0 ? 'high' : 'medium',
      action: runCustody.brittneyBrief.requiredNextAction,
    });
  }
  if (legacyWindows.brittneyBrief?.requiredNextAction
    && legacyWindows.brittneyBrief?.status !== 'legacy_windows_visible'
    && (legacyWindows.summary?.peerWindowCount || 0) > 0) {
    actions.push({
      source: 'legacy_windows',
      priority: 'high',
      action: legacyWindows.brittneyBrief.requiredNextAction,
    });
  }
  if ((shellWindowCustody?.ownerUnknownRunCount || 0) > 0) {
    const firstWindow = shellWindowCustody.windows.find((window) => window.ownerUnknownRunCount > 0);
    actions.push({
      source: 'shell_window_custody',
      priority: 'high',
      action: `${shellWindowCustody.ownerUnknownRunCount} visible shell-window run(s) need custody${firstWindow ? ` under ${firstWindow.windowId}` : ''}.`,
    });
  }
  if (legacyAbsorption.brittneyBrief?.requiredNextAction) {
    actions.push({
      source: 'legacy_absorption',
      priority: 'medium',
      action: legacyAbsorption.brittneyBrief.requiredNextAction,
    });
  }
  if (readinessEvidence.summary?.status === 'missing' || (readinessEvidence.summary?.warningCount || 0) > 0) {
    actions.push({
      source: 'readiness_evidence',
      priority: readinessEvidence.summary?.status === 'missing' ? 'medium' : 'high',
      action: readinessEvidence.summary?.status === 'missing'
        ? 'Run readiness evidence ingestion before claiming full hardware readiness.'
        : `${readinessEvidence.summary.warningCount} readiness warning(s) need review.`,
    });
  }
  if (visualWitness.status && !['pass', 'ready'].includes(visualWitness.status)) {
    actions.push({
      source: 'visual_witness',
      priority: visualWitness.status === 'missing' ? 'medium' : 'high',
      action: 'Refresh the HoloShell visual witness so the room state is grounded in a screenshot.',
    });
  }
  for (const recommendation of safeArray(hardwareReality.recommendations).slice(0, 3)) {
    actions.push({
      source: 'hardware_reality',
      priority: recommendation.severity || 'medium',
      action: recommendation.text || recommendation.kind,
    });
  }
  return actions.slice(0, 8);
}

function createBrief(inputs) {
  const { hardwareReality, runCustody, buildCustody, legacyAbsorption, legacyWindows, readinessEvidence, visualWitness } = inputs;
  const shellWindowCustody = buildShellWindowCustody(inputs);
  const aiPeerWindowCount = legacyWindows.summary?.aiPeerWindowCount ?? legacyWindows.summary?.peerWindowCount ?? 0;
  const aiPeerSurfaceCount = legacyWindows.summary?.aiPeerSurfaceCount ?? legacyWindows.summary?.peerSurfaceCount ?? 0;
  const shellWindowCount = legacyWindows.summary?.shellWindowCount || 0;
  const shellSurfaceCount = legacyWindows.summary?.shellSurfaceCount || 0;
  const operatingSurfaceWindowCount = legacyWindows.summary?.operatingSurfaceWindowCount ?? aiPeerWindowCount + shellWindowCount;
  const operatingSurfaceCount = legacyWindows.summary?.operatingSurfaceCount ?? aiPeerSurfaceCount + shellSurfaceCount;
  const blockedActions = unique([
    ...safeArray(runCustody.brittneyBrief?.blockedActions),
    ...safeArray(buildCustody.brittneyBrief?.blockedActions),
    ...safeArray(legacyAbsorption.brittneyBrief?.blockedActions),
    ...safeArray(legacyWindows.brittneyBrief?.blockedActions),
    'kill_process',
    'kill_build_process',
    'delete_file',
    'legacy_app_mutation',
    'registry_change',
    'destructive_ui_click',
  ]);
  const allowedActions = unique([
    'observe_hardware',
    'claim_run',
    'extend_run',
    'close_run_receipt',
    'mark_run_stale',
    'observe_build',
    'refresh_build_custody',
    'capture_window',
    'map_visible_controls',
    'summarize_visible_state',
    'ingest_readiness_evidence',
    'capture_visual_witness',
  ]);
  const nextActions = buildNextActions({ ...inputs, shellWindowCustody });
  const safety = {
    destructiveActionsTaken: Boolean(
      hardwareReality.safety?.destructiveActionsTaken
        || runCustody.safety?.destructiveActionsTaken
        || buildCustody.safety?.destructiveActionsTaken
        || legacyAbsorption.safety?.destructiveActionsTaken
        || legacyWindows.safety?.destructiveActionsTaken
        || visualWitness.safety?.destructiveActionsTaken
    ),
    rawCommandsIncluded: Boolean(
      hardwareReality.receipt?.rawCommandsIncluded
      || runCustody.safety?.rawCommandsIncluded
      || buildCustody.safety?.rawCommandsIncluded
      || legacyAbsorption.safety?.rawCommandsIncluded
    ),
    preflightRequiredForTermination: Boolean(hardwareReality.safety?.preflightRequiredForTermination),
    preflightRequiredForLegacyMutation: Boolean(legacyAbsorption.safety?.preflightRequiredForMutation),
    rawWindowTitlesIncluded: Boolean(legacyWindows.safety?.rawWindowTitlesIncluded || legacyWindows.receipt?.rawWindowTitlesIncluded),
  };
  const brief = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-operator-brief.hsplus',
      adapter: 'scripts/holoshell-operator-brief.mjs',
      hardwareReality: 'scripts/holoshell-hardware-reality-bridge.mjs',
      runCustody: 'scripts/holoshell-run-custody-actions.mjs',
      buildCustody: 'scripts/holoshell-build-custody.mjs',
      legacyAbsorption: 'scripts/holoshell-legacy-app-absorption.mjs',
      legacyWindows: 'scripts/holoshell-legacy-window-inventory.mjs',
      readinessEvidence: 'scripts/holoshell-readiness-evidence.mjs',
      visualWitness: 'scripts/holoshell-visual-witness.mjs',
    },
    status: statusFor(inputs),
    hardware: {
      riskState: hardwareReality.summary?.riskState || 'unknown',
      processCount: hardwareReality.summary?.processCount || 0,
      shellRunCount: hardwareReality.summary?.shellRunCount || 0,
      activeLaneCount: hardwareReality.summary?.activeLaneCount || 0,
      laneCount: hardwareReality.summary?.laneCount || 0,
      legacyAppCount: hardwareReality.summary?.legacyAppCount || 0,
      terminationPreflightCount: hardwareReality.summary?.terminationPreflightCount || 0,
      snapshotHash: hardwareReality.receipt?.snapshotHash || null,
    },
    runs: {
      observedRunCount: runCustody.summary?.observedRunCount || 0,
      claimedRunCount: runCustody.summary?.claimedRunCount || 0,
      observedOwnerCount: runCustody.summary?.observedOwnerCount || 0,
      ownerUnknownCount: runCustody.summary?.ownerUnknownCount || 0,
      staleRunCount: runCustody.summary?.staleRunCount || 0,
      closedRunCount: runCustody.summary?.closedRunCount || 0,
      custodyHash: runCustody.receipt?.custodyHash || null,
    },
    build: {
      riskState: buildCustody.summary?.riskState || 'unknown',
      processCount: buildCustody.summary?.processCount || 0,
      buildProcessCount: buildCustody.summary?.buildProcessCount || 0,
      activeBuildCount: buildCustody.summary?.activeBuildCount || 0,
      activeBuildTreeCount: buildCustody.summary?.activeBuildTreeCount || 0,
      buildTreeCount: buildCustody.summary?.buildTreeCount || 0,
      longRunningBuildCount: buildCustody.summary?.longRunningBuildCount || 0,
      highMemoryBuildCount: buildCustody.summary?.highMemoryBuildCount || 0,
      reviewRequiredCount: buildCustody.summary?.reviewRequiredCount || 0,
      topBuildTreeId: safeArray(buildCustody.buildTrees)[0]?.treeId || null,
      topBuildTreeStatus: safeArray(buildCustody.buildTrees)[0]?.status || null,
      buildCustodyHash: buildCustody.receipt?.buildCustodyHash || null,
    },
    legacy: {
      observedAppCount: legacyAbsorption.summary?.observedAppCount || 0,
      visibleWindowCount: legacyAbsorption.summary?.visibleWindowCount || legacyWindows.summary?.visibleWindowCount || 0,
      peerSurfaceCount: legacyAbsorption.summary?.aiPeerSurfaceCount ?? legacyAbsorption.summary?.peerSurfaceCount ?? aiPeerSurfaceCount,
      peerWindowCount: legacyAbsorption.summary?.aiPeerWindowCount ?? legacyAbsorption.summary?.peerWindowCount ?? aiPeerWindowCount,
      aiPeerSurfaceCount,
      aiPeerWindowCount,
      shellSurfaceCount: legacyAbsorption.summary?.shellSurfaceCount ?? shellSurfaceCount,
      shellWindowCount: legacyAbsorption.summary?.shellWindowCount ?? shellWindowCount,
      operatingSurfaceCount: legacyAbsorption.summary?.operatingSurfaceCount ?? operatingSurfaceCount,
      operatingSurfaceWindowCount: legacyAbsorption.summary?.operatingSurfaceWindowCount ?? operatingSurfaceWindowCount,
      appGroupCount: legacyAbsorption.summary?.appGroupCount || 0,
      captureCandidateCount: legacyAbsorption.summary?.captureCandidateCount || 0,
      preflightRequiredCount: legacyAbsorption.summary?.preflightRequiredCount || 0,
      mutationAllowedCount: legacyAbsorption.summary?.mutationAllowedCount || 0,
      absorptionHash: legacyAbsorption.receipt?.absorptionHash || null,
      windowInventoryHash: legacyWindows.receipt?.windowInventoryHash || null,
      shellWindowBoundCount: shellWindowCustody.boundWindowCount,
      shellWindowUnboundCount: shellWindowCustody.unboundWindowCount,
      shellWindowOwnerUnknownRunCount: shellWindowCustody.ownerUnknownRunCount,
    },
    peers: {
      source: 'legacy_window_inventory',
      windowInstanceCount: aiPeerWindowCount,
      surfaceCount: aiPeerSurfaceCount,
      aiWindowInstanceCount: aiPeerWindowCount,
      aiSurfaceCount: aiPeerSurfaceCount,
      shellWindowInstanceCount: shellWindowCount,
      shellSurfaceCount,
      operatingSurfaceWindowCount,
      operatingSurfaceCount,
      rawWindowTitlesIncluded: Boolean(legacyWindows.summary?.rawWindowTitlesIncluded),
      surfaces: safeArray(legacyWindows.peerSurfaces).map((peer) => ({
        laneId: peer.laneId,
        label: peer.label,
        peerKind: peer.peerKind,
        windowInstanceCount: peer.windowInstanceCount || 0,
        processCount: peer.processCount || 0,
        evidence: peer.evidence || 'top_level_windows',
      })),
      shellSurfaces: safeArray(legacyWindows.shellSurfaces).map((surface) => ({
        laneId: surface.laneId,
        label: surface.label,
        peerKind: surface.peerKind,
        surfaceClass: surface.surfaceClass || 'shell_surface',
        windowInstanceCount: surface.windowInstanceCount || 0,
        processCount: surface.processCount || 0,
        evidence: surface.evidence || 'top_level_windows',
      })),
    },
    shellCustody: shellWindowCustody,
    readiness: {
      status: readinessEvidence.summary?.status || readinessEvidence.status || 'unknown',
      tokenCount: readinessEvidence.summary?.tokenCount || 0,
      warningCount: readinessEvidence.summary?.warningCount || 0,
      buildStatus: readinessEvidence.summary?.buildStatus || 'unknown',
      graphStatus: readinessEvidence.summary?.graphStatus || 'unknown',
      nextWorkflow: readinessEvidence.summary?.nextWorkflow || null,
      readinessHash: readinessEvidence.receipt?.readinessHash || readinessEvidence.readinessId || null,
    },
    visualWitness: {
      status: visualWitness.status || 'unknown',
      screenshotPath: visualWitness.screenshot?.path || null,
      witnessHash: visualWitness.receipt?.witnessHash || visualWitness.receipt?.visualWitnessHash || null,
    },
    allowedActions,
    blockedActions,
    nextActions,
    brittneyPromptCard: {
      role: 'local_hardware_operator',
      instruction: 'Use this brief before proposing shell, process, file, or legacy-app actions. Prefer read-only observation and custody receipts. Route destructive work through HoloShell MCP preflights.',
      mustNot: blockedActions,
      firstMove: nextActions[0]?.action || 'Continue read-only observation.',
      peerWindowSummary: legacyWindows.brittneyBrief?.peerWindowSummary || safeArray(legacyWindows.peerSurfaces).map((peer) => `${peer.label}:${peer.windowInstanceCount}`).join(', ') || 'no peer windows',
      shellWindowSummary: legacyWindows.brittneyBrief?.shellWindowSummary || safeArray(legacyWindows.shellSurfaces).map((surface) => `${surface.label}:${surface.windowInstanceCount}`).join(', ') || 'no shell windows',
      shellCustodySummary: `${shellWindowCustody.boundWindowCount}/${shellWindowCustody.windowCount} shell window(s) bound to ${shellWindowCustody.boundRunCount} run(s); ${shellWindowCustody.ownerUnknownRunCount} bound run(s) need custody.`,
      buildCustodySummary: buildCustody.brittneyBrief?.custodySummary || `${buildCustody.summary?.buildProcessCount || 0} build process(es).`,
      readinessSummary: `${readinessEvidence.summary?.status || 'unknown'} / ${readinessEvidence.summary?.tokenCount || 0} token(s) / ${readinessEvidence.summary?.warningCount || 0} warning(s).`,
      visualWitnessSummary: `${visualWitness.status || 'unknown'}${visualWitness.screenshot?.path ? ' / screenshot ready' : ''}.`,
    },
    agentConsumption: {
      rest: '.tmp/holoshell/operator-brief.json',
      browserBootstrap: '.tmp/holoshell/operator-brief.js',
      requiredRefreshOrder: [
        'pnpm run holoshell:hardware-reality',
        'pnpm run holoshell:build-custody',
        'pnpm run holoshell:run-custody',
        'pnpm run holoshell:legacy-windows',
        'pnpm run holoshell:legacy-apps',
        'pnpm run holoshell:readiness-evidence',
        'pnpm run holoshell:operator-brief',
      ],
    },
    safety,
  };
  return {
    ...brief,
    receipt: {
      briefHash: sha256(JSON.stringify({
        status: brief.status,
        hardware: brief.hardware,
        runs: brief.runs,
        build: brief.build,
        legacy: brief.legacy,
        peers: brief.peers,
        shellCustody: brief.shellCustody,
        readiness: brief.readiness,
        visualWitness: brief.visualWitness,
        blockedActions,
        safety,
      })),
      destructiveActionsTaken: safety.destructiveActionsTaken,
      rawCommandsIncluded: safety.rawCommandsIncluded,
      rawWindowTitlesIncluded: safety.rawWindowTitlesIncluded,
    },
  };
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
  writeFileSync(resolved, `window.HOLOSHELL_OPERATOR_BRIEF = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(brief) {
  const failures = [];
  if (brief.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!brief.blockedActions.includes('kill_process')) failures.push('kill_process must be blocked');
  if (!brief.blockedActions.includes('legacy_app_mutation')) failures.push('legacy_app_mutation must be blocked');
  if (!brief.allowedActions.includes('claim_run')) failures.push('claim_run should be allowed');
  if (brief.peers.windowInstanceCount < 2) failures.push('expected synthetic peer window instances');
  if (brief.peers.shellWindowInstanceCount < 1) failures.push('expected synthetic shell window instances');
  if (brief.peers.operatingSurfaceWindowCount < 3) failures.push('expected synthetic operating surface windows');
  if (brief.shellCustody.boundWindowCount < 1) failures.push('expected shell window custody binding');
  if (brief.shellCustody.ownerUnknownRunCount < 1) failures.push('expected unknown run under shell window');
  if (brief.build.activeBuildTreeCount < 1) failures.push('expected synthetic active build tree');
  if (!brief.blockedActions.includes('kill_build_process')) failures.push('kill_build_process must be blocked');
  if (brief.readiness.tokenCount < 1) failures.push('expected readiness evidence tokens');
  if (brief.visualWitness.status !== 'pass') failures.push('expected visual witness pass');
  if (!brief.nextActions.length) failures.push('expected next action');
  if (brief.safety.destructiveActionsTaken !== false) failures.push('destructive actions must be false');
  if (brief.safety.rawCommandsIncluded !== false) failures.push('raw commands must be hidden');
  if (brief.safety.rawWindowTitlesIncluded !== false) failures.push('raw window titles must be hidden');
  if (!brief.receipt.briefHash) failures.push('missing brief hash');
  const serialized = JSON.stringify(brief);
  if (/commandLine|CommandLine|command_summary/.test(serialized)) failures.push('raw command text leaked');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest && args.output === DEFAULT_OUTPUT) {
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'operator-brief.json');
  }
  if (args.selfTest && args.jsOutput === DEFAULT_JS_OUTPUT) {
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'operator-brief.js');
  }
  const inputs = loadInputs(args);
  const brief = createBrief(inputs);
  if (args.selfTest) assertSelfTest(brief);
  const output = writeJson(args.output, brief);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, brief);

  if (args.json) {
    console.log(JSON.stringify(brief, null, 2));
  } else {
    console.log(`HoloShell operator brief: ${output}`);
    console.log(`HoloShell operator brief browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${brief.status}`);
    console.log(`Hardware risk: ${brief.hardware.riskState}`);
    console.log(`Owner unknown runs: ${brief.runs.ownerUnknownCount}`);
    console.log(`Active build trees: ${brief.build.activeBuildTreeCount}`);
    console.log(`AI peer windows: ${brief.peers.windowInstanceCount}`);
    console.log(`Shell windows: ${brief.peers.shellWindowInstanceCount}`);
    console.log(`Shell window bindings: ${brief.shellCustody.boundWindowCount}/${brief.shellCustody.windowCount}`);
    console.log(`Shell-window unknown runs: ${brief.shellCustody.ownerUnknownRunCount}`);
    console.log(`Readiness: ${brief.readiness.status}`);
    console.log(`Visual witness: ${brief.visualWitness.status}`);
    console.log(`Legacy capture candidates: ${brief.legacy.captureCandidateCount}`);
    console.log(`Blocked actions: ${brief.blockedActions.length}`);
    console.log(`Destructive actions: ${brief.safety.destructiveActionsTaken}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-operator-brief failed: ${error.message}`);
  process.exit(1);
}
