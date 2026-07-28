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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA = 'holoscript.holosystem.vm-launch-plan.v1';
export const HOLOSYSTEM_VM_EXECUTOR_SCHEMA = 'holoscript.holosystem.vm-executor.v1';
export const HOLOSYSTEM_VM_ASSET_SCHEMA = 'holoscript.holosystem.vm-asset.v1';
export const HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA = 'holoscript.holosystem.vm-launch-receipt.v1';
export const HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA = 'holoscript.holosystem.whpx-vm-launch-plan.v1';
export const HOLOSYSTEM_WHPX_VM_LAUNCH_RECEIPT_SCHEMA =
  'holoscript.holosystem.whpx-vm-launch-receipt.v1';
export const HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_PLAN_SCHEMA =
  'holoscript.holosystem.whpx-sandboxed-vm-launch-plan.v1';
export const HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_RECEIPT_SCHEMA =
  'holoscript.holosystem.whpx-sandboxed-vm-launch-receipt.v1';
export const HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA =
  'holoscript.holosystem.whpx-appcontainer-vm-launch-plan.v1';
export const HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA =
  'holoscript.holosystem.whpx-appcontainer-vm-launch-receipt.v1';
export const HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA =
  'holoscript.holosystem.appcontainer-vm-launch-plan.v1';
export const HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA =
  'holoscript.holosystem.appcontainer-vm-launch-receipt.v1';
export const HOLOSYSTEM_WINDOWS_SANDBOX_PROTOCOL =
  'holoscript.holosystem.windows-sandbox-launch.v1';
export const HOLOSYSTEM_WINDOWS_APPCONTAINER_PROTOCOL =
  'holoscript.holosystem.windows-appcontainer-launch.v1';
export const HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_SCHEMA =
  'holoscript.holosystem.windows-sandbox-launcher.v1';
export const HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_SCHEMA =
  'holoscript.holosystem.windows-appcontainer-canary.v1';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const EXECUTOR_BINARY = 'qemu-system-x86_64.exe';
const MAX_RUNTIME_FILES = 1024;
const MAX_RUNTIME_FILE_BYTES = 128 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 512 * 1024 * 1024;
const MAX_KERNEL_BYTES = 128 * 1024 * 1024;
const MAX_INITRD_BYTES = 512 * 1024 * 1024;
const MAX_CONSOLE_BYTES = 1024 * 1024;
const EXPECTED_EXIT_CODE = 33;
const SANDBOX_LAUNCHER_BINARY = 'holosystem-sandbox-launcher.exe';
const APPCONTAINER_CANARY_BINARY = 'holosystem-appcontainer-canary.exe';
const SANDBOX_KIND = 'windows-low-integrity-job-v1';
const APPCONTAINER_KIND = 'windows-appcontainer-deny-v1';
const SANDBOX_PROCESS_MEMORY_BYTES = 512 * 1024 * 1024;
const SANDBOX_PROTOCOL_BYTES = 3 * 1024 * 1024;
const SANDBOX_LAUNCHER_PATH = fileURLToPath(
  new URL(`../native/windows-x64/${SANDBOX_LAUNCHER_BINARY}`, import.meta.url)
);
const APPCONTAINER_CANARY_PATH = fileURLToPath(
  new URL(`../native/windows-x64/${APPCONTAINER_CANARY_BINARY}`, import.meta.url)
);
export const HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST = hashBytes(
  readFileSync(SANDBOX_LAUNCHER_PATH)
);
export const HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST = hashBytes(
  readFileSync(APPCONTAINER_CANARY_PATH)
);
const TCG_POLICY = Object.freeze({
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
  diagnostics: 'none',
});
const WHPX_POLICY = Object.freeze({
  accelerator: 'whpx',
  userConfiguration: 'disabled',
  defaultDevices: 'disabled',
  network: 'none',
  display: 'none',
  monitor: 'none',
  usb: 'disabled',
  reboot: 'disabled',
  processEnvironment: 'minimal',
  guestSignal: 'serial-digest-and-debug-exit',
  diagnostics: 'pinned-digest',
});
const WHPX_SANDBOXED_POLICY = Object.freeze({
  ...WHPX_POLICY,
  hostProcess: SANDBOX_KIND,
  token: 'disable-max-privilege-low-integrity',
  job: 'pre-resume-kill-on-close-active-process-memory-ui',
  writableTemp: 'low-integrity-private-snapshot',
});
const WHPX_APPCONTAINER_POLICY = Object.freeze({
  ...WHPX_POLICY,
  hostProcess: APPCONTAINER_KIND,
  token: 'disable-max-privilege-appcontainer-low-integrity',
  capabilities: 'none',
  filesystem: 'snapshot-read-execute-writable-temp-modify',
  network: 'appcontainer-default-deny',
  canaries: 'caller-readable-sentinel-and-loopback-listener',
  job: 'pre-resume-kill-on-close-active-process-memory-ui',
});
const APPCONTAINER_TCG_POLICY = Object.freeze({
  ...TCG_POLICY,
  network: 'appcontainer-default-deny',
  hostProcess: APPCONTAINER_KIND,
  token: 'disable-max-privilege-appcontainer-low-integrity',
  capabilities: 'none',
  filesystem: 'snapshot-read-execute-writable-temp-modify',
  canaries: 'caller-readable-sentinel-and-loopback-listener',
  job: 'pre-resume-kill-on-close-active-process-memory-ui',
  translationBufferMiB: 64,
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
const TCG_ADAPTER = Object.freeze({
  accelerator: 'tcg',
  accelerationName: 'qemu-tcg',
  hardwareBacked: false,
  planSchema: HOLOSYSTEM_VM_LAUNCH_PLAN_SCHEMA,
  receiptSchema: HOLOSYSTEM_VM_LAUNCH_RECEIPT_SCHEMA,
  policy: TCG_POLICY,
  requiresDiagnosticsDigest: false,
});
const WHPX_ADAPTER = Object.freeze({
  accelerator: 'whpx',
  accelerationName: 'qemu-whpx',
  hardwareBacked: true,
  planSchema: HOLOSYSTEM_WHPX_VM_LAUNCH_PLAN_SCHEMA,
  receiptSchema: HOLOSYSTEM_WHPX_VM_LAUNCH_RECEIPT_SCHEMA,
  policy: WHPX_POLICY,
  requiresDiagnosticsDigest: true,
  hostSandboxed: false,
});
const WHPX_SANDBOXED_ADAPTER = Object.freeze({
  accelerator: 'whpx',
  accelerationName: 'qemu-whpx',
  hardwareBacked: true,
  planSchema: HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_PLAN_SCHEMA,
  receiptSchema: HOLOSYSTEM_WHPX_SANDBOXED_VM_LAUNCH_RECEIPT_SCHEMA,
  policy: WHPX_SANDBOXED_POLICY,
  requiresDiagnosticsDigest: true,
  hostSandboxed: true,
  sandboxKind: SANDBOX_KIND,
  sandboxProtocol: HOLOSYSTEM_WINDOWS_SANDBOX_PROTOCOL,
  isolationScope: 'integrity-privilege-lifetime-resource-ui',
  filesystemConfidentiality: false,
  networkIsolation: false,
  appContainer: false,
});
const WHPX_APPCONTAINER_ADAPTER = Object.freeze({
  accelerator: 'whpx',
  accelerationName: 'qemu-whpx',
  hardwareBacked: true,
  planSchema: HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA,
  receiptSchema: HOLOSYSTEM_WHPX_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA,
  policy: WHPX_APPCONTAINER_POLICY,
  requiresDiagnosticsDigest: true,
  hostSandboxed: true,
  sandboxKind: APPCONTAINER_KIND,
  sandboxProtocol: HOLOSYSTEM_WINDOWS_APPCONTAINER_PROTOCOL,
  isolationScope: 'appcontainer-zero-capability-snapshot-grant',
  filesystemConfidentiality: true,
  networkIsolation: true,
  appContainer: true,
});
const APPCONTAINER_TCG_ADAPTER = Object.freeze({
  accelerator: 'tcg',
  accelerationName: 'qemu-tcg',
  hardwareBacked: false,
  planSchema: HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_PLAN_SCHEMA,
  receiptSchema: HOLOSYSTEM_APPCONTAINER_VM_LAUNCH_RECEIPT_SCHEMA,
  policy: APPCONTAINER_TCG_POLICY,
  requiresDiagnosticsDigest: false,
  hostSandboxed: true,
  sandboxKind: APPCONTAINER_KIND,
  sandboxProtocol: HOLOSYSTEM_WINDOWS_APPCONTAINER_PROTOCOL,
  isolationScope: 'appcontainer-zero-capability-snapshot-grant',
  filesystemConfidentiality: true,
  networkIsolation: true,
  appContainer: true,
});

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
      expectedDiagnosticsDigest: plan.guest.expectedDiagnosticsDigest || null,
    },
    resources: {
      memoryMiB: plan.resources.memoryMiB,
      cpus: plan.resources.cpus,
      timeoutSeconds: plan.resources.timeoutSeconds,
    },
    sandbox: plan.sandbox
      ? { kind: plan.sandbox.kind, launcherDigest: plan.sandbox.launcherDigest }
      : null,
    launches: plan.launches,
  };
}

function inspectVmLaunchPlanForAdapter(plan, adapter) {
  const issues = [];
  if (!isRecord(plan)) {
    issue(issues, 'vm-launch-plan-invalid', '$', 'VM launch plan must be a JSON object.');
    return { ready: false, issues };
  }

  knownKeys(
    plan,
    new Set([
      'schema',
      'id',
      'host',
      'executor',
      'target',
      'guest',
      'resources',
      ...(adapter.hostSandboxed ? ['sandbox'] : []),
      'launches',
    ]),
    '',
    issues
  );
  if (plan.schema !== adapter.planSchema) {
    issue(issues, 'vm-launch-schema-mismatch', 'schema', `Expected ${adapter.planSchema}.`);
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
  if (plan.target?.accelerator !== adapter.accelerator) {
    issue(
      issues,
      'vm-launch-accelerator-unsupported',
      'target.accelerator',
      `This adapter requires the explicit ${adapter.accelerator} accelerator and never falls back.`
    );
  }

  knownKeys(
    plan.guest,
    new Set([
      'kernelDigest',
      'initrdDigest',
      'expectedConsoleDigest',
      ...(adapter.requiresDiagnosticsDigest ? ['expectedDiagnosticsDigest'] : []),
    ]),
    'guest',
    issues
  );
  inspectDigest(plan.guest?.kernelDigest, 'guest.kernelDigest', issues);
  inspectDigest(plan.guest?.initrdDigest, 'guest.initrdDigest', issues);
  inspectDigest(plan.guest?.expectedConsoleDigest, 'guest.expectedConsoleDigest', issues);
  if (adapter.requiresDiagnosticsDigest) {
    inspectDigest(plan.guest?.expectedDiagnosticsDigest, 'guest.expectedDiagnosticsDigest', issues);
  }

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

  if (adapter.hostSandboxed) {
    knownKeys(
      plan.sandbox,
      new Set(['kind', 'launcherDigest', ...(adapter.appContainer ? ['canaryDigest'] : [])]),
      'sandbox',
      issues
    );
    if (plan.sandbox?.kind !== adapter.sandboxKind) {
      issue(
        issues,
        'vm-launch-sandbox-unsupported',
        'sandbox.kind',
        `This adapter requires ${adapter.sandboxKind}.`
      );
    }
    inspectDigest(plan.sandbox?.launcherDigest, 'sandbox.launcherDigest', issues);
    if (adapter.appContainer) {
      inspectDigest(plan.sandbox?.canaryDigest, 'sandbox.canaryDigest', issues);
    }
  }

  return { ready: issues.length === 0, issues };
}

export function inspectVmLaunchPlan(plan) {
  return inspectVmLaunchPlanForAdapter(plan, TCG_ADAPTER);
}

export function inspectWhpxVmLaunchPlan(plan) {
  return inspectVmLaunchPlanForAdapter(plan, WHPX_ADAPTER);
}

export function inspectWhpxSandboxedVmLaunchPlan(plan) {
  return inspectVmLaunchPlanForAdapter(plan, WHPX_SANDBOXED_ADAPTER);
}

export function inspectWhpxAppContainerVmLaunchPlan(plan) {
  return inspectVmLaunchPlanForAdapter(plan, WHPX_APPCONTAINER_ADAPTER);
}

export function inspectAppContainerVmLaunchPlan(plan) {
  return inspectVmLaunchPlanForAdapter(plan, APPCONTAINER_TCG_ADAPTER);
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

export function inspectWindowsVmSandboxLauncher() {
  const issues = [];
  let content = null;
  try {
    const stats = lstatSync(SANDBOX_LAUNCHER_PATH);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new TypeError('not a regular file');
    content = readFileSync(SANDBOX_LAUNCHER_PATH);
  } catch {
    issue(
      issues,
      'vm-launch-sandbox-launcher-invalid',
      'sandbox.launcher',
      'The packaged Windows sandbox launcher must be a readable regular file.'
    );
  }
  const digest = content ? hashBytes(content) : null;
  if (digest && digest !== HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST) {
    issue(
      issues,
      'vm-launch-sandbox-launcher-drift',
      'sandbox.launcherDigest',
      'The packaged Windows sandbox launcher changed after module initialization.'
    );
  }
  return {
    schema: HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_SCHEMA,
    ready: issues.length === 0,
    kind: SANDBOX_KIND,
    digest: issues.length === 0 ? digest : null,
    bytes: issues.length === 0 ? content.length : null,
    issues,
  };
}

export function inspectWindowsVmAppContainerCanary() {
  const issues = [];
  let content = null;
  try {
    const stats = lstatSync(APPCONTAINER_CANARY_PATH);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new TypeError('not a regular file');
    content = readFileSync(APPCONTAINER_CANARY_PATH);
  } catch {
    issue(
      issues,
      'vm-launch-appcontainer-canary-invalid',
      'sandbox.canary',
      'The packaged Windows AppContainer canary must be a readable regular file.'
    );
  }
  const digest = content ? hashBytes(content) : null;
  if (digest && digest !== HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_DIGEST) {
    issue(
      issues,
      'vm-launch-appcontainer-canary-drift',
      'sandbox.canaryDigest',
      'The packaged Windows AppContainer canary changed after module initialization.'
    );
  }
  return {
    schema: HOLOSYSTEM_WINDOWS_APPCONTAINER_CANARY_SCHEMA,
    ready: issues.length === 0,
    kind: APPCONTAINER_KIND,
    digest: issues.length === 0 ? digest : null,
    bytes: issues.length === 0 ? content.length : null,
    issues,
  };
}

function logSummary(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return { bytes: bytes.length, digest: hashBytes(bytes) };
}

function normalizedDiagnostics(value, command) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  if (bytes.length === 0) return bytes;
  const prefix = Buffer.from(`${command}: `, 'utf8');
  const chunks = [];
  let offset = 0;
  let scan = 0;
  for (let index = bytes.indexOf(prefix, scan); index !== -1; index = bytes.indexOf(prefix, scan)) {
    if (index !== 0 && bytes[index - 1] !== 0x0a) {
      scan = index + 1;
      continue;
    }
    chunks.push(bytes.subarray(offset, index));
    offset = index + prefix.length;
    scan = offset;
  }
  chunks.push(bytes.subarray(offset));
  return Buffer.concat(chunks);
}

function finishReceipt(receipt) {
  return { ...receipt, receiptHash: hashJson(receipt) };
}

function baseReceipt(plan, now, issues, adapter) {
  return {
    schema: adapter.receiptSchema,
    generatedAt: now.toISOString(),
    id: validId(plan?.id) ? plan.id : null,
    status: 'blocked',
    verified: false,
    deterministic: false,
    hardwareBacked: false,
    acceleration: {
      adapter: adapter.accelerationName,
      evidence: adapter.hardwareBacked ? 'two-explicit-successful-launches' : 'software-emulation',
      verified: false,
    },
    isolation: adapter.hostSandboxed
      ? {
          hostProcess: adapter.sandboxKind,
          scope: adapter.isolationScope,
          verified: false,
          launcherDigest: DIGEST_PATTERN.test(plan?.sandbox?.launcherDigest || '')
            ? plan.sandbox.launcherDigest
            : null,
          ...(adapter.appContainer
            ? {
                canaryDigest: DIGEST_PATTERN.test(plan?.sandbox?.canaryDigest || '')
                  ? plan.sandbox.canaryDigest
                  : null,
              }
            : {}),
          controls: emptyIsolationControls(adapter),
        }
      : {
          hostProcess: 'ambient-windows-process',
          verified: false,
        },
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
      plan?.target?.architecture === 'amd64' &&
      plan?.target?.machine === 'q35' &&
      plan?.target?.accelerator === adapter.accelerator
        ? { architecture: 'amd64', machine: 'q35', accelerator: adapter.accelerator }
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
    policy: { ...adapter.policy },
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
    boundaries: [
      ...BOUNDARIES.filter(
        (layer) =>
          !(adapter.hardwareBacked && layer === 'hardware-hypervisor-acceleration') &&
          !(adapter.hostSandboxed && layer === 'host-process-isolation')
      ),
      ...(adapter.hostSandboxed && !adapter.filesystemConfidentiality
        ? ['host-filesystem-confidentiality']
        : []),
      ...(adapter.hostSandboxed && !adapter.networkIsolation ? ['host-network-isolation'] : []),
    ],
    issues,
  };
}

function qemuArguments(plan, kernelPath, initrdPath, adapter) {
  const appContainerTcg = adapter === APPCONTAINER_TCG_ADAPTER;
  return [
    '-no-user-config',
    '-nodefaults',
    '-machine',
    appContainerTcg ? 'q35,usb=off' : `q35,accel=${adapter.accelerator},usb=off`,
    ...(appContainerTcg ? ['-accel', 'tcg,tb-size=64'] : []),
    ...([TCG_ADAPTER, APPCONTAINER_TCG_ADAPTER].includes(adapter) ? ['-cpu', 'max'] : []),
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

function minimalEnvironment(snapshotRoot, runtimeDirectory, temporaryDirectory = snapshotRoot) {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  const systemDrive = process.env.SystemDrive || systemRoot?.slice(0, 2);
  const env = {
    APPDATA: temporaryDirectory,
    HOME: snapshotRoot,
    HOMEDRIVE: systemDrive,
    HOMEPATH: '\\',
    LOCALAPPDATA: temporaryDirectory,
    OS: 'Windows_NT',
    Path: runtimeDirectory,
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    USERPROFILE: snapshotRoot,
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    LANG: 'C',
    LC_ALL: 'C',
  };
  if (systemDrive) env.SystemDrive = systemDrive;
  if (systemRoot) {
    env.SystemRoot = systemRoot;
    env.windir = systemRoot;
    env.ComSpec = join(systemRoot, 'System32', 'cmd.exe');
  }
  return env;
}

const SANDBOX_CONTROL_KEYS = Object.freeze([
  'filteredToken',
  'disableMaxPrivilege',
  'enabledPrivilegeCount',
  'privilegesBounded',
  'lowIntegrity',
  'assignedBeforeResume',
  'handleAllowlist',
  'killOnClose',
  'activeProcessLimit',
  'processMemoryLimit',
  'uiRestrictions',
  'writableTempLowIntegrity',
]);
const APPCONTAINER_CONTROL_KEYS = Object.freeze([
  'filteredToken',
  'disableMaxPrivilege',
  'enabledPrivilegeCount',
  'privilegesBounded',
  'lowIntegrity',
  'assignedBeforeResume',
  'handleAllowlist',
  'killOnClose',
  'activeProcessLimit',
  'processMemoryLimit',
  'uiRestrictions',
  'appContainer',
  'appContainerSidMatched',
  'capabilityCount',
  'snapshotReadExecuteGrant',
  'writableTempModifyGrant',
  'filesystemCanaryDenied',
  'filesystemCanaryError',
  'networkCanaryDenied',
  'networkCanaryError',
  'loopbackAccepted',
  'profileDeleted',
]);

function isolationControlKeys(adapter) {
  return adapter.appContainer ? APPCONTAINER_CONTROL_KEYS : SANDBOX_CONTROL_KEYS;
}

function emptyIsolationControls(adapter) {
  return Object.fromEntries(
    isolationControlKeys(adapter).map((key) => [
      key,
      [
        'enabledPrivilegeCount',
        'capabilityCount',
        'filesystemCanaryError',
        'networkCanaryError',
      ].includes(key)
        ? null
        : false,
    ])
  );
}

function isolationControlsReady(controls, adapter) {
  if (
    !Number.isInteger(controls.enabledPrivilegeCount) ||
    controls.enabledPrivilegeCount < 0 ||
    controls.enabledPrivilegeCount > 1
  ) {
    return false;
  }
  if (!adapter.appContainer) {
    return SANDBOX_CONTROL_KEYS.every(
      (key) => key === 'enabledPrivilegeCount' || controls[key] === true
    );
  }
  return (
    APPCONTAINER_CONTROL_KEYS.every(
      (key) =>
        [
          'enabledPrivilegeCount',
          'capabilityCount',
          'filesystemCanaryError',
          'networkCanaryError',
        ].includes(key) ||
        (key === 'loopbackAccepted' ? controls[key] === false : controls[key] === true)
    ) &&
    controls.capabilityCount === 0 &&
    controls.filesystemCanaryError === 5 &&
    [10013, 10060].includes(controls.networkCanaryError)
  );
}

function canonicalBase64(value) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(MAX_CONSOLE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value && bytes.length <= MAX_CONSOLE_BYTES ? bytes : null;
}

function parseSandboxProtocol(result, adapter) {
  if (
    result?.status !== 0 ||
    result?.signal ||
    result?.error ||
    logSummary(result?.stderr).bytes !== 0
  ) {
    return { ready: false, issueCode: 'vm-launch-sandbox-launcher-failed' };
  }
  let message;
  try {
    const encoded = Buffer.isBuffer(result.stdout)
      ? result.stdout.toString('utf8')
      : String(result.stdout || '');
    message = JSON.parse(encoded.trim());
  } catch {
    return { ready: false, issueCode: 'vm-launch-sandbox-protocol-invalid' };
  }
  if (
    !isRecord(message) ||
    message.protocol !== adapter.sandboxProtocol ||
    !isRecord(message.isolation) ||
    Object.keys(message).some(
      (key) =>
        ![
          'protocol',
          'launched',
          'timedOut',
          'exitCode',
          'isolation',
          'stdoutBase64',
          'stderrBase64',
          'errorStage',
          'errorCode',
        ].includes(key)
    ) ||
    Object.keys(message.isolation).some((key) => !isolationControlKeys(adapter).includes(key)) ||
    Object.keys(message.isolation).length !== isolationControlKeys(adapter).length
  ) {
    return { ready: false, issueCode: 'vm-launch-sandbox-protocol-invalid' };
  }
  const stdout = canonicalBase64(message.stdoutBase64);
  const stderr = canonicalBase64(message.stderrBase64);
  const controlsReady = isolationControlsReady(message.isolation, adapter);
  if (
    message.launched !== true ||
    message.timedOut !== false ||
    !Number.isInteger(message.exitCode) ||
    message.errorStage !== null ||
    message.errorCode !== 0 ||
    !controlsReady ||
    !stdout ||
    !stderr
  ) {
    return { ready: false, issueCode: 'vm-launch-sandbox-evidence-invalid' };
  }
  return {
    ready: true,
    status: message.exitCode,
    signal: null,
    stdout,
    stderr,
    isolation: Object.fromEntries(
      isolationControlKeys(adapter).map((key) => [key, message.isolation[key]])
    ),
  };
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

function sandboxArtifactsSnapshotMatch(plan, launcherPath, canaryPath, adapter) {
  if (!adapter.hostSandboxed) return true;
  try {
    const stats = lstatSync(launcherPath);
    const canaryStats = adapter.appContainer ? lstatSync(canaryPath) : null;
    return (
      stats.isFile() &&
      !stats.isSymbolicLink() &&
      hashBytes(readFileSync(launcherPath)) === plan.sandbox.launcherDigest &&
      (!adapter.appContainer ||
        (canaryStats.isFile() &&
          !canaryStats.isSymbolicLink() &&
          hashBytes(readFileSync(canaryPath)) === plan.sandbox.canaryDigest))
    );
  } catch {
    return false;
  }
}

function runVmLaunchWithProcessRunner(
  { plan, executorDirectory, kernelPath, initrdPath, now = new Date() } = {},
  processRunner,
  adapter
) {
  const inspection = inspectVmLaunchPlanForAdapter(plan, adapter);
  const receipt = baseReceipt(plan, now, [...inspection.issues], adapter);
  if (!inspection.ready) return finishReceipt(receipt);

  const executor = inspectVmExecutor({ executorDirectory });
  const kernel = inspectVmLaunchAsset({ assetPath: kernelPath, kind: 'kernel' });
  const initrd = inspectVmLaunchAsset({ assetPath: initrdPath, kind: 'initrd' });
  const sandboxLauncher = adapter.hostSandboxed ? inspectWindowsVmSandboxLauncher() : null;
  const appContainerCanary = adapter.appContainer ? inspectWindowsVmAppContainerCanary() : null;
  receipt.issues.push(
    ...executor.issues,
    ...kernel.issues,
    ...initrd.issues,
    ...(sandboxLauncher?.issues || []),
    ...(appContainerCanary?.issues || [])
  );
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
  if (
    adapter.hostSandboxed &&
    sandboxLauncher?.ready &&
    sandboxLauncher.digest !== plan.sandbox.launcherDigest
  ) {
    issue(
      receipt.issues,
      'vm-launch-sandbox-launcher-mismatch',
      'sandbox.launcherDigest',
      'Packaged Windows sandbox launcher does not match the pinned plan digest.'
    );
  }
  if (
    adapter.appContainer &&
    appContainerCanary?.ready &&
    appContainerCanary.digest !== plan.sandbox.canaryDigest
  ) {
    issue(
      receipt.issues,
      'vm-launch-appcontainer-canary-mismatch',
      'sandbox.canaryDigest',
      'Packaged Windows AppContainer canary does not match the pinned plan digest.'
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
  const snapshotLauncher = join(snapshotRoot, SANDBOX_LAUNCHER_BINARY);
  const snapshotCanary = join(snapshotRoot, APPCONTAINER_CANARY_BINARY);
  const snapshotTemporary = join(snapshotRoot, 'sandbox-temp');
  const protectedRoot = adapter.appContainer
    ? mkdtempSync(join(tmpdir(), 'holosystem-vm-protected-'))
    : null;
  const protectedSentinel = protectedRoot ? join(protectedRoot, 'caller-readable.bin') : null;

  try {
    try {
      copyRuntimeSnapshot(sourceRuntime, executor, snapshotRuntime);
      copyFileSync(sourceKernel, snapshotKernel);
      copyFileSync(sourceInitrd, snapshotInitrd);
      if (adapter.hostSandboxed) {
        copyFileSync(SANDBOX_LAUNCHER_PATH, snapshotLauncher);
        mkdirSync(snapshotTemporary);
      }
      if (adapter.appContainer) copyFileSync(APPCONTAINER_CANARY_PATH, snapshotCanary);
      if (adapter.appContainer) {
        writeFileSync(protectedSentinel, Buffer.from('holosystem-appcontainer-read-canary-v1'));
      }
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
    let pinnedLauncherDigest = null;
    let pinnedCanaryDigest = null;
    if (adapter.hostSandboxed) {
      try {
        const stats = lstatSync(snapshotLauncher);
        if (!stats.isFile() || stats.isSymbolicLink()) throw new TypeError('not a regular file');
        pinnedLauncherDigest = hashBytes(readFileSync(snapshotLauncher));
      } catch {
        pinnedLauncherDigest = null;
      }
    }
    if (adapter.appContainer) {
      try {
        const stats = lstatSync(snapshotCanary);
        if (!stats.isFile() || stats.isSymbolicLink()) throw new TypeError('not a regular file');
        pinnedCanaryDigest = hashBytes(readFileSync(snapshotCanary));
      } catch {
        pinnedCanaryDigest = null;
      }
    }
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
    if (adapter.hostSandboxed && pinnedLauncherDigest !== plan.sandbox.launcherDigest) {
      issue(
        receipt.issues,
        'vm-launch-sandbox-launcher-snapshot-mismatch',
        'sandbox.launcherDigest',
        'Windows sandbox launcher changed while its private snapshot was materialized.'
      );
    }
    if (adapter.appContainer && pinnedCanaryDigest !== plan.sandbox.canaryDigest) {
      issue(
        receipt.issues,
        'vm-launch-appcontainer-canary-snapshot-mismatch',
        'sandbox.canaryDigest',
        'Windows AppContainer canary changed while its private snapshot was materialized.'
      );
    }
    if (receipt.issues.length > 0) return finishReceipt(receipt);

    receipt.measurementDigest = hashJson({
      plan: normalizedPlan(plan),
      executorDigest: pinnedExecutor.digest,
      binaryDigest: pinnedExecutor.binaryDigest,
      kernelDigest: pinnedKernel.digest,
      initrdDigest: pinnedInitrd.digest,
      ...(adapter.hostSandboxed ? { sandboxLauncherDigest: pinnedLauncherDigest } : {}),
      ...(adapter.appContainer ? { appContainerCanaryDigest: pinnedCanaryDigest } : {}),
      policy: adapter.policy,
    });

    const qemuCommand = join(snapshotRuntime, EXECUTOR_BINARY);
    const qemuArgs = qemuArguments(plan, snapshotKernel, snapshotInitrd, adapter);
    const command = adapter.hostSandboxed ? snapshotLauncher : qemuCommand;
    const args = adapter.hostSandboxed
      ? [
          '--executable',
          qemuCommand,
          '--working-directory',
          snapshotRuntime,
          '--sandbox-root',
          snapshotRoot,
          '--writable-temp',
          snapshotTemporary,
          '--timeout-ms',
          String(plan.resources.timeoutSeconds * 1000),
          '--process-memory-bytes',
          String(SANDBOX_PROCESS_MEMORY_BYTES),
          ...(adapter.appContainer
            ? [
                '--appcontainer-deny',
                'v1',
                '--protected-sentinel',
                protectedSentinel,
                '--canary-executable',
                snapshotCanary,
              ]
            : []),
          '--',
          ...qemuArgs,
        ]
      : qemuArgs;
    const options = {
      encoding: null,
      env: minimalEnvironment(
        snapshotRoot,
        snapshotRuntime,
        adapter.hostSandboxed ? snapshotTemporary : snapshotRoot
      ),
      maxBuffer: adapter.hostSandboxed ? SANDBOX_PROTOCOL_BYTES : MAX_CONSOLE_BYTES,
      shell: false,
      timeout: plan.resources.timeoutSeconds * 1000 + (adapter.hostSandboxed ? 5000 : 0),
      windowsHide: true,
    };

    for (let index = 0; index < plan.launches; index += 1) {
      if (
        !launchSnapshotMatches(plan, snapshotRuntime, snapshotKernel, snapshotInitrd) ||
        !sandboxArtifactsSnapshotMatch(plan, snapshotLauncher, snapshotCanary, adapter)
      ) {
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
      if (adapter.hostSandboxed) {
        const protocol = parseSandboxProtocol(result, adapter);
        if (!protocol.ready) {
          issue(
            receipt.issues,
            protocol.issueCode,
            `launches[${index}].isolation`,
            'Measured Windows sandbox launcher did not return complete closed-protocol evidence.'
          );
          result = {
            status: null,
            signal: null,
            stdout: Buffer.alloc(0),
            stderr: Buffer.alloc(0),
            isolation: null,
          };
        } else {
          result = protocol;
        }
      }
      const stdout = logSummary(result?.stdout);
      const stderr = logSummary(
        adapter.requiresDiagnosticsDigest
          ? normalizedDiagnostics(result?.stderr, qemuCommand)
          : result?.stderr
      );
      const launch = {
        index: index + 1,
        exitCode: Number.isInteger(result?.status) ? result.status : null,
        signal: typeof result?.signal === 'string' ? result.signal : null,
        stdout,
        stderr,
        ...(adapter.hostSandboxed ? { isolation: result?.isolation || null } : {}),
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
      if (
        adapter.requiresDiagnosticsDigest &&
        stderr.digest !== plan.guest.expectedDiagnosticsDigest
      ) {
        issue(
          receipt.issues,
          'vm-launch-diagnostics-mismatch',
          `launches[${index}].stderr`,
          'Host emulator diagnostics do not match the pinned adapter digest; raw bytes are withheld.'
        );
      } else if (!adapter.requiresDiagnosticsDigest && stderr.bytes !== 0) {
        issue(
          receipt.issues,
          'vm-launch-diagnostics-present',
          `launches[${index}].stderr`,
          'Host emulator diagnostics were emitted; raw bytes are withheld.'
        );
      }
      if (
        !launchSnapshotMatches(plan, snapshotRuntime, snapshotKernel, snapshotInitrd) ||
        !sandboxArtifactsSnapshotMatch(plan, snapshotLauncher, snapshotCanary, adapter)
      ) {
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
    if (protectedRoot) rmSync(protectedRoot, { recursive: true, force: true });
  }

  const launchSignatures = receipt.launches.map(({ exitCode, signal, stdout, stderr, isolation }) =>
    hashJson({
      exitCode,
      signal,
      stdout,
      stderr,
      ...(adapter.hostSandboxed ? { isolation } : {}),
    })
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
    receipt.hardwareBacked = adapter.hardwareBacked;
    receipt.acceleration.verified = adapter.hardwareBacked;
    if (adapter.hostSandboxed) {
      receipt.isolation = {
        ...receipt.isolation,
        verified: true,
        controls: { ...receipt.launches[0].isolation },
      };
    }
    receipt.coverage = {
      includedLayers: [
        'guest-artifact-measurement',
        ...(adapter.hardwareBacked ? ['hardware-hypervisor-acceleration'] : []),
        ...(adapter.hostSandboxed ? ['host-process-isolation'] : []),
        ...(adapter.filesystemConfidentiality ? ['host-filesystem-confidentiality'] : []),
        ...(adapter.networkIsolation ? ['host-network-isolation'] : []),
        'machine-vm-launch',
        'virtual-device-minimization',
      ],
      missingLayers: [
        ...(!adapter.hardwareBacked ? ['hardware-hypervisor-acceleration'] : []),
        ...(!adapter.hostSandboxed ? ['host-process-isolation'] : []),
        ...(adapter.hostSandboxed && !adapter.filesystemConfidentiality
          ? ['host-filesystem-confidentiality']
          : []),
        ...(adapter.hostSandboxed && !adapter.networkIsolation ? ['host-network-isolation'] : []),
      ],
    };
  }
  return finishReceipt(receipt);
}

export function runVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync, TCG_ADAPTER);
}

export function runWhpxVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync, WHPX_ADAPTER);
}

export function runWhpxSandboxedVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync, WHPX_SANDBOXED_ADAPTER);
}

export function runWhpxAppContainerVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync, WHPX_APPCONTAINER_ADAPTER);
}

export function runAppContainerVmLaunch(options = {}) {
  return runVmLaunchWithProcessRunner(options, spawnSync, APPCONTAINER_TCG_ADAPTER);
}

// Repository tests need a deterministic process boundary without publishing an
// injectable executor through the package root export.
export function runVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner, TCG_ADAPTER);
}

export function runWhpxVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner, WHPX_ADAPTER);
}

export function runWhpxSandboxedVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner, WHPX_SANDBOXED_ADAPTER);
}

export function runWhpxAppContainerVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner, WHPX_APPCONTAINER_ADAPTER);
}

export function runAppContainerVmLaunchWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...launchOptions } = options;
  return runVmLaunchWithProcessRunner(launchOptions, processRunner, APPCONTAINER_TCG_ADAPTER);
}
