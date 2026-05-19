'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  DEFAULT_WEBCAM_GAZE_CONFIG,
  WebcamGazeTracker,
  type WebcamGazeConfig,
  type WebcamGazeSample,
} from '@holoscript/core/traits/webcam-gaze';

export interface UseWebcamGazeOptions {
  enabled?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  config?: Partial<WebcamGazeConfig>;
  onSample?: (sample: WebcamGazeSample) => void;
}

export interface UseWebcamGazeResult {
  foveal_center: [number, number];
  gaze: WebcamGazeSample | null;
  tracking: boolean;
  confidence: number;
  stream: MediaStream | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useWebcamGaze(options: UseWebcamGazeOptions = {}): UseWebcamGazeResult {
  const trackerRef = useRef<WebcamGazeTracker | null>(null);
  const [gaze, setGaze] = useState<WebcamGazeSample | null>(null);
  const [tracking, setTracking] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setTracking(false);
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    if (trackerRef.current) return;

    const config: WebcamGazeConfig = {
      ...DEFAULT_WEBCAM_GAZE_CONFIG,
      ...options.config,
      auto_start: false,
    };

    const tracker = new WebcamGazeTracker({
      config,
      videoElement: options.videoRef?.current ?? null,
      onSample(sample: WebcamGazeSample) {
        setGaze(sample);
        setTracking(true);
        setError(null);
        options.onSample?.(sample);
      },
      onError(err: Error) {
        setError(err.message);
      },
    });

    trackerRef.current = tracker;
    try {
      await tracker.start();
      setTracking(true);
      setStream(tracker.getStream());
    } catch (err) {
      trackerRef.current = null;
      setTracking(false);
      setStream(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [options.config, options.onSample, options.videoRef]);

  useEffect(() => {
    if (!options.enabled) return;
    void start();
    return stop;
  }, [options.enabled, start, stop]);

  useEffect(() => stop, [stop]);

  return {
    foveal_center: gaze?.foveal_center ?? [0, 0],
    gaze,
    tracking,
    confidence: gaze?.confidence ?? 0,
    stream,
    error,
    start,
    stop,
  };
}
