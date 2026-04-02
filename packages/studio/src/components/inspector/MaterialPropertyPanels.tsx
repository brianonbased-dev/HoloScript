import React from 'react';
import { Palette, Sun, Droplets, Sparkles, Wind, Gem, Layers, Eye } from 'lucide-react';
import { PBRMaterialConfig } from './types';
import { PBRSlider, Section } from './SliderUI';

export interface BasePanelProps {
  config: PBRMaterialConfig;
  update: (partial: Partial<PBRMaterialConfig>) => void;
  active: boolean;
  onToggle: () => void;
}

export function BasePropertiesPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="base"
      label="Base Properties"
      icon={Palette}
      active={active}
      onToggle={onToggle}
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
  );
}

export function EmissivePanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="emissive"
      label="Emissive"
      icon={Sun}
      active={active}
      onToggle={onToggle}
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
  );
}

export function TransmissionPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="transmission"
      label="Transmission (Glass)"
      icon={Droplets}
      active={active}
      onToggle={onToggle}
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
  );
}

export function ClearcoatPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="clearcoat"
      label="Clearcoat"
      icon={Sparkles}
      active={active}
      onToggle={onToggle}
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
  );
}

export function SheenPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="sheen"
      label="Sheen (Fabric)"
      icon={Wind}
      active={active}
      onToggle={onToggle}
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
  );
}

export function IridescencePanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="iridescence"
      label="Iridescence"
      icon={Gem}
      active={active}
      onToggle={onToggle}
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
  );
}

export function AnisotropyPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="anisotropy"
      label="Anisotropy"
      icon={Layers}
      active={active}
      onToggle={onToggle}
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
  );
}

export function DisplayOptionsPanel({ config, update, active, onToggle }: BasePanelProps) {
  return (
    <Section
      id="options"
      label="Display Options"
      icon={Eye}
      active={active}
      onToggle={onToggle}
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
            checked={config[key] as boolean}
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
  );
}
