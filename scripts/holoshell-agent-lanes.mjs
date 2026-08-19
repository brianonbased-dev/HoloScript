#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.agent-lanes.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'agent-lanes.json');
const DEFAULT_GROK_HEARTBEAT = path.join('.tmp', 'holoshell', 'grok-heartbeat.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const RESERVED_LANES = [
  {
    laneId: 'codex-hardware',
    displayName: 'Codex Hardware',
    agentKind: 'codex',
    surfaceKind: 'hardware_shell',
    role: 'local_oracle',
    processHints: ['codex'],
    color: { name: 'electric blue', hex: '#0087D7', ansiSgr: '38;5;33' },
  },
  {
    laneId: 'laptop-hardware',
    displayName: 'Laptop Hardware',
    agentKind: 'hardware',
    surfaceKind: 'windows_laptop',
    role: 'gpu_reasoning_and_validation',
    processHints: ['ollama', 'nvidia-smi', 'codex'],
    color: { name: 'cyan', hex: '#06B6D4', ansiSgr: '38;5;44' },
  },
  {
    laneId: 'claude-desktop',
    displayName: 'Claude Desktop',
    agentKind: 'claude',
    surfaceKind: 'desktop_app',
    role: 'reasoning_partner',
    processHints: ['claude'],
    color: { name: 'copper', hex: '#D97706', ansiSgr: '38;5;208' },
  },
  {
    laneId: 'claude-code',
    displayName: 'Claude Code / Cursor',
    agentKind: 'claude',
    surfaceKind: 'ide',
    role: 'deep_refactor_partner',
    processHints: ['cursor', 'code'],
    color: { name: 'violet', hex: '#7C3AED', ansiSgr: '38;5;99' },
  },
  {
    laneId: 'gemini-antigravity',
    displayName: 'Gemini Antigravity',
    agentKind: 'gemini',
    surfaceKind: 'browser_vision',
    role: 'multimodal_verifier',
    processHints: ['antigravity', 'chrome'],
    color: { name: 'green', hex: '#10B981', ansiSgr: '38;5;35' },
  },
  {
    laneId: 'copilot-vscode',
    displayName: 'Copilot / VS Code',
    agentKind: 'copilot',
    surfaceKind: 'ide_completion',
    role: 'inline_accelerator',
    processHints: ['code'],
    color: { name: 'lime', hex: '#84CC16', ansiSgr: '38;5;112' },
  },
  {
    laneId: 'local-shell',
    displayName: 'Local Shell',
    agentKind: 'shell',
    surfaceKind: 'terminal',
    role: 'command_executor',
    processHints: ['powershell', 'pwsh', 'windowsterminal', 'cmd', 'bash', 'zsh'],
    color: { name: 'amber', hex: '#EAB308', ansiSgr: '38;5;220' },
  },
  {
    laneId: 'grok-build',
    displayName: 'Grok Build',
    agentKind: 'grok',
    surfaceKind: 'local_coding_agent',
    role: 'peer_codebuilder',
    processHints: ['grok', 'xai'],
    color: { name: 'rose', hex: '#F43F5E', ansiSgr: '38;5;203' },
  },
  {
    laneId: 'holomesh-team',
    displayName: 'HoloMesh Team',
    agentKind: 'holomesh',
    surfaceKind: 'network_presence',
    role: 'team_coordination',
    processHints: ['node'],
    color: { name: 'magenta', hex: '#EC4899', ansiSgr: '38;5;205' },
  },
];

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    selfTest: false,
    processScan: true,
    grokHeartbeat: DEFAULT_GROK_HEARTBEAT,
    includeGrokHeartbeat: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--no-process-scan') args.processScan = false;
    else if (arg === '--grok-heartbeat') args.grokHeartbeat = argv[++index];
    else if (arg === '--no-grok-heartbeat') args.includeGrokHeartbeat = false;
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
  console.log(`HoloShell agent lane manifest

Usage:
  node scripts/holoshell-agent-lanes.mjs [options]

Options:
  --json              Print lane manifest JSON.
  --output <path>     Write output path. Defaults to .tmp/holoshell/agent-lanes.json.
  --self-test         Assert lane and color invariants.
  --no-process-scan   Emit reserved lanes without local process evidence.
  --grok-heartbeat <path>
                      Read Grok live heartbeat. Defaults to .tmp/holoshell/grok-heartbeat.json.
  --no-grok-heartbeat Skip Grok heartbeat merge.
  -h, --help          Show this help.
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
  } catch {
    return fallback;
  }
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
    stderr: result.stderr || '',
    error: result.error?.message,
  };
}

function readProcessNames(enabled) {
  if (!enabled) return [];

  const result = process.platform === 'win32'
    ? run('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Get-Process | Select-Object -ExpandProperty ProcessName',
      ])
    : run('ps', ['-axo', 'comm=']);

  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function processEvidenceForLane(lane, processNames) {
  const hints = lane.processHints.map((hint) => hint.toLowerCase());
  const matches = processNames
    .filter((name) => hints.some((hint) => name.includes(hint)))
    .slice(0, 12);
  return {
    detected: matches.length > 0,
    matches,
  };
}

function buildLane(lane, processNames, grokHeartbeat) {
  const processEvidence = processEvidenceForLane(lane, processNames);
  const heartbeatSummary = lane.laneId === 'grok-build' ? grokHeartbeat?.summary || null : null;
  const heartbeatStatus = heartbeatSummary?.agentPresenceStatus || '';
  const status = heartbeatStatus || (processEvidence.detected ? 'active_or_available' : 'reserved');
  return {
    laneId: lane.laneId,
    displayName: lane.displayName,
    agentKind: lane.agentKind,
    surfaceKind: lane.surfaceKind,
    role: lane.role,
    status,
    color: lane.color,
    semanticPrefix: `[lane:${lane.laneId} agent:${lane.agentKind} surface:${lane.surfaceKind}]`,
    terminalPrefix: `\u001b[${lane.color.ansiSgr}m[${lane.displayName}]\u001b[0m`,
    processEvidence,
    ...(heartbeatSummary ? {
      heartbeat: {
        heartbeatId: grokHeartbeat.heartbeatId || '',
        status: heartbeatSummary.status || 'unknown',
        generatedAt: grokHeartbeat.generatedAt || '',
        cliOperatorStatus: heartbeatSummary.cliOperatorStatus || grokHeartbeat.operator?.status || 'unknown',
        authRuntimeStatus: heartbeatSummary.authRuntimeStatus || grokHeartbeat.operator?.authRuntimeStatus || 'unknown',
        authProvider: heartbeatSummary.authProvider || grokHeartbeat.operator?.authProvider || '',
        autonomyStatus: heartbeatSummary.autonomyStatus || grokHeartbeat.operator?.autonomyStatus || 'unknown',
        heavyAccessStatus: heartbeatSummary.heavyAccessStatus || 'unknown',
        readyForGrokBuild: Boolean(heartbeatSummary.readyForGrokBuild),
        latestObservationStatus: heartbeatSummary.latestObservationStatus || 'none',
        latestObservationAgeMs: heartbeatSummary.latestObservationAgeMs ?? null,
        primaryFinding: heartbeatSummary.primaryFinding || '',
      },
    } : {}),
    receiptPolicy: {
      colorIsVisualHintOnly: true,
      requireSemanticLaneId: true,
      requireAgentInstanceIdWhenKnown: true,
      requireReceiptForMutatingActions: true,
    },
  };
}

function createManifest(args) {
  const processNames = readProcessNames(args.processScan);
  const grokHeartbeat = args.includeGrokHeartbeat ? readJson(args.grokHeartbeat, null) : null;
  const lanes = RESERVED_LANES.map((lane) => buildLane(lane, processNames, grokHeartbeat));
  const heartbeatLaneCount = lanes.filter((lane) => lane.heartbeat).length;
  const grokLane = lanes.find((lane) => lane.laneId === 'grok-build');

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-agent-presence-lanes.hsplus',
      doc: 'apps/holoshell/docs/AGENT_PRESENCE_COLOR_LANES.md',
      roadmap: 'apps/holoshell/docs/PHASE_1_ROADMAP.md',
    },
    summary: {
      laneCount: lanes.length,
      activeLaneCount: lanes.filter((lane) => lane.status === 'active_or_available').length,
      colorLaneCount: new Set(lanes.map((lane) => lane.color.hex)).size,
      semanticLaneCount: lanes.filter((lane) => lane.semanticPrefix.includes(`lane:${lane.laneId}`)).length,
      heartbeatLaneCount,
      grokHeartbeatStatus: grokLane?.heartbeat?.status || 'none',
      grokHeartbeatObservationStatus: grokLane?.heartbeat?.latestObservationStatus || 'none',
      grokCliOperatorStatus: grokLane?.heartbeat?.cliOperatorStatus || 'none',
      grokCliAuthRuntimeStatus: grokLane?.heartbeat?.authRuntimeStatus || 'none',
      grokCliAuthProvider: grokLane?.heartbeat?.authProvider || '',
      grokAutonomyStatus: grokLane?.heartbeat?.autonomyStatus || 'none',
    },
    rules: [
      'Color is a human-visible lane cue, not the machine-readable truth.',
      'Agents consume laneId, agentKind, surfaceKind, and receipt metadata.',
      'ANSI text may be used for terminals, but every colored message must also carry a semantic prefix.',
      'Each active agent instance should get a stable lane derived from agent identity and surface kind.',
      'HoloShell becomes more capable as active lane count and trusted receipt count increase.',
    ],
    lanes,
  };
}

function writeManifest(manifest, outputPath) {
  const resolved = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertSelfTest(manifest) {
  const failures = [];
  if (manifest.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (manifest.summary.laneCount < 6) failures.push('expected at least six reserved lanes');
  if (manifest.summary.colorLaneCount !== manifest.summary.laneCount) failures.push('lane colors must be unique');
  if (manifest.summary.semanticLaneCount !== manifest.summary.laneCount) failures.push('every lane needs semantic prefix');
  if (!manifest.lanes.some((lane) => lane.laneId === 'codex-hardware')) failures.push('missing Codex hardware lane');
  if (!manifest.lanes.some((lane) => lane.laneId === 'laptop-hardware')) failures.push('missing laptop hardware lane');
  if (!manifest.lanes.some((lane) => lane.laneId === 'local-shell')) failures.push('missing local shell lane');
  if (!manifest.lanes.some((lane) => lane.laneId === 'grok-build')) failures.push('missing Grok Build lane');
  const grokLane = manifest.lanes.find((lane) => lane.laneId === 'grok-build');
  if (grokLane?.heartbeat && grokLane.heartbeat.status === 'unknown') failures.push('Grok heartbeat status cannot be unknown when attached');
  if (manifest.lanes.some((lane) => !lane.receiptPolicy.colorIsVisualHintOnly)) {
    failures.push('color must be marked as visual hint only');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const manifest = createManifest(args);
  const output = writeManifest(manifest, args.output);
  if (args.selfTest) assertSelfTest(manifest);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`HoloShell agent lanes: ${output}`);
    console.log(`Lanes: ${manifest.summary.activeLaneCount}/${manifest.summary.laneCount} active or available`);
    console.log(`Colors: ${manifest.summary.colorLaneCount}`);
    console.log(`Semantic prefixes: ${manifest.summary.semanticLaneCount}`);
  }
} catch (error) {
  console.error(`holoshell-agent-lanes failed: ${error.message}`);
  process.exit(1);
}
