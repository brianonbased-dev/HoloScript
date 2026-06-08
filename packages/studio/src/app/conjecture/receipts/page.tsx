'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type {
  StudioConjecturePoint,
  StudioConjectureReceiptsResponse,
  StudioConjectureReplayResponse,
} from '@/types/conjectureReceipts';

const STATE_LABEL: Record<StudioConjecturePoint['gateState'], string> = {
  survived: 'Survived',
  falsified: 'Falsified',
  undecided: 'Undecided',
};

const STATE_CLASS: Record<StudioConjecturePoint['gateState'], string> = {
  survived: 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.75)]',
  falsified: 'bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.75)]',
  undecided: 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.7)]',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: StudioConjectureReceiptsResponse }
  | { status: 'error'; message: string };

function shortKey(key: string): string {
  if (key.length <= 22) return key;
  return `${key.slice(0, 18)}...${key.slice(-6)}`;
}

function stateCount(points: StudioConjecturePoint[], state: StudioConjecturePoint['gateState']) {
  return points.filter((point) => point.gateState === state).length;
}

function pointStyle(point: StudioConjecturePoint): CSSProperties {
  return {
    left: `${50 + point.x * 10}%`,
    top: `${50 - point.y * 34}%`,
  };
}

export default function ConjectureReceiptsPage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replay, setReplay] = useState<StudioConjectureReplayResponse | null>(null);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/conjecture/receipts')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<StudioConjectureReceiptsResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setLoadState({ status: 'ready', data });
          setSelectedId((current) => current ?? data.points[0]?.id ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const points = useMemo(
    () => (loadState.status === 'ready' ? loadState.data.points : []),
    [loadState]
  );
  const selected = useMemo(
    () => points.find((point) => point.id === selectedId) ?? points[0] ?? null,
    [points, selectedId]
  );

  const runReplay = async (point: StudioConjecturePoint) => {
    setReplaying(true);
    setReplay(null);
    try {
      const response = await fetch(
        `/api/conjecture/receipts/${encodeURIComponent(point.receiptKey)}/replay`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ suite: point.suite, scenarioId: point.scenarioId }),
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReplay((await response.json()) as StudioConjectureReplayResponse);
    } catch (err: unknown) {
      setReplay({
        ok: true,
        replayedAt: new Date().toISOString(),
        suite: point.suite,
        sourcePath: 'client-error',
        targetReceiptKey: point.receiptKey,
        matched: false,
        counterexampleMatched: false,
        replayReceiptKey: null,
        point: null,
      });
      console.error('[ConjectureReceiptsPage] replay failed', err);
    } finally {
      setReplaying(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Conjecture Receipt Manifold</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span>{points.length} receipts</span>
              <span>{stateCount(points, 'survived')} survived</span>
              <span>{stateCount(points, 'falsified')} falsified</span>
              <span>{stateCount(points, 'undecided')} undecided</span>
            </div>
          </div>
          {loadState.status === 'ready' ? (
            <div className="text-right text-xs text-zinc-500">
              <div>{loadState.data.runCount} runs</div>
              <div>{loadState.data.receiptDir}</div>
            </div>
          ) : null}
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-92px)] grid-cols-[minmax(320px,1fr)_440px] gap-0 max-lg:grid-cols-1">
        <div className="relative min-h-[520px] border-r border-zinc-800 bg-[radial-gradient(circle_at_center,rgba(24,24,27,0.8),rgba(9,9,11,1))]">
          <div className="absolute inset-x-10 top-1/2 h-px bg-zinc-800" />
          <div className="absolute bottom-[16%] left-10 right-10 h-px bg-red-950/80" />
          <div className="absolute left-10 right-10 top-[16%] h-px bg-emerald-950/80" />

          {loadState.status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
              Loading receipts
            </div>
          ) : null}
          {loadState.status === 'error' ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-300">
              {loadState.message}
            </div>
          ) : null}

          {points.map((point) => (
            <button
              key={point.id}
              type="button"
              aria-label={`${point.claimId} ${STATE_LABEL[point.gateState]}`}
              title={`${STATE_LABEL[point.gateState]} · ${point.claimId}`}
              onClick={() => {
                setSelectedId(point.id);
                setReplay(null);
              }}
              className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                selected?.id === point.id ? 'border-white' : 'border-zinc-950'
              } ${STATE_CLASS[point.gateState]}`}
              style={pointStyle(point)}
            />
          ))}
        </div>

        <aside className="bg-zinc-900 px-5 py-5">
          {selected ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-zinc-500">{selected.suite}</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-normal">{selected.claimId}</h2>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    selected.gateState === 'survived'
                      ? 'bg-emerald-950 text-emerald-200'
                      : selected.gateState === 'falsified'
                        ? 'bg-red-950 text-red-200'
                        : 'bg-amber-950 text-amber-200'
                  }`}
                >
                  {STATE_LABEL[selected.gateState]}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-300">{selected.claimStatement}</p>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="border border-zinc-800 bg-zinc-950 p-3">
                  <dt className="text-zinc-500">Receipt</dt>
                  <dd className="mt-1 font-mono text-zinc-200">{shortKey(selected.receiptKey)}</dd>
                </div>
                <div className="border border-zinc-800 bg-zinc-950 p-3">
                  <dt className="text-zinc-500">Candidates</dt>
                  <dd className="mt-1 text-zinc-200">{selected.candidateCount}</dd>
                </div>
                <div className="border border-zinc-800 bg-zinc-950 p-3">
                  <dt className="text-zinc-500">Counterexamples</dt>
                  <dd className="mt-1 text-zinc-200">{selected.counterexampleCount}</dd>
                </div>
                <div className="border border-zinc-800 bg-zinc-950 p-3">
                  <dt className="text-zinc-500">Role</dt>
                  <dd className="mt-1 text-zinc-200">{selected.role}</dd>
                </div>
              </dl>

              {selected.replayable ? (
                <button
                  type="button"
                  disabled={replaying}
                  onClick={() => void runReplay(selected)}
                  className="mt-5 w-full border border-red-500 bg-red-950 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-900 disabled:opacity-60"
                >
                  {replaying ? 'Replaying falsifier' : 'Replay to fail'}
                </button>
              ) : null}

              {replay ? (
                <div className="mt-3 border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
                  <div>
                    {replay.counterexampleMatched
                      ? 'Counterexample reproduced'
                      : 'Replay did not match'}
                  </div>
                  <div className="mt-1 font-mono text-zinc-500">
                    {shortKey(replay.replayReceiptKey ?? 'no-receipt')}
                  </div>
                </div>
              ) : null}

              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase text-zinc-500">Candidates</h3>
                <div className="mt-2 space-y-2">
                  {selected.candidateSummaries.slice(0, 8).map((candidate) => (
                    <div
                      key={candidate.candidateId}
                      className="border border-zinc-800 bg-zinc-950 p-3 text-xs"
                    >
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-zinc-200">{candidate.candidateId}</span>
                        <span className="text-zinc-500">{candidate.status}</span>
                      </div>
                      <div className="mt-1 text-zinc-500">{candidate.family}</div>
                      {candidate.failedProbeIds.length > 0 ? (
                        <div className="mt-1 text-red-300">
                          {candidate.failedProbeIds.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <details className="mt-5 border border-zinc-800 bg-zinc-950 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-zinc-500">
                  Full Receipt
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-zinc-300">
                  {JSON.stringify(selected.receipt, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">No receipts available</div>
          )}
        </aside>
      </section>
    </main>
  );
}
