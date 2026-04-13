import { HSPlusNode, Vector3 } from '@holoscript/core';
import { createUIButton } from './UIButton';
import { createUIPanel } from './UIPanel';

export interface VirtualKeyboardConfig {
  position?: Vector3;
  rotation?: Vector3;
  scale?: number;
}

const KEYS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '?'],
  ['Space'],
];

export function createVirtualKeyboard(id: string, config: VirtualKeyboardConfig): HSPlusNode {
  const scale = config.scale || 1.0;
  const keySize = 0.04 * scale;
  const gap = 0.005 * scale;

  const buttons: HSPlusNode[] = [];

  let startY = 0.15 * scale;

  KEYS.forEach((row, rowIndex) => {
    let startX = -(row.length * (keySize + gap)) / 2;

    row.forEach((key, colIndex) => {
      let width = keySize;
      if (key === 'Space') width = keySize * 5 + gap * 4;
      if (key === 'Enter' || key === 'Shift' || key === 'Backspace') width = keySize * 1.5;

      const btn = createUIButton(`${id}_key_${rowIndex}_${colIndex}`, {
        position: [startX + width / 2, startY, 0.02], // Inherit rotation from panel
        width: width,
        height: keySize,
        depth: 0.02 * scale,
        text: key,
        data: { key: key === 'Space' ? ' ' : key, type: 'keyboard_key' },
        color: '#444444',
        textColor: '#FFFFFF',
      });
      buttons.push(btn);

      startX += width + gap;
    });

    startY -= keySize + gap;
  });

  // Panel Container
  // Estimate size
  const panelWidth = 12 * (keySize + gap);
  const panelHeight = 6 * (keySize + gap);

  const keyboard = createUIPanel(
    id,
    {
      position: config.position,
      rotation: config.rotation,
      width: panelWidth,
      height: panelHeight,
      color: '#222224',
    },
    buttons
  );

  return keyboard;
}
