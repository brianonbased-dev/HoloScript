'use client';
// StudioCAELMount — Paper 24 final integration wire.
//
// Lives inside Providers (mounted once for the whole studio app). Two jobs:
//
//   1. Install the historyStore CAEL bridge once at app start. This is
//      cheap (no recorder, no subscriber on the studio bus unless a
//      session is also mounted). It just listens to zundo and emits
//      ui.undo / ui.redo to the bus when undo/redo fires.
//
//   2. When the page URL has `?study=1`, mount the actual UISession
//      hook with participantHash + taskId from URL params. The hook
//      records every UI_CAEL_CHANNELS event into a CAEL trace and
//      flushes to localStorage on unmount (the irreversible study-end
//      moment). A real study-runner page would also POST to a study
//      collection endpoint via onFlush — we keep localStorage as the
//      universal fallback so no event is ever dropped on tab-close.
//
// Spec ties:
//   research/2026-04-24_adaptive-interface-generation-uist.md §G —
//   CAEL instrumentation MUST be live BEFORE the UIST study runs.
//
// Usage:
//   1. Mount <StudioCAELMount /> in Providers (this commit does that).
//   2. To activate a study session: open studio at
//      http://<host>/?study=1&participant=<sha>&task=<id>&study_version=v1
//   3. Click around. Events emit on the studio bus, get hashed into
//      the CAEL trace.
//   4. Close tab / unmount → trace flushes to
//      localStorage['cael-trace-<runId>'] as JSONL.
//   5. Operator collects with a small script that reads localStorage.

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStudioBus } from '@/hooks/useStudioBus';
import { useStudioCAELSession } from '@/hooks/useStudioCAELSession';
import { installHistoryCAELBridge } from '@/lib/historyStore';

// Always-mounted history-bridge installer. Subscribes to the zundo
// temporal store ONCE for the lifetime of the app. Inert when no
// session hook is consuming the bus.
function HistoryBridgeMount() {
  const { emit } = useStudioBus();
  useEffect(() => {
    const unsub = installHistoryCAELBridge(emit);
    return unsub;
  }, [emit]);
  return null;
}

// Conditionally-mounted session — only rendered when ?study=1 is
// present in the URL. React's component-mount semantics give us the
// conditional hook execution we can't get with a plain `if (enabled)`.
function StudySessionMount({
  participantHash,
  taskId,
  studyVersion,
}: {
  participantHash: string;
  taskId: string;
  studyVersion: string;
}) {
  useStudioCAELSession({
    participantHash,
    taskId,
    studyVersion,
    onFlush: (jsonl, runId) => {
      // Write to localStorage so the trace survives tab-close even if
      // a remote POST is configured separately. Operator collects via
      // a small script that reads `cael-trace-*` keys.
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(`cael-trace-${runId}`, jsonl);
          // Also push the runId into a roster so the operator script
          // can enumerate sessions without scanning all keys.
          const rosterKey = 'cael-trace-runs';
          const existing = window.localStorage.getItem(rosterKey);
          const roster: string[] = existing ? JSON.parse(existing) : [];
          if (!roster.includes(runId)) {
            roster.push(runId);
            window.localStorage.setItem(rosterKey, JSON.stringify(roster));
          }
        }
        // eslint-disable-next-line no-console
        console.log('[ui-cael-session] flushed', runId, '— bytes:', jsonl.length);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ui-cael-session] localStorage flush failed:', e);
      }
    },
  });
  return null;
}

// useSearchParams triggers a Client-Side-Rendering bailout for the whole
// subtree that contains it. Since this mount lives inside Providers (root
// layout), an unwrapped call propagates the bailout to every page —
// breaking static prerender of /auth/signin, /_not-found, etc. Suspense
// boundary lets Next.js prerender the surrounding tree and CSR-fall-back
// only this gate. Pattern: nextjs.org/docs/messages/missing-suspense-with-csr-bailout.
function StudyModeGate() {
  const searchParams = useSearchParams();
  const studyMode = searchParams?.get('study') === '1';
  const participantHash = searchParams?.get('participant') ?? '';
  const taskId = searchParams?.get('task') ?? '';
  const studyVersion = searchParams?.get('study_version') ?? '2026-04-24-capstone-uist';

  if (!studyMode || !participantHash || !taskId) return null;
  return (
    <StudySessionMount
      participantHash={participantHash}
      taskId={taskId}
      studyVersion={studyVersion}
    />
  );
}

export function StudioCAELMount() {
  return (
    <>
      <HistoryBridgeMount />
      <Suspense fallback={null}>
        <StudyModeGate />
      </Suspense>
    </>
  );
}
