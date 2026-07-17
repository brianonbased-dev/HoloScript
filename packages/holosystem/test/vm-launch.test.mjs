import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA,
  HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA,
  HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA,
  HOLOSYSTEM_WHPX_VM_LAUNCH_RECEIPT_SCHEMA,
  HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_PLAN_SCHEMA,
  HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_RECEIPT_SCHEMA,
  HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA,
  HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA,
  HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA,
  HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA,
  HOLOSYSTEM_WINDOWS_APPCONTAINER_PROTOCOL,
  HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST,
  HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST,
  HOLOSYSTEM_WINDOWS_SANDBOX_PROTOCOL,
  inspectVmExecutor,
  inspectAppContainerVmLaunchPlan,
  inspectVmLaunchAsset,
  inspectVmLaunchPlan,
  inspectWindowsVmSandboxLauncher,
  inspectWindowsVmAppContainerCanary,
  inspectWhpxSandboxedVmLaunchPlan,
  inspectWhpxAppContainerVmLaunchPlan,
  inspectWhpxVmLaunchPlan,
  runVmLaunchWithProcessRunnerForTest,
  runAppContainerVmLaunchWithProcessRunnerForTest,
  runWhpxSandboxedVmLaunchWithProcessRunnerForTest,
  runWhpxAppContainerVmLaunchWithProcessRunnerForTest,
  runWhpxVmLaunchWithProcessRunnerForTest,
} from '../src/vm-launch.mjs';
import {
  runAppContainerVmLaunch,
  runVmLaunch,
  runWhpxAppContainerVmLaunch,
  runWhpxSandboxedVmLaunch,
  runWhpxVmLaunch,
} from '../src/index.mjs';

const CONSOLE = Buffer.from('HOLOSYSTEM_VM_OK\r\n');
const WHPX_DIAGNOSTICS = Buffer.from('pinned WHPX host diagnostic\r\n');

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-vm-launch-test-'));
  const runtimeDirectory = join(cwd, 'runtime');
  const shareDirectory = join(runtimeDirectory, 'share');
  const executorPath = join(runtimeDirectory, 'qemu-system-x86_64.exe');
  const kernelPath = join(cwd, 'vmlinuz');
  const initrdPath = join(cwd, 'initramfs.cpio.gz');
  mkdirSync(shareDirectory, { recursive: true });
  writeFileSync(executorPath, 'pinned qemu executable');
  writeFileSync(join(runtimeDirectory, 'runtime.dll'), 'pinned runtime dependency');
  writeFileSync(join(shareDirectory, 'bios-256k.bin'), 'pinned firmware dependency');
  writeFileSync(kernelPath, 'pinned kernel');
  writeFileSync(initrdPath, 'pinned initrd');

  const executor = inspectVmExecutor({ executorDirectory: runtimeDirectory });
  const kernel = inspectVmLaunchAsset({ assetPath: kernelPath, kind: 'kernel' });
  const initrd = inspectVmLaunchAsset({ assetPath: initrdPath, kind: 'initrd' });
  assert.equal(executor.ready, true);
  assert.equal(kernel.ready, true);
  assert.equal(initrd.ready, true);

  const plan = {
    schema: HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA,
    id: 'vm-proof',
    host: { os: 'windows', architecture: 'amd64' },
    executor: {
      kind: 'qemu-system',
      binary: 'qemu-system-x86_64.exe',
      binaryDigest: executor.binaryDigest,
      runtimeDigest: executor.digest,
    },
    target: { architecture: 'amd64', machine: 'q35', accelerator: 'tcg' },
    guest: {
      kernelDigest: kernel.digest,
      initrdDigest: initrd.digest,
      expectedConsoleDigest: sha256(CONSOLE),
    },
    resources: { memoryMiB: 128, cpus: 1, timeoutSeconds: 30 },
    launches: 2,
  };
  return { cwd, runtimeDirectory, executorPath, kernelPath, initrdPath, plan };
}

function successfulRunner(calls = []) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 33, signal: null, stdout: Buffer.from(CONSOLE), stderr: Buffer.alloc(0) };
  };
}

function sandboxedPlan(item) {
  const plan = structuredClone(item.plan);
  plan.schema = HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_PLAN_SCHEMA;
  plan.target.accelerator = 'whpx';
  plan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
  plan.sandbox = {
    kind: 'windows-low-integrity-job-v1',
    launcherDigest: HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST,
  };
  return plan;
}

function sandboxProtocolRunner(calls = [], mutate = (value) => value) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const qemuCommand = args[args.indexOf('--executable') + 1];
    const message = mutate({
      protocol: HOLOSYSTEM_WINDOWS_SANDBOX_PROTOCOL,
      launched: true,
      timedOut: false,
      exitCode: 33,
      isolation: {
        filteredToken: true,
        disableMaxPrivilege: true,
        enabledPrivilegeCount: 1,
        privilegesBounded: true,
        lowIntegrity: true,
        assignedBeforeResume: true,
        handleAllowlist: true,
        killOnClose: true,
        activeProcessLimit: true,
        processMemoryLimit: true,
        uiRestrictions: true,
        writableTempLowIntegrity: true,
      },
      stdoutBase64: CONSOLE.toString('base64'),
      stderrBase64: Buffer.from(`${qemuCommand}: ${WHPX_DIAGNOSTICS}`).toString('base64'),
      errorStage: null,
      errorCode: 0,
    });
    return {
      status: 0,
      signal: null,
      stdout: Buffer.from(`${JSON.stringify(message)}\r\n`),
      stderr: Buffer.alloc(0),
    };
  };
}

function appContainerPlan(item) {
  const plan = structuredClone(item.plan);
  plan.schema = HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA;
  plan.target.accelerator = 'whpx';
  plan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
  plan.sandbox = {
    kind: 'windows-appcontainer-deny-v1',
    launcherDigest: HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST,
    canaryDigest: HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST,
  };
  return plan;
}

function appContainerTcgPlan(item) {
  const plan = structuredClone(item.plan);
  plan.schema = HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA;
  plan.sandbox = {
    kind: 'windows-appcontainer-deny-v1',
    launcherDigest: HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST,
    canaryDigest: HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST,
  };
  return plan;
}

function appContainerProtocolRunner(
  calls = [],
  mutate = (value) => value,
  diagnostics = WHPX_DIAGNOSTICS
) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const qemuCommand = args[args.indexOf('--executable') + 1];
    const message = mutate({
      protocol: HOLOSYSTEM_WINDOWS_APPCONTAINER_PROTOCOL,
      launched: true,
      timedOut: false,
      exitCode: 33,
      isolation: {
        filteredToken: true,
        disableMaxPrivilege: true,
        enabledPrivilegeCount: 0,
        privilegesBounded: true,
        lowIntegrity: true,
        assignedBeforeResume: true,
        handleAllowlist: true,
        killOnClose: true,
        activeProcessLimit: true,
        processMemoryLimit: true,
        uiRestrictions: true,
        appContainer: true,
        appContainerSidMatched: true,
        capabilityCount: 0,
        snapshotReadExecuteGrant: true,
        writableTempModifyGrant: true,
        filesystemCanaryDenied: true,
        filesystemCanaryError: 5,
        networkCanaryDenied: true,
        networkCanaryError: 10013,
        loopbackAccepted: false,
        profileDeleted: true,
      },
      stdoutBase64: CONSOLE.toString('base64'),
      stderrBase64: diagnostics.length
        ? Buffer.from(`${qemuCommand}: ${diagnostics}`).toString('base64')
        : '',
      errorStage: null,
      errorCode: 0,
    });
    return {
      status: 0,
      signal: null,
      stdout: Buffer.from(`${JSON.stringify(message)}\r\n`),
      stderr: Buffer.alloc(0),
    };
  };
}

test('accepts only a closed machine-VM launch vocabulary', () => {
  const item = fixture();
  try {
    assert.equal(inspectVmLaunchPlan(item.plan).ready, true);
    const unsafe = structuredClone(item.plan);
    unsafe.command = 'powershell -Command curl attacker';
    unsafe.executor.args = ['-net', 'user'];
    unsafe.target.accelerator = 'kvm';
    unsafe.resources.cpus = 32;
    const blocked = inspectVmLaunchPlan(unsafe);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-accelerator-unsupported'));
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-limit-invalid'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('keeps WHPX in a separately named closed adapter with no downgrade path', () => {
  const item = fixture();
  try {
    const whpxPlan = structuredClone(item.plan);
    whpxPlan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
    whpxPlan.target.accelerator = 'whpx';
    whpxPlan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);

    assert.equal(inspectWhpxVmLaunchPlan(whpxPlan).ready, true);
    assert.equal(inspectVmLaunchPlan(whpxPlan).ready, false);

    const downgrade = structuredClone(whpxPlan);
    downgrade.target.accelerator = 'tcg';
    downgrade.fallback = 'tcg';
    const blocked = inspectWhpxVmLaunchPlan(downgrade);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-accelerator-unsupported'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('proves explicit WHPX execution without claiming host-process isolation', () => {
  const item = fixture();
  const calls = [];
  try {
    const plan = structuredClone(item.plan);
    plan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
    plan.target.accelerator = 'whpx';
    plan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
    const receipt = runWhpxVmLaunchWithProcessRunnerForTest({
      plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: (command, args, options) => {
        calls.push({ command, args, options });
        return {
          status: 33,
          signal: null,
          stdout: Buffer.from(CONSOLE),
          stderr: Buffer.from(`${command}: ${WHPX_DIAGNOSTICS}`),
        };
      },
      now: new Date('2026-07-16T00:00:00.000Z'),
    });

    assert.equal(receipt.schema, HOLOSYSTEM_WHPX_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.verified, true);
    assert.equal(receipt.deterministic, true);
    assert.equal(receipt.hardwareBacked, true);
    assert.deepEqual(receipt.acceleration, {
      adapter: 'qemu-whpx',
      evidence: 'two-explicit-successful-launches',
      verified: true,
    });
    assert.deepEqual(receipt.isolation, {
      hostProcess: 'ambient-windows-process',
      verified: false,
    });
    assert.deepEqual(receipt.coverage.includedLayers, [
      'guest-artifact-measurement',
      'hardware-hypervisor-acceleration',
      'machine-vm-launch',
      'virtual-device-minimization',
    ]);
    assert.deepEqual(receipt.coverage.missingLayers, ['host-process-isolation']);
    assert.ok(!receipt.boundaries.includes('hardware-hypervisor-acceleration'));
    assert.ok(receipt.boundaries.includes('host-process-isolation'));
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.ok(call.args.includes('q35,accel=whpx,usb=off'));
      assert.ok(!call.args.includes('q35,accel=tcg,usb=off'));
      assert.equal(call.options.shell, false);
    }
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('measures the packaged Windows sandbox launcher', () => {
  const report = inspectWindowsVmSandboxLauncher();
  assert.equal(report.ready, true);
  assert.equal(report.kind, 'windows-low-integrity-job-v1');
  assert.equal(report.digest, HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST);
  assert.ok(report.bytes > 0);
});

test('measures the packaged native AppContainer canary', () => {
  const report = inspectWindowsVmAppContainerCanary();
  assert.equal(report.ready, true);
  assert.equal(report.kind, 'windows-appcontainer-deny-v1');
  assert.equal(report.digest, HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST);
  assert.ok(report.bytes > 0);
});

test('keeps sandboxed WHPX in a separate closed vocabulary', () => {
  const item = fixture();
  try {
    const plan = sandboxedPlan(item);
    assert.equal(inspectWhpxSandboxedVmLaunchPlan(plan).ready, true);
    assert.equal(inspectWhpxVmLaunchPlan(plan).ready, false);

    const downgrade = structuredClone(plan);
    downgrade.sandbox.kind = 'ambient-windows-process';
    downgrade.fallback = 'ambient';
    const blocked = inspectWhpxSandboxedVmLaunchPlan(downgrade);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-sandbox-unsupported'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('proves WHPX under a low-integrity filtered token and pre-resume Job Object', () => {
  const item = fixture();
  const calls = [];
  try {
    const receipt = runWhpxSandboxedVmLaunchWithProcessRunnerForTest({
      plan: sandboxedPlan(item),
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: sandboxProtocolRunner(calls),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });

    assert.equal(receipt.schema, HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.verified, true);
    assert.equal(receipt.hardwareBacked, true);
    assert.equal(receipt.isolation.hostProcess, 'windows-low-integrity-job-v1');
    assert.equal(receipt.isolation.scope, 'integrity-privilege-lifetime-resource-ui');
    assert.equal(receipt.isolation.verified, true);
    assert.equal(receipt.isolation.launcherDigest, HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST);
    assert.deepEqual(receipt.isolation.controls, {
      filteredToken: true,
      disableMaxPrivilege: true,
      enabledPrivilegeCount: 1,
      privilegesBounded: true,
      lowIntegrity: true,
      assignedBeforeResume: true,
      handleAllowlist: true,
      killOnClose: true,
      activeProcessLimit: true,
      processMemoryLimit: true,
      uiRestrictions: true,
      writableTempLowIntegrity: true,
    });
    assert.deepEqual(receipt.coverage.includedLayers, [
      'guest-artifact-measurement',
      'hardware-hypervisor-acceleration',
      'host-process-isolation',
      'machine-vm-launch',
      'virtual-device-minimization',
    ]);
    assert.deepEqual(receipt.coverage.missingLayers, [
      'host-filesystem-confidentiality',
      'host-network-isolation',
    ]);
    assert.ok(!receipt.boundaries.includes('host-process-isolation'));
    assert.ok(receipt.boundaries.includes('host-filesystem-confidentiality'));
    assert.ok(receipt.boundaries.includes('host-network-isolation'));
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.command, /holosystem-sandbox-launcher\.exe$/u);
      assert.ok(call.args.includes('--executable'));
      assert.ok(call.args.includes('--writable-temp'));
      assert.ok(call.args.includes('--'));
      assert.ok(call.args.includes('q35,accel=whpx,usb=off'));
      assert.equal(call.options.shell, false);
    }
    assert.ok(!JSON.stringify(receipt).includes(item.cwd));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('blocks incomplete or forged Windows sandbox evidence', () => {
  const mutations = [
    {
      mutate: (message) => ({
        ...message,
        isolation: { ...message.isolation, lowIntegrity: false },
      }),
      code: 'vm-launch-sandbox-evidence-invalid',
    },
    {
      mutate: (message) => ({ ...message, fallback: 'ambient' }),
      code: 'vm-launch-sandbox-protocol-invalid',
    },
  ];
  for (const entry of mutations) {
    const item = fixture();
    try {
      const receipt = runWhpxSandboxedVmLaunchWithProcessRunnerForTest({
        plan: sandboxedPlan(item),
        executorDirectory: item.runtimeDirectory,
        kernelPath: item.kernelPath,
        initrdPath: item.initrdPath,
        processRunner: sandboxProtocolRunner([], entry.mutate),
      });
      assert.equal(receipt.verified, false);
      assert.equal(receipt.hardwareBacked, false);
      assert.equal(receipt.isolation.verified, false);
      assert.ok(receipt.issues.some((issue) => issue.code === entry.code));
    } finally {
      rmSync(item.cwd, { recursive: true, force: true });
    }
  }
});

test('keeps AppContainer WHPX in a distinct zero-capability vocabulary', () => {
  const item = fixture();
  try {
    const plan = appContainerPlan(item);
    assert.equal(inspectWhpxAppContainerVmLaunchPlan(plan).ready, true);
    assert.equal(inspectWhpxSandboxedVmLaunchPlan(plan).ready, false);

    const broadened = structuredClone(plan);
    broadened.sandbox.capabilities = ['internetClient'];
    broadened.sandbox.readPaths = ['C:/'];
    broadened.fallback = 'windows-low-integrity-job-v1';
    const blocked = inspectWhpxAppContainerVmLaunchPlan(broadened);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('requires functional file and network denial before claiming AppContainer isolation', () => {
  const item = fixture();
  const calls = [];
  try {
    const receipt = runWhpxAppContainerVmLaunchWithProcessRunnerForTest({
      plan: appContainerPlan(item),
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: appContainerProtocolRunner(calls),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });

    assert.equal(receipt.schema, HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(receipt.verified, true);
    assert.equal(receipt.hardwareBacked, true);
    assert.equal(receipt.isolation.hostProcess, 'windows-appcontainer-deny-v1');
    assert.equal(receipt.isolation.scope, 'appcontainer-zero-capability-snapshot-grant');
    assert.equal(receipt.isolation.verified, true);
    assert.equal(receipt.isolation.controls.appContainer, true);
    assert.equal(receipt.isolation.controls.capabilityCount, 0);
    assert.equal(receipt.isolation.controls.filesystemCanaryDenied, true);
    assert.equal(receipt.isolation.controls.filesystemCanaryError, 5);
    assert.equal(receipt.isolation.controls.networkCanaryDenied, true);
    assert.equal(receipt.isolation.controls.networkCanaryError, 10013);
    assert.equal(receipt.isolation.controls.loopbackAccepted, false);
    assert.deepEqual(receipt.coverage.missingLayers, []);
    assert.ok(!receipt.boundaries.includes('host-filesystem-confidentiality'));
    assert.ok(!receipt.boundaries.includes('host-network-isolation'));
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.ok(call.args.includes('--appcontainer-deny'));
      assert.ok(call.args.includes('--protected-sentinel'));
      assert.ok(call.args.includes('q35,accel=whpx,usb=off'));
    }

    for (const mutate of [
      (message) => ({
        ...message,
        isolation: { ...message.isolation, capabilityCount: 1 },
      }),
      (message) => ({
        ...message,
        isolation: { ...message.isolation, filesystemCanaryDenied: false },
      }),
      (message) => ({
        ...message,
        isolation: { ...message.isolation, networkCanaryError: 0 },
      }),
      (message) => ({ ...message, protocol: HOLOSYSTEM_WINDOWS_SANDBOX_PROTOCOL }),
    ]) {
      const blocked = runWhpxAppContainerVmLaunchWithProcessRunnerForTest({
        plan: appContainerPlan(item),
        executorDirectory: item.runtimeDirectory,
        kernelPath: item.kernelPath,
        initrdPath: item.initrdPath,
        processRunner: appContainerProtocolRunner([], mutate),
      });
      assert.equal(blocked.verified, false);
      assert.equal(blocked.isolation.verified, false);
      assert.ok(
        blocked.issues.some((entry) =>
          ['vm-launch-sandbox-evidence-invalid', 'vm-launch-sandbox-protocol-invalid'].includes(
            entry.code
          )
        )
      );
    }
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('boots a fully AppContainer-confined TCG machine without claiming hardware acceleration', () => {
  const item = fixture();
  const calls = [];
  try {
    const plan = appContainerTcgPlan(item);
    assert.equal(inspectAppContainerVmLaunchPlan(plan).ready, true);
    assert.equal(inspectWhpxAppContainerVmLaunchPlan(plan).ready, false);
    const receipt = runAppContainerVmLaunchWithProcessRunnerForTest({
      plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: appContainerProtocolRunner(calls, (message) => message, Buffer.alloc(0)),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });
    assert.equal(receipt.schema, HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(receipt.verified, true);
    assert.equal(receipt.hardwareBacked, false);
    assert.equal(receipt.isolation.verified, true);
    assert.deepEqual(receipt.coverage.missingLayers, ['hardware-hypervisor-acceleration']);
    assert.ok(receipt.coverage.includedLayers.includes('host-filesystem-confidentiality'));
    assert.ok(receipt.coverage.includedLayers.includes('host-network-isolation'));
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.ok(call.args.includes('q35,usb=off'));
      assert.ok(call.args.includes('tcg,tb-size=64'));
      assert.ok(!call.args.includes('q35,accel=whpx,usb=off'));
    }
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('does not overclaim WHPX when explicit execution or diagnostics disagree', () => {
  const cases = [
    {
      result: { status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) },
      code: 'vm-launch-execution-failed',
    },
    {
      result: { status: 33, signal: null, stdout: CONSOLE, stderr: Buffer.from('different') },
      code: 'vm-launch-diagnostics-mismatch',
    },
  ];
  for (const entry of cases) {
    const item = fixture();
    try {
      const plan = structuredClone(item.plan);
      plan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
      plan.target.accelerator = 'whpx';
      plan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
      const receipt = runWhpxVmLaunchWithProcessRunnerForTest({
        plan,
        executorDirectory: item.runtimeDirectory,
        kernelPath: item.kernelPath,
        initrdPath: item.initrdPath,
        processRunner: () => entry.result,
      });
      assert.equal(receipt.verified, false);
      assert.equal(receipt.hardwareBacked, false);
      assert.equal(receipt.acceleration.verified, false);
      assert.ok(receipt.issues.some((issue) => issue.code === entry.code));
    } finally {
      rmSync(item.cwd, { recursive: true, force: true });
    }
  }
});

test('normalizes only a generated WHPX prefix at a diagnostic line boundary', () => {
  const item = fixture();
  try {
    const plan = structuredClone(item.plan);
    plan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
    plan.target.accelerator = 'whpx';
    plan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
    const receipt = runWhpxVmLaunchWithProcessRunnerForTest({
      plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: (command) => ({
        status: 33,
        signal: null,
        stdout: CONSOLE,
        stderr: Buffer.from(`${command}: ${WHPX_DIAGNOSTICS}embedded ${command}: must-remain\r\n`),
      }),
    });
    assert.equal(receipt.verified, false);
    assert.equal(receipt.hardwareBacked, false);
    assert.ok(receipt.issues.some((entry) => entry.code === 'vm-launch-diagnostics-mismatch'));
    assert.ok(!JSON.stringify(receipt).includes('must-remain'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('inspects the complete QEMU runtime closure deterministically', () => {
  const item = fixture();
  try {
    const left = inspectVmExecutor({ executorDirectory: item.runtimeDirectory });
    const right = inspectVmExecutor({ executorDirectory: item.runtimeDirectory });
    assert.equal(left.ready, true);
    assert.equal(left.digest, right.digest);
    assert.equal(left.summary.files, 3);
    assert.equal(left.binaryDigest, sha256('pinned qemu executable'));
    assert.ok(left.files.some((entry) => entry.path === 'share/bios-256k.bin'));
    assert.ok(!JSON.stringify(left).includes(item.runtimeDirectory));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('launches two measured guests through hardened generated QEMU argv', () => {
  const item = fixture();
  const calls = [];
  try {
    const receipt = runVmLaunchWithProcessRunnerForTest({
      plan: item.plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: successfulRunner(calls),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });

    assert.equal(receipt.schema, HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.verified, true);
    assert.equal(receipt.deterministic, true);
    assert.equal(receipt.launches.length, 2);
    assert.match(receipt.measurementDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(receipt.coverage.includedLayers, [
      'guest-artifact-measurement',
      'machine-vm-launch',
      'virtual-device-minimization',
    ]);
    assert.deepEqual(receipt.coverage.missingLayers, [
      'hardware-hypervisor-acceleration',
      'host-process-isolation',
    ]);
    assert.equal(calls.length, 2);

    for (const call of calls) {
      assert.notEqual(call.command, item.executorPath);
      assert.ok(call.args.includes('-no-user-config'));
      assert.ok(call.args.includes('-nodefaults'));
      assert.ok(call.args.includes('q35,accel=tcg,usb=off'));
      assert.ok(call.args.includes('-nic'));
      assert.ok(call.args.includes('none'));
      assert.ok(call.args.includes('-monitor'));
      assert.ok(call.args.includes('-display'));
      assert.ok(call.args.includes('isa-debug-exit,iobase=0xf4,iosize=0x04'));
      assert.ok(!call.args.includes('-netdev'));
      assert.equal(call.options.shell, false);
    }
    assert.ok(!JSON.stringify(receipt).includes(item.cwd));
    assert.ok(!JSON.stringify(receipt).includes('HOLOSYSTEM_VM_OK'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('launches verified private snapshots despite later source substitution', () => {
  const item = fixture();
  const calls = [];
  const runner = successfulRunner(calls);
  try {
    const receipt = runVmLaunchWithProcessRunnerForTest({
      plan: item.plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: (command, args, options) => {
        const snapshotKernel = args[args.indexOf('-kernel') + 1];
        const snapshotInitrd = args[args.indexOf('-initrd') + 1];
        assert.equal(sha256(readFileSync(command)), item.plan.executor.binaryDigest);
        assert.equal(sha256(readFileSync(snapshotKernel)), item.plan.guest.kernelDigest);
        assert.equal(sha256(readFileSync(snapshotInitrd)), item.plan.guest.initrdDigest);
        writeFileSync(item.executorPath, 'attacker replaced qemu');
        writeFileSync(item.kernelPath, 'attacker replaced kernel');
        writeFileSync(item.initrdPath, 'attacker replaced initrd');
        assert.equal(sha256(readFileSync(command)), item.plan.executor.binaryDigest);
        assert.equal(sha256(readFileSync(snapshotKernel)), item.plan.guest.kernelDigest);
        assert.equal(sha256(readFileSync(snapshotInitrd)), item.plan.guest.initrdDigest);
        return runner(command, args, options);
      },
    });
    assert.equal(receipt.verified, true);
    assert.equal(new Set(calls.map((entry) => entry.command)).size, 1);
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('detects persistent mutation of the private launch snapshot', () => {
  const item = fixture();
  let launches = 0;
  try {
    const receipt = runVmLaunchWithProcessRunnerForTest({
      plan: item.plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: (command) => {
        launches += 1;
        if (launches === 1) writeFileSync(command, 'runtime self-modified after measurement');
        return { status: 33, signal: null, stdout: Buffer.from(CONSOLE), stderr: Buffer.alloc(0) };
      },
    });
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((entry) => entry.code === 'vm-launch-snapshot-drift'));
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('blocks runtime and guest artifact drift before process launch', () => {
  const runtime = fixture();
  const guest = fixture();
  try {
    let launches = 0;
    runtime.plan.executor.runtimeDigest = sha256('wrong runtime');
    const runtimeReceipt = runVmLaunchWithProcessRunnerForTest({
      plan: runtime.plan,
      executorDirectory: runtime.runtimeDirectory,
      kernelPath: runtime.kernelPath,
      initrdPath: runtime.initrdPath,
      processRunner: () => {
        launches += 1;
      },
    });
    assert.equal(launches, 0);
    assert.ok(runtimeReceipt.issues.some((entry) => entry.code === 'vm-launch-runtime-mismatch'));

    guest.plan.guest.kernelDigest = sha256('wrong kernel');
    const guestReceipt = runVmLaunchWithProcessRunnerForTest({
      plan: guest.plan,
      executorDirectory: guest.runtimeDirectory,
      kernelPath: guest.kernelPath,
      initrdPath: guest.initrdPath,
      processRunner: () => {
        launches += 1;
      },
    });
    assert.equal(launches, 0);
    assert.ok(guestReceipt.issues.some((entry) => entry.code === 'vm-launch-kernel-mismatch'));
  } finally {
    rmSync(runtime.cwd, { recursive: true, force: true });
    rmSync(guest.cwd, { recursive: true, force: true });
  }
});

test('blocks wrong guest signal, diagnostics, exit code, and nondeterminism', () => {
  const cases = [
    {
      result: { status: 0, stdout: CONSOLE, stderr: Buffer.alloc(0) },
      code: 'vm-launch-exit-mismatch',
    },
    {
      result: { status: 33, stdout: Buffer.from('forged'), stderr: Buffer.alloc(0) },
      code: 'vm-launch-console-mismatch',
    },
    {
      result: { status: 33, stdout: CONSOLE, stderr: Buffer.from('host path secret') },
      code: 'vm-launch-diagnostics-present',
    },
  ];
  for (const entry of cases) {
    const item = fixture();
    try {
      const receipt = runVmLaunchWithProcessRunnerForTest({
        plan: item.plan,
        executorDirectory: item.runtimeDirectory,
        kernelPath: item.kernelPath,
        initrdPath: item.initrdPath,
        processRunner: () => ({ signal: null, ...entry.result }),
      });
      assert.equal(receipt.verified, false);
      assert.ok(receipt.issues.some((issue) => issue.code === entry.code));
      assert.ok(!JSON.stringify(receipt).includes('host path secret'));
    } finally {
      rmSync(item.cwd, { recursive: true, force: true });
    }
  }
});

test('does not publish process-runner injection through the package API', () => {
  const item = fixture();
  let injected = 0;
  try {
    const receipt = runVmLaunch({
      plan: item.plan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: () => {
        injected += 1;
        return { status: 33, stdout: CONSOLE, stderr: Buffer.alloc(0) };
      },
    });
    assert.equal(injected, 0);
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((entry) => entry.code === 'vm-launch-execution-failed'));

    const whpxPlan = structuredClone(item.plan);
    whpxPlan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
    whpxPlan.target.accelerator = 'whpx';
    whpxPlan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
    const whpxReceipt = runWhpxVmLaunch({
      plan: whpxPlan,
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: () => {
        injected += 1;
        return { status: 33, stdout: CONSOLE, stderr: WHPX_DIAGNOSTICS };
      },
    });
    assert.equal(injected, 0);
    assert.equal(whpxReceipt.verified, false);
    assert.equal(whpxReceipt.hardwareBacked, false);
    assert.ok(whpxReceipt.issues.some((entry) => entry.code === 'vm-launch-execution-failed'));

    const sandboxedReceipt = runWhpxSandboxedVmLaunch({
      plan: sandboxedPlan(item),
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: () => {
        injected += 1;
        return sandboxProtocolRunner()('', [], {});
      },
    });
    assert.equal(injected, 0);
    assert.equal(sandboxedReceipt.verified, false);
    assert.equal(sandboxedReceipt.hardwareBacked, false);
    assert.equal(sandboxedReceipt.isolation.verified, false);
    assert.ok(
      sandboxedReceipt.issues.some((entry) =>
        ['vm-launch-sandbox-evidence-invalid', 'vm-launch-sandbox-launcher-failed'].includes(
          entry.code
        )
      )
    );

    const appContainerReceipt = runWhpxAppContainerVmLaunch({
      plan: appContainerPlan(item),
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: () => {
        injected += 1;
        return appContainerProtocolRunner()('', [], {});
      },
    });
    assert.equal(injected, 0);
    assert.equal(appContainerReceipt.verified, false);
    assert.equal(appContainerReceipt.hardwareBacked, false);
    assert.equal(appContainerReceipt.isolation.verified, false);
    assert.ok(
      appContainerReceipt.issues.some((entry) =>
        ['vm-launch-sandbox-evidence-invalid', 'vm-launch-sandbox-launcher-failed'].includes(
          entry.code
        )
      )
    );

    const appContainerTcgReceipt = runAppContainerVmLaunch({
      plan: appContainerTcgPlan(item),
      executorDirectory: item.runtimeDirectory,
      kernelPath: item.kernelPath,
      initrdPath: item.initrdPath,
      processRunner: () => {
        injected += 1;
        return appContainerProtocolRunner([], (message) => message, Buffer.alloc(0))('', [], {});
      },
    });
    assert.equal(injected, 0);
    assert.equal(appContainerTcgReceipt.verified, false);
    assert.equal(appContainerTcgReceipt.isolation.verified, false);
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});

test('exposes executor and asset inspection plus fail-closed launch through the CLI', () => {
  const item = fixture();
  try {
    const cli = fileURLToPath(new URL('../bin/holosystem.mjs', import.meta.url));
    const executor = spawnSync(
      process.execPath,
      [cli, 'vm-executor', '--runtime', item.runtimeDirectory, '--json'],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(executor.status, 0, executor.stderr);
    assert.equal(JSON.parse(executor.stdout).ready, true);

    const kernel = spawnSync(
      process.execPath,
      [cli, 'vm-asset', '--kind', 'kernel', '--file', item.kernelPath, '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(kernel.status, 0, kernel.stderr);
    assert.equal(JSON.parse(kernel.stdout).digest, item.plan.guest.kernelDigest);

    const unsafe = structuredClone(item.plan);
    unsafe.command = 'cmd.exe /c whoami';
    const planPath = join(item.cwd, 'unsafe-plan.json');
    writeFileSync(planPath, JSON.stringify(unsafe));
    const blocked = spawnSync(
      process.execPath,
      [
        cli,
        'vm-launch',
        '--plan',
        planPath,
        '--runtime',
        item.runtimeDirectory,
        '--kernel',
        item.kernelPath,
        '--initrd',
        item.initrdPath,
        '--json',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(blocked.status, 2);
    const receipt = JSON.parse(blocked.stdout);
    assert.equal(receipt.verified, false);
    assert.ok(receipt.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));
    assert.ok(!blocked.stdout.includes(item.cwd));

    const whpxPlan = structuredClone(item.plan);
    whpxPlan.schema = HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA;
    whpxPlan.target.accelerator = 'whpx';
    whpxPlan.guest.expectedDiagnosticsDigest = sha256(WHPX_DIAGNOSTICS);
    whpxPlan.fallback = 'tcg';
    const whpxPlanPath = join(item.cwd, 'unsafe-whpx-plan.json');
    writeFileSync(whpxPlanPath, JSON.stringify(whpxPlan));
    const whpxBlocked = spawnSync(
      process.execPath,
      [
        cli,
        'vm-launch-whpx',
        '--plan',
        whpxPlanPath,
        '--runtime',
        item.runtimeDirectory,
        '--kernel',
        item.kernelPath,
        '--initrd',
        item.initrdPath,
        '--json',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(whpxBlocked.status, 2);
    const whpxReceipt = JSON.parse(whpxBlocked.stdout);
    assert.equal(whpxReceipt.schema, HOLOSYSTEM_WHPX_VM_LAUNCH_RECEIPT_SCHEMA);
    assert.equal(whpxReceipt.verified, false);
    assert.ok(whpxReceipt.issues.some((entry) => entry.code === 'vm-launch-field-unknown'));

    const appContainerUnsafe = appContainerPlan(item);
    appContainerUnsafe.capabilities = ['internetClient'];
    const appContainerPlanPath = join(item.cwd, 'unsafe-appcontainer-plan.json');
    writeFileSync(appContainerPlanPath, JSON.stringify(appContainerUnsafe));
    const appContainerBlocked = spawnSync(
      process.execPath,
      [
        cli,
        'vm-launch-whpx-appcontainer',
        '--plan',
        appContainerPlanPath,
        '--runtime',
        item.runtimeDirectory,
        '--kernel',
        item.kernelPath,
        '--initrd',
        item.initrdPath,
        '--json',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(appContainerBlocked.status, 2);
    const appContainerReceipt = JSON.parse(appContainerBlocked.stdout);
    assert.equal(
      appContainerReceipt.schema,
      HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA
    );
    assert.equal(appContainerReceipt.verified, false);
    assert.ok(
      appContainerReceipt.issues.some((entry) => entry.code === 'vm-launch-field-unknown')
    );
  } finally {
    rmSync(item.cwd, { recursive: true, force: true });
  }
});
