#!/usr/bin/env node
/**
 * HoloScript Headless Runner — CLI entry point
 *
 * Usage:
 *   holoscript run script.hs                          # Default headless
 *   holoscript run script.hs --target node             # Compile to Node.js
 *   holoscript run script.hs --target python           # Compile to Python
 *   holoscript run script.hs --profile minimal         # With physics
 *   holoscript run script.hs --debug                   # Verbose output
 *   holoscript test script.hs                          # Run @script_test blocks
 *
 * Supports .hs, .hsplus, and .holo files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHeadlessRuntime, getProfile, HEADLESS_PROFILE } from '../runtime/HeadlessRuntime';
import { InteropContext } from '../interop/Interoperability';
import { parse } from '../parser/HoloScriptPlusParser';
import { ScriptTestRunner } from '../traits/ScriptTestTrait';

// ── Argument parsing ────────────────────────────────────────────────────────
interface CLIOptions {
  command: 'run' | 'test' | 'compile' | 'help';
  file?: string;
  target: 'node' | 'python' | 'ros2' | 'headless';
  profile: string;
  debug: boolean;
  output?: string;
}

function parseArgs(argv: string[]): CLIOptions {
  const args = argv.slice(2);
  const opts: CLIOptions = {
    command: 'help',
    target: 'headless',
    profile: 'headless',
    debug: false,
  };

  if (args.length === 0) return opts;

  // First arg is command
  const cmd = args[0];
  if (cmd === 'run' || cmd === 'test' || cmd === 'compile') {
    opts.command = cmd;
  }

  // Second arg is file path
  if (args[1] && !args[1].startsWith('--')) {
    opts.file = args[1];
  }

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) opts.target = args[++i] as CLIOptions['target'];
    if (args[i] === '--profile' && args[i + 1]) opts.profile = args[++i];
    if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
    if (args[i] === '--debug') opts.debug = true;
  }

  return opts;
}

// ── Commands ────────────────────────────────────────────────────────────────

async function runScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);

  console.log(`[holoscript] Running ${path.basename(filePath)} (target: ${opts.target})`);

  // Parse the source
  const ast = parse(source);

  if (opts.debug) {
    console.log(`[holoscript] Parsed ${ast.body?.length || 0} top-level nodes`);
    console.log(`[holoscript] File type: ${ext}`);
  }

  // Create runtime
  const profile = opts.profile === 'headless' ? HEADLESS_PROFILE : getProfile(opts.profile);
  const runtime = createHeadlessRuntime(ast, {
    profile,
    tickRate: 10,
    debug: opts.debug,
  });

  // Set up interop context
  const interop = new InteropContext(path.dirname(filePath));

  if (opts.debug) {
    console.log(`[holoscript] Profile: ${profile.name}`);
    console.log(`[holoscript] Interop context: ${path.dirname(filePath)}`);
  }

  // Run
  runtime.start();

  // For headless scripts, run a fixed number of ticks then stop
  const TICK_COUNT = 100;
  for (let i = 0; i < TICK_COUNT; i++) {
    runtime.tick();
  }

  runtime.stop();

  // Report
  const stats = runtime.getStats();
  console.log(`[holoscript] Complete — ${stats.tickCount} ticks, ${stats.nodesProcessed} nodes processed`);
}

async function testScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No test file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');

  console.log(`[holoscript test] Running tests in ${path.basename(filePath)}`);

  const runner = new ScriptTestRunner({ debug: opts.debug });
  const results = runner.runTestsFromSource(source, filePath);

  // Report
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log('');
  for (const result of results) {
    const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
    const color = result.status === 'passed' ? '\x1b[32m' : result.status === 'failed' ? '\x1b[31m' : '\x1b[33m';
    console.log(`  ${color}${icon}\x1b[0m ${result.name} (${result.durationMs}ms)`);
    if (result.error) {
      console.log(`    \x1b[31m${result.error}\x1b[0m`);
    }
  }

  console.log('');
  console.log(`Tests: ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total)`);

  if (failed > 0) process.exit(1);
}

function compileScript(opts: CLIOptions): void {
  if (!opts.file) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const ast = parse(source);
  const outputPath = opts.output || filePath.replace(/\.(hs|hsplus|holo)$/, `.${opts.target === 'python' ? 'py' : 'js'}`);

  console.log(`[holoscript compile] ${path.basename(filePath)} → ${opts.target} → ${path.basename(outputPath)}`);

  // Generate target output
  let output: string;
  switch (opts.target) {
    case 'node':
      output = generateNodeTarget(ast);
      break;
    case 'python':
      output = generatePythonTarget(ast);
      break;
    default:
      output = JSON.stringify(ast, null, 2);
  }

  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`[holoscript compile] Written to ${outputPath}`);
}

function generateNodeTarget(ast: any): string {
  const lines: string[] = [
    '// Auto-generated by holoscript compile --target node',
    '// Source: HoloScript composition',
    `"use strict";`,
    '',
  ];

  if (ast.body) {
    for (const node of ast.body) {
      if (node.type === 'composition' || node.type === 'ObjectDeclaration') {
        lines.push(`// ${node.type}: ${node.name || 'unnamed'}`);
        lines.push(`module.exports.${node.name || 'default'} = ${JSON.stringify(node, null, 2)};`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generatePythonTarget(ast: any): string {
  const lines: string[] = [
    '# Auto-generated by holoscript compile --target python',
    '# Source: HoloScript composition',
    'import json',
    '',
  ];

  if (ast.body) {
    for (const node of ast.body) {
      if (node.type === 'composition' || node.type === 'ObjectDeclaration') {
        const name = node.name || 'default_obj';
        lines.push(`# ${node.type}: ${name}`);
        lines.push(`${name} = json.loads('''${JSON.stringify(node)}''')`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function showHelp(): void {
  console.log(`
HoloScript CLI — Headless Runner v5.0

Usage:
  holoscript run <file>     [--target node|python|ros2] [--profile headless|minimal|full] [--debug]
  holoscript test <file>    [--debug]
  holoscript compile <file> [--target node|python] [--output <path>]

Supported file types:
  .hs       Agent templates, behavior trees, event handlers
  .hsplus   Full language with modules, types, async/await
  .holo     Spatial compositions (optional render target)

Examples:
  holoscript run agent.hs --target node --debug
  holoscript test tests.hs
  holoscript compile service.hsplus --target python --output service.py
`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  switch (opts.command) {
    case 'run':
      await runScript(opts);
      break;
    case 'test':
      await testScript(opts);
      break;
    case 'compile':
      compileScript(opts);
      break;
    case 'help':
    default:
      showHelp();
  }
}

main().catch((err) => {
  console.error('[holoscript] Fatal error:', err.message);
  process.exit(1);
});
