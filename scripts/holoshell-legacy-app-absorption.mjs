#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.legacy-app-absorption.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_HARDWARE_REALITY = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_WINDOW_INVENTORY = path.join('.tmp', 'holoshell', 'legacy-window-inventory.json');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-app-absorption.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'legacy-app-absorption.js');
const CONTEXT_SURFACE_ARCHETYPES = new Set([
  'ai_peer_surface',
  'ai_model_runtime',
  'ai_workbench',
  'shell_surface',
]);

function parseArgs(argv) {
  const args = {
    hardwareReality: DEFAULT_HARDWARE_REALITY,
    windowInventory: DEFAULT_WINDOW_INVENTORY,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--hardware-reality') args.hardwareReality = argv[++index];
    else if (arg === '--window-inventory') args.windowInventory = argv[++index];
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
  console.log(`HoloShell legacy app absorption

Usage:
  node scripts/holoshell-legacy-app-absorption.mjs [options]

Options:
  --hardware-reality <path>   Hardware reality JSON. Default: .tmp/holoshell/hardware-reality.json.
  --window-inventory <path>   Legacy window inventory JSON. Default: .tmp/holoshell/legacy-window-inventory.json.
  --output <path>             Snapshot output. Default: .tmp/holoshell/legacy-app-absorption.json.
  --js-output <path>          Browser bootstrap JS. Default: .tmp/holoshell/legacy-app-absorption.js.
  --json                      Print snapshot JSON.
  --self-test                 Use synthetic fixture and assert invariants.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function syntheticHardwareReality() {
  return {
    schemaVersion: 'hololand.holoshell.hardware-reality-bridge.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
    summary: {
      legacyAppCount: 4,
      terminationPreflightCount: 4,
      riskState: 'pass',
    },
    legacyApps: [
      { appName: 'msedge', observedProcessCount: 2, samplePids: [303, 304], mutationPolicy: 'preflight_required' },
      { appName: 'explorer', observedProcessCount: 1, samplePids: [505], mutationPolicy: 'preflight_required' },
      { appName: 'SystemSettings', observedProcessCount: 1, samplePids: [606], mutationPolicy: 'preflight_required' },
    ],
    receipt: {
      snapshotHash: 'fixture-snapshot-hash',
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
    },
  };
}

function syntheticWindowInventory() {
  return {
    schemaVersion: 'hololand.holoshell.legacy-window-inventory.v0.1.0',
    generatedAt: '2026-05-14T00:00:00.000Z',
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
      captureCandidateCount: 2,
      rawWindowTitlesIncluded: false,
    },
    appGroups: [
      { appName: 'codex', label: 'Codex', archetype: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1, pids: [101], sampleWindowIds: ['window-codex'], titleLabels: ['codex_home'] },
      { appName: 'claude', label: 'Claude', archetype: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1, pids: [202], sampleWindowIds: ['window-claude'], titleLabels: ['claude_home'] },
      { appName: 'terminal', label: 'Terminal', archetype: 'shell_surface', windowInstanceCount: 1, processCount: 1, pids: [909], sampleWindowIds: ['window-terminal'], titleLabels: ['shell_window'] },
      { appName: 'msedge', label: 'Microsoft Edge', archetype: 'browser', windowInstanceCount: 1, processCount: 1, pids: [303], sampleWindowIds: ['window-edge'], titleLabels: ['browser_window'] },
      { appName: 'explorer', label: 'File Explorer', archetype: 'file_manager', windowInstanceCount: 1, processCount: 1, pids: [505], sampleWindowIds: ['window-explorer'], titleLabels: ['file_explorer_window'] },
    ],
    peerSurfaces: [
      { laneId: 'codex', label: 'Codex', windowInstanceCount: 1, processCount: 1, pids: [101], sampleWindowIds: ['window-codex'] },
      { laneId: 'claude', label: 'Claude', windowInstanceCount: 1, processCount: 1, pids: [202], sampleWindowIds: ['window-claude'] },
    ],
    shellSurfaces: [
      { laneId: 'terminal', label: 'Terminal', peerKind: 'shell', surfaceClass: 'shell_surface', windowInstanceCount: 1, processCount: 1, pids: [909], sampleWindowIds: ['window-terminal'] },
    ],
    operatingSurfaces: [
      { laneId: 'codex', label: 'Codex', peerKind: 'agent', surfaceClass: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1, pids: [101], sampleWindowIds: ['window-codex'] },
      { laneId: 'claude', label: 'Claude', peerKind: 'agent', surfaceClass: 'ai_peer_surface', windowInstanceCount: 1, processCount: 1, pids: [202], sampleWindowIds: ['window-claude'] },
      { laneId: 'terminal', label: 'Terminal', peerKind: 'shell', surfaceClass: 'shell_surface', windowInstanceCount: 1, processCount: 1, pids: [909], sampleWindowIds: ['window-terminal'] },
    ],
    brittneyBrief: {
      status: 'legacy_windows_visible',
      requiredNextAction: 'Use AI peer window counts separately from shell surface counts before trusting PID lane counts.',
      peerWindowSummary: 'Codex:1, Claude:1',
      shellWindowSummary: 'Terminal:1',
      blockedActions: ['close_window', 'click_destructive_ui', 'alter_registry'],
    },
    receipt: {
      windowInventoryHash: 'window-fixture',
      destructiveActionsTaken: false,
      rawWindowTitlesIncluded: false,
    },
  };
}

function loadHardwareReality(args) {
  if (args.selfTest) return syntheticHardwareReality();
  const resolved = resolveRepoPath(args.hardwareReality);
  if (!existsSync(resolved)) {
    throw new Error(`Hardware reality not found: ${resolved}. Run pnpm run holoshell:hardware-reality first.`);
  }
  return readJson(resolved);
}

function loadWindowInventory(args) {
  if (args.selfTest) return syntheticWindowInventory();
  const resolved = resolveRepoPath(args.windowInventory);
  if (!existsSync(resolved)) {
    return {
      schemaVersion: 'hololand.holoshell.legacy-window-inventory.missing.v0.1.0',
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
        legacyWindowCount: 0,
        captureCandidateCount: 0,
        rawWindowTitlesIncluded: false,
      },
      appGroups: [],
      peerSurfaces: [],
      shellSurfaces: [],
      operatingSurfaces: [],
      brittneyBrief: {
        status: 'window_inventory_missing',
        requiredNextAction: 'Run holoshell:legacy-windows before trusting peer instance counts.',
        peerWindowSummary: 'window inventory missing',
        shellWindowSummary: 'window inventory missing',
        blockedActions: ['close_window', 'click_destructive_ui', 'alter_registry'],
      },
      receipt: {
        windowInventoryHash: null,
        destructiveActionsTaken: false,
        rawWindowTitlesIncluded: false,
      },
    };
  }
  return readJson(resolved);
}

function archetypeFor(appName) {
  const name = String(appName || '').toLowerCase();
  if (/(msedge|chrome|firefox|brave)/.test(name)) return 'browser';
  if (/(explorer|files|finder)/.test(name)) return 'file_manager';
  if (/(systemsettings|settings|control)/.test(name)) return 'settings_panel';
  if (/(webview|native|messagehost|powerautomate|pad\.)/.test(name)) return 'automation_bridge';
  if (/(code|cursor|devenv|studio)/.test(name)) return 'developer_ide';
  return 'unknown_legacy_app';
}

function isContextSurfaceArchetype(archetype) {
  return CONTEXT_SURFACE_ARCHETYPES.has(String(archetype || ''));
}

function surfaceRoleFor(group, contextSurfaceNames = new Set()) {
  if (group.archetype === 'shell_surface' || group.appName === 'terminal') return 'shell_context_surface';
  if (group.archetype === 'ai_model_runtime' || (contextSurfaceNames.has(group.appName) && group.appName === 'ollama')) return 'model_runtime_context_surface';
  if (group.archetype === 'ai_workbench' || group.archetype === 'developer_ide') return 'workbench_context_surface';
  if (group.archetype === 'ai_peer_surface' || contextSurfaceNames.has(group.appName)) return 'ai_context_surface';
  if (group.archetype === 'automation_bridge') return 'automation_bridge';
  return 'legacy_app_surface';
}

function isContextSurface(group, contextSurfaceNames = new Set()) {
  return isContextSurfaceArchetype(group.archetype)
    || group.archetype === 'developer_ide'
    || contextSurfaceNames.has(group.appName);
}

function captureCandidateFor(group, contextSurfaceNames = new Set()) {
  if (isContextSurface(group, contextSurfaceNames)) return false;
  return group.windowInstanceCount > 0;
}

function safeActionsFor(archetype) {
  const common = ['observe_process', 'capture_window', 'read_title', 'map_visible_controls'];
  if (isContextSurfaceArchetype(archetype)) return ['observe_surface', 'count_windows', 'capture_window', 'summarize_visible_state'];
  if (archetype === 'browser') return [...common, 'capture_url_bar', 'summarize_tabs'];
  if (archetype === 'file_manager') return [...common, 'summarize_visible_folder'];
  if (archetype === 'settings_panel') return [...common, 'summarize_visible_settings'];
  if (archetype === 'automation_bridge') return ['observe_process', 'capture_window', 'map_visible_controls'];
  if (archetype === 'developer_ide') return [...common, 'summarize_workspace_state'];
  return common;
}

function blockedActionsFor(archetype) {
  const blocked = [
    'click_destructive_ui',
    'change_app_setting',
    'alter_registry',
    'uninstall_app',
    'submit_form',
    'close_window',
  ];
  if (isContextSurfaceArchetype(archetype)) return [...blocked, 'drive_peer_surface', 'send_prompt', 'execute_shell_command'];
  if (archetype === 'file_manager') return [...blocked, 'delete_file', 'move_file'];
  if (archetype === 'browser') return [...blocked, 'submit_purchase', 'change_browser_profile'];
  if (archetype === 'settings_panel') return [...blocked, 'change_system_setting'];
  return blocked;
}

function appGroups(hardwareReality, windowInventory) {
  const groups = new Map();
  const contextSurfaceNames = new Set([
    ...safeArray(windowInventory.peerSurfaces).map((surface) => surface.laneId),
    ...safeArray(windowInventory.shellSurfaces).map((surface) => surface.laneId),
    ...safeArray(windowInventory.operatingSurfaces).map((surface) => surface.laneId),
  ].filter(Boolean).map((value) => String(value).toLowerCase()));
  const ensureGroup = (appName, archetypeHint = '') => {
    const normalized = String(appName || 'legacy_app').toLowerCase();
    if (!groups.has(normalized)) {
      const archetype = archetypeHint || archetypeFor(normalized);
      groups.set(normalized, {
        appName: normalized,
        label: normalized,
        archetype,
        observedProcessCount: 0,
        windowInstanceCount: 0,
        windowProcessCount: 0,
        samplePids: [],
        sampleWindowIds: [],
        titleLabels: [],
        captureCandidate: false,
        preflightRequired: false,
        surfaceRole: surfaceRoleFor({ appName: normalized, archetype }, contextSurfaceNames),
        mutationPolicy: 'preflight_required',
        safeActions: safeActionsFor(archetype),
        blockedActions: blockedActionsFor(archetype),
        preflightTool: 'holoshell_preflight_legacy_app_mutation',
        receiptRequired: true,
      });
    }
    return groups.get(normalized);
  };

  for (const app of safeArray(hardwareReality.legacyApps)) {
    const group = ensureGroup(app.appName, archetypeFor(app.appName));
    group.label = group.label || app.appName || group.appName;
    group.observedProcessCount += Number(app.observedProcessCount || 0);
    group.samplePids = unique([...group.samplePids, ...safeArray(app.samplePids)]).slice(0, 16);
  }

  for (const windowGroup of safeArray(windowInventory.appGroups)) {
    const group = ensureGroup(windowGroup.appName, windowGroup.archetype || archetypeFor(windowGroup.appName));
    group.label = windowGroup.label || group.label;
    group.archetype = windowGroup.archetype || group.archetype;
    group.windowInstanceCount += Number(windowGroup.windowInstanceCount || 0);
    group.windowProcessCount = Math.max(group.windowProcessCount, Number(windowGroup.processCount || 0));
    group.samplePids = unique([...group.samplePids, ...safeArray(windowGroup.pids)]).slice(0, 16);
    group.sampleWindowIds = unique([...group.sampleWindowIds, ...safeArray(windowGroup.sampleWindowIds)]).slice(0, 12);
    group.titleLabels = unique([...group.titleLabels, ...safeArray(windowGroup.titleLabels)]).slice(0, 12);
  }

  return [...groups.values()].map((group) => {
    const surfaceRole = surfaceRoleFor(group, contextSurfaceNames);
    const captureCandidate = captureCandidateFor(group, contextSurfaceNames);
    return {
      ...group,
      surfaceRole,
      captureCandidate,
      preflightRequired: captureCandidate,
      mutationPolicy: captureCandidate ? 'preflight_required' : 'context_only',
      safeActions: safeActionsFor(group.archetype),
      blockedActions: blockedActionsFor(group.archetype),
    };
  }).sort((left, right) => {
    const byWindows = right.windowInstanceCount - left.windowInstanceCount;
    return byWindows || right.observedProcessCount - left.observedProcessCount;
  });
}

function buildRecommendations(groups) {
  const recommendations = [];
  for (const group of groups.filter((candidate) => candidate.captureCandidate)) {
    if (group.archetype === 'browser') {
      recommendations.push({
        appName: group.appName,
        action: 'capture_browser_surface',
        priority: 'high',
        reason: 'Browser is a high-value legacy surface for user tasks and web automation.',
        receiptRequired: true,
      });
    } else if (group.archetype === 'file_manager') {
      recommendations.push({
        appName: group.appName,
        action: 'capture_file_manager_surface',
        priority: 'high',
        reason: 'File manager needs visual wrapping before agents can help a non-developer user safely.',
        receiptRequired: true,
      });
    } else if (group.archetype === 'settings_panel') {
      recommendations.push({
        appName: group.appName,
        action: 'observe_settings_only',
        priority: 'medium',
        reason: 'Settings panels are useful, but every change requires rollback and explicit preflight.',
        receiptRequired: true,
      });
    } else {
      recommendations.push({
        appName: group.appName,
        action: 'observe_and_classify',
        priority: group.archetype === 'automation_bridge' ? 'low' : 'medium',
        reason: 'Classify the legacy surface before offering operations.',
        receiptRequired: true,
      });
    }
  }
  return recommendations.slice(0, 16);
}

function createSnapshot(hardwareReality, windowInventory) {
  const groups = appGroups(hardwareReality, windowInventory);
  const recommendations = buildRecommendations(groups);
  const captureCandidates = groups.filter((group) => group.captureCandidate);
  const preflightRequired = groups.filter((group) => group.preflightRequired);
  const contextSurfaceGroups = groups.filter((group) => group.surfaceRole !== 'legacy_app_surface' && group.surfaceRole !== 'automation_bridge');
  const observedAppCount = groups.reduce((sum, app) => sum + app.observedProcessCount, 0);
  const visibleWindowCount = windowInventory.summary?.visibleWindowCount || 0;
  const peerWindowCount = windowInventory.summary?.aiPeerWindowCount ?? windowInventory.summary?.peerWindowCount ?? 0;
  const peerSurfaceCount = windowInventory.summary?.aiPeerSurfaceCount ?? windowInventory.summary?.peerSurfaceCount ?? 0;
  const shellWindowCount = windowInventory.summary?.shellWindowCount || 0;
  const shellSurfaceCount = windowInventory.summary?.shellSurfaceCount || 0;
  const operatingSurfaceWindowCount = windowInventory.summary?.operatingSurfaceWindowCount ?? peerWindowCount + shellWindowCount;
  const operatingSurfaceCount = windowInventory.summary?.operatingSurfaceCount ?? peerSurfaceCount + shellSurfaceCount;
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-legacy-app-absorption.hsplus',
      adapter: 'scripts/holoshell-legacy-app-absorption.mjs',
      hardwareReality: 'scripts/holoshell-hardware-reality-bridge.mjs',
      windowInventory: 'scripts/holoshell-legacy-window-inventory.mjs',
    },
    summary: {
      observedAppCount,
      visibleWindowCount,
      windowAppGroupCount: safeArray(windowInventory.appGroups).length,
      peerSurfaceCount,
      peerWindowCount,
      aiPeerSurfaceCount: peerSurfaceCount,
      aiPeerWindowCount: peerWindowCount,
      shellSurfaceCount,
      shellWindowCount,
      operatingSurfaceCount,
      operatingSurfaceWindowCount,
      legacyWindowCount: windowInventory.summary?.legacyWindowCount || 0,
      appGroupCount: groups.length,
      contextSurfaceGroupCount: contextSurfaceGroups.length,
      legacyAppGroupCount: groups.length - contextSurfaceGroups.length,
      captureCandidateCount: captureCandidates.length,
      legacyOperationCandidateCount: captureCandidates.length,
      preflightRequiredCount: preflightRequired.length,
      mutationAllowedCount: 0,
      recommendationCount: recommendations.length,
    },
    safety: {
      observeOnly: true,
      destructiveActionsTaken: false,
      legacyMutationPerformed: false,
      preflightRequiredForMutation: true,
      rawCommandsIncluded: false,
      requiredPreflightTool: 'holoshell_preflight_legacy_app_mutation',
    },
    hardwareReality: {
      generatedAt: hardwareReality.generatedAt || null,
      riskState: hardwareReality.summary?.riskState || 'unknown',
      snapshotHash: hardwareReality.receipt?.snapshotHash || null,
    },
    appGroups: groups,
    peerSurfaces: safeArray(windowInventory.peerSurfaces),
    shellSurfaces: safeArray(windowInventory.shellSurfaces),
    operatingSurfaces: safeArray(windowInventory.operatingSurfaces).length
      ? safeArray(windowInventory.operatingSurfaces)
      : [...safeArray(windowInventory.peerSurfaces), ...safeArray(windowInventory.shellSurfaces)],
    recommendations,
    brittneyBrief: {
      status: captureCandidates.length ? 'legacy_surfaces_visible' : contextSurfaceGroups.length ? 'context_surfaces_visible' : 'no_legacy_surfaces',
      summary: `${observedAppCount} observed app process(es), ${visibleWindowCount} visible window(s), ${peerWindowCount} AI peer window(s), ${shellWindowCount} shell window(s), across ${groups.length} group(s). ${contextSurfaceGroups.length} context surface group(s); ${captureCandidates.length} legacy operation candidate(s); ${preflightRequired.length} mutation preflight gate(s) required.`,
      peerWindowSummary: safeArray(windowInventory.peerSurfaces).map((peer) => `${peer.label}:${peer.windowInstanceCount}`).join(', ') || 'no peer windows',
      shellWindowSummary: safeArray(windowInventory.shellSurfaces).map((shell) => `${shell.label}:${shell.windowInstanceCount}`).join(', ') || 'no shell windows',
      requiredNextAction: recommendations[0]
        ? `${recommendations[0].action} for ${recommendations[0].appName}: ${recommendations[0].reason}`
        : 'No legacy app absorption action is required.',
      allowedActions: ['observe_process', 'capture_window', 'read_title', 'map_visible_controls', 'summarize_visible_state'],
      blockedActions: ['click_destructive_ui', 'change_app_setting', 'alter_registry', 'uninstall_app', 'submit_form', 'close_window'],
      operatorRule: 'Legacy app mutation requires holoshell_preflight_legacy_app_mutation plus app identity, window identity, rollback plan, approval, and receipt.',
    },
    receipt: {
      absorptionHash: sha256(JSON.stringify({
        groups: groups.map((group) => [group.appName, group.archetype, group.observedProcessCount]),
        windows: groups.map((group) => [group.appName, group.windowInstanceCount]),
        roles: groups.map((group) => [group.appName, group.surfaceRole, group.captureCandidate, group.preflightRequired]),
        shellSurfaces: safeArray(windowInventory.shellSurfaces).map((shell) => [shell.laneId, shell.windowInstanceCount]),
        windowInventoryHash: windowInventory.receipt?.windowInventoryHash || null,
        hardwareSnapshotHash: hardwareReality.receipt?.snapshotHash || null,
      })),
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
      rawWindowTitlesIncluded: false,
    },
  };
  return snapshot;
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
  writeFileSync(resolved, `window.HOLOSHELL_LEGACY_APP_ABSORPTION = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(snapshot) {
  const failures = [];
  if (snapshot.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (snapshot.summary.observedAppCount < 3) failures.push('expected synthetic legacy app observations');
  if (snapshot.summary.visibleWindowCount < 4) failures.push('expected synthetic visible windows');
  if (snapshot.summary.peerWindowCount < 2) failures.push('expected synthetic peer windows');
  if (snapshot.summary.shellWindowCount < 1) failures.push('expected synthetic shell windows');
  if (snapshot.summary.operatingSurfaceWindowCount < 3) failures.push('expected synthetic operating surfaces');
  if (snapshot.summary.contextSurfaceGroupCount < 3) failures.push('expected peer and shell context surface groups');
  if (snapshot.summary.captureCandidateCount !== 2) failures.push('expected capture candidates to exclude peer and shell context');
  if (snapshot.summary.preflightRequiredCount !== 2) failures.push('expected preflight gates only for operation candidates');
  if (snapshot.summary.mutationAllowedCount !== 0) failures.push('mutation must not be allowed');
  if (snapshot.safety.destructiveActionsTaken !== false) failures.push('destructive actions must be false');
  if (!snapshot.safety.preflightRequiredForMutation) failures.push('legacy mutation preflight is required');
  if (!snapshot.brittneyBrief.blockedActions.includes('alter_registry')) failures.push('Brittney brief must block registry mutation');
  if (snapshot.receipt.rawWindowTitlesIncluded === true) failures.push('raw window titles must be hidden');
  const serialized = JSON.stringify(snapshot);
  if (/commandLine|CommandLine|command_summary/.test(serialized)) failures.push('raw command text leaked');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const hardwareReality = loadHardwareReality(args);
  const windowInventory = loadWindowInventory(args);
  const snapshot = createSnapshot(hardwareReality, windowInventory);
  if (args.selfTest) assertSelfTest(snapshot);
  const output = writeJson(args.output, snapshot);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, snapshot);

  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`HoloShell legacy app absorption: ${output}`);
    console.log(`HoloShell legacy app absorption browser bootstrap: ${jsOutput}`);
    console.log(`Observed apps: ${snapshot.summary.observedAppCount}`);
    console.log(`Visible windows: ${snapshot.summary.visibleWindowCount}`);
    console.log(`AI peer windows: ${snapshot.summary.peerWindowCount}`);
    console.log(`Shell windows: ${snapshot.summary.shellWindowCount}`);
    console.log(`Groups: ${snapshot.summary.appGroupCount}`);
    console.log(`Capture candidates: ${snapshot.summary.captureCandidateCount}`);
    console.log(`Preflight required: ${snapshot.summary.preflightRequiredCount}`);
    console.log(`Mutation allowed: ${snapshot.summary.mutationAllowedCount}`);
    console.log(`Destructive actions: ${snapshot.safety.destructiveActionsTaken}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-legacy-app-absorption failed: ${error.message}`);
  process.exit(1);
}
