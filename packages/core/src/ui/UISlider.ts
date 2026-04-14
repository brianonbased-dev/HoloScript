import type { Vector3 } from '../types';
import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UISliderConfig {
  position?: Vector3;
  rotation?: Vector3;
  length?: number;
  axis?: 'x' | 'y' | 'z';
  min?: number;
  max?: number;
  initialValue?: number; // 0-1
  trackColor?: string;
  handleColor?: string;
}

export function createUISlider(id: string, config: UISliderConfig): HSPlusNode {
  const length = config.length || 0.3;
  const axis = config.axis || 'x';
  const trackId = `${id}_track`;
  const handleId = `${id}_handle`;

  // Determine scale based on axis
  const trackScale = [0.01, 0.01, 0.01];
  if (axis === 'x') trackScale[0] = length;
  if (axis === 'y') trackScale[1] = length;
  if (axis === 'z') trackScale[2] = length;

  return {
    id: trackId,
    type: 'object',
    name: `SliderTrack_${id}`,
    properties: {
      position: config.position || [0, 0, 0],
      rotation: config.rotation || [0, 0, 0],
      geometry: 'box', // Cylinder might be better, but box is simpler for now
      scale: trackScale,
      color: config.trackColor || '#555555',
      physics: { type: 'kinematic' },
    },
    children: [
      {
        id: handleId,
        type: 'object',
        name: `SliderHandle_${id}`,
        properties: {
          position: [0, 0, 0], // Center of track (0.5 value)
          geometry: 'sphere',
          scale: [0.03, 0.03, 0.03 ],
          color: config.handleColor || '#FFFFFF',
          physics: { type: 'dynamic', mass: 0.1 },
          axis: axis,
          length: length,
          value: config.initialValue || 0.5,
        },
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        traits: [
          {
            name: 'slidable',
            properties: {
              axis: axis,
              length: length,
            },
          },
          {
            name: 'grabbable', // Handle must be grabbable to move it!
            properties: {
              snap_to_hand: true,
              // Constraint will limit movement
            },
          },
        ],
      },
    ],
  };
}
