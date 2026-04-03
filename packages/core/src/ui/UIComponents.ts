/**
 * UIComponents.ts
 *
 * Helper functions to create physics-based UI elements.
 * Generates HSPlusNode structures ready for the runtime.
 */

import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UIComponentConfig {
  id?: string;
  position?: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  color?: string;
  parent?: HSPlusNode;
}

export interface ButtonConfig extends UIComponentConfig {
  text: string;
  width?: number;
  height?: number;
  depth?: number;
  onClick?: string; // Event name
}

export interface TextConfig extends UIComponentConfig {
  text: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

export interface SliderConfig extends UIComponentConfig {
  value?: number; // 0-1
  width?: number; // Track length
  knobSize?: number;
  axis?: 'x' | 'y' | 'z';
}

export interface PanelConfig extends UIComponentConfig {
  width?: number;
  height?: number;
  depth?: number;
  children?: HSPlusNode[];
}

export interface TextInputConfig extends UIComponentConfig {
  width?: number;
  height?: number;
  placeholder?: string;
  text?: string;
}

// Simple ID generator
let uiCounter = 0;
const getID = (prefix: string) => `${prefix}_${++uiCounter}`;

export const createTextInput = (config: TextInputConfig): HSPlusNode => {
  return {
    id: config.id || getID('input'),
    type: 'entity',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      // Tag it so KeyboardSystem can find it or we can bind to it
      tag: 'text_input',
      text: config.text || '',
      placeholder: config.placeholder || 'Enter text...',
    },
    traits: new Map([
      [
        'render',
        { type: 'box', color: '#ffffff', size: [config.width || 0.5, config.height || 0.1, 0.01] },
      ],
      ['pressable', { distance: 0.005 }], // Click to focus
      ['collider', { type: 'box', size: [config.width || 0.5, config.height || 0.1, 0.01] }],
    ]),
    children: [
      {
        id: `${config.id || getID('input')}_text`,
        type: 'text',
        properties: {
          text: config.text || config.placeholder || '',
          color: '#000000',
          fontSize: 0.08,
          position: { x: -0.2, y: 0, z: 0.011 }, // Left align?
        },
      },
      {
        id: `${config.id || getID('input')}_cursor`,
        type: 'entity',
        properties: {
          position: { x: -0.2, y: 0, z: 0.012 },
          tag: 'cursor',
          visible: false, // Hidden by default, toggled by focus
        },
        traits: new Map([
          ['render', { type: 'box', color: '#3366ff', size: [0.004, 0.08, 0.001] }],
        ]),
      },
    ],
  } as unknown as HSPlusNode;
};

export const createText = (config: TextConfig): HSPlusNode => {
  return {
    id: config.id || getID('text'),
    type: 'text',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      text: config.text,
      color: config.color || '#ffffff',
      fontSize: config.fontSize || 0.1,
      align: config.align || 'center',
    },
    traits: new Map(),
    children: [],
  } as unknown as HSPlusNode;
};

export const createPanel = (config: PanelConfig): HSPlusNode => {
  return {
    id: config.id || getID('panel'),
    type: 'entity',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      scale: config.scale || { x: 1, y: 1, z: 1 },
    },
    traits: new Map([
      // Panel Visual
      [
        'render',
        {
          type: 'box',
          color: config.color || '#333',
          size: [config.width || 1, config.height || 1, config.depth || 0.01],
        },
      ],
      // Collider for physics blocking (optional)
      [
        'collider',
        { type: 'box', size: [config.width || 1, config.height || 1, config.depth || 0.01] },
      ],
    ]),
    children: config.children || [],
  } as unknown as HSPlusNode; // Cast due to strict type checks in test mocks vs real structs
};

export const createButton = (config: ButtonConfig): HSPlusNode => {
  const width = config.width || 0.2;
  const height = config.height || 0.1;
  const depth = config.depth || 0.02;

  const buttonNode: HSPlusNode = {
    id: config.id || getID('btn'),
    type: 'entity',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      // Initial state
    },
    traits: new Map([
      ['pressable', { distance: depth * 0.5, spring: 200 }],
      ['render', { type: 'box', color: config.color || '#007bff', size: [width, height, depth] }],
      ['collider', { type: 'box', size: [width, height, depth] }],
    ]),
    children: [
      {
        id: getID('btn_text'),
        type: 'text',
        properties: {
          text: config.text,
          position: { x: 0, y: 0, z: depth / 2 + 0.001 }, // Slightly in front
          color: '#ffffff',
          fontSize: 0.1,
        },
        traits: new Map(),
        children: [],
      } as unknown as HSPlusNode,
    ],
  } as unknown as HSPlusNode;

  return buttonNode;
};

export const createSlider = (config: SliderConfig): HSPlusNode => {
  const trackWidth = config.width || 0.3;
  const knobSize = config.knobSize || 0.05;
  const axis = config.axis || 'x';

  const trackID = config.id || getID('slider_track');
  const knobID = getID('slider_knob');

  // Track (Parent)
  // Knob (Child) - SlidableTrait handles the constraints relative to parent or start pos

  return {
    id: trackID,
    type: 'entity',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
    },
    traits: new Map([
      ['render', { type: 'box', color: '#555', size: [trackWidth, knobSize / 2, knobSize / 2] }],
    ]),
    children: [
      {
        id: knobID,
        type: 'entity',
        properties: {
          position: { x: 0, y: 0, z: 0 }, // Start at center? or min?
        },
        traits: new Map([
          ['slidable', { axis, length: trackWidth, value: config.value || 0.5 }],
          ['render', { type: 'sphere', color: config.color || '#ff0000', radius: knobSize }],
          ['collider', { type: 'sphere', radius: knobSize }],
          ['grabbable', {}], // Knob must be grabbable to slide!
        ]),
        children: [],
      } as unknown as HSPlusNode,
    ],
  } as unknown as HSPlusNode;
};

export interface ScrollViewConfig extends UIComponentConfig {
  width?: number;
  viewportHeight?: number;
  contentHeight?: number;
  scrollSpeed?: number;
  children?: HSPlusNode[];
}

export const createScrollView = (config: ScrollViewConfig): HSPlusNode => {
  return {
    id: config.id || getID('scrollview'),
    type: 'entity',
    properties: {
      position: config.position || { x: 0, y: 0, z: 0 },
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      scrollOffset: 0,
    },
    traits: new Map([
      [
        'scrollable',
        {
          axis: 'y',
          contentHeight: config.contentHeight || 2.0,
          viewportHeight: config.viewportHeight || 0.5,
          scrollSpeed: config.scrollSpeed || 1.0,
          friction: 0.92,
          bounceStrength: 0.3,
        },
      ],
      [
        'render',
        {
          type: 'box',
          color: config.color || '#222',
          size: [config.width || 0.5, config.viewportHeight || 0.5, 0.005],
        },
      ],
      [
        'collider',
        { type: 'box', size: [config.width || 0.5, config.viewportHeight || 0.5, 0.005] },
      ],
    ]),
    children: config.children || [],
  } as unknown as HSPlusNode;
};
