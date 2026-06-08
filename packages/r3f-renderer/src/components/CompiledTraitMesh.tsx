/**
 * CompiledTraitMesh — a mesh fully driven by compiled `.holo` data (I.007 assembly).
 *
 * The render-side node that composes ALL FOUR closure primitives:
 *   - buildCompiledMaterial → physical PBR (pillar 4) + procedural maps (pillar 3)
 *     + shader chunks (pillar 2),
 *   - the trait runtime (pillar 1) ticks each trait's onUpdate every frame, then
 *     pushes declared context-state values into the shader's injected uniforms.
 *
 * This replaces a hand-authored renderer's per-object setup (cf. LotusProgram.tsx)
 * with one consuming compiled declarations — the embodiment of compiling the
 * renderer from `.holo`. Tick→uniform order is guaranteed by running both in a
 * single useFrame (traits update context state; then state → uniforms).
 *
 * @cites I.007, plan §0.7, task_1780604509863_w7i9 (assembly)
 */
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { TraitContext, HSPlusNode } from '@holoscript/core';
import {
  attachTraits,
  tickTraits,
  detachTraits,
  DEFAULT_MAX_DELTA,
  type RuntimeTraitBinding,
} from '../runtime/traitRuntime';
import { buildCompiledMaterial, type CompiledMaterialSpec } from '../runtime/compiledMaterial';

export interface CompiledTraitMeshProps {
  node: HSPlusNode;
  material: CompiledMaterialSpec;
  /** Trait bindings ticked each frame. */
  traits?: ReadonlyArray<RuntimeTraitBinding>;
  /** Shared trait context (state bag the traits read/write). */
  context: TraitContext;
  /** Map of injected-uniform name → context-state key, pushed after each tick. */
  uniformBindings?: Record<string, string>;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  maxDelta?: number;
  /** Geometry element(s) — e.g. <bufferGeometry .../> or <sphereGeometry .../>. */
  children?: ReactNode;
}

export function CompiledTraitMesh({
  node,
  material,
  traits = [],
  context,
  uniformBindings,
  position,
  rotation,
  scale,
  maxDelta = DEFAULT_MAX_DELTA,
  children,
}: CompiledTraitMeshProps): JSX.Element {
  const { material: mat, chunkHandle } = useMemo(() => buildCompiledMaterial(material), [material]);

  useEffect(() => {
    attachTraits(node, traits, context);
    return () => {
      detachTraits(node, traits, context);
      mat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, traits, context, mat]);

  useFrame((_, delta) => {
    tickTraits(node, traits, context, delta, maxDelta);
    // After traits update context state, push declared values into shader uniforms.
    if (chunkHandle && uniformBindings) {
      const state = context.getState();
      for (const [uniformName, stateKey] of Object.entries(uniformBindings)) {
        if (stateKey in state) chunkHandle.setUniform(uniformName, state[stateKey]);
      }
    }
  });

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      material={mat}
      userData={{ nodeId: node.id }}
    >
      {children}
    </mesh>
  );
}
