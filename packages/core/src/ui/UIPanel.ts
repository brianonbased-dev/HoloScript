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
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      geometry: 'box',
      scale: { x: width, y: height, z: 0.01 },
      color: config.color || '#222222',
      physics: { type: 'kinematic' }, // Rigid panel
    },
    children: children,
  };
}
