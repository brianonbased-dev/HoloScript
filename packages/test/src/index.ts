/**
 * @holoscript/test - Testing Framework for HoloScript
 *
 * A comprehensive testing framework designed specifically for HoloScript applications,
 * supporting unit tests, scene tests, and VR/AR component testing.
 */

export { VisualTestRunner, type VisualTestConfig } from './VisualTestRunner';
export { SceneTester, type SceneTestOptions } from './SceneTester';
export * from './visual'; // Export visual testing framework
export * from './coverage'; // Export coverage tracking framework
export * from './e2e'; // Export E2E testing framework
export * from './observability'; // Export runtime observability
export * from './spatial';      // Spatial assertions: BoundingBox, SpatialEntity, setupSpatialMatchers
export * from './physics';      // Headless physics: TickSimulator, BodyDef, TickOptions
export * from './reporter';     // Semantic errors: SemanticErrorReporter, AgentFeedback, HolotestResult

// ============================================================================
// Types
// ============================================================================

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: Error;
  assertions: AssertionResult[];
}

export interface AssertionResult {
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  beforeAll?: () => void | Promise<void>;
  afterAll?: () => void | Promise<void>;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  only?: boolean;
  skip?: boolean;
  timeout?: number;
}

export interface TestRunnerOptions {
  timeout?: number;
  bail?: boolean;
  verbose?: boolean;
  filter?: string | RegExp;
  reporter?: TestReporter;
}

export interface TestReporter {
  onSuiteStart(suite: TestSuite): void;
  onSuiteEnd(suite: TestSuite, results: TestResult[]): void;
  onTestStart(test: TestCase): void;
  onTestEnd(test: TestCase, result: TestResult): void;
  onRunEnd(results: RunResult): void;
}

export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: Map<string, TestResult[]>;
}

// ============================================================================
// Assertion Context
// ============================================================================

class AssertionContext {
  private assertions: AssertionResult[] = [];

  add(result: AssertionResult): void {
    this.assertions.push(result);
    if (!result.passed) {
      const err = new AssertionError(result.message, result.expected, result.actual);
      throw err;
    }
  }

  getAssertions(): AssertionResult[] {
    return [...this.assertions];
  }

  clear(): void {
    this.assertions = [];
  }
}

// Global assertion context for current test
let currentContext: AssertionContext | null = null;

function getContext(): AssertionContext {
  if (!currentContext) {
    currentContext = new AssertionContext();
  }
  return currentContext;
}

// ============================================================================
// Assertion Error
// ============================================================================

export class AssertionError extends Error {
  constructor(
    message: string,
    public expected?: unknown,
    public actual?: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

// ============================================================================
// Assertions
// ============================================================================

export const expect = <T>(actual: T): Expectation<T> => {
  return new Expectation(actual);
};

class Expectation<T> {
  private negated = false;

  constructor(private actual: T) {}

  get not(): this {
    this.negated = true;
    return this;
  }

  private check(passed: boolean, message: string, expected?: unknown): void {
    const finalPassed = this.negated ? !passed : passed;
    const finalMessage = this.negated ? `NOT: ${message}` : message;

    getContext().add({
      passed: finalPassed,
      message: finalMessage,
      expected,
      actual: this.actual,
    });
  }

  toBe(expected: T): void {
    const passed = Object.is(this.actual, expected);
    this.check(passed, `Expected ${stringify(this.actual)} to be ${stringify(expected)}`, expected);
  }

  toEqual(expected: T): void {
    const passed = deepEqual(this.actual, expected);
    this.check(
      passed,
      `Expected ${stringify(this.actual)} to equal ${stringify(expected)}`,
      expected
    );
  }

  toBeDefined(): void {
    const passed = this.actual !== undefined;
    this.check(passed, `Expected value to be defined`);
  }

  toBeUndefined(): void {
    const passed = this.actual === undefined;
    this.check(passed, `Expected value to be undefined`);
  }

  toBeNull(): void {
    const passed = this.actual === null;
    this.check(passed, `Expected value to be null`);
  }

  toBeTruthy(): void {
    const passed = Boolean(this.actual);
    this.check(passed, `Expected ${stringify(this.actual)} to be truthy`);
  }

  toBeFalsy(): void {
    const passed = !this.actual;
    this.check(passed, `Expected ${stringify(this.actual)} to be falsy`);
  }

  toBeGreaterThan(expected: number): void {
    const actual = this.actual as unknown as number;
    const passed = actual > expected;
    this.check(passed, `Expected ${actual} to be greater than ${expected}`, expected);
  }

  toBeGreaterThanOrEqual(expected: number): void {
    const actual = this.actual as unknown as number;
    const passed = actual >= expected;
    this.check(passed, `Expected ${actual} to be greater than or equal to ${expected}`, expected);
  }

  toBeLessThan(expected: number): void {
    const actual = this.actual as unknown as number;
    const passed = actual < expected;
    this.check(passed, `Expected ${actual} to be less than ${expected}`, expected);
  }

  toBeLessThanOrEqual(expected: number): void {
    const actual = this.actual as unknown as number;
    const passed = actual <= expected;
    this.check(passed, `Expected ${actual} to be less than or equal to ${expected}`, expected);
  }

  toBeCloseTo(expected: number, precision = 2): void {
    const actual = this.actual as unknown as number;
    const diff = Math.abs(actual - expected);
    const epsilon = Math.pow(10, -precision) / 2;
    const passed = diff < epsilon;
    this.check(
      passed,
      `Expected ${actual} to be close to ${expected} (precision: ${precision})`,
      expected
    );
  }

  toContain(item: unknown): void {
    let passed = false;
    if (typeof this.actual === 'string') {
      passed = this.actual.includes(item as string);
    } else if (Array.isArray(this.actual)) {
      passed = this.actual.includes(item);
    }
    this.check(passed, `Expected ${stringify(this.actual)} to contain ${stringify(item)}`, item);
  }

  toHaveLength(expected: number): void {
    const actual = this.actual as unknown as { length: number };
    const passed = actual.length === expected;
    this.check(passed, `Expected length ${actual.length} to be ${expected}`, expected);
  }

  toHaveProperty(key: string, value?: unknown): void {
    const actual = this.actual as Record<string, unknown>;
    const hasKey = key in actual;
    const valueMatches = value === undefined || deepEqual(actual[key], value);
    const passed = hasKey && valueMatches;

    if (value !== undefined) {
      this.check(
        passed,
        `Expected object to have property "${key}" with value ${stringify(value)}`,
        value
      );
    } else {
      this.check(passed, `Expected object to have property "${key}"`);
    }
  }

  toMatch(pattern: string | RegExp): void {
    const actual = this.actual as unknown as string;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const passed = regex.test(actual);
    this.check(passed, `Expected "${actual}" to match ${pattern}`, pattern);
  }

  toThrow(expected?: string | RegExp | typeof Error): void {
    const fn = this.actual as unknown as () => unknown;
    let passed = false;
    let error: Error | undefined;

    try {
      fn();
    } catch (e) {
      error = e as Error;
      passed = true;

      if (expected) {
        if (typeof expected === 'string') {
          passed = error.message.includes(expected);
        } else if (expected instanceof RegExp) {
          passed = expected.test(error.message);
        } else {
          passed = error instanceof expected;
        }
      }
    }

    this.check(passed, `Expected function to throw${expected ? ` ${expected}` : ''}`, expected);
  }

  async toReject(expected?: string | RegExp | typeof Error): Promise<void> {
    const promise = this.actual as unknown as Promise<unknown>;
    let passed = false;
    let error: Error | undefined;

    try {
      await promise;
    } catch (e) {
      error = e as Error;
      passed = true;

      if (expected) {
        if (typeof expected === 'string') {
          passed = error.message.includes(expected);
        } else if (expected instanceof RegExp) {
          passed = expected.test(error.message);
        } else {
          passed = error instanceof expected;
        }
      }
    }

    this.check(
      passed,
      `Expected promise to reject${expected ? ` with ${expected}` : ''}`,
      expected
    );
  }

  toBeInstanceOf(expected: new (...args: unknown[]) => unknown): void {
    const passed = this.actual instanceof expected;
    this.check(
      passed,
      `Expected ${stringify(this.actual)} to be instance of ${expected.name}`,
      expected.name
    );
  }

  // HoloScript-specific assertions
  toHavePosition(x: number, y: number, z: number, tolerance = 0.001): void {
    const actual = this.actual as unknown as {
      position: [number, number, number] | { x: number; y: number; z: number };
    };
    let pos: { x: number; y: number; z: number };

    if (Array.isArray(actual.position)) {
      pos = { x: actual.position[0], y: actual.position[1], z: actual.position[2] };
    } else {
      pos = actual.position;
    }

    const passed =
      Math.abs(pos.x - x) < tolerance &&
      Math.abs(pos.y - y) < tolerance &&
      Math.abs(pos.z - z) < tolerance;

    this.check(
      passed,
      `Expected position [${pos.x}, ${pos.y}, ${pos.z}] to be [${x}, ${y}, ${z}]`,
      [x, y, z]
    );
  }

  toHaveRotation(x: number, y: number, z: number, tolerance = 0.001): void {
    const actual = this.actual as unknown as {
      rotation: [number, number, number] | { x: number; y: number; z: number };
    };
    let rot: { x: number; y: number; z: number };

    if (Array.isArray(actual.rotation)) {
      rot = { x: actual.rotation[0], y: actual.rotation[1], z: actual.rotation[2] };
    } else {
      rot = actual.rotation;
    }

    const passed =
      Math.abs(rot.x - x) < tolerance &&
      Math.abs(rot.y - y) < tolerance &&
      Math.abs(rot.z - z) < tolerance;

    this.check(
      passed,
      `Expected rotation [${rot.x}, ${rot.y}, ${rot.z}] to be [${x}, ${y}, ${z}]`,
      [x, y, z]
    );
  }

  toHaveScale(x: number, y: number, z: number, tolerance = 0.001): void {
    const actual = this.actual as unknown as {
      scale: [number, number, number] | { x: number; y: number; z: number };
    };
    let scale: { x: number; y: number; z: number };

    if (Array.isArray(actual.scale)) {
      scale = { x: actual.scale[0], y: actual.scale[1], z: actual.scale[2] };
    } else {
      scale = actual.scale;
    }

    const passed =
      Math.abs(scale.x - x) < tolerance &&
      Math.abs(scale.y - y) < tolerance &&
      Math.abs(scale.z - z) < tolerance;

    this.check(
      passed,
      `Expected scale [${scale.x}, ${scale.y}, ${scale.z}] to be [${x}, ${y}, ${z}]`,
      [x, y, z]
    );
  }

  toHaveTrait(traitName: string): void {
    const actual = this.actual as unknown as { traits?: string[] };
    const passed = actual.traits?.includes(traitName) ?? false;
    this.check(passed, `Expected object to have trait "${traitName}"`, traitName);
  }
}

// ============================================================================
// Mocking
// ============================================================================

export interface MockFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T>;
  mock: MockState<T>;
  mockClear(): void;
  mockReset(): void;
  mockImplementation(fn: T): this;
  mockImplementationOnce(fn: T): this;
  mockReturnValue(value: ReturnType<T>): this;
  mockReturnValueOnce(value: ReturnType<T>): this;
  mockResolvedValue(value: Awaited<ReturnType<T>>): this;
  mockResolvedValueOnce(value: Awaited<ReturnType<T>>): this;
  mockRejectedValue(error: unknown): this;
  mockRejectedValueOnce(error: unknown): this;
}

interface MockState<T extends (...args: unknown[]) => unknown> {
  calls: Parameters<T>[];
  results: Array<{ type: 'return' | 'throw'; value: unknown }>;
  instances: unknown[];
  lastCall?: Parameters<T>;
}

export function fn<T extends (...args: unknown[]) => unknown>(implementation?: T): MockFunction<T> {
  const state: MockState<T> = {
    calls: [],
    results: [],
    instances: [],
  };

  const implementations: T[] = [];
  const returnValues: ReturnType<T>[] = [];
  let defaultImpl = implementation;

  const mockFn = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    state.calls.push(args);
    state.lastCall = args;
    state.instances.push(this);

    let result: ReturnType<T>;
    const impl = implementations.shift() ?? defaultImpl;

    // Check for one-time return values first
    if (returnValues.length > 0) {
      result = returnValues.shift() as ReturnType<T>;
      state.results.push({ type: 'return', value: result });
      return result;
    }

    if (impl) {
      try {
        result = impl.apply(this, args) as ReturnType<T>;
        state.results.push({ type: 'return', value: result });
        return result;
      } catch (error) {
        state.results.push({ type: 'throw', value: error });
        throw error;
      }
    }

    return undefined as ReturnType<T>;
  } as MockFunction<T>;

  mockFn.mock = state;

  mockFn.mockClear = () => {
    state.calls = [];
    state.results = [];
    state.instances = [];
    state.lastCall = undefined;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
    implementations.length = 0;
    returnValues.length = 0;
    defaultImpl = undefined;
  };

  mockFn.mockImplementation = (fn: T) => {
    defaultImpl = fn;
    return mockFn;
  };

  mockFn.mockImplementationOnce = (fn: T) => {
    implementations.push(fn);
    return mockFn;
  };

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    defaultImpl = (() => value) as T;
    return mockFn;
  };

  mockFn.mockReturnValueOnce = (value: ReturnType<T>) => {
    returnValues.push(value);
    return mockFn;
  };

  mockFn.mockResolvedValue = (value: Awaited<ReturnType<T>>) => {
    defaultImpl = (() => Promise.resolve(value)) as T;
    return mockFn;
  };

  mockFn.mockResolvedValueOnce = (value: Awaited<ReturnType<T>>) => {
    implementations.push((() => Promise.resolve(value)) as T);
    return mockFn;
  };

  mockFn.mockRejectedValue = (error: unknown) => {
    defaultImpl = (() => Promise.reject(error)) as T;
    return mockFn;
  };

  mockFn.mockRejectedValueOnce = (error: unknown) => {
    implementations.push((() => Promise.reject(error)) as T);
    return mockFn;
  };

  return mockFn;
}

export function spyOn<T extends object, K extends keyof T>(
  object: T,
  method: K
): MockFunction<T[K] extends (...args: infer A) => infer R ? (...args: A) => R : never> {
  const original = object[method] as (...args: unknown[]) => unknown;
  const mock = fn(original as any);
  (object as any)[method] = mock;
  return mock as any;
}

// ============================================================================
// Test Runner
// ============================================================================

export class TestRunner {
  private suites: TestSuite[] = [];
  private options: Required<TestRunnerOptions>;

  constructor(options: TestRunnerOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 5000,
      bail: options.bail ?? false,
      verbose: options.verbose ?? true,
      filter: options.filter ?? '',
      reporter: options.reporter ?? new ConsoleReporter(),
    };
  }

  addSuite(suite: TestSuite): void {
    this.suites.push(suite);
  }

  async run(): Promise<RunResult> {
    const startTime = Date.now();
    const result: RunResult = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      suites: new Map(),
    };

    for (const suite of this.suites) {
      const suiteResults = await this.runSuite(suite);
      result.suites.set(suite.name, suiteResults);

      for (const testResult of suiteResults) {
        if (testResult.passed) {
          result.passed++;
        } else {
          result.failed++;
          if (this.options.bail) {
            break;
          }
        }
      }

      if (this.options.bail && result.failed > 0) {
        break;
      }
    }

    result.duration = Date.now() - startTime;
    this.options.reporter.onRunEnd(result);

    return result;
  }

  private async runSuite(suite: TestSuite): Promise<TestResult[]> {
    this.options.reporter.onSuiteStart(suite);
    const results: TestResult[] = [];

    try {
      if (suite.beforeAll) {
        await suite.beforeAll();
      }

      const tests = this.filterTests(suite.tests);

      for (const test of tests) {
        if (test.skip) {
          continue;
        }

        const result = await this.runTest(test, suite);
        results.push(result);

        if (!result.passed && this.options.bail) {
          break;
        }
      }
    } finally {
      if (suite.afterAll) {
        await suite.afterAll();
      }
    }

    this.options.reporter.onSuiteEnd(suite, results);
    return results;
  }

  private filterTests(tests: TestCase[]): TestCase[] {
    // Check for .only tests
    const onlyTests = tests.filter((t) => t.only);
    if (onlyTests.length > 0) {
      return onlyTests;
    }

    // Apply filter
    if (this.options.filter) {
      const pattern =
        typeof this.options.filter === 'string'
          ? new RegExp(this.options.filter, 'i')
          : this.options.filter;
      return tests.filter((t) => pattern.test(t.name));
    }

    return tests;
  }

  private async runTest(test: TestCase, suite: TestSuite): Promise<TestResult> {
    this.options.reporter.onTestStart(test);

    const startTime = Date.now();
    currentContext = new AssertionContext();

    const result: TestResult = {
      name: test.name,
      passed: true,
      duration: 0,
      assertions: [],
    };

    try {
      if (suite.beforeEach) {
        await suite.beforeEach();
      }

      const timeout = test.timeout ?? this.options.timeout;
      await Promise.race([
        test.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout)
        ),
      ]);

      result.assertions = currentContext.getAssertions();
    } catch (error) {
      result.passed = false;
      result.error = error as Error;
      result.assertions = currentContext.getAssertions();
    } finally {
      try {
        if (suite.afterEach) {
          await suite.afterEach();
        }
      } catch (e) {
        // Ignore afterEach errors if test already failed
        if (result.passed) {
          result.passed = false;
          result.error = e as Error;
        }
      }

      currentContext = null;
    }

    result.duration = Date.now() - startTime;
    this.options.reporter.onTestEnd(test, result);

    return result;
  }
}

// ============================================================================
// Console Reporter
// ============================================================================

export class ConsoleReporter implements TestReporter {
  private indent = 0;

  onSuiteStart(suite: TestSuite): void {
    console.log(`\n${'  '.repeat(this.indent)}📦 ${suite.name}`);
    this.indent++;
  }

  onSuiteEnd(_suite: TestSuite, _results: TestResult[]): void {
    this.indent--;
  }

  onTestStart(_test: TestCase): void {
    // Nothing needed
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const icon = result.passed ? '✅' : '❌';
    const time = `(${result.duration}ms)`;
    console.log(`${'  '.repeat(this.indent)}${icon} ${test.name} ${time}`);

    if (!result.passed && result.error) {
      console.log(`${'  '.repeat(this.indent + 1)}└─ ${result.error.message}`);
    }
  }

  onRunEnd(result: RunResult): void {
    console.log('\n' + '─'.repeat(50));
    console.log(`Tests: ${result.passed} passed, ${result.failed} failed`);
    console.log(`Duration: ${result.duration}ms`);
    console.log('─'.repeat(50));
  }
}

// ============================================================================
// DSL Functions
// ============================================================================

const _suiteStack: TestSuite[] = [];
let currentSuite: TestSuite | null = null;
const registeredSuites: TestSuite[] = [];

export function describe(name: string, fn: () => void): void {
  const suite: TestSuite = {
    name,
    tests: [],
  };

  const parent = currentSuite;
  currentSuite = suite;

  fn();

  if (parent) {
    // Nested describe - add tests to parent with prefixed names
    for (const test of suite.tests) {
      test.name = `${name} > ${test.name}`;
      parent.tests.push(test);
    }
  } else {
    registeredSuites.push(suite);
  }

  currentSuite = parent;
}

export function it(name: string, fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error('it() must be called inside describe()');
  }
  currentSuite.tests.push({ name, fn });
}

export const test = it;

export function beforeAll(fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error('beforeAll() must be called inside describe()');
  }
  currentSuite.beforeAll = fn;
}

export function afterAll(fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error('afterAll() must be called inside describe()');
  }
  currentSuite.afterAll = fn;
}

export function beforeEach(fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error('beforeEach() must be called inside describe()');
  }
  currentSuite.beforeEach = fn;
}

export function afterEach(fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error('afterEach() must be called inside describe()');
  }
  currentSuite.afterEach = fn;
}

// ============================================================================
// Scene Testing Utilities
// ============================================================================

export interface SceneTestContext {
  objects: Map<string, SceneObject>;
  events: EventLog[];
  time: number;
}

export interface SceneObject {
  id: string;
  name: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  traits: string[];
  state: Record<string, unknown>;
}

export interface EventLog {
  timestamp: number;
  type: string;
  source: string;
  target?: string;
  data?: unknown;
}

export function createSceneTest(): SceneTestContext {
  return {
    objects: new Map(),
    events: [],
    time: 0,
  };
}

export function addObject(
  ctx: SceneTestContext,
  obj: Partial<SceneObject> & { name: string }
): SceneObject {
  const fullObj: SceneObject = {
    id: obj.id ?? `obj_${ctx.objects.size}`,
    name: obj.name,
    type: obj.type ?? 'object',
    position: obj.position ?? [0, 0, 0],
    rotation: obj.rotation ?? [0, 0, 0],
    scale: obj.scale ?? [1, 1, 1],
    traits: obj.traits ?? [],
    state: obj.state ?? {},
  };
  ctx.objects.set(fullObj.name, fullObj);
  return fullObj;
}

export function getObject(ctx: SceneTestContext, name: string): SceneObject | undefined {
  return ctx.objects.get(name);
}

export function emit(
  ctx: SceneTestContext,
  type: string,
  source: string,
  target?: string,
  data?: unknown
): void {
  ctx.events.push({
    timestamp: ctx.time,
    type,
    source,
    target,
    data,
  });
}

export function tick(ctx: SceneTestContext, delta: number): void {
  ctx.time += delta;
}

export function getEvents(ctx: SceneTestContext, type?: string): EventLog[] {
  if (type) {
    return ctx.events.filter((e) => e.type === type);
  }
  return [...ctx.events];
}

export function clearEvents(ctx: SceneTestContext): void {
  ctx.events = [];
}

// ============================================================================
// Run Registered Tests
// ============================================================================

export async function runTests(options?: TestRunnerOptions): Promise<RunResult> {
  const runner = new TestRunner(options);
  for (const suite of registeredSuites) {
    runner.addSuite(suite);
  }
  return runner.run();
}

// ============================================================================
// Utility Functions
// ============================================================================

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (Array.isArray(value)) return `[${value.map(stringify).join(', ')}]`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    );
  }

  return false;
}
