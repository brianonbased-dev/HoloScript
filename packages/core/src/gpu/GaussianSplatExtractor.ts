import type { WebGPUContext } from './WebGPUContext.js';
import type { GaussianSplatSorter, CameraState } from './GaussianSplatSorter.js';
import type { INeuralSplatPacket } from '../network/NetworkTypes.js';

export interface ExtractorOptions {
  /** Maximum splats to extract */
  maxSplats: number;
}

/**
 * Extracts raw GPU sorted data from a GaussianSplatSorter.
 * Uses GPUBuffer.mapAsync to read back the `compressedSplatBuffer` and `sortValuesA` buffers
 * which contain the natively sorted WebGPU output.
 *
 * Mitigation for mapAsync stalls: We use double buffering to pipeline the readbacks.
 */
export class GaussianSplatExtractor {
  private context: WebGPUContext;
  private device: GPUDevice;
  private options: Required<ExtractorOptions>;

  private readbackBuffersA: { compressed: GPUBuffer; indices: GPUBuffer } | null = null;
  private readbackBuffersB: { compressed: GPUBuffer; indices: GPUBuffer } | null = null;

  private isUsingA = true;
  private ongoingReadback: Promise<INeuralSplatPacket | null> | null = null;
  private frameCounter = 0;

  constructor(context: WebGPUContext, options: ExtractorOptions) {
    this.context = context;
    this.device = context.getDevice();
    this.options = {
      maxSplats: options.maxSplats,
    };

    this.initializeBuffers();
  }

  private initializeBuffers() {
    // 32 bytes per compressed splat
    const compressedSize = this.options.maxSplats * 32;
    // 4 bytes per index value
    const indicesSize = this.options.maxSplats * 4;

    this.readbackBuffersA = {
      compressed: this.createReadbackBuffer(compressedSize),
      indices: this.createReadbackBuffer(indicesSize),
    };

    this.readbackBuffersB = {
      compressed: this.createReadbackBuffer(compressedSize),
      indices: this.createReadbackBuffer(indicesSize),
    };
  }

  private createReadbackBuffer(size: number): GPUBuffer {
    return this.device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Captures the sorted state of the GaussianSplatSorter.
   * Internally pipelines the GPU readback to avoid stalling the main render loop.
   */
  public extractFrame(
    sorter: GaussianSplatSorter,
    camera: CameraState,
    compressedSource: GPUBuffer,
    indicesSource: GPUBuffer
  ): Promise<INeuralSplatPacket | null> {
    const stats = sorter.getStats();
    if (stats.splatCount === 0) return Promise.resolve(null);
    if (this.ongoingReadback) {
      // Drop frame if we are already extracting (prevent un-bounded map queues)
      return Promise.resolve(null);
    }

    const currentBuffers = this.isUsingA ? this.readbackBuffersA! : this.readbackBuffersB!;
    this.isUsingA = !this.isUsingA;

    const compressedSize = stats.splatCount * 32;
    const indicesSize = stats.splatCount * 4;
    const currentFrame = ++this.frameCounter;

    const encoder = this.device.createCommandEncoder({
      label: 'splat-extractor-copy-encoder',
    });

    encoder.copyBufferToBuffer(compressedSource, 0, currentBuffers.compressed, 0, compressedSize);
    encoder.copyBufferToBuffer(indicesSource, 0, currentBuffers.indices, 0, indicesSize);

    this.device.queue.submit([encoder.finish()]);

    this.ongoingReadback = Promise.all([
      currentBuffers.compressed.mapAsync(GPUMapMode.READ, 0, compressedSize),
      currentBuffers.indices.mapAsync(GPUMapMode.READ, 0, indicesSize),
    ])
      .then(() => {
        // Clone buffers into independent ArrayBuffers for streaming
        const compData = currentBuffers.compressed.getMappedRange(0, compressedSize).slice(0);
        const indData = currentBuffers.indices.getMappedRange(0, indicesSize).slice(0);

        currentBuffers.compressed.unmap();
        currentBuffers.indices.unmap();

        this.ongoingReadback = null;

        const packet: INeuralSplatPacket = {
          frameId: currentFrame,
          cameraState: {
            viewProjectionMatrix: Array.from(camera.viewProjectionMatrix),
            cameraPosition: [
              camera.cameraPosition[0],
              camera.cameraPosition[1],
              camera.cameraPosition[2],
            ],
          },
          splatCount: stats.splatCount,
          compressedSplatsBuffer: compData,
          sortedIndicesBuffer: indData,
        };

        return packet;
      })
      .catch((e) => {
        console.warn('GaussianSplatExtractor readback failed', e);
        this.ongoingReadback = null;
        return null;
      });

    return this.ongoingReadback;
  }
}
