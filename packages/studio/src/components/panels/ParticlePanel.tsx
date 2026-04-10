'use client';
/** ParticlePanel — Particle system preset browser and editor */
import React from 'react';
import { useParticles } from '../../hooks/useParticles';

const PRESET_ICONS: Record<string, string> = { fire: '🔥', snow: '❄️', sparks: '⚡', smoke: '💨' };

export function ParticlePanel() {
  const {
    activeCount,
    isEmitting,
    presetNames,
    particles,
    loadPreset,
    toggleEmitting,
    burst,
    step,
    reset,
  } = useParticles();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">✨ Particles</h3>
        <span
          className={`text-[10px] font-medium ${isEmitting ? 'text-emerald-400' : 'text-studio-muted'}`}
        >
          {activeCount} alive {isEmitting ? '▶' : '⏸'}
        </span>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-4 gap-1.5">
        {presetNames.map((name) => (
          <button
            key={name}
            onClick={() => loadPreset(name)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-studio-panel/40 rounded hover:bg-studio-accent/20 hover:text-studio-accent transition"
          >
            <span className="text-base">{PRESET_ICONS[name] || '✨'}</span>
            <span className="text-[10px] capitalize">{name}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={toggleEmitting}
          className={`px-2 py-1 rounded transition ${isEmitting ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}
        >
          {isEmitting ? '⏸ Pause' : '▶ Emit'}
        </button>
        <button
          onClick={() => burst(30)}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          💥 Burst 30
        </button>
        <button
          onClick={() => step()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⟳ Step
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Particle preview dots */}
      <div className="bg-studio-panel/30 rounded-lg p-2 relative" style={{ height: 120 }}>
        <div className="absolute inset-2">
          {particles.slice(0, 80).map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${Math.max(0, Math.min(100, (p.x + 5) * 10))}%`,
                top: `${Math.max(0, Math.min(100, (1 - p.y / 12) * 100))}%`,
                width: Math.max(2, p.size * 8),
                height: Math.max(2, p.size * 8),
                backgroundColor: `rgba(${Math.round(p.color.r * 255)}, ${Math.round(p.color.g * 255)}, ${Math.round(p.color.b * 255)}, ${p.color.a})`,
              }}
            />
          ))}
        </div>
        {particles.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-studio-muted text-[10px]">
            Select a preset & step
          </span>
        )}
      </div>

      <div className="text-[10px] text-studio-muted flex justify-between">
        <span>{particles.length} rendering</span>
        <span>Click preset → Step to simulate</span>
      </div>
    </div>
  );
}
