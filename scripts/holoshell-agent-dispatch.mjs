#!/usr/bin/env node
/**
 * HoloShell agent dispatch.
 *
 * Translates Brittney/user plain-language intent into a concrete staged
 * HoloShell route. This script only writes a dispatch receipt; the control
 * daemon performs the downstream staging through existing guarded adapters.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.agent-dispatch.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'agent-dispatch-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'agent-dispatch-latest.js');
const DEFAULT_DISPATCH_DIR = path.join(DEFAULT_TMP, 'agent-dispatches');
const DEFAULT_LOFI_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
const SOURCE_REF = 'apps/holoshell/source/holoshell-agent-dispatch.hsplus';
const HARDWARE_SOURCE_REF = 'apps/holoshell/source/holoshell-hardware-control.hsplus';
const SCRIPT_REF = 'scripts/holoshell-agent-dispatch.mjs';
const GOLD_CODEBASE_SOURCE_REF = 'apps/holoshell/source/holoshell-holoscript-gold-codebase-bridge.hsplus';
const GOLD_CODEBASE_SCRIPT_REF = 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs';
const SOVEREIGN_PEER_CONTEXT_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';
const USER_SHELL_PROJECTION_REF = 'apps/holoshell/source/holoshell-user-shell-projection.hsplus';
const STUDIO_ORCHESTRATOR_REF = 'packages/brittney/service/src/orchestrator.ts';
const STUDIO_MODEL_ROUTER_REF = 'packages/brittney/service/src/model-router.ts';
const STUDIO_FLEET_BRIDGE_REF = 'packages/shared/inference/src/integrations/spatial-fleet-bridge.ts';
const PROVIDER_ROUTING_REGISTRY_REF = 'C:/Users/josep/.ai-ecosystem/config/provider-routing-registry.json';
const FLEET_MAP_REF = 'C:/Users/josep/.ai-ecosystem/FLEET_MAP.holo';
const HARDWARE_NORTH_STAR_REF = 'C:/Users/josep/.ai-ecosystem/NORTH_STAR_HARDWARE.md';
const SPEND_POLICY_REF = 'C:/Users/josep/.ai-ecosystem/SPEND.md';
const HOLOSHELL_SPEND_POLICY_REF = 'C:/Users/josep/.ai-ecosystem/scripts/holoshell-spend-policy.mjs';
const VAST_ESCALATION_GATE_REF = 'C:/Users/josep/.ai-ecosystem/scripts/vast-escalation-gate.mjs';
const FLEET_OUTPUT_CONTRACT_REF = 'C:/Users/josep/.ai-ecosystem/docs/contracts/fleet-output-contract.v2.schema.json';
const HOLOTUNE_TRAIN_REF = 'C:/Users/josep/.ai-ecosystem/compositions/holotune-train.hsplus';
const LAPTOP_REASONING_LANE = 'laptop-hardware';
const MIN_DISPATCH_CONFIDENCE = 50;

const SOVEREIGN_AGENT_TARGETS = [
  { slug: 'codex', label: 'Codex Local Hardware', aliases: ['codex', 'openai local', 'codex hardware'] },
  { slug: 'holomesh', label: 'HoloMesh Room', aliases: ['holomesh', 'room', 'team room'] },
  { slug: 'brittney', label: 'Brittney Local Runtime', aliases: ['brittney', 'brittney desktop'] },
  { slug: 'jetson', label: 'Jetson Local Node', aliases: ['jetson', 'holojetson', 'edge node'] },
  { slug: 'laptop', label: 'Laptop Local Node', aliases: ['laptop', 'windows laptop'] },
  { slug: 'local-shell', label: 'Local Shell', aliases: ['local shell', 'terminal', 'powershell'] },
];

const CAPABILITIES = [
  {
    id: 'laptop_reasoning_job',
    label: 'Laptop Reasoning Job',
    route: '/workflow/laptop-reasoning-job',
    dispatchKind: 'reasoning_job',
    permissionEnvelope: 'read_only',
    examples: [
      'send this large prompt to the laptop for Codex reasoning',
      'have the laptop inspect the repo and reason through the plan',
    ],
  },
  {
    id: 'founder_command',
    label: 'Founder Command',
    route: '/workflow/founder-command',
    dispatchKind: 'workflow',
    permissionEnvelope: 'guarded_execute',
    examples: ['Brittney, open terminal, start a sovereign room marathon for local-tagged tasks, open a browser, and play lofi music on YouTube'],
  },
  {
    id: 'grok_build',
    label: 'Grok Build',
    route: '/workflow/grok-build',
    dispatchKind: 'workflow',
    permissionEnvelope: 'guarded_execute',
    examples: ['open Grok Build', 'ask Grok to inspect this repo'],
  },
  {
    id: 'room_marathon',
    label: 'Room Marathon',
    route: '/workflow/room-marathon',
    dispatchKind: 'workflow',
    permissionEnvelope: 'guarded_execute',
    examples: ['start a sovereign room marathon for local-tagged tasks'],
  },
  {
    id: 'sovereign_agent_session',
    label: 'Sovereign Agent Session',
    route: '/workflow/room-marathon',
    dispatchKind: 'workflow',
    permissionEnvelope: 'guarded_execute',
    examples: ['launch Codex locally', 'start a local sovereign agent session'],
  },
  {
    id: 'holoclaw_runtime_bridge',
    label: 'HoloClaw Runtime Bridge',
    route: '/workflow/holoclaw-runtime-bridge',
    dispatchKind: 'workflow',
    permissionEnvelope: 'guarded_execute',
    examples: ['run HoloClaw locally', 'use HoloClaw instead of OpenClaw', 'start the HoloClaw runtime bridge'],
  },
  {
    id: 'browser_lofi',
    label: 'YouTube Lofi',
    route: '/action',
    dispatchKind: 'hardware_action',
    permissionEnvelope: 'guarded_execute',
    examples: ['play lofi music on YouTube'],
  },
  {
    id: 'open_excel',
    label: 'Open Excel',
    route: '/action',
    dispatchKind: 'hardware_action',
    permissionEnvelope: 'guarded_execute',
    examples: ['open Excel', 'start spreadsheet'],
  },
  {
    id: 'open_terminal',
    label: 'Open Terminal',
    route: '/action',
    dispatchKind: 'hardware_action',
    permissionEnvelope: 'guarded_execute',
    examples: ['open terminal', 'launch PowerShell'],
  },
  {
    id: 'open_browser',
    label: 'Open Browser',
    route: '/action',
    dispatchKind: 'hardware_action',
    permissionEnvelope: 'guarded_execute',
    examples: ['open browser', 'open Google'],
  },
  {
    id: 'launch_program',
    label: 'Launch Program',
    route: '/action',
    dispatchKind: 'hardware_action',
    permissionEnvelope: 'guarded_execute',
    examples: ['open Spotify', 'launch Calculator'],
  },
];

function parseArgs(argv) {
  const args = {
    actor: 'brittney',
    intent: '',
    prompt: '',
    json: false,
    selfTest: false,
    listCapabilities: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    dispatchDir: DEFAULT_DISPATCH_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg === '--intent') args.intent = argv[++index] || '';
    else if (arg === '--prompt') args.prompt = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || DEFAULT_OUTPUT;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || DEFAULT_JS_OUTPUT;
    else if (arg === '--dispatch-dir') args.dispatchDir = argv[++index] || DEFAULT_DISPATCH_DIR;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--list-capabilities') args.listCapabilities = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--') && !args.intent) {
      args.intent = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell agent dispatch

Usage:
  node scripts/holoshell-agent-dispatch.mjs --intent "start a sovereign room marathon for local-tagged tasks"
  node scripts/holoshell-agent-dispatch.mjs --intent "launch Codex locally" --json

Options:
  --intent <text>          Plain-language request from Brittney/user.
  --prompt <text>          Optional prompt for chat-oriented routes.
  --actor <name>           Actor label. Defaults to brittney.
  --list-capabilities      Print dispatch catalog.
  --self-test              Run fixture assertions.
  --json                   Print JSON receipt.
  -h, --help               Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function ensureDir(filePath) {
  mkdirSync(path.dirname(resolveRepoPath(filePath)), { recursive: true });
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_AGENT_DISPATCH = ${payload};\n`, 'utf8');
  return resolved;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function normalizedReceiptPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function defaultGoldRoot() {
  return normalizedReceiptPath(process.env.GOLD_ROOT || 'D:/GOLD');
}

function goldRootProbeStatus(root) {
  const probePath = process.platform === 'win32'
    ? String(root || 'D:/GOLD').replace(/\//g, '\\')
    : String(root || 'D:/GOLD');
  if (existsSync(probePath)) return 'mounted_on_dispatch_host';
  return process.platform === 'win32' ? 'missing_on_dispatch_host' : 'target_host_check_required';
}

function buildLaptopReasoningResourcePlan() {
  const goldRoot = defaultGoldRoot();
  return {
    reuseBeforeBuild: true,
    duplicateWorkPolicy: 'consume_gold_codebase_studio_holomesh_and_fleet_surfaces_before_new_builds',
    agentLane: 'local',
    canonicalProviderId: 'laptop-sovereign',
    workload: 'heavy_reasoning',
    workloadFocus: {
      local: [
        {
          id: 'jetson-orchestrator',
          canonicalProviderId: 'jetson-sovereign',
          focus: 'always_on_holoshell_operator_and_autonomous_router',
          sourceAnchors: [FLEET_MAP_REF, HARDWARE_NORTH_STAR_REF, PROVIDER_ROUTING_REGISTRY_REF],
        },
        {
          id: 'laptop-reasoning',
          canonicalProviderId: 'laptop-sovereign',
          focus: 'repo_bearing_reasoning_gold_context_sovereign_peer_context_studio_production',
          sourceAnchors: [FLEET_MAP_REF, HARDWARE_NORTH_STAR_REF, PROVIDER_ROUTING_REGISTRY_REF],
        },
        {
          id: 'vast-local-overflow',
          canonicalProviderIds: ['vast-qwen-serverless', 'vast-raw-gpu-fleet'],
          focus: 'fine_tune_heavy_gpu_large_graph_or_sustained_reasoning_only_after_guarded_escalation',
          sourceAnchors: [PROVIDER_ROUTING_REGISTRY_REF, VAST_ESCALATION_GATE_REF, FLEET_OUTPUT_CONTRACT_REF],
        },
      ],
      cloud: [
        {
          id: 'cloud-tagged-room-tasks',
          canonicalProviderIds: [],
          focus: 'explicitly_cloud_tagged_coordination_only_after_local_sovereign_receipt',
          sourceAnchors: [PROVIDER_ROUTING_REGISTRY_REF],
        },
      ],
    },
    canonicalSurfaces: {
      goldDrive: {
        id: 'gold.drive.read',
        root: goldRoot,
        runtimeStatus: goldRootProbeStatus(goldRoot),
        use: 'founder_memory_override_and_duplicate_build_prevention',
        readOnly: true,
        conflictPolicy: 'diamond_over_platinum_over_gold_over_knowledge_store',
        sourceAnchors: ['AGENTS.md', 'NORTH_STAR.md', GOLD_CODEBASE_SOURCE_REF, GOLD_CODEBASE_SCRIPT_REF],
      },
      codebaseBridge: {
        id: 'holoshell.holoscript_gold_codebase_bridge',
        use: 'ask_graph_status_codebase_query_surface_map_and_format_inventory_before_new_adapters',
        readOnlyFirst: true,
        sourceAnchors: [GOLD_CODEBASE_SOURCE_REF, GOLD_CODEBASE_SCRIPT_REF],
      },
      sovereignPeerContext: {
        id: 'workflow.laptop-reasoning-job',
        route: '/workflow/laptop-reasoning-job',
        use: 'reuse_sovereign_peer_context_and_laptop_reasoning_receipts_before_new_builds',
        executionDefault: 'staged_not_run',
        shellContextAttachedByDefault: false,
        sourceAnchors: [USER_SHELL_PROJECTION_REF, SOVEREIGN_PEER_CONTEXT_REF],
      },
      studioBrittney: {
        id: 'studio.brittney.chat_and_fleet',
        use: 'reuse_existing_brittney_service_router_orchestrator_and_spatial_fleet_bridge_for_chat_inference_and_studio_context',
        serviceOrchestrator: STUDIO_ORCHESTRATOR_REF,
        modelRouter: STUDIO_MODEL_ROUTER_REF,
        fleetBridge: STUDIO_FLEET_BRIDGE_REF,
      },
      providerRouting: {
        id: 'provider-routing-registry',
        use: 'preserve_local_cloud_task_tags_and_canonical_owned_fleet_ids_before_any_cloud_escalation',
        sourceAnchors: [PROVIDER_ROUTING_REGISTRY_REF],
      },
      vastFleet: {
        id: 'vast.local_overflow',
        use: 'multi_gpu_finetune_cuda_benchmarks_holotune_or_large_sustained_jobs_only',
        agentLane: 'local',
        canonicalProviderIds: ['vast-qwen-serverless', 'vast-raw-gpu-fleet'],
        spendRail: 'purchased_compute',
        requires: [
          'free_first_or_owned_metal_unavailable_receipt',
          'active_lane_manifest',
          'daily_current_job_budget_fields',
          'output_contract',
          'teardown_receipt',
        ],
        sourceAnchors: [
          PROVIDER_ROUTING_REGISTRY_REF,
          SPEND_POLICY_REF,
          HOLOSHELL_SPEND_POLICY_REF,
          VAST_ESCALATION_GATE_REF,
          FLEET_OUTPUT_CONTRACT_REF,
          HOLOTUNE_TRAIN_REF,
        ],
      },
    },
    budgetPolicy: {
      sovereignCompute: 'free_uncapped_local_jetson_and_laptop',
      purchasedComputeRail: 'purchased_compute',
      paidComputeRule: 'free_first_then_active_cap_spend_guard_then_receipted_output',
      capRaiseRequiresApprovalRef: true,
      sourceAnchors: [SPEND_POLICY_REF, HOLOSHELL_SPEND_POLICY_REF, VAST_ESCALATION_GATE_REF],
    },
  };
}

function redactedIntent(intent) {
  const text = String(intent || '');
  if (!text) return '';
  return text
    .replace(/(password|passphrase|token|secret|api key|api-key|private key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function detectSovereignAgent(text) {
  const normalized = normalize(text);
  const launchMatch = normalized.match(/\b(?:launch|start)\s+(?:local\s+)?([a-z0-9-]+)\b/);
  if (launchMatch) {
    const direct = SOVEREIGN_AGENT_TARGETS.find((agent) => agent.slug === launchMatch[1]);
    if (direct) return direct;
  }
  return SOVEREIGN_AGENT_TARGETS.find((agent) => (
    agent.aliases.some((alias) => normalized.includes(normalize(alias)))
    || normalized.includes(`launch ${agent.slug}`)
  )) || null;
}

function taskLaneFromIntent(intent) {
  const text = normalize(intent);
  if (/\bcloud(?: tagged| tag| lane| tasks?| work)?\b/u.test(text) && !/\bno cloud\b/u.test(text)) return 'cloud';
  return 'local';
}

function sovereignRoomBody(args, intentText = args.intent) {
  const taskLane = taskLaneFromIntent(intentText);
  const taskTag = taskLane === 'cloud' ? 'cloud' : 'local';
  return {
    actor: args.actor,
    intent: args.intent,
    model: 'sovereign-local',
    modelRoute: 'sovereign_local',
    taskLane,
    taskTag,
    sovereignConsumptionDefault: taskLane === 'local',
    cloudEscalationAllowed: taskLane === 'cloud',
    lofiUrl: DEFAULT_LOFI_URL,
  };
}

function laptopReasoningSignals(intent) {
  const raw = String(intent || '');
  const text = normalize(raw);
  const wordCount = raw.split(/\s+/u).filter(Boolean).length;
  const lineCount = raw.split(/\r?\n/u).length;
  const signals = [];
  let score = 0;

  const explicitLaptop = /\b(laptop|windows|rtx|codex hardware|codex)\b/u.test(text);
  const reasoningAsk = /\b(reason|reasoning|think|analyze|analyse|inspect|review|plan|large prompt|big prompt|help)\b/u.test(text);
  const repoAsk = /\b(repo|repository|worktree|codebase|backend|frontend|docs|documentation|memory|knowledge|jetson|autonomy|cloud|local)\b/u.test(text);

  if (explicitLaptop && reasoningAsk) {
    score += 100;
    signals.push('explicit_laptop_reasoning_request');
  }
  if (explicitLaptop && repoAsk) {
    score += 30;
    signals.push('explicit_laptop_repo_context');
  }
  if (raw.length >= 2400) {
    score += 90;
    signals.push('very_large_prompt');
  } else if (raw.length >= 1200) {
    score += 70;
    signals.push('large_prompt');
  }
  if (wordCount >= 180 && (repoAsk || reasoningAsk)) {
    score += 45;
    signals.push('long_repo_or_reasoning_prompt');
  }
  if (lineCount >= 16 && (repoAsk || /```|diff --git|^\s*[-*]\s+/mu.test(raw))) {
    score += 35;
    signals.push('multi_section_prompt');
  }
  if (/\b(seams?|mend|hydrate|verticals?|backend|local|cloud|autonomy|jetson)\b/u.test(text) && reasoningAsk) {
    score += 25;
    signals.push('ecosystem_architecture_reasoning');
  }

  return {
    score,
    signals,
    promptChars: raw.length,
    wordCount,
    lineCount,
    needed: score >= 70,
  };
}

function promptFromIntent(args) {
  if (args.prompt) return args.prompt;
  const raw = String(args.intent || '');
  const match = raw.match(/\b(?:with prompt|prompt|say|ask local agent to|ask grok to|tell grok to)\b\s*[:,-]?\s*(.+)$/i);
  return match ? match[1].trim() : '';
}

function programNameFromIntent(intent) {
  const raw = String(intent || '').trim();
  const match = raw.match(/\b(?:open|launch|start)\s+(?:the\s+)?(.+?)(?:\s+(?:app|program|application))?\s*$/i);
  if (!match) return '';
  return match[1]
    .replace(/\b(on youtube|in browser|through local|using local|with grok|with local agent)\b.*$/i, '')
    .trim();
}

function isFounderFlagshipIntent(intent) {
  const text = normalize(intent);
  const mentionsTerminal = text.includes('terminal') || text.includes('powershell') || text.includes('command line');
  const mentionsRoomMarathon = text.includes('room marathon') || (text.includes('room') && text.includes('marathon'));
  const mentionsSovereign = text.includes('sovereign') || text.includes('local') || text.includes('owned');
  const mentionsBrowserMedia = text.includes('lofi') || (text.includes('youtube') && text.includes('music'));
  const mentionsOpenBrowser = text.includes('browser') || text.includes('youtube');
  const namesBrittney = text.startsWith('brittney') || text.includes(' brittney ');
  return mentionsTerminal
    && mentionsRoomMarathon
    && mentionsSovereign
    && mentionsBrowserMedia
    && mentionsOpenBrowser
    && (namesBrittney || /\b(open|start|launch|play)\b/.test(text));
}

function scoreIntent(intent) {
  const text = normalize(intent);
  const scores = new Map(CAPABILITIES.map((capability) => [capability.id, 0]));

  if (!text) return scores;

  const laptopReasoning = laptopReasoningSignals(intent);
  if (laptopReasoning.score > 0) {
    scores.set('laptop_reasoning_job', laptopReasoning.score);
  }
  if (isFounderFlagshipIntent(intent)) scores.set('founder_command', 99);
  if (text.includes('room marathon') || (text.includes('marathon') && text.includes('room'))) scores.set('room_marathon', 98);
  if ((text.includes('local tagged') || text.includes('cloud tagged') || text.includes('sovereign')) && text.includes('room')) {
    scores.set('room_marathon', Math.max(scores.get('room_marathon'), 86));
  }
  const agent = detectSovereignAgent(text);
  if (agent && /\b(local|sovereign|owned|launch|start)\b/u.test(text)) {
    scores.set('sovereign_agent_session', 94);
  }
  if (/\b(local sovereign agent|sovereign agent|agent session|sovereign session)\b/u.test(text)) {
    scores.set('sovereign_agent_session', 94);
  }
  if (
    text.includes('holoclaw')
    || text.includes('openclaw')
    || text.includes('nemoclaw')
    || /\b(agent runtime|runtime bridge|local custody runtime)\b/u.test(text)
  ) {
    scores.set('holoclaw_runtime_bridge', 97);
  }
  if (text.includes('grok') || text.includes('grok build') || text.includes('supergrok') || text.includes('xai')) {
    scores.set('grok_build', 96);
  }
  if (text.includes('lofi') || (text.includes('music') && text.includes('youtube'))) {
    scores.set('browser_lofi', 90);
  }
  if (text.includes('excel') || text.includes('spreadsheet')) scores.set('open_excel', 88);
  if (text.includes('terminal') || text.includes('powershell') || text.includes('command line') || text.includes('cmd')) {
    scores.set('open_terminal', 82);
  }
  if ((text.includes('browser') || text.includes('chrome') || text.includes('google')) && !text.includes('lofi')) {
    scores.set('open_browser', 76);
  }
  if (/\b(open|launch|start)\b/.test(text) && programNameFromIntent(intent)) {
    scores.set('launch_program', Math.max(scores.get('launch_program'), 62));
  }

  return scores;
}

function bestCapability(intent) {
  const scores = scoreIntent(intent);
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [id, confidence] = ranked[0] || ['', 0];
  if (confidence < MIN_DISPATCH_CONFIDENCE) {
    return { capability: null, confidence, ranked };
  }
  const capability = CAPABILITIES.find((item) => item.id === id) || null;
  return { capability, confidence, ranked };
}

function buildRouteBody(capability, args, agent) {
  const text = normalize(args.intent);
  if (!capability) return {};
  if (capability.id === 'laptop_reasoning_job') {
    const prompt = promptFromIntent(args) || args.prompt || args.intent;
    const reasoning = laptopReasoningSignals(args.intent);
    const resourcePlan = buildLaptopReasoningResourcePlan();
    return {
      actor: args.actor,
      jobType: 'reasoning',
      delegationMode: 'jetson_autonomous_large_prompt_router',
      sourceHost: 'jetson_holoshell_surface',
      targetHost: 'laptop_windows',
      lane: LAPTOP_REASONING_LANE,
      agentLane: resourcePlan.agentLane,
      canonicalProviderId: resourcePlan.canonicalProviderId,
      workload: resourcePlan.workload,
      modelFamily: 'openai_codex',
      permissionEnvelope: 'read_only',
      reuseBeforeBuild: resourcePlan.reuseBeforeBuild,
      duplicateWorkPolicy: resourcePlan.duplicateWorkPolicy,
      workloadFocus: resourcePlan.workloadFocus,
      canonicalSurfaces: resourcePlan.canonicalSurfaces,
      budgetPolicy: resourcePlan.budgetPolicy,
      prompt,
      promptHash: hashValue(prompt || 'empty'),
      reasonCodes: reasoning.signals,
      promptChars: reasoning.promptChars,
      wordCount: reasoning.wordCount,
      requestedReturn: 'reasoned_summary_with_receipt',
      receiptRequired: true,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    };
  }
  if (capability.id === 'founder_command') {
    return sovereignRoomBody(args, text);
  }
  if (capability.id === 'grok_build') {
    const prompt = promptFromIntent(args);
    return {
      actor: args.actor,
      mode: prompt ? 'headless' : 'interactive',
      prompt,
      model: 'grok-build',
      permissionMode: prompt ? 'plan' : '',
    };
  }
  if (capability.id === 'room_marathon') {
    return sovereignRoomBody(args, text);
  }
  if (capability.id === 'sovereign_agent_session') {
    return {
      ...sovereignRoomBody(args, text),
      agent: agent?.slug || 'local-shell',
      selectedAgentLabel: agent?.label || 'Local Shell',
      roomCommand: '',
    };
  }
  if (capability.id === 'holoclaw_runtime_bridge') {
    return {
      actor: args.actor,
      intent: args.intent,
      prompt: promptFromIntent(args),
      runtimeMode: 'tick',
      agentHandle: 'holoclaw',
      provider: 'sovereign',
      model: 'sovereign-local',
      replacementFor: ['OpenClaw', 'NemoClaw'],
      permissionEnvelope: 'guarded_execute',
      receiptRequired: true,
      destructiveActionsTaken: false,
    };
  }
  if (capability.id === 'browser_lofi') {
    return {
      actor: args.actor,
      action: 'open_url',
      url: DEFAULT_LOFI_URL,
    };
  }
  if (capability.id === 'open_excel') {
    return {
      actor: args.actor,
      action: 'launch_app',
      app: 'Excel',
    };
  }
  if (capability.id === 'open_terminal') {
    return {
      actor: args.actor,
      action: 'launch_app',
      app: text.includes('powershell') ? 'Windows PowerShell' : 'Windows Terminal',
    };
  }
  if (capability.id === 'open_browser') {
    return {
      actor: args.actor,
      action: 'open_url',
      url: 'https://www.google.com',
    };
  }
  if (capability.id === 'launch_program') {
    return {
      actor: args.actor,
      action: 'launch_app',
      app: programNameFromIntent(args.intent),
    };
  }
  return {};
}

function buildReceipt(args) {
  const generatedAt = new Date().toISOString();
  const intent = String(args.intent || '').trim();
  const { capability, confidence, ranked } = bestCapability(intent);
  const agent = detectSovereignAgent(intent);
  const blocked = !capability || confidence < MIN_DISPATCH_CONFIDENCE;
  const routeBody = buildRouteBody(capability, args, agent);
  const dispatchId = `hsdispatch-${Date.now().toString(36)}-${shortHash({ intent, actor: args.actor }, 10)}`;
  const dispatchReceiptPath = resolveRepoPath(path.join(args.dispatchDir, `${dispatchId}.json`));
  const matchEvidence = ranked
    .filter(([, score]) => score > 0)
    .slice(0, 5)
    .map(([id, score]) => ({ capabilityId: id, score }));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    dispatchId,
    actor: args.actor,
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareControl: HARDWARE_SOURCE_REF,
      adapter: SCRIPT_REF,
      goldCodebaseBridge: GOLD_CODEBASE_SOURCE_REF,
      goldCodebaseAdapter: GOLD_CODEBASE_SCRIPT_REF,
      sovereignPeerContext: SOVEREIGN_PEER_CONTEXT_REF,
      userShellProjection: USER_SHELL_PROJECTION_REF,
      studioOrchestrator: STUDIO_ORCHESTRATOR_REF,
      studioModelRouter: STUDIO_MODEL_ROUTER_REF,
      studioFleetBridge: STUDIO_FLEET_BRIDGE_REF,
      providerRoutingRegistry: PROVIDER_ROUTING_REGISTRY_REF,
      fleetMap: FLEET_MAP_REF,
      hardwareNorthStar: HARDWARE_NORTH_STAR_REF,
      spendPolicy: SPEND_POLICY_REF,
      holoshellSpendPolicy: HOLOSHELL_SPEND_POLICY_REF,
      vastEscalationGate: VAST_ESCALATION_GATE_REF,
      fleetOutputContract: FLEET_OUTPUT_CONTRACT_REF,
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    request: {
      intentPreview: redactedIntent(intent),
      intentHash: hashValue(intent || 'empty'),
      promptProvided: Boolean(args.prompt),
      rawIntentStoredLocallyOnly: true,
    },
    catalog: CAPABILITIES.map((capabilityItem) => ({
      id: capabilityItem.id,
      label: capabilityItem.label,
      route: capabilityItem.route,
      dispatchKind: capabilityItem.dispatchKind,
      permissionEnvelope: capabilityItem.permissionEnvelope,
      examples: capabilityItem.examples,
    })),
    match: {
      status: blocked ? 'unsupported' : 'matched',
      capabilityId: capability?.id || '',
      capabilityLabel: capability?.label || '',
      confidence,
      evidence: matchEvidence,
      selectedSovereignAgent: agent ? { slug: agent.slug, label: agent.label } : null,
    },
    dispatch: {
      status: blocked ? 'blocked' : 'ready_to_stage',
      route: blocked ? '' : capability.route,
      method: blocked ? '' : 'POST',
      dispatchKind: capability?.dispatchKind || 'unsupported',
      permissionEnvelope: capability?.permissionEnvelope || 'unknown',
      body: blocked ? {} : routeBody,
      downstreamReceipt: capability?.dispatchKind === 'workflow'
        ? 'workflow-latest.json'
        : capability?.dispatchKind === 'hardware_action'
          ? 'action-latest.json'
          : '',
      approvalSurface: capability?.dispatchKind === 'workflow'
        ? 'workflow-approval-latest.json'
        : capability?.dispatchKind === 'hardware_action'
          ? 'approval-latest.json'
          : '',
    },
    summary: {
      status: blocked ? 'blocked' : 'ready_to_stage',
      dispatchKind: capability?.dispatchKind || 'unsupported',
      capabilityId: capability?.id || '',
      capabilityLabel: capability?.label || '',
      confidence,
      route: blocked ? '' : capability.route,
      permissionEnvelope: capability?.permissionEnvelope || 'unknown',
      approvalRequired: !blocked && capability?.permissionEnvelope !== 'read_only',
      selectedAgentSlug: agent?.slug || '',
      selectedAgentLabel: agent?.label || '',
      actionKind: routeBody.action || '',
      targetApp: routeBody.app || '',
      targetUrlHost: routeBody.url ? new URL(routeBody.url).host : '',
      promptPresent: Boolean(routeBody.prompt),
      taskLane: routeBody.taskLane || '',
      taskTag: routeBody.taskTag || '',
      sovereignConsumptionDefault: Boolean(routeBody.sovereignConsumptionDefault),
      cloudEscalationAllowed: Boolean(routeBody.cloudEscalationAllowed),
      targetHost: routeBody.targetHost || '',
      reasoningLane: routeBody.lane || '',
      agentLane: routeBody.agentLane || '',
      canonicalProviderId: routeBody.canonicalProviderId || '',
      workload: routeBody.workload || '',
      delegationMode: routeBody.delegationMode || '',
      reasonCodes: routeBody.reasonCodes || [],
      reuseBeforeBuild: Boolean(routeBody.reuseBeforeBuild),
      duplicateWorkPolicy: routeBody.duplicateWorkPolicy || '',
      goldRoot: routeBody.canonicalSurfaces?.goldDrive?.root || '',
      goldRuntimeStatus: routeBody.canonicalSurfaces?.goldDrive?.runtimeStatus || '',
      sovereignPeerContextRoute: routeBody.canonicalSurfaces?.sovereignPeerContext?.route || '',
      studioOrchestrator: routeBody.canonicalSurfaces?.studioBrittney?.serviceOrchestrator || '',
      vastSpendRail: routeBody.canonicalSurfaces?.vastFleet?.spendRail || '',
      vastEscalationGate: routeBody.canonicalSurfaces?.vastFleet?.sourceAnchors?.includes(VAST_ESCALATION_GATE_REF)
        ? VAST_ESCALATION_GATE_REF
        : '',
      localFocusCount: routeBody.workloadFocus?.local?.length || 0,
      cloudFocusCount: routeBody.workloadFocus?.cloud?.length || 0,
      rawIntentStoredLocallyOnly: true,
    },
    output: {
      latestPath: resolveRepoPath(args.output),
      browserBootstrap: resolveRepoPath(args.jsOutput),
      dispatchReceiptPath,
    },
  };
}

function persist(args, receipt) {
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  ensureDir(path.join(args.dispatchDir, 'placeholder'));
  writeJson(receipt.output.dispatchReceiptPath, receipt);
  return { ...receipt, output: { ...receipt.output, latestPath: output, browserBootstrap: jsOutput } };
}

function assertSelfTest() {
  const cases = [
    ['send this large prompt to the laptop for Codex reasoning', 'laptop_reasoning_job', 'reasoning_job'],
    ['have the laptop inspect the repo and reason through the plan', 'laptop_reasoning_job', 'reasoning_job'],
    ['launch Codex locally', 'sovereign_agent_session', 'workflow'],
    ['start a local sovereign agent session', 'sovereign_agent_session', 'workflow'],
    ['run HoloClaw locally', 'holoclaw_runtime_bridge', 'workflow'],
    ['replace OpenClaw with HoloClaw runtime', 'holoclaw_runtime_bridge', 'workflow'],
    ['open Grok Build', 'grok_build', 'workflow'],
    ['ask Grok to inspect this repo', 'grok_build', 'workflow'],
    ['Brittney, open terminal, start a sovereign room marathon for local-tagged tasks, open a browser, and play lofi music on YouTube', 'founder_command', 'workflow'],
    ['open terminal and start a sovereign room marathon for local-tagged tasks', 'room_marathon', 'workflow'],
    ['open browser and play lofi music on youtube', 'browser_lofi', 'hardware_action'],
    ['open Excel', 'open_excel', 'hardware_action'],
    ['launch Calculator', 'launch_program', 'hardware_action'],
  ];
  const failures = [];
  for (const [intent, expectedCapability, expectedKind] of cases) {
    const receipt = buildReceipt({ actor: 'brittney', intent, prompt: '', output: DEFAULT_OUTPUT, jsOutput: DEFAULT_JS_OUTPUT, dispatchDir: DEFAULT_DISPATCH_DIR });
    if (receipt.summary.capabilityId !== expectedCapability) {
      failures.push(`${intent} -> ${receipt.summary.capabilityId}, expected ${expectedCapability}`);
    }
    if (receipt.summary.dispatchKind !== expectedKind) {
      failures.push(`${intent} kind -> ${receipt.summary.dispatchKind}, expected ${expectedKind}`);
    }
    if (receipt.summary.status !== 'ready_to_stage') failures.push(`${intent} was not ready_to_stage`);
  }
  const unsupported = buildReceipt({ actor: 'brittney', intent: 'make the moon purple', prompt: '', output: DEFAULT_OUTPUT, jsOutput: DEFAULT_JS_OUTPUT, dispatchDir: DEFAULT_DISPATCH_DIR });
  if (unsupported.summary.status !== 'blocked') failures.push('unsupported intent should block');
  if (unsupported.summary.capabilityId) failures.push('unsupported intent should not select a capability');
  const weakLaptop = buildReceipt({ actor: 'brittney', intent: 'reason about the local backend', prompt: '', output: DEFAULT_OUTPUT, jsOutput: DEFAULT_JS_OUTPUT, dispatchDir: DEFAULT_DISPATCH_DIR });
  if (weakLaptop.summary.status !== 'blocked') failures.push('weak laptop reasoning intent should block');
  if (weakLaptop.summary.capabilityId) failures.push('weak laptop reasoning intent should not select a capability');
  if (!weakLaptop.match.evidence.some((item) => item.capabilityId === 'laptop_reasoning_job')) {
    failures.push('weak laptop reasoning intent should keep match evidence');
  }
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.listCapabilities) {
    console.log(JSON.stringify({ schemaVersion: SCHEMA_VERSION, capabilities: CAPABILITIES }, null, 2));
    return;
  }
  if (args.selfTest) {
    assertSelfTest();
    console.log('HoloShell agent dispatch self-test passed.');
    return;
  }
  if (!String(args.intent || '').trim()) throw new Error('--intent is required.');
  const receipt = persist(args, buildReceipt(args));
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`HoloShell agent dispatch: ${receipt.output.latestPath}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Capability: ${receipt.summary.capabilityLabel || 'none'}`);
    console.log(`Route: ${receipt.summary.route || 'none'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`holoshell-agent-dispatch failed: ${error.message}`);
    process.exit(1);
  }
}

export { buildReceipt, persist, laptopReasoningSignals, CAPABILITIES };
