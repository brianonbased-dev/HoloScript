/**
 * compiledMaterial — tests for the render-side material assembly (I.007 assembly).
 *
 * Proves buildCompiledMaterial composes three closure primitives into one
 * MeshPhysicalMaterial from compiled `.holo` data: physical PBR props, procedural
 * detail maps (pillar 3 registry), and custom shader chunks (pillar 2 onBeforeCompile).
 * This is the render-side consumer that replaces LotusProgram.tsx's hand-authored
 * material setup.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  registerProceduralTexture,
  clearProceduralTextures,
  type ProceduralPixelData,
} from '../runtime/proceduralTextures';
import { buildCompiledMaterial } from '../runtime/compiledMaterial';

beforeEach(() => clearProceduralTextures());

const flat = (w: number, h: number): ProceduralPixelData => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h * 4).fill(128),
});

describe('buildCompiledMaterial — render-side primitive assembly', () => {
  it('applies physical PBR props onto a MeshPhysicalMaterial', () => {
    const { material } = buildCompiledMaterial({
      physical: {
        color: '#ffc0cb',
        roughness: 0.4,
        clearcoat: 0.8,
        transmission: 0.3,
        sheen: 0.6,
        sheenColor: '#ffe0e0',
        ior: 1.4,
      },
    });
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.roughness).toBeCloseTo(0.4);
    expect(material.clearcoat).toBeCloseTo(0.8);
    expect(material.transmission).toBeCloseTo(0.3);
    expect(material.sheen).toBeCloseTo(0.6);
    expect(material.ior).toBeCloseTo(1.4);
  });

  it('resolves procedural maps (pillar 3) onto material slots', () => {
    registerProceduralTexture('botanical_normal', () => flat(16, 16));
    registerProceduralTexture('botanical_roughness', () => flat(8, 8));
    const { material } = buildCompiledMaterial({
      proceduralMaps: {
        normalMap: { generator: 'botanical_normal', params: { size: 16 } },
        roughnessMap: { generator: 'botanical_roughness' },
      },
    });
    expect(material.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.normalMap!.image.width).toBe(16);
    expect(material.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.roughnessMap!.image.width).toBe(8);
  });

  it('attaches shader chunks (pillar 2) via onBeforeCompile and returns a handle', () => {
    const { material, chunkHandle } = buildCompiledMaterial({
      shaderChunks: {
        chunks: [{ stage: 'fragment', include: 'color_fragment', code: 'INJECT;' }],
        uniforms: { uTest: { value: 1 } },
      },
    });
    expect(typeof (material as unknown as { onBeforeCompile: unknown }).onBeforeCompile).toBe(
      'function'
    );
    expect(chunkHandle).toBeDefined();
    expect(chunkHandle!.compiled).toBe(false); // not yet compiled by GPU

    // Drive the onBeforeCompile to confirm the chunk actually splices.
    const shader = {
      vertexShader: 'void main(){}',
      fragmentShader: '#include <color_fragment>\nvoid main(){}',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    (material as unknown as { onBeforeCompile: (s: typeof shader) => void }).onBeforeCompile(
      shader
    );
    expect(shader.fragmentShader).toContain('#include <color_fragment>\nINJECT;');
    expect(shader.uniforms.uTest).toEqual({ value: 1 });
  });

  it('skips a procedural map whose generator is unregistered (no crash, slot unset)', () => {
    const { material } = buildCompiledMaterial({
      proceduralMaps: { normalMap: { generator: 'missing' } },
    });
    expect(material.normalMap).toBeNull();
  });

  it('returns a bare material with no chunkHandle when no chunks declared', () => {
    const { material, chunkHandle } = buildCompiledMaterial({ physical: { roughness: 0.5 } });
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(chunkHandle).toBeUndefined();
  });
});
