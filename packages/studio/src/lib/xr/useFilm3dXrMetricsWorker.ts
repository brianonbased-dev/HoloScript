'use client';

import { useEffect, useRef } from 'react';
import type { Film3DXrVerificationSample } from './film3dXrVerification';

type Film3dWorkerToMain = { type: 'sample'; sample: Film3DXrVerificationSample };

const DIRECT_THROTTLE_MS = 200;

/**
 * Forwards throttled Film3D samples from a dedicated Worker when available; otherwise throttles on the main thread.
 */
export function useFilm3dXrMetricsWorker(enabled: boolean, onSample?: (sample: Film3DXrVerificationSample) => void) {
  const workerRef = useRef<Worker | null>(null);
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;
  const lastDirectEmit = useRef(0);

  useEffect(() => {
    if (!enabled || typeof Worker === 'undefined') {
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }

    try {
      const w = new Worker(new URL('./film3dXrMetrics.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = w;

      w.onmessage = (ev: MessageEvent<Film3dWorkerToMain>) => {
        const data = ev.data;
        if (data?.type === 'sample') {
          onSampleRef.current?.(data.sample);
        }
      };
    } catch {
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  return {
    postSample(sample: Film3DXrVerificationSample) {
      if (!enabled || !onSampleRef.current) return;
      const w = workerRef.current;
      if (w) {
        w.postMessage({ sample });
        return;
      }
      const now = Date.now();
      if (now - lastDirectEmit.current < DIRECT_THROTTLE_MS) {
        return;
      }
      lastDirectEmit.current = now;
      onSampleRef.current(sample);
    },
  };
}
