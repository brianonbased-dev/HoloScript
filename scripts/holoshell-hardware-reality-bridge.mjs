#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.hardware-reality-bridge.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'hardware-reality.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'hardware-reality.js');
const DEFAULT_FIXTURE = path.join('apps', 'holoshell', 'samples', 'hardware-reality-fixture.json');
const REQUIRED_TOOLS = [
  'holoshell_run_registry_snapshot',
  'holoshell_preflight_terminate',
  'holoshell_preflight_delete',
  'holoshell_preflight_legacy_app_mutation',
];

function defaultMcpScript() {
  return path.join(os.homedir(), '.ai-ecosystem', 'scripts', 'holoshell-mcp-stdio.mjs');
}

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    fixture: '',
    mcpScript: defaultMcpScript(),
    timeoutMs: 20000,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--fixture') args.fixture = argv[++index];
    else if (arg === '--mcp-script') args.mcpScript = argv[++index];
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]) || args.timeoutMs;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest && !args.fixture) args.fixture = DEFAULT_FIXTURE;
  return args;
}

function printHelp() {
  console.log(`HoloShell hardware reality bridge

Usage:
  node scripts/holoshell-hardware-reality-bridge.mjs [options]

Options:
  --json                 Print the visual hardware model.
  --output <path>        Write output path. Defaults to .tmp/holoshell/hardware-reality.json.
  --js-output <path>     Write browser bootstrap JS. Defaults to .tmp/holoshell/hardware-reality.js.
  --fixture <path>       Ask the upstream MCP server to serve a fixture instead of probing live PIDs.
  --mcp-script <path>    HoloShell stdio MCP script. Defaults to ~/.ai-ecosystem/scripts/holoshell-mcp-stdio.mjs.
  --timeout-ms <n>       Upstream live snapshot timeout. Defaults to 20000.
  --self-test            Use the sample fixture and assert bridge invariants.
  -h, --help             Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptionalJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseMcpContent(result) {
  const text = result?.content?.find((item) => item?.type === 'text')?.text;
  if (!text) throw new Error('MCP tools/call response did not include text content');
  return JSON.parse(text);
}

class JsonRpcStdioClient {
  constructor({ scriptPath, fixture, timeoutMs }) {
    this.scriptPath = path.resolve(scriptPath);
    this.fixture = fixture ? resolveRepoPath(fixture) : '';
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.child = null;
  }

  start() {
    if (!existsSync(this.scriptPath)) {
      throw new Error(`HoloShell MCP script not found: ${this.scriptPath}`);
    }

    const args = [this.scriptPath, '--timeout-ms', String(this.timeoutMs)];
    if (this.fixture) args.push('--fixture', this.fixture);
    this.child = spawn(process.execPath, args, {
      cwd: path.dirname(this.scriptPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.on('exit', (code, signal) => {
      const error = new Error(`HoloShell MCP exited before response: code=${code} signal=${signal} stderr=${this.stderr.trim()}`);
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    });
  }

  handleStdout(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '').trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.rejectAll(new Error(`Invalid JSON-RPC from MCP: ${error.message}; line=${line.slice(0, 240)}`));
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }

  rejectAll(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}) {
    if (!this.child) this.start();
    const id = this.nextId;
    this.nextId += 1;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for MCP method ${method}`));
      }, this.timeoutMs + 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, 'utf8');
    });
  }

  async close() {
    if (!this.child) return;
    this.child.stdin.end();
    await new Promise((resolveClose) => {
      const timer = setTimeout(() => {
        this.child.kill();
        resolveClose();
      }, 1000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolveClose();
      });
    });
  }
}

async function readMcpReality(args) {
  const client = new JsonRpcStdioClient(args);
  try {
    const initialize = await client.request('initialize', {
      protocolVersion: '2025-11-25',
      clientInfo: { name: 'hololand-hardware-reality-bridge', version: '0.1.0' },
      capabilities: {},
    });
    const listed = await client.request('tools/list', {});
    const called = await client.request('tools/call', {
      name: 'holoshell_run_registry_snapshot',
      arguments: {},
    });
    return {
      initialize,
      tools: safeArray(listed?.tools),
      snapshot: parseMcpContent(called),
    };
  } finally {
    await client.close();
  }
}

function semanticPrefixForLane(lane) {
  return lane.semantic_prefix || `[lane:${lane.agent_id} surface:${lane.surface} source:${lane.source || 'holoshell-mcp'}]`;
}

function semanticPrefixForFallbackLane(lane) {
  return lane.semanticPrefix || `[lane:${lane.laneId || lane.agent_id} surface:${lane.surfaceKind || lane.surface || 'unknown'} source:holoshell-receipts]`;
}

function numericPids(values) {
  return safeArray(values).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

function lanePidIndex(snapshot) {
  const index = new Map();
  for (const lane of safeArray(snapshot.agentLanes)) {
    const evidence = {
      laneId: lane.agent_id,
      label: lane.lane_label || lane.agent_id,
      surfaceKind: lane.surface,
      colorHint: lane.lane_color || 'white',
      trustState: 'observed_by_holoshell_mcp',
    };
    for (const pid of numericPids(lane.pid_links)) {
      index.set(pid, evidence);
    }
  }
  return index;
}

function buildLaneModels(snapshot) {
  return safeArray(snapshot.agentLanes).map((lane) => ({
    laneId: lane.agent_id,
    label: lane.lane_label || lane.agent_id,
    surfaceKind: lane.surface,
    colorHint: lane.lane_color || 'white',
    pidLinks: numericPids(lane.pid_links),
    runIds: safeArray(lane.current_run_ids).map(String),
    pidCount: safeArray(lane.pid_links).length,
    runCount: safeArray(lane.current_run_ids).length,
    healthState: lane.health_state || 'observed',
    semanticPrefix: semanticPrefixForLane(lane),
    trustState: 'observed_by_holoshell_mcp',
    receiptRequired: true,
  }));
}

function buildShellRunModels(snapshot) {
  const laneByPid = lanePidIndex(snapshot);
  return safeArray(snapshot.shellRuns)
    .slice(0, 48)
    .map((run) => {
      const pid = Number(run.pid);
      const parentPid = Number(run.parentPid);
      const directLane = laneByPid.get(pid);
      const parentLane = laneByPid.get(parentPid);
      const fallbackLane = run.owner_lane
        ? {
          laneId: run.owner_lane,
          label: run.owner_label || run.owner_lane,
          surfaceKind: 'process_health_custody',
          colorHint: 'white',
          trustState: 'observed_by_process_health',
        }
        : null;
      const owner = directLane || parentLane || fallbackLane;
      return {
        runId: run.run_id,
        pid,
        processName: run.process,
        parentPid: Number.isInteger(parentPid) ? parentPid : null,
        healthState: run.health_state || 'observed',
        listeningPorts: safeArray(run.listeningPorts),
        commandHash: run.command_hash || null,
        ownerLaneId: owner?.laneId || null,
        ownerLaneLabel: owner?.label || null,
        ownerSurfaceKind: owner?.surfaceKind || null,
        ownerColorHint: owner?.colorHint || null,
        ownerEvidence: directLane ? 'direct_pid' : parentLane ? 'parent_pid' : run.owner_evidence || (fallbackLane ? 'process_health_custody' : null),
        ownerParentPid: parentLane ? parentPid : null,
        ownerTrustState: owner?.trustState || null,
        actionClass: run.action_class || 'observed',
        cleanupEligible: Boolean(run.cleanup_eligible),
        ownerHandoffRequired: Boolean(run.owner_handoff_required),
        rawCommandHidden: true,
        receiptRequired: true,
      };
    });
}

function groupLegacyApps(snapshot) {
  const groups = new Map();
  for (const processInfo of safeArray(snapshot.processes).filter((item) => item.kind === 'legacy_app')) {
    const appName = String(processInfo.name || 'legacy_app').replace(/\.exe$/i, '');
    const key = appName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        appName,
        observedProcessCount: 0,
        samplePids: [],
        mutationPolicy: 'preflight_required',
        receiptRequired: true,
      });
    }
    const group = groups.get(key);
    group.observedProcessCount += 1;
    if (group.samplePids.length < 8) group.samplePids.push(processInfo.pid);
  }
  return [...groups.values()].sort((left, right) => right.observedProcessCount - left.observedProcessCount);
}

function buildPortModels(snapshot) {
  return safeArray(snapshot.listeners)
    .slice(0, 64)
    .map((listener) => ({
      pid: listener.pid,
      localAddress: listener.localAddress,
      localPort: listener.localPort,
      state: listener.state,
      receiptRequired: true,
    }));
}

function riskState(snapshot) {
  const findings = safeArray(snapshot.healthFindings);
  if (findings.some((finding) => finding.severity === 'critical')) return 'critical';
  if (findings.some((finding) => finding.severity === 'warn')) return 'warn';
  return 'pass';
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fallbackSurfacePids(lane, surfaces) {
  const laneKeys = [
    lane.laneId,
    lane.agentKind,
    lane.displayName,
    lane.surfaceKind,
  ].map(normalizeKey).filter(Boolean);
  const pids = new Set();
  for (const surface of surfaces) {
    const surfaceKeys = [
      surface.laneId,
      surface.peerKind,
      surface.label,
      surface.surfaceClass,
    ].map(normalizeKey).filter(Boolean);
    if (!laneKeys.some((key) => surfaceKeys.some((surfaceKey) => key.includes(surfaceKey) || surfaceKey.includes(key)))) continue;
    for (const pid of numericPids(surface.pids)) pids.add(pid);
  }
  return [...pids];
}

function fallbackAgentLanes(lanes, legacyWindows, runCustody) {
  const surfaces = [
    ...safeArray(legacyWindows.peerSurfaces),
    ...safeArray(legacyWindows.shellSurfaces),
  ];
  return safeArray(lanes.lanes).map((lane) => {
    const pidLinks = fallbackSurfacePids(lane, surfaces);
    const runIds = safeArray(runCustody.runs)
      .filter((run) => {
        const laneId = normalizeKey(run.laneId);
        const agentKind = normalizeKey(run.agentKind);
        return (laneId && normalizeKey(lane.laneId).includes(laneId))
          || (agentKind && normalizeKey(lane.agentKind).includes(agentKind));
      })
      .map((run) => run.runId)
      .filter(Boolean);
    return {
      agent_id: lane.laneId,
      lane_label: lane.displayName || lane.laneId,
      surface: lane.surfaceKind || lane.agentKind || 'unknown',
      lane_color: lane.color?.name || 'white',
      pid_links: pidLinks,
      current_run_ids: runIds,
      health_state: lane.status || 'observed_from_receipts',
      semantic_prefix: semanticPrefixForFallbackLane(lane),
      source: 'holoshell-receipts',
    };
  });
}

function fallbackShellRuns(processHealth) {
  const processRows = safeArray(processHealth.shellRuns).length
    ? safeArray(processHealth.shellRuns)
    : safeArray(processHealth.processes);
  return processRows
    .filter((processInfo) => processInfo.shellRunCandidate)
    .map((processInfo) => ({
      run_id: processInfo.custody?.runId || `pid-${processInfo.pid}`,
      pid: processInfo.pid,
      parentPid: processInfo.ppid,
      process: processInfo.name,
      health_state: processInfo.findings?.length ? 'needs_review' : 'observed',
      listeningPorts: [],
      command_hash: processInfo.commandHash || null,
      owner_lane: processInfo.custody?.ownerLane || null,
      owner_label: processInfo.custody?.ownerLaneLabel || null,
      owner_evidence: processInfo.custody?.ownerEvidence || null,
      action_class: processInfo.custody?.actionClass || 'observed',
      cleanup_eligible: Boolean(processInfo.custody?.cleanupEligible),
      owner_handoff_required: Boolean(processInfo.custody?.ownerHandoffRequired),
    }));
}

function fallbackLegacyProcesses(legacyWindows) {
  return safeArray(legacyWindows.appGroups)
    .filter((group) => !['ai_peer_surface', 'shell_surface', 'ai_model_runtime'].includes(group.archetype))
    .flatMap((group) => numericPids(group.pids).slice(0, 8).map((pid) => ({
      pid,
      name: group.label || group.appName || 'legacy_app',
      kind: 'legacy_app',
    })));
}

function stopPlanToTerminationPreflight(plan) {
  return {
    pid: plan.pid,
    reason: plan.reason,
    actionClass: plan.custody?.actionClass || 'cleanup_candidate',
    cleanupEligible: true,
    ownerLane: null,
    approvalRequired: true,
    receiptRequired: true,
  };
}

function ownerHandoffFromPlan(plan) {
  return {
    pid: plan.pid,
    ownerLane: plan.custody?.ownerLane || null,
    ownerLaneLabel: plan.custody?.ownerLaneLabel || null,
    reason: plan.reason,
    recommendedAction: plan.recommendedAction || 'ask_owner_lane_to_extend_close_or_justify',
    cleanupEligible: false,
    receiptRequired: true,
  };
}

function snapshotHasNativeCustodySplit(snapshot) {
  if (!snapshot || snapshot.receipt?.fallback_active) return false;
  const terminationPreflights = safeArray(snapshot.terminationPreflights);
  const ownerHandoffs = safeArray(snapshot.ownerHandoffs);
  const shellRuns = safeArray(snapshot.shellRuns);
  const cards = safeArray(snapshot.operatorCards);
  const counts = snapshot.counts || {};

  const countsOk =
    Number.isFinite(Number(counts.cleanupCandidates)) &&
    Number.isFinite(Number(counts.ownerHandoffs));
  const preflightShapeOk = terminationPreflights.every((item) =>
    item.actionClass &&
    item.cleanupEligible === true &&
    item.ownerLane == null &&
    item.approvalRequired !== false &&
    item.receiptRequired !== false,
  );
  const handoffShapeOk = ownerHandoffs.every((item) =>
    item.cleanupEligible === false &&
    item.ownerLane &&
    item.recommendedAction,
  );
  const shellRunsStamped = shellRuns.every((run) =>
    Object.prototype.hasOwnProperty.call(run, 'action_class') &&
    Object.prototype.hasOwnProperty.call(run, 'cleanup_eligible') &&
    Object.prototype.hasOwnProperty.call(run, 'owner_handoff_required'),
  );
  const ownerCardOk = cards.some((card) => card.cardId === 'owner-handoff');

  return countsOk && preflightShapeOk && handoffShapeOk && shellRunsStamped && ownerCardOk;
}

function processHealthFindings(processHealth) {
  const stopFindings = safeArray(processHealth.stopPlans).slice(0, 24).map((plan) => ({
    severity: 'warn',
    class: safeArray(plan.findings)[0] || 'process_health_stop_plan',
    actionClass: plan.custody?.actionClass || 'cleanup_candidate',
    cleanupEligible: true,
    ownerLane: null,
    pid: plan.pid,
    process: plan.name,
    ports: [],
    receipt: plan.planId || 'process_health_stop_plan',
  }));
  const handoffFindings = safeArray(processHealth.ownerHandoffPlans).slice(0, 24).map((plan) => ({
    severity: 'warn',
    class: safeArray(plan.findings)[0] || 'process_health_owner_handoff',
    actionClass: plan.custody?.actionClass || 'owner_handoff',
    cleanupEligible: false,
    ownerLane: plan.custody?.ownerLane || null,
    ownerLaneLabel: plan.custody?.ownerLaneLabel || null,
    pid: plan.pid,
    process: plan.name,
    ports: [],
    receipt: plan.planId || 'process_health_owner_handoff',
  }));
  return [...stopFindings, ...handoffFindings];
}

function fallbackFindings(processHealth, mcpError) {
  const findings = processHealthFindings(processHealth);
  findings.unshift({
    severity: 'warn',
    class: 'mcp_snapshot_timeout',
    process: 'holoshell-hardware-reality-bridge',
    receipt: 'local_receipt_fallback',
    detail: String(mcpError?.message || mcpError || '').slice(0, 160),
  });
  return findings;
}

function overlayProcessHealthCustody(snapshot, processHealth) {
  if (!processHealth?.summary) return snapshot;
  const stopPlans = safeArray(processHealth.stopPlans);
  const ownerHandoffPlans = safeArray(processHealth.ownerHandoffPlans);
  if (!stopPlans.length && !ownerHandoffPlans.length) return snapshot;

  const upstreamTerminationPreflights = safeArray(snapshot.terminationPreflights);
  return {
    ...snapshot,
    counts: {
      ...(snapshot.counts || {}),
      processes: processHealth.summary.processCount || snapshot.counts?.processes || 0,
      shellRuns: processHealth.summary.shellRunCount || snapshot.counts?.shellRuns || 0,
      cleanupCandidates: processHealth.summary.actionableCleanupCandidateCount || processHealth.summary.cleanupCandidateCount || stopPlans.length,
      ownerHandoffs: processHealth.summary.ownerHandoffPlanCount || ownerHandoffPlans.length,
    },
    terminationPreflights: stopPlans.map(stopPlanToTerminationPreflight),
    ownerHandoffs: ownerHandoffPlans.map(ownerHandoffFromPlan),
    healthFindings: [
      ...safeArray(snapshot.healthFindings),
      ...processHealthFindings(processHealth),
    ].slice(0, 64),
    receipt: {
      ...(snapshot.receipt || {}),
      process_health_overlay_active: true,
      process_health_overlay_source: '.tmp/holoshell/process-health.json',
      upstream_termination_preflight_count: upstreamTerminationPreflights.length,
    },
  };
}

function createFallbackMcpReality(args, mcpError) {
  const tmpDir = path.join('.tmp', 'holoshell');
  const processHealth = readOptionalJson(path.join(tmpDir, 'process-health.json'), {});
  const lanes = readOptionalJson(path.join(tmpDir, 'agent-lanes.json'), {});
  const legacyWindows = readOptionalJson(path.join(tmpDir, 'legacy-window-inventory.json'), {});
  const runCustody = readOptionalJson(path.join(tmpDir, 'run-custody.json'), {});
  const shellRuns = fallbackShellRuns(processHealth);
  const stopPlans = safeArray(processHealth.stopPlans);
  const ownerHandoffPlans = safeArray(processHealth.ownerHandoffPlans);
  const listeners = shellRuns
    .flatMap((run) => safeArray(run.listeningPorts).map((port) => ({
      pid: run.pid,
      localAddress: '127.0.0.1',
      localPort: port,
      state: 'LISTEN',
    })));
  const legacyProcesses = fallbackLegacyProcesses(legacyWindows);
  const snapshot = {
    counts: {
      processes: processHealth.summary?.processCount || 0,
      listeners: listeners.length,
      shellRuns: processHealth.summary?.shellRunCount || shellRuns.length,
      cleanupCandidates: processHealth.summary?.actionableCleanupCandidateCount || processHealth.summary?.cleanupCandidateCount || stopPlans.length,
      ownerHandoffs: processHealth.summary?.ownerHandoffPlanCount || ownerHandoffPlans.length,
    },
    agentLanes: fallbackAgentLanes(lanes, legacyWindows, runCustody),
    shellRuns,
    listeners,
    processes: legacyProcesses,
    terminationPreflights: stopPlans.map(stopPlanToTerminationPreflight),
    ownerHandoffs: ownerHandoffPlans.map(ownerHandoffFromPlan),
    healthFindings: fallbackFindings(processHealth, mcpError),
    receipt: {
      snapshot_hash: sha256(JSON.stringify({
        processSummary: processHealth.summary || {},
        laneSummary: lanes.summary || {},
        legacyWindowSummary: legacyWindows.summary || {},
        runCustodySummary: runCustody.summary || {},
        mcpError: String(mcpError?.message || mcpError || ''),
      })),
      fallback_active: true,
      fallback_reason: String(mcpError?.message || mcpError || 'MCP snapshot unavailable').slice(0, 240),
      destructive_actions_taken: false,
      preflight_required_for_termination: true,
    },
  };
  return {
    initialize: {
      serverInfo: {
        name: 'holoshell-local-receipt-fallback',
        version: '0.1.0',
      },
      fallbackActive: true,
    },
    tools: [],
    snapshot,
    args,
  };
}

function buildRecommendations(snapshot, summary) {
  const recommendations = [];
  if (snapshot.receipt?.fallback_active) {
    recommendations.push({
      severity: 'medium',
      kind: 'mcp_snapshot_fallback_active',
      text: 'The live MCP snapshot timed out, so HoloShell used local read-only receipts. Retry the MCP bridge before any process, file, or legacy-app mutation.',
    });
  }
  if (summary.riskState !== 'pass') {
    recommendations.push({
      severity: summary.riskState === 'critical' ? 'high' : 'medium',
      kind: 'hardware_findings_present',
      text: 'Review MCP health findings before starting a memory-heavy build, browser run, or model job.',
    });
  }
  if (summary.terminationPreflightCount > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'preflight_before_mutation',
      text: `${summary.terminationPreflightCount} owner-unknown cleanup candidate(s) need HoloShell MCP preflight before PID termination.`,
    });
  }
  if (summary.ownerHandoffPlanCount > 0) {
    recommendations.push({
      severity: 'low',
      kind: 'owner_handoff_before_cleanup',
      text: `${summary.ownerHandoffPlanCount} process finding(s) already have owner lanes. Ask those lanes to extend, close, or justify before cleanup.`,
    });
  }
  if (summary.legacyAppCount > 0) {
    recommendations.push({
      severity: 'medium',
      kind: 'legacy_apps_absorbable',
      text: 'Legacy apps are visible enough to wrap with HoloShell custody, but mutation still needs app identity, window identity, and rollback receipts.',
    });
  }
  if (safeArray(snapshot.agentLanes).length > 1) {
    recommendations.push({
      severity: 'low',
      kind: 'multi_agent_lanes_active',
      text: 'Multiple agent lanes are active; project lane ownership in HoloShell so the user does not need to read terminals.',
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      severity: 'low',
      kind: 'hardware_reality_ready',
      text: 'The MCP-backed hardware projection is ready for read-only HoloShell visualization.',
    });
  }
  return recommendations;
}

function createHardwareRealityModel({ initialize, tools, snapshot, args }) {
  const lanes = buildLaneModels(snapshot);
  const shellRuns = buildShellRunModels(snapshot);
  const legacyApps = groupLegacyApps(snapshot);
  const listeners = buildPortModels(snapshot);
  const toolNames = tools.map((tool) => tool.name).filter(Boolean);
  const summary = {
    riskState: riskState(snapshot),
    fallbackActive: Boolean(snapshot.receipt?.fallback_active),
    processCount: snapshot.counts?.processes || safeArray(snapshot.processes).length,
    listenerCount: snapshot.counts?.listeners || safeArray(snapshot.listeners).length,
    shellRunCount: snapshot.counts?.shellRuns || safeArray(snapshot.shellRuns).length,
    cleanupCandidateCount: snapshot.counts?.cleanupCandidates || safeArray(snapshot.terminationPreflights).length,
    ownerHandoffPlanCount: snapshot.counts?.ownerHandoffs || safeArray(snapshot.ownerHandoffs).length,
    laneAttributedShellRunCount: shellRuns.filter((run) => run.ownerLaneId).length,
    unattributedShellRunCount: shellRuns.filter((run) => !run.ownerLaneId).length,
    laneCount: lanes.length,
    activeLaneCount: lanes.filter((lane) => lane.pidCount > 0).length,
    legacyAppCount: legacyApps.reduce((sum, app) => sum + app.observedProcessCount, 0),
    legacyAppGroupCount: legacyApps.length,
    terminationPreflightCount: safeArray(snapshot.terminationPreflights).length,
    ownerHandoffCount: safeArray(snapshot.ownerHandoffs).length,
    mcpToolCount: toolNames.length,
    requiredToolCount: REQUIRED_TOOLS.length,
    requiredToolsAvailable: REQUIRED_TOOLS.every((name) => toolNames.includes(name)),
  };
  const safety = {
    destructiveActionsTaken: Boolean(snapshot.receipt?.destructive_actions_taken),
    preflightRequiredForTermination: Boolean(snapshot.receipt?.preflight_required_for_termination),
    mutationPreflightTools: REQUIRED_TOOLS.filter((name) => toolNames.includes(name)),
    policies: [
      'read_only_projection',
      'raw_commands_hidden_by_default',
      'semantic_lane_truth_required',
      'legacy_app_mutation_requires_preflight',
      'process_termination_requires_preflight',
      'file_deletion_requires_preflight',
    ],
  };
  const model = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-reality-bridge.hsplus',
      adapter: 'scripts/holoshell-hardware-reality-bridge.mjs',
      sample: 'apps/holoshell/samples/hardware-reality-fixture.json',
      upstreamMcp: path.resolve(args.mcpScript),
      upstreamSnapshotTool: 'holoshell_run_registry_snapshot',
    },
    mcp: {
      initialized: Boolean(initialize?.serverInfo),
      serverInfo: initialize?.serverInfo || null,
      tools: toolNames,
      fallbackActive: Boolean(snapshot.receipt?.fallback_active),
      processHealthOverlayActive: Boolean(snapshot.receipt?.process_health_overlay_active),
      nativeMcpCustodySplit: snapshotHasNativeCustodySplit(snapshot),
      upstreamTerminationPreflightCount: snapshot.receipt?.upstream_termination_preflight_count || null,
      fallbackReason: snapshot.receipt?.fallback_reason || null,
    },
    summary,
    safety,
    lanes,
    shellRuns,
    listeners,
    legacyApps,
    terminationPreflights: safeArray(snapshot.terminationPreflights).map((preflight) => ({
      pid: preflight.pid || null,
      reason: String(preflight.reason || '').slice(0, 220),
      actionClass: preflight.actionClass || 'cleanup_candidate',
      cleanupEligible: preflight.cleanupEligible !== false,
      ownerLane: preflight.ownerLane || null,
      approvalRequired: preflight.approvalRequired !== false,
      receiptRequired: preflight.receiptRequired !== false,
    })),
    ownerHandoffs: safeArray(snapshot.ownerHandoffs).map((handoff) => ({
      pid: handoff.pid || null,
      ownerLane: handoff.ownerLane || null,
      ownerLaneLabel: handoff.ownerLaneLabel || null,
      reason: String(handoff.reason || '').slice(0, 220),
      recommendedAction: handoff.recommendedAction || 'ask_owner_lane_to_extend_close_or_justify',
      cleanupEligible: false,
      receiptRequired: handoff.receiptRequired !== false,
    })),
    findings: safeArray(snapshot.healthFindings).map((finding) => ({
      severity: finding.severity,
      class: finding.class,
      actionClass: finding.actionClass || null,
      cleanupEligible: Boolean(finding.cleanupEligible),
      ownerLane: finding.ownerLane || null,
      ownerLaneLabel: finding.ownerLaneLabel || null,
      pid: finding.pid || null,
      process: finding.process || null,
      ports: safeArray(finding.ports),
      receipt: finding.receipt || 'mcp_health_finding',
    })),
    operatorCards: [
      {
        cardId: 'agent-lanes',
        title: 'Agent Lanes',
        value: `${summary.activeLaneCount}/${summary.laneCount}`,
        intent: 'Show which AI surfaces are awake and what they own.',
      },
      {
        cardId: 'shell-runs',
        title: 'Shell Runs',
        value: String(summary.shellRunCount),
        intent: 'Show active command and dev-run custody without requiring terminal reading.',
      },
      {
        cardId: 'legacy-apps',
        title: 'Legacy Apps',
        value: String(summary.legacyAppCount),
        intent: 'Show absorbable Windows programs before any visual or settings mutation.',
      },
      {
        cardId: 'owner-handoff',
        title: 'Owner Handoff',
        value: String(summary.ownerHandoffPlanCount),
        intent: 'Route lane-owned findings to the responsible agent before cleanup.',
      },
      {
        cardId: 'preflight-gate',
        title: 'Mutation Gate',
        value: `${summary.terminationPreflightCount} cleanup`,
        intent: 'Keep every destructive operation behind MCP preflight and receipt checks.',
      },
    ],
    recommendations: buildRecommendations(snapshot, summary),
    receipt: {
      snapshotHash: snapshot.receipt?.snapshot_hash || null,
      bridgeHash: sha256(JSON.stringify({
        snapshotHash: snapshot.receipt?.snapshot_hash || null,
        fallbackActive: Boolean(snapshot.receipt?.fallback_active),
        summary,
        safety,
        lanes: lanes.map((lane) => [lane.laneId, lane.pidCount, lane.healthState]),
        shellRunOwners: shellRuns.map((run) => [run.runId, run.ownerLaneId, run.ownerEvidence]),
      })),
      destructiveActionsTaken: safety.destructiveActionsTaken,
      rawCommandsIncluded: false,
    },
  };
  return model;
}

function writeModel(model, outputPath) {
  const resolved = resolveRepoPath(outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(model, outputPath) {
  const resolved = resolveRepoPath(outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(model, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_HARDWARE_REALITY = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(model) {
  const failures = [];
  if (model.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!model.mcp.initialized) failures.push('MCP initialize did not return serverInfo');
  if (!model.summary.requiredToolsAvailable) failures.push('not all required MCP tools are available');
  if (model.summary.processCount < 4) failures.push('expected fixture processes');
  if (model.summary.shellRunCount < 1) failures.push('expected fixture shell run');
  if (model.summary.laneAttributedShellRunCount < 1) failures.push('expected fixture shell run lane attribution');
  if (model.shellRuns.find((run) => run.pid === 202)?.ownerLaneId !== 'codex') {
    failures.push('expected fixture shell run 202 to inherit codex lane from parent pid');
  }
  if (model.summary.listenerCount < 1) failures.push('expected fixture listener');
  if (model.summary.activeLaneCount < 1) failures.push('expected active agent lane');
  if (model.summary.legacyAppCount < 1) failures.push('expected legacy app custody');
  if (!Array.isArray(model.terminationPreflights)) failures.push('expected termination preflight array');
  if (!Array.isArray(model.ownerHandoffs)) failures.push('expected owner handoff array');
  if (model.safety.destructiveActionsTaken !== false) failures.push('bridge must not take destructive actions');
  if (!model.safety.preflightRequiredForTermination) failures.push('termination preflight must be required');
  if (!model.receipt.snapshotHash) failures.push('missing upstream snapshot hash');
  const overlayFixture = overlayProcessHealthCustody({
    counts: { processes: 99, shellRuns: 99 },
    terminationPreflights: [{ pid: 1, reason: 'upstream unsplit preflight' }],
    ownerHandoffs: [],
    healthFindings: [],
    receipt: { snapshot_hash: 'fixture-overlay' },
  }, {
    summary: {
      processCount: 4,
      shellRunCount: 2,
      actionableCleanupCandidateCount: 1,
      ownerHandoffPlanCount: 1,
    },
    stopPlans: [{
      pid: 202,
      reason: 'owner unknown stale run',
      findings: ['stale_shell_or_dev_run'],
      custody: { actionClass: 'cleanup_candidate' },
      planId: 'fixture-stop',
    }],
    ownerHandoffPlans: [{
      pid: 303,
      reason: 'lane owned stale run',
      findings: ['stale_shell_or_dev_run'],
      custody: { actionClass: 'lane_owner_handoff', ownerLane: 'codex', ownerLaneLabel: 'Codex' },
      planId: 'fixture-handoff',
    }],
  });
  if (overlayFixture.terminationPreflights.length !== 1) failures.push('overlay should replace unsplit termination preflights');
  if (overlayFixture.ownerHandoffs.length !== 1) failures.push('overlay should add owner handoffs');
  if (overlayFixture.counts.cleanupCandidates !== 1) failures.push('overlay cleanup count mismatch');
  if (overlayFixture.counts.ownerHandoffs !== 1) failures.push('overlay handoff count mismatch');
  if (overlayFixture.receipt.upstream_termination_preflight_count !== 1) failures.push('overlay should record upstream preflight count');
  const nativeFixture = {
    counts: { processes: 3, shellRuns: 1, cleanupCandidates: 1, ownerHandoffs: 2 },
    shellRuns: [{
      pid: 202,
      action_class: 'lane_owner_handoff',
      cleanup_eligible: false,
      owner_handoff_required: true,
    }],
    terminationPreflights: [{
      pid: 303,
      actionClass: 'cleanup_candidate',
      cleanupEligible: true,
      ownerLane: null,
      approvalRequired: true,
      receiptRequired: true,
    }],
    ownerHandoffs: [{
      pid: 202,
      ownerLane: 'codex',
      recommendedAction: 'ask_owner_lane_to_extend_close_or_justify',
      cleanupEligible: false,
    }],
    operatorCards: [{ cardId: 'owner-handoff' }],
    receipt: { snapshot_hash: 'fixture-native' },
  };
  if (!snapshotHasNativeCustodySplit(nativeFixture)) failures.push('expected native custody split fixture');
  const serialized = JSON.stringify(model);
  if (/command_summary|commandLine|CommandLine/.test(serialized)) failures.push('raw command text leaked into visual model');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let mcpReality;
  try {
    mcpReality = await readMcpReality({
      scriptPath: args.mcpScript,
      fixture: args.fixture,
      timeoutMs: args.timeoutMs,
    });
  } catch (error) {
    if (args.selfTest || args.fixture) throw error;
    mcpReality = createFallbackMcpReality(args, error);
  }
  if (!args.selfTest && !args.fixture && !mcpReality.snapshot?.receipt?.fallback_active) {
    const processHealth = readOptionalJson(path.join('.tmp', 'holoshell', 'process-health.json'), {});
    if (!snapshotHasNativeCustodySplit(mcpReality.snapshot)) {
      mcpReality = {
        ...mcpReality,
        snapshot: overlayProcessHealthCustody(mcpReality.snapshot, processHealth),
      };
    }
  }
  const model = createHardwareRealityModel({ ...mcpReality, args });
  const output = writeModel(model, args.output);
  const jsOutput = writeBrowserBootstrap(model, args.jsOutput);
  if (args.selfTest) assertSelfTest(model);

  if (args.json) {
    console.log(JSON.stringify(model, null, 2));
  } else {
    console.log(`HoloShell hardware reality: ${output}`);
    console.log(`HoloShell browser bootstrap: ${jsOutput}`);
    console.log(`Risk: ${model.summary.riskState}`);
    console.log(`Processes: ${model.summary.processCount}`);
    console.log(`Shell runs: ${model.summary.shellRunCount}`);
    console.log(`Listeners: ${model.summary.listenerCount}`);
    console.log(`Agent lanes: ${model.summary.activeLaneCount}/${model.summary.laneCount}`);
    console.log(`Legacy apps: ${model.summary.legacyAppCount}`);
    console.log(`Preflights: ${model.summary.terminationPreflightCount}`);
    console.log(`Owner handoffs: ${model.summary.ownerHandoffPlanCount}`);
    console.log(`Fallback active: ${model.summary.fallbackActive}`);
    console.log(`Destructive actions: ${model.safety.destructiveActionsTaken}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`holoshell-hardware-reality-bridge failed: ${error.message}`);
  process.exit(1);
}
