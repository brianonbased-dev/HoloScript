import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UIButtonConfig {
  data?: unknown;
  position?: Vector3;
  rotation?: Vector3;
  text?: string;
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  textColor?: string;
  onClick?: string; // Event name or script
}

export function createUIButton(id: string, config: UIButtonConfig): HSPlusNode {
  const width = config.width || 0.2;
  const height = config.height || 0.1;
  const depth = config.depth || 0.05;

  // Base Backplate (Static)
  const baseId = `${id}_base`;
  const buttonId = `${id}_button`;
  const textId = `${id}_text`;

  return {
    id: baseId,
    type: 'object',
    name: `ButtonBase_${id}`,
    properties: {
      position: config.position || [0, 0, 0],
      rotation: config.rotation || [0, 0, 0],
      geometry: 'box',
      scale: [width, height, 0.01 ], // Thin backplate
      color: '#333333',
      physics: { type: 'kinematic' }, // Anchored base
    },
    children: [
      {
        id: buttonId,
        type: 'object',
        name: `Button_${id}`,
        properties: {
          position: [0, 0, depth / 2], // Slightly protruding
          geometry: 'box',
          scale: [width * 0.9, height * 0.9, depth ],
          color: config.color || '#007AFF',
          physics: { type: 'dynamic', mass: 0.1 },
          data: config.data,
          distance: depth * 0.8, // Press depth
          triggerPoint: 0.5,
          stiffness: 200,
          damping: 10,
        },
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        traits: [
          {
            name: 'pressable',
            properties: {
              distance: depth * 0.8,
            },
          },
          // Optional: Collider/Collision trait if explicit collision needed defined separately
        ],
        children: [
          {
            id: textId,
            type: 'text',
            name: `ButtonText_${id}`,
            properties: {
              position: [0, 0, depth / 2 + 0.001], // On face
              text: config.text || 'Button',
              color: config.textColor || '#FFFFFF',
              fontSize: 0.05,
              anchorX: 'center',
              anchorY: 'middle',
            },
          },
        ],
      },
    ],
  };
}

