/**
 * GaussianSplatSorter - Wait-Free Hierarchical Radix Sort for WebGPU Gaussian Splatting
 *
 * Orchestrates the full GPU sort pipeline for Gaussian splat rendering:
 *   1. Compress: raw splats -> RGBA8 colors, f16 covariance, depth keys
 *   2. Sort: 4-pass 8-bit radix sort using Blelloch scan (no global atomics)
 *   3. Render: sorted indices feed the splat renderer for correct back-to-front compositing
 *
 * Performance characteristics:
 *   - O(n) radix sort (4 passes for 32-bit keys)
 *   - Wait-free: no global atomics, no cross-workgroup synchronization
 *   - 50% memory reduction via compression (32 bytes/splat vs 64 bytes)
 *   - Cross-browser: Chrome, Safari, Firefox, mobile (no subgroup ops, no shader-f16)
 *
 * References:
 *   - HoloScript W.035: Radix sort outperforms bitonic sort for N > 64K splats
 *   - HoloScript G.030.01: Safari requires explicit bind group recreation after buffer swap
 *
 * @module gpu/GaussianSplatSorter
 * @version 1.0.0
 */

import type { WebGPUContext } from './WebGPUContext.js';

// Import WGSL shader source as strings (bundler handles this)
// For environments without bundler support, these are loaded via fetch
import radixSortWGSL from './shaders/radix-sort.wgsl?raw';
import splatCompressWGSL from './shaders/splat-compress.wgsl?raw';
import splatRenderSortedWGSL from './shaders/splat-render-sorted.wgsl?raw';

// =============================================================================
// Types
// =============================================================================

export interface GaussianSplatSorterOptions {
  /** Maximum number of splats (determines buffer allocation) */
  maxSplats: number;

  /** Workgroup size for compute shaders (default: 256, must be power of 2) */
  workgroupSize?: number;

  /** Elements processed per thread in sort passes (default: 4) */
  elementsPerThread?: number;

  /** Enable debug timing via timestamp queries (default: false) */
  enableTimestamps?: boolean;

  /** Canvas width for projection calculations */
  canvasWidth: number;

  /** Canvas height for projection calculations */
  canvasHeight: number;
}

export interface SplatSortStats {
  /** Number of splats currently being sorted */
  splatCount: number;

  /** Number of workgroup blocks for sort */
  blockCount: number;

  /** GPU time for compression pass (ms, if timestamps enabled) */
  compressTimeMs?: number;

  /** GPU time for sort passes (ms, if timestamps enabled) */
  sortTimeMs?: number;

  /** GPU time for render (ms, if timestamps enabled) */
  renderTimeMs?: number;

  /** Total GPU time (ms) */
  totalTimeMs?: number;

  /** Memory usage in bytes */
  memoryUsageBytes: number;
}

export interface CameraState {
  /** View matrix (column-major, 16 floats) */
  viewMatrix: Float32Array;

  /** Projection matrix (column-major, 16 floats) */
  projMatrix: Float32Array;

  /** View-projection matrix (column-major, 16 floats) */
  viewProjectionMatrix: Float32Array;

  /** Camera position in world space */
  cameraPosition: [number, number, number];

  /** Focal length X in pixels */
  focalX: number;

  /** Focal length Y in pixels */
  focalY: number;
}

// =============================================================================
// Constants
// =============================================================================

const RADIX_BITS = 8;
const RADIX_SIZE = 256; // 2^8
const NUM_PASSES = 4;   // 32-bit keys / 8 bits per pass
const BYTES_PER_COMPRESSED_SPLAT = 32;
const BYTES_PER_RAW_SPLAT = 64; // vec3 pos + vec3 scale + vec4 rot + vec4 color

// =============================================================================
// GaussianSplatSorter
// =============================================================================

export class GaussianSplatSorter {
  private context: WebGPUContext;
  private device: GPUDevice;
  private options: Required<GaussianSplatSorterOptions>;

  // Shader modules
  private sortShaderModule: GPUShaderModule | null = null;
  private compressShaderModule: GPUShaderModule | null = null;
  private renderShaderModule: GPUShaderModule | null = null;

  // Compute pipelines
  private compressPipeline: GPUComputePipeline | null = null;
  private histogramPipeline: GPUComputePipeline | null = null;
  private blellochScanPipeline: GPUComputePipeline | null = null;
  private globalPrefixPipeline: GPUComputePipeline | null = null;
  private scatterPipeline: GPUComputePipeline | null = null;

  // Render pipeline
  private renderPipeline: GPURenderPipeline | null = null;

  // Buffers
  private rawSplatBuffer: GPUBuffer | null = null;
  private compressedSplatBuffer: GPUBuffer | null = null;
  private sortKeysA: GPUBuffer | null = null;
  private sortKeysB: GPUBuffer | null = null;
  private sortValuesA: GPUBuffer | null = null;
  private sortValuesB: GPUBuffer | null = null;
  private blockHistogramsBuffer: GPUBuffer | null = null;
  private globalPrefixesBuffer: GPUBuffer | null = null;
  private compressUniformBuffer: GPUBuffer | null = null;
  private sortUniformBuffer: GPUBuffer | null = null;
  private renderUniformBuffer: GPUBuffer | null = null;

  // Bind groups (rebuilt each frame due to ping-pong)
  private compressBindGroup: GPUBindGroup | null = null;

  // State
  private splatCount: number = 0;
  private blockCount: number = 0;
  private initialized: boolean = false;

  constructor(context: WebGPUContext, options: GaussianSplatSorterOptions) {
    this.context = context;
    this.device = context.getDevice();
    this.options = {
      maxSplats: options.maxSplats,
      workgroupSize: options.workgroupSize ?? 256,
      elementsPerThread: options.elementsPerThread ?? 4,
      enableTimestamps: options.enableTimestamps ?? false,
      canvasWidth: options.canvasWidth,
      canvasHeight: options.canvasHeight,
    };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize all GPU resources: shaders, pipelines, buffers.
   *
   * Must be called before any sort or render operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('GaussianSplatSorter already initialized');
      return;
    }

    console.log('Initializing GaussianSplatSorter...', {
      maxSplats: this.options.maxSplats,
      workgroupSize: this.options.workgroupSize,
      elementsPerThread: this.options.elementsPerThread,
    });

    // Create shader modules with cross-browser error handling
    await this.createShaderModules();

    // Create compute pipelines
    this.createComputePipelines();

    // Create render pipeline
    this.createRenderPipeline();

    // Allocate GPU buffers
    this.createBuffers();

    this.initialized = true;

    console.log('GaussianSplatSorter initialized:', {
      memoryUsage: `${(this.getMemoryUsage() / 1024 / 1024).toFixed(2)} MB`,
      compressionRatio: `${((1 - BYTES_PER_COMPRESSED_SPLAT / BYTES_PER_RAW_SPLAT) * 100).toFixed(0)}% reduction`,
    });
  }

  /**
   * Create and validate shader modules with cross-browser error reporting.
   */
  private async createShaderModules(): Promise<void> {
    const createModule = async (code: string, label: string): Promise<GPUShaderModule> => {
      const module = this.device.createShaderModule({ label, code });

      // Check compilation (async - may not be supported on all browsers)
      try {
        const info = await module.getCompilationInfo();
        for (const msg of info.messages) {
          if (msg.type === 'error') {
            throw new Error(`Shader compilation error in ${label}: ${msg.message} (line ${msg.lineNum})`);
          }
          if (msg.type === 'warning') {
            console.warn(`Shader warning in ${label}: ${msg.message} (line ${msg.lineNum})`);
          }
        }
      } catch (e: any) {
        // getCompilationInfo may not be available on older browsers
        if (e.message?.includes('Shader compilation error')) {
          throw e;
        }
        console.warn(`Could not validate shader ${label}:`, e.message);
      }

      return module;
    };

    this.sortShaderModule = await createModule(radixSortWGSL, 'radix-sort');
    this.compressShaderModule = await createModule(splatCompressWGSL, 'splat-compress');
    this.renderShaderModule = await createModule(splatRenderSortedWGSL, 'splat-render-sorted');
  }

  /**
   * Create all compute pipelines for the sort.
   */
  private createComputePipelines(): void {
    if (!this.sortShaderModule || !this.compressShaderModule) {
      throw new Error('Shader modules not created');
    }

    // Compression pipeline
    this.compressPipeline = this.device.createComputePipeline({
      label: 'splat-compress-pipeline',
      layout: 'auto',
      compute: {
        module: this.compressShaderModule,
        entryPoint: 'compressAndKey',
      },
    });

    // Histogram pipeline
    this.histogramPipeline = this.device.createComputePipeline({
      label: 'radix-histogram-pipeline',
      layout: 'auto',
      compute: {
        module: this.sortShaderModule,
        entryPoint: 'buildHistogram',
      },
    });

    // Blelloch scan pipeline
    this.blellochScanPipeline = this.device.createComputePipeline({
      label: 'blelloch-scan-pipeline',
      layout: 'auto',
      compute: {
        module: this.sortShaderModule,
        entryPoint: 'blellochScan',
      },
    });

    // Global prefix sum pipeline
    this.globalPrefixPipeline = this.device.createComputePipeline({
      label: 'global-prefix-pipeline',
      layout: 'auto',
      compute: {
        module: this.sortShaderModule,
        entryPoint: 'globalPrefixScan',
      },
    });

    // Scatter pipeline
    this.scatterPipeline = this.device.createComputePipeline({
      label: 'radix-scatter-pipeline',
      layout: 'auto',
      compute: {
        module: this.sortShaderModule,
        entryPoint: 'scatter',
      },
    });
  }

  /**
   * Create render pipeline for sorted splat rendering.
   */
  private createRenderPipeline(): void {
    if (!this.renderShaderModule) {
      throw new Error('Render shader module not created');
    }

    this.renderPipeline = this.device.createRenderPipeline({
      label: 'sorted-splat-render-pipeline',
      layout: 'auto',
      vertex: {
        module: this.renderShaderModule,
        entryPoint: 'vs_main',
        buffers: [], // All data comes from storage buffers
      },
      fragment: {
        module: this.renderShaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: navigator.gpu.getPreferredCanvasFormat(),
          blend: {
            // Premultiplied alpha blending (back-to-front)
            color: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: undefined,
      },
      depthStencil: {
        format: 'depth24plus',
        // Disable depth write for sorted splats (they're already in order)
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
    });
  }

  /**
   * Allocate all GPU buffers.
   */
  private createBuffers(): void {
    const maxSplats = this.options.maxSplats;
    const blockSize = this.options.workgroupSize * this.options.elementsPerThread;
    const maxBlocks = Math.ceil(maxSplats / blockSize);

    // Raw splat input buffer (uploaded from CPU)
    this.rawSplatBuffer = this.device.createBuffer({
      label: 'raw-splats',
      size: maxSplats * BYTES_PER_RAW_SPLAT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Compressed splat buffer
    this.compressedSplatBuffer = this.device.createBuffer({
      label: 'compressed-splats',
      size: maxSplats * BYTES_PER_COMPRESSED_SPLAT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Double-buffered sort key/value pairs (ping-pong between passes)
    const sortBufferSize = maxSplats * 4; // u32 per element
    this.sortKeysA = this.createSortBuffer('sort-keys-a', sortBufferSize);
    this.sortKeysB = this.createSortBuffer('sort-keys-b', sortBufferSize);
    this.sortValuesA = this.createSortBuffer('sort-values-a', sortBufferSize);
    this.sortValuesB = this.createSortBuffer('sort-values-b', sortBufferSize);

    // Block histograms: maxBlocks * RADIX_SIZE * sizeof(u32)
    this.blockHistogramsBuffer = this.device.createBuffer({
      label: 'block-histograms',
      size: maxBlocks * RADIX_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Global prefix sums: RADIX_SIZE * sizeof(u32)
    this.globalPrefixesBuffer = this.device.createBuffer({
      label: 'global-prefixes',
      size: RADIX_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Uniform buffers
    this.compressUniformBuffer = this.device.createBuffer({
      label: 'compress-uniforms',
      size: 160, // 2 * mat4x4 (128) + 4 floats (16) + 4 u32 (16) = 160
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sortUniformBuffer = this.device.createBuffer({
      label: 'sort-uniforms',
      size: 16, // totalCount (4) + bitOffset (4) + blockCount (4) + pad (4)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.renderUniformBuffer = this.device.createBuffer({
      label: 'render-uniforms',
      size: 160, // viewProj (64) + view (64) + camPos (12) + 5 floats (20)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createSortBuffer(label: string, size: number): GPUBuffer {
    return this.device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  }

  // ===========================================================================
  // Data Upload
  // ===========================================================================

  /**
   * Upload raw splat data to the GPU.
   *
   * Expected layout per splat (64 bytes):
   *   position: vec3<f32>  (12 bytes)
   *   scale:    vec3<f32>  (12 bytes)
   *   rotation: vec4<f32>  (16 bytes) - quaternion (w, x, y, z)
   *   color:    vec4<f32>  (16 bytes) - RGBA [0..1]
   *   padding:             (8 bytes)
   *
   * @param data Raw splat data as Float32Array
   * @param count Number of splats (not bytes)
   */
  uploadSplatData(data: Float32Array, count: number): void {
    if (!this.rawSplatBuffer) {
      throw new Error('Buffers not initialized');
    }

    if (count > this.options.maxSplats) {
      throw new Error(`Splat count ${count} exceeds max ${this.options.maxSplats}`);
    }

    this.splatCount = count;
    this.blockCount = Math.ceil(
      count / (this.options.workgroupSize * this.options.elementsPerThread)
    );

    this.device.queue.writeBuffer(
      this.rawSplatBuffer,
      0,
      data.buffer,
      data.byteOffset,
      count * BYTES_PER_RAW_SPLAT,
    );

    console.log(`Uploaded ${count} splats (${(count * BYTES_PER_RAW_SPLAT / 1024 / 1024).toFixed(2)} MB)`);
  }

  // ===========================================================================
  // Sort Execution
  // ===========================================================================

  /**
   * Execute the full sort pipeline: compress -> 4-pass radix sort.
   *
   * Should be called each frame before rendering when the camera moves.
   * Uses a single command encoder for all passes to minimize CPU overhead.
   *
   * @param camera Current camera state for depth computation
   * @param commandEncoder Optional encoder to chain with other passes
   * @returns Command encoder with all sort passes recorded
   */
  sort(camera: CameraState, commandEncoder?: GPUCommandEncoder): GPUCommandEncoder {
    if (!this.initialized) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    const encoder = commandEncoder ?? this.device.createCommandEncoder({
      label: 'gaussian-splat-sort-encoder',
    });

    // Step 1: Compress splats and generate sort keys
    this.recordCompressPass(encoder, camera);

    // Step 2: 4-pass radix sort (8 bits per pass, 32 bits total)
    // Each pass: histogram -> Blelloch scan -> global prefix -> scatter
    // Ping-pong between keysA/valuesA and keysB/valuesB
    for (let pass = 0; pass < NUM_PASSES; pass++) {
      const bitOffset = pass * RADIX_BITS;
      const readFromA = (pass % 2) === 0;

      this.recordSortPass(encoder, bitOffset, readFromA);
    }

    return encoder;
  }

  /**
   * Record compression compute pass.
   */
  private recordCompressPass(encoder: GPUCommandEncoder, camera: CameraState): void {
    if (!this.compressPipeline || !this.compressUniformBuffer) {
      throw new Error('Compress pipeline not created');
    }

    // Update compress uniforms
    const uniforms = new Float32Array(40); // 160 bytes / 4
    uniforms.set(camera.viewMatrix, 0);      // offset 0: viewMatrix (16 floats)
    uniforms.set(camera.projMatrix, 16);     // offset 64: projMatrix (16 floats)

    const uintView = new Uint32Array(uniforms.buffer);
    uniforms[32] = this.options.canvasWidth;  // screenWidth
    uniforms[33] = this.options.canvasHeight; // screenHeight
    uniforms[34] = camera.focalX;            // focalX
    uniforms[35] = camera.focalY;            // focalY
    uintView[36] = this.splatCount;          // splatCount
    uintView[37] = 0;                        // pad
    uintView[38] = 0;                        // pad
    uintView[39] = 0;                        // pad

    this.device.queue.writeBuffer(this.compressUniformBuffer, 0, uniforms);

    // Create bind group for compression
    // G.030.01: Safari requires fresh bind groups each frame
    this.compressBindGroup = this.device.createBindGroup({
      label: 'compress-bind-group',
      layout: this.compressPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.compressUniformBuffer } },
        { binding: 1, resource: { buffer: this.rawSplatBuffer! } },
        { binding: 2, resource: { buffer: this.compressedSplatBuffer! } },
        { binding: 3, resource: { buffer: this.sortKeysA! } },
        { binding: 4, resource: { buffer: this.sortValuesA! } },
      ],
    });

    const computePass = encoder.beginComputePass({ label: 'compress-pass' });
    computePass.setPipeline(this.compressPipeline);
    computePass.setBindGroup(0, this.compressBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(this.splatCount / this.options.workgroupSize),
    );
    computePass.end();
  }

  /**
   * Record one radix sort pass (histogram + scan + scatter).
   */
  private recordSortPass(
    encoder: GPUCommandEncoder,
    bitOffset: number,
    readFromA: boolean,
  ): void {
    const keysIn = readFromA ? this.sortKeysA! : this.sortKeysB!;
    const keysOut = readFromA ? this.sortKeysB! : this.sortKeysA!;
    const valuesIn = readFromA ? this.sortValuesA! : this.sortValuesB!;
    const valuesOut = readFromA ? this.sortValuesB! : this.sortValuesA!;

    // Update sort uniforms
    const sortUniforms = new Uint32Array([
      this.splatCount,
      bitOffset,
      this.blockCount,
      0, // pad
    ]);
    this.device.queue.writeBuffer(this.sortUniformBuffer!, 0, sortUniforms);

    // --- Histogram Pass ---
    const histBindGroup = this.device.createBindGroup({
      label: `histogram-bind-group-pass-${bitOffset}`,
      layout: this.histogramPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sortUniformBuffer! } },
        { binding: 1, resource: { buffer: keysIn } },
        { binding: 2, resource: { buffer: keysOut } },
        { binding: 3, resource: { buffer: valuesIn } },
        { binding: 4, resource: { buffer: valuesOut } },
        { binding: 5, resource: { buffer: this.blockHistogramsBuffer! } },
        { binding: 6, resource: { buffer: this.globalPrefixesBuffer! } },
      ],
    });

    const histPass = encoder.beginComputePass({ label: `histogram-${bitOffset}` });
    histPass.setPipeline(this.histogramPipeline!);
    histPass.setBindGroup(0, histBindGroup);
    histPass.dispatchWorkgroups(this.blockCount);
    histPass.end();

    // --- Blelloch Scan Pass (per-digit across blocks) ---
    const scanBindGroup = this.device.createBindGroup({
      label: `blelloch-scan-bind-group-pass-${bitOffset}`,
      layout: this.blellochScanPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sortUniformBuffer! } },
        { binding: 1, resource: { buffer: keysIn } },
        { binding: 2, resource: { buffer: keysOut } },
        { binding: 3, resource: { buffer: valuesIn } },
        { binding: 4, resource: { buffer: valuesOut } },
        { binding: 5, resource: { buffer: this.blockHistogramsBuffer! } },
        { binding: 6, resource: { buffer: this.globalPrefixesBuffer! } },
      ],
    });

    const scanPass = encoder.beginComputePass({ label: `blelloch-scan-${bitOffset}` });
    scanPass.setPipeline(this.blellochScanPipeline!);
    scanPass.setBindGroup(0, scanBindGroup);
    scanPass.dispatchWorkgroups(RADIX_SIZE); // One workgroup per digit
    scanPass.end();

    // --- Global Prefix Scan Pass ---
    const globalPrefixBindGroup = this.device.createBindGroup({
      label: `global-prefix-bind-group-pass-${bitOffset}`,
      layout: this.globalPrefixPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sortUniformBuffer! } },
        { binding: 1, resource: { buffer: keysIn } },
        { binding: 2, resource: { buffer: keysOut } },
        { binding: 3, resource: { buffer: valuesIn } },
        { binding: 4, resource: { buffer: valuesOut } },
        { binding: 5, resource: { buffer: this.blockHistogramsBuffer! } },
        { binding: 6, resource: { buffer: this.globalPrefixesBuffer! } },
      ],
    });

    const globalPrefixPass = encoder.beginComputePass({ label: `global-prefix-${bitOffset}` });
    globalPrefixPass.setPipeline(this.globalPrefixPipeline!);
    globalPrefixPass.setBindGroup(0, globalPrefixBindGroup);
    globalPrefixPass.dispatchWorkgroups(1); // Single workgroup for 256 digits
    globalPrefixPass.end();

    // --- Scatter Pass ---
    const scatterBindGroup = this.device.createBindGroup({
      label: `scatter-bind-group-pass-${bitOffset}`,
      layout: this.scatterPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sortUniformBuffer! } },
        { binding: 1, resource: { buffer: keysIn } },
        { binding: 2, resource: { buffer: keysOut } },
        { binding: 3, resource: { buffer: valuesIn } },
        { binding: 4, resource: { buffer: valuesOut } },
        { binding: 5, resource: { buffer: this.blockHistogramsBuffer! } },
        { binding: 6, resource: { buffer: this.globalPrefixesBuffer! } },
      ],
    });

    const scatterPass = encoder.beginComputePass({ label: `scatter-${bitOffset}` });
    scatterPass.setPipeline(this.scatterPipeline!);
    scatterPass.setBindGroup(0, scatterBindGroup);
    scatterPass.dispatchWorkgroups(this.blockCount);
    scatterPass.end();
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  /**
   * Record render pass for sorted Gaussian splats.
   *
   * @param encoder Command encoder to record into
   * @param camera Camera state for rendering
   * @param colorView Color attachment view
   * @param depthView Depth attachment view
   * @param clearColor Optional clear color (default: transparent black)
   */
  recordRenderPass(
    encoder: GPUCommandEncoder,
    camera: CameraState,
    colorView: GPUTextureView,
    depthView: GPUTextureView,
    clearColor?: GPUColor,
  ): void {
    if (!this.renderPipeline || !this.renderUniformBuffer) {
      throw new Error('Render pipeline not created');
    }

    // Update render uniforms
    const renderUniforms = new Float32Array(40); // 160 bytes
    renderUniforms.set(camera.viewProjectionMatrix, 0);  // viewProjection (16 floats)
    renderUniforms.set(camera.viewMatrix, 16);           // viewMatrix (16 floats)
    renderUniforms[32] = camera.cameraPosition[0];
    renderUniforms[33] = camera.cameraPosition[1];
    renderUniforms[34] = camera.cameraPosition[2];
    renderUniforms[35] = this.options.canvasWidth;
    renderUniforms[36] = this.options.canvasHeight;
    renderUniforms[37] = camera.focalX;
    renderUniforms[38] = camera.focalY;
    renderUniforms[39] = 0; // pad

    this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniforms);

    // After 4 passes (even number), sorted output is in keysA/valuesA
    // valuesA contains the sorted splat indices
    const sortedIndicesBuffer = this.sortValuesA!;

    // Create render bind group
    const renderBindGroup = this.device.createBindGroup({
      label: 'sorted-splat-render-bind-group',
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.renderUniformBuffer } },
        { binding: 1, resource: { buffer: this.compressedSplatBuffer! } },
        { binding: 2, resource: { buffer: sortedIndicesBuffer } },
      ],
    });

    // Record render pass
    const renderPass = encoder.beginRenderPass({
      label: 'sorted-splat-render-pass',
      colorAttachments: [{
        view: colorView,
        clearValue: clearColor ?? { r: 0, g: 0, b: 0, a: 0 },
        loadOp: clearColor ? 'clear' : 'load',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(4, this.splatCount); // 4 vertices per quad, N instances

    renderPass.end();
  }

  /**
   * Execute full frame: sort + render in a single command submission.
   *
   * This is the main per-frame method for most use cases.
   *
   * @param camera Current camera state
   * @param colorView Color attachment view
   * @param depthView Depth attachment view
   * @param clearColor Optional clear color
   */
  frame(
    camera: CameraState,
    colorView: GPUTextureView,
    depthView: GPUTextureView,
    clearColor?: GPUColor,
  ): void {
    const encoder = this.device.createCommandEncoder({
      label: 'gaussian-splat-frame-encoder',
    });

    // Sort
    this.sort(camera, encoder);

    // Render
    this.recordRenderPass(encoder, camera, colorView, depthView, clearColor);

    // Submit
    this.device.queue.submit([encoder.finish()]);
  }

  // ===========================================================================
  // Statistics & Debugging
  // ===========================================================================

  /**
   * Get current sort statistics.
   */
  getStats(): SplatSortStats {
    return {
      splatCount: this.splatCount,
      blockCount: this.blockCount,
      memoryUsageBytes: this.getMemoryUsage(),
    };
  }

  /**
   * Calculate total GPU memory usage in bytes.
   */
  getMemoryUsage(): number {
    const maxSplats = this.options.maxSplats;
    const maxBlocks = Math.ceil(
      maxSplats / (this.options.workgroupSize * this.options.elementsPerThread)
    );

    return (
      maxSplats * BYTES_PER_RAW_SPLAT +        // raw splats
      maxSplats * BYTES_PER_COMPRESSED_SPLAT +  // compressed splats
      maxSplats * 4 * 4 +                       // 2x keys + 2x values (u32 each)
      maxBlocks * RADIX_SIZE * 4 +              // block histograms
      RADIX_SIZE * 4 +                          // global prefixes
      160 + 16 + 160                            // uniform buffers
    );
  }

  /**
   * Get the sorted index buffer (for external rendering integration).
   *
   * After sort(), the sorted indices are in sortValuesA (for even pass count).
   */
  getSortedIndicesBuffer(): GPUBuffer {
    if (!this.sortValuesA) {
      throw new Error('Buffers not initialized');
    }
    return this.sortValuesA;
  }

  /**
   * Get the compressed splat buffer (for external rendering integration).
   */
  getCompressedSplatBuffer(): GPUBuffer {
    if (!this.compressedSplatBuffer) {
      throw new Error('Buffers not initialized');
    }
    return this.compressedSplatBuffer;
  }

  /**
   * Update canvas dimensions (e.g., on resize).
   */
  updateDimensions(width: number, height: number): void {
    this.options.canvasWidth = width;
    this.options.canvasHeight = height;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Destroy all GPU resources.
   */
  destroy(): void {
    const buffers = [
      this.rawSplatBuffer,
      this.compressedSplatBuffer,
      this.sortKeysA,
      this.sortKeysB,
      this.sortValuesA,
      this.sortValuesB,
      this.blockHistogramsBuffer,
      this.globalPrefixesBuffer,
      this.compressUniformBuffer,
      this.sortUniformBuffer,
      this.renderUniformBuffer,
    ];

    for (const buffer of buffers) {
      buffer?.destroy();
    }

    this.rawSplatBuffer = null;
    this.compressedSplatBuffer = null;
    this.sortKeysA = null;
    this.sortKeysB = null;
    this.sortValuesA = null;
    this.sortValuesB = null;
    this.blockHistogramsBuffer = null;
    this.globalPrefixesBuffer = null;
    this.compressUniformBuffer = null;
    this.sortUniformBuffer = null;
    this.renderUniformBuffer = null;

    this.sortShaderModule = null;
    this.compressShaderModule = null;
    this.renderShaderModule = null;

    this.compressPipeline = null;
    this.histogramPipeline = null;
    this.blellochScanPipeline = null;
    this.globalPrefixPipeline = null;
    this.scatterPipeline = null;
    this.renderPipeline = null;

    this.initialized = false;

    console.log('GaussianSplatSorter destroyed');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create and initialize a GaussianSplatSorter.
 *
 * @example
 * ```typescript
 * const sorter = await createGaussianSplatSorter({
 *   maxSplats: 500_000,
 *   canvasWidth: 1920,
 *   canvasHeight: 1080,
 * });
 *
 * // Upload splat data
 * sorter.uploadSplatData(splatData, splatCount);
 *
 * // Each frame:
 * sorter.frame(camera, colorView, depthView, { r: 0, g: 0, b: 0, a: 1 });
 * ```
 */
export async function createGaussianSplatSorter(
  options: GaussianSplatSorterOptions & { contextOptions?: any },
): Promise<GaussianSplatSorter> {
  const { WebGPUContext } = await import('./WebGPUContext.js');

  const context = new WebGPUContext(options.contextOptions);
  await context.initialize();

  if (!context.isSupported()) {
    throw new Error('WebGPU not supported - GaussianSplatSorter requires WebGPU');
  }

  const sorter = new GaussianSplatSorter(context, options);
  await sorter.initialize();

  return sorter;
}
