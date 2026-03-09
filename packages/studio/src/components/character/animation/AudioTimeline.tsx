'use client';

/**
 * AudioTimeline — Waveform Visualization & Beat Markers
 *
 * MEME-007: Visual timeline for audio sync
 */

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Square, Upload, Volume2 } from 'lucide-react';
import type { AudioAnalysis, TimelineMarker } from '@/lib/audioSync';

interface AudioTimelineProps {
  analysis: AudioAnalysis | null;
  currentTime: number;
  isPlaying: boolean;
  markers: TimelineMarker[];
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onLoadAudio: (file: File) => void;
  onVolumeChange: (volume: number) => void;
}

export function AudioTimeline({
  analysis,
  currentTime,
  isPlaying,
  markers,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onLoadAudio,
  onVolumeChange,
}: AudioTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draw waveform
  useEffect(() => {
    if (!analysis || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const { waveform, beats, duration } = analysis;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const barWidth = width / waveform.length;

    for (let i = 0; i < waveform.length; i++) {
      const x = i * barWidth;
      const barHeight = waveform[i] * height;
      const y = (height - barHeight) / 2;

      if (i === 0) {
        ctx.moveTo(x, y + barHeight / 2);
      }

      // Draw bar
      ctx.fillStyle = `rgba(139, 92, 246, ${waveform[i] * 0.6})`;
      ctx.fillRect(x, y, barWidth * 0.8, barHeight);
    }

    ctx.stroke();

    // Draw beat markers
    beats.forEach((beat) => {
      const x = (beat.time / duration) * width;
      const markerHeight = height * (0.3 + beat.strength * 0.7);

      ctx.fillStyle = beat.strength > 0.7 ? '#ef4444' : '#6b7280';
      ctx.fillRect(x - 1, (height - markerHeight) / 2, 2, markerHeight);
    });

    // Draw playhead
    const playheadX = (currentTime / duration) * width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playheadX - 1, 0, 2, height);

    // Draw time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
      const time = (duration / numLabels) * i;
      const x = (time / duration) * width;
      ctx.fillText(formatTime(time), x, height - 5);
    }
  }, [analysis, currentTime]);

  // Handle timeline click
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!analysis || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * analysis.duration;

    onSeek(time);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleTimelineClick(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleTimelineClick(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadAudio(file);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    onVolumeChange(newVolume);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-purple-500/30 bg-studio-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <div>
            <h3 className="text-sm font-bold text-white">Audio Timeline</h3>
            {analysis && (
              <p className="text-xs text-studio-muted">
                {formatTime(analysis.duration)} • {analysis.bpm.toFixed(0)} BPM •{' '}
                {analysis.beats.length} beats
              </p>
            )}
          </div>
        </div>

        {/* Upload button */}
        {!analysis && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 transition-all hover:bg-purple-500/30 active:scale-95"
          >
            <Upload className="h-4 w-4" />
            Load Audio
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Waveform canvas */}
      {analysis && (
        <div
          ref={timelineRef}
          className="relative h-32 cursor-pointer overflow-hidden rounded-lg border border-studio-border bg-black/40"
          onClick={handleTimelineClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} className="h-full w-full" />

          {/* Beat markers overlay */}
          {markers.map((marker) => {
            const position = (marker.time / analysis.duration) * 100;
            return (
              <div
                key={marker.id}
                className="absolute top-0 h-full w-0.5"
                style={{
                  left: `${position}%`,
                  backgroundColor: marker.color || '#888888',
                }}
                title={marker.label}
              />
            );
          })}

          {/* Current time overlay */}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1">
            <p className="font-mono text-xs text-white">
              {formatTime(currentTime)} / {formatTime(analysis.duration)}
            </p>
          </div>
        </div>
      )}

      {/* No audio state */}
      {!analysis && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-studio-border bg-black/20 transition-all hover:border-purple-500/40 hover:bg-purple-500/5"
        >
          <Upload className="h-8 w-8 text-studio-muted" />
          <p className="mt-2 text-sm font-semibold text-studio-text">
            Drop audio file or click to browse
          </p>
          <p className="text-xs text-studio-muted">MP3, WAV, OGG supported</p>
        </div>
      )}

      {/* Playback controls */}
      {analysis && (
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 ${
              isPlaying
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            }`}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>

          {/* Stop */}
          <button
            onClick={onStop}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-600/20 text-gray-400 transition-all hover:bg-gray-600/30 active:scale-95"
          >
            <Square className="h-4 w-4" />
          </button>

          {/* Volume */}
          <div className="flex flex-1 items-center gap-2">
            <Volume2 className="h-4 w-4 text-studio-muted" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1"
            />
            <span className="w-12 text-right text-xs font-mono text-studio-muted">
              {(volume * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Beat info */}
      {analysis && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-studio-border bg-black/20 p-3">
          <div>
            <p className="text-xs text-studio-muted">BPM</p>
            <p className="text-lg font-bold text-purple-400">{analysis.bpm.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-studio-muted">Beats</p>
            <p className="text-lg font-bold text-purple-400">{analysis.beats.length}</p>
          </div>
          <div>
            <p className="text-xs text-studio-muted">Markers</p>
            <p className="text-lg font-bold text-purple-400">{markers.length}</p>
          </div>
        </div>
      )}

      {/* Hotkeys */}
      {analysis && (
        <div className="rounded-lg border border-studio-border bg-black/10 p-2">
          <p className="text-[10px] text-studio-muted">
            <span className="font-semibold text-studio-text">Hotkeys:</span> Press{' '}
            <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">Space</kbd> to
            play/pause •{' '}
            <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">←/→</kbd> to seek
          </p>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
