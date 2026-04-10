/**
 * HoloScript Builtin Registry
 *
 * Maps `runtime @builtin` declarations to JavaScript implementations.
 * Enables HoloScript to call into native modules (Whisper.cpp, WebGPU, etc.)
 *
 * Usage in HoloScript+:
 * ```holoscript
 * runtime SpeechRecognizer @builtin {
 *   backend: "whisper.cpp"
 * }
 *
 * runtime PhysicsEngine @builtin {
 *   backend: "gpu_compute"
 * }
 * ```
 */

export interface BuiltinImplementation {
  /** Factory function to create the builtin instance */
  create: (config: Record<string, unknown>) => unknown;
  /** Cleanup function */
  destroy?: (instance: unknown) => void;
  /** Supported backends */
  backends?: string[];
  /** Description */
  description?: string;
}

export interface RuntimeDeclaration {
  /** Name of the runtime module */
  name: string;
  /** Backend identifier */
  backend: string;
  /** Additional configuration */
  config: Record<string, unknown>;
}

/**
 * BuiltinRegistry
 *
 * Central registry for native module bindings.
 * HoloScript runtime queries this registry when encountering @builtin.
 */
export class BuiltinRegistry {
  private static instance: BuiltinRegistry | null = null;
  private implementations: Map<string, BuiltinImplementation> = new Map();
  private instances: Map<string, unknown> = new Map();

  private constructor() {
    this.registerDefaultBuiltins();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): BuiltinRegistry {
    if (!BuiltinRegistry.instance) {
      BuiltinRegistry.instance = new BuiltinRegistry();
    }
    return BuiltinRegistry.instance;
  }

  /**
   * Register a builtin implementation
   */
  register(name: string, implementation: BuiltinImplementation): void {
    this.implementations.set(name.toLowerCase(), implementation);
  }

  /**
   * Check if a builtin exists
   */
  has(name: string): boolean {
    return this.implementations.has(name.toLowerCase());
  }

  /**
   * Create an instance of a builtin
   */
  create(declaration: RuntimeDeclaration): unknown {
    const impl = this.implementations.get(declaration.name.toLowerCase());
    if (!impl) {
      throw new Error(`Unknown builtin: ${declaration.name}`);
    }

    // Check backend support
    if (impl.backends && !impl.backends.includes(declaration.backend)) {
      console.warn(
        `Backend "${declaration.backend}" not supported for ${declaration.name}. ` +
          `Supported: ${impl.backends.join(', ')}`
      );
    }

    // Create instance
    const instance = impl.create({
      backend: declaration.backend,
      ...declaration.config,
    });

    // Store reference for cleanup
    const key = `${declaration.name}_${Date.now()}`;
    this.instances.set(key, instance);

    return instance;
  }

  /**
   * Get list of registered builtins
   */
  list(): Array<{ name: string; description?: string; backends?: string[] }> {
    return Array.from(this.implementations.entries()).map(([name, impl]) => ({
      name,
      description: impl.description,
      backends: impl.backends,
    }));
  }

  /**
   * Cleanup all instances
   */
  cleanup(): void {
    for (const [key, instance] of this.instances) {
      const name = key.split('_')[0];
      const impl = this.implementations.get(name);
      if (impl?.destroy) {
        impl.destroy(instance);
      }
    }
    this.instances.clear();
  }

  /**
   * Register default HoloScript builtins
   */
  private registerDefaultBuiltins(): void {
    // SpeechRecognizer
    this.register('SpeechRecognizer', {
      description: 'Speech-to-text recognition',
      backends: ['whisper.cpp', 'browser', 'auto'],
      create: async (config) => {
        // @ts-ignore
        const { SpeechRecognizer } = await import('@hololand/voice');
        const recognizer = new SpeechRecognizer({
          backend: (config.backend as 'whisper' | 'browser' | 'auto') || 'auto',
        });
        await recognizer.initialize();
        return recognizer;
      },
    });

    // TextToSpeech
    this.register('TextToSpeech', {
      description: 'Text-to-speech synthesis',
      backends: ['browser', 'elevenlabs', 'azure'],
      create: async (config) => {
        // @ts-ignore
        const { TextToSpeech } = await import('@hololand/voice');
        return new TextToSpeech({
          backend: (config.backend as 'browser' | 'elevenlabs' | 'azure') || 'browser',
          apiKey: config.apiKey as string,
        });
      },
    });

    // FlowFieldGenerator
    this.register('FlowFieldGenerator', {
      description: 'Pathfinding flow field generation',
      backends: ['cpu', 'gpu'],
      create: async (config) => {
        if (config.backend === 'gpu') {
          // @ts-ignore
          const { FlowFieldCompute } = await import('@hololand/gpu');
          const ff = new FlowFieldCompute({
            width: (config.width as number) || 64,
            height: (config.height as number) || 64,
            cellSize: (config.cellSize as number) || 1.0,
          });
          await ff.initialize();
          return ff;
        } else {
          // @ts-ignore
          const { FlowFieldGenerator } = await import('@hololand/navigation');
          return new FlowFieldGenerator({
            width: (config.width as number) || 64,
            height: (config.height as number) || 64,
            cellSize: (config.cellSize as number) || 1.0,
          });
        }
      },
    });

    // FrustrationEstimator
    this.register('FrustrationEstimator', {
      description: 'VR frustration detection',
      backends: ['heuristic'],
      create: async (config) => {
        // @ts-ignore
        const { FrustrationEstimator } = await import('@hololand/gestures');
        return new FrustrationEstimator({
          frustrationThreshold: (config.threshold as number) || 0.6,
        });
      },
    });

    // GPUContext
    this.register('GPUContext', {
      description: 'WebGPU compute context',
      backends: ['webgpu'],
      create: async (config) => {
        // @ts-ignore
        const { GPUContext } = await import('@hololand/gpu');
        const ctx = new GPUContext({
          powerPreference:
            (config.powerPreference as 'low-power' | 'high-performance') || 'high-performance',
        });
        await ctx.initialize();
        return ctx;
      },
      destroy: (instance) => {
        (instance as { destroy: () => void }).destroy?.();
      },
    });
  }
}

/**
 * Parse a runtime declaration from HoloScript+ AST
 */
export function parseRuntimeDeclaration(
  name: string,
  directives: Array<{ type: string; value: string }>,
  config: Record<string, unknown>
): RuntimeDeclaration {
  // Find @builtin directive
  const builtinDirective = directives.find((d) => d.type === 'builtin');
  if (!builtinDirective) {
    throw new Error(`Runtime "${name}" is missing @builtin directive`);
  }

  return {
    name,
    backend: (config.backend as string) || 'auto',
    config,
  };
}

/**
 * Convenience function to create a builtin from a declaration
 */
export async function createBuiltin(declaration: RuntimeDeclaration): Promise<unknown> {
  const registry = BuiltinRegistry.getInstance();
  return registry.create(declaration);
}

export default BuiltinRegistry;
