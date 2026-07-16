import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { createRebuildAttestationPayload } from './substrate.mjs';

export const HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA = 'holoscript.holosystem.native-build-plan.v1';
export const HOLOSYSTEM_NATIVE_BUILD_SOURCE_SCHEMA = 'holoscript.holosystem.native-build-source.v1';
export const HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA =
  'holoscript.holosystem.native-build-receipt.v1';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const IMAGE_PATTERN =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)@sha256:[a-f0-9]{64}$/u;
const MAX_SOURCE_FILES = 256;
const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_LOG_BYTES = 1024 * 1024;
const DOCKER_POLICY = Object.freeze({
  network: 'none',
  rootFilesystem: 'read-only',
  sourceMount: 'read-only',
  capabilities: 'none',
  privilegeEscalation: 'disabled',
  user: '65534:65534',
  pull: 'never',
});
const BOUNDARIES = Object.freeze([
  'compiler-image-supply-chain',
  'container-runtime-host',
  'cpu-and-kernel-correctness',
  'executor-binary-provenance',
  'independent-builder-governance',
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

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value);
}

function portablePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    !/(?:^|\/)\.\.(?:\/|$)/u.test(value) &&
    !/(?:^|\/)\.(?:\/|$)/u.test(value) &&
    !/[\r\n]/u.test(value)
  );
}

function knownKeys(value, allowed, path, issues) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        'native-build-field-unknown',
        path ? `${path}.${key}` : key,
        'Field is not part of the declarative native-build vocabulary.'
      );
    }
  }
}

function scanTree(directory, issues) {
  const files = [];
  let totalBytes = 0;

  function visit(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    } catch {
      issue(
        issues,
        'native-build-source-unreadable',
        'sourceDirectory',
        'Source directory could not be read.'
      );
      return;
    }

    for (const entry of entries) {
      const absolute = join(current, entry.name);
      const portable = relative(directory, absolute).split(sep).join('/');
      let stats;
      try {
        stats = lstatSync(absolute);
      } catch {
        issue(
          issues,
          'native-build-source-unreadable',
          'sourceDirectory',
          'A source entry could not be inspected.'
        );
        continue;
      }
      if (stats.isSymbolicLink()) {
        issue(
          issues,
          'native-build-source-link-forbidden',
          `source.files.${portable}`,
          'Symbolic links and reparse-point indirection are not build inputs.'
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
          'native-build-source-type-forbidden',
          `source.files.${portable}`,
          'Only regular source files are accepted.'
        );
        continue;
      }
      if (!portablePath(portable)) {
        issue(
          issues,
          'native-build-source-path-invalid',
          `source.files.${portable}`,
          'Source paths must be portable relative paths.'
        );
        continue;
      }
      if (stats.size > MAX_SOURCE_FILE_BYTES) {
        issue(
          issues,
          'native-build-source-file-too-large',
          `source.files.${portable}`,
          'A source file exceeds the per-file limit.'
        );
        continue;
      }
      totalBytes += stats.size;
      if (totalBytes > MAX_SOURCE_BYTES) {
        issue(
          issues,
          'native-build-source-too-large',
          'source.files',
          'Source inputs exceed the aggregate limit.'
        );
        return;
      }
      let content;
      try {
        content = readFileSync(absolute);
      } catch {
        issue(
          issues,
          'native-build-source-unreadable',
          `source.files.${portable}`,
          'A source file could not be read.'
        );
        continue;
      }
      files.push({ path: portable, bytes: content.length, digest: hashBytes(content) });
      if (files.length > MAX_SOURCE_FILES) {
        issue(
          issues,
          'native-build-source-file-limit',
          'source.files',
          'Source inputs exceed the file-count limit.'
        );
        return;
      }
    }
  }

  visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectNativeBuildSource({ sourceDirectory } = {}) {
  const issues = [];
  if (typeof sourceDirectory !== 'string' || sourceDirectory.length === 0) {
    issue(
      issues,
      'native-build-source-directory-missing',
      'sourceDirectory',
      'A caller-owned source directory is required.'
    );
    return {
      schema: HOLOSYSTEM_NATIVE_BUILD_SOURCE_SCHEMA,
      ready: false,
      digest: null,
      files: [],
      summary: { files: 0, bytes: 0 },
      issues,
    };
  }
  const directory = resolve(sourceDirectory);
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
      'native-build-source-directory-invalid',
      'sourceDirectory',
      'Source input must be a real directory rather than a link or missing path.'
    );
  }
  const files = directoryReady ? scanTree(directory, issues) : [];
  if (files.length === 0) {
    issue(
      issues,
      'native-build-source-empty',
      'source.files',
      'At least one regular source file is required.'
    );
  }
  const envelope = { schema: HOLOSYSTEM_NATIVE_BUILD_SOURCE_SCHEMA, files };
  return {
    schema: HOLOSYSTEM_NATIVE_BUILD_SOURCE_SCHEMA,
    ready: issues.length === 0,
    digest: issues.length === 0 ? hashJson(envelope) : null,
    files,
    summary: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    },
    issues,
  };
}

export function inspectNativeBuildPlan(plan) {
  const issues = [];
  if (!isRecord(plan)) {
    issue(issues, 'native-build-plan-invalid', '$', 'Native-build plan must be a JSON object.');
    return { ready: false, issues };
  }
  knownKeys(
    plan,
    new Set([
      'schema',
      'id',
      'source',
      'target',
      'executor',
      'compiler',
      'output',
      'limits',
      'rebuilds',
      'expectedArtifactDigest',
    ]),
    '',
    issues
  );
  if (plan.schema !== HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA) {
    issue(
      issues,
      'native-build-schema-mismatch',
      'schema',
      `Expected ${HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA}.`
    );
  }
  if (!validId(plan.id)) {
    issue(issues, 'native-build-id-invalid', 'id', 'Build id must be a portable identifier.');
  }

  knownKeys(plan.source, new Set(['digest', 'sourceDateEpoch']), 'source', issues);
  if (!DIGEST_PATTERN.test(plan.source?.digest || '')) {
    issue(
      issues,
      'native-build-source-digest-invalid',
      'source.digest',
      'Source digest must be SHA-256.'
    );
  }
  if (
    !Number.isInteger(plan.source?.sourceDateEpoch) ||
    plan.source.sourceDateEpoch < 1 ||
    plan.source.sourceDateEpoch > 4_102_444_800
  ) {
    issue(
      issues,
      'native-build-source-date-invalid',
      'source.sourceDateEpoch',
      'SOURCE_DATE_EPOCH must be a bounded positive Unix timestamp.'
    );
  }

  knownKeys(plan.target, new Set(['os', 'architecture', 'abi']), 'target', issues);
  if (
    plan.target?.os !== 'linux' ||
    plan.target?.architecture !== 'amd64' ||
    plan.target?.abi !== 'gnu'
  ) {
    issue(
      issues,
      'native-build-target-unsupported',
      'target',
      'This tracer supports only the explicit linux/amd64/gnu target.'
    );
  }

  knownKeys(plan.executor, new Set(['kind', 'digest', 'image']), 'executor', issues);
  if (plan.executor?.kind !== 'docker') {
    issue(
      issues,
      'native-build-executor-unsupported',
      'executor.kind',
      'This tracer supports only the hardened Docker executor.'
    );
  }
  if (!DIGEST_PATTERN.test(plan.executor?.digest || '')) {
    issue(
      issues,
      'native-build-executor-digest-invalid',
      'executor.digest',
      'Executor binary digest must be SHA-256.'
    );
  }
  if (!IMAGE_PATTERN.test(plan.executor?.image || '')) {
    issue(
      issues,
      'native-build-image-not-pinned',
      'executor.image',
      'Compiler image must use an immutable sha256 manifest reference without credentials or tags.'
    );
  }

  knownKeys(
    plan.compiler,
    new Set(['family', 'language', 'source', 'optimization']),
    'compiler',
    issues
  );
  if (plan.compiler?.family !== 'gcc' || plan.compiler?.language !== 'c11') {
    issue(
      issues,
      'native-build-compiler-unsupported',
      'compiler',
      'This tracer accepts only the generated GCC C11 compiler vocabulary.'
    );
  }
  if (!portablePath(plan.compiler?.source) || !plan.compiler.source.endsWith('.c')) {
    issue(
      issues,
      'native-build-source-path-invalid',
      'compiler.source',
      'Compiler source must be a portable relative .c path.'
    );
  }
  if (!['none', 'size', 'speed'].includes(plan.compiler?.optimization)) {
    issue(
      issues,
      'native-build-optimization-invalid',
      'compiler.optimization',
      'Optimization must be none, size, or speed.'
    );
  }

  knownKeys(plan.output, new Set(['path', 'format']), 'output', issues);
  if (!portablePath(plan.output?.path)) {
    issue(
      issues,
      'native-build-output-path-invalid',
      'output.path',
      'Output must be a portable relative path.'
    );
  }
  if (plan.output?.format !== 'elf-executable') {
    issue(
      issues,
      'native-build-output-format-invalid',
      'output.format',
      'This tracer emits one ELF executable.'
    );
  }

  knownKeys(
    plan.limits,
    new Set(['timeoutSeconds', 'memoryMiB', 'cpus', 'pids', 'tmpfsMiB']),
    'limits',
    issues
  );
  const limitRules = [
    ['timeoutSeconds', 1, 600],
    ['memoryMiB', 64, 4096],
    ['cpus', 0.25, 8],
    ['pids', 16, 512],
    ['tmpfsMiB', 8, 1024],
  ];
  for (const [name, minimum, maximum] of limitRules) {
    const value = plan.limits?.[name];
    const integerRequired = name !== 'cpus';
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (integerRequired && !Number.isInteger(value)) ||
      value < minimum ||
      value > maximum
    ) {
      issue(
        issues,
        'native-build-limit-invalid',
        `limits.${name}`,
        `Limit must remain between ${minimum} and ${maximum}.`
      );
    }
  }
  if (plan.rebuilds !== 2) {
    issue(
      issues,
      'native-build-rebuild-count-invalid',
      'rebuilds',
      'Exactly two clean rebuilds are required by this receipt schema.'
    );
  }
  if (
    plan.expectedArtifactDigest !== undefined &&
    !DIGEST_PATTERN.test(plan.expectedArtifactDigest)
  ) {
    issue(
      issues,
      'native-build-artifact-pin-invalid',
      'expectedArtifactDigest',
      'Expected artifact digest must be SHA-256 when supplied.'
    );
  }

  return {
    ready: issues.length === 0,
    issues,
    summary: {
      id: validId(plan.id) ? plan.id : null,
      target: isRecord(plan.target) ? { ...plan.target } : null,
      image: IMAGE_PATTERN.test(plan.executor?.image || '') ? plan.executor.image : null,
      artifactPinned: DIGEST_PATTERN.test(plan.expectedArtifactDigest || ''),
    },
  };
}

function outputTree(directory, declaredPath, issues) {
  const files = [];
  function visit(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    } catch {
      issue(
        issues,
        'native-build-output-unreadable',
        'output',
        'Build output directory could not be read.'
      );
      return;
    }
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      const portable = relative(directory, absolute).split(sep).join('/');
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        issue(
          issues,
          'native-build-output-link-forbidden',
          `output.${portable}`,
          'Build outputs may not use symbolic links.'
        );
      } else if (stats.isDirectory()) {
        visit(absolute);
      } else if (stats.isFile()) {
        files.push({ path: portable, bytes: stats.size, absolute });
      } else {
        issue(
          issues,
          'native-build-output-type-forbidden',
          `output.${portable}`,
          'Only regular build outputs are accepted.'
        );
      }
    }
  }
  visit(directory);
  for (const file of files) {
    if (file.path !== declaredPath) {
      issue(
        issues,
        'native-build-output-undeclared',
        `output.${file.path}`,
        'Compiler emitted an undeclared output.'
      );
    }
  }
  if (!files.some((file) => file.path === declaredPath)) {
    issue(
      issues,
      'native-build-output-missing',
      'output.path',
      'Compiler did not emit the declared output.'
    );
  }
  return files;
}

function inspectElfAmd64(value, issues) {
  if (
    value.length < 20 ||
    value[0] !== 0x7f ||
    value[1] !== 0x45 ||
    value[2] !== 0x4c ||
    value[3] !== 0x46 ||
    value[4] !== 2 ||
    value[5] !== 1 ||
    value.readUInt16LE(18) !== 0x3e
  ) {
    issue(
      issues,
      'native-build-output-target-mismatch',
      'output',
      'Output is not a little-endian 64-bit AMD64 ELF artifact.'
    );
    return false;
  }
  return true;
}

function compilerArguments(plan, sourceDirectory, outputDirectory) {
  const optimization = { none: '-O0', size: '-Os', speed: '-O2' }[plan.compiler.optimization];
  const dockerPath = (value) => value.replaceAll('\\', '/');
  return [
    'run',
    '--rm',
    '--pull',
    'never',
    '--platform',
    'linux/amd64',
    '--network',
    'none',
    '--ipc',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    String(plan.limits.pids),
    '--memory',
    `${plan.limits.memoryMiB}m`,
    '--memory-swap',
    `${plan.limits.memoryMiB}m`,
    '--cpus',
    String(plan.limits.cpus),
    '--user',
    DOCKER_POLICY.user,
    '--env',
    'HOME=/tmp',
    '--env',
    'LC_ALL=C',
    '--env',
    'TZ=UTC',
    '--env',
    `SOURCE_DATE_EPOCH=${plan.source.sourceDateEpoch}`,
    '--mount',
    `type=bind,src=${dockerPath(sourceDirectory)},dst=/src,readonly`,
    '--mount',
    `type=bind,src=${dockerPath(outputDirectory)},dst=/out`,
    '--tmpfs',
    `/tmp:rw,noexec,nosuid,nodev,size=${plan.limits.tmpfsMiB}m`,
    '--workdir',
    '/src',
    '--entrypoint',
    '/usr/local/bin/gcc',
    plan.executor.image,
    '-std=c11',
    optimization,
    '-fno-ident',
    '-ffile-prefix-map=/src=.',
    '-fdebug-prefix-map=/src=.',
    '-Wl,--build-id=none',
    '-o',
    `/out/${plan.output.path}`,
    `/src/${plan.compiler.source}`,
  ];
}

function logSummary(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return { bytes: bytes.length, digest: hashBytes(bytes) };
}

function finishReceipt(receipt) {
  return { ...receipt, receiptHash: hashJson(receipt) };
}

function baseReceipt(plan, now, issues = []) {
  return {
    schema: HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA,
    generatedAt: now.toISOString(),
    id: validId(plan?.id) ? plan.id : null,
    status: 'blocked',
    verified: false,
    reproducible: false,
    source: {
      digest: DIGEST_PATTERN.test(plan?.source?.digest || '') ? plan.source.digest : null,
      files: 0,
      bytes: 0,
    },
    target:
      plan?.target?.os === 'linux' &&
      plan?.target?.architecture === 'amd64' &&
      plan?.target?.abi === 'gnu'
        ? { os: 'linux', architecture: 'amd64', abi: 'gnu' }
        : null,
    executor: {
      kind: plan?.executor?.kind === 'docker' ? 'docker' : null,
      digest: DIGEST_PATTERN.test(plan?.executor?.digest || '') ? plan.executor.digest : null,
      image: IMAGE_PATTERN.test(plan?.executor?.image || '') ? plan.executor.image : null,
    },
    compiler: {
      family: plan?.compiler?.family === 'gcc' ? 'gcc' : null,
      language: plan?.compiler?.language === 'c11' ? 'c11' : null,
      executable: '/usr/local/bin/gcc',
      source: portablePath(plan?.compiler?.source) ? plan.compiler.source : null,
      optimization: ['none', 'size', 'speed'].includes(plan?.compiler?.optimization)
        ? plan.compiler.optimization
        : null,
    },
    policy: { ...DOCKER_POLICY },
    runs: [],
    output: {
      path: portablePath(plan?.output?.path) ? plan.output.path : null,
      format: plan?.output?.format === 'elf-executable' ? 'elf-executable' : null,
      bytes: null,
      digest: null,
    },
    expectedArtifactDigest: DIGEST_PATTERN.test(plan?.expectedArtifactDigest || '')
      ? plan.expectedArtifactDigest
      : null,
    coverage: { includedLayers: [], missingLayers: ['native-build'] },
    boundaries: [...BOUNDARIES],
    issues,
  };
}

function runNativeBuildWithProcessRunner(
  { plan, sourceDirectory, outputDirectory, executorPath, now = new Date() } = {},
  processRunner
) {
  const inspection = inspectNativeBuildPlan(plan);
  const receipt = baseReceipt(plan, now, [...inspection.issues]);
  if (!inspection.ready) return finishReceipt(receipt);

  const source = inspectNativeBuildSource({ sourceDirectory });
  receipt.source = {
    digest: source.digest,
    files: source.summary.files,
    bytes: source.summary.bytes,
  };
  receipt.issues.push(...source.issues);
  if (source.ready && source.digest !== plan.source.digest) {
    issue(
      receipt.issues,
      'native-build-source-mismatch',
      'source.digest',
      'Caller-owned source tree does not match the pinned plan digest.'
    );
  }
  if (!source.files.some((file) => file.path === plan.compiler.source)) {
    issue(
      receipt.issues,
      'native-build-translation-unit-missing',
      'compiler.source',
      'Declared C translation unit is not present in the source manifest.'
    );
  }

  let executorDigest = null;
  try {
    const executor = lstatSync(resolve(executorPath));
    if (!executor.isFile() || executor.isSymbolicLink()) {
      throw new TypeError('executor is not a regular file');
    }
    executorDigest = hashBytes(readFileSync(resolve(executorPath)));
  } catch {
    issue(
      receipt.issues,
      'native-build-executor-unreadable',
      'executorPath',
      'Pinned executor binary could not be read.'
    );
  }
  if (executorDigest && executorDigest !== plan.executor.digest) {
    issue(
      receipt.issues,
      'native-build-executor-mismatch',
      'executor.digest',
      'Executor binary does not match the pinned digest.'
    );
  }

  const sourceRoot = typeof sourceDirectory === 'string' ? resolve(sourceDirectory) : null;
  const finalOutputRoot = typeof outputDirectory === 'string' ? resolve(outputDirectory) : null;
  if (!finalOutputRoot) {
    issue(
      receipt.issues,
      'native-build-output-directory-missing',
      'outputDirectory',
      'A caller-owned output directory is required.'
    );
  } else if (
    sourceRoot &&
    (finalOutputRoot === sourceRoot ||
      finalOutputRoot.startsWith(`${sourceRoot}${sep}`) ||
      sourceRoot.startsWith(`${finalOutputRoot}${sep}`))
  ) {
    issue(
      receipt.issues,
      'native-build-path-overlap',
      'outputDirectory',
      'Source and output directories may not overlap.'
    );
  } else if (/[,\r\n]/u.test(sourceRoot || '') || /[,\r\n]/u.test(finalOutputRoot)) {
    issue(
      receipt.issues,
      'native-build-operational-path-unsupported',
      'outputDirectory',
      'Operational mount paths may not contain Docker mount separators or newlines.'
    );
  } else if (existsSync(finalOutputRoot)) {
    issue(
      receipt.issues,
      'native-build-output-directory-exists',
      'outputDirectory',
      'Output directory must not exist before the isolated build starts.'
    );
  }

  if (receipt.issues.length > 0) return finishReceipt(receipt);

  const runArtifacts = [];
  const snapshotContainer = mkdtempSync(join(tmpdir(), 'holosystem-native-build-source-'));
  const snapshotRoot = join(snapshotContainer, 'source');
  const executorSnapshot = join(snapshotContainer, basename(resolve(executorPath)));
  mkdirSync(snapshotRoot);
  try {
    try {
      copyFileSync(resolve(executorPath), executorSnapshot);
      const snapshotStats = lstatSync(executorSnapshot);
      const snapshotDigest = hashBytes(readFileSync(executorSnapshot));
      if (
        !snapshotStats.isFile() ||
        snapshotStats.isSymbolicLink() ||
        snapshotDigest !== plan.executor.digest
      ) {
        throw new TypeError('executor snapshot does not match the pinned binary');
      }
    } catch {
      issue(
        receipt.issues,
        'native-build-executor-snapshot-mismatch',
        'executor.digest',
        'Executor changed while its private launch snapshot was materialized.'
      );
      return finishReceipt(receipt);
    }

    for (const file of source.files) {
      const target = join(snapshotRoot, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(sourceRoot, file.path)));
    }
    const snapshot = inspectNativeBuildSource({ sourceDirectory: snapshotRoot });
    if (!snapshot.ready || snapshot.digest !== plan.source.digest) {
      issue(
        receipt.issues,
        'native-build-source-snapshot-mismatch',
        'source.digest',
        'Source changed while the isolated immutable snapshot was materialized.'
      );
      return finishReceipt(receipt);
    }

    for (let index = 0; index < plan.rebuilds; index += 1) {
      const temporaryRoot = mkdtempSync(join(tmpdir(), 'holosystem-native-build-run-'));
      const isolatedOutput = join(temporaryRoot, 'out');
      mkdirSync(isolatedOutput);
      const runIssues = [];
      try {
        const args = compilerArguments(plan, snapshotRoot, isolatedOutput);
        let result;
        try {
          result = processRunner(executorSnapshot, args, {
            encoding: 'utf8',
            maxBuffer: MAX_LOG_BYTES,
            shell: false,
            timeout: plan.limits.timeoutSeconds * 1000,
            windowsHide: true,
          });
        } catch {
          result = { status: null, signal: null, stdout: '', stderr: '' };
        }
        const stdout = logSummary(result?.stdout);
        const stderr = logSummary(result?.stderr);
        const run = {
          index: index + 1,
          exitCode: Number.isInteger(result?.status) ? result.status : null,
          signal: typeof result?.signal === 'string' ? result.signal : null,
          stdout,
          stderr,
          output: null,
        };
        if (result?.status !== 0) {
          issue(
            runIssues,
            'native-build-execution-failed',
            `runs[${index}]`,
            'Isolated compiler execution failed or exceeded its bound.'
          );
        } else {
          const files = outputTree(isolatedOutput, plan.output.path, runIssues);
          const declared = files.find((file) => file.path === plan.output.path);
          if (declared && declared.bytes > MAX_OUTPUT_BYTES) {
            issue(
              runIssues,
              'native-build-output-too-large',
              `runs[${index}].output`,
              'Declared build output exceeds the artifact limit.'
            );
          } else if (declared) {
            const artifact = readFileSync(declared.absolute);
            inspectElfAmd64(artifact, runIssues);
            run.output = {
              path: declared.path,
              format: 'elf-executable',
              bytes: artifact.length,
              digest: hashBytes(artifact),
            };
            runArtifacts.push(artifact);
          }
        }
        receipt.runs.push(run);
        receipt.issues.push(...runIssues);
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(snapshotContainer, { recursive: true, force: true });
  }

  const outputDigests = receipt.runs.map((run) => run.output?.digest).filter(Boolean);
  receipt.reproducible =
    receipt.issues.length === 0 &&
    outputDigests.length === plan.rebuilds &&
    new Set(outputDigests).size === 1;
  if (outputDigests.length === plan.rebuilds && new Set(outputDigests).size !== 1) {
    issue(
      receipt.issues,
      'native-build-not-reproducible',
      'runs',
      'Clean rebuilds emitted different artifact digests.'
    );
  }

  if (receipt.reproducible) {
    receipt.output = { ...receipt.runs[0].output };
    if (plan.expectedArtifactDigest && receipt.output.digest !== plan.expectedArtifactDigest) {
      issue(
        receipt.issues,
        'native-build-artifact-mismatch',
        'expectedArtifactDigest',
        'Reproducible output does not match the pinned artifact digest.'
      );
    }
  }

  if (receipt.reproducible && receipt.issues.length === 0) {
    mkdirSync(join(finalOutputRoot, dirname(plan.output.path)), { recursive: true });
    writeFileSync(join(finalOutputRoot, plan.output.path), runArtifacts[0], { mode: 0o755 });
    if (plan.expectedArtifactDigest) {
      receipt.status = 'verified';
      receipt.verified = true;
      receipt.coverage = { includedLayers: ['native-build'], missingLayers: [] };
    } else {
      receipt.status = 'artifact-pin-required';
      receipt.coverage = {
        includedLayers: [],
        missingLayers: ['artifact-pin', 'native-build'],
      };
    }
  }

  return finishReceipt(receipt);
}

export function runNativeBuild(options = {}) {
  return runNativeBuildWithProcessRunner(options, spawnSync);
}

// Repository tests need a deterministic process boundary without publishing an
// injectable executor through the package root export.
export function runNativeBuildWithProcessRunnerForTest(options = {}) {
  if (typeof options.processRunner !== 'function') {
    throw new TypeError('processRunner test adapter is required.');
  }
  const { processRunner, ...buildOptions } = options;
  return runNativeBuildWithProcessRunner(buildOptions, processRunner);
}

export function createNativeRebuildAttestationPayload({ receipt, verifier, component } = {}) {
  const suppliedHash = receipt?.receiptHash;
  const unsignedReceipt = isRecord(receipt) ? { ...receipt } : null;
  if (unsignedReceipt) delete unsignedReceipt.receiptHash;
  const receiptConsistent =
    isRecord(unsignedReceipt) &&
    typeof suppliedHash === 'string' &&
    suppliedHash === hashJson(unsignedReceipt);
  if (
    receipt?.schema !== HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA ||
    receipt?.status !== 'verified' ||
    receipt?.verified !== true ||
    receipt?.reproducible !== true ||
    !receiptConsistent ||
    !DIGEST_PATTERN.test(receipt?.output?.digest || '') ||
    component?.artifact?.digest !== receipt.output.digest
  ) {
    throw new TypeError(
      'Cannot create an attestation payload without an authentic verified native build receipt.'
    );
  }
  return createRebuildAttestationPayload({ verifier, component });
}
