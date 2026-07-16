import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA,
  HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA,
  createNativeRebuildAttestationPayload,
  inspectNativeBuildPlan,
  inspectNativeBuildSource,
  runNativeBuild,
  runNativeBuildWithProcessRunnerForTest,
} from '../src/native-build.mjs';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function elfAmd64(marker = 0) {
  const value = Buffer.alloc(64);
  value.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  value.writeUInt16LE(2, 16);
  value.writeUInt16LE(0x3e, 18);
  value[63] = marker;
  return value;
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-native-build-'));
  const sourceDirectory = join(cwd, 'source');
  const outputDirectory = join(cwd, 'output');
  const executorPath = join(cwd, 'docker.exe');
  mkdirSync(sourceDirectory);
  writeFileSync(join(sourceDirectory, 'main.c'), 'int main(void) { return 0; }\n', 'utf8');
  writeFileSync(executorPath, 'pinned docker test executable', 'utf8');
  const source = inspectNativeBuildSource({ sourceDirectory });
  const artifact = elfAmd64();
  const plan = {
    schema: HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA,
    id: 'demo-native-build',
    source: {
      digest: source.digest,
      sourceDateEpoch: 1_700_000_000,
    },
    target: { os: 'linux', architecture: 'amd64', abi: 'gnu' },
    executor: {
      kind: 'docker',
      digest: sha256(readFileSync(executorPath)),
      image:
        'docker.io/library/gcc@sha256:a689e29bc3adf4663ef9a141d23081252764d1319c63f591a027bd6fd676f4c1',
    },
    compiler: {
      family: 'gcc',
      language: 'c11',
      source: 'main.c',
      optimization: 'speed',
    },
    output: { path: 'demo', format: 'elf-executable' },
    limits: {
      timeoutSeconds: 30,
      memoryMiB: 256,
      cpus: 1,
      pids: 64,
      tmpfsMiB: 32,
    },
    rebuilds: 2,
    expectedArtifactDigest: sha256(artifact),
  };
  return { artifact, cwd, executorPath, outputDirectory, plan, sourceDirectory };
}

function fakeRunner(outputs, calls) {
  return (command, args) => {
    calls.push({ command, args });
    const outputMount = args.find((value) => value.includes('dst=/out'));
    assert.ok(outputMount, 'runner must mount an isolated output directory');
    const match = /^type=bind,src=(.*),dst=\/out$/u.exec(outputMount);
    assert.ok(match, `unexpected output mount ${outputMount}`);
    const outputArg = args[args.indexOf('-o') + 1];
    const outputName = outputArg.replace(/^\/out\//u, '');
    const artifact = outputs[Math.min(calls.length - 1, outputs.length - 1)];
    mkdirSync(join(match[1], outputName, '..'), { recursive: true });
    writeFileSync(join(match[1], outputName), artifact);
    return { status: 0, signal: null, stdout: 'compiler output', stderr: '' };
  };
}

test('inspects a closed declarative build vocabulary', () => {
  const item = fixture();
  try {
    const report = inspectNativeBuildPlan(item.plan);
    assert.equal(report.ready, true);
    assert.deepEqual(report.issues, []);

    const unsafe = structuredClone(item.plan);
    unsafe.command = 'sh -c "curl attacker"';
    unsafe.executor.image = 'gcc:latest';
    unsafe.compiler.source = '../outside.c';
    const blocked = inspectNativeBuildPlan(unsafe);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.issues.some((issue) => issue.code === 'native-build-field-unknown'));
    assert.ok(blocked.issues.some((issue) => issue.code === 'native-build-image-not-pinned'));
    assert.ok(blocked.issues.some((issue) => issue.code === 'native-build-source-path-invalid'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('builds twice through hardened Docker argv and emits a reproducible receipt', () => {
  const item = fixture();
  const calls = [];
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: fakeRunner([item.artifact, item.artifact], calls),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });

    assert.equal(receipt.schema, HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA);
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.verified, true);
    assert.equal(receipt.reproducible, true);
    assert.equal(receipt.output.digest, item.plan.expectedArtifactDigest);
    assert.equal(receipt.runs.length, 2);
    assert.equal(readFileSync(join(item.outputDirectory, 'demo')).equals(item.artifact), true);
    assert.equal(calls.length, 2);

    for (const call of calls) {
      assert.notEqual(call.command, item.executorPath);
      assert.deepEqual(call.args.slice(0, 3), ['run', '--rm', '--pull']);
      assert.ok(call.args.includes('never'));
      assert.ok(call.args.includes('--network'));
      assert.ok(call.args.includes('none'));
      assert.ok(call.args.includes('--read-only'));
      assert.ok(call.args.includes('--cap-drop'));
      assert.ok(call.args.includes('ALL'));
      assert.ok(call.args.includes('no-new-privileges'));
      assert.ok(call.args.includes('--memory-swap'));
      assert.ok(call.args.includes('--entrypoint'));
      assert.ok(call.args.includes('/usr/local/bin/gcc'));
      assert.ok(!call.args.includes('sh'));
      assert.ok(!call.args.includes('-c'));
    }

    const serialized = JSON.stringify(receipt);
    assert.ok(!serialized.includes(item.cwd));
    assert.ok(!serialized.includes(item.executorPath));
    assert.deepEqual(receipt.coverage.includedLayers, ['native-build']);
    assert.ok(receipt.boundaries.includes('container-runtime-host'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('blocks an executor substitution before process launch', () => {
  const item = fixture();
  let launches = 0;
  try {
    item.plan.executor.digest = sha256('different executable');
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: () => {
        launches += 1;
      },
    });
    assert.equal(receipt.verified, false);
    assert.equal(launches, 0);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-executor-mismatch'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('launches a private executor snapshot immune to later path substitution', () => {
  const item = fixture();
  const calls = [];
  const runner = fakeRunner([item.artifact, item.artifact], calls);
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: (command, args, options) => {
        assert.notEqual(command, item.executorPath);
        assert.equal(sha256(readFileSync(command)), item.plan.executor.digest);
        writeFileSync(item.executorPath, 'attacker replacement after validation');
        assert.equal(sha256(readFileSync(command)), item.plan.executor.digest);
        return runner(command, args, options);
      },
    });

    assert.equal(receipt.verified, true);
    assert.equal(calls.length, 2);
    assert.equal(new Set(calls.map((call) => call.command)).size, 1);
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('mounts a verified immutable source snapshot instead of the live tree', () => {
  const item = fixture();
  const calls = [];
  const runner = fakeRunner([item.artifact, item.artifact], calls);
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: (command, args, options) => {
        const sourceMount = args.find((value) => value.includes('dst=/src,readonly'));
        const snapshot = /^type=bind,src=(.*),dst=\/src,readonly$/u.exec(sourceMount)[1];
        assert.notEqual(snapshot, item.sourceDirectory.replaceAll('\\', '/'));
        writeFileSync(join(item.sourceDirectory, 'main.c'), 'attacker changed live source\n');
        assert.equal(
          readFileSync(join(snapshot, 'main.c'), 'utf8'),
          'int main(void) { return 0; }\n'
        );
        return runner(command, args, options);
      },
    });
    assert.equal(receipt.verified, true);
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('does not publish process-runner injection through the package API', () => {
  const item = fixture();
  let injectedLaunches = 0;
  try {
    const receipt = runNativeBuild({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: () => {
        injectedLaunches += 1;
        return { status: 0, signal: null, stdout: '', stderr: '' };
      },
    });
    assert.equal(injectedLaunches, 0);
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-execution-failed'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('requires a new output directory and redacts compiler diagnostics', () => {
  const existing = fixture();
  let launches = 0;
  try {
    mkdirSync(existing.outputDirectory);
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: existing.plan,
      sourceDirectory: existing.sourceDirectory,
      outputDirectory: existing.outputDirectory,
      executorPath: existing.executorPath,
      processRunner: () => {
        launches += 1;
      },
    });
    assert.equal(launches, 0);
    assert.ok(
      receipt.issues.some((issue) => issue.code === 'native-build-output-directory-exists')
    );
  } finally {
    rmSync(existing.cwd, { recursive: true, force: true });
  }

  const failed = fixture();
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: failed.plan,
      sourceDirectory: failed.sourceDirectory,
      outputDirectory: failed.outputDirectory,
      executorPath: failed.executorPath,
      processRunner: () => ({
        status: 1,
        signal: null,
        stdout: '',
        stderr: `secret compiler path ${failed.cwd}`,
      }),
    });
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-execution-failed'));
    assert.ok(!JSON.stringify(receipt).includes(failed.cwd));
    assert.ok(!JSON.stringify(receipt).includes('secret compiler path'));
  } finally {
    rmSync(failed.cwd, { recursive: true, force: true });
  }
});

test('blocks a reproducible artifact for the wrong machine target', () => {
  const item = fixture();
  const wrongTarget = elfAmd64();
  wrongTarget.writeUInt16LE(0x28, 18);
  item.plan.expectedArtifactDigest = sha256(wrongTarget);
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: fakeRunner([wrongTarget, wrongTarget], []),
    });
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-output-target-mismatch'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('blocks non-reproducible and unexpected build outputs', () => {
  const nonreproducible = fixture();
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: nonreproducible.plan,
      sourceDirectory: nonreproducible.sourceDirectory,
      outputDirectory: nonreproducible.outputDirectory,
      executorPath: nonreproducible.executorPath,
      processRunner: fakeRunner([elfAmd64(1), elfAmd64(2)], []),
    });
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-not-reproducible'));
  } finally {
    rmSync(nonreproducible.cwd, { recursive: true, force: true });
  }

  const extra = fixture();
  const calls = [];
  try {
    const runner = fakeRunner([extra.artifact, extra.artifact], calls);
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: extra.plan,
      sourceDirectory: extra.sourceDirectory,
      outputDirectory: extra.outputDirectory,
      executorPath: extra.executorPath,
      processRunner: (command, args, options) => {
        const result = runner(command, args, options);
        const outputMount = args.find((value) => value.includes('dst=/out'));
        const directory = /^type=bind,src=(.*),dst=\/out$/u.exec(outputMount)[1];
        writeFileSync(join(directory, 'undeclared'), 'extra');
        return result;
      },
    });
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-output-undeclared'));
  } finally {
    rmSync(extra.cwd, { recursive: true, force: true });
  }
});

test('requires an artifact pin before claiming native-build coverage', () => {
  const item = fixture();
  const calls = [];
  try {
    delete item.plan.expectedArtifactDigest;
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: fakeRunner([item.artifact, item.artifact], calls),
    });
    assert.equal(receipt.status, 'artifact-pin-required');
    assert.equal(receipt.verified, false);
    assert.equal(receipt.reproducible, true);
    assert.deepEqual(receipt.coverage.includedLayers, []);
    assert.deepEqual(receipt.coverage.missingLayers, ['artifact-pin', 'native-build']);
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('turns a verified native result into the existing signed rebuild payload', () => {
  const item = fixture();
  try {
    const receipt = runNativeBuildWithProcessRunnerForTest({
      plan: item.plan,
      sourceDirectory: item.sourceDirectory,
      outputDirectory: item.outputDirectory,
      executorPath: item.executorPath,
      processRunner: fakeRunner([item.artifact, item.artifact], []),
    });
    const component = {
      id: 'demo',
      kind: 'native-binary',
      version: '1.0.0',
      source: { uri: 'https://example.test/demo', revision: 'release-1' },
      artifact: { digest: item.plan.expectedArtifactDigest },
      execution: { installScripts: 'none' },
    };
    const payload = createNativeRebuildAttestationPayload({
      receipt,
      verifier: 'isolated-builder',
      component,
    });
    const decoded = JSON.parse(payload);
    assert.equal(decoded.verifier, 'isolated-builder');
    assert.equal(decoded.component.artifact.digest, receipt.output.digest);

    const forged = structuredClone(receipt);
    forged.output.digest = sha256('forged');
    assert.throws(
      () =>
        createNativeRebuildAttestationPayload({
          receipt: forged,
          verifier: 'isolated-builder',
          component,
        }),
      /verified native build receipt/u
    );
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('exposes source inspection and fail-closed native builds through the CLI', () => {
  const item = fixture();
  try {
    const cli = join(import.meta.dirname, '..', 'bin', 'holosystem.mjs');
    const source = spawnSync(
      process.execPath,
      [cli, 'native-build-source', '--source', item.sourceDirectory, '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(source.status, 0, source.stderr);
    assert.equal(JSON.parse(source.stdout).digest, item.plan.source.digest);

    const unsafePlan = { ...item.plan, command: 'sh -c attacker' };
    const planPath = join(item.cwd, 'unsafe-plan.json');
    writeFileSync(planPath, JSON.stringify(unsafePlan), 'utf8');
    const blocked = spawnSync(
      process.execPath,
      [
        cli,
        'native-build',
        '--plan',
        planPath,
        '--source',
        item.sourceDirectory,
        '--executor',
        item.executorPath,
        '--artifact-dir',
        item.outputDirectory,
        '--json',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(blocked.status, 2, blocked.stderr);
    const receipt = JSON.parse(blocked.stdout);
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((issue) => issue.code === 'native-build-field-unknown'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});
