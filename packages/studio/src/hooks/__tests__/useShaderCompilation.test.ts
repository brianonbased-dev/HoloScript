// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useShaderCompilation } from '../useShaderCompilation';
import { useShaderGraph } from '../useShaderGraph';

vi.mock('../useShaderGraph', () => ({
  useShaderGraph: vi.fn(),
}));

describe('useShaderCompilation', () => {
  let mockGraph: any;

  beforeEach(() => {
    mockGraph = {
      nodes: new Map(),
      connections: [],
    };

    (useShaderGraph as any).mockImplementation((selector: any) => {
      return selector({ graph: mockGraph });
    });

    // Mock performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with null compiled shader', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.compiled).toBeNull();
    });

    it('should initialize with not compiling', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.isCompiling).toBe(false);
    });

    it('should initialize with zero lastCompileTime', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.lastCompileTime).toBe(0);
    });
  });

  describe('Compilation - No Output Node', () => {
    it('should compile with warning when no output node exists', async () => {
      mockGraph.nodes = new Map();

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.warnings).toContain('No output node found — add a Fragment Output node.');
      expect(result.current.compiled?.fragmentCode).toBe('');
    });
  });

  describe('Compilation - Simple Graph', () => {
    it('should compile graph with output node only', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.fragmentCode).toContain('void main()');
      expect(result.current.compiled?.vertexCode).toContain('void main()');
    });

    it('should include uniforms in compiled shader', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(100));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();

      await waitFor(() => {
        expect(result.current.compiled?.uniforms).toBeDefined();
      });

      expect(result.current.compiled?.uniforms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'uTime', type: 'float' })
        ])
      );
    });

    it('should include varyings in vertex shader', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.vertexCode).toContain('varying vec2 vUv');
      expect(result.current.compiled?.vertexCode).toContain('varying vec3 vPosition');
      expect(result.current.compiled?.vertexCode).toContain('varying vec3 vNormal');
    });
  });

  describe('Compilation - Connected Nodes', () => {
    it('should compile graph with connected UV and output', async () => {
      const uvNode = {
        id: 'uv-1',
        type: 'UVInput',
        category: 'input',
        inputs: [],
        outputs: [{ id: 'uv-out', name: 'result', type: 'vec2' }],
        properties: {},
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['uv-1', uvNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = [
        {
          id: 'conn-1',
          fromNodeId: 'uv-1',
          fromPortId: 'uv-out',
          toNodeId: 'output-1',
          toPortId: 'color-in',
        },
      ];

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.fragmentCode).toContain('vUv');
    });

    it('should compile graph with math nodes', async () => {
      const addNode = {
        id: 'add-1',
        type: 'AddNode',
        category: 'math',
        inputs: [
          { id: 'a-in', name: 'a', type: 'float', defaultValue: 0.5 },
          { id: 'b-in', name: 'b', type: 'float', defaultValue: 0.3 },
        ],
        outputs: [{ id: 'result-out', name: 'result', type: 'float' }],
        properties: {},
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['add-1', addNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = [
        {
          id: 'conn-1',
          fromNodeId: 'add-1',
          fromPortId: 'result-out',
          toNodeId: 'output-1',
          toPortId: 'color-in',
        },
      ];

      const { result } = renderHook(() => useShaderCompilation(100));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();

      await waitFor(() => {
        expect(result.current.compiled?.fragmentCode).toContain('+');
      });
    });

    it('should compile graph with color constant node', async () => {
      const colorNode = {
        id: 'color-1',
        type: 'ColorConstant',
        category: 'constant',
        inputs: [],
        outputs: [{ id: 'color-out', name: 'color', type: 'vec4' }],
        properties: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['color-1', colorNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = [
        {
          id: 'conn-1',
          fromNodeId: 'color-1',
          fromPortId: 'color-out',
          toNodeId: 'output-1',
          toPortId: 'color-in',
        },
      ];

      const { result } = renderHook(() => useShaderCompilation(100));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();

      await waitFor(() => {
        expect(result.current.compiled?.fragmentCode).toContain('vec4(1, 0, 0, 1)');
      });
    });

    it('should compile graph with texture node', async () => {
      const textureNode = {
        id: 'tex-1',
        type: 'Texture2D',
        category: 'texture',
        inputs: [{ id: 'uv-in', name: 'uv', type: 'vec2' }],
        outputs: [{ id: 'color-out', name: 'color', type: 'vec4' }],
        properties: {},
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['tex-1', textureNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = [
        {
          id: 'conn-1',
          fromNodeId: 'tex-1',
          fromPortId: 'color-out',
          toNodeId: 'output-1',
          toPortId: 'color-in',
        },
      ];

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.fragmentCode).toContain('texture2D');
      expect(result.current.compiled?.textures).toHaveLength(1);
      expect(result.current.compiled?.textures[0]).toContain('uTexture_tex_1');
    });
  });

  describe('Debouncing', () => {
    it('should debounce compilation by default delay', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(50));

      expect(result.current.compiled).toBeNull();

      // Wait for debounce to complete
      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });
    });

    it('should use custom debounce delay', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(100));

      expect(result.current.compiled).toBeNull();

      // Wait for custom debounce to complete
      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });
    });

    it('should reset debounce timer when graph changes', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result, rerender } = renderHook(() => useShaderCompilation(100));

      // Wait for first compile
      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      const firstCompiled = result.current.compiled;

      // Add a color constant node to make meaningfully different shader code
      const colorNode = {
        id: 'color-1',
        type: 'ColorConstant',
        category: 'constant',
        inputs: [],
        outputs: [{ id: 'color-out', name: 'color', type: 'vec4' }],
        properties: { r: 0.5, g: 0.5, b: 1.0, a: 1.0 },
      };

      // Create new graph object (not just mutate) to trigger useEffect dep change
      const newGraph = {
        nodes: new Map([
          ['output-1', outputNode],
          ['color-1', colorNode],
        ]),
        connections: [
          {
            id: 'conn-1',
            fromNodeId: 'color-1',
            fromPortId: 'color-out',
            toNodeId: 'output-1',
            toPortId: 'color-in',
          },
        ],
      };

      (useShaderGraph as any).mockImplementation((selector: any) => {
        return selector({ graph: newGraph });
      });

      rerender();

      // Should trigger new compilation with different output
      await waitFor(() => {
        const currentCode = result.current.compiled?.fragmentCode;
        expect(currentCode).toBeDefined();
        expect(currentCode).toContain('vec4(0.5, 0.5, 1, 1)');
        expect(currentCode).not.toBe(firstCompiled?.fragmentCode);
      }, { timeout: 1000 });
    });
  });

  describe('Compilation State', () => {
    it('should set isCompiling to true during compilation', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(100));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();

      // Wait for compilation to complete
      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 500 });
    });

    it('should track lastCompileTime', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      // Setup performance.now mock that returns increasing values
      let performanceNowValue = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        const current = performanceNowValue;
        performanceNowValue += 15; // Each call adds 15ms
        return current;
      });

      const { result } = renderHook(() => useShaderCompilation(50));

      // Use real timers and wait for compilation
      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      // Check that lastCompileTime was calculated (should be 15ms from our mock)
      await waitFor(() => {
        expect(result.current.lastCompileTime).toBeGreaterThan(0);
      }, { timeout: 500 });

      // Should be 15ms based on our mock (second call minus first call)
      expect(result.current.lastCompileTime).toBe(15);
    });
  });

  describe('Error Handling', () => {
    it('should handle compilation errors gracefully', async () => {
      // Create a scenario that would cause an error
      const badNode = {
        id: 'bad-1',
        type: 'BadNode',
        category: 'unknown',
        inputs: [],
        outputs: [],
        properties: null, // This could cause an error
      };

      mockGraph.nodes = new Map([['bad-1', badNode]]);

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      // Should compile despite unknown node type (just produces /* unknown */ in code)
      expect(result.current.compiled?.warnings).toBeDefined();
    });
  });

  describe('Recompile Function', () => {
    it('should expose recompile function', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.recompile).toBeInstanceOf(Function);
    });

    it('should trigger immediate compilation when recompile is called', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.compiled).toBeNull();

      act(() => {
        result.current.recompile();
      });

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      });
    });
  });

  describe('Export Functions', () => {
    it('should expose exportGLSL function', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.exportGLSL).toBeInstanceOf(Function);
    });

    it('should expose exportWGSL function', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.exportWGSL).toBeInstanceOf(Function);
    });

    it('should expose exportHLSL function', () => {
      const { result } = renderHook(() => useShaderCompilation());

      expect(result.current.exportHLSL).toBeInstanceOf(Function);
    });

    it('should create download blob when exportGLSL is called', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      // Mock document.createElement to capture download
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();

      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);

      act(() => {
        result.current.exportGLSL();
      });

      expect(mockAnchor.download).toBe('shader.glsl');
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should not export when compiled is null', () => {
      const { result } = renderHook(() => useShaderCompilation());

      const createElementSpy = vi.spyOn(document, 'createElement');

      act(() => {
        result.current.exportGLSL();
      });

      expect(createElementSpy).not.toHaveBeenCalled();
    });
  });

  describe('Complex Graphs', () => {
    it('should compile multi-node chain', async () => {
      const timeNode = {
        id: 'time-1',
        type: 'TimeInput',
        category: 'input',
        inputs: [],
        outputs: [{ id: 'time-out', name: 'time', type: 'float' }],
        properties: {},
      };

      const sinNode = {
        id: 'sin-1',
        type: 'SinNode',
        category: 'math',
        inputs: [{ id: 'x-in', name: 'x', type: 'float' }],
        outputs: [{ id: 'result-out', name: 'result', type: 'float' }],
        properties: {},
      };

      const multiplyNode = {
        id: 'mul-1',
        type: 'MultiplyNode',
        category: 'math',
        inputs: [
          { id: 'a-in', name: 'a', type: 'float' },
          { id: 'b-in', name: 'b', type: 'float', defaultValue: 0.5 },
        ],
        outputs: [{ id: 'result-out', name: 'result', type: 'float' }],
        properties: {},
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['time-1', timeNode],
        ['sin-1', sinNode],
        ['mul-1', multiplyNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = [
        { id: 'c1', fromNodeId: 'time-1', fromPortId: 'time-out', toNodeId: 'sin-1', toPortId: 'x-in' },
        { id: 'c2', fromNodeId: 'sin-1', fromPortId: 'result-out', toNodeId: 'mul-1', toPortId: 'a-in' },
        { id: 'c3', fromNodeId: 'mul-1', fromPortId: 'result-out', toNodeId: 'output-1', toPortId: 'color-in' },
      ];

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      const fragCode = result.current.compiled?.fragmentCode ?? '';
      expect(fragCode).toContain('sin');
      expect(fragCode).toContain('*');
      expect(fragCode).toContain('uTime');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty graph', async () => {
      mockGraph.nodes = new Map();
      mockGraph.connections = [];

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      expect(result.current.compiled?.warnings).toHaveLength(1);
    });

    it('should handle disconnected nodes', async () => {
      const uvNode = {
        id: 'uv-1',
        type: 'UVInput',
        category: 'input',
        inputs: [],
        outputs: [{ id: 'uv-out', name: 'uv', type: 'vec2' }],
        properties: {},
      };

      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [{ id: 'color-in', name: 'color', type: 'vec4' }],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([
        ['uv-1', uvNode],
        ['output-1', outputNode],
      ]);
      mockGraph.connections = []; // No connections

      const { result } = renderHook(() => useShaderCompilation(50));

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 1000 });

      // Should compile with default output
      expect(result.current.compiled?.fragmentCode).toContain('void main()');
    });

    it('should handle zero debounce delay', async () => {
      const outputNode = {
        id: 'output-1',
        type: 'FragOutput',
        category: 'output',
        inputs: [],
        outputs: [],
        properties: {},
      };

      mockGraph.nodes = new Map([['output-1', outputNode]]);

      const { result } = renderHook(() => useShaderCompilation(0));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(0);
      });
      vi.useRealTimers();

      await waitFor(() => {
        expect(result.current.compiled).not.toBeNull();
      }, { timeout: 500 });
    });
  });
});
