/**
 * WebGPU Context Management
 *
 * Handles WebGPU device initialization, feature detection, and fallback strategies.
 *
 * @module gpu/WebGPUContext
 */

export interface WebGPUCapabilities {
  supported: boolean;
  adapter: GPUAdapter | null;
  device: GPUDevice | null;
  limits: GPUSupportedLimits | null;
  features: Set<string>;
}

export interface WebGPUContextOptions {
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
  fallbackToCPU?: boolean;
}

/**
 * WebGPU Context Manager
 *
 * Provides centralized WebGPU device initialization with feature detection
 * and graceful fallback to CPU when WebGPU is unavailable.
 *
 * @example
 * ```typescript
 * const context = new WebGPUContext({
 *   powerPreference: 'high-performance',
 *   fallbackToCPU: true,
 * });
 *
 * await context.initialize();
 *
 * if (context.isSupported()) {
 *   // Use GPU acceleration
 *   const device = context.getDevice();
 *   // ... create compute pipelines
 * } else {
 *   // Fallback to CPU physics
 *   console.warn('WebGPU not available, using CPU fallback');
 * }
 * ```
 */
export class WebGPUContext {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private limits: GPUSupportedLimits | null = null;
  private features: Set<string> = new Set();
  private options: WebGPUContextOptions;
  private initialized: boolean = false;

  constructor(options: WebGPUContextOptions = {}) {
    this.options = {
      powerPreference: options.powerPreference ?? 'high-performance',
      requiredFeatures: options.requiredFeatures ?? [],
      requiredLimits: options.requiredLimits ?? {},
      fallbackToCPU: options.fallbackToCPU ?? true,
    };
  }

  /**
   * Initialize WebGPU context
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if WebGPU is not supported and fallbackToCPU is false
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('WebGPUContext already initialized');
      return;
    }

    // Check for WebGPU support
    if (!('gpu' in navigator)) {
      this.handleUnsupported('WebGPU not supported in this browser');
      return;
    }

    try {
      // Request adapter
      this.adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: this.options.powerPreference,
      });

      if (!this.adapter) {
        this.handleUnsupported('Failed to get WebGPU adapter');
        return;
      }

      // Get adapter info
      this.limits = this.adapter.limits;
      this.features = new Set(this.adapter.features);

      // Log adapter info
      console.log('WebGPU Adapter:', {
        features: Array.from(this.features),
        limits: {
          maxBindGroups: this.limits.maxBindGroups,
          maxComputeWorkgroupSizeX: this.limits.maxComputeWorkgroupSizeX,
          maxComputeWorkgroupSizeY: this.limits.maxComputeWorkgroupSizeY,
          maxComputeWorkgroupSizeZ: this.limits.maxComputeWorkgroupSizeZ,
          maxComputeInvocationsPerWorkgroup: this.limits.maxComputeInvocationsPerWorkgroup,
          maxStorageBufferBindingSize: this.limits.maxStorageBufferBindingSize,
        },
      });

      // Validate required features
      const missingFeatures = this.options.requiredFeatures!.filter(
        (feature) => !this.features.has(feature)
      );

      if (missingFeatures.length > 0) {
        throw new Error(`Missing required WebGPU features: ${missingFeatures.join(', ')}`);
      }

      // Request device with required features and limits
      const deviceDescriptor: GPUDeviceDescriptor = {
        requiredFeatures: this.options.requiredFeatures as any,
        requiredLimits: this.options.requiredLimits,
      };

      this.device = await this.adapter.requestDevice(deviceDescriptor);

      // Handle device lost
      this.device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message, info.reason);
        if (info.reason !== 'destroyed') {
          this.handleDeviceLost(info);
        }
      });

      // Handle uncaptured errors
      this.device.addEventListener('uncapturederror', (event: any) => {
        console.error('WebGPU uncaptured error:', event.error);
      });

      this.initialized = true;
      console.log('✅ WebGPU initialized successfully');
    } catch (error) {
      this.handleUnsupported(`WebGPU initialization failed: ${error}`);
    }
  }

  /**
   * Check if WebGPU is supported and initialized
   */
  isSupported(): boolean {
    return this.initialized && this.device !== null;
  }

  /**
   * Get WebGPU device
   * @throws Error if device is not initialized
   */
  getDevice(): GPUDevice {
    if (!this.device) {
      throw new Error('WebGPU device not initialized. Call initialize() first.');
    }
    return this.device;
  }

  /**
   * Get WebGPU adapter
   * @throws Error if adapter is not available
   */
  getAdapter(): GPUAdapter {
    if (!this.adapter) {
      throw new Error('WebGPU adapter not available');
    }
    return this.adapter;
  }

  /**
   * Get device limits
   */
  getLimits(): GPUSupportedLimits {
    if (!this.limits) {
      throw new Error('WebGPU limits not available');
    }
    return this.limits;
  }

  /**
   * Get supported features
   */
  getFeatures(): Set<string> {
    return this.features;
  }

  /**
   * Check if a specific feature is supported
   */
  hasFeature(feature: string): boolean {
    return this.features.has(feature);
  }

  /**
   * Get capabilities object
   */
  getCapabilities(): WebGPUCapabilities {
    return {
      supported: this.isSupported(),
      adapter: this.adapter,
      device: this.device,
      limits: this.limits,
      features: this.features,
    };
  }

  /**
   * Get optimal workgroup size for compute shaders
   *
   * Returns a workgroup size that maximizes occupancy based on device limits.
   * Common values: 64, 128, 256 (must be power of 2)
   */
  getOptimalWorkgroupSize(): number {
    if (!this.limits) return 256; // Safe default

    const maxInvocations = this.limits.maxComputeInvocationsPerWorkgroup;

    // Prefer 256 if supported (good balance for most GPUs)
    if (maxInvocations >= 256) return 256;

    // Fallback to 128
    if (maxInvocations >= 128) return 128;

    // Fallback to 64
    if (maxInvocations >= 64) return 64;

    // Very constrained device
    return 32;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this.limits = null;
    this.features.clear();
    this.initialized = false;

    console.log('WebGPU context destroyed');
  }

  /**
   * Handle unsupported browser/device
   */
  private handleUnsupported(reason: string): void {
    console.warn(`⚠️  ${reason}`);

    if (!this.options.fallbackToCPU) {
      throw new Error(`WebGPU required but not available: ${reason}`);
    }

    console.warn('💡 Falling back to CPU-based physics simulation');
    this.initialized = false;
  }

  /**
   * Handle device lost event
   */
  private handleDeviceLost(info: GPUDeviceLostInfo): void {
    console.error('WebGPU device lost, attempting to recreate...');

    // Attempt to reinitialize
    this.initialized = false;
    this.initialize().catch((error) => {
      console.error('Failed to reinitialize WebGPU device:', error);

      if (this.options.fallbackToCPU) {
        console.warn('Falling back to CPU physics');
      }
    });
  }

  /**
   * Detect and log GPU information (for debugging)
   */
  async logGPUInfo(): Promise<void> {
    if (!this.adapter) {
      console.warn('No adapter available');
      return;
    }

    const info = await (this.adapter as any).requestAdapterInfo?.();
    if (info) {
      console.log('GPU Info:', {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      });
    }
  }
}

/**
 * Singleton instance for global access
 */
let globalContext: WebGPUContext | null = null;

/**
 * Get or create global WebGPU context
 */
export function getGlobalWebGPUContext(options?: WebGPUContextOptions): WebGPUContext {
  if (!globalContext) {
    globalContext = new WebGPUContext(options);
  }
  return globalContext;
}

/**
 * Helper: Create a WebGPU-enabled or CPU fallback simulation
 *
 * @example
 * ```typescript
 * const physics = await createPhysicsSimulation({
 *   particleCount: 100000,
 *   preferGPU: true,
 * });
 *
 * if (physics.usingGPU) {
 *   console.log('Using GPU acceleration! 🚀');
 * } else {
 *   console.log('Using CPU simulation');
 * }
 * ```
 */
export async function createPhysicsSimulation(options: {
  particleCount: number;
  preferGPU?: boolean;
}): Promise<{ usingGPU: boolean; context?: WebGPUContext }> {
  if (options.preferGPU !== false) {
    try {
      const context = new WebGPUContext({ fallbackToCPU: true });
      await context.initialize();

      if (context.isSupported()) {
        return { usingGPU: true, context };
      }
    } catch (error) {
      console.warn('GPU initialization failed, using CPU fallback:', error);
    }
  }

  return { usingGPU: false };
}
