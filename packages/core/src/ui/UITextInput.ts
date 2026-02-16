
import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UITextInputConfig {
  text?: string;
  placeholder?: string;
  width?: number;
  height?: number;
  position?: Vector3;
  color?: string;
  textColor?: string;
  maxLength?: number;
}

export function createUITextInput(id: string, config: UITextInputConfig = {}): HSPlusNode {
  const width = config.width ?? 0.4;
  const height = config.height ?? 0.06;
  const bgColor = config.color ?? '#222222';
  const textColor = config.textColor ?? '#ffffff';
  const initialText = config.text ?? '';
  const placeholder = config.placeholder ?? 'Enter text...';

  // State for cursor and selection
  // We store these in the node's properties so they are reactive/accessible
  // selectionStart/End: indices into the text string
  
  return {
    id,
    type: 'ui_text_input',
    // Base visual: The container box
    properties: {
      mesh: 'plane',
      width,
      height,
      color: bgColor,
      position: config.position ?? { x: 0, y: 0, z: 0 },
      
      // Data accessible by KeyboardSystem
      data: {
          inputType: 'text',
          text: initialText,
          placeholder: placeholder,
          cursorIndex: initialText.length, // Default at end
          selectionStart: initialText.length,
          selectionEnd: initialText.length,
          isFocused: false
      },
      
      // Allow it to be clicked to gain focus
      // We use 'interactive' or 'pressable' via directives or traits
    },
    traits: new Map([
        ['pressable', { 
            // Minimal press depth, mostly for click detection
            travelDistance: 0.002, 
            triggerDistance: 0.001 
        }]
    ]),
    children: [
      // 1. Text Label (The value)
      {
        id: `${id}_text`,
        type: 'text',
        properties: {
          text: initialText || placeholder,
          color: initialText ? textColor : '#888888', // Dim if placeholder
          fontSize: 0.03,
          position: { x: -width / 2 + 0.02, y: 0, z: 0.005 }, // Left aligned with padding
          anchorX: 'left',
          anchorY: 'middle'
        }
      },
      // 2. Cursor (Vertical Bar)
      // Hidden by default, toggled via system when focused
      {
        id: `${id}_cursor`,
        type: 'ui_cursor',
        properties: {
          mesh: 'plane',
          width: 0.002,
          height: 0.04,
          color: '#00AAFF',
          position: { x: 0, y: 0, z: 0.006 },
          visible: false
        }
      }
    ],
    // Directives to handle focus logic could be added here or managed by system
    directives: [] 
  };
}
