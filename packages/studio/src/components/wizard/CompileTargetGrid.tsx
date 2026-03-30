'use client';

import { useEffect, useState, useMemo } from 'react';

// ─── Target Data ─────────────────────────────────────────────────────────────

interface CompileTarget {
  id: string;
  name: string;
  category: 'engine' | 'xr' | 'web' | 'industrial' | 'compute' | 'advanced';
  icon: string;
  status: 'ready' | 'beta' | 'preview';
}

const COMPILE_TARGETS: CompileTarget[] = [
  // Game Engines
  { id: 'unity', name: 'Unity', category: 'engine', icon: 'U', status: 'ready' },
  { id: 'unreal', name: 'Unreal', category: 'engine', icon: 'UE', status: 'ready' },
  { id: 'godot', name: 'Godot', category: 'engine', icon: 'G', status: 'ready' },

  // XR
  { id: 'visionos', name: 'visionOS', category: 'xr', icon: 'VP', status: 'ready' },
  { id: 'openxr', name: 'OpenXR', category: 'xr', icon: 'XR', status: 'ready' },
  { id: 'vrchat', name: 'VRChat', category: 'xr', icon: 'VR', status: 'ready' },
  { id: 'android-xr', name: 'Android XR', category: 'xr', icon: 'AX', status: 'beta' },
  { id: 'webxr', name: 'WebXR', category: 'xr', icon: 'WX', status: 'ready' },
  { id: 'quest', name: 'Quest', category: 'xr', icon: 'Q', status: 'ready' },

  // Web
  { id: 'threejs', name: 'Three.js', category: 'web', icon: '3', status: 'ready' },
  { id: 'r3f', name: 'React 3F', category: 'web', icon: 'R3', status: 'ready' },
  { id: 'babylon', name: 'Babylon', category: 'web', icon: 'BJ', status: 'ready' },
  { id: 'playcanvas', name: 'PlayCanvas', category: 'web', icon: 'PC', status: 'ready' },

  // Industrial
  { id: 'usd', name: 'USD', category: 'industrial', icon: 'US', status: 'ready' },
  { id: 'usdz', name: 'USDZ', category: 'industrial', icon: 'UZ', status: 'ready' },
  { id: 'gltf', name: 'glTF', category: 'industrial', icon: 'GL', status: 'ready' },
  { id: 'dtdl', name: 'DTDL', category: 'industrial', icon: 'DT', status: 'ready' },
  { id: 'mqtt', name: 'MQTT', category: 'industrial', icon: 'MQ', status: 'beta' },
  { id: 'urdf', name: 'URDF', category: 'industrial', icon: 'UR', status: 'beta' },

  // Compute
  { id: 'wasm', name: 'WASM', category: 'compute', icon: 'WA', status: 'ready' },
  { id: 'webgpu', name: 'WebGPU', category: 'compute', icon: 'WG', status: 'ready' },
  { id: 'wgsl', name: 'WGSL', category: 'compute', icon: 'WS', status: 'ready' },
  { id: 'tsl', name: 'TSL', category: 'compute', icon: 'TS', status: 'beta' },

  // Advanced
  { id: 'nir', name: 'NIR', category: 'advanced', icon: 'NI', status: 'preview' },
  { id: 'a2a', name: 'A2A Agent', category: 'advanced', icon: 'A2', status: 'preview' },
  { id: 'vrr', name: 'VRR', category: 'advanced', icon: 'VR', status: 'preview' },
  { id: 'state', name: 'State', category: 'advanced', icon: 'ST', status: 'ready' },
];

const CATEGORY_LABELS: Record<CompileTarget['category'], string> = {
  engine: 'Game Engines',
  xr: 'XR / VR / AR',
  web: 'Web Platforms',
  industrial: 'Industrial / Data',
  compute: 'Compute / Shader',
  advanced: 'Advanced',
};

const CATEGORY_COLORS: Record<CompileTarget['category'], string> = {
  engine: 'from-purple-500 to-purple-600',
  xr: 'from-blue-500 to-blue-600',
  web: 'from-emerald-500 to-emerald-600',
  industrial: 'from-amber-500 to-amber-600',
  compute: 'from-cyan-500 to-cyan-600',
  advanced: 'from-pink-500 to-pink-600',
};

const CATEGORY_GLOW: Record<CompileTarget['category'], string> = {
  engine: 'shadow-purple-500/30',
  xr: 'shadow-blue-500/30',
  web: 'shadow-emerald-500/30',
  industrial: 'shadow-amber-500/30',
  compute: 'shadow-cyan-500/30',
  advanced: 'shadow-pink-500/30',
};

const STATUS_BADGES: Record<CompileTarget['status'], { label: string; color: string }> = {
  ready: { label: '', color: '' }, // No badge for ready
  beta: { label: 'BETA', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  preview: { label: 'PREVIEW', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface CompileTargetGridProps {
  /** Whether to start the cascade reveal animation */
  animate?: boolean;
  /** Delay between each card lighting up (ms) */
  staggerDelay?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CompileTargetGrid -- The "One More Thing" reveal.
 *
 * Animated grid of 27 compile target cards. Each card lights up in sequence
 * with a staggered 50ms delay, creating a cascade reveal effect.
 * Grouped by category: Game Engines, XR, Web, Industrial, Compute, Advanced.
 */
export function CompileTargetGrid({
  animate = false,
  staggerDelay = 50,
  className = '',
}: CompileTargetGridProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  // Group targets by category
  const grouped = useMemo(() => {
    const groups = new Map<CompileTarget['category'], CompileTarget[]>();
    for (const target of COMPILE_TARGETS) {
      const list = groups.get(target.category) ?? [];
      list.push(target);
      groups.set(target.category, list);
    }
    return groups;
  }, []);

  // Cascade reveal animation
  useEffect(() => {
    if (!animate) {
      setRevealedCount(0);
      return;
    }

    let count = 0;
    const total = COMPILE_TARGETS.length;
    const interval = setInterval(() => {
      count++;
      setRevealedCount(count);
      if (count >= total) {
        clearInterval(interval);
      }
    }, staggerDelay);

    return () => clearInterval(interval);
  }, [animate, staggerDelay]);

  // Flat index for stagger tracking
  let flatIndex = 0;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="text-center">
        <p className="text-2xl font-light tracking-tight text-white">One more thing.</p>
        <p className="mt-1 text-sm text-gray-400">
          Your code compiles to{' '}
          <span className="font-semibold text-blue-400">{COMPILE_TARGETS.length} targets</span>{' '}
          simultaneously.
        </p>
      </div>

      {/* Category groups */}
      {Array.from(grouped.entries()).map(([category, targets]) => (
        <div key={category}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {CATEGORY_LABELS[category]}
          </p>
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => {
              const currentIndex = flatIndex++;
              const isRevealed = currentIndex < revealedCount;
              const statusBadge = STATUS_BADGES[target.status];

              return (
                <div
                  key={target.id}
                  className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-400 ease-out ${
                    isRevealed
                      ? `border-white/10 bg-white/[0.04] shadow-lg ${CATEGORY_GLOW[category]} scale-100 opacity-100`
                      : 'border-transparent bg-transparent scale-95 opacity-0'
                  }`}
                  style={{
                    transitionDelay: animate ? `${currentIndex * 20}ms` : '0ms',
                  }}
                >
                  {/* Icon badge */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white ${CATEGORY_COLORS[category]}`}
                  >
                    {target.icon}
                  </div>

                  {/* Name */}
                  <span className="text-xs font-medium text-gray-300 whitespace-nowrap">
                    {target.name}
                  </span>

                  {/* Status badge */}
                  {target.status !== 'ready' && (
                    <span
                      className={`ml-auto rounded border px-1 py-0.5 text-[8px] font-bold tracking-wider ${statusBadge.color}`}
                    >
                      {statusBadge.label}
                    </span>
                  )}

                  {/* Lit-up glow ring */}
                  {isRevealed && (
                    <div
                      className={`absolute -inset-px rounded-lg bg-gradient-to-br opacity-[0.08] ${CATEGORY_COLORS[category]}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Counter */}
      <div className="mt-2 text-center">
        <p className="text-xs text-gray-500">
          {animate && revealedCount > 0 ? (
            <>
              <span className="font-mono text-blue-400">{revealedCount}</span>
              <span className="text-gray-600"> / {COMPILE_TARGETS.length}</span>
              {revealedCount >= COMPILE_TARGETS.length && (
                <span className="ml-2 text-emerald-400">All targets ready</span>
              )}
            </>
          ) : (
            <span className="text-gray-600">Write once. Deploy everywhere.</span>
          )}
        </p>
      </div>
    </div>
  );
}
