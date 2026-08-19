#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.grok-heartbeat.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_REF = 'apps/holoshell/source/holoshell-grok-heartbeat.hsplus';
const AGENT_SOURCE_REF = 'apps/holoshell/source/holoshell-agent-presence-lanes.hsplus';
const ADAPTER_REF = 'scripts/holoshell-grok-heartbeat.mjs';
const SETUP_ADAPTER_REF = 'scripts/holoshell-grok-build-workflow.mjs';
const AGENT_ADAPTER_REF = 'scripts/holoshell-agent-lanes.mjs';
const OBSERVATION_TTL_MS = 30 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    watch: false,
    refreshSetup: false,
    refreshAgentLanes: false,
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    setup: null,
    setupJsOutput: null,
    workflow: null,
    agentLanes: null,
    intervalMs: 30000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--once') args.watch = false;
    else if (arg === '--refresh-setup') args.refreshSetup = true;
    else if (arg === '--refresh-agent-lanes') args.refreshAgentLanes = true;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--setup') args.setup = argv[++index];
    else if (arg === '--setup-js-output') args.setupJsOutput = argv[++index];
    else if (arg === '--workflow') args.workflow = argv[++index];
    else if (arg === '--agent-lanes') args.agentLanes = argv[++index];
    else if (arg === '--interval-ms') args.intervalMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error('--interval-ms must be at least 1000');
  }

  const tmpDir = args.selfTest ? path.join(DEFAULT_TMP, 'self-test') : args.tmpDir;
  args.tmpDir = tmpDir;
  args.output ||= path.join(tmpDir, 'grok-heartbeat.json');
  args.jsOutput ||= path.join(tmpDir, 'grok-heartbeat.js');
  args.setup ||= path.join(tmpDir, 'grok-build-setup.json');
  args.setupJsOutput ||= path.join(tmpDir, 'grok-build-setup.js');
  args.workflow ||= path.join(tmpDir, 'workflow-latest.json');
  args.agentLanes ||= path.join(tmpDir, 'agent-lanes.json');
  return args;
}

function printHelp() {
  console.log(`HoloShell Grok heartbeat

Usage:
  node scripts/holoshell-grok-heartbeat.mjs --once
  node scripts/holoshell-grok-heartbeat.mjs --watch --refresh-agent-lanes

Options:
  --once                 Emit one heartbeat. Default.
  --watch                Keep emitting until stopped.
  --refresh-setup        Refresh Grok CLI setup/auth/model receipt before heartbeat.
  --json                 Print the latest heartbeat JSON.
  --refresh-agent-lanes  Rebuild agent-lanes after writing the heartbeat.
  --tmp-dir <path>       Receipt directory. Defaults to .tmp/holoshell.
  --output <path>        Heartbeat JSON output. Defaults to <tmp-dir>/grok-heartbeat.json.
  --js-output <path>     Browser bootstrap JS. Defaults to <tmp-dir>/grok-heartbeat.js.
  --setup <path>         Grok setup receipt. Defaults to <tmp-dir>/grok-build-setup.json.
  --setup-js-output <path>
                         Grok setup browser bootstrap. Defaults to <tmp-dir>/grok-build-setup.js.
  --workflow <path>      Workflow receipt. Defaults to <tmp-dir>/workflow-latest.json.
  --agent-lanes <path>   Agent lane manifest. Defaults to <tmp-dir>/agent-lanes.json.
  --interval-ms <number> Watch interval. Defaults to 30000.
  --self-test            Emit fixture receipts and assert invariants.
  -h, --help             Show this help.
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
      generatedAt: new Date().toISOString(),
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

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_GROK_HEARTBEAT = ${payload};\n`, 'utf8');
  return resolved;
}

function shortHash(value, length = 16) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function isoAgeMs(value, nowMs = Date.now()) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return null;
  return Math.max(0, nowMs - time);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function readProcessNames() {
  const result = process.platform === 'win32'
    ? run('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Get-Process | Select-Object -ExpandProperty ProcessName',
      ])
    : run('ps', ['-axo', 'comm=']);
  if (!result.ok) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean);
}

function grokProcessEvidence(processNames) {
  const matches = processNames
    .filter((name) => name.includes('grok') || name.includes('xai'))
    .slice(0, 12);
  return {
    detected: matches.length > 0,
    matches,
  };
}

function latestObservationFromWorkflow(workflow) {
  if ((workflow?.summary?.workflowKind || workflow?.profile) !== 'grok_build') return null;
  return workflow?.grokObservation || null;
}

function heartbeatStatus({ setup, workflow, observation, observationAgeMs }) {
  const setupStatus = setup?.summary?.status || '';
  const readyForGrokBuild = Boolean(setup?.summary?.readyForGrokBuild);
  const workflowKind = workflow?.summary?.workflowKind || workflow?.profile || '';
  const workflowStatus = workflow?.summary?.status || '';
  const recentObservation = observationAgeMs !== null && observationAgeMs <= OBSERVATION_TTL_MS;

  if (setupStatus === 'blocked') return 'blocked';
  if (workflowKind === 'grok_build' && (recentObservation || ['pending_user_approval', 'completed'].includes(workflowStatus))) {
    return 'observing';
  }
  if (readyForGrokBuild) return 'available';
  if (setupStatus) return 'partial';
  return 'unknown';
}

function setupAuthRuntimeStatus(setup) {
  if (setup?.summary?.authRuntimeStatus) return setup.summary.authRuntimeStatus;
  if (setup?.summary?.authStatus === 'present' && setup?.summary?.modelStatus === 'available') return 'authenticated';
  return setup?.summary?.authStatus || 'unknown';
}

function grokOperatorStatus(setup) {
  const summary = setup?.summary || {};
  const cliReady = summary.cliStatus === 'installed';
  const authReady = summary.authStatus === 'present' || setupAuthRuntimeStatus(setup) === 'authenticated';
  const modelReady = summary.modelStatus === 'available';
  if (!cliReady || !authReady || !modelReady) return 'blocked';
  if (summary.projectTrustStatus === 'trusted' || summary.projectTrusted === true) return 'trusted_ready';
  if (summary.projectTrustStatus === 'untrusted') return 'authenticated_needs_project_trust';
  return 'authenticated_available';
}

function autonomyStatus(setup) {
  return grokOperatorStatus(setup) === 'trusted_ready'
    ? 'eligible_after_workflow_approval'
    : 'blocked_until_project_trust';
}

function presenceStatus(status) {
  if (status === 'observing' || status === 'available') return 'active_or_available';
  if (status === 'blocked') return 'blocked';
  return 'reserved';
}

function createHeartbeat(args) {
  const generatedAt = new Date().toISOString();
  const nowMs = Date.parse(generatedAt);
  const setup = readJson(args.setup, {});
  const workflow = readJson(args.workflow, {});
  const lanes = readJson(args.agentLanes, {});
  const observation = latestObservationFromWorkflow(workflow);
  const observationAgeMs = isoAgeMs(observation?.generatedAt || workflow?.generatedAt || workflow?.createdAt, nowMs);
  const status = heartbeatStatus({ setup, workflow, observation, observationAgeMs });
  const operatorStatus = setup?.summary?.operatorStatus || grokOperatorStatus(setup);
  const authRuntimeStatus = setupAuthRuntimeStatus(setup);
  const grokLane = Array.isArray(lanes?.lanes)
    ? lanes.lanes.find((lane) => lane.laneId === 'grok-build') || null
    : null;
  const processEvidence = grokProcessEvidence(readProcessNames());
  const heartbeatId = `grokhb_${shortHash(`${generatedAt}:${setup?.setupId || ''}:${workflow?.workflowId || ''}`)}`;

  return {
    schemaVersion: SCHEMA_VERSION,
    heartbeatId,
    generatedAt,
    sourceAnchors: {
      source: SOURCE_REF,
      agentPresenceSource: AGENT_SOURCE_REF,
      adapter: ADAPTER_REF,
      setupAdapter: SETUP_ADAPTER_REF,
      agentLaneAdapter: AGENT_ADAPTER_REF,
    },
    lane: {
      laneId: 'grok-build',
      displayName: grokLane?.displayName || 'Grok Build',
      agentKind: 'grok',
      surfaceKind: 'local_coding_agent',
      role: grokLane?.role || 'peer_codebuilder',
      color: grokLane?.color || { name: 'rose', hex: '#F43F5E', ansiSgr: '38;5;203' },
      semanticPrefix: '[lane:grok-build agent:grok surface:local_coding_agent]',
    },
    setup: {
      setupId: setup?.setupId || '',
      status: setup?.summary?.status || 'unknown',
      cliStatus: setup?.summary?.cliStatus || 'unknown',
      cliVersion: setup?.summary?.cliVersion || 'unknown',
      authStatus: setup?.summary?.authStatus || 'unknown',
      authRuntimeStatus,
      authProvider: setup?.summary?.authProvider || setup?.operator?.authProvider || '',
      modelStatus: setup?.summary?.modelStatus || 'unknown',
      requestedModel: setup?.summary?.requestedModel || 'grok-build',
      defaultModel: setup?.summary?.defaultModel || 'unknown',
      heavyAccessStatus: setup?.summary?.heavyAccessStatus || setup?.heavyUpgrade?.status || 'unknown',
      projectTrustStatus: setup?.summary?.projectTrustStatus || 'unknown',
      operatorStatus,
      autonomyStatus: setup?.summary?.autonomyStatus || autonomyStatus(setup),
      readyForGrokBuild: Boolean(setup?.summary?.readyForGrokBuild),
      warningCount: setup?.summary?.warningCount || 0,
    },
    operator: {
      status: operatorStatus,
      cliStatus: setup?.summary?.cliStatus || 'unknown',
      cliVersion: setup?.summary?.cliVersion || 'unknown',
      authStatus: setup?.summary?.authStatus || 'unknown',
      authRuntimeStatus,
      authProvider: setup?.summary?.authProvider || setup?.operator?.authProvider || '',
      modelStatus: setup?.summary?.modelStatus || 'unknown',
      defaultModel: setup?.summary?.defaultModel || 'unknown',
      projectTrustStatus: setup?.summary?.projectTrustStatus || 'unknown',
      autonomyStatus: setup?.summary?.autonomyStatus || autonomyStatus(setup),
      approvalRequiredForMutatingActions: true,
    },
    processEvidence,
    latestWorkflow: {
      workflowId: workflow?.workflowId || '',
      workflowKind: workflow?.summary?.workflowKind || workflow?.profile || '',
      status: workflow?.summary?.status || 'unknown',
      model: workflow?.summary?.model || 'grok-build',
      generatedAt: workflow?.generatedAt || workflow?.createdAt || '',
    },
    latestObservation: observation ? {
      observationId: observation.observationId || '',
      status: observation.summary?.status || 'unknown',
      findingCount: observation.summary?.findingCount || 0,
      primaryFinding: observation.summary?.primaryFinding || '',
      generatedAt: observation.generatedAt || '',
      ageMs: observationAgeMs,
    } : null,
    summary: {
      status,
      agentPresenceStatus: presenceStatus(status),
      laneId: 'grok-build',
      heavyAccessStatus: setup?.summary?.heavyAccessStatus || setup?.heavyUpgrade?.status || 'unknown',
      cliOperatorStatus: operatorStatus,
      authRuntimeStatus,
      authProvider: setup?.summary?.authProvider || setup?.operator?.authProvider || '',
      defaultModel: setup?.summary?.defaultModel || 'unknown',
      autonomyStatus: setup?.summary?.autonomyStatus || autonomyStatus(setup),
      readyForGrokBuild: Boolean(setup?.summary?.readyForGrokBuild),
      processDetected: processEvidence.detected,
      projectTrustStatus: setup?.summary?.projectTrustStatus || 'unknown',
      latestWorkflowStatus: workflow?.summary?.status || 'unknown',
      latestObservationStatus: observation?.summary?.status || 'none',
      latestObservationAgeMs: observationAgeMs,
      latestObservationRecent: observationAgeMs !== null && observationAgeMs <= OBSERVATION_TTL_MS,
      primaryFinding: observation?.summary?.primaryFinding || '',
      receiptRequiredForMutatingActions: true,
      colorIsVisualHintOnly: true,
    },
    output: {
      latestPath: resolveRepoPath(args.output),
      browserBootstrap: resolveRepoPath(args.jsOutput),
    },
  };
}

function refreshAgentLanes(args) {
  const result = run(process.execPath, [
    'scripts/holoshell-agent-lanes.mjs',
    '--output',
    args.agentLanes,
    '--grok-heartbeat',
    args.output,
  ]);
  return {
    status: result.ok ? 'completed' : 'failed',
    stdout: result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-6),
    stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function refreshSetup(args) {
  const result = run(process.execPath, [
    'scripts/holoshell-grok-build-workflow.mjs',
    '--setup-only',
    '--setup-output',
    args.setup,
    '--setup-js-output',
    args.setupJsOutput,
  ]);
  return {
    status: result.ok ? 'completed' : 'failed',
    stdout: result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-6),
    stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function emitOnce(args) {
  if (args.selfTest) seedSelfTest(args);
  const dependentRefresh = {};
  if (args.refreshSetup && !args.selfTest) {
    dependentRefresh.grokBuildSetup = refreshSetup(args);
  }
  const heartbeat = createHeartbeat(args);
  writeJson(args.output, heartbeat);
  writeBrowserBootstrap(args.jsOutput, heartbeat);
  if (args.refreshAgentLanes) {
    dependentRefresh.agentLanes = refreshAgentLanes(args);
  }
  if (Object.keys(dependentRefresh).length) {
    heartbeat.dependentRefresh = dependentRefresh;
    writeJson(args.output, heartbeat);
    writeBrowserBootstrap(args.jsOutput, heartbeat);
  }
  return heartbeat;
}

function fixtureSetup() {
  return {
    schemaVersion: 'hololand.holoshell.grok-build-setup.v0.1.0',
    setupId: 'grok-build-setup-fixture',
    generatedAt: new Date().toISOString(),
    heavyUpgrade: { status: 'active', verifiedAt: new Date().toISOString() },
    summary: {
      status: 'ready',
      cliStatus: 'installed',
      cliVersion: '0.1.211',
      authStatus: 'present',
      modelStatus: 'available',
      requestedModel: 'grok-build',
      heavyAccessStatus: 'active',
      projectTrustStatus: 'trusted',
      readyForGrokBuild: true,
      warningCount: 0,
    },
  };
}

function fixtureWorkflow() {
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: 'hololand.holoshell.workflow.v0.1.0',
    workflowId: 'grok-build-workflow-fixture',
    generatedAt,
    profile: 'grok_build',
    summary: {
      status: 'completed',
      workflowKind: 'grok_build',
      model: 'grok-build',
    },
    grokObservation: {
      schemaVersion: 'hololand.holoshell.grok-observation.v0.1.0',
      observationId: 'grok-observation-fixture',
      generatedAt,
      summary: {
        status: 'completed',
        findingCount: 1,
        primaryFinding: 'Grok heartbeat fixture observed the live lane path.',
      },
    },
  };
}

function fixtureLanes() {
  return {
    schemaVersion: 'hololand.holoshell.agent-lanes.v0.1.0',
    generatedAt: new Date().toISOString(),
    summary: { laneCount: 1, activeLaneCount: 1 },
    lanes: [
      {
        laneId: 'grok-build',
        displayName: 'Grok Build',
        agentKind: 'grok',
        surfaceKind: 'local_coding_agent',
        role: 'peer_codebuilder',
        status: 'active_or_available',
        color: { name: 'rose', hex: '#F43F5E', ansiSgr: '38;5;203' },
      },
    ],
  };
}

function seedSelfTest(args) {
  writeJson(args.setup, fixtureSetup());
  writeJson(args.workflow, fixtureWorkflow());
  writeJson(args.agentLanes, fixtureLanes());
}

function assertSelfTest(heartbeat) {
  const failures = [];
  if (heartbeat.schemaVersion !== SCHEMA_VERSION) failures.push('schema mismatch');
  if (heartbeat.lane.laneId !== 'grok-build') failures.push('expected Grok Build lane');
  if (heartbeat.summary.status !== 'observing') failures.push('expected observing heartbeat');
  if (heartbeat.summary.agentPresenceStatus !== 'active_or_available') failures.push('expected active presence status');
  if (heartbeat.summary.heavyAccessStatus !== 'active') failures.push('expected active Heavy status');
  if (heartbeat.summary.latestObservationStatus !== 'completed') failures.push('expected completed observation');
  if (!heartbeat.latestObservation?.primaryFinding) failures.push('expected primary finding');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let latest = emitOnce(args);
  if (args.selfTest) assertSelfTest(latest);

  while (args.watch) {
    await sleep(args.intervalMs);
    latest = emitOnce(args);
  }

  if (args.json) console.log(JSON.stringify(latest, null, 2));
  else {
    console.log(`HoloShell Grok heartbeat: ${resolveRepoPath(args.output)}`);
    console.log(`Status: ${latest.summary.status}`);
    console.log(`Presence: ${latest.summary.agentPresenceStatus}`);
    console.log(`Heavy: ${latest.summary.heavyAccessStatus}`);
    console.log(`Observation: ${latest.summary.latestObservationStatus}`);
  }
}

main().catch((error) => {
  console.error(`holoshell-grok-heartbeat failed: ${error.message}`);
  process.exit(1);
});
