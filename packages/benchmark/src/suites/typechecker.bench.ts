/**
 * Type Checker Benchmarks
 *
 * Measures type checking performance
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Bench } from 'tinybench';
import { HoloScriptPlusParser, HoloScriptTypeChecker } from '@holoscript/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fixtures - go up to package root
const fixturesDir = resolve(__dirname, '../../fixtures');
const smallSource = readFileSync(resolve(fixturesDir, 'small.hsplus'), 'utf-8');
const mediumSource = readFileSync(resolve(fixturesDir, 'medium.hsplus'), 'utf-8');

const bench = new Bench({ time: 1000 });

const parser = new HoloScriptPlusParser();
const typeChecker = new HoloScriptTypeChecker();

// Parse for type checking
const smallAst = parser.parse(smallSource).ast;
const mediumAst = parser.parse(mediumSource).ast;

bench
  .add('typecheck-small', () => {
    if (smallAst) {
      typeChecker.check(smallAst);
    }
  })
  .add('typecheck-medium', () => {
    if (mediumAst) {
      typeChecker.check(mediumAst);
    }
  })
  .add('typecheck-with-trait-validation-small', () => {
    if (smallAst) {
      // Type check includes trait validation
      typeChecker.check(smallAst);
    }
  });

export async function runTypeCheckerBench() {
  await bench.run();
  return bench;
}
