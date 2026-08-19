#!/usr/bin/env node
/**
 * HoloShell HoloClaw runtime bridge.
 *
 * This is the first custody bridge between the HoloShell operating surface and
 * the HoloClaw agent runtime. It is deliberately receipt-first: staging resolves
 * the HoloScript agent runtime, HoloClaw brain, skill shelf, and policy envelope
 * before any agent tick can run.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BRIDGE_SCHEMA = 'hololand.holoshell.holoclaw-runtime-bridge.v0.1.0';
const WORKFLOW_SCHEMA = 'hololand.holoshell.workflow.v0.1.0';
const GATE_SCHEMA = 'hololand.holoshell.brain-intent-gate.v0.1.0';
const APPROVAL_SCHEMA = 'hololand.holoshell.workflow-approval.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_BRIDGE_OUTPUT = path.join(DEFAULT_TMP, 'holoclaw-runtime-bridge-latest.json');
const DEFAULT_BRIDGE_JS_OUTPUT = path.join(DEFAULT_TMP, 'holoclaw-runtime-bridge-latest.js');
const DEFAULT_BRIDGE_DIR = path.join(DEFAULT_TMP, 'holoclaw-runtime-bridges');
const DEFAULT_WORKFLOW_OUTPUT = path.join(DEFAULT_TMP, 'workflow-latest.json');
const DEFAULT_WORKFLOW_JS_OUTPUT = path.join(DEFAULT_TMP, 'workflow-latest.js');
const DEFAULT_GATE_OUTPUT = path.join(DEFAULT_TMP, 'brain-intent-gate-latest.json');
const DEFAULT_GATE_JS_OUTPUT = path.join(DEFAULT_TMP, 'brain-intent-gate-latest.js');
const SOURCE_REF = 'apps/holoshell/source/holoshell-holoclaw-runtime-bridge.hsplus';
const HARDWARE_SOURCE_REF = 'apps/holoshell/source/holoshell-hardware-control.hsplus';
const DISPATCH_SOURCE_REF = 'apps/holoshell/source/holoshell-agent-dispatch.hsplus';
const SCRIPT_REF = 'scripts/holoshell-holoclaw-runtime-bridge.mjs';
const WORKFLOW_KIND = 'holoclaw_runtime_bridge';
const GATE_CASE_ID = 'holoshell-holoclaw-runtime-bridge.v0';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    actor: 'brittney',
    intent: '',
    prompt: '',
    runtimeMode: 'tick',
    agentHandle: 'holoclaw',
    provider: 'sovereign',
    model: 'sovereign-local',
    selectedSkill: '',
    executeWorkflow: false,
    workflowApprovalBundle: '',
    workflowApprovalId: '',
    workflowApprovalNonce: '',
    bridgeOutput: DEFAULT_BRIDGE_OUTPUT,
    bridgeJsOutput: DEFAULT_BRIDGE_JS_OUTPUT,
    bridgeDir: DEFAULT_BRIDGE_DIR,
    workflowOutput: DEFAULT_WORKFLOW_OUTPUT,
    workflowJsOutput: DEFAULT_WORKFLOW_JS_OUTPUT,
    gateOutput: DEFAULT_GATE_OUTPUT,
    gateJsOutput: DEFAULT_GATE_JS_OUTPUT,
    holoscriptRoot: '',
    selfTest: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index] ?? '';
    switch (token) {
      case '--':
        break;
      case '--actor':
        args.actor = next() || args.actor;
        break;
      case '--intent':
      case '--request':
        args.intent = next();
        break;
      case '--prompt':
      case '--task':
        args.prompt = next();
        break;
      case '--runtime-mode':
        args.runtimeMode = normalizeRuntimeMode(next());
        break;
      case '--agent-handle':
        args.agentHandle = normalizeHandle(next() || args.agentHandle);
        break;
      case '--provider':
        args.provider = next() || args.provider;
        break;
      case '--model':
        args.model = next() || args.model;
        break;
      case '--skill':
      case '--selected-skill':
        args.selectedSkill = next();
        break;
      case '--holoscript-root':
        args.holoscriptRoot = next();
        break;
      case '--execute-workflow':
        args.executeWorkflow = true;
        break;
      case '--workflow-approval-bundle':
        args.workflowApprovalBundle = next();
        break;
      case '--workflow-approval-id':
        args.workflowApprovalId = next();
        break;
      case '--workflow-approval-nonce':
        args.workflowApprovalNonce = next();
        break;
      case '--bridge-output':
      case '--output':
        args.bridgeOutput = next() || args.bridgeOutput;
        break;
      case '--bridge-js-output':
      case '--js-output':
        args.bridgeJsOutput = next() || args.bridgeJsOutput;
        break;
      case '--bridge-dir':
        args.bridgeDir = next() || args.bridgeDir;
        break;
      case '--workflow-output':
        args.workflowOutput = next() || args.workflowOutput;
        break;
      case '--workflow-js-output':
        args.workflowJsOutput = next() || args.workflowJsOutput;
        break;
      case '--gate-output':
        args.gateOutput = next() || args.gateOutput;
        break;
      case '--gate-js-output':
        args.gateJsOutput = next() || args.gateJsOutput;
        break;
      case '--self-test':
        args.selfTest = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (token.startsWith('--')) throw new Error(`Unknown argument: ${token}`);
        if (!args.intent) args.intent = token;
    }
  }

  if (args.selfTest) {
    args.bridgeOutput = path.join(DEFAULT_TMP, 'self-test', 'holoclaw-runtime-bridge.json');
    args.bridgeJsOutput = path.join(DEFAULT_TMP, 'self-test', 'holoclaw-runtime-bridge.js');
    args.bridgeDir = path.join(DEFAULT_TMP, 'self-test', 'holoclaw-runtime-bridges');
    args.workflowOutput = path.join(DEFAULT_TMP, 'self-test', 'workflow-latest.json');
    args.workflowJsOutput = path.join(DEFAULT_TMP, 'self-test', 'workflow-latest.js');
    args.gateOutput = path.join(DEFAULT_TMP, 'self-test', 'brain-intent-gate-latest.json');
    args.gateJsOutput = path.join(DEFAULT_TMP, 'self-test', 'brain-intent-gate-latest.js');
    args.intent ||= 'Run HoloClaw as the OpenClaw and NemoClaw replacement for a local validation task.';
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell HoloClaw runtime bridge

Usage:
  node scripts/holoshell-holoclaw-runtime-bridge.mjs --intent "run HoloClaw locally"
  node scripts/holoshell-holoclaw-runtime-bridge.mjs --self-test --json

Options:
  --intent <text>               User/Brittney objective for HoloClaw.
  --prompt <text>               Optional task prompt stored locally in the receipt.
  --runtime-mode <tick|run>     Agent runtime mode. Defaults to tick.
  --agent-handle <name>         Runtime handle. Defaults to holoclaw.
  --provider <provider>         Provider label for env plan. Defaults to sovereign.
  --model <model>               Model label for env plan. Defaults to sovereign-local.
  --selected-skill <name>       Prefer a HoloClaw skill by name.
  --execute-workflow            Execute only after nonce-bound HoloShell approval.
  --self-test                   Use deterministic fixture runtime discovery.
  --json                        Print JSON bridge receipt.
`);
}

function normalizeRuntimeMode(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'run' ? 'run' : 'tick';
}

function normalizeHandle(value) {
  return String(value || 'holoclaw').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'holoclaw';
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function toRepoPath(filePath) {
  const resolved = resolveRepoPath(filePath);
  const relative = path.relative(REPO_ROOT, resolved);
  return relative && !relative.startsWith('..') ? relative.replace(/\\/g, '/') : resolved.replace(/\\/g, '/');
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeJs(filePath, globalName, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.${globalName} = ${payload};\n`, 'utf8');
  return resolved;
}

function readText(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function holoscriptRootCandidates(args) {
  return [
    args.holoscriptRoot,
    process.env.HOLOSCRIPT_REPO,
    process.env.HOLOSCRIPT_REPO_ROOT,
    path.resolve(REPO_ROOT, '..', 'HoloScript'),
    'C:/Users/josep/Documents/GitHub/HoloScript',
    'C:/Users/Josep/Documents/GitHub/HoloScript',
  ].filter(Boolean);
}

function extractSkill(filePath, rootDir) {
  const content = readText(filePath);
  const fileName = path.basename(filePath);
  const composition = content.match(/composition\s+"([^"]+)"/u) || content.match(/composition\s+([A-Za-z0-9_-]+)/u);
  const actions = [...content.matchAll(/action\s+"?([A-Za-z0-9_-]+)"?/gu)].map((match) => match[1]);
  const traits = [...content.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/gu)]
    .map((match) => match[1])
    .filter((trait, index, all) => all.indexOf(trait) === index && trait !== 'absorb');
  return {
    name: composition ? composition[1] : fileName.replace(/\.hsplus$/u, ''),
    fileName,
    path: filePath.replace(rootDir, '').replace(/^[\\/]/u, '').replace(/\\/g, '/'),
    actions: actions.slice(0, 8),
    traits: traits.slice(0, 8),
  };
}

function discoverSkills(rootDir) {
  const skillsDir = path.join(rootDir, 'compositions', 'skills');
  if (!existsSync(skillsDir)) return { skillsDir, skills: [] };
  const skills = readdirSync(skillsDir)
    .filter((file) => file.endsWith('.hsplus'))
    .map((file) => extractSkill(path.join(skillsDir, file), rootDir));
  return { skillsDir, skills };
}

function selectSkills(skills, objective, preferredName = '') {
  const text = `${objective || ''} ${preferredName || ''}`.toLowerCase();
  const scored = skills.map((skill) => {
    const haystack = `${skill.name} ${skill.fileName} ${(skill.actions || []).join(' ')} ${(skill.traits || []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const token of ['holoclaw', 'validate', 'compile', 'code', 'build', 'test', 'vision', 'hologram', 'reconstruct', 'mesh']) {
      if (text.includes(token) && haystack.includes(token)) score += 10;
    }
    if (preferredName && haystack.includes(preferredName.toLowerCase())) score += 50;
    return { skill, score };
  });
  return scored
    .sort((left, right) => right.score - left.score)
    .map((item) => item.skill)
    .slice(0, 6);
}

function discoverRuntime(args) {
  if (args.selfTest) {
    const rootDir = 'C:/fixture/HoloScript';
    const skills = [
      { name: 'code-health', fileName: 'code-health.hsplus', path: 'compositions/skills/code-health.hsplus', actions: ['inspect', 'patch'], traits: ['Skill'] },
      { name: 'test-runner', fileName: 'test-runner.hsplus', path: 'compositions/skills/test-runner.hsplus', actions: ['test'], traits: ['Skill'] },
    ];
    return {
      rootDir,
      rootPresent: true,
      agentPackageDir: `${rootDir}/packages/holoscript-agent`,
      agentPackagePresent: true,
      agentBin: `${rootDir}/packages/holoscript-agent/bin/holoscript-agent.cjs`,
      agentBinPresent: true,
      agentDist: `${rootDir}/packages/holoscript-agent/dist/index.js`,
      agentDistPresent: true,
      brainPath: `${rootDir}/compositions/holoclaw-brain.hsplus`,
      brainPresent: true,
      brainToolFinding: {
        directValidateDeclared: true,
        mcpCallRequired: true,
        status: 'compat_note',
      },
      skillsDir: `${rootDir}/compositions/skills`,
      skills,
      skillCount: skills.length,
    };
  }

  const rootDir = holoscriptRootCandidates(args).find((candidate) => existsSync(candidate)) || '';
  const agentPackageDir = rootDir ? path.join(rootDir, 'packages', 'holoscript-agent') : '';
  const agentBin = agentPackageDir ? path.join(agentPackageDir, 'bin', 'holoscript-agent.cjs') : '';
  const agentDist = agentPackageDir ? path.join(agentPackageDir, 'dist', 'index.js') : '';
  const brainPath = rootDir ? path.join(rootDir, 'compositions', 'holoclaw-brain.hsplus') : '';
  const brainText = brainPath ? readText(brainPath) : '';
  const { skillsDir, skills } = rootDir ? discoverSkills(rootDir) : { skillsDir: '', skills: [] };
  return {
    rootDir,
    rootPresent: Boolean(rootDir),
    agentPackageDir,
    agentPackagePresent: Boolean(agentPackageDir && existsSync(agentPackageDir)),
    agentBin,
    agentBinPresent: Boolean(agentBin && existsSync(agentBin)),
    agentDist,
    agentDistPresent: Boolean(agentDist && existsSync(agentDist)),
    brainPath,
    brainPresent: Boolean(brainPath && existsSync(brainPath)),
    brainToolFinding: {
      directValidateDeclared: /validate_holoscript/u.test(brainText),
      mcpCallRequired: true,
      status: /validate_holoscript/u.test(brainText) ? 'compat_note' : 'ok',
    },
    skillsDir,
    skills,
    skillCount: skills.length,
  };
}

function runtimeReady(runtime) {
  return Boolean(runtime.rootPresent && runtime.agentPackagePresent && runtime.agentBinPresent && runtime.brainPresent);
}

function redactedEnvPlan(args, runtime) {
  return {
    HOLOSCRIPT_AGENT_HANDLE: args.agentHandle,
    HOLOSCRIPT_AGENT_PROVIDER: args.provider,
    HOLOSCRIPT_AGENT_MODEL: args.model,
    HOLOSCRIPT_AGENT_BRAIN: runtime.brainPath ? runtime.brainPath.replace(/\\/g, '/') : '',
    HOLOSCRIPT_AGENT_SCOPE_TIER: 'warm',
    HOLOSCRIPT_AGENT_SURFACE: 'holoshell-holoclaw',
    HOLOSCRIPT_AGENT_X402_BEARER: '[required_or_broker_resolved]',
    HOLOSCRIPT_AGENT_WALLET: '[required]',
    HOLOMESH_TEAM_ID: '[required]',
  };
}

function runtimeCommand(args, runtime) {
  const mode = normalizeRuntimeMode(args.runtimeMode);
  if (!runtime.agentBin) return [];
  return ['node', runtime.agentBin.replace(/\\/g, '/'), mode];
}

function step(id, label, permissionEnvelope, targetResolved, detail, action = null) {
  return {
    id,
    label,
    kind: id,
    detail,
    permissionEnvelope,
    approvalRequired: permissionEnvelope !== 'read_only',
    status: targetResolved ? (permissionEnvelope === 'read_only' ? 'resolved' : 'approval_required') : 'blocked',
    targetResolved,
    action,
    mutationExecuted: false,
  };
}

function buildBridge(args) {
  const generatedAt = new Date().toISOString();
  const runtime = discoverRuntime(args);
  const objective = args.prompt || args.intent || 'Run HoloClaw from HoloShell';
  const selectedSkills = selectSkills(runtime.skills, objective, args.selectedSkill);
  const ready = runtimeReady(runtime);
  const command = runtimeCommand(args, runtime);
  const bridgeId = `hshc-${Date.now().toString(36)}-${shortHash({ objective, generatedAt })}`;
  const missing = [
    !runtime.rootPresent ? 'holoscript_repo' : '',
    !runtime.agentPackagePresent ? 'holoscript_agent_package' : '',
    !runtime.agentBinPresent ? 'holoscript_agent_bin' : '',
    !runtime.brainPresent ? 'holoclaw_brain' : '',
  ].filter(Boolean);
  const pendingApprovalCount = ready ? 1 : 0;
  const steps = [
    step('resolve-holoscript-repo', 'Resolve HoloScript Repo', 'read_only', runtime.rootPresent, runtime.rootPresent ? 'HoloScript repo resolved.' : 'HoloScript repo not found.'),
    step('resolve-holoclaw-brain', 'Resolve HoloClaw Brain', 'read_only', runtime.brainPresent, runtime.brainPresent ? 'HoloClaw brain source resolved.' : 'HoloClaw brain source missing.'),
    step('resolve-holoscript-agent', 'Resolve HoloScript Agent Runtime', 'read_only', runtime.agentBinPresent, runtime.agentBinPresent ? 'holoscript-agent launcher resolved.' : 'holoscript-agent launcher missing.'),
    step('select-holoclaw-skills', 'Select HoloClaw Skills', 'read_only', selectedSkills.length > 0, selectedSkills.length ? `${selectedSkills.length} skill(s) selected.` : 'No HoloClaw skill shelf entries found.'),
    step('apply-policy-envelope', 'Apply Policy Envelope', 'read_only', true, 'PolicyPack lane is stage-only until daemon approval and runtime env are present.'),
    step('approve-holoclaw-runtime-tick', 'Approve HoloClaw Runtime Tick', 'guarded_execute', ready, 'Run one HoloClaw AgentRunner tick through the HoloScript agent runtime.', {
      action: 'holoclaw_agent_tick',
      commandPreview: command.join(' '),
      runtimeMode: normalizeRuntimeMode(args.runtimeMode),
      envPlan: redactedEnvPlan(args, runtime),
    }),
  ];
  const targetResolvedCount = steps.filter((item) => item.targetResolved).length;
  const stageErrorCount = steps.filter((item) => !item.targetResolved).length;
  const status = ready ? 'pending_user_approval' : 'blocked_missing_runtime';

  return {
    schemaVersion: BRIDGE_SCHEMA,
    generatedAt,
    bridgeId,
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareSource: HARDWARE_SOURCE_REF,
      dispatchSource: DISPATCH_SOURCE_REF,
      adapter: SCRIPT_REF,
      holoscriptAgentPackage: runtime.agentPackageDir ? runtime.agentPackageDir.replace(/\\/g, '/') : '',
      holoclawBrain: runtime.brainPath ? runtime.brainPath.replace(/\\/g, '/') : '',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    request: {
      actor: args.actor,
      intentPreview: String(args.intent || '').slice(0, 220),
      promptPresent: Boolean(args.prompt),
      promptHash: args.prompt ? hashValue(args.prompt) : '',
      rawPromptStoredLocallyOnly: true,
    },
    runtime: {
      status: ready ? 'ready_to_stage' : 'missing_requirements',
      rootPresent: runtime.rootPresent,
      rootDir: runtime.rootDir ? runtime.rootDir.replace(/\\/g, '/') : '',
      agentPackagePresent: runtime.agentPackagePresent,
      agentBinPresent: runtime.agentBinPresent,
      agentDistPresent: runtime.agentDistPresent,
      brainPresent: runtime.brainPresent,
      brainToolFinding: runtime.brainToolFinding,
      missing,
      command,
      envPlan: redactedEnvPlan(args, runtime),
      executeRequiresDaemonFlag: true,
      executeRequiresRuntimeEnv: true,
    },
    policy: {
      permissionEnvelope: 'guarded_execute',
      approvalRequired: ready,
      directExecutionAllowed: false,
      downstreamAdapterOwnsApproval: true,
      breakGlassActionsAllowed: false,
      secretsCaptured: false,
      destructiveActionsTaken: false,
      openClawRuntimeBackendAllowed: false,
      nemoClawRuntimeBackendAllowed: false,
      lowerLevelSubstrateAllowed: ['ollama_compatible_serving', 'cuda_tensorrt_rtx_jetson_acceleration'],
    },
    skills: {
      skillsDir: runtime.skillsDir ? runtime.skillsDir.replace(/\\/g, '/') : '',
      totalCount: runtime.skillCount,
      selected: selectedSkills,
    },
    workflowPlan: {
      kind: WORKFLOW_KIND,
      runtimeMode: normalizeRuntimeMode(args.runtimeMode),
      pendingApprovalCount,
      targetResolvedCount,
      stageErrorCount,
      steps,
    },
    receipt: {
      destructiveActionsTaken: false,
      rawSecretsIncluded: false,
      runtimeTickExecuted: false,
      bridgeHash: hashValue({ runtime, selectedSkills, objective, generatedAt }),
    },
    summary: {
      status,
      workflowKind: WORKFLOW_KIND,
      bridgeId,
      runtimeReady: ready,
      runtimeMode: normalizeRuntimeMode(args.runtimeMode),
      agentHandle: args.agentHandle,
      selectedSkillCount: selectedSkills.length,
      pendingApprovalCount,
      targetResolvedCount,
      stepCount: steps.length,
      stageErrorCount,
      approvalRequired: ready,
      mutationExecuted: false,
      missing,
    },
  };
}

function buildWorkflow(bridge, args) {
  return {
    schemaVersion: WORKFLOW_SCHEMA,
    generatedAt: bridge.generatedAt,
    workflowId: bridge.bridgeId.replace(/^hshc-/u, 'hswf-holoclaw-'),
    profile: WORKFLOW_KIND,
    title: 'HoloClaw Runtime Bridge',
    actor: args.actor,
    request: {
      intentPreview: bridge.request.intentPreview,
      promptPresent: bridge.request.promptPresent,
      rawPromptStoredLocallyOnly: true,
    },
    sourceAnchors: {
      source: SOURCE_REF,
      adapter: SCRIPT_REF,
      bridgeReceipt: toRepoPath(args.bridgeOutput),
      holoscriptAgentPackage: bridge.sourceAnchors.holoscriptAgentPackage,
      holoclawBrain: bridge.sourceAnchors.holoclawBrain,
    },
    modelRoute: {
      provider: args.provider,
      route: 'sovereign_local',
      model: args.model,
      taskLane: 'local',
      taskTag: 'local',
      cloudEscalationAllowed: false,
    },
    holoclawRuntime: {
      bridgeId: bridge.bridgeId,
      runtimeMode: bridge.summary.runtimeMode,
      runtimeStatus: bridge.runtime.status,
      command: bridge.runtime.command,
      envPlan: bridge.runtime.envPlan,
      skills: bridge.skills.selected,
      brainToolFinding: bridge.runtime.brainToolFinding,
    },
    steps: bridge.workflowPlan.steps,
    summary: {
      status: bridge.summary.status,
      workflowKind: WORKFLOW_KIND,
      targetSurface: 'HoloClaw AgentRunner',
      stepCount: bridge.summary.stepCount,
      guardedStepCount: 1,
      pendingApprovalCount: bridge.summary.pendingApprovalCount,
      targetResolvedCount: bridge.summary.targetResolvedCount,
      stageErrorCount: bridge.summary.stageErrorCount,
      model: args.model,
      modelRoute: 'sovereign_local',
      taskLane: 'local',
      taskTag: 'local',
      cloudEscalationAllowed: false,
      mutationExecuted: false,
      runtimeReady: bridge.summary.runtimeReady,
      bridgeId: bridge.bridgeId,
    },
  };
}

function buildGate(bridge, args) {
  const allowed = bridge.summary.runtimeReady && bridge.summary.stageErrorCount === 0;
  return {
    schemaVersion: GATE_SCHEMA,
    generatedAt: bridge.generatedAt,
    gateId: `hsbig-holoclaw-${shortHash(bridge.bridgeId, 10)}`,
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareSource: HARDWARE_SOURCE_REF,
      adapter: SCRIPT_REF,
      bridgeReceipt: toRepoPath(args.bridgeOutput),
    },
    gate: {
      label: 'holoshell_holoclaw_runtime_bridge',
      allowed,
      status: allowed ? 'allow' : 'block',
      runtimeBlocking: true,
      blockedReason: allowed ? '' : `Missing HoloClaw runtime requirements: ${bridge.summary.missing.join(', ') || 'unknown'}`,
      failedCheckIds: allowed ? [] : bridge.summary.missing.map((item) => `missing_${item}`),
    },
    holoscriptReceipt: null,
    summary: {
      status: allowed ? 'pass' : 'blocked',
      executionAllowed: allowed,
      runtimeBlocking: true,
      caseId: GATE_CASE_ID,
      receiptStatus: 'local_bridge_preflight',
      score: allowed ? 1 : 0,
      passed: allowed ? 1 : 0,
      total: 1,
      failedCheckCount: allowed ? 0 : bridge.summary.missing.length,
      blockedReason: allowed ? '' : `Missing HoloClaw runtime requirements: ${bridge.summary.missing.join(', ') || 'unknown'}`,
    },
    output: {
      latestPath: resolveRepoPath(args.gateOutput),
      browserBootstrap: resolveRepoPath(args.gateJsOutput),
      sourceReceiptPath: resolveRepoPath(args.bridgeOutput),
    },
  };
}

function workflowRequestFromApproval(bundle) {
  if (!bundle || bundle.schemaVersion !== APPROVAL_SCHEMA) throw new Error('Workflow approval bundle schema mismatch.');
  return bundle.workflowRequest || {};
}

function applyWorkflowApprovalBundle(args) {
  if (!args.workflowApprovalBundle) return null;
  const resolved = resolveRepoPath(args.workflowApprovalBundle);
  const bundle = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!args.workflowApprovalId || bundle.approvalId !== args.workflowApprovalId) throw new Error('Workflow approval id mismatch.');
  if (!args.workflowApprovalNonce || bundle.nonce !== args.workflowApprovalNonce) throw new Error('Workflow approval nonce mismatch.');
  if (bundle.approval?.expiresAt && Date.parse(bundle.approval.expiresAt) <= Date.now()) throw new Error('Workflow approval bundle has expired.');
  if (!bundle.execution?.allowed) throw new Error(bundle.execution?.blockedReason || 'Workflow approval does not allow execution.');
  const request = workflowRequestFromApproval(bundle);
  args.intent = request.intent || args.intent;
  args.prompt = request.prompt || args.prompt;
  args.runtimeMode = normalizeRuntimeMode(request.runtimeMode || args.runtimeMode);
  args.agentHandle = normalizeHandle(request.agentHandle || args.agentHandle);
  args.provider = request.provider || args.provider;
  args.model = request.model || args.model;
  args.selectedSkill = request.selectedSkill || args.selectedSkill;
  return {
    approvalId: bundle.approvalId,
    sourceWorkflowId: bundle.sourceWorkflow?.workflowId || '',
    expiresAt: bundle.approval?.expiresAt || '',
  };
}

function executeApprovedWorkflow(args, bridge) {
  const approvalContext = args.workflowApprovalContext || applyWorkflowApprovalBundle(args);
  const allowTick = process.env.HOLOSHELL_HOLOCLAW_ALLOW_AGENT_TICK === '1';
  if (!allowTick) {
    return {
      status: 'runtime_tick_guarded_by_env',
      approvalContext,
      executed: false,
      exitCode: null,
      stdoutTail: [],
      stderrTail: ['Set HOLOSHELL_HOLOCLAW_ALLOW_AGENT_TICK=1 to allow the approved AgentRunner tick.'],
    };
  }
  if (!bridge.runtime.command.length) {
    return {
      status: 'runtime_command_missing',
      approvalContext,
      executed: false,
      exitCode: null,
      stdoutTail: [],
      stderrTail: ['HoloClaw runtime command was not available.'],
    };
  }
  const env = {
    ...process.env,
    HOLOSCRIPT_AGENT_HANDLE: args.agentHandle,
    HOLOSCRIPT_AGENT_PROVIDER: args.provider,
    HOLOSCRIPT_AGENT_MODEL: args.model,
    HOLOSCRIPT_AGENT_BRAIN: bridge.runtime.envPlan.HOLOSCRIPT_AGENT_BRAIN,
    HOLOSCRIPT_AGENT_SCOPE_TIER: 'warm',
    HOLOSCRIPT_AGENT_SURFACE: 'holoshell-holoclaw',
  };
  const [command, ...commandArgs] = bridge.runtime.command;
  const result = spawnSync(command, commandArgs, {
    cwd: bridge.runtime.rootDir || REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  return {
    status: result.status === 0 ? 'runtime_tick_completed' : 'runtime_tick_failed',
    approvalContext,
    executed: true,
    exitCode: result.status,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr || result.error?.message || ''),
  };
}

function tailLines(value, count = 12) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-count);
}

function withExecution(bridge, execution) {
  return {
    ...bridge,
    execution: {
      ...execution,
      destructiveActionsTaken: false,
      rawSecretsIncluded: false,
    },
    receipt: {
      ...bridge.receipt,
      runtimeTickExecuted: execution.executed,
    },
    summary: {
      ...bridge.summary,
      status: execution.status,
      mutationExecuted: execution.executed,
    },
  };
}

function writeOutputs(args, bridge, workflow, gate) {
  const bridgePath = resolveRepoPath(args.bridgeOutput);
  const bridgeArchive = path.join(resolveRepoPath(args.bridgeDir), `${bridge.bridgeId}.json`);
  const withOutput = {
    ...bridge,
    output: {
      latestPath: bridgePath,
      archivePath: bridgeArchive,
      browserBootstrap: resolveRepoPath(args.bridgeJsOutput),
      workflowPath: resolveRepoPath(args.workflowOutput),
      gatePath: resolveRepoPath(args.gateOutput),
    },
  };
  writeJson(bridgeArchive, withOutput);
  writeJson(args.bridgeOutput, withOutput);
  writeJs(args.bridgeJsOutput, 'HOLOSHELL_HOLOCLAW_RUNTIME_BRIDGE', withOutput);
  writeJson(args.workflowOutput, workflow);
  writeJs(args.workflowJsOutput, 'HOLOSHELL_WORKFLOW', workflow);
  writeJson(args.gateOutput, gate);
  writeJs(args.gateJsOutput, 'HOLOSHELL_BRAIN_INTENT_GATE', gate);
  return withOutput;
}

function assertSelfTest(bridge, workflow, gate) {
  const failures = [];
  if (bridge.schemaVersion !== BRIDGE_SCHEMA) failures.push('bridge schema mismatch');
  if (workflow.schemaVersion !== WORKFLOW_SCHEMA) failures.push('workflow schema mismatch');
  if (gate.schemaVersion !== GATE_SCHEMA) failures.push('gate schema mismatch');
  if (bridge.summary.workflowKind !== WORKFLOW_KIND) failures.push('workflow kind mismatch');
  if (!bridge.summary.runtimeReady) failures.push('fixture runtime should be ready');
  if (bridge.policy.openClawRuntimeBackendAllowed !== false) failures.push('OpenClaw backend must be disallowed');
  if (bridge.policy.nemoClawRuntimeBackendAllowed !== false) failures.push('NemoClaw backend must be disallowed');
  if (workflow.summary.pendingApprovalCount !== 1) failures.push('HoloClaw workflow should require approval');
  if (!gate.summary.executionAllowed) failures.push('fixture gate should allow execution');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function run(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  if (args.executeWorkflow) {
    args.workflowApprovalContext = applyWorkflowApprovalBundle(args);
  }
  let bridge = buildBridge(args);
  if (args.executeWorkflow) {
    const execution = executeApprovedWorkflow(args, bridge);
    bridge = withExecution(bridge, execution);
  }
  const workflow = buildWorkflow(bridge, args);
  const gate = buildGate(bridge, args);
  if (args.selfTest) assertSelfTest(bridge, workflow, gate);
  return { args, bridge, workflow, gate, written: writeOutputs(args, bridge, workflow, gate) };
}

if (path.resolve(process.argv[1] || '') === __filename) {
  try {
    const result = run();
    if (result.args.json) {
      console.log(JSON.stringify(result.written, null, 2));
    } else {
      console.log(`HoloShell HoloClaw bridge: ${result.written.output.latestPath}`);
      console.log(`Workflow: ${result.written.output.workflowPath}`);
      console.log(`Gate: ${result.written.output.gatePath}`);
      console.log(`Status: ${result.written.summary.status}`);
    }
  } catch (error) {
    console.error(`holoshell-holoclaw-runtime-bridge failed: ${error.message}`);
    process.exit(1);
  }
}

export {
  BRIDGE_SCHEMA,
  WORKFLOW_KIND,
  buildBridge,
  buildWorkflow,
  buildGate,
  parseArgs,
  run,
};
