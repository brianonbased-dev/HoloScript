/**
 * shaderChunks — tests for PBR-preserving shader-chunk injection (I.007 pillar 2).
 *
 * The keystone test (`fits the real LOTUS_PETAL_SHADER_CHUNKS`) proves the generic
 * injector can reproduce what the hand-authored LotusProgram.tsx `onBeforeCompile`
 * does — i.e. a compiled `.holo` material could carry the petal shader without any
 * hand-written renderer. The rest pin splicing semantics, stage targeting,
 * absent-splice-point safety, and uniform registration.
 */
import { describe, it, expect } from 'vitest';
import { LOTUS_PETAL_CHUNK_ENTRIES } from '../../../core/src/traits/BotanicalLotusTrait';
import {
  makeChunkInjector,
  type InjectableShader,
  type ShaderChunk,
} from '../runtime/shaderChunks';

/** A realistic-enough three.js PBR shader skeleton with the relevant include points. */
function mockPBRShader(): InjectableShader {
  return {
    vertexShader: [
      '#include <common>',
      'void main() {',
      '  #include <begin_vertex>',
      '  #include <worldpos_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: [
      '#include <common>',
      'void main() {',
      '  #include <normal_fragment_maps>',
      '  #include <color_fragment>',
      '  #include <emissivemap_fragment>',
      '}',
    ].join('\n'),
    uniforms: { diffuse: { value: '#ffffff' } },
  };
}

describe('shaderChunks — PBR-preserving onBeforeCompile injection', () => {
  it('splices code AFTER the include and leaves the include in place', () => {
    const shader = mockPBRShader();
    makeChunkInjector({
      chunks: [{ stage: 'fragment', include: 'color_fragment', code: 'COLOR_INJECT;' }],
    })(shader);
    expect(shader.fragmentShader).toContain('#include <color_fragment>\nCOLOR_INJECT;');
  });

  it('targets the correct stage (common exists in both vertex and fragment)', () => {
    const shader = mockPBRShader();
    makeChunkInjector({
      chunks: [
        { stage: 'vertex', include: 'common', code: 'VTX_HEADER;' },
        { stage: 'fragment', include: 'common', code: 'FRAG_HEADER;' },
      ],
    })(shader);
    expect(shader.vertexShader).toContain('VTX_HEADER;');
    expect(shader.vertexShader).not.toContain('FRAG_HEADER;');
    expect(shader.fragmentShader).toContain('FRAG_HEADER;');
    expect(shader.fragmentShader).not.toContain('VTX_HEADER;');
  });

  it('supports before/replace placement', () => {
    const shader = mockPBRShader();
    makeChunkInjector({
      chunks: [
        { stage: 'vertex', include: 'begin_vertex', code: 'BEFORE;', position: 'before' },
        { stage: 'fragment', include: 'emissivemap_fragment', code: 'REPLACED;', position: 'replace' },
      ],
    })(shader);
    expect(shader.vertexShader).toContain('BEFORE;\n#include <begin_vertex>');
    expect(shader.fragmentShader).toContain('REPLACED;');
    expect(shader.fragmentShader).not.toContain('#include <emissivemap_fragment>');
  });

  it('skips a chunk whose splice point is absent (never corrupts the shader)', () => {
    const shader = mockPBRShader();
    const before = shader.fragmentShader;
    makeChunkInjector({
      chunks: [{ stage: 'fragment', include: 'nonexistent_include', code: 'NOPE;' }],
    })(shader);
    expect(shader.fragmentShader).toBe(before);
    expect(shader.fragmentShader).not.toContain('NOPE;');
  });

  it('registers new uniforms and updates existing ones without clobbering', () => {
    const shader = mockPBRShader();
    makeChunkInjector({
      chunks: [],
      uniforms: { uLotusTime: { value: 0 }, diffuse: { value: '#ff0000' } },
    })(shader);
    expect(shader.uniforms.uLotusTime).toEqual({ value: 0 });
    expect(shader.uniforms.diffuse.value).toBe('#ff0000'); // updated existing, not duplicated
  });

  it('fits the real LOTUS_PETAL_CHUNK_ENTRIES — reproduces the hand-authored petal shader', () => {
    // Consume the core MACHINE-READABLE chunk data directly (splice points as data,
    // not JSDoc) — exactly what a compiled .holo material carries. This is the bridge
    // proving core declares the chunks and the renderer's injector applies them.
    const chunks: ShaderChunk[] = LOTUS_PETAL_CHUNK_ENTRIES.map((e) => ({
      stage: e.stage,
      include: e.include,
      code: e.code,
    }));
    expect(LOTUS_PETAL_CHUNK_ENTRIES).toHaveLength(7);
    const shader = mockPBRShader();
    makeChunkInjector({
      chunks,
      uniforms: { uPetalDevTime: { value: 0 }, uLotusVeinIntensity: { value: 1 } },
    })(shader);

    // Vertex: petal attributes header + emergent curl bend + world varyings present.
    expect(shader.vertexShader).toContain('attribute vec2 petalUv;');
    expect(shader.vertexShader).toContain('transformed.x += lotusBend.x;');
    expect(shader.vertexShader).toContain('vLotusWorldNormal = normalize');
    // Fragment: vein field fn + normal perturbation + profile/vein color injection.
    expect(shader.fragmentShader).toContain('float lotusVeinField(');
    expect(shader.fragmentShader).toContain('normal = normalize(normal + vec3(');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix(');
    // PBR pipeline preserved: original includes still present (not replaced).
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    // Uniforms registered.
    expect(shader.uniforms.uPetalDevTime).toEqual({ value: 0 });
  });
});
