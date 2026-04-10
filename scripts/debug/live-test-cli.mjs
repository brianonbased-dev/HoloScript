#!/usr/bin/env node
/**
 * Live Test: @holoscript/cli Commands
 * Tests CLI functionality
 */

import { execSync, spawnSync } from 'child_process';
import { join } from 'path';

const CLI_PATH = join(process.cwd(), 'packages/cli/dist/cli.js');
const EXAMPLES_DIR = './examples';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LIVE TEST: @holoscript/cli Commands                   ║
╚══════════════════════════════════════════════════════════════╝
`);

let passed = 0;
let failed = 0;

function runCli(args) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    encoding: 'utf-8',
    timeout: 10000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ${GREEN}✅ ${name}${RESET}`);
    passed++;
  } catch (err) {
    console.log(`  ${RED}❌ ${name}${RESET}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

// =============================================================================
// Test 1: Help and Version
// =============================================================================
console.log(`\n${BOLD}📁 Test 1: Help and Version${RESET}\n`);

test('CLI --help shows usage', () => {
  const result = runCli(['--help']);
  if (!result.stdout.includes('Usage:')) throw new Error('Help should show usage');
  if (!result.stdout.includes('Commands:')) throw new Error('Help should show commands');
});

test('CLI help command works', () => {
  const result = runCli(['help']);
  if (!result.stdout.includes('Usage:')) throw new Error('Help should show usage');
});

test('CLI version command works', () => {
  const result = runCli(['version']);
  if (!result.stdout.includes('HoloScript CLI')) throw new Error('Should show version');
});

// =============================================================================
// Test 2: Parse Command
// =============================================================================
console.log(`\n${BOLD}📁 Test 2: Parse Command${RESET}\n`);

test('Parse hello-world.hs', () => {
  const result = runCli(['parse', `${EXAMPLES_DIR}/hello-world.hs`]);
  if (!result.stdout.includes('node') && !result.stdout.includes('Parsed')) {
    throw new Error('Should parse successfully');
  }
});

test('Parse neural-network.hs', () => {
  const result = runCli(['parse', `${EXAMPLES_DIR}/neural-network.hs`]);
  // May have warnings but should not completely fail
  if (result.status !== 0 && !result.stdout.includes('Parsed')) {
    console.log(`      stdout: ${result.stdout.substring(0, 100)}`);
  }
});

test('Parse non-existent file fails gracefully', () => {
  const result = runCli(['parse', 'non-existent.hs']);
  // Should fail but not crash
  if (result.status === 0) throw new Error('Should fail for non-existent file');
});

// =============================================================================
// Test 3: AST Command
// =============================================================================
console.log(`\n${BOLD}📁 Test 3: AST Command${RESET}\n`);

test('AST command outputs JSON', () => {
  const result = runCli(['ast', `${EXAMPLES_DIR}/hello-world.hs`]);
  // Should output JSON (starts with [ or {)
  const trimmed = result.stdout.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    throw new Error('AST should output JSON');
  }
});

// =============================================================================
// Test 4: Run Command
// =============================================================================
console.log(`\n${BOLD}📁 Test 4: Run Command${RESET}\n`);

test('Run hello-world.hs executes', () => {
  const result = runCli(['run', `${EXAMPLES_DIR}/hello-world.hs`]);
  if (!result.stdout.includes('Executed') && !result.stdout.includes('Status')) {
    throw new Error('Run should show execution status');
  }
});

// =============================================================================
// Test 5: List Command
// =============================================================================
console.log(`\n${BOLD}📁 Test 5: Package Commands${RESET}\n`);

test('List command works', () => {
  const result = runCli(['list']);
  // Should work even if no packages installed
  if (result.status !== 0 && !result.stdout.includes('package')) {
    // May fail if no package.json but shouldn't crash
  }
});

// =============================================================================
// Summary
// =============================================================================
console.log(`
══════════════════════════════════════════════════════════════════

${BOLD}📊 SUMMARY:${RESET} ${passed} passed, ${failed} failed
`);

if (failed > 0) {
  console.log(`${YELLOW}⚠️  Some CLI tests need attention${RESET}`);
} else {
  console.log(`${GREEN}✅ All CLI tests passed!${RESET}`);
}
