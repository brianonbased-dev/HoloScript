import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import { CAELReplayer } from '../CAELReplayer';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) {
      this.time += dt;
    },
    solve() {},
    getField(): FieldData | null {
      return new Float32Array([this.time, this.time + 1, this.time + 2]);
    },
    getStats() {
      return { converged: true, currentTime: this.time };
    },
    dispose() {},
  };
}

describe('CAEL Phase 1 hash-chain core', () => {
  it('records init/step/interaction/final as hash-chained JSONL', () => {
    const recorder = new CAELRecorder(
      mockSolver(),
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { solverType: 'structural-tet10', fixedDt: 0.01 }
    );

    recorder.step(0.03);
    recorder.logInteraction('set_load', { node: 1, force: 1000 });
    const provenance = recorder.finalize();

    const jsonl = recorder.toJSONL();
    const trace = parseCAELJSONL(jsonl);

    expect(trace.length).toBe(4);
    expect(trace[0].event).toBe('init');
    expect(trace[1].event).toBe('step');
    expect(trace[2].event).toBe('interaction');
    expect(trace[3].event).toBe('final');
    expect(provenance.totalSteps).toBeGreaterThanOrEqual(2);
    expect(provenance.totalSteps).toBeLessThanOrEqual(3);

    const verification = verifyCAELHashChain(trace);
    expect(verification.valid).toBe(true);
  });

  it('detects tampering through hash-chain verification', () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    trace[1] = {
      ...trace[1],
      payload: { ...trace[1].payload, wallDelta: 999 },
    };

    const verification = verifyCAELHashChain(trace);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
  });

  it('replays a CAEL JSONL artifact into equivalent contracted simulation state', async () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01, solverType: 'thermal' });
    recorder.step(0.05);
    recorder.logInteraction('toggle_boundary', { face: 'left', value: 42 });
    recorder.step(0.03);
    const originalProvenance = recorder.finalize();

    const jsonl = recorder.toJSONL();
    const replayer = new CAELReplayer(jsonl);
    const replayed = await replayer.replay(() => mockSolver());
    const replayedProvenance = replayed.getProvenance();

    expect(replayedProvenance.totalSteps).toBe(originalProvenance.totalSteps);
    expect(replayedProvenance.totalSimTime).toBeCloseTo(originalProvenance.totalSimTime);
    expect(replayedProvenance.interactions.length).toBe(originalProvenance.interactions.length);
    expect(replayedProvenance.interactions[0].type).toBe('toggle_boundary');

    replayed.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CAEL digest capture + replay enforcement (Wave-2 item 5a)
//
// CAELRecorder captures per-step (Route 2b) and terminal (Route 2d)
// state digests into the trace payload. CAELReplayer re-computes them
// on replay and throws on mismatch. Same-adapter mismatch is a hard
// error — the replay diverged from the recorded state. Cross-adapter
// mismatch is expected per Appendix A Lemma 3 (founder-routed 5a/5b
// dispatch pending). This replayer is Item-5a-style (strict always).
// ═══════════════════════════════════════════════════════════════════════

describe('CAEL digest capture + replay enforcement (Wave-2 item 5a)', () => {
  it('records stateDigests array in step events', () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    recorder.step(0.03);
    recorder.finalize();

    const trace = recorder.getTrace();
    const stepEvent = trace.find((e) => e.event === 'step');
    expect(stepEvent).toBeDefined();
    const digests = stepEvent!.payload.stateDigests as unknown;
    expect(Array.isArray(digests)).toBe(true);
    expect((digests as string[]).length).toBeGreaterThan(0);
    for (const d of digests as string[]) {
      expect(d).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('records terminal digest in solve events (Route 2d)', async () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    await recorder.solve();
    recorder.finalize();

    const trace = recorder.getTrace();
    const solveEvent = trace.find((e) => e.event === 'solve');
    expect(solveEvent).toBeDefined();
    const digests = solveEvent!.payload.stateDigests as unknown;
    expect(Array.isArray(digests)).toBe(true);
    // Route 2d pushes exactly one terminal digest per solve()
    expect((digests as string[]).length).toBe(1);
  });

  it('enforces digest match on same-adapter replay (passing case)', async () => {
    // mockSolver is deterministic; record + replay on the same adapter
    // produce identical digests under the strict-enforcement path.
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'test-adapter-A' },
    );
    recorder.step(0.03);
    recorder.step(0.02);
    recorder.finalize();

    const replayer = new CAELReplayer(recorder.toJSONL());
    // Pass matching fingerprint → sameAdapter() === true → strict mode
    const replayed = await replayer.replay(() => mockSolver(), {
      currentAdapterFingerprint: 'test-adapter-A',
    });
    expect(replayed.getStateDigests().length).toBeGreaterThan(0);
    replayed.dispose();
  });

  it('throws on tampered step digest (trace divergence)', async () => {
    // Fingerprint both sides to engage same-adapter strict mode
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'test-adapter-A' },
    );
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    // Tamper the first step's digest values while keeping the count
    // correct. Note: we bypass hash-chain verification by rebuilding
    // the chain downstream, since a proper tamper would fail hash-chain
    // verification first. This test specifically exercises the
    // digest-comparison path assuming hash-chain passed (e.g. a recorder
    // with a transient bug producing correctly-hashed but wrong-digest
    // payloads, or a cross-adapter replay where values drift).
    const stepEventIndex = trace.findIndex((e) => e.event === 'step');
    const actualLength = (trace[stepEventIndex].payload.stateDigests as string[]).length;
    const tamperedPayload = {
      ...trace[stepEventIndex].payload,
      // Keep count correct; wrong values at each position
      stateDigests: Array.from({ length: actualLength }, () => 'deadbeef'),
    };
    // Recompute hash so chain verification passes
    const { hashCAELEntry } = await import('../CAELTrace');
    const newEntry = { ...trace[stepEventIndex], payload: tamperedPayload };
    const newHash = hashCAELEntry({
      version: newEntry.version,
      runId: newEntry.runId,
      index: newEntry.index,
      event: newEntry.event,
      timestamp: newEntry.timestamp,
      simTime: newEntry.simTime,
      prevHash: newEntry.prevHash,
      payload: newEntry.payload,
    });
    trace[stepEventIndex] = { ...newEntry, hash: newHash };
    // Re-chain subsequent events
    let prevHash = newHash;
    for (let i = stepEventIndex + 1; i < trace.length; i++) {
      const e = trace[i];
      const h = hashCAELEntry({
        version: e.version,
        runId: e.runId,
        index: e.index,
        event: e.event,
        timestamp: e.timestamp,
        simTime: e.simTime,
        prevHash,
        payload: e.payload,
      });
      trace[i] = { ...e, prevHash, hash: h };
      prevHash = h;
    }

    const replayer = new CAELReplayer(trace);
    // Pass matching fingerprint to engage same-adapter strict mode
    await expect(
      replayer.replay(() => mockSolver(), { currentAdapterFingerprint: 'test-adapter-A' }),
    ).rejects.toThrow(/state-digest mismatch at step event/);
  });

  it('throws on digest count mismatch (sub-step count diverged)', async () => {
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'test-adapter-A' },
    );
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    const stepEventIndex = trace.findIndex((e) => e.event === 'step');
    const tamperedPayload = {
      ...trace[stepEventIndex].payload,
      stateDigests: ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee'], // far too many
    };
    const { hashCAELEntry } = await import('../CAELTrace');
    const newEntry = { ...trace[stepEventIndex], payload: tamperedPayload };
    const newHash = hashCAELEntry({
      version: newEntry.version,
      runId: newEntry.runId,
      index: newEntry.index,
      event: newEntry.event,
      timestamp: newEntry.timestamp,
      simTime: newEntry.simTime,
      prevHash: newEntry.prevHash,
      payload: newEntry.payload,
    });
    trace[stepEventIndex] = { ...newEntry, hash: newHash };
    let prevHash = newHash;
    for (let i = stepEventIndex + 1; i < trace.length; i++) {
      const e = trace[i];
      const h = hashCAELEntry({
        version: e.version, runId: e.runId, index: e.index, event: e.event,
        timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: e.payload,
      });
      trace[i] = { ...e, prevHash, hash: h };
      prevHash = h;
    }

    const replayer = new CAELReplayer(trace);
    // Pass matching fingerprint to engage same-adapter strict mode
    await expect(
      replayer.replay(() => mockSolver(), { currentAdapterFingerprint: 'test-adapter-A' }),
    ).rejects.toThrow(/state-digest count mismatch/);
  });

  it('backward compat: replays traces without stateDigests field without throwing', async () => {
    // Simulate an old trace that was recorded before Wave-2 item 5a —
    // strip the stateDigests field from step events but keep the hash
    // chain valid.
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    const { hashCAELEntry } = await import('../CAELTrace');
    let prevHash = trace[0].hash;
    for (let i = 1; i < trace.length; i++) {
      const e = trace[i];
      if (e.event === 'step') {
        const { stateDigests: _omit, ...strippedPayload } = e.payload as Record<string, unknown>;
        void _omit;
        const newHash = hashCAELEntry({
          version: e.version, runId: e.runId, index: e.index, event: e.event,
          timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: strippedPayload,
        });
        trace[i] = { ...e, prevHash, hash: newHash, payload: strippedPayload };
        prevHash = newHash;
      } else {
        const newHash = hashCAELEntry({
          version: e.version, runId: e.runId, index: e.index, event: e.event,
          timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: e.payload,
        });
        trace[i] = { ...e, prevHash, hash: newHash };
        prevHash = newHash;
      }
    }

    const replayer = new CAELReplayer(trace);
    const replayed = await replayer.replay(() => mockSolver());
    // Silent fallback; no throw
    expect(replayed.getProvenance().totalSteps).toBeGreaterThan(0);
    replayed.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CAEL 5b cross-adapter dispatch (Wave-2, founder-approved 2026-04-20)
//
// paper-3 §5.2 Algorithm 1 gains a sameAdapter() dispatch: same-adapter
// disputes use the digest-based FindDivergencePoint path (strict);
// cross-adapter disputes skip the step-location step and fall through
// to end-to-end metric comparison (per Appendix A Lemma 3 regime where
// per-step digest identity is not expected across adapters).
// ═══════════════════════════════════════════════════════════════════════

describe('CAEL 5b cross-adapter dispatch (Wave-2)', () => {
  it('records adapterFingerprint in cael.init payload when provided', () => {
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'vendor=Intel;arch=gen12;device=UHD' },
    );
    recorder.finalize();

    const trace = recorder.getTrace();
    expect(trace[0].event).toBe('init');
    expect(trace[0].payload.adapterFingerprint).toBe('vendor=Intel;arch=gen12;device=UHD');
  });

  it('stores adapterFingerprint as null when not provided', () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    recorder.finalize();

    const trace = recorder.getTrace();
    expect(trace[0].payload.adapterFingerprint).toBe(null);
  });

  it('sameAdapter() static: true iff both fingerprints present and equal', () => {
    expect(CAELReplayer.sameAdapter('A', 'A')).toBe(true);
    expect(CAELReplayer.sameAdapter('A', 'B')).toBe(false);
    expect(CAELReplayer.sameAdapter('A', null)).toBe(false);
    expect(CAELReplayer.sameAdapter(null, 'A')).toBe(false);
    expect(CAELReplayer.sameAdapter(null, null)).toBe(false);
    expect(CAELReplayer.sameAdapter('', 'A')).toBe(false);  // empty fingerprint treated as absent
    expect(CAELReplayer.sameAdapter(undefined, 'A')).toBe(false);
  });

  it('cross-adapter replay skips digest enforcement (tampered digest does NOT throw)', async () => {
    // Record on adapter A; replay on adapter B (different fingerprint).
    // Even with tampered digests in the trace, the replayer should
    // not throw — cross-adapter is the expected regime and digest
    // mismatch is handled by the dispute oracle's metric comparison.
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'adapter-A' },
    );
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    const stepEventIndex = trace.findIndex((e) => e.event === 'step');
    const actualLength = (trace[stepEventIndex].payload.stateDigests as string[]).length;
    const tamperedPayload = {
      ...trace[stepEventIndex].payload,
      stateDigests: Array.from({ length: actualLength }, () => 'deadbeef'),
    };
    const { hashCAELEntry } = await import('../CAELTrace');
    const newEntry = { ...trace[stepEventIndex], payload: tamperedPayload };
    const newHash = hashCAELEntry({
      version: newEntry.version, runId: newEntry.runId, index: newEntry.index,
      event: newEntry.event, timestamp: newEntry.timestamp, simTime: newEntry.simTime,
      prevHash: newEntry.prevHash, payload: newEntry.payload,
    });
    trace[stepEventIndex] = { ...newEntry, hash: newHash };
    let prevHash = newHash;
    for (let i = stepEventIndex + 1; i < trace.length; i++) {
      const e = trace[i];
      const h = hashCAELEntry({
        version: e.version, runId: e.runId, index: e.index, event: e.event,
        timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: e.payload,
      });
      trace[i] = { ...e, prevHash, hash: h };
      prevHash = h;
    }

    const replayer = new CAELReplayer(trace);
    // Current adapter B differs from recorded A → cross-adapter → skip
    const replayed = await replayer.replay(() => mockSolver(), {
      currentAdapterFingerprint: 'adapter-B',
    });
    expect(replayed.getProvenance().totalSteps).toBeGreaterThan(0);
    replayed.dispose();
  });

  it('replay without currentAdapterFingerprint → cross-adapter fallback (skip)', async () => {
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: 'adapter-A' },
    );
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    const stepEventIndex = trace.findIndex((e) => e.event === 'step');
    const actualLength = (trace[stepEventIndex].payload.stateDigests as string[]).length;
    const tamperedPayload = {
      ...trace[stepEventIndex].payload,
      stateDigests: Array.from({ length: actualLength }, () => 'deadbeef'),
    };
    const { hashCAELEntry } = await import('../CAELTrace');
    const newEntry = { ...trace[stepEventIndex], payload: tamperedPayload };
    const newHash = hashCAELEntry({
      version: newEntry.version, runId: newEntry.runId, index: newEntry.index,
      event: newEntry.event, timestamp: newEntry.timestamp, simTime: newEntry.simTime,
      prevHash: newEntry.prevHash, payload: newEntry.payload,
    });
    trace[stepEventIndex] = { ...newEntry, hash: newHash };
    let prevHash = newHash;
    for (let i = stepEventIndex + 1; i < trace.length; i++) {
      const e = trace[i];
      const h = hashCAELEntry({
        version: e.version, runId: e.runId, index: e.index, event: e.event,
        timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: e.payload,
      });
      trace[i] = { ...e, prevHash, hash: h };
      prevHash = h;
    }

    const replayer = new CAELReplayer(trace);
    // No currentAdapterFingerprint → sameAdapter() returns false → skip
    const replayed = await replayer.replay(() => mockSolver());
    expect(replayed.getProvenance().totalSteps).toBeGreaterThan(0);
    replayed.dispose();
  });

  it('trace without adapterFingerprint + replay with one → cross-adapter fallback', async () => {
    // Old trace (pre-5b) has null fingerprint. Even if replay provides
    // a current fingerprint, sameAdapter() returns false (null recorded
    // means unknown/cross-adapter).
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    // Note: no adapterFingerprint in contractConfig
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    // Verify: no fingerprint recorded
    expect(trace[0].payload.adapterFingerprint).toBe(null);

    // Tamper digest
    const stepEventIndex = trace.findIndex((e) => e.event === 'step');
    const actualLength = (trace[stepEventIndex].payload.stateDigests as string[]).length;
    const tamperedPayload = {
      ...trace[stepEventIndex].payload,
      stateDigests: Array.from({ length: actualLength }, () => 'deadbeef'),
    };
    const { hashCAELEntry } = await import('../CAELTrace');
    const newEntry = { ...trace[stepEventIndex], payload: tamperedPayload };
    const newHash = hashCAELEntry({
      version: newEntry.version, runId: newEntry.runId, index: newEntry.index,
      event: newEntry.event, timestamp: newEntry.timestamp, simTime: newEntry.simTime,
      prevHash: newEntry.prevHash, payload: newEntry.payload,
    });
    trace[stepEventIndex] = { ...newEntry, hash: newHash };
    let prevHash = newHash;
    for (let i = stepEventIndex + 1; i < trace.length; i++) {
      const e = trace[i];
      const h = hashCAELEntry({
        version: e.version, runId: e.runId, index: e.index, event: e.event,
        timestamp: e.timestamp, simTime: e.simTime, prevHash, payload: e.payload,
      });
      trace[i] = { ...e, prevHash, hash: h };
      prevHash = h;
    }

    const replayer = new CAELReplayer(trace);
    // Current fingerprint provided but trace has none → sameAdapter false → skip
    const replayed = await replayer.replay(() => mockSolver(), {
      currentAdapterFingerprint: 'adapter-B',
    });
    expect(replayed.getProvenance().totalSteps).toBeGreaterThan(0);
    replayed.dispose();
  });
});
