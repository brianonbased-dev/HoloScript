#!/usr/bin/env node
/**
 * HoloShell Grok Build workflow bridge.
 *
 * Stages Grok Build as a guarded local coding-agent lane. The bridge records
 * local install/auth/model/project-trust readiness before any launch and keeps
 * execution behind the same nonce-bound HoloShell workflow approval envelope as
 * the sovereign room-marathon workflows.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const tmpRoot = join(repoRoot, '.tmp', 'holoshell');
const defaultSetupOutput = join(tmpRoot, 'grok-build-setup.json');
const defaultSetupJsOutput = join(tmpRoot, 'grok-build-setup.js');
const defaultWorkflowOutput = join(tmpRoot, 'workflow-latest.json');
const defaultWorkflowJsOutput = join(tmpRoot, 'workflow-latest.js');
const defaultApprovalOutput = join(tmpRoot, 'workflow-approval-latest.json');
const defaultApprovalJsOutput = join(tmpRoot, 'workflow-approval-latest.js');
const defaultGateOutput = join(tmpRoot, 'brain-intent-gate-latest.json');
const defaultGateJsOutput = join(tmpRoot, 'brain-intent-gate-latest.js');
const defaultWorkflowDir = join(tmpRoot, 'workflows');
const defaultApprovalDir = join(tmpRoot, 'workflow-approval-bundles');

const WORKFLOW_SCHEMA = 'hololand.holoshell.workflow.v0.1.0';
const APPROVAL_SCHEMA = 'hololand.holoshell.workflow-approval.v0.1.0';
const GATE_SCHEMA = 'hololand.holoshell.brain-intent-gate.v0.1.0';
const SETUP_SCHEMA = 'hololand.holoshell.grok-build-setup.v0.1.0';
const SCRIPT_REF = 'scripts/holoshell-grok-build-workflow.mjs';
const SOURCE_REF = 'apps/holoshell/source/holoshell-grok-build-workflow.hsplus';
const HARDWARE_SOURCE_REF = 'apps/holoshell/source/holoshell-hardware-control.hsplus';
const GATE_CASE_ID = 'holoshell-grok-build-local-approval.v0';
const DEFAULT_HEADLESS_PROMPT =
  'Inspect this HoloLand repository for HoloShell/Grok Build readiness. Summarize findings only. Do not edit files.';

function parseArgs(argv) {
  const args = {
    actor: 'brittney',
    mode: 'interactive',
    prompt: '',
    model: 'grok-build',
    effort: '',
    reasoningEffort: '',
    permissionMode: '',
    sandbox: '',
    maxTurns: 0,
    cwd: repoRoot,
    disableWebSearch: false,
    noSubagents: false,
    noMemory: false,
    noAltScreen: false,
    continueSession: false,
    setupOnly: false,
    executeWorkflow: false,
    workflowApprovalBundle: '',
    workflowApprovalId: '',
    workflowApprovalNonce: '',
    setupOutput: defaultSetupOutput,
    setupJsOutput: defaultSetupJsOutput,
    output: defaultWorkflowOutput,
    jsOutput: defaultWorkflowJsOutput,
    approvalOutput: defaultApprovalOutput,
    approvalJsOutput: defaultApprovalJsOutput,
    gateOutput: defaultGateOutput,
    gateJsOutput: defaultGateJsOutput,
    workflowDir: defaultWorkflowDir,
    approvalDir: defaultApprovalDir,
    json: false,
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => argv[++i] ?? '';
    switch (token) {
      case '--':
        break;
      case '--actor':
        args.actor = next() || args.actor;
        break;
      case '--mode':
        args.mode = normalizeMode(next() || args.mode);
        break;
      case '--prompt':
      case '--task':
      case '--single':
        args.prompt = next();
        if (args.prompt) args.mode = 'headless';
        break;
      case '--model':
        args.model = next() || args.model;
        break;
      case '--effort':
        args.effort = next();
        break;
      case '--reasoning-effort':
        args.reasoningEffort = next();
        break;
      case '--permission-mode':
        args.permissionMode = next();
        break;
      case '--sandbox':
        args.sandbox = next();
        break;
      case '--max-turns':
        args.maxTurns = Number(next()) || 0;
        break;
      case '--cwd':
        args.cwd = resolve(repoRoot, next() || '.');
        break;
      case '--disable-web-search':
        args.disableWebSearch = true;
        break;
      case '--no-subagents':
        args.noSubagents = true;
        break;
      case '--no-memory':
        args.noMemory = true;
        break;
      case '--no-alt-screen':
        args.noAltScreen = true;
        break;
      case '--continue':
        args.continueSession = true;
        break;
      case '--setup-only':
        args.setupOnly = true;
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
      case '--setup-output':
        args.setupOutput = resolve(repoRoot, next());
        break;
      case '--setup-js-output':
        args.setupJsOutput = resolve(repoRoot, next());
        break;
      case '--output':
        args.output = resolve(repoRoot, next());
        break;
      case '--js-output':
        args.jsOutput = resolve(repoRoot, next());
        break;
      case '--approval-output':
        args.approvalOutput = resolve(repoRoot, next());
        break;
      case '--approval-js-output':
        args.approvalJsOutput = resolve(repoRoot, next());
        break;
      case '--gate-output':
        args.gateOutput = resolve(repoRoot, next());
        break;
      case '--gate-js-output':
        args.gateJsOutput = resolve(repoRoot, next());
        break;
      case '--workflow-dir':
        args.workflowDir = resolve(repoRoot, next());
        break;
      case '--approval-dir':
        args.approvalDir = resolve(repoRoot, next());
        break;
      case '--json':
        args.json = true;
        break;
      case '--self-test':
        args.selfTest = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (token.startsWith('--')) throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell Grok Build workflow bridge

Usage:
  node scripts/holoshell-grok-build-workflow.mjs --setup-only --json
  node scripts/holoshell-grok-build-workflow.mjs --mode interactive
  node scripts/holoshell-grok-build-workflow.mjs --prompt "Inspect HoloShell readiness" --permission-mode plan

Options:
  --setup-only                 Write Grok readiness receipt only.
  --mode <interactive|headless> Stage TUI launch or single-turn prompt.
  --prompt <text>              Headless prompt. Stored only in local receipts.
  --model <model>              Defaults to grok-build.
  --permission-mode <mode>     Grok permission mode for headless sessions.
  --sandbox <profile>          Optional Grok sandbox profile.
  --execute-workflow           Execute a nonce-approved workflow.
  --self-test                  Run fixture assertions.
  --json                       Print JSON output.
`);
}

function normalizeMode(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['headless', 'single', 'prompt'].includes(text)) return 'headless';
  return 'interactive';
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJs(path, globalName, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `window.${globalName} = ${JSON.stringify(value, null, 2)};\n`, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function grokChildEnv(extra = {}) {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return {
    ...process.env,
    ...(home ? { HOME: home } : {}),
    ...extra,
  };
}

function id(prefix, seed = '') {
  return `${prefix}-${Date.now()}-${shortHash(`${seed}:${randomBytes(4).toString('hex')}`)}`;
}

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs || 15000,
    maxBuffer: 10 * 1024 * 1024,
    env: options.env || grokChildEnv(),
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function whereCommand(command) {
  if (process.platform !== 'win32') {
    const result = runCommand('which', [command], { timeoutMs: 5000 });
    return result.ok ? (result.stdout || '').split(/\r?\n/).find(Boolean) || null : null;
  }
  const result = runCommand('where.exe', [command], { timeoutMs: 5000 });
  if (!result.ok) return null;
  return (result.stdout || '').split(/\r?\n/).find(Boolean) || null;
}

function defaultGrokPath() {
  const home = process.env.USERPROFILE || os.homedir();
  return process.platform === 'win32'
    ? join(home, '.grok', 'bin', 'grok.exe')
    : join(home, '.grok', 'bin', 'grok');
}

function resolveGrokPath() {
  const onPath = whereCommand('grok');
  if (onPath && existsSync(onPath)) {
    return { path: onPath, source: 'PATH', exists: true };
  }
  const fallback = defaultGrokPath();
  return {
    path: existsSync(fallback) ? fallback : onPath || fallback,
    source: existsSync(fallback) ? 'user_grok_bin' : 'unresolved',
    exists: existsSync(fallback) || Boolean(onPath),
  };
}

function authProbe() {
  const authPath = join(process.env.USERPROFILE || os.homedir(), '.grok', 'auth.json');
  return {
    status: existsSync(authPath) ? 'present' : 'missing',
    authPath,
    authFilePresent: existsSync(authPath),
    contentsRead: false,
  };
}

function parseVersion(output) {
  const line = String(output || '').split(/\r?\n/).find(Boolean) || '';
  const match = line.match(/grok\s+([0-9][^\s]*)/i);
  return {
    raw: line,
    version: match?.[1] || '',
  };
}

function parseModels(output) {
  const text = String(output || '');
  const loginProvider = (text.match(/logged in with\s+([^\r\n]+)/i)?.[1] || '')
    .replace(/[.。]\s*$/, '')
    .trim();
  const defaultModel = text.match(/Default model:\s*([^\r\n]+)/i)?.[1]?.trim() || '';
  const availableModels = text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[*-]\s*([^\s(]+)/)?.[1] || '')
    .filter(Boolean);
  return {
    status: defaultModel || availableModels.length ? 'available' : 'unknown',
    authRuntimeStatus: loginProvider
      ? 'authenticated'
      : /not logged in|login required|unauthorized|forbidden/i.test(text)
        ? 'missing'
        : 'unknown',
    authProvider: loginProvider,
    defaultModel,
    availableModels,
    requestedModelAvailable: availableModels.includes('grok-build') || defaultModel === 'grok-build',
  };
}

function parseInspect(output) {
  const text = String(output || '');
  const projectTrustedRaw = text.match(/Project trusted:\s*(yes|no|true|false)/i)?.[1]?.toLowerCase() || '';
  const countFor = (label) => Number(text.match(new RegExp(`${label} \\((\\d+)\\)`, 'i'))?.[1] || 0);
  return {
    cwd: text.match(/CWD:\s*([^\r\n]+)/i)?.[1]?.trim() || '',
    gitRoot: text.match(/Git root:\s*([^\r\n]+)/i)?.[1]?.trim() || '',
    projectTrusted: ['yes', 'true'].includes(projectTrustedRaw),
    projectTrustStatus: projectTrustedRaw ? (['yes', 'true'].includes(projectTrustedRaw) ? 'trusted' : 'untrusted') : 'unknown',
    projectInstructionCount: countFor('Project Instructions'),
    skillCount: countFor('Skills'),
    agentCount: countFor('Agents'),
    pluginCount: countFor('Plugins'),
    hookCount: countFor('Hooks'),
    skippedPermissionCount: Number(text.match(/(\d+)\s+skipped/i)?.[1] || 0),
  };
}

function promptDigest(prompt) {
  const text = String(prompt || '');
  return {
    present: text.trim().length > 0,
    length: text.length,
    sha256: text ? createHash('sha256').update(text).digest('hex') : null,
  };
}

function buildSetup(args) {
  const generatedAt = nowIso();
  const cli = resolveGrokPath();
  const auth = authProbe();
  const versionResult = cli.exists ? runCommand(cli.path, ['version'], { timeoutMs: 15000 }) : null;
  const modelsResult = cli.exists ? runCommand(cli.path, ['models'], { timeoutMs: 20000 }) : null;
  const inspectResult = cli.exists ? runCommand(cli.path, ['inspect'], { cwd: args.cwd, timeoutMs: 25000 }) : null;
  const version = parseVersion(versionResult?.stdout || '');
  const models = parseModels(modelsResult?.stdout || '');
  const inspect = parseInspect(`${inspectResult?.stdout || ''}\n${inspectResult?.stderr || ''}`);
  const cliStatus = cli.exists ? 'installed' : 'missing';
  const modelStatus = models.requestedModelAvailable ? 'available' : models.status === 'available' ? 'partial' : 'unknown';
  const authRuntimeStatus = models.authRuntimeStatus === 'authenticated'
    ? 'authenticated'
    : auth.status === 'present' && Boolean(modelsResult?.ok) && models.status === 'available'
      ? 'authenticated'
      : models.authRuntimeStatus;
  const authProvider = models.authProvider || (authRuntimeStatus === 'authenticated' ? 'grok.com' : '');
  const authReady = auth.status === 'present' || authRuntimeStatus === 'authenticated';
  const operatorStatus = cliStatus === 'missing' || !authReady || modelStatus !== 'available'
    ? 'blocked'
    : inspect.projectTrusted
      ? 'trusted_ready'
      : 'authenticated_needs_project_trust';
  const heavyAccessStatus = authReady && models.requestedModelAvailable ? 'active' : 'unverified';
  const status = cliStatus === 'missing' || auth.status === 'missing'
    ? 'blocked'
    : modelStatus === 'available' && inspect.projectTrusted
      ? 'ready'
      : 'partial';

  return {
    schemaVersion: SETUP_SCHEMA,
    generatedAt,
    setupId: id('hsgrok-setup', args.model),
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareControl: HARDWARE_SOURCE_REF,
      adapter: SCRIPT_REF,
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    cli: {
      status: cliStatus,
      path: cli.exists ? cli.path : '',
      pathSource: cli.source,
      version: version.version,
      versionRaw: version.raw,
      versionProbeOk: Boolean(versionResult?.ok),
      pathSeenOnCurrentProcess: Boolean(whereCommand('grok')),
    },
    auth,
    operator: {
      status: operatorStatus,
      cliReady: cliStatus === 'installed',
      authReady,
      authRuntimeStatus,
      authProvider,
      modelReady: modelStatus === 'available',
      projectTrusted: inspect.projectTrusted,
      autonomyStatus: inspect.projectTrusted && operatorStatus === 'trusted_ready'
        ? 'eligible_after_workflow_approval'
        : 'blocked_until_project_trust',
      approvalRequiredForMutatingActions: true,
    },
    models: {
      status: modelStatus,
      requestedModel: args.model,
      defaultModel: models.defaultModel,
      availableModels: models.availableModels,
      requestedModelAvailable: models.availableModels.includes(args.model) || models.defaultModel === args.model,
      probeOk: Boolean(modelsResult?.ok),
      stderr: String(modelsResult?.stderr || '').trim().slice(0, 600),
    },
    project: {
      cwd: inspect.cwd || args.cwd,
      gitRoot: inspect.gitRoot,
      trusted: inspect.projectTrusted,
      trustStatus: inspect.projectTrustStatus,
      instructionCount: inspect.projectInstructionCount,
      skillCount: inspect.skillCount,
      agentCount: inspect.agentCount,
      pluginCount: inspect.pluginCount,
      hookCount: inspect.hookCount,
      skippedPermissionCount: inspect.skippedPermissionCount,
      inspectProbeOk: Boolean(inspectResult?.ok),
      inspectStderr: String(inspectResult?.stderr || '').trim().slice(0, 600),
    },
    heavyUpgrade: {
      status: heavyAccessStatus,
      activatedAfter: '2026-05-15',
      verifiedAt: generatedAt,
      evidence: heavyAccessStatus === 'active'
        ? `grok models returned the grok-build model while authenticated${authProvider ? ` with ${authProvider}` : ''}.`
        : 'Grok Build access has not been verified by the local model probe.',
      founderNote: heavyAccessStatus === 'active'
        ? 'SuperGrok Heavy access is active for the local Grok Build lane.'
        : 'Rerun setup after activating SuperGrok Heavy to refresh available models and launch policy.',
      nextCommand: 'node scripts/holoshell-grok-build-workflow.mjs --setup-only --json',
    },
    summary: {
      status,
      heavyAccessStatus,
      cliStatus,
      cliVersion: version.version || 'unknown',
      authStatus: auth.status,
      authRuntimeStatus,
      authProvider,
      modelStatus,
      requestedModel: args.model,
      defaultModel: models.defaultModel || 'unknown',
      operatorStatus,
      autonomyStatus: inspect.projectTrusted && operatorStatus === 'trusted_ready'
        ? 'eligible_after_workflow_approval'
        : 'blocked_until_project_trust',
      projectTrusted: inspect.projectTrusted,
      projectTrustStatus: inspect.projectTrustStatus,
      projectHookCount: inspect.hookCount,
      skippedPermissionCount: inspect.skippedPermissionCount,
      pathSeenOnCurrentProcess: Boolean(whereCommand('grok')),
      warningCount: [
        !inspect.projectTrusted,
        inspect.skippedPermissionCount > 0,
        !whereCommand('grok') && cli.exists,
      ].filter(Boolean).length,
      readyForHeavyRecheck: cliStatus === 'installed' && auth.status === 'present',
      readyForGrokBuild: cliStatus === 'installed' && auth.status === 'present' && modelStatus === 'available',
    },
    recommendations: [
      inspect.projectTrusted
        ? 'Project hooks are trusted for Grok.'
        : 'Open Grok in this repo and run /hooks-trust before relying on project hooks.',
      authRuntimeStatus === 'authenticated'
        ? `Grok CLI confirms login${authProvider ? ` with ${authProvider}` : ''}.`
        : 'Run grok login before staging Grok Build.',
      whereCommand('grok')
        ? 'Current process PATH resolves grok.'
        : `Current process PATH does not resolve grok; HoloShell will use ${cli.path || defaultGrokPath()} directly.`,
      heavyAccessStatus === 'active'
        ? 'Heavy access is active; stage a read-only headless inspection before any mutating Grok Build run.'
        : 'After Grok Heavy is active, rerun the setup receipt and stage a read-only headless inspection first.',
    ],
    output: {
      latestPath: args.setupOutput,
      browserBootstrap: args.setupJsOutput,
    },
  };
}

function grokCommandParts(args, setup) {
  const grokPath = setup.cli.path || resolveGrokPath().path || 'grok';
  const mode = normalizeMode(args.mode);
  const model = args.model || setup.models.requestedModel || 'grok-build';
  const cwd = args.cwd || repoRoot;
  const parts = [grokPath, '--cwd', cwd, '--model', model];

  if (mode === 'headless') {
    parts.push('--single', args.prompt || DEFAULT_HEADLESS_PROMPT);
    parts.push('--output-format', 'plain');
    parts.push('--permission-mode', args.permissionMode || 'plan');
    if (args.sandbox) parts.push('--sandbox', args.sandbox);
    if (args.effort) parts.push('--effort', args.effort);
    if (args.reasoningEffort) parts.push('--reasoning-effort', args.reasoningEffort);
    if (args.maxTurns > 0) parts.push('--max-turns', String(args.maxTurns));
    if (args.disableWebSearch) parts.push('--disable-web-search');
    if (args.noSubagents) parts.push('--no-subagents');
    if (args.noMemory) parts.push('--no-memory');
    return parts;
  }

  if (args.continueSession) parts.push('--continue');
  if (args.noAltScreen) parts.push('--no-alt-screen');
  if (args.disableWebSearch) parts.push('--disable-web-search');
  if (args.noSubagents) parts.push('--no-subagents');
  if (args.noMemory) parts.push('--no-memory');
  return parts;
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psCommand(parts) {
  const [exe, ...args] = parts;
  const homePrefix = '$env:HOME = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }';
  return `${homePrefix}; & ${psString(exe)} ${args.map(psString).join(' ')}`.trim();
}

function cleanGrokOutput(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d{4}-\d{2}-\d{2}T.*\b(WARN|ERROR)\b/.test(line))
    .filter((line) => !/^A new version of Grok Build is available:/i.test(line))
    .filter((line) => !/unknown tool prefix|Failed to parse agent definition/.test(line))
    .filter((line) => !/skill name does not match expected name from path/.test(line))
    .filter((line) => !/could not determine home directory|project hooks discovered but not trusted/.test(line))
    .join('\n')
    .trim();
}

function extractFindings(text) {
  const lines = cleanGrokOutput(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines
    .filter((line) => /^([-*]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^([-*]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim());
  const fallbackLines = lines
    .filter((line) => !/^```/.test(line))
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/\*\*/g, '').trim());
  return (bulletLines.length ? bulletLines : fallbackLines).slice(0, 6);
}

function extractFilesReferenced(text) {
  const matches = cleanGrokOutput(text).match(/(?:apps|scripts|packages|docs|examples|\.tmp)[/\\][A-Za-z0-9._/\\:-]+/g) || [];
  return Array.from(new Set(matches.map((item) => item.replace(/\\/g, '/')))).slice(0, 12);
}

function buildGrokObservation(args, setup, executionResult) {
  const launchStep = executionResult?.steps?.find((step) => step.id === 'launch-grok-build');
  if (!launchStep) return null;
  const output = [launchStep.stdout, launchStep.stderr]
    .map(cleanGrokOutput)
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!output) return null;
  const findings = extractFindings(output);
  const filesReferenced = extractFilesReferenced(output);
  const lower = output.toLowerCase();
  const trustSignals = ['ready', 'pass', 'trusted', 'approval', 'receipt', 'source', 'blocked']
    .filter((signal) => lower.includes(signal));

  return {
    observationId: id('hsgo-grok-build', args.prompt || 'headless'),
    schemaVersion: 'hololand.holoshell.grok-observation.v0.1.0',
    generatedAt: nowIso(),
    agentLane: 'grok-build',
    actor: args.actor,
    peerInvocation: true,
    sourceAnchors: {
      source: SOURCE_REF,
      adapter: SCRIPT_REF,
    },
    request: {
      mode: normalizeMode(args.mode),
      model: args.model,
      promptHash: promptDigest(args.prompt || DEFAULT_HEADLESS_PROMPT).sha256,
      permissionMode: args.permissionMode || 'plan',
      shellContextAttached: false,
    },
    execution: {
      ok: Boolean(launchStep.ok),
      exitCode: launchStep.exitCode,
      startedAt: launchStep.startedAt,
      finishedAt: launchStep.finishedAt,
      outputHash: createHash('sha256').update(output).digest('hex'),
      outputPreview: output.slice(0, 1600),
      stderrPreview: String(launchStep.stderr || '').slice(0, 600),
    },
    findings,
    filesReferenced,
    trustSignals,
    summary: {
      status: launchStep.ok ? 'completed' : 'failed',
      agentLane: 'grok-build',
      findingCount: findings.length,
      fileReferenceCount: filesReferenced.length,
      primaryFinding: findings[0] || output.slice(0, 220),
      model: args.model,
      cliVersion: setup.summary.cliVersion,
      heavyAccessStatus: setup.summary.heavyAccessStatus || 'unknown',
      projectTrustStatus: setup.summary.projectTrustStatus || 'unknown',
    },
  };
}

function buildSteps(args, setup, executionResult = null) {
  const commandParts = grokCommandParts(args, setup);
  const commandPreview = commandParts
    .map((part, index) => (index > 0 && args.prompt && part === args.prompt ? '<local prompt>' : part))
    .join(' ');
  const promptInfo = promptDigest(args.prompt || (normalizeMode(args.mode) === 'headless' ? DEFAULT_HEADLESS_PROMPT : ''));
  const stepResults = new Map((executionResult?.steps || []).map((step) => [step.id, step]));
  const cliReady = setup.summary.cliStatus === 'installed';
  const authReady = setup.summary.authStatus === 'present' || setup.summary.authRuntimeStatus === 'authenticated';
  const modelReady = setup.models.requestedModelAvailable || setup.models.defaultModel === args.model;

  const steps = [
    {
      id: 'resolve-grok-build-cli',
      title: 'Resolve Grok Build CLI',
      kind: 'read_only',
      status: cliReady ? 'resolved' : 'failed',
      approvalRequired: false,
      mutation: false,
      targetResolved: cliReady,
      evidence: {
        cliPath: setup.cli.path,
        pathSource: setup.cli.pathSource,
        version: setup.summary.cliVersion,
        pathSeenOnCurrentProcess: setup.summary.pathSeenOnCurrentProcess,
      },
    },
    {
      id: 'verify-grok-auth',
      title: 'Verify Grok auth without reading token contents',
      kind: 'read_only',
      status: authReady ? 'resolved' : 'failed',
      approvalRequired: false,
      mutation: false,
      targetResolved: authReady,
      evidence: {
        authStatus: setup.summary.authStatus,
        authRuntimeStatus: setup.summary.authRuntimeStatus || 'unknown',
        authProvider: setup.summary.authProvider || '',
        authFilePresent: setup.auth.authFilePresent,
        contentsRead: false,
      },
    },
    {
      id: 'verify-grok-build-model',
      title: 'Verify Grok Build model access',
      kind: 'read_only',
      status: modelReady ? 'resolved' : 'failed',
      approvalRequired: false,
      mutation: false,
      targetResolved: modelReady,
      evidence: {
        requestedModel: args.model,
        defaultModel: setup.summary.defaultModel,
        availableModels: setup.models.availableModels,
      },
    },
    {
      id: 'inspect-project-trust',
      title: 'Inspect project trust and hook readiness',
      kind: 'read_only',
      status: setup.summary.projectTrusted ? 'resolved' : 'needs_attention',
      approvalRequired: false,
      mutation: false,
      targetResolved: true,
      evidence: {
        trusted: setup.summary.projectTrusted,
        trustStatus: setup.summary.projectTrustStatus,
        hookCount: setup.summary.projectHookCount,
        skippedPermissionCount: setup.summary.skippedPermissionCount,
      },
    },
    {
      id: 'launch-grok-build',
      title: normalizeMode(args.mode) === 'headless' ? 'Run Grok Build single-turn prompt' : 'Launch Grok Build TUI',
      kind: 'guarded_local_action',
      status: 'approval_required',
      approvalRequired: true,
      mutation: true,
      targetResolved: cliReady && authReady && modelReady,
      action: {
        type: 'terminal_command',
        mode: normalizeMode(args.mode),
        command: commandParts,
        commandPreview,
        visibility: 'foreground_terminal',
      },
      safety: {
        requiresUserVisibleSurface: true,
        shellContextAttached: false,
        promptBodyStoredLocallyOnly: true,
        permissionMode: normalizeMode(args.mode) === 'headless' ? args.permissionMode || 'plan' : 'default',
      },
      prompt: promptInfo,
    },
  ];

  return steps.map((step) => {
    const result = stepResults.get(step.id);
    if (!result) return step;
    return {
      ...step,
      status: result.status,
      execution: {
        ok: result.ok,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        exitCode: result.exitCode,
        stderr: result.stderr,
      },
    };
  });
}

function workflowSummary(args, setup, steps, executionResult = null) {
  const guarded = steps.filter((step) => step.approvalRequired);
  const pending = steps.filter((step) => step.status === 'approval_required');
  const failed = steps.filter((step) => step.status === 'failed');
  const targetResolved = steps.filter((step) => step.targetResolved).length;
  const mutationExecuted = Boolean(executionResult?.mutationExecuted);
  const promptInfo = promptDigest(args.prompt || (normalizeMode(args.mode) === 'headless' ? DEFAULT_HEADLESS_PROMPT : ''));
  const commandParts = grokCommandParts(args, setup);

  return {
    status: mutationExecuted
      ? failed.length
        ? 'execution_failed'
        : 'completed'
      : pending.length
        ? 'pending_user_approval'
        : 'staged',
    workflowKind: 'grok_build',
    stepCount: steps.length,
    guardedStepCount: guarded.length,
    pendingApprovalCount: pending.length,
    stageErrorCount: failed.length,
    targetResolvedCount: targetResolved,
    actor: args.actor,
    mode: normalizeMode(args.mode),
    model: args.model,
    defaultModel: setup.summary.defaultModel,
    cliVersion: setup.summary.cliVersion,
    cliPath: setup.cli.path,
    authStatus: setup.summary.authStatus,
    authRuntimeStatus: setup.summary.authRuntimeStatus || 'unknown',
    authProvider: setup.summary.authProvider || '',
    projectTrusted: setup.summary.projectTrusted,
    projectTrustStatus: setup.summary.projectTrustStatus,
    operatorStatus: setup.summary.operatorStatus || 'unknown',
    autonomyStatus: setup.summary.autonomyStatus || 'unknown',
    promptPresent: promptInfo.present,
    promptHash: promptInfo.sha256,
    promptLength: promptInfo.length,
    permissionMode: normalizeMode(args.mode) === 'headless' ? args.permissionMode || 'plan' : 'default',
    sandbox: args.sandbox || '',
    command: commandParts[0],
    commandPreview: commandParts
      .map((part, index) => (index > 0 && args.prompt && part === args.prompt ? '<local prompt>' : part))
      .join(' '),
    shellContextAttachedByDefault: false,
    mutationExecuted,
    executionStartedAt: executionResult?.startedAt || null,
    executionFinishedAt: executionResult?.finishedAt || null,
    peerInvocation: Boolean(executionResult?.grokObservation),
    grokObservationStatus: executionResult?.grokObservation?.summary?.status || '',
    grokObservationPrimaryFinding: executionResult?.grokObservation?.summary?.primaryFinding || '',
    grokObservationFindingCount: executionResult?.grokObservation?.summary?.findingCount || 0,
  };
}

function buildWorkflow(args, setup, executionResult = null) {
  const workflowId = id('hswf-grok-build', `${args.mode}:${args.model}:${args.prompt || 'interactive'}`);
  const steps = buildSteps(args, setup, executionResult);
  const summary = workflowSummary(args, setup, steps, executionResult);
  const generatedAt = nowIso();

  return {
    schema: WORKFLOW_SCHEMA,
    workflowId,
    profile: 'grok_build',
    title: summary.mode === 'headless' ? 'Grok Build Inspection' : 'Grok Build',
    createdAt: generatedAt,
    generatedAt,
    actor: args.actor,
    status: summary.status,
    description:
      'Guarded HoloShell workflow for launching Grok Build as a local coding-agent lane.',
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareControl: HARDWARE_SOURCE_REF,
      adapter: SCRIPT_REF,
    },
    policy: {
      executionDefault: 'staged_until_user_approval',
      shellContextAttachedByDefault: false,
      terminalLaunchRequiresApproval: true,
      promptBodyStoredLocallyOnly: true,
      projectHooksTrustedRequiredForHookReliance: true,
      autoApproveDisabledByDefault: true,
    },
    request: {
      mode: summary.mode,
      model: args.model,
      prompt: args.prompt || (summary.mode === 'headless' ? DEFAULT_HEADLESS_PROMPT : ''),
      cwd: args.cwd,
      effort: args.effort,
      reasoningEffort: args.reasoningEffort,
      permissionMode: summary.permissionMode,
      sandbox: args.sandbox,
      maxTurns: args.maxTurns,
      disableWebSearch: args.disableWebSearch,
      noSubagents: args.noSubagents,
      noMemory: args.noMemory,
      continueSession: args.continueSession,
    },
    setup: {
      setupId: setup.setupId,
      status: setup.summary.status,
      cliVersion: setup.summary.cliVersion,
      authStatus: setup.summary.authStatus,
      modelStatus: setup.summary.modelStatus,
      projectTrusted: setup.summary.projectTrusted,
      warningCount: setup.summary.warningCount,
    },
    ...(executionResult?.grokObservation ? { grokObservation: executionResult.grokObservation } : {}),
    steps,
    summary,
  };
}

function approvalCommand(bundlePath, approvalId, nonce) {
  return [
    'node',
    SCRIPT_REF,
    '--workflow-approval-bundle',
    bundlePath,
    '--workflow-approval-id',
    approvalId,
    '--workflow-approval-nonce',
    nonce,
    '--execute-workflow',
  ];
}

function buildApprovalBundle(args, workflow) {
  const approvalId = id('hswap-grok-build', workflow.workflowId);
  const nonce = randomBytes(16).toString('hex');
  const generatedAt = nowIso();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const bundlePath = join(args.approvalDir, `${approvalId}.json`);
  const command = approvalCommand(bundlePath, approvalId, nonce);
  const guardedSteps = workflow.steps.filter((step) => step.approvalRequired);
  const allowed =
    workflow.summary.pendingApprovalCount > 0 &&
    workflow.summary.stageErrorCount === 0 &&
    workflow.summary.targetResolvedCount === workflow.summary.stepCount &&
    !workflow.summary.mutationExecuted;

  return {
    schema: APPROVAL_SCHEMA,
    approvalId,
    workflowId: workflow.workflowId,
    createdAt: generatedAt,
    generatedAt,
    expiresAt,
    status: allowed ? 'pending_user_approval' : 'blocked',
    actor: args.actor,
    nonce,
    sourceAnchors: workflow.sourceAnchors,
    approvalRequest: {
      title: workflow.summary.mode === 'headless' ? 'Run Grok Build inspection' : 'Open Grok Build',
      intent: workflow.summary.mode === 'headless'
        ? 'Run a single Grok Build prompt in a visible terminal.'
        : 'Open Grok Build in a visible terminal for this repository.',
      riskLevel: workflow.summary.mode === 'headless' ? 'medium' : 'high',
      localMutation: true,
      shellContextAttached: false,
      projectTrusted: workflow.summary.projectTrusted,
      pendingStepIds: guardedSteps.map((step) => step.id),
      model: workflow.summary.model,
      promptHash: workflow.summary.promptHash,
      promptLength: workflow.summary.promptLength,
      permissionMode: workflow.summary.permissionMode,
    },
    workflowRequest: workflow.request,
    execution: {
      allowed,
      bundlePath,
      command,
      commandPreview: command.join(' '),
      workingDirectory: repoRoot,
      nonce,
      blockedReasons: allowed
        ? []
        : ['Grok Build CLI, auth, or requested model was not resolved. Restage after setup is complete.'],
    },
    warnings: workflow.summary.projectTrusted
      ? []
      : ['Grok reports this project as untrusted; project hooks will not run until /hooks-trust is approved in Grok.'],
    summary: {
      status: allowed ? 'pending_user_approval' : 'blocked',
      workflowId: workflow.workflowId,
      title: workflow.title,
      expiresAt,
      executionAllowed: allowed,
      pendingApprovalCount: workflow.summary.pendingApprovalCount,
      targetResolvedCount: workflow.summary.targetResolvedCount,
      stepCount: workflow.summary.stepCount,
      mutationExecuted: workflow.summary.mutationExecuted,
      shellContextAttachedByDefault: false,
      workflowKind: workflow.summary.workflowKind,
      mode: workflow.summary.mode,
      model: workflow.summary.model,
      projectTrusted: workflow.summary.projectTrusted,
      promptPresent: workflow.summary.promptPresent,
      warningCount: workflow.summary.projectTrusted ? 0 : 1,
    },
  };
}

function buildLocalGate(args, workflow) {
  const allowed =
    workflow.summary.stageErrorCount === 0 &&
    workflow.summary.targetResolvedCount === workflow.summary.stepCount &&
    !workflow.summary.mutationExecuted;
  const blockedReason = allowed
    ? ''
    : 'Grok Build workflow is not fully staged. Restage after CLI/auth/model readiness passes.';
  return {
    schemaVersion: GATE_SCHEMA,
    generatedAt: nowIso(),
    gateId: id('hsbig-grok-build', workflow.workflowId),
    sourceAnchors: {
      source: SOURCE_REF,
      hardwareControl: HARDWARE_SOURCE_REF,
      adapter: SCRIPT_REF,
    },
    gate: {
      label: 'holoshell_grok_build_local_approval',
      allowed,
      status: allowed ? 'allow' : 'block',
      runtimeBlocking: false,
      blockedReason,
      failedCheckIds: allowed ? [] : ['grok_build_setup_not_ready'],
      warningIds: workflow.summary.projectTrusted ? [] : ['grok_project_untrusted'],
    },
    summary: {
      status: allowed ? 'not_required' : 'blocked',
      executionAllowed: allowed,
      runtimeBlocking: false,
      caseId: GATE_CASE_ID,
      receiptStatus: 'local_approval_gate',
      score: allowed ? 1 : 0,
      passed: allowed ? 1 : 0,
      total: 1,
      failedCheckCount: allowed ? 0 : 1,
      blockedReason,
      workflowKind: workflow.summary.workflowKind,
      workflowId: workflow.workflowId,
      mode: workflow.summary.mode,
      model: workflow.summary.model,
      projectTrusted: workflow.summary.projectTrusted,
    },
    output: {
      latestPath: args.gateOutput,
      browserBootstrap: args.gateJsOutput,
      sourceReceiptPath: '',
    },
  };
}

function hydrateArgsFromBundle(args) {
  if (!args.workflowApprovalBundle) {
    throw new Error('--execute-workflow requires --workflow-approval-bundle');
  }
  const bundlePath = resolve(repoRoot, args.workflowApprovalBundle);
  if (!existsSync(bundlePath)) throw new Error(`Workflow approval bundle not found: ${bundlePath}`);
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  if (bundle.schema !== APPROVAL_SCHEMA) throw new Error(`Unsupported approval schema: ${bundle.schema}`);
  if (bundle.approvalId !== args.workflowApprovalId) throw new Error('Workflow approval id mismatch.');
  if (bundle.execution?.nonce !== args.workflowApprovalNonce) throw new Error('Workflow approval nonce mismatch.');
  if (bundle.execution?.allowed !== true) {
    throw new Error(`Workflow approval is not executable: ${(bundle.execution?.blockedReasons || []).join('; ')}`);
  }
  if (Date.parse(bundle.expiresAt) < Date.now()) {
    throw new Error('Workflow approval bundle expired. Restage the workflow.');
  }
  return {
    ...args,
    actor: bundle.actor || args.actor,
    mode: bundle.workflowRequest?.mode || args.mode,
    model: bundle.workflowRequest?.model || args.model,
    prompt: bundle.workflowRequest?.prompt || args.prompt,
    cwd: bundle.workflowRequest?.cwd || args.cwd,
    effort: bundle.workflowRequest?.effort || args.effort,
    reasoningEffort: bundle.workflowRequest?.reasoningEffort || args.reasoningEffort,
    permissionMode: bundle.workflowRequest?.permissionMode || args.permissionMode,
    sandbox: bundle.workflowRequest?.sandbox || args.sandbox,
    maxTurns: bundle.workflowRequest?.maxTurns || args.maxTurns,
    disableWebSearch: Boolean(bundle.workflowRequest?.disableWebSearch),
    noSubagents: Boolean(bundle.workflowRequest?.noSubagents),
    noMemory: Boolean(bundle.workflowRequest?.noMemory),
    continueSession: Boolean(bundle.workflowRequest?.continueSession),
    hydratedApproval: {
      approvalId: bundle.approvalId,
      workflowId: bundle.workflowId,
      bundlePath,
    },
  };
}

function runPowerShell(command, options = {}) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.timeoutMs || 15000,
      env: grokChildEnv(),
    },
  );
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function executeTerminalCommand(command) {
  const encoded = Buffer.from(command, 'utf8').toString('base64');
  const ps = [
    `$bytes = [Convert]::FromBase64String(${psString(encoded)})`,
    '$cmd = [System.Text.Encoding]::UTF8.GetString($bytes)',
    "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit','-NoProfile','-Command',$cmd)",
  ].join('; ');
  return runPowerShell(ps, { timeoutMs: 12000 });
}

function executeHeadlessCommand(commandParts, args) {
  const [command, ...commandArgs] = commandParts;
  return runCommand(command, commandArgs, {
    cwd: args.cwd || repoRoot,
    timeoutMs: 180000,
  });
}

function executeWorkflow(args, setup) {
  const startedAt = nowIso();
  const steps = buildSteps(args, setup);
  const executedSteps = [];
  let mutationExecuted = false;

  for (const step of steps) {
    if (!step.approvalRequired) {
      executedSteps.push({
        id: step.id,
        ok: step.targetResolved,
        status: step.targetResolved ? step.status : 'failed',
        startedAt: nowIso(),
        finishedAt: nowIso(),
        exitCode: step.targetResolved ? 0 : 1,
        stderr: step.targetResolved ? '' : `${step.title} did not resolve.`,
      });
      if (!step.targetResolved) break;
      continue;
    }

    const stepStarted = nowIso();
    const result = step.action?.mode === 'headless'
      ? executeHeadlessCommand(step.action.command, args)
      : executeTerminalCommand(psCommand(step.action.command));
    mutationExecuted = mutationExecuted || result.ok;
    executedSteps.push({
      id: step.id,
      ok: result.ok,
      status: result.ok ? 'completed' : 'failed',
      startedAt: stepStarted,
      finishedAt: nowIso(),
      exitCode: result.exitCode,
      stdout: String(result.stdout || '').trim().slice(0, 8000),
      stderr: String(result.stderr || '').trim().slice(0, 1200),
    });
    if (!result.ok) break;
  }

  const executionResult = {
    startedAt,
    finishedAt: nowIso(),
    mutationExecuted,
    steps: executedSteps,
    approval: args.hydratedApproval || null,
  };
  executionResult.grokObservation = buildGrokObservation(args, setup, executionResult);
  return executionResult;
}

function persistSetup(args, setup) {
  writeJson(args.setupOutput, setup);
  writeJs(args.setupJsOutput, 'HOLOSHELL_GROK_BUILD_SETUP', setup);
}

function persist(args, setup, workflow, approvalBundle = null, gate = null) {
  persistSetup(args, setup);
  writeJson(args.output, workflow);
  writeJs(args.jsOutput, 'HOLOSHELL_WORKFLOW', workflow);
  ensureDir(args.workflowDir);
  writeJson(join(args.workflowDir, `${workflow.workflowId}.json`), workflow);

  if (gate) {
    writeJson(args.gateOutput, gate);
    writeJs(args.gateJsOutput, 'HOLOSHELL_BRAIN_INTENT_GATE', gate);
  }

  if (approvalBundle) {
    writeJson(args.approvalOutput, approvalBundle);
    writeJs(args.approvalJsOutput, 'HOLOSHELL_WORKFLOW_APPROVAL', approvalBundle);
    writeJson(
      approvalBundle.execution?.bundlePath || join(args.approvalDir, `${approvalBundle.approvalId}.json`),
      approvalBundle,
    );
  }
}

function selfTest() {
  const args = parseArgs(['--prompt', 'Inspect HoloShell readiness', '--permission-mode', 'plan', '--json']);
  const setup = buildSetup(args);
  const workflow = buildWorkflow(args, setup);
  const approval = buildApprovalBundle(args, workflow);
  const gate = buildLocalGate(args, workflow);
  const fixtureExecution = {
    startedAt: nowIso(),
    finishedAt: nowIso(),
    mutationExecuted: true,
    steps: [
      {
        id: 'launch-grok-build',
        ok: true,
        status: 'completed',
        startedAt: nowIso(),
        finishedAt: nowIso(),
        exitCode: 0,
        stdout: '- HoloShell Grok lane is ready.\n- scripts/holoshell-grok-build-workflow.mjs captures a peer observation receipt.',
        stderr: '',
      },
    ],
    approval: null,
  };
  fixtureExecution.grokObservation = buildGrokObservation(args, setup, fixtureExecution);
  const completedWorkflow = buildWorkflow(args, setup, fixtureExecution);
  const failures = [];

  if (setup.schemaVersion !== SETUP_SCHEMA) failures.push('setup schema mismatch');
  if (setup.summary.cliStatus !== 'installed') failures.push('expected Grok CLI to be installed');
  if (setup.summary.authStatus !== 'present') failures.push('expected Grok auth to be present');
  if (setup.summary.modelStatus !== 'available') failures.push('expected grok-build model access');
  if (workflow.schema !== WORKFLOW_SCHEMA) failures.push('workflow schema mismatch');
  if (workflow.summary.workflowKind !== 'grok_build') failures.push('workflow kind mismatch');
  if (workflow.summary.mode !== 'headless') failures.push('workflow mode mismatch');
  if (!workflow.steps.some((step) => step.id === 'launch-grok-build')) failures.push('missing launch step');
  if (approval.schema !== APPROVAL_SCHEMA) failures.push('approval schema mismatch');
  if (!approval.execution.allowed) failures.push('approval should be executable on this host');
  if (approval.execution.command.some((part) => String(part).includes('room-marathon'))) {
    failures.push('approval command leaked room-marathon workflow');
  }
  if (gate.summary.caseId !== GATE_CASE_ID) failures.push('gate case mismatch');
  if (gate.summary.runtimeBlocking) failures.push('Grok Build should use local approval gate');
  if (!completedWorkflow.grokObservation) failures.push('expected completed workflow to carry Grok observation');
  if (completedWorkflow.summary.grokObservationFindingCount < 1) failures.push('expected Grok observation findings');

  return {
    ok: failures.length === 0,
    failures,
    setup,
    workflow,
    completedWorkflow,
    approval,
    gate,
  };
}

function main() {
  let args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const result = selfTest();
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? 'Grok Build workflow self-test passed.' : result.failures.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }

  let setup = buildSetup(args);
  if (args.setupOnly) {
    persistSetup(args, setup);
    if (args.json) console.log(JSON.stringify(setup, null, 2));
    else {
      console.log(`Grok Build setup ${setup.summary.status}: CLI ${setup.summary.cliVersion}; auth ${setup.summary.authStatus}; model ${setup.summary.modelStatus}; project ${setup.summary.projectTrustStatus}.`);
    }
    return;
  }

  let executionResult = null;
  if (args.executeWorkflow) {
    args = hydrateArgsFromBundle(args);
    setup = buildSetup(args);
    executionResult = executeWorkflow(args, setup);
  }

  const workflow = buildWorkflow(args, setup, executionResult);
  const approval = executionResult ? null : buildApprovalBundle(args, workflow);
  const gate = buildLocalGate(args, workflow);
  persist(args, setup, workflow, approval, gate);

  const result = {
    ok: workflow.summary.stageErrorCount === 0,
    setup,
    workflow,
    approval,
    gate,
    outputs: {
      setup: args.setupOutput,
      setupJs: args.setupJsOutput,
      workflow: args.output,
      workflowJs: args.jsOutput,
      approval: approval ? args.approvalOutput : null,
      approvalJs: approval ? args.approvalJsOutput : null,
      gate: args.gateOutput,
      gateJs: args.gateJsOutput,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `${workflow.title} ${workflow.status}: ${workflow.summary.mode}; ${workflow.summary.pendingApprovalCount} approval(s) pending; setup ${setup.summary.status}`,
    );
  }

  process.exit(result.ok ? 0 : 1);
}

main();
