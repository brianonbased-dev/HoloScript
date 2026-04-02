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
 *  - Material presets organized by category (metals, organics, glass, fabric, etc.)
 *  - Export to @material trait syntax
 *  - Collapsible property groups
 *  - Value reset per-property and global reset
 *  - Live numeric display with direct-edit on click
 *  - Tooltip descriptions for each PBR property
 */

import { useState, useCallback, useMemo } from 'react';
import { Palette, Copy, RotateCcw } from 'lucide-react';

import { PBRMaterialConfig } from './types';
import { DEFAULT_CONFIG, PRESET_CATEGORIES } from './constants';
import {
  BasePropertiesPanel,
  EmissivePanel,
  TransmissionPanel,
  ClearcoatPanel,
  SheenPanel,
  IridescencePanel,
  AnisotropyPanel,
  DisplayOptionsPanel,
} from './MaterialPropertyPanels';

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
      <BasePropertiesPanel
        config={config}
        update={update}
        active={activeSection === 'base'}
        onToggle={() => toggleSection('base')}
      />
      <EmissivePanel
        config={config}
        update={update}
        active={activeSection === 'emissive'}
        onToggle={() => toggleSection('emissive')}
      />
      <TransmissionPanel
        config={config}
        update={update}
        active={activeSection === 'transmission'}
        onToggle={() => toggleSection('transmission')}
      />
      <ClearcoatPanel
        config={config}
        update={update}
        active={activeSection === 'clearcoat'}
        onToggle={() => toggleSection('clearcoat')}
      />
      <SheenPanel
        config={config}
        update={update}
        active={activeSection === 'sheen'}
        onToggle={() => toggleSection('sheen')}
      />
      <IridescencePanel
        config={config}
        update={update}
        active={activeSection === 'iridescence'}
        onToggle={() => toggleSection('iridescence')}
      />
      <AnisotropyPanel
        config={config}
        update={update}
        active={activeSection === 'anisotropy'}
        onToggle={() => toggleSection('anisotropy')}
      />
      <DisplayOptionsPanel
        config={config}
        update={update}
        active={activeSection === 'options'}
        onToggle={() => toggleSection('options')}
      />

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
