/**
 * HoloScript2DParser Tests
 *
 * Tests for the 2D UI element parser that adds desktop/mobile
 * UI support to HoloScript. Tests parse2DElement, voice commands,
 * gesture parsing, element management, and security limits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScript2DParser } from './HoloScript2DParser';

describe('HoloScript2DParser', () => {
  let parser: HoloScript2DParser;

  beforeEach(() => {
    parser = new HoloScript2DParser();
  });

  // =========================================================================
  // parse2DElement - Basic Elements
  // =========================================================================
  describe('parse2DElement', () => {
    it('should parse a button element', () => {
      const code = `button myButton {
  text: "Click me"
  width: 200
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('button');
      expect(node!.name).toBe('myButton');
      expect(node!.properties.text).toBe('Click me');
      expect(node!.properties.width).toBe(200);
    });

    it('should parse a panel element', () => {
      const code = `panel mainPanel {
  width: 400
  height: 300
  backgroundColor: "#f0f0f0"
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('panel');
      expect(node!.name).toBe('mainPanel');
    });

    it('should parse a text element', () => {
      const code = `text label {
  content: "Hello World"
  fontSize: 24
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('text');
    });

    it('should parse a textinput element', () => {
      const code = `textinput nameField {
  placeholder: "Enter name"
  width: 300
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('textinput');
    });

    it('should parse a slider element', () => {
      const code = `slider volume {
  min: 0
  max: 100
  value: 75
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('slider');
      expect(node!.properties.value).toBe(75);
    });

    it('should parse a toggle element', () => {
      const code = `toggle darkMode {
  checked: true
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('toggle');
      expect(node!.properties.checked).toBe(true);
    });

    it('should parse an image element', () => {
      const code = `image avatar {
  src: "avatar.png"
  width: 64
  height: 64
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('image');
    });

    it('should parse a canvas element', () => {
      const code = `canvas drawArea {
  width: 800
  height: 600
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('canvas');
    });

    it('should parse a modal element', () => {
      const code = `modal settings {
  title: "Settings"
  visible: false
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('modal');
    });

    it('should parse layout containers', () => {
      const flexCode = `flex-container row {
  direction: "row"
  gap: 10
}`;
      const gridCode = `grid-container grid {
  columns: 3
  gap: 8
}`;
      const flexNode = parser.parse2DElement(flexCode);
      const gridNode = parser.parse2DElement(gridCode);
      expect(flexNode).not.toBeNull();
      expect(flexNode!.elementType).toBe('flex-container');
      expect(gridNode).not.toBeNull();
      expect(gridNode!.elementType).toBe('grid-container');
    });
  });

  // =========================================================================
  // Default Properties
  // =========================================================================
  describe('default properties', () => {
    it('should apply default button properties', () => {
      const node = parser.parse2DElement('button btn { }');
      expect(node).not.toBeNull();
      expect(node!.properties.backgroundColor).toBe('#007bff');
      expect(node!.properties.color).toBe('#ffffff');
      expect(node!.properties.borderRadius).toBe(4);
    });

    it('should apply default canvas properties', () => {
      const node = parser.parse2DElement('canvas c { }');
      expect(node).not.toBeNull();
      expect(node!.properties.width).toBe(800);
      expect(node!.properties.height).toBe(600);
    });

    it('should override defaults with explicit values', () => {
      const node = parser.parse2DElement('button btn {\n  width: 500\n}');
      expect(node).not.toBeNull();
      expect(node!.properties.width).toBe(500);
    });
  });

  // =========================================================================
  // Event Handlers
  // =========================================================================
  describe('event handlers', () => {
    it('should parse onClick event', () => {
      const code = `button actionBtn {
  text: "Go"
  onClick: handleClick()
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.events).toBeDefined();
      expect(node!.events!.onClick).toBe('handleClick()');
    });

    it('should parse multiple events', () => {
      const code = `textinput search {
  onFocus: showDropdown()
  onBlur: hideDropdown()
  onChange: filterResults()
}`;
      const node = parser.parse2DElement(code);
      expect(node).not.toBeNull();
      expect(node!.events).toBeDefined();
      expect(node!.events!.onFocus).toBe('showDropdown()');
      expect(node!.events!.onBlur).toBe('hideDropdown()');
      expect(node!.events!.onChange).toBe('filterResults()');
    });
  });

  // =========================================================================
  // Property Value Parsing
  // =========================================================================
  describe('property value parsing', () => {
    it('should parse string values', () => {
      const node = parser.parse2DElement('text t {\n  content: "hello"\n}');
      expect(node!.properties.content).toBe('hello');
    });

    it('should parse single-quoted strings', () => {
      const node = parser.parse2DElement("text t {\n  content: 'hello'\n}");
      expect(node!.properties.content).toBe('hello');
    });

    it('should parse number values', () => {
      const node = parser.parse2DElement('slider s {\n  value: 42\n}');
      expect(node!.properties.value).toBe(42);
    });

    it('should parse float values', () => {
      const node = parser.parse2DElement('slider s {\n  value: 3.14\n}');
      expect(node!.properties.value).toBe(3.14);
    });

    it('should parse boolean true', () => {
      const node = parser.parse2DElement('toggle t {\n  checked: true\n}');
      expect(node!.properties.checked).toBe(true);
    });

    it('should parse boolean false', () => {
      const node = parser.parse2DElement('toggle t {\n  checked: false\n}');
      expect(node!.properties.checked).toBe(false);
    });

    it('should parse array values', () => {
      const node = parser.parse2DElement('list l {\n  items: [1, 2, 3]\n}');
      expect(node!.properties.items).toEqual([1, 2, 3]);
    });
  });

  // =========================================================================
  // Invalid Input
  // =========================================================================
  describe('invalid input', () => {
    it('should return null for empty string', () => {
      expect(parser.parse2DElement('')).toBeNull();
    });

    it('should return null for invalid syntax', () => {
      expect(parser.parse2DElement('not valid syntax here')).toBeNull();
    });

    it('should return null for invalid element type', () => {
      expect(parser.parse2DElement('bogusType name { }')).toBeNull();
    });

    it('should return null for missing braces', () => {
      expect(parser.parse2DElement('button name')).toBeNull();
    });

    it('should return null when max nesting depth exceeded', () => {
      const result = parser.parse2DElement('button deep { }', 11);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Voice Commands
  // =========================================================================
  describe('parse2DVoiceCommand', () => {
    it('should create element from "create" command', () => {
      const node = parser.parse2DVoiceCommand('create button submitBtn');
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('button');
      // Voice parser lowercases all tokens
      expect(node!.name).toBe('submitbtn');
    });

    it('should create element from "add" command', () => {
      const node = parser.parse2DVoiceCommand('add panel sidebar');
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('panel');
      expect(node!.name).toBe('sidebar');
    });

    it('should return null for unknown action', () => {
      const node = parser.parse2DVoiceCommand('delete button old');
      expect(node).toBeNull();
    });

    it('should return null for invalid element type', () => {
      const node = parser.parse2DVoiceCommand('create invalid thing');
      expect(node).toBeNull();
    });

    it('should return null for too few tokens', () => {
      expect(parser.parse2DVoiceCommand('create')).toBeNull();
      expect(parser.parse2DVoiceCommand('create button')).toBeNull();
    });

    it('should register voice-created elements', () => {
      parser.parse2DVoiceCommand('create button test');
      const elements = parser.getUIElements();
      expect(elements.has('test')).toBe(true);
    });
  });

  // =========================================================================
  // Gesture Parsing
  // =========================================================================
  describe('parse2DGesture', () => {
    it('should create button on tap gesture', () => {
      const node = parser.parse2DGesture('tap', { x: 100, y: 200 });
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('button');
      expect(node!.properties.x).toBe(100);
      expect(node!.properties.y).toBe(200);
    });

    it('should create textinput on double-tap gesture', () => {
      const node = parser.parse2DGesture('double-tap', { x: 50, y: 50 });
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('textinput');
    });

    it('should create panel on long-press gesture', () => {
      const node = parser.parse2DGesture('long-press', { x: 0, y: 0 });
      expect(node).not.toBeNull();
      expect(node!.elementType).toBe('panel');
    });

    it('should return null for unknown gesture', () => {
      const node = parser.parse2DGesture('swipe', { x: 0, y: 0 });
      expect(node).toBeNull();
    });
  });

  // =========================================================================
  // Element Management (getUIElements, findElement, clear)
  // =========================================================================
  describe('element management', () => {
    it('should register parsed elements', () => {
      parser.parse2DElement('button btn1 { }');
      parser.parse2DElement('panel panel1 { }');
      const elements = parser.getUIElements();
      expect(elements.size).toBe(2);
      expect(elements.has('btn1')).toBe(true);
      expect(elements.has('panel1')).toBe(true);
    });

    it('should find element by name', () => {
      parser.parse2DElement('button myBtn { }');
      const found = parser.findElement('myBtn');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('myBtn');
    });

    it('should return null for non-existent element', () => {
      expect(parser.findElement('nope')).toBeNull();
    });

    it('should clear all elements', () => {
      parser.parse2DElement('button a { }');
      parser.parse2DElement('panel b { }');
      expect(parser.getUIElements().size).toBe(2);
      parser.clear();
      expect(parser.getUIElements().size).toBe(0);
    });

    it('should return a copy of elements map', () => {
      parser.parse2DElement('button x { }');
      const elements = parser.getUIElements();
      elements.delete('x');
      // Original should still have it
      expect(parser.findElement('x')).not.toBeNull();
    });
  });

  // =========================================================================
  // Node Structure
  // =========================================================================
  describe('node structure', () => {
    it('should have correct type field', () => {
      const node = parser.parse2DElement('button b { }');
      expect(node!.type).toBe('2d-element');
    });

    it('should omit events when none are defined', () => {
      const node = parser.parse2DElement('button b { }');
      expect(node!.events).toBeUndefined();
    });

    it('should omit children when none exist', () => {
      const node = parser.parse2DElement('button b { }');
      expect(node!.children).toBeUndefined();
    });
  });

  // =========================================================================
  // Valid UI Element Types
  // =========================================================================
  describe('valid UI element types', () => {
    const validTypes = [
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

    for (const type of validTypes) {
      it(`should accept "${type}" as valid type`, () => {
        const code = `${type} test { }`;
        const node = parser.parse2DElement(code);
        expect(node).not.toBeNull();
        expect(node!.elementType).toBe(type);
      });
    }
  });
});
