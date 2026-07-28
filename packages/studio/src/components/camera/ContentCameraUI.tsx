'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Camera, Video, MonitorPlay, Square, Play, Square as StopSquare } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  getBestWebmMimeForMediaRecorder,
  WEBGL_MEDIA_RECORDER_NOTES,
} from '@/lib/export/mediaRecorderWebglSupport';

/**
 * Hook to access the canvas DOM element from within R3F.
 * Must be rendered inside <Canvas>.
 */
export function ContentCameraCapture() {
  const { gl } = useThree();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Listen for custom events triggered by the UI (rendered outside Canvas)
  useEffect(() => {
    const handleStartRecord = () => {
      if (isRecording) return;

      const canvas = gl.domElement;
      const stream = canvas.captureStream(60); // 60 FPS

      try {
        const mimeType = getBestWebmMimeForMediaRecorder();
        logger.debug('[ContentCamera]', WEBGL_MEDIA_RECORDER_NOTES);
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          document.body.appendChild(a);
          a.style.display = 'none';
          a.href = url;
          a.download = `holoscript-render-${Date.now()}.webm`;
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        };

        recorder.start();
        setIsRecording(true);
      } catch (e) {
        logger.error('Failed to start MediaRecorder', e);
      }
    };

    const handleStopRecord = () => {
      if (!isRecording || !mediaRecorderRef.current) return;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    };

    window.addEventListener('holoscript:start-record', handleStartRecord);
    window.addEventListener('holoscript:stop-record', handleStopRecord);

    return () => {
      window.removeEventListener('holoscript:start-record', handleStartRecord);
      window.removeEventListener('holoscript:stop-record', handleStopRecord);
    };
  }, [gl, isRecording]);

  return null;
}

/**
 * UI rendered OVER the canvas.
 * Handles aspect ratio guides and the record button.
 */
export function ContentCameraUI() {
  const [aspect, setAspect] = useState<'none' | '16:9' | '9:16'>('none');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      window.dispatchEvent(new CustomEvent('holoscript:stop-record'));
      setIsRecording(false);
    } else {
      window.dispatchEvent(new CustomEvent('holoscript:start-record'));
      setIsRecording(true);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Aspect Ratio Overlays (Letterboxing / Pillarboxing) */}
      {aspect === '9:16' && (
        <div className="absolute inset-0 flex">
          <div className="bg-black/80 flex-1 transition-all duration-300 backdrop-blur-sm" />
          <div className="w-[min(100%,calc(100vh*9/16))] border-x-2 border-studio-accent/50 box-border pointer-events-none" />
          <div className="bg-black/80 flex-1 transition-all duration-300 backdrop-blur-sm" />
        </div>
      )}
      {aspect === '16:9' && (
        <div className="absolute inset-0 flex flex-col">
          <div className="bg-black/80 flex-1 transition-all duration-300 backdrop-blur-sm" />
          <div className="h-[min(100%,calc(100vw*9/16))] border-y-2 border-studio-accent/50 box-border pointer-events-none" />
          <div className="bg-black/80 flex-1 transition-all duration-300 backdrop-blur-sm" />
        </div>
      )}
      {/* Camera controls cluster — absolutely positioned in the top-right corner slot
           (below the AIPromptOverlay pill at top-3, above AR/VR buttons at top-12).
           z-20 keeps it below panels popover (z-40) and Brittney dock (z-30).
           At ≥lg: shows aspect-ratio picker + labeled REC button.
           Below lg: icon-only REC button (28px) so it fits at any viewport width.
           Recording timer always visible when recording is active. */}
      <div className="pointer-events-auto absolute top-12 right-3 flex flex-col items-end gap-1.5">
        {/* Aspect ratio + full-label record row — lg+ only */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-gray-700/60 bg-gray-900/80 p-1 backdrop-blur shadow-lg">
            <button
              onClick={() => setAspect('none')}
              className={`rounded-lg p-1.5 transition ${aspect === 'none' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white'}`}
              title="Free Aspect"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setAspect('16:9')}
              className={`rounded-lg p-1.5 transition ${aspect === '16:9' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white'}`}
              title="Horizontal (16:9)"
            >
              <MonitorPlay className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setAspect('9:16')}
              className={`rounded-lg p-1.5 transition ${aspect === '9:16' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-white'}`}
              title="Social / Vertical (9:16)"
            >
              <MonitorPlay className="w-3.5 h-3.5 rotate-90" />
            </button>
          </div>
          <button
            onClick={toggleRecording}
            title={isRecording ? 'Stop recording' : 'Record viewport'}
            className={`flex min-h-[28px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition shadow-lg ${
              isRecording
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/50'
                : 'bg-studio-accent/90 text-white hover:bg-indigo-500 border border-studio-accent/50 backdrop-blur'
            }`}
          >
            {isRecording ? (
              <StopSquare className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            {isRecording ? 'STOP' : 'REC'}
          </button>
        </div>

        {/* Icon-only record button — below lg (fits any narrow viewport column) */}
        <button
          onClick={toggleRecording}
          title={isRecording ? 'Stop recording' : 'Record viewport'}
          className={`lg:hidden flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full p-1.5 transition shadow-lg ${
            isRecording
              ? 'bg-red-500/20 text-red-500 border border-red-500/50'
              : 'bg-studio-panel/90 text-studio-muted border border-studio-border/60 backdrop-blur'
          }`}
        >
          {isRecording ? (
            <StopSquare className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Recording timer — always shows when recording regardless of breakpoint */}
        {isRecording && (
          <div className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-400 backdrop-blur animate-pulse font-mono text-xs tracking-widest shadow-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {formatTime(recordingTime)}
          </div>
        )}
      </div>
    </div>
  );
}
