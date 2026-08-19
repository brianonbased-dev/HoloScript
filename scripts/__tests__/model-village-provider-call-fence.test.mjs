/* global URL */
/**
 * Provider-call fence — adversarial tests.
 *
 * THE POINT OF THIS FILE, stated plainly: a counter that has only ever read 0
 * is not known to be able to read 1. Every "zero provider calls" claim on the
 * Model Village lane now rests on this counter, so this file drives REAL
 * traffic through the fence and watches the number move, and drives a REAL
 * request at a REAL listening socket and proves the refusal stopped it from
 * arriving. Without that, the fence would be exactly the thing it replaced: a
 * value that is always zero for reasons nobody checked.
 *
 * ON THE EPHEMERAL PROBE LISTENER: the node:http server below is a MEASUREMENT
 * INSTRUMENT, not a stand-in for any service. It binds to the loopback
 * interface on port 0 and its address is read back off the bound socket. It
 * exists because the property under test — "the fence REFUSED the call, it did
 * not merely count it" — is only observable from the other end of a connection
 * that was never established. No remote endpoint can witness a socket that did
 * not open, so no remote endpoint can replace it.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import {
  FETCH_TARGET_LOG_LIMIT,
  PROVIDER_CALL_FENCE_METHOD,
  ProviderCallAttemptedError,
  installProviderCallFence,
  isProviderFetchTarget,
  snapshotProviderFence,
  summarizeProviderCallFence,
  unmeasuredProviderCallObservation,
  verifyProviderCallObservation,
} from '../model-village-provider-call-fence.mjs';

const DELEGATED_TARGET = 'data:text/plain,fence-delegation-probe';
const LOOPBACK_INTERFACE = '127.0.0.1';

describe('classification', () => {
  test('only absolute http(s) targets are provider calls', () => {
    assert.equal(isProviderFetchTarget('http://provider.invalid/v1/chat'), true);
    assert.equal(isProviderFetchTarget('https://provider.invalid/v1/chat'), true);
    assert.equal(isProviderFetchTarget('/holoscript_wasm_bg.wasm'), false);
    assert.equal(isProviderFetchTarget('file:///tmp/x'), false);
    assert.equal(isProviderFetchTarget(DELEGATED_TARGET), false);
    assert.equal(isProviderFetchTarget('not a url'), false);
  });
});

describe('the counter is known to move', () => {
  let server;
  let requestsReceived = 0;
  let probeUrl;

  before(async () => {
    server = http.createServer((request, response) => {
      requestsReceived += 1;
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('reached');
    });
    await new Promise((resolve) => {
      server.listen(0, LOOPBACK_INTERFACE, resolve);
    });
    const bound = server.address();
    probeUrl = new URL('/probe', `http://${bound.address}:${bound.port}`).href;
    assert.equal(isProviderFetchTarget(probeUrl), true);
  });

  after(async () => {
    await new Promise((resolve) => { server.close(resolve); });
  });

  test('the harness is real: unfenced, the probe REACHES the listener', async () => {
    const arrivedBefore = requestsReceived;
    const response = await globalThis.fetch(probeUrl);
    assert.equal(await response.text(), 'reached');
    assert.equal(
      requestsReceived,
      arrivedBefore + 1,
      'the probe listener did not observe the unfenced request; every other '
      + 'test in this file would then prove nothing',
    );
  });

  test('a REAL request at a REAL listener is counted AND refused', async () => {
    const arrivedBefore = requestsReceived;
    const fence = installProviderCallFence();
    try {
      assert.equal(fence.installed, true);
      assert.equal(fence.state.providerCalls, 0, 'precondition: counter at 0');

      // Driven through the GLOBAL binding, exactly as production code reaches
      // it — not through fence.fetch directly.
      await assert.rejects(
        () => globalThis.fetch(probeUrl),
        (error) => {
          assert.ok(error instanceof ProviderCallAttemptedError);
          assert.equal(error.target, probeUrl);
          return true;
        },
      );

      // THE COUNTER MOVED. 0 -> 1, observed, not asserted.
      assert.equal(fence.state.providerCalls, 1);
      // Counted off the fence's own baseline cursor, which is taken after the
      // install-time self-test probe — the same window boundary production
      // publishes against.
      assert.equal(fence.state.calls - fence.baseline.calls, 1);
      assert.deepEqual(fence.state.providerTargets, [probeUrl]);

      // AND THE REFUSAL WAS REAL: the connection was never established.
      assert.equal(
        requestsReceived,
        arrivedBefore,
        'the fence counted the call but did not prevent it',
      );

      const observed = summarizeProviderCallFence(fence, { window: 'probe' });
      assert.equal(observed.measured, true);
      assert.equal(observed.providerFetchCallsObserved, 1);
      assert.equal(observed.method, PROVIDER_CALL_FENCE_METHOD);
      const failures = verifyProviderCallObservation(observed, {
        label: 'probe',
      });
      assert.equal(failures.length, 1);
      assert.match(failures[0], /PROVIDER-CALL VIOLATION/);
      // Same observation with the gate off: the structural rules alone are
      // clean, so the violation above came from the COUNT and not from a shape
      // error that would have fired on a clean run too.
      assert.deepEqual(
        verifyProviderCallObservation(observed, {
          label: 'probe',
          requireZero: false,
        }),
        [],
      );
    } finally {
      fence.restore();
    }

    // Restoring gives the binding back and the probe arrives again, so the
    // refusal above was the fence's doing and not a dead URL.
    const arrivedBeforeRestoreProbe = requestsReceived;
    const response = await globalThis.fetch(probeUrl);
    assert.equal(await response.text(), 'reached');
    assert.equal(requestsReceived, arrivedBeforeRestoreProbe + 1);
  });

  test('a non-provider request is counted AND delegated, not swallowed', async () => {
    const fence = installProviderCallFence();
    try {
      const response = await globalThis.fetch(DELEGATED_TARGET);
      assert.equal(await response.text(), 'fence-delegation-probe');
      assert.equal(
        fence.state.calls - fence.baseline.calls,
        1,
        'the total counter did not move',
      );
      assert.equal(fence.state.providerCalls, 0);
      assert.deepEqual(
        fence.state.nonProviderTargets.slice(fence.baseline.nonProviderTargets),
        [DELEGATED_TARGET],
      );
    } finally {
      fence.restore();
    }
  });

  test('sub-window deltas measure a slice, not the whole run', async () => {
    const fence = installProviderCallFence();
    try {
      await globalThis.fetch(DELEGATED_TARGET);
      const cursor = snapshotProviderFence(fence);
      await globalThis.fetch(DELEGATED_TARGET);
      await globalThis.fetch(DELEGATED_TARGET);
      const windowed = summarizeProviderCallFence(fence, {
        since: cursor,
        window: 'slice',
      });
      const whole = summarizeProviderCallFence(fence, { window: 'whole' });
      assert.equal(windowed.fetchCallsObserved, 2);
      assert.equal(windowed.nonProviderFetchCallTargets.length, 2);
      assert.equal(whole.fetchCallsObserved, 3);
      assert.deepEqual(verifyProviderCallObservation(windowed), []);
      assert.deepEqual(verifyProviderCallObservation(whole), []);
    } finally {
      fence.restore();
    }
  });

  test('nested fences: the inner one delegates through the outer one', async () => {
    const outer = installProviderCallFence();
    try {
      const inner = installProviderCallFence();
      try {
        await globalThis.fetch(DELEGATED_TARGET);
        await assert.rejects(() => globalThis.fetch(probeUrl));
      } finally {
        inner.restore();
      }
      // The nesting identity: the outer fence saw exactly what the inner one
      // delegated, and the refused provider call never reached it. Counted off
      // each fence's baseline, so each fence's own self-test probe is excluded
      // from its own window — but the INNER fence's probe still delegated
      // through the outer one, which is why the outer window is 2 and not 1.
      const innerCalls = inner.state.calls - inner.baseline.calls;
      const innerProvider = inner.state.providerCalls - inner.baseline.providerCalls;
      const outerCalls = outer.state.calls - outer.baseline.calls;
      assert.equal(innerCalls, 2);
      assert.equal(innerProvider, 1);
      assert.equal(outerCalls, innerCalls - innerProvider + 1);
      assert.equal(outer.state.providerCalls, 0);
      // The production rule is a FLOOR, not that identity: everything the inner
      // fence delegated had to pass through the outer one.
      assert.ok(outerCalls >= innerCalls - innerProvider);
    } finally {
      outer.restore();
    }
  });

  test('a pre-fence reference bypasses the inner fence and lands on the outer', async () => {
    const outer = installProviderCallFence();
    try {
      // Captured while only the outer fence is installed — the exact
      // `fetchImpl = globalThis.fetch` default-parameter case the fenced
      // modules name as out of their own scope. This is WHY the experiment
      // checker installs a second, earlier fence around the tracer.
      const capturedBeforeInnerFence = globalThis.fetch;
      const inner = installProviderCallFence();
      try {
        await assert.rejects(() => capturedBeforeInnerFence(probeUrl));
      } finally {
        inner.restore();
      }
      assert.equal(
        inner.state.providerCalls,
        0,
        'precondition: the inner fence structurally cannot see a pre-fence reference',
      );
      assert.equal(
        outer.state.providerCalls,
        1,
        'the outer fence must catch what the inner one cannot',
      );
    } finally {
      outer.restore();
    }
  });

  test('the install-time self-test is a REAL call, not an asserted 1', () => {
    // WHY THIS EXISTS: `selfTest.observedIncrement` is what makes `measured:
    // true` mean something on a lane where every other number is 0 — and a
    // module cannot prove its own prover. Replacing runFenceSelfTest with a
    // literal `{ observedIncrement: 1 }` is invisible to the fence and to every
    // receipt it writes; it is only visible from out here, against the fence's
    // OWN incident log, which the probe had to actually appear in.
    const fence = installProviderCallFence();
    try {
      assert.equal(fence.selfTest.observedIncrement, 1);
      assert.equal(fence.selfTest.viaGlobalBinding, true);
      assert.equal(
        typeof fence.selfTest.target,
        'string',
        'the self-test must name the target it actually called',
      );
      // The probe is the ONLY call before the baseline, and it is in the log.
      assert.equal(fence.baseline.calls, 1);
      assert.equal(fence.baseline.providerCalls, 0);
      assert.deepEqual(
        fence.state.nonProviderTargets.slice(0, fence.baseline.nonProviderTargets),
        [fence.selfTest.target],
        'the self-test target is not in the fence’s own incident log, so the '
        + 'reported increment did not come from a call that happened',
      );
      // And it is excluded from every published window.
      const observed = summarizeProviderCallFence(fence, { window: 'w' });
      assert.equal(observed.fetchCallsObserved, 0);
      assert.deepEqual(observed.nonProviderFetchCallTargets, []);
    } finally {
      fence.restore();
    }
  });

  test('restore puts the original binding back', () => {
    const original = globalThis.fetch;
    const fence = installProviderCallFence();
    assert.notEqual(globalThis.fetch, original);
    fence.restore();
    assert.equal(globalThis.fetch, original);
  });
});

describe('absent evidence blocks', () => {
  test('an unmeasured observation FAILS instead of reading as a clean zero', () => {
    const observed = unmeasuredProviderCallObservation(
      'w',
      'fence was not installed',
    );
    assert.equal(observed.measured, false);
    assert.equal(observed.providerFetchCallsObserved, null);
    const failures = verifyProviderCallObservation(observed);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /UNMEASURED/);
  });

  test('a missing observation FAILS', () => {
    assert.match(
      verifyProviderCallObservation(undefined).join('\n'),
      /is missing; the window was never measured/,
    );
  });

  test('a fence that could not be installed reports UNMEASURED, never zero', () => {
    const fake = { installed: false, installError: 'frozen global', state: {} };
    const observed = summarizeProviderCallFence(fake, { window: 'w' });
    assert.equal(observed.measured, false);
    assert.match(observed.unmeasuredReason, /could not be installed/);
    assert.match(
      verifyProviderCallObservation(observed).join('\n'),
      /UNMEASURED/,
    );
  });
});

describe('the cross-bindings a forged observation has to survive', () => {
  const clean = () => ({
    coverageConfirmed: true,
    displacementWatch: true,
    displacementsObserved: 0,
    fetchCallsObserved: 3,
    logSaturated: false,
    measured: true,
    method: PROVIDER_CALL_FENCE_METHOD,
    nonProviderFetchCallTargets: ['/a.wasm', '/b.wasm', '/c.wasm'],
    nonProviderFetchCallTargetsDropped: 0,
    providerFetchCallTargets: [],
    providerFetchCallTargetsDropped: 0,
    providerFetchCallsObserved: 0,
    scope: 'test',
    selfTest: { observedIncrement: 1, viaGlobalBinding: true },
    unmeasuredReason: null,
    window: 'w',
  });

  test('the clean shape passes (so the rules below are not vacuously red)', () => {
    assert.deepEqual(verifyProviderCallObservation(clean()), []);
  });

  test('a counter zeroed below its own incident log FAILS', () => {
    const forged = clean();
    forged.providerFetchCallTargets = ['http://provider.invalid/x'];
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /smaller than its own incident log/,
    );
  });

  test('a provider count above the total FAILS', () => {
    const forged = clean();
    forged.providerFetchCallsObserved = 9;
    forged.providerFetchCallTargets = ['http://provider.invalid/x'];
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /exceeds the total fetch calls/,
    );
  });

  test('reclassifying a provider target as non-provider FAILS', () => {
    const forged = clean();
    forged.nonProviderFetchCallTargets = ['https://provider.invalid/x'];
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /cannot be reclassified out of the gated count/,
    );
  });

  test('a non-http target recorded as a provider call FAILS', () => {
    const forged = clean();
    forged.providerFetchCallsObserved = 1;
    forged.providerFetchCallTargets = ['/a.wasm'];
    forged.fetchCallsObserved = 4;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /not an absolute http\(s\) URL/,
    );
  });

  test('a total below the sum of its own logs FAILS', () => {
    const forged = clean();
    forged.fetchCallsObserved = 1;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /smaller than its own non-provider incident log/,
    );
  });

  test('the incident-log bound is shared, so saturation is not a hiding place', () => {
    assert.equal(FETCH_TARGET_LOG_LIMIT, 32);
    const forged = clean();
    forged.providerFetchCallsObserved = 100;
    forged.providerFetchCallTargets = Array.from(
      { length: FETCH_TARGET_LOG_LIMIT },
      () => 'http://provider.invalid/x',
    );
    forged.fetchCallsObserved = 200;
    forged.logSaturated = true;
    // Saturated: the gate still fires, AND the reconciliation now fires too,
    // because saturation is no longer an exemption from it.
    const failures = verifyProviderCallObservation(forged).join('\n');
    assert.match(failures, /PROVIDER-CALL VIOLATION/);
    assert.match(failures, /does not reconcile with its incident log/);
  });

  test('a saturated window still reconciles EXACTLY via its dropped count', () => {
    const forged = clean();
    forged.providerFetchCallsObserved = 0;
    forged.nonProviderFetchCallTargets = Array.from(
      { length: FETCH_TARGET_LOG_LIMIT },
      () => '/a.wasm',
    );
    forged.nonProviderFetchCallTargetsDropped = 7;
    forged.fetchCallsObserved = FETCH_TARGET_LOG_LIMIT + 7;
    forged.logSaturated = true;
    assert.deepEqual(verifyProviderCallObservation(forged), []);
    // Move ONE dropped record and the whole thing stops adding up — the escape
    // hatch a sub-window used to inherit is gone.
    forged.nonProviderFetchCallTargetsDropped = 6;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /does not reconcile with its own classification/,
    );
  });

  test('a "measured" window with no live-counter proof FAILS', () => {
    const forged = clean();
    forged.selfTest = null;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /no live-counter proof/,
    );
    forged.selfTest = { observedIncrement: 0, viaGlobalBinding: true };
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /no live-counter proof/,
    );
  });

  test('a window taken with no displacement watch FAILS', () => {
    const forged = clean();
    forged.displacementWatch = false;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /without a displacement watch/,
    );
  });

  test('a window that saw the binding displaced FAILS', () => {
    const forged = clean();
    forged.displacementsObserved = 1;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /displacement\(s\) of globalThis.fetch during the window/,
    );
  });

  test('a window whose coverage was not confirmed at publish FAILS', () => {
    const forged = clean();
    forged.coverageConfirmed = false;
    assert.match(
      verifyProviderCallObservation(forged).join('\n'),
      /still on the globalThis.fetch call path/,
    );
  });
});

/**
 * THE EVASION THIS BLOCK EXISTS FOR: `measured: true` used to mean "the fence
 * was installed once", not "the fence was installed for the whole window". A
 * caller that captured the real fetch and put it back mid-window could make a
 * REAL provider call and still publish a measured zero.
 */
describe('a displaced binding cannot publish a measured zero', () => {
  test('the fence is UNMEASURED when it is displaced and left displaced', async () => {
    const realFetch = globalThis.fetch;
    const fence = installProviderCallFence();
    try {
      const beforeDisplacement = summarizeProviderCallFence(fence, {
        window: 'before',
      });
      assert.equal(beforeDisplacement.measured, true);
      assert.equal(beforeDisplacement.coverageConfirmed, true);

      globalThis.fetch = realFetch;
      const displaced = summarizeProviderCallFence(fence, { window: 'after' });
      assert.equal(displaced.measured, false);
      assert.equal(displaced.providerFetchCallsObserved, null);
      assert.match(
        verifyProviderCallObservation(displaced).join('\n'),
        /UNMEASURED/,
      );
    } finally {
      globalThis.fetch = realFetch;
      fence.restore();
      globalThis.fetch = realFetch;
    }
  });

  test('the fence is UNMEASURED even when the binding is put BACK', async () => {
    const realFetch = globalThis.fetch;
    const fence = installProviderCallFence();
    try {
      const cursor = snapshotProviderFence(fence);
      // Displace, do something the fence therefore cannot see, then restore the
      // fence's own function so the publish-time coverage walk is satisfied.
      globalThis.fetch = realFetch;
      globalThis.fetch = fence.fetch;
      assert.equal(globalThis.fetch, fence.fetch, 'precondition: coverage is back');

      const observed = summarizeProviderCallFence(fence, {
        since: cursor,
        window: 'displaced-then-restored',
      });
      assert.equal(
        observed.measured,
        false,
        'a window with an unwatched interval in it published a measured zero',
      );
      assert.match(observed.unmeasuredReason, /reassigned 2 time\(s\)/);
      assert.match(
        verifyProviderCallObservation(observed).join('\n'),
        /UNMEASURED/,
      );
    } finally {
      fence.restore();
      globalThis.fetch = realFetch;
    }
  });

  test('nesting is NOT a displacement: the outer stays measured', async () => {
    const outer = installProviderCallFence();
    try {
      const inner = installProviderCallFence();
      try {
        await globalThis.fetch(DELEGATED_TARGET);
      } finally {
        inner.restore();
      }
      const observed = summarizeProviderCallFence(outer, { window: 'outer' });
      assert.equal(observed.measured, true);
      assert.equal(observed.displacementsObserved, 0);
      assert.deepEqual(verifyProviderCallObservation(observed), []);
    } finally {
      outer.restore();
    }
  });

  test('an inner fence is still covered while it is the live binding', async () => {
    const outer = installProviderCallFence();
    try {
      const inner = installProviderCallFence();
      try {
        // Published WHILE the inner fence is the live binding, and while the
        // outer one is only reachable through the inner's delegate link.
        const innerObserved = summarizeProviderCallFence(inner, {
          window: 'inner-live',
        });
        const outerObserved = summarizeProviderCallFence(outer, {
          window: 'outer-under-live-inner',
        });
        assert.equal(innerObserved.measured, true);
        assert.equal(outerObserved.measured, true);
      } finally {
        inner.restore();
      }
    } finally {
      outer.restore();
    }
  });
});
