'use client';

/**
 * EnvironmentEditor — Skybox, fog, post-processing, ambient settings.
 */

import { useState, useCallback } from 'react';
import { Sun, Moon, Cloud, Droplets, ChevronDown, _Copy, RotateCcw } from 'lucide-react';

export interface EnvironmentConfig {
  skyType: 'color' | 'gradient' | 'hdri' | 'procedural';
  skyColor: string;
  skyColorTop: string;
  skyColorBottom: string;
  sunPosition: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  fogEnabled: boolean;
  fogType: 'linear' | 'exponential';
  fogColor: string;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
  shadowsEnabled: boolean;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  shadowBias: number;
  toneMappingExposure: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
  aoEnabled: boolean;
  aoIntensity: number;
}

const DEFAULT_ENV: EnvironmentConfig = {
  skyType: 'gradient',
  skyColor: '#0a0a12',
  skyColorTop: '#0a0a2e',
  skyColorBottom: '#1a1a3e',
  sunPosition: [50, 100, 50],
  sunIntensity: 3,
  sunColor: '#ffffff',
  ambientIntensity: 0.5,
  ambientColor: '#404060',
  fogEnabled: false,
  fogType: 'linear',
  fogColor: '#0a0a12',
  fogNear: 10,
  fogFar: 100,
  fogDensity: 0.01,
  shadowsEnabled: true,
  shadowMapSize: 2048,
  shadowBias: -0.001,
  toneMappingExposure: 1,
  bloomEnabled: false,
  bloomIntensity: 0.5,
  bloomThreshold: 0.8,
  aoEnabled: false,
  aoIntensity: 0.5,
};

const PRESETS: Record<
  string,
  { label: string; icon: typeof Sun; config: Partial<EnvironmentConfig> }
> = {
  daylight: {
    label: '☀️ Day',
    icon: Sun,
    config: {
      skyType: 'gradient',
      skyColorTop: '#87ceeb',
      skyColorBottom: '#e0f0ff',
      sunIntensity: 5,
      ambientIntensity: 0.8,
      ambientColor: '#aaccff',
    },
  },
  sunset: {
    label: '🌅 Sunset',
    icon: Sun,
    config: {
      skyType: 'gradient',
      skyColorTop: '#1a0a2e',
      skyColorBottom: '#ff6644',
      sunIntensity: 2,
      sunColor: '#ff8844',
      ambientColor: '#cc6644',
    },
  },
  night: {
    label: '🌙 Night',
    icon: Moon,
    config: {
      skyType: 'gradient',
      skyColorTop: '#000011',
      skyColorBottom: '#0a0a2e',
      sunIntensity: 0.3,
      ambientIntensity: 0.2,
      ambientColor: '#223366',
    },
  },
  foggy: {
    label: '🌫️ Fog',
    icon: Cloud,
    config: {
      fogEnabled: true,
      fogType: 'exponential',
      fogColor: '#cccccc',
      fogDensity: 0.03,
      skyType: 'color',
      skyColor: '#cccccc',
    },
  },
  underwater: {
    label: '🌊 Water',
    icon: Droplets,
    config: {
      skyType: 'color',
      skyColor: '#003355',
      ambientColor: '#224488',
      fogEnabled: true,
      fogColor: '#003355',
      fogDensity: 0.05,
      bloomEnabled: true,
      bloomIntensity: 0.3,
    },
  },
};

export function EnvironmentEditor({ onChange }: { onChange?: (c: EnvironmentConfig) => void }) {
  const [config, setConfig] = useState<EnvironmentConfig>(DEFAULT_ENV);
  const [section, setSection] = useState('sky');

  const update = useCallback(
    (p: Partial<EnvironmentConfig>) => {
      setConfig((prev) => {
        const n = { ...prev, ...p };
        onChange?.(n);
        return n;
      });
    },
    [onChange]
  );

  const Sl = ({
    l,
    v,
    mn,
    mx,
    s,
    fn,
  }: {
    l: string;
    v: number;
    mn: number;
    mx: number;
    s: number;
    fn: (v: number) => void;
  }) => (
    <div>
      <div className="flex justify-between text-[10px] text-studio-muted">
        <span>{l}</span>
        <span className="font-mono">{v}</span>
      </div>
      <input
        type="range"
        min={mn}
        max={mx}
        step={s}
        value={v}
        onChange={(e) => fn(parseFloat(e.target.value))}
        className="w-full accent-studio-accent"
      />
    </div>
  );

  const Sec = ({
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
        onClick={() => setSection(section === id ? '' : id)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition ${section === id ? 'rotate-180' : ''}`} />
      </button>
      {section === id && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold text-studio-text">Environment</span>
        </div>
        <button
          onClick={() => update(DEFAULT_ENV)}
          className="rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 border-b border-studio-border p-2">
        {Object.entries(PRESETS).map(([k, { label }]) => (
          <button
            key={k}
            onClick={() => update({ ...DEFAULT_ENV, ...PRESETS[k].config })}
            className="rounded-lg border border-studio-border p-1 text-[9px] text-studio-muted hover:text-studio-text"
          >
            {label}
          </button>
        ))}
      </div>

      <Sec id="sky" label="Sky">
        <div className="grid grid-cols-4 gap-1">
          {(['color', 'gradient', 'hdri', 'procedural'] as const).map((t) => (
            <button
              key={t}
              onClick={() => update({ skyType: t })}
              className={`rounded px-1 py-0.5 text-[10px] ${config.skyType === t ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {config.skyType === 'color' && (
          <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
            Color
            <input
              type="color"
              value={config.skyColor}
              onChange={(e) => update({ skyColor: e.target.value })}
              className="h-6 w-full rounded border border-studio-border cursor-pointer"
            />
          </label>
        )}
        {config.skyType === 'gradient' && (
          <>
            <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
              Top
              <input
                type="color"
                value={config.skyColorTop}
                onChange={(e) => update({ skyColorTop: e.target.value })}
                className="h-6 w-full rounded border border-studio-border cursor-pointer"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
              Bottom
              <input
                type="color"
                value={config.skyColorBottom}
                onChange={(e) => update({ skyColorBottom: e.target.value })}
                className="h-6 w-full rounded border border-studio-border cursor-pointer"
              />
            </label>
          </>
        )}
      </Sec>

      <Sec id="lighting" label="Lighting">
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Sun Color
          <input
            type="color"
            value={config.sunColor}
            onChange={(e) => update({ sunColor: e.target.value })}
            className="h-6 w-full rounded border border-studio-border cursor-pointer"
          />
        </label>
        <Sl
          l="Sun Intensity"
          v={config.sunIntensity}
          mn={0}
          mx={10}
          s={0.1}
          fn={(v) => update({ sunIntensity: v })}
        />
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Ambient Color
          <input
            type="color"
            value={config.ambientColor}
            onChange={(e) => update({ ambientColor: e.target.value })}
            className="h-6 w-full rounded border border-studio-border cursor-pointer"
          />
        </label>
        <Sl
          l="Ambient Intensity"
          v={config.ambientIntensity}
          mn={0}
          mx={3}
          s={0.05}
          fn={(v) => update({ ambientIntensity: v })}
        />
      </Sec>

      <Sec id="fog" label="Fog">
        <label className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer">
          <input
            type="checkbox"
            checked={config.fogEnabled}
            onChange={(e) => update({ fogEnabled: e.target.checked })}
            className="rounded border-studio-border"
          />
          Enable Fog
        </label>
        {config.fogEnabled && (
          <>
            <div className="flex gap-1">
              {(['linear', 'exponential'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ fogType: t })}
                  className={`flex-1 rounded px-2 py-0.5 text-[10px] ${config.fogType === t ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
              Color
              <input
                type="color"
                value={config.fogColor}
                onChange={(e) => update({ fogColor: e.target.value })}
                className="h-6 w-full rounded border border-studio-border cursor-pointer"
              />
            </label>
            {config.fogType === 'linear' ? (
              <>
                <Sl
                  l="Near"
                  v={config.fogNear}
                  mn={0}
                  mx={200}
                  s={1}
                  fn={(v) => update({ fogNear: v })}
                />
                <Sl
                  l="Far"
                  v={config.fogFar}
                  mn={1}
                  mx={500}
                  s={1}
                  fn={(v) => update({ fogFar: v })}
                />
              </>
            ) : (
              <Sl
                l="Density"
                v={config.fogDensity}
                mn={0}
                mx={0.2}
                s={0.001}
                fn={(v) => update({ fogDensity: v })}
              />
            )}
          </>
        )}
      </Sec>

      <Sec id="shadows" label="Shadows">
        <label className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer">
          <input
            type="checkbox"
            checked={config.shadowsEnabled}
            onChange={(e) => update({ shadowsEnabled: e.target.checked })}
            className="rounded border-studio-border"
          />
          Enable Shadows
        </label>
        {config.shadowsEnabled && (
          <>
            <div className="grid grid-cols-4 gap-1">
              {([512, 1024, 2048, 4096] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => update({ shadowMapSize: s })}
                  className={`rounded px-1 py-0.5 text-[9px] ${config.shadowMapSize === s ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Sl
              l="Bias"
              v={config.shadowBias}
              mn={-0.01}
              mx={0.01}
              s={0.0001}
              fn={(v) => update({ shadowBias: v })}
            />
          </>
        )}
      </Sec>

      <Sec id="post" label="Post-Processing">
        <Sl
          l="Exposure"
          v={config.toneMappingExposure}
          mn={0}
          mx={5}
          s={0.05}
          fn={(v) => update({ toneMappingExposure: v })}
        />
        <label className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer">
          <input
            type="checkbox"
            checked={config.bloomEnabled}
            onChange={(e) => update({ bloomEnabled: e.target.checked })}
            className="rounded border-studio-border"
          />
          Bloom
        </label>
        {config.bloomEnabled && (
          <>
            <Sl
              l="Intensity"
              v={config.bloomIntensity}
              mn={0}
              mx={3}
              s={0.05}
              fn={(v) => update({ bloomIntensity: v })}
            />
            <Sl
              l="Threshold"
              v={config.bloomThreshold}
              mn={0}
              mx={2}
              s={0.05}
              fn={(v) => update({ bloomThreshold: v })}
            />
          </>
        )}
        <label className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer">
          <input
            type="checkbox"
            checked={config.aoEnabled}
            onChange={(e) => update({ aoEnabled: e.target.checked })}
            className="rounded border-studio-border"
          />
          Ambient Occlusion
        </label>
        {config.aoEnabled && (
          <Sl
            l="AO Intensity"
            v={config.aoIntensity}
            mn={0}
            mx={3}
            s={0.05}
            fn={(v) => update({ aoIntensity: v })}
          />
        )}
      </Sec>
    </div>
  );
}
