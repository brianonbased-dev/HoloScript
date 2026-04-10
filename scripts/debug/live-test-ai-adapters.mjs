#!/usr/bin/env node
/**
 * Live Test: @holoscript/core AI Adapters
 * Tests AI adapter exports and mock functionality (no real API calls)
 */

import {
  OpenAIAdapter,
  AnthropicAdapter,
  registerAIAdapter,
  getAIAdapter,
  getDefaultAIAdapter,
  setDefaultAIAdapter,
  listAIAdapters,
  unregisterAIAdapter,
} from '../packages/core/dist/index.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LIVE TEST: @holoscript/core AI Adapters               ║
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
// Test 1: Exports
// =============================================================================
console.log(`\n${BOLD}📁 Test 1: AI Adapter Exports${RESET}\n`);

test('OpenAIAdapter class exported', () => {
  if (typeof OpenAIAdapter !== 'function') {
    throw new Error('OpenAIAdapter should be a class');
  }
});

test('AnthropicAdapter class exported', () => {
  if (typeof AnthropicAdapter !== 'function') {
    throw new Error('AnthropicAdapter should be a class');
  }
});

test('registerAIAdapter function exported', () => {
  if (typeof registerAIAdapter !== 'function') {
    throw new Error('registerAIAdapter should be a function');
  }
});

test('getAIAdapter function exported', () => {
  if (typeof getAIAdapter !== 'function') {
    throw new Error('getAIAdapter should be a function');
  }
});

test('listAIAdapters function exported', () => {
  if (typeof listAIAdapters !== 'function') {
    throw new Error('listAIAdapters should be a function');
  }
});

// =============================================================================
// Test 2: Adapter Registry
// =============================================================================
console.log(`\n${BOLD}📁 Test 2: Adapter Registry${RESET}\n`);

test('List adapters (initially may be empty)', () => {
  const adapters = listAIAdapters();
  if (!Array.isArray(adapters)) throw new Error('Should return array');
});

test('Create OpenAI adapter (mock)', () => {
  // Create with mock/fake key - won't work for real calls but tests instantiation
  const adapter = new OpenAIAdapter({ apiKey: 'test-key-not-real' });
  if (!adapter) throw new Error('Should create adapter');
  if (!adapter.id) throw new Error('Adapter should have id');
  if (!adapter.name) throw new Error('Adapter should have name');
});

test('Create Anthropic adapter (mock)', () => {
  const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-real' });
  if (!adapter) throw new Error('Should create adapter');
  if (!adapter.id) throw new Error('Adapter should have id');
});

test('Register adapter', () => {
  const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
  registerAIAdapter(adapter, false);
  const retrieved = getAIAdapter(adapter.id);
  if (!retrieved) throw new Error('Should retrieve registered adapter');
});

test('Set default adapter', () => {
  const adapter = new OpenAIAdapter({ apiKey: 'test-key-2' });
  registerAIAdapter(adapter, true);
  const defaultAdapter = getDefaultAIAdapter();
  if (!defaultAdapter) throw new Error('Should have default adapter');
});

test('Unregister adapter', () => {
  const adapter = new AnthropicAdapter({ apiKey: 'test-key-3' });
  registerAIAdapter(adapter, false);
  const unregistered = unregisterAIAdapter(adapter.id);
  if (!unregistered) throw new Error('Should return true for successful unregister');
});

// =============================================================================
// Test 3: Adapter Methods (structure only)
// =============================================================================
console.log(`\n${BOLD}📁 Test 3: Adapter Method Structure${RESET}\n`);

const testAdapter = new OpenAIAdapter({ apiKey: 'test' });

test('Has generateHoloScript method', () => {
  if (typeof testAdapter.generateHoloScript !== 'function') {
    throw new Error('generateHoloScript should be a method');
  }
});

test('Has explainHoloScript method', () => {
  if (typeof testAdapter.explainHoloScript !== 'function') {
    throw new Error('explainHoloScript should be a method');
  }
});

test('Has optimizeHoloScript method', () => {
  if (typeof testAdapter.optimizeHoloScript !== 'function') {
    throw new Error('optimizeHoloScript should be a method');
  }
});

test('Adapter has id property', () => {
  if (!testAdapter.id || typeof testAdapter.id !== 'string') {
    throw new Error('Adapter should have string id');
  }
});

test('Adapter has name property', () => {
  if (!testAdapter.name || typeof testAdapter.name !== 'string') {
    throw new Error('Adapter should have string name');
  }
});

// =============================================================================
// Summary
// =============================================================================
console.log(`
══════════════════════════════════════════════════════════════════

${BOLD}📊 SUMMARY:${RESET} ${passed} passed, ${failed} failed

${YELLOW}Note: Real API calls not tested (require valid API keys)${RESET}
`);

if (failed > 0) {
  console.log(`${RED}⚠️  Some AI adapter tests need attention${RESET}`);
} else {
  console.log(`${GREEN}✅ All AI adapter tests passed!${RESET}`);
}
