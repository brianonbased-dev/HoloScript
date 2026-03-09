import { Resolver, Mutation, Arg, Ctx } from 'type-graphql';
import DataLoader from 'dataloader';
import { randomUUID } from 'crypto';
import { CompileInput, CompilePayload, CompilerTarget } from '../types/GraphQLTypes.js';
import { publishCompilationProgress } from '../services/pubsub.js';

interface CompilationRequest {
  code: string;
  target: CompilerTarget;
  options?: any;
}

/**
 * Creates a DataLoader instance for batch compilation
 * This prevents N+1 query problems when compiling multiple files
 */
function createCompilationLoader() {
  return new DataLoader<CompilationRequest, CompilePayload>(
    async (requests) => {
      console.log(`[DataLoader] Batching ${requests.length} compilation requests`);

      // Dynamic import to avoid ESM/CJS issues
      const core = await import('@holoscript/core');
      const { HoloScriptPlusParser } = core;

      // Batch compile all requests
      const results = await Promise.all(
        requests.map(async (request) => {
          const requestId = randomUUID();
          const startTime = Date.now();

          try {
            // Publish start event
            publishCompilationProgress({
              requestId,
              target: request.target,
              progress: 0,
              stage: 'parsing',
              message: `Starting compilation for ${request.target}`,
              timestamp: Date.now(),
            });

            // Parse
            const parser = new HoloScriptPlusParser();
            const parseResult = parser.parse(request.code);

            // Publish parsing complete
            publishCompilationProgress({
              requestId,
              target: request.target,
              progress: 33,
              stage: 'compiling',
              message: `Parsing complete, compiling to ${request.target}`,
              timestamp: Date.now(),
            });

            if (!parseResult.ast) {
              return {
                success: false,
                output: undefined,
                errors: [{ message: 'Failed to parse', phase: 'parse' }],
                warnings: [],
                metadata: undefined,
              };
            }

            // Compile
            let compiler: any;
            let output: string;

            switch (request.target) {
              case CompilerTarget.UNITY:
                compiler = new core.UnityCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.BABYLON:
                compiler = new core.BabylonCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.R3F:
                compiler = new core.R3FCompiler();
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.UNREAL:
                compiler = new core.UnrealCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.GODOT:
                compiler = new core.GodotCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.VRCHAT:
                compiler = new core.VRChatCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.WEBGPU:
                compiler = new core.WebGPUCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.VISIONOS:
                compiler = new core.VisionOSCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.ANDROID:
                compiler = new core.AndroidXRCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.OPENXR:
                compiler = new core.OpenXRCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.IOS:
                // iOS uses ARKit - check if ARCompiler can handle it
                compiler = new core.ARCompiler(request.options || {});
                output = compiler.compile(parseResult.ast);
                break;
              case CompilerTarget.WASM:
                // WebAssembly compilation
                const wasmResult = await core.compileToWasm?.(
                  parseResult.ast,
                  request.options || {}
                );
                output = wasmResult?.output || 'WASM compilation not fully implemented';
                break;
              default:
                return {
                  success: false,
                  output: undefined,
                  errors: [
                    {
                      message: `Target ${request.target} not yet implemented. Available: Unity, Unreal, Babylon, R3F, VRChat, Godot, WebGPU, visionOS, Android, iOS, OpenXR, WASM`,
                      phase: 'compile',
                    },
                  ],
                  warnings: [],
                  metadata: undefined,
                };
            }

            const compilationTime = Date.now() - startTime;

            // Publish completion
            publishCompilationProgress({
              requestId,
              target: request.target,
              progress: 100,
              stage: 'complete',
              message: `Successfully compiled to ${request.target} in ${compilationTime}ms`,
              timestamp: Date.now(),
            });

            return {
              success: true,
              output,
              errors: [],
              warnings: parseResult.warnings || [],
              metadata: {
                compilationTime,
                outputSize: output.length,
                targetVersion: '3.42.0',
              },
            };
          } catch (error: any) {
            // Publish error
            publishCompilationProgress({
              requestId,
              target: request.target,
              progress: 0,
              stage: 'error',
              message: `Compilation failed: ${error.message}`,
              timestamp: Date.now(),
            });

            return {
              success: false,
              output: undefined,
              errors: [{ message: error.message, phase: 'compile' }],
              warnings: [],
              metadata: undefined,
            };
          }
        })
      );

      console.log(`[DataLoader] Completed ${results.length} compilations`);
      return results;
    },
    {
      // Batch multiple requests together within 50ms window
      batchScheduleFn: (callback) => setTimeout(callback, 50),
      // Cache results for identical requests
      cache: true,
    }
  );
}

export interface GraphQLContext {
  compilationLoader: DataLoader<CompilationRequest, CompilePayload>;
}

@Resolver()
export class BatchCompilerResolver {
  /**
   * Compile multiple HoloScript files in a single batch
   * Uses DataLoader to optimize N+1 query scenarios
   */
  @Mutation(() => [CompilePayload], {
    description: 'Batch compile multiple HoloScript files efficiently using DataLoader',
  })
  async batchCompile(
    @Arg('inputs', () => [CompileInput]) inputs: CompileInput[],
    @Ctx() ctx: GraphQLContext
  ): Promise<CompilePayload[]> {
    // Create loader if not in context (for standalone use)
    const loader = ctx.compilationLoader || createCompilationLoader();

    // Load all compilations through DataLoader
    // DataLoader will automatically batch these if called within the batch window
    const results = await Promise.all(
      inputs.map((input) =>
        loader.load({
          code: input.code,
          target: input.target,
          options: input.options,
        })
      )
    );

    return results;
  }
}

// Export factory for context creation
export { createCompilationLoader };
