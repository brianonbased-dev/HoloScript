#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { cpus, freemem, homedir, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const PREREG_PATH = resolve(HERE, 'preregistration.json');
const AMENDMENT_PATH = resolve(HERE, 'preregistration-amendment-001.json');
const RECEIPT_PATH = resolve(HERE, 'receipt.json');
const RECEIPT_HASH_PATH = resolve(HERE, 'receipt.sha256');
const SCRATCH_ROOT = resolve(REPO_ROOT, '.scratch', '2026-07-17-pp001-living-artifact');
const COREPACK_JS = resolve(
  dirname(process.execPath),
  'node_modules',
  'corepack',
  'dist',
  'corepack.js'
);

const PREREG = JSON.parse(readFileSync(PREREG_PATH, 'utf8'));
const AMENDMENT = JSON.parse(readFileSync(AMENDMENT_PATH, 'utf8'));
const STATE_IDS = ['A', 'B'];
const PAPER4_ORDER = PREREG.probes.paper_4_runner_outcome.order;
const PAPER1_ORDER = PREREG.probes.paper_1_verifier_control.order;
const TEST_PATHS = [
  PREREG.probes.paper_1_verifier_control.harness,
  PREREG.probes.paper_4_runner_outcome.harness,
];
const IMPLEMENTATION_PATHS = [
  'packages/core/src/plugins/PluginSandboxRunner.ts',
  'packages/engine/src/simulation/CAELRecorder.ts',
  'packages/engine/src/simulation/CAELReplayer.ts',
  'packages/engine/src/simulation/CAELTrace.ts',
  'packages/engine/src/simulation/SimulationContract.ts',
  'packages/engine/src/simulation/SimSolver.ts',
  'packages/engine/src/simulation/RegularGrid3D.ts',
];
const DEPENDENCY_PATHS = [
  'pnpm-lock.yaml',
  'package.json',
  'pnpm-workspace.yaml',
  'packages/core/package.json',
  'packages/engine/package.json',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function invoke(name, args, options = {}) {
  const executable = name === 'corepack' ? process.execPath : name;
  const executableArgs = name === 'corepack' ? [COREPACK_JS, ...args] : args;
  const started = performance.now();
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.binary ? null : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const durationMs = performance.now() - started;
  if (result.error) throw result.error;
  const status = result.status ?? -1;
  if (!options.allowFailure && status !== 0) {
    const stdout = options.binary ? '<binary>' : result.stdout;
    const stderr = options.binary ? '<binary>' : result.stderr;
    throw new Error(
      `Command failed (${status}): ${name} ${args.join(' ')}\n${stdout ?? ''}\n${stderr ?? ''}`
    );
  }
  return { ...result, status, durationMs };
}

function gitText(args, cwd = REPO_ROOT) {
  return invoke('git', args, { cwd }).stdout.trim();
}

function gitBlob(commit, path) {
  return invoke('git', ['show', `${commit}:${path}`], { binary: true }).stdout;
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function blobBinding(commit, path) {
  const bytes = gitBlob(commit, path);
  return {
    path,
    git_oid: gitText(['rev-parse', `${commit}:${path}`]),
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

function bindingSet(commit, paths) {
  return paths.map((path) => blobBinding(commit, path));
}

function bindingManifestSha(bindings) {
  return sha256(
    JSON.stringify(
      bindings.map(({ path, git_oid, sha256: digest, bytes }) => ({
        path,
        git_oid,
        sha256: digest,
        bytes,
      }))
    )
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function inEnvelope(value, envelope) {
  return value >= envelope.min_inclusive && value <= envelope.max_inclusive;
}

function parsePaper4(output) {
  const patterns = {
    vm_creation: /VM Creation\s+\| Median:\s*([0-9.]+) ms \| p99:\s*([0-9.]+) ms/,
    simple_expression: /Simple Expression\s+\| Median:\s*([0-9.]+) ms \| p99:\s*([0-9.]+) ms/,
    jit_eval: /JIT Eval Cost\s+\| Median:\s*([0-9.]+) ms \| p99:\s*([0-9.]+) ms/,
  };
  const parsed = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const match = output.match(pattern);
    if (!match) throw new Error(`Could not parse Paper 4 metric ${name}`);
    parsed[name] = { median_ms: Number(match[1]), p99_ms: Number(match[2]) };
  }
  return parsed;
}

function parsePaper1(output) {
  const verify = output.match(
    /entries=(\d+) verifyRuns=(\d+)\s+verify:\s*([0-9.]+)\s*[^\s]+\/entry median \(p99:\s*([0-9.]+)\s*[^\s]+\/entry\)/
  );
  const replay = output.match(/replayer\.verify\+replay wall\s+([0-9.]+)ms \((\d+) entries\)/);
  if (!verify || !replay) throw new Error('Could not parse Paper 1 verifier/replay metrics');
  return {
    entries: Number(verify[1]),
    verify_runs: Number(verify[2]),
    verify_median_us_per_entry: Number(verify[3]),
    verify_p99_us_per_entry: Number(verify[4]),
    replay_wall_ms: Number(replay[1]),
    replay_entries: Number(replay[2]),
  };
}

function effectiveCommand(probe) {
  return [...probe.command, ...AMENDMENT.change.append_to_each_vitest_command];
}

function resolveExecutable(name) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const query = process.platform === 'win32' && name === 'corepack' ? 'corepack.cmd' : name;
  const result = invoke(locator, [query], { allowFailure: true });
  if (result.status !== 0) return null;
  const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first ? realpathSync(first) : null;
}

function ensureWorktree(stateId, commit) {
  const path = resolve(SCRATCH_ROOT, `state-${stateId.toLowerCase()}`);
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  if (!existsSync(path)) {
    invoke('git', ['worktree', 'add', '--detach', path, commit]);
  }
  const actual = gitText(['rev-parse', 'HEAD'], path);
  if (actual !== commit) {
    throw new Error(`Existing worktree ${path} is ${actual}, expected ${commit}`);
  }
  const branch = gitText(['branch', '--show-current'], path);
  if (branch !== '') throw new Error(`Worktree ${path} is not detached`);
  return path;
}

function worktreeStatus(path) {
  return gitText(['status', '--porcelain', '--untracked-files=no'], path);
}

function runtimeBinding(worktree) {
  const nodePath = realpathSync(process.execPath);
  const corepackPath = realpathSync(COREPACK_JS);
  const pnpm = invoke('corepack', ['pnpm', '--version'], { cwd: worktree });
  const vitest = invoke(
    'corepack',
    ['pnpm', '--filter', '@holoscript/core', 'exec', 'vitest', '--version'],
    { cwd: worktree }
  );
  const cpu = cpus()[0];
  return {
    node: {
      version: process.version,
      executable: nodePath,
      executable_sha256: fileSha256(nodePath),
    },
    corepack: corepackPath
      ? { executable: corepackPath, executable_sha256: fileSha256(corepackPath) }
      : null,
    pnpm_version: pnpm.stdout.trim(),
    vitest_version: vitest.stdout.trim(),
    os: {
      platform: platform(),
      release: release(),
      arch: process.arch,
      cpu_model: cpu?.model ?? 'unknown',
      logical_cpu_count: cpus().length,
      total_memory_bytes: totalmem(),
      free_memory_bytes_at_binding: freemem(),
    },
  };
}

function bindState(stateId, worktree, cleanBefore, installResult) {
  const commit = PREREG.states[stateId].commit;
  const tests = bindingSet(commit, TEST_PATHS);
  const implementation = bindingSet(commit, IMPLEMENTATION_PATHS);
  const dependencies = bindingSet(commit, DEPENDENCY_PATHS);
  return {
    state_id: stateId,
    role: PREREG.states[stateId].role,
    commit,
    commit_tree_git_oid: gitText(['rev-parse', `${commit}^{tree}`]),
    detached_worktree: worktree,
    dirty_patch_sha256_or_clean_before: cleanBefore === '' ? 'clean' : sha256(cleanBefore),
    dependency_install: {
      command: PREREG.execution_plan.dependency_install,
      exit_code: installResult.status,
      duration_ms: installResult.durationMs,
      stdout_sha256: sha256(installResult.stdout),
      stderr_sha256: sha256(installResult.stderr),
    },
    bindings: {
      probe_source_and_test: tests,
      probe_source_and_test_manifest_sha256: bindingManifestSha(tests),
      implementation,
      implementation_manifest_sha256: bindingManifestSha(implementation),
      dependencies,
      dependency_manifest_sha256: bindingManifestSha(dependencies),
    },
    runtime: runtimeBinding(worktree),
  };
}

function runProbe({ stateId, replicate, probeId, worktree, command, env = {} }) {
  const [name, ...args] = command;
  const result = invoke(name, args, { cwd: worktree, env, allowFailure: true });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  let parsed = null;
  let parseError = null;
  try {
    parsed =
      probeId === 'paper_4_runner_outcome' ? parsePaper4(combined) : parsePaper1(combined);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  return {
    run_id: `${probeId}-${stateId}${replicate}`,
    state_id: stateId,
    replicate,
    probe_id: probeId,
    command: { executable: name, args, env },
    exit_code: result.status,
    signal: result.signal,
    duration_ms: result.durationMs,
    stdout,
    stderr,
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
    parsed,
    parse_error: parseError,
  };
}

function aggregatePaper4(runs) {
  const metricMap = {
    vm_creation_median_ms: 'vm_creation',
    simple_expression_median_ms: 'simple_expression',
    jit_eval_median_ms: 'jit_eval',
  };
  const byState = {};
  for (const stateId of STATE_IDS) {
    const stateRuns = runs.filter(
      (run) => run.probe_id === 'paper_4_runner_outcome' && run.state_id === stateId
    );
    if (stateRuns.some((run) => run.parsed === null)) {
      throw new Error(`Paper 4 state ${stateId} has an unparsed registered run`);
    }
    byState[stateId] = {};
    for (const [outputName, parsedName] of Object.entries(metricMap)) {
      const runMedians = stateRuns.map((run) => run.parsed[parsedName].median_ms);
      byState[stateId][outputName] = {
        run_medians_ms: runMedians,
        median_of_run_medians_ms: median(runMedians),
      };
    }
  }
  const ratios_b_over_a = {};
  for (const metric of Object.keys(metricMap)) {
    ratios_b_over_a[metric] =
      byState.B[metric].median_of_run_medians_ms /
      byState.A[metric].median_of_run_medians_ms;
  }
  return { by_state: byState, ratios_b_over_a };
}

function adjudicate(runs, paper4, runtimeIdentical) {
  const envelope = PREREG.effect_envelope.paper_4_ratios_b_over_a;
  const allRunsExitZero = runs.every((run) => run.exit_code === 0);
  const paper1SemanticPass = runs
    .filter((run) => run.probe_id === 'paper_1_verifier_control')
    .every(
      (run) =>
        run.exit_code === 0 &&
        run.parsed !== null &&
        run.parsed.entries > 90_000 &&
        run.parsed.entries === run.parsed.replay_entries
    );
  const paper4SemanticPass = runs
    .filter((run) => run.probe_id === 'paper_4_runner_outcome')
    .every((run) => run.exit_code === 0 && run.parsed !== null);
  const vmControlPass = inEnvelope(
    paper4.ratios_b_over_a.vm_creation_median_ms,
    envelope.vm_creation_median_ms
  );
  const simplePass = inEnvelope(
    paper4.ratios_b_over_a.simple_expression_median_ms,
    envelope.simple_expression_median_ms
  );
  const jitPass = inEnvelope(
    paper4.ratios_b_over_a.jit_eval_median_ms,
    envelope.jit_eval_median_ms
  );

  let classification;
  if (
    !allRunsExitZero ||
    !paper1SemanticPass ||
    !paper4SemanticPass ||
    !runtimeIdentical ||
    !vmControlPass
  ) {
    classification = 'confounded';
  } else if (simplePass && jitPass) {
    classification = 'mechanism_supported';
  } else if (simplePass || jitPass) {
    classification = 'partial_support';
  } else {
    classification = 'no_support_for_this_delta';
  }
  return {
    classification,
    all_runs_exit_zero: allRunsExitZero,
    paper_1_semantic_control_pass: paper1SemanticPass,
    paper_4_structural_assertions_pass: paper4SemanticPass,
    runtime_identical_between_states: runtimeIdentical,
    vm_creation_negative_control_pass: vmControlPass,
    simple_expression_effect_envelope_pass: simplePass,
    jit_eval_effect_envelope_pass: jitPass,
  };
}

function comparableRuntime(runtime) {
  return {
    node: runtime.node,
    corepack: runtime.corepack,
    pnpm_version: runtime.pnpm_version,
    vitest_version: runtime.vitest_version,
    os: {
      platform: runtime.os.platform,
      release: runtime.os.release,
      arch: runtime.os.arch,
      cpu_model: runtime.os.cpu_model,
      logical_cpu_count: runtime.os.logical_cpu_count,
      total_memory_bytes: runtime.os.total_memory_bytes,
    },
  };
}

function runExperiment() {
  if (existsSync(RECEIPT_PATH) && !process.argv.includes('--overwrite')) {
    throw new Error(`Receipt already exists: ${RECEIPT_PATH}; use --overwrite only for an explicit rerun`);
  }
  const preregistrationSha256 = fileSha256(PREREG_PATH);
  if (AMENDMENT.base_preregistration_sha256 !== preregistrationSha256) {
    throw new Error('Preregistration amendment is not bound to the current base preregistration');
  }
  const parent = gitText(['rev-parse', `${PREREG.states.B.commit}^`]);
  if (parent !== PREREG.states.A.commit) throw new Error('Preregistered states are not adjacent');

  const worktrees = {};
  const states = {};
  for (const stateId of STATE_IDS) {
    const commit = PREREG.states[stateId].commit;
    const worktree = ensureWorktree(stateId, commit);
    worktrees[stateId] = worktree;
    const cleanBefore = worktreeStatus(worktree);
    if (cleanBefore !== '') throw new Error(`State ${stateId} worktree is dirty before install`);
    const installCommand = PREREG.execution_plan.dependency_install;
    const install = invoke(installCommand[0], installCommand.slice(1), { cwd: worktree });
    states[stateId] = bindState(stateId, worktree, cleanBefore, install);
  }

  const runs = [];
  const p4Command = effectiveCommand(PREREG.probes.paper_4_runner_outcome);
  const p4Env = PREREG.probes.paper_4_runner_outcome.environment;
  for (const token of PAPER4_ORDER) {
    const stateId = token[0];
    const replicate = Number(token.slice(1));
    runs.push(
      runProbe({
        stateId,
        replicate,
        probeId: 'paper_4_runner_outcome',
        worktree: worktrees[stateId],
        command: p4Command,
        env: p4Env,
      })
    );
  }
  const p1Command = effectiveCommand(PREREG.probes.paper_1_verifier_control);
  for (const token of PAPER1_ORDER) {
    const stateId = token[0];
    const replicate = Number(token.slice(1));
    runs.push(
      runProbe({
        stateId,
        replicate,
        probeId: 'paper_1_verifier_control',
        worktree: worktrees[stateId],
        command: p1Command,
      })
    );
  }

  for (const stateId of STATE_IDS) {
    const cleanAfter = worktreeStatus(worktrees[stateId]);
    states[stateId].dirty_patch_sha256_or_clean_after =
      cleanAfter === '' ? 'clean' : sha256(cleanAfter);
  }

  const paper4 = aggregatePaper4(runs);
  const runtimeIdentical =
    JSON.stringify(comparableRuntime(states.A.runtime)) ===
    JSON.stringify(comparableRuntime(states.B.runtime));
  const receipt = {
    schema: 'holoscript.paradox_to_proof.pp001.receipt.v1',
    card_id: 'PP-001',
    generated_at: new Date().toISOString(),
    preregistration: {
      path: 'research/paradox-to-proof/pp001/preregistration.json',
      sha256: preregistrationSha256,
      amendment: {
        path: 'research/paradox-to-proof/pp001/preregistration-amendment-001.json',
        sha256: fileSha256(AMENDMENT_PATH),
        excluded_attempts: AMENDMENT.excluded_attempts,
      },
    },
    execution: {
      repo_root: REPO_ROOT,
      main_worktree_commit_at_execution: gitText(['rev-parse', 'HEAD']),
      main_worktree_used_for_probe_execution: false,
      isolation: 'detached-git-worktrees',
      scratch_root: SCRATCH_ROOT,
      quantum_hardware_used: false,
      experiment_driver: {
        path: 'research/paradox-to-proof/pp001/pp001_living_artifact.mjs',
        sha256: fileSha256(fileURLToPath(import.meta.url)),
      },
      home_directory_recorded_only_as_runtime_context: homedir(),
      paper_4_order: PAPER4_ORDER,
      paper_1_order: PAPER1_ORDER,
    },
    state_diff: {
      adjacent: true,
      changed_paths: gitText([
        'diff',
        '--name-only',
        PREREG.states.A.commit,
        PREREG.states.B.commit,
      ]).split(/\r?\n/),
    },
    states,
    runs,
    aggregates: {
      paper_4_runner_outcome: paper4,
      paper_1_verifier_control: Object.fromEntries(
        STATE_IDS.map((stateId) => [
          stateId,
          runs.find(
            (run) => run.probe_id === 'paper_1_verifier_control' && run.state_id === stateId
          ).parsed,
        ])
      ),
    },
  };
  receipt.adjudication = adjudicate(runs, paper4, runtimeIdentical);

  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(RECEIPT_PATH, serialized, 'utf8');
  const receiptSha256 = sha256(serialized);
  writeFileSync(RECEIPT_HASH_PATH, `${receiptSha256}  receipt.json\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        receipt: RECEIPT_PATH,
        receipt_sha256: receiptSha256,
        classification: receipt.adjudication.classification,
        ratios_b_over_a: paper4.ratios_b_over_a,
      },
      null,
      2
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(`VERIFY FAILED: ${message}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifyReceipt() {
  assert(existsSync(RECEIPT_PATH), 'receipt.json is missing');
  assert(existsSync(RECEIPT_HASH_PATH), 'receipt.sha256 is missing');
  const receiptBytes = readFileSync(RECEIPT_PATH);
  const sidecar = readFileSync(RECEIPT_HASH_PATH, 'utf8').trim().split(/\s+/)[0];
  assert(sha256(receiptBytes) === sidecar, 'receipt sidecar hash mismatch');
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  assert(receipt.preregistration.sha256 === fileSha256(PREREG_PATH), 'preregistration hash drift');
  assert(
    receipt.preregistration.amendment.sha256 === fileSha256(AMENDMENT_PATH),
    'preregistration amendment hash drift'
  );
  assert(
    AMENDMENT.base_preregistration_sha256 === receipt.preregistration.sha256,
    'amendment base hash mismatch'
  );
  assert(receipt.execution.main_worktree_used_for_probe_execution === false, 'main worktree was used');
  assert(receipt.execution.quantum_hardware_used === false, 'quantum hardware must not be used');
  assert(
    receipt.execution.experiment_driver.sha256 === fileSha256(fileURLToPath(import.meta.url)),
    'experiment driver hash drift'
  );

  const parent = gitText(['rev-parse', `${PREREG.states.B.commit}^`]);
  assert(parent === PREREG.states.A.commit, 'states are no longer adjacent');
  const changedPaths = gitText([
    'diff',
    '--name-only',
    PREREG.states.A.commit,
    PREREG.states.B.commit,
  ]).split(/\r?\n/);
  assert(sameJson(changedPaths, receipt.state_diff.changed_paths), 'state diff path list mismatch');

  for (const stateId of STATE_IDS) {
    const state = receipt.states[stateId];
    const commit = PREREG.states[stateId].commit;
    assert(state.commit === commit, `state ${stateId} commit mismatch`);
    assert(
      state.commit_tree_git_oid === gitText(['rev-parse', `${commit}^{tree}`]),
      `state ${stateId} tree OID mismatch`
    );
    const groups = [
      ['probe_source_and_test', TEST_PATHS],
      ['implementation', IMPLEMENTATION_PATHS],
      ['dependencies', DEPENDENCY_PATHS],
    ];
    for (const [name, paths] of groups) {
      const rebound = bindingSet(commit, paths);
      assert(sameJson(state.bindings[name], rebound), `state ${stateId} ${name} binding mismatch`);
      const manifestKey =
        name === 'probe_source_and_test'
          ? 'probe_source_and_test_manifest_sha256'
          : `${name === 'dependencies' ? 'dependency' : name}_manifest_sha256`;
      assert(
        state.bindings[manifestKey] === bindingManifestSha(rebound),
        `state ${stateId} ${name} manifest mismatch`
      );
    }
    assert(
      state.dirty_patch_sha256_or_clean_before === 'clean' &&
        state.dirty_patch_sha256_or_clean_after === 'clean',
      `state ${stateId} was not clean`
    );
  }

  for (const path of PREREG.causal_cut.required_identical_paths) {
    assert(
      gitText(['rev-parse', `${PREREG.states.A.commit}:${path}`]) ===
        gitText(['rev-parse', `${PREREG.states.B.commit}:${path}`]),
      `required-identical path changed: ${path}`
    );
  }
  const changedDependency = PREREG.causal_cut.required_changed_probe_dependency;
  assert(
    gitText(['rev-parse', `${PREREG.states.A.commit}:${changedDependency}`]) !==
      gitText(['rev-parse', `${PREREG.states.B.commit}:${changedDependency}`]),
    'declared runner dependency did not change'
  );

  for (const run of receipt.runs) {
    assert(run.stdout_sha256 === sha256(run.stdout), `${run.run_id} stdout hash mismatch`);
    assert(run.stderr_sha256 === sha256(run.stderr), `${run.run_id} stderr hash mismatch`);
    let reparsed = null;
    let reparseError = null;
    try {
      reparsed =
        run.probe_id === 'paper_4_runner_outcome'
          ? parsePaper4(`${run.stdout}\n${run.stderr}`)
          : parsePaper1(`${run.stdout}\n${run.stderr}`);
    } catch (error) {
      reparseError = error instanceof Error ? error.message : String(error);
    }
    assert(sameJson(run.parsed, reparsed), `${run.run_id} parsed metrics mismatch`);
    assert(run.parse_error === reparseError, `${run.run_id} parse-error mismatch`);
    const preregProbe = PREREG.probes[run.probe_id];
    assert(
      sameJson([run.command.executable, ...run.command.args], effectiveCommand(preregProbe)),
      `${run.run_id} command drift`
    );
    assert(
      sameJson(run.command.env, preregProbe.environment ?? {}),
      `${run.run_id} environment drift`
    );
  }

  const paper4 = aggregatePaper4(receipt.runs);
  assert(
    sameJson(receipt.aggregates.paper_4_runner_outcome, paper4),
    'Paper 4 aggregates mismatch'
  );
  const runtimeIdentical =
    sameJson(comparableRuntime(receipt.states.A.runtime), comparableRuntime(receipt.states.B.runtime));
  const adjudication = adjudicate(receipt.runs, paper4, runtimeIdentical);
  assert(sameJson(receipt.adjudication, adjudication), 'adjudication mismatch');
  assert(receipt.runs.length === 8, 'expected exactly eight probe processes');

  console.log(
    `PASS PP-001 receipt ${sidecar}: ${receipt.adjudication.classification}; ` +
      `all hashes, commands, parsed outputs, aggregates, and envelopes verified`
  );
}

if (process.argv.includes('--verify')) {
  verifyReceipt();
} else {
  runExperiment();
}
