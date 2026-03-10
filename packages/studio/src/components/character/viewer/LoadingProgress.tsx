'use client';

/**
 * LoadingProgress — Visual feedback for character loading
 *
 * Shows stage-by-stage progress for MEME-012 optimized loading
 */

import { useEffect, useState } from 'react';
import type { LoadProgress } from '@/lib/export/glbOptimizer';

interface LoadingProgressProps {
  progress: LoadProgress | null;
  loadTime: number | null;
}

export function LoadingProgress({ progress, loadTime }: LoadingProgressProps) {
  const [visible, setVisible] = useState(true);

  // Auto-hide after load completes
  useEffect(() => {
    if (progress?.stage === 'complete' && loadTime) {
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [progress, loadTime]);

  if (!progress || !visible) return null;

  const stageLabels: Record<LoadProgress['stage'], string> = {
    'cache-check': 'Checking cache...',
    downloading: 'Downloading model...',
    parsing: 'Parsing GLB...',
    skeleton: 'Extracting skeleton...',
    mesh: 'Optimizing meshes...',
    textures: 'Loading textures...',
    complete: 'Ready!',
  };

  const stageEmoji: Record<LoadProgress['stage'], string> = {
    'cache-check': '🔍',
    downloading: '⬇️',
    parsing: '⚙️',
    skeleton: '🦴',
    mesh: '🎨',
    textures: '🖼️',
    complete: '✅',
  };

  const isComplete = progress.stage === 'complete';
  const isFast = loadTime && loadTime < 500;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-purple-500/30 bg-black/90 p-4 shadow-2xl backdrop-blur-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{stageEmoji[progress.stage]}</span>
          <span className="text-sm font-semibold text-white">{stageLabels[progress.stage]}</span>
        </div>
        {isComplete && isFast && (
          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-bold text-green-400">
            FAST
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full transition-all duration-300 ${
            isComplete ? 'bg-green-500' : 'bg-purple-500'
          }`}
          style={{ width: `${progress.progress * 100}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{(progress.progress * 100).toFixed(0)}%</span>
        <span>{progress.timeElapsed.toFixed(0)}ms</span>
      </div>

      {/* Download progress (if downloading) */}
      {progress.stage === 'downloading' && progress.bytesLoaded && progress.bytesTotal && (
        <div className="mt-2 text-xs text-gray-500">
          {(progress.bytesLoaded / 1024).toFixed(0)} KB / {(progress.bytesTotal / 1024).toFixed(0)}{' '}
          KB
        </div>
      )}

      {/* Final load time */}
      {isComplete && loadTime && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 p-2">
          <span className="text-xl">⚡</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-300">
              Loaded in {loadTime.toFixed(0)}ms
            </p>
            <p className="text-[10px] text-purple-400/60">
              {isFast ? 'Lightning fast! 🔥' : 'Optimization complete'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
