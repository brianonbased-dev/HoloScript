/**
 * @test Trait — Native Composition Testing for .hsplus
 *
 * Provides headless validation of composition state, computed values,
 * and trait behavior. Tests are defined inline within compositions using
 * the `@test` trait syntax with `$stateVar` references.
 *
 * Usage in .hsplus:
 * ```hsplus
 * @test {
 *   name: "quality score displays correctly"
 *   setup: { $qualityScore = 0.85 }
 *   assert: { $qualityPercent == 85 }
 * }
 *
 * @test {
 *   name: "economy blocks overspend"
 *   setup: { $budgetRemaining = 0 }
 *   assert: { $budgetRemaining <= 0 }
 * }
 * ```
 *
 * Trait name: test
 * Category: testing
 * Compile targets: all (headless-native)
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { ScriptTestResult } from './ScriptTestTrait';

// Re-export ScriptTestResult for consumers
export type { ScriptTestResult } from './ScriptTestTrait';

// =============================================================================
// TYPES
// =============================================================================

export interface CompositionTestConfig {
  /** Stop running tests after first failure */
  bail?: boolean;
  /** Debug logging */
  debug?: boolean;
  /** Timeout per test in ms */
  timeout?: number;
}

interface TestBlock {
  name: string;
  setupAssignments: Array<{ variable: string; expression: string }>;
  assertions: Array<{ expression: string }>;
  skip?: boolean;
}

interface ComputedDef {
  name: string;
  expression: string;
}

// =============================================================================
// COMPOSITION TEST RUNNER
// =============================================================================

/**
 * CompositionTestRunner — Executes @test blocks against composition state.
 *
 * Unlike ScriptTestRunner which uses dot-notation (entity.health),
 * this runner uses $stateVar syntax native to .hsplus compositions.
 * It also evaluates computed values, allowing tests to assert on
 * derived state (e.g., $qualityPercent from $qualityScore * 100).
 */
export class CompositionTestRunner {
  private config: Required<CompositionTestConfig>;
  private initialState: Record<string, unknown>;
  private computedDefs: ComputedDef[];

  constructor(
    initialState: Record<string, unknown>,
    computedDefs: ComputedDef[] = [],
    config: CompositionTestConfig = {}
  ) {
    this.initialState = { ...initialState };
    this.computedDefs = computedDefs;
    this.config = {
      bail: config.bail ?? false,
      debug: config.debug ?? false,
      timeout: config.timeout ?? 5000,
    };
  }

  /**
   * Extract and run all @test blocks from .hsplus source
   */
  runTestsFromSource(source: string): ScriptTestResult[] {
    const tests = this.extractTestBlocks(source);

    if (this.config.debug) {
      console.log(`[composition_test] Found ${tests.length} @test blocks`);
    }

    return this.runAll(tests);
  }

  /**
   * Run all test blocks
   */
  private runAll(tests: TestBlock[]): ScriptTestResult[] {
    const results: ScriptTestResult[] = [];

    for (const test of tests) {
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

      if (this.config.bail && result.status === 'failed') {
        break;
      }
    }

    return results;
  }

  /**
   * Run a single test block:
   * 1. Clone initial state
   * 2. Apply setup assignments
   * 3. Evaluate computed values
   * 4. Check assertions
   */
  private runSingle(test: TestBlock): ScriptTestResult {
    const start = Date.now();
    let passedAssertions = 0;

    try {
      // Clone state for isolation
      const state = { ...this.initialState };

      // Apply setup assignments: $var = value
      for (const { variable, expression } of test.setupAssignments) {
        const value = this.evaluateValue(expression, state);
        state[variable] = value;
      }

      // Evaluate computed values with the test state
      const computed = this.evaluateComputedValues(state);
      const fullState = { ...state, ...computed };

      if (this.config.debug) {
        console.log(`[composition_test] "${test.name}" state:`, fullState);
      }

      // Check assertions
      for (const assertion of test.assertions) {
        const passed = this.evaluateAssertion(assertion.expression, fullState);
        if (passed) {
          passedAssertions++;
        } else {
          return {
            name: test.name,
            status: 'failed',
            durationMs: Date.now() - start,
            error: `Assertion failed: ${assertion.expression}`,
            assertions: test.assertions.length,
            passedAssertions,
          };
        }
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

  // ─── Extraction ──────────────────────────────────────────────────────────────

  /**
   * Extract @test { name: "...", setup: { ... }, assert: { ... } } blocks
   */
  private extractTestBlocks(source: string): TestBlock[] {
    const blocks: TestBlock[] = [];
    const regex = /@test\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
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
      const block = this.parseTestBody(body);
      if (block) blocks.push(block);
    }

    return blocks;
  }

  /**
   * Parse the body of a @test block into structured data
   */
  private parseTestBody(body: string): TestBlock | null {
    // Extract name
    const nameMatch = body.match(/name:\s*"([^"]+)"/);
    if (!nameMatch) return null;
    const name = nameMatch[1];

    // Extract skip
    const skipMatch = body.match(/skip:\s*(true|false)/);
    const skip = skipMatch?.[1] === 'true';

    // Extract setup block
    const setupAssignments: TestBlock['setupAssignments'] = [];
    const setupMatch = body.match(/setup:\s*\{([^}]+)\}/);
    if (setupMatch) {
      const setupBody = setupMatch[1].trim();
      // Parse $var = expr assignments
      const assignRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/g;
      let assignMatch: RegExpExecArray | null;
      while ((assignMatch = assignRegex.exec(setupBody)) !== null) {
        setupAssignments.push({
          variable: assignMatch[1],
          expression: assignMatch[2].trim().replace(/[,;]\s*$/, ''),
        });
      }
    }

    // Extract assert blocks (can have multiple)
    const assertions: TestBlock['assertions'] = [];
    const assertRegex = /assert:\s*\{([^}]+)\}/g;
    let assertMatch: RegExpExecArray | null;
    while ((assertMatch = assertRegex.exec(body)) !== null) {
      const assertBody = assertMatch[1].trim();
      // Split on newlines or semicolons for multiple assertions
      const lines = assertBody
        .split(/[;\n]/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        assertions.push({ expression: line });
      }
    }

    return { name, setupAssignments, assertions, skip };
  }

  // ─── Evaluation ──────────────────────────────────────────────────────────────

  /**
   * Evaluate a single value expression, resolving $vars from state
   */
  private evaluateValue(expr: string, state: Record<string, unknown>): unknown {
    const trimmed = expr.trim();

    // Boolean literals
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

    // Quoted string
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // $var reference
    if (trimmed.startsWith('$')) {
      const varName = trimmed.slice(1);
      return state[varName];
    }

    // Complex expression — use safe Function evaluation
    try {
      const transformed = trimmed.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => varName);
      const keys = Object.keys(state);
      const values = Object.values(state);
      const fn = new Function(
        ...keys,
        'Math',
        'String',
        'Number',
        'Boolean',
        'Date',
        'JSON',
        `"use strict"; return (${transformed})`
      );
      return fn(...values, Math, String, Number, Boolean, Date, JSON);
    } catch {
      return trimmed;
    }
  }

  /**
   * Evaluate an assertion expression against state.
   * Supports: $var == value, $var != value, $var > value, etc.
   */
  private evaluateAssertion(expr: string, state: Record<string, unknown>): boolean {
    const trimmed = expr.trim();

    // Transform $var references to plain variable names for Function evaluation
    const transformed = trimmed.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => varName);

    try {
      const keys = Object.keys(state);
      const values = Object.values(state);
      const fn = new Function(
        ...keys,
        'Math',
        'String',
        'Number',
        'Boolean',
        'Date',
        'JSON',
        `"use strict"; return !!(${transformed})`
      );
      return fn(...values, Math, String, Number, Boolean, Date, JSON);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate computed values from their definitions
   */
  private evaluateComputedValues(state: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const def of this.computedDefs) {
      try {
        const transformed = def.expression.replace(
          /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
          (_, varName) => varName
        );
        const keys = Object.keys(state);
        const values = Object.values(state);
        const fn = new Function(
          ...keys,
          'Math',
          'String',
          'Number',
          'Boolean',
          'Date',
          'JSON',
          `"use strict"; return (${transformed})`
        );
        result[def.name] = fn(...values, Math, String, Number, Boolean, Date, JSON);
      } catch {
        result[def.name] = undefined;
      }
    }

    return result;
  }

  // ─── Static helpers ──────────────────────────────────────────────────────────

  /**
   * Extract state block from .hsplus source.
   * Handles nested objects { ... } and arrays [ ... ].
   */
  static extractStateFromSource(source: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // 1. Block format: state { key: value, ... }
    const stateMatch = source.match(/\bstate\s*\{/);
    if (stateMatch) {
      const startIdx = stateMatch.index! + stateMatch[0].length;
      const body = extractBracedBody(source, startIdx);
      Object.assign(result, parseNestedBlock(body));
    }

    // 2. Inline format: state name: type = value
    const inlineRegex = /^\s*state\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\w+\s*=\s*(.+)$/gm;
    let inlineMatch;
    while ((inlineMatch = inlineRegex.exec(source)) !== null) {
      const key = inlineMatch[1];
      if (!(key in result)) {
        result[key] = parseStateValue(inlineMatch[2].trim());
      }
    }

    return result;
  }

  /**
   * Extract computed definitions from .hsplus source
   */
  static extractComputedFromSource(source: string): ComputedDef[] {
    const defs: ComputedDef[] = [];
    const computedMatch = source.match(/\bcomputed\s*\{/);
    if (!computedMatch) return defs;

    const startIdx = computedMatch.index! + computedMatch[0].length;
    let depth = 1;
    let endIdx = startIdx;
    while (depth > 0 && endIdx < source.length) {
      if (source[endIdx] === '{') depth++;
      if (source[endIdx] === '}') depth--;
      endIdx++;
    }

    const body = source.substring(startIdx, endIdx - 1);
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+?)\s*$/);
      if (kvMatch) {
        defs.push({ name: kvMatch[1], expression: kvMatch[2] });
      }
    }

    return defs;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Find the matching closing brace and return the body between braces */
function extractBracedBody(source: string, startIdx: number): string {
  let depth = 1;
  let i = startIdx;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.substring(startIdx, i - 1);
}

/** Parse a nested block body into a Record, handling nested { } objects */
function parseNestedBlock(body: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < body.length) {
    // Skip whitespace and comments
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;

    // Skip // comments
    if (body[i] === '/' && body[i + 1] === '/') {
      while (i < body.length && body[i] !== '\n') i++;
      continue;
    }

    // Parse key
    const keyMatch = body.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*/);
    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1];
    i += keyMatch[0].length;

    // Skip whitespace after colon
    while (i < body.length && /\s/.test(body[i])) i++;

    // Parse value
    if (body[i] === '{') {
      // Nested object
      i++; // skip opening {
      const nestedBody = extractBracedBody(body, i);
      i += nestedBody.length + 1; // +1 for closing }
      result[key] = parseNestedBlock(nestedBody);
    } else if (body[i] === '[') {
      // Array — find matching ]
      const arrStart = i;
      let depth = 1;
      i++;
      while (depth > 0 && i < body.length) {
        if (body[i] === '[') depth++;
        if (body[i] === ']') depth--;
        i++;
      }
      const arrStr = body.substring(arrStart, i).trim();
      try {
        result[key] = JSON.parse(arrStr);
      } catch {
        result[key] = arrStr;
      }
    } else {
      // Scalar value — read until newline, comma, or end
      const valMatch = body.slice(i).match(/^(.+?)(?:\n|$)/);
      if (valMatch) {
        const raw = valMatch[1].trim().replace(/,\s*$/, ''); // strip trailing comma
        result[key] = parseStateValue(raw);
        i += valMatch[0].length;
      } else {
        i++;
      }
    }
  }

  return result;
}

/** Parse a state value string to a JS primitive */
function parseStateValue(raw: string): unknown {
  const v = raw.trim().replace(/,\s*$/, ''); // strip trailing comma
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// =============================================================================
// TRAIT DEFINITION
// =============================================================================

export const TEST_TRAIT = {
  name: 'test',
  category: 'testing',
  description: 'Native composition testing with $stateVar syntax',
  compileTargets: ['node', 'python', 'ros2', 'headless'],
  requiresRenderer: false,
  parameters: [
    { name: 'name', type: 'string', required: true, description: 'Test name' },
    { name: 'setup', type: 'object', required: false, description: 'State setup assignments' },
    { name: 'assert', type: 'object', required: true, description: 'Assertion expressions' },
    {
      name: 'skip',
      type: 'boolean',
      required: false,
      default: false,
      description: 'Skip this test',
    },
  ],
};

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const testHandler: TraitHandler<CompositionTestConfig> = {
  name: 'test' as any,
  defaultConfig: { bail: false, debug: false, timeout: 5000 },

  onAttach(node: any, config: CompositionTestConfig, ctx: any): void {
    const instance = new CompositionTestRunner({}, [], config);
    node.__test_instance = instance;
    ctx.emit?.('test:attached', { node, config });
  },

  onDetach(node: any, _config: CompositionTestConfig, ctx: any): void {
    delete node.__test_instance;
    ctx.emit?.('test:detached', { node });
  },

  onUpdate(): void {},

  onEvent(node: any, _config: CompositionTestConfig, ctx: any, event: any): void {
    const instance: CompositionTestRunner | undefined = node.__test_instance;
    if (!instance) return;

    const eventType = typeof event === 'string' ? event : event.type;
    if (eventType === 'test:run' && event.source) {
      const results = instance.runTestsFromSource(event.source as string);
      ctx.emit?.('test:results', { results });
    }
  },
};

export default testHandler;
