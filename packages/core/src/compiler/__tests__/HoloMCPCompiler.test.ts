import { describe, it, expect } from 'vitest';
import { HoloMCPCompiler } from '../HoloMCPCompiler';
import type { HoloMCPTool } from '../HoloMCPCompiler';
import { DialectRegistry } from '../DialectRegistry';
import { registerBuiltinDialects } from '../registerBuiltinDialects';
import type { HoloComposition, HoloObjectDecl, HoloObjectTrait } from '../../parser/HoloCompositionTypes';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeEmptyComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

function makeTrait(name: string, config: Record<string, unknown> = {}): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config: config as Record<string, import('../../parser/HoloCompositionTypes').HoloValue>,
  };
}

function makeObject(name: string, traits: HoloObjectTrait[]): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits,
  } as unknown as HoloObjectDecl;
}

function compileAndParse(compiler: HoloMCPCompiler, composition: HoloComposition) {
  return JSON.parse(compiler.compile(composition, '')) as {
    _generated: string;
    _configKind: string;
    _phase: string;
    __holoMeta: { hashTier: string; contractEnforcement: string };
    server: { name: string; version: string };
    tools: HoloMCPTool[];
    sourceObjectCount: number;
  };
}

// ─── P0 smoke tests (unchanged) ──────────────────────────────────────────────

/**
 * P0 smoke test for HoloMCPCompiler — proves the dialect is registered and the
 * skeleton compiles a minimal composition to a structurally valid MCP server
 * manifest without throwing. Tool[] emission is P1 (tested separately below).
 */
describe('HoloMCPCompiler (P0 skeleton)', () => {
  it('is registered as the mcp-server dialect with the .mcp-server.json extension', () => {
    // Boot builtin dialects via a static import (vitest's ESM context breaks the
    // dynamic require() inside ensureDialectsBooted, which is swallowed silently).
    if (!DialectRegistry.has('mcp-server')) {
      try {
        registerBuiltinDialects();
      } catch {
        /* dialects already (partially) booted in this process */
      }
    }
    const info = DialectRegistry.get('mcp-server');
    expect(info).toBeDefined();
    expect(info?.domain).toBe('ai');
    expect(info?.outputExtensions).toContain('.mcp-server.json');
  });

  it('compiles a minimal composition to a structured MCP server manifest (no throw)', () => {
    const compiler = new HoloMCPCompiler({ serverName: 'test-server' });
    const composition = makeEmptyComposition();

    const parsed = compileAndParse(compiler, composition);

    expect(parsed._generated).toBe('HoloMCPCompiler');
    expect(parsed._configKind).toBe('mcp-server');
    expect(parsed.server.name).toBe('test-server');
    expect(parsed.server.version).toBe('1.0.0');
    expect(Array.isArray(parsed.tools)).toBe(true);
    expect(parsed.sourceObjectCount).toBe(0);
  });

  it('defaults the server name when none is supplied', () => {
    const compiler = new HoloMCPCompiler();
    const composition = makeEmptyComposition();
    const parsed = compileAndParse(compiler, composition);
    expect(parsed.server.name).toBe('holoscript-mcp-server');
  });
});

// ─── P1: trait-walk Tool[] emission ─────────────────────────────────────────

describe('HoloMCPCompiler P1 — trait-walk Tool[] emission', () => {
  const compiler = new HoloMCPCompiler({ serverName: 'p1-server' });

  it('emits one Tool per trait on a single object', () => {
    const composition = makeEmptyComposition({
      objects: [
        makeObject('Robot', [makeTrait('physics'), makeTrait('renderable')]),
      ],
    });

    const parsed = compileAndParse(compiler, composition);
    expect(parsed.tools).toHaveLength(2);
    expect(parsed.tools.map((t) => t.name)).toContain('robot__physics');
    expect(parsed.tools.map((t) => t.name)).toContain('robot__renderable');
  });

  it('emits 3 Tools for a 3-trait object (acceptance criterion P1)', () => {
    const composition = makeEmptyComposition({
      objects: [
        makeObject('Agent', [
          makeTrait('physics', { mass: 1.0, gravity: true }),
          makeTrait('renderable', { mesh: 'sphere', color: '#ff0000' }),
          makeTrait('networked', { sync_rate: 30 }),
        ]),
      ],
    });

    const parsed = compileAndParse(compiler, composition);
    expect(parsed.tools).toHaveLength(3);
  });

  it('emits Tools from templates in addition to objects', () => {
    const composition = makeEmptyComposition({
      templates: [
        {
          type: 'Template',
          name: 'PlayerTemplate',
          traits: [makeTrait('locomotion', { speed: 5.0 })],
          properties: [],
          actions: [],
        } as unknown as import('../../parser/HoloCompositionTypes').HoloTemplate,
      ],
      objects: [
        makeObject('Enemy', [makeTrait('ai_agent', { model: 'llama3' })]),
      ],
    });

    const parsed = compileAndParse(compiler, composition);
    expect(parsed.tools).toHaveLength(2);

    const templateTool = parsed.tools.find((t) => t._provenance.source === 'template');
    expect(templateTool).toBeDefined();
    expect(templateTool!._provenance.sourceName).toBe('PlayerTemplate');
    expect(templateTool!._provenance.traitName).toBe('locomotion');

    const objectTool = parsed.tools.find((t) => t._provenance.source === 'object');
    expect(objectTool).toBeDefined();
    expect(objectTool!._provenance.sourceName).toBe('Enemy');
  });

  describe('inputSchema derivation — config-inferred', () => {
    it('produces AJV-valid inputSchema with top-level required[] (not per-property booleans)', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('Sensor', [
            makeTrait('sensor', { frequency: 10, enabled: true, label: 'lidar' }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools).toHaveLength(1);

      const tool = tools[0];
      const schema = tool.inputSchema;

      // Top-level required[] must be an array (JSON-Schema-valid)
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');

      // No per-property required booleans (AJV/JSON Schema rejects them)
      for (const prop of Object.values(schema.properties)) {
        expect(prop).not.toHaveProperty('required');
      }
    });

    it('infers correct JSON Schema types from config value types', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('Widget', [
            makeTrait('configurable', {
              count: 42,
              name: 'test',
              active: true,
              tags: ['a', 'b'],
            }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      const schema = tools[0].inputSchema;

      expect(schema.properties['count'].type).toBe('number');
      expect(schema.properties['name'].type).toBe('string');
      expect(schema.properties['active'].type).toBe('boolean');
      expect(schema.properties['tags'].type).toBe('array');
    });

    it('marks schemaFidelity as "inferred" for config-derived schemas', () => {
      const composition = makeEmptyComposition({
        objects: [makeObject('X', [makeTrait('renderable', { mesh: 'cube' })])],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools[0]._schemaFidelity).toBe('inferred');
    });
  });

  describe('inputSchema derivation — @llm_agent LLMTool.parameters path', () => {
    it('derives inputSchema from LLMTool.parameters for @llm_agent traits', () => {
      const llmTools = [
        {
          name: 'search',
          description: 'Search the web',
          parameters: {
            query: { type: 'string', description: 'Search query', required: true },
            limit: { type: 'number', description: 'Max results', required: false },
          },
        },
      ];

      const composition = makeEmptyComposition({
        objects: [
          makeObject('AIAgent', [
            makeTrait('llm_agent', {
              model: 'gpt-4',
              tools: llmTools,
            }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools).toHaveLength(1);

      const tool = tools[0];
      const schema = tool.inputSchema;

      // Parameters are hoisted to properties
      expect(schema.properties).toHaveProperty('query');
      expect(schema.properties).toHaveProperty('limit');
      expect(schema.properties['query'].type).toBe('string');
      expect(schema.properties['limit'].type).toBe('number');

      // required is top-level array, not per-property booleans
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.required).toContain('query');
      expect(schema.required).not.toContain('limit');

      // No per-property required booleans
      for (const prop of Object.values(schema.properties)) {
        expect(prop).not.toHaveProperty('required');
      }
    });

    it('marks schemaFidelity as "llm_tool" for @llm_agent with tools[]', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('Brain', [
            makeTrait('llm_agent', {
              model: 'llama3',
              tools: [
                {
                  name: 'write',
                  description: 'Write to file',
                  parameters: {
                    path: { type: 'string', description: 'File path', required: true },
                  },
                },
              ],
            }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools[0]._schemaFidelity).toBe('llm_tool');
    });

    it('falls back to config-inferred when @llm_agent has no tools[]', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('Slim', [
            makeTrait('llm_agent', { model: 'phi3', system_prompt: 'You are helpful.' }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools[0]._schemaFidelity).toBe('inferred');
    });

    it('carries enum values into the schema properties', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('Router', [
            makeTrait('llm_agent', {
              tools: [
                {
                  name: 'route',
                  description: 'Route a request',
                  parameters: {
                    method: {
                      type: 'string',
                      description: 'HTTP method',
                      required: true,
                      enum: ['GET', 'POST', 'PUT', 'DELETE'],
                    },
                  },
                },
              ],
            }),
          ]),
        ],
      });

      const { tools } = compileAndParse(compiler, composition);
      const schema = tools[0].inputSchema;
      expect(schema.properties['method'].enum).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
    });
  });

  describe('manifest metadata', () => {
    it('emits honest __holoMeta with fnv1a32 hashTier and no contract enforcement', () => {
      const parsed = compileAndParse(compiler, makeEmptyComposition());
      expect(parsed.__holoMeta).toEqual({
        hashTier: 'fnv1a32',
        contractEnforcement: 'none',
      });
    });

    it('emits _phase indicating P1', () => {
      const parsed = compileAndParse(compiler, makeEmptyComposition());
      expect(parsed._phase).toMatch(/P1/);
    });

    it('includes per-tool provenance', () => {
      const composition = makeEmptyComposition({
        objects: [makeObject('Drone', [makeTrait('physics', { mass: 0.5 })])],
      });

      const { tools } = compileAndParse(compiler, composition);
      expect(tools[0]._provenance).toEqual({
        source: 'object',
        sourceName: 'Drone',
        traitName: 'physics',
      });
    });

    it('sourceObjectCount reflects number of objects (not tools)', () => {
      const composition = makeEmptyComposition({
        objects: [
          makeObject('A', [makeTrait('physics'), makeTrait('renderable')]),
          makeObject('B', [makeTrait('networked')]),
        ],
      });

      const parsed = compileAndParse(compiler, composition);
      expect(parsed.sourceObjectCount).toBe(2); // 2 objects, not 3 tools
      expect(parsed.tools).toHaveLength(3);
    });
  });

  it('handles objects with no traits gracefully (emits no tools for them)', () => {
    const composition = makeEmptyComposition({
      objects: [
        makeObject('Bare', []), // no traits
        makeObject('Equipped', [makeTrait('sensor', { hz: 10 })]),
      ],
    });

    const { tools } = compileAndParse(compiler, composition);
    expect(tools).toHaveLength(1);
    expect(tools[0]._provenance.sourceName).toBe('Equipped');
  });
});
