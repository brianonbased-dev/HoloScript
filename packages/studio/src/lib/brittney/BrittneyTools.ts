/**
 * Brittney Tool Definitions + Executor
 *
 * These are the function-calling tools Brittney uses to
 * manipulate the scene graph store in real-time.
 */

import type { TraitConfig, SceneNode } from '@/lib/store';

// ─── Tool Schemas (OpenAI function-calling format) ────────────────────────────

export const BRITTNEY_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'add_trait',
      description: 'Add a trait to a specific scene object. Use the trait name from the HoloScript catalog (no @ prefix). Provide sensible default property values.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to modify' },
          trait_name: { type: 'string', description: 'Trait name without @ prefix, e.g. "physics", "ai_npc", "glow"' },
          properties: { type: 'object', description: 'Trait configuration properties as key/value pairs' },
        },
        required: ['object_name', 'trait_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_trait',
      description: 'Remove a trait from a scene object.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string' },
          trait_name: { type: 'string' },
        },
        required: ['object_name', 'trait_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_trait_property',
      description: 'Change a specific property value on an existing trait.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string' },
          trait_name: { type: 'string' },
          property_key: { type: 'string' },
          property_value: { description: 'New value — number, string, or boolean' },
        },
        required: ['object_name', 'trait_name', 'property_key', 'property_value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_object',
      description: 'Add a new object to the scene.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name for the object' },
          type: {
            type: 'string',
            enum: ['mesh', 'light', 'camera', 'audio', 'group', 'splat'],
          },
          position: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] position in world space',
          },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compose_traits',
      description: 'Compose multiple traits together on an object using HoloScript trait composition.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string' },
          trait_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of trait names to compose onto the object',
          },
        },
        required: ['object_name', 'trait_names'],
      },
    },
  },
];

// ─── Tool result type ─────────────────────────────────────────────────────────

export interface ToolResult {
  tool: string;
  success: boolean;
  message: string;
}

// ─── Tool executor ────────────────────────────────────────────────────────────

type StoreActions = {
  nodes: SceneNode[];
  addTrait: (nodeId: string, trait: TraitConfig) => void;
  removeTrait: (nodeId: string, traitName: string) => void;
  setTraitProperty: (nodeId: string, traitName: string, key: string, value: unknown) => void;
  addNode: (node: SceneNode) => void;
};

export function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  store: StoreActions
): ToolResult {
  try {
    switch (toolName) {
      case 'add_trait': {
        const objName = args.object_name as string;
        const traitName = args.trait_name as string;
        const properties = (args.properties as Record<string, unknown>) ?? {};
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node) return { tool: toolName, success: false, message: `Object "${objName}" not found in scene` };
        store.addTrait(node.id, { name: traitName, properties });
        return { tool: toolName, success: true, message: `Added @${traitName} to "${node.name}"` };
      }

      case 'remove_trait': {
        const objName = args.object_name as string;
        const traitName = args.trait_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node) return { tool: toolName, success: false, message: `Object "${objName}" not found` };
        store.removeTrait(node.id, traitName);
        return { tool: toolName, success: true, message: `Removed @${traitName} from "${node.name}"` };
      }

      case 'set_trait_property': {
        const objName = args.object_name as string;
        const traitName = args.trait_name as string;
        const key = args.property_key as string;
        const value = args.property_value;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node) return { tool: toolName, success: false, message: `Object "${objName}" not found` };
        store.setTraitProperty(node.id, traitName, key, value);
        return { tool: toolName, success: true, message: `Set ${traitName}.${key} = ${JSON.stringify(value)} on "${node.name}"` };
      }

      case 'create_object': {
        const id = `obj-${Date.now()}`;
        const pos = (args.position as [number, number, number]) ?? [0, 0, 0];
        store.addNode({
          id,
          name: args.name as string,
          type: (args.type as SceneNode['type']) ?? 'mesh',
          parentId: null,
          traits: [],
          position: pos,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
        return { tool: toolName, success: true, message: `Created "${args.name}" in the scene` };
      }

      case 'compose_traits': {
        const objName = args.object_name as string;
        const traitNames = args.trait_names as string[];
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node) return { tool: toolName, success: false, message: `Object "${objName}" not found` };
        for (const name of traitNames) {
          store.addTrait(node.id, { name, properties: {} });
        }
        return {
          tool: toolName,
          success: true,
          message: `Composed [${traitNames.map((t) => `@${t}`).join(' + ')}] onto "${node.name}"`,
        };
      }

      default:
        return { tool: toolName, success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { tool: toolName, success: false, message: String(err) };
  }
}
