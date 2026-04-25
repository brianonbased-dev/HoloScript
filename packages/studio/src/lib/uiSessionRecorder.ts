// UISessionRecorder — Paper 24 pre-study CAEL instrumentation for Studio.
//
// CAELRecorder (packages/engine/src/simulation/CAELRecorder.ts) is bound to
// a SimSolver because every event is contextualized by physics state digests.
// The Studio authoring interface has no solver — its events are pure UI
// (clicks, drags, camera moves, object placements). This class captures the
// same CAELTraceEntry wire format (runId + index + event + timestamp +
// prevHash + hash + payload) so downstream tooling that ingests CAEL traces
// can read both interchangeably.
//
// Spec: research/2026-04-24_adaptive-interface-generation-uist.md §G —
// "Instrument the UIST study for CAEL logging BEFORE running it. Adding
// instrumentation after the study cannot recover the data. This is a
// one-shot opportunity."
//
// Hash chain identity = the runId + sequential prev_hash → hash chain over
// the same hashCAELEntry primitive. A consumer comparing a Studio session
// trace against a SimSolver-driven trace can verify both with the same
// integrity check.

import {
  type CAELTrace,
  type CAELTraceEntry,
  encodeCAELValue,
  hashCAELEntry,
  toCAELJSONL,
} from '@holoscript/engine/simulation';

export interface UISessionRecorderOptions {
  participantHash?: string;
  taskId?: string;
  studyVersion?: string;
}

export class UISessionRecorder {
  private readonly runId: string;
  private readonly trace: CAELTrace = [];
  private lastHash = 'cael.genesis';
  private readonly startedAtMs: number;
  private finalized = false;

  constructor(opts: UISessionRecorderOptions = {}) {
    this.runId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.startedAtMs = Date.now();
    // Init event mirrors CAELRecorder's init shape but uses the UI-session
    // namespace for solverType (so downstream tooling can partition the
    // corpus by trace origin without needing a separate flag).
    this.append('init', 0, {
      solverType: 'ui.session.v1',
      geometryHash: '',
      participantHash: opts.participantHash ?? null,
      taskId: opts.taskId ?? null,
      studyVersion: opts.studyVersion ?? null,
      hashMode: 'fnv1a',
    });
  }

  // simTimeMs is wall-clock-ms-since-session-start. The CAEL format treats
  // simTime as solver-relative; for UI sessions we use elapsed-ms-since-init
  // so analysts can compute idle gaps and action cadence trivially.
  logInteraction(type: string, data: Record<string, unknown>): void {
    if (this.finalized) return;
    const simTime = Date.now() - this.startedAtMs;
    this.append('interaction', simTime, {
      id: `ui-int-${this.trace.length}`,
      type,
      data: encodeCAELValue(data),
    });
  }

  finalize(extra: Record<string, unknown> = {}): CAELTrace {
    if (this.finalized) return this.trace.slice();
    this.finalized = true;
    const simTime = Date.now() - this.startedAtMs;
    this.append('final', simTime, {
      durationMs: simTime,
      eventCount: this.trace.length + 1,
      ...extra,
    });
    return this.trace.slice();
  }

  getTrace(): CAELTrace {
    return this.trace.slice();
  }

  toJSONL(): string {
    return toCAELJSONL(this.trace);
  }

  getRunId(): string {
    return this.runId;
  }

  isFinalized(): boolean {
    return this.finalized;
  }

  private append(event: CAELTraceEntry['event'], simTime: number, payload: Record<string, unknown>): void {
    const entryWithoutHash = {
      version: 'cael.v1' as const,
      runId: this.runId,
      index: this.trace.length,
      event,
      timestamp: Date.now(),
      simTime,
      prevHash: this.lastHash,
      payload,
    };
    const hash = hashCAELEntry(entryWithoutHash, 'fnv1a');
    const entry: CAELTraceEntry = { ...entryWithoutHash, hash };
    this.trace.push(entry);
    this.lastHash = hash;
  }
}
