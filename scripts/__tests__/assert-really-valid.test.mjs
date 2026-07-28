#!/usr/bin/env node
/**
 * Regression tests for scripts/lang-audit/assert-really-valid.mjs.
 *
 * Run: node scripts/__tests__/assert-really-valid.test.mjs
 */
import assert from 'node:assert/strict';
import { checkReallyValid, countSourceDeclarations } from '../lang-audit/assert-really-valid.mjs';

let run = 0;
let failed = 0;

async function test(name, fn) {
  run += 1;
  try {
    await fn();
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(err);
  }
}

function hasDiagnostic(result, code) {
  return result.diagnostics.some((diagnostic) => diagnostic.code === code);
}

await test('accepts a real .hsplus source that preserves sibling node count', async () => {
  const source = [
    'component Root {',
    '  orb One { geometry: "sphere" }',
    '  orb Two { geometry: "cube" }',
    '}',
  ].join('\n');
  const result = await checkReallyValid(source, '.hsplus');
  assert.equal(result.ok, true);
  assert.equal(result.sourceNodeCount.count, 3);
  assert.ok(result.astNodeCount >= 3);
});

await test('rejects G2-style success:true results that carry errors', async () => {
  const source = 'component Root { orb One {} }';
  const result = await checkReallyValid(source, '.hsplus', {
    parseContent: async () => ({
      success: true,
      errors: [{ message: 'fatal parser error hidden behind success:true' }],
      ast: {
        type: 'Program',
        children: [
          { type: 'component', name: 'Root' },
          { type: 'orb', name: 'One' },
        ],
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.primary.successFlag, true);
  assert.ok(hasDiagnostic(result, 'parse-errors'));
});

await test('rejects G1-style trailing-newline verdict drift', async () => {
  const source = 'component Root { orb One {} }';
  const result = await checkReallyValid(source, '.hsplus', {
    parseContent: async (candidate) => ({
      success: candidate.endsWith('\n'),
      errors: candidate.endsWith('\n') ? [] : [{ message: 'EOF DEDENT drift' }],
      ast: {
        type: 'Program',
        children: [
          { type: 'component', name: 'Root' },
          { type: 'orb', name: 'One' },
        ],
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.ok(hasDiagnostic(result, 'newline-verdict-drift'));
});

await test('rejects G3-style AST node loss even when the parser reports no errors', async () => {
  const source = [
    'component Root {',
    '  orb One { geometry: "sphere" }',
    '  orb Two { geometry: "cube" }',
    '}',
  ].join('\n');
  assert.equal(countSourceDeclarations(source, '.hsplus').count, 3);

  const result = await checkReallyValid(source, '.hsplus', {
    parseContent: async () => ({
      success: true,
      errors: [],
      ast: {
        type: 'Program',
        children: [{ type: 'component', name: 'Root' }],
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.ok(hasDiagnostic(result, 'node-count-loss'));
});

await test('rejects the current real parser silent sibling-loss fixture', async () => {
  const source = [
    'component Root',
    '  orb One { geometry: "sphere" }',
    '  orb Two { geometry: "cube" }',
  ].join('\n');
  const result = await checkReallyValid(source, '.hsplus');

  assert.equal(result.primary.errorCount, 0);
  assert.equal(result.ok, false);
  assert.ok(hasDiagnostic(result, 'node-count-loss'));
});

// -----------------------------------------------------------------------------
// Advisory semanticDiagnostics (trait prop-schema) — SEPARATE from ok.
// These import @holoscript/core via dist, so they require a fresh core build.
// -----------------------------------------------------------------------------

await test('.holo bad trait enum value surfaces a semanticDiagnostic (ok unchanged)', async () => {
  const source = [
    'composition "T" {',
    '  object "O" {',
    '    @rigid(type: "not_a_body")',
    '    position: [0, 0, 0]',
    '  }',
    '}',
  ].join('\n');
  const result = await checkReallyValid(source, '.holo');

  // If this trips, @holoscript/core dist predates the ConfabulationValidator exports —
  // rebuild it: pnpm --filter @holoscript/core build.
  assert.notEqual(
    result.semanticDiagnosticsUnavailable,
    'core-dist-stale',
    'core dist is stale; rebuild @holoscript/core before running this test'
  );
  assert.ok(Array.isArray(result.semanticDiagnostics));
  const enumFinding = result.semanticDiagnostics.find(
    (d) => d.traitName === 'rigid' && /ENUM/i.test(d.code)
  );
  assert.ok(
    enumFinding,
    `expected a rigid enum advisory, got ${JSON.stringify(result.semanticDiagnostics)}`
  );
  // The advisory is separate from the verdict: the source is still really-valid.
  assert.equal(result.ok, true);
  assert.equal(hasDiagnostic(result, 'parse-errors'), false);
});

await test('.hsplus source yields empty semanticDiagnostics (.holo-only ceiling)', async () => {
  const source = [
    'component Root {',
    '  orb One { geometry: "sphere" }',
    '  orb Two { geometry: "cube" }',
    '}',
  ].join('\n');
  const result = await checkReallyValid(source, '.hsplus');
  assert.deepEqual(result.semanticDiagnostics, []);
  assert.equal(result.semanticDiagnosticsUnavailable, undefined);
});

await test('parseContent (Rust shadow) path yields empty semanticDiagnostics', async () => {
  const source = [
    'composition "T" {',
    '  object "O" {',
    '    @rigid(type: "not_a_body")',
    '  }',
    '}',
  ].join('\n');
  const result = await checkReallyValid(source, '.holo', {
    parseContent: async () => ({ success: true, errors: [], ast: null }),
  });
  assert.deepEqual(result.semanticDiagnostics, []);
  assert.equal(result.semanticDiagnosticsUnavailable, undefined);
});

console.log(`\n[assert-really-valid] ${run - failed}/${run} passed.`);
process.exit(failed ? 1 : 0);
