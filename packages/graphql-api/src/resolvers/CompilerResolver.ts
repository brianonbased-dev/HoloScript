import { Resolver, Mutation, Arg } from 'type-graphql';
import { CompileInput, CompilePayload, CompilerTarget } from '../types/GraphQLTypes.js';

@Resolver()
export class CompilerResolver {
  /**
   * Compile HoloScript code to a target platform
   */
  @Mutation(() => CompilePayload, {
    description: 'Compile HoloScript code to a specific target platform',
  })
  async compile(@Arg('input', () => CompileInput) input: CompileInput): Promise<CompilePayload> {
    const startTime = Date.now();

    try {
      // Dynamic import to avoid ESM/CJS interop issues with viem
      const { HoloScriptPlusParser } = await import('@holoscript/core');

      // Parse the code first
      const parser = new HoloScriptPlusParser();
      const parseResult = parser.parse(input.code);

      if (!parseResult.ast) {
        return {
          success: false,
          output: undefined,
          errors: [
            {
              message: 'Failed to parse HoloScript code',
              phase: 'parse',
            },
          ],
          warnings: [],
          metadata: undefined,
        };
      }

      // Dynamically import the appropriate compiler
      const core = await import('@holoscript/core');
      let compiler: any;
      let compiledOutput: string;

      switch (input.target) {
        case CompilerTarget.UNITY:
          compiler = new core.UnityCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;

        case CompilerTarget.BABYLON:
          compiler = new core.BabylonCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;

        case CompilerTarget.R3F:
          compiler = new core.R3FCompiler();
          compiledOutput = compiler.compile(parseResult.ast);
          break;

        default:
          return {
            success: false,
            output: undefined,
            errors: [
              {
                message: `Compiler target ${input.target} not yet implemented in GraphQL API`,
                phase: 'compile',
              },
            ],
            warnings: [
              {
                message: `Only Unity, Babylon, and R3F targets are currently supported in the POC`,
              },
            ],
            metadata: undefined,
          };
      }

      const compilationTime = Date.now() - startTime;

      return {
        success: true,
        output: compiledOutput,
        errors: [],
        warnings: parseResult.warnings || [],
        metadata: {
          compilationTime,
          outputSize: compiledOutput.length,
          targetVersion: '3.42.0',
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        output: undefined,
        errors: [
          {
            message:
              (error instanceof Error ? error.message : String(error)) ||
              'Unknown compilation error',
            phase: 'compile',
          },
        ],
        warnings: [],
        metadata: undefined,
      };
    }
  }
}
