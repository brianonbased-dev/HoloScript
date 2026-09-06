import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloMCPCompiler } from '../HoloMCPCompiler';
import type { HoloMCPTool, HoloParamAnnotation } from '../HoloMCPCompiler';
import { DialectRegistry } from '../DialectRegistry';
import { registerBuiltinDialects } from '../registerBuiltinDialects';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

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
      objects: [makeObject('Robot', [makeTrait('physics'), makeTrait('renderable')])],
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
      objects: [makeObject('Enemy', [makeTrait('ai_agent', { model: 'llama3' })])],
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

    it('emits _phase indicating current phase', () => {
      const parsed = compileAndParse(compiler, makeEmptyComposition());
      expect(typeof parsed._phase).toBe('string');
      expect(parsed._phase.length).toBeGreaterThan(0);
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

// ─── P2: TypeScript module emission ─────────────────────────────────────────

describe('HoloMCPCompiler P2 — compileModule() TypeScript emission', () => {
  const compiler = new HoloMCPCompiler({ serverName: 'p2-server', serverVersion: '2.0.0' });

  // Resolve tsc from the monorepo root node_modules — works regardless of CWD.
  const __dir = fileURLToPath(new URL('.', import.meta.url));
  const tscBin = resolve(__dir, '../../../../../node_modules/typescript/bin/tsc');

  function emitModule(overrides: Partial<Parameters<typeof makeEmptyComposition>[0]> = {}): string {
    return compiler.compileModule(makeEmptyComposition(overrides), '');
  }

  it('emits a non-empty string with the generated header', () => {
    const code = emitModule();
    expect(typeof code).toBe('string');
    expect(code).toContain('Generated by HoloMCPCompiler');
    expect(code).toContain('p2-server');
    expect(code).toMatch(/Phase: P\d/);
  });

  it('exports TOOLS as a const', () => {
    const code = emitModule({
      objects: [makeObject('Bot', [makeTrait('physics', { mass: 1 })])],
    });
    expect(code).toContain('export const TOOLS');
    expect(code).toContain('bot__physics');
  });

  it('exports HoloMCPRuntimeAdapter interface with one method per tool', () => {
    const code = emitModule({
      objects: [
        makeObject('Alpha', [makeTrait('sensor', { hz: 10 })]),
        makeObject('Beta', [makeTrait('networked', { channel: 'ws' })]),
      ],
    });
    expect(code).toContain('export interface HoloMCPRuntimeAdapter');
    expect(code).toContain('alpha__sensor');
    expect(code).toContain('beta__networked');
  });

  it('exports parameter interfaces (HoloParams_<toolname>) for typed dispatch', () => {
    const code = emitModule({
      objects: [makeObject('Arm', [makeTrait('urdf_robot', { scale: 1.0, up_axis: 'Z' })])],
    });
    expect(code).toContain('export interface HoloParams_arm__urdf_robot');
    expect(code).toContain('scale');
    expect(code).toContain('up_axis');
  });

  it('marks required params in parameter interfaces and optional params with ?', () => {
    // @llm_agent with tools[] gives us required: populated from LLMTool.parameters
    const composition = makeEmptyComposition({
      objects: [
        makeObject('Agent', [
          makeTrait('llm_agent', {
            tools: [
              {
                name: 'search',
                description: 'Search the web',
                parameters: {
                  query: { type: 'string', description: 'Search query', required: true },
                  limit: { type: 'number', description: 'Max results', required: false },
                },
              },
            ],
          }),
        ]),
      ],
    });
    const code = compiler.compileModule(composition, '');
    // required param: no '?'; optional: has '?'
    expect(code).toMatch(/query: string;/);
    expect(code).toMatch(/limit\?: number;/);
  });

  it('exports registerAdapter function', () => {
    const code = emitModule();
    expect(code).toContain('export function registerAdapter(adapter: HoloMCPRuntimeAdapter)');
  });

  it('exports verifyContractWiring function', () => {
    const code = emitModule();
    expect(code).toContain('export function verifyContractWiring()');
    expect(code).toContain('has no registered handler');
  });

  it('exports handleToolCall async function', () => {
    const code = emitModule();
    expect(code).toContain('export async function handleToolCall(');
    expect(code).toContain("content: [{ type: 'text'");
  });

  it('exports __holoMeta with honest governance values', () => {
    const code = emitModule();
    expect(code).toContain('export const __holoMeta');
    expect(code).toContain("hashTier: 'fnv1a32'");
    // P3: startup-gate is now enforced (wiring + _contractVerified flag)
    expect(code).toContain("contractEnforcement: 'startup-gate'");
  });

  it('emitted TypeScript is import-free (no import statements)', () => {
    const code = emitModule({
      objects: [makeObject('Bot', [makeTrait('ai', { model: 'gpt-4' })])],
    });
    // Should have no top-level import statements
    const importLines = code.split('\n').filter((l) => /^import\s/.test(l));
    expect(importLines).toHaveLength(0);
  });

  it('emitted TypeScript passes tsc --noEmit --strict (P2 gate)', () => {
    const composition = makeEmptyComposition({
      objects: [
        makeObject('Sensor', [makeTrait('sensor', { hz: 10, unit: 'celsius' })]),
        makeObject('Agent', [
          makeTrait('llm_agent', {
            tools: [
              {
                name: 'recall',
                description: 'Recall a memory',
                parameters: {
                  query: { type: 'string', description: 'What to recall', required: true },
                },
              },
            ],
          }),
        ]),
      ],
    });

    const code = compiler.compileModule(composition, '');
    const tmpFile = join(tmpdir(), `holo-mcp-p2-gate-${Date.now()}.ts`);
    writeFileSync(tmpFile, code, 'utf8');

    try {
      execFileSync(
        process.execPath, // node
        [
          tscBin,
          '--noEmit',
          '--strict',
          '--target',
          'ES2020',
          '--lib',
          'ES2020',
          '--module',
          'commonjs',
          '--moduleResolution',
          'node',
          '--skipLibCheck',
          tmpFile,
        ],
        { encoding: 'utf8' }
      );
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ok if already gone */
      }
    }
    // If execFileSync didn't throw, tsc passed with zero errors.
  });
});

// ─── P3: startup evaluator gate ──────────────────────────────────────────────

describe('HoloMCPCompiler P3 — startup evaluator gate', () => {
  const compiler = new HoloMCPCompiler({ serverName: 'p3-server' });

  function emitWith(overrides: Partial<Parameters<typeof makeEmptyComposition>[0]> = {}): string {
    return compiler.compileModule(makeEmptyComposition(overrides), '');
  }

  it('emits _adapterRegistered and _contractVerified module-level flags', () => {
    const code = emitWith();
    expect(code).toContain('let _adapterRegistered = false;');
    expect(code).toContain('let _contractVerified = false;');
  });

  it('registerAdapter sets _adapterRegistered, resets _contractVerified, clears dispatch', () => {
    const code = emitWith({
      objects: [makeObject('Bot', [makeTrait('sensor', { hz: 10 })])],
    });
    expect(code).toContain('_adapterRegistered = true;');
    expect(code).toContain('_contractVerified = false;');
    expect(code).toContain('_dispatch.clear();');
  });

  it('verifyContractWiring throws when registerAdapter was never called', () => {
    const code = emitWith();
    expect(code).toContain('registerAdapter() was not called');
    expect(code).toContain('!_adapterRegistered');
  });

  it('verifyContractWiring sets _contractVerified = true on success', () => {
    const code = emitWith();
    expect(code).toContain('_contractVerified = true;');
  });

  it('handleToolCall throws when _contractVerified is false', () => {
    const code = emitWith();
    expect(code).toContain('!_contractVerified');
    expect(code).toContain(
      'verifyContractWiring() must be called at startup before handleToolCall()'
    );
  });

  it('contractEnforcement is "startup-gate" (honest: gate is structurally enforced)', () => {
    const code = emitWith();
    expect(code).toContain("contractEnforcement: 'startup-gate'");
  });

  it('emitted TypeScript with P3 guards passes tsc --noEmit --strict (P3 gate)', { timeout: 120_000 }, () => {
    const __dir = fileURLToPath(new URL('.', import.meta.url));
    const tscBin = resolve(__dir, '../../../../../node_modules/typescript/bin/tsc');

    const composition = makeEmptyComposition({
      objects: [
        makeObject('Arm', [makeTrait('urdf_robot', { scale: 1.0, segments: 3 })]),
        makeObject('Brain', [
          makeTrait('llm_agent', {
            tools: [
              {
                name: 'plan',
                description: 'Plan a motion trajectory',
                parameters: {
                  goal: { type: 'string', description: 'Target position', required: true },
                  steps: { type: 'number', description: 'Max steps', required: false },
                },
              },
            ],
          }),
        ]),
      ],
    });

    const code = compiler.compileModule(composition, '');
    const tmpFile = join(tmpdir(), `holo-mcp-p3-gate-${Date.now()}.ts`);
    writeFileSync(tmpFile, code, 'utf8');

    try {
      execFileSync(
        process.execPath,
        [
          tscBin,
          '--noEmit',
          '--strict',
          '--target',
          'ES2020',
          '--lib',
          'ES2020',
          '--module',
          'commonjs',
          '--moduleResolution',
          'node',
          '--skipLibCheck',
          tmpFile,
        ],
        { encoding: 'utf8' }
      );
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ok */
      }
    }
  });
});

// ─── P5: @param annotation layer ─────────────────────────────────────────────

describe('HoloMCPCompiler P5 — @param annotation layer', () => {
  const compiler = new HoloMCPCompiler({ serverName: 'p5-server' });

  // Build a composition with a @param meta-trait preceding a real trait.
  // @param block config: { paramKey: { type, description, required, enum } }
  function makeAnnotatedObject(
    name: string,
    annotations: Record<string, HoloParamAnnotation>,
    traitName: string,
    traitConfig: Record<string, unknown>
  ) {
    return makeObject(name, [
      makeTrait('param', annotations as Record<string, unknown>),
      makeTrait(traitName, traitConfig),
    ]);
  }

  function compileAnnotated(
    name: string,
    annotations: Record<string, HoloParamAnnotation>,
    traitName: string,
    traitConfig: Record<string, unknown>
  ) {
    const composition = makeEmptyComposition({
      objects: [makeAnnotatedObject(name, annotations, traitName, traitConfig)],
    });
    return JSON.parse(compiler.compile(composition, '')) as { tools: HoloMCPTool[] };
  }

  it('@param meta-trait is NOT emitted as a tool', () => {
    const { tools } = compileAnnotated(
      'Sensor',
      { hz: { type: 'number', description: 'Hz rate', required: true } },
      'sensor',
      { hz: 10, unit: 'celsius' }
    );
    // Only one tool: sensor (not param)
    expect(tools).toHaveLength(1);
    expect(tools[0]._provenance.traitName).toBe('sensor');
  });

  it('@param annotation overrides inferred type for a config key', () => {
    // Default config has hz=10 (number), but annotation says type='string' (override wins)
    const { tools } = compileAnnotated(
      'Sensor',
      { hz: { type: 'string', description: 'Override to string' } },
      'sensor',
      { hz: 10 }
    );
    expect(tools[0].inputSchema.properties['hz'].type).toBe('string');
  });

  it('@param annotation provides description (overrides key-name default)', () => {
    const { tools } = compileAnnotated(
      'Bot',
      { speed: { description: 'Locomotion speed in m/s' } },
      'locomotion',
      { speed: 1.0 }
    );
    expect(tools[0].inputSchema.properties['speed'].description).toBe('Locomotion speed in m/s');
  });

  it('@param annotation populates required[] (value-inference leaves it empty)', () => {
    const { tools } = compileAnnotated(
      'Agent',
      {
        query: { type: 'string', description: 'Search query', required: true },
        limit: { type: 'number', description: 'Max results', required: false },
      },
      'search',
      { query: '', limit: 10 }
    );
    expect(tools[0].inputSchema.required).toContain('query');
    expect(tools[0].inputSchema.required).not.toContain('limit');
  });

  it('@param annotation surfaces enum constraints', () => {
    const { tools } = compileAnnotated(
      'Sensor',
      { unit: { type: 'string', enum: ['celsius', 'fahrenheit', 'kelvin'] } },
      'thermometer',
      { unit: 'celsius' }
    );
    expect(tools[0].inputSchema.properties['unit'].enum).toEqual([
      'celsius',
      'fahrenheit',
      'kelvin',
    ]);
  });

  it('@param-annotated trait gets _schemaFidelity "annotated"', () => {
    const { tools } = compileAnnotated(
      'Bot',
      { mass: { type: 'number', description: 'Mass in kg', required: true } },
      'physics',
      { mass: 1.0 }
    );
    expect(tools[0]._schemaFidelity).toBe('annotated');
  });

  it('un-annotated trait keeps _schemaFidelity "inferred"', () => {
    const composition = makeEmptyComposition({
      objects: [makeObject('Bot', [makeTrait('physics', { mass: 1.0 })])],
    });
    const { tools } = JSON.parse(compiler.compile(composition, '')) as { tools: HoloMCPTool[] };
    expect(tools[0]._schemaFidelity).toBe('inferred');
  });

  it('pure-annotation parameter (not in config defaults) is emitted', () => {
    // @param declares 'mode' but the trait config has no 'mode' key
    const { tools } = compileAnnotated(
      'Robot',
      {
        mode: {
          type: 'string',
          description: 'Operation mode',
          required: true,
          enum: ['auto', 'manual'],
        },
      },
      'controller',
      { speed: 1.0 } // 'mode' absent from config
    );
    expect(tools[0].inputSchema.properties).toHaveProperty('mode');
    expect(tools[0].inputSchema.properties['mode'].enum).toEqual(['auto', 'manual']);
    expect(tools[0].inputSchema.required).toContain('mode');
  });

  it('emitted TypeScript with annotated required params passes tsc --noEmit --strict (P5 gate)', { timeout: 120_000 }, () => {
    const __dir = fileURLToPath(new URL('.', import.meta.url));
    const tscBin = resolve(__dir, '../../../../../node_modules/typescript/bin/tsc');

    const composition = makeEmptyComposition({
      objects: [
        makeAnnotatedObject(
          'Arm',
          {
            goal: { type: 'string', description: 'Target position', required: true },
            steps: { type: 'number', description: 'Max steps', required: false },
          },
          'planner',
          { goal: '', steps: 10 }
        ),
      ],
    });

    const code = compiler.compileModule(composition, '');
    const tmpFile = join(tmpdir(), `holo-mcp-p5-gate-${Date.now()}.ts`);
    writeFileSync(tmpFile, code, 'utf8');

    try {
      execFileSync(
        process.execPath,
        [
          tscBin,
          '--noEmit',
          '--strict',
          '--target',
          'ES2020',
          '--lib',
          'ES2020',
          '--module',
          'commonjs',
          '--moduleResolution',
          'node',
          '--skipLibCheck',
          tmpFile,
        ],
        { encoding: 'utf8' }
      );
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ok */
      }
    }
  });
});
