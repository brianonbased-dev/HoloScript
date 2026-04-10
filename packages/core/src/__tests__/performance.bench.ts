/**
 * HoloScript Performance Benchmarks
 *
 * Measures parsing, execution, and type checking performance.
 * Run with: npx vitest bench
 */

import { describe, bench, beforeAll } from 'vitest';
import { HoloScriptCodeParser } from '../HoloScriptCodeParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import type { ASTNode } from '../types';

// Test data
const SIMPLE_ORB = `
orb testOrb {
  name: "TestOrb"
  color: "#ff0000"
  glow: true
}
`;

const MULTIPLE_ORBS = Array.from(
  { length: 10 },
  (_, i) => `
orb orb${i} {
  name: "Orb${i}"
  color: "#${i.toString(16).padStart(6, '0')}"
  value: ${i * 10}
}
`
).join('\n');

const COMPLEX_PROGRAM = `
orb dataSource {
  name: "DataSource"
  rate: 100
}

orb processor {
  name: "Processor"
  capacity: 1000
}

orb output {
  name: "Output"
  format: "json"
}

function processData(input: number): number {
  return input * 2
}

function validateInput(data: object): boolean {
  return true
}

connect dataSource to processor as "raw"
connect processor to output as "processed"
`;

const FUNCTIONS_PROGRAM = Array.from(
  { length: 20 },
  (_, i) => `
function func${i}(x: number): number {
  return x + ${i}
}
`
).join('\n');

describe('Parser Performance', () => {
  let parser: HoloScriptCodeParser;

  beforeAll(() => {
    parser = new HoloScriptCodeParser();
  });

  bench('parse simple orb', () => {
    parser.parse(SIMPLE_ORB);
  });

  bench('parse 10 orbs', () => {
    parser.parse(MULTIPLE_ORBS);
  });

  bench('parse complex program', () => {
    parser.parse(COMPLEX_PROGRAM);
  });

  bench('parse 20 functions', () => {
    parser.parse(FUNCTIONS_PROGRAM);
  });

  bench('tokenize simple orb', () => {
    // @ts-expect-error - accessing private method for benchmark
    parser.tokenize(SIMPLE_ORB);
  });

  bench('tokenize complex program', () => {
    // @ts-expect-error - accessing private method for benchmark
    parser.tokenize(COMPLEX_PROGRAM);
  });
});

describe('Runtime Performance', () => {
  let parser: HoloScriptCodeParser;
  let runtime: HoloScriptRuntime;
  let simpleAST: ASTNode[];
  let complexAST: ASTNode[];

  beforeAll(() => {
    parser = new HoloScriptCodeParser();
    runtime = new HoloScriptRuntime();

    const simpleResult = parser.parse(SIMPLE_ORB);
    simpleAST = simpleResult.ast;

    const complexResult = parser.parse(COMPLEX_PROGRAM);
    complexAST = complexResult.ast;
  });

  bench('execute simple orb', async () => {
    runtime.reset();
    await runtime.executeProgram(simpleAST);
  });

  bench('execute complex program', async () => {
    runtime.reset();
    await runtime.executeProgram(complexAST);
  });

  bench('execute single node', async () => {
    if (simpleAST.length > 0) {
      await runtime.executeNode(simpleAST[0]);
    }
  });

  bench('runtime reset', () => {
    runtime.reset();
  });

  bench('get context', () => {
    runtime.getContext();
  });

  bench('set/get variable', () => {
    runtime.setVariable('benchVar', 42);
    runtime.getVariable('benchVar');
  });
});

describe('Type Checker Performance', () => {
  let parser: HoloScriptCodeParser;
  let typeChecker: HoloScriptTypeChecker;
  let simpleAST: ASTNode[];
  let complexAST: ASTNode[];
  let functionsAST: ASTNode[];

  beforeAll(() => {
    parser = new HoloScriptCodeParser();
    typeChecker = new HoloScriptTypeChecker();

    const simpleResult = parser.parse(SIMPLE_ORB);
    simpleAST = simpleResult.ast;

    const complexResult = parser.parse(COMPLEX_PROGRAM);
    complexAST = complexResult.ast;

    const functionsResult = parser.parse(FUNCTIONS_PROGRAM);
    functionsAST = functionsResult.ast;
  });

  bench('type check simple orb', () => {
    typeChecker.check(simpleAST);
  });

  bench('type check complex program', () => {
    typeChecker.check(complexAST);
  });

  bench('type check 20 functions', () => {
    typeChecker.check(functionsAST);
  });

  bench('get all types', () => {
    typeChecker.check(complexAST);
    typeChecker.getAllTypes();
  });
});

describe('Full Pipeline Performance', () => {
  let parser: HoloScriptCodeParser;
  let runtime: HoloScriptRuntime;
  let typeChecker: HoloScriptTypeChecker;

  beforeAll(() => {
    parser = new HoloScriptCodeParser();
    runtime = new HoloScriptRuntime();
    typeChecker = new HoloScriptTypeChecker();
  });

  bench('full pipeline: parse -> type check -> execute (simple)', async () => {
    const parseResult = parser.parse(SIMPLE_ORB);
    typeChecker.check(parseResult.ast);
    runtime.reset();
    await runtime.executeProgram(parseResult.ast);
  });

  bench('full pipeline: parse -> type check -> execute (complex)', async () => {
    const parseResult = parser.parse(COMPLEX_PROGRAM);
    typeChecker.check(parseResult.ast);
    runtime.reset();
    await runtime.executeProgram(parseResult.ast);
  });

  bench('parse only (no execution)', () => {
    parser.parse(COMPLEX_PROGRAM);
  });
});

describe('Memory and Scalability', () => {
  let parser: HoloScriptCodeParser;
  let runtime: HoloScriptRuntime;

  beforeAll(() => {
    parser = new HoloScriptCodeParser();
    runtime = new HoloScriptRuntime();
  });

  bench('parse 100 orbs', () => {
    const largeProgram = Array.from(
      { length: 100 },
      (_, i) => `
      orb orb${i} {
        name: "Orb${i}"
        value: ${i}
      }
    `
    ).join('\n');
    parser.parse(largeProgram);
  });

  bench('execute 50 orbs', async () => {
    const program = Array.from(
      { length: 50 },
      (_, i) => `
      orb orb${i} {
        name: "Orb${i}"
      }
    `
    ).join('\n');

    const result = parser.parse(program);
    runtime.reset();
    await runtime.executeProgram(result.ast);
  });

  bench('many connections', () => {
    const program = `
      orb source { name: "Source" }
      orb a { name: "A" }
      orb b { name: "B" }
      orb c { name: "C" }
      orb d { name: "D" }
      orb target { name: "Target" }
      connect source to a as "data"
      connect a to b as "data"
      connect b to c as "data"
      connect c to d as "data"
      connect d to target as "data"
    `;
    parser.parse(program);
  });
});
