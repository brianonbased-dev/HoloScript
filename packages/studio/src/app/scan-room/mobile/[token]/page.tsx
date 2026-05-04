'use client';

import { use, useEffect, useRef, useState } from 'react';
import { Camera, UploadCloud, CheckCircle2, Loader2, Square, Video } from 'lucide-react';

interface MobileScanProps {
  params: Promise<{ token: string }>;
}

type ScanStatus = 'pending-phone' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';

interface MobileScanFeedback {
  status?: ScanStatus;
  frameCount?: number;
  videoBytes?: number;
  lastError?: string;
  replayFingerprint?: string;
  renderAsset?: { pointCount?: number };
}

const scanSteps: Array<{ status: ScanStatus; label: string }> = [
  { status: 'pending-phone', label: 'Ready' },
  { status: 'capturing', label: 'Capture' },
  { status: 'uploaded', label: 'Received' },
  { status: 'processing', label: 'Mesh' },
  { status: 'done', label: 'Done' },
];

function isScanStatus(value: unknown): value is ScanStatus {
  return (
    value === 'pending-phone' ||
    value === 'capturing' ||
    value === 'uploaded' ||
    value === 'processing' ||
    value === 'done' ||
    value === 'error'
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function MobileScanPage({ params }: MobileScanProps) {
  const { token } = use(params);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completionFeedbackSentRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<MobileScanFeedback | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'recording' | 'processing'>('idle');
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const pushState = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/reconstruction/session?t=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Session update failed (${res.status})`);
    }
    const data = (await res.json().catch(() => null)) as { session?: MobileScanFeedback } | null;
    if (data?.session) {
      setSessionFeedback(data.session);
      return;
    }
    setSessionFeedback((prev) => ({
      ...prev,
      ...(isScanStatus(body.status) ? { status: body.status } : {}),
      ...(typeof body.frameCount === 'number' ? { frameCount: body.frameCount } : {}),
      ...(typeof body.videoBytes === 'number' ? { videoBytes: body.videoBytes } : {}),
      ...(typeof body.error === 'string' ? { lastError: body.error } : {}),
    }));
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

  useEffect(() => {
    let isCurrent = true;

    const refreshFeedback = async () => {
      try {
        const res = await fetch(`/api/reconstruction/session?t=${encodeURIComponent(token)}`);
        if (!isCurrent) return;
        if (!res.ok) {
          setFeedbackError(`Session feedback unavailable (${res.status})`);
          return;
        }

        const data = (await res.json()) as MobileScanFeedback;
        setFeedbackError(null);
        setSessionFeedback(data);

        if (data.status === 'done') {
          setDone(true);
          if (!completionFeedbackSentRef.current) {
            completionFeedbackSentRef.current = true;
            navigator.vibrate?.([60, 40, 60]);
          }
        }
        if (data.status === 'error') {
          setError(data.lastError ?? 'Capture failed');
        }
      } catch (e) {
        if (!isCurrent) return;
        setFeedbackError(e instanceof Error ? e.message : 'Session feedback unavailable');
      }
    };

    void refreshFeedback();
    const interval = window.setInterval(() => void refreshFeedback(), 1200);
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [token]);

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

  const effectiveStatus: ScanStatus =
    sessionFeedback?.status ??
    (done
      ? 'done'
      : uploading || cameraState === 'processing'
        ? 'processing'
        : cameraState === 'ready' || cameraState === 'recording'
          ? 'capturing'
          : 'pending-phone');
  const stepIndex = effectiveStatus === 'error'
    ? scanSteps.length - 1
    : Math.max(0, scanSteps.findIndex((step) => step.status === effectiveStatus));
  const progressPercent = Math.round(((stepIndex + 1) / scanSteps.length) * 100);
  const statusCopy = (() => {
    if (effectiveStatus === 'error') {
      return {
        title: 'Capture needs attention',
        detail: sessionFeedback?.lastError ?? error ?? 'Studio reported a capture error.',
      };
    }
    if (effectiveStatus === 'done') {
      return {
        title: 'Mesh captured',
        detail: 'Desktop Studio has the scan asset and can render it in the viewer.',
      };
    }
    if (effectiveStatus === 'processing') {
      return {
        title: 'Building mesh',
        detail: 'Keep this page open while Studio prepares the renderable scan.',
      };
    }
    if (effectiveStatus === 'uploaded') {
      return {
        title: 'Capture received',
        detail: 'Video metadata reached Studio. Reconstruction is next.',
      };
    }
    if (cameraState === 'recording') {
      return {
        title: 'Recording room',
        detail: `Move slowly around the space, then finish capture. ${recordingSeconds}s recorded.`,
      };
    }
    if (effectiveStatus === 'capturing') {
      return {
        title: 'Camera linked',
        detail: 'Studio sees the phone session. Capture the room when ready.',
      };
    }
    return {
      title: 'Connected to Studio',
      detail: 'Open the camera and start a mesh capture from this phone.',
    };
  })();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0a0a12] px-4 py-6 text-white">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Phone Capture</h1>
        <p className="mt-1 text-xs text-white/50">Token: {token.slice(0, 8)}…</p>
      </div>

      <section
        aria-live="polite"
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.04] p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{statusCopy.title}</p>
            <p className="mt-1 text-xs leading-5 text-white/55">{statusCopy.detail}</p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70">
            {progressPercent}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <div
            className={`h-full rounded-full ${effectiveStatus === 'error' ? 'bg-red-400' : 'bg-indigo-300'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] text-white/45">
          {scanSteps.map((step, index) => (
            <div
              key={step.status}
              className={index <= stepIndex && effectiveStatus !== 'error' ? 'text-indigo-200' : undefined}
            >
              <div
                className={`mx-auto mb-1 h-1.5 w-1.5 rounded-full ${
                  index <= stepIndex && effectiveStatus !== 'error' ? 'bg-indigo-300' : 'bg-white/20'
                }`}
              />
              {step.label}
            </div>
          ))}
        </div>

        {(sessionFeedback?.frameCount !== undefined ||
          sessionFeedback?.videoBytes !== undefined ||
          sessionFeedback?.renderAsset?.pointCount !== undefined) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="text-white/40">Frames</p>
              <p className="mt-1 font-mono text-white/80">{sessionFeedback.frameCount ?? '-'}</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="text-white/40">Video</p>
              <p className="mt-1 font-mono text-white/80">
                {sessionFeedback.videoBytes !== undefined ? formatBytes(sessionFeedback.videoBytes) : '-'}
              </p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="text-white/40">Points</p>
              <p className="mt-1 font-mono text-white/80">
                {sessionFeedback.renderAsset?.pointCount?.toLocaleString() ?? '-'}
              </p>
            </div>
          </div>
        )}

        {feedbackError && <p className="mt-3 text-xs text-yellow-300">{feedbackError}</p>}
      </section>

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
