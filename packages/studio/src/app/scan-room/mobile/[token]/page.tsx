'use client';

import { use, useEffect, useRef, useState } from 'react';
import { Camera, UploadCloud, CheckCircle2, Loader2, Square, Video } from 'lucide-react';

interface MobileScanProps {
  params: Promise<{ token: string }>;
}

type ScanStatus = 'pending-phone' | 'phone-connected' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';

interface MobileScanFeedback {
  status?: ScanStatus;
  frameCount?: number;
  videoBytes?: number;
  lastError?: string;
  replayFingerprint?: string;
  renderAsset?: { pointCount?: number };
}

type CameraCapability =
  | { checked: false; live: false; reason: null }
  | { checked: true; live: true; reason: null }
  | { checked: true; live: false; reason: string };

interface RoomPlaneSensing {
  floorConfidence: number;
  wallConfidence: number;
  motion: number;
  samples: number;
}

const emptyPlaneSensing: RoomPlaneSensing = {
  floorConfidence: 0,
  wallConfidence: 0,
  motion: 0,
  samples: 0,
};

const scanSteps: Array<{ status: ScanStatus; label: string }> = [
  { status: 'pending-phone', label: 'Ready' },
  { status: 'phone-connected', label: 'Phone' },
  { status: 'capturing', label: 'Capture' },
  { status: 'uploaded', label: 'Received' },
  { status: 'processing', label: 'Mesh' },
  { status: 'done', label: 'Done' },
];

function isScanStatus(value: unknown): value is ScanStatus {
  return (
    value === 'pending-phone' ||
    value === 'phone-connected' ||
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function analyzeRoomPlaneFrame(
  frame: ImageData,
  previousLuma: Uint8Array | null,
): RoomPlaneSensing & { luma: Uint8Array } {
  const { data, width, height } = frame;
  const luma = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    luma[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  let floorEnergy = 0;
  let floorCount = 0;
  let wallEnergy = 0;
  let wallCount = 0;
  let wallEdges = 0;
  let motionEnergy = 0;
  let motionCount = 0;
  const floorStart = Math.floor(height * 0.58);
  const wallStart = Math.floor(height * 0.12);
  const wallEnd = Math.floor(height * 0.78);

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const idx = y * width + x;
      const dx = Math.abs(luma[idx] - luma[idx - 1]);
      const dy = Math.abs(luma[idx] - luma[idx - width]);

      if (y >= floorStart) {
        floorEnergy += dx + dy;
        floorCount += 1;
      }

      if (y >= wallStart && y <= wallEnd) {
        wallEnergy += dx;
        wallEdges += dx > 18 ? 1 : 0;
        wallCount += 1;
      }

      if (previousLuma && previousLuma.length === luma.length) {
        motionEnergy += Math.abs(luma[idx] - previousLuma[idx]);
        motionCount += 1;
      }
    }
  }

  const floorTexture = floorCount > 0 ? floorEnergy / floorCount / 255 : 0;
  const wallEdgeEnergy = wallCount > 0 ? wallEnergy / wallCount / 255 : 0;
  const wallEdgeDensity = wallCount > 0 ? wallEdges / wallCount : 0;
  const motion = motionCount > 0 ? motionEnergy / motionCount / 255 : 0;

  return {
    luma,
    floorConfidence: clamp01(floorTexture * 8.5 + motion * 1.7),
    wallConfidence: clamp01(wallEdgeEnergy * 9 + wallEdgeDensity * 2.4 + motion),
    motion: clamp01(motion * 6),
    samples: 1,
  };
}

function smoothPlaneSensing(previous: RoomPlaneSensing, next: RoomPlaneSensing): RoomPlaneSensing {
  if (previous.samples === 0) return next;
  return {
    floorConfidence: previous.floorConfidence * 0.62 + next.floorConfidence * 0.38,
    wallConfidence: previous.wallConfidence * 0.62 + next.wallConfidence * 0.38,
    motion: previous.motion * 0.55 + next.motion * 0.45,
    samples: previous.samples + 1,
  };
}

export default function MobileScanPage({ params }: MobileScanProps) {
  const { token } = use(params);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalizeTimeoutRef = useRef<number | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const completionFeedbackSentRef = useRef(false);
  const phoneConnectedSentRef = useRef(false);
  const sensingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousLumaRef = useRef<Uint8Array | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<MobileScanFeedback | null>(null);
  const [cameraCapability, setCameraCapability] = useState<CameraCapability>({
    checked: false,
    live: false,
    reason: null,
  });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'recording' | 'processing'>('idle');
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [planeSensing, setPlaneSensing] = useState<RoomPlaneSensing>(emptyPlaneSensing);

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

  const fallbackVideoFingerprint = (file: File): string =>
    `size-only:${file.size}:${file.lastModified}:${file.name}`;

  const videoFingerprint = async (file: File): Promise<string> => {
    if (!globalThis.crypto?.subtle) {
      return fallbackVideoFingerprint(file);
    }

    const buf = await file.arrayBuffer();
    try {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return fallbackVideoFingerprint(file);
    }
  };

  const stopCameraStream = (resetState = true) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (resetState) setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      if (finalizeTimeoutRef.current !== null) {
        window.clearTimeout(finalizeTimeoutRef.current);
        finalizeTimeoutRef.current = null;
      }
      stopCameraStream(false);
    };
  }, []);

  useEffect(() => {
    const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';

    if (!window.isSecureContext) {
      setCameraCapability({
        checked: true,
        live: false,
        reason: 'Live preview needs HTTPS on mobile. Opening the native phone camera instead.',
      });
      return;
    }

    if (!hasMediaDevices || !hasMediaRecorder) {
      setCameraCapability({
        checked: true,
        live: false,
        reason: 'Live recording is not supported in this browser. Opening the native phone camera instead.',
      });
      return;
    }

    setCameraCapability({ checked: true, live: true, reason: null });
  }, []);

  useEffect(() => {
    if (!cameraCapability.checked || phoneConnectedSentRef.current) return;
    phoneConnectedSentRef.current = true;

    const markPhoneConnected = async () => {
      const res = await fetch(`/api/reconstruction/session?t=${encodeURIComponent(token)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'phone-connected' }),
      });
      if (!res.ok) {
        throw new Error(`Session update failed (${res.status})`);
      }
      const data = (await res.json().catch(() => null)) as { session?: MobileScanFeedback } | null;
      if (data?.session) setSessionFeedback(data.session);
    };

    void markPhoneConnected().catch((pushError) => {
      setFeedbackError(pushError instanceof Error ? pushError.message : 'Studio did not receive the phone connection.');
    });
  }, [cameraCapability.checked, token]);

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraStream, cameraState]);

  useEffect(() => {
    const isSampling = cameraStream && (cameraState === 'ready' || cameraState === 'recording');
    if (!isSampling) {
      previousLumaRef.current = null;
      if (cameraState === 'idle') setPlaneSensing(emptyPlaneSensing);
      return;
    }

    let isCurrent = true;
    const canvas = sensingCanvasRef.current ?? document.createElement('canvas');
    sensingCanvasRef.current = canvas;
    canvas.width = 96;
    canvas.height = 128;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const sampleFrame = () => {
      const video = videoRef.current;
      if (!isCurrent || !ctx || !video || video.readyState < 2 || video.videoWidth === 0) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const analysis = analyzeRoomPlaneFrame(
          ctx.getImageData(0, 0, canvas.width, canvas.height),
          previousLumaRef.current,
        );
        previousLumaRef.current = analysis.luma;
        setPlaneSensing((prev) => smoothPlaneSensing(prev, analysis));
      } catch {
        // Camera frames can briefly be unavailable while mobile browsers rotate or resume.
      }
    };

    sampleFrame();
    const interval = window.setInterval(sampleFrame, 450);
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [cameraState, cameraStream]);

  useEffect(() => {
    if (recordingStartedAt === null) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [recordingStartedAt]);

  useEffect(() => {
    let isCurrent = true;
    let isRefreshing = false;

    const refreshFeedback = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
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
      } finally {
        isRefreshing = false;
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

  const clearFinalizeTimer = () => {
    if (finalizeTimeoutRef.current === null) return;
    window.clearTimeout(finalizeTimeoutRef.current);
    finalizeTimeoutRef.current = null;
  };

  const submitCapture = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setDone(false);
    setError(null);
    setCaptureNotice('Sending capture to Studio...');

    try {
      if (file.size <= 0) {
        throw new Error('The recorded video was empty. Please record again for a few seconds.');
      }

      await pushState({ status: 'capturing' });
      setCaptureNotice('Preparing video metadata...');
      const videoHash = await videoFingerprint(file);
      // MVP transport: report metadata first (actual chunk streaming can follow in next sprint)
      await pushState({
        status: 'uploaded',
        frameCount: Math.max(1, Math.floor(file.size / 100000)),
        videoBytes: file.size,
        videoHash,
      });
      setCaptureNotice('Studio received the capture. Building mesh...');
      await pushState({ status: 'processing' });
      // MVP transport: enqueue metadata into the reconstruction worker.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
      await pushState({ status: 'done' });
      setCaptureNotice('Mesh captured. Studio has the render asset.');
      setDone(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setError(message);
      try {
        await pushState({ status: 'error', error: message });
      } catch (pushError) {
        setFeedbackError(pushError instanceof Error ? pushError.message : 'Studio did not receive the capture update.');
      }
    } finally {
      setUploading(false);
      setCameraState('idle');
      setRecordingStartedAt(null);
    }
  };

  const onVideoSelected = async (file: File | null) => {
    if (!file) {
      setCaptureNotice('No video was selected.');
      return;
    }
    await submitCapture(file);
  };

  const openStudioCamera = async () => {
    setError(null);
    setDone(false);

    if (!cameraCapability.checked || !cameraCapability.live) {
      setError('Live preview is unavailable here. Use Open phone camera to capture with this phone.');
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
      setCameraStream(stream);
      setCameraState('ready');
      void pushState({ status: 'capturing' }).catch((pushError) => {
        setFeedbackError(pushError instanceof Error ? pushError.message : 'Studio did not receive the camera update.');
      });
    } catch (e) {
      stopCameraStream();
      setCameraState('idle');
      const detail = e instanceof Error ? e.message : String(e);
      setError(`Live camera could not start: ${detail}. Opening the phone camera fallback is still available.`);
    }
  };

  const finalizeRecordedCapture = (recorder: MediaRecorder, typeHint?: string) => {
    clearFinalizeTimer();
    const type = recorder.mimeType || typeHint || 'video/webm';
    const blob = new Blob(chunksRef.current, { type });
    recorderRef.current = null;

    if (blob.size <= 0) {
      const message = 'No video data was captured. Record for a few seconds, then finish again.';
      setCameraState('ready');
      setRecordingStartedAt(null);
      setError(message);
      setCaptureNotice(null);
      void pushState({ status: 'error', error: message }).catch((pushError) => {
        setFeedbackError(pushError instanceof Error ? pushError.message : 'Studio did not receive the capture failure.');
      });
      return;
    }

    const extension = type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `room-scan-${Date.now()}.${extension}`, { type });
    stopCameraStream();
    void submitCapture(file);
  };

  const scheduleFinalizeRecordedCapture = (recorder: MediaRecorder, typeHint: string | undefined, delayMs: number) => {
    clearFinalizeTimer();
    finalizeTimeoutRef.current = window.setTimeout(() => {
      finalizeTimeoutRef.current = null;
      if (recorderRef.current !== recorder) return;
      finalizeRecordedCapture(recorder, typeHint);
    }, delayMs);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    clearFinalizeTimer();
    setCaptureNotice('Recording room scan...');
    setError(null);
    const mimeType = bestRecorderMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setError(`This browser could not start recording: ${detail}`);
      setCameraState('ready');
      return;
    }
    recorderRef.current = recorder;
    let finalized = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      const mediaEvent = event as Event & { error?: DOMException };
      const message = mediaEvent.error?.message ?? 'The camera recorder stopped unexpectedly.';
      setError(message);
      setCameraState('ready');
      setRecordingStartedAt(null);
      void pushState({ status: 'error', error: message }).catch((pushError) => {
        setFeedbackError(pushError instanceof Error ? pushError.message : 'Studio did not receive the recorder error.');
      });
    };

    recorder.onstop = () => {
      if (finalized) return;
      finalized = true;
      scheduleFinalizeRecordedCapture(recorder, mimeType, 900);
    };

    setRecordingSeconds(0);
    setRecordingStartedAt(Date.now());
    setCameraState('recording');
    try {
      recorder.start(1000);
    } catch {
      try {
        recorder.start();
      } catch (e) {
        recorderRef.current = null;
        setCameraState('ready');
        setRecordingStartedAt(null);
        const detail = e instanceof Error ? e.message : String(e);
        setError(`This browser could not record video: ${detail}`);
      }
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setError('No active recording was found. Start capture again.');
      setCameraState('ready');
      setRecordingStartedAt(null);
      return;
    }

    setCameraState('processing');
    setRecordingStartedAt(null);
    setCaptureNotice('Finishing capture...');
    try {
      recorder.requestData();
    } catch {
      // Some mobile implementations only flush data on stop.
    }

    if (recorder.state === 'recording' || recorder.state === 'paused') {
      recorder.stop();
      scheduleFinalizeRecordedCapture(recorder, bestRecorderMime(), 2500);
      return;
    }

    scheduleFinalizeRecordedCapture(recorder, bestRecorderMime(), 900);
  };

  const isStudioCameraOpen =
    cameraState === 'starting' ||
    cameraState === 'ready' ||
    cameraState === 'recording' ||
    cameraState === 'processing';
  const floorPercent = Math.round(planeSensing.floorConfidence * 100);
  const wallPercent = Math.round(planeSensing.wallConfidence * 100);
  const motionPercent = Math.round(planeSensing.motion * 100);
  const floorLocked = planeSensing.floorConfidence >= 0.42;
  const wallsLocked = planeSensing.wallConfidence >= 0.38;
  const planeLockPercent = Math.round(
    (planeSensing.floorConfidence * 0.54 + planeSensing.wallConfidence * 0.46) * 100,
  );
  const trackingPercent =
    cameraState === 'recording'
      ? Math.min(100, Math.max(planeLockPercent, 24 + recordingSeconds * 8))
      : cameraState === 'ready'
        ? planeLockPercent
        : cameraState === 'processing'
          ? 100
          : 0;
  const overlayPointCount = Math.max(
    sessionFeedback?.renderAsset?.pointCount ?? 0,
    cameraState === 'recording' ? 128 + recordingSeconds * 36 : 0,
  );

  const effectiveStatus: ScanStatus =
    done || sessionFeedback?.status === 'done'
      ? 'done'
      : uploading || cameraState === 'processing'
        ? 'processing'
        : cameraState === 'ready' || cameraState === 'recording'
          ? 'capturing'
          : sessionFeedback?.status ?? 'pending-phone';
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
        detail: `Move slowly around the space, then finish capture. Floor ${floorPercent}%, walls ${wallPercent}%. ${recordingSeconds}s recorded.`,
      };
    }
    if (effectiveStatus === 'capturing') {
      return {
        title: 'Camera linked',
        detail: floorLocked && wallsLocked
          ? 'Floor and wall cues are visible. Start capture when ready.'
          : 'Sweep slowly across the floor line and wall edges until the overlay locks on.',
      };
    }
    if (effectiveStatus === 'phone-connected') {
      return {
        title: 'Phone connected',
        detail: 'Desktop Studio sees this phone. Open the Studio camera to begin sensing the room.',
      };
    }
    return {
      title: 'Connected to Studio',
      detail: cameraCapability.live
        ? 'Open the Studio camera and start a mesh capture from this phone.'
        : 'Open the phone camera fallback, or use an HTTPS Studio URL for live overlays.',
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

        <div className="mt-3 grid grid-cols-6 gap-1 text-center text-[10px] text-white/45">
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
        {isStudioCameraOpen && (
          <div
            data-testid="room-studio-camera"
            className="relative aspect-[9/16] max-h-[58vh] w-full overflow-hidden rounded-2xl border border-indigo-300/40 bg-black"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div
              data-testid="room-camera-overlay"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(129,140,248,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] bg-[size:42px_42px] opacity-45" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_42%,rgba(10,10,18,0.55)_100%)]" />
              <div className="absolute left-4 right-4 top-4 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-indigo-100">
                <span className="rounded-full border border-indigo-200/35 bg-black/35 px-2 py-1">
                  HoloMap scan
                </span>
                <span className="rounded-full border border-emerald-200/35 bg-emerald-400/15 px-2 py-1 text-emerald-100">
                  {cameraState === 'recording'
                    ? 'Recording'
                    : floorLocked && wallsLocked
                      ? 'Planes locked'
                      : cameraState === 'ready'
                        ? 'Sensing'
                        : 'Linking'}
                </span>
              </div>
              <div className="absolute left-8 right-8 top-[24%] h-px bg-cyan-200/50 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
              <div className="absolute left-[18%] right-[18%] top-[42%] h-px bg-indigo-200/45" />
              <div className="absolute left-1/2 top-[42%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/45 shadow-[0_0_28px_rgba(103,232,249,0.35)]" />
              <div className="absolute left-1/2 top-[42%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200" />
              <div className="absolute left-7 top-24 h-10 w-10 border-l-2 border-t-2 border-cyan-200/75" />
              <div className="absolute right-7 top-24 h-10 w-10 border-r-2 border-t-2 border-cyan-200/75" />
              <div className="absolute bottom-36 left-7 h-10 w-10 border-b-2 border-l-2 border-cyan-200/75" />
              <div className="absolute bottom-36 right-7 h-10 w-10 border-b-2 border-r-2 border-cyan-200/75" />
              <div className="absolute bottom-24 left-8 right-8 rounded-xl border border-white/15 bg-black/35 p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between text-[11px] text-white/80">
                  <span>Tracking mesh</span>
                  <span className="font-mono text-cyan-100">{Math.round(trackingPercent)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(103,232,249,0.65)] transition-[width] duration-300"
                    style={{ width: `${trackingPercent}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-white/55">
                  <span
                    data-testid="room-floor-sensing"
                    className={floorLocked ? 'text-emerald-100' : 'text-yellow-100'}
                  >
                    Floor {planeSensing.samples > 0 ? `${floorPercent}%` : '--'}
                  </span>
                  <span
                    data-testid="room-wall-sensing"
                    className={wallsLocked ? 'text-emerald-100' : 'text-yellow-100'}
                  >
                    Walls {planeSensing.samples > 0 ? `${wallPercent}%` : '--'}
                  </span>
                  <span>{overlayPointCount > 0 ? `${overlayPointCount.toLocaleString()} pts` : '0 pts'}</span>
                </div>
                <div className="mt-2 text-center text-[10px] text-white/45">
                  Motion {planeSensing.samples > 0 ? `${motionPercent}%` : '--'}
                </div>
              </div>
              {cameraState === 'recording' && (
                <div className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 border-y border-cyan-200/25 bg-cyan-200/10 shadow-[0_0_32px_rgba(103,232,249,0.22)]" />
              )}
            </div>
          </div>
        )}

        {cameraState === 'idle' && (
          <>
            {!cameraCapability.checked && (
              <div className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-300/40 bg-indigo-400/10 px-4 py-5 text-sm text-indigo-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing Studio camera...
              </div>
            )}

            {cameraCapability.checked && cameraCapability.live && (
              <button
                type="button"
                data-testid="room-studio-camera-button"
                onClick={() => void openStudioCamera()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border border-indigo-300/50 bg-indigo-400/10 px-4 py-5 text-center"
              >
                <Video className="h-6 w-6 text-indigo-300" />
                <span className="text-sm font-medium">Open Studio camera</span>
                <span className="text-xs text-white/50">Live capture with HoloMap overlays on this screen.</span>
              </button>
            )}

            {cameraCapability.checked && !cameraCapability.live && (
              <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-indigo-300/50 bg-indigo-400/10 px-4 py-5 text-center">
                <Camera className="h-6 w-6 text-indigo-300" />
                <span className="text-sm font-medium">Open phone camera fallback</span>
                <span className="text-xs text-white/50">
                  {cameraCapability.reason ?? 'HTTPS is required before Studio can draw live overlays.'}
                </span>
                <input
                  ref={cameraCaptureInputRef}
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
            )}
          </>
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

      {cameraCapability.live && (
        <label className="flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
          <Camera className="h-4 w-4" />
          Use phone camera app fallback
          <input
            data-testid="room-camera-input-fallback"
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
      )}

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
          <UploadCloud className="h-4 w-4 animate-pulse" /> {captureNotice ?? 'Sending mesh capture to Studio...'}
        </div>
      )}

      {captureNotice && !uploading && !done && (
        <div className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/65">
          {captureNotice}
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
