/**
 * @script_test Trait — Headless Unit Testing for HoloScript
 *
 * Provides deterministic, headless unit testing for `.hs` and `.hsplus` files.
 * Tests run without any render target — pure logic validation.
 *
 * Usage in .hs:
 * ```hs
 * @script_test "agent creates bounty" {
 *   setup { economy.init(500) }
 *   assert { economy.balance == 500 }
 *   action { economy.create_bounty("task1", 100) }
 *   assert { economy.balance == 400 }
 * }
 * ```
 *
 * Trait name: script_test
 * Category: testing
 * Compile targets: all (headless-native)
 */

export interface ScriptTestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  assertions: number;
  passedAssertions: number;
}

export interface ScriptTestBlock {
  name: string;
  setup?: () => void;
  actions: Array<() => void>;
  assertions: Array<{ description: string; check: () => boolean }>;
  teardown?: () => void;
  skip?: boolean;
}

export interface ScriptTestRunnerOptions {
  debug?: boolean;
  timeout?: number;
  bail?: boolean;
  runtimeState?: Record<string, unknown>;
}

/**
 * ScriptTestRunner — Executes @script_test blocks headlessly
 */
export class ScriptTestRunner {
  private options: Required<Omit<ScriptTestRunnerOptions, 'runtimeState'>> & { runtimeState: Record<string, unknown> };
  private tests: ScriptTestBlock[] = [];

  constructor(options: ScriptTestRunnerOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      timeout: options.timeout ?? 5000,
      bail: options.bail ?? false,
      runtimeState: options.runtimeState ?? {},
    };
  }

  /**
   * Bind runtime state for live assertion resolution
   */
  setRuntimeState(state: Record<string, unknown>): void {
    this.options.runtimeState = state;
  }

  /**
   * Register a test block
   */
  addTest(test: ScriptTestBlock): void {
    this.tests.push(test);
  }

  /**
   * Run all registered tests
   */
  runAll(): ScriptTestResult[] {
    const results: ScriptTestResult[] = [];

    for (const test of this.tests) {
      if (test.skip) {
        results.push({
          name: test.name,
          status: 'skipped',
          durationMs: 0,
          assertions: test.assertions.length,
          passedAssertions: 0,
        });
        continue;
      }

      const result = this.runSingle(test);
      results.push(result);

      if (this.options.bail && result.status === 'failed') {
        break;
      }
    }

    return results;
  }

  /**
   * Run a single test block
   */
  private runSingle(test: ScriptTestBlock): ScriptTestResult {
    const start = Date.now();
    let passedAssertions = 0;

    try {
      // Setup
      if (test.setup) {
        test.setup();
      }

      // Execute actions + assertions interleaved
      for (const action of test.actions) {
        action();
      }

      // Check all assertions
      for (const assertion of test.assertions) {
        const passed = assertion.check();
        if (passed) {
          passedAssertions++;
        } else {
          return {
            name: test.name,
            status: 'failed',
            durationMs: Date.now() - start,
            error: `Assertion failed: ${assertion.description}`,
            assertions: test.assertions.length,
            passedAssertions,
          };
        }
      }

      // Teardown
      if (test.teardown) {
        test.teardown();
      }

      return {
        name: test.name,
        status: 'passed',
        durationMs: Date.now() - start,
        assertions: test.assertions.length,
        passedAssertions,
      };
    } catch (error) {
      return {
        name: test.name,
        status: 'failed',
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
        assertions: test.assertions.length,
        passedAssertions,
      };
    }
  }

  /**
   * Parse @script_test blocks from .hs source and run them
   */
  runTestsFromSource(source: string, _filePath?: string): ScriptTestResult[] {
    const testBlocks = this.extractTestBlocks(source);

    if (this.options.debug) {
      console.log(`[script_test] Found ${testBlocks.length} test blocks`);
    }

    this.tests = testBlocks;
    return this.runAll();
  }

  /**
   * Extract @script_test blocks from source text
   */
  private extractTestBlocks(source: string): ScriptTestBlock[] {
    const blocks: ScriptTestBlock[] = [];
    const regex = /@script_test\s+"([^"]+)"\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const name = match[1];
      const startIdx = match.index + match[0].length;

      // Find matching closing brace
      let depth = 1;
      let endIdx = startIdx;
      while (depth > 0 && endIdx < source.length) {
        if (source[endIdx] === '{') depth++;
        if (source[endIdx] === '}') depth--;
        endIdx++;
      }

      const body = source.substring(startIdx, endIdx - 1).trim();

      // Parse assert blocks from the body
      const assertions: ScriptTestBlock['assertions'] = [];
      const assertRegex = /assert\s*\{([^}]+)\}/g;
      let assertMatch: RegExpExecArray | null;

      while ((assertMatch = assertRegex.exec(body)) !== null) {
        const assertBody = assertMatch[1].trim();
        assertions.push({
          description: assertBody,
          check: () => this.evaluateExpression(assertBody),
        });
      }

      blocks.push({
        name,
        assertions,
        actions: [],
      });
    }

    return blocks;
  }

  /**
   * Evaluate a simple assertion expression from @script_test blocks
   * Supports: true, false, numeric comparisons, string equality, property access
   */
  private evaluateExpression(expr: string): boolean {
    const trimmed = expr.trim();

    // Boolean literals
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Comparison operators (==, !=, >, <, >=, <=)
    const comparisonOps = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'] as const;
    for (const op of comparisonOps) {
      const idx = trimmed.indexOf(op);
      if (idx !== -1) {
        const left = this.resolveValue(trimmed.substring(0, idx).trim());
        const right = this.resolveValue(trimmed.substring(idx + op.length).trim());

        switch (op) {
          case '===': return left === right;
          case '!==': return left !== right;
          case '==': return left == right;
          case '!=': return left != right;
          case '>=': return Number(left) >= Number(right);
          case '<=': return Number(left) <= Number(right);
          case '>': return Number(left) > Number(right);
          case '<': return Number(left) < Number(right);
        }
      }
    }

    // Truthy evaluation
    const value = this.resolveValue(trimmed);
    return !!value;
  }

  /**
   * Resolve a value token to a primitive
   */
  private resolveValue(token: string): string | number | boolean | null {
    const t = token.trim();

    // Boolean
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null' || t === 'nil') return null;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);

    // Quoted string
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }

    // Runtime state lookup (supports dot-notation: entity.health)
    const state = this.options.runtimeState;
    if (state && Object.keys(state).length > 0) {
      // Direct key match
      if (t in state) {
        const val = state[t];
        if (val === null || val === undefined) return null;
        if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;
        return String(val);
      }

      // Dot-notation: entity.health → state.entity?.health
      if (t.includes('.')) {
        const parts = t.split('.');
        let current: unknown = state;
        for (const part of parts) {
          if (current == null || typeof current !== 'object') { current = undefined; break; }
          current = (current as Record<string, unknown>)[part];
        }
        if (current !== undefined) {
          if (current === null) return null;
          if (typeof current === 'number' || typeof current === 'boolean' || typeof current === 'string') return current;
          return String(current);
        }
      }
    }

    // Identifier (return as string for comparison)
    return t;
  }

  /**
   * Bind a HeadlessRuntime so @script_test assertions can read live scene state.
   * Snapshots the runtime's state into runtimeState before each test run.
   *
   * Usage:
   * ```ts
   * import { createHeadlessRuntime } from '../runtime/HeadlessRuntime';
   * const runtime = createHeadlessRuntime(ast);
   * runtime.setState('balance', 500);
   * runner.bindHeadlessRuntime(runtime);
   * // Now @script_test assertions like `assert { balance == 500 }` work
   * ```
   */
  bindHeadlessRuntime(runtime: { getAllState(): Record<string, unknown> }): void {
    this.options.runtimeState = runtime.getAllState();
  }
}

/**
 * Trait definition for the standard traits registry
 */
export const SCRIPT_TEST_TRAIT = {
  name: 'script_test',
  category: 'testing',
  description: 'Headless unit testing for HoloScript logic',
  compileTargets: ['node', 'python', 'ros2', 'headless'],
  requiresRenderer: false,
  parameters: [
    { name: 'name', type: 'string', required: true, description: 'Test name' },
    { name: 'timeout', type: 'number', required: false, default: 5000, description: 'Timeout in ms' },
    { name: 'skip', type: 'boolean', required: false, default: false, description: 'Skip this test' },
  ],
};
