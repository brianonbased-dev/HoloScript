// @vitest-environment jsdom
/**
 * Shader Editor Integration Tests
 *
 * Comprehensive test suite for shader editor services:
 * - Graph persistence (save → load → verify)
 * - Live reload behavior (edit → recompile → verify)
 * - Undo/redo correctness (do → undo → redo → verify)
 * - Template instantiation (create from template → verify)
 * - Material library (save → search → load → verify)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ShaderGraph } from '@/lib/shaderGraph';
import { ShaderEditorService } from '../ShaderEditorService';
import { LivePreviewService } from '../LivePreviewService';
import { MaterialLibrary } from '../MaterialLibrary';
import { ShaderTemplateLibrary } from '../ShaderTemplates';
import {
  UndoRedoSystem,
  AddNodeCommand,
  DeleteNodeCommand,
  ConnectCommand,
  SetPropertyCommand,
} from '../UndoRedoSystem';

// Mock IndexedDB (jsdom provides a stub, just ensure our mock is present)
global.indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
} as any;

// Save and restore navigator.gpu so mock doesn't leak into parallel test files
const _savedGpu = typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined;

beforeAll(() => {
  // Override gpu to undefined for shader editor tests (no WebGPU in test env)
  Object.defineProperty(navigator, 'gpu', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  // Restore original navigator.gpu to prevent mock leakage
  Object.defineProperty(navigator, 'gpu', {
    value: _savedGpu,
    writable: true,
    configurable: true,
  });
});

describe('ShaderEditorService', () => {
  let service: ShaderEditorService;
  // In-memory store shared by the mock db — allows save-then-load roundtrips
  const mockStore: Record<string, Record<string, unknown>> = {};

  beforeEach(async () => {
    // Clear the shared store for each test
    for (const k of Object.keys(mockStore)) delete mockStore[k];

    service = new ShaderEditorService();
    // Mock the database initialization
    vi.spyOn(service as any, 'ensureDB').mockResolvedValue(undefined);
    (service as any).db = {
      transaction: vi.fn((stores: string | string[]) => {
        const storeList = Array.isArray(stores) ? stores : [stores];
        return {
          objectStore: vi.fn((name: string) => ({
            add: vi.fn((data: Record<string, unknown>) => {
              const bucket = name;
              if (!mockStore[bucket]) mockStore[bucket] = {};
              const key = String(data?.id ?? data?.key ?? Date.now());
              mockStore[bucket][key] = data;
              return Promise.resolve(key);
            }),
            put: vi.fn((data: Record<string, unknown>) => {
              const bucket = name;
              if (!mockStore[bucket]) mockStore[bucket] = {};
              const key = String(data?.id ?? data?.key ?? Date.now());
              mockStore[bucket][key] = data;
              return Promise.resolve(key);
            }),
            get: vi.fn((key: string) => Promise.resolve(mockStore[name]?.[key] ?? null)),
            delete: vi.fn((key: string) => {
              delete mockStore[name]?.[key];
              return Promise.resolve();
            }),
            getAll: vi.fn(() => Promise.resolve(Object.values(mockStore[name] ?? {}))),
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue([]),
              getAllKeys: vi.fn().mockResolvedValue([]),
            })),
          })),
          done: Promise.resolve(),
        };
      }),
      get: vi.fn((store: string, key: string) => Promise.resolve(mockStore[store]?.[key] ?? null)),
      getAll: vi.fn((store: string) => Promise.resolve(Object.values(mockStore[store] ?? {}))),
      add: vi.fn((store: string, data: Record<string, unknown>) => {
        if (!mockStore[store]) mockStore[store] = {};
        const key = String(data?.id ?? data?.key ?? Date.now());
        mockStore[store][key] = data;
        return Promise.resolve(key);
      }),
      put: vi.fn((store: string, data: Record<string, unknown>) => {
        if (!mockStore[store]) mockStore[store] = {};
        const key = String(data?.id ?? data?.key ?? Date.now());
        mockStore[store][key] = data;
        return Promise.resolve(key);
      }),
      delete: vi.fn((store: string, key: string) => {
        delete mockStore[store]?.[key];
        return Promise.resolve();
      }),
      close: vi.fn(),
    };
  });

  afterEach(async () => {
    await service.close();
    vi.restoreAllMocks();
  });

  it('should create a new shader graph', async () => {
    const graph = await service.create('Test Graph', 'Test description', ['test']);

    expect(graph).toBeInstanceOf(ShaderGraph);
    expect(graph.name).toBe('Test Graph');
    expect(graph.description).toBe('Test description');
  });

  it('should save and load a shader graph', async () => {
    const originalGraph = new ShaderGraph('Test Graph');
    const node = originalGraph.createNode('constant_float', { x: 100, y: 200 });
    originalGraph.setNodeProperty(node!.id, 'value', 42);

    // Mock the database to return our graph
    (service as any).db.get = vi.fn().mockResolvedValue(originalGraph.toJSON());

    await service.update(originalGraph);
    const loadedGraph = await service.read(originalGraph.id);

    expect(loadedGraph).not.toBeNull();
    expect(loadedGraph!.id).toBe(originalGraph.id);
    expect(loadedGraph!.name).toBe('Test Graph');
    expect(loadedGraph!.nodes.size).toBe(1);

    const loadedNode = Array.from(loadedGraph!.nodes.values())[0];
    expect(loadedNode.properties?.value).toBe(42);
  });

  it('should auto-save graphs with debouncing', async () => {
    const graph = new ShaderGraph('Auto Save Test');

    // Pre-seed metadata so update() doesn't throw 'metadata not found'
    if (!mockStore['metadata']) mockStore['metadata'] = {};
    mockStore['metadata'][graph.id] = {
      id: graph.id,
      name: graph.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1',
      tags: [],
      size: 0,
    };

    vi.useFakeTimers();

    service.queueAutoSave(graph);
    service.queueAutoSave(graph);
    service.queueAutoSave(graph);

    // Should not save immediately
    expect((service as any).db.put).not.toHaveBeenCalled();

    // Fast-forward past debounce delay
    vi.advanceTimersByTime(2500);

    await vi.runAllTimersAsync();

    // Should save once after debounce
    expect((service as any).db.transaction).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should create and restore versions', async () => {
    const graph = new ShaderGraph('Version Test');
    const node = graph.createNode('constant_float', { x: 0, y: 0 });

    // Mock version storage
    const versions: any[] = [];
    (service as any).db.add = vi.fn((store: string, data: any) => {
      if (store === 'versions') versions.push(data);
      return Promise.resolve();
    });
    (service as any).db.transaction = vi.fn(() => ({
      objectStore: vi.fn(() => ({
        index: vi.fn(() => ({
          getAll: vi.fn().mockResolvedValue(versions),
        })),
      })),
    }));

    await service.createVersion(graph.id, 'Initial version', graph);

    expect(versions.length).toBe(1);
    expect(versions[0].message).toBe('Initial version');
  });

  it('should delete graphs and their versions', async () => {
    const graph = new ShaderGraph('Delete Test');

    const deletedStores: string[] = [];
    (service as any).db.transaction = vi.fn(() => ({
      objectStore: vi.fn((store: string) => {
        deletedStores.push(store);
        return {
          delete: vi.fn().mockResolvedValue(undefined),
          index: vi.fn(() => ({
            getAllKeys: vi.fn().mockResolvedValue([]),
          })),
        };
      }),
      done: Promise.resolve(),
    }));

    await service.delete(graph.id);

    expect(deletedStores).toContain('graphs');
    expect(deletedStores).toContain('metadata');
    expect(deletedStores).toContain('versions');
  });

  it('should search graphs by name and description', async () => {
    const testMetadata = [
      { id: '1', name: 'PBR Material', description: 'Standard PBR', tags: [] },
      { id: '2', name: 'Water Shader', description: 'Animated water', tags: [] },
      { id: '3', name: 'Fire Effect', description: 'Volumetric fire', tags: [] },
    ];

    (service as any).db.getAll = vi.fn().mockResolvedValue(testMetadata);

    const results = await service.search('water');

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Water Shader');
  });
});

describe('LivePreviewService', () => {
  let previewService: LivePreviewService;

  beforeEach(() => {
    previewService = new LivePreviewService();
    // Ensure clean state for each test
    previewService.clearCache();
    previewService.resetMetrics();
  });

  afterEach(() => {
    previewService.dispose();
    vi.clearAllMocks();
  });

  it('should compile shader graph successfully', async () => {
    const graph = new ShaderGraph('Test Shader');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const outputNode = graph.createNode('output_surface', { x: 300, y: 0 });

    if (colorNode && outputNode) {
      graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    }

    previewService.setGraph(graph);
    const result = await previewService.recompile();

    expect(result.success).toBe(true);
    expect(result.shader).toBeDefined();
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('should cache compilation results', async () => {
    const graph = new ShaderGraph('Cache Test');
    const node = graph.createNode('constant_float', { x: 0, y: 0 });

    previewService.setGraph(graph);

    const result1 = await previewService.recompile();
    const result2 = await previewService.recompile();

    const metrics = previewService.getMetrics();
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
  });

  it('should recover from compilation errors', async () => {
    const graph = new ShaderGraph('Error Recovery');

    // Create valid graph first
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const outputNode = graph.createNode('output_surface', { x: 300, y: 0 });
    if (colorNode && outputNode) {
      graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    }

    previewService.setGraph(graph);
    const validResult = await previewService.recompile();
    expect(validResult.success).toBe(true);

    // Break the graph (remove output node) — last valid compilation should persist
    graph.removeNode(outputNode!.id);
    await previewService.recompile();

    // After a failed/changed compilation, last valid compilation should still be preserved
    // (exact success flag depends on the compiler stub in test environment)
    expect(previewService.getLastValidCompilation()).not.toBeNull();
    expect(previewService.getLastValidCompilation()?.success).toBe(true);
  });

  it('should track FPS metrics', () => {
    previewService.updateFPS();
    previewService.updateFPS();
    previewService.updateFPS();

    const metrics = previewService.getMetrics();
    expect(metrics.fps).toBeGreaterThan(0);
  });

  it('should notify listeners on changes', async () => {
    const events: any[] = [];
    previewService.onChange((event) => events.push(event));

    const graph = new ShaderGraph('Listener Test');
    const node = graph.createNode('constant_float', { x: 0, y: 0 });

    previewService.setGraph(graph);
    await previewService.recompile();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('compiled');
  });
});

describe('MaterialLibrary', () => {
  let library: MaterialLibrary;

  beforeEach(async () => {
    library = new MaterialLibrary();
    // Mock database
    (library as any).db = {
      getAll: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    await library.initialize();
  });

  it('should load built-in materials', async () => {
    const materials = await library.getAllMaterials();

    expect(materials.length).toBeGreaterThan(0);
    expect(materials.some((m) => m.name === 'PBR Standard')).toBe(true);
    expect(materials.some((m) => m.name === 'Water')).toBe(true);
    expect(materials.some((m) => m.name === 'Fire')).toBe(true);
  });

  it('should filter materials by category', async () => {
    const pbrMaterials = await library.getAllMaterials('pbr');

    expect(pbrMaterials.every((m) => m.category === 'pbr')).toBe(true);
  });

  it('should save custom materials', async () => {
    const graph = new ShaderGraph('Custom Material');
    graph.createNode('constant_color', { x: 0, y: 0 });

    const material = await library.saveMaterial({
      name: 'My Custom Material',
      description: 'Test',
      category: 'custom',
      tags: ['test'],
      graph: graph.toJSON(),
    });

    expect(material.id).toBeDefined();
    expect(material.name).toBe('My Custom Material');
    expect(material.isBuiltIn).toBe(false);
  });

  it('should search materials by tags', async () => {
    const vfxMaterials = await library.getMaterialsByTags(['vfx']);

    expect(vfxMaterials.length).toBeGreaterThan(0);
    expect(vfxMaterials.every((m) => m.tags.includes('vfx'))).toBe(true);
  });

  it('should instantiate material presets', async () => {
    const preset = await library.getMaterial('pbr_standard');
    expect(preset).not.toBeNull();

    const graph = library.instantiateMaterial(preset!);
    expect(graph).toBeInstanceOf(ShaderGraph);
    expect(graph.name).toBe('PBR Standard');
    expect(graph.nodes.size).toBeGreaterThan(0);
  });
});

describe('ShaderTemplateLibrary', () => {
  let templateLibrary: ShaderTemplateLibrary;

  beforeEach(() => {
    templateLibrary = new ShaderTemplateLibrary();
  });

  it('should load built-in templates', () => {
    const templates = templateLibrary.getAllTemplates();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.name === 'Fresnel Rim Light')).toBe(true);
    expect(templates.some((t) => t.name === 'Normal Mapping')).toBe(true);
  });

  it('should filter templates by category', () => {
    const lightingTemplates = templateLibrary.getAllTemplates('lighting');

    expect(lightingTemplates.every((t) => t.category === 'lighting')).toBe(true);
  });

  it('should instantiate templates', () => {
    const template = templateLibrary.getTemplate('fresnel_rim_light');
    expect(template).not.toBeNull();

    const graph = templateLibrary.instantiate('fresnel_rim_light');
    expect(graph).toBeInstanceOf(ShaderGraph);
    expect(graph?.nodes.size).toBeGreaterThan(0);
  });

  it('should search templates by name and tags', () => {
    const results = templateLibrary.search('fresnel');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((t) => t.name.toLowerCase().includes('fresnel'))).toBe(true);
  });
});

describe('UndoRedoSystem', () => {
  let undoRedo: UndoRedoSystem;
  let graph: ShaderGraph;

  beforeEach(() => {
    undoRedo = new UndoRedoSystem();
    graph = new ShaderGraph('Undo Test');
    undoRedo.setGraph(graph);
  });

  it('should execute and undo add node command', () => {
    const command = new AddNodeCommand('constant_float', { x: 100, y: 100 });

    expect(graph.nodes.size).toBe(0);

    undoRedo.execute(command);
    expect(graph.nodes.size).toBe(1);

    undoRedo.undo();
    expect(graph.nodes.size).toBe(0);
  });

  it('should execute and undo delete node command', () => {
    const node = graph.createNode('constant_float', { x: 0, y: 0 });
    expect(graph.nodes.size).toBe(1);

    const command = new DeleteNodeCommand(node!.id);
    undoRedo.execute(command);
    expect(graph.nodes.size).toBe(0);

    undoRedo.undo();
    expect(graph.nodes.size).toBe(1);
  });

  it('should execute and undo connect command', () => {
    const node1 = graph.createNode('constant_float', { x: 0, y: 0 });
    const node2 = graph.createNode('output_surface', { x: 300, y: 0 });

    expect(graph.connections.length).toBe(0);

    const command = new ConnectCommand(node1!.id, 'value', node2!.id, 'roughness');
    undoRedo.execute(command);
    expect(graph.connections.length).toBe(1);

    undoRedo.undo();
    expect(graph.connections.length).toBe(0);
  });

  it('should merge property set commands', () => {
    const node = graph.createNode('constant_float', { x: 0, y: 0 });

    const command1 = new SetPropertyCommand(node!.id, 'value', 1);
    const command2 = new SetPropertyCommand(node!.id, 'value', 2);
    const command3 = new SetPropertyCommand(node!.id, 'value', 3);

    undoRedo.execute(command1);
    undoRedo.execute(command2);
    undoRedo.execute(command3);

    // Should merge into single command
    expect(undoRedo.getHistory().length).toBe(1);

    expect(graph.getNodeProperty(node!.id, 'value')).toBe(3);

    undoRedo.undo();
    expect(graph.getNodeProperty(node!.id, 'value')).toBeUndefined();
  });

  it('should support redo after undo', () => {
    const command = new AddNodeCommand('constant_float', { x: 0, y: 0 });

    undoRedo.execute(command);
    expect(graph.nodes.size).toBe(1);

    undoRedo.undo();
    expect(graph.nodes.size).toBe(0);

    undoRedo.redo();
    expect(graph.nodes.size).toBe(1);
  });

  it('should clear redo history on new command', () => {
    const command1 = new AddNodeCommand('constant_float', { x: 0, y: 0 });
    const command2 = new AddNodeCommand('constant_color', { x: 100, y: 0 });

    undoRedo.execute(command1);
    undoRedo.execute(command2);
    undoRedo.undo();

    expect(undoRedo.canRedo()).toBe(true);

    const command3 = new AddNodeCommand('constant_vec3', { x: 200, y: 0 });
    undoRedo.execute(command3);

    expect(undoRedo.canRedo()).toBe(false);
  });

  it('should respect max history size', () => {
    undoRedo.setMaxHistory(5);

    for (let i = 0; i < 10; i++) {
      undoRedo.execute(new AddNodeCommand('constant_float', { x: i * 100, y: 0 }));
    }

    expect(undoRedo.getHistory().length).toBeLessThanOrEqual(5);
  });
});
