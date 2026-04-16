#!/usr/bin/env npx ts-node
/**
 * generate-trait-tests.ts
 *
 * Scans packages/core/src/traits/ for all trait files and generates
 * test scaffolds for any trait that does not yet have a corresponding
 * test file in __tests__/.
 *
 * Usage (from repo root):
 *   npx ts-node packages/core/src/traits/__tests__/generate-trait-tests.ts
 *   npx ts-node packages/core/src/traits/__tests__/generate-trait-tests.ts --dry-run
 *
 * Or move to scripts/:
 *   cp packages/core/src/traits/__tests__/generate-trait-tests.ts scripts/
 *   npx ts-node scripts/generate-trait-tests.ts
 *
 * Options:
 *   --dry-run   Print which files would be created without writing them
 *   --force     Overwrite existing test files (use with caution)
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Resolve relative to this file's location
const THIS_DIR = __dirname;
const TRAITS_DIR = path.resolve(THIS_DIR, '..');
const TESTS_DIR = path.resolve(TRAITS_DIR, '__tests__');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Files to skip (not actual traits, or helper modules)
const SKIP_FILES = new Set(['TraitTypes.ts', 'index.ts', 'types.ts']);

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect the state management pattern used by the trait handler.
 * Returns 'context' if trait uses context.setState/getState,
 * 'node' if trait stores state on the node object,
 * or 'none' if no clear pattern is found.
 */
function detectStatePattern(source: string): 'context' | 'node' | 'none' {
  if (source.includes('context.setState(') || source.includes('context.getState()')) {
    return 'context';
  }
  if (source.includes('node.__') || source.match(/node\.\w+State\s*=/)) {
    return 'node';
  }
  return 'none';
}

/**
 * Extract the handler export name from the source.
 * Looks for patterns like: export const fooHandler: TraitHandler<...>
 */
function extractHandlerName(source: string): string | null {
  const match = source.match(/export\s+const\s+(\w+Handler)\s*[=:]/);
  return match ? match[1] : null;
}

/**
 * Extract the config type name from the source.
 * Looks for patterns like: export interface FooConfig {
 */
function extractConfigTypeName(source: string): string | null {
  const match = source.match(/export\s+interface\s+(\w+Config)\s*\{/);
  return match ? match[1] : null;
}

/**
 * Extract the state key used in context.setState({ key: state })
 */
function extractContextStateKey(source: string): string | null {
  const match = source.match(/context\.setState\(\{\s*(\w+)\s*:/);
  return match ? match[1] : null;
}

/**
 * Extract the node state property name (e.g., __fooState)
 */
function extractNodeStateKey(source: string): string | null {
  const match = source.match(/node\.((?:__\w+State|\w+State))\s*=/);
  return match ? match[1] : null;
}

/**
 * Extract event types from the source (event.type === '<name>')
 */
function extractEventTypes(source: string): string[] {
  const events: string[] = [];
  const regex = /event\.type\s*===?\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    events.push(m[1]);
  }
  return events;
}

/**
 * Extract emitted events (context.emit('<name>' or ctx.emit('<name>'))
 */
function extractEmittedEvents(source: string): string[] {
  const events: string[] = [];
  const regex = /(?:context|ctx)\.emit\('([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (!events.includes(m[1])) events.push(m[1]);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Scaffold generation
// ---------------------------------------------------------------------------

function generateTestScaffold(
  traitName: string,
  handlerName: string | null,
  configTypeName: string | null,
  statePattern: 'context' | 'node' | 'none',
  stateKey: string | null,
  eventTypes: string[],
  _emittedEvents: string[]
): string {
  const importPath = `../${traitName}`;
  const lines: string[] = [];

  // Header
  lines.push(`/**`);
  lines.push(` * ${traitName} Tests (Auto-generated scaffold)`);
  lines.push(` *`);
  lines.push(` * Scaffold: replace boilerplate assertions with meaningful tests.`);
  lines.push(
    ` * See existing tests for patterns (e.g., VisionTrait.test.ts, TokenGatedTrait.test.ts)`
  );
  lines.push(` */`);
  lines.push('');

  // Imports
  lines.push(`import { describe, it, expect, beforeEach } from 'vitest';`);
  if (handlerName) {
    lines.push(`import { ${handlerName} } from '${importPath}';`);
  }
  if (configTypeName) {
    lines.push(`import type { ${configTypeName} } from '${importPath}';`);
  }
  lines.push(`import { createMockNode } from './traitTestHelpers';`);
  lines.push('');

  // Mock context for context-based traits
  if (statePattern === 'context') {
    lines.push(`// ---------------------------------------------------------------------------`);
    lines.push(`// Extended mock context with setState/getState`);
    lines.push(`// ---------------------------------------------------------------------------`);
    lines.push('');
    lines.push(`interface StatefulMockContext {`);
    lines.push(`  emit: (event: string, data: unknown) => void;`);
    lines.push(`  emittedEvents: Array<{ event: string; data: unknown }>;`);
    lines.push(`  clearEvents: () => void;`);
    lines.push(`  getState: () => Record<string, unknown>;`);
    lines.push(`  setState: (updates: Record<string, unknown>) => void;`);
    lines.push(`}`);
    lines.push('');
    lines.push(`function createStatefulMockContext(): StatefulMockContext {`);
    lines.push(`  const emittedEvents: Array<{ event: string; data: unknown }> = [];`);
    lines.push(`  let state: Record<string, unknown> = {};`);
    lines.push(`  return {`);
    lines.push(`    emit(event: string, data: unknown) {`);
    lines.push(`      emittedEvents.push({ event, data });`);
    lines.push(`    },`);
    lines.push(`    emittedEvents,`);
    lines.push(`    clearEvents() {`);
    lines.push(`      emittedEvents.length = 0;`);
    lines.push(`    },`);
    lines.push(`    getState() {`);
    lines.push(`      return state;`);
    lines.push(`    },`);
    lines.push(`    setState(updates: Record<string, unknown>) {`);
    lines.push(`      state = { ...state, ...updates };`);
    lines.push(`    },`);
    lines.push(`  };`);
    lines.push(`}`);
    lines.push('');
  } else {
    lines.push(`// Uses traitTestHelpers directly (node-based state pattern)`);
    lines.push(
      `import { createMockContext, attachTrait, sendEvent, updateTrait, getLastEvent, getEventCount } from './traitTestHelpers';`
    );
    lines.push('');
  }

  const ctxCreate =
    statePattern === 'context' ? 'createStatefulMockContext()' : 'createMockContext()';

  // Test suite
  lines.push(`describe('${traitName}', () => {`);

  // Default config
  if (handlerName) {
    lines.push(`  describe('default config', () => {`);
    lines.push(`    it('has sensible defaults', () => {`);
    lines.push(`      expect(${handlerName}.defaultConfig).toBeDefined();`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // onAttach
  if (handlerName) {
    lines.push(`  describe('onAttach', () => {`);
    lines.push(`    it('initializes state', () => {`);
    lines.push(`      const node = createMockNode('test');`);
    lines.push(`      const ctx = ${ctxCreate};`);
    lines.push(
      `      ${handlerName}.onAttach?.(node as any, ${handlerName}.defaultConfig, ctx as any);`
    );
    if (statePattern === 'context' && stateKey) {
      lines.push(`      expect(ctx.getState().${stateKey}).toBeDefined();`);
    } else if (statePattern === 'node' && stateKey) {
      lines.push(`      expect((node as any).${stateKey}).toBeDefined();`);
    }
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // onDetach
  if (handlerName) {
    lines.push(`  describe('onDetach', () => {`);
    lines.push(`    it('cleans up state', () => {`);
    lines.push(`      const node = createMockNode('test');`);
    lines.push(`      const ctx = ${ctxCreate};`);
    lines.push(
      `      ${handlerName}.onAttach?.(node as any, ${handlerName}.defaultConfig, ctx as any);`
    );
    lines.push(
      `      ${handlerName}.onDetach?.(node as any, ${handlerName}.defaultConfig, ctx as any);`
    );
    lines.push(`      // Next: verify cleanup`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // Event handling
  if (eventTypes.length > 0 && handlerName) {
    lines.push(`  describe('event handling', () => {`);
    for (const evt of eventTypes) {
      lines.push(`    it('handles ${evt} event', () => {`);
      lines.push(`      const node = createMockNode('test');`);
      lines.push(`      const ctx = ${ctxCreate};`);
      lines.push(
        `      ${handlerName}.onAttach?.(node as any, ${handlerName}.defaultConfig, ctx as any);`
      );
      lines.push(
        `      ${handlerName}.onEvent?.(node as any, ${handlerName}.defaultConfig, ctx as any, {`
      );
      lines.push(`        type: '${evt}',`);
      lines.push(`        payload: {},`);
      lines.push(`      });`);
      lines.push(`      // Next: verify event handling`);
      lines.push(`    });`);
      lines.push('');
    }
    lines.push(`  });`);
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== HoloScript Trait Test Generator ===\n');

  // 1. Scan trait files
  const traitFiles = fs
    .readdirSync(TRAITS_DIR)
    .filter(
      (f: string) => f.endsWith('Trait.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
    )
    .filter((f: string) => !SKIP_FILES.has(f));

  console.log(`Found ${traitFiles.length} trait files in ${TRAITS_DIR}\n`);

  // 2. Scan existing tests
  let existingTests: string[] = [];
  if (fs.existsSync(TESTS_DIR)) {
    existingTests = fs.readdirSync(TESTS_DIR).filter((f: string) => f.endsWith('.test.ts'));
  }

  const existingTestSet = new Set(existingTests);

  // 3. Find untested traits
  const untested: string[] = [];
  const tested: string[] = [];

  for (const file of traitFiles) {
    const traitName = file.replace('.ts', '');
    const testFileName = `${traitName}.test.ts`;
    if (existingTestSet.has(testFileName)) {
      tested.push(traitName);
    } else {
      untested.push(traitName);
    }
  }

  console.log(`Tested:   ${tested.length}`);
  console.log(`Untested: ${untested.length}\n`);

  if (untested.length === 0) {
    console.log('All traits have test files. Nothing to generate.');
    return;
  }

  // 4. Generate scaffolds
  let created = 0;
  let skipped = 0;

  for (const traitName of untested) {
    const srcPath = path.join(TRAITS_DIR, `${traitName}.ts`);
    const testPath = path.join(TESTS_DIR, `${traitName}.test.ts`);

    if (fs.existsSync(testPath) && !FORCE) {
      console.log(`  SKIP  ${traitName}.test.ts (already exists)`);
      skipped++;
      continue;
    }

    const source = fs.readFileSync(srcPath, 'utf-8');
    const handlerName = extractHandlerName(source);
    const configTypeName = extractConfigTypeName(source);
    const statePattern = detectStatePattern(source);
    const stateKey =
      statePattern === 'context'
        ? extractContextStateKey(source)
        : statePattern === 'node'
          ? extractNodeStateKey(source)
          : null;
    const eventTypes = extractEventTypes(source);
    const emittedEvents = extractEmittedEvents(source);

    const scaffold = generateTestScaffold(
      traitName,
      handlerName,
      configTypeName,
      statePattern,
      stateKey,
      eventTypes,
      emittedEvents
    );

    if (DRY_RUN) {
      console.log(`  WOULD CREATE  ${traitName}.test.ts`);
      console.log(`    handler: ${handlerName ?? '(none)'}`);
      console.log(`    config: ${configTypeName ?? '(none)'}`);
      console.log(`    state: ${statePattern} (key: ${stateKey ?? 'n/a'})`);
      console.log(`    events: ${eventTypes.join(', ') || '(none)'}`);
    } else {
      fs.writeFileSync(testPath, scaffold, 'utf-8');
      console.log(`  CREATE  ${traitName}.test.ts`);
    }
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  if (DRY_RUN) {
    console.log('(Dry run mode -- no files were written)');
  }
}

main();
