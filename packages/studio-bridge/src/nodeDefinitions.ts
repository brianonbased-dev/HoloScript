/**
 * @holoscript/studio-bridge - Built-in Node Definitions
 *
 * A self-contained copy of the visual node type definitions, so the bridge
 * package does not depend on the @holoscript/visual package at runtime
 * (which is a React/Vite package that may not resolve in pure Node contexts).
 *
 * These definitions mirror @holoscript/visual's nodeRegistry.ts and are used
 * by ASTToVisual to create properly-typed visual nodes from AST input.
 */

import type { PortDefinition, NodeCategory } from './types';

// ============================================================================
// Node Definition Type (local version of NodeTypeDefinition)
// ============================================================================

export interface BridgeNodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties?: BridgePropertyDefinition[];
}

export interface BridgePropertyDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'color';
  default?: string | number | boolean;
  options?: { label: string; value: string }[];
}

// ============================================================================
// Event Nodes
// ============================================================================

const EVENT_NODES: BridgeNodeDefinition[] = [
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
  },
];

// ============================================================================
// Action Nodes
// ============================================================================

const ACTION_NODES: BridgeNodeDefinition[] = [
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
  },
];

// ============================================================================
// Logic Nodes
// ============================================================================

const LOGIC_NODES: BridgeNodeDefinition[] = [
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
        ],
      },
    ],
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
        ],
      },
    ],
  },
  {
    type: 'and',
    label: 'And',
    category: 'logic',
    description: 'Logical AND',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
  },
  {
    type: 'or',
    label: 'Or',
    category: 'logic',
    description: 'Logical OR',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
  },
  {
    type: 'not',
    label: 'Not',
    category: 'logic',
    description: 'Logical NOT',
    inputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
  },
];

// ============================================================================
// Data Nodes
// ============================================================================

const DATA_NODES: BridgeNodeDefinition[] = [
  {
    type: 'get_property',
    label: 'Get Property',
    category: 'data',
    description: 'Get a property from an object',
    inputs: [{ id: 'target', label: 'Target', type: 'object' }],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    properties: [{ id: 'property', label: 'Property', type: 'string', default: 'position' }],
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
    ],
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
  },
  {
    type: 'this',
    label: 'This',
    category: 'data',
    description: 'Reference to the current object',
    inputs: [],
    outputs: [{ id: 'object', label: 'Object', type: 'object' }],
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
  },
];

// ============================================================================
// Registry
// ============================================================================

/**
 * All bridge node definitions
 */
export const BRIDGE_NODE_DEFINITIONS: BridgeNodeDefinition[] = [
  ...EVENT_NODES,
  ...ACTION_NODES,
  ...LOGIC_NODES,
  ...DATA_NODES,
];

/**
 * Node registry for quick lookup
 */
const BRIDGE_NODE_REGISTRY = new Map<string, BridgeNodeDefinition>(
  BRIDGE_NODE_DEFINITIONS.map((node) => [node.type, node])
);

/**
 * Get a bridge node definition by type
 */
export function getBridgeNodeDefinition(type: string): BridgeNodeDefinition | undefined {
  return BRIDGE_NODE_REGISTRY.get(type);
}
