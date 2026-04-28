import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UIPanelConfig {
  position?: Vector3;
  rotation?: Vector3;
  width?: number;
  height?: number;
  color?: string;
  padding?: number;
}

export function createUIPanel(
  id: string,
  config: UIPanelConfig,
  children: HSPlusNode[] = []
): HSPlusNode {
  const width = config.width || 0.5;
  const height = config.height || 0.5;

  return {
    id: id,
    type: 'object',
    name: `Panel_${id}`,
    properties: {
      position: config.position || [0, 0, 0],
      rotation: config.rotation || [0, 0, 0],
      geometry: 'box',
      scale: [width, height, 0.01 ],
      color: config.color || '#222222',
      physics: { type: 'kinematic' }, // Rigid panel
    },
    children: children,
  };
}

