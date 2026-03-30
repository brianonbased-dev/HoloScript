/**
 * ScriptTestTrait.test.ts — Tests for @script_test trait
 */

import { describe, it, expect } from 'vitest';
import { ScriptTestRunner, SCRIPT_TEST_TRAIT, type ScriptTestBlock } from '../ScriptTestTrait';

describe('@script_test Trait', () => {
  it('SCRIPT_TEST_TRAIT metadata is correct', () => {
    expect(SCRIPT_TEST_TRAIT.name).toBe('script_test');
    expect(SCRIPT_TEST_TRAIT.category).toBe('testing');
    expect(SCRIPT_TEST_TRAIT.requiresRenderer).toBe(false);
    expect(SCRIPT_TEST_TRAIT.compileTargets).toContain('headless');
    expect(SCRIPT_TEST_TRAIT.compileTargets).toContain('node');
    expect(SCRIPT_TEST_TRAIT.compileTargets).toContain('python');
  });

  it('runs passing tests', () => {
    const runner = new ScriptTestRunner();
    runner.addTest({
      name: 'simple pass',
      actions: [],
      assertions: [{ description: '1 + 1 = 2', check: () => 1 + 1 === 2 }],
    });

    const results = runner.runAll();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('passed');
    expect(results[0].passedAssertions).toBe(1);
  });

  it('runs failing tests', () => {
    const runner = new ScriptTestRunner();
    runner.addTest({
      name: 'simple fail',
      actions: [],
      assertions: [{ description: '1 === 2', check: () => 1 === 2 }],
    });

    const results = runner.runAll();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('1 === 2');
  });

  it('skips tests with skip flag', () => {
    const runner = new ScriptTestRunner();
    runner.addTest({
      name: 'skipped test',
      skip: true,
      actions: [],
      assertions: [{ description: 'never runs', check: () => false }],
    });

    const results = runner.runAll();
    expect(results[0].status).toBe('skipped');
  });

  it('bails on first failure when bail=true', () => {
    const runner = new ScriptTestRunner({ bail: true });
    runner.addTest({
      name: 'fail first',
      actions: [],
      assertions: [{ description: 'fails', check: () => false }],
    });
    runner.addTest({
      name: 'never reached',
      actions: [],
      assertions: [{ description: 'pass', check: () => true }],
    });

    const results = runner.runAll();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
  });

  it('runs setup and teardown', () => {
    let setupRan = false;
    let teardownRan = false;

    const runner = new ScriptTestRunner();
    runner.addTest({
      name: 'with lifecycle',
      setup: () => {
        setupRan = true;
      },
      teardown: () => {
        teardownRan = true;
      },
      actions: [],
      assertions: [{ description: 'pass', check: () => true }],
    });

    runner.runAll();
    expect(setupRan).toBe(true);
    expect(teardownRan).toBe(true);
  });

  it('parses @script_test blocks from source', () => {
    const source = `
@script_test "economy init" {
  assert { 500 > 0 }
}

@script_test "bounty creation" {
  assert { true }
  assert { 100 <= 400 }
}
`.trim();

    const runner = new ScriptTestRunner();
    const results = runner.runTestsFromSource(source);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('economy init');
    expect(results[1].name).toBe('bounty creation');
    expect(results[0].status).toBe('passed');
    expect(results[1].status).toBe('passed');
  });

  it('reports durationMs for each test', () => {
    const runner = new ScriptTestRunner();
    runner.addTest({
      name: 'timed test',
      actions: [],
      assertions: [{ description: 'pass', check: () => true }],
    });

    const results = runner.runAll();
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
