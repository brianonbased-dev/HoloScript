/**
 * useLODBridge — React hook that connects LODBridge (core)
 * to LODMeshNode (renderer).
 *
 * Computes LOD chains for entities and provides the LODConfig
 * that drei's Detailed component needs for distance-based switching.
 *
 * Usage:
 * ```tsx
 * function SceneMesh({ node }: { node: R3FNode }) {
 *   const { distances, config, isDraft } = useLODBridge(node);
 *   if (isDraft) return <MeshNode node={node} draftMode />;
 *   return <LODMeshNode node={node} distances={distances} />;
 * }
 * ```
 */

import { _useEffect, useRef, useMemo } from 'react';
import { LODBridge, type LODChain } from '@holoscript/engine';
import { _useThree, _useFrame } from '@react-three/fiber';
import type { R3FNode } from '@holoscript/core';

/** Shared LODBridge instance (singleton per renderer lifecycle) */
let sharedBridge: LODBridge | null = null;

function getSharedBridge(): LODBridge {
  if (!sharedBridge) {
    sharedBridge = new LODBridge({
      maxCacheSize: 512,
      defaultDistances: [0, 15, 40, 80],
      defaultTransition: 'instant',
    });
  }
  return sharedBridge;
}

/** Reset the shared bridge (for testing or scene clear) */
export function resetLODBridge(): void {
  if (sharedBridge) {
    sharedBridge.clear();
    sharedBridge = null;
  }
}

export interface UseLODBridgeResult {
  /** LOD distance thresholds for drei's Detailed component */
  distances: [number, number, number];
  /** Whether this entity is in draft maturity (skip LOD) */
  isDraft: boolean;
  /** The full LOD chain (null if not computed) */
  chain: LODChain | null;
  /** Number of LOD levels available */
  levelCount: number;
}

/**
 * Hook that bridges core LOD computation to the renderer.
 * Automatically computes LOD chains based on node's assetMaturity.
 */
export function useLODBridge(
  node: R3FNode,
  customDistances?: [number, number, number]
): UseLODBridgeResult {
  const bridge = getSharedBridge();
  const entityId = node.id || `node-${node.props.hsType || 'unknown'}`;
  const maturity = node.assetMaturity || 'mesh';
  const isDraft = maturity === 'draft';

  // Track previous entityId to invalidate on change
  const prevIdRef = useRef(entityId);
  if (prevIdRef.current !== entityId) {
    bridge.invalidate(prevIdRef.current);
    prevIdRef.current = entityId;
  }

  const result = useMemo(() => {
    // Draft entities skip LOD entirely
    if (isDraft) {
      return {
        distances: (customDistances || [0, 25, 50]) as [number, number, number],
        isDraft: true,
        chain: null,
        levelCount: 1,
      };
    }

    // Check if chain already cached
    const chain = bridge.getChain(entityId);

    if (!chain) {
      // For R3F renderer, we don't have raw MeshData from the node props.
      // The bridge is designed for programmatic use where MeshData is available.
      // In the renderer, we use the LODConfig to set distances for drei's Detailed.
      // Return defaults when no mesh data is available for computation.
      return {
        distances: (customDistances || [0, 25, 50]) as [number, number, number],
        isDraft: false,
        chain: null,
        levelCount: 3,
      };
    }

    // Use computed distances from the chain
    const d = chain.distances;
    const distances: [number, number, number] = [d[0] ?? 0, d[1] ?? 25, d[2] ?? 50];

    return {
      distances,
      isDraft: false,
      chain,
      levelCount: chain.levels.length,
    };
  }, [entityId, isDraft, customDistances]);

  return result;
}
