import type { TraitContext } from '../traits/VRTraitSystem';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export interface KeyboardContext {
  getNode(nodeId: string): HSPlusNode | null;
  emit(event: string, payload: any): void;
}

export interface KeyboardData {
  type?: string;
  key?: string;
  inputType?: string;
  text?: string;
  selectionStart?: number;
  selectionEnd?: number;
  cursorIndex?: number;
  placeholder?: string;
  selectionAnchor?: number;
  [key: string]: any;
}

export class KeyboardSystem {
  private focusedNodeId: string | null = null;
  private symbolState: boolean = false;
  private shiftState: boolean = false;

  constructor(private context: KeyboardContext) {}

  // Called by Runtime
  handleEvent(event: string, payload: any) {
    if (
      event === 'ui_press_start' &&
      payload &&
      typeof payload === 'object' &&
      'nodeId' in payload
    ) {
      this.onKeyPress(payload.nodeId);
    }
  }

  private onKeyPress(nodeId: string) {
    const node = this.context.getNode(nodeId);
    if (!node || !node.properties || !node.properties.data) return;

    const data = node.properties.data as KeyboardData;
    // Check if we pressed a key on the virtual keyboard
    if (data.type === 'keyboard_key') {
      this.handleVirtualKey(data.key || '');
      return;
    }

    // Check if we clicked a text input to focus it
    if (data.inputType === 'text') {
      this.setFocus(nodeId);
      return;
    }
  }

  private handleVirtualKey(key: string) {
    if (key === 'Shift') {
      this.shiftState = !this.shiftState;
      return;
    }

    if (key === 'Enter') {
      this.inputChar('\n');
      return;
    }

    if (key === 'Backspace') {
      this.deleteChar();
      return;
    }

    if (key === 'ArrowLeft') {
      this.moveCursor(-1);
      return;
    }

    if (key === 'ArrowRight') {
      this.moveCursor(1);
      return;
    }

    let char = key;
    if (this.shiftState && char.length === 1) {
      char = char.toUpperCase();
    } else if (!this.shiftState && char.length === 1) {
      char = char.toLowerCase();
    }

    this.inputChar(char);
  }

  private getFocusedData(): KeyboardData | null {
    if (!this.focusedNodeId) return null;
    const node = this.context.getNode(this.focusedNodeId);
    if (!node || !node.properties || !node.properties.data) return null;
    return node.properties.data as KeyboardData;
  }

  private updateFocusVisuals() {
    if (!this.focusedNodeId) return;
    const node = this.context.getNode(this.focusedNodeId);
    if (!node || !node.properties) return;

    const data = node.properties.data as KeyboardData;
    if (!data) return;
    const text = data.text || '';
    const cursorIndex = data.cursorIndex ?? text.length;
    const placeholder = data.placeholder || '';

    // 1. Update text display
    const textNodeId = `${this.focusedNodeId}_text`;
    const textNode = this.context.getNode(textNodeId);
    if (textNode && textNode.properties) {
      textNode.properties.text = text.length > 0 ? text : placeholder;
      textNode.properties.color =
        text.length > 0 ? (node.properties.textColor ?? '#ffffff') : '#888888';
    }

    // 2. Update Cursor Position
    const cursorNode = this.context.getNode(`${this.focusedNodeId}_cursor`);

    // Simple metric: 0.018 per char (Monospaced approximation for now)
    const charWidth = 0.018;
    const startX = -(Number(node.properties.width) ?? 0.4) / 2 + 0.02; // Left padding

    if (cursorNode && cursorNode.properties) {
      cursorNode.properties.visible = true;
      const xPos = startX + cursorIndex * charWidth;
      cursorNode.properties.position = { x: xPos, y: 0, z: 0.006 };

      this.context.emit('property_changed', {
        nodeId: `${this.focusedNodeId}_cursor`,
        property: 'position',
        value: cursorNode.properties.position,
      });
      this.context.emit('property_changed', {
        nodeId: `${this.focusedNodeId}_cursor`,
        property: 'visible',
        value: true,
      });
    }

    // 3. Update Selection Highlight (Optional for now, but data is there)
    // If we had a highlight node, we would position/scale it here based on selectionStart/End.

    this.context.emit('property_changed', {
      nodeId: textNodeId,
      property: 'text',
      value: textNode?.properties?.text,
    });
  }

  private inputChar(char: string) {
    const data = this.getFocusedData();
    if (!data) return;

    const text = data.text || '';
    let start = data.selectionStart ?? data.cursorIndex ?? text.length;
    let end = data.selectionEnd ?? data.cursorIndex ?? text.length;

    // Normalize
    if (start > end) [start, end] = [end, start];

    // Replace selection or insert at cursor
    const newText = text.slice(0, start) + char + text.slice(end);

    data.text = newText;
    data.cursorIndex = start + char.length;
    data.selectionStart = data.cursorIndex;
    data.selectionEnd = data.cursorIndex;

    this.updateFocusVisuals();
  }

  private deleteChar() {
    const data = this.getFocusedData();
    if (!data) return;

    const text = data.text || '';
    let start = data.selectionStart ?? data.cursorIndex ?? text.length;
    let end = data.selectionEnd ?? data.cursorIndex ?? text.length;

    // Normalize
    if (start > end) [start, end] = [end, start];

    if (start !== end) {
      // Delete selection
      const newText = text.slice(0, start) + text.slice(end);
      data.text = newText;
      data.cursorIndex = start;
      data.selectionStart = start;
      data.selectionEnd = start;
    } else {
      // Delete backspace
      if (start > 0) {
        const newText = text.slice(0, start - 1) + text.slice(start);
        data.text = newText;
        data.cursorIndex = start - 1;
        data.selectionStart = start - 1;
        data.selectionEnd = start - 1;
      }
    }

    this.updateFocusVisuals();
  }

  private moveCursor(delta: number) {
    const data = this.getFocusedData();
    if (!data) return;

    const text = data.text || '';
    const oldCursor = data.cursorIndex ?? text.length;
    const newCursor = Math.max(0, Math.min(text.length, oldCursor + delta));

    if (this.shiftState) {
      if (data.selectionStart === data.selectionEnd) {
        data.selectionStart = Math.min(oldCursor, newCursor);
        data.selectionEnd = Math.max(oldCursor, newCursor);
      } else {
        if (data.selectionAnchor === undefined) {
          data.selectionAnchor = oldCursor;
        }
      }

      if (data.selectionAnchor === undefined) {
        data.selectionAnchor = oldCursor;
      }

      data.cursorIndex = newCursor;
      data.selectionStart = Math.min(data.selectionAnchor, newCursor);
      data.selectionEnd = Math.max(data.selectionAnchor, newCursor);
    } else {
      // Clear selection
      data.cursorIndex = newCursor;
      data.selectionStart = newCursor;
      data.selectionEnd = newCursor;
      data.selectionAnchor = newCursor;
    }

    this.updateFocusVisuals();
  }

  setFocus(nodeId: string) {
    // Blur previous
    if (this.focusedNodeId && this.focusedNodeId !== nodeId) {
      const prevCursor = this.context.getNode(`${this.focusedNodeId}_cursor`);
      if (prevCursor && prevCursor.properties) {
        prevCursor.properties.visible = false;
        this.context.emit('property_changed', {
          nodeId: `${this.focusedNodeId}_cursor`,
          property: 'visible',
          value: false,
        });
      }
    }

    this.focusedNodeId = nodeId;
    this.updateFocusVisuals();
  }
}
