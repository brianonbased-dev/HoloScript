/**
 * Brittney Tool Definitions + Executor
 *
 * These are the function-calling tools Brittney uses to
 * manipulate the scene graph store in real-time.
 */

import type { TraitConfig, SceneNode } from '@/lib/stores';
import { setNextHistoryLabel } from '@/lib/historyStore';

// ─── Tool Schemas (OpenAI function-calling format) ────────────────────────────

export const BRITTNEY_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'add_trait',
      description:
        'Add a trait to a specific scene object. Use the trait name from the HoloScript catalog (no @ prefix). Provide sensible default property values.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to modify' },
          trait_name: {
            type: 'string',
            description: 'Trait name without @ prefix, e.g. "physics", "ai_npc", "glow"',
          },
          properties: {
            type: 'object',
            description: 'Trait configuration properties as key/value pairs',
          },
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
      description:
        'Compose multiple traits together on an object using HoloScript trait composition.',
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
  {
    type: 'function' as const,
    function: {
      name: 'mount_scenario_panel',
      description: 'Mount a specific industry scenario panel in the Studio UI dynamically based on the user request. Known scenarios: astro-radio, soc, v6-swarm, etc',
      parameters: {
        type: 'object',
        properties: {
          scenario_id: { type: 'string', description: 'The exact string ID of the scenario to mount.' },
        },
        required: ['scenario_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_object',
      description: 'Remove an object from the scene by name. Deletes both the store node and the corresponding HoloScript code block.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to delete' },
        },
        required: ['object_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'move_object',
      description: 'Set the position of an object in the scene. Provide [x, y, z] world-space coordinates.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to move' },
          position: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] position in world space',
          },
        },
        required: ['object_name', 'position'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rotate_object',
      description: 'Set the rotation of an object in the scene. Provide [x, y, z] Euler angles in radians.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to rotate' },
          rotation: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] rotation in radians',
          },
        },
        required: ['object_name', 'rotation'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scale_object',
      description: 'Set the scale of an object in the scene. Provide [x, y, z] scale factors.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to scale' },
          scale: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, z] scale factors',
          },
        },
        required: ['object_name', 'scale'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rename_object',
      description: 'Change the display name of an object in the scene.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Current name of the scene object' },
          new_name: { type: 'string', description: 'New display name for the object' },
        },
        required: ['object_name', 'new_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_object',
      description: 'Clone an existing scene object with a new name. Copies all traits, position, rotation, and scale.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to clone' },
          new_name: { type: 'string', description: 'Name for the cloned object' },
        },
        required: ['object_name', 'new_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_objects',
      description: 'Return a list of all objects currently in the scene, including each object\'s name, type, traits, and position.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_object',
      description: 'Get the full details of a specific object in the scene by name, including type, traits, position, rotation, and scale.',
      parameters: {
        type: 'object',
        properties: {
          object_name: { type: 'string', description: 'Name of the scene object to inspect' },
        },
        required: ['object_name'],
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
  removeNode: (id: string) => void;
  updateNode: (id: string, patch: Partial<SceneNode>) => void;
  getCode: () => string;
  setCode: (code: string) => void;
  mountScenario?: (scenarioId: string) => void;
};

// ─── Code patch helpers ───────────────────────────────────────────────────────

/**
 * Inject a @trait block into the matching object block in HoloScript code.
 * If the object block is found, appends the trait before the closing `}`.
 * If not found, appends a new root-level object block.
 */
function codeAddTrait(
  code: string,
  objectName: string,
  traitName: string,
  properties: Record<string, unknown>
): string {
  const propLines = Object.entries(properties)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
    .join('\n');
  const traitBlock = propLines ? `  @${traitName} {\n${propLines}\n  }` : `  @${traitName}`;

  // Match: object "Name" { ... }  or object "Name" {  (open brace on same or next line)
  const objRegex = new RegExp(
    `((?:object|scene|group|light|camera)\\s+"${escapeRegex(objectName)}"\\s*\\{[^}]*)(\\})`,
    's'
  );
  if (objRegex.test(code)) {
    return code.replace(objRegex, (_, body, close) => `${body}\n${traitBlock}\n${close}`);
  }
  // Fallback: add new object block at end
  return code + `\nobject "${objectName}" {\n${traitBlock}\n}\n`;
}

function codeRemoveTrait(code: string, objectName: string, traitName: string): string {
  // Remove standalone @traitName or @traitName { ... } block inside the object
  const objRegex = new RegExp(
    `((?:object|scene|group|light|camera)\\s+"${escapeRegex(objectName)}"\\s*\\{)([\\s\\S]*?)(\\})`,
    'g'
  );
  return code.replace(objRegex, (match, open, body, close) => {
    // Remove trait line (standalone) or block
    const cleaned = body
      .replace(new RegExp(`\\n?\\s*@${escapeRegex(traitName)}\\s*\\{[^}]*\\}`, 'gs'), '')
      .replace(new RegExp(`\\n?\\s*@${escapeRegex(traitName)}(?!\\s*\\{)[^\\n]*`, 'g'), '');
    return `${open}${cleaned}${close}`;
  });
}

function codeSetTraitProperty(
  code: string,
  objectName: string,
  traitName: string,
  key: string,
  value: unknown
): string {
  // Within the matching object block, within the @traitName block, set key: value
  const objRegex = new RegExp(
    `((?:object|scene|group|light|camera)\\s+"${escapeRegex(objectName)}"\\s*\\{)([\\s\\S]*?)(\\})`,
    'g'
  );
  return code.replace(objRegex, (match, open, body, close) => {
    const traitBlockRegex = new RegExp(`(@${escapeRegex(traitName)}\\s*\\{)([^}]*)(\\})`, 's');
    if (traitBlockRegex.test(body)) {
      const patchedBody = body.replace(
        traitBlockRegex,
        (_m: string, tOpen: string, tBody: string, tClose: string) => {
          const keyRegex = new RegExp(`^(\\s*${escapeRegex(key)}\\s*:).*$`, 'm');
          const newVal = `    ${key}: ${JSON.stringify(value)}`;
          const patched = keyRegex.test(tBody)
            ? tBody.replace(keyRegex, newVal)
            : `${tBody}\n${newVal}`;
          return `${tOpen}${patched}${tClose}`;
        }
      );
      return `${open}${patchedBody}${close}`;
    }
    return match;
  });
}

function codeCreateObject(
  code: string,
  name: string,
  type: string,
  position: [number, number, number]
): string {
  const [x, y, z] = position;
  const posLine = x !== 0 || y !== 0 || z !== 0 ? `\n  position: [${x}, ${y}, ${z}]` : '';
  return code + `\n${type} "${name}" {${posLine}\n}\n`;
}

/**
 * Remove an entire object block from HoloScript code.
 */
function codeDeleteObject(code: string, objectName: string): string {
  const regex = new RegExp(
    `\\n?(?:object|scene|group|light|camera)\\s+"${escapeRegex(objectName)}"\\s*\\{[^}]*\\}\\n?`,
    'gs'
  );
  return code.replace(regex, '\n');
}

/**
 * Update a transform property (position, rotation, or scale) in the object block.
 * If the property line exists, replaces it. If not, inserts it.
 */
function codeSetTransform(
  code: string,
  objectName: string,
  property: 'position' | 'rotation' | 'scale',
  value: [number, number, number]
): string {
  const objRegex = new RegExp(
    `((?:object|scene|group|light|camera)\\s+"${escapeRegex(objectName)}"\\s*\\{)([\\s\\S]*?)(\\})`,
    'g'
  );
  return code.replace(objRegex, (match, open: string, body: string, close: string) => {
    const propRegex = new RegExp(`^(\\s*${property}\\s*:).*$`, 'm');
    const newVal = `  ${property}: [${value.join(', ')}]`;
    if (propRegex.test(body)) {
      return `${open}${body.replace(propRegex, newVal)}${close}`;
    }
    return `${open}${body}\n${newVal}\n${close}`;
  });
}

/**
 * Rename an object in HoloScript code by replacing its quoted name.
 */
function codeRenameObject(code: string, oldName: string, newName: string): string {
  const regex = new RegExp(
    `((?:object|scene|group|light|camera)\\s+)"${escapeRegex(oldName)}"`,
    'g'
  );
  return code.replace(regex, `$1"${newName}"`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
        if (!node)
          return {
            tool: toolName,
            success: false,
            message: `Object "${objName}" not found in scene`,
          };
          
        setNextHistoryLabel(`Add @${traitName} to "${node.name}"`);
        store.addTrait(node.id, { name: traitName, properties });
        // Patch source code
        store.setCode(codeAddTrait(store.getCode(), node.name, traitName, properties));
        return { tool: toolName, success: true, message: `Added @${traitName} to "${node.name}"` };
      }

      case 'remove_trait': {
        const objName = args.object_name as string;
        const traitName = args.trait_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Remove @${traitName} from "${node.name}"`);
        store.removeTrait(node.id, traitName);
        store.setCode(codeRemoveTrait(store.getCode(), node.name, traitName));
        return {
          tool: toolName,
          success: true,
          message: `Removed @${traitName} from "${node.name}"`,
        };
      }

      case 'set_trait_property': {
        const objName = args.object_name as string;
        const traitName = args.trait_name as string;
        const key = args.property_key as string;
        const value = args.property_value;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Update ${traitName}.${key} on "${node.name}"`);
        store.setTraitProperty(node.id, traitName, key, value);
        store.setCode(codeSetTraitProperty(store.getCode(), node.name, traitName, key, value));
        return {
          tool: toolName,
          success: true,
          message: `Set ${traitName}.${key} = ${JSON.stringify(value)} on "${node.name}"`,
        };
      }

      case 'create_object': {
        const id = `obj-${Date.now()}`;
        const name = args.name as string;
        const type = (args.type as SceneNode['type']) ?? 'mesh';
        const pos = (args.position as [number, number, number]) ?? [0, 0, 0];
        
        setNextHistoryLabel(`Create "${name}"`);
        store.addNode({
          id,
          name,
          type,
          parentId: null,
          traits: [],
          position: pos,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
        store.setCode(codeCreateObject(store.getCode(), name, type, pos));
        return { tool: toolName, success: true, message: `Created "${name}" in the scene` };
      }

      case 'compose_traits': {
        const objName = args.object_name as string;
        const traitNames = args.trait_names as string[];
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Compose [${traitNames.map(t => `@${t}`).join(', ')}] on "${node.name}"`);
        let patchedCode = store.getCode();
        for (const name of traitNames) {
          store.addTrait(node.id, { name, properties: {} });
          patchedCode = codeAddTrait(patchedCode, node.name, name, {});
        }
        store.setCode(patchedCode);
        return {
          tool: toolName,
          success: true,
          message: `Composed [${traitNames.map((t) => `@${t}`).join(' + ')}] onto "${node.name}"`,
        };
      }

      case 'mount_scenario_panel': {
        const scenarioId = args.scenario_id as string;
        if (store.mountScenario) {
          store.mountScenario(scenarioId);
          return { tool: toolName, success: true, message: `Successfully mapped Studio to Scenario: ${scenarioId}` };
        } else {
          return { tool: toolName, success: false, message: `No mount function bound to Brittney session.` };
        }
      }

      case 'delete_object': {
        const objName = args.object_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Delete "${node.name}"`);
        store.removeNode(node.id);
        store.setCode(codeDeleteObject(store.getCode(), node.name));
        return { tool: toolName, success: true, message: `Deleted "${node.name}" from the scene` };
      }

      case 'move_object': {
        const objName = args.object_name as string;
        const position = args.position as [number, number, number];
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Move "${node.name}"`);
        store.updateNode(node.id, { position });
        store.setCode(codeSetTransform(store.getCode(), node.name, 'position', position));
        return {
          tool: toolName,
          success: true,
          message: `Moved "${node.name}" to [${position.join(', ')}]`,
        };
      }

      case 'rotate_object': {
        const objName = args.object_name as string;
        const rotation = args.rotation as [number, number, number];
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Rotate "${node.name}"`);
        store.updateNode(node.id, { rotation });
        store.setCode(codeSetTransform(store.getCode(), node.name, 'rotation', rotation));
        return {
          tool: toolName,
          success: true,
          message: `Rotated "${node.name}" to [${rotation.join(', ')}]`,
        };
      }

      case 'scale_object': {
        const objName = args.object_name as string;
        const scale = args.scale as [number, number, number];
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        setNextHistoryLabel(`Scale "${node.name}"`);
        store.updateNode(node.id, { scale });
        store.setCode(codeSetTransform(store.getCode(), node.name, 'scale', scale));
        return {
          tool: toolName,
          success: true,
          message: `Scaled "${node.name}" to [${scale.join(', ')}]`,
        };
      }

      case 'rename_object': {
        const objName = args.object_name as string;
        const newName = args.new_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        const previousName = node.name;
        setNextHistoryLabel(`Rename "${previousName}" to "${newName}"`);
        store.setCode(codeRenameObject(store.getCode(), previousName, newName));
        store.updateNode(node.id, { name: newName });
        return {
          tool: toolName,
          success: true,
          message: `Renamed "${previousName}" to "${newName}"`,
        };
      }

      case 'duplicate_object': {
        const objName = args.object_name as string;
        const newName = args.new_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
          
        const cloneId = `obj-${Date.now()}`;
        setNextHistoryLabel(`Duplicate "${node.name}"`);
        const clonedNode: SceneNode = {
          ...node,
          id: cloneId,
          name: newName,
          traits: node.traits.map((t) => ({ ...t, properties: { ...t.properties } })),
          position: [...node.position] as [number, number, number],
          rotation: [...node.rotation] as [number, number, number],
          scale: [...node.scale] as [number, number, number],
        };
        store.addNode(clonedNode);
        store.setCode(
          codeCreateObject(store.getCode(), newName, clonedNode.type, clonedNode.position)
        );
        // Re-add all traits to the cloned object's code block
        let patchedCode = store.getCode();
        for (const trait of node.traits) {
          patchedCode = codeAddTrait(patchedCode, newName, trait.name, trait.properties);
        }
        store.setCode(patchedCode);
        return {
          tool: toolName,
          success: true,
          message: `Duplicated "${node.name}" as "${newName}"`,
        };
      }

      case 'list_objects': {
        const objects = store.nodes.map((n) => ({
          name: n.name,
          type: n.type,
          traits: n.traits.map((t) => t.name),
          position: n.position,
        }));
        return {
          tool: toolName,
          success: true,
          message: JSON.stringify(objects),
        };
      }

      case 'get_object': {
        const objName = args.object_name as string;
        const node = store.nodes.find((n) => n.name.toLowerCase() === objName.toLowerCase());
        if (!node)
          return { tool: toolName, success: false, message: `Object "${objName}" not found` };
        const detail = {
          name: node.name,
          type: node.type,
          traits: node.traits,
          position: node.position,
          rotation: node.rotation,
          scale: node.scale,
        };
        return {
          tool: toolName,
          success: true,
          message: JSON.stringify(detail),
        };
      }

      default:
        return { tool: toolName, success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { tool: toolName, success: false, message: String(err) };
  }
}
