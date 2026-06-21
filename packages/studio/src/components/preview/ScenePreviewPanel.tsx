'use client';

import type React from 'react';
import { Suspense, useCallback, useId, useState } from 'react';
import { DesktopViewer } from '@/embed/DesktopViewer';
import { LOD_COLORS } from '@/components/panels/LODPanel';
import { useStudioBus } from '@/hooks/useStudioBus';
import { useSceneStore } from '@/lib/stores/sceneStore';

function clampLodQuality(value: number) {
  return Math.max(0, Math.min(LOD_COLORS.length - 1, value));
}

export function ScenePreviewPanel() {
  const controlId = useId();
  const [lodQuality, setLodQuality] = useState(0);
  const code = useSceneStore((s) => s.code);
  const setErrors = useSceneStore((s) => s.setErrors);
  const { emit } = useStudioBus();

  const selectedColor = LOD_COLORS[lodQuality] ?? LOD_COLORS[0];

  const handleLodQualityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const quality = clampLodQuality(Number(event.target.value));
      setLodQuality(quality);
      emit('lod:updated', {
        quality,
        color: LOD_COLORS[quality],
        source: 'scene-preview',
      });
    },
    [emit]
  );

  const preview = !code.trim() ? (
    <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
      No scene code - write HoloScript or ask Brittney to build something.
    </div>
  ) : (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
          Compiling...
        </div>
      }
    >
      <DesktopViewer
        code={code}
        onErrors={setErrors}
        showPlatformReceipt={false}
        showStars={false}
        showGrid={true}
      />
    </Suspense>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-studio-surface">
      {preview}
      <div className="absolute bottom-3 left-3 right-3 rounded-md border border-studio-border/70 bg-studio-panel/90 px-3 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <label
            htmlFor={controlId}
            className="w-8 shrink-0 text-[10px] font-semibold text-studio-muted"
          >
            LOD
          </label>
          <input
            id={controlId}
            type="range"
            min={0}
            max={3}
            step={1}
            value={lodQuality}
            onChange={handleLodQualityChange}
            aria-label="LOD quality"
            aria-valuetext={`Level ${lodQuality}`}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-studio-accent"
            style={{ accentColor: selectedColor }}
          />
          <span className="flex w-10 shrink-0 items-center justify-end gap-1.5 font-mono text-[11px] text-studio-text">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: selectedColor }}
            />
            L{lodQuality}
          </span>
        </div>
      </div>
    </div>
  );
}
