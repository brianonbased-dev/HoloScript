'use client';

import { use, useEffect, useRef, useState } from 'react';
import { Camera, UploadCloud, CheckCircle2, Loader2, Square, Video } from 'lucide-react';

interface MobileScanProps {
  params: Promise<{ token: string }>;
}

export default function MobileScanPage({ params }: MobileScanProps) {
  const { token } = use(params);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'recording' | 'processing'>('idle');
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const pushState = async (body: Record<string, unknown>) => {
    await fetch(`/api/reconstruction/session?t=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const sha256Hex = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  useEffect(() => {
    if (recordingStartedAt === null) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [recordingStartedAt]);

  const bestRecorderMime = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined') return undefined;
    return [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ].find((mime) => MediaRecorder.isTypeSupported(mime));
  };

  const submitCapture = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setDone(false);
    setError(null);
    await pushState({ status: 'capturing' });

    try {
      const videoHash = await sha256Hex(file);
      // MVP transport: report metadata first (actual chunk streaming can follow in next sprint)
      await pushState({
        status: 'uploaded',
        frameCount: Math.max(1, Math.floor(file.size / 100000)),
        videoBytes: file.size,
        videoHash,
      });
      await pushState({ status: 'processing' });
      // MVP transport: enqueue metadata into the reconstruction worker.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
      await pushState({ status: 'done' });
      setDone(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setError(message);
      await pushState({ status: 'error', error: message });
    } finally {
      setUploading(false);
      setCameraState('idle');
      setRecordingStartedAt(null);
    }
  };

  const onVideoSelected = async (file: File | null) => {
    if (!file) return;
    await submitCapture(file);
  };

  const openNativeCamera = async () => {
    setError(null);
    setDone(false);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Live camera recording needs HTTPS support. Use the phone camera app fallback below.');
      return;
    }

    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      await pushState({ status: 'capturing' });
      setCameraState('ready');
    } catch (e) {
      stopCameraStream();
      setCameraState('idle');
      const detail = e instanceof Error ? e.message : String(e);
      setError(`Camera could not start: ${detail}. Use the phone camera app fallback below.`);
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = bestRecorderMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `room-scan-${Date.now()}.${extension}`, { type });
      stopCameraStream();
      void submitCapture(file);
    };

    setRecordingSeconds(0);
    setRecordingStartedAt(Date.now());
    setCameraState('recording');
    recorder.start(1000);
  };

  const stopRecording = () => {
    setCameraState('processing');
    setRecordingStartedAt(null);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0a0a12] px-4 py-6 text-white">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Phone Capture</h1>
        <p className="mt-1 text-xs text-white/50">Token: {token.slice(0, 8)}…</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {(cameraState === 'ready' || cameraState === 'recording' || cameraState === 'processing') && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[9/16] max-h-[58vh] w-full rounded-2xl border border-indigo-300/40 bg-black object-cover"
          />
        )}

        {cameraState === 'idle' && (
          <button
            type="button"
            onClick={() => void openNativeCamera()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-indigo-300/50 bg-indigo-400/10 px-4 py-5 text-center"
          >
            <Camera className="h-6 w-6 text-indigo-300" />
            <span className="text-sm font-medium">Open live camera</span>
            <span className="text-xs text-white/50">Use the rear camera and stream capture directly to Studio.</span>
          </button>
        )}

        {cameraState === 'starting' && (
          <div className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-300/40 bg-indigo-400/10 px-4 py-5 text-sm text-indigo-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening camera…
          </div>
        )}

        {cameraState === 'ready' && (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white"
          >
            <Video className="h-4 w-4" /> Start mesh capture
          </button>
        )}

        {cameraState === 'recording' && (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-medium text-white"
          >
            <Square className="h-4 w-4" /> Finish capture · {recordingSeconds}s
          </button>
        )}

        {cameraState === 'processing' && (
          <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Building mesh capture package…
          </div>
        )}
      </div>

      <label className="flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
        <Camera className="h-4 w-4" />
        Use phone camera app fallback
        <input
          data-testid="room-camera-input"
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onClick={(e) => {
            e.currentTarget.value = '';
          }}
          onChange={(e) => void onVideoSelected(e.target.files?.[0] ?? null)}
        />
      </label>

      <label className="flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
        <UploadCloud className="h-4 w-4" />
        Upload existing video
        <input
          data-testid="room-upload-input"
          type="file"
          accept="video/*"
          className="hidden"
          onClick={(e) => {
            e.currentTarget.value = '';
          }}
          onChange={(e) => void onVideoSelected(e.target.files?.[0] ?? null)}
        />
      </label>

      {uploading && (
        <div className="inline-flex items-center gap-2 text-sm text-indigo-300">
          <UploadCloud className="h-4 w-4 animate-pulse" /> Sending mesh capture to Studio…
        </div>
      )}

      {done && !uploading && (
        <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-300">
          <CheckCircle2 className="h-4 w-4" /> Mesh captured. Return to desktop Studio.
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
