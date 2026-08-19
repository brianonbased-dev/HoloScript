#!/usr/bin/env node

/**
 * Receipt-backed HoloScript zone compiler.
 *
 * Default mode compiles the canonical HoloShell shell world through the local
 * HoloScript CLI and emits a structured receipt. Placeholder files are allowed
 * only with --demo-placeholders.
 */

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { basename, delimiter, dirname, join, relative, resolve } = require('node:path');

const TARGETS = ['unity', 'unreal', 'godot', 'babylon', 'webgpu'];
const DEFAULT_REAL_TARGETS = ['unity'];
const OUTPUT_DIR = 'examples/compiled-outputs';
const DEFAULT_RECEIPT = '.tmp/holoscript-compile-receipts/compile-all-zones-latest.json';
const CANONICAL_SOURCES = ['apps/holoshell/source/holoshell-shell-world.holo'];
const REPO_ROOT = process.cwd();

function usage() {
  return `Usage: node scripts/compile-all-zones.js [options]
       node scripts/compile-all-zones.js <file.holo> <target>

Options:
  --targets=unity,babylon        Targets to compile. Default real mode: unity.
  --sources=a.holo,b.holo        Explicit source files to compile.
  --all-zones                    Compile every .holo file through the real compiler.
  --demo-placeholders            Generate legacy demonstration placeholders.
  --output-dir <path>            Output directory. Default: examples/compiled-outputs.
  --receipt <path>               Receipt path. Default: ${DEFAULT_RECEIPT}
  --holoscript-root <path>       HoloScript repo root. Default: ../HoloScript
  --self-test                    Run guard self-test.
  -h, --help                     Show this help.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const positionals = [];
  const options = {
    allZones: false,
    demoPlaceholders: false,
    explicitSources: [],
    holoscriptRoot: process.env.HOLOSCRIPT_ROOT || resolve(REPO_ROOT, '../HoloScript'),
    outputDir: OUTPUT_DIR,
    receipt: DEFAULT_RECEIPT,
    selfTest: false,
    targets: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--all-zones') options.allZones = true;
    else if (arg === '--demo-placeholders' || arg === '--demo') options.demoPlaceholders = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith('--targets=')) {
      options.targets = splitList(arg.slice('--targets='.length));
    } else if (arg === '--targets') {
      options.targets = splitList(argv[++index] || '');
    } else if (arg.startsWith('--sources=')) {
      options.explicitSources = splitList(arg.slice('--sources='.length));
    } else if (arg === '--sources') {
      options.explicitSources = splitList(argv[++index] || '');
    } else if (arg === '--output-dir') {
      options.outputDir = argv[++index] || options.outputDir;
    } else if (arg === '--receipt') {
      options.receipt = argv[++index] || options.receipt;
    } else if (arg === '--holoscript-root') {
      options.holoscriptRoot = argv[++index] || options.holoscriptRoot;
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  applyPositionals(options, positionals);
  options.targets = options.targets || (options.demoPlaceholders ? TARGETS : DEFAULT_REAL_TARGETS);
  for (const target of options.targets) {
    if (!TARGETS.includes(target)) throw new Error(`Unsupported target: ${target}`);
  }
  return options;
}

function applyPositionals(options, positionals) {
  for (const value of positionals) {
    if (TARGETS.includes(value)) {
      if (options.targets && options.targets.length && !options.targets.includes(value)) {
        throw new Error(`Conflicting target arguments: ${options.targets.join(',')} and ${value}`);
      }
      options.targets = [value];
    } else if (/\.holo$/i.test(value)) {
      options.explicitSources.push(value);
    } else {
      throw new Error(`Unknown positional argument: ${value}`);
    }
  }
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveRepoPath(filePath) {
  return resolve(REPO_ROOT, filePath);
}

function writeText(filePath, content) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, 'utf8');
  return resolved;
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

async function findHoloFiles() {
  const { glob } = await import('glob');
  return glob('**/*.holo', {
    cwd: REPO_ROOT,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/compiled-outputs/**'],
  });
}

async function selectSources(options) {
  if (options.explicitSources.length) return options.explicitSources;
  if (options.allZones || options.demoPlaceholders) return findHoloFiles();
  return CANONICAL_SOURCES.filter((source) => existsSync(resolveRepoPath(source)));
}

function getExtension(target) {
  switch (target) {
    case 'unity':
      return '.cs';
    case 'unreal':
      return '.h';
    case 'godot':
      return '.gd';
    case 'babylon':
      return '.babylon.ts';
    case 'webgpu':
      return '.wgsl';
    default:
      return '.txt';
  }
}

function resolveHoloScriptCli(holoscriptRoot) {
  return resolve(holoscriptRoot, 'node_modules/@holoscript/cli/bin/holoscript.cjs');
}

function buildNodePath(holoscriptRoot) {
  const pnpmNodePath = resolve(holoscriptRoot, 'node_modules/.pnpm/node_modules');
  return process.env.NODE_PATH ? `${pnpmNodePath}${delimiter}${process.env.NODE_PATH}` : pnpmNodePath;
}

function runHoloScriptCli(args, holoscriptRoot) {
  const cliPath = resolveHoloScriptCli(holoscriptRoot);
  const command = `node ${cliPath} ${args.join(' ')}`;
  if (!existsSync(cliPath)) {
    return {
      command,
      status: 'failed',
      exitCode: null,
      stdout: '',
      stderr: `HoloScript CLI not found: ${cliPath}`,
    };
  }

  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: holoscriptRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: buildNodePath(holoscriptRoot) },
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  });
  return {
    command,
    status: result.error || result.status !== 0 ? 'failed' : 'pass',
    exitCode: result.status,
    stdout: String(result.stdout || ''),
    stderr: result.error?.message || String(result.stderr || ''),
  };
}

function hasPlaceholderTodo(text) {
  return /TODO:\s*Implement from\b/.test(String(text || ''));
}

function compileReal(source, target, options) {
  const absoluteSource = resolveRepoPath(source);
  const zoneName = basename(source, '.holo');
  const outputFile = join(options.outputDir, zoneName, target, `${zoneName}${getExtension(target)}`);
  const absoluteOutput = resolveRepoPath(outputFile);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  rmSync(absoluteOutput, { force: true });

  const sourceText = readFileSync(absoluteSource, 'utf8');
  const validate = runHoloScriptCli(['validate', absoluteSource], options.holoscriptRoot);
  const compile = validate.status === 'pass'
    ? runHoloScriptCli(['compile', absoluteSource, '--target', target, '-o', absoluteOutput], options.holoscriptRoot)
    : { command: '', status: 'skipped', exitCode: null, stdout: '', stderr: 'validation_failed' };

  const outputExists = existsSync(absoluteOutput);
  const outputText = outputExists ? readFileSync(absoluteOutput, 'utf8') : '';
  const outputContainsPlaceholderTodo = hasPlaceholderTodo(outputText);
  const status = validate.status === 'pass'
    && compile.status === 'pass'
    && outputExists
    && !outputContainsPlaceholderTodo
    ? 'pass'
    : 'failed';

  return {
    mode: 'real',
    source,
    target,
    status,
    sourceSha256: sha256(sourceText),
    outputPath: outputFile.replace(/\\/g, '/'),
    outputExists,
    outputSha256: outputExists ? sha256(outputText) : '',
    outputBytes: Buffer.byteLength(outputText, 'utf8'),
    outputContainsPlaceholderTodo,
    validate,
    compile,
  };
}

function generatePlaceholderCode(zoneName, target) {
  const className = zoneName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  switch (target) {
    case 'unity':
      return `using UnityEngine;

namespace Hololand.Zones
{
    public class ${className} : MonoBehaviour
    {
        private void BuildEnvironment() {
            // TODO: Implement from ${zoneName}.holo
        }
    }
}`;
    case 'godot':
      return `extends Node3D
class_name ${className}

func build_environment():
\t# TODO: Implement from ${zoneName}.holo
\tpass`;
    case 'babylon':
      return `export class ${className} {
  private buildEnvironment(): void {
    // TODO: Implement from ${zoneName}.holo
  }
}`;
    case 'webgpu':
      return `@vertex
fn vertexMain() -> @builtin(position) vec4f {
    // TODO: Implement from ${zoneName}.holo
    return vec4f(0.0);
}`;
    case 'unreal':
      return `// TODO: Implement from ${zoneName}.holo`;
    default:
      return `// Placeholder for ${target}`;
  }
}

function generateCompilationNote(source, target) {
  const zoneName = basename(source, '.holo');
  return `// Generated by HoloLand compile-all-zones demo placeholder mode
// Source: ${source}
// Target: ${target}
// Mode: demo-placeholder
//
// This file is not a real compiler artifact. Run without --demo-placeholders
// to require HoloScript CLI compilation and a structured receipt.

${generatePlaceholderCode(zoneName, target)}
`;
}

function compileDemo(source, target, options) {
  const zoneName = basename(source, '.holo');
  const outputFile = join(options.outputDir, zoneName, target, `${zoneName}${getExtension(target)}`);
  const content = generateCompilationNote(source, target);
  writeText(outputFile, content);
  return {
    mode: 'demo-placeholder',
    source,
    target,
    status: 'pass',
    outputPath: outputFile.replace(/\\/g, '/'),
    outputExists: true,
    outputSha256: sha256(content),
    outputBytes: Buffer.byteLength(content, 'utf8'),
    outputContainsPlaceholderTodo: hasPlaceholderTodo(content),
  };
}

function summarize(results, options) {
  const failures = results.filter((result) => result.status !== 'pass');
  const todoViolations = results.filter((result) => result.mode !== 'demo-placeholder' && result.outputContainsPlaceholderTodo);
  return {
    status: failures.length || todoViolations.length ? 'failed' : 'pass',
    mode: options.demoPlaceholders ? 'demo-placeholder' : 'real',
    sourceCount: new Set(results.map((result) => result.source)).size,
    targetCount: options.targets.length,
    resultCount: results.length,
    passCount: results.filter((result) => result.status === 'pass').length,
    failureCount: failures.length,
    todoViolationCount: todoViolations.length,
    demoPlaceholderCount: results.filter((result) => result.mode === 'demo-placeholder').length,
    realCompileCount: results.filter((result) => result.mode === 'real').length,
  };
}

function writeReceipt(options, sources, results) {
  const receipt = {
    schemaVersion: 'hololand.compile-all-zones.receipt.v1',
    generatedAt: new Date().toISOString(),
    source: 'scripts/compile-all-zones.js',
    mode: options.demoPlaceholders ? 'demo-placeholder' : 'real',
    placeholderModeRequiresExplicitFlag: true,
    outputDir: options.outputDir,
    holoscriptRoot: options.holoscriptRoot,
    targets: options.targets,
    sources,
    summary: summarize(results, options),
    results,
  };
  const resolved = writeText(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  receipt.receiptPath = relative(REPO_ROOT, resolved).replace(/\\/g, '/');
  writeText(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function assertSelfTest() {
  const positional = parseArgs(['apps/holoshell/source/holoshell-shell-world.holo', 'webgpu']);
  const demo = {
    mode: 'demo-placeholder',
    outputContainsPlaceholderTodo: true,
    status: 'pass',
    source: 'demo.holo',
    target: 'unity',
  };
  const realViolation = {
    mode: 'real',
    outputContainsPlaceholderTodo: true,
    status: 'failed',
    source: 'real.holo',
    target: 'unity',
  };
  const demoSummary = summarize([demo], { demoPlaceholders: true, targets: ['unity'] });
  const realSummary = summarize([realViolation], { demoPlaceholders: false, targets: ['unity'] });
  const note = generateCompilationNote('demo.holo', 'unity');
  const failures = [];
  if (positional.explicitSources[0] !== 'apps/holoshell/source/holoshell-shell-world.holo') {
    failures.push('positional .holo source should map to --sources');
  }
  if (positional.targets[0] !== 'webgpu') failures.push('positional target should map to --targets');
  if (demoSummary.status !== 'pass') failures.push('demo placeholder mode should allow placeholder TODOs');
  if (realSummary.todoViolationCount !== 1 || realSummary.status !== 'failed') failures.push('real mode must fail placeholder TODOs');
  if (!note.includes('Mode: demo-placeholder')) failures.push('demo output must distinguish placeholder mode');
  return { ok: failures.length === 0, failures, demoSummary, realSummary };
}

async function main() {
  const options = parseArgs();
  if (options.selfTest) {
    const result = assertSelfTest();
    console.log(result.ok ? 'compile-all-zones self-test passed.' : result.failures.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }

  const sources = await selectSources(options);
  console.log('HoloScript Batch Compilation Tool');
  console.log('=================================');
  console.log(`Mode: ${options.demoPlaceholders ? 'demo-placeholder' : 'real'}`);
  console.log(`Targets: ${options.targets.join(', ')}`);
  console.log(`Sources: ${sources.length}`);
  console.log(`Output: ${options.outputDir}`);
  console.log(`Receipt: ${options.receipt}`);
  console.log('');

  if (!sources.length) throw new Error('No .holo sources selected');
  if (!options.demoPlaceholders && !existsSync(options.holoscriptRoot)) {
    throw new Error(`HoloScript root not found: ${options.holoscriptRoot}`);
  }

  const results = [];
  for (const source of sources) {
    for (const target of options.targets) {
      process.stdout.write(`Compiling ${source} -> ${target}... `);
      const result = options.demoPlaceholders
        ? compileDemo(source, target, options)
        : compileReal(source, target, options);
      results.push(result);
      console.log(result.status === 'pass' ? 'pass' : 'failed');
    }
  }

  const receipt = writeReceipt(options, sources, results);
  console.log('');
  console.log(`Status: ${receipt.summary.status}`);
  console.log(`Real compiles: ${receipt.summary.realCompileCount}`);
  console.log(`Demo placeholders: ${receipt.summary.demoPlaceholderCount}`);
  console.log(`TODO violations: ${receipt.summary.todoViolationCount}`);
  console.log(`Receipt written: ${receipt.receiptPath}`);
  if (receipt.summary.status !== 'pass') process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

module.exports = {
  applyPositionals,
  generateCompilationNote,
  hasPlaceholderTodo,
  parseArgs,
  summarize,
};
