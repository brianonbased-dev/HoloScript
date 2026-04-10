/**
 * @holoscript/snn-webgpu - GPU Context Management
 *
 * Handles WebGPU adapter/device acquisition, capability detection,
 * and context lifecycle management.
 */

/** Options for initializing the GPU context. */
export interface GPUContextOptions {
  /** Preferred power preference. Default: 'high-performance' */
  powerPreference?: GPUPowerPreference;
  /** Required features. Default: [] */
  requiredFeatures?: GPUFeatureName[];
  /** Maximum buffer size in bytes. Default: 256MB */
  maxBufferSize?: number;
  /** Maximum storage buffer binding size. Default: 128MB */
  maxStorageBufferBindingSize?: number;
  /** Enable timestamp queries for profiling. Default: false */
  enableTimestamps?: boolean;
  /** Custom device label. */
  label?: string;
}

/** GPU capability information. */
export interface GPUCapabilities {
  /** Maximum workgroup size per dimension. */
  maxWorkgroupSize: [number, number, number];
  /** Maximum workgroups per dimension. */
  maxWorkgroupsPerDimension: number;
  /** Maximum storage buffer binding size in bytes. */
  maxStorageBufferBindingSize: number;
  /** Maximum buffer size in bytes. */
  maxBufferSize: number;
  /** Maximum compute invocations per workgroup. */
  maxComputeInvocationsPerWorkgroup: number;
  /** Whether timestamp queries are supported. */
  timestampQuerySupported: boolean;
  /** GPU adapter vendor info. */
  vendor: string;
  /** GPU adapter architecture. */
  architecture: string;
}

/**
 * Manages the WebGPU device lifecycle and provides a centralized
 * access point for GPU operations.
 */
export class GPUContext {
  private _device: GPUDevice | null = null;
  private _adapter: GPUAdapter | null = null;
  private _capabilities: GPUCapabilities | null = null;
  private _destroyed = false;

  /** The active GPUDevice. Throws if not initialized. */
  get device(): GPUDevice {
    if (!this._device || this._destroyed) {
      throw new Error('GPUContext not initialized. Call initialize() first.');
    }
    return this._device;
  }

  /** The active GPUAdapter. Throws if not initialized. */
  get adapter(): GPUAdapter {
    if (!this._adapter || this._destroyed) {
      throw new Error('GPUContext not initialized. Call initialize() first.');
    }
    return this._adapter;
  }

  /** GPU capabilities detected during initialization. */
  get capabilities(): GPUCapabilities {
    if (!this._capabilities) {
      throw new Error('GPUContext not initialized. Call initialize() first.');
    }
    return this._capabilities;
  }

  /** Whether the context has been initialized. */
  get isInitialized(): boolean {
    return this._device !== null && !this._destroyed;
  }

  /**
   * Initialize the WebGPU context.
   * Requests an adapter and device with the specified options.
   */
  async initialize(options: GPUContextOptions = {}): Promise<void> {
    if (this._destroyed) {
      throw new Error('GPUContext has been destroyed and cannot be reinitialized.');
    }

    if (this._device) {
      return; // Already initialized
    }

    // Check for WebGPU support
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error(
        'WebGPU is not supported in this environment. ' +
          'Ensure you are running in a WebGPU-capable browser or Node.js with WebGPU bindings.'
      );
    }

    const powerPreference = options.powerPreference ?? 'high-performance';

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference,
    });

    if (!adapter) {
      throw new Error(
        'Failed to obtain a WebGPU adapter. ' +
          'Check that your GPU drivers are up to date and WebGPU is enabled.'
      );
    }

    this._adapter = adapter;

    // Determine required limits
    const requiredLimits: Record<string, number> = {};

    const maxBufferSize = options.maxBufferSize ?? 256 * 1024 * 1024;
    const maxStorageBufferBindingSize = options.maxStorageBufferBindingSize ?? 128 * 1024 * 1024;

    // Request limits up to what the adapter supports
    requiredLimits.maxBufferSize = Math.min(maxBufferSize, adapter.limits.maxBufferSize);
    requiredLimits.maxStorageBufferBindingSize = Math.min(
      maxStorageBufferBindingSize,
      adapter.limits.maxStorageBufferBindingSize
    );

    // Determine features
    const requiredFeatures: GPUFeatureName[] = [...(options.requiredFeatures ?? [])];
    if (options.enableTimestamps && adapter.features.has('timestamp-query')) {
      requiredFeatures.push('timestamp-query');
    }

    // Request device
    const device = await adapter.requestDevice({
      label: options.label ?? 'snn-webgpu-device',
      requiredFeatures,
      requiredLimits,
    });

    // Handle device loss
    device.lost.then((info) => {
      console.error(`[snn-webgpu] GPU device lost: ${info.message} (reason: ${info.reason})`);
      this._device = null;
      this._destroyed = true;
    });

    this._device = device;

    // Capture capabilities
    // Use adapter.info (newer spec) or fallback to requestAdapterInfo (older spec)
    const adapterExt = adapter as GPUAdapter & {
      info?: { vendor?: string; architecture?: string };
      requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string }>;
    };
    const adapterInfo: { vendor?: string; architecture?: string } =
      adapterExt.info ??
      (typeof adapterExt.requestAdapterInfo === 'function'
        ? await adapterExt.requestAdapterInfo()
        : { vendor: 'unknown', architecture: 'unknown' });

    this._capabilities = {
      maxWorkgroupSize: [
        device.limits.maxComputeWorkgroupSizeX,
        device.limits.maxComputeWorkgroupSizeY,
        device.limits.maxComputeWorkgroupSizeZ,
      ],
      maxWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxBufferSize: device.limits.maxBufferSize,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      timestampQuerySupported: device.features.has('timestamp-query'),
      vendor: adapterInfo.vendor ?? 'unknown',
      architecture: adapterInfo.architecture ?? 'unknown',
    };
  }

  /**
   * Create a compute shader module from WGSL source code.
   */
  createShaderModule(code: string, label?: string): GPUShaderModule {
    return this.device.createShaderModule({
      label: label ?? 'snn-compute-shader',
      code,
    });
  }

  /**
   * Create a compute pipeline from a shader module and entry point.
   */
  createComputePipeline(
    module: GPUShaderModule,
    entryPoint: string,
    layout: GPUPipelineLayout | 'auto' = 'auto',
    label?: string
  ): GPUComputePipeline {
    return this.device.createComputePipeline({
      label: label ?? `compute-pipeline-${entryPoint}`,
      layout,
      compute: {
        module,
        entryPoint,
      },
    });
  }

  /**
   * Submit a command buffer and wait for completion.
   */
  async submitAndWait(commandBuffer: GPUCommandBuffer): Promise<void> {
    this.device.queue.submit([commandBuffer]);
    await this.device.queue.onSubmittedWorkDone();
  }

  /**
   * Validate that the context can handle the given neuron count.
   * Returns the maximum dispatchable neuron count.
   */
  validateNeuronCapacity(requestedCount: number, workgroupSize: number = 256): number {
    const caps = this.capabilities;
    const maxWorkgroups = caps.maxWorkgroupsPerDimension;
    const maxNeurons = maxWorkgroups * workgroupSize;

    if (requestedCount > maxNeurons) {
      console.warn(
        `[snn-webgpu] Requested ${requestedCount} neurons exceeds GPU limit of ${maxNeurons}. ` +
          `Clamping to ${maxNeurons}.`
      );
      return maxNeurons;
    }

    return requestedCount;
  }

  /**
   * Destroy the GPU context and release all resources.
   */
  destroy(): void {
    if (this._device && !this._destroyed) {
      this._device.destroy();
      this._device = null;
      this._adapter = null;
      this._capabilities = null;
      this._destroyed = true;
    }
  }
}
