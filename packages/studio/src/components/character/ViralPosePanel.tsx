'use client';

/**
 * ViralPosePanel — Control Panel for Viral Pose Trait
 *
 * MEME-004: Viral pose trait UI
 *
 * Features:
 * - Start/stop auto-cycling
 * - Manual pose triggering
 * - Pose sequence selection
 * - Current pose display
 * - Quick pose buttons
 */

import { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Settings } from 'lucide-react';
import {
  type ViralPose,
  type PoseCategory,
  getAllPoses,
  getPosesByCategory,
  getTrendingPoses,
} from '@/lib/poseLibrary';

interface ViralPosePanelProps {
  currentPose: ViralPose | null;
  poseSequence: ViralPose[];
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onTriggerPose: (poseId: string) => void;
  onTriggerNext: () => void;
  onTriggerPrevious: () => void;
  onSetPoseSequence?: (poses: string[] | PoseCategory) => void;
}

const QUICK_POSES = ['dab', 'floss', 'griddy', 't-pose', 'flex', 'shrug', 'heart-hands', 'peace-sign'];

export function ViralPosePanel({
  currentPose,
  poseSequence,
  isPlaying,
  onStart,
  onStop,
  onTriggerPose,
  onTriggerNext,
  onTriggerPrevious,
  onSetPoseSequence,
}: ViralPosePanelProps) {
  const [category, setCategory] = useState<PoseCategory | 'trending' | 'all'>('trending');
  const [showSettings, setShowSettings] = useState(false);

  const handleCategoryChange = (newCategory: PoseCategory | 'trending' | 'all') => {
    setCategory(newCategory);
    if (onSetPoseSequence) {
      if (newCategory === 'all') {
        onSetPoseSequence(getAllPoses().map((p) => p.id));
      } else if (newCategory === 'trending') {
        onSetPoseSequence(getTrendingPoses().map((p) => p.id));
      } else {
        onSetPoseSequence(newCategory);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-purple-500/30 bg-studio-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🕺</span>
          <div>
            <h3 className="text-sm font-bold text-white">Viral Poses</h3>
            <p className="text-xs text-studio-muted">
              {poseSequence.length} poses • {isPlaying ? 'Auto-cycling' : 'Paused'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Current Pose Display */}
      {currentPose && (
        <div className="rounded-lg border border-studio-border bg-black/20 p-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{currentPose.emoji}</span>
            <div className="flex-1">
              <p className="font-semibold text-white">{currentPose.name}</p>
              <p className="text-xs text-studio-muted">{currentPose.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-semibold capitalize text-purple-400">
                {currentPose.category}
              </span>
              <span className="text-xs text-studio-muted">{currentPose.difficulty}</span>
            </div>
          </div>
        </div>
      )}

      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTriggerPrevious}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-600/20 text-gray-400 transition-all hover:bg-gray-600/30 active:scale-95"
          title="Previous Pose"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          onClick={isPlaying ? onStop : onStart}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 ${
            isPlaying
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
          }`}
          title={isPlaying ? 'Pause Auto-Cycling' : 'Start Auto-Cycling'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>

        <button
          onClick={onTriggerNext}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-600/20 text-gray-400 transition-all hover:bg-gray-600/30 active:scale-95"
          title="Next Pose"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <div className="ml-auto text-xs text-studio-muted">
          {poseSequence.findIndex((p) => p.id === currentPose?.id) + 1} / {poseSequence.length}
        </div>
      </div>

      {/* Category Filters */}
      {showSettings && (
        <div className="rounded-lg border border-studio-border bg-black/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Pose Category
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['trending', 'all', 'classic', 'viral', 'dance', 'emote', 'flex'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    category === cat
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                  }`}
                >
                  <span className="capitalize">{cat}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Quick Pose Buttons */}
      <div className="rounded-lg border border-studio-border bg-black/10 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Quick Poses
        </p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_POSES.map((poseId) => {
            const pose = poseSequence.find((p) => p.id === poseId);
            if (!pose) return null;

            return (
              <button
                key={poseId}
                onClick={() => onTriggerPose(poseId)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-all hover:border-purple-500/60 hover:bg-purple-500/10 active:scale-95 ${
                  currentPose?.id === poseId
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-studio-border bg-black/20'
                }`}
                title={pose.name}
              >
                <span className="text-2xl">{pose.emoji}</span>
                <span className="text-[10px] font-medium text-studio-muted">{pose.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pose List */}
      {showSettings && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-black/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Pose Sequence ({poseSequence.length})
          </p>
          <div className="space-y-1">
            {poseSequence.map((pose, index) => (
              <button
                key={pose.id}
                onClick={() => onTriggerPose(pose.id)}
                className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition-all hover:bg-purple-500/10 ${
                  currentPose?.id === pose.id ? 'bg-purple-500/20' : 'bg-black/20'
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-studio-border text-xs font-bold text-studio-muted">
                  {index + 1}
                </span>
                <span className="text-xl">{pose.emoji}</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">{pose.name}</p>
                  <p className="text-[10px] text-studio-muted capitalize">
                    {pose.category} • {pose.difficulty}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hotkeys */}
      <div className="rounded-lg border border-studio-border bg-black/10 p-2">
        <p className="text-[10px] text-studio-muted">
          <span className="font-semibold text-studio-text">Controls:</span>{' '}
          <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">Space</kbd> to
          play/pause •{' '}
          <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">←/→</kbd> to
          navigate poses
        </p>
      </div>
    </div>
  );
}
