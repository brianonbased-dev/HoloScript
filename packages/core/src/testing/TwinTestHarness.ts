/**
 * TwinTestHarness — differential / metamorphic testing.
 *
 * Asserts two implementations of the same spec produce equivalent
 * outputs (under an oracle that strips implementation-specific
 * details) for the same generated inputs. Single mechanism shared
 * across the papers that claim "two implementations agree":
 *
 *   - Paper 3 (CRDT replicas converge under concurrent ops)
 *   - Paper 10 (HS Core reference interpreter ≡ compiled path)
 *   - Paper 11 (HSPlus sandboxed trait ≡ reference impl)
 *
 * F.037: paper-supporting infrastructure IS product infrastructure.
 * D.032 candidate surface — papers-as-service customers ship their
 * own twin claims against their own implementations through this.
 *
 * Vitest-friendly: pair with `expectTwinEquivalent(spec)` inside any
 * test() block to assert and throw a diagnostic on divergence.
 *
 * Usage:
 *   const result = await runTwinTest({
 *     name: 'crdt-merge-converges',
 *     implementations: {
 *       a: { name: 'reference', run: (ops) => mergeReference(ops) },
 *       b: { name: 'optimized', run: (ops) => mergeOptimized(ops) },
 *     },
 *     generate: (seed, iter) => generateRandomOpSequence(seed, iter, 50),
 *     oracle: (state) => normalize(state),
 *     iterations: 1000,
 *     seed: 42,
 *   });
 *   expect(result.passed).toBe(true);
 *
 * Honest semantics: this harness reports divergences. It does NOT
 * prove equivalence — only that under N seeded inputs, no divergence
 * was found. The paper claim is "no divergence in N iterations under
 * generator G", not "equivalent everywhere."
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TwinImplementation<I, O> {
  /** Human-readable name (used in divergence reports). */
  name: string;
  /** Run the implementation against an input. May be sync or async. */
  run: (input: I) => O | Promise<O>;
}

export interface TwinTestSpec<I, O, S = O> {
  /** Property/test name (used in reports and assertion messages). */
  name: string;
  /** The two implementations under comparison. */
  implementations: {
    a: TwinImplementation<I, O>;
    b: TwinImplementation<I, O>;
  };
  /**
   * Generate an input deterministically from a seed and iteration
   * number. Caller controls the input space; the harness only
   * chooses seeds. Same (seed, iteration) pair must always produce
   * the same input — divergences must be reproducible.
   */
  generate: (seed: number, iteration: number) => I;
  /**
   * Map an implementation's output to a comparable syndrome.
   * Default is the identity function (S = O) — useful when outputs
   * are already in a comparable shape.
   */
  oracle?: (output: O) => S;
  /**
   * Compare two syndromes. Default is structural deep-equal via
   * canonicalized JSON (sufficient for plain data; replace for
   * Map/Set/cyclic structures or floating-point tolerance).
   */
  equivalent?: (a: S, b: S) => boolean;
  /**
   * Optional shrinker — given a divergent input, return smaller
   * candidate inputs to try. The harness iteratively shrinks toward
   * a minimal counterexample. If omitted, the original divergent
   * input is reported as-is.
   */
  shrink?: (input: I) => I[];
  /** Number of iterations. Default 100. */
  iterations?: number;
  /** Base seed for input generation. Default 0xC0FFEE. */
  seed?: number;
  /** Maximum shrink steps per divergence. Default 100. */
  maxShrinkSteps?: number;
  /**
   * Per-iteration wall-clock budget. If either implementation
   * exceeds this, the iteration is recorded as a `timeout`
   * divergence. Default 5000 ms.
   */
  perIterationTimeoutMs?: number;
  /** Stop after the first divergence. Default false (collect all). */
  stopOnFirstDivergence?: boolean;
}

export type TwinDivergenceReason =
  | 'syndrome-mismatch'
  | 'a-threw'
  | 'b-threw'
  | 'timeout';

export interface TwinTestDivergence<I, O, S> {
  iteration: number;
  /** The input that produced divergent outputs. */
  input: I;
  outputA: O | { error: string };
  outputB: O | { error: string };
  syndromeA: S | { error: string };
  syndromeB: S | { error: string };
  /** True if shrinking found a smaller divergent input. */
  shrunk: boolean;
  /** Number of shrink steps that landed on this minimal input. */
  shrinkSteps: number;
  reason: TwinDivergenceReason;
  /** Original (un-shrunk) input, if shrinking was applied. */
  originalInput?: I;
}

export interface TwinTestResult<I, O, S> {
  passed: boolean;
  spec: { name: string; implA: string; implB: string };
  iterationsRun: number;
  iterationsTotal: number;
  durationMs: number;
  divergences: TwinTestDivergence<I, O, S>[];
  counts: {
    syndromeMismatches: number;
    aThrew: number;
    bThrew: number;
    timeouts: number;
  };
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_ITERATIONS = 100;
const DEFAULT_SEED = 0xc0ffee;
const DEFAULT_MAX_SHRINK_STEPS = 100;
const DEFAULT_PER_ITERATION_TIMEOUT_MS = 5_000;

/**
 * Default syndrome equivalence — structural deep-equal via
 * canonicalized JSON. Object keys are sorted recursively before
 * stringify, so `{a:1,b:2}` and `{b:2,a:1}` compare equal. Array
 * order is preserved (use a custom oracle to normalize order if
 * the spec is order-insensitive).
 *
 * Sufficient for plain data: numbers, strings, arrays, plain
 * objects. Replace via spec.equivalent for Map/Set/cyclic graphs
 * or floating-point-tolerant comparisons.
 */
export function defaultEquivalent<S>(a: S, b: S): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
    const obj = val as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  });
}

// =============================================================================
// CORE HARNESS
// =============================================================================

/**
 * Run a twin test. Returns a result describing every divergence
 * found (or none, if both implementations agreed across all
 * iterations).
 */
export async function runTwinTest<I, O, S = O>(
  spec: TwinTestSpec<I, O, S>
): Promise<TwinTestResult<I, O, S>> {
  const iterations = spec.iterations ?? DEFAULT_ITERATIONS;
  const seed = spec.seed ?? DEFAULT_SEED;
  const maxShrinkSteps = spec.maxShrinkSteps ?? DEFAULT_MAX_SHRINK_STEPS;
  const perIterationTimeoutMs =
    spec.perIterationTimeoutMs ?? DEFAULT_PER_ITERATION_TIMEOUT_MS;
  const oracle = spec.oracle ?? ((o: O) => o as unknown as S);
  const equivalent = spec.equivalent ?? defaultEquivalent;
  const stopOnFirstDivergence = spec.stopOnFirstDivergence ?? false;

  const divergences: TwinTestDivergence<I, O, S>[] = [];
  const startedAt = Date.now();
  let iterationsRun = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const input = spec.generate(seed, iter);
    const div = await compareOnce(
      input,
      iter,
      spec,
      oracle,
      equivalent,
      perIterationTimeoutMs
    );
    iterationsRun++;
    if (div) {
      const minimal = spec.shrink
        ? await shrinkDivergence(
            div,
            spec,
            oracle,
            equivalent,
            perIterationTimeoutMs,
            maxShrinkSteps
          )
        : div;
      divergences.push(minimal);
      if (stopOnFirstDivergence) break;
    }
  }

  return {
    passed: divergences.length === 0,
    spec: {
      name: spec.name,
      implA: spec.implementations.a.name,
      implB: spec.implementations.b.name,
    },
    iterationsRun,
    iterationsTotal: iterations,
    durationMs: Date.now() - startedAt,
    divergences,
    counts: {
      syndromeMismatches: divergences.filter((d) => d.reason === 'syndrome-mismatch')
        .length,
      aThrew: divergences.filter((d) => d.reason === 'a-threw').length,
      bThrew: divergences.filter((d) => d.reason === 'b-threw').length,
      timeouts: divergences.filter((d) => d.reason === 'timeout').length,
    },
  };
}

async function compareOnce<I, O, S>(
  input: I,
  iteration: number,
  spec: TwinTestSpec<I, O, S>,
  oracle: (output: O) => S,
  equivalent: (a: S, b: S) => boolean,
  perIterationTimeoutMs: number
): Promise<TwinTestDivergence<I, O, S> | null> {
  const a = await runWithTimeout(
    spec.implementations.a.run,
    input,
    perIterationTimeoutMs
  );
  const b = await runWithTimeout(
    spec.implementations.b.run,
    input,
    perIterationTimeoutMs
  );

  if (a.kind === 'timeout' || b.kind === 'timeout') {
    return {
      iteration,
      input,
      outputA: a.kind === 'value' ? a.value : { error: 'timeout' },
      outputB: b.kind === 'value' ? b.value : { error: 'timeout' },
      syndromeA: { error: 'timeout' },
      syndromeB: { error: 'timeout' },
      shrunk: false,
      shrinkSteps: 0,
      reason: 'timeout',
    };
  }

  if (a.kind === 'error' && b.kind === 'error') {
    // Both threw — non-divergence iff the error messages match
    // (e.g., both rejected the same input). Different errors are
    // divergent: the implementations disagree on WHY they reject.
    if (a.error === b.error) return null;
    return {
      iteration,
      input,
      outputA: { error: a.error },
      outputB: { error: b.error },
      syndromeA: { error: a.error },
      syndromeB: { error: b.error },
      shrunk: false,
      shrinkSteps: 0,
      reason: 'syndrome-mismatch',
    };
  }
  if (a.kind === 'error') {
    return {
      iteration,
      input,
      outputA: { error: a.error },
      outputB: b.kind === 'value' ? b.value : { error: 'unreachable' },
      syndromeA: { error: a.error },
      syndromeB: b.kind === 'value' ? oracle(b.value) : { error: 'unreachable' },
      shrunk: false,
      shrinkSteps: 0,
      reason: 'a-threw',
    };
  }
  if (b.kind === 'error') {
    return {
      iteration,
      input,
      outputA: a.value,
      outputB: { error: b.error },
      syndromeA: oracle(a.value),
      syndromeB: { error: b.error },
      shrunk: false,
      shrinkSteps: 0,
      reason: 'b-threw',
    };
  }

  const syndromeA = oracle(a.value);
  const syndromeB = oracle(b.value);
  if (equivalent(syndromeA, syndromeB)) return null;

  return {
    iteration,
    input,
    outputA: a.value,
    outputB: b.value,
    syndromeA,
    syndromeB,
    shrunk: false,
    shrinkSteps: 0,
    reason: 'syndrome-mismatch',
  };
}

async function shrinkDivergence<I, O, S>(
  initial: TwinTestDivergence<I, O, S>,
  spec: TwinTestSpec<I, O, S>,
  oracle: (output: O) => S,
  equivalent: (a: S, b: S) => boolean,
  perIterationTimeoutMs: number,
  maxShrinkSteps: number
): Promise<TwinTestDivergence<I, O, S>> {
  if (!spec.shrink) return initial;
  let current = initial;
  let steps = 0;
  while (steps < maxShrinkSteps) {
    const candidates = spec.shrink(current.input);
    let foundSmaller = false;
    for (const candidate of candidates) {
      if (steps >= maxShrinkSteps) break;
      steps++;
      const div = await compareOnce(
        candidate,
        current.iteration,
        spec,
        oracle,
        equivalent,
        perIterationTimeoutMs
      );
      if (div) {
        current = {
          ...div,
          shrunk: true,
          shrinkSteps: steps,
          originalInput: initial.input,
        };
        foundSmaller = true;
        break;
      }
    }
    if (!foundSmaller) break;
  }
  return current;
}

type RunOutcome<O> =
  | { kind: 'value'; value: O }
  | { kind: 'error'; error: string }
  | { kind: 'timeout' };

async function runWithTimeout<I, O>(
  fn: (input: I) => O | Promise<O>,
  input: I,
  timeoutMs: number
): Promise<RunOutcome<O>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<RunOutcome<O>>([
      Promise.resolve()
        .then(() => fn(input))
        .then(
          (v): RunOutcome<O> => ({ kind: 'value', value: v }),
          (err): RunOutcome<O> => ({
            kind: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
        ),
      new Promise<RunOutcome<O>>((resolve) => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

// =============================================================================
// VITEST-FRIENDLY ASSERTION
// =============================================================================

/**
 * Assert twin-equivalence and throw a diagnostic Error on failure.
 * The thrown message includes the (shrunk) counterexample input,
 * both implementation outputs, both syndromes, and a count of
 * additional divergences not shown.
 */
export async function expectTwinEquivalent<I, O, S = O>(
  spec: TwinTestSpec<I, O, S>
): Promise<void> {
  const result = await runTwinTest(spec);
  if (result.passed) return;
  const first = result.divergences[0];
  const lines = [
    `Twin test failed: ${result.spec.name}`,
    `  ${result.spec.implA} vs ${result.spec.implB}`,
    `  Reason: ${first.reason}`,
    `  Iteration: ${first.iteration}${
      first.shrunk ? ` (shrunk in ${first.shrinkSteps} steps)` : ''
    }`,
    `  Input: ${formatPreview(first.input)}`,
    `  Output A: ${formatPreview(first.outputA)}`,
    `  Output B: ${formatPreview(first.outputB)}`,
    `  Syndrome A: ${formatPreview(first.syndromeA)}`,
    `  Syndrome B: ${formatPreview(first.syndromeB)}`,
  ];
  if (result.divergences.length > 1) {
    lines.push(
      `  ... and ${result.divergences.length - 1} additional divergences`
    );
  }
  lines.push(`  Iterations run: ${result.iterationsRun}/${result.iterationsTotal}`);
  lines.push(
    `  Counts: syndrome=${result.counts.syndromeMismatches} a-threw=${result.counts.aThrew} b-threw=${result.counts.bThrew} timeouts=${result.counts.timeouts}`
  );
  throw new Error(lines.join('\n'));
}

function formatPreview(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return String(v);
    return s.length > 500 ? `${s.slice(0, 497)}...` : s;
  } catch {
    return String(v);
  }
}
