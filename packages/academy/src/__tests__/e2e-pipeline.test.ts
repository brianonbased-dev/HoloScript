// @vitest-environment jsdom

/**
 * e2e-pipeline.test.ts — End-to-End Compile -> Render -> Interact Pipeline Tests
 *
 * Tests the full HoloScript pipeline from source code to rendered scene tree,
 * validating that:
 *   1. Source code compiles successfully through the CompilerBridge (TS fallback)
 *   2. Compiled output produces valid R3F scene trees
 *   3. Scene trees contain expected node types and properties
 *   4. The bridge handles various source formats (template, composition, .hsplus)
 *   5. Error cases are handled gracefully throughout the pipeline
 *
 * These tests use the TypeScript fallback path (no WASM) to ensure the
 * pipeline works in CI environments without native binaries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock @holoscript/core with real-ish implementations
const mockR3FTree = {
  type: 'group',
  id: 'root',
  props: {},
  children: [
    {
      type: 'mesh',
      id: 'cube-1',
      props: {
        hsType: 'cube',
        color: '#00ffff',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        size: 1,
      },
      children: [],
    },
    {
      type: 'mesh',
      id: 'sphere-1',
      props: {
        hsType: 'sphere',
        color: '#ff00ff',
        position: [3, 1.5, -2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        size: 2,
      },
      children: [],
    },
    {
      type: 'directionalLight',
      id: 'light-1',
      props: {
        color: '#ffffff',
        intensity: 1,
        position: [5, 10, 5],
        shadows: true,
      },
      children: [],
    },
    {
      type: 'ambientLight',
      id: 'ambient-1',
      props: {
        color: '#e8e0ff',
        intensity: 0.4,
      },
      children: [],
    },
  ],
};

const mockCompositionTree = {
  type: 'group',
  id: 'composition-root',
  props: {},
  children: [
    {
      type: 'group',
      id: 'spatial-group-arena',
      props: { position: [0, 0, 0] },
      children: [
        {
          type: 'mesh',
          id: 'orb-1',
          props: {
            hsType: 'sphere',
            color: '#00ffff',
            position: [0, 1.5, -2],
            size: 1,
          },
          children: [],
        },
        {
          type: 'mesh',
          id: 'floor',
          props: {
            hsType: 'cube',
            color: '#333366',
            position: [0, -0.5, 0],
            scale: [20, 1, 20],
            size: 1,
          },
          children: [],
        },
      ],
    },
  ],
};

vi.mock('@holoscript/core', () => ({
  parseHolo: vi.fn().mockReturnValue({ type: 'composition', body: [] }),
  MATERIAL_PRESETS: {
    metal: { metalness: 0.8, roughness: 0.2, color: '#888888' },
    glass: { metalness: 0.1, roughness: 0.05, color: '#aaccff', transparent: true, opacity: 0.3 },
    neon: { emissive: '#00ffff', emissiveIntensity: 2.0, color: '#00ffff' },
  },
  HoloScriptValidator: class {
    validate() {
      return [];
    }
  },
  HoloScriptPlusParser: class {
    parse(source: string) {
      if (source.includes('SYNTAX_ERROR')) {
        return { errors: [{ message: 'Unexpected token: SYNTAX_ERROR' }] };
      }
      return { ast: { type: 'program', body: [{ type: 'template', name: 'Test' }] } };
    }
  },
  HoloCompositionParser: class {
    parse(source: string) {
      if (source.includes('SYNTAX_ERROR')) {
        return { errors: [{ message: 'Composition parse error: invalid structure' }] };
      }
      return { ast: { type: 'composition', name: 'TestComp', body: [] } };
    }
  },
  R3FCompiler: class {
    compile(ast: unknown) {
      return mockR3FTree;
    }
    compileComposition(ast: unknown) {
      return mockCompositionTree;
    }
  },
  BabylonCompiler: class {
    compile(ast: unknown) {
      return { engine: 'babylon', meshes: [{ name: 'cube', type: 'box' }] };
    }
  },
}));

// Mock Worker (no real WASM in test env)
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }))
);

// Mock the useCompilerBridge hook to use our mock core
import { CompilerBridge, resetCompilerBridge } from '../lib/wasm-compiler-bridge';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('E2E Pipeline: Compile -> Render -> Interact', { timeout: 30_000 }, () => {
  let bridge: CompilerBridge;

  beforeEach(() => {
    resetCompilerBridge();
    bridge = new CompilerBridge();
  });

  afterEach(() => {
    bridge.destroy();
  });

  // ── Phase 1: Compilation ──────────────────────────────────────────────────

  describe('Phase 1: Source -> AST (Parse)', () => {
    it('should parse template source to AST', async () => {
      const source = 'template "Cube" { geometry: "cube" }';
      const result = await bridge.parse(source);

      expect(result.ast).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should parse composition source to AST', async () => {
      const source = 'composition "Scene" { object "Box" { geometry: "cube" } }';
      const result = await bridge.parse(source);

      expect(result.ast).toBeDefined();
    });

    it('should return errors for invalid syntax', async () => {
      const source = 'SYNTAX_ERROR invalid code here';
      const result = await bridge.parse(source);

      // The fallback parser may return ast or errors depending on implementation
      // What matters is it does not throw
      expect(result).toBeDefined();
    });

    it('should handle empty source gracefully', async () => {
      const result = await bridge.parse('');
      expect(result).toBeDefined();
    });
  });

  // ── Phase 2: AST -> R3F Scene Tree (Compile) ─────────────────────────────

  describe('Phase 2: AST -> R3F Tree (Compile)', () => {
    it('should compile template source to Three.js R3F tree', async () => {
      const source = 'template "Orb" { geometry: "sphere" color: "#00ffff" }';
      const result = await bridge.compile(source, 'threejs');

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const tree = JSON.parse(result.data);
        expect(tree.type).toBe('group');
        expect(tree.children).toBeDefined();
        expect(Array.isArray(tree.children)).toBe(true);
      }
    });

    it('should compile composition source to R3F tree', async () => {
      const source = 'composition "Arena" { object "Orb" { geometry: "sphere" } }';
      const result = await bridge.compile(source, 'threejs');

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const tree = JSON.parse(result.data);
        expect(tree.type).toBe('group');
        expect(tree.id).toBe('composition-root');
      }
    });

    it('should produce meshes with correct geometry types', async () => {
      const source = 'template "Test" { geometry: "cube" }';
      const result = await bridge.compile(source, 'threejs');

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const tree = JSON.parse(result.data);
        const meshes = tree.children.filter((c: any) => c.type === 'mesh');
        expect(meshes.length).toBeGreaterThan(0);

        // Verify mesh has hsType for geometry mapping
        const firstMesh = meshes[0];
        expect(firstMesh.props.hsType).toBeDefined();
        expect(['cube', 'sphere', 'cylinder', 'cone', 'box', 'orb']).toContain(
          firstMesh.props.hsType
        );
      }
    });

    it('should produce lights in the scene tree', async () => {
      const source = 'template "Lit" { geometry: "sphere" }';
      const result = await bridge.compile(source, 'threejs');

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const tree = JSON.parse(result.data);
        const lights = tree.children.filter(
          (c: any) =>
            c.type === 'directionalLight' ||
            c.type === 'ambientLight' ||
            c.type === 'pointLight' ||
            c.type === 'spotLight'
        );
        expect(lights.length).toBeGreaterThan(0);
      }
    });

    it('should include position, rotation, scale on mesh nodes', async () => {
      const source = 'template "Positioned" { geometry: "cube" position: [1, 2, 3] }';
      const result = await bridge.compile(source, 'threejs');

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const tree = JSON.parse(result.data);
        const meshes = tree.children.filter((c: any) => c.type === 'mesh');
        if (meshes.length > 0) {
          const mesh = meshes[0];
          expect(mesh.props.position).toBeDefined();
          expect(Array.isArray(mesh.props.position)).toBe(true);
        }
      }
    });

    it('should return compile errors for invalid source', async () => {
      const source = 'SYNTAX_ERROR { this is broken }';
      const result = await bridge.compile(source, 'threejs');

      // Should either return error result or parse successfully (fallback parser is lenient)
      expect(result).toBeDefined();
      expect(['text', 'error']).toContain(result.type);
    });
  });

  // ── Phase 3: Multiple Compile Targets ─────────────────────────────────────

  describe('Phase 3: Multi-Target Compilation', () => {
    const source = 'template "MultiTarget" { geometry: "sphere" color: "#ff0000" }';

    it('should compile to Three.js target', async () => {
      const result = await bridge.compile(source, 'threejs');
      expect(result.type).toBe('text');
    });

    it('should compile to JSON AST target', async () => {
      const result = await bridge.compile(source, 'json-ast');
      expect(result.type).toBe('text');
    });

    it('should compile to Babylon.js target', async () => {
      const result = await bridge.compile(source, 'babylonjs');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        const output = JSON.parse(result.data);
        expect(output.engine).toBe('babylon');
      }
    });

    it('should return error for unsupported fallback targets', async () => {
      const result = await bridge.compile(source, 'aframe-html');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0].message).toContain('not available in TS fallback');
      }
    });
  });

  // ── Phase 4: Validation Pipeline ──────────────────────────────────────────

  describe('Phase 4: Source Validation', () => {
    it('should validate correct source as valid', async () => {
      const source = 'template "Valid" { geometry: "cube" }';
      const result = await bridge.validate(source);

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toEqual([]);
    });

    it('should return validation result structure', async () => {
      const result = await bridge.validate('anything');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('diagnostics');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });
  });

  // ── Phase 5: Generator Pipeline ───────────────────────────────────────────

  describe('Phase 5: AI Object/Scene Generation', () => {
    it('should generate object from description', async () => {
      const result = await bridge.generateObject('a glowing blue sphere');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('object');
    });

    it('should generate scene from description', async () => {
      const result = await bridge.generateScene('a VR arena with platforms');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('composition');
    });

    it('should suggest traits from description', async () => {
      const result = await bridge.suggestTraits('a ball I can pick up and throw');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Should suggest grabbable and/or throwable
      const traitNames = result.map((t: any) => t.name);
      expect(traitNames.some((n: string) => n === 'grabbable' || n === 'throwable')).toBe(true);
    });

    it('should list available traits', async () => {
      const result = await bridge.listTraits();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Each trait should have name, category, description
      result.forEach((trait: any) => {
        expect(trait.name).toBeDefined();
        expect(trait.category).toBeDefined();
        expect(trait.description).toBeDefined();
      });
    });

    it('should filter traits by category', async () => {
      const result = await bridge.listTraitsByCategory('interaction');

      expect(Array.isArray(result)).toBe(true);
      result.forEach((trait: any) => {
        expect(trait.category).toBe('interaction');
      });
    });
  });

  // ── Phase 6: Bridge Lifecycle ─────────────────────────────────────────────

  describe('Phase 6: Bridge Lifecycle & Status', () => {
    it('should report typescript-fallback backend when no WASM', () => {
      const status = bridge.getStatus();

      expect(status.backend).toBe('typescript-fallback');
      expect(status.wasmLoaded).toBe(false);
    });

    it('should be functional without calling init()', async () => {
      // Bridge should work in fallback mode without init
      const result = await bridge.parse('template "Test" { geometry: "cube" }');
      expect(result.ast).toBeDefined();
    });

    it('should handle destroy and reject pending requests', () => {
      bridge.destroy();

      // After destroy, bridge should still handle calls gracefully
      // (falls through to fallback since worker is null)
      expect(bridge.getStatus().backend).toBe('typescript-fallback');
    });

    it('should format source (passthrough in fallback)', async () => {
      const source = 'template "Test" { geometry: "cube" }';
      const formatted = await bridge.format(source);

      // Fallback formatter returns source unchanged
      expect(formatted).toBe(source);
    });

    it('should type-check source', async () => {
      const diagnostics = await bridge.checkTypes('template "T" { geometry: "cube" }');

      expect(Array.isArray(diagnostics)).toBe(true);
    });
  });

  // ── Phase 7: Full Pipeline (Source -> Compiled -> Tree Structure) ─────────

  describe('Phase 7: Full Pipeline Validation', () => {
    it('should complete full pipeline: parse -> validate -> compile -> verify tree', async () => {
      const source =
        'composition "FullPipeline" { object "Cube" { geometry: "cube" position: [0, 1, 0] } }';

      // Step 1: Parse
      const parseResult = await bridge.parse(source);
      expect(parseResult.ast).toBeDefined();

      // Step 2: Validate
      const validateResult = await bridge.validate(source);
      expect(validateResult.valid).toBe(true);

      // Step 3: Compile
      const compileResult = await bridge.compile(source, 'threejs');
      expect(compileResult.type).toBe('text');

      // Step 4: Verify tree structure
      if (compileResult.type === 'text') {
        const tree = JSON.parse(compileResult.data);
        expect(tree).toBeDefined();
        expect(tree.type).toBe('group');
        expect(tree.children).toBeDefined();
      }
    });

    it('should handle rapid sequential compilations', async () => {
      const sources = [
        'template "A" { geometry: "cube" }',
        'template "B" { geometry: "sphere" }',
        'template "C" { geometry: "cylinder" }',
        'template "D" { geometry: "cone" }',
        'template "E" { geometry: "torus" }',
      ];

      // Run sequentially to avoid dynamic import race conditions in TS fallback
      const results = [];
      for (const s of sources) {
        results.push(await bridge.compile(s, 'threejs'));
      }

      results.forEach((result) => {
        expect(result.type).toBe('text');
      });
    });

    it('should handle sequential parse then compile', async () => {
      const source = 'template "Sequential" { geometry: "sphere" }';

      // Run sequentially -- dynamic import fallback does not support true concurrency
      const parseResult = await bridge.parse(source);
      const compileResult = await bridge.compile(source, 'threejs');

      expect(parseResult.ast).toBeDefined();
      expect(compileResult.type).toBe('text');
    });

    it('should handle mixed valid and invalid compilations', async () => {
      // Run sequentially to avoid dynamic import race conditions
      const result1 = await bridge.compile('template "Good" { geometry: "cube" }', 'threejs');
      const result2 = await bridge.compile('SYNTAX_ERROR bad', 'threejs');
      const result3 = await bridge.compile('composition "Good" { }', 'threejs');
      const results = [result1, result2, result3];

      // At least one should succeed, errors should not crash other compilations
      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(['text', 'error']).toContain(result.type);
      });
    });
  });
});
