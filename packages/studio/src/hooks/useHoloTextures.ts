'use client';

/**
 * useHoloTextures — Hook that extracts texture URLs from HoloScript material
 * props and loads them as Three.js textures for live R3F rendering.
 *
 * Handles two texture source formats:
 * 1. textureMaps: Record<string, string> from compileMaterialBlock (keys like "albedo_map")
 * 2. Individual map props (normalMap, roughnessMap, etc.) as URL strings
 *
 * Returns a flat object of loaded THREE.Texture instances keyed by Three.js
 * material property names, ready to spread into <meshPhysicalMaterial>.
 */

import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

// Maps HoloScript texture channel names → Three.js meshPhysicalMaterial prop names
const HOLO_TO_THREE_MAP: Record<string, string> = {
  // Domain block _map keys (from compileMaterialBlock)
  albedo_map: 'map',
  normal_map: 'normalMap',
  roughness_map: 'roughnessMap',
  metallic_map: 'metalnessMap',
  ao_map: 'aoMap',
  emission_map: 'emissiveMap',
  height_map: 'displacementMap',
  displacement_map: 'displacementMap',
  coat_normal_map: 'clearcoatNormalMap',
  sheen_color_map: 'sheenColorMap',
  anisotropy_map: 'anisotropyMap',

  // MaterialTrait channel names (camelCase)
  baseColor: 'map',
  normalMap: 'normalMap',
  roughnessMap: 'roughnessMap',
  metallicMap: 'metalnessMap',
  ambientOcclusionMap: 'aoMap',
  emissionMap: 'emissiveMap',
  heightMap: 'displacementMap',
  displacementMap: 'displacementMap',
  coatNormalMap: 'clearcoatNormalMap',
  sheenColorMap: 'sheenColorMap',
  anisotropyDirectionMap: 'anisotropyMap',
  specularColorMap: 'specularColorMap',
  detailNormalMap: 'normalMap', // fallback to main normal
};

interface TextureConfig {
  path: string;
  scale?: [number, number];
  offset?: [number, number];
}

/**
 * Extract texture configurations from material props.
 * Returns a map of Three.js prop name → TextureConfig.
 */
function extractTextureConfigs(matProps: Record<string, any>): Map<string, TextureConfig> {
  const configs = new Map<string, TextureConfig>();

  // Source 1: textureMaps from compileMaterialBlock
  if (matProps.textureMaps && typeof matProps.textureMaps === 'object') {
    for (const [holoKey, path] of Object.entries(matProps.textureMaps)) {
      if (typeof path !== 'string' || !path) continue;
      const threeKey = HOLO_TO_THREE_MAP[holoKey] || holoKey;
      configs.set(threeKey, { path });
    }
  }

  // Source 2: Individual texture props (objects with path/url)
  if (matProps.textures && Array.isArray(matProps.textures)) {
    for (const tex of matProps.textures) {
      if (!tex || !tex.type || !tex.path) continue;
      const threeKey = HOLO_TO_THREE_MAP[tex.type] || tex.type;
      configs.set(threeKey, {
        path: tex.path,
        scale: tex.scale ? [tex.scale, tex.scale] : undefined,
        offset: tex.offset,
      });
    }
  }

  // Source 3: Direct string props that look like texture paths
  for (const [key, value] of Object.entries(matProps)) {
    if (typeof value !== 'string') continue;
    if (!key.endsWith('Map') && !key.endsWith('_map')) continue;
    // Skip if it's a color-like string (hex)
    if (value.startsWith('#') || value.startsWith('rgb')) continue;
    // Skip if already found
    const threeKey = HOLO_TO_THREE_MAP[key] || key;
    if (configs.has(threeKey)) continue;
    // Looks like a file path
    if (value.includes('.') || value.includes('/')) {
      configs.set(threeKey, { path: value });
    }
  }

  return configs;
}

/**
 * Hook that loads textures from material props and returns them as a flat
 * object ready to spread into meshPhysicalMaterial.
 *
 * Usage:
 *   const textureMaps = useHoloTextures(matProps);
 *   <meshPhysicalMaterial {...matProps} {...textureMaps} />
 */
export function useHoloTextures(matProps: Record<string, any>): Record<string, THREE.Texture> {
  const configs = useMemo(
    () => extractTextureConfigs(matProps),
    [
      matProps.textureMaps,
      matProps.textures,
      // Check specific map props
      matProps.normalMap,
      matProps.roughnessMap,
      matProps.metallicMap,
      matProps.displacementMap,
      matProps.emissionMap,
    ]
  );

  // Collect all unique paths to load
  const paths = useMemo(() => {
    const result: string[] = [];
    for (const config of configs.values()) {
      if (!result.includes(config.path)) {
        result.push(config.path);
      }
    }
    return result;
  }, [configs]);

  // Load all textures (drei's useTexture handles caching)
  // We use useLoader directly for more control
  const loadedTextures = useLoader(
    THREE.TextureLoader,
    paths.length > 0
      ? paths
      : [
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        ]
  );

  // Map loaded textures back to Three.js prop names
  return useMemo(() => {
    if (paths.length === 0) return {};

    const texArray = Array.isArray(loadedTextures) ? loadedTextures : [loadedTextures];
    const pathToTexture = new Map<string, THREE.Texture>();
    paths.forEach((path, i) => {
      if (texArray[i]) pathToTexture.set(path, texArray[i]);
    });

    const result: Record<string, THREE.Texture> = {};
    for (const [threeKey, config] of configs.entries()) {
      const tex = pathToTexture.get(config.path);
      if (!tex) continue;

      // Apply UV tiling
      if (config.scale) {
        tex.repeat.set(config.scale[0], config.scale[1]);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
      }
      if (config.offset) {
        tex.offset.set(config.offset[0], config.offset[1]);
      }

      result[threeKey] = tex;
    }

    return result;
  }, [loadedTextures, configs, paths]);
}

/**
 * Check if material props contain any texture references.
 * Use this to avoid Suspense boundaries when no textures are needed.
 */
export function hasTextures(matProps: Record<string, any>): boolean {
  if (matProps.textureMaps && Object.keys(matProps.textureMaps).length > 0) return true;
  if (matProps.textures && matProps.textures.length > 0) return true;
  for (const [key, value] of Object.entries(matProps)) {
    if (typeof value !== 'string') continue;
    if (!key.endsWith('Map') && !key.endsWith('_map')) continue;
    if (value.startsWith('#') || value.startsWith('rgb')) continue;
    if (value.includes('.') || value.includes('/')) return true;
  }
  return false;
}
