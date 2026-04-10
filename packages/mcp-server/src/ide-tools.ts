/**
 * HoloScript IDE Tools
 *
 * Migrated from Hololand/Brittney MCP to HoloScript MCP (free tier).
 * Provides LSP-style IDE features for AI coding agents.
 * Renamed from brittney_* -> hs_* prefix for HoloScript branding.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectFile {
  path: string;
  type: 'holo' | 'hsplus' | 'hs' | 'glb' | 'gltf' | 'other';
  objects?: string[];
  templates?: string[];
  traits?: string[];
  errors?: number;
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  code?: string;
  quickFixes?: QuickFix[];
}

export interface QuickFix {
  title: string;
  edit: {
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    newText: string;
  };
}

export interface CompletionItem {
  label: string;
  kind: 'trait' | 'property' | 'object' | 'template' | 'function' | 'keyword' | 'snippet';
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: 'plaintext' | 'snippet';
}

// =============================================================================
// TRAIT DOCUMENTATION (inline)
// =============================================================================

const traitDocs: Record<
  string,
  { description: string; params?: Record<string, string>; example: string }
> = {
  grabbable: {
    description: 'Makes object grabbable by VR controllers or hand tracking.',
    params: {
      snap_to_hand: 'Snap to hand position when grabbed (default: false)',
      two_handed: 'Requires both hands (default: false)',
      grab_distance: 'Max grab distance (default: 1.0)',
    },
    example: `orb sword {\n  @grabbable(snap_to_hand: true)\n  position: [0, 1, 0]\n}`,
  },
  throwable: {
    description: 'Allows grabbed object to be thrown with physics. Requires @grabbable.',
    params: {
      velocity_multiplier: 'Throw velocity multiplier (default: 1.0)',
      bounce: 'Bounce on collision (default: false)',
      max_velocity: 'Max throw speed (default: 50)',
    },
    example: `orb ball {\n  @grabbable\n  @throwable(velocity_multiplier: 1.5, bounce: true)\n}`,
  },
  collidable: {
    description: 'Enables collision detection.',
    params: {
      layer: 'Collision layer (e.g., "player", "enemy")',
      trigger: 'Trigger-only, no physics (default: false)',
    },
    example: `orb wall {\n  @collidable(layer: "solid")\n  scale: [10, 3, 0.5]\n}`,
  },
  physics: {
    description: 'Adds physics simulation (gravity, momentum, collisions).',
    params: {
      mass: 'Mass in kg (default: 1.0)',
      friction: 'Friction 0-1 (default: 0.5)',
      restitution: 'Bounciness 0-1 (default: 0.3)',
    },
    example: `orb crate {\n  @physics(mass: 10, friction: 0.8)\n  @collidable\n}`,
  },
  networked: {
    description: 'Synchronizes object state across network for multiplayer.',
    params: {
      sync_rate: 'Updates per second (e.g., "20hz")',
      interpolation: 'Smooth updates (default: true)',
    },
    example: `orb player {\n  @networked(sync_rate: "30hz")\n  position: synced\n}`,
  },
  glowing: {
    description: 'Makes object emit light/glow effect.',
    params: {
      intensity: 'Glow intensity 0-1 (default: 0.5)',
      color: 'Glow color hex',
      pulse: 'Pulsing (default: false)',
    },
    example: `orb crystal {\n  @glowing(intensity: 0.8, color: "#00ffff", pulse: true)\n}`,
  },
  clickable: {
    description: 'Object responds to click/point interaction.',
    params: { on_click: 'Handler function', highlight: 'Highlight on hover (default: true)' },
    example: `orb button {\n  @clickable(on_click: handleClick)\n  text: "Press Me"\n}`,
  },
  hoverable: {
    description: 'Object responds to gaze/pointer hover.',
    params: {
      on_enter: 'Hover start handler',
      on_exit: 'Hover end handler',
      delay: 'Trigger delay (default: 0)',
    },
    example: `orb tooltip_trigger {\n  @hoverable(on_enter: showTooltip, on_exit: hideTooltip)\n}`,
  },
  billboard: {
    description: 'Object always faces the camera/user.',
    params: { axis: 'Constraint: "all", "y", "x" (default: "all")' },
    example: `orb label {\n  @billboard(axis: "y")\n  text: "Always Visible"\n}`,
  },
  spatial_audio: {
    description: 'Audio emanates from object position with 3D spatialization.',
    params: {
      src: 'Audio file',
      loop: 'Loop (default: false)',
      volume: 'Volume 0-1',
      distance: 'Max distance (default: 10)',
    },
    example: `orb radio {\n  @spatial_audio(src: "music.mp3", loop: true, distance: 5)\n}`,
  },
  equippable: {
    description: 'Object can be equipped to a slot.',
    params: {
      slot: '"hand", "head", "body", "back"',
      on_equip: 'Equip handler',
      on_unequip: 'Remove handler',
    },
    example: `orb helmet {\n  @equippable(slot: "head")\n  @grabbable\n  model: "helmet.glb"\n}`,
  },
  destructible: {
    description: 'Object can be destroyed/broken.',
    params: {
      health: 'HP before destroy (default: 100)',
      on_destroy: 'Destroy handler',
      fragments: 'Debris count (default: 0)',
    },
    example: `orb crate {\n  @destructible(health: 50, fragments: 5)\n  @collidable\n}`,
  },
  animated: {
    description: 'Plays embedded animations from model file.',
    params: {
      clip: 'Animation clip name',
      loop: 'Loop (default: true)',
      speed: 'Speed multiplier (default: 1.0)',
    },
    example: `orb character {\n  @animated(clip: "idle", loop: true)\n  model: "character.glb"\n}`,
  },
};

// All traits organized by category
const allTraits: Record<string, string[]> = {
  interaction: [
    'grabbable',
    'throwable',
    'holdable',
    'clickable',
    'hoverable',
    'draggable',
    'selectable',
    'focusable',
    'pointable',
    'scalable',
    'rotatable',
  ],
  physics: ['collidable', 'physics', 'rigid', 'kinematic', 'trigger', 'gravity', 'buoyant'],
  visual: [
    'glowing',
    'emissive',
    'transparent',
    'reflective',
    'animated',
    'billboard',
    'sprite',
    'instanced',
    'pulse',
    'outline',
  ],
  networking: ['networked', 'synced', 'persistent', 'owned', 'host_only', 'local_only'],
  behavior: [
    'stackable',
    'attachable',
    'equippable',
    'consumable',
    'destructible',
    'respawnable',
    'breakable',
    'character',
    'patrol',
  ],
  spatial: ['anchor', 'tracked', 'world_locked', 'hand_tracked', 'eye_tracked', 'head_tracked'],
  audio: [
    'spatial_audio',
    'ambient',
    'voice_activated',
    'music_reactive',
    'reverb_zone',
    'voice_proximity',
  ],
  state: ['state', 'reactive', 'observable', 'computed', 'persistent_state'],
  advanced: [
    'teleport',
    'ui_panel',
    'particle_system',
    'weather',
    'day_night',
    'lod',
    'hand_tracking',
    'haptic',
    'portal',
    'mirror',
  ],
};

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const ideTools: Tool[] = [
  {
    name: 'hs_scan_project',
    description: `Scan workspace for all HoloScript files and return project context. Returns:
- All .holo, .hsplus, .hs files with their objects/templates
- All 3D assets (.glb, .gltf)
- Error counts per file
- Project structure overview

Use this first when working on a HoloScript project to understand the codebase.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace root path (defaults to cwd)' },
        includeAssets: { type: 'boolean', description: 'Include 3D assets (default: true)' },
        maxDepth: { type: 'number', description: 'Max directory depth (default: 5)' },
      },
    },
  },

  {
    name: 'hs_diagnostics',
    description: `Get LSP-style diagnostics for HoloScript code with quick fixes. Returns:
- Syntax errors with line/column
- Unknown trait warnings
- Missing property hints
- Quick fix suggestions for each issue`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code to diagnose' },
        filePath: { type: 'string', description: 'File path for context' },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info', 'all'],
          description: 'Filter by severity (default: all)',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'hs_autocomplete',
    description: `Get context-aware code completions at a cursor position. Returns:
- Trait suggestions after @
- Property suggestions inside objects
- Template names for "using"
- Object references in logic blocks`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Full HoloScript code' },
        line: { type: 'number', description: 'Cursor line (1-based)' },
        column: { type: 'number', description: 'Cursor column (1-based)' },
        triggerCharacter: { type: 'string', description: 'Trigger character ("@", ".", ":")' },
      },
      required: ['code', 'line', 'column'],
    },
  },

  {
    name: 'hs_refactor',
    description: `Perform refactoring operations on HoloScript code:
- **rename**: Rename object/template/function across code
- **extract_template**: Extract object into a reusable template
- **inline_template**: Inline template into objects
- **organize_imports**: Sort and clean up imports
- **group_objects**: Move objects into a spatial_group`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code to refactor' },
        operation: {
          type: 'string',
          enum: [
            'rename',
            'extract_template',
            'inline_template',
            'organize_imports',
            'group_objects',
          ],
        },
        target: { type: 'string', description: 'Target name (for rename: old name)' },
        newName: { type: 'string', description: 'New name (for rename/extract)' },
      },
      required: ['code', 'operation'],
    },
  },

  {
    name: 'hs_docs',
    description: `Get inline documentation for HoloScript constructs:
- **trait**: Full documentation for a @trait
- **property**: Documentation for an object property
- **keyword**: Syntax help for keywords
- **all_traits**: List all VR traits with brief descriptions`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look up (trait name, property, keyword)' },
        type: { type: 'string', enum: ['trait', 'property', 'keyword', 'example', 'all_traits'] },
        context: { type: 'string', description: 'Surrounding code for context' },
      },
      required: ['query'],
    },
  },

  {
    name: 'hs_code_action',
    description: `Get available code actions at a position (like VS Code lightbulb). Returns:
- Quick fixes for errors
- Refactoring suggestions
- Add missing traits
- Convert to template`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code' },
        line: { type: 'number', description: 'Line number (1-based)' },
        column: { type: 'number', description: 'Column number (1-based)' },
      },
      required: ['code', 'line'],
    },
  },

  {
    name: 'hs_hover',
    description: `Get hover information at a position (tooltip). Returns:
- Type information
- Trait documentation
- Object definition preview`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript code' },
        line: { type: 'number', description: 'Line number (1-based)' },
        column: { type: 'number', description: 'Column number (1-based)' },
      },
      required: ['code', 'line', 'column'],
    },
  },

  {
    name: 'hs_go_to_definition',
    description: `Find the definition of a symbol. Returns file path, line/column, and preview.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Current file code' },
        symbol: { type: 'string', description: 'Symbol name to find' },
        projectPath: { type: 'string', description: 'Project root for cross-file search' },
      },
      required: ['symbol'],
    },
  },

  {
    name: 'hs_find_references',
    description: `Find all references to a symbol across the project.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find references for' },
        projectPath: { type: 'string', description: 'Project root for cross-file search' },
        includeDeclaration: {
          type: 'boolean',
          description: 'Include the declaration (default: true)',
        },
      },
      required: ['symbol'],
    },
  },
];

// =============================================================================
// TOOL HANDLER
// =============================================================================

export async function handleIDETool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'hs_scan_project': {
      const rootPath = (args.path as string) || process.cwd();
      const includeAssets = args.includeAssets !== false;
      const maxDepth = (args.maxDepth as number) || 5;

      const files: ProjectFile[] = [];

      const scanDir = (dir: string, depth: number): void => {
        if (depth > maxDepth) return;

        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              scanDir(fullPath, depth + 1);
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              let type: ProjectFile['type'] = 'other';

              if (ext === '.holo') type = 'holo';
              else if (ext === '.hsplus') type = 'hsplus';
              else if (ext === '.hs') type = 'hs';
              else if (ext === '.glb') type = 'glb';
              else if (ext === '.gltf') type = 'gltf';
              else continue;

              if (!includeAssets && (type === 'glb' || type === 'gltf')) continue;

              const file: ProjectFile = {
                path: path.relative(rootPath, fullPath),
                type,
              };

              if (type === 'holo' || type === 'hsplus' || type === 'hs') {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const extract = (pattern: RegExp) =>
                    [...content.matchAll(pattern)].map((m) => m[1]);
                  file.objects = extract(/(?:orb|object)\s+["']?(\w+)/g);
                  file.templates = extract(/template\s+["'](\w+)/g);
                  file.traits = [...new Set(extract(/@(\w+)/g))];
                } catch {
                  file.errors = 1;
                }
              }

              files.push(file);
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      };

      scanDir(rootPath, 0);

      return {
        summary: {
          totalFiles: files.length,
          holoFiles: files.filter((f) => f.type === 'holo').length,
          hsplusFiles: files.filter((f) => f.type === 'hsplus').length,
          hsFiles: files.filter((f) => f.type === 'hs').length,
          assets: files.filter((f) => f.type === 'glb' || f.type === 'gltf').length,
          allObjects: [...new Set(files.flatMap((f) => f.objects || []))],
          allTemplates: [...new Set(files.flatMap((f) => f.templates || []))],
          allTraits: [...new Set(files.flatMap((f) => f.traits || []))],
        },
        files,
      };
    }

    case 'hs_diagnostics': {
      const code = args.code as string;
      const severity = (args.severity as string) || 'all';
      const diagnostics: Diagnostic[] = [];
      const lines = code.split('\n');

      lines.forEach((line, i) => {
        const traitMatches = line.matchAll(/@(\w+)/g);
        for (const match of traitMatches) {
          const trait = match[1];
          const allTraitNames = Object.values(allTraits).flat();
          if (!allTraitNames.includes(trait)) {
            diagnostics.push({
              file: (args.filePath as string) || '<input>',
              line: i + 1,
              column: match.index! + 1,
              severity: 'warning',
              message: `Unknown trait: @${trait}`,
              code: 'unknown-trait',
              quickFixes: [
                {
                  title: `Did you mean a similar trait?`,
                  edit: {
                    range: {
                      start: { line: i + 1, column: match.index! + 1 },
                      end: { line: i + 1, column: match.index! + 1 + trait.length + 1 },
                    },
                    newText: `@${findClosestTrait(trait)}`,
                  },
                },
              ],
            });
          }
        }

        if (line.includes('orb') && !line.match(/orb\s+\w+\s*\{?/)) {
          diagnostics.push({
            file: (args.filePath as string) || '<input>',
            line: i + 1,
            column: line.indexOf('orb') + 1,
            severity: 'error',
            message: 'orb must be followed by a name',
            code: 'syntax-error',
          });
        }
      });

      const filtered =
        severity === 'all' ? diagnostics : diagnostics.filter((d) => d.severity === severity);

      return { count: filtered.length, diagnostics: filtered };
    }

    case 'hs_autocomplete': {
      const code = args.code as string;
      const line = args.line as number;
      const column = args.column as number;
      const trigger = args.triggerCharacter as string;

      const lines = code.split('\n');
      const currentLine = lines[line - 1] || '';
      const beforeCursor = currentLine.slice(0, column - 1);

      const completions: CompletionItem[] = [];

      if (trigger === '@' || beforeCursor.endsWith('@')) {
        for (const [category, traits] of Object.entries(allTraits)) {
          for (const trait of traits) {
            const docs = traitDocs[trait];
            completions.push({
              label: trait,
              kind: 'trait',
              detail: `(${category}) VR trait`,
              documentation: docs?.description || `The @${trait} trait`,
              insertText: docs?.params ? `${trait}($1)` : trait,
              insertTextFormat: docs?.params ? 'snippet' : 'plaintext',
            });
          }
        }
      } else if (beforeCursor.match(/^\s+\w*$/)) {
        const properties = [
          { label: 'position', detail: '[x, y, z]' },
          { label: 'rotation', detail: '[rx, ry, rz]' },
          { label: 'scale', detail: 'number or [x, y, z]' },
          { label: 'color', detail: '"#hex" or [r, g, b]' },
          { label: 'model', detail: '"path.glb"' },
          { label: 'text', detail: '"label text"' },
        ];
        for (const prop of properties) {
          completions.push({
            label: prop.label,
            kind: 'property',
            detail: prop.detail,
            insertText: `${prop.label}: `,
          });
        }
      } else if (beforeCursor.match(/^\s*$/)) {
        const keywords = [
          'orb',
          'template',
          'composition',
          'environment',
          'spatial_group',
          'logic',
          'function',
          'connect',
          'object',
        ];
        for (const kw of keywords) {
          completions.push({
            label: kw,
            kind: 'keyword',
            detail: 'HoloScript keyword',
          });
        }
      }

      return { completions };
    }

    case 'hs_docs': {
      const query = (args.query as string).toLowerCase().replace('@', '');
      const type = (args.type as string) || 'trait';

      if (type === 'all_traits') {
        const result: Record<string, { traits: string[]; descriptions: Record<string, string> }> =
          {};
        for (const [category, traits] of Object.entries(allTraits)) {
          result[category] = {
            traits,
            descriptions: Object.fromEntries(
              traits.map((t) => [t, traitDocs[t]?.description || `The @${t} trait`])
            ),
          };
        }
        return result;
      }

      if (type === 'trait') {
        const docs = traitDocs[query];
        if (!docs) {
          const exists = Object.values(allTraits).flat().includes(query);
          if (exists) {
            return {
              trait: `@${query}`,
              description: `The @${query} VR trait. (Detailed docs in explain_trait tool)`,
              example: `orb obj {\n  @${query}\n  position: [0, 0, 0]\n}`,
            };
          }
          return {
            error: `Unknown trait: @${query}`,
            hint: 'Use hs_docs with type "all_traits" to see available traits',
          };
        }
        return { trait: `@${query}`, ...docs };
      }

      return { error: `Unsupported query type: ${type}`, supportedTypes: ['trait', 'all_traits'] };
    }

    case 'hs_refactor': {
      const code = args.code as string;
      const operation = args.operation as string;
      const target = args.target as string;
      const newName = args.newName as string;

      let result = code;
      const changes: string[] = [];

      switch (operation) {
        case 'rename':
          if (!target || !newName) {
            return { error: 'rename requires target and newName' };
          }
          const regex = new RegExp(`\\b${target}\\b`, 'g');
          const count = (code.match(regex) || []).length;
          result = code.replace(regex, newName);
          changes.push(`Renamed "${target}" -> "${newName}" (${count} occurrences)`);
          break;

        case 'extract_template':
          if (!target || !newName) {
            return {
              error: 'extract_template requires target (object name) and newName (template name)',
            };
          }
          const objMatch = code.match(new RegExp(`orb\\s+${target}\\s*\\{([^}]+)\\}`, 's'));
          if (objMatch) {
            const template = `template "${newName}" {\n${objMatch[1]}\n}\n\n`;
            const replacement = `object "${target}" using "${newName}" {\n  position: [0, 0, 0]\n}`;
            result = template + code.replace(objMatch[0], replacement);
            changes.push(`Extracted orb "${target}" into template "${newName}"`);
          }
          break;

        case 'organize_imports':
          const imports = [...code.matchAll(/import\s+.+/g)].map((m) => m[0]);
          const uniqueImports = [...new Set(imports)].sort();
          let cleanCode = code;
          imports.forEach((imp) => {
            cleanCode = cleanCode.replace(imp + '\n', '');
          });
          result =
            uniqueImports.join('\n') + (uniqueImports.length ? '\n\n' : '') + cleanCode.trim();
          changes.push(`Organized ${imports.length} imports`);
          break;
      }

      return { code: result, changes };
    }

    case 'hs_hover': {
      const code = args.code as string;
      const line = args.line as number;
      const column = args.column as number;

      const lines = code.split('\n');
      const currentLine = lines[line - 1] || '';

      const traitMatch = currentLine.match(/@(\w+)/);
      if (
        traitMatch &&
        column >= currentLine.indexOf('@') &&
        column <= currentLine.indexOf('@') + traitMatch[0].length
      ) {
        const trait = traitMatch[1];
        const docs = traitDocs[trait];
        return {
          content: docs
            ? `**@${trait}**\n\n${docs.description}\n\n\`\`\`hsplus\n${docs.example}\n\`\`\``
            : `**@${trait}** - VR trait`,
          range: {
            start: { line, column: currentLine.indexOf('@') + 1 },
            end: { line, column: currentLine.indexOf('@') + traitMatch[0].length + 1 },
          },
        };
      }

      return { content: null };
    }

    case 'hs_go_to_definition':
    case 'hs_find_references':
    case 'hs_code_action':
      return {
        note: 'Full implementation requires project indexing. Use hs_scan_project first for context.',
        symbol: args.symbol,
      };

    default:
      throw new Error(`Unknown IDE tool: ${name}`);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function findClosestTrait(input: string): string {
  const allTraitNames = Object.values(allTraits).flat();
  const normalized = input.toLowerCase();

  // Exact prefix match
  const prefixMatch = allTraitNames.find((t) => t.startsWith(normalized));
  if (prefixMatch) return prefixMatch;

  // Substring match
  const subMatch = allTraitNames.find((t) => t.includes(normalized) || normalized.includes(t));
  if (subMatch) return subMatch;

  // First 3 chars match
  const shortMatch = allTraitNames.find((t) => t.substring(0, 3) === normalized.substring(0, 3));
  if (shortMatch) return shortMatch;

  return 'grabbable'; // safe default
}
