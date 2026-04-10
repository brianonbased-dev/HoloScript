/**
 * glTF Extensions Support
 *
 * Utilities for glTF 2.0 extensions commonly used in HoloScript exports.
 */

// =============================================================================
// EXTENSION REGISTRY
// =============================================================================

/**
 * Supported glTF extensions
 */
export const SUPPORTED_EXTENSIONS = [
  'KHR_materials_unlit',
  'KHR_materials_emissive_strength',
  'KHR_materials_clearcoat',
  'KHR_materials_transmission',
  'KHR_materials_ior',
  'KHR_materials_specular',
  'KHR_materials_sheen',
  'KHR_materials_anisotropy',
  'KHR_materials_volume',
  'KHR_materials_iridescence',
  'KHR_draco_mesh_compression',
  'KHR_mesh_quantization',
  'KHR_texture_basisu',
  'KHR_lights_punctual',
  'EXT_mesh_gpu_instancing',
  'MSFT_lod',
] as const;

export type GLTFExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// =============================================================================
// KHR_materials_unlit
// =============================================================================

/**
 * Unlit material extension - renders without lighting calculations
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KHRMaterialsUnlit {
  /** Empty object - presence indicates unlit */
}

export function createUnlitExtension(): { KHR_materials_unlit: KHRMaterialsUnlit } {
  return { KHR_materials_unlit: {} };
}

// =============================================================================
// KHR_materials_emissive_strength
// =============================================================================

/**
 * Emissive strength extension - allows emissive values > 1.0
 */
export interface KHRMaterialsEmissiveStrength {
  emissiveStrength: number;
}

export function createEmissiveStrengthExtension(strength: number): {
  KHR_materials_emissive_strength: KHRMaterialsEmissiveStrength;
} {
  return {
    KHR_materials_emissive_strength: {
      emissiveStrength: Math.max(0, strength),
    },
  };
}

// =============================================================================
// KHR_materials_clearcoat
// =============================================================================

/**
 * Clearcoat extension - adds a clear protective layer
 */
export interface KHRMaterialsClearcoat {
  clearcoatFactor?: number;
  clearcoatTexture?: { index: number };
  clearcoatRoughnessFactor?: number;
  clearcoatRoughnessTexture?: { index: number };
  clearcoatNormalTexture?: { index: number; scale?: number };
}

export function createClearcoatExtension(options: { factor?: number; roughness?: number }): {
  KHR_materials_clearcoat: KHRMaterialsClearcoat;
} {
  return {
    KHR_materials_clearcoat: {
      clearcoatFactor: options.factor ?? 1,
      clearcoatRoughnessFactor: options.roughness ?? 0,
    },
  };
}

// =============================================================================
// KHR_materials_transmission
// =============================================================================

/**
 * Transmission extension - for glass/translucent materials
 */
export interface KHRMaterialsTransmission {
  transmissionFactor?: number;
  transmissionTexture?: { index: number };
}

export function createTransmissionExtension(factor: number): {
  KHR_materials_transmission: KHRMaterialsTransmission;
} {
  return {
    KHR_materials_transmission: {
      transmissionFactor: Math.max(0, Math.min(1, factor)),
    },
  };
}

// =============================================================================
// KHR_materials_ior
// =============================================================================

/**
 * Index of Refraction extension
 */
export interface KHRMaterialsIOR {
  ior: number;
}

/**
 * Common IOR values for reference
 */
export const IOR_VALUES = {
  vacuum: 1.0,
  air: 1.0003,
  water: 1.33,
  ice: 1.31,
  glass: 1.5,
  crystal: 2.0,
  diamond: 2.417,
  plastic: 1.46,
  acrylic: 1.49,
  sapphire: 1.77,
  ruby: 1.76,
  amber: 1.55,
  emerald: 1.57,
  opal: 1.45,
};

export function createIORExtension(ior: number): { KHR_materials_ior: KHRMaterialsIOR } {
  return {
    KHR_materials_ior: {
      ior: Math.max(1, ior),
    },
  };
}

// =============================================================================
// KHR_lights_punctual
// =============================================================================

/**
 * Light types for KHR_lights_punctual
 */
export type GLTFLightType = 'directional' | 'point' | 'spot';

export interface KHRLightsPunctualLight {
  name?: string;
  type: GLTFLightType;
  color?: [number, number, number];
  intensity?: number;
  range?: number;
  spot?: {
    innerConeAngle?: number;
    outerConeAngle?: number;
  };
}

export interface KHRLightsPunctual {
  lights: KHRLightsPunctualLight[];
}

export function createLight(options: {
  name?: string;
  type: GLTFLightType;
  color?: [number, number, number];
  intensity?: number;
  range?: number;
  innerConeAngle?: number;
  outerConeAngle?: number;
}): KHRLightsPunctualLight {
  const light: KHRLightsPunctualLight = {
    type: options.type,
  };

  if (options.name) light.name = options.name;
  if (options.color) light.color = options.color;
  if (options.intensity !== undefined) light.intensity = options.intensity;
  if (options.range !== undefined) light.range = options.range;

  if (options.type === 'spot') {
    light.spot = {
      innerConeAngle: options.innerConeAngle ?? 0,
      outerConeAngle: options.outerConeAngle ?? Math.PI / 4,
    };
  }

  return light;
}

export function createDirectionalLight(
  color: [number, number, number] = [1, 1, 1],
  intensity: number = 1
): KHRLightsPunctualLight {
  return createLight({
    type: 'directional',
    color,
    intensity,
  });
}

export function createPointLight(
  color: [number, number, number] = [1, 1, 1],
  intensity: number = 1,
  range?: number
): KHRLightsPunctualLight {
  return createLight({
    type: 'point',
    color,
    intensity,
    range,
  });
}

export function createSpotLight(
  color: [number, number, number] = [1, 1, 1],
  intensity: number = 1,
  innerConeAngle: number = 0,
  outerConeAngle: number = Math.PI / 4
): KHRLightsPunctualLight {
  return createLight({
    type: 'spot',
    color,
    intensity,
    innerConeAngle,
    outerConeAngle,
  });
}

// =============================================================================
// KHR_materials_sheen
// =============================================================================

/**
 * Sheen extension — soft fuzzy reflection layer for fabrics and textiles
 */
export interface KHRMaterialsSheen {
  sheenColorFactor?: [number, number, number];
  sheenColorTexture?: { index: number };
  sheenRoughnessFactor?: number;
  sheenRoughnessTexture?: { index: number };
}

export function createSheenExtension(options: {
  color?: [number, number, number];
  roughness?: number;
}): { KHR_materials_sheen: KHRMaterialsSheen } {
  return {
    KHR_materials_sheen: {
      sheenColorFactor: options.color ?? [1, 1, 1],
      sheenRoughnessFactor: options.roughness ?? 0.5,
    },
  };
}

// =============================================================================
// KHR_materials_anisotropy
// =============================================================================

/**
 * Anisotropy extension — directional roughness for brushed metal, hair, silk
 */
export interface KHRMaterialsAnisotropy {
  anisotropyStrength?: number;
  anisotropyRotation?: number;
  anisotropyTexture?: { index: number };
}

export function createAnisotropyExtension(options: { strength?: number; rotation?: number }): {
  KHR_materials_anisotropy: KHRMaterialsAnisotropy;
} {
  return {
    KHR_materials_anisotropy: {
      anisotropyStrength: Math.max(0, Math.min(1, options.strength ?? 0.5)),
      anisotropyRotation: options.rotation ?? 0,
    },
  };
}

// =============================================================================
// KHR_materials_volume
// =============================================================================

/**
 * Volume extension — subsurface scattering / light attenuation through materials
 */
export interface KHRMaterialsVolume {
  thicknessFactor?: number;
  thicknessTexture?: { index: number };
  attenuationDistance?: number;
  attenuationColor?: [number, number, number];
}

export function createVolumeExtension(options: {
  thickness?: number;
  attenuationDistance?: number;
  attenuationColor?: [number, number, number];
}): { KHR_materials_volume: KHRMaterialsVolume } {
  return {
    KHR_materials_volume: {
      thicknessFactor: options.thickness ?? 1,
      attenuationDistance: options.attenuationDistance ?? 1,
      attenuationColor: options.attenuationColor ?? [1, 1, 1],
    },
  };
}

// =============================================================================
// KHR_materials_iridescence
// =============================================================================

/**
 * Iridescence extension — thin-film interference (soap bubbles, oil slicks, beetles)
 */
export interface KHRMaterialsIridescence {
  iridescenceFactor?: number;
  iridescenceIor?: number;
  iridescenceThicknessMinimum?: number;
  iridescenceThicknessMaximum?: number;
  iridescenceTexture?: { index: number };
  iridescenceThicknessTexture?: { index: number };
}

export function createIridescenceExtension(options: {
  factor?: number;
  ior?: number;
  thicknessRange?: [number, number];
}): { KHR_materials_iridescence: KHRMaterialsIridescence } {
  return {
    KHR_materials_iridescence: {
      iridescenceFactor: options.factor ?? 1,
      iridescenceIor: options.ior ?? 1.3,
      iridescenceThicknessMinimum: options.thicknessRange?.[0] ?? 100,
      iridescenceThicknessMaximum: options.thicknessRange?.[1] ?? 400,
    },
  };
}

// =============================================================================
// EXT_mesh_gpu_instancing
// =============================================================================

/**
 * GPU Instancing extension for efficient rendering of many copies
 */
export interface EXTMeshGPUInstancing {
  attributes: {
    TRANSLATION?: number;
    ROTATION?: number;
    SCALE?: number;
  };
}

export function createInstancedMeshExtension(options: {
  translationAccessor?: number;
  rotationAccessor?: number;
  scaleAccessor?: number;
}): { EXT_mesh_gpu_instancing: EXTMeshGPUInstancing } {
  const attributes: EXTMeshGPUInstancing['attributes'] = {};

  if (options.translationAccessor !== undefined) {
    attributes.TRANSLATION = options.translationAccessor;
  }
  if (options.rotationAccessor !== undefined) {
    attributes.ROTATION = options.rotationAccessor;
  }
  if (options.scaleAccessor !== undefined) {
    attributes.SCALE = options.scaleAccessor;
  }

  return {
    EXT_mesh_gpu_instancing: { attributes },
  };
}

// =============================================================================
// EXTENSION HELPERS
// =============================================================================

/**
 * Collect all used extensions from a glTF document
 */
export function collectUsedExtensions(gltf: Record<string, unknown>): string[] {
  const extensions = new Set<string>();

  // Check materials
  const materials = gltf.materials as Array<{ extensions?: Record<string, unknown> }> | undefined;
  if (materials) {
    for (const material of materials) {
      if (material.extensions) {
        Object.keys(material.extensions).forEach((ext) => extensions.add(ext));
      }
    }
  }

  // Check nodes for lights
  const nodes = gltf.nodes as Array<{ extensions?: Record<string, unknown> }> | undefined;
  if (nodes) {
    for (const node of nodes) {
      if (node.extensions) {
        Object.keys(node.extensions).forEach((ext) => extensions.add(ext));
      }
    }
  }

  // Check root extensions
  if (gltf.extensions) {
    Object.keys(gltf.extensions as object).forEach((ext) => extensions.add(ext));
  }

  return Array.from(extensions);
}

/**
 * Check if an extension requires being in extensionsRequired
 */
export function isExtensionRequired(extension: string): boolean {
  const requiredExtensions = [
    'KHR_draco_mesh_compression',
    'KHR_mesh_quantization',
    'KHR_texture_basisu',
  ];

  return requiredExtensions.includes(extension);
}

/**
 * Add extension usage declarations to glTF document
 */
export function declareExtensions(gltf: Record<string, unknown>): void {
  const usedExtensions = collectUsedExtensions(gltf);

  if (usedExtensions.length === 0) return;

  gltf.extensionsUsed = usedExtensions;

  const required = usedExtensions.filter(isExtensionRequired);
  if (required.length > 0) {
    gltf.extensionsRequired = required;
  }
}
