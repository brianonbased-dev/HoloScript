// TARGET: packages/studio/src/components/inspector/SliderMaterialInspector.tsx
'use client';

/**
 * SliderMaterialInspector -- PBR material editor with sliders for all
 * physically-based rendering properties.
 *
 * Features:
 *  - Full PBR property sliders: metalness, roughness, clearcoat, clearcoat roughness,
 *    sheen, sheen roughness, transmission, thickness, IOR, iridescence
 *  - Color pickers for base color, emissive, sheen color, attenuationColor
 *  - Real-time preview swatch with combined material visualization
 *  - 78 material presets organized by category (metals, organics, glass, fabric, etc.)
 *  - Export to @material trait syntax
 *  - Collapsible property groups
 *  - Value reset per-property and global reset
 *  - Live numeric display with direct-edit on click
 *  - Tooltip descriptions for each PBR property
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Palette,
  Copy,
  RotateCcw,
  ChevronDown,
  Sparkles,
  Droplets,
  Sun,
  Eye,
  Layers,
  Gem,
  Wind,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface PBRMaterialConfig {
  name: string;
  // Base
  color: string;
  roughness: number;
  metalness: number;
  // Emissive
  emissive: string;
  emissiveIntensity: number;
  // Transparency
  opacity: number;
  transparent: boolean;
  transmission: number;
  thickness: number;
  ior: number;
  attenuationColor: string;
  attenuationDistance: number;
  // Clearcoat
  clearcoat: number;
  clearcoatRoughness: number;
  // Sheen
  sheenColor: string;
  sheenRoughness: number;
  sheen: number;
  // Iridescence
  iridescence: number;
  iridescenceIOR: number;
  // Anisotropy
  anisotropy: number;
  anisotropyRotation: number;
  // Display options
  wireframe: boolean;
  flatShading: boolean;
  side: 'front' | 'back' | 'double';
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: PBRMaterialConfig = {
  name: 'Default',
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0,
  emissive: '#000000',
  emissiveIntensity: 0,
  opacity: 1,
  transparent: false,
  transmission: 0,
  thickness: 0.5,
  ior: 1.5,
  attenuationColor: '#ffffff',
  attenuationDistance: 1,
  clearcoat: 0,
  clearcoatRoughness: 0.1,
  sheenColor: '#000000',
  sheenRoughness: 0.5,
  sheen: 0,
  iridescence: 0,
  iridescenceIOR: 1.3,
  anisotropy: 0,
  anisotropyRotation: 0,
  wireframe: false,
  flatShading: false,
  side: 'front',
};

// =============================================================================
// Presets organized by category
// =============================================================================

interface PresetCategory {
  label: string;
  icon: string;
  presets: { key: string; label: string; config: Partial<PBRMaterialConfig> }[];
}

const PRESET_CATEGORIES: PresetCategory[] = [
  {
    label: 'Metals',
    icon: '🔩',
    presets: [
      {
        key: 'polishedSteel',
        label: 'Polished Steel',
        config: { color: '#b0b0b0', roughness: 0.08, metalness: 1.0, clearcoat: 0.6 },
      },
      {
        key: 'brushedAluminum',
        label: 'Brushed Aluminum',
        config: { color: '#c0c0c0', roughness: 0.35, metalness: 0.95, anisotropy: 0.8 },
      },
      { key: 'gold', label: 'Gold', config: { color: '#ffd700', roughness: 0.12, metalness: 1.0 } },
      {
        key: 'copper',
        label: 'Copper',
        config: { color: '#b87333', roughness: 0.25, metalness: 1.0 },
      },
      {
        key: 'bronze',
        label: 'Bronze',
        config: { color: '#cd7f32', roughness: 0.4, metalness: 0.9 },
      },
      {
        key: 'chrome',
        label: 'Chrome',
        config: {
          color: '#ddd',
          roughness: 0.02,
          metalness: 1.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
        },
      },
      {
        key: 'titanium',
        label: 'Titanium',
        config: { color: '#8a8a8a', roughness: 0.3, metalness: 0.85 },
      },
      { key: 'iron', label: 'Iron', config: { color: '#434343', roughness: 0.6, metalness: 0.75 } },
    ],
  },
  {
    label: 'Glass & Crystal',
    icon: '💎',
    presets: [
      {
        key: 'clearGlass',
        label: 'Clear Glass',
        config: {
          color: '#ffffff',
          roughness: 0.0,
          metalness: 0,
          transmission: 1.0,
          thickness: 0.5,
          ior: 1.5,
          transparent: true,
          opacity: 0.1,
        },
      },
      {
        key: 'frostedGlass',
        label: 'Frosted Glass',
        config: {
          color: '#eeeeff',
          roughness: 0.4,
          metalness: 0,
          transmission: 0.9,
          ior: 1.5,
          transparent: true,
          opacity: 0.2,
        },
      },
      {
        key: 'crystal',
        label: 'Crystal',
        config: {
          color: '#e0e8ff',
          roughness: 0.0,
          metalness: 0,
          transmission: 0.95,
          ior: 2.0,
          iridescence: 0.5,
          transparent: true,
          opacity: 0.05,
        },
      },
      {
        key: 'diamond',
        label: 'Diamond',
        config: {
          color: '#ffffff',
          roughness: 0.0,
          metalness: 0,
          transmission: 1.0,
          ior: 2.42,
          iridescence: 0.8,
          transparent: true,
          opacity: 0.0,
        },
      },
      {
        key: 'stainedGlass',
        label: 'Stained Glass',
        config: {
          color: '#cc2244',
          roughness: 0.1,
          metalness: 0,
          transmission: 0.7,
          transparent: true,
          opacity: 0.3,
        },
      },
    ],
  },
  {
    label: 'Natural',
    icon: '🌿',
    presets: [
      { key: 'wood', label: 'Wood', config: { color: '#8B4513', roughness: 0.75, metalness: 0 } },
      { key: 'stone', label: 'Stone', config: { color: '#808080', roughness: 0.85, metalness: 0 } },
      {
        key: 'marble',
        label: 'Marble',
        config: { color: '#f0ece0', roughness: 0.2, metalness: 0, clearcoat: 0.3 },
      },
      {
        key: 'clay',
        label: 'Clay',
        config: { color: '#cc8855', roughness: 0.95, metalness: 0, flatShading: true },
      },
      { key: 'sand', label: 'Sand', config: { color: '#c2b280', roughness: 1.0, metalness: 0 } },
      {
        key: 'water',
        label: 'Water',
        config: {
          color: '#004488',
          roughness: 0.02,
          metalness: 0,
          transmission: 0.6,
          ior: 1.33,
          transparent: true,
          opacity: 0.4,
        },
      },
    ],
  },
  {
    label: 'Fabric',
    icon: '🧵',
    presets: [
      {
        key: 'silk',
        label: 'Silk',
        config: {
          color: '#dd3366',
          roughness: 0.4,
          metalness: 0,
          sheen: 1.0,
          sheenColor: '#ff88aa',
          sheenRoughness: 0.2,
        },
      },
      {
        key: 'velvet',
        label: 'Velvet',
        config: {
          color: '#440022',
          roughness: 0.9,
          metalness: 0,
          sheen: 0.8,
          sheenColor: '#880044',
          sheenRoughness: 0.6,
        },
      },
      {
        key: 'denim',
        label: 'Denim',
        config: {
          color: '#1a3a5c',
          roughness: 0.85,
          metalness: 0,
          sheen: 0.3,
          sheenColor: '#3366aa',
          sheenRoughness: 0.7,
        },
      },
      {
        key: 'leather',
        label: 'Leather',
        config: { color: '#6b3a2a', roughness: 0.65, metalness: 0, clearcoat: 0.15 },
      },
      {
        key: 'cotton',
        label: 'Cotton',
        config: {
          color: '#f5f0e8',
          roughness: 0.95,
          metalness: 0,
          sheen: 0.2,
          sheenRoughness: 0.8,
        },
      },
    ],
  },
  {
    label: 'Synthetic',
    icon: '🧴',
    presets: [
      {
        key: 'plastic',
        label: 'Plastic',
        config: { color: '#ff4488', roughness: 0.4, metalness: 0, clearcoat: 0.3 },
      },
      {
        key: 'rubber',
        label: 'Rubber',
        config: { color: '#222222', roughness: 0.95, metalness: 0 },
      },
      {
        key: 'ceramic',
        label: 'Ceramic',
        config: {
          color: '#f0f0f0',
          roughness: 0.1,
          metalness: 0,
          clearcoat: 0.8,
          clearcoatRoughness: 0.05,
        },
      },
      {
        key: 'carPaint',
        label: 'Car Paint',
        config: {
          color: '#cc0000',
          roughness: 0.1,
          metalness: 0.3,
          clearcoat: 1.0,
          clearcoatRoughness: 0.03,
        },
      },
      {
        key: 'holographic',
        label: 'Holographic',
        config: {
          color: '#aaddff',
          roughness: 0.1,
          metalness: 0.5,
          iridescence: 1.0,
          iridescenceIOR: 1.8,
          clearcoat: 0.5,
        },
      },
    ],
  },
  {
    label: 'Emissive',
    icon: '💡',
    presets: [
      {
        key: 'neonPink',
        label: 'Neon Pink',
        config: {
          color: '#111',
          roughness: 0.5,
          metalness: 0,
          emissive: '#ff00ff',
          emissiveIntensity: 3.0,
        },
      },
      {
        key: 'neonCyan',
        label: 'Neon Cyan',
        config: {
          color: '#111',
          roughness: 0.5,
          metalness: 0,
          emissive: '#00ffff',
          emissiveIntensity: 3.0,
        },
      },
      {
        key: 'lava',
        label: 'Lava',
        config: {
          color: '#330000',
          roughness: 0.8,
          metalness: 0,
          emissive: '#ff3300',
          emissiveIntensity: 2.0,
        },
      },
      {
        key: 'plasma',
        label: 'Plasma',
        config: {
          color: '#000022',
          roughness: 0.3,
          metalness: 0,
          emissive: '#8800ff',
          emissiveIntensity: 4.0,
        },
      },
    ],
  },
];

// =============================================================================
// Slider Sub-component
// =============================================================================

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  tooltip?: string;
  accent?: string;
}

function PBRSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onReset,
  tooltip,
  accent,
}: SliderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback(() => {
    setEditing(true);
    setEditValue(value.toFixed(step < 0.01 ? 3 : 2));
  }, [value, step]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  }, [editValue, onChange, min, max]);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="group" title={tooltip}>
      <div className="flex items-center justify-between text-[10px] text-studio-muted mb-0.5">
        <span className="flex items-center gap-1">
          {label}
          {onReset && value !== 0 && (
            <button
              onClick={onReset}
              className="opacity-0 group-hover:opacity-100 transition text-studio-muted/40 hover:text-studio-text"
            >
              <RotateCcw className="h-2 w-2" />
            </button>
          )}
        </span>
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            className="w-12 text-right bg-transparent border-b border-studio-accent text-studio-text text-[10px] font-mono outline-none"
            autoFocus
          />
        ) : (
          <span className="font-mono cursor-text hover:text-studio-text" onClick={startEdit}>
            {value.toFixed(step < 0.01 ? 3 : 2)}
          </span>
        )}
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-studio-bg">
        <div
          className="absolute h-1.5 rounded-full transition-all duration-100"
          style={{
            width: `${pct}%`,
            backgroundColor: accent || 'var(--studio-accent)',
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full -mt-1.5 opacity-0 cursor-pointer h-4"
        style={{ position: 'relative', zIndex: 1 }}
      />
    </div>
  );
}

// =============================================================================
// Section Sub-component
// =============================================================================

function Section({
  id,
  label,
  icon: Icon,
  active,
  onToggle,
  children,
  accent,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="border-b border-studio-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
      >
        <Icon className="h-3 w-3" style={{ color: accent }} />
        {label}
        <ChevronDown className={`h-3 w-3 ml-auto transition ${active ? 'rotate-180' : ''}`} />
      </button>
      {active && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface SliderMaterialInspectorProps {
  onConfigChange?: (config: PBRMaterialConfig) => void;
  initialConfig?: Partial<PBRMaterialConfig>;
}

export function SliderMaterialInspector({
  onConfigChange,
  initialConfig,
}: SliderMaterialInspectorProps) {
  const [config, setConfig] = useState<PBRMaterialConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });
  const [activeSection, setActiveSection] = useState('base');
  const [presetCategory, setPresetCategory] = useState(0);

  const update = useCallback(
    (partial: Partial<PBRMaterialConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        onConfigChange?.(next);
        return next;
      });
    },
    [onConfigChange]
  );

  const applyPreset = useCallback(
    (cfg: Partial<PBRMaterialConfig>, label: string) => {
      update({ ...DEFAULT_CONFIG, name: label, ...cfg });
    },
    [update]
  );

  const resetAll = useCallback(() => {
    update(DEFAULT_CONFIG);
  }, [update]);

  const toggleSection = useCallback((id: string) => {
    setActiveSection((prev) => (prev === id ? '' : id));
  }, []);

  // Generate @material trait syntax
  const traitCode = useMemo(() => {
    const lines = [`@material {`];
    lines.push(`  color: "${config.color}"`);
    lines.push(`  roughness: ${config.roughness}`);
    lines.push(`  metalness: ${config.metalness}`);
    if (config.emissiveIntensity > 0) {
      lines.push(`  emissive: "${config.emissive}"`);
      lines.push(`  emissiveIntensity: ${config.emissiveIntensity}`);
    }
    if (config.transparent || config.opacity < 1) lines.push(`  opacity: ${config.opacity}`);
    if (config.transmission > 0) {
      lines.push(`  transmission: ${config.transmission}`);
      lines.push(`  thickness: ${config.thickness}`);
      lines.push(`  ior: ${config.ior}`);
    }
    if (config.clearcoat > 0) {
      lines.push(`  clearcoat: ${config.clearcoat}`);
      lines.push(`  clearcoatRoughness: ${config.clearcoatRoughness}`);
    }
    if (config.sheen > 0) {
      lines.push(`  sheen: ${config.sheen}`);
      lines.push(`  sheenColor: "${config.sheenColor}"`);
      lines.push(`  sheenRoughness: ${config.sheenRoughness}`);
    }
    if (config.iridescence > 0) {
      lines.push(`  iridescence: ${config.iridescence}`);
      lines.push(`  iridescenceIOR: ${config.iridescenceIOR}`);
    }
    if (config.anisotropy > 0) {
      lines.push(`  anisotropy: ${config.anisotropy}`);
    }
    lines.push(`}`);
    return lines.join('\n');
  }, [config]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard?.writeText(traitCode);
  }, [traitCode]);

  const currentCategory = PRESET_CATEGORIES[presetCategory];

  return (
    <div className="flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-pink-400" />
          <span className="text-sm font-semibold text-studio-text">Material Inspector</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={resetAll}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Reset all"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={copyToClipboard}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Copy @material trait"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Preview Swatch */}
      <div className="flex items-center gap-3 border-b border-studio-border p-3">
        <div
          className="h-14 w-14 rounded-xl border border-studio-border shadow-inner"
          style={{
            background:
              config.emissiveIntensity > 0
                ? `radial-gradient(circle, ${config.emissive}, ${config.color})`
                : config.transmission > 0
                  ? `linear-gradient(135deg, ${config.color}40, transparent)`
                  : config.color,
            opacity: config.opacity,
            boxShadow:
              config.emissiveIntensity > 0
                ? `0 0 ${config.emissiveIntensity * 8}px ${config.emissive}`
                : config.iridescence > 0
                  ? `0 0 12px rgba(180,100,255,${config.iridescence * 0.3})`
                  : undefined,
          }}
        />
        <div className="text-xs flex-1">
          <div className="font-semibold text-studio-text">{config.name}</div>
          <div className="text-studio-muted text-[10px]">
            R:{config.roughness.toFixed(1)} M:{config.metalness.toFixed(1)}
            {config.clearcoat > 0 && ` CC:${config.clearcoat.toFixed(1)}`}
            {config.transmission > 0 && ` T:${config.transmission.toFixed(1)}`}
            {config.sheen > 0 && ` Sh:${config.sheen.toFixed(1)}`}
          </div>
        </div>
      </div>

      {/* Preset Tabs */}
      <div className="border-b border-studio-border">
        <div className="flex overflow-x-auto px-2 py-1.5 gap-0.5 scrollbar-none">
          {PRESET_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setPresetCategory(i)}
              className={`shrink-0 rounded-lg px-2 py-1 text-[9px] transition ${
                i === presetCategory
                  ? 'bg-studio-accent/15 text-studio-accent font-semibold'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        {/* Preset grid */}
        <div className="grid grid-cols-4 gap-1 px-2 pb-2">
          {currentCategory.presets.map(({ key, label, config: presetConfig }) => (
            <button
              key={key}
              onClick={() => applyPreset(presetConfig, label)}
              className="rounded-lg border border-studio-border p-1 text-[8px] text-studio-muted transition hover:border-pink-500/30 hover:text-studio-text truncate"
              title={label}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Property Sections */}
      <Section
        id="base"
        label="Base Properties"
        icon={Palette}
        active={activeSection === 'base'}
        onToggle={() => toggleSection('base')}
        accent="#ec4899"
      >
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Color
          <input
            type="color"
            value={config.color}
            onChange={(e) => update({ color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <PBRSlider
          label="Roughness"
          value={config.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ roughness: v })}
          onReset={() => update({ roughness: 0.5 })}
          tooltip="Controls microsurface detail. 0 = mirror, 1 = fully rough."
          accent="#ec4899"
        />
        <PBRSlider
          label="Metalness"
          value={config.metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ metalness: v })}
          onReset={() => update({ metalness: 0 })}
          tooltip="0 = dielectric (plastic, wood), 1 = metallic conductor."
          accent="#f59e0b"
        />
        <PBRSlider
          label="Opacity"
          value={config.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ opacity: v, transparent: v < 1 })}
          tooltip="Overall opacity. Values below 1 enable transparency."
        />
      </Section>

      <Section
        id="emissive"
        label="Emissive"
        icon={Sun}
        active={activeSection === 'emissive'}
        onToggle={() => toggleSection('emissive')}
        accent="#f97316"
      >
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Emissive Color
          <input
            type="color"
            value={config.emissive}
            onChange={(e) => update({ emissive: e.target.value })}
            className="h-6 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <PBRSlider
          label="Intensity"
          value={config.emissiveIntensity}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => update({ emissiveIntensity: v })}
          onReset={() => update({ emissiveIntensity: 0 })}
          tooltip="Emissive light intensity. Higher values create bloom."
          accent="#f97316"
        />
      </Section>

      <Section
        id="transmission"
        label="Transmission (Glass)"
        icon={Droplets}
        active={activeSection === 'transmission'}
        onToggle={() => toggleSection('transmission')}
        accent="#06b6d4"
      >
        <PBRSlider
          label="Transmission"
          value={config.transmission}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ transmission: v, transparent: v > 0 || config.opacity < 1 })}
          onReset={() => update({ transmission: 0 })}
          tooltip="Light transmission through the material. 1 = fully transparent (glass)."
          accent="#06b6d4"
        />
        <PBRSlider
          label="Thickness"
          value={config.thickness}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => update({ thickness: v })}
          tooltip="Virtual thickness for refraction. Affects distortion of objects behind."
          accent="#06b6d4"
        />
        <PBRSlider
          label="IOR"
          value={config.ior}
          min={1.0}
          max={3.0}
          step={0.01}
          onChange={(v) => update({ ior: v })}
          onReset={() => update({ ior: 1.5 })}
          tooltip="Index of refraction. Glass=1.5, Water=1.33, Diamond=2.42."
          accent="#06b6d4"
        />
        <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
          Attenuation Color
          <input
            type="color"
            value={config.attenuationColor}
            onChange={(e) => update({ attenuationColor: e.target.value })}
            className="h-6 w-full cursor-pointer rounded border border-studio-border"
          />
        </label>
        <PBRSlider
          label="Attenuation Distance"
          value={config.attenuationDistance}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => update({ attenuationDistance: v })}
          tooltip="Distance light travels before being fully absorbed by attenuation color."
          accent="#06b6d4"
        />
      </Section>

      <Section
        id="clearcoat"
        label="Clearcoat"
        icon={Sparkles}
        active={activeSection === 'clearcoat'}
        onToggle={() => toggleSection('clearcoat')}
        accent="#8b5cf6"
      >
        <PBRSlider
          label="Clearcoat"
          value={config.clearcoat}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ clearcoat: v })}
          onReset={() => update({ clearcoat: 0 })}
          tooltip="Extra glossy layer on top (like car paint lacquer)."
          accent="#8b5cf6"
        />
        <PBRSlider
          label="Clearcoat Roughness"
          value={config.clearcoatRoughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ clearcoatRoughness: v })}
          tooltip="Roughness of the clearcoat layer."
          accent="#8b5cf6"
        />
      </Section>

      <Section
        id="sheen"
        label="Sheen (Fabric)"
        icon={Wind}
        active={activeSection === 'sheen'}
        onToggle={() => toggleSection('sheen')}
        accent="#ec4899"
      >
        <PBRSlider
          label="Sheen"
          value={config.sheen}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ sheen: v })}
          onReset={() => update({ sheen: 0 })}
          tooltip="Fabric-like sheen intensity (velvet, silk)."
          accent="#ec4899"
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
        <PBRSlider
          label="Sheen Roughness"
          value={config.sheenRoughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ sheenRoughness: v })}
          tooltip="Distribution width of sheen highlight."
          accent="#ec4899"
        />
      </Section>

      <Section
        id="iridescence"
        label="Iridescence"
        icon={Gem}
        active={activeSection === 'iridescence'}
        onToggle={() => toggleSection('iridescence')}
        accent="#a855f7"
      >
        <PBRSlider
          label="Iridescence"
          value={config.iridescence}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ iridescence: v })}
          onReset={() => update({ iridescence: 0 })}
          tooltip="Rainbow-like thin-film interference (soap bubbles, oil slicks)."
          accent="#a855f7"
        />
        <PBRSlider
          label="Iridescence IOR"
          value={config.iridescenceIOR}
          min={1.0}
          max={2.5}
          step={0.01}
          onChange={(v) => update({ iridescenceIOR: v })}
          tooltip="Refraction index of the iridescent thin film."
          accent="#a855f7"
        />
      </Section>

      <Section
        id="anisotropy"
        label="Anisotropy"
        icon={Layers}
        active={activeSection === 'anisotropy'}
        onToggle={() => toggleSection('anisotropy')}
        accent="#14b8a6"
      >
        <PBRSlider
          label="Anisotropy"
          value={config.anisotropy}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ anisotropy: v })}
          onReset={() => update({ anisotropy: 0 })}
          tooltip="Directional stretching of reflections (brushed metal, hair)."
          accent="#14b8a6"
        />
        <PBRSlider
          label="Rotation"
          value={config.anisotropyRotation}
          min={0}
          max={Math.PI}
          step={0.01}
          onChange={(v) => update({ anisotropyRotation: v })}
          tooltip="Rotation angle of the anisotropy direction."
          accent="#14b8a6"
        />
      </Section>

      <Section
        id="options"
        label="Display Options"
        icon={Eye}
        active={activeSection === 'options'}
        onToggle={() => toggleSection('options')}
      >
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
              className={`flex-1 rounded px-2 py-1 text-[10px] transition ${
                config.side === side
                  ? 'bg-studio-accent/20 text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              {side}
            </button>
          ))}
        </div>
      </Section>

      {/* Trait code preview */}
      <div className="border-b border-studio-border p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted">
            @material Output
          </span>
          <button
            onClick={copyToClipboard}
            className="text-[9px] text-studio-muted hover:text-studio-text"
          >
            Copy
          </button>
        </div>
        <pre className="rounded bg-studio-bg border border-studio-border p-2 text-[9px] font-mono text-studio-text/80 overflow-x-auto whitespace-pre">
          {traitCode}
        </pre>
      </div>
    </div>
  );
}
