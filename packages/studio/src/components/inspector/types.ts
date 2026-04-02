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

export interface PresetCategory {
  label: string;
  icon: string;
  presets: { key: string; label: string; config: Partial<PBRMaterialConfig> }[];
}
