/**
 * ShaderMeshNode — Renders a mesh with a custom GLSL shader.
 *
 * Detects @shader trait config in R3FNode props and renders using
 * Three.js ShaderMaterial instead of MeshPhysicalMaterial.
 * Automatically updates `time` uniform each frame for animated shaders.
 *
 * Supports:
 * - Inline GLSL vertex/fragment shaders
 * - ShaderTrait preset shaders (hologram, forceField, dissolve)
 * - Uniform auto-update (time, resolution, mouse)
 * - Transparent/depth/cull config from trait
 */

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { R3FNode } from '@holoscript/core';
import { SHADER_PRESETS, createShaderTrait } from '@holoscript/core';
import * as THREE from 'three';
import { getGeometry } from '../utils/materialUtils';

export interface ShaderMeshNodeProps {
  node: R3FNode;
  onSelect?: (id: string | null) => void;
}

/**
 * Resolve shader config — could be a preset name string or full config object.
 */
function resolveShaderConfig(shaderProp: any): Record<string, unknown> | null {
  if (!shaderProp) return null;

  // If it's a string, look up the preset
  if (typeof shaderProp === 'string') {
    const preset = (SHADER_PRESETS as Record<string, any>)[shaderProp];
    if (preset) {
      const trait = createShaderTrait(preset);
      return trait.toThreeJSConfig();
    }
    return null;
  }

  // If it has a `preset` field, look up that preset
  if (shaderProp.preset && typeof shaderProp.preset === 'string') {
    const preset = (SHADER_PRESETS as Record<string, any>)[shaderProp.preset];
    if (preset) {
      // Merge any overrides from the prop into the preset
      const merged = { ...preset, ...shaderProp };
      delete merged.preset;
      const trait = createShaderTrait(merged);
      return trait.toThreeJSConfig();
    }
  }

  // If it already has vertex/fragment source, create a trait from it
  if (shaderProp.source || shaderProp.vertex || shaderProp.fragment) {
    try {
      const trait = createShaderTrait(shaderProp);
      return trait.toThreeJSConfig();
    } catch {
      // Fall back to raw config
    }
  }

  // If it looks like a raw Three.js config (vertexShader/fragmentShader), use directly
  if (shaderProp.vertexShader && shaderProp.fragmentShader) {
    return shaderProp;
  }

  return null;
}

export function ShaderMeshNode({ node, onSelect }: ShaderMeshNodeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size: viewportSize } = useThree();

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];

  // Resolve shader config from trait
  const shaderConfig = useMemo(() => resolveShaderConfig(props.shader), [props.shader]);

  // Clone uniforms so each instance gets its own values
  const uniforms = useMemo(() => {
    if (!shaderConfig?.uniforms) return {};
    const result: Record<string, { value: unknown }> = {};
    for (const [key, uniform] of Object.entries(shaderConfig.uniforms as Record<string, any>)) {
      result[key] = { value: uniform.value };
    }
    // Ensure common uniforms exist
    if (!result.time) result.time = { value: 0.0 };
    if (!result.resolution) {
      result.resolution = { value: new THREE.Vector2(viewportSize.width, viewportSize.height) };
    }
    return result;
  }, [shaderConfig, viewportSize.width, viewportSize.height]);

  // Update time and resolution uniforms each frame
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    if (u.time) u.time.value = clock.getElapsedTime();
    if (u.resolution) {
      u.resolution.value.set(viewportSize.width, viewportSize.height);
    }
  });

  if (!shaderConfig) {
    // Fallback: if shader config couldn't be resolved, render nothing
    return null;
  }

  return (
    <group>
      <mesh
        position={position}
        rotation={rotation}
        scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
        userData={{ nodeId: node.id }}
        onClick={(e: any) => {
          e.stopPropagation();
          onSelect?.(node.id || null);
        }}
      >
        {getGeometry(hsType, size, props, 'high', node)}
        <shaderMaterial
          ref={matRef}
          vertexShader={shaderConfig.vertexShader as string}
          fragmentShader={shaderConfig.fragmentShader as string}
          uniforms={uniforms}
          transparent={(shaderConfig.transparent as boolean) ?? false}
          depthTest={(shaderConfig.depthTest as boolean) ?? true}
          depthWrite={(shaderConfig.depthWrite as boolean) ?? true}
          side={(shaderConfig.side as THREE.Side) ?? THREE.FrontSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Check if a node has a shader trait that should be rendered with ShaderMeshNode.
 */
export function hasShaderTrait(node: R3FNode): boolean {
  return !!(node.props.shader && typeof node.props.shader === 'object');
}
