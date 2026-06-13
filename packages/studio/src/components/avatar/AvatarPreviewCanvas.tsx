'use client';

/**
 * AvatarPreviewCanvas
 *
 * Center-viewport rig preview for /create?mode=avatar.
 *
 * Mirrors SimPreviewCanvas / GamePreviewCanvas (isolated, full-bleed center
 * view). The avatar-rig derivation produces a VRM-1.0-shaped bone descriptor,
 * not a runtime mesh, so the preview is a 2D humanoid bone diagram drawn from
 * the derived `humanoid_bones` map — bones that were derived render solid;
 * missing required bones render dimmed so the rig integrity is visible at a
 * glance without bundling @holoscript/engine.
 */

import React from 'react';
import { User, RefreshCw, Download } from 'lucide-react';
import type { AvatarBuildResult } from './useAvatarModeState';

export interface AvatarPreviewCanvasProps {
  result: AvatarBuildResult | null;
  building?: boolean;
}

// Canonical 2D layout for the VRM humanoid bone chain (x,y in a 0..200 / 0..320 box).
const BONE_LAYOUT: Record<string, { x: number; y: number }> = {
  head: { x: 100, y: 30 },
  neck: { x: 100, y: 55 },
  chest: { x: 100, y: 85 },
  spine: { x: 100, y: 120 },
  hips: { x: 100, y: 155 },
  leftUpperArm: { x: 60, y: 90 },
  leftLowerArm: { x: 40, y: 125 },
  leftHand: { x: 30, y: 160 },
  rightUpperArm: { x: 140, y: 90 },
  rightLowerArm: { x: 160, y: 125 },
  rightHand: { x: 170, y: 160 },
  leftUpperLeg: { x: 80, y: 200 },
  leftLowerLeg: { x: 75, y: 250 },
  leftFoot: { x: 72, y: 295 },
  rightUpperLeg: { x: 120, y: 200 },
  rightLowerLeg: { x: 125, y: 250 },
  rightFoot: { x: 128, y: 295 },
};

const BONE_LINKS: Array<[string, string]> = [
  ['head', 'neck'],
  ['neck', 'chest'],
  ['chest', 'spine'],
  ['spine', 'hips'],
  ['chest', 'leftUpperArm'],
  ['leftUpperArm', 'leftLowerArm'],
  ['leftLowerArm', 'leftHand'],
  ['chest', 'rightUpperArm'],
  ['rightUpperArm', 'rightLowerArm'],
  ['rightLowerArm', 'rightHand'],
  ['hips', 'leftUpperLeg'],
  ['leftUpperLeg', 'leftLowerLeg'],
  ['leftLowerLeg', 'leftFoot'],
  ['hips', 'rightUpperLeg'],
  ['rightUpperLeg', 'rightLowerLeg'],
  ['rightLowerLeg', 'rightFoot'],
];

function downloadRig(result: AvatarBuildResult) {
  const json = JSON.stringify(result.rig, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = result.rig.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'avatar';
  a.download = `${safe}-vrm-rig.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AvatarPreviewCanvas({ result, building = false }: AvatarPreviewCanvasProps) {
  const rig = result?.rig ?? null;
  const presentBones = new Set(rig ? Object.keys(rig.humanoid_bones) : []);

  return (
    <div className="relative w-full h-full bg-[#06060c]">
      {/* Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/40 font-mono">
        Rig Preview
        {result && <span className="text-purple-400/70">{result.report.title}</span>}
      </div>

      {/* Ship: download the VRM rig descriptor */}
      {result && (
        <button
          onClick={() => downloadRig(result)}
          title="Download VRM rig descriptor"
          aria-label="Download VRM rig descriptor"
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/60 font-mono transition hover:border-purple-400/40 hover:text-white"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          Export rig
        </button>
      )}

      {!rig ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {building ? (
            <>
              <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-purple-400 animate-spin" />
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                Deriving your rig…
              </div>
            </>
          ) : (
            <>
              <User className="h-10 w-10 text-white/10" aria-hidden="true" />
              <div className="text-xs text-white/30">Build a rig to preview it here…</div>
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 200 330"
            className="h-[88%] max-h-full"
            role="img"
            aria-label={`Humanoid bone diagram for ${rig.name}`}
          >
            {/* Bone links */}
            {BONE_LINKS.map(([a, b]) => {
              const pa = BONE_LAYOUT[a];
              const pb = BONE_LAYOUT[b];
              if (!pa || !pb) return null;
              const active = presentBones.has(a) && presentBones.has(b);
              return (
                <line
                  key={`${a}-${b}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={active ? '#a78bfa' : '#27272a'}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Bone joints */}
            {Object.entries(BONE_LAYOUT).map(([bone, p]) => {
              const active = presentBones.has(bone);
              return (
                <circle
                  key={bone}
                  cx={p.x}
                  cy={p.y}
                  r={active ? 4.5 : 3}
                  fill={active ? '#c4b5fd' : '#3f3f46'}
                  stroke={active ? '#7c3aed' : 'none'}
                  strokeWidth={1}
                >
                  <title>{bone}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      )}

      {/* Expression chips */}
      {rig && rig.expressions.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex max-w-[80%] flex-wrap items-center justify-center gap-1.5">
          {rig.expressions.slice(0, 8).map((e) => (
            <span
              key={e.preset}
              className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 backdrop-blur text-[9px] text-white/50 font-mono"
            >
              {e.preset}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
