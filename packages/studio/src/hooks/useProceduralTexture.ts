'use client';

/**
 * useProceduralTexture — Hook that generates procedural textures using
 * the core generators from GLTFPipeline and converts them to THREE.DataTexture.
 *
 * Currently supports:
 * - 'scale' — Hexagonal dragon-scale pattern (color)
 * - 'scaleNormal' — Tangent-space normal map for hexagonal scales
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { generateScaleTexture, generateScaleNormalMap } from '@holoscript/core';

// Cache generated textures to avoid regeneration
const textureCache = new Map<string, THREE.DataTexture>();

function createDataTexture(
  data: Uint8Array,
  size: number,
  isNormalMap: boolean = false
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data as unknown as BufferSource, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (isNormalMap) {
    texture.colorSpace = THREE.LinearSRGBColorSpace;
  } else {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

interface ProceduralTextureOptions {
  size?: number;
  baseColor?: [number, number, number];
  tiling?: [number, number];
}

/**
 * Generate and cache a procedural texture for use in R3F materials.
 *
 * @param type - The type of procedural texture to generate
 * @param options - Generation options (size, color, tiling)
 * @returns Object with texture maps ready to spread into meshPhysicalMaterial
 */
export function useProceduralTexture(
  type: 'scale' | 'scaleNormal' | 'scaleFull' | null,
  options: ProceduralTextureOptions = {}
): Record<string, THREE.DataTexture> {
  const { size = 512, baseColor, tiling = [3, 3] } = options;

  return useMemo(() => {
    if (!type) return {};

    const result: Record<string, THREE.DataTexture> = {};

    if (type === 'scale' || type === 'scaleFull') {
      const cacheKey = `scale-${size}-${baseColor?.join(',') || 'default'}`;
      let tex = textureCache.get(cacheKey);
      if (!tex) {
        const pixels = baseColor
          ? generateScaleTexture(size, baseColor)
          : generateScaleTexture(size);
        tex = createDataTexture(pixels, size);
        tex.repeat.set(tiling[0], tiling[1]);
        textureCache.set(cacheKey, tex);
      }
      result.map = tex;
    }

    if (type === 'scaleNormal' || type === 'scaleFull') {
      const cacheKey = `scaleNormal-${size}`;
      let tex = textureCache.get(cacheKey);
      if (!tex) {
        const pixels = generateScaleNormalMap(size);
        tex = createDataTexture(pixels, size, true);
        tex.repeat.set(tiling[0], tiling[1]);
        textureCache.set(cacheKey, tex);
      }
      result.normalMap = tex;
    }

    return result;
  }, [type, size, baseColor?.[0], baseColor?.[1], baseColor?.[2], tiling[0], tiling[1]]);
}
