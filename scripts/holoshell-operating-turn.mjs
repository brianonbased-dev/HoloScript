#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.operating-turn.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'operating-turn.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'operating-turn.js');
const PACKAGE_RUNNER = 'pnpm';

const TURN_STEPS = [
  { stepId: 'run_registry_reconcile', label: 'Run Registry Reconcile', script: 'holoshell:run-registry-reconcile' },
  { stepId: 'process_health', label: 'Process Health', script: 'holoshell:process-health' },
  { stepId: 'hardware_reality', label: 'Hardware Reality', script: 'holoshell:hardware-reality' },
  { stepId: 'legacy_windows', label: 'Legacy Windows', script: 'holoshell:legacy-windows' },
  { stepId: 'build_custody', label: 'Build Custody', script: 'holoshell:build-custody' },
  { stepId: 'run_custody', label: 'Run Custody', script: 'holoshell:run-custody' },
  { stepId: 'legacy_apps', label: 'Legacy Apps', script: 'holoshell:legacy-apps' },
  { stepId: 'readiness_evidence', label: 'Readiness Evidence', script: 'holoshell:readiness-evidence' },
  { stepId: 'operator_brief_pre_action', label: 'Operator Brief Before Brittney', script: 'holoshell:operator-brief' },
  { stepId: 'shell_objects', label: 'Shell Objects', script: 'holoshell:shell-objects' },
  { stepId: 'brittney_context', label: 'Brittney Context Packet', script: 'holoshell:brittney-context' },
  { stepId: 'brittney_custody', label: 'Brittney Custody Turn', script: 'holoshell:brittney-custody' },
  { stepId: 'run_custody_after', label: 'Run Custody After Brittney', script: 'holoshell:run-custody' },
  { stepId: 'build_custody_after', label: 'Build Custody After Brittney', script: 'holoshell:build-custody' },
  { stepId: 'operator_brief_after', label: 'Operator Brief After Brittney', script: 'holoshell:operator-brief' },
  { stepId: 'visual_witness', label: 'Visual Witness', script: 'holoshell:visual-witness', optional: true },
];

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    continueOnFailure: true,
    skipVisualWitness: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--continue-on-failure') args.continueOnFailure = true;
    else if (arg === '--stop-on-failure') args.continueOnFailure = false;
    else if (arg === '--skip-visual-witness') args.skipVisualWitness = true;
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
  console.log(`HoloShell operating turn

Usage:
  node scripts/holoshell-operating-turn.mjs [options]

Options:
  --output <path>            Output JSON. Default: .tmp/holoshell/operating-turn.json.
  --js-output <path>         Browser bootstrap JS. Default: .tmp/holoshell/operating-turn.js.
  --continue-on-failure      Keep collecting evidence if one step fails. Default.
  --stop-on-failure          Stop after first failed step.
  --skip-visual-witness      Skip screenshot/browser witness.
  --json                     Print JSON.
  --self-test                Use synthetic fixtures and assert invariants.
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

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function tailLines(value, count = 8) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count);
}

function readOptionalJson(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return null;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function stepList(args) {
  return TURN_STEPS.filter((step) => !(args.skipVisualWitness && step.stepId === 'visual_witness'));
}

function runStep(step) {
  const startedAt = Date.now();
  const result = process.platform === 'win32'
    ? spawnSync(`${PACKAGE_RUNNER} run ${step.script}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 24 * 1024 * 1024,
      shell: true,
    })
    : spawnSync(PACKAGE_RUNNER, ['run', step.script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 24 * 1024 * 1024,
      shell: false,
    });
  const durationMs = Date.now() - startedAt;
  const exitCode = typeof result.status === 'number' ? result.status : result.error ? 1 : 0;
  const status = exitCode === 0 ? 'pass' : step.optional ? 'optional_failed' : 'fail';
  return {
    stepId: step.stepId,
    label: step.label,
    script: step.script,
    status,
    exitCode,
    durationMs,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
    error: result.error?.message || null,
  };
}

function syntheticStepResults(args) {
  return stepList(args).map((step, index) => ({
    stepId: step.stepId,
    label: step.label,
    script: step.script,
    status: 'pass',
    exitCode: 0,
    durationMs: 10 + index,
    stdoutTail: [`${step.label} fixture complete`],
    stderrTail: [],
    error: null,
  }));
}

function loadEvidence() {
  return {
    runRegistryReconcile: readOptionalJson(path.join('.tmp', 'holoshell', 'run-registry-reconcile.json')),
    buildCustody: readOptionalJson(path.join('.tmp', 'holoshell', 'build-custody.json')),
    operatorBrief: readOptionalJson(path.join('.tmp', 'holoshell', 'operator-brief.json')),
    brittneyContext: readOptionalJson(path.join('.tmp', 'holoshell', 'brittney-context.json')),
    readinessEvidence: readOptionalJson(path.join('.tmp', 'holoshell', 'readiness-evidence.json')),
    visualWitness: readOptionalJson(path.join('.tmp', 'holoshell', 'visual-witness.json')),
  };
}

function summarizeEvidence(evidence) {
  const reconcile = evidence.runRegistryReconcile || {};
  const build = evidence.buildCustody || {};
  const operator = evidence.operatorBrief || {};
  const brittneyContext = evidence.brittneyContext || {};
  const readiness = evidence.readinessEvidence || {};
  const witness = evidence.visualWitness || {};
  return {
    buildRisk: build.summary?.riskState || 'unknown',
    runRegistryReconciledRunCount: reconcile.summary?.reconciledRunCount || 0,
    runRegistryActiveRunCount: reconcile.registry?.activeRunCountAfter || 0,
    activeBuildTreeCount: build.summary?.activeBuildTreeCount || 0,
    buildProcessCount: build.summary?.buildProcessCount || 0,
    operatorStatus: operator.status || 'unknown',
    ownerUnknownRunCount: operator.runs?.ownerUnknownCount || 0,
    shellWindowOwnerUnknownRunCount: operator.shellCustody?.ownerUnknownRunCount || 0,
    brittneyContextStatus: brittneyContext.summary?.status || 'unknown',
    brittneyContextPeerWindowCount: brittneyContext.summary?.peerWindowCount || operator.peers?.windowInstanceCount || 0,
    brittneyContextShellWindowCount: brittneyContext.summary?.shellWindowCount || operator.peers?.shellWindowInstanceCount || 0,
    brittneyContextVisibleShellObjectCount: brittneyContext.summary?.visibleShellObjectCount || 0,
    readinessStatus: readiness.summary?.status || readiness.status || 'unknown',
    readinessTokenCount: readiness.summary?.tokenCount || 0,
    readinessWarningCount: readiness.summary?.warningCount || 0,
    visualWitnessStatus: witness.status || 'unknown',
    visualWitnessScreenshot: witness.screenshot?.path || null,
  };
}

function createTurn(stepResults, args, evidence = loadEvidence()) {
  const failedSteps = stepResults.filter((step) => step.status === 'fail');
  const optionalFailedSteps = stepResults.filter((step) => step.status === 'optional_failed');
  const summaryEvidence = summarizeEvidence(evidence);
  const status = failedSteps.length ? 'fail' : optionalFailedSteps.length ? 'warn' : 'pass';
  const summary = {
    status,
    stepCount: stepResults.length,
    passedStepCount: stepResults.filter((step) => step.status === 'pass').length,
    failedStepCount: failedSteps.length,
    optionalFailedStepCount: optionalFailedSteps.length,
    durationMs: stepResults.reduce((sum, step) => sum + (step.durationMs || 0), 0),
    continueOnFailure: args.continueOnFailure,
    ...summaryEvidence,
  };
  const safety = {
    destructiveActionsTaken: false,
    rawCommandsIncluded: false,
    legacyMutationAllowed: false,
    processTerminationAllowed: false,
  };
  const receiptInput = {
    summary,
    steps: stepResults.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...step }) => step),
    safety,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-operating-turn.hsplus',
      adapter: 'scripts/holoshell-operating-turn.mjs',
      operatorBrief: 'scripts/holoshell-operator-brief.mjs',
      brittneyContext: 'scripts/holoshell-brittney-context.mjs',
      buildCustody: 'scripts/holoshell-build-custody.mjs',
      runRegistryReconcile: 'scripts/holoshell-run.mjs --reconcile-registry',
      readinessEvidence: 'scripts/holoshell-readiness-evidence.mjs',
    },
    summary,
    steps: stepResults,
    nextAction: summary.operatorStatus === 'needs_run_custody'
      ? 'Let Brittney continue custody triage from operator brief.'
      : summary.brittneyContextStatus === 'unknown'
        ? 'Refresh Brittney context before trusting local operator proposals.'
        : summary.activeBuildTreeCount > 0
          ? 'Keep active build tree under read-only observation until it exits or crosses review thresholds.'
          : 'Use the refreshed operator brief as the next local hardware truth source.',
    brittneyBrief: {
      status: summary.operatorStatus,
      context: `${summary.brittneyContextStatus}; ${summary.brittneyContextVisibleShellObjectCount} visible shell object(s); ${summary.brittneyContextPeerWindowCount} peer window(s), ${summary.brittneyContextShellWindowCount} shell window(s).`,
      runRegistry: `${summary.runRegistryReconciledRunCount} reconciled stale registry run(s), ${summary.runRegistryActiveRunCount} active registry run(s) after reconcile.`,
      buildCustody: `${summary.activeBuildTreeCount} active build tree(s), ${summary.buildProcessCount} process(es), risk ${summary.buildRisk}.`,
      readiness: `${summary.readinessStatus}, ${summary.readinessTokenCount} evidence token(s), ${summary.readinessWarningCount} warning(s).`,
      visualWitness: `${summary.visualWitnessStatus}${summary.visualWitnessScreenshot ? ' with screenshot' : ''}.`,
      blockedActions: ['kill_process', 'kill_build_process', 'legacy_app_mutation', 'delete_file'],
    },
    safety,
    agentConsumption: {
      rest: '.tmp/holoshell/operating-turn.json',
      browserBootstrap: '.tmp/holoshell/operating-turn.js',
      requiredRefreshOrder: stepList(args).map((step) => step.script),
    },
    receipt: {
      operatingTurnHash: sha256(JSON.stringify(receiptInput)),
      destructiveActionsTaken: false,
      rawCommandsIncluded: false,
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
  writeFileSync(resolved, `window.HOLOSHELL_OPERATING_TURN = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(turn) {
  const failures = [];
  if (turn.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (turn.summary.stepCount < 10) failures.push('expected full operating step list');
  if (turn.summary.failedStepCount !== 0) failures.push('self-test should not fail steps');
  if (!turn.agentConsumption.requiredRefreshOrder.includes('holoshell:build-custody')) failures.push('missing build custody step');
  if (!turn.agentConsumption.requiredRefreshOrder.includes('holoshell:run-registry-reconcile')) failures.push('missing run registry reconcile step');
  if (!turn.agentConsumption.requiredRefreshOrder.includes('holoshell:brittney-context')) failures.push('missing Brittney context step');
  if (!turn.agentConsumption.requiredRefreshOrder.includes('holoshell:readiness-evidence')) failures.push('missing readiness evidence step');
  if (!turn.brittneyBrief.blockedActions.includes('kill_build_process')) failures.push('build kill must be blocked');
  if (turn.safety.destructiveActionsTaken !== false) failures.push('destructive actions must be false');
  if (turn.safety.rawCommandsIncluded !== false) failures.push('raw commands must be hidden');
  if (!turn.receipt.operatingTurnHash) failures.push('missing operating turn hash');
  const serialized = JSON.stringify(turn);
  if (/commandLine|CommandLine|pnpm run/.test(serialized)) failures.push('raw command text leaked');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest && args.output === DEFAULT_OUTPUT) {
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'operating-turn.json');
  }
  if (args.selfTest && args.jsOutput === DEFAULT_JS_OUTPUT) {
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'operating-turn.js');
  }
  const steps = [];
  if (args.selfTest) {
    steps.push(...syntheticStepResults(args));
  } else {
    for (const step of stepList(args)) {
      const result = runStep(step);
      steps.push(result);
      if (result.status === 'fail' && !args.continueOnFailure) break;
    }
  }

  const turn = createTurn(steps, args);
  if (args.selfTest) assertSelfTest(turn);
  const output = writeJson(args.output, turn);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, turn);

  if (args.json) {
    console.log(JSON.stringify(turn, null, 2));
  } else {
    console.log(`HoloShell operating turn: ${output}`);
    console.log(`HoloShell operating turn browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${turn.summary.status}`);
    console.log(`Steps: ${turn.summary.passedStepCount}/${turn.summary.stepCount} passed`);
    console.log(`Registry reconciled: ${turn.summary.runRegistryReconciledRunCount}`);
    console.log(`Registry active after reconcile: ${turn.summary.runRegistryActiveRunCount}`);
    console.log(`Active build trees: ${turn.summary.activeBuildTreeCount}`);
    console.log(`Operator status: ${turn.summary.operatorStatus}`);
    console.log(`Readiness: ${turn.summary.readinessStatus}`);
    console.log(`Visual witness: ${turn.summary.visualWitnessStatus}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-operating-turn failed: ${error.message}`);
  process.exit(1);
}
