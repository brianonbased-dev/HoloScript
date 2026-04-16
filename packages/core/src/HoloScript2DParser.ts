/**
 * HoloScript 2D Parser Extension
 *
 * Adds support for 2D UI elements to HoloScript for desktop/mobile apps.
 * Works alongside 3D VR syntax for hybrid applications.
 */

import { logger } from './logger';
import type { UI2DNode, UIElementType, Position2D, HoloScriptValue } from './types';

const UI_SECURITY_CONFIG = {
  maxUIElements: 500,
  maxNestingDepth: 10,
  maxPropertyLength: 500,
  allowedEventHandlers: ['onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur', 'onHover'],
};

export class HoloScript2DParser {
  private uiElements: Map<string, UI2DNode> = new Map();

  /**
   * Parse 2D UI element from HoloScript code
   */
  parse2DElement(code: string, depth: number = 0): UI2DNode | null {
    if (depth > UI_SECURITY_CONFIG.maxNestingDepth) {
      logger.warn('Max nesting depth exceeded', { depth });
      return null;
    }

    const trimmedCode = code.trim();
    const lines = trimmedCode.split('\n');
    if (lines.length === 0) return null;

    const firstLine = lines[0].trim();
    const headerMatch = firstLine.match(/^([\w-]+)\s+(\w+)\s*\{/);

    if (!headerMatch) {
      logger.warn('Invalid 2D element syntax', { line: firstLine });
      return null;
    }

    const [, elementType, name] = headerMatch;

    if (!this.isValidUIElementType(elementType)) {
      logger.warn('Invalid UI element type', { elementType });
      return null;
    }

    const startIndex = trimmedCode.indexOf('{');
    const endIndex = trimmedCode.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null;
    }

    const innerContent = trimmedCode.slice(startIndex + 1, endIndex).trim();
    const innerLines = this.splitIntoLogicalBlocks(innerContent);

    const properties: Record<string, unknown> = {};
    const events: Record<string, string> = {};
    const children: UI2DNode[] = [];

    for (const block of innerLines) {
      const line = block.trim();
      if (!line) continue;

      if (line.includes('{')) {
        const childNode = this.parse2DElement(line, depth + 1);
        if (childNode) children.push(childNode);
        continue;
      }

      const propMatch = line.match(/^(\w+):\s*(.+)$/);
      if (propMatch) {
        const [, key, rawValue] = propMatch;
        if (UI_SECURITY_CONFIG.allowedEventHandlers.includes(key)) {
          events[key] = rawValue.trim();
        } else {
          properties[key] = this.parsePropertyValue(rawValue);
        }
      }
    }

    const node: UI2DNode = {
      type: '2d-element',
      elementType: elementType as UIElementType,
      name,
      properties: {
        ...this.getDefaultProperties(elementType as UIElementType),
        ...properties,
      } as Record<string, HoloScriptValue>,
      events: Object.keys(events).length > 0 ? events : undefined,
      children: children.length > 0 ? children : undefined,
    };

    if (depth === 0) {
      if (this.uiElements.size >= UI_SECURITY_CONFIG.maxUIElements) {
        logger.warn('Max UI elements limit reached');
        return null;
      }
      this.uiElements.set(name, node);
    }

    return node;
  }

  private splitIntoLogicalBlocks(content: string): string[] {
    const blocks: string[] = [];
    let currentBlock = '';
    let bracketDepth = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '{') bracketDepth++;
      if (char === '}') bracketDepth--;

      currentBlock += char;

      if (bracketDepth === 0) {
        if (char === '\n' || i === content.length - 1) {
          const trimmed = currentBlock.trim();
          if (trimmed) blocks.push(trimmed);
          currentBlock = '';
        }
      }
    }

    const finalTrimmed = currentBlock.trim();
    if (finalTrimmed) blocks.push(finalTrimmed);

    return blocks;
  }

  /**
   * Parse voice command for 2D UI creation
   */
  parse2DVoiceCommand(command: string): UI2DNode | null {
    const tokens = command.toLowerCase().trim().split(/\s+/);

    if (tokens.length < 3) return null;

    const action = tokens[0];
    const elementType = tokens[1];
    const name = tokens[2];

    if (action !== 'create' && action !== 'add') return null;
    if (!this.isValidUIElementType(elementType)) return null;

    const node: UI2DNode = {
      type: '2d-element',
      elementType: elementType as UIElementType,
      name,
      properties: this.getDefaultProperties(elementType as UIElementType) as Record<
        string,
        HoloScriptValue
      >,
    };

    this.uiElements.set(name, node);
    return node;
  }

  /**
   * Parse gesture for 2D UI interaction
   */
  parse2DGesture(gestureType: string, position: Position2D): UI2DNode | null {
    switch (gestureType) {
      case 'tap':
        return this.createQuick2DElement('button', `button_${Date.now()}`, position);
      case 'double-tap':
        return this.createQuick2DElement('textinput', `input_${Date.now()}`, position);
      case 'long-press':
        return this.createQuick2DElement('panel', `panel_${Date.now()}`, position);
      default:
        return null;
    }
  }

  private createQuick2DElement(
    elementType: UIElementType,
    name: string,
    position: Position2D
  ): UI2DNode {
    const node: UI2DNode = {
      type: '2d-element',
      elementType,
      name,
      properties: {
        ...this.getDefaultProperties(elementType),
        x: position.x,
        y: position.y,
      },
    };

    this.uiElements.set(name, node);
    return node;
  }

  private isValidUIElementType(type: string): boolean {
    const validTypes: UIElementType[] = [
      'canvas',
      'button',
      'textinput',
      'panel',
      'text',
      'image',
      'list',
      'modal',
      'slider',
      'toggle',
      'dropdown',
      'flex-container',
      'grid-container',
      'scroll-view',
      'tab-view',
    ];
    return validTypes.includes(type as UIElementType);
  }

  private parsePropertyValue(value: string): unknown {
    const trimmed = value.trim();

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    if (!isNaN(parseFloat(trimmed)) && isFinite(parseFloat(trimmed))) {
      return parseFloat(trimmed);
    }

    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const items = trimmed
        .slice(1, -1)
        .split(',')
        .map((item) => this.parsePropertyValue(item.trim()));
      return items;
    }

    return trimmed;
  }

  private getDefaultProperties(elementType: UIElementType): Record<string, unknown> {
    const defaults: Record<UIElementType, Record<string, unknown>> = {
      canvas: { width: 800, height: 600, backgroundColor: '#ffffff' },
      button: {
        text: 'Button',
        width: 120,
        height: 40,
        backgroundColor: '#007bff',
        color: '#ffffff',
        borderRadius: 4,
      },
      textinput: {
        placeholder: '',
        width: 200,
        height: 36,
        fontSize: 14,
        borderColor: '#cccccc',
        borderWidth: 1,
        borderRadius: 4,
      },
      panel: { width: 200, height: 200, backgroundColor: '#f0f0f0', borderRadius: 0 },
      text: { content: 'Text', fontSize: 16, color: '#000000', fontFamily: 'sans-serif' },
      image: { src: '', width: 100, height: 100, fit: 'cover' },
      list: { items: [], itemHeight: 40, width: 200, height: 300 },
      modal: {
        title: 'Modal',
        width: 400,
        height: 300,
        visible: false,
        backgroundColor: '#ffffff',
      },
      slider: { min: 0, max: 100, value: 50, width: 200 },
      toggle: { checked: false, width: 50, height: 24 },
      dropdown: { options: [], selected: null, width: 200 },
      'flex-container': { direction: 'row', gap: 10, padding: 10 },
      'grid-container': { columns: 3, gap: 10, padding: 10 },
      'scroll-view': { width: 300, height: 400, scrollDirection: 'vertical' },
      'tab-view': { tabs: [], activeTabId: null, tabPosition: 'top', width: 400, height: 300 },
      dashboard: { title: 'Dashboard', width: 1200, height: 800, layout: 'grid', columns: 4 },
      card: { title: '', width: 300, height: 200, backgroundColor: '#ffffff', elevation: 2 },
      metric: { label: '', value: 0, unit: '', fontSize: 24, color: '#000000' },
      row: { height: 'auto', gap: 10, alignItems: 'center' },
      col: { width: 'auto', gap: 10, alignItems: 'stretch' },
    };
    return { ...defaults[elementType] };
  }

  getUIElements(): Map<string, UI2DNode> {
    return new Map(this.uiElements);
  }

  findElement(name: string): UI2DNode | null {
    return this.uiElements.get(name) || null;
  }

  clear(): void {
    this.uiElements.clear();
  }
}

export type { UI2DNode, UIElementType, Position2D };
