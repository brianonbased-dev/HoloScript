/**
 * WebGPU Renderer Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGPURenderer } from '../WebGPURenderer';
import type {
  IWebGPUContext,
  IShaderModule,
  IRenderPipelineDescriptor,
  IRenderMesh,
  IRenderMaterial,
  IDrawCall,
} from '../WebGPUTypes';
import { STANDARD_VERTEX_SHADER, STANDARD_FRAGMENT_SHADER } from '../WebGPUTypes';

// ============================================================================
// Mock WebGPU API
// ============================================================================

const createMockBuffer = () => ({
  destroy: vi.fn(),
  getMappedRange: vi.fn(),
  mapAsync: vi.fn(),
  unmap: vi.fn(),
  label: 'mock-buffer',
  size: 1024,
  usage: 0,
  mapState: 'unmapped' as const,
});

const createMockTexture = () => ({
  destroy: vi.fn(),
  createView: vi.fn().mockReturnValue({
    label: 'mock-view',
  }),
  label: 'mock-texture',
  width: 256,
  height: 256,
  depthOrArrayLayers: 1,
  mipLevelCount: 1,
  sampleCount: 1,
  dimension: '2d' as const,
  format: 'rgba8unorm' as const,
  usage: 0,
});

const createMockSampler = () => ({
  label: 'mock-sampler',
});

const createMockBindGroupLayout = () => ({
  label: 'mock-bind-group-layout',
});

const createMockPipelineLayout = () => ({
  label: 'mock-pipeline-layout',
});

const createMockShaderModule = () => ({
  label: 'mock-shader-module',
  getCompilationInfo: vi.fn().mockResolvedValue({ messages: [] }),
});

const createMockRenderPipeline = () => ({
  label: 'mock-render-pipeline',
  getBindGroupLayout: vi.fn().mockReturnValue(createMockBindGroupLayout()),
});

const createMockBindGroup = () => ({
  label: 'mock-bind-group',
});

const createMockRenderPassEncoder = () => ({
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
  drawIndexed: vi.fn(),
  end: vi.fn(),
});

const createMockCommandEncoder = () => ({
  beginRenderPass: vi.fn().mockReturnValue(createMockRenderPassEncoder()),
  finish: vi.fn().mockReturnValue({}),
});

const createMockQueue = () => ({
  submit: vi.fn(),
  writeBuffer: vi.fn(),
  writeTexture: vi.fn(),
  copyExternalImageToTexture: vi.fn(),
});

const createMockDevice = () => ({
  createBuffer: vi.fn().mockReturnValue(createMockBuffer()),
  createTexture: vi.fn().mockReturnValue(createMockTexture()),
  createSampler: vi.fn().mockReturnValue(createMockSampler()),
  createShaderModule: vi.fn().mockReturnValue(createMockShaderModule()),
  createRenderPipeline: vi.fn().mockReturnValue(createMockRenderPipeline()),
  createBindGroup: vi.fn().mockReturnValue(createMockBindGroup()),
  createBindGroupLayout: vi.fn().mockReturnValue(createMockBindGroupLayout()),
  createPipelineLayout: vi.fn().mockReturnValue(createMockPipelineLayout()),
  createCommandEncoder: vi.fn().mockReturnValue(createMockCommandEncoder()),
  queue: createMockQueue(),
  destroy: vi.fn(),
  limits: {
    maxTextureDimension2D: 8192,
    maxTextureArrayLayers: 256,
    maxBindGroups: 8,
    maxBindingsPerBindGroup: 1000,
    maxBufferSize: 256 * 1024 * 1024,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    maxVertexBuffers: 8,
    maxVertexAttributes: 16,
    maxComputeWorkgroupsPerDimension: 65535,
  },
  features: new Set(['depth-clip-control', 'bgra8unorm-storage']),
  lost: Promise.resolve({ reason: 'destroyed', message: 'test' }),
});

const createMockAdapter = () => ({
  features: new Set(['depth-clip-control', 'bgra8unorm-storage', 'texture-compression-bc']),
  limits: {
    maxTextureDimension2D: 8192,
  },
  requestDevice: vi.fn().mockResolvedValue(createMockDevice()),
  requestAdapterInfo: vi.fn().mockResolvedValue({ vendor: 'test', architecture: 'test' }),
});

const createMockCanvasContext = () => ({
  configure: vi.fn(),
  unconfigure: vi.fn(),
  getCurrentTexture: vi.fn().mockReturnValue(createMockTexture()),
});

const createMockCanvas = () => {
  const canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn().mockReturnValue(createMockCanvasContext()),
  };
  return canvas as unknown as HTMLCanvasElement;
};

const setupMockWebGPU = () => {
  const mockGPU = {
    requestAdapter: vi.fn().mockResolvedValue(createMockAdapter()),
    getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
  };

  vi.stubGlobal('navigator', { gpu: mockGPU });

  // Mock document for canvas lookup
  vi.stubGlobal('document', {
    querySelector: vi.fn().mockReturnValue(createMockCanvas()),
  });

  // Mock HTMLCanvasElement
  vi.stubGlobal('HTMLCanvasElement', class HTMLCanvasElement {});

  // Mock GPUBufferUsage
  vi.stubGlobal('GPUBufferUsage', {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  });

  // Mock GPUTextureUsage
  vi.stubGlobal('GPUTextureUsage', {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
  });

  // Mock GPUColorWrite
  vi.stubGlobal('GPUColorWrite', {
    RED: 1,
    GREEN: 2,
    BLUE: 4,
    ALPHA: 8,
    ALL: 15,
  });

  return mockGPU;
};

const cleanupMockWebGPU = () => {
  vi.unstubAllGlobals();
};

// ============================================================================
// Tests
// ============================================================================

describe('WebGPURenderer', () => {
  beforeEach(() => {
    setupMockWebGPU();
  });

  afterEach(() => {
    cleanupMockWebGPU();
  });

  describe('static methods', () => {
    it('reports WebGPU as supported when navigator.gpu exists', () => {
      expect(WebGPURenderer.isSupported()).toBe(true);
    });

    it('reports WebGPU as not supported when navigator.gpu is missing', () => {
      delete (global as any).navigator.gpu;
      expect(WebGPURenderer.isSupported()).toBe(false);
    });
  });

  describe('initialization', () => {
    it('initializes with default options', async () => {
      const renderer = new WebGPURenderer();
      const context = await renderer.initialize({ canvas: '#canvas' });

      expect(context).toBeDefined();
      expect(context.adapter).toBeDefined();
      expect(context.device).toBeDefined();
      expect(context.context).toBeDefined();
      expect(context.format).toBe('bgra8unorm');
    });

    it('initializes with custom options', async () => {
      const renderer = new WebGPURenderer({
        powerPreference: 'low-power',
        sampleCount: 4,
        debug: true,
      });
      const context = await renderer.initialize({ canvas: '#canvas' });

      expect(context).toBeDefined();
    });

    it('throws error when WebGPU is not supported', async () => {
      delete (global as any).navigator.gpu;
      const renderer = new WebGPURenderer();

      await expect(renderer.initialize({ canvas: '#canvas' })).rejects.toThrow(
        'WebGPU is not supported'
      );
    });

    it('throws error when adapter request fails', async () => {
      (global as any).navigator.gpu.requestAdapter.mockResolvedValue(null);
      const renderer = new WebGPURenderer();

      await expect(renderer.initialize({ canvas: '#canvas' })).rejects.toThrow(
        'Failed to get WebGPU adapter'
      );
    });

    it('throws error when canvas is not found', async () => {
      (global as any).document.querySelector.mockReturnValue(null);
      const renderer = new WebGPURenderer();

      await expect(renderer.initialize({ canvas: '#nonexistent' })).rejects.toThrow(
        'Canvas not found'
      );
    });

    it('throws error when required feature is missing', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.features = new Set();
      (global as any).navigator.gpu.requestAdapter.mockResolvedValue(mockAdapter);

      const renderer = new WebGPURenderer({
        requiredFeatures: ['timestamp-query'] as any,
      });

      await expect(renderer.initialize({ canvas: '#canvas' })).rejects.toThrow(
        'Required feature not supported'
      );
    });
  });

  describe('getters', () => {
    it('returns null context before initialization', () => {
      const renderer = new WebGPURenderer();
      expect(renderer.getContext()).toBeNull();
      expect(renderer.getDevice()).toBeNull();
      expect(renderer.getCanvas()).toBeNull();
    });

    it('returns context after initialization', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      expect(renderer.getContext()).not.toBeNull();
      expect(renderer.getDevice()).not.toBeNull();
      expect(renderer.getCanvas()).not.toBeNull();
    });

    it('returns default resources after initialization', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      expect(renderer.getDefaultSampler()).not.toBeNull();
      expect(renderer.getDefaultTexture()).not.toBeNull();
    });
  });

  describe('buffer creation', () => {
    it('creates a vertex buffer', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const data = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const buffer = renderer.createVertexBuffer(data, 0);

      expect(buffer).toBeDefined();
      expect(buffer.buffer).toBeDefined();
      expect(buffer.slot).toBe(0);
    });

    it('creates an index buffer with uint16', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const indices = new Uint16Array([0, 1, 2]);
      const buffer = renderer.createIndexBuffer(indices);

      expect(buffer).toBeDefined();
      expect(buffer.format).toBe('uint16');
      expect(buffer.indexCount).toBe(3);
    });

    it('creates an index buffer with uint32', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
      const buffer = renderer.createIndexBuffer(indices);

      expect(buffer.format).toBe('uint32');
      expect(buffer.indexCount).toBe(6);
    });

    it('creates a generic buffer', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const buffer = renderer.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: 'test-buffer',
      });

      expect(buffer).toBeDefined();
    });

    it('throws when creating buffer without initialization', () => {
      const renderer = new WebGPURenderer();

      expect(() =>
        renderer.createBuffer({
          size: 256,
          usage: 0,
        })
      ).toThrow('Renderer not initialized');
    });
  });

  describe('texture creation', () => {
    it('creates a texture', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const texture = renderer.createTexture({
        width: 256,
        height: 256,
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });

      expect(texture).toBeDefined();
    });

    it('creates a sampler', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const sampler = renderer.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
      });

      expect(sampler).toBeDefined();
    });
  });

  describe('shader modules', () => {
    it('creates a shader module', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const shaderModule: IShaderModule = {
        code: STANDARD_VERTEX_SHADER,
        entryPoint: 'main',
        label: 'test-shader',
      };

      const module = renderer.createShaderModule(shaderModule);
      expect(module).toBeDefined();
    });

    it('caches shader modules', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const shaderModule: IShaderModule = {
        code: 'fn main() {}',
        entryPoint: 'main',
        label: 'cached-shader',
      };

      const module1 = renderer.createShaderModule(shaderModule);
      const module2 = renderer.createShaderModule(shaderModule);

      expect(module1).toBe(module2);
    });
  });

  describe('pipeline creation', () => {
    it('creates a render pipeline', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const descriptor: IRenderPipelineDescriptor = {
        vertexShader: {
          code: STANDARD_VERTEX_SHADER,
          entryPoint: 'main',
        },
        fragmentShader: {
          code: STANDARD_FRAGMENT_SHADER,
          entryPoint: 'main',
        },
        vertexBufferLayouts: [
          {
            arrayStride: 32,
            attributes: [
              { format: 'float32x3', offset: 0, shaderLocation: 0 },
              { format: 'float32x3', offset: 12, shaderLocation: 1 },
              { format: 'float32x2', offset: 24, shaderLocation: 2 },
            ],
          },
        ],
        colorTargets: [{ format: 'bgra8unorm' }],
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
        label: 'test-pipeline',
      };

      const pipeline = renderer.createRenderPipeline('test-pipeline', descriptor);
      expect(pipeline).toBeDefined();
    });

    it('caches pipelines by id', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const descriptor: IRenderPipelineDescriptor = {
        vertexShader: { code: 'fn main() {}', entryPoint: 'main' },
        fragmentShader: { code: 'fn main() {}', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      };

      const pipeline1 = renderer.createRenderPipeline('cached-pipeline', descriptor);
      const pipeline2 = renderer.createRenderPipeline('cached-pipeline', descriptor);

      expect(pipeline1).toBe(pipeline2);
    });
  });

  describe('bind groups', () => {
    it('creates a bind group', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const layout = createMockBindGroupLayout() as any;
      const bindGroup = renderer.createBindGroup(layout, [], 'test-bind-group');

      expect(bindGroup).toBeDefined();
    });
  });

  describe('resize', () => {
    it('handles canvas resize', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      // Should not throw
      renderer.resize(1024, 768);
    });

    it('does nothing if size unchanged', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      renderer.resize(800, 600);
    });
  });

  describe('uniforms', () => {
    it('updates camera uniforms', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      // Should not throw
      renderer.updateCameraUniforms({
        viewProjectionMatrix: new Float32Array(16),
        cameraPosition: new Float32Array([0, 0, 5]),
        viewMatrix: new Float32Array(16),
        projectionMatrix: new Float32Array(16),
        inverseViewMatrix: new Float32Array(16),
        inverseProjectionMatrix: new Float32Array(16),
      });
    });

    it('updates scene uniforms', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      // Should not throw
      renderer.updateSceneUniforms({
        ambientColor: new Float32Array([0.1, 0.1, 0.1, 1.0]),
        time: 0,
        deltaTime: 0.016,
        frameNumber: 0,
      });
    });
  });

  describe('render loop', () => {
    it('begins a frame', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const encoder = renderer.beginFrame();
      expect(encoder).not.toBeNull();
    });

    it('begins a render pass', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder, { r: 0, g: 0, b: 0, a: 1 });

      expect(pass).toBeDefined();
    });

    it('ends a render pass', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);

      // Should not throw
      renderer.endRenderPass(pass);
    });

    it('ends a frame', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);
      renderer.endRenderPass(pass);

      // Should not throw
      renderer.endFrame(encoder);
    });
  });

  describe('draw calls', () => {
    it('submits draw calls', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      // Create mock pipeline
      const pipelineDesc: IRenderPipelineDescriptor = {
        vertexShader: { code: 'fn main() {}', entryPoint: 'main' },
        fragmentShader: { code: 'fn main() {}', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      };
      renderer.createRenderPipeline('test-pipeline', pipelineDesc);

      const mesh: IRenderMesh = {
        id: 'mesh-1',
        vertexBuffers: [
          {
            buffer: createMockBuffer() as any,
            vertexCount: 9,
            stride: 4,
            slot: 0,
          },
        ],
        vertexCount: 3,
        instanceCount: 1,
        boundingBox: {
          min: [0, 0, 0],
          max: [1, 1, 1],
        },
      };

      const material: IRenderMaterial = {
        id: 'mat-1',
        pipelineId: 'test-pipeline',
        bindGroup: createMockBindGroup() as any,
        transparent: false,
      };

      const drawCalls: IDrawCall[] = [
        {
          mesh,
          material,
          sortKey: 0,
        },
      ];

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);

      // Should not throw
      renderer.submitDrawCalls(pass, drawCalls);

      renderer.endRenderPass(pass);
      renderer.endFrame(encoder);
    });

    it('handles indexed draw calls', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      renderer.createRenderPipeline('test-pipeline', {
        vertexShader: { code: 'fn main() {}', entryPoint: 'main' },
        fragmentShader: { code: 'fn main() {}', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      });

      const mesh: IRenderMesh = {
        id: 'mesh-indexed',
        vertexBuffers: [
          {
            buffer: createMockBuffer() as any,
            vertexCount: 9,
            stride: 4,
            slot: 0,
          },
        ],
        indexBuffer: {
          buffer: createMockBuffer() as any,
          indexCount: 6,
          format: 'uint16',
        },
        vertexCount: 4,
        instanceCount: 1,
        boundingBox: {
          min: [0, 0, 0],
          max: [1, 1, 1],
        },
      };

      const material: IRenderMaterial = {
        id: 'mat-indexed',
        pipelineId: 'test-pipeline',
        bindGroup: createMockBindGroup() as any,
        transparent: false,
      };

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);

      renderer.submitDrawCalls(pass, [{ mesh, material, sortKey: 0 }]);

      renderer.endRenderPass(pass);
      renderer.endFrame(encoder);
    });

    it('sorts draw calls correctly', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      renderer.createRenderPipeline('pipeline-a', {
        vertexShader: { code: 'fn main() {}', entryPoint: 'main' },
        fragmentShader: { code: 'fn main() {}', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      });

      renderer.createRenderPipeline('pipeline-b', {
        vertexShader: { code: 'fn main() {}', entryPoint: 'main' },
        fragmentShader: { code: 'fn main() {}', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      });

      const createMesh = (): IRenderMesh => ({
        id: `mesh-${Math.random()}`,
        vertexBuffers: [
          {
            buffer: createMockBuffer() as any,
            vertexCount: 3,
            stride: 4,
            slot: 0,
          },
        ],
        vertexCount: 3,
        instanceCount: 1,
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      });

      const drawCalls: IDrawCall[] = [
        {
          mesh: createMesh(),
          material: {
            id: 'transparent-1',
            pipelineId: 'pipeline-a',
            bindGroup: createMockBindGroup() as any,
            transparent: true,
          },
          sortKey: 1,
          cameraDistance: 5,
        },
        {
          mesh: createMesh(),
          material: {
            id: 'opaque-1',
            pipelineId: 'pipeline-b',
            bindGroup: createMockBindGroup() as any,
            transparent: false,
          },
          sortKey: 0,
        },
        {
          mesh: createMesh(),
          material: {
            id: 'transparent-2',
            pipelineId: 'pipeline-a',
            bindGroup: createMockBindGroup() as any,
            transparent: true,
          },
          sortKey: 2,
          cameraDistance: 10,
        },
      ];

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);

      renderer.submitDrawCalls(pass, drawCalls);

      renderer.endRenderPass(pass);
      renderer.endFrame(encoder);
    });
  });

  describe('statistics', () => {
    it('returns render stats', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const stats = renderer.getStats();

      expect(stats).toBeDefined();
      expect(stats.currentFrame).toBeDefined();
      expect(stats.totalFrames).toBe(0);
    });

    it('updates stats after frame', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      const encoder = renderer.beginFrame()!;
      const pass = renderer.beginRenderPass(encoder);
      renderer.endRenderPass(pass);
      renderer.endFrame(encoder);

      const stats = renderer.getStats();
      expect(stats.totalFrames).toBe(1);
    });
  });

  describe('destroy', () => {
    it('destroys renderer and releases resources', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      renderer.destroy();

      expect(renderer.getContext()).toBeNull();
    });

    it('can be called multiple times safely', async () => {
      const renderer = new WebGPURenderer();
      await renderer.initialize({ canvas: '#canvas' });

      renderer.destroy();
      renderer.destroy();

      expect(renderer.getContext()).toBeNull();
    });
  });
});

describe('WebGPU Shaders', () => {
  it('has valid vertex shader', () => {
    expect(STANDARD_VERTEX_SHADER).toBeDefined();
    expect(STANDARD_VERTEX_SHADER).toContain('@vertex');
    expect(STANDARD_VERTEX_SHADER).toContain('fn main');
  });

  it('has valid fragment shader', () => {
    expect(STANDARD_FRAGMENT_SHADER).toBeDefined();
    expect(STANDARD_FRAGMENT_SHADER).toContain('@fragment');
    expect(STANDARD_FRAGMENT_SHADER).toContain('fn main');
  });

  it('vertex shader has proper inputs', () => {
    expect(STANDARD_VERTEX_SHADER).toContain('@location(0)');
    expect(STANDARD_VERTEX_SHADER).toContain('@location(1)');
    expect(STANDARD_VERTEX_SHADER).toContain('@location(2)');
  });

  it('fragment shader has PBR calculations', () => {
    expect(STANDARD_FRAGMENT_SHADER).toContain('distributionGGX');
    expect(STANDARD_FRAGMENT_SHADER).toContain('geometrySchlickGGX');
    expect(STANDARD_FRAGMENT_SHADER).toContain('fresnelSchlick');
  });
});

describe('WebGPURenderer without initialization', () => {
  beforeEach(() => {
    setupMockWebGPU();
  });

  afterEach(() => {
    cleanupMockWebGPU();
  });

  it('createShaderModule throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() =>
      renderer.createShaderModule({
        code: 'fn main() {}',
        entryPoint: 'main',
      })
    ).toThrow('Renderer not initialized');
  });

  it('createRenderPipeline throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() =>
      renderer.createRenderPipeline('test', {
        vertexShader: { code: '', entryPoint: 'main' },
        fragmentShader: { code: '', entryPoint: 'main' },
        vertexBufferLayouts: [],
        colorTargets: [],
      })
    ).toThrow('Renderer not initialized');
  });

  it('createVertexBuffer throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() => renderer.createVertexBuffer(new Float32Array([0, 0, 0]))).toThrow(
      'Renderer not initialized'
    );
  });

  it('createIndexBuffer throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() => renderer.createIndexBuffer(new Uint16Array([0, 1, 2]))).toThrow(
      'Renderer not initialized'
    );
  });

  it('createTexture throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() =>
      renderer.createTexture({
        width: 256,
        height: 256,
        format: 'rgba8unorm',
        usage: 0,
      })
    ).toThrow('Renderer not initialized');
  });

  it('createSampler throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() => renderer.createSampler()).toThrow('Renderer not initialized');
  });

  it('createBindGroup throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() => renderer.createBindGroup({} as any, [])).toThrow('Renderer not initialized');
  });

  it('beginRenderPass throws without initialization', () => {
    const renderer = new WebGPURenderer();
    expect(() => renderer.beginRenderPass({} as any)).toThrow('Renderer not initialized');
  });
});
