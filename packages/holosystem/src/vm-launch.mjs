import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA = 'holoscript.holosystem.vm-launch-plan.v1';
export const HOLOSYSTEM_VM_EXECUTOR_SCHEMA = 'holoscript.holosystem.vm-executor.v1';
export const HOLOSYSTEM_VM_ASSET_SCHEMA = 'holoscript.holosystem.vm-asset.v1';
export const HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA = 'holoscript.holosystem.vm-launch-receipt.v1';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const EXECUTOR_BINARY = 'qemu-system-x86_64.exe';
const MAX_RUNTIME_FILES = 1024;
const MAX_RUNTIME_FILE_BYTES = 128 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 512 * 1024 * 1024;
const MAX_KERNEL_BYTES = 128 * 1024 * 1024;
const MAX_INITRD_BYTES = 512 * 1024 * 1024;
const MAX_CONSOLE_BYTES = 1024 * 1024;
const EXPECTED_EXIT_CODE = 33;
const POLICY = Object.freeze({
  accelerator: 'tcg',
  userConfiguration: 'disabled',
  defaultDevices: 'disabled',
  network: 'none',
  display: 'none',
  monitor: 'none',
  usb: 'disabled',
  reboot: 'disabled',
  processEnvironment: 'minimal',
  guestSignal: 'serial-digest-and-debug-exit',
});
const BOUNDARIES = Object.freeze([
  'guest-artifact-provenance',
  'hardware-hypervisor-acceleration',
  'host-crash-dump-custody',
  'host-os-and-emulator-correctness',
  'host-process-isolation',
  'measured-boot-and-firmware',
  'qemu-runtime-supply-chain',
  'side-channel-resistance',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(JSON.stringify(value));
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value);
}

function portableRuntimePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    !/(?:^|\/)\.\.?(?:\/|$)/u.test(value) &&
    !/[\r\n]/u.test(value)
  );
}

function knownKeys(value, allowed, path, issues) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        'vm-launch-field-unknown',
        path ? `${path}.${key}` : key,
        'Field is not part of the declarative machine-VM launch vocabulary.'
      );
    }
  }
}

function inspectDigest(value, path, issues) {
  if (!DIGEST_PATTERN.test(value || '')) {
    issue(issues, 'vm-launch-digest-invalid', path, 'Value must be a lowercase SHA-256 digest.');
  }
}

function normalizedPlan(plan) {
  return {
    schema: plan.schema,
    id: plan.id,
    host: { os: plan.host.os, architecture: plan.host.architecture },
    executor: {
      kind: plan.executor.kind,
      binary: plan.executor.binary,
      binaryDigest: plan.executor.binaryDigest,
      runtimeDigest: plan.executor.runtimeDigest,
    },
    target: {
      architecture: plan.target.architecture,
      machine: plan.target.machine,
      accelerator: plan.target.accelerator,
    },
    guest: {
      kernelDigest: plan.guest.kernelDigest,
      initrdDigest: plan.guest.initrdDigest,
      expectedConsoleDigest: plan.guest.expectedConsoleDigest,
    },
    resources: {
      memoryMiB: plan.resources.memoryMiB,
      cpus: plan.resources.cpus,
      timeoutSeconds: plan.resources.timeoutSeconds,
    },
    launches: plan.launches,
  };
}

export function inspectVmLaunchPlan(plan) {
  const issues = [];
  if (!isRecord(plan)) {
    issue(issues, 'vm-launch-plan-invalid', '$', 'VM launch plan must be a JSON object.');
    return { ready: false, issues };
  }

  knownKeys(
    plan,
    new Set(['schema', 'id', 'host', 'executor', 'target', 'guest', 'resources', 'launches']),
    '',
    issues
  );
  if (plan.schema !== HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA) {
    issue(
      issues,
      'vm-launch-schema-mismatch',
      'schema',
      `Expected ${HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA}.`
    );
  }
  if (!validId(plan.id)) {
    issue(issues, 'vm-launch-id-invalid', 'id', 'Launch id must be a portable identifier.');
  }

  knownKeys(plan.host, new Set(['os', 'architecture']), 'host', issues);
  if (plan.host?.os !== 'windows' || plan.host?.architecture !== 'amd64') {
    issue(
      issues,
      'vm-launch-host-unsupported',
      'host',
      'This tracer supports only a Windows AMD64 host.'
    );
  }

  knownKeys(
    plan.executor,
    new Set(['kind', 'binary', 'binaryDigest', 'runtimeDigest']),
    'executor',
    issues
  );
  if (plan.executor?.kind !== 'qemu-system' || plan.executor?.binary !== EXECUTOR_BINARY) {
    issue(
      issues,
      'vm-launch-executor-unsupported',
      'executor',
      `This tracer supports only ${EXECUTOR_BINARY}.`
    );
  }
  inspectDigest(plan.executor?.binaryDigest, 'executor.binaryDigest', issues);
  inspectDigest(plan.executor?.runtimeDigest, 'executor.runtimeDigest', issues);

  knownKeys(plan.target, new Set(['architecture', 'machine', 'accelerator']), 'target', issues);
  if (plan.target?.architecture !== 'amd64' || plan.target?.machine !== 'q35') {
    issue(
      issues,
      'vm-launch-target-unsupported',
      'target',
      'This tracer supports only the explicit AMD64 q35 machine target.'
    );
  }
  if (plan.target?.accelerator !== 'tcg') {
    issue(
      issues,
      'vm-launch-accelerator-unsupported',
      'target.accelerator',
      'Only the software TCG tracer is supported; hardware-backed claims require a separate adapter.'
    );
  }

  knownKeys(
    plan.guest,
    new Set(['kernelDigest', 'initrdDigest', 'expectedConsoleDigest']),
    'guest',
    issues
  );
  inspectDigest(plan.guest?.kernelDigest, 'guest.kernelDigest', issues);
  inspectDigest(plan.guest?.initrdDigest, 'guest.initrdDigest', issues);
  inspectDigest(plan.guest?.expectedConsoleDigest, 'guest.expectedConsoleDigest', issues);

  knownKeys(plan.resources, new Set(['memoryMiB', 'cpus', 'timeoutSeconds']), 'resources', issues);
  if (
    plan.resources?.memoryMiB !== 128 ||
    plan.resources?.cpus !== 1 ||
    !Number.isInteger(plan.resources?.timeoutSeconds) ||
    plan.resources.timeoutSeconds < 5 ||
    plan.resources.timeoutSeconds > 120
  ) {
    issue(
      issues,
      'vm-launch-limit-invalid',
      'resources',
      'Resources require 128 MiB, one CPU, and a timeout from 5 to 120 seconds.'
    );
  }
  if (plan.launches !== 2) {
    issue(
      issues,
      'vm-launch-count-invalid',
      'launches',
      'Exactly two clean launches are required for a deterministic receipt.'
    );
  }

  return { ready: issues.length === 0, issues };
}

function scanRuntime(directory, issues) {
  const files = [];
  let totalBytes = 0;
  let stopped = false;

  function visit(current) {
    if (stopped) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
        lexical(left.name, right.name)
      );
    } catch {
      issue(issues, 'vm-executor-unreadable', 'executorDirectory', 'Runtime could not be read.');
      stopped = true;
      return;
    }

    for (const entry of entries) {
      if (stopped) return;
      const absolute = join(current, entry.name);
      const portable = relative(directory, absolute).split(sep).join('/');
      let stats;
      try {
        stats = lstatSync(absolute);
      } catch {
        issue(
          issues,
          'vm-executor-unreadable',
          `runtime.files.${portable}`,
          'A runtime entry could not be inspected.'
        );
        continue;
      }
      if (stats.isSymbolicLink()) {
        issue(
          issues,
          'vm-executor-link-forbidden',
          `runtime.files.${portable}`,
          'Symbolic links and reparse-point indirection are not executor inputs.'
        );
        continue;
      }
      if (stats.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!stats.isFile()) {
        issue(
          issues,
          'vm-executor-type-forbidden',
          `runtime.files.${portable}`,
          'Only regular runtime files are accepted.'
        );
        continue;
      }
      if (!portableRuntimePath(portable)) {
        issue(
          issues,
          'vm-executor-path-invalid',
          `runtime.files.${portable}`,
          'Runtime paths must be portable relative paths.'
        );
        continue;
      }
      if (stats.size > MAX_RUNTIME_FILE_BYTES) {
        issue(
          issues,
          'vm-executor-file-too-large',
          `runtime.files.${portable}`,
          'A runtime file exceeds the per-file limit.'
        );
        continue;
      }
      let content;
      try {
        content = readFileSync(absolute);
      } catch {
        issue(
          issues,
          'vm-executor-unreadable',
          `runtime.files.${portable}`,
          'A runtime file could not be read.'
        );
        continue;
      }
      totalBytes += content.length;
      files.push({ path: portable, bytes: content.length, digest: hashBytes(content) });
      if (files.length > MAX_RUNTIME_FILES) {
        issue(
          issues,
          'vm-executor-file-limit',
          'runtime.files',
          'Runtime exceeds the file-count limit.'
        );
        stopped = true;
      } else if (totalBytes > MAX_RUNTIME_BYTES) {
        issue(
          issues,
          'vm-executor-too-large',
          'runtime.files',
          'Runtime exceeds the aggregate byte limit.'
        );
        stopped = true;
      }
    }
  }

  visit(directory);
  return files.sort((left, right) => lexical(left.path, right.path));
}

export function inspectVmExecutor({ executorDirectory } = {}) {
  const issues = [];
  const directory = typeof executorDirectory === 'string' ? resolve(executorDirectory) : null;
  let directoryReady = false;
  try {
    const stats = lstatSync(directory);
    directoryReady = stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    directoryReady = false;
  }
  if (!directoryReady) {
    issue(
      issues,
      'vm-executor-directory-invalid',
      'executorDirectory',
      'Executor input must be a real caller-owned directory.'
    );
  }

  const files = directoryReady ? scanRuntime(directory, issues) : [];
  const binary = files.find((entry) => entry.path === EXECUTOR_BINARY);
  if (!binary) {
    issue(
      issues,
      'vm-executor-binary-missing',
      'runtime.binary',
      `Runtime must contain ${EXECUTOR_BINARY} at its root.`
    );
  }
  const envelope = { schema: HOLOSYSTEM_VM_EXECUTOR_SCHEMA, binary: EXECUTOR_BINARY, files };
  return {
    schema: HOLOSYSTEM_VM_EXECUTOR_SCHEMA,
    ready: issues.length === 0,
    binary: EXECUTOR_BINARY,
    binaryDigest: binary?.digest || null,
    digest: issues.length === 0 ? hashJson(envelope) : null,
    files,
    summary: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    },
    issues,
  };
}

export function inspectVmLaunchAsset({ assetPath, kind } = {}) {
  const issues = [];
  if (!['kernel', 'initrd'].includes(kind)) {
    issue(issues, 'vm-asset-kind-invalid', 'kind', 'Asset kind must be kernel or initrd.');
  }
  const absolute = typeof assetPath === 'string' ? resolve(assetPath) : null;
  let content = null;
  try {
    const stats = lstatSync(absolute);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new TypeError('not a regular file');
    const maximum = kind === 'kernel' ? MAX_KERNEL_BYTES : MAX_INITRD_BYTES;
    if (stats.size > maximum) {
      issue(issues, 'vm-asset-too-large', 'assetPath', 'Guest asset exceeds its byte limit.');
    } else {
      content = readFileSync(absolute);
    }
  } catch {
    issue(
      issues,
      'vm-asset-file-invalid',
      'assetPath',
      'Guest asset must be a readable regular caller-owned file.'
    );
  }
  return {
    schema: HOLOSYSTEM_VM_ASSET_SCHEMA,
    ready: issues.length === 0,
    kind: ['kernel', 'initrd'].includes(kind) ? kind : null,
    digest: content && issues.length === 0 ? hashBytes(content) : null,
    bytes: content && issues.length === 0 ? content.length : null,
    issues,
  };
}

function logSummary(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return { bytes: bytes.length, digest: hashBytes(bytes) };
}

function finishReceipt(receipt) {
  return { ...receipt, receiptHash: hashJson(receipt) };
}

function baseReceipt(plan, now, issues) {
  return {
    schema: HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA,
    generatedAt: now.toISOString(),
    id: validId(plan?.id) ? plan.id : null,
    status: 'blocked',
    verified: false,
    deterministic: false,
    hardwareBacked: false,
    measurementDigest: null,
    executor: {
      kind: plan?.executor?.kind === 'qemu-system' ? 'qemu-system' : null,
      binaryDigest: DIGEST_PATTERN.test(plan?.executor?.binaryDigest || '')
        ? plan.executor.binaryDigest
        : null,
      runtimeDigest: DIGEST_PATTERN.test(plan?.executor?.runtimeDigest || '')
        ? plan.executor.runtimeDigest
        : null,
    },
    guest: {
      kernelDigest: DIGEST_PATTERN.test(plan?.guest?.kernelDigest || '')
        ? plan.guest.kernelDigest
        : null,
      initrdDigest: DIGEST_PATTERN.test(plan?.guest?.initrdDigest || '')
        ? plan.guest.initrdDigest
        : null,
      expectedConsoleDigest: DIGEST_PATTERN.test(plan?.guest?.expectedConsoleDigest || '')
        ? plan.guest.expectedConsoleDigest
        : null,
    },
    target:
      plan?.target?.architecture === 'amd64' && plan?.target?.machine === 'q35'
        ? { architecture: 'amd64', machine: 'q35', accelerator: 'tcg' }
        : null,
    resources:
      isRecord(plan?.resources) &&
      Number.isInteger(plan.resources.memoryMiB) &&
      Number.isInteger(plan.resources.cpus) &&
      Number.isInteger(plan.resources.timeoutSeconds)
        ? {
            memoryMiB: plan.resources.memoryMiB,
            cpus: plan.resources.cpus,
            timeoutSeconds: plan.resources.timeoutSeconds,
          }
        : null,
    policy: { ...POLICY },
    launches: [],
    coverage: {
      includedLayers: [],
      missingLayers: [
        'guest-artifact-measurement',
        'hardware-hypervisor-acceleration',
        'host-process-isolation',
        'machine-vm-launch',
        'virtual-device-minimization',
      ],
    },
    boundaries: [...BOUNDARIES],
    issues,
  };
}

function qemuArguments(plan, kernelPath, initrdPath) {
  return [
    '-no-user-config',
    '-nodefaults',
    '-machine',
    'q35,accel=tcg,usb=off',
    '-cpu',
    'max',
    '-m',
    `${plan.resources.memoryMiB}M`,
    '-smp',
    String(plan.resources.cpus),
    '-display',
    'none',
    '-serial',
    'stdio',
    '-monitor',
    'none',
    '-nic',
    'none',
    '-no-reboot',
    '-kernel',
    kernelPath,
    '-initrd',
    initrdPath,
    '-append',
    'console=ttyS0,115200 quiet loglevel=0 rdinit=/init panic=-1 random.trust_cpu=off',
    '-device',
    'isa-debug-exit,iobase=0xf4,iosize=0x04',
  ];
}

function minimalEnvironment(snapshotRoot, runtimeDirectory) {
  const env = {
    HOME: snapshotRoot,
    USERPROFILE: snapshotRoot,
    TEMP: snapshotRoot,
    TMP: snapshotRoot,
    PATH: runtimeDirectory,
    LANG: 'C',
    LC_ALL: 'C',
  };
  if (typeof process.env.SystemRoot === 'string') env.SystemRoot = process.env.SystemRoot;
  if (typeof process.env.WINDIR === 'string') env.WINDIR = process.env.WINDIR;
  return env;
}

function copyRuntimeSnapshot(sourceDirectory, report, destinationDirectory) {
  mkdirSync(destinationDirectory, { recursive: true });
  for (const file of report.files) {
    const target = join(destinationDirectory, file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(sourceDirectory, file.path), target);
  }
}

function launchSnapshotMatches(plan, runtimeDirectory, kernelPath, initrdPath) {
  const executor = inspectVmExecutor({ executorDirectory: runtimeDirectory });
  const kernel = inspectVmLaunchAsset({ assetPath: kernelPath, kind: 'kernel' });
  const initrd = inspectVmLaunchAsset({ assetPath: initrdPath, kind: 'initrd' });
  return (
    executor.ready &&
    executor.digest === plan.executor.runtimeDigest &&
    executor.binaryDigest === plan.executor.binaryDigest &&
    kernel.ready &&
    kernel.digest === plan.guest.kernelDigest &&
    initrd.ready &&
    initrd.digest === plan.guest.initrdDigest
  );
}

function runVmLaunchWithProcessRunner(
  { plan, executorDirectory, kernelPath, initrdPath, now = new Date() } = {},
  processRunner
) {
  const inspection = inspectVmLaunchPlan(plan);
  const receipt = baseReceipt(plan, now, [...inspection.issues]);
  if (!inspection.ready) return finishReceipt(receipt);

  const executor = inspectVmExecutor({ executorDirectory });
  const kernel = inspectVmLaunchAsset({ assetPath: kernelPath, kind: 'kernel' });
  const initrd = inspectVmLaunchAsset({ assetPath: initrdPath, kind: 'initrd' });
  receipt.issues.push(...executor.issues, ...kernel.issues, ...initrd.issues);
  if (executor.ready && executor.digest !== plan.executor.runtimeDigest) {
    issue(
      receipt.issues,
      'vm-launch-runtime-mismatch',
      'executor.runtimeDigest',
      'QEMU runtime closure does not match the pinned plan digest.'
    );
  }
  if (executor.ready && executor.binaryDigest !== plan.executor.binaryDigest) {
    issue(
      receipt.issues,
      'vm-launch-binary-mismatch',
      'executor.binaryDigest',
      'QEMU binary does not match the pinned plan digest.'
    );
  }
  if (kernel.ready && kernel.digest !== plan.guest.kernelDigest) {
    issue(
      receipt.issues,
      'vm-launch-kernel-mismatch',
      'guest.kernelDigest',
      'Guest kernel does not match the pinned plan digest.'
    );
  }
  if (initrd.ready && initrd.digest !== plan.guest.initrdDigest) {
    issue(
      receipt.issues,
      'vm-launch-initrd-mismatch',
      'guest.initrdDigest',
      'Guest initrd does not match the pinned plan digest.'
    );
  }
  if (receipt.issues.length > 0) return finishReceipt(receipt);

  const sourceRuntime = resolve(executorDirectory);
  const sourceKernel = resolve(kernelPath);
  const sourceInitrd = resolve(initrdPath);
  const snapshotRoot = mkdtempSync(join(tmpdir(), 'holosystem-vm-launch-'));
  const snapshotRuntime = join(snapshotRoot, 'runtime');
  const snapshotKernel = join(snapshotRoot, 'vmlinuz');
  const snapshotInitrd = join(snapshotRoot, 'initramfs');

  try {
    try {
      copyRuntimeSnapshot(sourceRuntime, executor, snapshotRuntime);
      copyFileSync(sourceKernel, snapshotKernel);
      copyFileSync(sourceInitrd, snapshotInitrd);
    } catch {
      issue(
        receipt.issues,
        'vm-launch-snapshot-failed',
        'snapshot',
        'A private verified launch snapshot could not be materialized.'
      );
      return finishReceipt(receipt);
    }

    const pinnedExecutor = inspectVmExecutor({ executorDirectory: snapshotRuntime });
    const pinnedKernel = inspectVmLaunchAsset({ assetPath: snapshotKernel, kind: 'kernel' });
    const pinnedInitrd = inspectVmLaunchAsset({ assetPath: snapshotInitrd, kind: 'initrd' });
    if (
      !pinnedExecutor.ready ||
      pinnedExecutor.digest !== plan.executor.runtimeDigest ||
      pinnedExecutor.binaryDigest !== plan.executor.binaryDigest
    ) {
      issue(
        receipt.issues,
        'vm-launch-runtime-snapshot-mismatch',
        'executor.runtimeDigest',
        'QEMU changed while its private launch snapshot was materialized.'
      );
    }
    if (!pinnedKernel.ready || pinnedKernel.digest !== plan.guest.kernelDigest) {
      issue(
        receipt.issues,
        'vm-launch-kernel-snapshot-mismatch',
        'guest.kernelDigest',
        'Guest kernel changed while its private launch snapshot was materialized.'
      );
    }
    if (!pinnedInitrd.ready || pinnedInitrd.digest !== plan.guest.initrdDigest) {
      issue(
        receipt.issues,
        'vm-launch-initrd-snapshot-mismatch',
        'guest.initrdDigest',
        'Guest initrd changed while its private launch snapshot was materialized.'
      );
    }
    if (receipt.issues.length > 0) return finishReceipt(receipt);

    receipt.measurementDigest = hashJson({
      plan: normalizedPlan(plan),
      executorDigest: pinnedExecutor.digest,
      binaryDigest: pinnedExecutor.binaryDigest,
      kernelDigest: pinnedKernel.digest,
      initrdDigest: pinnedInitrd.digest,
      policy: POLICY,
    });

    const command = join(snapshotRuntime, EXECUTOR_BINARY);
    const args = qemuArguments(plan, snapshotKernel, snapshotInitrd);
    const options = {
      encoding: null,
      env: minimalEnvironment(snapshotRoot, snapshotRuntime),
      maxBuffer: MAX_CONSOLE_BYTES,
      shell: false,
      timeout: plan.resources.timeoutSeconds * 1000,
      windowsHide: true,
    };

    for (let index = 0; index < plan.launches; index += 1) {
      if (!launchSnapshotMatches(plan, snapshotRuntime, snapshotKernel, snapshotInitrd)) {
        issue(
          receipt.issues,
          'vm-launch-snapshot-drift',
          `launches[${index}].snapshot`,
          'The private launch snapshot changed outside the measured execution boundary.'
        );
        break;
      }
      let result;
      try {
        result = processRunner(command, args, options);
      } catch {
        result = { status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      const stdout = logSummary(result?.stdout);
      const stderr = logSummary(result?.stderr);
      const launch = {
        index: index + 1,
        exitCode: Number.isInteger(result?.status) ? result.status : null,
        signal: typeof result?.signal === 'string' ? result.signal : null,
        stdout,
        stderr,
      };
      receipt.launches.push(launch);
      if (result?.status === null || result?.status === undefined || result?.error) {
        issue(
          receipt.issues,
          'vm-launch-execution-failed',
          `launches[${index}]`,
          'Measured VM execution failed or exceeded its bound.'
        );
      } else if (result.status !== EXPECTED_EXIT_CODE) {
        issue(
          receipt.issues,
          'vm-launch-exit-mismatch',
          `launches[${index}].exitCode`,
          'Guest did not exit through the pinned debug-exit signal.'
        );
      }
      if (stdout.digest !== plan.guest.expectedConsoleDigest) {
        issue(
          receipt.issues,
          'vm-launch-console-mismatch',
          `launches[${index}].stdout`,
          'Guest serial output does not match the pinned success digest.'
        );
      }
      if (stderr.bytes !== 0) {
        issue(
          receipt.issues,
          'vm-launch-diagnostics-present',
          `launches[${index}].stderr`,
          'Host emulator diagnostics were emitted; raw bytes are withheld.'
        );
      }
      if (!launchSnapshotMatches(plan, snapshotRuntime, snapshotKernel, snapshotInitrd)) {
        issue(
          receipt.issues,
          'vm-launch-snapshot-drift',
          `launches[${index}].snapshot`,
          'The private launch snapshot changed during measured execution.'
        );
        break;
      }
    }
  } finally {
    rmSync(snapshotRoot, { recursive: true, force: true });
  }

  const launchSignatures = receipt.launches.map(({ exitCode, signal, stdout, stderr }) =>
    hashJson({ exitCode, signal, stdout, stderr })
  );
  if (launchSignatures.length === plan.launches && new Set(launchSignatures).size !== 1) {
    issue(
      receipt.issues,
      'vm-launch-nondeterministic',
      'launches',
      'Clean measured launches produced different observable results.'
    );
  }
  receipt.deterministic =
    receipt.issues.length === 0 &&
    launchSignatures.length === plan.launches &&
    new Set(launchSignatures).size === 1;
  if (receipt.deterministic) {
    receipt.status = 'verified';
    receipt.verified = true;
    receipt.coverage = {
      includedLayers: [
        'guest-artifact-measurement',
        'machine-vm-launch',
        'virtual-device-minimization',
      ],
      missingLayers: ['hardware-hypervisor-acceleration', 'host-process-isolation'],
    };
  }
  return finishReceipt(receipt);
}

export function runVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync);
}

// Repository tests need a deterministic process boundary without publishing an
// injectable executor through the package root export.
export function runVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner);
}
