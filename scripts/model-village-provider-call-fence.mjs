/* global URL */
/**
 * Model Village provider-call fence — the ONLY honest way to publish a zero.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (it is an extraction, not an invention)
 * ---------------------------------------------------------------------------
 * MV-B6's conductor already measured provider calls correctly. Every other
 * "zero provider calls" claim on this lane was a hardcoded literal that a
 * checker then compared against — verify(emit()) === 0 === 0, unfalsifiable by
 * construction: a REAL provider call during the run would not have moved it.
 *
 * The fence below is the conductor's implementation, moved here verbatim in
 * behaviour so that MV-B4's Phase 0B tracer, the canonical-lifecycle lane, and
 * the experiment checker all measure through the SAME code the conductor is
 * already gated on, instead of each growing its own near-miss copy. The
 * conductor re-exports these names, so its callers are unchanged.
 *
 * ---------------------------------------------------------------------------
 * THE CLASSIFICATION RULE (inherited from the conductor, restated here because
 * this module is now where it lives)
 * ---------------------------------------------------------------------------
 * Every call through the fence increments a real counter and records a bounded
 * projection of its target. A call to an ABSOLUTE http/https URL is
 * additionally counted as a PROVIDER call and REFUSED by throwing. Both halves
 * matter: the count is a measurement, and the throw means a provider call that
 * does happen also corrupts the operation it happened in, so the incident shows
 * up in the surrounding receipt as well as in the counter.
 *
 * Anything that is NOT an absolute http/https target is counted, PUBLISHED in
 * nonProviderFetchCallTargets, and delegated to the original fetch so the
 * measurement does not perturb what it measures. The first fenced conductor run
 * recorded exactly one such call, to `/holoscript_wasm_bg.wasm` — the
 * HoloScript core parser initializing its own WASM binary. That is not a
 * provider call and cannot become one: Node's fetch rejects a relative URL
 * outright, so a non-absolute target has no network to reach. Only
 * providerFetchCallsObserved is gated to zero.
 *
 * ---------------------------------------------------------------------------
 * NESTED COUNTERS — why one fence is not enough
 * ---------------------------------------------------------------------------
 * The fence covers the global `fetch` binding and any handle explicitly
 * injected from it. It does NOT cover a module that captured a reference to
 * fetch BEFORE installation (for example a `fetchImpl = globalThis.fetch`
 * default parameter evaluated at module load), or a raw node:http/https socket.
 * That is why an out-of-band SECOND fence, installed EARLIER by the checker, is
 * part of the design: a pre-fence reference bypasses the inner fence and lands
 * on the outer one, which counts and refuses it. A single fence publishing a
 * zero is a weaker claim than a nested pair publishing one.
 *
 * A CHILD PROCESS used to be on that list. It is not any more: it has its own
 * globals, so no fence in the parent could ever see it, and this lane spawns
 * children on its executed path — including the HoloScript CLI, the component
 * that would actually reach a provider. Each spawn site now installs this same
 * fence INSIDE the child and folds the child's own observation back into the
 * parent's evidence.
 *
 * ---------------------------------------------------------------------------
 * ABSENT EVIDENCE MUST BLOCK
 * ---------------------------------------------------------------------------
 * If the fence could not be installed, the observation is published as
 * `measured: false` with counts of `null` and a stated reason, and
 * `verifyProviderFenceObservation` FAILS it. A zero that means "nothing was
 * watched" is exactly the defect this module exists to remove, so an
 * unmeasured window is never allowed to read as a clean one.
 *
 * ---------------------------------------------------------------------------
 * `measured` MEANS "INSTALLED THROUGHOUT", NOT "INSTALLED ONCE"
 * ---------------------------------------------------------------------------
 * An earlier version of this module computed `installed` at install time and
 * never looked again, so a window in which `globalThis.fetch` was reassigned to
 * the real fetch — and a provider call then made through it — still published
 * `measured: true` and a zero. That is the same defect in a new place: a
 * receipt asserting a measured zero over an interval nobody was watching. Two
 * independent guards now close it, and BOTH are observations:
 *
 *   1. COVERAGE AT PUBLISH. `summarizeProviderCallFence` walks the delegate
 *      chain from the live `globalThis.fetch` binding and requires this fence to
 *      be somewhere on it. Nesting is therefore fine (an inner fence delegates
 *      to the outer one, so the outer is still on the chain), but a binding
 *      swapped out for something that does not route here is not.
 *   2. A DISPLACEMENT WATCH FOR THE WHOLE WINDOW. The outermost fence replaces
 *      `globalThis.fetch` with an accessor whose setter counts every assignment
 *      this module did not itself make. A displacement that is put back before
 *      the window is published is invisible to guard 1 and is exactly what this
 *      counter exists to catch. Any displacement in a window makes that window
 *      UNMEASURED.
 *
 * ---------------------------------------------------------------------------
 * A COUNTER THAT HAS ONLY EVER READ 0 IS NOT KNOWN TO WORK
 * ---------------------------------------------------------------------------
 * On a correct run every published number here is 0, which is indistinguishable
 * from the numbers a fence that was never installed would produce. So each
 * fence drives ONE real call through the live `globalThis.fetch` binding at
 * install time and records the increment it observed. That probe is excluded
 * from every published window (the fence's baseline cursor is taken after it),
 * and `selfTest.observedIncrement` is gated to exactly 1 by the verifier — so
 * `measured: true` is backed by a counter that was seen to move on this run, on
 * this lane, rather than by a flag.
 *
 * Concurrency limit, stated plainly: install/restore is a global mutation and
 * is safe only when nesting is LIFO. `restore()` is identity-guarded, so an
 * out-of-order restore is a no-op (it leaks a fence rather than uninstalling
 * someone else's). This lane runs its fenced sections sequentially.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS STILL OUT OF SCOPE — the two remaining holes, named with their
 * reachability, never counted as zero
 * ---------------------------------------------------------------------------
 * Both were probed against the current tree; each is reachable IN PRINCIPLE and
 * has no live trigger today. Neither is "handled" — they are declared in
 * PROVIDER_CALL_FENCE_SCOPE, which every receipt on this lane publishes.
 *
 *  1. A REFERENCE TO fetch CAPTURED BEFORE THE OUTERMOST FENCE. A module-scope
 *     `const F = globalThis.fetch;` evaluated at import time, in a module the
 *     checker imports before it installs its own fence, predates every counter.
 *     Reachability on this lane today: NONE FOUND. The two candidate sites,
 *     `scripts/model-village-adapter-runtime.mjs:809` and `:1016`, are
 *     `fetchImpl = globalThis.fetch` DEFAULT PARAMETERS — evaluated at call
 *     time, so they pick up whichever fence is live — and that module is not on
 *     the experiment checker's lane at all. A nested pair of fences narrows this
 *     to "captured before the OUTER one", which is the earliest point in the
 *     process this lane controls.
 *
 *  2. AN IN-PROCESS `node:http` / `node:https` SOCKET. The fence is over
 *     `fetch`; a raw socket does not go through it. Reachability on this lane
 *     today: no consumer. Worth knowing anyway, and stated rather than buried:
 *     HoloScript's own generated provider transport uses `http.request` (emitted
 *     inside a LlamaServerCompiler template string at
 *     `HoloScript/packages/core/dist/chunk-2263XLUN.js:1990`), not `fetch` — so
 *     it is a transport this classification rule does not cover. It is a
 *     TEMPLATE STRING, not executed by core in-process, which is why there is no
 *     live trigger.
 *
 * Child processes are NOT on this list any more: each spawn site installs this
 * same fence inside the child and folds the child's own observation back into
 * the parent's evidence (see `model-village-provider-call-fence-child.mjs`).
 */

/**
 * Bound on each recorded fetch-incident log. Shared by the fence (which writes
 * them) and by every verifier that cross-binds against them, so the two can
 * never disagree about where saturation begins — a disagreement there is
 * exactly where a zeroed counter could hide.
 */
export const FETCH_TARGET_LOG_LIMIT = 32;

export const PROVIDER_CALL_FENCE_METHOD =
  'globalThis-fetch-counting-fence-v2-watched';

export const PROVIDER_CALL_FENCE_SCOPE =
  'globalThis.fetch and handles injected from it, held under a displacement '
  + 'watch for the whole window and proven live by a self-test probe; raw '
  + 'node:http/https sockets and references to fetch captured before the '
  + 'OUTERMOST fence was installed are OUT of scope and are stated as out of '
  + 'scope rather than counted as zero. Child processes are measured by '
  + 'installing this same fence inside them, not by assumption';

/**
 * The link each fence function carries to whatever it wrapped. Walking it from
 * the live `globalThis.fetch` binding is how a fence answers "am I still on the
 * call path" without breaking nesting — an inner fence delegates to the outer
 * one, so the outer is still reachable.
 */
const PROVIDER_FENCE_DELEGATE = Symbol.for(
  'hololand.model-village.provider-call-fence.delegate',
);

/**
 * The process-wide displacement watch, installed by the OUTERMOST fence only.
 * Kept on globalThis rather than in module scope so that two copies of this
 * module (a seam tree, a differently-resolved specifier) still share one watch.
 */
const PROVIDER_FENCE_WATCH = Symbol.for(
  'hololand.model-village.provider-call-fence.watch',
);

/** Target for the install-time self-test. Not a URL, so never a provider call. */
const SELF_TEST_TARGET = 'holo-model-village-provider-fence-self-test';

/**
 * Contract between a parent that spawns a child process and the child-side
 * preload (`model-village-provider-call-fence-child.mjs`). Declared here, in the
 * leaf both sides already import, so a parent never has to load the preload
 * module (which installs a fence on import) just to learn the variable names.
 */
export const PROVIDER_FENCE_CHILD_DIR_ENV =
  'MODEL_VILLAGE_PROVIDER_FENCE_CHILD_DIR';

export const PROVIDER_FENCE_CHILD_WINDOW_ENV =
  'MODEL_VILLAGE_PROVIDER_FENCE_CHILD_WINDOW';

/** Raised by the provider-call fence. A run that sees one has failed. */
export class ProviderCallAttemptedError extends Error {
  constructor(target) {
    super(
      'a provider call was attempted during a zero-provider-call rehearsal; '
      + 'the call was refused and counted',
    );
    this.name = 'ProviderCallAttemptedError';
    this.target = target;
  }
}

/** True only for a target that could actually reach a network provider. */
export function isProviderFetchTarget(target) {
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The live displacement watch, or null when none is installed. */
function activeDisplacementWatch() {
  const watch = globalThis[PROVIDER_FENCE_WATCH];
  return watch && typeof watch === 'object' ? watch : null;
}

/**
 * The ONLY sanctioned way this module writes globalThis.fetch. Every other
 * assignment in the process is, by definition, a displacement — the watch's
 * setter counts it, and the window it lands in becomes UNMEASURED.
 */
function assignFetchBinding(value) {
  const watch = activeDisplacementWatch();
  if (!watch) {
    globalThis.fetch = value;
    return;
  }
  watch.sanctioned += 1;
  try {
    globalThis.fetch = value;
  } finally {
    watch.sanctioned -= 1;
  }
}

/**
 * Installs the process-wide displacement watch, owned by the outermost fence.
 * Returns the existing watch when one is already up (an inner fence must NOT
 * take the accessor away from the outer one — it just assigns through it).
 */
function installDisplacementWatch(owner) {
  const existing = activeDisplacementWatch();
  if (existing) return existing;
  const watch = {
    current: owner,
    displacementCount: 0,
    displacements: [],
    owner,
    sanctioned: 0,
  };
  try {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      enumerable: true,
      get() {
        return watch.current;
      },
      set(next) {
        if (watch.sanctioned === 0) {
          watch.displacementCount += 1;
          if (watch.displacements.length < FETCH_TARGET_LOG_LIMIT) {
            watch.displacements.push(
              String(
                (typeof next === 'function' && next.name) || typeof next,
              ).slice(0, 80),
            );
          }
        }
        watch.current = next;
      },
    });
  } catch {
    return null;
  }
  globalThis[PROVIDER_FENCE_WATCH] = watch;
  return watch;
}

/**
 * True when `fenceFn` is still reachable from the live globalThis.fetch binding,
 * directly or through the delegate chain of fences installed on top of it.
 */
function fenceIsCovering(fenceFn) {
  let cursor = globalThis.fetch;
  for (let depth = 0; depth < 64 && typeof cursor === 'function'; depth += 1) {
    if (cursor === fenceFn) return true;
    cursor = cursor[PROVIDER_FENCE_DELEGATE];
  }
  return false;
}

/**
 * Drives ONE real call through the LIVE globalThis.fetch binding — not through
 * the fence function directly — and reports the increment it observed. This is
 * what makes `measured: true` a result rather than a flag: on a clean lane every
 * other number the fence publishes is 0, which is exactly what a fence that was
 * never installed would publish.
 *
 * The target is not a URL, so it is classified as a non-provider call, counted,
 * and delegated; the underlying fetch rejects it without opening a socket. The
 * rejection is swallowed here and the probe is excluded from every published
 * window by the baseline cursor taken immediately after it.
 */
function runFenceSelfTest(state) {
  const callsBefore = state.calls;
  let error = null;
  try {
    const result = globalThis.fetch(SELF_TEST_TARGET);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (thrown) {
    error = thrown?.message || String(thrown);
  }
  return Object.freeze({
    error,
    observedIncrement: state.calls - callsBefore,
    target: SELF_TEST_TARGET,
    viaGlobalBinding: true,
  });
}

/**
 * Installs a counting fence over globalThis.fetch and returns the same function
 * for injection as `fetchImpl`. Every call increments a real counter and records
 * a bounded projection of its target. An absolute http/https target is counted
 * as a PROVIDER call and refused by throwing; anything else is counted,
 * published, and delegated to the original fetch so the measurement does not
 * perturb what it measures (see the classification rule in the module header).
 *
 * The counters are what receipts publish. There is no literal zero anywhere on
 * this path. `installed` is observed AFTER assignment rather than assumed, so a
 * runtime that refuses the assignment produces an UNMEASURED observation
 * instead of a silent zero.
 *
 * A dropped-record counter runs beside each incident log so saturation is a
 * MEASURED property of the window rather than an inference from absolute log
 * lengths: `providerCalls === providerTargets.length + providerTargetsDropped`
 * holds exactly, in every window, saturated or not.
 */
export function installProviderCallFence() {
  const original = globalThis.fetch;
  const state = {
    calls: 0,
    nonProviderTargets: [],
    nonProviderTargetsDropped: 0,
    providerCalls: 0,
    providerTargets: [],
    providerTargetsDropped: 0,
  };
  const fence = async (...args) => {
    state.calls += 1;
    const target = String(
      args?.[0]?.url ?? args?.[0] ?? 'unknown-target',
    ).slice(0, 200);
    if (isProviderFetchTarget(target)) {
      state.providerCalls += 1;
      if (state.providerTargets.length < FETCH_TARGET_LOG_LIMIT) {
        state.providerTargets.push(target);
      } else {
        state.providerTargetsDropped += 1;
      }
      throw new ProviderCallAttemptedError(target);
    }
    if (state.nonProviderTargets.length < FETCH_TARGET_LOG_LIMIT) {
      state.nonProviderTargets.push(target);
    } else {
      state.nonProviderTargetsDropped += 1;
    }
    if (typeof original !== 'function') {
      throw new TypeError('fetch is not available in this runtime');
    }
    return original(...args);
  };
  fence[PROVIDER_FENCE_DELEGATE] = original;
  let installed = false;
  let installError = null;
  try {
    assignFetchBinding(fence);
    installed = globalThis.fetch === fence;
    if (!installed) {
      installError = 'globalThis.fetch did not retain the installed fence';
    }
  } catch (error) {
    installed = false;
    installError = error?.message || String(error);
  }
  let watch = null;
  let selfTest = null;
  let baseline = null;
  if (installed) {
    watch = installDisplacementWatch(fence);
    selfTest = runFenceSelfTest(state);
  }
  const handle = {
    fetch: fence,
    installed,
    installError,
    restore() {
      const live = activeDisplacementWatch();
      if (live && live.owner === fence) {
        const currentValue = live.current;
        delete globalThis[PROVIDER_FENCE_WATCH];
        try {
          delete globalThis.fetch;
        } catch {
          /* fall through to the assignment below */
        }
        globalThis.fetch = currentValue === fence ? original : currentValue;
        return;
      }
      if (globalThis.fetch === fence) assignFetchBinding(original);
    },
    selfTest,
    state,
    watchInstalled: watch !== null,
  };
  // Taken AFTER the self-test probe so the probe is inside no published window.
  baseline = snapshotProviderFence(handle);
  handle.baseline = baseline;
  return Object.freeze(handle);
}

/**
 * Point-in-time cursor over a fence, so a caller can measure a SUB-WINDOW of a
 * longer fenced section (for example "the fresh replay only") as a delta rather
 * than as a fresh claim. The displacement count is part of the cursor: a window
 * is only clean if nothing displaced the binding BETWEEN the cursor and the
 * publish.
 */
export function snapshotProviderFence(fence) {
  return Object.freeze({
    calls: fence?.state?.calls ?? 0,
    displacements: activeDisplacementWatch()?.displacementCount ?? 0,
    nonProviderTargets: fence?.state?.nonProviderTargets?.length ?? 0,
    nonProviderTargetsDropped: fence?.state?.nonProviderTargetsDropped ?? 0,
    providerCalls: fence?.state?.providerCalls ?? 0,
    providerTargets: fence?.state?.providerTargets?.length ?? 0,
    providerTargetsDropped: fence?.state?.providerTargetsDropped ?? 0,
  });
}

function unmeasured(window, reason) {
  return {
    coverageConfirmed: false,
    displacementWatch: false,
    displacementsObserved: null,
    fetchCallsObserved: null,
    logSaturated: false,
    measured: false,
    method: PROVIDER_CALL_FENCE_METHOD,
    nonProviderFetchCallTargets: [],
    nonProviderFetchCallTargetsDropped: null,
    providerFetchCallTargets: [],
    providerFetchCallTargetsDropped: null,
    providerFetchCallsObserved: null,
    scope: PROVIDER_CALL_FENCE_SCOPE,
    selfTest: null,
    unmeasuredReason: reason,
    window,
  };
}

/**
 * The receipt-shaped observation for an UNMEASURED window. Published (never
 * omitted) so a consumer sees "nothing was watched" instead of inferring a
 * clean run from a missing field, and rejected by
 * verifyProviderFenceObservation so the surrounding gate FAILS.
 */
export function unmeasuredProviderCallObservation(window, reason) {
  return unmeasured(window, reason);
}

/**
 * Projects a fence (optionally a sub-window of one, via `since`) into the block
 * a receipt publishes. Every number here comes from the fence's own counters.
 */
export function summarizeProviderCallFence(fence, { window, since = null } = {}) {
  if (!fence || typeof fence !== 'object' || !fence.state) {
    return unmeasured(window, 'no provider-call fence was supplied');
  }
  if (fence.installed !== true) {
    return unmeasured(
      window,
      `the provider-call fence could not be installed over globalThis.fetch`
      + `${fence.installError ? `: ${fence.installError}` : ''}`,
    );
  }
  // GUARD 1 — COVERAGE AT PUBLISH. `installed` was true once; this asks whether
  // it is still true now. A fence swapped off the call path published a
  // "measured" zero over a window nobody was watching.
  if (!fenceIsCovering(fence.fetch)) {
    return unmeasured(
      window,
      'the provider-call fence was displaced from globalThis.fetch and is no '
      + 'longer on the call path; the window it claims to cover was not watched '
      + 'to its end',
    );
  }
  // GUARD 2 — DISPLACEMENT FOR THE WHOLE WINDOW. Guard 1 cannot see a binding
  // that was swapped out and put back before the publish; this counter can.
  const watch = activeDisplacementWatch();
  if (!watch) {
    return unmeasured(
      window,
      'the displacement watch over globalThis.fetch is not installed, so an '
      + 'intra-window reassignment of the binding would be invisible',
    );
  }
  const displacementsObserved =
    watch.displacementCount - (since?.displacements ?? 0);
  if (displacementsObserved > 0) {
    return unmeasured(
      window,
      `globalThis.fetch was reassigned ${displacementsObserved} time(s) outside `
      + `the provider-call fence during this window `
      + `(${watch.displacements.join(', ') || 'no detail recorded'}); an `
      + 'interval the fence did not cover cannot report a zero',
    );
  }
  const start = since ?? fence.baseline ?? {
    calls: 0,
    nonProviderTargets: 0,
    nonProviderTargetsDropped: 0,
    providerCalls: 0,
    providerTargets: 0,
    providerTargetsDropped: 0,
  };
  const providerTargets = fence.state.providerTargets
    .slice(start.providerTargets);
  const nonProviderTargets = fence.state.nonProviderTargets
    .slice(start.nonProviderTargets);
  // Dropped records are MEASURED per window, not inferred from absolute log
  // lengths. A sub-window taken with `since` used to inherit the whole fence's
  // saturation flag and, with it, an exemption from the counter-equals-log rule.
  const providerTargetsDropped =
    fence.state.providerTargetsDropped - (start.providerTargetsDropped ?? 0);
  const nonProviderTargetsDropped =
    fence.state.nonProviderTargetsDropped
    - (start.nonProviderTargetsDropped ?? 0);
  return {
    coverageConfirmed: true,
    displacementWatch: true,
    displacementsObserved,
    fetchCallsObserved: fence.state.calls - start.calls,
    logSaturated: providerTargetsDropped > 0 || nonProviderTargetsDropped > 0,
    measured: true,
    method: PROVIDER_CALL_FENCE_METHOD,
    nonProviderFetchCallTargets: nonProviderTargets,
    nonProviderFetchCallTargetsDropped: nonProviderTargetsDropped,
    providerFetchCallTargets: providerTargets,
    providerFetchCallTargetsDropped: providerTargetsDropped,
    providerFetchCallsObserved:
      fence.state.providerCalls - start.providerCalls,
    scope: PROVIDER_CALL_FENCE_SCOPE,
    selfTest: fence.selfTest ?? null,
    unmeasuredReason: null,
    window,
  };
}

/**
 * Out-of-band verification of a published observation. This is the half that
 * makes the number falsifiable rather than decorative, and it is deliberately
 * the SAME rule set the conductor applies to its own rehearsal receipt:
 *
 *  - an UNMEASURED window FAILS; it never reads as a clean zero
 *  - the fence must have been PROVEN LIVE on this run: the install-time
 *    self-test drove one real call through the global binding and the counter
 *    moved by exactly 1
 *  - coverage must have been confirmed at publish and the displacement watch
 *    must have been up with zero displacements in the window
 *  - a counter can never be below its own incident log (a saturated log was
 *    where a zeroed counter could previously hide)
 *  - a log must reconcile with its counter EXACTLY, saturated or not, via the
 *    measured dropped-record count
 *  - the provider count is a subset of the total by construction
 *  - the recorded targets must actually match the classification that was
 *    claimed for them, in BOTH directions — a provider call cannot be
 *    reclassified out of the gated count
 *  - and, when `requireZero` is set, the gated number itself must be zero
 */
export function verifyProviderCallObservation(
  observed,
  { label = 'provider-call observation', requireZero = true } = {},
) {
  const failures = [];
  if (!observed || typeof observed !== 'object') {
    failures.push(`${label} is missing; the window was never measured`);
    return failures;
  }
  if (observed.measured !== true) {
    failures.push(
      `${label} is UNMEASURED (${observed.unmeasuredReason
        || 'no reason published'}); an unwatched window cannot report a zero`,
    );
    return failures;
  }
  if (observed.method !== PROVIDER_CALL_FENCE_METHOD) {
    failures.push(`${label} was not produced by ${PROVIDER_CALL_FENCE_METHOD}`);
  }
  // "measured" has to mean INSTALLED THROUGHOUT and PROVEN LIVE, not
  // "installed once and never looked at again".
  if (observed.coverageConfirmed !== true) {
    failures.push(
      `${label} did not confirm that the fence was still on the globalThis.fetch `
      + 'call path when the window was published',
    );
  }
  if (observed.displacementWatch !== true) {
    failures.push(
      `${label} was taken without a displacement watch over globalThis.fetch, so `
      + 'a binding swapped out and put back inside the window would be invisible',
    );
  }
  if (
    !Number.isInteger(observed.displacementsObserved)
    || observed.displacementsObserved !== 0
  ) {
    failures.push(
      `${label} reports ${observed.displacementsObserved} displacement(s) of `
      + 'globalThis.fetch during the window; an interval the fence did not cover '
      + 'cannot report a zero',
    );
  }
  if (observed.selfTest?.observedIncrement !== 1) {
    failures.push(
      `${label} has no live-counter proof: the install-time self-test through the `
      + `global binding moved the counter by `
      + `${observed.selfTest?.observedIncrement ?? 'nothing (no self-test)'} `
      + 'instead of exactly 1, so this counter is not known to be able to read '
      + 'anything but zero',
    );
  }
  const total = observed.fetchCallsObserved;
  const provider = observed.providerFetchCallsObserved;
  const providerTargets = observed.providerFetchCallTargets;
  const nonProviderTargets = observed.nonProviderFetchCallTargets;
  if (!Number.isInteger(total) || total < 0) {
    failures.push(`${label} fetchCallsObserved is not a non-negative integer`);
    return failures;
  }
  if (!Number.isInteger(provider) || provider < 0) {
    failures.push(
      `${label} providerFetchCallsObserved is not a non-negative integer`,
    );
    return failures;
  }
  if (!Array.isArray(providerTargets) || !Array.isArray(nonProviderTargets)) {
    failures.push(`${label} incident logs are not arrays`);
    return failures;
  }
  if (provider < providerTargets.length) {
    failures.push(
      `${label} providerFetchCallsObserved is smaller than its own incident `
      + 'log; a counter can never be below the number of calls it recorded',
    );
  }
  if (
    observed.logSaturated !== true
    && providerTargets.length < FETCH_TARGET_LOG_LIMIT
    && provider !== providerTargets.length
  ) {
    failures.push(
      `${label} providerFetchCallsObserved does not equal the number of `
      + 'recorded provider-call targets; the counter and its incident log disagree',
    );
  }
  // EXACT RECONCILIATION, saturated or not. `logSaturated` used to be read off
  // the fence's ABSOLUTE log lengths, so a sub-window inherited a saturation
  // exemption it had not earned. Dropped records are now measured per window,
  // which turns the relaxed rule above into an exact identity below.
  const providerDropped = observed.providerFetchCallTargetsDropped;
  const nonProviderDropped = observed.nonProviderFetchCallTargetsDropped;
  if (
    !Number.isInteger(providerDropped)
    || providerDropped < 0
    || !Number.isInteger(nonProviderDropped)
    || nonProviderDropped < 0
  ) {
    failures.push(
      `${label} does not publish measured dropped-record counts, so a saturated `
      + 'incident log cannot be reconciled with its counter',
    );
  } else {
    if (provider !== providerTargets.length + providerDropped) {
      failures.push(
        `${label} providerFetchCallsObserved (${provider}) does not reconcile `
        + `with its incident log (${providerTargets.length} recorded + `
        + `${providerDropped} dropped)`,
      );
    }
    if (total !== provider + nonProviderTargets.length + nonProviderDropped) {
      failures.push(
        `${label} fetchCallsObserved (${total}) does not reconcile with its own `
        + `classification (${provider} provider + ${nonProviderTargets.length} `
        + `recorded non-provider + ${nonProviderDropped} dropped non-provider)`,
      );
    }
    if (
      observed.logSaturated !== (providerDropped > 0 || nonProviderDropped > 0)
    ) {
      failures.push(
        `${label} logSaturated does not match the dropped-record counts it is `
        + 'derived from',
      );
    }
  }
  if (total < nonProviderTargets.length) {
    failures.push(
      `${label} fetchCallsObserved is smaller than its own non-provider incident log`,
    );
  }
  if (provider > total) {
    failures.push(
      `${label} providerFetchCallsObserved exceeds the total fetch calls the `
      + 'fence saw; the provider count is a subset of the total by construction',
    );
  }
  if (total < providerTargets.length + nonProviderTargets.length) {
    failures.push(
      `${label} fetchCallsObserved is smaller than the number of recorded fetch `
      + 'targets; the total counter and its incident logs disagree',
    );
  }
  for (const target of providerTargets) {
    if (!isProviderFetchTarget(target)) {
      failures.push(
        `${label} recorded a provider-call target that is not an absolute `
        + 'http(s) URL; the classification was not applied as stated',
      );
      break;
    }
  }
  for (const target of nonProviderTargets) {
    if (isProviderFetchTarget(target)) {
      failures.push(
        `${label} recorded an absolute http(s) target as a NON-provider call; a `
        + 'provider call cannot be reclassified out of the gated count',
      );
      break;
    }
  }
  if (requireZero && provider !== 0) {
    failures.push(
      `${label} PROVIDER-CALL VIOLATION: the fence observed ${provider} `
      + `provider call(s) during a zero-provider-call window `
      + `(targets: ${providerTargets.join(', ') || 'none recorded'})`,
    );
  }
  return failures;
}
