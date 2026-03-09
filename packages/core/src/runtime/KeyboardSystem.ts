/**
 * KeyboardSystem.ts
 *
 * Handles virtual keyboard interactions.
 * Listens for UI events and updates TextInput components.
 */

import { HSPlusRuntime } from '../types/HoloScriptPlus';

export class KeyboardSystem {
  private runtime: HSPlusRuntime;
  private focusedInputId: string | null = null;
  private cursorIndex: number = 0;
  private static readonly CHAR_WIDTH = 0.048; // Monospace approximation for fontSize 0.08
  private static readonly START_X = -0.2;

  constructor(runtime: HSPlusRuntime) {
    this.runtime = runtime;
    this.setupListeners();
  }

  private setupListeners() {}

  public handleEvent(event: string, payload: any) {
    if (event === 'ui_press_end') {
      const nodeId = payload.nodeId;

      // 1. Check if it's a Key
      if (nodeId.includes('_key_')) {
        const key = nodeId.split('_key_')[1];
        this.handleKeyPress(key);
      }
      // 2. Check if it's an Input (Focus)
      else if (nodeId.includes('input')) {
        // If switching focus, hide old cursor?
        if (this.focusedInputId && this.focusedInputId !== nodeId) {
          this.setCursorVisible(this.focusedInputId, false);
        }

        this.focusedInputId = nodeId;
        // Read current text to set cursor to end
        const text = this.getText(nodeId);
        this.cursorIndex = text.length;

        this.setCursorVisible(nodeId, true);
        this.updateCursorVisuals(nodeId);

        console.log(`[KeyboardSystem] Focused input: ${nodeId} (Cursor: ${this.cursorIndex})`);
      }
    }
  }

  private handleKeyPress(key: string) {
    if (!this.focusedInputId) return;

    let currentText = this.getText(this.focusedInputId);

    switch (key) {
      case 'LEFT':
        this.cursorIndex = Math.max(0, this.cursorIndex - 1);
        break;
      case 'RIGHT':
        this.cursorIndex = Math.min(currentText.length, this.cursorIndex + 1);
        break;
      case 'BACKSPACE':
        if (this.cursorIndex > 0) {
          const before = currentText.slice(0, this.cursorIndex - 1);
          const after = currentText.slice(this.cursorIndex);
          currentText = before + after;
          this.cursorIndex--;
        }
        break;
      case 'SPACE':
        currentText = this.insertAtCursor(currentText, ' ');
        this.cursorIndex++;
        break;
      default:
        if (key.length === 1) {
          currentText = this.insertAtCursor(currentText, key);
          this.cursorIndex++;
        }
        break;
    }

    this.updateInputState(this.focusedInputId, currentText);
  }

  private insertAtCursor(text: string, char: string): string {
    const before = text.slice(0, this.cursorIndex);
    const after = text.slice(this.cursorIndex);
    return before + char + after;
  }

  private getText(nodeId: string): string {
    const runtimeAny = this.runtime as any;
    const instance = runtimeAny.findInstanceById(nodeId);
    return (instance && instance.node.properties.text) || '';
  }

  private updateInputState(nodeId: string, text: string) {
    const runtimeAny = this.runtime as any;

    // Update Parent Property
    runtimeAny.updateNodeProperty(nodeId, 'text', text);

    // Update Child Text Node
    const instance = runtimeAny.findInstanceById(nodeId);
    if (instance && instance.children) {
      const textChild = instance.children.find((c: any) => c.node.type === 'text');
      if (textChild) {
        runtimeAny.updateNodeProperty(textChild.node.id, 'text', text);
      }
    }

    this.updateCursorVisuals(nodeId);
  }

  private setCursorVisible(nodeId: string, visible: boolean) {
    const runtimeAny = this.runtime as any;
    const instance = runtimeAny.findInstanceById(nodeId);
    if (instance && instance.children) {
      const cursorChild = instance.children.find((c: any) => c.node.properties.tag === 'cursor');
      if (cursorChild) {
        runtimeAny.updateNodeProperty(cursorChild.node.id, 'visible', visible);
      }
    }
  }

  private updateCursorVisuals(nodeId: string) {
    // Find cursor child
    const runtimeAny = this.runtime as any;
    const instance = runtimeAny.findInstanceById(nodeId);
    if (!instance || !instance.children) return;

    const cursorChild = instance.children.find((c: any) => c.node.properties.tag === 'cursor');
    if (cursorChild) {
      const newX = KeyboardSystem.START_X + this.cursorIndex * KeyboardSystem.CHAR_WIDTH;

      // We need to keep Y and Z same, just update X
      const currentPos = cursorChild.node.properties.position || { x: 0, y: 0, z: 0 };
      const newPos = { ...currentPos, x: newX };

      runtimeAny.updateNodeProperty(cursorChild.node.id, 'position', newPos);
    }
  }
}
