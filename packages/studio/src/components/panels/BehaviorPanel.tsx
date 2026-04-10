'use client';

/**
 * BehaviorPanel — Controls embedded skeletal animations for gltfModel nodes.
 * Replaces timeline/node graphs with simple intuitive dropdowns for Character Models.
 */

import React, { useEffect, useState } from 'react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';

export function BehaviorPanel() {
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const nodeRefs = useSceneGraphStore((s) => s.nodeRefs);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const [availableClips, setAvailableClips] = useState<string[]>([]);
  const [activeState, setActiveState] = useState<string>('idle');

  const selectedNode = selectedObjectId ? nodes.find((n) => n.id === selectedObjectId) : null;
  const isRiggedModel = selectedNode?.type === 'gltfModel';
  const animTrait = selectedNode?.traits.find((t) => t.name === 'animation');

  useEffect(() => {
    if (selectedNode && selectedObjectId && isRiggedModel) {
      const ref = nodeRefs[selectedObjectId];
      if (ref && ref.userData && ref.userData.availableAnimations) {
        setAvailableClips(ref.userData.availableAnimations);
      } else {
        setAvailableClips([]);
      }

      if (animTrait && animTrait.properties.state) {
        setActiveState(animTrait.properties.state as string);
      } else {
        setActiveState('idle');
      }
    } else {
      setAvailableClips([]);
      setActiveState('idle');
    }
  }, [selectedNode, selectedObjectId, isRiggedModel, nodeRefs, animTrait]);

  const handleStateChange = (newState: string) => {
    if (selectedObjectId) {
      setActiveState(newState);
      setTraitProperty(selectedObjectId, 'animation', 'state', newState);
    }
  };

  if (!selectedObjectId || !selectedNode) {
    return (
      <div className="p-4 text-xs text-studio-muted">
        Select a rigged character model to edit its behavior.
      </div>
    );
  }

  if (!isRiggedModel) {
    return (
      <div className="p-4 text-xs text-studio-muted">
        Selected object is not a rigged character model.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text text-sm">
      <div className="border-b border-studio-border px-4 py-3">
        <h3 className="font-semibold flex items-center gap-2">
          <span>🧠</span> Character Behavior
        </h3>
        <p className="mt-1 text-xs text-studio-muted">
          Select intuitive animation states without complex timelines.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-studio-muted">Animation State</label>
          {availableClips.length > 0 ? (
            <select
              value={activeState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full appearance-none rounded-md border border-studio-border bg-studio-panel/50 px-3 py-2 text-sm text-studio-text outline-none transition hover:border-studio-accent focus:border-studio-accent focus:bg-studio-accent/10"
            >
              <option value="idle">Idle (Default)</option>
              {availableClips.map((clip) => (
                <option key={clip} value={clip}>
                  {clip}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-md border border-studio-border/50 bg-studio-panel/50 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-lg mb-2">🤷‍♂️</span>
              <p className="text-sm text-studio-text">No Animations Found</p>
              <p className="text-xs text-studio-muted mt-1">
                This GLB does not have embedded skeletal animations.
              </p>
            </div>
          )}
        </div>

        {availableClips.length > 0 && (
          <div className="rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-300/80 border border-emerald-500/20">
            <span className="mr-1 inline-block">✨</span>
            Animation updates instantly with zero rendering latency via the useSkeletalAnimation
            hook.
          </div>
        )}
      </div>
    </div>
  );
}
