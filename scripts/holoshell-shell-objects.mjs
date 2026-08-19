#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.shell-objects.v0.1.0';
const DEFAULT_TMP_DIR = '.tmp/holoshell';
const DEFAULT_OUTPUT = '.tmp/holoshell/shell-objects.json';
const DEFAULT_JS_OUTPUT = '.tmp/holoshell/shell-objects.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP_DIR,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    maxPrograms: 18,
    maxWindows: 8,
    maxAgents: 6,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--max-programs') args.maxPrograms = Number(argv[++index] || args.maxPrograms);
    else if (arg === '--max-windows') args.maxWindows = Number(argv[++index] || args.maxWindows);
    else if (arg === '--max-agents') args.maxAgents = Number(argv[++index] || args.maxAgents);
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
  console.log(`Usage:
  node scripts/holoshell-shell-objects.mjs [options]

Options:
  --tmp-dir <dir>         HoloShell temp feed directory. Default: ${DEFAULT_TMP_DIR}
  --output <file>         JSON output path. Default: ${DEFAULT_OUTPUT}
  --js-output <file>      Browser bootstrap output path. Default: ${DEFAULT_JS_OUTPUT}
  --max-programs <n>      Max launchable app objects to surface. Default: 18
  --max-windows <n>       Max captured/running windows to surface. Default: 8
  --max-agents <n>        Max agent lanes to surface. Default: 6
  --json                  Print the full graph as JSON.
  --self-test             Build a fixture graph and assert expected objects.
`);
}

function resolveRepoPath(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return { ...fallback, readError: error.message };
  }
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, graph) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = `window.HOLOSHELL_SHELL_OBJECTS = ${JSON.stringify(graph, null, 2)};\n`;
  writeFileSync(resolved, payload, 'utf8');
  return resolved;
}

function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 14);
}

function slug(value) {
  return String(value || 'object')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'object';
}

function normalizeName(value) {
  const text = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(google )?chrome$/.test(text) || text === 'chrome') return 'google chrome';
  if (/^(microsoft )?edge$/.test(text) || text === 'msedge') return 'microsoft edge';
  if (/^(microsoft )?word$/.test(text) || text === 'winword') return 'microsoft word';
  if (/^(visual studio code|vs code|code)$/.test(text)) return 'visual studio code';
  if (/^(windows )?powershell( \(x86\))?$/.test(text)) return 'windows powershell';
  return text;
}

function glyphFor(name, fallback = 'O') {
  const words = String(name || '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function displayNameForProgram(program) {
  const key = normalizeName(program.displayName);
  const canonical = {
    'google chrome': 'Google Chrome',
    'microsoft edge': 'Microsoft Edge',
    'visual studio code': 'Visual Studio Code',
    'windows powershell': 'Windows PowerShell',
    'microsoft word': 'Word',
  };
  if (canonical[key]) return canonical[key];
  if (String(program.displayName || '').toUpperCase() === 'MSACCESS') return 'Access';
  return program.displayName || 'Program';
}

function capabilityFamilyForProgram(program) {
  const klass = program.capabilityClass || 'application';
  if (klass === 'browser') return 'web';
  if (klass === 'productivity') return 'documents';
  if (klass === 'developer_tool' || klass === 'command_tool') return 'developer';
  if (klass === 'creative_tool') return 'creative';
  if (klass === 'system') return 'system';
  if (klass === 'game') return 'games';
  return 'apps';
}

function objectKindForProgram(program) {
  const klass = program.capabilityClass || 'application';
  if (klass === 'browser') return 'browser_surface';
  if (klass === 'command_tool') return 'terminal_surface';
  if (klass === 'developer_tool') return 'developer_surface';
  if (klass === 'productivity') return 'document_app';
  return 'program';
}

function visualFormForProgram(program) {
  const klass = program.capabilityClass || 'application';
  if (klass === 'browser') return 'portal_bubble';
  if (klass === 'command_tool' || klass === 'developer_tool') return 'terminal_bubble';
  if (klass === 'productivity') return 'document_machine';
  return 'app_bubble';
}

function browserBoundaryForProgram(program, fallbackUrl = '') {
  if ((program?.capabilityClass || '') !== 'browser' && !fallbackUrl) return null;
  return {
    boundaryVersion: 'hololand.holoshell.browser-boundary.v0.1.0',
    browser: program?.displayName || 'system_default_browser',
    profileBoundary: 'not_selected_until_approval',
    sessionBoundary: 'default_private_or_temporary_required_by_intent',
    urlClassification: fallbackUrl ? 'public_web' : 'browser_surface_unclassified',
    publicBrowsing: Boolean(fallbackUrl),
    credentialAdjacent: false,
    accountMutation: false,
    cookiePolicy: 'explicit_profile_boundary_required_before_account_use',
    screenshotPolicy: 'local_receipts_allowed_for_public_pages_redact_credentials',
    formSubmitPolicy: 'break_glass',
    downloadUploadPolicy: 'blocked_until_specific_approval',
    screenshotLocality: 'local_receipt_only',
  };
}

function scoreProgram(program) {
  const name = String(program.displayName || '').toLowerCase();
  let score = 0;
  if (hasMeaningfulRunningWindow(program)) score += 120;
  if (program.launchable) score += 18;
  if (program.source === 'app_paths') score += 4;

  const classScores = {
    browser: 42,
    command_tool: 38,
    developer_tool: 34,
    productivity: 32,
    creative_tool: 18,
    application: 10,
    system: 4,
  };
  score += classScores[program.capabilityClass] || 8;

  const importantNames = [
    ['excel', 55],
    ['chrome', 50],
    ['edge', 36],
    ['terminal', 44],
    ['powershell', 42],
    ['cursor', 40],
    ['visual studio code', 38],
    ['code', 28],
    ['claude', 38],
    ['ollama', 36],
    ['word', 34],
    ['access', 20],
    ['notepad', 18],
    ['youtube', 20],
  ];
  for (const [needle, weight] of importantNames) {
    if (name.includes(needle)) score += weight;
  }

  const lowerPriority = ['uninstall', 'readme', 'documentation', 'help', 'license', 'x86', 'wow', 'ise', 'software development kit'];
  for (const needle of lowerPriority) {
    if (name.includes(needle)) score -= 24;
  }
  return score;
}

function hasMeaningfulRunningWindow(program) {
  const title = String(program.runningWindowTitle || '').trim().toLowerCase();
  if (!program.runningWindowId && !title) return false;
  if (!title) return true;
  return !['program manager', 'default ime'].includes(title);
}

function dedupePrograms(programs) {
  const byName = new Map();
  for (const program of programs) {
    const key = normalizeName(program.displayName);
    const current = byName.get(key);
    if (!current || scoreProgram(program) > scoreProgram(current)) byName.set(key, program);
  }
  return [...byName.values()];
}

const layoutSlots = [
  { x: 59, y: 15, size: 112 },
  { x: 75, y: 26, size: 100 },
  { x: 18, y: 24, size: 104 },
  { x: 66, y: 45, size: 106 },
  { x: 31, y: 51, size: 102 },
  { x: 82, y: 58, size: 96 },
  { x: 15, y: 68, size: 96 },
  { x: 49, y: 72, size: 100 },
  { x: 38, y: 17, size: 92 },
  { x: 8, y: 42, size: 90 },
  { x: 73, y: 72, size: 90 },
  { x: 45, y: 35, size: 92 },
  { x: 86, y: 10, size: 86 },
  { x: 27, y: 78, size: 86 },
  { x: 4, y: 10, size: 84 },
  { x: 88, y: 40, size: 84 },
  { x: 52, y: 87, size: 86 },
  { x: 22, y: 9, size: 86 },
];

const sovereignRoomTargets = [
  { slug: 'local', label: 'Local Tagged Tasks', taskLane: 'local', taskTag: 'local' },
  { slug: 'sovereign', label: 'Sovereign Tagged Tasks', taskLane: 'local', taskTag: 'local' },
  { slug: 'cloud', label: 'Cloud Tagged Tasks', taskLane: 'cloud', taskTag: 'cloud', requiresEscalation: true },
];

function layout(index, fallbackSize = 92) {
  const slot = layoutSlots[index % layoutSlots.length] || {};
  const cycle = Math.floor(index / layoutSlots.length);
  return {
    x: slot.x ?? (8 + ((index * 17) % 80)),
    y: slot.y ?? (8 + ((index * 23) % 78)),
    size: Math.max(76, (slot.size || fallbackSize) - cycle * 4),
  };
}

function baseShellObjects({ brittneyAvatar, wildHoloScript, goldCodebaseBridge, founderHost, nativeWrapper, startupIntegration, serviceSupervisor, grokBuild, grokHeartbeat, agentDispatch, workflow, sovereignRoomMarathon, hardwareApproval, trustLedger, workflowApproval, workflowIntentGate, shardWorkflow, shardImportApproval, shardImport, photoBackupCustody }) {
  const avatarSummary = brittneyAvatar?.summary || {};
  const wildSummary = wildHoloScript?.summary || {};
  const goldCodebaseSummary = goldCodebaseBridge?.summary || {};
  const founderHostSummary = founderHost?.summary || {};
  const nativeWrapperSummary = nativeWrapper?.summary || {};
  const startupIntegrationSummary = startupIntegration?.summary || {};
  const serviceSupervisorSummary = serviceSupervisor?.summary || {};
  const serviceSupervisorReceipt = serviceSupervisor?.receipt || {};
  const grokBuildSummary = grokBuild?.summary || {};
  const dispatchSummary = agentDispatch?.summary || {};
  const workflowSummary = workflow?.summary || {};
  const sovereignSummary = sovereignRoomMarathon?.summary || {};
  const shardSummary = shardWorkflow?.summary || {};
  const shardApprovalSummary = shardImportApproval?.summary || {};
  const shardImportSummary = shardImport?.summary || {};
  const photoBackupSummary = photoBackupCustody?.summary || {};
  const hardwareApprovalSummary = hardwareApproval?.summary || {};
  const trustSummary = trustLedger?.summary || {};
  const workflowApprovalSummary = workflowApproval?.summary || {};
  const gateSummary = workflowIntentGate?.summary || {};
  const activeWorkflowKind = workflowSummary.workflowKind || workflow?.profile || '';
  const roomWorkflowSummary = !activeWorkflowKind || activeWorkflowKind === 'room_marathon' ? workflowSummary : {};
  const grokWorkflowSummary = activeWorkflowKind === 'grok_build' ? workflowSummary : {};
  const grokObservation = activeWorkflowKind === 'grok_build' ? workflow?.grokObservation || null : null;
  const roomWorkflowApprovalSummary = !activeWorkflowKind || activeWorkflowKind === 'room_marathon' ? workflowApprovalSummary : {};
  const roomGateSummary = !activeWorkflowKind || activeWorkflowKind === 'room_marathon' ? gateSummary : {};
  return [
    {
      id: 'shell.hololand',
      objectKind: 'operating_world',
      displayName: 'HoloLand',
      sourceKind: 'holoscript',
      sourceRef: 'apps/holoshell/source/holoshell-shell-world.holo',
      capabilityFamily: 'operating_world',
      trustState: 'verified',
      permissionEnvelope: 'read_only',
      adapterPath: 'holo_shell_world',
      visualForm: 'world_anchor',
      status: 'running',
      actorLaneId: 'brittney',
      receiptTypes: ['shell_object_graph', 'live_feed'],
      relationships: { replaces: ['desktop', 'launcher', 'taskbar', 'window_manager'] },
      privacyClass: 'local_private',
      replacementPath: 'native_os_shell',
      glyph: 'HL',
      detail: 'The computer surface becomes the HoloLand operating world.',
      firstScreen: true,
      layout: { x: 39, y: 12, size: 160 },
    },
    {
      id: 'host.founder-holoshell',
      objectKind: 'native_host',
      displayName: 'Founder Host',
      sourceKind: 'holoscript',
      sourceRef: founderHost?.sourceAnchors?.source || 'apps/holoshell/source/holoshell-founder-host.hsplus',
      capabilityFamily: 'founder_host',
      trustState: founderHostSummary.nativeWrapperPresent
        ? 'verified'
        : founderHostSummary.status === 'ready_for_native_wrapper'
          ? 'partial'
          : 'unknown',
      permissionEnvelope: 'read_only',
      adapterPath: founderHost?.sourceAnchors?.adapter || 'scripts/holoshell-founder-host.mjs',
      visualForm: 'host_boot_ring',
      status: founderHostSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['founder_host_receipt', 'service_supervisor_receipt', 'shell_object_graph', 'live_feed'],
      relationships: {
        primarySurfaceOwnership: founderHostSummary.primarySurfaceOwnership || 'unknown',
        sourceReady: Boolean(founderHostSummary.sourceReady),
        previewHostReady: Boolean(founderHostSummary.previewHostReady),
        nativeWrapperPresent: Boolean(founderHostSummary.nativeWrapperPresent),
        startupIntegrationPresent: Boolean(founderHostSummary.startupIntegrationPresent),
        shellObjectGraphReady: Boolean(founderHostSummary.shellObjectGraphReady),
        liveFeedReady: Boolean(founderHostSummary.liveFeedReady),
        serviceSupervisorReady: Boolean(founderHostSummary.serviceSupervisorReady),
        localMutationExecutionEnabled: Boolean(founderHostSummary.localMutationExecutionEnabled),
        nextMove: founderHostSummary.nextMove || 'build_native_wrapper',
      },
      privacyClass: 'local_private',
      replacementPath: 'native_shell_host',
      glyph: 'FH',
      detail: `Founder host ${founderHostSummary.status || 'unknown'}; primary surface ${founderHostSummary.primarySurfaceOwnership || 'unknown'}; native wrapper ${founderHostSummary.nativeWrapperPresent ? 'present' : 'missing'}.`,
      firstScreen: true,
      layout: { x: 44, y: 4, size: 110 },
    },
    {
      id: 'host.native-wrapper',
      objectKind: 'native_wrapper',
      displayName: 'Native Wrapper',
      sourceKind: 'holoscript',
      sourceRef: nativeWrapper?.sourceAnchors?.source || 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
      capabilityFamily: 'native_wrapper',
      trustState: nativeWrapperSummary.launchable ? 'partial' : 'unknown',
      permissionEnvelope: 'user_launch',
      adapterPath: nativeWrapper?.sourceAnchors?.adapter || 'scripts/holoshell-native-wrapper.mjs',
      visualForm: 'native_window_frame',
      status: nativeWrapperSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['native_wrapper_receipt', 'founder_host_receipt', 'native_wrapper_launch_receipt'],
      relationships: {
        launcherPresent: Boolean(nativeWrapperSummary.launcherPresent),
        commandShimPresent: Boolean(nativeWrapperSummary.commandShimPresent),
        previewHostPresent: Boolean(nativeWrapperSummary.previewHostPresent),
        browserCandidateCount: nativeWrapperSummary.browserCandidateCount || 0,
        primaryBrowserFamily: nativeWrapperSummary.primaryBrowserFamily || 'none',
        launchMode: nativeWrapperSummary.launchMode || '',
        launchable: Boolean(nativeWrapperSummary.launchable),
        startsWithoutManualHtml: Boolean(nativeWrapperSummary.startsWithoutManualHtml),
        startupIntegrationPresent: Boolean(nativeWrapperSummary.startupIntegrationPresent),
        localMutationExecutionEnabled: Boolean(nativeWrapperSummary.localMutationExecutionEnabled),
        nextMove: nativeWrapperSummary.nextMove || 'wire_startup_integration_with_approval',
      },
      privacyClass: 'local_private',
      replacementPath: 'native_shell_wrapper',
      launch: { action: 'launch_native_wrapper', route: 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1' },
      glyph: 'NW',
      detail: `Native wrapper ${nativeWrapperSummary.status || 'unknown'}; launchable ${nativeWrapperSummary.launchable ? 'yes' : 'no'}; startup ${nativeWrapperSummary.startupIntegrationPresent ? 'present' : 'missing'}.`,
      firstScreen: true,
      layout: { x: 68, y: 10, size: 104 },
    },
    {
      id: 'host.startup-integration',
      objectKind: 'startup_integration',
      displayName: 'Startup Gate',
      sourceKind: 'holoscript',
      sourceRef: startupIntegration?.sourceAnchors?.source || 'apps/holoshell/source/holoshell-startup-integration.hsplus',
      capabilityFamily: 'startup_integration',
      trustState: startupIntegrationSummary.startupRegistered
        ? 'verified'
        : startupIntegrationSummary.startupIntegrationPresent
          ? 'partial'
          : 'unknown',
      permissionEnvelope: 'approval_required',
      adapterPath: startupIntegration?.sourceAnchors?.adapter || 'scripts/holoshell-startup-integration.mjs',
      visualForm: 'startup_gate',
      status: startupIntegrationSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['startup_integration_receipt', 'startup_registration_receipt', 'native_wrapper_receipt'],
      relationships: {
        startupIntegrationPresent: Boolean(startupIntegrationSummary.startupIntegrationPresent),
        registrationScriptPresent: Boolean(startupIntegrationSummary.registrationScriptPresent),
        nativeLauncherPresent: Boolean(startupIntegrationSummary.nativeLauncherPresent),
        startupMode: startupIntegrationSummary.startupMode || '',
        startupFolderReachable: Boolean(startupIntegrationSummary.startupFolderReachable),
        startupRegistered: Boolean(startupIntegrationSummary.startupRegistered),
        approvalRequired: Boolean(startupIntegrationSummary.approvalRequired),
        localMutationExecutionEnabled: Boolean(startupIntegrationSummary.localMutationExecutionEnabled),
        nextMove: startupIntegrationSummary.nextMove || 'render_startup_approval_card',
      },
      privacyClass: 'local_private',
      replacementPath: 'login_start_gate',
      launch: { action: 'approve_startup_registration', route: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1 -Register -Approve' },
      glyph: 'SG',
      detail: `Startup integration ${startupIntegrationSummary.status || 'unknown'}; registered ${startupIntegrationSummary.startupRegistered ? 'yes' : 'no'}; approval ${startupIntegrationSummary.approvalRequired ? 'required' : 'unknown'}.`,
      firstScreen: true,
      layout: { x: 78, y: 22, size: 96 },
    },
    {
      id: 'assistant.brittney',
      objectKind: 'assistant_avatar',
      displayName: 'Brittney',
      sourceKind: 'holoscript',
      sourceRef: 'apps/holoshell/source/holoshell-brittney-avatar.hsplus',
      capabilityFamily: 'assistant',
      trustState: avatarSummary.runtimeStatus === 'available' ? 'verified' : 'partial',
      permissionEnvelope: 'intent_scoped',
      adapterPath: 'aibrittney_runtime_bridge',
      visualForm: 'avatar_anchor',
      status: avatarSummary.avatarStatus || 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['brittney_avatar_manifest', 'brittney_turn_receipt'],
      relationships: {
        runtimeStatus: avatarSummary.runtimeStatus || 'unknown',
        emotion: avatarSummary.emotion || 'attentive',
        voiceState: avatarSummary.voiceState || 'ready',
      },
      privacyClass: 'local_private',
      replacementPath: 'assistant_presence',
      glyph: 'AI',
      detail: `Brittney avatar ${avatarSummary.avatarStatus || 'unknown'}; runtime ${avatarSummary.runtimeStatus || 'unknown'}.`,
      firstScreen: true,
      layout: { x: 54, y: 68, size: 126 },
    },
    {
      id: 'workflow.agent-dispatch',
      objectKind: 'workflow',
      displayName: 'Agent Dispatch',
      sourceKind: 'workflow',
      sourceRef: 'scripts/holoshell-agent-dispatch.mjs',
      capabilityFamily: 'agent_dispatch',
      trustState: dispatchSummary.status === 'ready_to_stage' ? 'partial' : dispatchSummary.status === 'blocked' ? 'unknown' : 'verified',
      permissionEnvelope: 'intent_scoped',
      adapterPath: 'brittney_intent_to_guarded_route',
      visualForm: 'dispatch_bubble',
      status: dispatchSummary.status || 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['agent_dispatch_receipt', 'workflow_receipt', 'hardware_action_receipt'],
      relationships: {
        capabilityId: dispatchSummary.capabilityId || '',
        capabilityLabel: dispatchSummary.capabilityLabel || '',
        dispatchKind: dispatchSummary.dispatchKind || '',
        route: dispatchSummary.route || '',
        confidence: dispatchSummary.confidence || 0,
        selectedAgent: dispatchSummary.selectedAgentSlug || '',
        actionKind: dispatchSummary.actionKind || '',
        targetApp: dispatchSummary.targetApp || '',
        approvalRequired: Boolean(dispatchSummary.approvalRequired),
      },
      privacyClass: 'local_private',
      replacementPath: 'plain_language_to_operator_route',
      launch: { action: 'stage_agent_dispatch', route: '/workflow/agent-dispatch' },
      glyph: 'AD',
      detail: dispatchSummary.capabilityLabel
        ? `${dispatchSummary.capabilityLabel}; ${dispatchSummary.dispatchKind || 'dispatch'}; route ${dispatchSummary.route || 'none'}; confidence ${dispatchSummary.confidence || 0}.`
        : 'Brittney routes plain-language requests into guarded HoloShell workflows and hardware actions.',
      firstScreen: true,
      layout: { x: 26, y: 66, size: 108 },
    },
    {
      id: 'service.supervisor',
      objectKind: 'service_supervisor',
      displayName: 'Services',
      sourceKind: 'holoscript_service',
      sourceRef: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
      capabilityFamily: 'service_supervisor',
      trustState: (serviceSupervisorSummary.requiredAttentionCount || serviceSupervisorSummary.actionRequiredCount)
        ? 'partial'
        : serviceSupervisorSummary.status === 'unknown'
          ? 'unknown'
          : 'verified',
      permissionEnvelope: 'read_only',
      adapterPath: 'holoshell_service_supervisor',
      visualForm: 'service_supervisor_bubble',
      status: serviceSupervisorSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['service_supervisor_receipt', 'network_sentinel_service_receipt', 'grok_heartbeat_receipt'],
      relationships: {
        requestedAction: serviceSupervisorSummary.requestedAction || 'status',
        serviceCount: serviceSupervisorSummary.serviceCount || 0,
        requiredServiceCount: serviceSupervisorSummary.requiredServiceCount || 0,
        requiredOnlineServiceCount: serviceSupervisorSummary.requiredOnlineServiceCount || 0,
        requiredAttentionCount: serviceSupervisorSummary.requiredAttentionCount || 0,
        optionalOfflineServiceCount: serviceSupervisorSummary.optionalOfflineServiceCount || 0,
        actionRequiredCount: serviceSupervisorSummary.actionRequiredCount || 0,
        managedPidServiceCount: serviceSupervisorSummary.managedPidServiceCount || 0,
        verifiedPidServiceCount: serviceSupervisorSummary.verifiedPidServiceCount || 0,
        heartbeatOnlyServiceCount: serviceSupervisorSummary.heartbeatOnlyServiceCount || 0,
        localDaemonServiceCount: serviceSupervisorSummary.localDaemonServiceCount || 0,
        serviceMutationTaken: Boolean(serviceSupervisorSummary.serviceMutationTaken),
        destructiveActionsTaken: Boolean(serviceSupervisorReceipt.destructiveActionsTaken),
        nextRequiredAction: serviceSupervisorSummary.nextRequiredAction || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'local_service_registry',
      glyph: 'SV',
      detail: `Services ${serviceSupervisorSummary.status || 'unknown'}; required ${serviceSupervisorSummary.requiredOnlineServiceCount || 0}/${serviceSupervisorSummary.requiredServiceCount || 0}; optional offline ${serviceSupervisorSummary.optionalOfflineServiceCount || 0}; actions ${serviceSupervisorSummary.actionRequiredCount || 0}.`,
      firstScreen: true,
      layout: { x: 58, y: 84, size: 104 },
    },
    {
      id: 'source.wild-holoscript.uaa2',
      objectKind: 'source_corpus',
      displayName: 'Wild HoloScript',
      sourceKind: 'holoscript_corpus',
      sourceRef: wildHoloScript?.source?.script || 'scripts/holoshell-wild-holoscript-intake.mjs',
      capabilityFamily: 'source_corpus',
      trustState: (wildSummary.adapterNeededCount || 0) > 0 ? 'partial' : wildSummary.status === 'scanned' ? 'verified' : 'unknown',
      permissionEnvelope: 'read_only',
      adapterPath: 'wild_holoscript_intake_adapter',
      visualForm: 'source_orbit',
      status: wildSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['wild_holoscript_intake_receipt', 'wild_module_promotion_receipt'],
      relationships: {
        rootName: wildHoloScript?.source?.rootName || 'uaa2-service',
        fileCount: wildSummary.fileCount || 0,
        holoCount: wildSummary.holoCount || 0,
        hsCount: wildSummary.hsCount || 0,
        hsplusCount: wildSummary.hsplusCount || 0,
        holoFeatureCount: wildSummary.holoFeatureCount || 0,
        hsFeatureCount: wildSummary.hsFeatureCount || 0,
        hsplusFeatureCount: wildSummary.hsplusFeatureCount || 0,
        holoTopFeature: wildSummary.holoTopFeature || '',
        hsTopFeature: wildSummary.hsTopFeature || '',
        hsplusTopFeature: wildSummary.hsplusTopFeature || '',
        frontierSyntaxCount: wildSummary.frontierSyntaxCount || 0,
        adapterNeededCount: wildSummary.adapterNeededCount || 0,
        canonicalCandidateCount: wildSummary.canonicalCandidateCount || 0,
        topPattern: wildSummary.topPattern || '',
        nextMove: wildSummary.nextMove || '',
        formatProfiles: (wildHoloScript?.formatProfiles || []).map((profile) => ({
          extension: profile.extension,
          role: profile.role,
          uniqueFeatureCount: profile.uniqueFeatureCount || 0,
          topFeature: profile.topFeature || '',
        })),
        flagshipPaths: (wildHoloScript?.topFlagships || []).slice(0, 5).map((item) => item.path),
      },
      privacyClass: 'local_private',
      replacementPath: 'promote_wild_holoscript_to_shell_modules',
      glyph: 'WH',
      detail: `${wildSummary.fileCount || 0} wild HoloScript files; .holo ${wildSummary.holoFeatureCount || 0} features, .hs ${wildSummary.hsFeatureCount || 0}, .hsplus ${wildSummary.hsplusFeatureCount || 0}; ${wildSummary.adapterNeededCount || 0} need adapters.`,
      firstScreen: wildSummary.status === 'scanned',
      layout: { x: 19, y: 28, size: 108 },
    },
    {
      id: 'source.holoscript-gold-codebase',
      objectKind: 'source_corpus',
      displayName: 'GOLD + Codebase',
      sourceKind: 'holoscript_substrate',
      sourceRef: goldCodebaseBridge?.sourceAnchors?.adapter || 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs',
      capabilityFamily: 'source_substrate',
      trustState: goldCodebaseSummary.status === 'ready' ? 'verified' : goldCodebaseSummary.status === 'blocked' ? 'unknown' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'gold_codebase_substrate_bridge',
      visualForm: 'source_orbit',
      status: goldCodebaseSummary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['holoscript_gold_codebase_bridge', 'gold_drive_receipt', 'codebase_graph_receipt'],
      relationships: {
        goldStatus: goldCodebaseSummary.goldStatus || 'unknown',
        goldRootPresent: Boolean(goldCodebaseSummary.goldRootPresent),
        goldEntryCount: goldCodebaseSummary.goldEntryCount || 0,
        goldTierCount: goldCodebaseSummary.goldTierCount || 0,
        goldHotEntryCount: goldCodebaseSummary.goldHotEntryCount || 0,
        conflictPolicy: goldCodebaseSummary.goldConflictPolicy || 'diamond_over_platinum_over_gold_over_knowledge_store',
        codebaseStatus: goldCodebaseSummary.codebaseStatus || 'unknown',
        codebaseToolCount: goldCodebaseSummary.codebaseToolCount || 0,
        graphCacheProtocol: goldCodebaseSummary.graphCacheProtocol || 'unknown',
        surfaceMapStatus: goldCodebaseSummary.surfaceMapStatus || 'unknown',
        formatInventoryStatus: goldCodebaseSummary.formatInventoryStatus || 'unknown',
        queryTemplates: (goldCodebaseBridge?.queryTemplates || []).slice(0, 6),
        hotGoldEntries: (goldCodebaseBridge?.goldDrive?.hotEntries || []).slice(0, 6).map((entry) => ({
          path: entry.path,
          tier: entry.tier,
          title: entry.title,
          ids: entry.ids || [],
        })),
      },
      privacyClass: 'local_private',
      replacementPath: 'ask_existing_substrate_before_new_build',
      glyph: 'GC',
      detail: `GOLD ${goldCodebaseSummary.goldStatus || 'unknown'} with ${goldCodebaseSummary.goldEntryCount || 0} indexed entries; HoloScript codebase ${goldCodebaseSummary.codebaseStatus || 'unknown'} with ${goldCodebaseSummary.codebaseToolCount || 0} tools; graph ${goldCodebaseSummary.graphCacheProtocol || 'unknown'}.`,
      firstScreen: Boolean(goldCodebaseSummary.goldRootPresent || goldCodebaseSummary.codebaseToolCount),
      layout: { x: 9, y: 18, size: 116 },
    },
    {
      id: 'workflow.room-marathon',
      objectKind: 'workflow',
      displayName: 'Room Marathon',
      sourceKind: 'workflow',
      sourceRef: 'scripts/holoshell-room-marathon-workflow.mjs',
      capabilityFamily: 'agent_workflow',
      trustState: roomWorkflowSummary.status === 'pending_user_approval' ? 'partial' : 'verified',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'workflow_approval_and_brain_intent_gate',
      visualForm: 'workflow_bubble',
      status: roomWorkflowSummary.status || 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['workflow_receipt', 'workflow_approval_bundle', 'brain_intent_gate_receipt'],
      relationships: {
        model: roomWorkflowSummary.model || 'sovereign-local',
        modelRoute: roomWorkflowSummary.modelRoute || 'sovereign_local',
        taskLane: roomWorkflowSummary.taskLane || 'local',
        taskTag: roomWorkflowSummary.taskTag || 'local',
        cloudEscalationAllowed: Boolean(roomWorkflowSummary.cloudEscalationAllowed),
        sovereignRoomMarathonReceipt: roomWorkflowSummary.sovereignRoomMarathonReceipt || '.tmp/holoshell/sovereign-room-marathon-latest.json',
        approvalStatus: roomWorkflowApprovalSummary.status || 'unknown',
        brainGateStatus: roomGateSummary.status || 'unknown',
      },
      privacyClass: 'local_private',
      replacementPath: 'compound_workflow_object',
      launch: { action: 'stage_room_marathon_workflow', route: '/workflow/room-marathon' },
      glyph: 'RM',
      detail: `${roomWorkflowSummary.stepCount || 0} staged steps; approval ${roomWorkflowApprovalSummary.status || 'unknown'}; brain gate ${roomGateSummary.status || 'unknown'}.`,
      firstScreen: true,
      layout: { x: 77, y: 63, size: 118 },
    },
    {
      id: 'workflow.sovereign-room-marathon',
      objectKind: 'workflow',
      displayName: 'Sovereign Room',
      sourceKind: 'holoscript_workflow',
      sourceRef: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
      capabilityFamily: 'agent_workflow',
      trustState: sovereignSummary.status === 'ready_to_claim' || sovereignSummary.status === 'empty' ? 'verified' : sovereignSummary.status === 'claimed' ? 'partial' : 'unknown',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'scripts/holoshell-sovereign-room-marathon.mjs',
      visualForm: 'workflow_bubble',
      status: sovereignSummary.status || 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['sovereign_room_marathon_receipt', 'room_queue_receipt'],
      relationships: {
        taskLane: sovereignSummary.taskLane || 'local',
        taskTag: sovereignSummary.taskTag || 'local',
        cloudEscalationAllowed: Boolean(sovereignSummary.cloudEscalationAllowed),
        queueOpenCount: sovereignSummary.queueOpenCount || 0,
        queueClaimableOpenCount: sovereignSummary.queueClaimableOpenCount || 0,
        matchedCandidateCount: sovereignSummary.matchedCandidateCount || 0,
        selectedTaskId: sovereignSummary.selectedTaskId || '',
        selectedTaskTitle: sovereignSummary.selectedTaskTitle || '',
        claimRequested: Boolean(sovereignSummary.claimRequested),
        claimAttempted: Boolean(sovereignSummary.claimAttempted),
        claimSucceeded: Boolean(sovereignSummary.claimSucceeded),
        completionClaimAllowed: Boolean(sovereignSummary.completionClaimAllowed),
        nextAction: sovereignSummary.nextAction || 'run_sovereign_room_marathon_receipt',
        targets: sovereignRoomTargets,
      },
      privacyClass: 'local_private',
      replacementPath: 'sovereign_room_queue_receipt',
      launch: { action: 'stage_sovereign_room_marathon', route: '/workflow/sovereign-room-marathon' },
      glyph: 'SR',
      detail: `${sovereignSummary.matchedCandidateCount || 0} ${sovereignSummary.taskTag || 'local'} candidate(s); selected ${sovereignSummary.selectedTaskTitle || 'none'}; claim ${sovereignSummary.claimSucceeded ? 'succeeded' : sovereignSummary.claimAttempted ? 'attempted' : 'not attempted'}.`,
      firstScreen: true,
      layout: { x: 83, y: 28, size: 106 },
    },
    {
      id: 'workflow.grok-build',
      objectKind: 'agent_lane',
      displayName: 'Grok Build',
      sourceKind: 'workflow',
      sourceRef: 'scripts/holoshell-grok-build-workflow.mjs',
      capabilityFamily: 'agent_workflow',
      trustState: grokWorkflowSummary.status === 'pending_user_approval' || grokBuildSummary.status === 'partial' ? 'partial' : grokBuildSummary.status === 'blocked' ? 'unknown' : 'verified',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'grok_build_agent_lane',
      visualForm: 'workflow_bubble',
      status: grokWorkflowSummary.status || grokBuildSummary.status || 'available',
      actorLaneId: 'brittney',
      agentLane: true,
      receiptTypes: ['grok_build_setup_receipt', 'workflow_receipt', 'workflow_approval_bundle', 'local_approval_gate_receipt'],
      relationships: {
        cliStatus: grokBuildSummary.cliStatus || 'unknown',
        cliVersion: grokBuildSummary.cliVersion || 'unknown',
        authStatus: grokBuildSummary.authStatus || 'unknown',
        authRuntimeStatus: grokBuildSummary.authRuntimeStatus || 'unknown',
        authProvider: grokBuildSummary.authProvider || '',
        operatorStatus: grokBuildSummary.operatorStatus || grokHeartbeat?.summary?.cliOperatorStatus || 'unknown',
        autonomyStatus: grokBuildSummary.autonomyStatus || grokHeartbeat?.summary?.autonomyStatus || 'unknown',
        modelStatus: grokBuildSummary.modelStatus || 'unknown',
        requestedModel: grokBuildSummary.requestedModel || grokWorkflowSummary.model || 'grok-build',
        defaultModel: grokBuildSummary.defaultModel || grokWorkflowSummary.defaultModel || 'unknown',
        projectTrusted: Boolean(grokBuildSummary.projectTrusted || grokWorkflowSummary.projectTrusted),
        projectTrustStatus: grokBuildSummary.projectTrustStatus || grokWorkflowSummary.projectTrustStatus || 'unknown',
        pathSeenOnCurrentProcess: Boolean(grokBuildSummary.pathSeenOnCurrentProcess),
        activeMode: grokWorkflowSummary.mode || 'interactive',
        promptPresent: Boolean(grokWorkflowSummary.promptPresent),
        approvalStatus: activeWorkflowKind === 'grok_build' ? workflowApprovalSummary.status || 'unknown' : 'unknown',
        localGateStatus: activeWorkflowKind === 'grok_build' ? gateSummary.status || 'unknown' : 'unknown',
        heavyAccessStatus: grokBuildSummary.heavyAccessStatus || grokBuild?.heavyUpgrade?.status || 'unknown',
        heavyVerifiedAt: grokBuild?.heavyUpgrade?.verifiedAt || '',
        readyForGrokBuild: Boolean(grokBuildSummary.readyForGrokBuild),
        heartbeatStatus: grokHeartbeat?.summary?.status || 'unknown',
        heartbeatPresenceStatus: grokHeartbeat?.summary?.agentPresenceStatus || 'unknown',
        heartbeatOperatorStatus: grokHeartbeat?.summary?.cliOperatorStatus || grokHeartbeat?.operator?.status || 'unknown',
        heartbeatAuthRuntimeStatus: grokHeartbeat?.summary?.authRuntimeStatus || grokHeartbeat?.operator?.authRuntimeStatus || 'unknown',
        heartbeatAuthProvider: grokHeartbeat?.summary?.authProvider || grokHeartbeat?.operator?.authProvider || '',
        heartbeatAutonomyStatus: grokHeartbeat?.summary?.autonomyStatus || grokHeartbeat?.operator?.autonomyStatus || 'unknown',
        heartbeatObservationStatus: grokHeartbeat?.summary?.latestObservationStatus || 'none',
        heartbeatObservationRecent: Boolean(grokHeartbeat?.summary?.latestObservationRecent),
        latestObservationStatus: grokObservation?.summary?.status || '',
        latestObservation: grokObservation?.summary?.primaryFinding || '',
        latestObservationFindingCount: grokObservation?.summary?.findingCount || 0,
        warningCount: grokBuildSummary.warningCount || 0,
      },
      privacyClass: 'local_private',
      replacementPath: 'coding_agent_runtime_launcher',
      launch: { action: 'stage_grok_build_workflow', route: '/workflow/grok-build' },
      glyph: 'GB',
      detail: activeWorkflowKind === 'grok_build'
        ? `${grokWorkflowSummary.status || 'unknown'}; ${grokWorkflowSummary.mode || 'interactive'}; ${grokWorkflowSummary.model || 'grok-build'}; approval ${workflowApprovalSummary.status || 'unknown'}; project ${grokWorkflowSummary.projectTrustStatus || 'unknown'}${grokObservation?.summary?.primaryFinding ? `; saw ${grokObservation.summary.primaryFinding}` : ''}.`
        : `Grok ${grokBuildSummary.cliVersion || 'unknown'}; operator ${grokBuildSummary.operatorStatus || grokHeartbeat?.summary?.cliOperatorStatus || 'unknown'}; auth ${grokBuildSummary.authRuntimeStatus || grokBuildSummary.authStatus || 'unknown'}; model ${grokBuildSummary.modelStatus || 'unknown'}; project ${grokBuildSummary.projectTrustStatus || 'unknown'}; Heavy ${grokBuildSummary.heavyAccessStatus || grokBuild?.heavyUpgrade?.status || 'unknown'}.`,
      firstScreen: true,
      layout: { x: 72, y: 17, size: 104 },
    },
    {
      id: 'workflow.asset-shard',
      objectKind: 'workflow',
      displayName: 'Asset Shard',
      sourceKind: 'workflow',
      sourceRef: 'scripts/holoshell-asset-shard-workflow.mjs',
      capabilityFamily: 'creator_workflow',
      trustState: shardSummary.status === 'staged' ? 'verified' : 'partial',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'asset_shard_workflow_bridge',
      visualForm: 'workflow_bubble',
      status: shardSummary.status || 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['asset_shard_workflow_receipt', 'asset_shard_private_receipt', 'shard_preview_source'],
      relationships: {
        shardId: shardWorkflow?.shardPlan?.shardId || '',
        assetCount: shardSummary.assetCount || 0,
        modelCount: shardSummary.modelCount || 0,
        imageCount: shardSummary.imageCount || 0,
        audioCount: shardSummary.audioCount || 0,
        blockedAssetCount: shardSummary.blockedAssetCount || 0,
        previewSourcePath: shardWorkflow?.output?.previewSourcePath || '',
        importApprovalStatus: shardApprovalSummary.status || 'unknown',
        importStatus: shardImportSummary.status || 'unknown',
        nextWorkflow: shardSummary.nextWorkflow || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'local_folder_to_playable_shard',
      launch: { action: 'stage_asset_shard_workflow', route: '/workflow/asset-shard' },
      glyph: 'AS',
      detail: `${shardSummary.assetCount || 0} staged assets; ${shardSummary.modelCount || 0} models, ${shardSummary.imageCount || 0} images, ${shardSummary.audioCount || 0} audio; import approval ${shardApprovalSummary.status || 'unknown'}; import ${shardImportSummary.status || 'not_run'}.`,
      firstScreen: true,
      layout: { x: 25, y: 66, size: 112 },
    },
    {
      id: 'workflow.photo-backup-custody',
      objectKind: 'workflow',
      displayName: 'Photo Backup Custody',
      sourceKind: 'workflow',
      sourceRef: 'scripts/holoshell-photo-backup-custody.mjs',
      capabilityFamily: 'family_memory',
      trustState: photoBackupSummary.status === 'planned' && photoBackupSummary.deleteBlocked ? 'verified' : 'partial',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'photo_backup_custody_bridge',
      visualForm: 'workflow_bubble',
      status: photoBackupSummary.status || 'available',
      actorLaneId: 'codex-hardware',
      receiptTypes: ['photo_backup_custody_receipt', 'photo_backup_private_receipt', 'photo_restore_proof_receipt'],
      relationships: {
        receiptId: photoBackupCustody?.receiptId || '',
        albumCount: photoBackupSummary.albumCount || 0,
        photoCount: photoBackupSummary.photoCount || 0,
        videoCount: photoBackupSummary.videoCount || 0,
        duplicateGroupCount: photoBackupSummary.duplicateGroupCount || 0,
        unreadableCount: photoBackupSummary.unreadableCount || 0,
        privacyMetadataClasses: photoBackupSummary.privacyMetadataClasses || [],
        targetPlan: photoBackupSummary.targetPlan || photoBackupCustody?.targetPlan?.targetKind || 'not_chosen',
        deleteBlocked: photoBackupSummary.deleteBlocked !== false,
        restoreVerified: Boolean(photoBackupSummary.restoreVerified),
        originalsDeleted: Boolean(photoBackupSummary.originalsDeleted),
      },
      privacyClass: 'local_private',
      replacementPath: 'family_photo_backup_custody',
      launch: { action: 'stage_photo_backup_custody', route: '/workflow/photo-backup-custody' },
      glyph: 'PB',
      detail: `${photoBackupSummary.photoCount || 0} photo/raw file(s), ${photoBackupSummary.videoCount || 0} video(s), ${photoBackupSummary.duplicateGroupCount || 0} duplicate group(s); delete ${photoBackupSummary.deleteBlocked === false ? 'unlocked' : 'blocked'}; restore ${photoBackupSummary.restoreVerified ? 'verified' : 'not verified'}.`,
      firstScreen: true,
      layout: { x: 38, y: 66, size: 112 },
    },
    {
      id: 'approval.asset-shard-import',
      objectKind: 'approval',
      displayName: 'Approve Import',
      sourceKind: 'approval',
      sourceRef: shardImportApproval?.output?.latestPath || '',
      capabilityFamily: 'creator_workflow',
      trustState: shardApprovalSummary.executionAllowed ? 'partial' : 'verified',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'asset_shard_import_approval_bundle',
      visualForm: 'approval_gate',
      status: shardApprovalSummary.status || 'not_required',
      actorLaneId: 'brittney',
      receiptTypes: ['asset_shard_import_approval_bundle', 'asset_shard_import_receipt'],
      relationships: {
        approvalId: shardImportApproval?.approvalId || '',
        shardId: shardApprovalSummary.shardId || '',
        expiresAt: shardApprovalSummary.expiresAt || '',
        executionAllowed: Boolean(shardApprovalSummary.executionAllowed),
      },
      privacyClass: 'local_private',
      replacementPath: 'consent_gate',
      glyph: 'SI',
      detail: `Approve Import: shard import approval ${shardApprovalSummary.status || 'not_required'} for ${shardApprovalSummary.shardId || 'asset shard'}.`,
      firstScreen: Boolean(shardApprovalSummary.executionAllowed),
      layout: { x: 15, y: 54, size: 96 },
    },
    {
      id: 'approval.hardware',
      objectKind: 'approval',
      displayName: 'Hardware Approval',
      sourceKind: 'receipt',
      sourceRef: 'scripts/holoshell-approval-bundle.mjs',
      capabilityFamily: 'safety',
      trustState: hardwareApprovalSummary.executionAllowed ? 'partial' : 'verified',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'hardware_approval_bundle',
      visualForm: 'approval_gate',
      status: hardwareApprovalSummary.status || 'not_required',
      actorLaneId: 'brittney',
      receiptTypes: hardwareApproval?.browserBoundary ? ['hardware_approval_bundle', 'browser_boundary_receipt'] : ['hardware_approval_bundle'],
      relationships: {
        actionKind: hardwareApprovalSummary.actionKind || '',
        target: hardwareApprovalSummary.target || '',
        expiresAt: hardwareApprovalSummary.expiresAt || '',
        trustLevel: hardwareApprovalSummary.trustLevel || 'unknown',
        trustedAutonomyEligible: Boolean(hardwareApprovalSummary.trustedAutonomyEligible),
        browserBoundaryStatus: hardwareApprovalSummary.browserBoundaryStatus || hardwareApproval?.browserBoundary?.urlClassification || '',
        browserProfileBoundary: hardwareApprovalSummary.browserProfileBoundary || hardwareApproval?.browserBoundary?.profileBoundary || '',
        browserCookiePolicy: hardwareApproval?.browserBoundary?.cookiePolicy || '',
        browserScreenshotPolicy: hardwareApproval?.browserBoundary?.screenshotPolicy || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'consent_gate',
      glyph: 'OK',
      detail: `Hardware approval ${hardwareApprovalSummary.status || 'not_required'} for ${hardwareApprovalSummary.target || 'local computer'}; trust ${hardwareApprovalSummary.trustLevel || 'unknown'}${hardwareApproval?.browserBoundary ? `; browser ${hardwareApproval.browserBoundary.urlClassification} / ${hardwareApproval.browserBoundary.profileBoundary}` : ''}.`,
      firstScreen: Boolean(hardwareApprovalSummary.executionAllowed),
      layout: { x: 13, y: 76, size: 104 },
    },
    {
      id: 'policy.trusted-autonomy',
      objectKind: 'policy',
      displayName: 'Trust Ladder',
      sourceKind: 'policy',
      sourceRef: 'apps/holoshell/source/holoshell-trusted-autonomy.hsplus',
      capabilityFamily: 'trusted_autonomy',
      trustState: trustSummary.trustedAutonomyEligible ? 'verified' : trustSummary.status === 'ready' ? 'partial' : 'unknown',
      permissionEnvelope: 'receipt_policy',
      adapterPath: 'trusted_autonomy_ledger',
      visualForm: 'approval_gate',
      status: trustSummary.status || 'empty',
      actorLaneId: 'brittney',
      receiptTypes: ['trust_ledger_receipt', 'hardware_action_receipt', 'hardware_approval_bundle'],
      relationships: {
        latestTrustLevel: trustSummary.latestTrustLevel || 'unknown',
        latestActionKind: trustSummary.latestActionKind || '',
        latestTarget: trustSummary.latestTarget || '',
        trustedAutonomyEligible: Boolean(trustSummary.trustedAutonomyEligible),
        successesUntilTrusted: trustSummary.successesUntilTrusted || 0,
        promotionThreshold: trustSummary.promotionThreshold || trustLedger?.policy?.promotionThreshold || 3,
        trustedRecordCount: trustSummary.trustedRecordCount || 0,
        guardedRecordCount: trustSummary.guardedRecordCount || 0,
        breakGlassRecordCount: trustSummary.breakGlassRecordCount || 0,
      },
      privacyClass: 'local_private',
      replacementPath: 'approval_to_trusted_autonomy',
      glyph: 'TL',
      detail: `Trust ladder ${trustSummary.latestTrustLevel || 'unknown'}; ${trustSummary.trustedRecordCount || 0} trusted, ${trustSummary.guardedRecordCount || 0} guarded, ${trustSummary.breakGlassRecordCount || 0} break-glass record(s).`,
      firstScreen: true,
      layout: { x: 18, y: 64, size: 104 },
    },
    {
      id: 'surface.browser.lofi',
      objectKind: 'browser_surface',
      displayName: 'Lofi Browser',
      sourceKind: 'web',
      sourceRef: 'https://www.youtube.com/results?search_query=lofi+beats',
      capabilityFamily: 'media',
      trustState: 'partial',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'browser_automation_or_launch_app',
      visualForm: 'portal_bubble',
      status: 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['browser_boundary_receipt', 'hardware_action_receipt', 'approval_bundle'],
      relationships: {
        target: 'youtube_lofi_search',
        mode: 'browser_media',
        browserBoundary: browserBoundaryForProgram(null, 'https://www.youtube.com/results?search_query=lofi+beats'),
      },
      privacyClass: 'local_private',
      replacementPath: 'media_surface',
      launch: { action: 'open_url', url: 'https://www.youtube.com/results?search_query=lofi+beats' },
      glyph: 'LO',
      detail: 'A guarded browser media portal for the lofi part of room marathon.',
      firstScreen: true,
      layout: { x: 62, y: 16, size: 110 },
    },
  ];
}

function founderBootObjects(feeds) {
  const preview = feeds.founderBootPreview || {};
  const formatInventory = feeds.formatInventory || {};
  const summary = preview.summary || {};
  const formatSummary = formatInventory.summary || {};
  const objects = [];

  if (preview.summary) {
    objects.push({
      id: 'surface.founder-boot-preview',
      objectKind: 'operating_world',
      displayName: 'Founder Boot',
      sourceKind: 'holoscript',
      sourceRef: preview.source?.world || 'apps/holoshell/source/holoshell-shell-world.holo',
      capabilityFamily: 'founder_shell',
      trustState: summary.status === 'ready' ? 'verified' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'holo_world_with_hs_render_slice',
      visualForm: 'world_anchor',
      status: summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['founder_boot_preview', 'format_inventory'],
      relationships: {
        renderSlice: preview.source?.renderSlice || 'apps/holoshell/source/holoshell-shell-render.holo',
        worldObjectCount: summary.worldObjectCount || 0,
        renderObjectCount: summary.renderObjectCount || 0,
        formatViewerCardCount: summary.formatViewerCardCount || 0,
        userCapabilityPackCount: summary.userCapabilityPackCount || 0,
        brittneyProposalCount: summary.brittneyProposalCount || 0,
        bootSequence: (preview.founderBootSequence || []).map((step) => `${step.step}:${step.status}`),
      },
      privacyClass: 'local_private',
      replacementPath: 'founder_shell_boot_surface',
      launch: { action: 'preview_founder_boot', route: '/founder-boot' },
      glyph: 'FB',
      detail: `.holo world plus .hs render slice: ${summary.worldObjectCount || 0}/${summary.renderObjectCount || 0} objects; ${summary.userCapabilityPackCount || 0} user packs staged.`,
      firstScreen: true,
      layout: { x: 41, y: 8, size: 148 },
    });
  }

  if (formatInventory.summary || preview.formatViewer) {
    const cards = preview.formatViewer?.cards || formatInventory.formatViewerCards || [];
    objects.push({
      id: 'source.format-viewer',
      objectKind: 'source_corpus',
      displayName: 'Format Viewer',
      sourceKind: 'holoscript_corpus',
      sourceRef: formatInventory.source?.script || 'scripts/holoshell-format-inventory.mjs',
      capabilityFamily: 'source_corpus',
      trustState: formatSummary.status === 'scanned' ? 'verified' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'format_inventory_viewer',
      visualForm: 'source_orbit',
      status: formatSummary.status || summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['format_inventory', 'wild_holoscript_intake_receipt'],
      relationships: {
        totalFileCount: formatSummary.totalFileCount || 0,
        featureFamilyCount: formatSummary.totalFeatureFamilies || 0,
        cardCount: cards.length,
        cards: cards.map((card) => ({
          id: card.id,
          label: card.label,
          files: card.files,
          features: card.features,
          topFeature: card.topFeature,
        })),
      },
      privacyClass: 'local_private',
      replacementPath: 'format_capability_browser',
      launch: { action: 'inspect_format_lanes', route: '/formats' },
      glyph: 'FV',
      detail: `${cards.length || 0} format lane cards; ${formatSummary.totalFileCount || 0} source files across canonical and wild HoloScript.`,
      firstScreen: true,
      layout: { x: 24, y: 18, size: 112 },
    });
  }

  for (const [index, pack] of (preview.userCapabilityPacks || []).entries()) {
    objects.push({
      id: pack.id,
      objectKind: 'workflow',
      displayName: pack.label || 'User Pack',
      sourceKind: 'workflow',
      sourceRef: preview.source?.script || 'scripts/holoshell-founder-boot-preview.mjs',
      capabilityFamily: 'user_capability_pack',
      trustState: 'partial',
      permissionEnvelope: pack.permissionEnvelope || 'guarded_execute',
      adapterPath: 'founder_to_user_capability_pack',
      visualForm: index === 0 ? 'portal_bubble' : 'document_machine',
      status: pack.executionDefault || 'staged_not_run',
      actorLaneId: 'brittney',
      receiptTypes: pack.receiptTypes || ['approval_bundle'],
      relationships: {
        derivedFrom: pack.derivedFrom || 'founder_surface',
        targetObjectId: pack.targetObjectId || '',
        steps: pack.steps || [],
      },
      privacyClass: 'local_private',
      replacementPath: 'curated_user_shell_action',
      launch: { action: 'stage_user_capability_pack', packId: pack.id },
      glyph: pack.id.includes('excel') ? 'XL' : 'LO',
      detail: `${pack.label || 'User pack'} is derived from ${pack.derivedFrom || 'founder power'} and stays staged until approval.`,
      firstScreen: true,
      layout: layout(18 + index, 96),
    });
  }

  if (preview.brittneyOperatorBridge) {
    const bridge = preview.brittneyOperatorBridge;
    objects.push({
      id: 'assistant.brittney.operator-bridge',
      objectKind: 'assistant_avatar',
      displayName: 'Brittney Operator',
      sourceKind: 'holoscript',
      sourceRef: 'apps/holoshell/source/holoshell-founder-boot-loop.hsplus',
      capabilityFamily: 'assistant',
      trustState: bridge.status === 'ready' ? 'verified' : 'partial',
      permissionEnvelope: 'intent_scoped',
      adapterPath: 'brittney_selected_object_operator',
      visualForm: 'avatar_anchor',
      status: bridge.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['founder_boot_preview', 'brittney_turn_receipt', 'approval_bundle'],
      relationships: {
        selectedObjectDefault: bridge.selectedObjectDefault || 'shell.hololand',
        proposalCount: (bridge.proposals || []).length,
        readableFormatCards: bridge.readableFormatCards || [],
      },
      privacyClass: 'local_private',
      replacementPath: 'assistant_operates_selected_shell_object',
      launch: { action: 'ask_brittney_to_operate_selected_object' },
      glyph: 'BO',
      detail: `${(bridge.proposals || []).length} operator proposal(s): inspect, explain, and stage guarded user packs.`,
      firstScreen: true,
      layout: { x: 60, y: 73, size: 108 },
    });
  }

  return objects;
}

function userShellProjectionObjects(feeds) {
  const projection = feeds.userShellProjection || {};
  const summary = projection.summary || {};
  const objects = [];
  if (!projection.summary) return objects;

  objects.push({
    id: 'surface.user-shell-projection',
    objectKind: 'user_shell',
    displayName: 'User Shell',
    sourceKind: 'holoscript',
    sourceRef: projection.source?.sourceContract || 'apps/holoshell/source/holoshell-user-shell-projection.hsplus',
    capabilityFamily: 'user_shell',
    trustState: summary.status === 'ready' ? 'verified' : 'partial',
    permissionEnvelope: 'read_only',
    adapterPath: projection.source?.script || 'scripts/holoshell-user-shell-projection.mjs',
    visualForm: 'mode_orbit',
    status: summary.status || 'unknown',
    actorLaneId: 'brittney',
    receiptTypes: ['user_shell_projection', 'founder_boot_preview', 'format_inventory'],
    relationships: {
      modeCount: summary.modeCount || 0,
      userModeCount: summary.userModeCount || 0,
      capabilityPackCount: summary.capabilityPackCount || 0,
      founderOnlyPowerCount: summary.founderOnlyPowerCount || 0,
      brittneyTranslationCount: summary.brittneyTranslationCount || 0,
      founderSurface: projection.shellDerivation?.founderSurface || 'surface.founder-boot-preview',
      rule: projection.shellDerivation?.rule || 'user_shell_is_derived_from_founder_shell',
    },
    privacyClass: 'local_private',
    replacementPath: 'founder_shell_to_user_shell_projection',
    launch: { action: 'inspect_user_shell_projection', route: '/user-shell' },
    glyph: 'US',
    detail: `${summary.userModeCount || 0} user mode(s), ${summary.capabilityPackCount || 0} pack(s), ${summary.brittneyTranslationCount || 0} Brittney translation(s).`,
    firstScreen: true,
    layout: { x: 46, y: 24, size: 136 },
  });

  for (const [index, mode] of (projection.modes || []).entries()) {
    objects.push({
      id: `mode.${mode.id}`,
      objectKind: 'user_shell_mode',
      displayName: mode.label || mode.id,
      sourceKind: 'holoscript',
      sourceRef: projection.source?.sourceContract || 'apps/holoshell/source/holoshell-user-shell-projection.hsplus',
      capabilityFamily: mode.id?.startsWith('founder.') ? 'founder_shell' : 'user_shell',
      trustState: 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'user_shell_mode_projection',
      visualForm: mode.id === 'user.daily' ? 'home_bubble' : 'mode_bubble',
      status: 'available',
      actorLaneId: 'brittney',
      receiptTypes: ['user_shell_projection'],
      relationships: {
        audience: mode.audience || '',
        defaultSkin: mode.defaultSkin || '',
        visibleBubbleIds: mode.visibleBubbleIds || [],
        hiddenFounderPowers: mode.hiddenFounderPowers || [],
        safetyPosture: mode.safetyPosture || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'mode_switcher',
      launch: { action: 'select_user_shell_mode', modeId: mode.id },
      glyph: mode.id === 'founder.full' ? 'FO' : mode.id === 'user.creator' ? 'CR' : mode.id === 'user.operator' ? 'OP' : 'DY',
      detail: `${mode.audience || 'user'} mode; ${mode.visibleBubbleIds?.length || 0} visible bubbles; ${mode.safetyPosture || 'receipt visible'}.`,
      firstScreen: mode.id === 'user.daily',
      layout: layout(72 + index, 90),
    });
  }

  for (const [index, pack] of (projection.capabilityPacks || []).entries()) {
    objects.push({
      id: `user-shell.pack.${slug(pack.id)}`,
      objectKind: 'workflow',
      displayName: pack.label || pack.id,
      sourceKind: 'workflow',
      sourceRef: projection.source?.script || 'scripts/holoshell-user-shell-projection.mjs',
      capabilityFamily: 'user_capability_pack',
      trustState: pack.permissionEnvelope === 'read_only' ? 'verified' : 'partial',
      permissionEnvelope: pack.permissionEnvelope || 'guarded_execute',
      adapterPath: 'brittney_user_intent_translator',
      visualForm: pack.permissionEnvelope === 'read_only' ? 'source_orbit' : 'portal_bubble',
      status: pack.executionDefault || 'staged_not_run',
      actorLaneId: 'brittney',
      receiptTypes: pack.receiptTypes || ['approval_bundle'],
      relationships: {
        userPhrase: pack.userPhrase || '',
        derivedFrom: pack.derivedFrom || '',
        targetObjectId: pack.targetObjectId || '',
        modeIds: pack.modeIds || [],
        steps: pack.steps || [],
        currentReceiptStatus: pack.currentReceiptStatus || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'plain_language_capability_pack',
      launch: { action: 'stage_user_capability_pack', packId: pack.id },
      glyph: glyphFor(pack.label || pack.id, 'UP'),
      detail: `${pack.userPhrase || pack.label || pack.id}; ${pack.permissionEnvelope || 'guarded_execute'}; ${pack.executionDefault || 'staged_not_run'}.`,
      firstScreen: (pack.modeIds || []).includes('user.daily'),
      layout: layout(78 + index, 88),
    });
  }

  objects.push({
    id: 'assistant.brittney.user-translator',
    objectKind: 'assistant_avatar',
    displayName: 'Brittney Translator',
    sourceKind: 'holoscript',
    sourceRef: projection.source?.sourceContract || 'apps/holoshell/source/holoshell-user-shell-projection.hsplus',
    capabilityFamily: 'assistant',
    trustState: projection.brittneyTranslationLayer?.status === 'ready' ? 'verified' : 'partial',
    permissionEnvelope: 'intent_scoped',
    adapterPath: 'user_intent_to_shell_pack',
    visualForm: 'avatar_anchor',
    status: projection.brittneyTranslationLayer?.status || 'unknown',
    actorLaneId: 'brittney',
    receiptTypes: ['user_shell_projection', 'brittney_turn_receipt', 'approval_bundle'],
    relationships: {
      defaultMode: projection.brittneyTranslationLayer?.defaultMode || 'user.daily',
      translationCount: summary.brittneyTranslationCount || 0,
      translations: (projection.brittneyTranslationLayer?.translations || []).slice(0, 8).map((translation) => ({
        userPhrase: translation.userPhrase,
        targetPackId: translation.targetPackId,
        permissionEnvelope: translation.permissionEnvelope,
      })),
    },
    privacyClass: 'local_private',
    replacementPath: 'assistant_translates_plain_language_to_receipt_bound_actions',
    launch: { action: 'ask_brittney_user_intent' },
    glyph: 'BT',
    detail: `${summary.brittneyTranslationCount || 0} plain-language translation(s) from user intent to staged shell packs.`,
    firstScreen: true,
    layout: { x: 64, y: 58, size: 116 },
  });

  objects.push({
    id: 'policy.founder-only-boundary',
    objectKind: 'policy',
    displayName: 'Founder Boundary',
    sourceKind: 'holoscript',
    sourceRef: projection.source?.sourceContract || 'apps/holoshell/source/holoshell-user-shell-projection.hsplus',
    capabilityFamily: 'user_shell_policy',
    trustState: 'verified',
    permissionEnvelope: 'founder_only',
    adapterPath: 'founder_power_boundary',
    visualForm: 'warning_token',
    status: 'available',
    actorLaneId: 'brittney',
    receiptTypes: ['user_shell_projection'],
    relationships: {
      founderOnlyPowers: (projection.founderOnlyPowers || []).map((power) => power.id),
      hiddenMeansRequiresFounderModeOrApproval: Boolean(projection.shellDerivation?.hiddenMeansRequiresFounderModeOrApproval),
    },
    privacyClass: 'local_private',
    replacementPath: 'founder_power_visible_as_safe_user_surface',
    launch: { action: 'inspect_founder_only_boundary' },
    glyph: 'FO',
    detail: `${summary.founderOnlyPowerCount || 0} founder-only power(s) hidden or translated in the user shell.`,
    firstScreen: false,
    layout: layout(90, 84),
  });

  return objects;
}

function developmentalEnvironmentObjects(feeds) {
  const receipt = feeds.developmentalEnvironment || {};
  const summary = receipt.summary || {};
  const objects = [];
  if (!receipt.summary) return objects;

  const sourceRef = receipt.sourceAnchors?.source || 'apps/holoshell/source/holoshell-developmental-environment.hsplus';
  const trustState = summary.massFunctionSettled && summary.mappingFunctionSettled ? 'verified' : 'partial';
  const spine = Array.isArray(receipt.spine) ? receipt.spine : [];
  const boardTasks = Array.isArray(receipt.boardTasks) ? receipt.boardTasks : [];

  objects.push({
    id: 'source.developmental-environment',
    objectKind: 'operating_world',
    displayName: 'Developmental Environment',
    sourceKind: 'holoscript',
    sourceRef,
    capabilityFamily: 'developmental_environment',
    trustState,
    permissionEnvelope: 'read_only',
    adapterPath: receipt.sourceAnchors?.adapter || 'scripts/holoshell-developmental-environment.mjs',
    visualForm: 'source_orbit',
    status: summary.status || 'unknown',
    actorLaneId: 'brittney',
    receiptTypes: ['developmental_environment_receipt', 'diamond_ruling_receipt'],
    relationships: {
      research: receipt.sourceAnchors?.research || 'ai-ecosystem/research/2026-05-14_ui-ux-developmental-environment.md',
      researchPresent: Boolean(summary.researchPresent),
      reframe: receipt.thesis?.reframe || 'wireframe_to_simulation_to_geometrics',
      telos: receipt.thesis?.telos || 'developmental_environment',
      brittneyRole: receipt.thesis?.brittneyRole || 'assistant_parent_presence',
      spine: spine.map((layer) => layer.id),
      boardTasks: boardTasks.map((task) => task.id),
      threads: (receipt.threads || []).map((thread) => thread.thread || thread),
      massFunction: receipt.thesis?.massFunctionRuling || 'derived_not_authored',
      mappingFunction: receipt.thesis?.mappingFunctionRuling || 'pure_function_of_physics_state',
      honestyPrinciple: summary.honestyPrinciple || receipt.thesis?.mappingHonestyPrinciple || '',
      nextMove: summary.nextMove || '',
    },
    privacyClass: 'local_private',
    replacementPath: 'simulation_first_shell_substrate',
    launch: { action: 'inspect_developmental_environment', route: '/developmental-environment' },
    glyph: 'DE',
    detail: `wireframe -> simulation -> geometrics; ${summary.spineLayerCount || spine.length || 0} spine layers; mass ${receipt.thesis?.massFunctionRuling || 'unknown'}; mapping ${receipt.thesis?.mappingFunctionRuling || 'unknown'}.`,
    firstScreen: true,
    layout: { x: 36, y: 32, size: 124 },
  });

  objects.push({
    id: 'policy.physics-honesty',
    objectKind: 'policy',
    displayName: 'Physics Honesty',
    sourceKind: 'holoscript',
    sourceRef,
    capabilityFamily: 'developmental_environment_policy',
    trustState,
    permissionEnvelope: 'read_only',
    adapterPath: 'physics_state_to_animation_mapping',
    visualForm: 'warning_token',
    status: summary.mappingFunctionSettled ? 'settled' : 'engineering_next',
    actorLaneId: 'brittney',
    receiptTypes: ['developmental_environment_receipt'],
    relationships: {
      massFunction: receipt.functions?.massFunction?.boardTaskId || '',
      mappingFunction: receipt.functions?.physicsAnimationMapping?.boardTaskId || '',
      cosmeticAnimationAllowed: false,
      rule: receipt.thesis?.mappingHonestyPrinciple || 'animation must be explainable from physics state',
    },
    privacyClass: 'local_private',
    replacementPath: 'honest_visual_signal_policy',
    launch: { action: 'inspect_physics_honesty_policy' },
    glyph: 'PH',
    detail: `Animation is a pure view of physics state; ${summary.openEngineeringTaskCount || 0} engineering task(s) still open.`,
    firstScreen: false,
    layout: layout(94, 84),
  });

  return objects;
}

function programObjects(programRegistry, maxPrograms) {
  const programs = Array.isArray(programRegistry?.programs) ? programRegistry.programs : [];
  return dedupePrograms(programs)
    .filter((program) => program.launchable)
    .sort((left, right) => scoreProgram(right) - scoreProgram(left))
    .slice(0, Math.max(0, maxPrograms))
    .map((program, index) => {
      const objectKind = objectKindForProgram(program);
      const displayName = displayNameForProgram(program);
      const slot = layout(index, 96);
      const status = hasMeaningfulRunningWindow(program) ? 'running' : 'available';
      const browserBoundary = objectKind === 'browser_surface' ? browserBoundaryForProgram(program) : null;
      return {
        id: `program.${slug(displayName)}.${shortHash(program.id || displayName)}`,
        objectKind,
        displayName,
        sourceKind: 'app',
        sourceRef: program.id,
        capabilityFamily: capabilityFamilyForProgram(program),
        trustState: program.trustState || 'partial',
        permissionEnvelope: program.permissionEnvelope || 'guarded_execute',
        adapterPath: objectKind === 'browser_surface' ? 'browser_automation_or_launch_app' : 'hardware_program_registry',
        visualForm: visualFormForProgram(program),
        status,
        actorLaneId: 'brittney',
        receiptTypes: browserBoundary
          ? ['program_registry_receipt', 'browser_boundary_receipt', 'hardware_action_receipt', 'approval_bundle']
          : ['program_registry_receipt', 'hardware_action_receipt', 'approval_bundle'],
        relationships: {
          programRegistryId: program.id,
          capabilityClass: program.capabilityClass || 'application',
          source: program.source || 'unknown',
          launchTargetType: program.launchTarget?.type || 'unknown',
          runningWindowId: program.runningWindowId || '',
          runningWindowTitle: program.runningWindowTitle || '',
          runningProcessName: program.runningProcessName || '',
          browserBoundary,
        },
        privacyClass: 'local_private',
        replacementPath: objectKind === 'browser_surface' ? 'render_as_portal' : 'wrap_then_reimagine',
        launch: { action: 'launch_app', app: displayName },
        glyph: glyphFor(displayName, 'P'),
        detail: `${displayName} is a ${program.capabilityClass || 'program'} object; ${status}; launch is guarded by approval receipt.`,
        firstScreen: index < 12 || status === 'running',
        layout: slot,
      };
    });
}

function capturedWindowObjects({ osUiCapture, programRegistry }, maxWindows) {
  const windows = Array.isArray(osUiCapture?.windows) && osUiCapture.windows.length
    ? osUiCapture.windows
    : Array.isArray(programRegistry?.runningWindows)
      ? programRegistry.runningWindows
      : [];
  const selectedWindowId = osUiCapture?.summary?.selectedWindowId || osUiCapture?.summary?.foregroundWindowId || '';
  return windows
    .filter((window) => window?.id && (window.title || window.processName))
    .slice(0, Math.max(0, maxWindows))
    .map((window, index) => {
      const slot = layout(index + 10, 84);
      const legacySurface = window.legacySurface || {};
      const safeActions = Array.isArray(legacySurface.safeActions) ? legacySurface.safeActions.slice(0, 10) : [];
      const blockedActions = Array.isArray(legacySurface.blockedActions) ? legacySurface.blockedActions.slice(0, 12) : [];
      const selectedForReconstruction = window.id === selectedWindowId;
      return {
        id: `window.${slug(window.processName || 'app')}.${shortHash(window.id)}`,
        objectKind: 'captured_window',
        displayName: window.title || window.processName || 'Window',
        sourceKind: 'captured_ui',
        sourceRef: window.id,
        capabilityFamily: 'legacy_ui',
        trustState: 'partial',
        permissionEnvelope: 'read_only',
        adapterPath: 'os_ui_capture_bridge',
        visualForm: 'geometry_shard_cluster',
        status: selectedForReconstruction ? 'selected' : window.foreground ? 'foreground' : 'running',
        actorLaneId: 'brittney',
        receiptTypes: ['os_ui_capture_receipt', 'legacy_app_absorption_receipt', 'hardware_action_receipt'],
        relationships: {
          processName: window.processName || '',
          processId: window.processId || '',
          controlCount: Array.isArray(window.controls) ? window.controls.length : window.controlCount || 0,
          foreground: Boolean(window.foreground),
          minimized: Boolean(window.minimized),
          captureEvidence: window.captureEvidence || 'win32_uiautomation',
          selectedForReconstruction,
          targetResolution: selectedForReconstruction ? osUiCapture?.summary?.targetResolution || '' : '',
          geometryNodeCount: selectedForReconstruction ? osUiCapture?.summary?.geometryNodeCount || 0 : 0,
          actionBridgeStatus: selectedForReconstruction ? osUiCapture?.summary?.actionBridgeStatus || '' : '',
          appName: legacySurface.appName || '',
          appLabel: legacySurface.label || '',
          archetype: legacySurface.archetype || '',
          surfaceRole: legacySurface.surfaceRole || 'legacy_app_surface',
          mutationPolicy: legacySurface.mutationPolicy || 'preflight_required',
          captureCandidate: Boolean(legacySurface.captureCandidate),
          preflightRequired: legacySurface.preflightRequired !== false,
          preflightTool: legacySurface.preflightTool || 'holoshell_preflight_legacy_app_mutation',
          safeActions,
          blockedActions,
        },
        privacyClass: 'local_private',
        replacementPath: 'reconstruct_legacy_ui_as_geometry',
        launch: {
          action: 'focus_window',
          windowId: window.id,
          permissionEnvelope: 'guarded_execute',
          preflightRequired: true,
        },
        glyph: glyphFor(window.processName || window.title, 'UI'),
        detail: `${legacySurface.label || window.title || window.processName} is a ${legacySurface.archetype || 'legacy'} surface; read-only capture is available; legacy actions require guarded receipts.`,
        firstScreen: selectedForReconstruction || index < 4,
        layout: slot,
      };
    });
}

function agentObjects(lanes, maxAgents) {
  const laneList = Array.isArray(lanes?.lanes) ? lanes.lanes : [];
  return laneList.slice(0, Math.max(0, maxAgents)).map((lane, index) => {
    const slot = layout(index + 4, 88);
    const heartbeat = lane.heartbeat || null;
    return {
      id: `agent.${slug(lane.laneId || lane.displayName)}`,
      objectKind: 'agent_lane',
      displayName: lane.displayName || lane.laneId || 'Agent',
      sourceKind: 'agent',
      sourceRef: lane.laneId || '',
      capabilityFamily: 'agent_presence',
      trustState: lane.status === 'active_or_available' ? 'verified' : 'partial',
      permissionEnvelope: 'intent_scoped',
      adapterPath: 'holomesh_agent_lane',
      visualForm: 'agent_bubble',
      status: lane.status || 'unknown',
      actorLaneId: lane.laneId || '',
      receiptTypes: heartbeat
        ? ['agent_lane_manifest', 'grok_heartbeat_receipt', 'run_custody_receipt']
        : ['agent_lane_manifest', 'run_custody_receipt'],
      relationships: {
        agentKind: lane.agentKind || '',
        surfaceKind: lane.surfaceKind || '',
        role: lane.role || '',
        processDetected: Boolean(lane.processEvidence?.detected),
        heartbeatStatus: heartbeat?.status || '',
        heartbeatGeneratedAt: heartbeat?.generatedAt || '',
        heavyAccessStatus: heartbeat?.heavyAccessStatus || '',
        readyForGrokBuild: Boolean(heartbeat?.readyForGrokBuild),
        latestObservationStatus: heartbeat?.latestObservationStatus || '',
        latestObservationAgeMs: heartbeat?.latestObservationAgeMs ?? null,
        primaryFinding: heartbeat?.primaryFinding || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'invite_agent_into_shell',
      glyph: glyphFor(lane.displayName || lane.agentKind, 'A'),
      detail: heartbeat?.status
        ? `${lane.displayName || lane.laneId} lane is ${lane.status || 'unknown'}; heartbeat ${heartbeat.status}; observation ${heartbeat.latestObservationStatus || 'none'}.`
        : `${lane.displayName || lane.laneId} lane is ${lane.status || 'unknown'} for ${lane.role || 'agent work'}.`,
      firstScreen: index < 3,
      layout: slot,
    };
  });
}

function readinessStatusTrust(status) {
  if (status === 'pass') return 'verified';
  if (status === 'warn' || status === 'skipped' || status === 'reported_fail' || status === 'fail' || status === 'blocked') return 'partial';
  return 'unknown';
}

function readinessTokenGlyph(token) {
  const id = String(token?.id || token?.kind || '').toLowerCase();
  if (id.includes('build')) return 'PB';
  if (id.includes('source')) return 'SV';
  if (id.includes('webgpu')) return 'WG';
  if (id.includes('wasm')) return 'WA';
  if (id.includes('headset')) return 'VR';
  if (id.includes('visual') || id.includes('witness')) return 'VW';
  if (id.includes('replay')) return 'RP';
  if (id.includes('graph')) return 'GR';
  if (id.includes('task')) return 'HM';
  if (id.includes('mcp') || id.includes('custody')) return 'MC';
  return 'EV';
}

function parseWorldBuildBlockingReason(reason) {
  const text = String(reason || '').trim();
  const match = text.match(/^([^:()]+):([^()]+)(?:\((.*)\))?$/);
  if (!match) {
    return {
      tokenId: '',
      status: 'warn',
      nextAction: text,
      raw: text,
    };
  }
  return {
    tokenId: match[1] || '',
    status: match[2] || 'warn',
    nextAction: match[3] || '',
    raw: text,
  };
}

function ownerLaneForReadyBlocker(tokenId, token = {}) {
  const text = `${tokenId} ${token.kind || ''} ${token.title || ''}`.toLowerCase();
  if (text.includes('build') || text.includes('process') || text.includes('hardware') || text.includes('webgpu') || text.includes('wasm') || text.includes('repo')) {
    return 'codex-hardware';
  }
  if (text.includes('mcp') || text.includes('custody')) return 'codex-hardware';
  if (text.includes('graph') || text.includes('source') || text.includes('validation')) return 'holoscript-source';
  if (text.includes('headset') || text.includes('replay') || text.includes('witness')) return 'operator';
  return 'brittney';
}

function readinessObjects(readinessEvidence) {
  if (!readinessEvidence?.summary) return [];
  const summary = readinessEvidence.summary;
  const tokens = Array.isArray(readinessEvidence.tokens) ? readinessEvidence.tokens : [];
  const objects = [{
    id: 'room.world-build-readiness',
    objectKind: 'readiness_room',
    displayName: 'World Build Readiness',
    sourceKind: 'receipt',
    sourceRef: readinessEvidence.source?.reportPath || readinessEvidence.source?.evidenceDir || '',
    capabilityFamily: 'readiness_evidence',
    trustState: readinessStatusTrust(summary.status),
    permissionEnvelope: 'read_only',
    adapterPath: 'readiness_evidence_ingestion',
    visualForm: 'room',
    status: summary.status || 'unknown',
    actorLaneId: 'brittney',
    receiptTypes: ['readiness_evidence_pack', 'device_lab_receipt', 'build_log', 'source_validations'],
    relationships: {
      scenario: summary.scenario || '',
      nextWorkflow: summary.nextWorkflow || '',
      buildStatus: summary.buildStatus || '',
      deviceLabStatus: summary.deviceLabStatus || '',
      graphStatus: summary.graphStatus || '',
      tokenCount: summary.tokenCount || 0,
      warningCount: summary.warningCount || 0,
    },
    privacyClass: 'local_private',
    replacementPath: 'world_build_readiness_room',
    glyph: 'WR',
    detail: `${summary.scenario || 'World build readiness'}; build ${summary.buildStatus || 'unknown'}; device ${summary.deviceLabStatus || 'unknown'}; ${summary.warningCount || 0} warning token(s).`,
    firstScreen: true,
    layout: { x: 22, y: 15, size: 116 },
  }];

  const tokenSlots = [
    { x: 17, y: 42, size: 80 },
    { x: 29, y: 31, size: 78 },
    { x: 38, y: 62, size: 78 },
    { x: 50, y: 17, size: 76 },
    { x: 72, y: 17, size: 78 },
    { x: 83, y: 31, size: 76 },
    { x: 87, y: 66, size: 78 },
    { x: 35, y: 83, size: 76 },
  ];

  for (const [index, token] of tokens.slice(0, 8).entries()) {
    const slot = tokenSlots[index] || layout(index + 18, 76);
    objects.push({
      id: `receipt.${token.id || `readiness-${index}`}`,
      objectKind: 'receipt',
      displayName: token.title || 'Readiness Token',
      sourceKind: 'receipt',
      sourceRef: token.source || readinessEvidence.source?.evidenceDir || '',
      capabilityFamily: 'readiness_evidence',
      trustState: token.trustState || readinessStatusTrust(token.status),
      permissionEnvelope: ['skipped', 'warn', 'blocked', 'fail', 'reported_fail'].includes(token.status) ? 'manual_witness' : 'read_only',
      adapterPath: 'readiness_evidence_ingestion',
      visualForm: token.status === 'pass' ? 'timeline_node' : token.status === 'blocked' ? 'blocked_reason_card' : 'warning_token',
      status: token.status || 'unknown',
      actorLaneId: 'codex-hardware',
      receiptTypes: [token.receiptType || 'readiness_evidence_pack'],
      relationships: {
        tokenKind: token.kind || '',
        nextAction: token.nextAction || '',
        readinessId: readinessEvidence.readinessId || '',
      },
      privacyClass: 'local_private',
      replacementPath: token.nextAction ? 'attach_missing_evidence' : 'receipt_memory',
      glyph: readinessTokenGlyph(token),
      detail: `${token.detail || token.title || 'Readiness evidence token.'}${token.nextAction ? ` Next: ${token.nextAction}` : ''}`,
      firstScreen: index < 5 || token.status !== 'pass',
      layout: slot,
    });
  }

  const readyToken = readinessEvidence.worldBuildReadyToken || {};
  const blockingReasons = Array.isArray(readyToken.blockingReasons) ? readyToken.blockingReasons : [];
  const blockerSlots = [
    { x: 12, y: 63, size: 92 },
    { x: 24, y: 70, size: 88 },
    { x: 39, y: 77, size: 86 },
    { x: 55, y: 82, size: 84 },
    { x: 71, y: 75, size: 82 },
    { x: 84, y: 60, size: 80 },
  ];
  for (const [index, reason] of blockingReasons.slice(0, 6).entries()) {
    const parsed = parseWorldBuildBlockingReason(reason);
    const token = tokens.find((entry) => entry.id === parsed.tokenId) || {};
    const ownerLaneId = ownerLaneForReadyBlocker(parsed.tokenId, token);
    const safeNextAction = parsed.nextAction || token.nextAction || readyToken.nextAction || 'resolve_blockers_and_replay';
    const receiptLink = parsed.tokenId ? `receipt.${parsed.tokenId}` : 'room.world-build-readiness';
    objects.push({
      id: `blocker.world-build.${shortHash(`${index}:${reason}`)}`,
      objectKind: 'readiness_blocker',
      displayName: `Ready Blocker ${index + 1}`,
      sourceKind: 'receipt',
      sourceRef: token.source || readinessEvidence.source?.evidenceDir || readinessEvidence.source?.reportPath || '',
      capabilityFamily: 'readiness_evidence',
      trustState: 'partial',
      permissionEnvelope: 'cannot_promote_import_publish',
      adapterPath: 'world_build_ready_token',
      visualForm: 'blocked_reason_card',
      status: parsed.status || readyToken.status || 'warn',
      actorLaneId: ownerLaneId,
      receiptTypes: [token.receiptType || readinessEvidence.schemaVersion || 'world_build_ready_token'],
      relationships: {
        worldBuildReadyTokenId: readyToken.id || 'holoshell.world-build-ready',
        blockReason: parsed.raw || String(reason || ''),
        receiptTokenId: parsed.tokenId,
        receiptLink,
        ownerLaneId,
        safeNextAction,
        replayCommand: readinessEvidence.commands?.replay || '',
        promotionBlocked: true,
        importBlocked: true,
        publishBlocked: true,
        affordance: 'cannot_promote_import_publish_until_resolved',
      },
      privacyClass: 'local_private',
      replacementPath: 'resolve_blocker_then_replay',
      glyph: 'BR',
      detail: `${parsed.tokenId || 'readiness'} blocks promotion. Owner ${ownerLaneId}. Next: ${safeNextAction}`,
      firstScreen: true,
      layout: blockerSlots[index] || layout(index + 30, 82),
    });
  }

  return objects;
}

function fleetReadinessObjects(fleetReadiness) {
  if (!fleetReadiness?.summary) return [];
  const summary = fleetReadiness.summary;
  const tokens = Array.isArray(fleetReadiness.tokens) ? fleetReadiness.tokens : [];
  const lanes = Array.isArray(fleetReadiness.lanes) ? fleetReadiness.lanes : [];
  const jobs = Array.isArray(fleetReadiness.jobs) ? fleetReadiness.jobs : [];
  const blockers = Array.isArray(fleetReadiness.blockers) ? fleetReadiness.blockers : [];
  const ownerLaneId = summary.ownerLaneId || summary.createdBy || 'codex-hardware';
  const objects = [{
    id: 'room.fleet-readiness',
    objectKind: 'readiness_room',
    displayName: 'Fleet Readiness',
    sourceKind: 'receipt',
    sourceRef: fleetReadiness.source?.evidencePath || '',
    capabilityFamily: 'fleet_readiness',
    trustState: readinessStatusTrust(summary.status),
    permissionEnvelope: 'read_only',
    adapterPath: 'fleet_readiness_projection',
    visualForm: 'room',
    status: summary.status || 'unknown',
    actorLaneId: ownerLaneId,
    receiptTypes: ['fleet_readiness_evidence', 'fleet_job_ready_token'],
    relationships: {
      fleetReadinessId: fleetReadiness.fleetReadinessId || '',
      jobId: summary.jobId || '',
      laneId: summary.laneId || '',
      laneProfile: summary.laneProfile || '',
      ownerLaneId,
      budgetStatus: summary.budgetStatus || 'unknown',
      heartbeatAgeMs: summary.heartbeatAgeMs ?? null,
      permissionEnvelope: summary.permissionEnvelope || '',
      gateCount: summary.gateCount || 0,
      blockedReasonCount: summary.blockedReasonCount || 0,
      launchReceiptRequired: Boolean(summary.launchReceiptRequired),
      stopReceiptRequired: Boolean(summary.stopReceiptRequired),
      mutationPerformed: Boolean(summary.mutationPerformed),
    },
    privacyClass: 'local_private',
    replacementPath: 'fleet_readiness_projection',
    glyph: 'FR',
    detail: `Fleet job ${summary.jobId || 'unknown'} is ${summary.status || 'unknown'}; lane ${summary.laneId || 'missing'}; ${summary.blockedReasonCount || 0} blocker(s).`,
    firstScreen: true,
    layout: { x: 58, y: 15, size: 112 },
  }];

  const laneSlots = [
    { x: 62, y: 32, size: 84 },
    { x: 74, y: 38, size: 80 },
    { x: 52, y: 41, size: 78 },
  ];
  for (const [index, lane] of lanes.slice(0, 3).entries()) {
    const laneId = lane.id || 'unassigned';
    objects.push({
      id: `fleet.lane.${slug(laneId)}`,
      objectKind: 'fleet_lane',
      displayName: lane.id ? `Fleet Lane ${lane.id}` : 'Fleet Lane Missing',
      sourceKind: 'receipt',
      sourceRef: fleetReadiness.source?.evidencePath || '',
      capabilityFamily: 'fleet_readiness',
      trustState: lane.status === 'pass' || lane.status === 'ready' ? 'verified' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'fleet_readiness_projection',
      visualForm: 'agent_lane',
      status: lane.status || summary.status || 'unknown',
      actorLaneId: lane.ownerLaneId || ownerLaneId,
      receiptTypes: ['fleet_job_ready_token'],
      relationships: {
        laneId: lane.id || '',
        profile: lane.profile || '',
        ownerLaneId: lane.ownerLaneId || ownerLaneId,
        heartbeatAgeMs: lane.heartbeatAgeMs ?? null,
        readinessId: fleetReadiness.fleetReadinessId || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'fleet_lane_readiness',
      glyph: 'FL',
      detail: `Fleet lane ${lane.id || 'missing'} profile ${lane.profile || 'unknown'}; heartbeat age ${lane.heartbeatAgeMs ?? 'unknown'}ms.`,
      firstScreen: true,
      layout: laneSlots[index] || layout(index + 34, 80),
    });
  }

  const jobSlots = [
    { x: 68, y: 56, size: 88 },
    { x: 80, y: 49, size: 82 },
    { x: 54, y: 59, size: 82 },
  ];
  for (const [index, job] of jobs.slice(0, 3).entries()) {
    objects.push({
      id: `fleet.job.${slug(job.id || `job-${index + 1}`)}`,
      objectKind: 'fleet_job',
      displayName: job.id || `Fleet Job ${index + 1}`,
      sourceKind: 'receipt',
      sourceRef: fleetReadiness.source?.evidencePath || '',
      capabilityFamily: 'fleet_readiness',
      trustState: job.status === 'pass' || job.status === 'ready' ? 'verified' : 'partial',
      permissionEnvelope: summary.readyForLaunch ? 'read_only' : 'cannot_launch_until_ready',
      adapterPath: 'fleet_readiness_projection',
      visualForm: summary.readyForLaunch ? 'timeline_node' : 'blocked_reason_card',
      status: job.status || summary.status || 'unknown',
      actorLaneId: ownerLaneId,
      receiptTypes: ['fleet_job_ready_token'],
      relationships: {
        jobId: job.id || '',
        profile: job.profile || '',
        paper: job.paper || '',
        timeBoxSec: job.timeBoxSec ?? null,
        commandHash: job.commandHash || '',
        readinessStatus: summary.status || 'unknown',
        readyForLaunch: Boolean(summary.readyForLaunch),
        mutationPerformed: Boolean(summary.mutationPerformed),
      },
      privacyClass: 'local_private',
      replacementPath: 'fleet_job_readiness',
      glyph: 'FJ',
      detail: `${job.label || job.id || 'Fleet job'}; command ${job.commandHash ? 'hashed' : 'missing'}; launch ${summary.readyForLaunch ? 'read-only ready' : 'blocked'}.`,
      firstScreen: true,
      layout: jobSlots[index] || layout(index + 38, 82),
    });
  }

  const tokenSlots = [
    { x: 61, y: 72, size: 72 },
    { x: 72, y: 72, size: 72 },
    { x: 84, y: 73, size: 72 },
    { x: 45, y: 73, size: 72 },
  ];
  for (const [index, token] of tokens.slice(0, 8).entries()) {
    objects.push({
      id: `receipt.${token.id || `fleet-token-${index + 1}`}`,
      objectKind: 'receipt',
      displayName: token.title || 'Fleet Readiness Token',
      sourceKind: 'receipt',
      sourceRef: token.source || fleetReadiness.source?.evidencePath || '',
      capabilityFamily: 'fleet_readiness',
      trustState: token.trustState || readinessStatusTrust(token.status),
      permissionEnvelope: ['warn', 'blocked', 'fail', 'failed', 'skipped'].includes(token.status) ? 'manual_witness' : 'read_only',
      adapterPath: 'fleet_readiness_projection',
      visualForm: token.status === 'pass' ? 'timeline_node' : 'warning_token',
      status: token.status || 'unknown',
      actorLaneId: ownerLaneId,
      receiptTypes: [token.receiptType || fleetReadiness.schemaVersion || 'fleet_readiness_evidence'],
      relationships: {
        gateId: token.gateId || '',
        tokenKind: token.kind || '',
        nextAction: token.nextAction || '',
        readinessId: fleetReadiness.fleetReadinessId || '',
      },
      privacyClass: 'local_private',
      replacementPath: token.nextAction ? 'attach_missing_fleet_evidence' : 'receipt_memory',
      glyph: token.gateId ? glyphFor(token.gateId, 'FG') : 'FG',
      detail: `${token.detail || token.title || 'Fleet readiness token.'}${token.nextAction ? ` Next: ${token.nextAction}` : ''}`,
      firstScreen: index < 4 || token.status !== 'pass',
      layout: tokenSlots[index] || layout(index + 42, 72),
    });
  }

  const blockerSlots = [
    { x: 56, y: 83, size: 82 },
    { x: 68, y: 84, size: 82 },
    { x: 80, y: 83, size: 82 },
    { x: 43, y: 84, size: 80 },
  ];
  for (const [index, blocker] of blockers.slice(0, 6).entries()) {
    objects.push({
      id: `blocker.fleet-job.${shortHash(`${index}:${blocker.raw || blocker.detail}`)}`,
      objectKind: 'fleet_job_blocker',
      displayName: `Fleet Blocker ${index + 1}`,
      sourceKind: 'receipt',
      sourceRef: fleetReadiness.source?.evidencePath || '',
      capabilityFamily: 'fleet_readiness',
      trustState: 'partial',
      permissionEnvelope: 'cannot_launch_stop_migrate',
      adapterPath: 'fleet_job_ready_token',
      visualForm: 'blocked_reason_card',
      status: blocker.status || summary.status || 'blocked',
      actorLaneId: ownerLaneId,
      receiptTypes: [fleetReadiness.schemaVersion || 'fleet_readiness_evidence'],
      relationships: {
        fleetJobReadyTokenId: fleetReadiness.fleetJobReadyToken?.id || '',
        gateId: blocker.gateId || '',
        blockReason: blocker.raw || blocker.detail || '',
        receiptTokenId: blocker.receiptTokenId || '',
        receiptLink: blocker.receiptTokenId ? `receipt.${blocker.receiptTokenId}` : 'room.fleet-readiness',
        ownerLaneId,
        safeNextAction: blocker.nextAction || 'Resolve the Fleet blocker and replay readiness.',
        replayCommand: fleetReadiness.commands?.replay || '',
        launchBlocked: true,
        stopBlocked: true,
        migrateBlocked: true,
        mutationPerformed: false,
      },
      privacyClass: 'local_private',
      replacementPath: 'resolve_fleet_blocker_then_replay',
      glyph: 'FB',
      detail: `${blocker.gateId || 'Fleet gate'} blocks Fleet launch. Next: ${blocker.nextAction || 'replay readiness'}`,
      firstScreen: true,
      layout: blockerSlots[index] || layout(index + 46, 80),
    });
  }

  return objects;
}

function mcpCustodyContractObjects(mcpCustodyContract) {
  if (!mcpCustodyContract?.summary) return [];
  const summary = mcpCustodyContract.summary;
  const nativeReady = Boolean(summary.nativeMcpCustodySplit);
  return [{
    id: 'receipt.mcp-custody-contract',
    objectKind: 'receipt',
    displayName: 'MCP Custody Contract',
    sourceKind: 'receipt',
    sourceRef: mcpCustodyContract.sourceAnchors?.adapter || 'scripts/holoshell-mcp-custody-contract.mjs',
    capabilityFamily: 'mcp_custody_contract',
    trustState: nativeReady ? 'verified' : 'partial',
    permissionEnvelope: 'read_only',
    adapterPath: 'holoshell_mcp_custody_contract',
    visualForm: summary.status === 'pass' ? 'receipt_node' : 'warning_token',
    status: summary.status || 'unknown',
    actorLaneId: 'codex-hardware',
    receiptTypes: [mcpCustodyContract.schemaVersion || 'hololand.holoshell.mcp-custody-contract.v0.1.0'],
    relationships: {
      compatibilityMode: summary.compatibilityMode || 'unknown',
      nativeMcpCustodySplit: nativeReady,
      cleanupCandidateCount: summary.cleanupCandidateCount || 0,
      ownerHandoffPlanCount: summary.ownerHandoffPlanCount || 0,
      checkPassCount: summary.checkPassCount || 0,
      checkWarnCount: summary.checkWarnCount || 0,
      checkFailCount: summary.checkFailCount || 0,
      nextAction: mcpCustodyContract.compliance?.nextAction || '',
    },
    privacyClass: 'local_private',
    replacementPath: nativeReady ? 'global_mcp_consumption' : 'upgrade_holoshell_mcp_snapshot',
    glyph: 'MC',
    detail: `MCP custody split ${summary.compatibilityMode || 'unknown'}; ${summary.cleanupCandidateCount || 0} cleanup candidate(s), ${summary.ownerHandoffPlanCount || 0} owner handoff(s).`,
    firstScreen: !nativeReady,
    layout: { x: 63, y: 78, size: 76 },
  }];
}

function mcpUpstreamHandoffObjects(mcpUpstreamHandoff) {
  if (!mcpUpstreamHandoff?.summary) return [];
  const summary = mcpUpstreamHandoff.summary;
  const nativeReady = summary.status === 'native_ready_no_handoff_needed';
  return [{
    id: 'receipt.mcp-custody-upstream-handoff',
    objectKind: 'receipt',
    displayName: 'MCP Upstream Handoff',
    sourceKind: 'receipt',
    sourceRef: mcpUpstreamHandoff.sourceAnchors?.adapter || 'scripts/holoshell-mcp-upstream-handoff.mjs',
    capabilityFamily: 'mcp_custody_upstream_handoff',
    trustState: nativeReady ? 'verified' : 'partial',
    permissionEnvelope: 'read_only',
    adapterPath: 'holoshell_mcp_upstream_handoff',
    visualForm: nativeReady ? 'receipt_node' : 'handoff_card',
    status: summary.status || 'unknown',
    actorLaneId: 'codex-hardware',
    receiptTypes: [mcpUpstreamHandoff.schemaVersion || 'hololand.holoshell.mcp-custody-upstream-handoff.v0.1.0'],
    relationships: {
      targetTool: summary.targetTool || 'holoshell_run_registry_snapshot',
      currentCompatibilityMode: summary.currentCompatibilityMode || 'unknown',
      nativeMcpCustodySplit: Boolean(summary.nativeMcpCustodySplit),
      upstreamRepoRequired: Boolean(summary.upstreamRepoRequired),
      taskCount: summary.taskCount || 0,
      acceptanceGateCount: summary.acceptanceGateCount || 0,
    },
    privacyClass: 'local_private',
    replacementPath: nativeReady ? 'native_mcp_contract_memory' : 'route_to_mcp_host_agent',
    glyph: 'UH',
    detail: `${summary.targetTool || 'holoshell_run_registry_snapshot'} handoff ${summary.status || 'unknown'}; ${summary.taskCount || 0} task(s), ${summary.acceptanceGateCount || 0} gate(s).`,
    firstScreen: !nativeReady,
    layout: { x: 74, y: 79, size: 76 },
  }];
}

function assetShardObjects({ shardWorkflow, shardImport }) {
  if (!shardWorkflow?.summary && !shardImport?.summary) return [];
  const objects = [];
  if (!shardWorkflow?.summary) return objects;
  const summary = shardWorkflow.summary;
  objects.push({
    id: `receipt.asset-shard.${shortHash(shardWorkflow.workflowId || shardWorkflow.generatedAt || 'asset-shard')}`,
    objectKind: 'receipt',
    displayName: 'Shard Workflow Receipt',
    sourceKind: 'receipt',
    sourceRef: shardWorkflow.output?.latestPath || '',
    capabilityFamily: 'creator_workflow',
    trustState: summary.status === 'staged' ? 'verified' : 'partial',
    permissionEnvelope: 'read_only',
    adapterPath: 'asset_shard_workflow_bridge',
    visualForm: summary.status === 'blocked' ? 'warning_token' : 'receipt_node',
    status: summary.status || 'unknown',
    actorLaneId: 'codex-hardware',
    receiptTypes: ['asset_shard_workflow_receipt', 'shard_preview_source'],
    relationships: {
      shardId: shardWorkflow.shardPlan?.shardId || '',
      assetCount: summary.assetCount || 0,
      previewSourcePath: shardWorkflow.output?.previewSourcePath || '',
      privateReceiptPath: shardWorkflow.output?.privateReceiptPath || '',
      sourceAssetsMutated: Boolean(shardWorkflow.rollback?.sourceAssetsMutated),
    },
    privacyClass: 'local_private',
    replacementPath: 'receipt_memory',
    glyph: 'SR',
    detail: `${summary.assetCount || 0} asset(s) staged into ${summary.previewObjectCount || 0} preview object(s); source mutation ${summary.mutationExecuted ? 'recorded' : 'none'}.`,
    firstScreen: summary.status === 'blocked',
    layout: layout(18, 82),
  });

  if (shardImport?.summary && shardImport.summary.status !== 'not_run') {
    objects.push({
      id: `receipt.asset-shard-import.${shortHash(shardImport.importId || shardImport.generatedAt || 'asset-shard-import')}`,
      objectKind: 'receipt',
      displayName: 'Shard Import Receipt',
      sourceKind: 'receipt',
      sourceRef: shardImport.output?.receiptPath || '',
      capabilityFamily: 'creator_workflow',
      trustState: shardImport.summary.status === 'completed' && !shardImport.summary.sourceAssetsMutated ? 'verified' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'asset_shard_import_receipt',
      visualForm: shardImport.summary.status === 'completed' ? 'receipt_node' : 'warning_token',
      status: shardImport.summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['asset_shard_import_receipt', 'imported_shard_manifest'],
      relationships: {
        shardId: shardImport.summary.shardId || '',
        manifestPath: shardImport.output?.manifestPath || '',
        shardSourcePath: shardImport.output?.shardSourcePath || '',
        runtimeMutationExecuted: Boolean(shardImport.summary.runtimeMutationExecuted),
        sourceAssetsMutated: Boolean(shardImport.summary.sourceAssetsMutated),
      },
      privacyClass: 'local_private',
      replacementPath: 'receipt_memory',
      glyph: 'IR',
      detail: `Imported ${shardImport.summary.assetCount || 0} asset(s) into runtime-local shard; source assets mutated ${shardImport.summary.sourceAssetsMutated ? 'yes' : 'no'}.`,
      firstScreen: true,
      layout: layout(19, 82),
    });
  }

  return objects;
}

function photoBackupObjects({ photoBackupCustody }) {
  if (!photoBackupCustody?.summary) return [];
  const summary = photoBackupCustody.summary;
  return [
    {
      id: `receipt.photo-backup.${shortHash(photoBackupCustody.receiptId || photoBackupCustody.generatedAt || 'photo-backup')}`,
      objectKind: 'receipt',
      displayName: 'Photo Backup Receipt',
      sourceKind: 'receipt',
      sourceRef: photoBackupCustody.output?.latestPath || '',
      capabilityFamily: 'family_memory',
      trustState: summary.originalsDeleted ? 'failed' : summary.deleteBlocked ? 'verified' : 'partial',
      permissionEnvelope: 'read_only',
      adapterPath: 'photo_backup_custody_bridge',
      visualForm: summary.status === 'blocked' || !summary.deleteBlocked ? 'warning_token' : 'receipt_node',
      status: summary.status || 'unknown',
      actorLaneId: 'codex-hardware',
      receiptTypes: ['photo_backup_custody_receipt', 'photo_backup_private_receipt'],
      relationships: {
        receiptId: photoBackupCustody.receiptId || '',
        albumCount: summary.albumCount || 0,
        photoCount: summary.photoCount || 0,
        videoCount: summary.videoCount || 0,
        duplicateGroupCount: summary.duplicateGroupCount || 0,
        privateReceiptPath: photoBackupCustody.output?.privateReceiptPath || '',
        publicPathRedacted: photoBackupCustody.source?.pathPolicy === 'absolute_path_kept_in_private_receipt_only',
        deleteBlocked: summary.deleteBlocked !== false,
        restoreVerified: Boolean(summary.restoreVerified),
        originalsDeleted: Boolean(summary.originalsDeleted),
      },
      privacyClass: 'local_private',
      replacementPath: 'receipt_memory',
      glyph: 'PR',
      detail: `${summary.albumCount || 0} album(s), ${summary.photoCount || 0} photo/raw file(s), ${summary.videoCount || 0} video(s); originals deleted ${summary.originalsDeleted ? 'yes' : 'no'}; restore ${summary.restoreVerified ? 'verified' : 'pending'}.`,
      firstScreen: summary.status === 'blocked' || summary.originalsDeleted,
      layout: layout(20, 82),
    },
    {
      id: 'blocker.photo-original-delete',
      objectKind: 'safety_blocker',
      displayName: 'Photo Delete Blocker',
      sourceKind: 'policy',
      sourceRef: 'apps/holoshell/source/holoshell-family-photo-backup-custody-policy.hsplus',
      capabilityFamily: 'family_memory',
      trustState: summary.deleteBlocked && !summary.originalsDeleted ? 'verified' : 'failed',
      permissionEnvelope: 'break_glass',
      adapterPath: 'photo_backup_delete_blocker',
      visualForm: 'lock_gate',
      status: summary.deleteBlocked ? 'locked' : 'unlocked',
      actorLaneId: 'holoshell-custodian',
      receiptTypes: ['photo_restore_proof_receipt', 'break_glass_delete_receipt'],
      relationships: {
        verifiedRestoreRequired: true,
        coolingOffRequired: true,
        separateApprovalRequired: true,
        restoreVerified: Boolean(summary.restoreVerified),
        originalsDeleted: Boolean(summary.originalsDeleted),
      },
      privacyClass: 'local_private',
      replacementPath: 'break_glass_delete_policy',
      glyph: 'DL',
      detail: 'Original photo deletion stays locked until verified restore, cooling-off, and separate break-glass approval receipts exist.',
      firstScreen: true,
      layout: layout(21, 82),
    },
  ];
}

function receiptObjects({ hardwareAction, hardwareApproval, accountTaskCustody, packageCustody, founderEvidenceDemo, receiptControl, workflow, workflowApproval, workflowIntentGate }) {
  const receipts = [];
  if (hardwareAction?.summary) {
    receipts.push({
      id: `receipt.hardware-action.${shortHash(hardwareAction.actionId || hardwareAction.generatedAt || 'hardware')}`,
      objectKind: 'receipt',
      displayName: 'Hardware Receipt',
      sourceKind: 'receipt',
      sourceRef: hardwareAction.actionId || '',
      capabilityFamily: 'evidence',
      trustState: hardwareAction.summary.status === 'completed' ? 'verified' : 'partial',
      permissionEnvelope: hardwareAction.summary.permissionEnvelope || 'unknown',
      adapterPath: 'hardware_action_executor',
      visualForm: 'receipt_node',
      status: hardwareAction.summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: hardwareAction.browserBoundary ? ['hardware_action_receipt', 'browser_boundary_receipt'] : ['hardware_action_receipt'],
      relationships: {
        actionKind: hardwareAction.summary.actionKind || '',
        targetWindowTitle: hardwareAction.summary.targetWindowTitle || '',
        targetUrlHost: hardwareAction.summary.targetUrlHost || '',
        shellVisibleChange: Boolean(hardwareAction.summary.shellVisibleChange),
        visibleWitnessKind: hardwareAction.summary.visibleWitnessKind || '',
        mutatingActionExecuted: Boolean(hardwareAction.summary.mutatingActionExecuted),
        browserBoundaryStatus: hardwareAction.summary.browserBoundaryStatus || hardwareAction.browserBoundary?.urlClassification || '',
        browserProfileBoundary: hardwareAction.summary.browserProfileBoundary || hardwareAction.browserBoundary?.profileBoundary || '',
        browserCookiePolicy: hardwareAction.browserBoundary?.cookiePolicy || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'receipt_memory',
      glyph: 'RC',
      detail: `Last hardware action ${hardwareAction.summary.status || 'unknown'}; ${hardwareAction.summary.actionKind || 'none'}${hardwareAction.browserBoundary ? `; browser ${hardwareAction.browserBoundary.urlClassification} / ${hardwareAction.browserBoundary.profileBoundary}` : ''}.`,
      firstScreen: false,
      layout: layout(16, 82),
    });
  }
  if (accountTaskCustody?.summary) {
    const summary = accountTaskCustody.summary;
    receipts.push({
      id: `receipt.account-task-custody.${shortHash(accountTaskCustody.custodyId || accountTaskCustody.generatedAt || 'account-task-custody')}`,
      objectKind: 'receipt',
      displayName: 'Account Task Receipt',
      sourceKind: 'receipt',
      sourceRef: accountTaskCustody.custodyId || '',
      capabilityFamily: 'account_custody',
      trustState: summary.accountMutationPerformed || summary.sourceFileMutationPerformed ? 'partial' : 'verified',
      permissionEnvelope: summary.approvalRequired ? 'break_glass_account_mutation' : 'read_only',
      adapterPath: 'account_task_custody',
      visualForm: summary.approvalRequired ? 'approval_token' : 'receipt_node',
      status: summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['account_boundary_receipt', 'draft_proposal_receipt', 'immutable_draft_approval_receipt'],
      relationships: {
        provider: summary.provider || '',
        accountBoundaryStatus: summary.accountBoundaryStatus || '',
        credentialAdjacent: Boolean(summary.credentialAdjacent),
        draftHash: summary.draftHash || '',
        approvalId: summary.approvalId || '',
        executionAllowed: Boolean(summary.executionAllowed),
        accountMutationPerformed: Boolean(summary.accountMutationPerformed),
        sourceFileMutationPerformed: Boolean(summary.sourceFileMutationPerformed),
        rollbackLimitCount: Array.isArray(accountTaskCustody.approval?.rollbackLimits) ? accountTaskCustody.approval.rollbackLimits.length : 0,
      },
      privacyClass: 'credential_adjacent_local_private',
      replacementPath: 'draft_then_fresh_human_gesture',
      glyph: 'AT',
      detail: `Account task ${summary.status || 'unknown'} on ${summary.provider || 'unknown provider'}; draft ${summary.draftHash ? 'hash-bound' : 'missing'}; execution ${summary.executionAllowed ? 'allowed after approval' : 'blocked'}.`,
      firstScreen: Boolean(summary.approvalRequired),
      layout: layout(16, 84),
    });
  }
  if (packageCustody?.summary) {
    const summary = packageCustody.summary;
    receipts.push({
      id: `receipt.package-custody.${shortHash(packageCustody.id || packageCustody.generatedAt || 'package-custody')}`,
      objectKind: 'receipt',
      displayName: 'Tool Install Gate',
      sourceKind: 'receipt',
      sourceRef: packageCustody.id || '',
      capabilityFamily: 'package_custody',
      trustState: summary.mutationPerformed ? 'partial' : packageCustody.schemaContract?.status === 'valid' ? 'verified' : 'unknown',
      permissionEnvelope: summary.permissionEnvelope || 'break_glass',
      adapterPath: 'package_custody',
      visualForm: summary.approvalRequired ? 'approval_token' : 'receipt_node',
      status: summary.status || 'unknown',
      actorLaneId: 'codex-hardware',
      receiptTypes: ['package_mutation_receipt', 'approval_packet_receipt', 'rollback_limit_receipt'],
      relationships: {
        packageId: summary.packageId || '',
        manager: summary.manager || '',
        source: summary.source || '',
        fromVersion: summary.fromVersion || '',
        toVersion: summary.toVersion || '',
        approvalId: summary.approvalId || '',
        executionAllowed: Boolean(summary.executionAllowed),
        mutationPerformed: Boolean(summary.mutationPerformed),
        adminRequired: Boolean(summary.adminRequired),
        adminSession: Boolean(summary.adminSession),
        packageManagerAvailable: Boolean(summary.packageManagerAvailable),
        rollbackLimitCount: summary.rollbackLimitCount || 0,
        schemaContractStatus: packageCustody.schemaContract?.status || 'unknown',
      },
      privacyClass: 'local_private',
      replacementPath: 'fresh_human_gesture_then_native_package_gate',
      glyph: 'PK',
      detail: `Package custody ${summary.packageName || summary.packageId || 'unknown package'} ${summary.fromVersion || 'unknown'} -> ${summary.toVersion || 'unknown'}; execution ${summary.executionAllowed ? 'allowed after approval' : 'blocked'}.`,
      firstScreen: Boolean(summary.approvalRequired),
      layout: layout(17, 84),
    });
  }
  if (founderEvidenceDemo?.summary) {
    const summary = founderEvidenceDemo.summary;
    receipts.push({
      id: `receipt.founder-evidence-demo.${shortHash(founderEvidenceDemo.demoId || founderEvidenceDemo.generatedAt || 'founder-evidence-demo')}`,
      objectKind: 'receipt',
      displayName: 'Founder Evidence Demo',
      sourceKind: 'receipt',
      sourceRef: founderEvidenceDemo.demoId || '',
      capabilityFamily: 'founder_evidence_demo',
      trustState: summary.executionPerformed ? 'verified' : 'partial',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'founder_evidence_demo',
      visualForm: summary.executionPerformed ? 'receipt_node' : 'approval_token',
      status: summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['founder_evidence_demo_receipt', 'hardware_action_receipt', 'hardware_approval_bundle'],
      relationships: {
        targetAction: summary.targetAction || '',
        targetLabel: summary.targetLabel || '',
        evidenceRung: summary.evidenceRung || '',
        approvalId: summary.approvalId || '',
        executionAllowed: Boolean(summary.executionAllowed),
        executionPerformed: Boolean(summary.executionPerformed),
        visibleShellChange: Boolean(summary.visibleShellChange),
        visibleWitnessKind: summary.visibleWitnessKind || '',
        beforeWindowCount: summary.beforeWindowCount || 0,
        afterWindowCount: summary.afterWindowCount || 0,
      },
      privacyClass: 'local_private',
      replacementPath: 'approve_one_real_app_then_receipt',
      glyph: 'FD',
      detail: `Founder demo ${summary.status || 'unknown'}; ${summary.targetAction || 'action'} ${summary.targetLabel || 'target'}; rung ${summary.evidenceRung || 'unknown'}.`,
      firstScreen: true,
      layout: layout(20, 84),
    });
  }
  if (receiptControl?.summary) {
    const summary = receiptControl.summary;
    receipts.push({
      id: `receipt.control.${shortHash(receiptControl.receiptControlId || receiptControl.generatedAt || 'receipt-control')}`,
      objectKind: 'receipt_control',
      displayName: 'Receipt Controls',
      sourceKind: 'receipt',
      sourceRef: receiptControl.receiptControlId || '',
      capabilityFamily: 'receipt_control',
      trustState: summary.status === 'ready' ? 'verified' : 'partial',
      permissionEnvelope: summary.rollbackExecutable ? 'guarded_execute' : 'read_only',
      adapterPath: 'receipt_control',
      visualForm: 'control_panel',
      status: summary.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['receipt_control_receipt', 'founder_evidence_demo_receipt'],
      relationships: {
        sourceReceiptId: summary.sourceReceiptId || '',
        targetLabel: summary.targetLabel || '',
        targetUrl: summary.targetUrl || '',
        replayAvailable: Boolean(summary.replayAvailable),
        replayRequiresFreshApproval: Boolean(summary.replayRequiresFreshApproval),
        rollbackExecutable: Boolean(summary.rollbackExecutable),
        rollbackBlockReason: summary.rollbackBlockReason || '',
        taskPacketReady: Boolean(summary.taskPacketReady),
        exactTargetIdentityStatus: summary.exactTargetIdentityStatus || '',
        visibleWitnessKind: summary.visibleWitnessKind || '',
      },
      privacyClass: 'local_private',
      replacementPath: 'receipt_control_surface',
      glyph: 'RC',
      detail: `Receipt controls ${summary.status || 'unknown'} for ${summary.targetLabel || 'target'}; replay ${summary.replayAvailable ? 'available' : 'blocked'}; rollback ${summary.rollbackExecutable ? 'executable' : 'advisory'}.`,
      firstScreen: true,
      layout: layout(22, 86),
    });
  }
  if (workflow?.summary || workflowApproval?.summary || workflowIntentGate?.summary) {
    receipts.push({
      id: `receipt.workflow.${shortHash(workflow?.workflowId || workflowApproval?.approvalId || workflowIntentGate?.gateId || 'workflow')}`,
      objectKind: 'receipt',
      displayName: 'Workflow Receipt',
      sourceKind: 'receipt',
      sourceRef: workflow?.workflowId || workflowApproval?.approvalId || workflowIntentGate?.gateId || '',
      capabilityFamily: 'evidence',
      trustState: workflowIntentGate?.summary?.executionAllowed ? 'verified' : 'partial',
      permissionEnvelope: 'guarded_execute',
      adapterPath: 'workflow_receipt_bundle',
      visualForm: 'receipt_node',
      status: workflow?.summary?.status || workflowApproval?.summary?.status || workflowIntentGate?.summary?.status || 'unknown',
      actorLaneId: 'brittney',
      receiptTypes: ['workflow_receipt', 'workflow_approval_bundle', 'brain_intent_gate_receipt'],
      relationships: {
        workflowStatus: workflow?.summary?.status || '',
        approvalStatus: workflowApproval?.summary?.status || '',
        gateStatus: workflowIntentGate?.summary?.status || '',
        executionAllowed: Boolean(workflowApproval?.summary?.executionAllowed && workflowIntentGate?.summary?.executionAllowed),
      },
      privacyClass: 'local_private',
      replacementPath: 'receipt_memory',
      glyph: 'WF',
      detail: `Workflow approval ${workflowApproval?.summary?.status || 'unknown'}; brain gate ${workflowIntentGate?.summary?.status || 'unknown'}.`,
      firstScreen: false,
      layout: layout(17, 82),
    });
  }
  return receipts;
}

function buildCustodyObjects({ buildCustody }) {
  if (!buildCustody?.summary) return [];
  const summary = buildCustody.summary;
  const trees = Array.isArray(buildCustody.buildTrees) ? buildCustody.buildTrees : [];
  const objects = [];

  objects.push({
    id: 'receipt.build-custody',
    objectKind: 'receipt',
    displayName: 'Build Custody',
    sourceKind: 'receipt',
    sourceRef: buildCustody.sourceAnchors?.adapter || 'scripts/holoshell-build-custody.mjs',
    capabilityFamily: 'evidence',
    trustState: summary.riskState === 'pass' ? 'verified' : summary.riskState === 'warn' ? 'partial' : 'unknown',
    permissionEnvelope: 'read_only',
    adapterPath: 'holoshell_build_custody_bridge',
    visualForm: summary.riskState === 'critical' ? 'warning_token' : 'receipt_node',
    status: summary.scannerStatus === 'available' ? 'running' : summary.scannerStatus || 'unknown',
    actorLaneId: 'brittney',
    receiptTypes: ['build_custody_receipt', 'process_health_receipt'],
    relationships: {
      buildProcessCount: summary.buildProcessCount || 0,
      activeBuildTreeCount: summary.activeBuildTreeCount || 0,
      longRunningBuildCount: summary.longRunningBuildCount || 0,
      highMemoryBuildCount: summary.highMemoryBuildCount || 0,
      riskState: summary.riskState || 'unknown',
      scannerStatus: summary.scannerStatus || 'unknown',
      rawCommandsIncluded: Boolean(summary.rawCommandsIncluded),
    },
    privacyClass: 'local_private',
    replacementPath: 'receipt_memory',
    glyph: 'BC',
    detail: `${summary.buildProcessCount || 0} build process(es) across ${summary.activeBuildTreeCount || 0} tree(s); ${summary.longRunningBuildCount || 0} long-running; ${summary.highMemoryBuildCount || 0} high-memory; risk ${summary.riskState || 'unknown'}.`,
    firstScreen: summary.riskState !== 'pass' && summary.riskState !== 'unknown',
    layout: { x: 5, y: 88, size: 96 },
  });

  const treeSlots = [
    { x: 10, y: 12, size: 86 },
    { x: 22, y: 8, size: 84 },
    { x: 34, y: 14, size: 82 },
    { x: 46, y: 10, size: 80 },
  ];

  for (const [index, tree] of trees.slice(0, 6).entries()) {
    const slot = treeSlots[index] || layout(index + 22, 78);
    const treeStatus = tree.status || 'unknown';
    const isReview = treeStatus === 'memory_review' || treeStatus === 'long_running';
    const ownerLaneId = tree.ownerLaneId || '';
    const ownerLaneLabel = tree.ownerLaneLabel || ownerLaneId || '';
    const displayName = ownerLaneLabel ? `${ownerLaneLabel} Build Tree` : tree.rootName ? `${tree.rootName} Build Tree` : 'Build Tree';
    const buildKinds = Array.isArray(tree.buildKinds) ? tree.buildKinds : [];
    const findings = Array.isArray(tree.findings) ? tree.findings : [];
    const processPids = Array.isArray(tree.processPids) ? tree.processPids : [];
    objects.push({
      id: `process.build-tree.${tree.treeId || `tree-${index}`}`,
      objectKind: 'process',
      displayName,
      sourceKind: 'process',
      sourceRef: tree.treeId || '',
      capabilityFamily: 'build_custody',
      trustState: isReview ? 'partial' : 'verified',
      permissionEnvelope: 'break_glass',
      adapterPath: 'build_custody_tree_bridge',
      visualForm: isReview ? 'warning_token' : 'machine',
      status: treeStatus === 'active' ? 'running' : treeStatus,
      actorLaneId: ownerLaneId,
      receiptTypes: ['build_custody_receipt', 'process_health_receipt'],
      relationships: {
        treeId: tree.treeId || '',
        rootPid: tree.rootPid || 0,
        rootName: tree.rootName || '',
        processCount: tree.processCount || 0,
        maxAgeMinutes: tree.maxAgeMinutes || 0,
        totalMemoryMb: tree.totalMemoryMb || 0,
        buildKinds,
        findings,
        processPids,
        ownerLaneId,
        ownerLaneLabel,
        ownerAgentKind: tree.ownerAgentKind || '',
        ownerColorHint: tree.ownerColorHint || '',
        ownerEvidence: Array.isArray(tree.ownerEvidence) ? tree.ownerEvidence : [],
        ownerParentPid: tree.ownerParentPid || 0,
        receiptRequired: Boolean(tree.receiptRequired),
        rawCommandsIncluded: Boolean(tree.rawCommandsIncluded),
        stopPolicy: 'break_glass_required',
      },
      privacyClass: 'local_private',
      replacementPath: 'observe_then_break_glass',
      glyph: 'BT',
      detail: `${displayName}: ${tree.processCount || 0} process(es), ${tree.totalMemoryMb || 0} MB, ${ownerLaneLabel ? `owner ${ownerLaneLabel}` : 'owner unknown'}, status ${treeStatus}; break-glass stop only.`,
      firstScreen: isReview || index < 2,
      layout: slot,
    });
  }

  return objects;
}

function summarize(objects, feeds) {
  const countByKind = {};
  const countByStatus = {};
  for (const object of objects) {
    countByKind[object.objectKind] = (countByKind[object.objectKind] || 0) + 1;
    countByStatus[object.status] = (countByStatus[object.status] || 0) + 1;
  }
  const firstProgram = objects.find((object) => object.sourceKind === 'app');
  return {
    status: objects.length ? 'ready' : 'empty',
    shellObjectCount: objects.length,
    firstScreenObjectCount: objects.filter((object) => object.firstScreen).length,
    programObjectCount: objects.filter((object) => object.sourceKind === 'app').length,
    browserSurfaceCount: objects.filter((object) => object.objectKind === 'browser_surface').length,
    terminalSurfaceCount: objects.filter((object) => object.objectKind === 'terminal_surface').length,
    documentAppCount: objects.filter((object) => object.objectKind === 'document_app').length,
    agentObjectCount: objects.filter((object) => object.objectKind === 'agent_lane' || object.objectKind === 'assistant_avatar').length,
    workflowObjectCount: objects.filter((object) => object.objectKind === 'workflow').length,
    approvalObjectCount: objects.filter((object) => object.objectKind === 'approval').length,
    receiptObjectCount: objects.filter((object) => object.objectKind === 'receipt').length,
    processObjectCount: objects.filter((object) => object.objectKind === 'process').length,
    buildCustodyObjectCount: objects.filter((object) => object.capabilityFamily === 'build_custody').length,
    buildCustodyProcessObjectCount: objects.filter((object) => object.objectKind === 'process' && object.capabilityFamily === 'build_custody').length,
    readinessObjectCount: objects.filter((object) => object.capabilityFamily === 'readiness_evidence').length,
    readinessWarningObjectCount: objects.filter((object) => object.capabilityFamily === 'readiness_evidence' && ['warn', 'skipped', 'reported_fail', 'fail'].includes(object.status)).length,
    worldBuildBlockingReasonObjectCount: objects.filter((object) => object.objectKind === 'readiness_blocker').length,
    fleetReadinessObjectCount: objects.filter((object) => object.capabilityFamily === 'fleet_readiness').length,
    fleetLaneObjectCount: objects.filter((object) => object.objectKind === 'fleet_lane').length,
    fleetJobObjectCount: objects.filter((object) => object.objectKind === 'fleet_job').length,
    fleetJobBlockingReasonObjectCount: objects.filter((object) => object.objectKind === 'fleet_job_blocker').length,
    fleetReadinessStatus: feeds.fleetReadiness?.summary?.status || 'unknown',
    fleetJobId: feeds.fleetReadiness?.summary?.jobId || '',
    fleetLaneId: feeds.fleetReadiness?.summary?.laneId || '',
    mcpCustodyContractObjectCount: objects.filter((object) => object.capabilityFamily === 'mcp_custody_contract').length,
    mcpCustodyContractStatus: feeds.mcpCustodyContract?.summary?.status || 'unknown',
    mcpCustodyCompatibilityMode: feeds.mcpCustodyContract?.summary?.compatibilityMode || 'unknown',
    nativeMcpCustodySplit: Boolean(feeds.mcpCustodyContract?.summary?.nativeMcpCustodySplit),
    mcpUpstreamHandoffObjectCount: objects.filter((object) => object.capabilityFamily === 'mcp_custody_upstream_handoff').length,
    mcpUpstreamHandoffStatus: feeds.mcpUpstreamHandoff?.summary?.status || 'unknown',
    mcpUpstreamHandoffTargetTool: feeds.mcpUpstreamHandoff?.summary?.targetTool || '',
    mcpUpstreamHandoffTaskCount: feeds.mcpUpstreamHandoff?.summary?.taskCount || 0,
    serviceSupervisorObjectCount: objects.filter((object) => object.capabilityFamily === 'service_supervisor').length,
    serviceSupervisorStatus: feeds.serviceSupervisor?.summary?.status || 'unknown',
    serviceSupervisorRequestedAction: feeds.serviceSupervisor?.summary?.requestedAction || 'unknown',
    serviceSupervisorServiceCount: feeds.serviceSupervisor?.summary?.serviceCount || 0,
    serviceSupervisorRequiredServiceCount: feeds.serviceSupervisor?.summary?.requiredServiceCount || 0,
    serviceSupervisorRequiredOnlineServiceCount: feeds.serviceSupervisor?.summary?.requiredOnlineServiceCount || 0,
    serviceSupervisorRequiredAttentionCount: feeds.serviceSupervisor?.summary?.requiredAttentionCount || 0,
    serviceSupervisorOptionalOfflineServiceCount: feeds.serviceSupervisor?.summary?.optionalOfflineServiceCount || 0,
    serviceSupervisorActionRequiredCount: feeds.serviceSupervisor?.summary?.actionRequiredCount || 0,
    serviceSupervisorManagedPidServiceCount: feeds.serviceSupervisor?.summary?.managedPidServiceCount || 0,
    serviceSupervisorVerifiedPidServiceCount: feeds.serviceSupervisor?.summary?.verifiedPidServiceCount || 0,
    serviceSupervisorHeartbeatOnlyServiceCount: feeds.serviceSupervisor?.summary?.heartbeatOnlyServiceCount || 0,
    serviceSupervisorLocalDaemonServiceCount: feeds.serviceSupervisor?.summary?.localDaemonServiceCount || 0,
    serviceSupervisorServiceMutationTaken: Boolean(feeds.serviceSupervisor?.summary?.serviceMutationTaken),
    serviceSupervisorDestructiveActionsTaken: Boolean(feeds.serviceSupervisor?.receipt?.destructiveActionsTaken),
    founderHostObjectCount: objects.filter((object) => object.capabilityFamily === 'founder_host').length,
    founderHostStatus: feeds.founderHost?.summary?.status || 'unknown',
    founderHostPrimarySurfaceOwnership: feeds.founderHost?.summary?.primarySurfaceOwnership || 'unknown',
    founderHostSourceReady: Boolean(feeds.founderHost?.summary?.sourceReady),
    founderHostPreviewReady: Boolean(feeds.founderHost?.summary?.previewHostReady),
    founderHostNativeWrapperPresent: Boolean(feeds.founderHost?.summary?.nativeWrapperPresent),
    founderHostStartupIntegrationPresent: Boolean(feeds.founderHost?.summary?.startupIntegrationPresent),
    founderHostShellObjectGraphReady: Boolean(feeds.founderHost?.summary?.shellObjectGraphReady),
    founderHostLiveFeedReady: Boolean(feeds.founderHost?.summary?.liveFeedReady),
    founderHostServiceSupervisorReady: Boolean(feeds.founderHost?.summary?.serviceSupervisorReady),
    founderHostNextMove: feeds.founderHost?.summary?.nextMove || '',
    nativeWrapperObjectCount: objects.filter((object) => object.capabilityFamily === 'native_wrapper').length,
    nativeWrapperStatus: feeds.nativeWrapper?.summary?.status || 'unknown',
    nativeWrapperLaunchable: Boolean(feeds.nativeWrapper?.summary?.launchable),
    nativeWrapperBrowserCandidateCount: feeds.nativeWrapper?.summary?.browserCandidateCount || 0,
    nativeWrapperStartupIntegrationPresent: Boolean(feeds.nativeWrapper?.summary?.startupIntegrationPresent),
    nativeWrapperStartupRegistered: Boolean(feeds.nativeWrapper?.summary?.startupRegistered),
    nativeWrapperStartsWithoutManualHtml: Boolean(feeds.nativeWrapper?.summary?.startsWithoutManualHtml),
    nativeWrapperNextMove: feeds.nativeWrapper?.summary?.nextMove || '',
    startupIntegrationObjectCount: objects.filter((object) => object.capabilityFamily === 'startup_integration').length,
    startupIntegrationStatus: feeds.startupIntegration?.summary?.status || 'unknown',
    startupIntegrationPresent: Boolean(feeds.startupIntegration?.summary?.startupIntegrationPresent),
    startupIntegrationRegistered: Boolean(feeds.startupIntegration?.summary?.startupRegistered),
    startupIntegrationApprovalRequired: Boolean(feeds.startupIntegration?.summary?.approvalRequired),
    startupIntegrationNextMove: feeds.startupIntegration?.summary?.nextMove || '',
    assetShardWorkflowObjectCount: objects.filter((object) => object.capabilityFamily === 'creator_workflow').length,
    photoBackupCustodyObjectCount: objects.filter((object) => object.capabilityFamily === 'family_memory').length,
    photoBackupCustodyStatus: feeds.photoBackupCustody?.summary?.status || 'unknown',
    photoBackupCustodyPhotoCount: feeds.photoBackupCustody?.summary?.photoCount || 0,
    photoBackupCustodyVideoCount: feeds.photoBackupCustody?.summary?.videoCount || 0,
    photoBackupCustodyDuplicateGroupCount: feeds.photoBackupCustody?.summary?.duplicateGroupCount || 0,
    photoBackupCustodyDeleteBlocked: feeds.photoBackupCustody?.summary?.deleteBlocked !== false,
    photoBackupCustodyRestoreVerified: Boolean(feeds.photoBackupCustody?.summary?.restoreVerified),
    founderShellObjectCount: objects.filter((object) => object.capabilityFamily === 'founder_shell').length,
    userShellObjectCount: objects.filter((object) => object.capabilityFamily === 'user_shell').length,
    userShellModeObjectCount: objects.filter((object) => object.objectKind === 'user_shell_mode').length,
    userCapabilityPackObjectCount: objects.filter((object) => object.capabilityFamily === 'user_capability_pack').length,
    formatViewerObjectCount: objects.filter((object) => object.id === 'source.format-viewer').length,
    wildHoloScriptObjectCount: objects.filter((object) => object.capabilityFamily === 'source_corpus').length,
    sourceSubstrateObjectCount: objects.filter((object) => object.capabilityFamily === 'source_substrate').length,
    goldCodebaseBridgeStatus: feeds.goldCodebaseBridge?.summary?.status || 'unknown',
    goldDriveStatus: feeds.goldCodebaseBridge?.summary?.goldStatus || 'unknown',
    goldEntryCount: feeds.goldCodebaseBridge?.summary?.goldEntryCount || 0,
    goldHotEntryCount: feeds.goldCodebaseBridge?.summary?.goldHotEntryCount || 0,
    codebaseBridgeStatus: feeds.goldCodebaseBridge?.summary?.codebaseStatus || 'unknown',
    codebaseToolCount: feeds.goldCodebaseBridge?.summary?.codebaseToolCount || 0,
    codebaseGraphCacheProtocol: feeds.goldCodebaseBridge?.summary?.graphCacheProtocol || 'unknown',
    founderBootStatus: feeds.founderBootPreview?.summary?.status || 'unknown',
    userShellProjectionStatus: feeds.userShellProjection?.summary?.status || 'unknown',
    developmentalEnvironmentStatus: feeds.developmentalEnvironment?.summary?.status || 'unknown',
    developmentalEnvironmentObjectCount: objects.filter((object) => object.capabilityFamily === 'developmental_environment' || object.capabilityFamily === 'developmental_environment_policy').length,
    developmentalEnvironmentSpineLayerCount: feeds.developmentalEnvironment?.summary?.spineLayerCount || 0,
    developmentalEnvironmentBoardTaskCount: feeds.developmentalEnvironment?.summary?.boardTaskCount || 0,
    developmentalEnvironmentOpenEngineeringTaskCount: feeds.developmentalEnvironment?.summary?.openEngineeringTaskCount || 0,
    developmentalEnvironmentResearchPresent: Boolean(feeds.developmentalEnvironment?.summary?.researchPresent),
    developmentalEnvironmentMassFunctionSettled: Boolean(feeds.developmentalEnvironment?.summary?.massFunctionSettled),
    developmentalEnvironmentMappingFunctionSettled: Boolean(feeds.developmentalEnvironment?.summary?.mappingFunctionSettled),
    developmentalEnvironmentNextMove: feeds.developmentalEnvironment?.summary?.nextMove || '',
    agentDispatchStatus: feeds.agentDispatch?.summary?.status || 'unknown',
    agentDispatchCapabilityId: feeds.agentDispatch?.summary?.capabilityId || '',
    agentDispatchCapabilityLabel: feeds.agentDispatch?.summary?.capabilityLabel || '',
    agentDispatchKind: feeds.agentDispatch?.summary?.dispatchKind || '',
    agentDispatchRoute: feeds.agentDispatch?.summary?.route || '',
    agentDispatchConfidence: feeds.agentDispatch?.summary?.confidence || 0,
    sovereignRoomMarathonStatus: feeds.sovereignRoomMarathon?.summary?.status || 'unknown',
    sovereignRoomTaskLane: feeds.sovereignRoomMarathon?.summary?.taskLane || 'local',
    sovereignRoomTaskTag: feeds.sovereignRoomMarathon?.summary?.taskTag || 'local',
    sovereignRoomQueueOpenCount: feeds.sovereignRoomMarathon?.summary?.queueOpenCount || 0,
    sovereignRoomMatchedCandidateCount: feeds.sovereignRoomMarathon?.summary?.matchedCandidateCount || 0,
    sovereignRoomSelectedTaskId: feeds.sovereignRoomMarathon?.summary?.selectedTaskId || '',
    sovereignRoomSelectedTaskTitle: feeds.sovereignRoomMarathon?.summary?.selectedTaskTitle || '',
    sovereignRoomClaimSucceeded: Boolean(feeds.sovereignRoomMarathon?.summary?.claimSucceeded),
    sovereignRoomCompletionClaimAllowed: Boolean(feeds.sovereignRoomMarathon?.summary?.completionClaimAllowed),
    grokBuildSetupStatus: feeds.grokBuild?.summary?.status || 'unknown',
    grokBuildCliStatus: feeds.grokBuild?.summary?.cliStatus || 'unknown',
    grokBuildCliVersion: feeds.grokBuild?.summary?.cliVersion || 'unknown',
    grokBuildAuthStatus: feeds.grokBuild?.summary?.authStatus || 'unknown',
    grokBuildAuthRuntimeStatus: feeds.grokBuild?.summary?.authRuntimeStatus || 'unknown',
    grokBuildAuthProvider: feeds.grokBuild?.summary?.authProvider || '',
    grokBuildOperatorStatus: feeds.grokBuild?.summary?.operatorStatus || 'unknown',
    grokBuildAutonomyStatus: feeds.grokBuild?.summary?.autonomyStatus || 'unknown',
    grokBuildModelStatus: feeds.grokBuild?.summary?.modelStatus || 'unknown',
    grokBuildRequestedModel: feeds.grokBuild?.summary?.requestedModel || '',
    grokBuildDefaultModel: feeds.grokBuild?.summary?.defaultModel || '',
    grokBuildProjectTrusted: Boolean(feeds.grokBuild?.summary?.projectTrusted),
    grokBuildProjectTrustStatus: feeds.grokBuild?.summary?.projectTrustStatus || 'unknown',
    grokBuildWarningCount: feeds.grokBuild?.summary?.warningCount || 0,
    grokBuildReadyForHeavyRecheck: Boolean(feeds.grokBuild?.summary?.readyForHeavyRecheck),
    grokBuildReadyForGrokBuild: Boolean(feeds.grokBuild?.summary?.readyForGrokBuild),
    grokBuildHeavyAccessStatus: feeds.grokBuild?.summary?.heavyAccessStatus || feeds.grokBuild?.heavyUpgrade?.status || 'unknown',
    grokHeartbeatStatus: feeds.grokHeartbeat?.summary?.status || 'unknown',
    grokHeartbeatPresenceStatus: feeds.grokHeartbeat?.summary?.agentPresenceStatus || 'unknown',
    grokHeartbeatObservationStatus: feeds.grokHeartbeat?.summary?.latestObservationStatus || 'none',
    grokHeartbeatObservationRecent: Boolean(feeds.grokHeartbeat?.summary?.latestObservationRecent),
    trustLedgerStatus: feeds.trustLedger?.summary?.status || 'unknown',
    trustLedgerRecordCount: feeds.trustLedger?.summary?.recordCount || 0,
    trustedAutonomyLatestLevel: feeds.trustLedger?.summary?.latestTrustLevel || 'unknown',
    trustedAutonomyLatestActionKind: feeds.trustLedger?.summary?.latestActionKind || '',
    trustedAutonomyLatestTarget: feeds.trustLedger?.summary?.latestTarget || '',
    trustedAutonomyEligible: Boolean(feeds.trustLedger?.summary?.trustedAutonomyEligible),
    trustedAutonomyTrustedRecordCount: feeds.trustLedger?.summary?.trustedRecordCount || 0,
    trustedAutonomyGuardedRecordCount: feeds.trustLedger?.summary?.guardedRecordCount || 0,
    trustedAutonomyBreakGlassRecordCount: feeds.trustLedger?.summary?.breakGlassRecordCount || 0,
    trustedAutonomySuccessesUntilTrusted: feeds.trustLedger?.summary?.successesUntilTrusted || 0,
    accountTaskCustodyObjectCount: objects.filter((object) => object.capabilityFamily === 'account_custody').length,
    accountTaskCustodyStatus: feeds.accountTaskCustody?.summary?.status || 'unknown',
    accountTaskCustodyProvider: feeds.accountTaskCustody?.summary?.provider || '',
    accountTaskCustodyBoundaryStatus: feeds.accountTaskCustody?.summary?.accountBoundaryStatus || 'unknown',
    accountTaskCustodyApprovalRequired: Boolean(feeds.accountTaskCustody?.summary?.approvalRequired),
    accountTaskCustodyExecutionAllowed: Boolean(feeds.accountTaskCustody?.summary?.executionAllowed),
    accountTaskCustodyMutationPerformed: Boolean(feeds.accountTaskCustody?.summary?.accountMutationPerformed),
    accountTaskCustodySourceMutationPerformed: Boolean(feeds.accountTaskCustody?.summary?.sourceFileMutationPerformed),
    packageCustodyObjectCount: objects.filter((object) => object.capabilityFamily === 'package_custody').length,
    packageCustodyStatus: feeds.packageCustody?.summary?.status || 'unknown',
    packageCustodyPackageId: feeds.packageCustody?.summary?.packageId || '',
    packageCustodyPackageName: feeds.packageCustody?.summary?.packageName || '',
    packageCustodyManager: feeds.packageCustody?.summary?.manager || '',
    packageCustodyFromVersion: feeds.packageCustody?.summary?.fromVersion || '',
    packageCustodyToVersion: feeds.packageCustody?.summary?.toVersion || '',
    packageCustodyApprovalRequired: Boolean(feeds.packageCustody?.summary?.approvalRequired),
    packageCustodyExecutionAllowed: Boolean(feeds.packageCustody?.summary?.executionAllowed),
    packageCustodyMutationPerformed: Boolean(feeds.packageCustody?.summary?.mutationPerformed),
    packageCustodySchemaStatus: feeds.packageCustody?.schemaContract?.status || 'unknown',
    founderEvidenceDemoObjectCount: objects.filter((object) => object.capabilityFamily === 'founder_evidence_demo').length,
    founderEvidenceDemoStatus: feeds.founderEvidenceDemo?.summary?.status || 'unknown',
    founderEvidenceDemoEvidenceRung: feeds.founderEvidenceDemo?.summary?.evidenceRung || '',
    founderEvidenceDemoTargetAction: feeds.founderEvidenceDemo?.summary?.targetAction || '',
    founderEvidenceDemoTargetLabel: feeds.founderEvidenceDemo?.summary?.targetLabel || '',
    founderEvidenceDemoExecutionAllowed: Boolean(feeds.founderEvidenceDemo?.summary?.executionAllowed),
    founderEvidenceDemoExecutionPerformed: Boolean(feeds.founderEvidenceDemo?.summary?.executionPerformed),
    founderEvidenceDemoVisibleShellChange: Boolean(feeds.founderEvidenceDemo?.summary?.visibleShellChange),
    founderEvidenceDemoVisibleWitnessKind: feeds.founderEvidenceDemo?.summary?.visibleWitnessKind || '',
    receiptControlObjectCount: objects.filter((object) => object.capabilityFamily === 'receipt_control').length,
    receiptControlStatus: feeds.receiptControl?.summary?.status || 'unknown',
    receiptControlTargetLabel: feeds.receiptControl?.summary?.targetLabel || '',
    receiptControlReplayAvailable: Boolean(feeds.receiptControl?.summary?.replayAvailable),
    receiptControlRollbackExecutable: Boolean(feeds.receiptControl?.summary?.rollbackExecutable),
    receiptControlTaskPacketReady: Boolean(feeds.receiptControl?.summary?.taskPacketReady),
    receiptControlExactTargetIdentityStatus: feeds.receiptControl?.summary?.exactTargetIdentityStatus || '',
    formatInventoryStatus: feeds.formatInventory?.summary?.status || 'unknown',
    wildHoloScriptStatus: feeds.wildHoloScript?.summary?.status || 'unknown',
    wildHoloScriptFileCount: feeds.wildHoloScript?.summary?.fileCount || 0,
    wildHoloScriptAdapterNeededCount: feeds.wildHoloScript?.summary?.adapterNeededCount || 0,
    assetShardImportApprovalStatus: feeds.shardImportApproval?.summary?.status || 'unknown',
    assetShardImportStatus: feeds.shardImport?.summary?.status || 'unknown',
    osUiTargetApp: feeds.osUiCapture?.summary?.targetApp || '',
    osUiTargetMatched: Boolean(feeds.osUiCapture?.summary?.targetMatched),
    osUiTargetResolved: Boolean(feeds.osUiCapture?.summary?.targetResolved || feeds.osUiCapture?.summary?.targetMatched),
    osUiTargetResolution: feeds.osUiCapture?.summary?.targetResolution || '',
    osUiSelectedWindowId: feeds.osUiCapture?.summary?.selectedWindowId || feeds.osUiCapture?.summary?.foregroundWindowId || '',
    osUiSelectedAppName: feeds.osUiCapture?.summary?.selectedAppName || '',
    osUiSelectedMutationPolicy: feeds.osUiCapture?.summary?.selectedMutationPolicy || '',
    osUiControlCount: feeds.osUiCapture?.summary?.controlCount || 0,
    osUiGeometryNodeCount: feeds.osUiCapture?.summary?.geometryNodeCount || 0,
    osUiActionBridgeStatus: feeds.osUiCapture?.summary?.actionBridgeStatus || '',
    capturedWindowObjectCount: objects.filter((object) => object.objectKind === 'captured_window').length,
    runningObjectCount: objects.filter((object) => ['running', 'foreground', 'selected'].includes(object.status)).length,
    guardedExecuteCount: objects.filter((object) => object.permissionEnvelope === 'guarded_execute').length,
    breakGlassCount: objects.filter((object) => object.permissionEnvelope === 'break_glass').length,
    firstProgramObject: firstProgram?.displayName || '',
    countByKind,
    countByStatus,
    sourceFeeds: {
      programRegistryStatus: feeds.programRegistry?.summary?.status || 'unknown',
      osUiCaptureStatus: feeds.osUiCapture?.summary?.status || 'unknown',
      readinessEvidenceStatus: feeds.readinessEvidence?.summary?.status || 'unknown',
      fleetReadinessStatus: feeds.fleetReadiness?.summary?.status || 'unknown',
      mcpCustodyContractStatus: feeds.mcpCustodyContract?.summary?.status || 'unknown',
      mcpUpstreamHandoffStatus: feeds.mcpUpstreamHandoff?.summary?.status || 'unknown',
      serviceSupervisorStatus: feeds.serviceSupervisor?.summary?.status || 'unknown',
      founderHostStatus: feeds.founderHost?.summary?.status || 'unknown',
      nativeWrapperStatus: feeds.nativeWrapper?.summary?.status || 'unknown',
      startupIntegrationStatus: feeds.startupIntegration?.summary?.status || 'unknown',
      goldCodebaseBridgeStatus: feeds.goldCodebaseBridge?.summary?.status || 'unknown',
      wildHoloScriptStatus: feeds.wildHoloScript?.summary?.status || 'unknown',
      formatInventoryStatus: feeds.formatInventory?.summary?.status || 'unknown',
      founderBootStatus: feeds.founderBootPreview?.summary?.status || 'unknown',
      userShellProjectionStatus: feeds.userShellProjection?.summary?.status || 'unknown',
      developmentalEnvironmentStatus: feeds.developmentalEnvironment?.summary?.status || 'unknown',
      agentDispatchStatus: feeds.agentDispatch?.summary?.status || 'unknown',
      sovereignRoomMarathonStatus: feeds.sovereignRoomMarathon?.summary?.status || 'unknown',
      grokBuildSetupStatus: feeds.grokBuild?.summary?.status || 'unknown',
      grokHeartbeatStatus: feeds.grokHeartbeat?.summary?.status || 'unknown',
      trustLedgerStatus: feeds.trustLedger?.summary?.status || 'unknown',
      accountTaskCustodyStatus: feeds.accountTaskCustody?.summary?.status || 'unknown',
      packageCustodyStatus: feeds.packageCustody?.summary?.status || 'unknown',
      founderEvidenceDemoStatus: feeds.founderEvidenceDemo?.summary?.status || 'unknown',
      receiptControlStatus: feeds.receiptControl?.summary?.status || 'unknown',
      assetShardWorkflowStatus: feeds.shardWorkflow?.summary?.status || 'unknown',
      photoBackupCustodyStatus: feeds.photoBackupCustody?.summary?.status || 'unknown',
      assetShardImportApprovalStatus: feeds.shardImportApproval?.summary?.status || 'unknown',
      assetShardImportStatus: feeds.shardImport?.summary?.status || 'unknown',
      buildCustodyStatus: feeds.buildCustody?.summary?.scannerStatus || feeds.buildCustody?.summary?.riskState || 'unknown',
      agentLaneCount: feeds.lanes?.summary?.laneCount || 0,
    },
  };
}

function loadFeeds(tmpDir) {
  const dir = resolveRepoPath(tmpDir);
  return {
    programRegistry: readJson(path.join(dir, 'program-registry.json'), {}),
    readinessEvidence: readJson(path.join(dir, 'readiness-evidence.json'), {}),
    fleetReadiness: readJson(path.join(dir, 'fleet-readiness-evidence.json'), {}),
    mcpCustodyContract: readJson(path.join(dir, 'mcp-custody-contract.json'), {}),
    mcpUpstreamHandoff: readJson(path.join(dir, 'mcp-custody-upstream-handoff.json'), {}),
    serviceSupervisor: readJson(path.join(dir, 'service-supervisor.json'), {}),
    goldCodebaseBridge: readJson(path.join(dir, 'holoscript-gold-codebase-bridge.json'), {}),
    wildHoloScript: readJson(path.join(dir, 'wild-holoscript-intake.json'), {}),
    formatInventory: readJson(path.join(dir, 'format-inventory.json'), {}),
    founderBootPreview: readJson(path.join(dir, 'founder-boot-preview.json'), {}),
    founderHost: readJson(path.join(dir, 'founder-host.json'), {}),
    nativeWrapper: readJson(path.join(dir, 'native-wrapper.json'), {}),
    startupIntegration: readJson(path.join(dir, 'startup-integration.json'), {}),
    userShellProjection: readJson(path.join(dir, 'user-shell-projection.json'), {}),
    developmentalEnvironment: readJson(path.join(dir, 'developmental-environment.json'), {}),
    agentDispatch: readJson(path.join(dir, 'agent-dispatch-latest.json'), {}),
    grokBuild: readJson(path.join(dir, 'grok-build-setup.json'), {}),
    grokHeartbeat: readJson(path.join(dir, 'grok-heartbeat.json'), {}),
    trustLedger: readJson(path.join(dir, 'trust-ledger.json'), {}),
    osUiCapture: readJson(path.join(dir, 'os-ui-capture.json'), {}),
    lanes: readJson(path.join(dir, 'agent-lanes.json'), {}),
    brittneyAvatar: readJson(path.join(dir, 'brittney-avatar.json'), {}),
    hardwareAction: readJson(path.join(dir, 'action-latest.json'), {}),
    hardwareApproval: readJson(path.join(dir, 'approval-latest.json'), {}),
    accountTaskCustody: readJson(path.join(dir, 'account-task-custody-latest.json'), {}),
    packageCustody: readJson(path.join(dir, 'package-custody-latest.json'), {}),
    founderEvidenceDemo: readJson(path.join(dir, 'founder-evidence-demo-latest.json'), {}),
    receiptControl: readJson(path.join(dir, 'receipt-control-latest.json'), {}),
    workflow: readJson(path.join(dir, 'workflow-latest.json'), {}),
    sovereignRoomMarathon: readJson(path.join(dir, 'sovereign-room-marathon-latest.json'), {}),
    workflowApproval: readJson(path.join(dir, 'workflow-approval-latest.json'), {}),
    workflowIntentGate: readJson(path.join(dir, 'brain-intent-gate-latest.json'), {}),
    shardWorkflow: readJson(path.join(dir, 'shard-workflow-latest.json'), {}),
    shardImportApproval: readJson(path.join(dir, 'shard-import-approval-latest.json'), {}),
    shardImport: readJson(path.join(dir, 'shard-import-latest.json'), {}),
    photoBackupCustody: readJson(path.join(dir, 'photo-backup-custody-latest.json'), {}),
    buildCustody: readJson(path.join(dir, 'build-custody.json'), {}),
  };
}

function buildGraph(args, fixtures = null) {
  const feeds = fixtures || loadFeeds(args.tmpDir);
  const generatedAt = new Date().toISOString();
  const objects = [
    ...baseShellObjects(feeds),
    ...founderBootObjects(feeds),
    ...userShellProjectionObjects(feeds),
    ...developmentalEnvironmentObjects(feeds),
    ...readinessObjects(feeds.readinessEvidence),
    ...fleetReadinessObjects(feeds.fleetReadiness),
    ...mcpCustodyContractObjects(feeds.mcpCustodyContract),
    ...mcpUpstreamHandoffObjects(feeds.mcpUpstreamHandoff),
    ...assetShardObjects(feeds),
    ...photoBackupObjects(feeds),
    ...buildCustodyObjects(feeds),
    ...programObjects(feeds.programRegistry, args.maxPrograms),
    ...capturedWindowObjects(feeds, args.maxWindows),
    ...agentObjects(feeds.lanes, args.maxAgents),
    ...receiptObjects(feeds),
  ];
  const seen = new Set();
  const uniqueObjects = objects.filter((object) => {
    if (seen.has(object.id)) return false;
    seen.add(object.id);
    return true;
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-home.hsplus',
      schema: 'apps/holoshell/docs/SHELL_OBJECT_SCHEMA.md',
      programRegistry: 'scripts/holoshell-program-registry.mjs',
      osUiCapture: 'scripts/holoshell-os-ui-capture.mjs',
      goldCodebaseBridge: 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs',
      wildHoloScriptIntake: 'scripts/holoshell-wild-holoscript-intake.mjs',
      formatInventory: 'scripts/holoshell-format-inventory.mjs',
      founderBootPreview: 'scripts/holoshell-founder-boot-preview.mjs',
      founderHost: 'scripts/holoshell-founder-host.mjs',
      nativeWrapper: 'scripts/holoshell-native-wrapper.mjs',
      startupIntegration: 'scripts/holoshell-startup-integration.mjs',
      userShellProjection: 'scripts/holoshell-user-shell-projection.mjs',
      developmentalEnvironment: 'scripts/holoshell-developmental-environment.mjs',
      sovereignRoomMarathon: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
      sovereignRoomMarathonAdapter: 'scripts/holoshell-sovereign-room-marathon.mjs',
      grokBuildWorkflow: 'scripts/holoshell-grok-build-workflow.mjs',
      grokHeartbeat: 'scripts/holoshell-grok-heartbeat.mjs',
      serviceSupervisor: 'scripts/holoshell-service-supervisor.mjs',
      trustedAutonomy: 'scripts/holoshell-trust-ledger.mjs',
      accountTaskCustody: 'scripts/holoshell-account-task-custody.mjs',
      packageCustody: 'scripts/holoshell-package-custody.mjs',
      founderEvidenceDemo: 'scripts/holoshell-founder-evidence-demo.mjs',
      receiptControl: 'scripts/holoshell-receipt-control.mjs',
      assetShardWorkflow: 'scripts/holoshell-asset-shard-workflow.mjs',
      assetShardImportApproval: 'scripts/holoshell-shard-import-approval.mjs',
      photoBackupCustody: 'scripts/holoshell-photo-backup-custody.mjs',
      buildCustody: 'scripts/holoshell-build-custody.mjs',
      mcpCustodyContract: 'scripts/holoshell-mcp-custody-contract.mjs',
      mcpUpstreamHandoff: 'scripts/holoshell-mcp-upstream-handoff.mjs',
      prototype: 'apps/holoshell/prototype/local-capability-room.html',
    },
    summary: summarize(uniqueObjects, feeds),
    objects: uniqueObjects,
    invariants: {
      noRawLaunchPathsInGraph: true,
      mutatingActionsRequireApproval: true,
      brittneyIsAssistantNotDesktop: true,
      legacyUiIsWrappedThenReimagined: true,
    },
  };
}

function fixtureFeeds() {
  return {
    programRegistry: {
      summary: { status: 'captured', programCount: 4, launchableProgramCount: 4, runningWindowCount: 1 },
      programs: [
        {
          id: 'program-chrome',
          displayName: 'Google Chrome',
          source: 'app_paths',
          capabilityClass: 'browser',
          trustState: 'partial',
          permissionEnvelope: 'guarded_execute',
          launchable: true,
          launchTarget: { type: 'registry' },
          runningWindowId: 'window-chrome',
          runningWindowTitle: 'HoloLand',
        },
        {
          id: 'program-excel',
          displayName: 'Excel',
          source: 'start_menu',
          capabilityClass: 'productivity',
          trustState: 'partial',
          permissionEnvelope: 'guarded_execute',
          launchable: true,
          launchTarget: { type: 'path' },
        },
        {
          id: 'program-powershell',
          displayName: 'Windows PowerShell',
          source: 'start_menu',
          capabilityClass: 'command_tool',
          trustState: 'partial',
          permissionEnvelope: 'guarded_execute',
          launchable: true,
          launchTarget: { type: 'path' },
        },
        {
          id: 'program-readme',
          displayName: 'Readme',
          source: 'start_menu',
          capabilityClass: 'application',
          trustState: 'unknown',
          permissionEnvelope: 'guarded_execute',
          launchable: true,
          launchTarget: { type: 'path' },
        },
      ],
      runningWindows: [{ id: 'window-chrome', title: 'HoloLand', processName: 'chrome', processId: 100 }],
    },
    readinessEvidence: {
      schemaVersion: 'hololand.holoshell.readiness-evidence.v0.1.0',
      readinessId: 'fixture-readiness',
      summary: {
        status: 'warn',
        scenario: 'Make this computer ready to build a HoloLand world',
        buildStatus: 'pass',
        deviceLabStatus: 'warn',
        graphStatus: 'reported_fail',
        tokenCount: 3,
        warningCount: 2,
        nextWorkflow: 'Turn a folder of local assets into a playable HoloLand shard',
      },
      source: { reportPath: 'fixture/flagship-readiness-report.md' },
      tokens: [
        { id: 'readiness.build', title: 'pnpm build passed', status: 'pass', kind: 'command_receipt', detail: 'Build passed.', receiptType: 'build_log' },
        { id: 'readiness.headset-report', title: 'Headset report missing', status: 'skipped', kind: 'manual_witness_gap', detail: 'No headset report supplied.', nextAction: 'Attach headset report.', receiptType: 'device_lab_receipt' },
        { id: 'readiness.graph-status', title: 'Graph status reported import failure', status: 'reported_fail', kind: 'tool_failure_receipt', detail: 'graph-status failed.', receiptType: 'tool_failure_receipt' },
      ],
      worldBuildReadyToken: {
        id: 'holoshell.world-build-ready',
        kind: 'world_build_ready_token',
        status: 'warn',
        blockingReasons: [
          'readiness.headset-report:skipped(Attach headset report.)',
          'readiness.graph-status:reported_fail(Re-run graph status and attach a structured tool receipt.)',
        ],
        receiptRequired: true,
        nextAction: 'resolve_blockers_and_replay',
        receiptInputs: ['readiness.build', 'readiness.headset-report', 'readiness.graph-status'],
      },
      commands: {
        replay: 'node scripts/holoshell-readiness-evidence.mjs --source-dir fixture --tmp-dir fixture/tmp',
      },
    },
    fleetReadiness: {
      schemaVersion: 'hololand.holoshell.fleet-readiness-evidence.v0.1.0',
      fleetReadinessId: 'fleet-readiness-fixture',
      status: 'blocked',
      source: { evidencePath: 'fixture/fleet-job-readiness-evidence.json' },
      summary: {
        status: 'blocked',
        readyForLaunch: false,
        laneId: '',
        laneProfile: 'webgpu-smoke',
        ownerLaneId: 'codex-hardware',
        jobId: 'example-snn-smoke',
        jobLabel: 'PAPER-00 example - replace ids/commands with your experiment',
        jobProfile: 'webgpu-smoke',
        budgetStatus: 'missing',
        heartbeatAgeMs: null,
        gateCount: 8,
        passGateCount: 2,
        blockedGateCount: 6,
        blockedReasonCount: 6,
        launchReceiptRequired: true,
        stopReceiptRequired: true,
        mutationPerformed: false,
      },
      lanes: [{ id: '', profile: 'webgpu-smoke', ownerLaneId: 'codex-hardware', status: 'blocked' }],
      jobs: [{ id: 'example-snn-smoke', label: 'PAPER-00 example - replace ids/commands with your experiment', profile: 'webgpu-smoke', paper: '00', timeBoxSec: 300, commandHash: 'sha256:fixture-command-hash', status: 'pass' }],
      tokens: [
        { id: 'fleet-job-ready.lane-identity', kind: 'fleet_job_ready_gate', gateId: 'lane-identity', title: 'Lane identity', status: 'blocked', detail: 'missing lane id', nextAction: 'Attach a Fleet lane id and replay readiness.', receiptType: 'holoshell.fleet-job-ready.v1' },
        { id: 'fleet-job-ready.job-command', kind: 'fleet_job_ready_gate', gateId: 'job-command', title: 'Job command', status: 'pass', detail: 'sha256:fixture-command-hash', receiptType: 'holoshell.fleet-job-ready.v1' },
      ],
      blockers: [
        { id: 'fleet-job.lane-identity', gateId: 'lane-identity', status: 'blocked', detail: 'missing lane id', raw: 'lane-identity: missing lane id', receiptTokenId: 'fleet-job-ready.lane-identity', nextAction: 'Attach a Fleet lane id and replay readiness.' },
      ],
      fleetJobReadyToken: {
        id: 'fleet-job-ready-example-snn-smoke',
        status: 'blocked',
        blockedReasons: ['lane-identity: missing lane id'],
      },
      commands: {
        replay: 'node scripts/holoshell-fleet-job-readiness-runner.mjs run --queue scripts/gpu-jobs.example.json',
      },
    },
    mcpCustodyContract: {
      schemaVersion: 'hololand.holoshell.mcp-custody-contract.v0.1.0',
      sourceAnchors: { adapter: 'scripts/holoshell-mcp-custody-contract.mjs' },
      summary: {
        status: 'warn',
        compatibilityMode: 'hololand_overlay',
        nativeMcpCustodySplit: false,
        cleanupCandidateCount: 1,
        ownerHandoffPlanCount: 3,
        checkPassCount: 5,
        checkWarnCount: 1,
        checkFailCount: 0,
      },
      compliance: {
        nextAction: 'Upgrade upstream MCP snapshot so HoloLand no longer needs fallback or overlay custody splitting.',
      },
    },
    mcpUpstreamHandoff: {
      schemaVersion: 'hololand.holoshell.mcp-custody-upstream-handoff.v0.1.0',
      handoffId: 'mcp-custody-upstream-fixture',
      sourceAnchors: { adapter: 'scripts/holoshell-mcp-upstream-handoff.mjs' },
      summary: {
        status: 'ready_for_upstream_agent',
        targetTool: 'holoshell_run_registry_snapshot',
        currentCompatibilityMode: 'hololand_overlay',
        nativeMcpCustodySplit: false,
        upstreamRepoRequired: true,
        taskCount: 5,
        acceptanceGateCount: 4,
      },
    },
    serviceSupervisor: {
      schemaVersion: 'hololand.holoshell.service-supervisor.v0.1.0',
      generatedAt: new Date().toISOString(),
      sourceAnchors: {
        source: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
        adapter: 'scripts/holoshell-service-supervisor.mjs',
      },
      summary: {
        status: 'ready_with_optional_offline',
        requestedAction: 'status',
        serviceCount: 3,
        requiredServiceCount: 1,
        requiredOnlineServiceCount: 1,
        requiredAttentionCount: 0,
        optionalOfflineServiceCount: 1,
        actionRequiredCount: 0,
        managedPidServiceCount: 1,
        verifiedPidServiceCount: 1,
        heartbeatOnlyServiceCount: 1,
        localDaemonServiceCount: 1,
        serviceMutationTaken: false,
        nextRequiredAction: 'holoshell-control-daemon: optional service is offline for mutations',
      },
      receipt: {
        snapshotHash: 'fixture-service-supervisor',
        localOnly: true,
        destructiveActionsTaken: false,
        rawCommandLineIncluded: false,
        serviceMutationTaken: false,
      },
    },
    founderHost: {
      schemaVersion: 'hololand.holoshell.founder-host.v0.1.0',
      generatedAt: new Date().toISOString(),
      sourceAnchors: {
        source: 'apps/holoshell/source/holoshell-founder-host.hsplus',
        adapter: 'scripts/holoshell-founder-host.mjs',
      },
      summary: {
        status: 'ready_for_native_wrapper',
        sourceReady: true,
        previewHostReady: true,
        nativeWrapperPresent: false,
        startupIntegrationPresent: true,
        startupRegistered: false,
        shellObjectGraphReady: true,
        liveFeedReady: true,
        serviceSupervisorReady: true,
        localMutationExecutionEnabled: false,
        primarySurfaceOwnership: 'preview_only',
        nextMove: 'build_native_wrapper',
      },
    },
    nativeWrapper: {
      schemaVersion: 'hololand.holoshell.native-wrapper.v0.1.0',
      generatedAt: new Date().toISOString(),
      sourceAnchors: {
        source: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
        adapter: 'scripts/holoshell-native-wrapper.mjs',
      },
      summary: {
        status: 'launchable_wrapper_present',
        launcherPresent: true,
        commandShimPresent: true,
        previewHostPresent: true,
        browserCandidateCount: 1,
        primaryBrowserFamily: 'chrome',
        launchMode: 'chromium_app_mode',
        launchable: true,
        startsWithoutManualHtml: true,
        startupIntegrationPresent: true,
        startupRegistered: false,
        localMutationExecutionEnabled: false,
        primarySurfaceOwnership: 'native_wrapper_candidate',
        nextMove: 'render_startup_approval_card',
      },
    },
    startupIntegration: {
      schemaVersion: 'hololand.holoshell.startup-integration.v0.1.0',
      generatedAt: new Date().toISOString(),
      sourceAnchors: {
        source: 'apps/holoshell/source/holoshell-startup-integration.hsplus',
        adapter: 'scripts/holoshell-startup-integration.mjs',
      },
      summary: {
        status: 'registration_adapter_present',
        startupIntegrationPresent: true,
        registrationScriptPresent: true,
        nativeLauncherPresent: true,
        startupMode: 'windows_user_startup_shortcut',
        startupFolderReachable: true,
        startupRegistered: false,
        approvalRequired: true,
        localMutationExecutionEnabled: false,
        primarySurfaceOwnership: 'login_start_candidate',
        nextMove: 'render_startup_approval_card',
      },
    },
    goldCodebaseBridge: {
      schemaVersion: 'hololand.holoshell.holoscript-gold-codebase-bridge.v0.1.0',
      bridgeId: 'gold-codebase-fixture',
      generatedAt: new Date().toISOString(),
      sourceAnchors: { adapter: 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs' },
      summary: {
        status: 'ready',
        goldStatus: 'indexed',
        goldRootPresent: true,
        goldEntryCount: 120,
        goldTierCount: 7,
        goldHotEntryCount: 12,
        goldConflictPolicy: 'diamond_over_platinum_over_gold_over_knowledge_store',
        codebaseStatus: 'ready',
        codebaseToolCount: 9,
        graphCacheProtocol: 'cache_first_graph_status_then_absorb',
        surfaceMapStatus: 'mapped',
        formatInventoryStatus: 'scanned',
      },
      goldDrive: {
        hotEntries: [
          { path: 'gotchas/G.HW.001.md', tier: 'gotchas', title: 'Hardware gotcha', ids: ['G.HW.001'] },
        ],
      },
      queryTemplates: ['What already exists?', 'Which GOLD entry changes the plan?'],
    },
    wildHoloScript: {
      schemaVersion: 'hololand.holoshell.wild-holoscript-intake.v0.1.0',
      intakeId: 'wild-holoscript-fixture',
      source: { rootName: 'uaa2-service', script: 'scripts/holoshell-wild-holoscript-intake.mjs' },
      summary: {
        status: 'scanned',
        fileCount: 45,
        holoCount: 2,
        hsCount: 4,
        hsplusCount: 39,
        frontierSyntaxCount: 18,
        adapterNeededCount: 9,
        canonicalCandidateCount: 6,
        flagshipCount: 5,
        topPattern: 'xr_world',
        nextMove: 'promote_terminal_and_brittney_modules_with_adapter_receipts',
      },
      topFlagships: [
        { path: 'src/worlds/innovation/agent-orchestration.hsplus' },
        { path: 'src/holoscript/agents/brittney.hsplus' },
      ],
    },
    formatInventory: {
      schemaVersion: 'hololand.holoshell.format-inventory.v0.1.0',
      inventoryId: 'format-inventory-fixture',
      summary: { status: 'scanned', totalFileCount: 12, totalFeatureFamilies: 9, formatViewerCardCount: 3 },
      formatViewerCards: [
        { id: 'format.holo', label: '.holo', files: 2, features: 3, topFeature: 'object_graph' },
        { id: 'format.hs', label: '.hs', files: 4, features: 2, topFeature: 'pipeline_root' },
        { id: 'format.hsplus', label: '.hsplus', files: 6, features: 4, topFeature: 'agent_runtime' },
      ],
    },
    founderBootPreview: {
      schemaVersion: 'hololand.holoshell.founder-boot-preview.v0.1.0',
      bootId: 'founder-boot-fixture',
      source: { world: 'apps/holoshell/source/holoshell-shell-world.holo', renderSlice: 'apps/holoshell/source/holoshell-shell-render.holo', script: 'scripts/holoshell-founder-boot-preview.mjs' },
      summary: { status: 'ready', worldObjectCount: 8, renderObjectCount: 6, formatViewerCardCount: 3, userCapabilityPackCount: 2, brittneyProposalCount: 3 },
      formatViewer: { cards: [{ id: 'format.holo', label: '.holo' }, { id: 'format.hs', label: '.hs' }, { id: 'format.hsplus', label: '.hsplus' }] },
      userCapabilityPacks: [
        { id: 'user-pack.browser-lofi', label: 'Play Lofi', derivedFrom: 'founder.browser_control', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', steps: ['open_browser'] },
        { id: 'user-pack.open-excel', label: 'Open Excel', derivedFrom: 'founder.program_control', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', steps: ['locate_program'] },
      ],
      brittneyOperatorBridge: { status: 'ready', proposals: [{ id: 'inspect-selected-object', label: 'Inspect selected shell object' }] },
    },
    userShellProjection: {
      schemaVersion: 'hololand.holoshell.user-shell-projection.v0.1.0',
      projectionId: 'user-shell-fixture',
      source: { sourceContract: 'apps/holoshell/source/holoshell-user-shell-projection.hsplus', script: 'scripts/holoshell-user-shell-projection.mjs' },
      summary: {
        status: 'ready',
        modeCount: 4,
        userModeCount: 3,
        capabilityPackCount: 6,
        guardedCapabilityPackCount: 5,
        formatLessonCount: 3,
        founderOnlyPowerCount: 5,
        brittneyTranslationCount: 9,
        visibleBubbleCount: 13,
      },
      modes: [
        { id: 'user.daily', label: 'Daily Shell', audience: 'regular_user', visibleBubbleIds: ['user-pack.browser-lofi', 'user-pack.room-marathon'], hiddenFounderPowers: ['raw_shell_commands'], safetyPosture: 'plain_intent_then_approval' },
        { id: 'user.creator', label: 'Creator Shell', audience: 'hololand_creator', visibleBubbleIds: ['user-pack.asset-shard-preview'], hiddenFounderPowers: [], safetyPosture: 'preview_first_import_after_approval' },
        { id: 'user.operator', label: 'Operator Shell', audience: 'trusted_power_user', visibleBubbleIds: ['user-pack.room-marathon'], hiddenFounderPowers: [], safetyPosture: 'receipt_visible_guarded_execute' },
        { id: 'founder.full', label: 'Founder Shell', audience: 'founder', visibleBubbleIds: ['surface.founder-boot-preview'], hiddenFounderPowers: [], safetyPosture: 'full_surface_with_receipts' },
      ],
      capabilityPacks: [
        { id: 'user-pack.browser-lofi', label: 'Play Lofi', userPhrase: 'Play lofi music', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', modeIds: ['user.daily'], steps: ['open_browser'] },
        { id: 'user-pack.open-excel', label: 'Open Excel', userPhrase: 'Open Excel', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', modeIds: ['user.daily'], steps: ['locate_program'] },
        { id: 'user-pack.room-marathon', label: 'Start Room Marathon', userPhrase: 'Start room marathon', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', modeIds: ['user.operator'], steps: ['open_terminal'] },
        { id: 'user-pack.sovereign-room-status', label: 'Sovereign Room Status', userPhrase: 'Check the sovereign room queue', permissionEnvelope: 'read_only', executionDefault: 'inspect_only', modeIds: ['user.daily', 'user.operator'], steps: ['read_sovereign_room_receipt'] },
        { id: 'user-pack.asset-shard-preview', label: 'Make Playable Shard', userPhrase: 'Turn this folder into a playable shard', permissionEnvelope: 'guarded_execute', executionDefault: 'staged_not_run', modeIds: ['user.creator'], steps: ['choose_folder'] },
        { id: 'user-pack.format-learning', label: 'Learn Source Formats', userPhrase: 'Explain the formats', permissionEnvelope: 'read_only', executionDefault: 'inspect_only', modeIds: ['user.creator'], steps: ['show_formats'] },
      ],
      founderOnlyPowers: [{ id: 'raw_shell_commands' }, { id: 'wild_source_promotion' }],
      brittneyTranslationLayer: {
        status: 'ready',
        defaultMode: 'user.daily',
        translations: [
          { userPhrase: 'Open Excel', targetPackId: 'user-pack.open-excel', permissionEnvelope: 'guarded_execute' },
          { userPhrase: 'Play lofi music', targetPackId: 'user-pack.browser-lofi', permissionEnvelope: 'guarded_execute' },
          { userPhrase: 'Check the sovereign room queue', targetPackId: 'user-pack.sovereign-room-status', permissionEnvelope: 'read_only' },
        ],
      },
      shellDerivation: { founderSurface: 'surface.founder-boot-preview', rule: 'user_shell_is_subset_plus_plain_language_translation', hiddenMeansRequiresFounderModeOrApproval: true },
    },
    developmentalEnvironment: {
      schemaVersion: 'hololand.holoshell.developmental-environment.v0.1.0',
      receiptId: 'dev-env-fixture',
      sourceAnchors: {
        research: 'ai-ecosystem/research/2026-05-14_ui-ux-developmental-environment.md',
        source: 'apps/holoshell/source/holoshell-developmental-environment.hsplus',
        adapter: 'scripts/holoshell-developmental-environment.mjs',
      },
      thesis: {
        reframe: 'wireframe_to_simulation_to_geometrics',
        telos: 'developmental_environment',
        brittneyRole: 'assistant_parent_presence',
        massFunctionRuling: 'derived_not_authored',
        mappingFunctionRuling: 'pure_function_of_physics_state',
        mappingHonestyPrinciple: 'animation must be explainable from physics state rather than cosmetic preference',
      },
      spine: [
        { id: 'substrate' },
        { id: 'vocabulary' },
        { id: 'composition' },
        { id: 'two_observer_rendering' },
        { id: 'honesty' },
        { id: 'signal_presence' },
      ],
      functions: {
        massFunction: { boardTaskId: 'task_1778802617893_o5mp' },
        physicsAnimationMapping: { boardTaskId: 'task_1778802617893_zppq' },
      },
      threads: [{ thread: 'HoloShell Option C/D UI substrate' }, { thread: 'Studio rethink Phase 6' }],
      boardTasks: [
        { id: 'task_1778802617893_o5mp' },
        { id: 'task_1778802617893_zppq' },
        { id: 'task_1778802907913_5ph8' },
      ],
      summary: {
        status: 'ready',
        spineLayerCount: 6,
        boardTaskCount: 3,
        openEngineeringTaskCount: 3,
        researchPresent: true,
        massFunctionSettled: true,
        mappingFunctionSettled: true,
        honestyPrinciple: 'physics_state_drives_animation',
        nextMove: 'engineer_mass_function_then_physics_animation_mapping',
      },
    },
    osUiCapture: {
      summary: { status: 'captured', windowCount: 1, controlCount: 4, geometryNodeCount: 42 },
      windows: [{ id: 'window-chrome', title: 'HoloLand', processName: 'chrome', processId: 100, foreground: true, controls: [{}, {}, {}] }],
    },
    lanes: {
      summary: { laneCount: 2, activeLaneCount: 2, heartbeatLaneCount: 1, grokHeartbeatStatus: 'observing' },
      lanes: [
        { laneId: 'codex-hardware', displayName: 'Codex Hardware', agentKind: 'codex', surfaceKind: 'hardware_shell', role: 'local_oracle', status: 'active_or_available', processEvidence: { detected: true } },
        {
          laneId: 'grok-build',
          displayName: 'Grok Build',
          agentKind: 'grok',
          surfaceKind: 'local_coding_agent',
          role: 'peer_codebuilder',
          status: 'active_or_available',
          processEvidence: { detected: true },
          heartbeat: {
            heartbeatId: 'grokhb-fixture',
            status: 'observing',
            generatedAt: new Date().toISOString(),
            heavyAccessStatus: 'active',
            readyForGrokBuild: true,
            latestObservationStatus: 'completed',
            latestObservationAgeMs: 100,
            primaryFinding: 'Fixture Grok heartbeat is live.',
          },
        },
      ],
    },
    brittneyAvatar: { summary: { avatarStatus: 'available', runtimeStatus: 'available', emotion: 'focused', voiceState: 'ready' } },
    agentDispatch: {
      schemaVersion: 'hololand.holoshell.agent-dispatch.v0.1.0',
      dispatchId: 'agent-dispatch-fixture',
      summary: {
        status: 'ready_to_stage',
        capabilityId: 'sovereign_agent_session',
        capabilityLabel: 'Sovereign Agent Session',
        dispatchKind: 'workflow',
        route: '/workflow/sovereign-room-marathon',
        confidence: 95,
        permissionEnvelope: 'guarded_execute',
        approvalRequired: true,
        selectedAgentSlug: 'codex',
      },
      dispatch: {
        downstreamReceipt: 'workflow-latest.json',
        approvalSurface: 'workflow-approval-latest.json',
      },
    },
    grokBuild: {
      schemaVersion: 'hololand.holoshell.grok-build-setup.v0.1.0',
      setupId: 'grok-build-setup-fixture',
      sourceAnchors: { adapter: 'scripts/holoshell-grok-build-workflow.mjs' },
      heavyUpgrade: { status: 'active', verifiedAt: '2026-05-16T00:00:00.000Z' },
      summary: {
        status: 'ready',
        heavyAccessStatus: 'active',
        cliStatus: 'installed',
        cliVersion: '0.1.211',
        authStatus: 'present',
        authRuntimeStatus: 'authenticated',
        authProvider: 'grok.com',
        operatorStatus: 'trusted_ready',
        autonomyStatus: 'eligible_after_workflow_approval',
        modelStatus: 'available',
        requestedModel: 'grok-build',
        defaultModel: 'grok-build',
        projectTrusted: true,
        projectTrustStatus: 'trusted',
        pathSeenOnCurrentProcess: true,
        warningCount: 1,
        readyForHeavyRecheck: true,
        readyForGrokBuild: true,
      },
    },
    grokHeartbeat: {
      schemaVersion: 'hololand.holoshell.grok-heartbeat.v0.1.0',
      heartbeatId: 'grokhb-fixture',
      generatedAt: new Date().toISOString(),
      summary: {
        status: 'observing',
        agentPresenceStatus: 'active_or_available',
        cliOperatorStatus: 'trusted_ready',
        authRuntimeStatus: 'authenticated',
        authProvider: 'grok.com',
        autonomyStatus: 'eligible_after_workflow_approval',
        heavyAccessStatus: 'active',
        latestObservationStatus: 'completed',
        latestObservationRecent: true,
        primaryFinding: 'Fixture Grok heartbeat is live.',
      },
    },
    hardwareAction: {
      actionId: 'action-1',
      generatedAt: new Date().toISOString(),
      summary: {
        status: 'approval_required',
        actionKind: 'open_url',
        permissionEnvelope: 'guarded_execute',
        targetWindowTitle: '',
        mutatingActionExecuted: false,
        browserBoundaryStatus: 'public_web',
        browserProfileBoundary: 'system_default_public_ok',
      },
      browserBoundary: {
        boundaryVersion: 'hololand.holoshell.browser-boundary.v0.1.0',
        urlClassification: 'public_web',
        profileBoundary: 'system_default_public_ok',
        cookiePolicy: 'may_use_default_browser_cookies_if_user_approves_open',
        screenshotPolicy: 'local_receipts_allowed',
      },
    },
    hardwareApproval: {
      approvalId: 'approval-1',
      summary: {
        status: 'pending_user_approval',
        actionKind: 'open_url',
        target: 'example.com',
        executionAllowed: true,
        expiresAt: new Date().toISOString(),
        trustLevel: 'guarded',
        trustedAutonomyEligible: false,
        browserBoundaryStatus: 'public_web',
        browserProfileBoundary: 'system_default_public_ok',
      },
      browserBoundary: {
        boundaryVersion: 'hololand.holoshell.browser-boundary.v0.1.0',
        urlClassification: 'public_web',
        profileBoundary: 'system_default_public_ok',
        cookiePolicy: 'may_use_default_browser_cookies_if_user_approves_open',
        screenshotPolicy: 'local_receipts_allowed',
      },
    },
    accountTaskCustody: {
      schemaVersion: 'hololand.holoshell.account-task-custody.v0.1.0',
      custodyId: 'acct-fixture',
      generatedAt: new Date().toISOString(),
      approval: {
        rollbackLimits: [
          { mutation: 'send_email', rollback: 'follow_up_only_after_send' },
        ],
      },
      summary: {
        status: 'draft_ready_approval_required',
        provider: 'gmail',
        accountBoundaryStatus: 'read_or_draft_scope',
        credentialAdjacent: true,
        draftHash: 'draft-fixture',
        approvalRequired: true,
        approvalId: 'acct-approval-fixture',
        executionAllowed: false,
        accountMutationPerformed: false,
        sourceFileMutationPerformed: false,
        fileCount: 1,
      },
    },
    packageCustody: {
      schemaVersion: 'hololand.holoshell.package-custody.v0.1.0',
      id: 'package-custody-fixture',
      generatedAt: new Date().toISOString(),
      schemaContract: { status: 'valid', validator: '@holoscript/framework.validateHoloShellPackageMutationReceipt', errors: [] },
      approval: {
        approvalId: 'pkg-approval-fixture',
        rollbackLimits: [
          'Package managers may not provide automatic downgrade.',
          'Admin/UAC prompts cannot be replayed silently.',
          'Launch/version verification is required after mutation.',
        ],
      },
      summary: {
        status: 'approval_required',
        packageId: 'BlenderFoundation.Blender',
        packageName: 'Blender',
        manager: 'winget',
        source: 'winget',
        fromVersion: '5.0.1',
        toVersion: '5.1.1',
        permissionEnvelope: 'break_glass',
        approvalRequired: true,
        approvalId: 'pkg-approval-fixture',
        executionAllowed: false,
        mutationPerformed: false,
        adminRequired: true,
        adminSession: false,
        packageManagerAvailable: true,
        rollbackLimitCount: 3,
        launchVerified: false,
      },
    },
    founderEvidenceDemo: {
      schemaVersion: 'hololand.holoshell.founder-evidence-demo.v0.1.0',
      demoId: 'founder-demo-fixture',
      generatedAt: new Date().toISOString(),
      summary: {
        status: 'pending_user_approval',
        targetAction: 'open_url',
        targetLabel: 'example.com',
        evidenceRung: 'visible_shell_ux',
        approvalRequired: true,
        approvalId: 'hwap-founder-fixture',
        executionAllowed: true,
        executionPerformed: false,
        visibleShellChange: false,
        visibleWitnessKind: '',
        beforeWindowCount: 1,
        afterWindowCount: 1,
      },
    },
    receiptControl: {
      schemaVersion: 'hololand.holoshell.receipt-control.v0.1.0',
      receiptControlId: 'receipt-control-fixture',
      generatedAt: new Date().toISOString(),
      summary: {
        status: 'ready',
        sourceStatus: 'pending_user_approval',
        sourceReceiptId: 'founder-demo-fixture',
        targetLabel: 'example.com',
        targetUrl: 'https://example.com/',
        replayAvailable: true,
        replayRequiresFreshApproval: true,
        rollbackExecutable: false,
        rollbackBlockReason: 'exact_browser_tab_identity_not_proved',
        taskPacketReady: true,
        controlCount: 4,
        exactTargetIdentityStatus: 'not_proved',
        visibleWitnessKind: 'browser_navigation_dispatched',
      },
    },
    trustLedger: {
      schemaVersion: 'hololand.holoshell.trust-ledger.v0.1.0',
      latestAction: { fingerprint: 'trust-fixture', actionKind: 'launch_app', targetLabel: 'Excel' },
      policy: { promotionThreshold: 3 },
      summary: {
        status: 'ready',
        recordCount: 1,
        trustedRecordCount: 0,
        guardedRecordCount: 1,
        readOnlyRecordCount: 0,
        breakGlassRecordCount: 0,
        latestTrustLevel: 'guarded',
        latestActionKind: 'launch_app',
        latestTarget: 'Excel',
        trustedAutonomyEligible: false,
        successesUntilTrusted: 2,
        promotionThreshold: 3,
      },
    },
    workflow: { workflowId: 'workflow-1', title: 'Room Marathon', summary: { status: 'pending_user_approval', stepCount: 4, pendingApprovalCount: 1, model: 'sovereign-local', modelRoute: 'sovereign_local', taskLane: 'local', taskTag: 'local', sovereignRoomMarathonReceipt: '.tmp/holoshell/sovereign-room-marathon-latest.json' } },
    sovereignRoomMarathon: {
      receiptId: 'sovereign-room-fixture',
      generatedAt: new Date().toISOString(),
      schemaVersion: 'hololand.holoshell.sovereign-room-marathon.v0.1.0',
      summary: {
        status: 'ready_to_claim',
        taskLane: 'local',
        taskTag: 'local',
        queueOpenCount: 2,
        queueClaimableOpenCount: 2,
        matchedCandidateCount: 1,
        selectedTaskId: 'task_local_fixture',
        selectedTaskTitle: '[local] wire HoloShell sovereign runner',
        claimRequested: false,
        claimAttempted: false,
        claimSucceeded: false,
        completionClaimAllowed: false,
        nextAction: 'rerun_with_claim_after_guarded_workflow_approval',
      },
    },
    workflowApproval: { approvalId: 'workflow-approval-1', summary: { status: 'pending_user_approval', pendingApprovalCount: 1, executionAllowed: true } },
    workflowIntentGate: { gateId: 'gate-1', summary: { status: 'passed', executionAllowed: true, failedCheckCount: 0 } },
    shardWorkflow: {
      workflowId: 'shard-workflow-1',
      title: 'Asset Folder to Playable Shard',
      shardPlan: { shardId: 'shard.fixture.demo' },
      output: {
        latestPath: '.tmp/holoshell/shard-workflow-latest.json',
        previewSourcePath: '.tmp/holoshell/shard-preview.holo',
        privateReceiptPath: '.tmp/holoshell/shard-receipts/demo-private.json',
      },
      summary: {
        status: 'staged',
        assetCount: 5,
        modelCount: 1,
        imageCount: 1,
        audioCount: 1,
        blockedAssetCount: 0,
        previewObjectCount: 5,
        nextWorkflow: 'review_preview_then_approve_import_into_hololand_world',
        mutationExecuted: false,
      },
    },
    shardImportApproval: {
      schemaVersion: 'hololand.holoshell.asset-shard-import-approval.v0.1.0',
      approvalId: 'shard-import-approval-1',
      output: { latestPath: '.tmp/holoshell/shard-import-approval-latest.json' },
      summary: { status: 'pending_user_approval', shardId: 'shard.fixture.demo', executionAllowed: true, expiresAt: new Date().toISOString(), assetCount: 5 },
    },
    shardImport: {
      schemaVersion: 'hololand.holoshell.asset-shard-import-receipt.v0.1.0',
      importId: 'shard-import-1',
      output: { receiptPath: '.tmp/holoshell/imported-shards/shard-fixture-demo/import-receipt.json', manifestPath: '.tmp/holoshell/imported-shards/shard-fixture-demo/manifest.json', shardSourcePath: '.tmp/holoshell/imported-shards/shard-fixture-demo/shard.holo' },
      summary: { status: 'completed', shardId: 'shard.fixture.demo', assetCount: 5, runtimeMutationExecuted: true, sourceAssetsMutated: false },
    },
    photoBackupCustody: {
      schemaVersion: 'hololand.holoshell.photo-backup-custody.v0.1.0',
      receiptId: 'photo-backup-fixture',
      generatedAt: new Date().toISOString(),
      source: {
        albumLabel: 'sample-photo-albums',
        albumFingerprint: 'album-fixture',
        pathPolicy: 'absolute_path_kept_in_private_receipt_only',
        privacyClass: 'local_private',
      },
      output: {
        latestPath: '.tmp/holoshell/photo-backup-custody-latest.json',
        privateReceiptPath: '.tmp/holoshell/photo-backup-receipts/photo-backup-fixture-private.json',
      },
      targetPlan: { targetKind: 'not_chosen' },
      summary: {
        status: 'planned',
        albumCount: 2,
        photoCount: 3,
        videoCount: 1,
        duplicateGroupCount: 1,
        unreadableCount: 0,
        privacyMetadataClasses: ['camera_serial', 'capture_time', 'faces', 'gps'],
        targetPlan: 'not_chosen',
        originalsDeleted: false,
        deleteBlocked: true,
        restoreVerified: false,
      },
    },
    buildCustody: {
      schemaVersion: 'hololand.holoshell.build-custody.v0.1.0',
      summary: {
        riskState: 'warn',
        scannerStatus: 'available',
        processCount: 5,
        buildProcessCount: 4,
        activeBuildTreeCount: 1,
        buildTreeCount: 1,
        longRunningBuildCount: 1,
        highMemoryBuildCount: 0,
        reviewRequiredCount: 1,
        rawCommandsIncluded: false,
        longMinutesThreshold: 45,
        highMemoryMbThreshold: 1500,
      },
      buildTrees: [
        {
          treeId: 'build-tree-100',
          rootPid: 100,
          rootName: 'pwsh.exe',
          status: 'long_running',
          processCount: 4,
          maxAgeMinutes: 12.0,
          totalMemoryMb: 460.0,
          buildKinds: ['pnpm_workspace_build', 'build_child'],
          findings: ['long_running_build'],
          processPids: [100, 101, 102, 103],
          ownerLaneId: 'codex',
          ownerLaneLabel: 'Codex',
          ownerAgentKind: 'hardware',
          ownerColorHint: '#48b7ff',
          ownerEvidence: ['synthetic_process_ancestor'],
          ownerParentPid: 77,
          receiptRequired: true,
          rawCommandsIncluded: false,
        },
      ],
      buildProcesses: [
        { pid: 100, ppid: 10, name: 'pwsh.exe', buildKind: 'pnpm_workspace_build', ageMinutes: 12.0, memoryMb: 86.0, custodyState: 'active_build', findings: ['long_running_build'] },
        { pid: 101, ppid: 100, name: 'cmd.exe', buildKind: 'build_child', ageMinutes: 12.0, memoryMb: 14.0, custodyState: 'active_build', findings: [] },
        { pid: 102, ppid: 101, name: 'node.exe', buildKind: 'build_child', ageMinutes: 11.0, memoryMb: 240.0, custodyState: 'active_build', findings: [] },
        { pid: 103, ppid: 102, name: 'node.exe', buildKind: 'build_child', ageMinutes: 3.0, memoryMb: 120.0, custodyState: 'active_build', findings: [] },
      ],
      receipt: { buildCustodyHash: 'fixture-hash-abc123', destructiveActionsTaken: false, rawCommandsIncluded: false },
    },
  };
}

function assertSelfTest() {
  const graph = buildGraph({ maxPrograms: 10, maxWindows: 4, maxAgents: 2, tmpDir: DEFAULT_TMP_DIR }, fixtureFeeds());
  const failures = [];
  const names = new Set(graph.objects.map((object) => object.displayName));
  if (!names.has('Excel')) failures.push('expected Excel object');
  if (!names.has('Google Chrome')) failures.push('expected Chrome object');
  if (!graph.objects.some((object) => object.objectKind === 'terminal_surface')) failures.push('expected terminal surface object');
  if (!graph.objects.some((object) => object.objectKind === 'assistant_avatar')) failures.push('expected Brittney assistant avatar object');
  if (!graph.objects.some((object) => object.objectKind === 'captured_window')) failures.push('expected captured window object');
  if (!graph.objects.some((object) => object.id === 'workflow.agent-dispatch')) failures.push('expected agent dispatch workflow object');
  if (!graph.objects.some((object) => object.id === 'room.world-build-readiness')) failures.push('expected readiness room object');
  if (!graph.objects.some((object) => object.id === 'receipt.readiness.headset-report')) failures.push('expected readiness warning token');
  if (!graph.objects.some((object) => object.objectKind === 'readiness_blocker' && object.relationships?.promotionBlocked)) failures.push('expected world-build blocker object');
  if (graph.summary.worldBuildBlockingReasonObjectCount !== 2) failures.push('expected two world-build blocker objects');
  if (!graph.objects.some((object) => object.id === 'room.fleet-readiness')) failures.push('expected Fleet readiness room object');
  if (!graph.objects.some((object) => object.id === 'fleet.lane.unassigned')) failures.push('expected Fleet lane object');
  if (!graph.objects.some((object) => object.id === 'fleet.job.example-snn-smoke')) failures.push('expected Fleet job object');
  if (!graph.objects.some((object) => object.id === 'receipt.fleet-job-ready.lane-identity')) failures.push('expected Fleet readiness receipt object');
  if (!graph.objects.some((object) => object.objectKind === 'fleet_job_blocker')) failures.push('expected Fleet job blocker object');
  if (graph.summary.fleetLaneObjectCount !== 1) failures.push('expected one Fleet lane object');
  if (graph.summary.fleetJobObjectCount !== 1) failures.push('expected one Fleet job object');
  if (!graph.objects.some((object) => object.id === 'receipt.mcp-custody-contract')) failures.push('expected MCP custody contract object');
  if (!graph.objects.some((object) => object.id === 'receipt.mcp-custody-upstream-handoff')) failures.push('expected MCP custody upstream handoff object');
  if (!graph.objects.some((object) => object.id === 'service.supervisor' && object.relationships?.requiredOnlineServiceCount === 1)) failures.push('expected service supervisor shell object');
  if (!graph.objects.some((object) => object.id === 'host.founder-holoshell')) failures.push('expected founder host shell object');
  if (!graph.objects.some((object) => object.id === 'host.native-wrapper')) failures.push('expected native wrapper shell object');
  if (!graph.objects.some((object) => object.id === 'host.startup-integration')) failures.push('expected startup integration shell object');
  if (!graph.objects.some((object) => object.id === 'workflow.sovereign-room-marathon')) failures.push('expected sovereign room marathon workflow object');
  if (!graph.objects.some((object) => object.id === 'workflow.grok-build')) failures.push('expected Grok Build workflow object');
  if (!graph.objects.some((object) => object.id === 'agent.grok-build' && object.relationships?.heartbeatStatus === 'observing')) failures.push('expected Grok heartbeat agent object');
  if (!graph.objects.some((object) => object.id === 'policy.trusted-autonomy')) failures.push('expected trusted autonomy policy object');
  if (!graph.objects.some((object) => object.objectKind === 'browser_surface' && object.relationships?.browserBoundary)) failures.push('expected browser surface boundary object');
  if (!graph.objects.some((object) => object.id === 'approval.hardware' && object.relationships?.browserBoundaryStatus === 'public_web')) failures.push('expected hardware approval browser boundary');
  if (!graph.objects.some((object) => object.displayName === 'Hardware Receipt' && object.relationships?.browserProfileBoundary === 'system_default_public_ok')) failures.push('expected hardware receipt browser profile boundary');
  if (!graph.objects.some((object) => object.displayName === 'Account Task Receipt' && object.relationships?.draftHash === 'draft-fixture')) failures.push('expected account task receipt draft binding');
  if (graph.summary.accountTaskCustodyStatus !== 'draft_ready_approval_required') failures.push('expected account task custody status');
  if (graph.summary.accountTaskCustodyExecutionAllowed) failures.push('expected account task custody to block execution');
  if (!graph.objects.some((object) => object.displayName === 'Tool Install Gate' && object.relationships?.packageId === 'BlenderFoundation.Blender')) failures.push('expected package custody install gate');
  if (graph.summary.packageCustodyStatus !== 'approval_required') failures.push('expected package custody approval status');
  if (graph.summary.packageCustodyExecutionAllowed) failures.push('expected package custody to block execution');
  if (graph.summary.packageCustodySchemaStatus !== 'valid') failures.push('expected package custody schema contract');
  if (!graph.objects.some((object) => object.displayName === 'Founder Evidence Demo' && object.relationships?.approvalId === 'hwap-founder-fixture')) failures.push('expected founder evidence demo receipt binding');
  if (graph.summary.founderEvidenceDemoStatus !== 'pending_user_approval') failures.push('expected founder evidence demo pending approval status');
  if (graph.summary.founderEvidenceDemoEvidenceRung !== 'visible_shell_ux') failures.push('expected founder evidence demo evidence rung');
  if (!graph.summary.founderEvidenceDemoExecutionAllowed) failures.push('expected founder evidence demo execution allowance');
  if (graph.summary.founderEvidenceDemoExecutionPerformed) failures.push('expected founder evidence demo execution to remain unperformed');
  if (!graph.objects.some((object) => object.displayName === 'Receipt Controls' && object.relationships?.replayRequiresFreshApproval)) failures.push('expected receipt control object with fresh replay approval');
  if (graph.summary.receiptControlStatus !== 'ready') failures.push('expected receipt control ready status');
  if (!graph.summary.receiptControlReplayAvailable) failures.push('expected receipt control replay available');
  if (graph.summary.receiptControlRollbackExecutable) failures.push('expected receipt control rollback to remain advisory');
  if (!graph.objects.some((object) => object.id === 'workflow.asset-shard')) failures.push('expected asset shard workflow object');
  if (!graph.objects.some((object) => object.id === 'approval.asset-shard-import')) failures.push('expected asset shard import approval object');
  if (!graph.objects.some((object) => object.displayName === 'Shard Import Receipt')) failures.push('expected asset shard import receipt object');
  if (!graph.objects.some((object) => object.id === 'workflow.photo-backup-custody')) failures.push('expected photo backup custody workflow object');
  if (!graph.objects.some((object) => object.displayName === 'Photo Backup Receipt')) failures.push('expected photo backup custody receipt object');
  if (!graph.objects.some((object) => object.id === 'blocker.photo-original-delete' && object.relationships?.separateApprovalRequired)) failures.push('expected photo original delete blocker object');
  if (graph.summary.photoBackupCustodyStatus !== 'planned') failures.push('expected photo backup custody planned status');
  if (!graph.summary.photoBackupCustodyDeleteBlocked) failures.push('expected photo backup delete blocker to be active');
  if (graph.summary.photoBackupCustodyRestoreVerified) failures.push('expected photo backup restore proof to remain pending');
  if (!graph.objects.some((object) => object.id === 'source.wild-holoscript.uaa2')) failures.push('expected wild HoloScript source corpus object');
  if (!graph.objects.some((object) => object.id === 'source.holoscript-gold-codebase')) failures.push('expected GOLD/codebase substrate object');
  if (!graph.objects.some((object) => object.id === 'surface.founder-boot-preview')) failures.push('expected founder boot surface object');
  if (!graph.objects.some((object) => object.id === 'surface.user-shell-projection')) failures.push('expected user shell projection object');
  if (!graph.objects.some((object) => object.id === 'source.developmental-environment')) failures.push('expected developmental environment object');
  if (!graph.objects.some((object) => object.id === 'policy.physics-honesty')) failures.push('expected physics honesty policy object');
  if (!graph.objects.some((object) => object.id === 'assistant.brittney.user-translator')) failures.push('expected Brittney user translator object');
  if (graph.summary.wildHoloScriptStatus !== 'scanned') failures.push('expected wild HoloScript scanned status');
  if (graph.summary.userShellProjectionStatus !== 'ready') failures.push('expected user shell projection ready status');
  if (graph.summary.developmentalEnvironmentStatus !== 'ready') failures.push('expected developmental environment ready status');
  if (graph.summary.agentDispatchStatus !== 'ready_to_stage') failures.push('expected agent dispatch ready status');
  if (graph.summary.grokBuildSetupStatus !== 'ready') failures.push('expected Grok Build setup status');
  if (graph.summary.grokHeartbeatStatus !== 'observing') failures.push('expected Grok heartbeat status');
  if (graph.summary.trustedAutonomyLatestLevel !== 'guarded') failures.push('expected trust ledger guarded status');
  if (graph.summary.goldCodebaseBridgeStatus !== 'ready') failures.push('expected GOLD/codebase bridge ready status');
  if (graph.summary.mcpCustodyContractStatus !== 'warn') failures.push('expected MCP custody contract warning status');
  if (graph.summary.mcpCustodyCompatibilityMode !== 'hololand_overlay') failures.push('expected MCP custody overlay mode');
  if (graph.summary.mcpUpstreamHandoffStatus !== 'ready_for_upstream_agent') failures.push('expected MCP upstream handoff ready status');
  if (graph.summary.serviceSupervisorStatus !== 'ready_with_optional_offline') failures.push('expected service supervisor ready-with-optional-offline status');
  if (graph.summary.serviceSupervisorRequiredOnlineServiceCount !== 1) failures.push('expected service supervisor required service online count');
  if (graph.summary.founderHostStatus !== 'ready_for_native_wrapper') failures.push('expected founder host ready-for-wrapper status');
  if (graph.summary.nativeWrapperStatus !== 'launchable_wrapper_present') failures.push('expected native wrapper launchable status');
  if (graph.summary.startupIntegrationStatus !== 'registration_adapter_present') failures.push('expected startup integration adapter status');
  if (!graph.objects.some((object) => object.id === 'receipt.build-custody')) failures.push('expected build custody receipt object');
  const buildTreeObject = graph.objects.find((object) => object.id === 'process.build-tree.build-tree-100');
  if (!buildTreeObject) failures.push('expected build tree process object');
  if (buildTreeObject?.displayName !== 'Codex Build Tree') failures.push('expected build tree display name to include owner lane');
  if (buildTreeObject?.capabilityFamily !== 'build_custody') failures.push('expected build tree custody capability family');
  if (buildTreeObject?.actorLaneId !== 'codex') failures.push('expected build tree actor lane to inherit owner');
  if (buildTreeObject?.permissionEnvelope !== 'break_glass') failures.push('expected build tree break-glass envelope');
  if (buildTreeObject?.relationships?.ownerLaneId !== 'codex') failures.push('expected build tree owner relationship');
  if (buildTreeObject?.relationships?.rawCommandsIncluded) failures.push('expected build tree to keep raw command redaction');
  if (buildTreeObject?.relationships?.stopPolicy !== 'break_glass_required') failures.push('expected build tree stop policy');
  if (graph.summary.processObjectCount !== 1) failures.push('expected one process object from build custody');
  if (graph.summary.buildCustodyProcessObjectCount !== 1) failures.push('expected one build custody process object');
  if (graph.summary.sourceFeeds.buildCustodyStatus !== 'available') failures.push('expected build custody available status');
  if (!graph.summary.guardedExecuteCount) failures.push('expected guarded execute objects');
  if (JSON.stringify(graph).includes('targetPath')) failures.push('graph must not expose raw targetPath fields');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
  return graph;
}

function main() {
  const args = parseArgs();
  if (args.selfTest) {
    const graph = assertSelfTest();
    if (args.json) console.log(JSON.stringify(graph, null, 2));
    else console.log(`Self-test passed: ${graph.summary.shellObjectCount} shell objects`);
    return;
  }
  const graph = buildGraph(args);
  const output = writeJson(args.output, graph);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, graph);
  if (args.json) console.log(JSON.stringify(graph, null, 2));
  else {
    console.log(`Wrote ${output}`);
    console.log(`Wrote ${jsOutput}`);
    console.log(`Shell objects: ${graph.summary.shellObjectCount}`);
    console.log(`Programs: ${graph.summary.programObjectCount}`);
    console.log(`Running objects: ${graph.summary.runningObjectCount}`);
    console.log(`Guarded execute objects: ${graph.summary.guardedExecuteCount}`);
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export { buildGraph, fixtureFeeds };
