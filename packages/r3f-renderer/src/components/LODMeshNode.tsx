/**
 * LODMeshNode — Level-of-detail mesh rendering using drei's Detailed component.
 * Renders up to 5 detail levels and switches based on camera distance.
 *
 * Supports consuming LODConfig from @holoscript/core for proper strategy
 * selection, hysteresis, forced levels, and metrics reporting.
 *
 * Platform-agnostic: no store dependencies.
 */

import { Suspense, useMemo, _useCallback } from 'react';
import type { R3FNode } from '@holoscript/core';
import { Detailed } from '@react-three/drei';
import {
  getGeometry,
  getMaterialProps,
  isScaledBody,
  type LODDetail,
} from '../utils/materialUtils';
import { useHoloTextures, hasTextures } from '../hooks/useHoloTextures';
import { useProceduralTexture } from '../hooks/useProceduralTexture';

/** LOD configuration from @holoscript/core (subset needed by renderer) */
export interface LODLevelConfig {
  level: number;
  distance: number;
  polygonRatio: number;
  textureScale: number;
  disabledFeatures?: string[];
}

export interface LODConfigProp {
  id?: string;
  strategy?: 'distance' | 'screenSize' | 'performance' | 'manual' | 'hybrid';
  transition?: 'instant' | 'crossfade' | 'dither' | 'morph';
  transitionDuration?: number;
  levels?: LODLevelConfig[];
  hysteresis?: number;
  bias?: number;
  fadeEnabled?: boolean;
  maxLevel?: number;
  forcedLevel?: number;
  enabled?: boolean;
}

export interface LODMeshNodeProps {
  node: R3FNode;
  /** LOD distance thresholds in world units (legacy: [close, medium, far]) */
  distances?: number[];
  /** Core LODConfig — when provided, distances are extracted from levels */
  lodConfig?: LODConfigProp;
  /** Called when LOD level changes (for metrics reporting) */
  onLODChange?: (nodeId: string, level: number, distance: number) => void;
}

/**
 * Inner material component for Suspense-wrapped texture loading.
 */
function TexturedLODMaterial({
  matProps,
  proceduralMaps,
}: {
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
}) {
  const textureMaps = useHoloTextures(matProps);
  return (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      {...textureMaps}
      emissive={matProps.emissive}
      emissiveIntensity={matProps.emissiveIntensity}
      color={matProps.color}
    />
  );
}

/**
 * Single LOD level mesh with geometry at the given detail.
 */
function LODLevel({
  hsType,
  size,
  props,
  detail,
  matProps,
  proceduralMaps,
  needsTextures,
}: {
  hsType: string;
  size: number;
  props: Record<string, any>;
  detail: LODDetail;
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
  needsTextures: boolean;
}) {
  const defaultMaterial = (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      emissive={matProps.emissive}
      emissiveIntensity={matProps.emissiveIntensity}
      color={matProps.color}
    />
  );

  return (
    <mesh>
      {getGeometry(hsType, size, props, detail)}
      {needsTextures ? (
        <Suspense fallback={defaultMaterial}>
          <TexturedLODMaterial matProps={matProps} proceduralMaps={proceduralMaps} />
        </Suspense>
      ) : (
        defaultMaterial
      )}
    </mesh>
  );
}

/** Map LOD level index to geometry detail tier */
const _DETAIL_TIERS: LODDetail[] = ['high', 'medium', 'low'];

function getDetailForLevel(levelIndex: number): LODDetail {
  if (levelIndex <= 0) return 'high';
  if (levelIndex === 1) return 'medium';
  return 'low';
}

export function LODMeshNode({
  node,
  distances: legacyDistances,
  lodConfig,
  _onLODChange,
}: LODMeshNodeProps) {
  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];

  // Resolve distances and level count from LODConfig or legacy props
  const { distances, levelCount } = useMemo(() => {
    if (lodConfig?.enabled === false) {
      // LOD disabled — render only highest detail at distance 0
      return { distances: [0], levelCount: 1 };
    }

    if (lodConfig?.forcedLevel !== undefined) {
      // Debug: force single level
      return { distances: [0], levelCount: 1 };
    }

    if (lodConfig?.levels && lodConfig.levels.length > 0) {
      // Extract distances from core LODConfig levels
      const sorted = [...lodConfig.levels].sort((a, b) => a.level - b.level);
      const dists = sorted.map((l) => l.distance);
      return { distances: dists, levelCount: Math.min(sorted.length, 3) };
    }

    // Legacy fallback
    const dists = legacyDistances ?? [0, 25, 50];
    return { distances: dists, levelCount: Math.min(dists.length, 3) };
  }, [lodConfig, legacyDistances]);

  // Forced detail level for debugging
  const forcedDetail =
    lodConfig?.forcedLevel !== undefined ? getDetailForLevel(lodConfig.forcedLevel) : undefined;

  const matProps = getMaterialProps(node);
  const proceduralMaps = useProceduralTexture(isScaledBody(hsType) ? 'scaleFull' : null, {
    size: 512,
    tiling: [3, 3],
  });
  const needsTextures = hasTextures(matProps);

  // Build LOD levels based on computed level count
  const lodLevels = useMemo(() => {
    if (forcedDetail) {
      // Debug: single forced level
      return [{ detail: forcedDetail, key: 'forced' }];
    }
    const levels: Array<{ detail: LODDetail; key: string }> = [];
    for (let i = 0; i < levelCount; i++) {
      levels.push({ detail: getDetailForLevel(i), key: `lod-${i}` });
    }
    return levels;
  }, [levelCount, forcedDetail]);

  return (
    <group
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
    >
      <Detailed distances={distances}>
        {lodLevels.map(({ detail, key }) => (
          <LODLevel
            key={key}
            hsType={hsType}
            size={size}
            props={props}
            detail={detail}
            matProps={matProps}
            proceduralMaps={proceduralMaps}
            needsTextures={needsTextures}
          />
        ))}
      </Detailed>
    </group>
  );
}

/** Check if a node has LOD configuration */
export function hasLOD(node: R3FNode): boolean {
  return !!(
    node.props.lod ||
    node.props.lodDistances ||
    node.props.lodEnabled ||
    node.props.lodConfig
  );
}
