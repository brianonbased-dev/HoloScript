/**
 * WASM Compiler Tests
 */

import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';
import vm from 'node:vm';
import {
  WASMCompiler,
  createWASMCompiler,
  compileToWASM,
  compileASTToWASM,
  type WASMCompileResult,
} from './WASMCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';
import type { HSPlusAST, HSPlusNode } from '../types/HoloScriptPlus';

vi.mock('./identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// Helper to create test composition
function createTestComposition(
  options: {
    name?: string;
    state?: Record<string, unknown>;
    objects?: Partial<HoloObjectDecl>[];
  } = {}
): HoloComposition {
  return {
    name: options.name || 'test_scene',
    objects: (options.objects || []).map((obj, i) => ({
      name: obj.name || `obj_${i}`,
      type: obj.type || 'object',
      properties: obj.properties || [],
      traits: obj.traits || [],
      children: obj.children || [],
    })),
    state: options.state ? { declarations: options.state } : undefined,
  } as HoloComposition;
}

type GeneratedBindingInstance = {
  load(wasmSource: ArrayBuffer): Promise<void>;
  update(dt: number): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  getObjectCount(): number;
  isObjectActive(index: number): boolean;
  setObjectActive(index: number, active: boolean): void;
  getMemoryLayout(): object;
};

type GeneratedBindingClass = new () => GeneratedBindingInstance;

type GeneratedBindingImports = {
  env: {
    emit_event(eventId: number, payloadPtr: number): void;
  };
};

function createSmartFarmComposition(): HoloComposition {
  return createTestComposition({
    name: 'smart_farm_dashboard',
    objects: [
      { name: 'TemperatureSensor' },
      { name: 'TemperatureLabel' },
      { name: 'HumiditySensor' },
      { name: 'HumidityLabel' },
      { name: 'SoilMoistureSensor' },
      { name: 'MoistureLabel' },
      { name: 'DashboardBase' },
      { name: 'TitleLabel' },
      { name: 'StatusIndicator' },
    ],
  });
}

function loadGeneratedBindingClass(source: string): GeneratedBindingClass {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const context = vm.createContext({
    exports: module.exports,
    module,
    console,
    DataView,
    Float32Array,
    JSON,
    Map,
    Object,
    Set,
    TextDecoder,
    Uint8Array,
    WebAssembly,
    performance,
  });
  vm.runInContext(output, context);

  const bindingClass = module.exports.HoloScriptWASM;
  expect(bindingClass).toBeTypeOf('function');
  return bindingClass as GeneratedBindingClass;
}

function writePayload(
  memory: WebAssembly.Memory,
  ptr: number,
  payloadType: number,
  payload: string
): void {
  const bytes = new TextEncoder().encode(payload);
  const view = new DataView(memory.buffer);
  view.setUint8(ptr, payloadType);
  view.setUint32(ptr + 1, bytes.byteLength, true);
  new Uint8Array(memory.buffer, ptr + 5, bytes.byteLength).set(bytes);
}

// Helper to create test AST
function createTestAST(
  options: {
    state?: Record<string, unknown>;
    children?: Partial<HSPlusNode>[];
  } = {}
): HSPlusAST {
  return {
    root: {
      type: 'scene',
      id: 'root',
      properties: {},
      traits: new Map(),
      directives: options.state ? [{ type: 'state', body: options.state }] : [],
      children: (options.children || []).map((node, i) => ({
        type: node.type || 'object',
        id: node.id || `obj_${i}`,
        properties: node.properties || {},
        traits: node.traits || new Map(),
        directives: node.directives || [],
        children: node.children || [],
      })),
    },
    imports: [],
    body: [],
  } as HSPlusAST;
}

describe('WASMCompiler', () => {
  describe('initialization', () => {
    it('should create compiler with default options', () => {
      const compiler = createWASMCompiler();
      expect(compiler).toBeInstanceOf(WASMCompiler);
    });

    it('should accept custom options', () => {
      const compiler = createWASMCompiler({
        format: 'wat',
        debug: true,
        memoryPages: 32,
        simd: true,
        moduleName: 'custom_module',
      });
      expect(compiler).toBeInstanceOf(WASMCompiler);
    });
  });

  describe('compilation', () => {
    it('should compile empty composition', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      expect(result.wat).toBeDefined();
      expect(result.wat).toContain('(module');
      expect(result.wat).toContain('(memory');
      expect(result.wat).toContain('(func $init');
      expect(result.wat).toContain('(func $update');
    });

    it('should compile composition with state', () => {
      const comp = createTestComposition({
        state: {
          counter: 0,
          temperature: 25.5,
          enabled: true,
        },
      });
      const result = compileToWASM(comp);

      // Should have state accessors
      expect(result.wat).toContain('$get_counter');
      expect(result.wat).toContain('$set_counter');
      expect(result.wat).toContain('$get_temperature');
      expect(result.wat).toContain('$set_temperature');
      expect(result.wat).toContain('$get_enabled');
      expect(result.wat).toContain('$set_enabled');

      // Memory layout should track state
      expect(result.memoryLayout.stateSize).toBeGreaterThan(0);
    });

    it('should compile composition with objects', () => {
      const comp = createTestComposition({
        objects: [
          {
            name: 'sensor',
            properties: [
              { key: 'value', value: 0 },
              { key: 'active', value: true },
            ],
          },
          {
            name: 'actuator',
            properties: [{ key: 'power', value: 100 }],
          },
        ],
      });
      const result = compileToWASM(comp);

      // Should have object functions
      expect(result.wat).toContain('$update_object_0');
      expect(result.wat).toContain('$update_object_1');
      expect(result.wat).toContain('sensor');
      expect(result.wat).toContain('actuator');

      // Memory layout should track objects
      expect(result.memoryLayout.objectsSize).toBeGreaterThan(0);
    });

    it('should generate exports', () => {
      const comp = createTestComposition({
        state: { value: 42 },
      });
      const result = compileToWASM(comp);

      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'init', kind: 'function' })
      );
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'update', kind: 'function' })
      );
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'memory', kind: 'memory' })
      );
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'get_value', kind: 'function' })
      );
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'set_value', kind: 'function' })
      );
    });

    it('should generate imports', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      expect(result.imports).toContainEqual(
        expect.objectContaining({ module: 'env', name: 'log_i32' })
      );
      expect(result.imports).toContainEqual(
        expect.objectContaining({ module: 'env', name: 'emit_event' })
      );
      expect(result.imports).toContainEqual(
        expect.objectContaining({ module: 'env', name: 'get_time' })
      );
    });
  });

  describe('AST compilation', () => {
    it('should compile empty AST', () => {
      const ast = createTestAST();
      const result = compileASTToWASM(ast);

      expect(result.wat).toBeDefined();
      expect(result.wat).toContain('(module');
    });

    it('should compile AST with state', () => {
      const ast = createTestAST({
        state: { count: 0, name: 'test' },
      });
      const result = compileASTToWASM(ast);

      expect(result.wat).toContain('$get_count');
      expect(result.wat).toContain('$set_count');
    });

    it('should compile AST with children', () => {
      const ast = createTestAST({
        children: [
          { id: 'node1', type: 'object', properties: { x: 0, y: 0 } },
          { id: 'node2', type: 'sensor', properties: { reading: 0 } },
        ],
      });
      const result = compileASTToWASM(ast);

      expect(result.wat).toContain('node1');
      expect(result.wat).toContain('node2');
      expect(result.memoryLayout.objectsSize).toBeGreaterThan(0);
    });
  });

  describe('memory layout', () => {
    it('should calculate correct memory layout', () => {
      const comp = createTestComposition({
        state: { a: 1, b: 2.0, c: true },
        objects: [
          { name: 'obj1', properties: [{ key: 'x', value: 0 }] },
          { name: 'obj2', properties: [{ key: 'y', value: 0 }] },
        ],
      });
      const result = compileToWASM(comp);

      const layout = result.memoryLayout;

      // State should start at 0
      expect(layout.stateOffset).toBe(0);
      expect(layout.stateSize).toBeGreaterThan(0);

      // Objects should follow state
      expect(layout.objectsOffset).toBe(layout.stateSize);
      expect(layout.objectsSize).toBeGreaterThan(0);

      // Events follow objects
      expect(layout.eventsOffset).toBe(layout.objectsOffset + layout.objectsSize);
      expect(layout.eventsSize).toBeGreaterThan(0);

      // Strings follow events
      expect(layout.stringsOffset).toBe(layout.eventsOffset + layout.eventsSize);

      // Total should be sum of all
      expect(layout.totalSize).toBeGreaterThanOrEqual(layout.stringsOffset + layout.stringsSize);
    });
  });

  describe('JavaScript bindings', () => {
    it('should generate bindings by default', () => {
      const comp = createTestComposition({
        state: { value: 0 },
      });
      const result = compileToWASM(comp);

      expect(result.bindings).toBeDefined();
      expect(result.bindings).toContain('class HoloScriptWASM');
      expect(result.bindings).toContain('async load');
      expect(result.bindings).toContain('update(dt: number)');
    });

    it('should include state accessors in bindings', () => {
      const comp = createTestComposition({
        state: { counter: 0 },
      });
      const result = compileToWASM(comp);

      expect(result.bindings).toContain('get counter()');
      expect(result.bindings).toContain('set counter(value');
    });

    it('should skip bindings when disabled', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp, { generateBindings: false });

      expect(result.bindings).toBe('');
    });

    it('should include event handling in bindings', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      expect(result.bindings).toContain('on(event: string');
      expect(result.bindings).toContain('handleEvent');
      expect(result.bindings).toContain('eventHandlers');
    });

    it('should include object helpers in bindings', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      expect(result.bindings).toContain('getObjectCount()');
      expect(result.bindings).toContain('isObjectActive');
      expect(result.bindings).toContain('setObjectActive');
    });

    it('should include memory layout in bindings', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      expect(result.bindings).toContain('getMemoryLayout()');
    });

    it('should execute generated smart-farm bindings against the WASM export contract', async () => {
      const comp = createSmartFarmComposition();
      const result = compileToWASM(comp);
      const HoloScriptWASM = loadGeneratedBindingClass(result.bindings);
      const memory = new WebAssembly.Memory({ initial: 1 });
      const wasmExports = {
        memory,
        init: vi.fn(),
        update: vi.fn(),
        get_object_count: vi.fn(() => comp.objects.length),
        is_object_active: vi.fn((index: number) => (index === 2 ? 1 : 0)),
        set_object_active: vi.fn(),
      };
      const instance = {
        exports: wasmExports as unknown as WebAssembly.Exports,
      } as WebAssembly.Instance;
      let capturedImports: GeneratedBindingImports | undefined;
      const instantiate = vi
        .spyOn(WebAssembly, 'instantiate')
        .mockImplementation(async (_source: BufferSource, imports?: WebAssembly.Imports) => {
          capturedImports = imports as GeneratedBindingImports;
          return {
            instance,
            module: {} as WebAssembly.Module,
          };
        });

      const wrapper = new HoloScriptWASM();
      await wrapper.load(new ArrayBuffer(8));

      expect(instantiate).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        expect.objectContaining({ env: expect.any(Object) })
      );
      expect(wasmExports.init).toHaveBeenCalledOnce();

      wrapper.update(0.016);
      expect(wasmExports.update).toHaveBeenCalledWith(0.016);
      expect(wrapper.getObjectCount()).toBe(9);
      expect(wrapper.isObjectActive(2)).toBe(true);
      expect(wrapper.isObjectActive(3)).toBe(false);

      wrapper.setObjectActive(4, true);
      wrapper.setObjectActive(4, false);
      expect(wasmExports.set_object_active).toHaveBeenNthCalledWith(1, 4, 1);
      expect(wasmExports.set_object_active).toHaveBeenNthCalledWith(2, 4, 0);
      expect(wrapper.getMemoryLayout()).toEqual(result.memoryLayout);

      const updateHandler = vi.fn();
      const unsubscribe = wrapper.on('update', updateHandler);
      writePayload(memory, 32, 3, 'irrigation-ready');
      capturedImports?.env.emit_event(0, 32);
      expect(updateHandler).toHaveBeenCalledWith('irrigation-ready');

      unsubscribe();
      capturedImports?.env.emit_event(0, 32);
      expect(updateHandler).toHaveBeenCalledTimes(1);

      const stateHandler = vi.fn();
      wrapper.on('state_change', stateHandler);
      writePayload(memory, 96, 4, JSON.stringify({ soil: 'dry', pump: true }));
      capturedImports?.env.emit_event(1, 96);
      expect(stateHandler).toHaveBeenCalledWith({ soil: 'dry', pump: true });
    });
  });

  describe('WAT output format', () => {
    it('should generate valid WAT structure', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp);

      // Check basic structure
      expect(result.wat).toMatch(/^\(module/);
      expect(result.wat).toMatch(/\)$/);

      // Check for required sections
      expect(result.wat).toContain('(import');
      expect(result.wat).toContain('(memory');
      expect(result.wat).toContain('(global');
      expect(result.wat).toContain('(func');
      expect(result.wat).toContain('(export');
    });

    it('should include debug comments when enabled', () => {
      const comp = createTestComposition({ name: 'debug_test' });
      const result = compileToWASM(comp, { debug: true });

      expect(result.wat).toContain('Module:');
    });

    it('should handle thread support option', () => {
      const comp = createTestComposition();
      const result = compileToWASM(comp, { threads: true });

      expect(result.wat).toContain('shared');
    });
  });

  describe('type inference', () => {
    it('should infer i32 for integers', () => {
      const comp = createTestComposition({
        state: { integer: 42 },
      });
      const result = compileToWASM(comp);

      expect(result.wat).toContain('i32.store');
      expect(result.wat).toContain('(result i32)');
    });

    it('should infer f32 for floats', () => {
      const comp = createTestComposition({
        state: { float: 3.14 },
      });
      const result = compileToWASM(comp);

      expect(result.wat).toContain('f32.store');
      expect(result.wat).toContain('(result f32)');
    });

    it('should infer i32 for booleans', () => {
      const comp = createTestComposition({
        state: { flag: true },
      });
      const result = compileToWASM(comp);

      expect(result.wat).toContain('i32.const 1'); // true = 1
    });
  });
});

describe('WASMCompiler edge cases', () => {
  it('should handle special characters in names', () => {
    const comp = createTestComposition({
      objects: [
        { name: 'my-object-1', properties: [] },
        { name: 'another_object', properties: [] },
      ],
    });
    const result = compileToWASM(comp);

    // Names should be sanitized
    expect(result.wat).toContain('my_object_1');
    expect(result.wat).toContain('another_object');
  });

  it('should handle large state', () => {
    const state: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      state[`var_${i}`] = i;
    }

    const comp = createTestComposition({ state });
    const result = compileToWASM(comp);

    expect(result.memoryLayout.stateSize).toBe(400); // 100 * 4 bytes
    expect(result.exports.length).toBeGreaterThan(200); // getters + setters
  });

  it('should handle empty state', () => {
    const comp = createTestComposition({ state: {} });
    const result = compileToWASM(comp);

    expect(result.memoryLayout.stateSize).toBe(0);
  });

  it('should handle objects without properties', () => {
    const comp = createTestComposition({
      objects: [{ name: 'empty_obj', properties: [] }],
    });
    const result = compileToWASM(comp);

    expect(result.wat).toContain('empty_obj');
    expect(result.memoryLayout.objectsSize).toBeGreaterThan(0); // Still has header
  });
});
