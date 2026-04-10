#!/usr/bin/env node
/**
 * Live Test: @holoscript/core Type Checker
 * Tests type checking on real example files
 */

import { HoloScriptTypeChecker, HoloScriptCodeParser } from '../packages/core/dist/index.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LIVE TEST: @holoscript/core Type Checker              ║
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
// Test 1: Type Checker Initialization
// =============================================================================
console.log(`\n${BOLD}📁 Test 1: Type Checker Basics${RESET}\n`);

const typeChecker = new HoloScriptTypeChecker();

test('Type checker initializes', () => {
  if (!typeChecker) throw new Error('TypeChecker should exist');
});

test('Infer number type', () => {
  const result = typeChecker.inferType(42);
  if (result.type !== 'number') throw new Error(`Expected 'number', got '${result.type}'`);
});

test('Infer string type', () => {
  const result = typeChecker.inferType('hello');
  if (result.type !== 'string') throw new Error(`Expected 'string', got '${result.type}'`);
});

test('Infer boolean type', () => {
  const result = typeChecker.inferType(true);
  if (result.type !== 'boolean') throw new Error(`Expected 'boolean', got '${result.type}'`);
});

test('Infer array type', () => {
  const result = typeChecker.inferType([1, 2, 3]);
  if (result.type !== 'array') throw new Error(`Expected 'array', got '${result.type}'`);
  if (result.elementType !== 'number')
    throw new Error(`Expected elementType 'number', got '${result.elementType}'`);
});

test('Infer object type', () => {
  const result = typeChecker.inferType({ x: 1, y: 2 });
  if (result.type !== 'object') throw new Error(`Expected 'object', got '${result.type}'`);
});

test('Infer null/undefined as any with nullable', () => {
  const result = typeChecker.inferType(null);
  if (result.type !== 'any') throw new Error(`Expected 'any', got '${result.type}'`);
  if (!result.nullable) throw new Error('Expected nullable to be true');
});

// =============================================================================
// Test 2: Type Check AST Nodes (classical parser)
// =============================================================================
console.log(`\n${BOLD}📁 Test 2: Type Check AST Nodes${RESET}\n`);

const codeParser = new HoloScriptCodeParser();

test('Type check simple orb AST', () => {
  const code = `orb#test { color: "#ff0000" }`;
  const result = codeParser.parse(code);
  if (!result.success && result.errors.length > 0) {
    throw new Error('Parse failed: ' + result.errors[0].message);
  }

  const checkResult = typeChecker.check(result.ast);
  if (!checkResult) throw new Error('Type check returned nothing');
  if (!checkResult.valid) {
    console.log('      Diagnostics:', checkResult.diagnostics);
  }
});

test('Type check multiple orbs', () => {
  const code = `
orb#first { color: "#ff0000" }
orb#second { color: "#00ff00" }
`;
  const result = codeParser.parse(code);
  if (!result.success && result.errors.length > 0) {
    throw new Error('Parse failed: ' + result.errors[0].message);
  }

  const checkResult = typeChecker.check(result.ast);
  if (!checkResult) throw new Error('Type check returned nothing');
});

test('Type check empty AST', () => {
  const checkResult = typeChecker.check([]);
  if (!checkResult) throw new Error('Type check returned nothing');
  if (!checkResult.valid) throw new Error('Empty AST should be valid');
});

// =============================================================================
// Test 3: Built-in Function Types
// =============================================================================
console.log(`\n${BOLD}📁 Test 3: Built-in Function Types${RESET}\n`);

test('Check has add function type', () => {
  // Get from typeMap after check
  const checkResult = typeChecker.check([]);
  const addType = checkResult.typeMap.get('add');
  if (!addType) throw new Error('add should be in typeMap');
  if (addType.type !== 'function') throw new Error('add should be function type');
  if (addType.returnType !== 'number') throw new Error('add should return number');
});

test('Check has log function type', () => {
  const checkResult = typeChecker.check([]);
  const logType = checkResult.typeMap.get('log');
  if (!logType) throw new Error('log should be in typeMap');
  if (logType.returnType !== 'void') throw new Error('log should return void');
});

test('Check has spawn function type', () => {
  const checkResult = typeChecker.check([]);
  const spawnType = checkResult.typeMap.get('spawn');
  if (!spawnType) throw new Error('spawn should be in typeMap');
  if (spawnType.returnType !== 'orb') throw new Error('spawn should return orb');
});

// =============================================================================
// Summary
// =============================================================================
console.log(`
══════════════════════════════════════════════════════════════════

${BOLD}📊 SUMMARY:${RESET} ${passed} passed, ${failed} failed
`);

if (failed > 0) {
  console.log(`${YELLOW}⚠️  Some type checker tests need attention${RESET}`);
} else {
  console.log(`${GREEN}✅ All type checker tests passed!${RESET}`);
}
