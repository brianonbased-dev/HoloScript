'use client';
// useStudioCAELSession — Paper 24 study-session lifecycle hook.
//
// Mounts a UISessionRecorder, taps the cross-panel useStudioBus for any
// channel starting with 'ui.', and on unmount finalizes the trace and hands
// it to the consumer-supplied flush callback (POST to study endpoint, write
// to disk, etc.).
//
// Design choice: a SINGLE bus subscriber (this hook) routes ALL ui.* events
// to the recorder. Individual handlers in PlacementSystem / GizmoController /
// SceneRenderer only need to call `bus.emit('ui.<x>', payload)` — they do
// not need to know about CAEL. This keeps the instrumentation surface tight:
// adding a new event source means one bus.emit call, not a recorder import +
// per-component plumbing.
//
// Spec ties: research/2026-04-24_adaptive-interface-generation-uist.md §G
// "AIG fails if the UIST study runs without CAEL instrumentation."

import { useEffect, useRef } from 'react';
import { UISessionRecorder, type UISessionRecorderOptions } from '../lib/uiSessionRecorder';
import { useStudioBus } from './useStudioBus';

export interface StudioCAELSessionOptions extends UISessionRecorderOptions {
  // Called once on unmount with the JSONL-serialized trace + run id. Use
  // this to POST to a study collection endpoint or save locally for IRB.
  // Errors are caught + logged so an unmount path never throws.
  onFlush?: (jsonl: string, runId: string) => Promise<void> | void;
  // Bus channel prefix to forward to CAEL. Defaults to 'ui.' so the
  // existing studio bus channels (terrain:changed, lighting:changed, etc.)
  // are NOT auto-captured (they're cross-panel reactivity, not user
  // interaction trace data). Override to widen coverage.
  channelPrefix?: string;
  // If provided, exposes the live recorder reference for tests or advanced
  // callers that want to read trace mid-session. Production callers should
  // not need this.
  recorderRef?: { current: UISessionRecorder | null };
}

export function useStudioCAELSession(opts: StudioCAELSessionOptions): void {
  const { emit: _emit, on } = useStudioBus();
  // Recorder lives across the lifetime of the hook. useRef so React renders
  // do not reinstantiate it (which would reset the hash chain).
  const recorderRef = useRef<UISessionRecorder | null>(null);
  if (recorderRef.current === null) {
    recorderRef.current = new UISessionRecorder({
      participantHash: opts.participantHash,
      taskId: opts.taskId,
      studyVersion: opts.studyVersion,
    });
  }
  if (opts.recorderRef) opts.recorderRef.current = recorderRef.current;

  const prefix = opts.channelPrefix ?? 'ui.';
  // We can't enumerate emitted channels in advance — useStudioBus is a
  // pub/sub. Subscribe to a wildcard via a single emit-interceptor pattern
  // by re-emitting on a meta-channel; simpler: subscribe to known ui.*
  // channels via a fixed list, and let new sources opt in by adding to it.
  // The actual fixed list lives in UI_CAEL_CHANNELS so it's auditable.
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const ch of UI_CAEL_CHANNELS) {
      const u = on(ch, (data) => {
        recorderRef.current?.logInteraction(ch, (data ?? {}) as Record<string, unknown>);
      });
      unsubs.push(u);
    }
    return () => {
      unsubs.forEach((u) => u());
      // Finalize the recorder on unmount and hand the trace to the consumer.
      // This is the one-shot flush per spec — the trace is the entire
      // contribution of this session to the Paper 24 dataset.
      const rec = recorderRef.current;
      if (rec && !rec.isFinalized()) {
        rec.finalize();
        if (opts.onFlush) {
          try {
            const result = opts.onFlush(rec.toJSONL(), rec.getRunId());
            if (result && typeof (result as Promise<void>).then === 'function') {
              (result as Promise<void>).catch((e) => {
                // eslint-disable-next-line no-console
                console.warn('[ui-cael-session] flush failed:', e);
              });
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[ui-cael-session] flush threw:', e);
          }
        }
      }
    };
    // Intentionally empty deps: the session lifetime is the hook lifetime.
    // Re-running this effect would orphan listeners and reset the chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Auditable list of UI bus channels that get logged to CAEL. New event
// sources MUST add their channel here AND emit via useStudioBus.emit().
// Keep this in sync with the bus.emit('ui.*', ...) call sites.
export const UI_CAEL_CHANNELS = [
  'ui.placement.click',     // PlacementSystem.handleClick
  'ui.placement.hover',     // PlacementSystem.handlePointerMove (throttled)
  'ui.gizmo.transform',     // GizmoController.handleChange
  'ui.deselect',            // SceneRenderer empty-space click
  'ui.select',              // SceneRenderer node click
  'ui.camera.move',         // OrbitControls onChange (throttled)
  'ui.scene.save',          // existing scene:saved bridge
  'ui.scene.load',          // ditto
  'ui.undo',                // historyStore subscriber
  'ui.redo',                // historyStore subscriber
] as const;

export type UICAELChannel = (typeof UI_CAEL_CHANNELS)[number];
