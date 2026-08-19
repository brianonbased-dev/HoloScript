#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.source-validation.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_SOURCE_DIR = path.join('apps', 'holoshell', 'source');
const DEFAULT_HOLOSCRIPT_ROOT = path.resolve(REPO_ROOT, '..', 'HoloScript');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'source-validation.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'source-validation.js');
const DEFAULT_COMPILE_OUTPUT_DIR = path.join('.tmp', 'holoshell', 'source-validation-compiled');
const SOURCE_EXTENSIONS = new Set(['.holo', '.hs', '.hsplus']);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    sourceDir: DEFAULT_SOURCE_DIR,
    holoscriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    compileOutputDir: DEFAULT_COMPILE_OUTPUT_DIR,
    timeoutMs: 60_000,
    overallTimeoutMs: 180_000,
    failFast: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--source-dir') args.sourceDir = argv[++index];
    else if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--compile-output-dir') args.compileOutputDir = argv[++index];
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]) || args.timeoutMs;
    else if (arg === '--overall-timeout-ms') args.overallTimeoutMs = Number(argv[++index]) || args.overallTimeoutMs;
    else if (arg === '--fail-fast') args.failFast = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) {
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'source-validation.json');
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'source-validation.js');
    args.compileOutputDir = path.join('.tmp', 'holoshell', 'self-test', 'source-validation-compiled');
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell source validation guard

Usage:
  node scripts/holoshell-source-validation.mjs [options]

Options:
  --source-dir <path>        Source directory. Defaults to apps/holoshell/source.
  --holoscript-root <path>   HoloScript repo used for local HoloScript CLI checks.
  --output <path>            JSON receipt. Defaults to .tmp/holoshell/source-validation.json.
  --js-output <path>         Browser bootstrap. Defaults to .tmp/holoshell/source-validation.js.
  --compile-output-dir <dir> Legacy compile output dir retained for receipt compatibility.
  --timeout-ms <n>           Per-file validation timeout. Defaults to 60000.
  --overall-timeout-ms <n>   Whole sweep timeout. Defaults to 180000.
  --fail-fast                Stop after the first validation failure.
  --json                     Print the receipt.
  --self-test                Assert fixture summarization without invoking the CLI.
  -h, --help                 Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function relativeRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function redactText(value) {
  return String(value || '')
    .split(REPO_ROOT).join('[hololand-root]')
    .split(REPO_ROOT.replace(/\\/g, '/')).join('[hololand-root]')
    .split(DEFAULT_HOLOSCRIPT_ROOT).join('[holoscript-root]')
    .split(DEFAULT_HOLOSCRIPT_ROOT.replace(/\\/g, '/')).join('[holoscript-root]')
    .replace(/(api[_-]?key|token|secret|password)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]');
}

function stripAnsi(value) {
  return redactText(value).replace(/\u001b\[[0-9;]*m/g, '');
}

function tailLines(value, count = 10) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count);
}

function listSourceFiles(dirPath) {
  const resolved = resolveRepoPath(dirPath);
  if (!existsSync(resolved)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(child);
    }
  };
  visit(resolved);
  return files.sort((left, right) => relativeRepoPath(left).localeCompare(relativeRepoPath(right)));
}

function packageRunner() {
  return 'pnpm';
}

function directCliPaths(args) {
  const root = resolveRepoPath(args.holoscriptRoot);
  const cliPath = path.join(root, 'packages', 'cli', 'dist', 'cli.js');
  const coreIndex = path.join(
    root,
    'packages',
    'cli',
    'node_modules',
    '@holoscript',
    'core',
    'dist',
    'index.js'
  );
  return {
    root,
    cliPath,
    coreIndex,
    directCliPresent: existsSync(cliPath),
    cliWorkspaceCoreDistPresent: existsSync(coreIndex),
  };
}

function runValidation(filePath, command, commandArgs, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ? resolveRepoPath(options.cwd) : REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: args.timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const exitCode = typeof result.status === 'number' ? result.status : result.error ? 1 : 0;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    file: relativeRepoPath(filePath),
    extension: path.extname(filePath),
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
    timedOut,
    durationMs: Date.now() - startedAt,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr || result.error?.message || ''),
  };
}

function compiledOutputPath(filePath, args) {
  const relative = relativeRepoPath(filePath);
  const safeBase = relative.replace(/[^A-Za-z0-9._-]+/g, '__');
  const hash = sha256(relative).slice(0, 12);
  return path.join(resolveRepoPath(args.compileOutputDir), `${safeBase}.${hash}.js`);
}

function packageValidationCommandFor(filePath, args) {
  return ['exec', 'holoscript', 'parse', filePath];
}

function directValidationCommandFor(filePath, args, direct = directCliPaths(args)) {
  return [direct.cliPath, 'parse', filePath];
}

function importResolutionFailure(validation) {
  const text = [...(validation.stdoutTail || []), ...(validation.stderrTail || [])].join('\n');
  return /Cannot find module/i.test(text) && /@holoscript[\\/]+[a-z0-9_-]+|@holoscript\\[a-z0-9_-]+|@holoscript\/[a-z0-9_-]+/i.test(text);
}

function dependencyMaterializationFailure(validation) {
  const text = [...(validation.stdoutTail || []), ...(validation.stderrTail || [])].join('\n');
  return (
    /Cannot find module/i.test(text) &&
    (/node_modules[\\/]+\.pnpm[\\/]+@holoscript\+/i.test(text) || /@holoscript[\\/]+[a-z0-9_-]+/i.test(text)) &&
    (/dist[\\/]+chunk-[A-Z0-9]+\.js/i.test(text) || /imported from .*@holoscript/i.test(text))
  );
}

function dependencyRecovery(validation) {
  if (!dependencyMaterializationFailure(validation)) return null;
  return {
    kind: 'stale_file_dependency_materialization',
    commandPreview: 'pnpm install --frozen-lockfile',
    mutationClass: 'local_node_modules_relink_only',
    lockfileMutationAllowed: false,
    explanation: 'A local file: dependency resolved to a stale pnpm package copy. Relink dependencies without changing the lockfile, then rerun source validation.',
  };
}

function validateFile(filePath, args) {
  const direct = directCliPaths(args);
  if (direct.directCliPresent && direct.cliWorkspaceCoreDistPresent) {
    const first = runValidation(filePath, 'node', directValidationCommandFor(filePath, args, direct), args, { cwd: direct.root });
    return {
      ...first,
      diagnosticKind: first.status === 'pass'
        ? 'direct_holoscript_cli_primary_passed'
        : 'direct_holoscript_cli_primary_failed',
      directCliPrimary: {
        attempted: true,
        reason: 'local_holoscript_cli_present',
        directCliPresent: true,
        cliWorkspaceCoreDistPresent: true,
      },
    };
  }

  const first = runValidation(filePath, packageRunner(), packageValidationCommandFor(filePath, args), args, { cwd: REPO_ROOT });
  if (first.status === 'pass' || !importResolutionFailure(first)) return first;

  if (!direct.directCliPresent || !direct.cliWorkspaceCoreDistPresent) {
    return {
      ...first,
      diagnosticKind: 'holoscript_cli_import_resolution',
      retry: {
        attempted: false,
        reason: 'direct_cli_or_core_dist_missing',
        directCliPresent: direct.directCliPresent,
        cliWorkspaceCoreDistPresent: direct.cliWorkspaceCoreDistPresent,
        recovery: dependencyRecovery(first),
      },
    };
  }

  const retry = runValidation(
    filePath,
    'node',
    directValidationCommandFor(filePath, args, direct),
    args,
    { cwd: direct.root }
  );
  return {
    ...retry,
    diagnosticKind: retry.status === 'pass' ? 'holoscript_cli_import_retry_passed' : 'holoscript_cli_import_retry_failed',
    retry: {
      attempted: true,
      reason: 'pnpm_exec_import_resolution_failure',
      primaryExitCode: first.exitCode,
      primaryStderrTail: first.stderrTail,
      directCliPresent: true,
      cliWorkspaceCoreDistPresent: true,
      retryStatus: retry.status,
      recovery: dependencyRecovery(first),
    },
  };
}

function summarize(validations, args, durationMs) {
  const passCount = validations.filter((item) => item.status === 'pass').length;
  const failCount = validations.filter((item) => item.status === 'fail').length;
  const timedOutCount = validations.filter((item) => item.timedOut).length;
  const overallTimedOut = validations.some((item) => item.diagnosticKind === 'source_validation_overall_timeout');
  const extensionCounts = validations.reduce((counts, item) => {
    counts[item.extension] = (counts[item.extension] || 0) + 1;
    return counts;
  }, {});
  return {
    status: failCount || overallTimedOut ? 'fail' : validations.length ? 'pass' : 'fail',
    fileCount: validations.length,
    passCount,
    failCount,
    timedOutCount,
    overallTimedOut,
    overallTimeoutMs: args.overallTimeoutMs,
    holoCount: extensionCounts['.holo'] || 0,
    hsCount: extensionCounts['.hs'] || 0,
    hsplusCount: extensionCounts['.hsplus'] || 0,
    durationMs,
    sourceDir: relativeRepoPath(resolveRepoPath(args.sourceDir)),
    holoscriptRootPresent: existsSync(resolveRepoPath(args.holoscriptRoot)),
    importRetryCount: validations.filter((item) => item.retry?.attempted).length,
    importRetryPassCount: validations.filter((item) => item.retry?.attempted && item.status === 'pass').length,
    dependencyRecoveryCount: validations.filter((item) => item.retry?.recovery || item.recovery).length,
    directCliPrimaryCount: validations.filter((item) => item.directCliPrimary?.attempted).length,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function createReceipt(validations, args, durationMs) {
  const summary = summarize(validations, args, durationMs);
  const receiptInput = {
    summary,
    validations: validations.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...item }) => item),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-source-validation.hsplus',
      sourceDir: 'apps/holoshell/source',
      adapter: 'scripts/holoshell-source-validation.mjs',
      productCliRoot: '.',
      directFallbackCliRoot: '../HoloScript',
    },
    policy: {
      validatesExtensions: Array.from(SOURCE_EXTENSIONS).sort(),
      parserSourceOfTruth: 'HoloScript CLI',
      failOnAnyInvalidSource: true,
      rawCommandsIncluded: false,
      compileOutputDir: relativeRepoPath(resolveRepoPath(args.compileOutputDir)),
      validationCommand: 'node [holoscript-root]/packages/cli/dist/cli.js parse <file>',
      packageRunnerFallbackCommand: 'pnpm exec holoscript parse <file>',
      directCliPrimary: 'use local HoloScript CLI first when packages/cli/dist/cli.js and cli workspace core dist are present',
      importResolutionRetry: 'pnpm_exec_parse_to_direct_cli_parse_when_core_dist_is_present',
      dependencyMaterializationRecovery: 'pnpm install --frozen-lockfile',
      progressEvents: 'stderr_per_file_start_and_finish_when_not_json',
      overallTimeoutMs: args.overallTimeoutMs,
      mcpValidationFallback: 'capability_manifest_required_receipt_then_local_cli',
      capabilityManifestTemplate: {
        protocol: 'holoscript.capability.v1',
        declaredCapabilities: ['holoscript:validate', 'filesystem:read:local-source'],
        attestation: {
          manifestHash: '<sha256-of-canonical-manifest>',
          signer: '<verified-signer>',
          trustTier: 'verified',
          attestedAt: '<iso8601>',
        },
      },
    },
    summary,
    validations: validations.map((validation) => ({
      ...validation,
      localFallback: {
        exact: true,
        commandPreview: `node [holoscript-root]/packages/cli/dist/cli.js parse ${validation.file}`,
        packageRunnerFallback: `pnpm --dir [hololand-root] exec holoscript parse ${validation.file}`,
      },
    })),
    receipt: {
      validationHash: sha256(JSON.stringify(receiptInput)),
      rawCommandsIncluded: false,
      rawSecretsIncluded: false,
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
  writeFileSync(resolved, `window.HOLOSHELL_SOURCE_VALIDATION = ${payload};\n`, 'utf8');
  return resolved;
}

function fixtureReceipt(args) {
  return createReceipt([
    { file: 'apps/holoshell/source/a.holo', extension: '.holo', status: 'pass', exitCode: 0, timedOut: false, durationMs: 5, stdoutTail: ['Valid'], stderrTail: [] },
    { file: 'apps/holoshell/source/b.hs', extension: '.hs', status: 'pass', exitCode: 0, timedOut: false, durationMs: 5, stdoutTail: ['Valid'], stderrTail: [] },
    { file: 'apps/holoshell/source/c.hsplus', extension: '.hsplus', status: 'pass', exitCode: 0, timedOut: false, durationMs: 5, stdoutTail: ['Valid'], stderrTail: [] },
  ], args, 15);
}

function assertSelfTest(receipt) {
  const failures = [];
  const staleDependencyProbe = {
    stdoutTail: [],
    stderrTail: [
      "Cannot find module 'C:\\Users\\josep\\Documents\\GitHub\\Hololand\\node_modules\\.pnpm\\@holoscript+engine@file+..+_abc\\node_modules\\@holoscript\\engine\\dist\\chunk-C4RIYVL7.js' imported from C:\\Users\\josep\\Documents\\GitHub\\Hololand\\node_modules\\.pnpm\\@holoscript+engine@file+..+_abc\\node_modules\\@holoscript\\engine\\dist\\physics\\index.js",
    ],
  };
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'pass') failures.push('fixture should pass when all sources pass');
  if (receipt.summary.fileCount !== 3) failures.push('expected three fixture files');
  if (receipt.summary.overallTimedOut) failures.push('fixture should not time out');
  if (receipt.summary.holoCount !== 1 || receipt.summary.hsCount !== 1 || receipt.summary.hsplusCount !== 1) failures.push('extension counts mismatch');
  if (receipt.receipt.rawCommandsIncluded !== false) failures.push('raw command flag should be false');
  if (!receipt.receipt.validationHash) failures.push('missing validation hash');
  if (receipt.policy.mcpValidationFallback !== 'capability_manifest_required_receipt_then_local_cli') failures.push('missing MCP fallback policy');
  if (receipt.policy.validationCommand !== 'node [holoscript-root]/packages/cli/dist/cli.js parse <file>') failures.push('source validation must use direct local CLI parse checks first');
  if (receipt.policy.packageRunnerFallbackCommand !== 'pnpm exec holoscript parse <file>') failures.push('missing package runner fallback command');
  if (!receipt.policy.directCliPrimary) failures.push('missing direct CLI primary policy');
  if (receipt.policy.dependencyMaterializationRecovery !== 'pnpm install --frozen-lockfile') failures.push('missing dependency recovery policy');
  if (!receipt.policy.capabilityManifestTemplate?.declaredCapabilities?.includes('holoscript:validate')) failures.push('missing manifest template');
  if (!receipt.validations.every((item) => item.localFallback?.commandPreview?.includes(item.file))) failures.push('missing exact local fallback command previews');
  if (!dependencyMaterializationFailure(staleDependencyProbe)) failures.push('stale dependency probe should be classified');
  if (dependencyRecovery(staleDependencyProbe)?.commandPreview !== 'pnpm install --frozen-lockfile') failures.push('stale dependency recovery command mismatch');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function run(args) {
  if (args.selfTest) {
    const receipt = fixtureReceipt(args);
    assertSelfTest(receipt);
    return receipt;
  }

  const startedAt = Date.now();
  const deadline = startedAt + Math.max(1000, Number(args.overallTimeoutMs) || 180_000);
  const sourceFiles = listSourceFiles(args.sourceDir);
  const validations = [];
  if (!existsSync(resolveRepoPath(args.holoscriptRoot))) {
    validations.push({
      file: relativeRepoPath(resolveRepoPath(args.sourceDir)),
      extension: '',
      status: 'fail',
      exitCode: 1,
      durationMs: 0,
      stdoutTail: [],
      stderrTail: [`HoloScript root not found: ${redactText(resolveRepoPath(args.holoscriptRoot))}`],
    });
  } else {
    for (const [index, file] of sourceFiles.entries()) {
      if (Date.now() >= deadline) {
        validations.push({
          file: relativeRepoPath(resolveRepoPath(args.sourceDir)),
          extension: '',
          status: 'fail',
          exitCode: 1,
          timedOut: true,
          durationMs: Date.now() - startedAt,
          diagnosticKind: 'source_validation_overall_timeout',
          stdoutTail: [],
          stderrTail: [`Overall source-validation timeout reached after ${Date.now() - startedAt}ms; validated ${validations.length}/${sourceFiles.length} file(s).`],
        });
        break;
      }
      if (!args.json) {
        console.error(`[source-validation] ${index + 1}/${sourceFiles.length} validating ${relativeRepoPath(file)}`);
      }
      const validation = validateFile(file, args);
      validations.push(validation);
      if (!args.json) {
        console.error(`[source-validation] ${validation.status} ${validation.file} (${validation.durationMs}ms${validation.timedOut ? ', timed out' : ''})`);
      }
      if (args.failFast && validation.status === 'fail') break;
    }
  }
  return createReceipt(validations, args, Date.now() - startedAt);
}

try {
  const args = parseArgs();
  const receipt = run(args);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell source validation: ${output}`);
    console.log(`HoloShell source validation bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Sources: ${receipt.summary.passCount}/${receipt.summary.fileCount} passed`);
    console.log(`Formats: .holo ${receipt.summary.holoCount}, .hs ${receipt.summary.hsCount}, .hsplus ${receipt.summary.hsplusCount}`);
  }

  process.exit(receipt.summary.status === 'pass' || args.selfTest ? 0 : 1);
} catch (error) {
  console.error(`holoshell-source-validation failed: ${error.message}`);
  process.exit(1);
}
