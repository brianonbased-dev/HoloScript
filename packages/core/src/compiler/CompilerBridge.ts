/**
 * CompilerBridge
 *
 * Convenience wrapper that lazily loads @holoscript/core tokenizer, parser,
 * and scene-IR compiler at runtime. Provides a simple compile() / validate() API
 * for consumers that want to compile HoloScript to the native scene tree without
 * managing module initialization themselves.
 *
 * @module CompilerBridge
 */

export interface CompilationResult {
  success: boolean;
  sceneIR?: unknown;
  error?: string;
  metadata?: {
    zones: number;
    entities: number;
    handlers: number;
    duration: number;
  };
}

export class CompilerBridge {
  private modules: {
    Parser: new () => {
      parse(source: string): {
        success: boolean;
        ast: unknown[];
        errors: Array<{ message: string }>;
      };
    };
    SceneIRCompiler: new (options: Record<string, unknown>) => { compile(ast: unknown[]): unknown };
  } | null = null;
  private initialized = false;

  /**
   * Initialize compiler modules (lazy load to avoid circular dependencies)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Direct imports to avoid circular dependency through index.ts barrel
      const [parserModule, compilerModule] = await Promise.all([
        import('../parser/HoloScriptPlusParser'),
        import('./SceneIRCompiler'),
      ]);
      this.modules = {
        Parser: (parserModule as Record<string, unknown>)
          .HoloScriptPlusParser as typeof this.modules extends null
          ? never
          : NonNullable<typeof this.modules>['Parser'],
        SceneIRCompiler: (compilerModule as Record<string, unknown>)
          .SceneIRCompiler as typeof this.modules extends null
          ? never
          : NonNullable<typeof this.modules>['SceneIRCompiler'],
      };
      this.initialized = true;
    } catch (error: unknown) {
      const _msg = error instanceof Error ? error.message : String(error);
      // Failed to initialize - error will be thrown below
      throw new Error('Failed to load HoloScript compiler modules');
    }
  }

  /**
   * Compile HoloScript code to the native scene-IR tree.
   */
  async compile(holoScript: string): Promise<CompilationResult> {
    const startTime = performance.now();

    try {
      await this.initialize();

      if (!holoScript || holoScript.trim().length === 0) {
        return { success: false, error: 'Empty HoloScript input' };
      }

      // Parse
      const parser = new this.modules!.Parser();
      const parseResult = parser.parse(holoScript);

      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.errors[0]?.message || 'Failed to parse HoloScript',
        };
      }

      const ast = parseResult.ast as Array<{ entities?: Array<{ handlers?: unknown[] }> }>;
      if (!ast || ast.length === 0) {
        return { success: false, error: 'Failed to parse HoloScript' };
      }

      const compiler = new this.modules!.SceneIRCompiler({
        target: 'scene-ir',
        optimize: true,
        sourceMaps: false,
      });
      const sceneIR = compiler.compile(ast);
      const duration = performance.now() - startTime;

      return {
        success: true,
        sceneIR,
        metadata: {
          zones: ast.length,
          entities: ast.reduce((sum, zone) => sum + (zone.entities?.length || 0), 0),
          handlers: ast.reduce(
            (sum, zone) =>
              sum + (zone.entities?.reduce((s, e) => s + (e.handlers?.length || 0), 0) || 0),
            0
          ),
          duration: Math.round(duration * 100) / 100,
        },
      };
    } catch (error: unknown) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown compilation error',
        metadata: {
          zones: 0,
          entities: 0,
          handlers: 0,
          duration: Math.round(duration * 100) / 100,
        },
      };
    }
  }

  /**
   * Validate HoloScript syntax without compilation
   */
  async validate(holoScript: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      await this.initialize();

      if (!holoScript || holoScript.trim().length === 0) {
        errors.push('Empty input');
        return { valid: false, errors };
      }

      const parser = new this.modules!.Parser();
      const parseResult = parser.parse(holoScript);

      if (!parseResult.success) {
        errors.push(parseResult.errors[0]?.message || 'Failed to parse HoloScript');
        return { valid: false, errors };
      }

      const ast = parseResult.ast;
      if (!ast || ast.length === 0) {
        errors.push('Failed to parse HoloScript');
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      return { valid: false, errors };
    }
  }

  /**
   * Get estimated compilation metrics
   */
  getMetrics(holoScript: string): {
    lines: number;
    characters: number;
    estimatedZones: number;
    estimatedComplexity: 'simple' | 'moderate' | 'complex';
  } {
    const lines = holoScript.split('\n').length;
    const characters = holoScript.length;

    const zoneMatches = holoScript.match(/\borb\b/gi) || [];
    const estimatedZones = zoneMatches.length;

    const handlerMatches = holoScript.match(/\bon_\w+/gi) || [];
    const handlerCount = handlerMatches.length;

    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (handlerCount > 5 || estimatedZones > 3) {
      complexity = 'moderate';
    }
    if (handlerCount > 15 || estimatedZones > 8) {
      complexity = 'complex';
    }

    return { lines, characters, estimatedZones, estimatedComplexity: complexity };
  }
}

// Singleton instance
let instance: CompilerBridge | null = null;

export function getCompilerBridge(): CompilerBridge {
  if (!instance) {
    instance = new CompilerBridge();
  }
  return instance;
}
