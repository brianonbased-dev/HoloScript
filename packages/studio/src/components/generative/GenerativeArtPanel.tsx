'use client';

/**
 * GenerativeArtPanel — full-screen generative art surface.
 *
 * Layout:
 *  Left:   6-preset picker grid
 *  Center: live R3F canvas (ParticleSystem + shader node preview)
 *  Right:  parameter sliders for the active preset's particle system
 */

import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { GENERATIVE_PRESETS } from './GenerativePresets';
import type { GenerativePreset } from './GenerativePresets';
import { ParticleSystem } from './ParticleSystem';
import { useNodeGraphStore } from '@/lib/nodeGraphStore';
import type { GNode } from '@/lib/nodeGraphStore';

// ─── Preset Card ──────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  isActive,
  onClick,
}: {
  preset: GenerativePreset;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-2 text-left transition hover:scale-[1.02] ${
        isActive
          ? 'border-studio-accent bg-studio-accent/10'
          : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'
      }`}
    >
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="text-base">{preset.emoji}</span>
        <span
          className="text-[10px] font-bold"
          style={{ color: isActive ? preset.accentColor : undefined }}
        >
          {preset.name}
        </span>
      </div>
      <p className="text-[9px] leading-relaxed text-studio-muted line-clamp-2">
        {preset.description}
      </p>
    </button>
  );
}

// ─── Parameter slider ─────────────────────────────────────────────────────────

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-studio-muted">{label}</span>
        <span className="font-mono text-[9px] text-studio-text">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-studio-accent"
      />
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function GenerativeArtPanel() {
  const [activePresetId, setActivePresetId]   = useState('aurora');
  const [particleCount,  setParticleCount]    = useState(0);
  const [speed,          setSpeed]            = useState(0);
  const [spread,         setSpread]           = useState(0);
  const [lifetime,       setLifetime]         = useState(0);

  const setNodes = useNodeGraphStore((s) => s.setNodes);
  const setEdges = useNodeGraphStore((s) => s.setEdges);

  const activePreset = useMemo(
    () => GENERATIVE_PRESETS.find((p) => p.id === activePresetId)!,
    [activePresetId]
  );

  const loadPreset = (preset: GenerativePreset) => {
    setActivePresetId(preset.id);
    setNodes(preset.nodes as unknown as GNode[]);
    setEdges(preset.edges);
    const p = preset.particles;
    if (p) {
      setParticleCount(p.count);
      setSpeed(p.speed);
      setSpread(p.spread);
      setLifetime(p.lifetime);
    }
  };

  // Load first preset on mount
  useMemo(() => {
    const p = GENERATIVE_PRESETS.find((x) => x.id === activePresetId);
    if (p) loadPreset(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const particleParams = activePreset?.particles;

  return (
    <div className="flex h-full overflow-hidden bg-[#05050f]">

      {/* ── Left: Preset picker ── */}
      <div className="flex w-40 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-studio-border p-2">
        <h2 className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-studio-muted">
          🎨 Presets
        </h2>
        {GENERATIVE_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isActive={preset.id === activePresetId}
            onClick={() => loadPreset(preset)}
          />
        ))}
      </div>

      {/* ── Center: Live preview ── */}
      <div className="relative flex-1">
        {/* Label */}
        <div className="absolute left-2 top-2 z-10 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
          {activePreset.emoji} {activePreset.name} — Live Preview
        </div>

        <Canvas
          camera={{ position: [0, 0, 5], fov: 60 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: '#05050f' }}
        >
          <ambientLight intensity={0.3} />
          <Stars radius={80} depth={50} count={3000} factor={3} fade />
          {particleCount > 0 && (
            <ParticleSystem
              count={particleCount}
              speed={speed}
              spread={spread}
              colorA={activePreset.particles?.colorA ?? '#ffffff'}
              colorB={activePreset.particles?.colorB ?? '#888888'}
              lifetime={lifetime}
            />
          )}
          <OrbitControls enableZoom enablePan={false} autoRotate autoRotateSpeed={0.4} />
        </Canvas>
      </div>

      {/* ── Right: Parameters ── */}
      <div className="flex w-44 shrink-0 flex-col gap-2 overflow-y-auto border-l border-studio-border p-3">
        <h2 className="text-[9px] font-bold uppercase tracking-widest text-studio-muted">
          ⚙️ Parameters
        </h2>

        {particleParams ? (
          <>
            <ParamSlider label="Particles" value={particleCount} min={500} max={50000} step={500} onChange={setParticleCount} />
            <ParamSlider label="Speed"     value={speed}         min={0.01} max={3.0}   step={0.01} onChange={setSpeed} />
            <ParamSlider label="Spread"    value={spread}        min={0.2}  max={5.0}   step={0.1}  onChange={setSpread} />
            <ParamSlider label="Lifetime"  value={lifetime}      min={0.5}  max={10.0}  step={0.1}  onChange={setLifetime} />

            {/* Color swatches (read-only) */}
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-widest text-studio-muted">Colors</div>
              <div className="flex gap-1.5">
                <div className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: particleParams.colorA }} title="Color A" />
                <div className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: particleParams.colorB }} title="Color B" />
              </div>
            </div>
          </>
        ) : (
          <p className="text-[9px] text-studio-muted">Select a preset to see parameters.</p>
        )}

        {/* Node graph badge */}
        <div className="mt-auto rounded border border-studio-border bg-studio-surface p-1.5 text-[9px] text-studio-muted">
          🔗 Shader graph pre-wired. Switch to <strong className="text-studio-text">Node Graph</strong> tab to modify.
        </div>
      </div>
    </div>
  );
}
