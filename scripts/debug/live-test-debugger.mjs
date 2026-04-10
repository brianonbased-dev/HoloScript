#!/usr/bin/env node
/**
 * Live Test: @holoscript/core Debugger
 * Tests debugger functionality
 */

import {
  HoloScriptDebugger,
  HoloScriptRuntime,
  createDebugger,
} from '../packages/core/dist/index.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LIVE TEST: @holoscript/core Debugger                  ║
╚══════════════════════════════════════════════════════════════╝
`);

let passed = 0;
let failed = 0;

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
// Test 1: Debugger Initialization
// =============================================================================
console.log(`\n${BOLD}📁 Test 1: Debugger Initialization${RESET}\n`);

test('HoloScriptDebugger class exported', () => {
  if (typeof HoloScriptDebugger !== 'function') {
    throw new Error('HoloScriptDebugger should be a class');
  }
});

test('createDebugger factory function exported', () => {
  if (typeof createDebugger !== 'function') {
    throw new Error('createDebugger should be a function');
  }
});

test('Create debugger without runtime', () => {
  const dbg = createDebugger();
  if (!dbg) throw new Error('Debugger should be created');
});

test('Create debugger with runtime', () => {
  const runtime = new HoloScriptRuntime();
  const dbg = new HoloScriptDebugger(runtime);
  if (!dbg) throw new Error('Debugger should be created with runtime');
});

// =============================================================================
// Test 2: Debugger Methods
// =============================================================================
console.log(`\n${BOLD}📁 Test 2: Debugger Methods${RESET}\n`);

const debugger_ = createDebugger();

test('Has setBreakpoint method', () => {
  if (typeof debugger_.setBreakpoint !== 'function') {
    throw new Error('setBreakpoint should be a method');
  }
});

test('Has removeBreakpoint method', () => {
  if (typeof debugger_.removeBreakpoint !== 'function') {
    throw new Error('removeBreakpoint should be a method');
  }
});

test('Has stepInto method', () => {
  if (typeof debugger_.stepInto !== 'function') {
    throw new Error('stepInto should be a method');
  }
});

test('Has stepOver method', () => {
  if (typeof debugger_.stepOver !== 'function') {
    throw new Error('stepOver should be a method');
  }
});

test('Has evaluate method', () => {
  if (typeof debugger_.evaluate !== 'function') {
    throw new Error('evaluate should be a method');
  }
});

test('Has getState method', () => {
  if (typeof debugger_.getState !== 'function') {
    throw new Error('getState should be a method');
  }
});

// =============================================================================
// Test 3: Debugger Operations
// =============================================================================
console.log(`\n${BOLD}📁 Test 3: Debugger Operations${RESET}\n`);

test('Load source code', () => {
  debugger_.loadSource(`
orb#test { value: 42 }
`);
  // No throw = success
});

test('Set breakpoint', () => {
  const id = debugger_.setBreakpoint(1);
  if (!id) throw new Error('Should return breakpoint ID');
});

test('Get breakpoints', () => {
  const breakpoints = debugger_.getBreakpoints();
  if (!Array.isArray(breakpoints)) throw new Error('Should return array');
});

test('Remove breakpoint', () => {
  const bp = debugger_.setBreakpoint(2);
  debugger_.removeBreakpoint(bp.id);
  // No throw = success
});

test('Get debugger state', () => {
  const state = debugger_.getState();
  if (!state) throw new Error('Should return state object');
  if (!state.status) throw new Error('State should have status');
});

test('Evaluate expression', () => {
  const result = debugger_.evaluate('1 + 1');
  // Result format depends on implementation
  if (result === undefined) throw new Error('Should return evaluation result');
});

// =============================================================================
// Summary
// =============================================================================
console.log(`
══════════════════════════════════════════════════════════════════

${BOLD}📊 SUMMARY:${RESET} ${passed} passed, ${failed} failed
`);

if (failed > 0) {
  console.log(`${RED}⚠️  Some debugger tests need attention${RESET}`);
} else {
  console.log(`${GREEN}✅ All debugger tests passed!${RESET}`);
}
