'use client';
/**
 * usePipelineMaturitySync — Subscribes to `pipeline:setMaturity` bus events
 * and updates the scene graph store's `assetMaturity` field on matching nodes.
 *
 * This hook bridges the AssetPipelinePanel's emit calls to actual state mutations,
 * closing the gap where maturity toggle events fired into the void.
 *
 * Mount once in SceneRenderer (or CreatePage) to activate the pipeline.
 */

import { useEffect } from 'react';
import { useStudioBus } from './useStudioBus';
import { useSceneGraphStore } from '@/lib/stores';

interface SetMaturityEvent {
  nodeId: string;
  maturity: 'draft' | 'mesh' | 'final';
}

export function usePipelineMaturitySync() {
  const { on } = useStudioBus();
  const updateNode = useSceneGraphStore((s) => s.updateNode);

  useEffect(() => {
    const unsub = on('pipeline:setMaturity', (data: unknown) => {
      const event = data as SetMaturityEvent;
      if (!event?.nodeId || !event?.maturity) return;
      updateNode(event.nodeId, { assetMaturity: event.maturity });
    });
    return unsub;
  }, [on, updateNode]);
}
