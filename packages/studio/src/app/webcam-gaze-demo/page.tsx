'use client';

import { useRef } from 'react';
import { Play, Square } from 'lucide-react';
import { useWebcamGaze } from '@holoscript/r3f-renderer/hooks/useWebcamGaze';

export default function WebcamGazeDemoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gaze = useWebcamGaze({
    videoRef,
    config: {
      sample_rate_hz: 30,
      confidence_threshold: 0.25,
    },
  });

  const dotLeft = `${((gaze.gaze?.gaze_x ?? 0.5) * 100).toFixed(2)}%`;
  const dotTop = `${((gaze.gaze?.gaze_y ?? 0.5) * 100).toFixed(2)}%`;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Webcam Gaze</h1>
            <p className="mt-1 text-sm text-zinc-400">
              MediaPipe iris landmarks to HoloScript foveal-center input.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Start webcam gaze"
              onClick={() => void gaze.start()}
              disabled={gaze.tracking}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Stop webcam gaze"
              onClick={gaze.stop}
              disabled={!gaze.tracking}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="relative min-h-[55vh] overflow-hidden rounded-md border border-zinc-800 bg-black">
            <video
              ref={videoRef}
              className="h-full min-h-[55vh] w-full scale-x-[-1] object-cover"
              muted
              playsInline
              data-testid="webcam-gaze-video"
            />
            <div
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.95)]"
              style={{ left: dotLeft, top: dotTop }}
              data-testid="webcam-gaze-dot"
            />
          </div>

          <aside className="flex flex-col gap-3 border-l border-zinc-800 pl-0 lg:pl-5">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-xs uppercase tracking-normal text-zinc-500">Tracking</div>
              <div className="mt-2 text-2xl font-semibold">
                {gaze.tracking ? 'active' : 'idle'}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-xs uppercase tracking-normal text-zinc-500">Foveal Center</div>
              <div className="mt-2 font-mono text-lg">
                [{gaze.foveal_center[0].toFixed(3)}, {gaze.foveal_center[1].toFixed(3)}]
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-xs uppercase tracking-normal text-zinc-500">Confidence</div>
              <div className="mt-2 text-2xl font-semibold">{gaze.confidence.toFixed(2)}</div>
            </div>
            {gaze.error ? (
              <div className="rounded-md border border-red-500/40 bg-red-950/50 p-4 text-sm text-red-100">
                {gaze.error}
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
