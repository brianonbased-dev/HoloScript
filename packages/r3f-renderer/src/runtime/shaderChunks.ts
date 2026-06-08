/**
 * shaderChunks — PBR-preserving shader-chunk injection (I.007 dogfooding pillar 2).
 *
 * The lotus petals are photoreal because they keep three.js's full PBR pipeline
 * (clearcoat / transmission / sheen / SSS) and inject custom GLSL — venation,
 * profile gradient, backlit subsurface — at `#include <...>` splice points via
 * `material.onBeforeCompile`. `ShaderMeshNode` can't express this: it does
 * FULL-REPLACEMENT `ShaderMaterial` (no PBR lighting). So PBR + chunk injection
 * was a missing capability, hand-written in services/holoscript-net LotusProgram.tsx.
 *
 * This is that capability, generic and renderer-agnostic: declare chunks as DATA
 * ({stage, include, code}) + uniforms, and `makeChunkInjector` produces the
 * `onBeforeCompile` callback. Pure (no three.js, no WebGL) so it's unit-testable
 * by running the callback against a mock shader; `attachShaderChunks` is the thin
 * three.js wrapper. Designed to consume `LOTUS_PETAL_SHADER_CHUNKS` directly so a
 * compiled `.holo` material can reproduce the hand-authored petal shader.
 *
 * @cites I.007, D.012, F.099, plan §0.7 / task_1780467909796_0qfk
 */
import type * as THREE from 'three';

export type ShaderStage = 'vertex' | 'fragment';

export interface ShaderChunk {
  /** Which shader the chunk targets. `#include <common>` exists in BOTH — stage disambiguates. */
  stage: ShaderStage;
  /** three.js include name to splice relative to, e.g. 'common', 'begin_vertex', 'color_fragment'. */
  include: string;
  /** GLSL to inject. */
  code: string;
  /** Placement relative to the `#include` line. Default 'after'. 'replace' swaps the line out. */
  position?: 'after' | 'before' | 'replace';
}

export interface ShaderChunkSet {
  chunks: ShaderChunk[];
  /** Uniforms to register into the material's program (name → { value }). */
  uniforms?: Record<string, { value: unknown }>;
}

/** The subset of a three.js `Shader` (passed to onBeforeCompile) this module touches. */
export interface InjectableShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

/**
 * Build an `onBeforeCompile`-shaped callback that splices each chunk after (or
 * before/over) its `#include <name>` and registers the set's uniforms. A chunk
 * whose splice point is absent is SKIPPED (never corrupts the shader). Pure: no
 * three.js, no GL — fully testable against a mock shader.
 */
export function makeChunkInjector(set: ShaderChunkSet): (shader: InjectableShader) => void {
  return (shader: InjectableShader) => {
    if (set.uniforms) {
      for (const [name, u] of Object.entries(set.uniforms)) {
        // Don't clobber a uniform three already provides; add ours otherwise.
        if (!(name in shader.uniforms)) shader.uniforms[name] = { value: u.value };
        else shader.uniforms[name].value = u.value;
      }
    }
    for (const chunk of set.chunks) {
      const token = `#include <${chunk.include}>`;
      const key = chunk.stage === 'vertex' ? 'vertexShader' : 'fragmentShader';
      const src = shader[key];
      if (!src.includes(token)) continue; // splice point absent → skip, don't corrupt
      const pos = chunk.position ?? 'after';
      const replacement =
        pos === 'after'
          ? `${token}\n${chunk.code}`
          : pos === 'before'
            ? `${chunk.code}\n${token}`
            : chunk.code;
      shader[key] = src.replace(token, replacement);
    }
  };
}

/** Live handle to update injected uniforms each frame after the program compiles. */
export interface ShaderChunkHandle {
  /** Set an injected uniform's value (no-op until the program has compiled once). */
  setUniform(name: string, value: unknown): void;
  /** True once the GPU program has compiled and the live uniform block is captured. */
  readonly compiled: boolean;
}

/**
 * Attach a chunk set to a three.js material: wires `onBeforeCompile` (PBR preserved)
 * and returns a handle to drive injected uniforms per frame. Thin glue over
 * {@link makeChunkInjector} (which carries the tested logic).
 */
export function attachShaderChunks(
  material: THREE.Material,
  set: ShaderChunkSet
): ShaderChunkHandle {
  const inject = makeChunkInjector(set);
  let live: InjectableShader | null = null;
  // three.js Material.onBeforeCompile: (shader, renderer) => void
  (material as unknown as { onBeforeCompile: (s: InjectableShader) => void }).onBeforeCompile = (
    shader: InjectableShader
  ) => {
    inject(shader);
    live = shader;
  };
  material.needsUpdate = true;
  return {
    get compiled() {
      return live !== null;
    },
    setUniform(name, value) {
      if (live && live.uniforms[name]) live.uniforms[name].value = value;
    },
  };
}
