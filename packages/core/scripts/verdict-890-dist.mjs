#!/usr/bin/env node
/**
 * Packaging gate for the 2026-10-14 graded verdict on @holoscript/core 8.9.0: the exact failing
 * inputs, run against the BUILT entry points npm users import (`@holoscript/core` and
 * `@holoscript/core/parser`, both `import` and `require`), resolved through package.json
 * "exports" by self-reference. Not src. Blocked is red: a missing dist, a missing export or a
 * throw where a result was expected is a failure, never a skip. Exit 0 only if every check passes.
 *
 * Run after `pnpm --filter @holoscript/core build`:  node scripts/verdict-890-dist.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const VALID = 'object Cube { position: [0, 1, 0] }';
let failed = 0;
let passed = 0;
const check = (name, fn) => {
  try {
    const why = fn();
    if (why === true) { passed++; console.log(`ok   ${name}`); }
    else { failed++; console.log(`FAIL ${name}: ${why}`); }
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: threw ${e?.constructor?.name}: ${e?.message}`);
  }
};
const codes = (r) => [...(r?.errors ?? []), ...(r?.warnings ?? [])].map((d) => d.code);

function suite(label, M, P) {
  const parseHolo = P.parseHolo;
  check(`${label} exports present`, () =>
    ['parseHolo', 'parseHoloStrict'].every((k) => typeof P[k] === 'function') &&
    ['HoloScriptValidator', 'compileToWASM'].every((k) => typeof M[k] === 'function')
      ? true : 'missing export');
  check(`${label} pass: parseHolo(valid) succeeds`, () => {
    const r = parseHolo(VALID);
    return r.success === true && r.errors.length === 0 ? true : JSON.stringify(r.errors);
  });
  check(`${label} 1: parseHolo('{{{@@@') fails`, () => {
    const r = parseHolo('{{{@@@');
    return r.success === false && r.errors.length > 0 ? true : `success=${r.success}`;
  });
  check(`${label} 2: parseHolo('') fails with HS1001`, () => {
    const r = parseHolo('');
    return r.success === false && codes(r).includes('HS1001') ? true : `success=${r.success} codes=${codes(r)}`;
  });
  check(`${label} 3: parseHolo(123) fails with HS1009`, () => {
    const r = parseHolo(123);
    return r.success === false && codes(r).includes('HS1009') ? true : `success=${r.success} codes=${codes(r)}`;
  });
  check(`${label} 4: parseHolo(null) returns HS1009 without throwing`, () => {
    const r = parseHolo(null);
    return r.success === false && codes(r).includes('HS1009') ? true : `success=${r.success} codes=${codes(r)}`;
  });
  check(`${label} 5: HoloScriptValidator.validate('{{{@@@') reports an error`, () => {
    const out = new M.HoloScriptValidator().validate('{{{@@@');
    return out.some((e) => e.severity === 'error') ? true : JSON.stringify(out);
  });
  check(`${label} 6: parseHoloStrict('{{{@@@') throws, no fabricated "@"/"" traits`, () => {
    try { const ast = P.parseHoloStrict('{{{@@@'); return `returned an AST: ${JSON.stringify(ast).slice(0, 200)}`; }
    catch { return true; }
  });
  check(`${label} 7: parseHolo('object Cube { @nope_xyz }') warns HS1006`, () => {
    const r = parseHolo('object Cube { @nope_xyz }');
    return r.success === true && codes(r).includes('HS1006') ? true : `success=${r.success} codes=${codes(r)}`;
  });
  check(`${label} 7: HoloScriptValidator warns on @nope_xyz (HS1006)`, () => {
    const out = new M.HoloScriptValidator().validate('object Cube { @nope_xyz }');
    return out.some((e) => e.severity === 'warning' && /HS1006/.test(e.message)) ? true : JSON.stringify(out);
  });
  check(`${label} 8: compileToWASM('{{{@@@') refused; valid compiles and differs`, () => {
    let g;
    try { g = M.compileToWASM('{{{@@@'); } catch { g = undefined; }
    const v = M.compileToWASM(VALID);
    if (g !== undefined) return `garbage compiled (same as valid: ${JSON.stringify(g) === JSON.stringify(v)})`;
    return typeof v?.wat === 'string' && v.wat.includes('Cube') ? true : 'valid output lacks Cube';
  });
}

const esmCore = await import('@holoscript/core');
const esmParser = await import('@holoscript/core/parser');
suite('esm', esmCore, esmParser);
suite('cjs', require('@holoscript/core'), require('@holoscript/core/parser'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 && passed > 0 ? 0 : 1);
