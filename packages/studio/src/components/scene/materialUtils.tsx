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

/** Segment counts for LOD levels: [high, medium, low] */
const LOD_SEGMENTS = { high: 32, medium: 16, low: 8 } as const;
export type LODDetail = keyof typeof LOD_SEGMENTS;

export function getGeometry(hsType: string, size: number, props: Record<string, any> = {}, detail: LODDetail = 'high') {
  const s = size || 1;
  const seg = LOD_SEGMENTS[detail];
  const torusTube = detail === 'high' ? 16 : detail === 'medium' ? 8 : 4;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return <sphereGeometry args={[s * 0.5, seg, seg]} />;
    case 'cube':
    case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, seg]} />;
    case 'pyramid':
    case 'cone':
      return <coneGeometry args={[s * 0.5, s, 4]} />;
    case 'plane':
      return <planeGeometry args={[s, s]} />;
    case 'torus':
      return <torusGeometry args={[s * 0.5, s * 0.15, torusTube, seg]} />;
    case 'ring':
      return <ringGeometry args={[s * 0.3, s * 0.5, seg]} />;
    case 'capsule':
      return <capsuleGeometry args={[s * 0.3, s * 0.5, detail === 'low' ? 2 : 4, seg / 2]} />;
    // ── Advanced procedural geometry ─────────────────────────
    case 'hull':
    case 'metaball':
    case 'blob':
      if (props.blobs && Array.isArray(props.blobs)) {
        const resolution = detail === 'high' ? (props.resolution || 24) : detail === 'medium' ? 12 : 8;
        return (
          <ProceduralGeometryComponent
            type="hull"
            blobs={props.blobs}
            resolution={resolution}
            threshold={props.threshold || 1.0}
          />
        );
      }
      return <sphereGeometry args={[s * 0.5, seg, seg]} />;
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
      return <cylinderGeometry args={[s * 0.1, s * 0.1, s, seg / 2]} />;
    case 'membrane':
      if (props.anchors && Array.isArray(props.anchors)) {
        const subdivisions = detail === 'high' ? (props.subdivisions || 8) : detail === 'medium' ? 4 : 2;
        return (
          <ProceduralGeometryComponent
            type="membrane"
            anchors={props.anchors}
            subdivisions={subdivisions}
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
  return hsType === 'hull' || hsType === 'metaball' || hsType === 'blob';
}

/** Check if a mesh represents fire effects */
export function isFireMesh(node: R3FNode): boolean {
  const name = (node.id || '').toLowerCase();
  return name.includes('fire') || name.includes('flame') || name.includes('breath');
}
