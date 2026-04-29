'use client';

/**
 * AvatarPreview — 3D preview of composed avatar
 *
 * POC: Uses emoji composition as a placeholder for actual GLB mesh compositing.
 * Full implementation requires a runtime that can merge sub-meshes and
 * re-target skeletons.
 */

import { useRef } from 'react';
import { useAvatarStore, getPartById, getActiveTraits } from '@/lib/stores/avatarStore';
import { Download } from 'lucide-react';
import { exportAvatarConfig } from '@/lib/stores/avatarStore';

export function AvatarPreview() {
  const config = useAvatarStore((s) => s.config);
  const canvasRef = useRef<HTMLDivElement>(null);

  const traits = getActiveTraits(config);

  const handleExportJSON = () => {
    const data = exportAvatarConfig(config);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avatar-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const head = getPartById(config.head);
  const body = getPartById(config.body);
  const hair = getPartById(config.hair);
  const eyes = getPartById(config.eyes);
  const mouth = getPartById(config.mouth);

  return (
    <div className="flex h-full">
      {/* 3D Viewport placeholder */}
      <div className="flex flex-1 flex-col items-center justify-center bg-studio-bg">
        <div
          ref={canvasRef}
          className="relative flex h-[60vh] w-[60vh] items-center justify-center rounded-2xl border border-studio-border bg-black/40"
        >
          {/* Avatar composition */}
          <div
            className="flex flex-col items-center transition-transform"
            style={{ transform: `scale(${config.scale})` }}
          >
            {/* Hair (behind head) */}
            {hair && (
              <div
                className="text-8xl absolute -top-4"
                style={{ color: config.colors[hair.id] || hair.defaultColor }}
              >
                {hair.thumbnail}
              </div>
            )}

            {/* Head */}
            <div className="relative">
              {head && (
                <div
                  className="text-9xl"
                  style={{ color: config.colors[head.id] || head.defaultColor }}
                >
                  {head.thumbnail}
                </div>
              )}

              {/* Eyes overlay */}
              {eyes && (
                <div
                  className="absolute left-1/2 top-1/3 -translate-x-1/2 text-6xl"
                  style={{ color: config.colors[eyes.id] || eyes.defaultColor }}
                >
                  {eyes.thumbnail}
                </div>
              )}

              {/* Mouth overlay */}
              {mouth && (
                <div className="absolute left-1/2 top-2/3 -translate-x-1/2 text-4xl">
                  {mouth.thumbnail}
                </div>
              )}

              {/* Accessories overlay */}
              {config.accessories.map((id) => {
                const acc = getPartById(id);
                if (!acc) return null;
                return (
                  <div
                    key={id}
                    className="absolute -right-8 top-0 text-5xl"
                    style={{ color: config.colors[id] || acc.defaultColor }}
                  >
                    {acc.thumbnail}
                  </div>
                );
              })}
            </div>

            {/* Body */}
            {body && (
              <div
                className="text-9xl -mt-8"
                style={{ color: config.colors[body.id] || body.defaultColor }}
              >
                {body.thumbnail}
              </div>
            )}

            {/* Clothing overlay */}
            <div className="absolute bottom-8 flex gap-2">
              {config.clothing.map((id) => {
                const cloth = getPartById(id);
                if (!cloth) return null;
                return (
                  <div
                    key={id}
                    className="text-5xl"
                    style={{ color: config.colors[id] || cloth.defaultColor }}
                  >
                    {cloth.thumbnail}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Watermark */}
          <div className="absolute bottom-4 right-4 rounded bg-black/60 px-2 py-1 text-[10px] text-studio-muted">
            POC Preview • Scale: {config.scale.toFixed(1)}x
          </div>
        </div>

        <p className="mt-4 text-sm text-studio-muted">
          This is a placeholder preview. Full 3D compositing requires GLB mesh merging.
        </p>
      </div>

      {/* Right: Info panel */}
      <div className="w-72 border-l border-studio-border bg-studio-panel p-4">
        <h3 className="text-sm font-semibold text-white">Avatar Info</h3>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-studio-border bg-black/20 p-3">
            <p className="text-xs font-semibold text-white">Active Traits</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {traits.length > 0 ? (
                traits.map((trait) => (
                  <span
                    key={trait}
                    className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300"
                  >
                    {trait}
                  </span>
                ))
              ) : (
                <span className="text-xs text-studio-muted">No traits selected</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-studio-border bg-black/20 p-3">
            <p className="text-xs font-semibold text-white">Part Count</p>
            <div className="mt-2 space-y-1 text-xs text-studio-muted">
              <div className="flex justify-between">
                <span>Base parts</span>
                <span>{[config.head, config.body, config.hair, config.eyes, config.mouth].filter(Boolean).length}</span>
              </div>
              <div className="flex justify-between">
                <span>Clothing</span>
                <span>{config.clothing.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Accessories</span>
                <span>{config.accessories.length}</span>
              </div>
              <div className="flex justify-between border-t border-studio-border pt-1">
                <span className="text-white">Total</span>
                <span className="text-white">
                  {[config.head, config.body, config.hair, config.eyes, config.mouth].filter(Boolean).length +
                    config.clothing.length +
                    config.accessories.length}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportJSON}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 py-2.5 text-xs font-semibold text-white transition hover:bg-purple-600"
          >
            <Download className="h-4 w-4" />
            Export Config (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}
