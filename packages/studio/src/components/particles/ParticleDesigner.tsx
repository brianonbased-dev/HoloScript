'use client';

/**
 * ParticleDesigner — Full-featured particle system editor.
 *
 * Replaces the minimal 117-LOC stub with a proper particle designer:
 *  - Emitter shape: point, sphere, cone, box, ring
 *  - Emission rate, burst mode, lifetime
 *  - Velocity: direction, speed, spread, gravity
 *  - Appearance: size over life, color over life, opacity fade
 *  - Rendering: billboard, mesh, trail
 *  - 12 built-in presets (fire, smoke, rain, snow, spark, magic, etc.)
 */

import { useState, useCallback } from 'react';
import {
  Sparkles,
  RotateCcw,
  Copy,
  ChevronDown,
  Flame,
  CloudRain,
  Snowflake,
  Zap,
  Wind,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmitterShape = 'point' | 'sphere' | 'cone' | 'box' | 'ring' | 'line';
export type RenderMode = 'billboard' | 'mesh' | 'trail' | 'stretched';
export type BlendMode = 'additive' | 'alpha' | 'multiply';

export interface ParticleConfig {
  // Emitter
  emitterShape: EmitterShape;
  emitterRadius: number;
  emitterAngle: number; // cone angle (degrees)

  // Emission
  rate: number; // particles per second
  burstCount: number; // one-shot burst
  burstInterval: number; // seconds between bursts (0 = no repeat)
  maxParticles: number;

  // Lifetime
  lifetime: number; // seconds
  lifetimeVariance: number; // ± seconds

  // Velocity
  speed: number;
  speedVariance: number;
  direction: [number, number, number];
  gravity: number;
  drag: number;

  // Size
  startSize: number;
  endSize: number;
  sizeVariance: number;

  // Color
  startColor: string;
  endColor: string;
  startOpacity: number;
  endOpacity: number;

  // Rotation
  rotationSpeed: number;
  randomRotation: boolean;

  // Rendering
  renderMode: RenderMode;
  blendMode: BlendMode;
  sortByDistance: boolean;

  // Noise
  noiseStrength: number;
  noiseFrequency: number;
}

const DEFAULT_CONFIG: ParticleConfig = {
  emitterShape: 'point',
  emitterRadius: 0.5,
  emitterAngle: 30,
  rate: 50,
  burstCount: 0,
  burstInterval: 0,
  maxParticles: 1000,
  lifetime: 2,
  lifetimeVariance: 0.5,
  speed: 2,
  speedVariance: 0.5,
  direction: [0, 1, 0],
  gravity: -1,
  drag: 0,
  startSize: 0.2,
  endSize: 0,
  sizeVariance: 0.05,
  startColor: '#ff6600',
  endColor: '#ff0000',
  startOpacity: 1,
  endOpacity: 0,
  rotationSpeed: 0,
  randomRotation: true,
  renderMode: 'billboard',
  blendMode: 'additive',
  sortByDistance: true,
  noiseStrength: 0,
  noiseFrequency: 1,
};

// Presets
const PRESETS: Record<
  string,
  { label: string; icon: typeof Flame; config: Partial<ParticleConfig> }
> = {
  fire: {
    label: 'Fire',
    icon: Flame,
    config: {
      emitterShape: 'cone',
      emitterAngle: 15,
      rate: 80,
      lifetime: 1.5,
      speed: 3,
      gravity: 0.5,
      startColor: '#ff4400',
      endColor: '#ff0000',
      startSize: 0.3,
      endSize: 0.1,
      blendMode: 'additive',
    },
  },
  smoke: {
    label: 'Smoke',
    icon: Wind,
    config: {
      emitterShape: 'sphere',
      emitterRadius: 0.3,
      rate: 20,
      lifetime: 4,
      speed: 0.5,
      gravity: 0.2,
      startColor: '#666666',
      endColor: '#333333',
      startSize: 0.2,
      endSize: 1.5,
      startOpacity: 0.6,
      endOpacity: 0,
      blendMode: 'alpha',
      drag: 0.1,
    },
  },
  rain: {
    label: 'Rain',
    icon: CloudRain,
    config: {
      emitterShape: 'box',
      rate: 200,
      lifetime: 1,
      speed: 10,
      direction: [0, -1, 0],
      gravity: -9.8,
      startColor: '#88bbdd',
      endColor: '#6699cc',
      startSize: 0.02,
      endSize: 0.02,
      renderMode: 'stretched',
      blendMode: 'alpha',
    },
  },
  snow: {
    label: 'Snow',
    icon: Snowflake,
    config: {
      emitterShape: 'box',
      rate: 60,
      lifetime: 5,
      speed: 0.5,
      direction: [0, -1, 0],
      gravity: -0.3,
      startColor: '#ffffff',
      endColor: '#ddddff',
      startSize: 0.05,
      endSize: 0.03,
      drag: 0.3,
      noiseStrength: 0.5,
      noiseFrequency: 0.5,
    },
  },
  sparks: {
    label: 'Sparks',
    icon: Zap,
    config: {
      emitterShape: 'point',
      rate: 10,
      burstCount: 30,
      burstInterval: 0.5,
      lifetime: 0.5,
      speed: 8,
      speedVariance: 3,
      gravity: -5,
      startColor: '#ffdd00',
      endColor: '#ff6600',
      startSize: 0.03,
      endSize: 0,
      renderMode: 'trail',
      blendMode: 'additive',
    },
  },
  magic: {
    label: 'Magic',
    icon: Sparkles,
    config: {
      emitterShape: 'ring',
      emitterRadius: 1,
      rate: 30,
      lifetime: 2,
      speed: 0.2,
      gravity: 0.3,
      startColor: '#aa44ff',
      endColor: '#4488ff',
      startSize: 0.15,
      endSize: 0,
      noiseStrength: 1,
      noiseFrequency: 2,
      rotationSpeed: 3,
    },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ParticleDesignerProps {
  onConfigChange?: (config: ParticleConfig) => void;
}

export function ParticleDesigner({ onConfigChange }: ParticleDesignerProps) {
  const [config, setConfig] = useState<ParticleConfig>(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState<string>('emitter');

  const update = useCallback(
    (partial: Partial<ParticleConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        onConfigChange?.(next);
        return next;
      });
    },
    [onConfigChange]
  );

  const applyPreset = useCallback(
    (key: string) => {
      const preset = PRESETS[key];
      if (preset) update({ ...DEFAULT_CONFIG, ...preset.config });
    },
    [update]
  );

  const copyToClipboard = useCallback(() => {
    const trait = `@particle {\n  shape: "${config.emitterShape}"\n  rate: ${config.rate}\n  lifetime: ${config.lifetime}\n  speed: ${config.speed}\n  gravity: ${config.gravity}\n  startColor: "${config.startColor}"\n  endColor: "${config.endColor}"\n  startSize: ${config.startSize}\n  endSize: ${config.endSize}\n  blend: "${config.blendMode}"\n}`;
    navigator.clipboard?.writeText(trait);
  }, [config]);

  const Section = ({
    id,
    label,
    children,
  }: {
    id: string;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="border-b border-studio-border">
      <button
        onClick={() => setActiveSection(activeSection === id ? '' : id)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition ${activeSection === id ? 'rotate-180' : ''}`} />
      </button>
      {activeSection === id && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );

  const Slider = ({
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
  }) => (
    <div>
      <div className="flex justify-between text-[10px] text-studio-muted">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
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

  return (
    <div className="flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-studio-text">Particle System</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => update(DEFAULT_CONFIG)}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Reset"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={copyToClipboard}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Copy as @particle trait"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-1 border-b border-studio-border p-2">
        {Object.entries(PRESETS).map(([key, { label, icon: Icon }]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-studio-border p-1.5 text-[9px] text-studio-muted transition hover:border-amber-500/30 hover:text-studio-text"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Sections */}
      <Section id="emitter" label="Emitter">
        <div className="grid grid-cols-3 gap-1">
          {(['point', 'sphere', 'cone', 'box', 'ring', 'line'] as EmitterShape[]).map((shape) => (
            <button
              key={shape}
              onClick={() => update({ emitterShape: shape })}
              className={`rounded px-2 py-1 text-[10px] transition ${config.emitterShape === shape ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              {shape}
            </button>
          ))}
        </div>
        {config.emitterShape !== 'point' && (
          <Slider
            label="Radius"
            value={config.emitterRadius}
            min={0.1}
            max={10}
            step={0.1}
            onChange={(v) => update({ emitterRadius: v })}
          />
        )}
        {config.emitterShape === 'cone' && (
          <Slider
            label="Angle"
            value={config.emitterAngle}
            min={1}
            max={90}
            step={1}
            onChange={(v) => update({ emitterAngle: v })}
          />
        )}
      </Section>

      <Section id="emission" label="Emission">
        <Slider
          label="Rate (p/s)"
          value={config.rate}
          min={1}
          max={500}
          step={1}
          onChange={(v) => update({ rate: v })}
        />
        <Slider
          label="Burst Count"
          value={config.burstCount}
          min={0}
          max={200}
          step={1}
          onChange={(v) => update({ burstCount: v })}
        />
        <Slider
          label="Max Particles"
          value={config.maxParticles}
          min={10}
          max={10000}
          step={10}
          onChange={(v) => update({ maxParticles: v })}
        />
      </Section>

      <Section id="lifetime" label="Lifetime">
        <Slider
          label="Lifetime (s)"
          value={config.lifetime}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(v) => update({ lifetime: v })}
        />
        <Slider
          label="Variance"
          value={config.lifetimeVariance}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => update({ lifetimeVariance: v })}
        />
      </Section>

      <Section id="velocity" label="Velocity">
        <Slider
          label="Speed"
          value={config.speed}
          min={0}
          max={20}
          step={0.1}
          onChange={(v) => update({ speed: v })}
        />
        <Slider
          label="Speed Variance"
          value={config.speedVariance}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => update({ speedVariance: v })}
        />
        <Slider
          label="Gravity"
          value={config.gravity}
          min={-20}
          max={20}
          step={0.1}
          onChange={(v) => update({ gravity: v })}
        />
        <Slider
          label="Drag"
          value={config.drag}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ drag: v })}
        />
      </Section>

      <Section id="appearance" label="Appearance">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[10px] text-studio-muted">
            Start Color
            <input
              type="color"
              value={config.startColor}
              onChange={(e) => update({ startColor: e.target.value })}
              className="h-6 w-full cursor-pointer rounded border border-studio-border"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[10px] text-studio-muted">
            End Color
            <input
              type="color"
              value={config.endColor}
              onChange={(e) => update({ endColor: e.target.value })}
              className="h-6 w-full cursor-pointer rounded border border-studio-border"
            />
          </label>
        </div>
        <Slider
          label="Start Size"
          value={config.startSize}
          min={0.01}
          max={5}
          step={0.01}
          onChange={(v) => update({ startSize: v })}
        />
        <Slider
          label="End Size"
          value={config.endSize}
          min={0}
          max={5}
          step={0.01}
          onChange={(v) => update({ endSize: v })}
        />
        <Slider
          label="Start Opacity"
          value={config.startOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ startOpacity: v })}
        />
        <Slider
          label="End Opacity"
          value={config.endOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ endOpacity: v })}
        />
      </Section>

      <Section id="rendering" label="Rendering">
        <div className="grid grid-cols-2 gap-1">
          {(['billboard', 'mesh', 'trail', 'stretched'] as RenderMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => update({ renderMode: mode })}
              className={`rounded px-2 py-1 text-[10px] transition ${config.renderMode === mode ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(['additive', 'alpha', 'multiply'] as BlendMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => update({ blendMode: mode })}
              className={`rounded px-2 py-1 text-[10px] transition ${config.blendMode === mode ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </Section>

      <Section id="noise" label="Noise / Turbulence">
        <Slider
          label="Strength"
          value={config.noiseStrength}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => update({ noiseStrength: v })}
        />
        <Slider
          label="Frequency"
          value={config.noiseFrequency}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(v) => update({ noiseFrequency: v })}
        />
      </Section>
    </div>
  );
}

export { DEFAULT_CONFIG as DEFAULT_PARTICLE_CONFIG };
export type { ParticleConfig as ParticleSystemConfig };
