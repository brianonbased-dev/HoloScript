'use client';

/**
 * Shared material and geometry utilities for MeshNode, AnimatedMeshNode,
 * and StaticChildMesh — single source of truth for material property
 * resolution and geometry factory.
 */

import type { R3FNode } from '@holoscript/core';
import { MATERIAL_PRESETS } from '@holoscript/core';
import { ProceduralGeometryComponent } from './ProceduralMesh';

// =============================================================================
// Geometry Factory
// =============================================================================

export function getGeometry(hsType: string, size: number, props: Record<string, any> = {}) {
  const s = size || 1;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'cube':
    case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, 32]} />;
    case 'pyramid':
    case 'cone':
      return <coneGeometry args={[s * 0.5, s, 4]} />;
    case 'plane':
      return <planeGeometry args={[s, s]} />;
    case 'torus':
      return <torusGeometry args={[s * 0.5, s * 0.15, 16, 32]} />;
    case 'ring':
      return <ringGeometry args={[s * 0.3, s * 0.5, 32]} />;
    case 'capsule':
      return <capsuleGeometry args={[s * 0.3, s * 0.5, 4, 16]} />;
    // ── Advanced procedural geometry ─────────────────────────
    case 'hull':
    case 'metaball':
      if (props.blobs && Array.isArray(props.blobs)) {
        return (
          <ProceduralGeometryComponent
            type="hull"
            blobs={props.blobs}
            resolution={props.resolution || 24}
            threshold={props.threshold || 1.0}
          />
        );
      }
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'spline':
      if (props.points && Array.isArray(props.points)) {
        return (
          <ProceduralGeometryComponent
            type="spline"
            points={props.points}
            radii={props.radii || [0.1]}
          />
        );
      }
      return <cylinderGeometry args={[s * 0.1, s * 0.1, s, 16]} />;
    case 'membrane':
      if (props.anchors && Array.isArray(props.anchors)) {
        return (
          <ProceduralGeometryComponent
            type="membrane"
            anchors={props.anchors}
            subdivisions={props.subdivisions || 8}
            bulge={props.bulge || 0.15}
          />
        );
      }
      return <planeGeometry args={[s, s]} />;
    default:
      if (hsType && hsType !== 'box' && hsType !== 'cube') {
        console.warn(
          `[HoloScript] Unknown geometry type "${hsType}" — falling back to box.`
        );
      }
      return <boxGeometry args={[s, s, s]} />;
  }
}

// =============================================================================
// Material Property Resolution
// =============================================================================

export function getMaterialProps(node: R3FNode): Record<string, any> {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, any>>)[materialName]
    : undefined;

  const matProps: Record<string, any> = {
    ...(preset || {}),
  };

  // Override with explicit props
  if (props.color) matProps.color = props.color;
  if (props.emissive) matProps.emissive = props.emissive;
  if (props.emissiveIntensity !== undefined) matProps.emissiveIntensity = props.emissiveIntensity;
  if (props.opacity !== undefined) matProps.opacity = props.opacity;
  if (props.transparent !== undefined) matProps.transparent = props.transparent;
  if (props.metalness !== undefined) matProps.metalness = props.metalness;
  if (props.roughness !== undefined) matProps.roughness = props.roughness;
  if (props.wireframe !== undefined) matProps.wireframe = props.wireframe;

  // Copy any materialProps from compilation
  if (props.materialProps) {
    Object.assign(matProps, props.materialProps);
  }

  // Auto-enable transparency for transmission materials
  if (matProps.transmission > 0 && matProps.transparent === undefined) {
    matProps.transparent = true;
  }

  // Default color if none set
  if (!matProps.color) matProps.color = '#8888cc';

  return matProps;
}

// =============================================================================
// Helpers
// =============================================================================

/** Check if geometry type should get procedural scale texture */
export function isScaledBody(hsType: string): boolean {
  return hsType === 'hull' || hsType === 'metaball';
}

/** Check if a mesh represents fire effects */
export function isFireMesh(node: R3FNode): boolean {
  const name = (node.id || '').toLowerCase();
  return name.includes('fire') || name.includes('flame') || name.includes('breath');
}
