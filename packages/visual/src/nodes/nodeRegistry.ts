/**
 * HoloScript Visual - Node Registry
 *
 * Defines all 20+ core node types for visual programming.
 */

import type { NodeTypeDefinition } from '../types';

/**
 * Event Nodes (Green) - Triggers that start execution
 */
export const EVENT_NODES: NodeTypeDefinition[] = [
  {
    type: 'on_click',
    label: 'On Click',
    category: 'event',
    description: 'Triggered when the object is clicked',
    inputs: [],
    outputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'pointer', label: 'Pointer', type: 'object' },
    ],
    icon: '👆',
  },
  {
    type: 'on_hover',
    label: 'On Hover',
    category: 'event',
    description: 'Triggered when pointer hovers over object',
    inputs: [],
    outputs: [
      { id: 'enter', label: 'On Enter', type: 'flow' },
      { id: 'exit', label: 'On Exit', type: 'flow' },
    ],
    icon: '🎯',
  },
  {
    type: 'on_grab',
    label: 'On Grab',
    category: 'event',
    description: 'Triggered when object is grabbed (VR)',
    inputs: [],
    outputs: [
      { id: 'grab', label: 'On Grab', type: 'flow' },
      { id: 'release', label: 'On Release', type: 'flow' },
      { id: 'hand', label: 'Hand', type: 'object' },
    ],
    icon: '✊',
  },
  {
    type: 'on_tick',
    label: 'On Tick',
    category: 'event',
    description: 'Triggered every frame',
    inputs: [],
    outputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'deltaTime', label: 'Delta Time', type: 'number' },
    ],
    icon: '⏱️',
  },
  {
    type: 'on_timer',
    label: 'On Timer',
    category: 'event',
    description: 'Triggered after a delay',
    inputs: [],
    outputs: [{ id: 'flow', label: 'Execute', type: 'flow' }],
    properties: [
      { id: 'delay', label: 'Delay (ms)', type: 'number', default: 1000 },
      { id: 'repeat', label: 'Repeat', type: 'boolean', default: false },
    ],
    icon: '⏰',
  },
  {
    type: 'on_collision',
    label: 'On Collision',
    category: 'event',
    description: 'Triggered when objects collide',
    inputs: [],
    outputs: [
      { id: 'enter', label: 'On Enter', type: 'flow' },
      { id: 'exit', label: 'On Exit', type: 'flow' },
      { id: 'other', label: 'Other Object', type: 'object' },
    ],
    icon: '💥',
  },
  {
    type: 'on_trigger',
    label: 'On Trigger',
    category: 'event',
    description: 'Triggered when entering/exiting a trigger zone',
    inputs: [],
    outputs: [
      { id: 'enter', label: 'On Enter', type: 'flow' },
      { id: 'exit', label: 'On Exit', type: 'flow' },
      { id: 'other', label: 'Other Object', type: 'object' },
    ],
    icon: '🚪',
  },
];

/**
 * Action Nodes (Blue) - Perform actions in the scene
 */
export const ACTION_NODES: NodeTypeDefinition[] = [
  {
    type: 'play_sound',
    label: 'Play Sound',
    category: 'action',
    description: 'Play an audio file',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'url', label: 'URL', type: 'string' },
    ],
    outputs: [
      { id: 'flow', label: 'Then', type: 'flow' },
      { id: 'done', label: 'On Complete', type: 'flow' },
    ],
    properties: [
      { id: 'url', label: 'Sound URL', type: 'string', default: '' },
      { id: 'volume', label: 'Volume', type: 'number', default: 1 },
      { id: 'loop', label: 'Loop', type: 'boolean', default: false },
    ],
    icon: '🔊',
  },
  {
    type: 'play_animation',
    label: 'Play Animation',
    category: 'action',
    description: 'Play an animation on the object',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'target', label: 'Target', type: 'object' },
    ],
    outputs: [
      { id: 'flow', label: 'Then', type: 'flow' },
      { id: 'done', label: 'On Complete', type: 'flow' },
    ],
    properties: [
      { id: 'animation', label: 'Animation', type: 'string', default: 'default' },
      { id: 'duration', label: 'Duration (ms)', type: 'number', default: 1000 },
      { id: 'loop', label: 'Loop', type: 'boolean', default: false },
    ],
    icon: '🎬',
  },
  {
    type: 'set_property',
    label: 'Set Property',
    category: 'action',
    description: 'Set a property on an object',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'target', label: 'Target', type: 'object' },
      { id: 'value', label: 'Value', type: 'any' },
    ],
    outputs: [{ id: 'flow', label: 'Then', type: 'flow' }],
    properties: [{ id: 'property', label: 'Property', type: 'string', default: 'color' }],
    icon: '✏️',
  },
  {
    type: 'toggle',
    label: 'Toggle',
    category: 'action',
    description: 'Toggle a boolean property',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'target', label: 'Target', type: 'object' },
    ],
    outputs: [
      { id: 'flow', label: 'Then', type: 'flow' },
      { id: 'value', label: 'New Value', type: 'boolean' },
    ],
    properties: [{ id: 'property', label: 'Property', type: 'string', default: 'visible' }],
    icon: '🔄',
  },
  {
    type: 'spawn',
    label: 'Spawn',
    category: 'action',
    description: 'Create a new object instance',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'position', label: 'Position', type: 'object' },
    ],
    outputs: [
      { id: 'flow', label: 'Then', type: 'flow' },
      { id: 'spawned', label: 'Spawned', type: 'object' },
    ],
    properties: [{ id: 'template', label: 'Template', type: 'string', default: '' }],
    icon: '✨',
  },
  {
    type: 'destroy',
    label: 'Destroy',
    category: 'action',
    description: 'Remove an object from the scene',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'target', label: 'Target', type: 'object' },
    ],
    outputs: [{ id: 'flow', label: 'Then', type: 'flow' }],
    icon: '💨',
  },
];

/**
 * Logic Nodes (Yellow) - Control flow and logic
 */
export const LOGIC_NODES: NodeTypeDefinition[] = [
  {
    type: 'if_else',
    label: 'If/Else',
    category: 'logic',
    description: 'Branch based on a condition',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'condition', label: 'Condition', type: 'boolean' },
    ],
    outputs: [
      { id: 'true', label: 'True', type: 'flow' },
      { id: 'false', label: 'False', type: 'flow' },
    ],
    icon: '🔀',
  },
  {
    type: 'switch',
    label: 'Switch',
    category: 'logic',
    description: 'Branch based on a value',
    inputs: [
      { id: 'flow', label: 'Execute', type: 'flow' },
      { id: 'value', label: 'Value', type: 'any' },
    ],
    outputs: [
      { id: 'case1', label: 'Case 1', type: 'flow' },
      { id: 'case2', label: 'Case 2', type: 'flow' },
      { id: 'case3', label: 'Case 3', type: 'flow' },
      { id: 'default', label: 'Default', type: 'flow' },
    ],
    properties: [
      { id: 'case1', label: 'Case 1 Value', type: 'string', default: '' },
      { id: 'case2', label: 'Case 2 Value', type: 'string', default: '' },
      { id: 'case3', label: 'Case 3 Value', type: 'string', default: '' },
    ],
    icon: '🔢',
  },
  {
    type: 'and',
    label: 'And',
    category: 'logic',
    description: 'Logical AND operation',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    icon: '&',
  },
  {
    type: 'or',
    label: 'Or',
    category: 'logic',
    description: 'Logical OR operation',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    icon: '|',
  },
  {
    type: 'not',
    label: 'Not',
    category: 'logic',
    description: 'Logical NOT operation',
    inputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    icon: '!',
  },
  {
    type: 'compare',
    label: 'Compare',
    category: 'logic',
    description: 'Compare two values',
    inputs: [
      { id: 'a', label: 'A', type: 'any' },
      { id: 'b', label: 'B', type: 'any' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    properties: [
      {
        id: 'operator',
        label: 'Operator',
        type: 'select',
        default: '==',
        options: [
          { label: 'Equals', value: '==' },
          { label: 'Not Equals', value: '!=' },
          { label: 'Greater Than', value: '>' },
          { label: 'Less Than', value: '<' },
          { label: 'Greater or Equal', value: '>=' },
          { label: 'Less or Equal', value: '<=' },
        ],
      },
    ],
    icon: '⚖️',
  },
  {
    type: 'math',
    label: 'Math',
    category: 'logic',
    description: 'Perform math operation',
    inputs: [
      { id: 'a', label: 'A', type: 'number' },
      { id: 'b', label: 'B', type: 'number' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    properties: [
      {
        id: 'operator',
        label: 'Operation',
        type: 'select',
        default: '+',
        options: [
          { label: 'Add', value: '+' },
          { label: 'Subtract', value: '-' },
          { label: 'Multiply', value: '*' },
          { label: 'Divide', value: '/' },
          { label: 'Modulo', value: '%' },
          { label: 'Power', value: '**' },
        ],
      },
    ],
    icon: '🧮',
  },
];

/**
 * Data Nodes (Purple) - Data sources and transformations
 */
export const DATA_NODES: NodeTypeDefinition[] = [
  {
    type: 'get_property',
    label: 'Get Property',
    category: 'data',
    description: 'Get a property from an object',
    inputs: [{ id: 'target', label: 'Target', type: 'object' }],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    properties: [{ id: 'property', label: 'Property', type: 'string', default: 'position' }],
    icon: '📖',
  },
  {
    type: 'constant',
    label: 'Constant',
    category: 'data',
    description: 'A constant value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    properties: [
      {
        id: 'type',
        label: 'Type',
        type: 'select',
        default: 'string',
        options: [
          { label: 'String', value: 'string' },
          { label: 'Number', value: 'number' },
          { label: 'Boolean', value: 'boolean' },
          { label: 'Color', value: 'color' },
        ],
      },
      { id: 'value', label: 'Value', type: 'string', default: '' },
    ],
    icon: '📌',
  },
  {
    type: 'random',
    label: 'Random',
    category: 'data',
    description: 'Generate a random number',
    inputs: [
      { id: 'min', label: 'Min', type: 'number' },
      { id: 'max', label: 'Max', type: 'number' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    properties: [
      { id: 'min', label: 'Min', type: 'number', default: 0 },
      { id: 'max', label: 'Max', type: 'number', default: 1 },
      { id: 'integer', label: 'Integer', type: 'boolean', default: false },
    ],
    icon: '🎲',
  },
  {
    type: 'interpolate',
    label: 'Interpolate',
    category: 'data',
    description: 'Linear interpolation between values',
    inputs: [
      { id: 'from', label: 'From', type: 'number' },
      { id: 'to', label: 'To', type: 'number' },
      { id: 't', label: 'T (0-1)', type: 'number' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    icon: '📈',
  },
  {
    type: 'this',
    label: 'This',
    category: 'data',
    description: 'Reference to the current object',
    inputs: [],
    outputs: [{ id: 'object', label: 'Object', type: 'object' }],
    icon: '🎯',
  },
  {
    type: 'vector3',
    label: 'Vector3',
    category: 'data',
    description: 'Create a 3D vector',
    inputs: [
      { id: 'x', label: 'X', type: 'number' },
      { id: 'y', label: 'Y', type: 'number' },
      { id: 'z', label: 'Z', type: 'number' },
    ],
    outputs: [{ id: 'vector', label: 'Vector', type: 'object' }],
    properties: [
      { id: 'x', label: 'X', type: 'number', default: 0 },
      { id: 'y', label: 'Y', type: 'number', default: 0 },
      { id: 'z', label: 'Z', type: 'number', default: 0 },
    ],
    icon: '📐',
  },
];

/**
 * All node definitions
 */
export const ALL_NODES: NodeTypeDefinition[] = [
  ...EVENT_NODES,
  ...ACTION_NODES,
  ...LOGIC_NODES,
  ...DATA_NODES,
];

/**
 * Node registry for quick lookup
 */
export const NODE_REGISTRY = new Map<string, NodeTypeDefinition>(
  ALL_NODES.map((node) => [node.type, node])
);

/**
 * Get node definition by type
 */
export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return NODE_REGISTRY.get(type);
}

/**
 * Get all nodes in a category
 */
export function getNodesByCategory(category: string): NodeTypeDefinition[] {
  return ALL_NODES.filter((node) => node.category === category);
}
