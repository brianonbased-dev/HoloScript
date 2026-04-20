'use client';

/**
 * MaterialEditor — PBR material editor with presets and texture slots.
 *
 * Features:
 *  - PBR properties: color, roughness, metalness, emissive, opacity
 *  - Texture slots: albedo, normal, roughness, metalness, AO, emissive
 *  - Quick-pick presets from `@holoscript/core/tools` MaterialEditor.getPresets()
 *  - Real-time preview swatch
 *  - Export to @material trait
 */

import { useState, useCallback } from 'react';
import { Palette, Copy, RotateCcw, ChevronDown, ImagePlus } from 'lucide-react';
import {
  getMaterialEditorBuiltinPresets,
  rgbaToHex,
  type MaterialEditorPreset,
} from '@holoscript/core/tools';

export interface MaterialConfig {
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  side: 'front' | 'back' | 'double';
  wireframe: boolean;
  flatShading: boolean;
  // Textures (paths)
  albedoMap: string;
  normalMap: string;
  roughnessMap: string;
  metalnessMap: string;
  aoMap: string;
  emissiveMap: string;
  displacementMap: string;
  displacementScale: number;
  // PBR extras
  clearcoat: number;
  clearcoatRoughness: number;
  sheenColor: string;
  sheenRoughness: number;
}

const DEFAULT_MATERIAL: MaterialConfig = {
  name: 'Default',
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0,
  emissive: '#000000',
  emissiveIntensity: 0,
  opacity: 1,
  transparent: false,
  side: 'front',
  wireframe: false,
  flatShading: false,
  albedoMap: '',
  normalMap: '',
  roughnessMap: '',
  metalnessMap: '',
  aoMap: '',
  emissiveMap: '',
  displacementMap: '',
  displacementScale: 0.1,
  clearcoat: 0,
  clearcoatRoughness: 0.1,
  sheenColor: '#000000',
  sheenRoughness: 0.5,
};

/** Map canonical core {@link MaterialEditorPreset} PBR data into Studio slider state. */
function corePresetToStudioPartial(preset: MaterialEditorPreset): Partial<MaterialConfig> {
  const m = preset.material;
  const albedo = m.albedo ?? { r: 0.8, g: 0.8, b: 0.8, a: 1 };
  const emission = m.emission ?? { r: 0, g: 0, b: 0 };
  const strength = m.emissionStrength ?? 0;
  const blendMode = m.blendMode;
  const opacity = albedo.a ?? 1;
  const transparent = blendMode === 'transparent' || opacity < 0.999;
  return {
    name: preset.name,
    color: rgbaToHex({ r: albedo.r, g: albedo.g, b: albedo.b }),
    roughness: m.roughness ?? DEFAULT_MATERIAL.roughness,
    metalness: m.metallic ?? DEFAULT_MATERIAL.metalness,
    emissive: strength > 0 ? rgbaToHex(emission) : DEFAULT_MATERIAL.emissive,
    emissiveIntensity: strength,
    opacity,
    transparent,
    side: m.doubleSided ? 'double' : DEFAULT_MATERIAL.side,
  };
}

/** Single source of truth: core MaterialEditor built-in presets (kept in sync with tooling). */
const CORE_MATERIAL_PRESETS: MaterialEditorPreset[] = getMaterialEditorBuiltinPresets();

interface MaterialEditorProps {
  onConfigChange?: (config: MaterialConfig) => void;
}

export function MaterialEditor({ onConfigChange }: MaterialEditorProps) {
  const [config, setConfig] = useState<MaterialConfig>(DEFAULT_MATERIAL);
  const [activeSection, setActiveSection] = useState<string>('base');

  const update = useCallback(
    (partial: Partial<MaterialConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        onConfigChange?.(next);
        return next;
      });
    },
    [onConfigChange]
  );

  const applyCorePreset = useCallback(
    (presetName: string) => {
      const preset = CORE_MATERIAL_PRESETS.find((p) => p.name === presetName);
      if (!preset) return;
      update({ ...DEFAULT_MATERIAL, ...corePresetToStudioPartial(preset) });
    },
    [update]
  );

  const copyToClipboard = useCallback(() => {
    const lines = [
      `@material {`,
      `  color: "${config.color}"`,
      `  roughness: ${config.roughness}`,
      `  metalness: ${config.metalness}`,
    ];
    if (config.emissiveIntensity > 0)
      lines.push(
        `  emissive: "${config.emissive}"`,
        `  emissiveIntensity: ${config.emissiveIntensity}`
      );
    if (config.transparent) lines.push(`  opacity: ${config.opacity}`);
    if (config.clearcoat > 0) lines.push(`  clearcoat: ${config.clearcoat}`);
    lines.push('}');
    navigator.clipboard?.writeText(lines.join('\n'));
  }, [config]);

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
        <span className="font-mono">{value.toFixed(2)}</span>
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

  const TextureSlot = ({
    label,
    value,
    _onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] text-studio-muted">{label}</span>
      <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-dashed border-studio-border bg-studio-panel/50 px-2 py-1 text-[10px] text-studio-muted hover:border-studio-accent/40">
        <ImagePlus className="h-3 w-3" />
        {value ? value.split('/').pop() : 'None'}
      </label>
    </div>
  );

  return (
    <div className="flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-pink-400" />
          <span className="text-sm font-semibold text-studio-text">Material Editor</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => update(DEFAULT_MATERIAL)}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Reset"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={copyToClipboard}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Copy @material"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Preview Swatch */}
      <div className="flex items-center gap-3 border-b border-studio-border p-3">
        <div
          className="h-12 w-12 rounded-xl border border-studio-border shadow-inner"
          style={{
            background:
              config.emissiveIntensity > 0
                ? `radial-gradient(circle, ${config.emissive}, ${config.color})`
                : config.color,
            opacity: config.opacity,
            boxShadow: config.emissiveIntensity > 0 ? `0 0 20px ${config.emissive}` : undefined,
          }}
        />
        <div className="text-xs">
          <div className="font-semibold text-studio-text">{config.name}</div>
          <div className="text-studio-muted">
            R:{config.roughness.toFixed(1)} M:{config.metalness.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Presets — labels match core MaterialEditor.getPresets() names */}
      <div className="grid grid-cols-4 gap-1 border-b border-studio-border p-2 sm:grid-cols-5">
        {CORE_MATERIAL_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            title={p.category}
            onClick={() => applyCorePreset(p.name)}
            className="rounded-lg border border-studio-border p-1 text-[9px] text-studio-muted transition hover:border-pink-500/30 hover:text-studio-text"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Sections */}
      <Section id="base" label="Base Properties">
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Color
          <input
            type="color"
            value={config.color}
            onChange={(e) => update({ color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <Slider
          label="Roughness"
          value={config.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ roughness: v })}
        />
        <Slider
          label="Metalness"
          value={config.metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ metalness: v })}
        />
        <Slider
          label="Opacity"
          value={config.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ opacity: v, transparent: v < 1 })}
        />
      </Section>

      <Section id="emissive" label="Emissive">
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Emissive Color
          <input
            type="color"
            value={config.emissive}
            onChange={(e) => update({ emissive: e.target.value })}
            className="h-6 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <Slider
          label="Intensity"
          value={config.emissiveIntensity}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => update({ emissiveIntensity: v })}
        />
      </Section>

      <Section id="advanced" label="Advanced PBR">
        <Slider
          label="Clearcoat"
          value={config.clearcoat}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ clearcoat: v })}
        />
        <Slider
          label="Clearcoat Roughness"
          value={config.clearcoatRoughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ clearcoatRoughness: v })}
        />
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Sheen Color
          <input
            type="color"
            value={config.sheenColor}
            onChange={(e) => update({ sheenColor: e.target.value })}
            className="h-6 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <Slider
          label="Sheen Roughness"
          value={config.sheenRoughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ sheenRoughness: v })}
        />
      </Section>

      <Section id="textures" label="Texture Maps">
        <TextureSlot
          label="Albedo"
          value={config.albedoMap}
          onChange={(v) => update({ albedoMap: v })}
        />
        <TextureSlot
          label="Normal"
          value={config.normalMap}
          onChange={(v) => update({ normalMap: v })}
        />
        <TextureSlot
          label="Roughness"
          value={config.roughnessMap}
          onChange={(v) => update({ roughnessMap: v })}
        />
        <TextureSlot
          label="Metalness"
          value={config.metalnessMap}
          onChange={(v) => update({ metalnessMap: v })}
        />
        <TextureSlot label="AO" value={config.aoMap} onChange={(v) => update({ aoMap: v })} />
        <TextureSlot
          label="Emissive"
          value={config.emissiveMap}
          onChange={(v) => update({ emissiveMap: v })}
        />
        <TextureSlot
          label="Displacement"
          value={config.displacementMap}
          onChange={(v) => update({ displacementMap: v })}
        />
      </Section>

      <Section id="options" label="Options">
        {[
          { label: 'Wireframe', key: 'wireframe' as const },
          { label: 'Flat Shading', key: 'flatShading' as const },
          { label: 'Transparent', key: 'transparent' as const },
        ].map(({ label, key }) => (
          <label
            key={key}
            className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer"
          >
            <input
              type="checkbox"
              checked={config[key]}
              onChange={(e) => update({ [key]: e.target.checked })}
              className="rounded border-studio-border"
            />
            {label}
          </label>
        ))}
        <div className="flex gap-1">
          {(['front', 'back', 'double'] as const).map((side) => (
            <button
              key={side}
              onClick={() => update({ side })}
              className={`flex-1 rounded px-2 py-1 text-[10px] transition ${config.side === side ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              {side}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
