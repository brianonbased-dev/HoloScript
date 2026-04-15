/**
 * HoloScript Linter
 *
 * Static analysis tool for HoloScript (.holo) and HoloScript+ (.hsplus) files.
 * Enforces best practices, catches errors, and improves code quality.
 *
 * @package @hololand/holoscript-linter
 * @version 2.0.0
 */

import { HoloScriptPlusParser } from '@holoscript/core';

// Import rule modules
import { noDeadCodeRule } from './rules/no-dead-code';
import { deprecationWarningRule } from './rules/deprecation-warning';

// Import and re-export types from standalone types file
export * from './types';
import type {
  Severity,
  LintDiagnostic,
  LintResult,
  LinterConfig,
  RuleConfig,
  Rule,
  RuleContext,
  LintASTNode,
} from './types';

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_CONFIG: LinterConfig = {
  rules: {
    // Syntax rules
    'no-syntax-errors': 'error',
    'valid-trait-syntax': 'error',
    'no-empty-blocks': 'warn',
    'no-unreachable-code': 'error',

    // Naming rules
    'composition-naming': 'warn',
    'object-naming': 'warn',
    'template-naming': 'warn',
    'variable-naming': 'warn',
    'function-naming': 'warn',

    // Best practices
    'no-dead-code': 'warn',
    'deprecation-warning': 'warn',
    'no-unused-templates': 'warn',
    'no-duplicate-ids': 'error',
    'prefer-templates': 'warn',
    'no-magic-numbers': 'warn',
    'no-console-in-production': 'warn',
    'prefer-const': 'warn',
    'no-var': 'error',

    // Performance
    'no-deep-nesting': 'warn',
    'limit-objects-per-group': 'warn',
    'no-expensive-operations-in-loop': 'warn',
    'prefer-event-delegation': 'info',

    // Style
    'consistent-spacing': 'info',
    'sorted-properties': 'info',
    'max-line-length': 'warn',
    'trailing-comma': 'info',
    quotes: 'info',

    // Type safety
    'no-implicit-any': 'warn',
    'explicit-return-type': 'info',
    'no-unsafe-type-assertion': 'warn',
  },
  ignorePatterns: ['node_modules/**', 'dist/**', '*.min.holo'],
  maxErrors: 100,
  typeChecking: true,
};

// =============================================================================
// BUILT-IN RULES
// =============================================================================

const BUILT_IN_RULES: Rule[] = [
  // Dead code detection (from external rule module)
  noDeadCodeRule,

  // Deprecation warnings (from external rule module)
  deprecationWarningRule,

  // No duplicate IDs
  {
    id: 'no-duplicate-ids',
    name: 'No Duplicate IDs',
    description: 'Ensure all object IDs are unique within a composition',
    category: 'syntax',
    defaultSeverity: 'error',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const ids = new Map<string, { line: number; column: number }>();

      const checkNodes = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.id) {
            if (ids.has(node.id)) {
              const first = ids.get(node.id)!;
              diagnostics.push({
                ruleId: 'no-duplicate-ids',
                message: `Duplicate ID "${node.id}" (first defined on line ${first.line})`,
                severity: 'error',
                line: node.loc?.start.line || 1,
                column: node.loc?.start.column || 1,
              });
            } else {
              ids.set(node.id, {
                line: node.loc?.start.line || 1,
                column: node.loc?.start.column || 1,
              });
            }
          }
          if (node.children) checkNodes(node.children);
        }
      };

      checkNodes(context.ast.children || []);
      return diagnostics;
    },
  },

  // Composition naming
  {
    id: 'composition-naming',
    name: 'Composition Naming',
    description: 'Compositions should use PascalCase names',
    category: 'naming',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const checkNodes = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.type === 'composition' && node.id) {
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(node.id)) {
              const pascal = node.id[0].toUpperCase() + node.id.slice(1);
              diagnostics.push({
                ruleId: 'composition-naming',
                message: `Composition name "${node.id}" should use PascalCase`,
                severity: 'warning',
                line: node.loc?.start.line || 1,
                column: node.loc?.start.column || 1,
                fix: {
                  range: {
                    start: 0, // This needs to be absolute offset, which we don't have easily in current HSPlusNode
                    end: 0,
                  },
                  replacement: pascal,
                },
              });
            }
          }
          if (node.children) checkNodes(node.children);
        }
      };

      checkNodes(context.ast.children || []);
      return diagnostics;
    },
  },

  // No deep nesting
  {
    id: 'no-deep-nesting',
    name: 'No Deep Nesting',
    description: 'Avoid deeply nested structures for better performance',
    category: 'performance',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const maxDepth = (context.config['maxDepth'] as number) || 5;
      let currentDepth = 0;
      let maxReached = 0;
      let maxLine = 0;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        currentDepth += opens - closes;

        if (currentDepth > maxReached) {
          maxReached = currentDepth;
          maxLine = i + 1;
        }
      }

      if (maxReached > maxDepth) {
        diagnostics.push({
          ruleId: 'no-deep-nesting',
          message: `Nesting depth ${maxReached} exceeds maximum of ${maxDepth}`,
          severity: 'warning',
          line: maxLine,
          column: 1,
        });
      }

      return diagnostics;
    },
  },

  // Valid trait syntax
  {
    id: 'valid-trait-syntax',
    name: 'Valid Trait Syntax',
    description: 'Ensure trait annotations use valid syntax',
    category: 'syntax',
    defaultSeverity: 'error',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const validTraits = [
        // Interaction
        'grabbable',
        'throwable',
        'pointable',
        'hoverable',
        'scalable',
        'rotatable',
        'stackable',
        'snappable',
        'breakable',
        'haptic',
        'stretchable',
        'moldable',
        // Humanoid/Avatar
        'skeleton',
        'body',
        'face',
        'expressive',
        'hair',
        'clothing',
        'hands',
        'character_voice',
        'locomotion',
        'poseable',
        'morph',
        'networked',
        'proactive',
        // Media/Social
        'recordable',
        'streamable',
        'camera',
        'video',
        'trackable',
        'survey',
        'abtest',
        'heatmap',
        'shareable',
        'embeddable',
        'qr',
        'collaborative',
        // Environment
        'plane_detection',
        'mesh_detection',
        'anchor',
        'persistent_anchor',
        'shared_anchor',
        'geospatial',
        'occlusion',
        'light_estimation',
        // Input
        'eye_tracking',
        'hand_tracking',
        'controller',
        'spatial_accessory',
        'body_tracking',
        'face_tracking',
        // Accessibility
        'accessible',
        'alt_text',
        'spatial_audio_cue',
        'sonification',
        'haptic_cue',
        'magnifiable',
        'high_contrast',
        'motion_reduced',
        'subtitle',
        'screen_reader',
        // Volumetric/GPU
        'gaussian_splat',
        'nerf',
        'volumetric_video',
        'point_cloud',
        'photogrammetry',
        'compute',
        'gpu_particle',
        'gpu_physics',
        'gpu_buffer',
        // Digital Twin/IOT
        'sensor',
        'digital_twin',
        'data_binding',
        'alert',
        'heatmap_3d',
        // Autonomous Agent
        'behavior_tree',
        'goal_oriented',
        'llm_agent',
        'memory',
        'perception',
        'emotion',
        'dialogue',
        'faction',
        'patrol',
        // Audio
        'ambisonics',
        'hrtf',
        'reverb_zone',
        'audio_occlusion',
        'audio_portal',
        'audio_material',
        'head_tracked_audio',
        'spatial_audio',
        'voice',
        'reactive_audio',
        // Interop/Web3
        'usd',
        'gltf',
        'fbx',
        'material_x',
        'scene_graph',
        'nft',
        'token_gated',
        'wallet',
        'marketplace',
        'portable',
        // Physics
        'cloth',
        'fluid',
        'soft_body',
        'rope',
        'chain',
        'wind',
        'buoyancy',
        'destruction',
      ];

      const checkTraits = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.directives) {
            for (const dir of node.directives) {
              if (dir.type === 'trait') {
                if (!validTraits.includes(dir.name)) {
                  diagnostics.push({
                    ruleId: 'valid-trait-syntax',
                    message: `Unknown or unsupported trait "@${dir.name}"`,
                    severity: 'warning',
                    line: dir.loc?.start.line || 1,
                    column: dir.loc?.start.column || 1,
                  });
                }
              }
            }
          }
          if (node.children) checkTraits(node.children);
        }
      };

      if (context.ast.children) checkTraits(context.ast.children);
      return diagnostics;
    },
  },

  // Deprecated traits
  {
    id: 'deprecated-trait',
    name: 'Deprecated Trait',
    description: 'Avoid using deprecated traits',
    category: 'best-practice',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const deprecated = {
        talkable: 'Use @voice instead',
        collision: 'Use @trigger or @physics instead',
      };

      const checkNodes = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.directives) {
            for (const dir of node.directives) {
              if (dir.type === 'trait' && dir.name in deprecated) {
                diagnostics.push({
                  ruleId: 'deprecated-trait',
                  message: `Trait "@${dir.name}" is deprecated. ${deprecated[dir.name as keyof typeof deprecated]}`,
                  severity: 'warning',
                  line: dir.loc?.start.line || 1,
                  column: dir.loc?.start.column || 1,
                });
              }
            }
          }
          if (node.children) checkNodes(node.children);
        }
      };

      if (context.ast.children) checkNodes(context.ast.children);
      return diagnostics;
    },
  },

  // No unused templates
  {
    id: 'no-unused-templates',
    name: 'No Unused Templates',
    description: 'Templates should be used at least once',
    category: 'best-practice',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const templates = new Map<string, number>();
      const usages = new Set<string>();

      const templateDefRegex = /template\s+["']([^"']+)["']/g;
      const templateUseRegex = /using\s+["']([^"']+)["']/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];

        let match;
        while ((match = templateDefRegex.exec(line)) !== null) {
          templates.set(match[1], i + 1);
        }
        while ((match = templateUseRegex.exec(line)) !== null) {
          usages.add(match[1]);
        }
      }

      for (const [name, line] of templates) {
        if (!usages.has(name)) {
          diagnostics.push({
            ruleId: 'no-unused-templates',
            message: `Template "${name}" is defined but never used`,
            severity: 'warning',
            line,
            column: 1,
          });
        }
      }

      return diagnostics;
    },
  },

  // No empty blocks
  {
    id: 'no-empty-blocks',
    name: 'No Empty Blocks',
    description: 'Disallow empty code blocks',
    category: 'syntax',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const emptyBlockRegex = /\{\s*\}/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = emptyBlockRegex.exec(line)) !== null) {
          diagnostics.push({
            ruleId: 'no-empty-blocks',
            message: 'Empty block - add content or remove the block',
            severity: 'warning',
            line: i + 1,
            column: match.index + 1,
            fix: {
              range: { start: match.index, end: match.index + match[0].length },
              replacement: '{ /* add body */ }',
            },
          });
        }
      }

      return diagnostics;
    },
  },

  // Variable naming (camelCase)
  {
    id: 'variable-naming',
    name: 'Variable Naming',
    description: 'Variables should use camelCase',
    category: 'naming',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const varRegex = /\b(const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = varRegex.exec(line)) !== null) {
          const name = match[2];
          // Check for camelCase (starts lowercase, no underscores except start)
          if (!/^[a-z_][a-zA-Z0-9]*$/.test(name) && !name.startsWith('_')) {
            diagnostics.push({
              ruleId: 'variable-naming',
              message: `Variable "${name}" should use camelCase`,
              severity: 'warning',
              line: i + 1,
              column: match.index + match[1].length + 2,
            });
          }
        }
      }

      return diagnostics;
    },
  },

  // Function naming (camelCase)
  {
    id: 'function-naming',
    name: 'Function Naming',
    description: 'Functions should use camelCase',
    category: 'naming',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const funcRegex = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = funcRegex.exec(line)) !== null) {
          const name = match[1];
          if (!/^[a-z_][a-zA-Z0-9]*$/.test(name)) {
            diagnostics.push({
              ruleId: 'function-naming',
              message: `Function "${name}" should use camelCase`,
              severity: 'warning',
              line: i + 1,
              column: match.index + 10,
            });
          }
        }
      }

      return diagnostics;
    },
  },

  // No magic numbers
  {
    id: 'no-magic-numbers',
    name: 'No Magic Numbers',
    description: 'Avoid unexplained numeric literals',
    category: 'best-practice',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const allowedNumbers = new Set(['0', '1', '-1', '2', '100', '1000']);
      const numberRegex = /(?<![a-zA-Z_])(-?\d+\.?\d*)(?![a-zA-Z_])/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        // Skip comments and property definitions
        if (line.trim().startsWith('//') || line.includes(':')) continue;

        let match;
        while ((match = numberRegex.exec(line)) !== null) {
          const num = match[1];
          if (!allowedNumbers.has(num) && !line.includes('const') && !line.includes('position')) {
            diagnostics.push({
              ruleId: 'no-magic-numbers',
              message: `Magic number ${num} - consider extracting to a named constant`,
              severity: 'warning',
              line: i + 1,
              column: match.index + 1,
            });
          }
        }
      }

      return diagnostics;
    },
  },

  // Prefer const
  {
    id: 'prefer-const',
    name: 'Prefer Const',
    description: 'Use const for variables that are never reassigned',
    category: 'best-practice',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const letDeclarations = new Map<string, { line: number; column: number }>();
      const reassignments = new Set<string>();

      const letRegex = /\blet\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
      const assignRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*[+\-*\/]?=/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = letRegex.exec(line)) !== null) {
          letDeclarations.set(match[1], { line: i + 1, column: match.index + 1 });
        }
        while ((match = assignRegex.exec(line)) !== null) {
          if (!line.includes('let ' + match[1]) && !line.includes('const ' + match[1])) {
            reassignments.add(match[1]);
          }
        }
      }

      for (const [name, loc] of letDeclarations) {
        if (!reassignments.has(name)) {
          diagnostics.push({
            ruleId: 'prefer-const',
            message: `"${name}" is never reassigned. Use const instead of let`,
            severity: 'warning',
            line: loc.line,
            column: loc.column,
            fix: {
              range: { start: loc.column - 1, end: loc.column + 2 },
              replacement: 'const',
            },
          });
        }
      }

      return diagnostics;
    },
  },

  // No var
  {
    id: 'no-var',
    name: 'No Var',
    description: 'Use let or const instead of var',
    category: 'best-practice',
    defaultSeverity: 'error',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const varRegex = /\bvar\s+/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = varRegex.exec(line)) !== null) {
          diagnostics.push({
            ruleId: 'no-var',
            message: 'Use "let" or "const" instead of "var"',
            severity: 'error',
            line: i + 1,
            column: match.index + 1,
            fix: {
              range: { start: match.index, end: match.index + 3 },
              replacement: 'let',
            },
          });
        }
      }

      return diagnostics;
    },
  },

  // Max line length
  {
    id: 'max-line-length',
    name: 'Max Line Length',
    description: 'Lines should not exceed maximum length',
    category: 'style',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const maxLength = (context.config['maxLength'] as number) || 120;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        if (line.length > maxLength) {
          diagnostics.push({
            ruleId: 'max-line-length',
            message: `Line exceeds ${maxLength} characters (${line.length})`,
            severity: 'warning',
            line: i + 1,
            column: maxLength + 1,
          });
        }
      }

      return diagnostics;
    },
  },

  // Consistent quotes
  {
    id: 'quotes',
    name: 'Consistent Quotes',
    description: 'Use consistent quote style',
    category: 'style',
    defaultSeverity: 'info',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const preferDouble = (context.config['style'] as string) !== 'single';
      const badQuote = preferDouble ? "'" : '"';
      const goodQuote = preferDouble ? '"' : "'";
      const quoteRegex = preferDouble ? /'/g : /"/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = quoteRegex.exec(line)) !== null) {
          diagnostics.push({
            ruleId: 'quotes',
            message: `Use ${goodQuote} instead of ${badQuote}`,
            severity: 'info',
            line: i + 1,
            column: match.index + 1,
            fix: {
              range: { start: match.index, end: match.index + 1 },
              replacement: goodQuote,
            },
          });
        }
      }

      return diagnostics;
    },
  },

  // No implicit any
  {
    id: 'no-implicit-any',
    name: 'No Implicit Any',
    description: 'Function parameters should have explicit types',
    category: 'type-safety',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (context.fileType !== 'hsplus') return diagnostics;

      const paramRegex = /function\s+\w+\(([^)]+)\)/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        let match;
        while ((match = paramRegex.exec(line)) !== null) {
          const params = match[1].split(',');
          for (const param of params) {
            const trimmed = param.trim();
            if (trimmed && !trimmed.includes(':')) {
              diagnostics.push({
                ruleId: 'no-implicit-any',
                message: `Parameter "${trimmed}" has no type annotation`,
                severity: 'warning',
                line: i + 1,
                column: match.index + 1,
              });
            }
          }
        }
      }

      return diagnostics;
    },
  },

  // Object naming (snake_case or camelCase)
  {
    id: 'object-naming',
    name: 'Object Naming',
    description: 'Object names should use consistent casing',
    category: 'naming',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const checkNodes = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.type === 'orb' && node.id) {
            if (!/^[A-Za-z][a-zA-Z0-9_-]*$/.test(node.id)) {
              diagnostics.push({
                ruleId: 'object-naming',
                message: `Object name "${node.id}" should use valid naming convention (camelCase, snake_case, PascalCase)`,
                severity: 'warning',
                line: node.loc?.start.line || 1,
                column: node.loc?.start.column || 1,
              });
            }
          }
          if (node.children) checkNodes(node.children);
        }
      };

      checkNodes(context.ast.children || []);
      return diagnostics;
    },
  },

  // Template naming (PascalCase)
  {
    id: 'template-naming',
    name: 'Template Naming',
    description: 'Templates should use PascalCase',
    category: 'naming',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      if (!context.ast) return diagnostics;

      const checkNodes = (nodes: LintASTNode[]) => {
        for (const node of nodes) {
          if (node.type === 'template' && node.id) {
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(node.id)) {
              diagnostics.push({
                ruleId: 'template-naming',
                message: `Template "${node.id}" should use PascalCase`,
                severity: 'warning',
                line: node.loc?.start.line || 1,
                column: node.loc?.start.column || 1,
              });
            }
          }
          if (node.children) checkNodes(node.children);
        }
      };

      checkNodes(context.ast.children || []);
      return diagnostics;
    },
  },

  // Limit objects per group
  {
    id: 'limit-objects-per-group',
    name: 'Limit Objects Per Group',
    description: 'Avoid too many objects in a single group',
    category: 'performance',
    defaultSeverity: 'warning',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      const maxObjects = (context.config['maxObjects'] as number) || 50;
      let objectCount = 0;
      let groupStartLine = 0;
      let inGroup = false;

      const groupStartRegex = /spatial_group|group\s*{/;
      const objectRegex = /\bobject\s+["']/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];

        if (groupStartRegex.test(line)) {
          inGroup = true;
          groupStartLine = i + 1;
          objectCount = 0;
        }

        if (inGroup) {
          const matches = line.match(objectRegex);
          if (matches) {
            objectCount += matches.length;
          }

          if (line.includes('}')) {
            if (objectCount > maxObjects) {
              diagnostics.push({
                ruleId: 'limit-objects-per-group',
                message: `Group has ${objectCount} objects (max ${maxObjects}). Consider splitting into sub-groups`,
                severity: 'warning',
                line: groupStartLine,
                column: 1,
              });
            }
            inGroup = false;
          }
        }
      }

      return diagnostics;
    },
  },

  // Consistent spacing
  {
    id: 'consistent-spacing',
    name: 'Consistent Spacing',
    description: 'Ensure consistent spacing around operators',
    category: 'style',
    defaultSeverity: 'info',
    check(context: RuleContext): LintDiagnostic[] {
      const diagnostics: LintDiagnostic[] = [];
      // Check for missing spaces around operators
      const badSpacingRegex = /[a-zA-Z0-9][=+\-*\/][a-zA-Z0-9]/g;

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];
        // Skip strings and comments
        if (line.trim().startsWith('//')) continue;

        let match;
        while ((match = badSpacingRegex.exec(line)) !== null) {
          diagnostics.push({
            ruleId: 'consistent-spacing',
            message: 'Add spaces around operator',
            severity: 'info',
            line: i + 1,
            column: match.index + 2,
          });
        }
      }

      return diagnostics;
    },
  },
];

// =============================================================================
// LINTER CLASS
// =============================================================================

export class HoloScriptLinter {
  private config: LinterConfig;
  private rules: Map<string, Rule>;
  /** Exposed for debugging/verification tools */
  lastAST?: LintASTNode;

  constructor(config: Partial<LinterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = new Map();

    // Register built-in rules
    for (const rule of BUILT_IN_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Lint HoloScript or HoloScript+ code
   */
  lint(source: string, filePath = 'input.holo'): LintResult {
    const fileType = filePath.endsWith('.hsplus') ? 'hsplus' : 'holo';
    const lines = source.split('\n');
    const diagnostics: LintDiagnostic[] = [];

    // Parse the source to get AST for rules
    const parser = new HoloScriptPlusParser();
    const parseResult = parser.parse(source);
    const ast = parseResult.ast;
    this.lastAST = ast;

    for (const [ruleId, rule] of this.rules) {
      const ruleConfig = this.config.rules[ruleId];

      // Skip disabled rules
      if (ruleConfig === 'off') {
        continue;
      }

      const severity = this.getSeverity(ruleConfig, rule.defaultSeverity);
      const config = this.getRuleOptions(ruleConfig);

      const context: RuleContext = {
        source,
        lines,
        fileType,
        config,
        ast,
      };

      try {
        const ruleDiagnostics = rule.check(context);
        for (const d of ruleDiagnostics) {
          diagnostics.push({
            ...d,
            severity,
          });
        }
      } catch (error) {
        diagnostics.push({
          ruleId: 'internal-error',
          message: `Rule "${ruleId}" threw an error: ${error}`,
          severity: 'error',
          line: 1,
          column: 1,
        });
      }

      // Stop if too many errors
      if (diagnostics.filter((d) => d.severity === 'error').length >= this.config.maxErrors) {
        break;
      }
    }

    // Sort by line number
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);

    return {
      filePath,
      diagnostics,
      errorCount: diagnostics.filter((d) => d.severity === 'error').length,
      warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
      fixableCount: diagnostics.filter((d) => d.fix !== undefined).length,
    };
  }

  /**
   * Register a custom rule
   */
  registerRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Get all registered rules
   */
  getRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private getSeverity(config: RuleConfig | undefined, defaultSeverity: Severity): Severity {
    if (!config || config === 'off') {
      return defaultSeverity;
    }
    if (config === 'warn' || (Array.isArray(config) && config[0] === 'warn')) {
      return 'warning';
    }
    if (config === 'error' || (Array.isArray(config) && config[0] === 'error')) {
      return 'error';
    }
    return defaultSeverity;
  }

  private getRuleOptions(config: RuleConfig | undefined): Record<string, unknown> {
    if (Array.isArray(config) && config[1]) {
      return config[1];
    }
    return {};
  }

  getConfig(): LinterConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<LinterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Lint HoloScript code with default config
 */
export function lint(source: string, filePath = 'input.holo'): LintResult {
  const linter = new HoloScriptLinter();
  return linter.lint(source, filePath);
}

/**
 * Create a linter with custom config
 */
export function createLinter(config: Partial<LinterConfig> = {}): HoloScriptLinter {
  return new HoloScriptLinter(config);
}

// Rule exports
export { noDeadCodeRule, createNoDeadCodeRule, type NoDeadCodeOptions } from './rules/no-dead-code';
export {
  deprecationWarningRule,
  createDeprecationWarningRule,
  type DeprecationWarningOptions,
  type DeprecationEntry,
} from './rules/deprecation-warning';

// Default export
export default HoloScriptLinter;
